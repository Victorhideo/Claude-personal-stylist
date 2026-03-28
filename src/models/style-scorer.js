/**
 * 統合スタイルスコアラー
 * color-engine / silhouette-engine / proportion-engine を統合するオーケストレーター
 *
 * ES Module形式 / Pure functions (scoreProduct) + side-effect-free orchestration
 */

import { computeColorScore } from "./color-engine.js";
import { computeSilhouetteScore, extractProductFeatures } from "./silhouette-engine.js";
import { computeProportionScore } from "./proportion-engine.js";
import { computeTrendScore } from "./trend-engine.js";

// ─── 重み定義 ────────────────────────────────────────────────────────────────

const WEIGHTS = {
  color: 0.30,
  silhouette: 0.25,
  proportion: 0.20,
  material: 0.15,
  trend: 0.10,
};

// ─── 日本語 reasoning ────────────────────────────────────────────────────────

/**
 * 各スコアをもとに日本語の説明文リストを生成する
 * @param {{ colorScore: number, silhouetteScore: number, materialScore: number, proportionScore: number, trendScore: number }} scores
 * @param {{ colorReasoning: string, silhouetteReasoning: string, proportionReasoning: string, trendReasoning: string }} details
 * @returns {string[]}
 */
function buildReasoning(scores, details) {
  const lines = [];

  // カラー
  if (scores.colorScore >= 70) {
    lines.push(`カラー相性: 高 (${scores.colorScore}点) — ${details.colorReasoning}`);
  } else if (scores.colorScore >= 40) {
    lines.push(`カラー相性: 中 (${scores.colorScore}点) — ${details.colorReasoning}`);
  } else {
    lines.push(`カラー相性: 低 (${scores.colorScore}点) — ${details.colorReasoning}`);
  }

  // シルエット
  if (scores.silhouetteScore >= 70) {
    lines.push(`シルエット適合: 高 (${scores.silhouetteScore}点) — ${details.silhouetteReasoning}`);
  } else if (scores.silhouetteScore >= 40) {
    lines.push(`シルエット適合: 中 (${scores.silhouetteScore}点) — ${details.silhouetteReasoning}`);
  } else {
    lines.push(`シルエット適合: 低 (${scores.silhouetteScore}点) — ${details.silhouetteReasoning}`);
  }

  // 素材
  if (scores.materialScore >= 70) {
    lines.push(`素材適合: 高 (${scores.materialScore}点)`);
  } else if (scores.materialScore >= 40) {
    lines.push(`素材適合: 中 (${scores.materialScore}点)`);
  } else {
    lines.push(`素材適合: 低 (${scores.materialScore}点) — 骨格タイプに不向きな素材が含まれている可能性があります`);
  }

  // プロポーション
  if (scores.proportionScore >= 70) {
    lines.push(`プロポーション: 良好 (${scores.proportionScore}点) — ${details.proportionReasoning}`);
  } else {
    lines.push(`プロポーション: 要確認 (${scores.proportionScore}点) — ${details.proportionReasoning}`);
  }

  // トレンド
  if (details.trendReasoning) {
    lines.push(`トレンド: ${details.trendReasoning}`);
  } else {
    lines.push(`トレンド情報: スコア ${scores.trendScore}点（トレンド情報なし）`);
  }

  return lines;
}

// ─── レコメンデーション生成 ───────────────────────────────────────────────────

/**
 * スコアとプロフィールをもとに改善提案を生成
 * @param {number} totalScore
 * @param {{ colorScore: number, silhouetteScore: number, materialScore: number, proportionScore: number }} breakdown
 * @returns {string[]}
 */
function buildRecommendations(totalScore, breakdown) {
  const recs = [];

  if (totalScore >= 75) {
    recs.push("このアイテムはあなたのプロフィールに非常によく合っています。");
  } else if (totalScore >= 55) {
    recs.push("このアイテムはある程度あなたに合っています。");
  } else {
    recs.push("このアイテムはプロフィールとの相性がやや低めです。他のアイテムも検討してみてください。");
  }

  if (breakdown.colorScore < 40) {
    recs.push("カラーがパーソナルカラーと合いにくい可能性があります。別カラー展開があれば確認してみてください。");
  }
  if (breakdown.silhouetteScore < 40) {
    recs.push("シルエットが骨格タイプに合いにくい可能性があります。着丈・フィット感を試着で確認することを推奨します。");
  }
  if (breakdown.materialScore < 40) {
    recs.push("素材が骨格タイプに向かない可能性があります。手触りや重さを実際に確かめてみてください。");
  }

  return recs;
}

// ─── メイン関数 ──────────────────────────────────────────────────────────────

