import { S } from './state.js';
import { getPipSize, fred, filterTradingDays } from './utils.js';

// GARCH(1,1) + EMA-ATR vol engine
// σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
// Fixed FX params: ω=1e-7, α=0.10, β=0.85 (α+β=0.95, high persistence)
export function calculateVolRegime() {
  const bars  = filterTradingDays(S.ohlcData[S.currentPair.symbol]?.values);
  const NULL_VOL = { regime: 'NORMAL', percentile: 50, atr: 0, atrPips: 0,
    sizeMult: 1, stopMult: 1.0, stopDist: 0, tpMult: 1.5,
    remainingRange: 0, remainingPips: 0, dailyCap: 0, dailyCapPips: 0,
    usedRange: 0, usedRangePips: 0, usedPct: 0,
    garch: null, ci68: null, ci95: null, volCluster: false,
    volImpulse: null, volBias: 'stable', volImpulsePct: 0 };
  if (!bars || bars.length < 20) return NULL_VOL;

  const sym   = S.currentPair.symbol;
  const pipSz = getPipSize(sym);

  const barsChron = [...bars].reverse();
  const trueRanges = [];
  const logReturns = [];

  for (let i = 1; i < barsChron.length; i++) {
    const h   = parseFloat(barsChron[i].high);
    const l   = parseFloat(barsChron[i].low);
    const c   = parseFloat(barsChron[i].close);
    const pc  = parseFloat(barsChron[i-1].close);
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    if (pc > 0) logReturns.push(Math.log(c / pc));
  }

  if (!trueRanges.length) return NULL_VOL;

  // Vol Impulse: last 5 bars vs prior 5 bars — detects accelerating/decelerating vol
  let volImpulse = null, volBias = 'stable', volImpulsePct = 0;
  if (trueRanges.length >= 10) {
    const last5      = trueRanges.slice(-5);
    const prior5     = trueRanges.slice(-10, -5);
    const last5Avg   = last5.reduce((a, b) => a + b, 0) / last5.length;
    const prior5Avg  = prior5.reduce((a, b) => a + b, 0) / prior5.length;
    volImpulsePct    = prior5Avg > 0 ? ((last5Avg / prior5Avg) - 1) * 100 : 0;
    volBias          = volImpulsePct > 15 ? 'expanding' : volImpulsePct < -15 ? 'contracting' : 'stable';
    volImpulse       = { last5Avg, prior5Avg, pct: volImpulsePct, bias: volBias };
  }

  const ATR_ALPHA = 0.15;
  let emaATR = trueRanges[0];
  for (let i = 1; i < trueRanges.length; i++) {
    emaATR = ATR_ALPHA * trueRanges[i] + (1 - ATR_ALPHA) * emaATR;
  }

  const G_OMEGA = S.currentPair?.isEquity ? 2e-6 : 1e-7;  // NQ has higher base variance
  const G_ALPHA = 0.10;
  const G_BETA  = 0.85;

  let garchVar = null;

  if (logReturns.length >= 20) {
    const seed20  = logReturns.slice(0, 20);
    const mean20  = seed20.reduce((a, b) => a + b, 0) / 20;
    let   sigma2  = seed20.reduce((a, r) => a + (r - mean20) ** 2, 0) / 20;

    for (let i = 1; i < logReturns.length; i++) {
      const eps2 = logReturns[i - 1] ** 2;
      sigma2 = G_OMEGA + G_ALPHA * eps2 + G_BETA * sigma2;
    }

    const garchSigma = Math.sqrt(sigma2);
    const latestPrice = parseFloat(barsChron[barsChron.length - 1]?.close || 1);
    const SQRT2_OVER_PI = Math.sqrt(2 / Math.PI);

    const garchRange     = 2 * garchSigma * latestPrice * SQRT2_OVER_PI;
    const garchRangePips = garchRange / pipSz;

    const ci68Range = 2 * 1.00 * garchSigma * latestPrice;
    const ci95Range = 2 * 1.96 * garchSigma * latestPrice;
    const ci68Pips  = ci68Range / pipSz;
    const ci95Pips  = ci95Range / pipSz;

    const garchVsEma    = garchRange / emaATR;
    const volCluster    = garchVsEma > 1.15 ? 'EXPANDING' : garchVsEma < 0.85 ? 'CONTRACTING' : 'STABLE';
    const volClusterMsg = garchVsEma > 1.15
      ? 'GARCH > ATR — vol clustering up, recent shock elevating forecast'
      : garchVsEma < 0.85
      ? 'GARCH < ATR — vol mean-reverting, conditions calming'
      : 'GARCH ≈ ATR — vol stable, no clustering signal';

    garchVar = {
      range: garchRange, pips: garchRangePips,
      ci68Pips, ci95Pips, ci68Range, ci95Range,
      sigma: garchSigma, sigmaAnnual: garchSigma * Math.sqrt(252) * 100,
      vsEma: garchVsEma.toFixed(2),
      cluster: volCluster, clusterMsg: volClusterMsg,
      primaryForecast: garchRange
    };
  }

  const histTRs    = trueRanges.slice(-100);
  const sorted     = [...histTRs].sort((a, b) => a - b);
  const rank       = sorted.findIndex(v => v >= emaATR);
  const percentile = (Math.max(0, rank) / sorted.length) * 100;

  let regime, sizeMult, stopMult, tpMult;
  if (percentile <= 25)      { regime = 'LOW';    sizeMult = 1.0; stopMult = 0.75; tpMult = 1.5; }
  else if (percentile >= 75) { regime = 'HIGH';   sizeMult = 0.6; stopMult = 1.5;  tpMult = 2.0; }
  else                       { regime = 'NORMAL'; sizeMult = 1.0; stopMult = 1.0;  tpMult = 1.5; }

  // Refine sizeMult continuously using GARCH vs ATR ratio.
  // garchVsEma > 1 = vol expanding above ATR baseline → reduce size.
  // garchVsEma < 1 = vol calming below ATR baseline → allow slightly more.
  // Capped at ±20% adjustment so regime buckets remain the primary anchor.
  if (garchVar && !isNaN(garchVsEma) && garchVsEma > 0) {
    const garchAdj = Math.max(0.8, Math.min(1.2, 1 / garchVsEma));
    sizeMult = Math.max(0.4, Math.min(1.5, sizeMult * garchAdj));
  }

  const todayBar  = bars[0];
  const todayHigh = parseFloat(todayBar.high);
  const todayLow  = parseFloat(todayBar.low);
  const usedRange = todayHigh - todayLow;

  const dailyCap = garchVar ? garchVar.ci68Range : emaATR;
  const remaining = Math.max(0, dailyCap - usedRange);
  const usedPct   = Math.min(100, Math.round((usedRange / dailyCap) * 100));
  const stopDist  = (garchVar ? garchVar.range : emaATR) * stopMult;

  return {
    regime,
    percentile:      Math.round(percentile),
    atr:             emaATR,
    atrPips:         emaATR / pipSz,
    garch:           garchVar,
    ci68Pips:        garchVar?.ci68Pips  ?? null,
    ci95Pips:        garchVar?.ci95Pips  ?? null,
    sizeMult,
    stopMult,
    stopDist,
    tpMult,
    dailyCap,
    dailyCapPips:    dailyCap / pipSz,
    usedRange,
    usedRangePips:   usedRange / pipSz,
    remainingRange:  remaining,
    remainingPips:   remaining / pipSz,
    usedPct,
    todayHigh,
    todayLow,
    volImpulse,
    volBias,
    volImpulsePct,
  };
}

