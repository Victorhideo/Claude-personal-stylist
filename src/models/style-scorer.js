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
import { computeTasteScore } from "./taste-engine.js";

// ─── 重み定義 ────────────────────────────────────────────────────────────────
// テイスト軸を追加し、「似合う」と「好き」のバランスを取る配分
// color(25%) + silhouette(20%) + proportion(15%) + material(10%) = 70% (似合う)
// taste(20%) + trend(10%) = 30% (好き・今っぽさ)

const WEIGHTS = {
  color: 0.25,
  silhouette: 0.20,
  proportion: 0.15,
  material: 0.10,
  taste: 0.20,
  trend: 0.10,
};

// ─── 日本語 reasoning ────────────────────────────────────────────────────────

/**
 * 各スコアをもとに日本語の説明文リストを生成する
 * @param {{ colorScore: number, silhouetteScore: number, materialScore: number, proportionScore: number, tasteScore: number, trendScore: number }} scores
 * @param {{ colorReasoning: string, silhouetteReasoning: string, proportionReasoning: string, tasteReasoning: string, trendReasoning: string }} details
 * @returns {string[]}
 */
function buildReasoning(scores, details) {
  const lines = [];

  const level = (s) => s >= 70 ? "高" : s >= 40 ? "中" : "低";

  // カラー
  lines.push(`カラー相性: ${level(scores.colorScore)} (${scores.colorScore}点) — ${details.colorReasoning}`);

  // シルエット
  lines.push(`シルエット適合: ${level(scores.silhouetteScore)} (${scores.silhouetteScore}点) — ${details.silhouetteReasoning}`);

  // 素材
  if (scores.materialScore < 40) {
    lines.push(`素材適合: 低 (${scores.materialScore}点) — 骨格タイプに不向きな素材が含まれている可能性があります`);
  } else {
    lines.push(`素材適合: ${level(scores.materialScore)} (${scores.materialScore}点)`);
  }

  // プロポーション
  if (scores.proportionScore >= 70) {
    lines.push(`プロポーション: 良好 (${scores.proportionScore}点) — ${details.proportionReasoning}`);
  } else {
    lines.push(`プロポーション: 要確認 (${scores.proportionScore}点) — ${details.proportionReasoning}`);
  }

  // テイスト
  if (details.tasteReasoning) {
    lines.push(`テイスト: ${details.tasteReasoning}`);
  } else {
    lines.push(`テイスト: スコア ${scores.tasteScore}点（テイスト未診断）`);
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
 * @param {{ colorScore: number, silhouetteScore: number, materialScore: number, proportionScore: number, tasteScore: number }} breakdown
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
  if (breakdown.tasteScore < 40) {
    recs.push("好みのテイストとやや方向性が異なるアイテムです。気分転換として試すのもありですが、普段使いには他の候補も検討してみてください。");
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
  const personalColor = profile.body?.personal_color ?? null;
  let colorScore = 50;
  let colorReasoning = "パーソナルカラー情報なし";

  if (personalColor && productColors.length > 0) {
    try {
      const colorResult = computeColorScore({
        personalColor,
        productColors,
        colorKnowledge: knowledge.color,
      });
      colorScore = colorResult.score;
      colorReasoning = colorResult.reasoning;
    } catch { /* ニュートラル値維持 */ }
  } else if (personalColor && productText) {
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
    try {
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
    } catch { /* ニュートラル値維持 */ }
  }

  // 4. プロポーションスコア
  const heightCm = profile.body?.height_cm ?? null;
  let proportionScore = 50;
  let proportionReasoning = "身長情報なし";

  if (heightCm && skeletonType) {
    try {
      const calibration = profile.calibration ?? {};
      const propResult = computeProportionScore({
        heightCm,
        gender,
        skeletonType,
        bodyShape,
        concerns,
        productDimensions,
        productCategory: resolvedCategory,
        calibration,
      });
      proportionScore = propResult.score;
      proportionReasoning = propResult.reasoning;
    } catch { /* ニュートラル値維持 */ }
  }

  // 5. テイストスコア
  const userTasteVector = profile.taste?.vector ?? null;
  let tasteScore = 50;
  let tasteReasoning = "";

  if (userTasteVector && knowledge.taste) {
    try {
      const tasteResult = computeTasteScore({
        userVector: userTasteVector,
        productText,
        tasteKnowledge: knowledge.taste,
      });
      tasteScore = tasteResult.score;
      tasteReasoning = tasteResult.reasoning;
    } catch { /* ニュートラル値維持 */ }
  }

  // 6. トレンドスコア（TF-IDFコサイン類似度）
  const trendQueries = profile.trend_queries ?? [];
  const trendResult = computeTrendScore({
    trendTexts,
    productText,
    trendQueries,
  });
  const trendScore = trendResult.score;

  // 7. 総合スコア（加重平均）
  const totalScore = Math.round(
    colorScore * WEIGHTS.color +
    silhouetteScore * WEIGHTS.silhouette +
    proportionScore * WEIGHTS.proportion +
    materialScore * WEIGHTS.material +
    tasteScore * WEIGHTS.taste +
    trendScore * WEIGHTS.trend
  );

  const breakdown = {
    colorScore,
    silhouetteScore,
    materialScore,
    proportionScore,
    tasteScore,
    trendScore,
  };

  // 8. reasoning（日本語説明）
  const reasoning = buildReasoning(
    { colorScore, silhouetteScore, materialScore, proportionScore, tasteScore, trendScore },
    {
      colorReasoning,
      silhouetteReasoning,
      proportionReasoning,
      tasteReasoning,
      trendReasoning: trendResult.reasoning,
    }
  );

  // 9. recommendations
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
