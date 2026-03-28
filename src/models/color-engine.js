/**
 * カラーマッチングエンジン
 * パーソナルカラーと商品色の相性スコアを計算する Pure Functions 集
 *
 * ES Module形式 / 外部パッケージ不使用 / Pure functions only
 */

// ─── 内部ユーティリティ ────────────────────────────────────────────

/**
 * HEXカラーコードをRGBオブジェクトに変換する
 * @param {string} hex - "#RRGGBB" または "#RGB" 形式のカラーコード
 * @returns {{ r: number, g: number, b: number } | null} 0-255のRGB値。解析失敗時はnull
 */
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;

  // 前後の空白・#を除去して正規化
  const cleaned = hex.trim().replace(/^#/, '');

  // #RGB → #RRGGBB に展開
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

/**
 * リニア化（sRGB → リニアRGB）
 * @param {number} channel - 0-255のチャンネル値
 * @returns {number} リニア値（0-1）
 */
function linearize(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * RGBをCIE L*a*b*に変換する（XYZ経由）
 * @param {{ r: number, g: number, b: number }} rgb - 0-255のRGB値
 * @returns {{ L: number, a: number, b: number }} CIE L*a*b*値
 */
function rgbToLab({ r, g, b }) {
  // Step 1: sRGB → リニアRGB
  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);

  // Step 2: リニアRGB → XYZ (D65光源, sRGB色域)
  const x = rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375;
  const y = rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.072175;
  const z = rLin * 0.0193339 + gLin * 0.119192 + bLin * 0.9503041;

  // Step 3: XYZ → L*a*b* (D65白色点で正規化)
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const fx = labF(x / xn);
  const fy = labF(y / yn);
  const fz = labF(z / zn);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * L*a*b* 変換の補助関数 f(t)
 * @param {number} t
 * @returns {number}
 */
function labF(t) {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

/**
 * CIE76色差 (ΔE76) を計算する（後方互換のため残存）
 * @param {{ L: number, a: number, b: number }} lab1
 * @param {{ L: number, a: number, b: number }} lab2
 * @returns {number} 色差値（0以上。0に近いほど似た色）
 */
function deltaE76(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * CIEDE2000色差を計算する
 *
 * CIE76より人間の知覚に近い精度を持つ。青領域での補正（回転項RT）を含む。
 * 参考: https://en.wikipedia.org/wiki/Color_difference#CIEDE2000
 *
 * @param {{ L: number, a: number, b: number }} lab1
 * @param {{ L: number, a: number, b: number }} lab2
 * @returns {number} 色差値（0以上。0に近いほど似た色。CIE76より値が小さく出る傾向あり）
 */
function deltaE2000(lab1, lab2) {
  const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
  const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

  // Step 1: C*ab を計算
  const C1ab = Math.sqrt(a1 * a1 + b1 * b1);
  const C2ab = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab_mean7 = Math.pow((C1ab + C2ab) / 2, 7);

  // G因子（彩度補正）
  const G = 0.5 * (1 - Math.sqrt(Cab_mean7 / (Cab_mean7 + Math.pow(25, 7))));

  // a'補正
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  // C'（補正後彩度）
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  // h'（補正後色相角、度数）
  function hPrime(ap, bp) {
    if (ap === 0 && bp === 0) return 0;
    const h = Math.atan2(bp, ap) * (180 / Math.PI);
    return h < 0 ? h + 360 : h;
  }
  const h1p = hPrime(a1p, b1);
  const h2p = hPrime(a2p, b2);

  // Step 2: ΔL', ΔC', ΔH'
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * (Math.PI / 180));

  // Step 3: 平均値
  const Lp_mean = (L1 + L2) / 2;
  const Cp_mean = (C1p + C2p) / 2;

  let hp_mean;
  if (C1p * C2p === 0) {
    hp_mean = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp_mean = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp_mean = (h1p + h2p + 360) / 2;
  } else {
    hp_mean = (h1p + h2p - 360) / 2;
  }

  // Step 4: 重み関数
  const T =
    1 -
    0.17 * Math.cos(((hp_mean - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hp_mean * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hp_mean + 6) * Math.PI) / 180) -
    0.20 * Math.cos(((4 * hp_mean - 63) * Math.PI) / 180);

  const SL = 1 + 0.015 * Math.pow(Lp_mean - 50, 2) / Math.sqrt(20 + Math.pow(Lp_mean - 50, 2));
  const SC = 1 + 0.045 * Cp_mean;
  const SH = 1 + 0.015 * Cp_mean * T;

  // Step 5: 回転項 RT（青領域での補正）
  const Cp_mean7 = Math.pow(Cp_mean, 7);
  const RC = 2 * Math.sqrt(Cp_mean7 / (Cp_mean7 + Math.pow(25, 7)));
  const d_theta = 30 * Math.exp(-Math.pow((hp_mean - 275) / 25, 2));
  const RT = -Math.sin((2 * d_theta * Math.PI) / 180) * RC;

  // Step 6: CIEDE2000
  const kL = 1, kC = 1, kH = 1;
  return Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
    Math.pow(dCp / (kC * SC), 2) +
    Math.pow(dHp / (kH * SH), 2) +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );
}

/**
 * 色名からHEXコードをファジーマッチで解決する
 *
 * 優先順位:
 *   1. best_colors / avoid_colors の name と完全一致（大文字小文字・スペース無視）
 *   2. name が入力を含む（部分一致）
 *   3. 入力が name を含む（逆部分一致）
 *   4. マッチしない場合は null
 *
 * @param {string} name - 色名（日本語可。例: "ラベンダー", "コーラルピンク"）
 * @param {{ best_colors: Array<{name:string,hex:string}>, avoid_colors: Array<{name:string,hex:string}> }} seasonData
 * @returns {string | null} HEXコード（"#RRGGBB"）またはnull
 */
function resolveColorName(name, seasonData) {
  if (typeof name !== 'string' || !seasonData) return null;

  const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, '');
  const normalizedInput = normalize(name);

  const allColors = [
    ...(seasonData.best_colors ?? []),
    ...(seasonData.avoid_colors ?? []),
  ];

  // 完全一致
  for (const entry of allColors) {
    if (normalize(entry.name) === normalizedInput) return entry.hex;
  }

  // 部分一致: entryのnameが入力を含む
  for (const entry of allColors) {
    if (normalize(entry.name).includes(normalizedInput)) return entry.hex;
  }

  // 逆部分一致: 入力がentryのnameを含む
  for (const entry of allColors) {
    const normalized = normalize(entry.name);
    if (normalizedInput.includes(normalized)) return entry.hex;
  }

  return null;
}

// ─── 内部ヘルパー ──────────────────────────────────────────────────

/**
 * 値を [min, max] の範囲に収める
 * @param {number} min
 * @param {number} max
 * @param {number} value
 * @returns {number}
 */
function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 色文字列（HEXまたは色名）をHEXに解決する
 * @param {string} colorStr
 * @param {{ best_colors: Array<{name:string,hex:string}>, avoid_colors: Array<{name:string,hex:string}> }} seasonData
 * @returns {string | null} HEXコードまたはnull
 */
function resolveToHex(colorStr, seasonData) {
  if (typeof colorStr !== 'string') return null;
  const trimmed = colorStr.trim();

  // "#" から始まる場合はHEXとして直接パース
  if (trimmed.startsWith('#')) {
    const rgb = hexToRgb(trimmed);
    return rgb ? trimmed : null;
  }

  // 6桁の16進数（#なし）
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`;
  }

  // 色名として解決を試みる
  return resolveColorName(trimmed, seasonData);
}

/**
 * シーズンのbest_colors / avoid_colors からL*a*b*配列を生成する
 * @param {Array<{name:string,hex:string}>} colorList
 * @returns {Array<{ L: number, a: number, b: number }>}
 */
function toLabArray(colorList) {
  const result = [];
  for (const entry of colorList) {
    const rgb = hexToRgb(entry.hex);
    if (rgb) result.push(rgbToLab(rgb));
  }
  return result;
}

/**
 * labリストとの最小色差を計算する
 * @param {{ L: number, a: number, b: number }} targetLab
 * @param {Array<{ L: number, a: number, b: number }>} labList
 * @returns {number} 最小deltaE値。labListが空の場合は Infinity
 */
function minDeltaEFromList(targetLab, labList) {
  if (labList.length === 0) return Infinity;
  let min = Infinity;
  for (const ref of labList) {
    const d = deltaE2000(targetLab, ref);
    if (d < min) min = d;
  }
  return min;
}

// ─── メイン関数 ───────────────────────────────────────────────────

/**
 * パーソナルカラーと商品色の相性スコアを計算する
 *
 * スコアリング式:
 *   1. 各 productColor を HEX に解決
 *   2. season の best_colors 全 HEX との deltaE → minDeltaE_best
 *   3. season の avoid_colors 全 HEX との deltaE → minDeltaE_avoid
 *   4. baseScore = clamp(0, 100, 100 - minDeltaE_best * 2.5)  // CIEDE2000は値が小さいため係数増
 *   5. avoidPenalty = (minDeltaE_avoid < 12) ? -30 : 0  // CIEDE2000基準の閾値
 *   6. colorScore = clamp(0, 100, baseScore + avoidPenalty)
 *   7. 複数 productColors がある場合は max(全 colorScore) を採用
 *
 * @param {Object} params
 * @param {string} params.personalColor - "spring" | "summer" | "autumn" | "winter"
 * @param {string[]} params.productColors - HEXコードまたは色名の配列
 * @param {Object} params.colorKnowledge - personal-colors.json の seasons データ
 * @returns {{ score: number, bestColor: string, deltaE: number, reasoning: string }}
 */
function computeColorScore({ personalColor, productColors, colorKnowledge }) {
  // バリデーション
  if (!personalColor || !productColors || !colorKnowledge) {
    return {
      score: 0,
      bestColor: '',
      deltaE: Infinity,
      reasoning: '必要なパラメータが不足しています',
    };
  }

  const seasonData = colorKnowledge.seasons?.[personalColor];
  if (!seasonData) {
    return {
      score: 0,
      bestColor: '',
      deltaE: Infinity,
      reasoning: `未知のパーソナルカラーシーズンです: ${personalColor}`,
    };
  }

  if (!Array.isArray(productColors) || productColors.length === 0) {
    return {
      score: 0,
      bestColor: '',
      deltaE: Infinity,
      reasoning: '商品カラーが指定されていません',
    };
  }

  // best_colors / avoid_colors の L*a*b* 配列を事前計算
  const bestLabs = toLabArray(seasonData.best_colors ?? []);
  const avoidLabs = toLabArray(seasonData.avoid_colors ?? []);

  let maxScore = -Infinity;
  let bestColorStr = '';
  let bestDeltaE = Infinity;
  const scoreDetails = [];

  for (const colorStr of productColors) {
    const hex = resolveToHex(colorStr, seasonData);

    if (!hex) {
      scoreDetails.push(`"${colorStr}": 色を解決できませんでした (スキップ)`);
      continue;
    }

    const rgb = hexToRgb(hex);
    if (!rgb) {
      scoreDetails.push(`"${colorStr}" → ${hex}: HEX解析失敗 (スキップ)`);
      continue;
    }

    const lab = rgbToLab(rgb);
    const minBest = minDeltaEFromList(lab, bestLabs);
    const minAvoid = minDeltaEFromList(lab, avoidLabs);

    const baseScore = clamp(0, 100, 100 - minBest * 2.5);
    const avoidPenalty = minAvoid < 12 ? -30 : 0;
    const colorScore = clamp(0, 100, baseScore + avoidPenalty);

    const penaltyNote = avoidPenalty < 0 ? ' (NGカラー近似によるペナルティあり)' : '';
    scoreDetails.push(
      `"${colorStr}" → スコア ${colorScore.toFixed(1)} (ΔE_best=${minBest.toFixed(1)}, ΔE_avoid=${minAvoid.toFixed(1)}${penaltyNote})`
    );

    if (colorScore > maxScore) {
      maxScore = colorScore;
      bestColorStr = colorStr;
      bestDeltaE = minBest;
    }
  }

  // 全色の解決に失敗した場合
  if (maxScore === -Infinity) {
    return {
      score: 0,
      bestColor: '',
      deltaE: Infinity,
      reasoning: '商品カラーをいずれも解決できませんでした。HEXコードまたは正確な色名を指定してください。',
    };
  }

  const seasonLabel = seasonData.label ?? personalColor;
  const reasoning =
    `${seasonLabel}タイプとの相性評価。` +
    scoreDetails.join(' / ') +
    ` → 最高スコア: "${bestColorStr}" (${maxScore.toFixed(1)}点)`;

  return {
    score: Math.round(maxScore * 10) / 10,
    bestColor: bestColorStr,
    deltaE: Math.round(bestDeltaE * 100) / 100,
    reasoning,
  };
}

// ─── エクスポート ─────────────────────────────────────────────────

export { computeColorScore };

// テスト用ユーティリティもnamed exportで公開
// deltaE76: CIE76 (後方互換用)、deltaE2000: CIEDE2000 (現行デフォルト)
export { hexToRgb, rgbToLab, deltaE76, deltaE2000, resolveColorName };
