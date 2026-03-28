/**
 * TF-IDFベースのトレンドスコアリングエンジン
 *
 * トレンドキーワード群と商品テキストのセマンティック類似度を計算。
 * 外部ライブラリ不使用。
 */

/**
 * テキストをトークン化（日本語対応: 文字バイグラム + 英語ワード）
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const tokens = [];
  // 英語部分はスペース区切り
  const englishWords = text.match(/[a-zA-Z]+/g) || [];
  tokens.push(...englishWords.map((w) => w.toLowerCase()));

  // 日本語部分は文字バイグラム
  const jpText = text.replace(/[a-zA-Z0-9\s]+/g, "");
  for (let i = 0; i < jpText.length - 1; i++) {
    tokens.push(jpText.slice(i, i + 2));
  }

  return tokens;
}

/**
 * TF (Term Frequency) を計算
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function computeTF(tokens) {
  const tf = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  const total = tokens.length || 1;
  for (const [k, v] of tf) {
    tf.set(k, v / total);
  }
  return tf;
}

/**
 * IDF (Inverse Document Frequency) を計算
 * @param {Map<string, number>[]} tfMaps - 全ドキュメントのTFマップ
 * @returns {Map<string, number>}
 */
function computeIDF(tfMaps) {
  const idf = new Map();
  const N = tfMaps.length;
  for (const tf of tfMaps) {
    for (const term of tf.keys()) {
      idf.set(term, (idf.get(term) || 0) + 1);
    }
  }
  for (const [term, df] of idf) {
    idf.set(term, Math.log((N + 1) / (df + 1)) + 1); // smoothed IDF
  }
  return idf;
}

/**
 * TF-IDFベクトルを計算
 * @param {Map<string, number>} tf
 * @param {Map<string, number>} idf
 * @returns {Map<string, number>}
 */
function computeTFIDF(tf, idf) {
  const tfidf = new Map();
  for (const [term, tfVal] of tf) {
    tfidf.set(term, tfVal * (idf.get(term) || 1));
  }
  return tfidf;
}

/**
 * 2つのTF-IDFベクトルのコサイン類似度
 * @param {Map<string, number>} vecA
 * @param {Map<string, number>} vecB
 * @returns {number}
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, valA] of vecA) {
    const valB = vecB.get(term) || 0;
    dot += valA * valB;
    normA += valA * valA;
  }
  for (const [, valB] of vecB) {
    normB += valB * valB;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * トレンドスコアを計算
 * @param {Object} params
 * @param {string[]} params.trendTexts - トレンド関連テキスト（search_x/search_trends の結果）
 * @param {string} params.productText - 商品テキスト
 * @param {string[]} params.trendQueries - profile.jsonのtrend_queries
 * @returns {{ score: number, topMatchingTerms: string[], reasoning: string }}
 */
export function computeTrendScore({ trendTexts = [], productText, trendQueries = [] }) {
  // トレンドテキストがない場合: trend_queriesのキーワードとの単純マッチ
  // トレンドテキストがある場合: TF-IDFコサイン類似度
  if (trendTexts.length === 0 && trendQueries.length === 0) {
    return { score: 50, topMatchingTerms: [], reasoning: "トレンド情報なし（ニュートラル）" };
  }

  // 全テキスト（トレンド群 + 商品テキスト）をトークン化
  const allDocs = [...trendTexts, ...trendQueries, productText];
  const allTFs = allDocs.map((doc) => computeTF(tokenize(doc)));
  const idf = computeIDF(allTFs);

  // トレンド側の統合ベクトル（全トレンドテキストの平均TF-IDF）
  const trendVecs = [...trendTexts, ...trendQueries].map((t) =>
    computeTFIDF(computeTF(tokenize(t)), idf)
  );
  const mergedTrend = new Map();
  for (const vec of trendVecs) {
    for (const [term, val] of vec) {
      mergedTrend.set(term, (mergedTrend.get(term) || 0) + val / trendVecs.length);
    }
  }

  // 商品側のTF-IDFベクトル
  const productVec = computeTFIDF(computeTF(tokenize(productText)), idf);

  // コサイン類似度 → 0-100スコア
  const similarity = cosineSimilarity(mergedTrend, productVec);
  const score = Math.round(Math.min(100, similarity * 200)); // 0.5の類似度で100点

  // マッチしたトップタームを抽出
  const matchingTerms = [];
  for (const [term] of mergedTrend) {
    if (productVec.has(term)) matchingTerms.push(term);
  }
  matchingTerms.sort((a, b) => (mergedTrend.get(b) || 0) - (mergedTrend.get(a) || 0));

  return {
    score,
    topMatchingTerms: matchingTerms.slice(0, 5),
    reasoning:
      score > 70
        ? `トレンド高一致 (${score}点) — 一致キーワード: ${matchingTerms.slice(0, 3).join(", ")}`
        : score > 40
        ? `トレンド中一致 (${score}点)`
        : `トレンド低一致 (${score}点)`,
  };
}
