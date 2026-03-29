/**
 * テイストマッチングエンジン
 * ユーザーの好みベクトル(5軸)と商品テキストの相性スコアを計算する Pure Functions 集
 *
 * 5軸: decoration(装飾性), formality(フォーマル度), avantgarde(モード感),
 *       structure(構築感), playfulness(遊び心)
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

// ─── テキストからベクトル抽出 ──────────────────────────────────────

/**
 * 商品テキストからテイストベクトルを推定する
 *
 * 各軸のlow_keywords/high_keywordsとのマッチ数からスコアを算出。
 * マッチなしの軸はニュートラル(50)。
 *
 * @param {string} text - 商品名+説明テキスト
 * @param {Object} axesKnowledge - taste-axes.json の axes セクション
 * @returns {{ vector: Object, matches: Object }}
 */
function extractTasteVector(text, axesKnowledge) {
  if (!text || !axesKnowledge) {
    return {
      vector: Object.fromEntries(AXES.map((a) => [a, DEFAULT_CENTER])),
      matches: {},
    };
  }

  const normalized = text.toLowerCase();
  const vector = {};
  const matches = {};

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

    for (const kw of axisData.low_keywords ?? []) {
      if (normalized.includes(kw.toLowerCase())) {
        lowCount++;
        lowMatched.push(kw);
      }
    }
    for (const kw of axisData.high_keywords ?? []) {
      if (normalized.includes(kw.toLowerCase())) {
        highCount++;
        highMatched.push(kw);
      }
    }

    const total = lowCount + highCount;
    if (total === 0) {
      vector[axis] = DEFAULT_CENTER;
    } else {
      // high比率をスコアに変換 (0-100)
      // マッチ数が多いほど極端に振れるよう、信頼度で補正
      const highRatio = highCount / total;
      const confidence = Math.min(1, total / 4); // 4マッチで最大信頼度
      vector[axis] = Math.round(DEFAULT_CENTER + (highRatio - 0.5) * 100 * confidence);
      vector[axis] = Math.max(0, Math.min(100, vector[axis]));
    }

    if (lowMatched.length > 0 || highMatched.length > 0) {
      matches[axis] = { low: lowMatched, high: highMatched };
    }
  }

  return { vector, matches };
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
    // 完全一致 → 部分一致で検索
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

  // スコアを0-100にマッピング
  // 質問10問で各軸の理論最大幅は約±60程度 → ±50を0-100に正規化
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
 *
 * @param {Object} vector - 5軸ベクトル
 * @param {Object[]} archetypes - taste-axes.json の style_labels.archetypes
 * @returns {{ label: string, description: string, distance: number, representative_brands: string[] }}
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
 *
 * @param {Object} vector
 * @param {Object[]} archetypes
 * @param {number} n
 * @returns {Array<{ label: string, description: string, distance: number, similarity: number }>}
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
 * スコアリング式:
 *   1. 商品テキストからテイストベクトルを抽出
 *   2. ユーザーベクトルとのコサイン類似度を計算
 *   3. score = clamp(0, 100, (similarity + 1) / 2 * 100)
 *      → -1(真逆) = 0点, 0(無関係) = 50点, 1(完全一致) = 100点
 *   4. キーワードマッチなしの場合はニュートラル(50点)
 *
 * @param {Object} params
 * @param {Object} params.userVector - ユーザーのテイストベクトル { decoration, formality, ... }
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

  // ユーザーベクトルが全て中央値の場合はニュートラル
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

  const { vector: productVector, matches } = extractTasteVector(
    productText,
    tasteKnowledge.axes
  );

  // マッチしたキーワードがゼロの場合はニュートラル
  const totalMatches = Object.values(matches).reduce(
    (sum, m) => sum + m.low.length + m.high.length,
    0
  );
  if (totalMatches === 0) {
    return {
      score: 50,
      productVector,
      matches: {},
      reasoning: "商品テキストからテイスト特徴を抽出できませんでした（ニュートラル）",
    };
  }

  const similarity = cosineSimilarity(userVector, productVector);
  const rawScore = ((similarity + 1) / 2) * 100;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // reasoning生成
  const matchSummary = Object.entries(matches)
    .map(([axis, m]) => {
      const axisData = tasteKnowledge.axes[axis];
      const label = axisData?.label ?? axis;
      const keywords = [...m.high, ...m.low].slice(0, 3).join(", ");
      return `${label}: ${keywords}`;
    })
    .join(" / ");

  let reasoning;
  if (score >= 70) {
    reasoning = `テイスト高一致 (${score}点) — ${matchSummary}`;
  } else if (score >= 40) {
    reasoning = `テイスト中一致 (${score}点) — ${matchSummary}`;
  } else {
    reasoning = `テイスト低一致 (${score}点) — 好みの方向性と異なるテイストです。${matchSummary}`;
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
