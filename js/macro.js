import { S } from './state.js';
import { ema, calcRSI } from './utils.js';

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

  const totalScore = tiers.reduce((sum, t) => sum + t.score, 0);

  const agreeCount = tiers.filter(t => Math.sign(t.score) === Math.sign(totalScore) && t.score !== 0).length;
  const coherenceBonus = agreeCount >= 5 ? Math.sign(totalScore) : 0;

  return {
    tiers,
    totalScore: totalScore + coherenceBonus,
    rawScore: totalScore,
    coherenceBonus,
    agreeCount,
    maxScore: 17
  };
}

function computeT1() {
  const fredData = S.fredData;
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

  if (us10y == null || foreign10y == null) return tierUnavailable('T1', 'Rate Differential', '10Y Spread', 3);

  let diff10, diff2, bullishWhenPositive;

  if (S.currentPair.symbol === 'EUR/USD') {
    diff10 = us10y - foreign10y; bullishWhenPositive = false;
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

  const score = Math.max(-3, Math.min(3, Math.round(score10 + score2)));
  const has2Y = diff2Bp != null;
  const valStr = has2Y
    ? `10Y ${diff10Bp >= 0 ? '+' : ''}${diff10Bp.toFixed(0)}bp · 2Y ${diff2Bp >= 0 ? '+' : ''}${diff2Bp.toFixed(0)}bp`
    : `10Y ${diff10Bp >= 0 ? '+' : ''}${diff10Bp.toFixed(0)}bp`;

  return {
    tier: 'T1', name: 'Rate Differential', max: 3, score,
    val: valStr,
    reading: Math.abs(diff10Bp) < 20 ? 'Tight spread, neutral' :
             score > 0 ? 'Yield differential supports pair' : 'Yield differential drags pair',
    source: has2Y ? '10Y + 2Y spreads' : '10Y vs counterpart',
    isMonthly: !has2Y
  };
}

function computeT2() {
  const fredData = S.fredData;
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
  const fredData = S.fredData;
  const dxy = fredData.dxy?.value;
  const dxyPrev = fredData.dxy?.prev;
  if (dxy == null) return tierUnavailable('T3', 'DXY Direction', 'Dollar Index', 2);

  const change = dxyPrev ? ((dxy / dxyPrev) - 1) * 100 : 0;
  const amplifier = S.currentPair.isGold ? 1.5 : 1;
  const usdBase = S.currentPair.isUsdBase;

  let absScore = 0;
  if (Math.abs(change) > 0.5) absScore = 2;
  else if (Math.abs(change) > 0.2) absScore = 1;

  const sign = change > 0 ? 1 : -1;
  let score = sign * absScore;

  if (S.currentPair.isGold) score = -score * 1;
  else if (!usdBase) score = -score;

  score = Math.max(-2, Math.min(2, Math.round(score * amplifier)));

  return {
    tier: 'T3', name: 'DXY Direction', max: 2, score,
    val: `${dxy.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    reading: Math.abs(change) < 0.2 ? 'DXY range-bound' :
             score > 0 ? 'USD move supports pair' : 'USD move drags pair',
    source: 'DXY (DTWEXBGS)',
    isMonthly: false
  };
}

function computeT4() {
  const fredData = S.fredData;
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

  let score = levelScore + dirScore;
  if (isInverted) score = -score;
  score = Math.max(-2, Math.min(2, Math.round(score)));

  return {
    tier: 'T4', name: 'HY Credit', max: 2, score,
    val: `${hy.toFixed(0)}bp ${change >= 0 ? '+' : ''}${change.toFixed(0)}`,
    reading: hy > 500 ? (isInverted ? 'Stressed credit favors safe haven' : 'Stressed credit, risk off') :
             hy < 300 ? 'Risk on, follow momentum' : 'Normal range',
    source: 'BAMLH0A0HYM2',
    isMonthly: false
  };
}

function computeT5() {
  const fredData = S.fredData;
  const aud = fredData.aud_usd?.value;
  const audPrev = fredData.aud_usd?.prev;
  const jpy = fredData.usd_jpy?.value;
  const jpyPrev = fredData.usd_jpy?.prev;
  if (aud == null || jpy == null) return tierUnavailable('T5', 'AUD/JPY Carry', 'Carry Proxy', 2);

  const audjpy = aud * jpy;
  const audjpyPrev = (audPrev && jpyPrev) ? audPrev * jpyPrev : null;
  const change = audjpyPrev ? ((audjpy / audjpyPrev) - 1) * 100 : 0;

  const isInverted = S.currentPair.isSafeHaven || S.currentPair.isGold;

  let absScore = 0;
  if (Math.abs(change) > 0.5) absScore = 2;
  else if (Math.abs(change) > 0.2) absScore = 1;

  let score = (change > 0 ? 1 : -1) * absScore;
  if (isInverted) score = -score;
  score = Math.max(-2, Math.min(2, score));

  return {
    tier: 'T5', name: 'AUD/JPY Carry', max: 2, score,
    val: `${audjpy.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    reading: change > 0.2 ? (isInverted ? 'Risk-on hurts safe haven' : 'Carry on, risk-on') :
             change < -0.2 ? (isInverted ? 'Carry unwind benefits safe haven' : 'Carry off, risk-off') : 'Carry stable',
    source: 'AUD×USDJPY',
    isMonthly: false
  };
}

function computeT6() {
  const fredData = S.fredData;
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
  const bars = S.ohlcData[S.currentPair.symbol]?.values;
  if (!bars || bars.length < 50) return tierUnavailable('T7', 'Momentum', 'EMA/RSI', 2);

  const closes = bars.slice(0, 100).map(b => parseFloat(b.close)).reverse();
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi = calcRSI(closes, 14);

  const ema20Now = ema20[ema20.length - 1];
  const ema50Now = ema50[ema50.length - 1];
  const rsiNow = rsi[rsi.length - 1];

  let score = 0;
  if (ema20Now > ema50Now) score += 1;
  else score -= 1;

  if (rsiNow > 60) score += 0.5;
  else if (rsiNow > 50) score += 0.3;
  else if (rsiNow < 40) score -= 0.5;
  else if (rsiNow < 50) score -= 0.3;

  score = Math.max(-2, Math.min(2, Math.round(score)));

  return {
    tier: 'T7', name: 'Momentum', max: 2, score,
    val: `RSI ${rsiNow.toFixed(0)} | EMA${ema20Now > ema50Now ? '↑' : '↓'}`,
    reading: ema20Now > ema50Now && rsiNow > 50 ? 'Trend up, momentum bullish' :
             ema20Now < ema50Now && rsiNow < 50 ? 'Trend down, momentum bearish' : 'Mixed signals',
    source: 'EMA(20/50), RSI(14)',
    isMonthly: false
  };
}

function tierUnavailable(tier, name, val, max) {
  return { tier, name, max, score: 0, val: '—', reading: 'Data unavailable', source: '—', isMonthly: false, na: true };
}