export function calculateOTCForecast(bars, volRegime, macroScore, sym) {
  if (!bars || bars.length < 30) return null;

  const pipSz     = getPipSize(sym);
  const barsChron = [...bars].reverse();                    // newest-first → chronological
  const completed = barsChron.slice(0, barsChron.length - 1); // drop today's forming bar

  const history = completed.map(bar => {
    const o = parseFloat(bar.open), c = parseFloat(bar.close);
    const h = parseFloat(bar.high), l = parseFloat(bar.low);
    const range = h - l;
    return {
      otcPct:     (c - o) / o * 100,
      rangePct:   range / o * 100,
      otcToRange: range > 0 ? Math.abs(c - o) / range : 0,
    };
  });

  const currentRegime = volRegime.regime;
  const sortedRange   = [...history.map(b => b.rangePct)].sort((a, b) => a - b);
  const rp25 = sortedRange[Math.floor(sortedRange.length * 0.25)];
  const rp75 = sortedRange[Math.floor(sortedRange.length * 0.75)];

  const regimeMatched = history.filter(b => {
    if (currentRegime === 'LOW')  return b.rangePct <= rp25;
    if (currentRegime === 'HIGH') return b.rangePct >= rp75;
    return b.rangePct > rp25 && b.rangePct < rp75;
  });
  const sample = regimeMatched.length >= 15 ? regimeMatched : history;

  const otcVals = sample.map(b => b.otcPct).sort((a, b) => a - b);
  const pctAt   = (arr, p) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(arr.length * p / 100)))];

  const median     = pctAt(otcVals, 50);
  const p25val     = pctAt(otcVals, 25);
  const p75val     = pctAt(otcVals, 75);
  const p10val     = pctAt(otcVals, 10);
  const p90val     = pctAt(otcVals, 90);
  const meanAbsOtc = sample.reduce((s, b) => s + Math.abs(b.otcPct), 0) / sample.length;
  const bullFrac   = sample.filter(b => b.otcPct > 0).length / sample.length;
  const meanDir    = sample.reduce((s, b) => s + b.otcToRange, 0) / sample.length;

  const latestClose = parseFloat(barsChron[barsChron.length - 1].close);
  const pip = v => Math.abs(v / 100 * latestClose) / pipSz;

  let sessionChar, sessionCharDetail;
  if (meanDir < 0.30) {
    sessionChar       = 'CHOPPY';
    sessionCharDetail = 'Sessions in this regime historically close near open — mean-reverting. Wide stops rarely filled at TP.';
  } else if (meanDir < 0.55) {
    sessionChar       = 'MIXED';
    sessionCharDetail = 'Sessions show moderate directionality — some trend but frequent intraday reversals.';
  } else {
    sessionChar       = 'TRENDING';
    sessionCharDetail = 'Sessions in this regime historically make clean directional moves — trend-following has edge.';
  }

  const macroBull = macroScore > 2, macroBear = macroScore < -2;
  const coherence = (macroBull && bullFrac > 0.55) || (macroBear && bullFrac < 0.45)
    ? 'CONFIRMING'
    : (!macroBull && !macroBear) ? 'NEUTRAL' : 'DIVERGING';

  return {
    median, p25: p25val, p75: p75val, p10: p10val, p90: p90val, meanAbsOtc,
    bullFrac, meanDirectionality: meanDir,
    medianPips:  pip(median),
    p25Pips:     pip(p25val),
    p75Pips:     pip(p75val),
    meanAbsPips: pip(meanAbsOtc),
    sessionChar, sessionCharDetail, coherence,
    sampleSize: sample.length,
    regimeMatched: regimeMatched.length >= 15,
    currentRegime,
  };
}

