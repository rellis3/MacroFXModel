import { S } from './state.js';
import { COMPASS_CONFIG, KALMAN5M_DEFAULTS, FEATURE_FLAGS } from './config.js';
import { ema, calcRSI, filterTradingDays } from './utils.js';

// ── PCA-inspired tier decorrelation ───────────────────────────────────────────
// Applies discount weights to tier score contributions when pairs of tiers are
// known to be correlated, preventing double-counting of the same risk factor.
// Known correlations (empirical, FX literature):
//   T1 ↔ T3: rate differential drives DXY (~65% corr) — T3 partially redundant
//   T2 ↔ T4: VIX & HY both capture risk-off sentiment (~75% corr)
//   T5 ↔ T2: carry unwinds when VIX spikes (~60% corr)
//   T6 ↔ T4: NFCI & HY both measure financial conditions (~55% corr)
//   T7 ↔ T8: both technical momentum signals
// Output is scaled back to the original ±rawMax range for threshold compatibility.
function applyPCADecorrelation(tiers) {
  const s = {};
  for (const t of tiers) s[t.tier] = t;

  const w        = {};
  for (const t of tiers) w[t.tier] = 1.0;
  const discounts = [];

  const agree = (a, b) =>
    a && b && !a.na && !b.na && a.score !== 0 && b.score !== 0 &&
    Math.sign(a.score) === Math.sign(b.score);

  // T1 ↔ T3: rate differential already partially captured by DXY
  if (agree(s.T1, s.T3)) {
    w.T3 = 0.5;
    discounts.push('T3×0.5 (T1 corr)');
  }

  // T2 ↔ T4: discount whichever has the weaker normalised magnitude
  if (agree(s.T2, s.T4)) {
    const m2 = s.T2 ? Math.abs(s.T2.score) / Math.max(s.T2.max, 1) : 0;
    const m4 = s.T4 ? Math.abs(s.T4.score) / Math.max(s.T4.max, 1) : 0;
    if (m2 >= m4) { w.T4 = 0.6; discounts.push('T4×0.6 (T2 corr)'); }
    else          { w.T2 = 0.6; discounts.push('T2×0.6 (T4 corr)'); }
  }

  // T5 ↔ T2: carry is partially reflected in VIX
  if (agree(s.T5, s.T2)) {
    w.T5 = 0.75;
    discounts.push('T5×0.75 (T2 corr)');
  }

  // T6 ↔ T4: NFCI and HY share financial-conditions information
  if (agree(s.T6, s.T4)) {
    w.T6 = 0.7;
    discounts.push('T6×0.7 (T4 corr)');
  }

  // T7 ↔ T8: both technicals
  if (agree(s.T7, s.T8)) {
    w.T8 = 0.8;
    discounts.push('T8×0.8 (T7 corr)');
  }

  const adjSum = tiers.reduce((sum, t) => sum + t.score * (w[t.tier] ?? 1.0), 0);
  const adjMax = tiers.reduce((sum, t) => sum + t.max  * (w[t.tier] ?? 1.0), 0);
  const rawMax = tiers.reduce((sum, t) => sum + t.max, 0);

  // Scale back to original ±rawMax range so downstream thresholds are unaffected
  const adjustedScore = adjMax > 0 ? Math.round(adjSum / adjMax * rawMax) : 0;

  return { adjustedScore, discounts, weights: w };
}

export function calculateTierScores() {
  const tiers = [];

  const t1 = computeT1();
  tiers.push(t1);
  tiers.push(computeT2());
  tiers.push(computeT3());
  tiers.push(computeT4());
  tiers.push(computeT5());
  tiers.push(computeT6());
  tiers.push(computeT7());
  tiers.push(computeT8());

  const rawScore = tiers.reduce((sum, t) => sum + t.score, 0);
  const pca = FEATURE_FLAGS.PCA_DECORRELATION
    ? applyPCADecorrelation(tiers)
    : { adjustedScore: rawScore, discounts: [], weights: {} };

  // Only count tiers with a meaningful directional view (|score| >= 1) —
  // a marginal +1 from RSI at 51 should not tip the coherence gate.
  const agreeCount = tiers.filter(t =>
    Math.abs(t.score) >= 1 && Math.sign(t.score) === Math.sign(pca.adjustedScore)
  ).length;
  const coherenceBonus = agreeCount >= 5 ? Math.sign(pca.adjustedScore) : 0;

  return {
    tiers,
    totalScore:   pca.adjustedScore + coherenceBonus,
    rawScore,
    pcaActive:    FEATURE_FLAGS.PCA_DECORRELATION,
    pcaDiscounts: pca.discounts,
    coherenceBonus,
    agreeCount,
    maxScore: 18,
  };
}

