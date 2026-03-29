/**
 * テイストマッチングエンジン
 * ユーザーの好みベクトル(5軸)と商品テキストの相性スコアを計算する Pure Functions 集
 *
 * 5軸: decoration(装飾性), formality(フォーマル度), avantgarde(モード感),
 *       structure(構築感), playfulness(遊び心)
 *
 * v2: 境界付きキーワードマッチ、不在シグナル、ブランドライン認識
 *
 * ES Module形式 / 外部パッケージ不使用 / Pure functions only
 */

// ─── 定数 ──────────────────────────────────────────────────────────

const AXES = ["decoration", "formality", "avantgarde", "structure", "playfulness"];
const DEFAULT_CENTER = 50;

// ─── ベクトルユーティリティ ─────────────────────────────────────────

/**
 * 2つの5軸ベクトル間のコサイン類似度を計算
 * @param {Object} vecA - { decoration, formality, avantgarde, structure, playfulness }
 * @param {Object} vecB
 * @returns {number} -1〜1
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const axis of AXES) {
    const a = (vecA[axis] ?? DEFAULT_CENTER) - DEFAULT_CENTER;
    const b = (vecB[axis] ?? DEFAULT_CENTER) - DEFAULT_CENTER;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 2つの5軸ベクトル間のユークリッド距離を計算
 * @param {Object} vecA
 * @param {Object} vecB
 * @returns {number} 0〜(100√5 ≈ 223.6)
 */
