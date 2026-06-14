/**
 * macroEquityEngine.js — v2
 * Macro-Regime-Conditional Equity Backtester — pure JS engine.
 * Multi-state allocation · 200-day MA trend filter · Monthly rebalancing.
 * No I/O. Accepts aligned daily arrays, returns full backtest results.
 */

// ── Default configuration ─────────────────────────────────────────────────────

export const ME_DEFAULT_CONFIG = {
  weights: { netLiq: 0.40, curve: 0.20, credit: 0.20, realYield: 0.15, ism: 0.05 },
  highBand:  1.0,   // score > this → 100% base allocation
  midBand:   0.0,   // score > this → 75% base allocation
  lowBand:  -1.0,   // score > this → 50%; below lowBand = 25%
  allocFloor: 0.50, // minimum allocation — never goes below this regardless of regime
  zWindow:   252,   // rolling z-score lookback (trading days)
  vixWindow:  60,   // VIX z-score lookback
  ma200Period: 200, // moving average period for trend filter
  wfTrain:   504,   // walk-forward train window (trading days ≈ 2 years)
  wfTest:    252,   // walk-forward test window (≈ 12 monthly bars)
  wfStep:     63,   // walk-forward step (quarterly)
  costs:     0.001, // 0.10% applied proportionally to allocation change each month
  netLiqChangeDays: 21,
};

// Publication lags in trading days applied after forward-filling
const PUB_LAG_WEEKLY  = 5;   // WALCL, WTREGEN, RRPONTSYD, T10Y2Y, BAMLH0A0HYM2, DFII10
const PUB_LAG_MONTHLY = 21;  // NAPM / INDPRO (ISM proxy)

// ── Array utilities ───────────────────────────────────────────────────────────

function fwdFill(arr) {
  const out = new Array(arr.length);
  let last = NaN;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v != null && isFinite(v)) last = v;
    out[i] = isFinite(last) ? last : NaN;
  }
  return out;
}

function applyLag(arr, lag) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = lag; i < arr.length; i++) out[i] = arr[i - lag];
  return out;
}

function pctChange(arr, periods) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = periods; i < arr.length; i++) {
    const prev = arr[i - periods];
    if (isFinite(arr[i]) && isFinite(prev) && Math.abs(prev) > 1e-10) {
      out[i] = (arr[i] - prev) / Math.abs(prev);
    }
  }
  return out;
}

// Rolling z-score: at index i uses window arr[i-window+1 .. i]
function rollingZscore(arr, window, minPeriods) {
  const mp = minPeriods ?? Math.floor(window * 0.5);
  const n = arr.length;
  const z = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - window + 1);
    let s = 0, s2 = 0, cnt = 0;
    for (let j = start; j <= i; j++) {
      const v = arr[j];
      if (isFinite(v)) { s += v; s2 += v * v; cnt++; }
    }
    if (cnt < mp || !isFinite(arr[i])) continue;
    const mn  = s / cnt;
    const vr  = Math.max(s2 / cnt - mn * mn, 1e-12);
    z[i] = (arr[i] - mn) / Math.sqrt(vr);
  }
  return z;
}

// Fixed z-score: params computed from training window [i0, i1), applied to entire array
function fixedZscore(arr, i0, i1) {
  let s = 0, s2 = 0, cnt = 0;
  for (let j = i0; j < i1; j++) {
    const v = arr[j];
    if (isFinite(v)) { s += v; s2 += v * v; cnt++; }
  }
  if (cnt < 10) return new Array(arr.length).fill(NaN);
  const mn = s / cnt;
  const sd = Math.sqrt(Math.max(s2 / cnt - mn * mn, 1e-12));
  return arr.map(v => (isFinite(v) ? (v - mn) / sd : NaN));
}

function round4(v) {
  return isFinite(v) ? Math.round(v * 10000) / 10000 : 0;
}

// Simple moving average (requires 80% of period to have valid data)
function computeMA(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  let sum = 0, cnt = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (isFinite(v)) { sum += v; cnt++; }
    if (i >= period) {
      const old = arr[i - period];
      if (isFinite(old)) { sum -= old; cnt--; }
    }
    if (cnt >= Math.floor(period * 0.8)) out[i] = sum / cnt;
  }
  return out;
}