// ── T1 for NQ/Equity: Net Fed Liquidity ─────────────────────────────────────
// Net Liquidity = WALCL (Fed balance sheet) - TGA - RRP
// Rising net liq = more dealer cash to deploy = risk-on tailwind for NQ.
// WALCL updates weekly (Thursdays), so prev = prior week.
function computeT1_Equity() {
  const fredData  = S.fredData ?? {};
  const walcl     = fredData.walcl?.value;
  const walclPrev = fredData.walcl?.prev;
  const tga       = fredData.tga?.value;
  const tgaPrev   = fredData.tga?.prev;
  const rrp       = fredData.rrp?.value;
  const rrpPrev   = fredData.rrp?.prev;

  if (walcl == null || tga == null || rrp == null) {
    const missing = ['walcl', 'tga', 'rrp'].filter(k => fredData[k]?.value == null).join(', ');
    console.warn(`[NQ T1] Missing FRED keys: ${missing} — add to SERIES in _worker.js`);
    return {
      tier: 'T1', name: 'Net Fed Liquidity', max: 3, score: 0,
      val: `Missing: ${missing}`,
      reading: 'WALCL/TGA/RRP not in FRED response — check _worker.js SERIES',
      source: 'WALCL-TGA-RRP', isMonthly: false, badge: 'WK', na: true,
    };
  }

  const netLiq     = walcl - tga - rrp;
  const netLiqPrev = (walclPrev != null && tgaPrev != null && rrpPrev != null)
    ? walclPrev - tgaPrev - rrpPrev
    : null;
  const change = netLiqPrev != null ? netLiq - netLiqPrev : null;

  let score = 0;
  if (change != null) {
    const abs = Math.abs(change);
    if (change > 0) score = abs > 100 ? 3 : abs > 50 ? 2 : abs > 15 ? 1 : 0;
    else            score = abs > 100 ? -3 : abs > 50 ? -2 : abs > 15 ? -1 : 0;
  }

  const netLiqTrn = `$${(netLiq / 1000).toFixed(2)}T`;
  const chgStr    = change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(0)}bn` : 'n/a';
  const reading   = change == null       ? 'No prior period data'
    : change >  15 ? 'Expanding — risk-on tailwind for equities'
    : change < -15 ? 'Contracting — risk-off headwind for equities'
    :                'Flat — neutral liquidity conditions';

  return {
    tier: 'T1', name: 'Net Fed Liquidity', max: 3, score,
    val: `${netLiqTrn} (${chgStr})`,
    reading,
    source: 'WALCL-TGA-RRP',
    isMonthly: false,
    badge: 'WK',
  };
}

function computeT1() {
  const fredData = S.fredData ?? {};
  if (S.currentPair.isEquity) return computeT1_Equity();
  if (S.currentPair.isGold) {
    const tips = fredData.tips?.value;
    if (tips == null) return tierUnavailable('T1', 'Rate Differential', 'TIPS Real Yield', 3);

    let score = 0;
    if (tips < 0) score = 3;
    else if (tips < 0.5) score = 2;
    else if (tips < 1.0) score = 1;
    else if (tips < 1.5) score = 0;
    else if (tips < 2.0) score = -1;
    else if (tips < 2.5) score = -2;
    else score = -3;

    return {
      tier: 'T1', name: 'Rate Differential', max: 3, score,
      val: `${tips.toFixed(2)}%`,
      reading: tips < 1 ? 'Low real yield supports gold' : tips > 2 ? 'High real yield drags gold' : 'Neutral real yield',
      source: 'TIPS 10Y',
      isMonthly: false
    };
  }

  const us10y = fredData.us10y?.value;
  const foreign10y = fredData[`${S.currentPair.shortCode}10y`]?.value;
  const us2y = fredData.us2y?.value;
  const foreign2y = fredData[`${S.currentPair.shortCode}_short`]?.value;

  // For EUR pairs: prefer ECB daily de10y over FRED monthly proxy when available
  const ecbData   = S.ecbData ?? null;
  const de10y_ecb = ecbData?.de10y_ecb?.value ?? null;
  const de10yEffective = (S.currentPair.symbol === 'EUR/USD' || S.currentPair.symbol === 'EUR/GBP')
    ? (de10y_ecb ?? fredData?.de10y?.value ?? foreign10y)
    : foreign10y;

  if (us10y == null || (de10yEffective == null && foreign10y == null)) return tierUnavailable('T1', 'Rate Differential', '10Y Spread', 3);

  let diff10, diff2, bullishWhenPositive;

  if (S.currentPair.symbol === 'EUR/USD') {
    diff10 = us10y - (de10yEffective ?? foreign10y); bullishWhenPositive = false;
    diff2  = (us2y != null && foreign2y != null) ? us2y - foreign2y : null;
  } else if (S.currentPair.symbol === 'GBP/USD') {
    diff10 = foreign10y - us10y; bullishWhenPositive = true;
    diff2  = (us2y != null && foreign2y != null) ? foreign2y - us2y : null;
  } else if (S.currentPair.symbol === 'USD/JPY') {
    diff10 = us10y - foreign10y; bullishWhenPositive = true;
    diff2  = (us2y != null && foreign2y != null) ? us2y - foreign2y : null;
  } else if (S.currentPair.symbol === 'AUD/USD') {
    diff10 = foreign10y - us10y; bullishWhenPositive = true;
    diff2  = (us2y != null && foreign2y != null) ? foreign2y - us2y : null;
  } else if (S.currentPair.symbol === 'EUR/GBP') {
    // Cross pair: GBP vs EUR yield. Higher GB yield → GBP strong → EUR/GBP falls (bearish)
    const de10yV = fredData.de10y?.value;
    const deShortV = fredData.de_short?.value;
    const gbShortV = fredData.gb_short?.value;
    if (de10yV == null) return tierUnavailable('T1', 'Rate Differential', '10Y Spread', 3);
    diff10 = foreign10y - de10yV; bullishWhenPositive = false;
    diff2  = (gbShortV != null && deShortV != null) ? gbShortV - deShortV : null;
  } else if (S.currentPair.symbol === 'USD/CAD') {
    diff10 = us10y - foreign10y; bullishWhenPositive = true;
    diff2  = (us2y != null && foreign2y != null) ? us2y - foreign2y : null;
  } else if (S.currentPair.symbol === 'USD/CHF') {
    diff10 = us10y - foreign10y; bullishWhenPositive = true;
    diff2  = (us2y != null && foreign2y != null) ? us2y - foreign2y : null;
  } else if (S.currentPair.symbol === 'GBP/JPY') {
    // Cross pair: GBP vs JPY yield. Higher GB yield → GBP strong → GBP/JPY rises (bullish)
    const gb10yV  = fredData.gb10y?.value;
    const jp10yV  = fredData.jp10y?.value;
    const gbShortV = fredData.gb_short?.value;
    const jpShortV = fredData.jp_short?.value;
    if (gb10yV == null || jp10yV == null) return tierUnavailable('T1', 'Rate Differential', '10Y Spread', 3);
    diff10 = gb10yV - jp10yV; bullishWhenPositive = true;
    diff2  = (gbShortV != null && jpShortV != null) ? gbShortV - jpShortV : null;
  } else {
    diff10 = us10y - foreign10y; bullishWhenPositive = false;
    diff2  = null;
  }

  const diff10Bp = diff10 * 100;
  let abs10 = 0;
  if (Math.abs(diff10Bp) > 100) abs10 = 1.5;
  else if (Math.abs(diff10Bp) > 50)  abs10 = 1.0;
  else if (Math.abs(diff10Bp) > 20)  abs10 = 0.5;
  const score10 = (diff10 >= 0 ? 1 : -1) * abs10 * (bullishWhenPositive ? 1 : -1);

  let score2 = 0;
  let diff2Bp = null;
  if (diff2 != null) {
    diff2Bp = diff2 * 100;
    let abs2 = 0;
    if (Math.abs(diff2Bp) > 100) abs2 = 1.5;
    else if (Math.abs(diff2Bp) > 50)  abs2 = 1.0;
    else if (Math.abs(diff2Bp) > 20)  abs2 = 0.5;
    score2 = (diff2 >= 0 ? 1 : -1) * abs2 * (bullishWhenPositive ? 1 : -1);
  }

  // Yield-spread momentum bonus: Macro Compass 10Y momentum confirms/contradicts T1 (+1/-1)
  const compassData = S.compassData?.[S.currentPair.symbol];
  const mom10y      = compassData?.momentum10y ?? null;
  const fxSign      = COMPASS_CONFIG[S.currentPair.symbol]?.fxSign ?? 1;
  let momentumBonus = 0;
  if (mom10y != null && Math.abs(mom10y) > 0.05) {
    // mom10yBull: is momentum pushing the pair upward?
    const mom10yBull = fxSign > 0 ? mom10y > 0 : mom10y < 0;
    const rawScore   = score10 + score2;
    momentumBonus    = mom10yBull === (rawScore >= 0) ? 1 : -1;
  }

  const score = Math.max(-3, Math.min(3, Math.round(score10 + score2 + momentumBonus)));
  const has2Y = diff2Bp != null;
  const valStr = has2Y
    ? `10Y ${diff10Bp >= 0 ? '+' : ''}${diff10Bp.toFixed(0)}bp · 2Y ${diff2Bp >= 0 ? '+' : ''}${diff2Bp.toFixed(0)}bp`
    : `10Y ${diff10Bp >= 0 ? '+' : ''}${diff10Bp.toFixed(0)}bp`;

  // Fed pivot detector: front slope (5s-2s) steepening while full curve still inverted
  // signals the market is beginning to price rate cuts before the 10Y confirms it.
  let pivotNote = '';
  const us5y = fredData.us5y?.value;
  if (us5y != null && us10y != null && us2y != null) {
    const slope5s2s  = us5y  - us2y;
    const slope10s5s = us10y - us5y;
    const curve      = us10y - us2y;
    if (curve < 0 && slope5s2s > slope10s5s + 0.20) {
      pivotNote = ' · Front slope steepening — pivot pricing emerging';
    }
  }

  return {
    tier: 'T1', name: 'Rate Differential', max: 3, score,
    val: valStr,
    reading: (Math.abs(diff10Bp) < 20 ? 'Tight spread, neutral' :
              score > 0 ? 'Yield differential supports pair' : 'Yield differential drags pair')
             + pivotNote,
    source: has2Y ? '10Y + 2Y spreads' : '10Y vs counterpart',
    isMonthly: !has2Y,
    momentumBonus,
  };
}

function computeT2() {
  const fredData = S.fredData ?? {};
  const vix = fredData.vix?.value;
  const vixPrev = fredData.vix?.prev;
  if (vix == null) return tierUnavailable('T2', 'VIX', 'VIX Level + Δ', 3);

  const change = vixPrev ? vix - vixPrev : 0;
  const isInverted = S.currentPair.isSafeHaven || S.currentPair.isGold;

  let levelScore = 0;
  if (vix > 30) levelScore = -2;
  else if (vix > 25) levelScore = -1.5;
  else if (vix > 20) levelScore = -0.5;
  else if (vix > 15) levelScore = 0.5;
  else if (vix > 12) levelScore = 1;
  else levelScore = 1.5;

  let dirScore = 0;
  if (change > 2) dirScore = -1;
  else if (change > 0.5) dirScore = -0.5;
  else if (change < -2) dirScore = 1;
  else if (change < -0.5) dirScore = 0.5;

  let score = levelScore + dirScore;
  if (isInverted) score = -score;
  score = Math.max(-3, Math.min(3, Math.round(score)));

  return {
    tier: 'T2', name: 'VIX Level + Δ', max: 3, score,
    val: `${vix.toFixed(1)} ${change >= 0 ? '↑' : '↓'}${Math.abs(change).toFixed(1)}`,
    reading: vix > 25 ? (isInverted ? 'Risk-off favors safe haven' : 'Risk-off, fade rallies') :
             vix < 15 ? (isInverted ? 'Complacency hurts safe haven' : 'Risk-on, follow trends') : 'Standard regime',
    source: 'VIX',
    isMonthly: false
  };
}

function computeT3() {
  const fredData = S.fredData ?? {};
  const usdBase     = S.currentPair.isUsdBase;
  const amplifier   = S.currentPair.isGold ? 1.5 : 1;

  // Primary: live composite USD strength from price bars (avoids FRED DTWEXBGS lag)
  const usd = S.usdStrength || computeUSDStrength();

  if (usd && usd.pairsUsed >= 2) {
    // usd.score is in [-3, +3]: positive = USD strengthening
    // Apply same directional logic as the FRED-based version
    let raw = usd.score;
    let score;
    if (S.currentPair.isGold)     score = Math.max(-2, Math.min(2, Math.round(-raw * amplifier * 0.67)));
    else if (S.currentPair.isEquity) score = Math.max(-2, Math.min(2, Math.round(-raw * 0.67)));
    else if (usdBase)             score = Math.max(-2, Math.min(2, Math.round( raw * 0.67)));
    else                          score = Math.max(-2, Math.min(2, Math.round(-raw * 0.67)));

    return {
      tier: 'T3', name: 'DXY Direction', max: 2, score,
      val: usd.label,
      reading: Math.abs(usd.score) < 1.0 ? 'USD range-bound' :
               score > 0 ? 'USD move supports pair' : 'USD move drags pair',
      source: `Composite (${usd.pairsUsed}/4 pairs)`,
      isMonthly: false,
    };
  }

  // Fallback: FRED DTWEXBGS (weekly release, significant lag)
  const dxy = fredData.dxy?.value;
  const dxyPrev = fredData.dxy?.prev;
  if (dxy == null) return tierUnavailable('T3', 'DXY Direction', 'Dollar Index', 2);

  const change = dxyPrev ? ((dxy / dxyPrev) - 1) * 100 : 0;
  let absScore = 0;
  if (Math.abs(change) > 0.5) absScore = 2;
  else if (Math.abs(change) > 0.2) absScore = 1;

  const sign = change > 0 ? 1 : -1;
  let score = sign * absScore;
  if (S.currentPair.isGold)       score = -score;
  else if (S.currentPair.isEquity) score = -score;
  else if (!usdBase)               score = -score;

  score = Math.max(-2, Math.min(2, Math.round(score * amplifier)));

  return {
    tier: 'T3', name: 'DXY Direction', max: 2, score,
    val: `${dxy.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    reading: Math.abs(change) < 0.2 ? 'DXY range-bound' :
             score > 0 ? 'USD move supports pair' : 'USD move drags pair',
    source: 'DXY (FRED fallback)',
    isMonthly: false,
  };
}