export function calcPositionSize(score, volRegime, transitionRisk, regimeConfidenceResult) {
  const abs = Math.abs(score);
  let baseSize;
  if (abs >= 13) baseSize = 100;
  else if (abs >= 9) baseSize = 75;
  else if (abs >= 5) baseSize = 50;
  else if (abs >= 4) baseSize = 25;
  else baseSize = 10;

  // Vol regime provides the base size multiplier (LOW=1.0, HIGH=0.6)
  let finalSize = Math.round(baseSize * volRegime.sizeMult);

  // NQ earnings week: manual flag cuts size 40% — mirrors HIGH event risk multiplier
  if (S.nqEarningsWeek && S.currentPair?.isEquity) {
    finalSize = Math.round(finalSize * 0.6);
  }

  // Regime confidence provides a continuous multiplier (0.25–1.0).
  // This replaces the old binary transitionRisk.riskScore check — the continuous
  // scale captures the full spectrum from "regime clearly identified" to
  // "regime in flux, be defensive".
  if (regimeConfidenceResult?.sizingMult != null) {
    finalSize = Math.round(finalSize * regimeConfidenceResult.sizingMult);
  } else if (transitionRisk && transitionRisk.riskScore > 70) {
    // Legacy fallback when regime confidence engine not yet available
    finalSize = Math.round(finalSize * 0.8);
  }

  return Math.max(10, finalSize);
}

export function calculateRiskSentiment() {
  const fredData = S.fredData;
  const aud = fredData.aud_usd?.value;
  const audPrev = fredData.aud_usd?.prev;
  const jpy = fredData.usd_jpy?.value;
  const jpyPrev = fredData.usd_jpy?.prev;

  let audjpyTrend = 0;
  let audjpyText = 'No data';
  if (aud && audPrev && jpy && jpyPrev) {
    const now = aud * jpy;
    const prev = audPrev * jpyPrev;
    audjpyTrend = ((now / prev) - 1) * 100;
    audjpyText = audjpyTrend > 0.2 ? 'Risk-on (rising)' : audjpyTrend < -0.2 ? 'Risk-off (falling)' : 'Neutral';
  }

  const hy = fredData.hy?.value * 100;
  const hyPrev = fredData.hy?.prev * 100;
  let hyChange = 0;
  let hyText = 'No data';
  if (hy && hyPrev) {
    hyChange = hy - hyPrev;
    hyText = hyChange > 5 ? 'Widening (risk-off)' : hyChange < -5 ? 'Tightening (risk-on)' : 'Stable';
  }

  const vix = fredData.vix?.value;
  const vixPrev = fredData.vix?.prev;
  let vixChange = 0;
  let vixText = 'No data';
  if (vix && vixPrev) {
    vixChange = vix - vixPrev;
    vixText = vixChange > 1 ? 'Rising (fear up)' : vixChange < -1 ? 'Falling (fear down)' : 'Stable';
  }

  const onSignals = (audjpyTrend > 0.2 ? 1 : 0) + (hyChange < -5 ? 1 : 0) + (vixChange < -1 ? 1 : 0);
  const offSignals = (audjpyTrend < -0.2 ? 1 : 0) + (hyChange > 5 ? 1 : 0) + (vixChange > 1 ? 1 : 0);

  let composite, status, text;
  if (onSignals >= 2) { composite = 'on'; status = 'Risk-On'; text = `${onSignals}/3 signals confirm risk-on`; }
  else if (offSignals >= 2) { composite = 'off'; status = 'Risk-Off'; text = `${offSignals}/3 signals confirm risk-off`; }
  else { composite = 'mixed'; status = 'Mixed'; text = 'Conflicting signals — caution'; }

  return {
    audjpy: { trend: audjpyTrend, text: audjpyText, status: audjpyTrend > 0.2 ? 'on' : audjpyTrend < -0.2 ? 'off' : 'mixed' },
    hy: { change: hyChange, text: hyText, status: hyChange < -5 ? 'on' : hyChange > 5 ? 'off' : 'mixed' },
    vix: { change: vixChange, text: vixText, status: vixChange < -1 ? 'on' : vixChange > 1 ? 'off' : 'mixed' },
    composite, status, text
  };
}