// ── Factor construction ───────────────────────────────────────────────────────

// Build raw (unz-scored) factor arrays from aligned daily data.
// Applies forward-fill then publication lags.
// Returns object with factor series aligned to dates[].
function buildRawFactors(data) {
  const { fred } = data;

  const walcl        = fwdFill(fred.walcl);
  const wtregen      = fwdFill(fred.wtregen);
  const rrpontsyd    = fwdFill(fred.rrpontsyd);
  const t10y2y       = fwdFill(fred.t10y2y);
  const bamlh0a0hym2 = fwdFill(fred.bamlh0a0hym2);
  const dfii10       = fwdFill(fred.dfii10);
  const napm         = fwdFill(fred.napm);
  const vix          = fwdFill(data.vix);

  const walclLag     = applyLag(walcl,        PUB_LAG_WEEKLY);
  const wtregenLag   = applyLag(wtregen,       PUB_LAG_WEEKLY);
  const rrpoLag      = applyLag(rrpontsyd,     PUB_LAG_WEEKLY);
  const curveLag     = applyLag(t10y2y,        PUB_LAG_WEEKLY);
  const creditLag    = applyLag(bamlh0a0hym2,  PUB_LAG_WEEKLY);
  const realYieldLag = applyLag(dfii10,        PUB_LAG_WEEKLY);
  const ismLag       = applyLag(napm,          PUB_LAG_MONTHLY);

  const netliq = walclLag.map((w, i) => {
    const wt = wtregenLag[i], rr = rrpoLag[i];
    return (isFinite(w) && isFinite(wt) && isFinite(rr)) ? w - wt - rr : NaN;
  });
  const netliqPct = pctChange(netliq, ME_DEFAULT_CONFIG.netLiqChangeDays);

  // 200-day MA and 12-month momentum for each instrument (trend filter)
  const qqqMA200  = computeMA(data.qqq.close, 200);
  const spyMA200  = computeMA(data.spy.close, 200);
  const qqqMom12m = pctChange(data.qqq.close, 252);
  const spyMom12m = pctChange(data.spy.close, 252);

  return {
    netliqPct,
    curve:     curveLag,
    credit:    creditLag,
    realYield: realYieldLag,
    ism:       ismLag,
    vix,
    qqqMA200,
    spyMA200,
    qqqMom12m,
    spyMom12m,
  };
}

// Compute composite macro score from z-scored factors.
// Credit and real yield are inverted (rising = bearish).
function compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ, w) {
  const n = netLiqZ.length;
  const score = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = netLiqZ[i], b = curveZ[i], c = creditZ[i], d = realYieldZ[i], e = ismZ[i];
    if ([a, b, c, d, e].every(isFinite)) {
      score[i] = a * w.netLiq + b * w.curve + (-c) * w.credit + (-d) * w.realYield + e * w.ism;
    } else {
      // Partial score when some factors are unavailable
      let ws = 0, wt = 0;
      if (isFinite(a)) { ws += a * w.netLiq;       wt += w.netLiq; }
      if (isFinite(b)) { ws += b * w.curve;         wt += w.curve; }
      if (isFinite(c)) { ws += (-c) * w.credit;     wt += w.credit; }
      if (isFinite(d)) { ws += (-d) * w.realYield;  wt += w.realYield; }
      if (isFinite(e)) { ws += e * w.ism;           wt += w.ism; }
      if (wt >= 0.5) score[i] = ws / wt;
    }
  }
  return score;
}

// ── Monthly bar construction ───────────────────────────────────────────────────

function getMonthKey(dateStr) { return dateStr.substring(0, 7); } // "YYYY-MM"

// Group daily bars into calendar months.
// open = first bar's open; close/signal fields = last bar of month.
function buildMonthly(dates, open, close, macroScore, vixZ, ma200arr, mom12marr) {
  const monthMap = new Map();
  for (let i = 0; i < dates.length; i++) {
    const mk = getMonthKey(dates[i]);
    if (!monthMap.has(mk)) monthMap.set(mk, { first: i, last: i });
    else monthMap.get(mk).last = i;
  }
  const months = [];
  for (const [mk, { first, last }] of [...monthMap].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    months.push({
      monthKey:   mk,
      monOpen:    open[first],
      monClose:   close[last],
      macroScore: macroScore[last],
      vixZ:       vixZ[last],
      closePrice: close[last],
      ma200:      ma200arr[last],
      mom12m:     mom12marr[last],
    });
  }
  return months;
}