function computeT4() {
  const fredData = S.fredData ?? {};
  const hyRaw = fredData.hy?.value;
  const hyPrevRaw = fredData.hy?.prev;
  if (hyRaw == null || isNaN(hyRaw)) return tierUnavailable('T4', 'HY Credit', 'HY OAS', 2);
  const hy = hyRaw * 100;
  const hyPrev = hyPrevRaw != null ? hyPrevRaw * 100 : null;

  const change = hyPrev ? hy - hyPrev : 0;
  const isInverted = S.currentPair.isSafeHaven || S.currentPair.isGold;

  let levelScore = 0;
  if (hy > 600) levelScore = -1.5;
  else if (hy > 500) levelScore = -1;
  else if (hy > 400) levelScore = -0.5;
  else if (hy < 300) levelScore = 0.5;

  let dirScore = 0;
  if (change > 20) dirScore = -1;
  else if (change > 5) dirScore = -0.5;
  else if (change < -20) dirScore = 1;
  else if (change < -5) dirScore = 0.5;

  // Credit quality spread: CCC widening faster than BB = distress reaching bottom of stack
  // This early-warning signal fires before broad HY OAS reflects the stress.
  let qualityMod = 0;
  let qualityStr = '';
  const bbBp   = fredData.hy_bb?.value  != null ? fredData.hy_bb.value  * 100 : null;
  const cccBp  = fredData.hy_ccc?.value != null ? fredData.hy_ccc.value * 100 : null;
  const bbPrev  = fredData.hy_bb?.prev  != null ? fredData.hy_bb.prev   * 100 : null;
  const cccPrev = fredData.hy_ccc?.prev != null ? fredData.hy_ccc.prev  * 100 : null;
  if (bbBp != null && cccBp != null) {
    const qualitySpread = cccBp - bbBp;
    qualityStr = ` | CCC−BB ${qualitySpread.toFixed(0)}bp`;
    if (bbPrev != null && cccPrev != null) {
      const qualityChange = qualitySpread - (cccPrev - bbPrev);
      if (qualityChange > 50)       qualityMod = isInverted ?  0.5 : -0.5;
      else if (qualityChange < -50) qualityMod = isInverted ? -0.5 :  0.5;
    }
  }

  let score = levelScore + dirScore + qualityMod;
  if (isInverted) score = -score;
  score = Math.max(-2, Math.min(2, Math.round(score)));

  const qualityReading = qualityMod !== 0
    ? (qualityMod < 0 ? ' · CCC widening vs BB — distress spreading' : ' · CCC tightening vs BB — quality rally')
    : '';

  return {
    tier: 'T4', name: 'HY Credit', max: 2, score,
    val: `${hy.toFixed(0)}bp ${change >= 0 ? '+' : ''}${change.toFixed(0)}${qualityStr}`,
    reading: (hy > 500 ? (isInverted ? 'Stressed credit favors safe haven' : 'Stressed credit, risk off') :
             hy < 300 ? 'Risk on, follow momentum' : 'Normal range') + qualityReading,
    source: 'BAMLH0A0HYM2 + BB/CCC',
    isMonthly: false
  };
}

