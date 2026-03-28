/**
 * シルエット＋素材マッチングエンジン
 * ES Module形式 / 外部パッケージ不使用 / Pure functions only
 */

// ---------------------------------------------------------------------------
// キーワード辞書
// ---------------------------------------------------------------------------

const SILHOUETTE_KEYWORDS = {
  I: ["ストレート", "スリム", "タイト", "Iライン", "シース", "ナロー", "細身", "straight", "slim", "narrow"],
  Y: ["オーバーサイズ", "ビッグ", "ドロップショルダー", "Yライン", "oversized", "big", "drop shoulder"],
  A: ["フレア", "Aライン", "広がり", "ティアード", "プリーツ", "flare", "a-line", "tiered", "pleated"],
  X: ["ウエストマーク", "Xライン", "ベルト付", "くびれ", "フィット&フレア", "belted", "waist mark"],
  O: ["バルーン", "コクーン", "Oライン", "balloon", "cocoon"],
};

const MATERIAL_KEYWORDS = {
  soft: ["シフォン", "レース", "サテン", "シルク", "モヘア", "chiffon", "lace", "satin", "silk"],
  hard: ["デニム", "コーデュロイ", "ツイード", "レザー", "リネン", "denim", "corduroy", "tweed", "leather", "linen"],
  medium: ["コットン", "ウール", "ポリエステル", "ニット", "カシミヤ", "cotton", "wool", "polyester", "knit", "cashmere"],
};

const FIT_KEYWORDS = {
  tight: ["スリムフィット", "タイト", "スキニー", "slim fit", "tight", "skinny"],
  just: ["ジャストサイズ", "レギュラー", "レギュラーフィット", "regular", "standard"],
  loose: ["オーバーサイズ", "ルーズ", "リラックス", "ゆったり", "ビッグ", "oversized", "loose", "relaxed"],
};

const ITEM_TYPE_KEYWORDS = {
  tops: ["トップス", "シャツ", "ブラウス", "ニット", "スウェット", "カットソー", "タンクトップ", "shirt", "blouse", "tops", "sweater", "knit"],
  bottoms: ["スカート", "パンツ", "デニム", "ショーツ", "skirt", "pants", "jeans", "shorts", "denim"],
  outerwear: ["コート", "ジャケット", "アウター", "カーディガン", "ブルゾン", "coat", "jacket", "outer", "cardigan"],
  onepiece: ["ワンピース", "ドレス", "オールインワン", "サロペット", "dress", "onepiece", "jumpsuit"],
};

// ---------------------------------------------------------------------------
// 骨格タイプ別適合マトリクス
// ---------------------------------------------------------------------------

const SKELETON_PREFERENCES = {
  straight: {
    silhouettes: { I: 90, X: 70, Y: 40, A: 50, O: 30 },
    materials: { medium: 90, hard: 70, soft: 40 },
    fit: { just: 90, tight: 60, loose: 30 },
  },
  wave: {
    silhouettes: { X: 90, A: 80, I: 50, Y: 30, O: 40 },
    materials: { soft: 90, medium: 60, hard: 30 },
    fit: { just: 70, tight: 80, loose: 30 },
  },
  natural: {
    silhouettes: { Y: 90, O: 80, I: 50, A: 60, X: 40 },
    materials: { hard: 90, medium: 70, soft: 30 },
    fit: { loose: 90, just: 60, tight: 20 },
  },
};

// ---------------------------------------------------------------------------
// 否定コンテキスト検出
// ---------------------------------------------------------------------------

/**
 * キーワードの後ろに続く否定表現パターン
 * 「オーバーサイズには見えない」「リネンっぽくない」などを検出
 */
const NEGATION_PATTERNS = [
  /^(?:ない|なく|ません|見えない)/,
  /^[にはでも](?:ない|なく|見えない|なり|なる)/,
];

/**
 * 模倣・風合い表現パターン（素材・シルエットを真似た別素材を示す）
 * 「リネン風のポリエステル」「レザーライクな合皮」などを検出
 */
const IMITATION_PATTERNS = [
  /風(?:の|に|な)/, /ライクな?/, /調(?:の|な)/, /のような/, /っぽい/,
];

/**
 * キーワードマッチ位置における否定コンテキストを判定する
 * @param {string} text - 元テキスト（正規化済み）
 * @param {string} keyword - マッチしたキーワード（正規化済み）
 * @param {number} matchIndex - text内のマッチ開始位置
 * @returns {{ negated: boolean, imitated: boolean }}
 */