// ── Allocation function ───────────────────────────────────────────────────────

// Multi-state allocation: score bands × trend filter × VIX sizer.
// Floor at 15% — never fully exits the market.
function computeAlloc(score, vixZ, closePrice, ma200Price, mom12mVal, cfg) {
  const { highBand, midBand, lowBand } = cfg;

  // Base allocation from macro score bands
  let base;
  if (score > highBand)     base = 1.00;
  else if (score > midBand) base = 0.75;
  else if (score > lowBand) base = 0.50;
  else                      base = 0.25;

  // Trend filter: 200-day MA + 12-month momentum
  let trendFactor = 1.0;
  if (isFinite(ma200Price) && isFinite(closePrice)) {
    const aboveMA = closePrice > ma200Price;
    const posMom  = isFinite(mom12mVal) ? mom12mVal > 0 : true;
    if (aboveMA && posMom)      trendFactor = 1.00;
    else if (aboveMA || posMom) trendFactor = 0.80;
    else                        trendFactor = 0.55;
  }

  // VIX regime sizer — 4 bands, no hard block
  let vixFactor = 1.0;
  if (isFinite(vixZ)) {
    if (vixZ < -0.5)      vixFactor = 1.00; // LOW vol
    else if (vixZ < 0.75) vixFactor = 0.85; // NORMAL
    else if (vixZ < 1.5)  vixFactor = 0.60; // HIGH
    else                  vixFactor = 0.30; // EXTREME
  }

  const floor = isFinite(cfg.allocFloor) ? cfg.allocFloor : 0.50;
  return Math.max(floor, Math.min(1.0, base * trendFactor * vixFactor));
}

// ── Monthly backtest ──────────────────────────────────────────────────────────

// Runs the monthly backtest on a monthly bars array.
// Signal comes from the previous month's last bar (look-ahead safe).
// Cost charged proportionally to allocation change when change > 5pp.
function runMonthlyBacktest(months, cfg) {
  const { costs } = cfg;
  const equityCurve = [{ date: months[0]?.monthKey ?? '', equity: 1 }];
  const bhCurve     = [{ date: months[0]?.monthKey ?? '', equity: 1 }];
  const monthlyRets = [];
  const bhRets      = [];
  const trades      = [];

  let stratEq = 1, bhEq = 1;
  let prevAlloc = 0;

  for (let i = 1; i < months.length; i++) {
    const sig  = months[i - 1]; // previous month end → signal
    const curr = months[i];     // enter at first open, exit at last close

    const monthRet = (isFinite(curr.monOpen) && isFinite(curr.monClose) && curr.monOpen > 0)
      ? (curr.monClose - curr.monOpen) / curr.monOpen : NaN;

    // B&H
    const bhRet = isFinite(monthRet) ? monthRet : 0;
    bhEq *= (1 + bhRet);
    bhRets.push(bhRet);
    bhCurve.push({ date: curr.monthKey, equity: bhEq });

    // Strategy allocation from previous month signal
    const score = sig.macroScore;
    const alloc = isFinite(score)
      ? computeAlloc(score, sig.vixZ, sig.closePrice, sig.ma200, sig.mom12m, cfg)
      : 0.25;

    // Transaction cost proportional to allocation change (only when change > 5pp)
    const allocDelta = Math.abs(alloc - prevAlloc);
    const txCost = allocDelta > 0.05 ? costs * allocDelta : 0;

    let stratRet = 0;
    if (isFinite(monthRet)) {
      stratRet = alloc * monthRet - txCost;
    }

    stratEq *= (1 + stratRet);
    monthlyRets.push(stratRet);
    equityCurve.push({ date: curr.monthKey, equity: stratEq });

    const vz = sig.vixZ;
    const volReg = !isFinite(vz) ? 'NORMAL'
      : vz >= 1.5 ? 'EXTREME' : vz >= 0.75 ? 'HIGH' : vz < -0.5 ? 'LOW' : 'NORMAL';
    const aboveMA    = isFinite(sig.ma200) && isFinite(sig.closePrice) && sig.closePrice > sig.ma200;
    const trendState = !isFinite(sig.ma200) ? 'N/A' : aboveMA ? 'ABOVE MA' : 'BELOW MA';

    trades.push({
      monthKey:   curr.monthKey,
      alloc,
      monOpen:    curr.monOpen,
      monClose:   curr.monClose,
      monthRet,
      stratRet,
      macroScore: score,
      vixZ:       sig.vixZ,
      volRegime:  volReg,
      trendState,
      win:        stratRet > 0,
    });

    prevAlloc = alloc;
  }

  return { equityCurve, bhCurve, monthlyRets, bhRets, trades };
}