/**
 * 1商品をプロフィールに基づいてスコアリング
 *
 * @param {Object} params
 * @param {Object} params.profile - profile.json の内容
 * @param {Object} params.product - rawProduct ({ text, link, image, colors, dimensions, category })
 * @param {Object} params.knowledge - loadAllKnowledge() の返り値
 * @param {string[]} [params.trendTexts=[]] - search_x/search_trends で取得したテキスト配列（オプション）
 * @returns {{ totalScore: number, breakdown: Object, reasoning: string[], recommendations: string[] }}
 */
export function scoreProduct({ profile, product, knowledge, trendTexts = [] }) {
  const productText = product.text ?? "";
  const productColors = Array.isArray(product.colors) ? product.colors : [];
  const productDimensions = product.dimensions ?? {};
  const productCategory = product.category ?? null;

  // 1. 商品特徴の抽出
  const features = extractProductFeatures(productText);
  const resolvedCategory = productCategory ?? features.itemType ?? "tops";

  // 2. カラースコア
  const personalColor = profile.body?.personal_color ?? profile.color?.season ?? null;
  let colorScore = 50;
  let colorReasoning = "パーソナルカラー情報なし";

  if (personalColor && productColors.length > 0) {
    const colorResult = computeColorScore({
      personalColor,
      productColors,
      colorKnowledge: knowledge.color,
    });
    colorScore = colorResult.score;
    colorReasoning = colorResult.reasoning;
  } else if (personalColor && productText) {
    // colors 配列がない場合、テキストから色名を推測してフォールバック
    colorReasoning = `パーソナルカラー「${personalColor}」。商品カラー情報なし（ニュートラルスコア）`;
  }

  // 3. シルエット＋素材スコア
  const skeletonType = profile.body?.skeleton_type ?? null;
  const bodyShape = profile.body?.body_shape ?? "standard";
  const concerns = profile.body?.concerns ?? [];
  const gender = profile.gender ?? "ladies";

  let silhouetteScore = 50;
  let materialScore = 50;
  let silhouetteReasoning = "骨格情報なし";

  if (skeletonType) {
    const silResult = computeSilhouetteScore({
      skeletonType,
      bodyShape,
      concerns,
      gender,
      productText,
      skeletonKnowledge: knowledge.skeleton,
    });
    silhouetteScore = silResult.silhouetteScore;
    materialScore = silResult.materialScore;
    silhouetteReasoning = silResult.reasoning;
  }

  // 4. プロポーションスコア
  const heightCm = profile.body?.height_cm ?? null;
  let proportionScore = 50;
  let proportionReasoning = "身長情報なし";

  if (heightCm && skeletonType) {
    const propResult = computeProportionScore({
      heightCm,
      gender,
      skeletonType,
      bodyShape,
      concerns,
      productDimensions,
      productCategory: resolvedCategory,
    });
    proportionScore = propResult.score;
    proportionReasoning = propResult.reasoning;
  }

  // 5. トレンドスコア（TF-IDFコサイン類似度）
  const trendQueries = profile.trend_queries ?? [];
  const trendResult = computeTrendScore({
    trendTexts,
    productText,
    trendQueries,
  });
  const trendScore = trendResult.score;

  // 6. 総合スコア（加重平均）
  const totalScore = Math.round(
    colorScore * WEIGHTS.color +
    silhouetteScore * WEIGHTS.silhouette +
    proportionScore * WEIGHTS.proportion +
    materialScore * WEIGHTS.material +
    trendScore * WEIGHTS.trend
  );

  const breakdown = {
    colorScore,
    silhouetteScore,
    materialScore,
    proportionScore,
    trendScore,
  };

  // 7. reasoning（日本語説明）
  const reasoning = buildReasoning(
    { colorScore, silhouetteScore, materialScore, proportionScore, trendScore },
    {
      colorReasoning,
      silhouetteReasoning,
      proportionReasoning,
      trendReasoning: trendResult.reasoning,
    }
  );

  // 8. recommendations
  const recommendations = buildRecommendations(totalScore, breakdown);

  return { totalScore, breakdown, reasoning, recommendations };
}

/**
 * 複数商品をプロフィールに基づいてスコアリングし、スコア降順で返す
 *
 * @param {Object} params
 * @param {Object} params.profile - profile.json の内容
 * @param {Object[]} params.products - rawProducts 配列
 * @param {Object} params.knowledge - loadAllKnowledge() の返り値
 * @param {string[]} [params.trendTexts=[]] - search_x/search_trends で取得したテキスト配列（オプション）
 * @returns {Array<{ product: Object, score: Object }>}
 */
export function scoreAndRankProducts({ profile, products, knowledge, trendTexts = [] }) {
  if (!Array.isArray(products) || products.length === 0) {
    return [];
  }

  const scored = products.map((product) => {
    const score = scoreProduct({ profile, product, knowledge, trendTexts });
    return { product, score };
  });

  // totalScore 降順ソート
  scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

  return scored;
}