// ── Cross-Sectional Carry Factor ──────────────────────────────────────────────
// Ranks all available pairs by their short-rate differential (carry) and
// correlates carry with 5-day returns across pairs.
// Positive correlation → carry is rewarded (risk-on).
// Negative correlation → carry crash / risk-off unwind.
// Returns null when fewer than 4 pairs have both rate data and price bars.
function computeCrossCarryScore() {
  const f = S.fredData ?? {};
  const us = f.us2y?.value ?? null;
  if (us == null) return null;

  // Carry differential: positive = base currency has higher short rate
  // Pair goes UP when base currency appreciates
  const PAIR_CARRY = [
    { sym: 'EUR/USD', carry: (f.de_short?.value ?? null) != null ? f.de_short.value - us : null },
    { sym: 'GBP/USD', carry: (f.gb_short?.value ?? null) != null ? f.gb_short.value - us : null },
    { sym: 'USD/JPY', carry: (f.jp_short?.value ?? null) != null ? us - f.jp_short.value : null },
    { sym: 'AUD/USD', carry: (f.au_short?.value ?? null) != null ? f.au_short.value - us : null },
    { sym: 'USD/CAD', carry: (f.ca_short?.value ?? null) != null ? us - f.ca_short.value : null },
    { sym: 'USD/CHF', carry: (f.ch_short?.value ?? null) != null ? us - f.ch_short.value : null },
    { sym: 'EUR/GBP', carry: (f.de_short?.value ?? null) != null && (f.gb_short?.value ?? null) != null ? f.de_short.value - f.gb_short.value : null },
    { sym: 'GBP/JPY', carry: (f.gb_short?.value ?? null) != null && (f.jp_short?.value ?? null) != null ? f.gb_short.value - f.jp_short.value : null },
  ];

  // Attach 5-day sign-adjusted returns (positive = base currency up = carry direction)
  for (const pc of PAIR_CARRY) {
    if (pc.carry == null) continue;
    const bars = filterTradingDays(S.ohlcData[pc.sym]?.values);
    if (bars && bars.length >= 6) {
      const now  = parseFloat(bars[0].close);
      const prev = parseFloat(bars[5].close);
      pc.ret5d = prev > 0 ? (now / prev) - 1 : null;
    } else {
      pc.ret5d = null;
    }
  }

  const valid = PAIR_CARRY.filter(p => p.carry != null && p.ret5d != null);
  if (valid.length < 4) return null;

  // Pearson correlation between carry differential and 5-day return across pairs
  const carries = valid.map(p => p.carry);
  const returns = valid.map(p => p.ret5d);
  const mc = carries.reduce((a, b) => a + b, 0) / carries.length;
  const mr = returns.reduce((a, b) => a + b, 0) / returns.length;
  let num = 0, dc = 0, dr = 0;
  for (let i = 0; i < valid.length; i++) {
    num += (carries[i] - mc) * (returns[i] - mr);
    dc  += (carries[i] - mc) ** 2;
    dr  += (returns[i] - mr) ** 2;
  }
  const corr = (dc > 0 && dr > 0) ? num / Math.sqrt(dc * dr) : 0;

  let score = 0;
  if      (corr >  0.5) score =  2;
  else if (corr >  0.2) score =  1;
  else if (corr < -0.5) score = -2;
  else if (corr < -0.2) score = -1;

  const regime = corr >  0.3 ? 'Carry rewarded — risk-on'
               : corr < -0.3 ? 'Carry unwind — risk-off'
               :                'Carry neutral — mixed';

  // Find highest and lowest carry pairs for display
  const sorted   = [...valid].sort((a, b) => b.carry - a.carry);
  const topPair  = sorted[0]?.sym  ?? '—';
  const botPair  = sorted[sorted.length - 1]?.sym ?? '—';

  return {
    corr,
    score,
    regime,
    pairsUsed: valid.length,
    topPair,
    botPair,
    val: `Carry corr ${corr >= 0 ? '+' : ''}${(corr * 100).toFixed(0)}% · ${valid.length} pairs`,
  };
}