export function calculateDivergence(macroScore, volRegime) {
  const bars = filterTradingDays(S.ohlcData[S.currentPair.symbol]?.values);
  if (!bars || bars.length < 5) return null;

  const now = parseFloat(bars[0].close);
  const fiveAgo = parseFloat(bars[4].close);
  const priceChangePct = ((now / fiveAgo) - 1) * 100;

  const atr = volRegime?.atr || 0;
  const price = now || 1;
  const atrRelThreshold = atr > 0
    ? (5 * atr * 0.5 / price) * 100
    : 1.0;

  const macroDir = macroScore > 4 ? 'up' : macroScore < -4 ? 'down' : 'neutral';
  const priceDir = priceChangePct > atrRelThreshold ? 'up' :
                   priceChangePct < -atrRelThreshold ? 'down' : 'neutral';

  if (macroDir !== 'neutral' && priceDir !== 'neutral' && macroDir !== priceDir) {
    return {
      type: 'divergence',
      title: 'Macro vs Price Divergence',
      text: `Macro bias is ${macroDir.toUpperCase()} (score ${macroScore > 0 ? '+' : ''}${macroScore}) but 5-day price has gone ${priceDir.toUpperCase()} (${priceChangePct.toFixed(1)}%). Price has run ahead of fundamentals — watch for pullback or revised macro reading.`
    };
  }
  return null;
}

export function getForeignCurves() {
  const fredData = S.fredData;
  const curves = [];

  const us2y = fred('us2y');
  const us10y = fred('us10y');
  if (us2y != null && us10y != null) {
    curves.push(buildCurve('US', '🇺🇸', us2y, us10y, false));
  }

  const foreigns = [
    { code: 'de', flag: '🇩🇪', name: 'DE' },
    { code: 'gb', flag: '🇬🇧', name: 'UK' },
    { code: 'jp', flag: '🇯🇵', name: 'JP' },
    { code: 'au', flag: '🇦🇺', name: 'AU' }
  ];

  foreigns.forEach(f => {
    const short = fredData[`${f.code}_short`]?.value;
    const long = fredData[`${f.code}10y`]?.value;
    if (short != null && long != null) {
      curves.push(buildCurve(f.name, f.flag, short, long, true));
    }
  });

  return curves;
}

export function buildCurve(name, flag, short, long, monthly) {
  const spread = (long - short) * 100;
  let status, statusClass;
  if (spread < 0) { status = 'Inverted'; statusClass = 'inverted'; }
  else if (spread < 50) { status = 'Flat'; statusClass = 'flat'; }
  else { status = 'Normal'; statusClass = 'normal'; }

  return { name, flag, short, long, spread, status, statusClass, monthly };
}

export function calculatePivots() {
  const bars = filterTradingDays(S.ohlcData[S.currentPair.symbol]?.values);
  if (!bars || bars.length < 2) {
    return { pp: 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0 };
  }
  const yesterday = bars[1];
  const high = parseFloat(yesterday.high);
  const low = parseFloat(yesterday.low);
  const close = parseFloat(yesterday.close);
  const pp = (high + low + close) / 3;

  return {
    pp, r1: (2 * pp) - low, r2: pp + (high - low), r3: high + 2 * (pp - low),
    s1: (2 * pp) - high, s2: pp - (high - low), s3: low - 2 * (high - pp)
  };
}