function euclideanDistance(vecA, vecB) {
  let sum = 0;
  for (const axis of AXES) {
    const diff = (vecA[axis] ?? DEFAULT_CENTER) - (vecB[axis] ?? DEFAULT_CENTER);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ─── 境界付きキーワードマッチ ────────────────────────────────────

/**
 * キーワードが文中で「独立した語」としてマッチするか判定
 *
 * 日本語: そのまま部分文字列マッチ（ただしexclude_contextで誤マッチを除外）
 * 英語/アルファベット: 単語境界で区切ってマッチ
 *
 * @param {string} text - 検索対象テキスト（小文字化済み）
 * @param {string} keyword - キーワード（小文字化済み）
 * @param {string[][]} excludeContexts - 除外パターン: このキーワードを含む上位語にマッチしたらスキップ
 * @returns {boolean}
 */
function matchKeyword(text, keyword, excludeContexts) {
  // まず除外チェック: 「Tシャツ」が先にマッチする場合に「シャツ」単体を除外
  if (excludeContexts) {
    for (const ctx of excludeContexts) {
      if (text.includes(ctx.toLowerCase())) return false;
    }
  }

  // 英語キーワードは単語境界でマッチ
  if (/^[a-z\-]+$/.test(keyword)) {
    const re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return re.test(text);
  }

  // 日本語: 部分文字列マッチ
  return text.includes(keyword);
}

// ─── ブランドライン認識 ──────────────────────────────────────────

/**
 * 商品テキストからブランドラインを検出し、テイストベクトルのオフセットを返す
 *
 * スタイリストが知っている「同じブランドでもラインが違えば全く別物」という知識をモデル化。
 * 例: UNIQLO通常 vs UNIQLO U vs UNIQLO x JW Anderson
 *
 * @param {string} text - 商品テキスト（元テキスト、大文字小文字そのまま）
 * @param {Object} brandLines - taste-axes.json の brand_lines セクション
 * @returns {{ lineName: string, vector: Object } | null}
 */
function detectBrandLine(text, brandLines) {
  if (!brandLines || !text) return null;

  const normalized = text.toLowerCase();

  for (const line of brandLines) {
    const matches = (line.match_patterns ?? []).some((pat) =>
      normalized.includes(pat.toLowerCase())
    );
    if (matches) {
      return { lineName: line.label, vector: line.vector };
    }
  }
  return null;
}

// ─── テキストからベクトル抽出 (v2) ──────────────────────────────

/**
 * 商品テキストからテイストベクトルを推定する (v2)
 *
 * v1からの改善:
 * - 境界付きキーワードマッチで誤マッチ防止
 * - decoration軸: 装飾キーワード不在 → ミニマル寄りに推定（不在シグナル）
 * - ブランドライン検出でベクトルをオーバーライド可能
 *
 * @param {string} text - 商品名+説明テキスト
 * @param {Object} axesKnowledge - taste-axes.json の axes セクション
 * @param {Object[]} [brandLines] - taste-axes.json の brand_lines セクション
 * @returns {{ vector: Object, matches: Object, brandLine: string | null }}
 */
function extractTasteVector(text, axesKnowledge, brandLines) {
  if (!text || !axesKnowledge) {
    return {
      vector: Object.fromEntries(AXES.map((a) => [a, DEFAULT_CENTER])),
      matches: {},
      brandLine: null,
    };
  }

  const normalized = text.toLowerCase();

  // ブランドライン検出（マッチすれば部分的にベクトルを上書き）
  const lineResult = detectBrandLine(text, brandLines);

  const vector = {};
  const matches = {};
  let totalKeywordMatches = 0;

  for (const axis of AXES) {
    const axisData = axesKnowledge[axis];
    if (!axisData) {
      vector[axis] = DEFAULT_CENTER;
      continue;
    }

    let lowCount = 0;
    let highCount = 0;
    const lowMatched = [];
    const highMatched = [];

    // キーワード構造: 文字列 or { word, exclude_when }
    for (const kwEntry of axisData.low_keywords ?? []) {
      const kw = typeof kwEntry === "string" ? kwEntry : kwEntry.word;
      const excludes = typeof kwEntry === "string" ? null : kwEntry.exclude_when;
      if (matchKeyword(normalized, kw.toLowerCase(), excludes)) {
        lowCount++;
        lowMatched.push(kw);
      }
    }
    for (const kwEntry of axisData.high_keywords ?? []) {
      const kw = typeof kwEntry === "string" ? kwEntry : kwEntry.word;
      const excludes = typeof kwEntry === "string" ? null : kwEntry.exclude_when;
      if (matchKeyword(normalized, kw.toLowerCase(), excludes)) {
        highCount++;
        highMatched.push(kw);
      }
    }

    const total = lowCount + highCount;
    totalKeywordMatches += total;

    if (total === 0) {
      vector[axis] = DEFAULT_CENTER;
    } else {
      const highRatio = highCount / total;
      const confidence = Math.min(1, total / 4);
      vector[axis] = Math.round(DEFAULT_CENTER + (highRatio - 0.5) * 100 * confidence);
      vector[axis] = Math.max(0, Math.min(100, vector[axis]));
    }

    if (lowMatched.length > 0 || highMatched.length > 0) {
      matches[axis] = { low: lowMatched, high: highMatched };
    }
  }

  // ブランドラインが検出された場合、そのベクトルで部分上書き（平均合成）
  // 不在シグナルより先にブランドライン処理し、検出時は不在シグナルをスキップ
  if (lineResult) {
    for (const axis of AXES) {
      if (lineResult.vector[axis] !== undefined) {
        // ライン情報とテキスト抽出の加重平均（ライン60%:テキスト40%）
        vector[axis] = Math.round(
          lineResult.vector[axis] * 0.6 + vector[axis] * 0.4
        );
      }
    }
  } else {
    // ─── 不在シグナル（ブランドライン未検出時のみ適用）───
    // 装飾キーワード(high)が一つもなく、テキストがある程度の長さなら → ミニマル寄り
    if (!matches.decoration && text.length >= 20) {
      vector.decoration = 20;
      matches.decoration = { low: ["(装飾記述なし→ミニマル推定)"], high: [] };
    }
    // ロゴ・グラフィック・ストリート系キーワードが皆無 → ソフィスティケート寄り
    if (!matches.playfulness && text.length >= 20) {
      vector.playfulness = 30;
      matches.playfulness = { low: ["(遊び要素なし→洗練寄り推定)"], high: [] };
    }
  }

  return {
    vector,
    matches,
    brandLine: lineResult?.lineName ?? null,
  };
}

// ─── ブランドからベクトル推定 ────────────────────────────────────

/**
 * ユーザーの好きなブランドリストからテイストベクトルを推定
 * 複数ブランドの平均ベクトルを計算
 *
 * @param {string[]} brands - ブランド名の配列
 * @param {Object} brandVectors - taste-axes.json の brand_vectors.brands
 * @returns {{ vector: Object, matchedBrands: string[], unmatchedBrands: string[] }}
 */
function estimateVectorFromBrands(brands, brandVectors) {
  if (!Array.isArray(brands) || brands.length === 0 || !brandVectors) {
    return {
      vector: Object.fromEntries(AXES.map((a) => [a, DEFAULT_CENTER])),
      matchedBrands: [],
      unmatchedBrands: [],
    };
  }

  const matchedBrands = [];
  const unmatchedBrands = [];
  const sums = Object.fromEntries(AXES.map((a) => [a, 0]));

  for (const brand of brands) {
    const normalizedInput = brand.trim().toLowerCase();
    let found = null;
    for (const [name, vec] of Object.entries(brandVectors)) {
      if (name.toLowerCase() === normalizedInput) {
        found = { name, vec };
        break;
      }
    }
    if (!found) {
      for (const [name, vec] of Object.entries(brandVectors)) {
        if (
          name.toLowerCase().includes(normalizedInput) ||
          normalizedInput.includes(name.toLowerCase())
        ) {
          found = { name, vec };
          break;
        }
      }
    }

    if (found) {
      matchedBrands.push(found.name);
      for (const axis of AXES) {
        sums[axis] += found.vec[axis] ?? DEFAULT_CENTER;
      }
    } else {
      unmatchedBrands.push(brand);
    }
  }

  if (matchedBrands.length === 0) {
    return {
      vector: Object.fromEntries(AXES.map((a) => [a, DEFAULT_CENTER])),
      matchedBrands,
      unmatchedBrands,
    };
  }

  const vector = {};
  for (const axis of AXES) {
    vector[axis] = Math.round(sums[axis] / matchedBrands.length);
  }

  return { vector, matchedBrands, unmatchedBrands };
}

// ─── 診断スコア評価 ─────────────────────────────────────────────

/**
 * 診断回答からテイストベクトルを算出
 *
 * @param {number[]} answers - 各質問への回答インデックス (0始まり)
 * @param {Object[]} questions - taste-axes.json の diagnosis_questions.questions
 * @returns {{ vector: Object, answered: number }}
 */
function evaluateDiagnosis(answers, questions) {
  const scores = Object.fromEntries(AXES.map((a) => [a, 0]));
  let answered = 0;

  for (let i = 0; i < Math.min(answers.length, questions.length); i++) {
    const q = questions[i];
    const answerIdx = answers[i];
    if (answerIdx < 0 || answerIdx >= q.options.length) continue;

    const option = q.options[answerIdx];
    for (const [axis, delta] of Object.entries(option.scores)) {
      if (AXES.includes(axis)) {
        scores[axis] += delta;
      }
    }
    answered++;
  }

  const vector = {};
  for (const axis of AXES) {
    const normalized = DEFAULT_CENTER + scores[axis];
    vector[axis] = Math.max(0, Math.min(100, Math.round(normalized)));
  }

  return { vector, answered };
}

// ─── 最近傍アーキタイプ ─────────────────────────────────────────

/**
 * ベクトルに最も近いスタイルアーキタイプを返す
 */
function findNearestArchetype(vector, archetypes) {
  if (!Array.isArray(archetypes) || archetypes.length === 0) {
    return { label: "不明", description: "", distance: Infinity, representative_brands: [] };
  }

  let best = null;
  let bestDist = Infinity;

  for (const arch of archetypes) {
    const dist = euclideanDistance(vector, arch.vector);
    if (dist < bestDist) {
      bestDist = dist;
      best = arch;
    }
  }

  return {
    label: best.label,
    description: best.description,
    distance: Math.round(bestDist * 10) / 10,
    representative_brands: best.representative_brands ?? [],
  };
}

/**
 * ベクトルに近い順にアーキタイプ上位N件を返す
 */
function findTopArchetypes(vector, archetypes, n = 3) {
  if (!Array.isArray(archetypes)) return [];

  return archetypes
    .map((arch) => ({
      label: arch.label,
      description: arch.description,
      distance: euclideanDistance(vector, arch.vector),
      similarity: cosineSimilarity(vector, arch.vector),
      representative_brands: arch.representative_brands ?? [],
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}

// ─── メインスコアリング関数 ─────────────────────────────────────

/**
 * ユーザーのテイストベクトルと商品テキストの相性スコアを計算
 *
 * v2改善:
 * - 装飾キーワード不在 → ミニマルユーザーには加点
 * - ブランドライン検出で精度向上
 * - 境界付きマッチで誤検出削減
 *
 * @param {Object} params
 * @param {Object} params.userVector - ユーザーのテイストベクトル
 * @param {string} params.productText - 商品テキスト
 * @param {Object} params.tasteKnowledge - taste-axes.json 全体
 * @returns {{ score: number, productVector: Object, matches: Object, reasoning: string }}
 */
function computeTasteScore({ userVector, productText, tasteKnowledge }) {
  if (!userVector || !productText || !tasteKnowledge) {
    return {
      score: 50,
      productVector: null,
      matches: {},
      reasoning: "テイスト情報なし（ニュートラル）",
    };
  }

  const isNeutral = AXES.every(
    (a) => (userVector[a] ?? DEFAULT_CENTER) === DEFAULT_CENTER
  );
  if (isNeutral) {
    return {
      score: 50,
      productVector: null,
      matches: {},
      reasoning: "テイスト未診断（ニュートラル）",
    };
  }

  const { vector: productVector, matches, brandLine } = extractTasteVector(
    productText,
    tasteKnowledge.axes,
    tasteKnowledge.brand_lines
  );

  const similarity = cosineSimilarity(userVector, productVector);
  const rawScore = ((similarity + 1) / 2) * 100;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // reasoning生成
  const parts = [];
  for (const [axis, m] of Object.entries(matches)) {
    const axisData = tasteKnowledge.axes[axis];
    const label = axisData?.label ?? axis;
    const keywords = [...m.high, ...m.low].slice(0, 3).join(", ");
    parts.push(`${label}: ${keywords}`);
  }
  const matchSummary = parts.join(" / ");
  const lineNote = brandLine ? ` [ライン: ${brandLine}]` : "";

  let reasoning;
  if (score >= 70) {
    reasoning = `テイスト高一致 (${score}点)${lineNote} — ${matchSummary}`;
  } else if (score >= 40) {
    reasoning = `テイスト中一致 (${score}点)${lineNote} — ${matchSummary}`;
  } else {
    reasoning = `テイスト低一致 (${score}点)${lineNote} — 好みの方向性と異なるテイストです。${matchSummary}`;
  }

  return { score, productVector, matches, reasoning };
}

// ─── エクスポート ─────────────────────────────────────────────────

export {
  computeTasteScore,
  extractTasteVector,
  estimateVectorFromBrands,
  evaluateDiagnosis,
  findNearestArchetype,
  findTopArchetypes,
  cosineSimilarity,
  euclideanDistance,
  AXES,
};