function detectNegationContext(text, keyword, matchIndex) {
  const afterStart = matchIndex + keyword.length;
  // キーワードの後ろ20文字を取得
  const after = text.slice(afterStart, afterStart + 20);
  // キーワードの前10文字を取得
  const before = text.slice(Math.max(0, matchIndex - 10), matchIndex);

  // 後続否定チェック
  const negated =
    NEGATION_PATTERNS.some((p) => p.test(after)) ||
    /[非不無]$/.test(before);

  // 模倣表現チェック（キーワードの後ろに「風」「ライク」等が続く）
  const imitated = IMITATION_PATTERNS.some((p) => p.test(after));

  return { negated, imitated };
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/**
 * テキストを小文字に正規化
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return text.toLowerCase();
}

/**
 * キーワード辞書に対してテキストをマッチング（否定コンテキスト考慮）
 * @param {string} normalizedText
 * @param {Record<string, string[]>} keywordDict
 * @returns {{ key: string, confidence: number } | null} マッチしたキーとconfidence、なければ null
 */
function matchFirstKeyword(normalizedText, keywordDict) {
  for (const [key, keywords] of Object.entries(keywordDict)) {
    for (const keyword of keywords) {
      const normalizedKw = normalizeText(keyword);
      const idx = normalizedText.indexOf(normalizedKw);
      if (idx !== -1) {
        const { negated, imitated } = detectNegationContext(normalizedText, normalizedKw, idx);
        if (negated) continue; // 否定表現はスキップ
        const confidence = imitated ? 0.5 : 1.0;
        return { key, confidence };
      }
    }
  }
  return null;
}

/**
 * キーワード辞書に対してテキストをマッチング（複数マッチ・否定コンテキスト考慮）
 * @param {string} normalizedText
 * @param {Record<string, string[]>} keywordDict
 * @returns {Array<{ type: string, confidence: number }>} マッチしたキーとconfidenceの配列（重複なし）
 */
function matchAllKeywords(normalizedText, keywordDict) {
  const matched = [];
  for (const [key, keywords] of Object.entries(keywordDict)) {
    let found = false;
    for (const keyword of keywords) {
      if (found) break;
      const normalizedKw = normalizeText(keyword);
      const idx = normalizedText.indexOf(normalizedKw);
      if (idx !== -1) {
        const { negated, imitated } = detectNegationContext(normalizedText, normalizedKw, idx);
        if (negated) continue; // 否定表現はスキップ
        const confidence = imitated ? 0.5 : 1.0;
        matched.push({ type: key, confidence });
        found = true;
      }
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 商品テキストからファッション特徴を抽出
 *
 * 否定コンテキスト（「〜ない」「〜風」等）を考慮し、
 * 各特徴に confidence（0.0〜1.0）を付与する。
 *
 * @param {string} productText
 * @returns {{
 *   silhouette: string|null,
 *   silhouetteConfidence: number,
 *   materials: Array<{ type: string, confidence: number }>,
 *   fitType: string|null,
 *   fitConfidence: number,
 *   itemType: string|null,
 *   itemTypeConfidence: number,
 * }}
 */
export function extractProductFeatures(productText) {
  if (typeof productText !== "string" || productText.trim() === "") {
    return {
      silhouette: null,
      silhouetteConfidence: 0,
      materials: [],
      fitType: null,
      fitConfidence: 0,
      itemType: null,
      itemTypeConfidence: 0,
    };
  }

  const normalized = normalizeText(productText);

  const silhouetteMatch = matchFirstKeyword(normalized, SILHOUETTE_KEYWORDS);
  const materials = matchAllKeywords(normalized, MATERIAL_KEYWORDS);
  const fitMatch = matchFirstKeyword(normalized, FIT_KEYWORDS);
  const itemTypeMatch = matchFirstKeyword(normalized, ITEM_TYPE_KEYWORDS);

  return {
    silhouette: silhouetteMatch?.key ?? null,
    silhouetteConfidence: silhouetteMatch?.confidence ?? 0,
    materials,
    fitType: fitMatch?.key ?? null,
    fitConfidence: fitMatch?.confidence ?? 0,
    itemType: itemTypeMatch?.key ?? null,
    itemTypeConfidence: itemTypeMatch?.confidence ?? 0,
  };
}

/**
 * シルエット＋素材の骨格適合スコアを計算
 * @param {Object} params
 * @param {string} params.skeletonType - "straight"|"wave"|"natural"
 * @param {string} params.bodyShape - "slim"|"standard"|"athletic"|"plus"
 * @param {string[]} params.concerns
 * @param {string} params.gender - "mens"|"ladies"
 * @param {string} params.productText
 * @param {Object} params.skeletonKnowledge - skeleton-types.json の内容
 * @returns {{ silhouetteScore: number, materialScore: number, detectedFeatures: Object, reasoning: string }}
 */
export function computeSilhouetteScore({
  skeletonType,
  bodyShape,
  concerns,
  gender,
  productText,
  skeletonKnowledge,
}) {
  const NEUTRAL_SCORE = 50;
  const DETECTION_BONUS = 10;

  // 入力バリデーション
  const validSkeletonTypes = ["straight", "wave", "natural"];
  if (!validSkeletonTypes.includes(skeletonType)) {
    return {
      silhouetteScore: NEUTRAL_SCORE,
      materialScore: NEUTRAL_SCORE,
      detectedFeatures: {},
      reasoning: `不明な骨格タイプ: ${skeletonType}`,
    };
  }

  // 商品特徴抽出
  const detectedFeatures = extractProductFeatures(productText);
  const { silhouette, silhouetteConfidence, materials, fitType, fitConfidence } = detectedFeatures;

  const prefs = SKELETON_PREFERENCES[skeletonType];
  const reasoningParts = [];

  // ------ シルエットスコア計算 ------
  let silhouetteScore;

  if (silhouette !== null) {
    const baseScore = prefs.silhouettes[silhouette] ?? NEUTRAL_SCORE;
    // confidence < 1.0（模倣表現）の場合は基本スコアをconfidence倍で減衰し、ボーナスも減衰
    const effectiveBase = Math.round(baseScore * silhouetteConfidence);
    const effectiveBonus = Math.round(DETECTION_BONUS * silhouetteConfidence);
    silhouetteScore = Math.min(100, effectiveBase + effectiveBonus);
    const confidenceNote = silhouetteConfidence < 1.0 ? `（模倣表現のためconfidence=${silhouetteConfidence}で減衰）` : "";
    reasoningParts.push(
      `シルエット「${silhouette}ライン」を検出。${skeletonType}骨格への適合ベーススコア: ${baseScore}（検出ボーナス+${effectiveBonus}）${confidenceNote}`
    );
  } else {
    silhouetteScore = NEUTRAL_SCORE;
    reasoningParts.push("シルエットキーワードを検出できず。ニュートラルスコア(50)を適用");
  }

  // ------ 素材スコア計算 ------
  let materialScore;

  if (materials.length > 0) {
    // confidence を考慮したスコアを計算し最大値を採用
    const materialScores = materials.map(({ type, confidence }) => {
      const base = prefs.materials[type] ?? NEUTRAL_SCORE;
      return Math.round(base * confidence);
    });
    materialScore = Math.max(...materialScores);
    const materialSummary = materials.map(({ type, confidence }) =>
      confidence < 1.0 ? `${type}(模倣,conf=${confidence})` : type
    );
    reasoningParts.push(
      `素材タイプ [${materialSummary.join(", ")}] を検出。最大適合スコア: ${materialScore}`
    );
  } else {
    materialScore = NEUTRAL_SCORE;
    reasoningParts.push("素材キーワードを検出できず。ニュートラルスコア(50)を適用");
  }

  // ------ フィット補足メモ（reasoning参考情報） ------
  if (fitType !== null) {
    const fitScore = prefs.fit[fitType] ?? NEUTRAL_SCORE;
    const fitNote = fitConfidence < 1.0 ? `（模倣表現のためconfidence=${fitConfidence}）` : "";
    reasoningParts.push(
      `フィット「${fitType}」を検出。${skeletonType}骨格の適合スコア参考値: ${fitScore}${fitNote}`
    );
  }

  // ------ skeleton-types.json を利用した推奨・回避チェック ------
  if (
    skeletonKnowledge &&
    skeletonKnowledge.types &&
    skeletonKnowledge.types[skeletonType]
  ) {
    const typeData = skeletonKnowledge.types[skeletonType];
    const genderKey = gender === "mens" ? "mens" : "ladies";
    const genderData = typeData.gender?.[genderKey];

    if (genderData) {
      const normalizedText = normalizeText(productText);
      const avoidItems = genderData.avoid_items ?? [];
      const avoidMaterials = genderData.avoid_materials ?? [];

      // 回避素材チェック（否定コンテキストを除外）
      const matchedAvoidMaterials = avoidMaterials.filter((mat) => {
        const normalizedMat = normalizeText(mat);
        const idx = normalizedText.indexOf(normalizedMat);
        if (idx === -1) return false;
        const { negated, imitated } = detectNegationContext(normalizedText, normalizedMat, idx);
        // 否定表現または模倣表現（「リネン風」等）は回避対象から除外
        return !negated && !imitated;
      });
      if (matchedAvoidMaterials.length > 0) {
        silhouetteScore = Math.max(0, silhouetteScore - 15);
        materialScore = Math.max(0, materialScore - 15);
        reasoningParts.push(
          `回避素材 [${matchedAvoidMaterials.join(", ")}] に該当。スコアを各-15補正`
        );
      }

      // 回避アイテムチェック（商品テキストとの部分一致）
      const matchedAvoidItems = avoidItems.filter((entry) => {
        const itemName = typeof entry === "string" ? entry : entry.item;
        return normalizedText.includes(normalizeText(itemName));
      });
      if (matchedAvoidItems.length > 0) {
        const itemNames = matchedAvoidItems.map((e) =>
          typeof e === "string" ? e : e.item
        );
        silhouetteScore = Math.max(0, silhouetteScore - 10);
        reasoningParts.push(
          `回避アイテム [${itemNames.join(", ")}] に該当。シルエットスコアを-10補正`
        );
      }
    }
  }

  // bodyShape・concerns は将来の拡張ポイント（現時点では reasoning に記録）
  if (bodyShape) {
    reasoningParts.push(`体型: ${bodyShape}（スコア補正には未使用）`);
  }
  if (Array.isArray(concerns) && concerns.length > 0) {
    reasoningParts.push(`お悩み: ${concerns.join(", ")}（スコア補正には未使用）`);
  }

  return {
    silhouetteScore,
    materialScore,
    detectedFeatures,
    reasoning: reasoningParts.join(" / "),
  };
}