// ── Performance metrics ───────────────────────────────────────────────────────

function drawdownSeries(equityCurve) {
  let peak = equityCurve[0].equity;
  return equityCurve.map(({ date, equity }) => {
    peak = Math.max(peak, equity);
    return { date, dd: (equity - peak) / peak };
  });
}

// Monthly annualization: √12 for Sharpe/Sortino
function metrics(monthlyRets, equityCurve, totalMonths, trades) {
  const n = monthlyRets.length;
  if (!n) return {};

  const finalEq = equityCurve[equityCurve.length - 1].equity;
  const years   = totalMonths / 12;
  const cagr    = Math.pow(finalEq, 1 / years) - 1;

  const mn = monthlyRets.reduce((a, r) => a + r, 0) / n;
  const vr = monthlyRets.reduce((a, r) => a + (r - mn) ** 2, 0) / n;
  const sd = Math.sqrt(vr);
  const sharpe = sd > 1e-10 ? mn / sd * Math.sqrt(12) : 0;

  const dn = monthlyRets.filter(r => r < 0);
  const dsv = dn.length ? Math.sqrt(dn.reduce((a, r) => a + r * r, 0) / dn.length) : 1e-10;
  const sortino = mn / dsv * Math.sqrt(12);

  let peak = equityCurve[0].equity, maxDD = 0;
  for (const { equity } of equityCurve) {
    peak = Math.max(peak, equity);
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  const wins   = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const winRate    = trades.length ? wins.length / trades.length : 0;
  const avgWin     = wins.length   ? wins.reduce((a, t) => a + t.stratRet, 0) / wins.length : 0;
  const avgLoss    = losses.length ? losses.reduce((a, t) => a + t.stratRet, 0) / losses.length : 0;
  const grossWin   = wins.reduce((a, t) => a + t.stratRet, 0);
  const grossLoss  = Math.abs(losses.reduce((a, t) => a + t.stratRet, 0));
  const profitFactor = grossLoss > 1e-10 ? grossWin / grossLoss : Infinity;
  const calmar = maxDD < -1e-10 ? cagr / Math.abs(maxDD) : Infinity;

  // Time in market = mean allocation across all months (weighted participation)
  const timeInMarket = trades.length ? trades.reduce((a, t) => a + t.alloc, 0) / trades.length : 0;

  return {
    cagr, sharpe, sortino, maxDD,
    winRate, avgWin, avgLoss, profitFactor, calmar,
    timeInMarket,
    finalEquity: finalEq, years, totalMonths, nTrades: trades.length,
  };
}

function bhMetrics(bhRets, bhCurve, totalMonths) {
  const n = bhRets.length;
  if (!n) return {};

  const finalEq = bhCurve[bhCurve.length - 1].equity;
  const years   = totalMonths / 12;
  const cagr    = Math.pow(finalEq, 1 / years) - 1;

  const mn = bhRets.reduce((a, r) => a + r, 0) / n;
  const vr = bhRets.reduce((a, r) => a + (r - mn) ** 2, 0) / n;
  const sd = Math.sqrt(vr);
  const sharpe = sd > 1e-10 ? mn / sd * Math.sqrt(12) : 0;

  let peak = bhCurve[0].equity, maxDD = 0;
  for (const { equity } of bhCurve) {
    peak = Math.max(peak, equity);
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  return { cagr, sharpe, maxDD, finalEquity: finalEq, years };
}

// ── Walk-forward validation ───────────────────────────────────────────────────

function wfSharpe(monthlyRets) {
  const n = monthlyRets.length;
  if (n < 3) return 0;
  const mn = monthlyRets.reduce((a, r) => a + r, 0) / n;
  const vr = monthlyRets.reduce((a, r) => a + (r - mn) ** 2, 0) / n;
  const sd = Math.sqrt(vr);
  return sd > 1e-10 ? mn / sd * Math.sqrt(12) : 0;
}

function runWalkForward(dates, rawFactors, qqq, spy, vix, cfg) {
  const n = dates.length;
  const { wfTrain, wfTest, wfStep, weights } = cfg;

  const windows    = [];
  const qqqOosRets = []; // { ret, date }[]
  const spyOosRets = []; // { ret, date }[]

  for (let start = 0; start + wfTrain + wfTest <= n; start += wfStep) {
    const trainEnd = start + wfTrain;
    const testEnd  = Math.min(start + wfTrain + wfTest, n);

    // Fixed z-score params from training window only (no lookahead)
    const netLiqZ    = fixedZscore(rawFactors.netliqPct, start, trainEnd);
    const curveZ     = fixedZscore(rawFactors.curve,     start, trainEnd);
    const creditZ    = fixedZscore(rawFactors.credit,    start, trainEnd);
    const realYieldZ = fixedZscore(rawFactors.realYield, start, trainEnd);
    const ismZ       = fixedZscore(rawFactors.ism,       start, trainEnd);
    const vixZ       = fixedZscore(vix,                  start, trainEnd);

    const macroScore = compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ, weights);

    const qqqMonths = buildMonthly(dates, qqq.open, qqq.close, macroScore, vixZ, rawFactors.qqqMA200, rawFactors.qqqMom12m);
    const spyMonths = buildMonthly(dates, spy.open, spy.close,  macroScore, vixZ, rawFactors.spyMA200, rawFactors.spyMom12m);

    const trainStartDate = dates[start];
    const trainEndDate   = dates[trainEnd - 1];
    const testStartDate  = dates[trainEnd];
    const testEndDate    = dates[testEnd - 1];

    const trainStartMK = getMonthKey(trainStartDate);
    const trainEndMK   = getMonthKey(trainEndDate);
    const testEndMK    = getMonthKey(testEndDate);

    const qqqTrain = qqqMonths.filter(m => m.monthKey >= trainStartMK && m.monthKey <= trainEndMK);
    const qqqTest  = qqqMonths.filter(m => m.monthKey >  trainEndMK   && m.monthKey <= testEndMK);
    const spyTrain = spyMonths.filter(m => m.monthKey >= trainStartMK && m.monthKey <= trainEndMK);
    const spyTest  = spyMonths.filter(m => m.monthKey >  trainEndMK   && m.monthKey <= testEndMK);

    if (qqqTrain.length < 10 || qqqTest.length < 2) continue;

    const qqqISResult = runMonthlyBacktest([...qqqTrain], cfg);
    const qqqOSResult = runMonthlyBacktest([qqqTrain[qqqTrain.length - 1], ...qqqTest], cfg);
    const spyISResult = runMonthlyBacktest([...spyTrain], cfg);
    const spyOSResult = runMonthlyBacktest([spyTrain[spyTrain.length - 1], ...spyTest], cfg);

    const qqqISsharpe  = wfSharpe(qqqISResult.monthlyRets);
    const qqqOOSsharpe = wfSharpe(qqqOSResult.monthlyRets);
    const spyISsharpe  = wfSharpe(spyISResult.monthlyRets);
    const spyOOSsharpe = wfSharpe(spyOSResult.monthlyRets);

    const qqqOosRet = qqqOSResult.equityCurve.length > 1
      ? qqqOSResult.equityCurve[qqqOSResult.equityCurve.length - 1].equity - 1 : 0;
    const spyOosRet = spyOSResult.equityCurve.length > 1
      ? spyOSResult.equityCurve[spyOSResult.equityCurve.length - 1].equity - 1 : 0;

    windows.push({
      trainStart:   trainStartDate,
      trainEnd:     trainEndDate,
      testStart:    testStartDate,
      testEnd:      testEndDate,
      qqqISSharpe:  round4(qqqISsharpe),
      qqqOOSSharpe: round4(qqqOOSsharpe),
      qqqOosReturn: round4(qqqOosRet),
      spyISSharpe:  round4(spyISsharpe),
      spyOOSSharpe: round4(spyOOSsharpe),
      spyOosReturn: round4(spyOosRet),
    });

    for (let ri = 0; ri < qqqOSResult.monthlyRets.length; ri++) {
      const date = qqqTest[ri]?.monthKey ?? testEndDate;
      qqqOosRets.push({ ret: qqqOSResult.monthlyRets[ri], date });
      spyOosRets.push({ ret: spyOSResult.monthlyRets[ri], date: spyTest[ri]?.monthKey ?? testEndDate });
    }
  }

  const qqqOosCurve = stitchCurve(qqqOosRets);
  const spyOosCurve = stitchCurve(spyOosRets);

  const qqqMeanOOS = windows.length ? windows.reduce((a, w) => a + w.qqqOOSSharpe, 0) / windows.length : 0;
  const qqqMeanIS  = windows.length ? windows.reduce((a, w) => a + w.qqqISSharpe,  0) / windows.length : 0;
  const spyMeanOOS = windows.length ? windows.reduce((a, w) => a + w.spyOOSSharpe, 0) / windows.length : 0;
  const spyMeanIS  = windows.length ? windows.reduce((a, w) => a + w.spyISSharpe,  0) / windows.length : 0;

  return {
    windows,
    QQQ: {
      oosCurve:      qqqOosCurve,
      meanOOSSharpe: round4(qqqMeanOOS),
      meanISSharpe:  round4(qqqMeanIS),
      wfe:           round4(qqqMeanIS > 1e-6 ? qqqMeanOOS / qqqMeanIS : 0),
    },
    SPY: {
      oosCurve:      spyOosCurve,
      meanOOSSharpe: round4(spyMeanOOS),
      meanISSharpe:  round4(spyMeanIS),
      wfe:           round4(spyMeanIS > 1e-6 ? spyMeanOOS / spyMeanIS : 0),
    },
  };
}

// Stitch { ret, date }[] into a continuous equity curve
function stitchCurve(retDatePairs) {
  if (!retDatePairs.length) return [];
  const curve = [{ date: retDatePairs[0].date, equity: 1 }];
  let eq = 1;
  for (const { ret, date } of retDatePairs) {
    eq *= (1 + ret);
    curve.push({ date, equity: round4(eq) });
  }
  return curve;
}

// ── Regime breakdown ──────────────────────────────────────────────────────────

function regimeBreakdown(trades) {
  const regimes = [
    { name: 'Score HIGH (>1.0)', filter: t => t.macroScore > 1.0 },
    { name: 'Score MID (0–1)',   filter: t => t.macroScore >= 0 && t.macroScore <= 1.0 },
    { name: 'Score LOW (<0)',    filter: t => t.macroScore < 0 },
    { name: 'VIX LOW  (<−0.5)', filter: t => t.vixZ < -0.5 },
    { name: 'VIX HIGH  (>0.75)',filter: t => t.vixZ > 0.75 },
    { name: 'Trend ABOVE MA',   filter: t => t.trendState === 'ABOVE MA' },
    { name: 'Trend BELOW MA',   filter: t => t.trendState === 'BELOW MA' },
  ];

  return regimes.map(({ name, filter }) => {
    const sub = trades.filter(filter);
    if (!sub.length) return { name, nTrades: 0, winRate: 0, avgReturn: 0, cumReturn: 0, sharpe: 0 };
    const rts  = sub.map(t => t.stratRet);
    const mn   = rts.reduce((a, r) => a + r, 0) / rts.length;
    const vr   = rts.reduce((a, r) => a + (r - mn) ** 2, 0) / rts.length;
    const sd   = Math.sqrt(vr);
    const sh   = sd > 1e-10 ? mn / sd * Math.sqrt(12) : 0;
    const wins = sub.filter(t => t.win).length;
    const cumRet = sub.reduce((a, t) => a * (1 + t.stratRet), 1) - 1;
    return {
      name,
      nTrades:   sub.length,
      winRate:   round4(wins / sub.length),
      avgReturn: round4(mn),
      cumReturn: round4(cumRet),
      sharpe:    round4(sh),
    };
  });
}

// ── Monthly macro score series for chart ──────────────────────────────────────

// Subsample daily macro score to monthly for charting.
// Includes instrument-specific allocation for shading.
function monthlyMacroScoreSeries(dates, macroScore, trades) {
  const allocMap = new Map(trades.map(t => [t.monthKey, t.alloc]));
  const seen = new Set();
  const result = [];
  for (let i = dates.length - 1; i >= 0; i--) {
    const mk = getMonthKey(dates[i]);
    if (seen.has(mk)) continue;
    seen.add(mk);
    result.push({
      date:  mk,
      score: isFinite(macroScore[i]) ? round4(macroScore[i]) : null,
      alloc: allocMap.has(mk) ? allocMap.get(mk) : null,
    });
  }
  return result.reverse();
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the full macro-regime-conditional equity backtest.
 *
 * @param {object} data - Aligned daily data:
 *   { dates: string[], qqq: {open, close}, spy: {open, close},
 *     vix: number[],
 *     fred: { walcl, wtregen, rrpontsyd, t10y2y, bamlh0a0hym2, dfii10, napm } }
 * @param {object} [config] - Overrides for ME_DEFAULT_CONFIG
 * @returns {object} Full backtest result
 */
export function runMacroEquityBacktest(data, config = {}) {
  const cfg = { ...ME_DEFAULT_CONFIG, ...config,
    weights: { ...ME_DEFAULT_CONFIG.weights, ...(config.weights ?? {}) } };

  const { dates } = data;
  const n = dates.length;

  // Build raw factors (forward-fill + publication lags + MA200 + momentum)
  const raw = buildRawFactors(data);

  // Rolling z-scores for full-sample backtest
  const { zWindow, vixWindow } = cfg;
  const netLiqZ    = rollingZscore(raw.netliqPct, zWindow);
  const curveZ     = rollingZscore(raw.curve,     zWindow);
  const creditZ    = rollingZscore(raw.credit,    zWindow);
  const realYieldZ = rollingZscore(raw.realYield, zWindow);
  const ismZ       = rollingZscore(raw.ism,        zWindow);
  const vixZ       = rollingZscore(raw.vix,        vixWindow);

  // Composite macro score
  const macroScore = compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ, cfg.weights);

  // Monthly bars for each instrument
  const qqqMonths = buildMonthly(dates, data.qqq.open, data.qqq.close, macroScore, vixZ, raw.qqqMA200, raw.qqqMom12m);
  const spyMonths = buildMonthly(dates, data.spy.open, data.spy.close,  macroScore, vixZ, raw.spyMA200, raw.spyMom12m);

  // Full-sample backtests
  const qqqResult = runMonthlyBacktest(qqqMonths, cfg);
  const spyResult = runMonthlyBacktest(spyMonths, cfg);

  // Metrics (monthly annualization)
  const totalQQQMonths = qqqMonths.length;
  const totalSPYMonths = spyMonths.length;
  const qqqMet = metrics(qqqResult.monthlyRets, qqqResult.equityCurve, totalQQQMonths, qqqResult.trades);
  const spyMet = metrics(spyResult.monthlyRets, spyResult.equityCurve, totalSPYMonths, spyResult.trades);
  const qqqBH  = bhMetrics(qqqResult.bhRets, qqqResult.bhCurve, totalQQQMonths);
  const spyBH  = bhMetrics(spyResult.bhRets, spyResult.bhCurve, totalSPYMonths);

  // Walk-forward validation
  const wf = runWalkForward(dates, raw, data.qqq, data.spy, raw.vix, cfg);

  // Regime breakdowns
  const qqqRegime = regimeBreakdown(qqqResult.trades);
  const spyRegime = regimeBreakdown(spyResult.trades);

  // Monthly macro score series with instrument-specific alloc shading
  const qqqMacroScore = monthlyMacroScoreSeries(dates, macroScore, qqqResult.trades);
  const spyMacroScore = monthlyMacroScoreSeries(dates, macroScore, spyResult.trades);

  // Drawdowns
  const qqqStratDD = drawdownSeries(qqqResult.equityCurve);
  const qqqBHDD    = drawdownSeries(qqqResult.bhCurve);
  const spyStratDD = drawdownSeries(spyResult.equityCurve);
  const spyBHDD    = drawdownSeries(spyResult.bhCurve);

  function verdict(met, bh, wfData) {
    const oosSh  = wfData.meanOOSSharpe;
    const wfeVal = wfData.wfe;
    const oosSPass = oosSh  >= 0.5;
    const wfePass  = wfeVal >= 0.5;
    const ddPass   = Math.abs(met.maxDD) < Math.abs(bh.maxDD);
    return {
      oosSharpe: { value: oosSh,  pass: oosSPass, target: 0.5 },
      wfe:       { value: wfeVal, pass: wfePass,  target: 0.5 },
      maxDD:     { strat: round4(met.maxDD), bh: round4(bh.maxDD), pass: ddPass },
      overallPass: oosSPass && wfePass && ddPass,
    };
  }

  function rndMet(m) {
    return {
      cagr:         round4(m.cagr),
      sharpe:       round4(m.sharpe),
      sortino:      round4(m.sortino),
      maxDD:        round4(m.maxDD),
      winRate:      round4(m.winRate),
      avgWin:       round4(m.avgWin),
      avgLoss:      round4(m.avgLoss),
      profitFactor: round4(m.profitFactor),
      calmar:       round4(m.calmar),
      timeInMarket: round4(m.timeInMarket),
      finalEquity:  round4(m.finalEquity),
      years:        round4(m.years),
      totalMonths:  m.totalMonths,
      nTrades:      m.nTrades,
    };
  }
  function rndBH(m) {
    return { cagr: round4(m.cagr), sharpe: round4(m.sharpe), maxDD: round4(m.maxDD), finalEquity: round4(m.finalEquity) };
  }
  function thinEquity(curve) {
    return curve.map(p => ({ date: p.date, equity: round4(p.equity) }));
  }
  function thinDD(curve) {
    return curve.map(p => ({ date: p.date, dd: round4(p.dd) }));
  }

  return {
    runAt:     new Date().toISOString(),
    dateRange: { start: dates[0], end: dates[n - 1] },
    nDays:     n,
    QQQ: {
      metrics:     rndMet(qqqMet),
      bh:          rndBH(qqqBH),
      equityCurve: thinEquity(qqqResult.equityCurve),
      bhCurve:     thinEquity(qqqResult.bhCurve),
      drawdown:    thinDD(qqqStratDD),
      bhDrawdown:  thinDD(qqqBHDD),
      macroScore:  qqqMacroScore,
      trades:      qqqResult.trades.map(t => ({
        monthKey:   t.monthKey,
        alloc:      round4(t.alloc),
        monOpen:    round4(t.monOpen),
        monClose:   round4(t.monClose),
        monthRet:   round4(t.monthRet),
        stratRet:   round4(t.stratRet),
        macroScore: round4(t.macroScore),
        vixZ:       round4(t.vixZ),
        volRegime:  t.volRegime,
        trendState: t.trendState,
        win:        t.win,
      })),
      walkForward: { ...wf.QQQ, windows: wf.windows },
      regime:      qqqRegime,
      verdict:     verdict(qqqMet, qqqBH, wf.QQQ),
    },
    SPY: {
      metrics:     rndMet(spyMet),
      bh:          rndBH(spyBH),
      equityCurve: thinEquity(spyResult.equityCurve),
      bhCurve:     thinEquity(spyResult.bhCurve),
      drawdown:    thinDD(spyStratDD),
      bhDrawdown:  thinDD(spyBHDD),
      macroScore:  spyMacroScore,
      trades:      spyResult.trades.map(t => ({
        monthKey:   t.monthKey,
        alloc:      round4(t.alloc),
        monOpen:    round4(t.monOpen),
        monClose:   round4(t.monClose),
        monthRet:   round4(t.monthRet),
        stratRet:   round4(t.stratRet),
        macroScore: round4(t.macroScore),
        vixZ:       round4(t.vixZ),
        volRegime:  t.volRegime,
        trendState: t.trendState,
        win:        t.win,
      })),
      walkForward: { ...wf.SPY, windows: wf.windows },
      regime:      spyRegime,
      verdict:     verdict(spyMet, spyBH, wf.SPY),
    },
  };
}