function computeT5() {
  const fredData   = S.fredData ?? {};
  const isInverted = S.currentPair.isSafeHaven || S.currentPair.isGold;

  // Primary: cross-sectional carry factor — ranks all pairs by rate differential
  // and measures whether carry is being rewarded (risk-on) or punished (risk-off).
  const cs = computeCrossCarryScore();
  if (cs) {
    let score = cs.score;
    if (isInverted) score = -score;
    score = Math.max(-2, Math.min(2, score));
    return {
      tier: 'T5', name: 'Cross-Sectional Carry', max: 2, score,
      val: cs.val,
      reading: cs.regime + ` · Hi-carry: ${cs.topPair} Lo-carry: ${cs.botPair}`,
      source: `Cross-carry correlation (${cs.pairsUsed} pairs)`,
      isMonthly: false,
    };
  }

  // Fallback: compute AUD/JPY from daily OHLC bars already loaded in state.
  // These are always current (23h cache, refreshed on pair load) vs FRED H.10
  // which lags by up to 7 days and fires requests in parallel risking rate-limit nulls.
  const audBars = filterTradingDays(S.ohlcData['AUD/USD']?.values);
  const jpyBars = filterTradingDays(S.ohlcData['USD/JPY']?.values);

  if (audBars?.length >= 2 && jpyBars?.length >= 2) {
    const audNow = parseFloat(audBars[0].close);
    const audPrv = parseFloat(audBars[1].close);
    const jpyNow = parseFloat(jpyBars[0].close);
    const jpyPrv = parseFloat(jpyBars[1].close);
    const audjpy     = audNow * jpyNow;
    const audjpyPrev = audPrv * jpyPrv;
    const audjpyChg  = audjpyPrev ? ((audjpy / audjpyPrev) - 1) * 100 : 0;

    // Blend NZD/JPY (FRED scalar) as second carry leg — smooths AUD-specific noise
    const nzd     = fredData.nzd_usd?.value;
    const nzdPrev = fredData.nzd_usd?.prev;
    let nzdjpyChg = null;
    if (nzd != null && nzdPrev != null) {
      const nzdjpy     = nzd * jpyNow;
      const nzdjpyPrev = nzdPrev * jpyPrv;
      nzdjpyChg = nzdjpyPrev > 0 ? ((nzdjpy / nzdjpyPrev) - 1) * 100 : null;
    }
    const change = nzdjpyChg != null ? audjpyChg * 0.6 + nzdjpyChg * 0.4 : audjpyChg;
    const source = nzdjpyChg != null ? 'AUD/JPY × NZD/JPY basket (live)' : 'AUD/USD × USD/JPY (live bars)';

    let absScore = 0;
    if (Math.abs(change) > 0.5) absScore = 2;
    else if (Math.abs(change) > 0.2) absScore = 1;

    let score = (change > 0 ? 1 : -1) * absScore;
    if (isInverted) score = -score;
    score = Math.max(-2, Math.min(2, score));

    return {
      tier: 'T5', name: 'Carry Basket', max: 2, score,
      val: `AUD/JPY ${audjpy.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
      reading: change > 0.2 ? (isInverted ? 'Risk-on hurts safe haven' : 'Carry on, risk-on') :
               change < -0.2 ? (isInverted ? 'Carry unwind benefits safe haven' : 'Carry off, risk-off') : 'Carry stable',
      source,
      isMonthly: false,
    };
  }

  // Final fallback: FRED H.10 exchange rates (weekly lag, may be null under rate-limiting)
  const aud = fredData.aud_usd?.value;
  const audPrev = fredData.aud_usd?.prev;
  const jpy = fredData.usd_jpy?.value;
  const jpyPrev = fredData.usd_jpy?.prev;
  if (aud == null || jpy == null) return tierUnavailable('T5', 'Carry Basket', 'Carry Proxy', 2);

  const audjpy = aud * jpy;
  const audjpyPrev = (audPrev && jpyPrev) ? audPrev * jpyPrev : null;
  const audjpyChg = audjpyPrev ? ((audjpy / audjpyPrev) - 1) * 100 : 0;

  const nzd = fredData.nzd_usd?.value;
  const nzdPrev = fredData.nzd_usd?.prev;
  let nzdjpyChg = null;
  if (nzd != null && nzdPrev != null && jpyPrev != null) {
    const nzdjpy = nzd * jpy;
    const nzdjpyPrev = nzdPrev * jpyPrev;
    nzdjpyChg = nzdjpyPrev > 0 ? ((nzdjpy / nzdjpyPrev) - 1) * 100 : null;
  }
  const change = nzdjpyChg != null ? audjpyChg * 0.6 + nzdjpyChg * 0.4 : audjpyChg;

  let absScore = 0;
  if (Math.abs(change) > 0.5) absScore = 2;
  else if (Math.abs(change) > 0.2) absScore = 1;

  let score = (change > 0 ? 1 : -1) * absScore;
  if (isInverted) score = -score;
  score = Math.max(-2, Math.min(2, score));

  return {
    tier: 'T5', name: 'Carry Basket', max: 2, score,
    val: `AUD/JPY ${audjpy.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    reading: change > 0.2 ? (isInverted ? 'Risk-on hurts safe haven' : 'Carry on, risk-on') :
             change < -0.2 ? (isInverted ? 'Carry unwind benefits safe haven' : 'Carry off, risk-off') : 'Carry stable',
    source: nzdjpyChg != null ? 'AUD/JPY × NZD/JPY (FRED fallback)' : 'AUD×USDJPY (FRED fallback)',
    isMonthly: false,
  };
}

function computeT6() {
  const fredData = S.fredData ?? {};
  const nfci = fredData.nfci?.value;
  if (nfci == null) return tierUnavailable('T6', 'NFCI', 'Conditions', 2);

  const isInverted = S.currentPair.isSafeHaven || S.currentPair.isGold;

  let rawScore = 0;
  if      (nfci >  1.0) rawScore = -2;
  else if (nfci >  0.5) rawScore = -1.5;
  else if (nfci >  0.1) rawScore = -0.5;
  else if (nfci < -1.0) rawScore =  2;
  else if (nfci < -0.5) rawScore =  1.5;
  else if (nfci < -0.2) rawScore =  0.5;

  if (isInverted) rawScore = -rawScore;
  const score = Math.max(-2, Math.min(2, Math.round(rawScore)));

  return {
    tier: 'T6', name: 'NFCI', max: 2, score,
    val: nfci.toFixed(2),
    reading: nfci >  0.5 ? (isInverted ? 'Tight conditions support safe haven' : 'Tight conditions, stress rising') :
             nfci >  0.1 ? 'Conditions tightening' :
             nfci < -0.5 ? (isInverted ? 'Very loose — hurts safe haven' : 'Very loose, risk-on') :
             nfci < -0.2 ? (isInverted ? 'Loose conditions — hurts safe haven' : 'Loose conditions, risk-on') : 'Neutral',
    source: 'Chicago Fed NFCI',
    isMonthly: false
  };
}

function computeT7() {
  const bars = filterTradingDays(S.ohlcData[S.currentPair.symbol]?.values);
  if (!bars || bars.length < 50) return tierUnavailable('T7', 'Momentum', 'EMA/RSI', 2);

  const closes = bars.slice(0, 100).map(b => parseFloat(b.close)).reverse();
  const ema20  = ema(closes, 20);
  const ema50  = ema(closes, 50);
  const rsiArr = calcRSI(closes, 14);

  const ema20Now = ema20[ema20.length - 1];
  const ema50Now = ema50[ema50.length - 1];
  const rsiNow   = rsiArr[rsiArr.length - 1];

  let score = 0;
  if (ema20Now > ema50Now) score += 1;
  else score -= 1;

  if (rsiNow > 60) score += 0.5;
  else if (rsiNow > 50) score += 0.3;
  else if (rsiNow < 40) score -= 0.5;
  else if (rsiNow < 50) score -= 0.3;

  // RSI divergence: price and momentum moving in opposite directions over 3 bars
  // Bearish div: price higher but RSI lower → fade the rally
  // Bullish div: price lower but RSI higher → fade the sell-off
  let divScore = 0;
  let divNote  = '';
  if (rsiArr.length >= 4 && closes.length >= 4) {
    const n   = closes.length;
    const m   = rsiArr.length;
    const pChg  = closes[n-1] - closes[n-4];
    const rChg  = rsiArr[m-1] - rsiArr[m-4];
    if (pChg > 0 && rChg < -4)      { divScore = -0.5; divNote = ' · Bearish RSI div'; }
    else if (pChg < 0 && rChg > 4)  { divScore =  0.5; divNote = ' · Bullish RSI div'; }
  }

  // 4h trend: 30m bars, 8-bar EMA (4h) vs 20-bar EMA (10h)
  // When 4h opposes the daily trend, discount conviction
  let htfScore = 0;
  let htfNote  = '';
  const bars30m = filterTradingDays(S.ohlc30m?.[S.currentPair.symbol]?.values);
  if (bars30m?.length >= 24) {
    const c30 = bars30m.slice(0, 24).map(b => parseFloat(b.close)).reverse();
    const e8  = ema(c30, 8);
    const e20 = ema(c30, 20);
    const htfBull    = e8[e8.length-1] > e20[e20.length-1];
    const dailyBull  = ema20Now > ema50Now;
    if (htfBull === dailyBull) { htfScore =  0.5; htfNote = ' · 4h aligned'; }
    else                       { htfScore = -0.5; htfNote = ' · 4h opposed'; }
  }

  score = Math.max(-2, Math.min(2, Math.round(score + divScore + htfScore)));

  return {
    tier: 'T7', name: 'Momentum', max: 2, score,
    val: `RSI ${rsiNow.toFixed(0)} | EMA${ema20Now > ema50Now ? '↑' : '↓'}`,
    reading: (ema20Now > ema50Now && rsiNow > 50 ? 'Trend up, momentum bullish' :
              ema20Now < ema50Now && rsiNow < 50 ? 'Trend down, momentum bearish' : 'Mixed signals')
             + divNote + htfNote,
    source: 'EMA(20/50), RSI(14), 4h',
    isMonthly: false
  };
}

function computeT8() {
  const cfg        = S._caps?.kalman5m ?? KALMAN5M_DEFAULTS;
  const lookback   = Math.max(10, Math.round(cfg.lookback      ?? KALMAN5M_DEFAULTS.lookback));
  const pNoise     = cfg.processNoise  ?? KALMAN5M_DEFAULTS.processNoise;
  const oNoise     = cfg.observNoise   ?? KALMAN5M_DEFAULTS.observNoise;
  const threshold  = cfg.threshold     ?? KALMAN5M_DEFAULTS.threshold;
  const longScore  = cfg.longScore     ?? KALMAN5M_DEFAULTS.longScore;
  const shortScore = cfg.shortScore    ?? KALMAN5M_DEFAULTS.shortScore;
  const maxPts     = Math.max(longScore, shortScore);

  const bars = S.ohlc5m?.[S.currentPair.symbol]?.values;
  if (!bars || bars.length < 6) return tierUnavailable('T8', '5m Kalman Bias', 'No 5m data', maxPts);

  const win    = bars.slice(1, lookback + 2);
  const closes = win.map(b => parseFloat(b.close ?? b.mid?.c ?? b.c)).filter(v => !isNaN(v));
  if (closes.length < 5) return tierUnavailable('T8', '5m Kalman Bias', 'Insufficient 5m bars', maxPts);

  const n        = closes.length;
  const mean     = closes.reduce((a, b) => a + b, 0) / n;
  const variance = closes.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  if (variance === 0) return tierUnavailable('T8', '5m Kalman Bias', 'No 5m variance', maxPts);

  const Q = pNoise * variance;
  const R = oNoise * variance;

  // closes is newest-first; reverse to process oldest→newest
  const chron = [...closes].reverse();
  let x = chron[0];
  let P = R;
  for (let i = 1; i < chron.length - 1; i++) {
    const Pp = P + Q;
    const K  = Pp / (Pp + R);
    x = x + K * (chron[i] - x);
    P = (1 - K) * Pp;
  }
  // Predict one step forward without incorporating the most recent close
  P = P + Q;

  const sigma   = Math.sqrt(P + R);
  const normDev = sigma > 0 ? (chron[chron.length - 1] - x) / sigma : 0;

  let score = 0;
  if      (normDev < -threshold) score =  longScore;
  else if (normDev >  threshold) score = -shortScore;

  const reading = normDev < -threshold
    ? `${Math.abs(normDev).toFixed(2)}σ below Kalman — mean-reversion long bias`
    : normDev > threshold
    ? `${normDev.toFixed(2)}σ above Kalman — mean-reversion short bias`
    : `Within ±${threshold}σ Kalman band — no intraday bias`;

  return {
    tier: 'T8',
    name: '5m Kalman Bias',
    max:  maxPts,
    score,
    val:  `Δ=${normDev >= 0 ? '+' : ''}${normDev.toFixed(2)}σ (${n}×5m)`,
    reading,
    source: `5m Kalman Filter · ${lookback}-bar window`,
    isMonthly: false,
  };
}

// ── Bayesian Probability Score ────────────────────────────────────────────────
// Treats each tier as independent evidence updating a 50/50 prior on long vs short.
// Likelihood ratio per tier: LR = 1 + (|score|/max) × 0.5  → range [1.0, 1.5]
// Returns { prob, pct, dir, label } where prob ∈ [0,1], pct = Math.round(prob*100).
export function computeBayesianScore(tiers) {
  if (!tiers || !tiers.length) return null;
  // T1 (rates) and T3 (DXY) are structurally correlated: rising US rates → USD strengthens.
  // When both fire in the same direction we discount T3 to avoid double-counting.
  const t1 = tiers.find(t => t.tier === 'T1');
  const t3 = tiers.find(t => t.tier === 'T3');
  const t1t3Agree = t1 && t3 && !t1.na && !t3.na && t1.score !== 0 && t3.score !== 0
    && Math.sign(t1.score) === Math.sign(t3.score);

  let logOdds = 0;
  for (const t of tiers) {
    if (t.na || t.score === 0) continue;
    const strength = Math.min(Math.abs(t.score) / Math.max(t.max, 1), 1);
    const corrDiscount = (t.tier === 'T3' && t1t3Agree) ? 0.5 : 1.0;
    const lr = 1 + strength * 0.5 * corrDiscount;
    logOdds += t.score > 0 ? Math.log(lr) : -Math.log(lr);
  }
  const prob = 1 / (1 + Math.exp(-logOdds));
  const pct  = Math.round(prob * 100);
  const dir  = prob > 0.55 ? 'long' : prob < 0.45 ? 'short' : 'neutral';
  const label = `${pct}% ${dir === 'long' ? 'Long Continuation' : dir === 'short' ? 'Short Continuation' : 'Mixed Regime'}`;
  return { prob, pct, dir, label };
}

// ── 5m Kalman Deviation Helper ────────────────────────────────────────────────
// Same computation as T8 but callable with an explicit symbol for use in alerts.
// Returns the normalised deviation (σ units) or null if data is unavailable.
export function compute5mKalmanDev(sym) {
  const symbol = sym ?? S.currentPair?.symbol;
  const cfg      = S._caps?.kalman5m ?? KALMAN5M_DEFAULTS;
  const lookback = Math.max(10, Math.round(cfg.lookback      ?? KALMAN5M_DEFAULTS.lookback));
  const pNoise   = cfg.processNoise  ?? KALMAN5M_DEFAULTS.processNoise;
  const oNoise   = cfg.observNoise   ?? KALMAN5M_DEFAULTS.observNoise;

  const bars = S.ohlc5m?.[symbol]?.values;
  if (!bars || bars.length < 6) return null;

  const win    = bars.slice(1, lookback + 2);
  const closes = win.map(b => parseFloat(b.close ?? b.mid?.c ?? b.c)).filter(v => !isNaN(v));
  if (closes.length < 5) return null;

  const n        = closes.length;
  const mean     = closes.reduce((a, b) => a + b, 0) / n;
  const variance = closes.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  if (variance === 0) return null;

  const Q = pNoise * variance;
  const R = oNoise * variance;

  const chron = [...closes].reverse();
  let x = chron[0];
  let P = R;
  for (let i = 1; i < chron.length - 1; i++) {
    const Pp = P + Q;
    const K  = Pp / (Pp + R);
    x = x + K * (chron[i] - x);
    P = (1 - K) * Pp;
  }
  P = P + Q;
  const sigma = Math.sqrt(P + R);
  return sigma > 0 ? (chron[chron.length - 1] - x) / sigma : null;
}

function tierUnavailable(tier, name, val, max) {
  return { tier, name, max, score: 0, val: '—', reading: 'Data unavailable', source: '—', isMonthly: false, na: true };
}

// ── USD Strength Composite ────────────────────────────────────────────────────
// Built from the 4 USD pairs in S.ohlcData (whatever is currently loaded).
// Each pair's 5-day return is z-scored against its own 20-period distribution,
// then sign-adjusted so that a positive contribution always means "USD stronger".
// Falls back gracefully when fewer than 2 pairs are available.
export function computeUSDStrength() {
  const USD_PAIRS = [
    { sym: 'EUR/USD', sign: -1 },  // EURUSD down = USD up
    { sym: 'GBP/USD', sign: -1 },
    { sym: 'AUD/USD', sign: -1 },
    { sym: 'USD/JPY', sign: +1 },  // USDJPY up = USD up
  ];

  const LOOKBACK  = 5;  // 5-day return window
  const NORM_WIN  = 20; // z-score distribution window

  const contributions = [];

  for (const { sym, sign } of USD_PAIRS) {
    const bars = filterTradingDays(S.ohlcData[sym]?.values);
    if (!bars || bars.length < NORM_WIN + LOOKBACK) continue;

    const barsChron = [...bars].reverse();

    // Rolling LOOKBACK-day sign-adjusted returns
    const rets = [];
    for (let i = LOOKBACK; i < barsChron.length; i++) {
      const ret = (parseFloat(barsChron[i].close) / parseFloat(barsChron[i - LOOKBACK].close) - 1) * sign;
      rets.push(ret);
    }

    // Z-score latest return within its own history
    const win    = rets.slice(-NORM_WIN);
    const mean   = win.reduce((a, b) => a + b, 0) / win.length;
    const std    = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length);
    const latest = rets[rets.length - 1];
    const z      = std > 0 ? (latest - mean) / std : 0;

    contributions.push({ sym, sign, z, ret: latest });
  }

  if (contributions.length < 2) return null; // need at least 2 pairs for a composite

  const compositeZ = contributions.reduce((s, c) => s + c.z, 0) / contributions.length;
  const clamped    = Math.max(-3, Math.min(3, compositeZ));

  let trend, strength;
  if      (clamped >  1.0) { trend = 'strengthening'; strength = clamped > 2.0 ? 'strong' : 'moderate'; }
  else if (clamped < -1.0) { trend = 'weakening';     strength = clamped < -2.0 ? 'strong' : 'moderate'; }
  else                      { trend = 'stable';         strength = 'weak'; }

  const arrow = trend === 'strengthening' ? '↑' : trend === 'weakening' ? '↓' : '→';

  // Cross-validate with FRED DXY (weekly — lower frequency, secondary signal)
  const fredDxy     = S.fredData?.dxy?.value;
  const fredDxyPrev = S.fredData?.dxy?.prev;
  const fredDxyChg  = fredDxy && fredDxyPrev ? ((fredDxy / fredDxyPrev) - 1) * 100 : null;
  // If FRED DXY contradicts the composite, note divergence
  let fredConflict = false;
  if (fredDxyChg != null && Math.abs(clamped) > 1.0) {
    const fredBull = fredDxyChg > 0;
    const compBull = trend === 'strengthening';
    fredConflict   = fredBull !== compBull;
  }

  return {
    score:        clamped,
    trend,
    strength,
    pairsUsed:    contributions.length,
    contributions,
    fredDxy:      fredDxy ? fredDxy.toFixed(2) : null,
    fredDxyChg:   fredDxyChg ? fredDxyChg.toFixed(2) : null,
    fredConflict,
    label: `${arrow} USD ${strength !== 'weak' ? strength + ' ' : ''}${trend} (${contributions.length}/4 pairs)`,
  };
}

// Dollar Regime — wraps computeUSDStrength with FRED DXY level context.
// This is the public function stored in S.dollarRegime.
export function computeDollarRegime() {
  const usd = S.usdStrength || computeUSDStrength();
  if (!usd) {
    // Fallback: FRED DXY only (no price bar data)
    const dxy     = S.fredData?.dxy?.value;
    const dxyPrev = S.fredData?.dxy?.prev;
    if (dxy == null) return null;
    const chg = dxyPrev ? ((dxy / dxyPrev) - 1) * 100 : 0;
    const trend = chg > 0.3 ? 'strengthening' : chg < -0.3 ? 'weakening' : 'stable';
    const arrow = trend === 'strengthening' ? '↑' : trend === 'weakening' ? '↓' : '→';
    return {
      trend, strength: 'weak', dxy: dxy.toFixed(2), change: chg.toFixed(2),
      label: `${arrow} USD ${trend} (FRED only — load pairs for composite)`,
      fredOnly: true,
    };
  }
  return {
    trend:    usd.trend,
    strength: usd.strength,
    score:    usd.score,
    dxy:      usd.fredDxy,
    change:   usd.fredDxyChg,
    label:    usd.label,
    pairsUsed:usd.pairsUsed,
    fredConflict: usd.fredConflict,
  };
}

// ── Cross-Pair Conflict Detection ─────────────────────────────────────────────
// Checks whether the current pair's signal direction agrees with the composite
// USD strength index. Returns null if no clear conflict/confirmation exists.
export function detectCrossConflict(usdStrength, signalBias, pair) {
  // Cross pairs (EUR/GBP, GBP/JPY) are not USD-driven — USD strength is irrelevant.
  if (pair?.isPairCross) return null;
  if (!usdStrength || Math.abs(usdStrength.score) < 1.0) return null;
  if (!signalBias || signalBias === 'NEUTRAL') return null;

  // Does the signal imply USD bullish or bearish?
  let signalImpliesUsdBull;
  if (pair.isGold) {
    signalImpliesUsdBull = signalBias === 'SHORT'; // gold short = bearish gold = USD bullish
  } else if (pair.isUsdBase) {
    signalImpliesUsdBull = signalBias === 'LONG';  // USDJPY long = USD bullish
  } else {
    signalImpliesUsdBull = signalBias === 'SHORT'; // EURUSD/GBPUSD/AUDUSD short = USD bullish
  }

  const usdBull = usdStrength.trend === 'strengthening';
  const usdBear = usdStrength.trend === 'weakening';

  const confirms = (signalImpliesUsdBull && usdBull) || (!signalImpliesUsdBull && usdBear);
  const isStrong = usdStrength.strength === 'strong';

  if (confirms) {
    return {
      type:    'confirmed',
      severity: usdStrength.strength,
      sizeMult: isStrong ? 1.15 : 1.05,
      message: `Cross-pair USD index confirms — ${usdStrength.label}`,
    };
  } else {
    return {
      type:    'conflict',
      severity: usdStrength.strength,
      sizeMult: isStrong ? 0.65 : 0.80,
      message: `Cross-pair USD conflict — index says ${usdStrength.label} but signal implies USD ${signalImpliesUsdBull ? 'bullish' : 'bearish'}`,
    };
  }
}

// ── Macro Quadrant Regime ─────────────────────────────────────────────────────
// Classifies the macro environment into one of four quadrants using available
// FRED data as growth and inflation proxies. No ISM or CPI required.
//
// Growth proxies:  yield curve slope, VIX level+trend, HY spread level+trend, NFCI
// Inflation proxies: BEI level+trend, TIPS real yield, 2Y yield level
//
// Returns { regime, growthBull, inflationBull, growthScore, inflationScore,
//           growthFactors, inflationFactors, strategyType, confidence }
export function computeMacroRegime() {
  const f = S.fredData;
  if (!f) return null;

  const vix   = f.vix?.value   ?? null;
  const vixP  = f.vix?.prev    ?? null;
  const hy    = f.hy?.value    ?? null;     // raw fraction — multiply by 100 for bps
  const hyP   = f.hy?.prev     ?? null;
  const nfci  = f.nfci?.value  ?? null;
  const bei   = f.bei?.value   ?? null;     // 10Y breakeven inflation %
  const beiP  = f.bei?.prev    ?? null;
  const tips  = f.tips?.value  ?? null;    // 10Y real yield %
  const tips5 = f.tips5?.value ?? null;    // 5Y real yield — more reactive to near-term policy
  const us2y  = f.us2y?.value  ?? null;
  const us5y  = f.us5y?.value  ?? null;
  const us10y = f.us10y?.value ?? null;
  const curve = (us10y != null && us2y != null) ? us10y - us2y : null;
  // Butterfly: 2×5Y − 2Y − 10Y. Negative = belly cheapening = flight-to-safety = risk-off.
  const butterfly  = (us5y != null && us2y != null && us10y != null) ? 2 * us5y - us2y - us10y : null;
  // Front slope: 5Y − 2Y. Inversion here signals market pricing Fed cuts = policy pivot.
  const frontSlope = (us5y != null && us2y != null) ? us5y - us2y : null;

  let growthScore = 0, inflationScore = 0;
  const growthFactors = [], inflationFactors = [];

  // Growth: yield curve slope
  if (curve != null) {
    if      (curve >  1.0) { growthScore += 2; growthFactors.push('Curve steep'); }
    else if (curve >  0.2) { growthScore += 1; growthFactors.push('Curve positive'); }
    else if (curve < -0.5) { growthScore -= 2; growthFactors.push('Curve inverted'); }
    else if (curve <  0.0) { growthScore -= 1; growthFactors.push('Curve flat/inv'); }
  }

  // Growth: VIX level (low = risk-on = growth positive)
  if (vix != null) {
    if      (vix < 15) { growthScore += 2; growthFactors.push(`VIX ${vix.toFixed(0)} low`); }
    else if (vix < 20) { growthScore += 1; growthFactors.push(`VIX ${vix.toFixed(0)} firm`); }
    else if (vix > 30) { growthScore -= 2; growthFactors.push(`VIX ${vix.toFixed(0)} high`); }
    else if (vix > 25) { growthScore -= 1; growthFactors.push(`VIX ${vix.toFixed(0)} elev.`); }
    // VIX trend
    if (vixP != null) {
      if      (vix < vixP * 0.92) { growthScore += 1; growthFactors.push('VIX falling'); }
      else if (vix > vixP * 1.08) { growthScore -= 1; growthFactors.push('VIX rising'); }
    }
  }

  // Growth: HY spread (tight = credit supportive = growth positive)
  if (hy != null) {
    const hyBps = hy * 100;
    if      (hyBps < 300) { growthScore += 2; growthFactors.push(`HY ${hyBps.toFixed(0)}bps tight`); }
    else if (hyBps < 400) { growthScore += 1; growthFactors.push(`HY ${hyBps.toFixed(0)}bps OK`); }
    else if (hyBps > 600) { growthScore -= 2; growthFactors.push(`HY ${hyBps.toFixed(0)}bps wide`); }
    else if (hyBps > 500) { growthScore -= 1; growthFactors.push(`HY ${hyBps.toFixed(0)}bps stress`); }
    // HY trend
    if (hyP != null) {
      const hyBpsP = hyP * 100;
      if      (hyBps < hyBpsP * 0.95) { growthScore += 1; growthFactors.push('HY tightening'); }
      else if (hyBps > hyBpsP * 1.05) { growthScore -= 1; growthFactors.push('HY widening'); }
    }
  }

  // Growth: NFCI (below 0 = accommodative financial conditions)
  if (nfci != null) {
    if      (nfci < -0.5) { growthScore += 1; growthFactors.push('NFCI accom.'); }
    else if (nfci <  0.0) { growthScore += 0; } // neutral — no factor
    else if (nfci >  0.5) { growthScore -= 2; growthFactors.push('NFCI tight'); }
    else if (nfci >  0.0) { growthScore -= 1; growthFactors.push('NFCI firm'); }
  }

  // Growth: yield curve butterfly (2×5Y − 2Y − 10Y)
  // Negative belly = safe-haven demand crushing 5Y = risk-off / stress signal.
  // Positive belly = normal liquidity, no flight-to-safety distortion.
  if (butterfly != null) {
    if      (butterfly < -0.30) { growthScore -= 2; growthFactors.push(`Butterfly ${butterfly.toFixed(2)}% inv.`); }
    else if (butterfly < -0.10) { growthScore -= 1; growthFactors.push(`Butterfly ${butterfly.toFixed(2)}%`); }
    else if (butterfly >  0.10) { growthScore += 1; growthFactors.push(`Butterfly ${butterfly.toFixed(2)}% pos.`); }
  }

  // Growth: front slope (5Y − 2Y)
  // Inverted front = market pricing imminent cuts = policy restrictive now; easing signals ahead.
  // Steep front = policy has room or pivot expected = modest growth positive.
  if (frontSlope != null) {
    if      (frontSlope < -0.30) { growthScore -= 1; growthFactors.push(`Front ${frontSlope.toFixed(2)}% inv.`); }
    else if (frontSlope >  0.50) { growthScore += 1; growthFactors.push(`Front ${frontSlope.toFixed(2)}% steep`); }
  }

  // Inflation: BEI (10Y breakeven inflation expectations)
  if (bei != null) {
    if      (bei > 3.0) { inflationScore += 3; inflationFactors.push(`BEI ${bei.toFixed(2)}% high`); }
    else if (bei > 2.5) { inflationScore += 2; inflationFactors.push(`BEI ${bei.toFixed(2)}% elev.`); }
    else if (bei > 2.0) { inflationScore += 1; inflationFactors.push(`BEI ${bei.toFixed(2)}%`); }
    else                { inflationScore -= 1; inflationFactors.push(`BEI ${bei.toFixed(2)}% low`); }
    // BEI trend
    if (beiP != null) {
      if      (bei > beiP + 0.05) { inflationScore += 1; inflationFactors.push('BEI rising'); }
      else if (bei < beiP - 0.05) { inflationScore -= 1; inflationFactors.push('BEI falling'); }
    }
  }

  // Inflation: 10Y TIPS real yield
  if (tips != null) {
    if      (tips < 0.0) { inflationScore += 2; inflationFactors.push(`10Y TIPS ${tips.toFixed(2)}% neg.`); }
    else if (tips < 0.5) { inflationScore += 1; inflationFactors.push(`10Y TIPS ${tips.toFixed(2)}% low`); }
    else if (tips > 2.0) { inflationScore -= 1; inflationFactors.push(`10Y TIPS ${tips.toFixed(2)}% rest.`); }
  }

  // Inflation: 5Y TIPS real yield — more reactive to near-term inflation expectations than 10Y.
  // Equity multiples price against 5Y real rates; negative = financial conditions still easy.
  if (tips5 != null) {
    if      (tips5 < 0.0) { inflationScore += 2; inflationFactors.push(`5Y TIPS ${tips5.toFixed(2)}% neg.`); }
    else if (tips5 < 1.0) { inflationScore += 1; inflationFactors.push(`5Y TIPS ${tips5.toFixed(2)}% low`); }
    else if (tips5 > 2.5) { inflationScore -= 1; inflationFactors.push(`5Y TIPS ${tips5.toFixed(2)}% rest.`); }
  }

  // Inflation: 2Y yield level (encodes how much Fed has tightened for inflation)
  if (us2y != null) {
    if      (us2y > 4.5) { inflationScore += 1; inflationFactors.push(`2Y ${us2y.toFixed(2)}% high`); }
    else if (us2y < 2.0) { inflationScore -= 1; inflationFactors.push(`2Y ${us2y.toFixed(2)}% low`); }
  }

  const growthBull    = growthScore > 0;
  const inflationBull = inflationScore > 0;

  let regime, color, strategyType, strategyDetail;
  if      ( growthBull && !inflationBull) {
    regime = 'GOLDILOCKS'; color = 'green';
    strategyType   = 'Trend + Momentum';
    strategyDetail = 'Risk-on. Equities & carry trades preferred. Trend-following has edge.';
  } else if ( growthBull &&  inflationBull) {
    regime = 'REFLATION';  color = 'amber';
    strategyType   = 'Value + Commodities';
    strategyDetail = 'Expansion with inflation building. Rotate to real assets, value over growth.';
  } else if (!growthBull &&  inflationBull) {
    regime = 'STAGFLATION'; color = 'red';
    strategyType   = 'Defensives + Gold';
    strategyDetail = 'Worst macro backdrop. Reduce equity beta. Gold, energy, cash.';
  } else {
    regime = 'DEFLATION';  color = 'blue';
    strategyType   = 'Duration + Quality';
    strategyDetail = 'Risk-off. Flight to safety. Bonds, USD, quality over junk.';
  }

  // Confidence: how many indicators fed each axis
  const gFactors = growthFactors.length, iFactors = inflationFactors.length;
  const confidence = (gFactors >= 3 && iFactors >= 2) ? 'HIGH' :
                     (gFactors >= 2 || iFactors >= 2)  ? 'MEDIUM' : 'LOW';

  return {
    regime, color, growthBull, inflationBull,
    growthScore, inflationScore,
    growthFactors, inflationFactors,
    strategyType, strategyDetail, confidence,
    butterfly, frontSlope, us5y, tips5,
  };
}
