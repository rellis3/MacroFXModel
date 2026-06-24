// js/cogRiskGate.js — Gate 2: Risk / Volatility Engine
//
// The one deliberate exception to "no Nasdaq price" in this system (see the
// cogConfig.js header): this gate reads QQQ/SPY/the traded instrument's own
// OHLC ONLY to measure volatility/correlation regime — never to generate a
// directional signal. Its job is VALID/INVALID classification plus stop
// distance + risk-tier sizing; it never says LONG or SHORT.
//
// "No black boxes": computeRiskGate returns every component's raw value and
// ramp sub-score (via nasdaqTransforms.compositeRampScore) alongside the
// composite RiskScore, plus all three stop-model distances so Backtest Lab
// can compare them directly.

import { stdev, rollingPercentile, atr, garch11, pearsonCorr, compositeRampScore } from './nasdaqTransforms.js';
import { COG_RISK_SCORE, COG_STOP_MODELS, COG_RISK_TIERS } from './cogConfig.js';

const ANNUALIZE = Math.sqrt(252);

function logReturns(close) {
  const n = close.length;
  const out = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    if (Number.isFinite(close[i]) && Number.isFinite(close[i - 1]) && close[i - 1] > 0) {
      out[i] = Math.log(close[i] / close[i - 1]);
    }
  }
  return out;
}

function rollingCorr(x, y, window) {
  const n = x.length;
  const out = new Array(n).fill(NaN);
  for (let i = window - 1; i < n; i++) {
    out[i] = pearsonCorr(x.slice(i - window + 1, i + 1), y.slice(i - window + 1, i + 1));
  }
  return out;
}

// Periodically refits GARCH(1,1) on an expanding window (no lookahead — only
// data up to and including bar i) every `refitEveryDays` bars once
// `minObservations` is reached, holding the fitted forecastVol constant
// between refits. Returns the DAILY (non-annualized) forecast vol per bar.
function computeGarchVolDaily(returns, { refitEveryDays, minObservations }) {
  const n = returns.length;
  const out = new Array(n).fill(null);
  let lastVol = null;
  for (let i = 0; i < n; i++) {
    if (i + 1 >= minObservations && (lastVol === null || i % refitEveryDays === 0)) {
      const fit = garch11(returns.slice(0, i + 1));
      if (fit) lastVol = fit.forecastVol;
    }
    out[i] = lastVol;
  }
  return out;
}

// Precomputes every component's raw-value array (and the stop-model inputs)
// once over the whole series — never per-bar — to keep this O(n), same fix
// as Gate 1's precomputeInputSignal.
function precompute(seriesById, ohlc) {
  const { percentileLookbackDays, realizedVolWindowsDays, garchRefitEveryDays, garchMinObservations, correlationWindowDays } = COG_RISK_SCORE;

  const vixPctArr = seriesById.vix ? rollingPercentile(seriesById.vix, percentileLookbackDays) : null;
  const vvixPctArr = seriesById.vvix ? rollingPercentile(seriesById.vvix, percentileLookbackDays) : null;
  const movePctArr = seriesById.move ? rollingPercentile(seriesById.move, percentileLookbackDays) : null;
  const creditPctArr = seriesById.credit ? rollingPercentile(seriesById.credit, percentileLookbackDays) : null;

  const vixTermArr = (seriesById.vix && seriesById.vix3m)
    ? seriesById.vix.map((v, i) => (Number.isFinite(v) && v > 0 && Number.isFinite(seriesById.vix3m[i])) ? seriesById.vix3m[i] / v : NaN)
    : null;

  const qqqReturns = seriesById.qqq ? logReturns(seriesById.qqq) : null;
  const spyReturns = seriesById.spy ? logReturns(seriesById.spy) : null;
  const dxyReturns = seriesById.dxy ? logReturns(seriesById.dxy) : null;
  const us10yChange = seriesById.us10y ? seriesById.us10y.map((v, i) => (i > 0 && Number.isFinite(v) && Number.isFinite(seriesById.us10y[i - 1])) ? v - seriesById.us10y[i - 1] : NaN) : null;

  const realizedVolPctile = {};
  for (const w of realizedVolWindowsDays) {
    if (!qqqReturns) { realizedVolPctile[w] = null; continue; }
    const raw = stdev(qqqReturns, w).map(v => Number.isFinite(v) ? v * ANNUALIZE * 100 : NaN); // annualized %, e.g. 18.0
    realizedVolPctile[w] = { raw, pctile: rollingPercentile(raw, percentileLookbackDays) };
  }

  let atrRaw = null, atrPctile = null;
  if (ohlc && ohlc.high && ohlc.low && ohlc.close) {
    atrRaw = atr(ohlc.high, ohlc.low, ohlc.close, 14);
    atrPctile = rollingPercentile(atrRaw, percentileLookbackDays);
  }

  let garchVolDaily = null, garchVolAnnualPctile = null;
  if (qqqReturns) {
    garchVolDaily = computeGarchVolDaily(qqqReturns, { refitEveryDays: garchRefitEveryDays, minObservations: garchMinObservations });
    const annualPct = garchVolDaily.map(v => Number.isFinite(v) ? v * ANNUALIZE * 100 : NaN);
    garchVolAnnualPctile = rollingPercentile(annualPct, percentileLookbackDays);
  }

  const corrQqqSpyArr = (qqqReturns && spyReturns) ? rollingCorr(qqqReturns, spyReturns, correlationWindowDays) : null;
  const corrQqqDxyInverseArr = (qqqReturns && dxyReturns) ? rollingCorr(qqqReturns, dxyReturns, correlationWindowDays).map(v => Number.isFinite(v) ? -v : NaN) : null;
  const corrBondEquityArr = (us10yChange && qqqReturns) ? rollingCorr(us10yChange, qqqReturns, correlationWindowDays) : null;

  return {
    vixPctArr, vvixPctArr, movePctArr, creditPctArr, vixTermArr,
    realizedVolPctile, atrRaw, atrPctile, garchVolDaily, garchVolAnnualPctile,
    corrQqqSpyArr, corrQqqDxyInverseArr, corrBondEquityArr,
  };
}

