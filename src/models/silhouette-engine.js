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
 * キーワード辞書に対してテキストをマッチング
 * @param {string} normalizedText
 * @param {Record<string, string[]>} keywordDict
 * @returns {string|null} マッチしたキー、なければ null
 */
function matchFirstKeyword(normalizedText, keywordDict) {
  for (const [key, keywords] of Object.entries(keywordDict)) {
    for (const keyword of keywords) {
      if (normalizedText.includes(normalizeText(keyword))) {
        return key;
      }
    }
  }
  return null;
}

/**
 * キーワード辞書に対してテキストをマッチング（複数マッチ）
 * @param {string} normalizedText
 * @param {Record<string, string[]>} keywordDict
 * @returns {string[]} マッチしたキーの配列（重複なし）
 */
function matchAllKeywords(normalizedText, keywordDict) {
  const matched = [];
  for (const [key, keywords] of Object.entries(keywordDict)) {
    for (const keyword of keywords) {
      if (normalizedText.includes(normalizeText(keyword))) {
        if (!matched.includes(key)) {
          matched.push(key);
        }
        break;
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
 * @param {string} productText
 * @returns {{ silhouette: string|null, materials: string[], fitType: string|null, itemType: string|null }}
 */
export function extractProductFeatures(productText) {
  if (typeof productText !== "string" || productText.trim() === "") {
    return { silhouette: null, materials: [], fitType: null, itemType: null };
  }

  const normalized = normalizeText(productText);

  const silhouette = matchFirstKeyword(normalized, SILHOUETTE_KEYWORDS);
  const materials = matchAllKeywords(normalized, MATERIAL_KEYWORDS);
  const fitType = matchFirstKeyword(normalized, FIT_KEYWORDS);
  const itemType = matchFirstKeyword(normalized, ITEM_TYPE_KEYWORDS);

  return { silhouette, materials, fitType, itemType };
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
  const { silhouette, materials, fitType, itemType } = detectedFeatures;

  const prefs = SKELETON_PREFERENCES[skeletonType];
  const reasoningParts = [];

  // ------ シルエットスコア計算 ------
  let silhouetteScore;

  if (silhouette !== null) {
    const baseScore = prefs.silhouettes[silhouette] ?? NEUTRAL_SCORE;
    silhouetteScore = Math.min(100, baseScore + DETECTION_BONUS);
    reasoningParts.push(
      `シルエット「${silhouette}ライン」を検出。${skeletonType}骨格への適合ベーススコア: ${baseScore}（検出ボーナス+${DETECTION_BONUS}）`
    );
  } else {
    silhouetteScore = NEUTRAL_SCORE;
    reasoningParts.push("シルエットキーワードを検出できず。ニュートラルスコア(50)を適用");
  }

  // ------ 素材スコア計算 ------
  let materialScore;

  if (materials.length > 0) {
    const materialScores = materials.map((mat) => prefs.materials[mat] ?? NEUTRAL_SCORE);
    materialScore = Math.max(...materialScores);
    reasoningParts.push(
      `素材タイプ [${materials.join(", ")}] を検出。最大適合スコア: ${materialScore}`
    );
  } else {
    materialScore = NEUTRAL_SCORE;
    reasoningParts.push("素材キーワードを検出できず。ニュートラルスコア(50)を適用");
  }

  // ------ フィット補足メモ（reasoning参考情報） ------
  if (fitType !== null) {
    const fitScore = prefs.fit[fitType] ?? NEUTRAL_SCORE;
    reasoningParts.push(
      `フィット「${fitType}」を検出。${skeletonType}骨格の適合スコア参考値: ${fitScore}`
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

      // 回避素材チェック
      const matchedAvoidMaterials = avoidMaterials.filter((mat) =>
        normalizedText.includes(normalizeText(mat))
      );
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
