/**
 * 体型プロポーションエンジン
 * 身長・骨格タイプから推奨寸法を算出し、商品との適合スコアを計算する
 * Pure functions only, ES Module, no external dependencies
 */

// 骨格タイプ別の着丈補正値
const TOP_LENGTH_ADJUSTMENTS = {
  straight: -2,
  wave: -3,
  natural: 3,
};

// 性別ごとの肩幅係数
const SHOULDER_WIDTH_RATIO = {
  mens: 0.24,
  ladies: 0.22,
};

// 性別ごとの股下係数
const INSEAM_RATIO = {
  mens: 0.45,
  ladies: 0.44,
};

// 黄金比
const GOLDEN_RATIO = 0.618;

// スコアリングのスケーリングファクター（1cmあたりの減点）
const SCALING_FACTORS = {
  lengthCm: 5,    // トップス着丈
  shoulderCm: 8,  // 肩幅
  waistCm: 4,     // ウエスト
  inseamCm: 3,    // 股下（参考用）
};

// カテゴリ別の寸法マッピング
// productDimensions のキーと推奨寸法のキーを対応付ける
const CATEGORY_DIMENSION_MAP = {
  tops: [
    { productKey: 'lengthCm', recommendedKey: 'topLength', factor: SCALING_FACTORS.lengthCm },
    { productKey: 'shoulderCm', recommendedKey: 'shoulderWidth', factor: SCALING_FACTORS.shoulderCm },
  ],
  bottoms: [
    { productKey: 'waistCm', recommendedKey: 'waistPosition', factor: SCALING_FACTORS.waistCm },
  ],
  outerwear: [
    { productKey: 'lengthCm', recommendedKey: 'topLength', factor: SCALING_FACTORS.lengthCm },
    { productKey: 'shoulderCm', recommendedKey: 'shoulderWidth', factor: SCALING_FACTORS.shoulderCm },
  ],
  onepiece: [
    { productKey: 'shoulderCm', recommendedKey: 'shoulderWidth', factor: SCALING_FACTORS.shoulderCm },
    { productKey: 'waistCm', recommendedKey: 'waistPosition', factor: SCALING_FACTORS.waistCm },
  ],
};

/**
 * 身長・骨格タイプから推奨寸法を算出
 * @param {Object} params
 * @param {number} params.heightCm
 * @param {string} params.gender - "mens"|"ladies"
 * @param {string} params.skeletonType - "straight"|"wave"|"natural"
 * @returns {{ topLength: number, shoulderWidth: number, waistPosition: number, inseam: number }}
 */
export function getRecommendedDimensions({ heightCm, gender, skeletonType }) {
  const adjustment = TOP_LENGTH_ADJUSTMENTS[skeletonType] ?? 0;
  const shoulderRatio = SHOULDER_WIDTH_RATIO[gender] ?? SHOULDER_WIDTH_RATIO.ladies;
  const inseamRatio = INSEAM_RATIO[gender] ?? INSEAM_RATIO.ladies;

  const topLength = heightCm * 0.38 + adjustment;
  const shoulderWidth = heightCm * shoulderRatio;
  const waistPosition = heightCm * GOLDEN_RATIO;
  const inseam = heightCm * inseamRatio;

  return {
    topLength: Math.round(topLength * 10) / 10,
    shoulderWidth: Math.round(shoulderWidth * 10) / 10,
    waistPosition: Math.round(waistPosition * 10) / 10,
    inseam: Math.round(inseam * 10) / 10,
  };
}

/**
 * 単一寸法のスコアを計算する
 * @param {number} actual - 実際の寸法
 * @param {number} recommended - 推奨寸法
 * @param {number} scalingFactor - スケーリングファクター
 * @returns {number} 0〜100のスコア
 */
function calcDimensionScore(actual, recommended, scalingFactor) {
  return Math.max(0, 100 - Math.abs(actual - recommended) * scalingFactor);
}

/**
 * bodyShape と concerns から寸法補正値を算出する（将来拡張用の内部関数）
 * 現時点では reasoning 文字列生成に利用
 * @param {string} bodyShape
 * @param {string[]} concerns
 * @returns {{ notes: string[] }}
 */
function buildStylingNotes(bodyShape, concerns) {
  const notes = [];

  if (bodyShape === 'slim') notes.push('細身体型：ゆとりのある着丈を意識するとバランスが取れます');
  if (bodyShape === 'athletic') notes.push('筋肉質体型：肩幅に余裕のあるサイズを選ぶと着やすいです');
  if (bodyShape === 'plus') notes.push('ふっくら体型：縦ラインを強調するシルエットが効果的です');

  if (concerns && concerns.includes('short_legs')) notes.push('脚を長く見せるにはハイウエストのボトムスが有効です');
  if (concerns && concerns.includes('broad_shoulders')) notes.push('肩幅広め：Vネックや肩落ちデザインで視線を下げると◎');
  if (concerns && concerns.includes('narrow_shoulders')) notes.push('肩幅狭め：パッド入りやボートネックで肩幅を強調できます');

  return { notes };
}

/**
 * 商品寸法と推奨寸法の適合スコアを計算
 * @param {Object} params
 * @param {number} params.heightCm
 * @param {string} params.gender
 * @param {string} params.skeletonType - "straight"|"wave"|"natural"
 * @param {string} params.bodyShape - "slim"|"standard"|"athletic"|"plus"
 * @param {string[]} params.concerns
 * @param {Object} params.productDimensions - { lengthCm?, shoulderCm?, bustCm?, waistCm? }
 * @param {string} params.productCategory - "tops"|"bottoms"|"outerwear"|"onepiece"
 * @returns {{ score: number, recommended: Object, actual: Object, reasoning: string }}
 */
export function computeProportionScore({
  heightCm,
  gender,
  skeletonType,
  bodyShape,
  concerns,
  productDimensions,
  productCategory,
}) {
  const recommended = getRecommendedDimensions({ heightCm, gender, skeletonType });
  const dimensionMap = CATEGORY_DIMENSION_MAP[productCategory] ?? [];

  // 利用可能な寸法だけでスコアを計算する
  const scores = [];
  const actualRecord = {};

  for (const { productKey, recommendedKey, factor } of dimensionMap) {
    const actualValue = productDimensions?.[productKey];
    if (actualValue == null) continue;

    actualRecord[productKey] = actualValue;
    const dimScore = calcDimensionScore(actualValue, recommended[recommendedKey], factor);
    scores.push(dimScore);
  }

  // bustCm が渡された場合は参考情報として actual に含めるだけ（スコアには影響しない）
  if (productDimensions?.bustCm != null) {
    actualRecord.bustCm = productDimensions.bustCm;
  }

  const score = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : 50; // 寸法データなしはニュートラル

  // reasoning 文字列の構築
  const { notes } = buildStylingNotes(bodyShape, concerns);
  const scoreSummary = scores.length === 0
    ? '寸法データがないため、ニュートラルスコア(50)を適用しています。'
    : `${scores.length}項目の寸法を比較し、平均適合スコアは${score}点です。`;

  const reasoning = [scoreSummary, ...notes].join(' ');

  return {
    score,
    recommended,
    actual: actualRecord,
    reasoning,
  };
}
