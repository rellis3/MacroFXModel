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
    garch: null, ci68: null, ci95: null, volCluster: false };
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

  const ATR_ALPHA = 0.15;
  let emaATR = trueRanges[0];
  for (let i = 1; i < trueRanges.length; i++) {
    emaATR = ATR_ALPHA * trueRanges[i] + (1 - ATR_ALPHA) * emaATR;
  }

  const G_OMEGA = 1e-7;
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
  };
}

export function calcPositionSize(score, volRegime, transitionRisk) {
  const abs = Math.abs(score);
  let baseSize;
  if (abs >= 13) baseSize = 100;
  else if (abs >= 9) baseSize = 75;
  else if (abs >= 5) baseSize = 50;
  else if (abs >= 4) baseSize = 25;
  else baseSize = 10;

  let finalSize = Math.round(baseSize * volRegime.sizeMult);

  if (transitionRisk && transitionRisk.riskScore > 70) {
    finalSize = Math.round(finalSize * 0.8);
  }

  return finalSize;
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