function rawValueForComponent(id, pre, seriesById, i) {
  switch (id) {
    case 'vixPercentile':      return pre.vixPctArr ? pre.vixPctArr[i] : NaN;
    case 'vvixPercentile':     return pre.vvixPctArr ? pre.vvixPctArr[i] : NaN;
    case 'vixTermStructure':   return pre.vixTermArr ? pre.vixTermArr[i] : NaN;
    case 'movePercentile':     return pre.movePctArr ? pre.movePctArr[i] : NaN;
    case 'realizedVol5dPctile':  return pre.realizedVolPctile[5] ? pre.realizedVolPctile[5].pctile[i] : NaN;
    case 'realizedVol20dPctile': return pre.realizedVolPctile[20] ? pre.realizedVolPctile[20].pctile[i] : NaN;
    case 'realizedVol60dPctile': return pre.realizedVolPctile[60] ? pre.realizedVolPctile[60].pctile[i] : NaN;
    case 'atrPercentile':      return pre.atrPctile ? pre.atrPctile[i] : NaN;
    case 'garchVolPercentile': return pre.garchVolAnnualPctile ? pre.garchVolAnnualPctile[i] : NaN;
    case 'corrQqqSpy':         return pre.corrQqqSpyArr ? pre.corrQqqSpyArr[i] : NaN;
    case 'corrQqqDxyInverse':  return pre.corrQqqDxyInverseArr ? pre.corrQqqDxyInverseArr[i] : NaN;
    case 'corrBondEquity':     return pre.corrBondEquityArr ? pre.corrBondEquityArr[i] : NaN;
    case 'creditStressPercentile': return pre.creditPctArr ? pre.creditPctArr[i] : NaN;
    default: return NaN;
  }
}

// Tiers whose minGate2Score the current score clears, best (aggressive)
// first — cogExecutionEngine.js picks among these, never sizing UP beyond
// what Gate 2 (and Gate 3) justify.
export function selectEligibleTiers(score) {
  if (score == null) return [];
  return Object.entries(COG_RISK_TIERS)
    .filter(([, t]) => score >= t.minGate2Score)
    .sort((a, b) => b[1].minGate2Score - a[1].minGate2Score)
    .map(([name]) => name);
}

// Stop distances (in instrument price units) from all three models, at bar i.
// `price` is the instrument's close at i — needed only to convert a vol
// measure into a $-denominated distance, never to generate a signal.
function stopDistancesAt(pre, seriesById, price, i) {
  const out = {};
  const atrVal = pre.atrRaw ? pre.atrRaw[i] : NaN;
  if (Number.isFinite(atrVal)) {
    const m = COG_STOP_MODELS.atrFraction;
    out.atrFraction = { standard: m.standardMultiplier * atrVal, conservative: m.conservativeMultiplier * atrVal };
  }
  const garchDaily = pre.garchVolDaily ? pre.garchVolDaily[i] : null;
  if (Number.isFinite(garchDaily) && Number.isFinite(price)) {
    const m = COG_STOP_MODELS.garchSigma;
    out.garchSigma = { standard: m.standardMultiplier * garchDaily * price, conservative: m.conservativeMultiplier * garchDaily * price };
  }
  const vix = seriesById.vix ? seriesById.vix[i] : NaN;
  if (Number.isFinite(vix) && Number.isFinite(price)) {
    const m = COG_STOP_MODELS.expectedMove;
    const dailyExpectedMoveFrac = (vix / 100) / ANNUALIZE;
    out.expectedMove = { standard: m.standardMultiplier * dailyExpectedMoveFrac * price, conservative: m.conservativeMultiplier * dailyExpectedMoveFrac * price };
  }
  return out;
}

// Computes the full Gate 2 time series. `seriesById` = { vix, vix3m, vvix,
// move, qqq, spy, dxy, us10y, credit } raw level arrays already aligned onto
// the dataset's common date axis (no publication lag needed — these are
// same-day market closes). `ohlc` = { high, low, close } arrays for the
// traded instrument (NQ/QQQ proxy), used only for ATR + stop sizing.
// `instrumentClose` is that same close series (for $ stop distances).
export function computeRiskGate(seriesById, ohlc, instrumentClose, n) {
  const { validThreshold, minCoverage, components } = COG_RISK_SCORE;
  const pre = precompute(seriesById, ohlc);
  const out = new Array(n);

  for (let i = 0; i < n; i++) {
    const valuesById = {};
    for (const c of components) valuesById[c.id] = rawValueForComponent(c.id, pre, seriesById, i);
    const { score, coverage, breakdown } = compositeRampScore(valuesById, components);

    const dataValid = coverage >= minCoverage;
    const valid = dataValid && score != null && score > validThreshold;
    const eligibleTiers = valid ? selectEligibleTiers(score) : [];
    const stopModels = stopDistancesAt(pre, seriesById, instrumentClose ? instrumentClose[i] : NaN, i);

    out[i] = { dataValid, valid, score, coverage, breakdown, eligibleTiers, stopModels };
  }
  return out;
}
