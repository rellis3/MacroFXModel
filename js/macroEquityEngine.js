/**
 * macroEquityEngine.js
 * Macro-Regime-Conditional Equity Backtester — pure JS engine.
 * No I/O. Accepts aligned daily arrays, returns full backtest results.
 *
 * Strategy: 5-factor composite macro score (net liquidity, yield curve,
 * credit spreads, real yields, ISM PMI) + VIX regime gate → long/flat equity.
 * Rebalances weekly (Friday signal → Monday open entry → Friday close exit).
 */

// ── Default configuration ─────────────────────────────────────────────────────

export const ME_DEFAULT_CONFIG = {
  weights: { netLiq: 0.30, curve: 0.20, credit: 0.20, realYield: 0.15, ism: 0.15 },
  longThreshold:  0.5,   // macro score above this → LONG
  flatThreshold: -0.5,   // macro score below this → FLAT (neutral zone is flat too)
  vixZMax:        1.5,   // block entry if vixZ exceeds this
  zWindow:        252,   // rolling z-score lookback (trading days)
  vixWindow:       60,   // VIX z-score lookback
  wfTrain:        504,   // walk-forward train window (trading days ≈ 2 years)
  wfTest:          63,   // walk-forward test window (trading days ≈ 3 months)
  wfStep:          21,   // walk-forward step (trading days ≈ 1 month)
  costs:        0.0015,  // 0.15% round-trip (0.10% commission + 0.05% slippage)
  netLiqChangeDays: 21,  // pct-change period for net liquidity signal
};

// Publication lags in trading days applied AFTER forward-filling
const PUB_LAG_WEEKLY  = 5;   // WALCL, WTREGEN, RRPONTSYD, T10Y2Y, BAMLH0A0HYM2, DFII10
const PUB_LAG_MONTHLY = 21;  // NAPM (ISM PMI)

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

// Fixed z-score: params computed from training window [i0, i1), applied everywhere
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

// ── Factor construction ───────────────────────────────────────────────────────

// Build raw (unz-scored) factor arrays from aligned daily data.
// Applies forward-fill then publication lags.
// Returns object with factor series aligned to dates[].
function buildRawFactors(data) {
  const { fred } = data;

  // Forward-fill each FRED series
  const walcl        = fwdFill(fred.walcl);
  const wtregen      = fwdFill(fred.wtregen);
  const rrpontsyd    = fwdFill(fred.rrpontsyd);
  const t10y2y       = fwdFill(fred.t10y2y);
  const bamlh0a0hym2 = fwdFill(fred.bamlh0a0hym2);
  const dfii10       = fwdFill(fred.dfii10);
  const napm         = fwdFill(fred.napm);
  const vix          = fwdFill(data.vix);

  // Apply publication lags
  const walclLag     = applyLag(walcl,        PUB_LAG_WEEKLY);
  const wtregenLag   = applyLag(wtregen,       PUB_LAG_WEEKLY);
  const rrpoLag      = applyLag(rrpontsyd,     PUB_LAG_WEEKLY);
  const curveLag     = applyLag(t10y2y,        PUB_LAG_WEEKLY);
  const creditLag    = applyLag(bamlh0a0hym2,  PUB_LAG_WEEKLY);
  const realYieldLag = applyLag(dfii10,        PUB_LAG_WEEKLY);
  const ismLag       = applyLag(napm,          PUB_LAG_MONTHLY);

  // Net liquidity = WALCL - WTREGEN - RRPONTSYD, then 21d pct change
  const netliq = walclLag.map((w, i) => {
    const wt = wtregenLag[i], rr = rrpoLag[i];
    return (isFinite(w) && isFinite(wt) && isFinite(rr)) ? w - wt - rr : NaN;
  });
  const netliqPct = pctChange(netliq, ME_DEFAULT_CONFIG.netLiqChangeDays);

  return { netliqPct, curve: curveLag, credit: creditLag, realYield: realYieldLag, ism: ismLag, vix };
}

// Compute composite macro score from z-scored factors
function compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ, w) {
  const n = netLiqZ.length;
  const score = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = netLiqZ[i], b = curveZ[i], c = creditZ[i], d = realYieldZ[i], e = ismZ[i];
    // credit and real yield are inverted (rising = bearish)
    if ([a, b, c, d, e].every(isFinite)) {
      score[i] = a * w.netLiq + b * w.curve + (-c) * w.credit + (-d) * w.realYield + e * w.ism;
    } else {
      // partial score with available factors
      let ws = 0, wt = 0;
      if (isFinite(a)) { ws += a * w.netLiq;        wt += w.netLiq; }
      if (isFinite(b)) { ws += b * w.curve;          wt += w.curve; }
      if (isFinite(c)) { ws += (-c) * w.credit;      wt += w.credit; }
      if (isFinite(d)) { ws += (-d) * w.realYield;   wt += w.realYield; }
      if (isFinite(e)) { ws += e * w.ism;            wt += w.ism; }
      if (wt >= 0.5) score[i] = ws / wt;
    }
  }
  return score;
}

// ── Weekly bar construction ───────────────────────────────────────────────────

// Returns the "week-ending-Friday" date string for any given date
function friWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const toFri = dow === 0 ? 5 : dow === 6 ? 6 : 5 - dow;
  d.setUTCDate(d.getUTCDate() + toFri);
  return d.toISOString().substring(0, 10);
}

// Build weekly OHLC summary (Monday open, Friday close) for one instrument
// plus the Friday macro score and VIX z-score.
function buildWeekly(dates, open, close, macroScore, vixZ) {
  const weekMap = new Map();
  for (let i = 0; i < dates.length; i++) {
    const wk = friWeekKey(dates[i]);
    if (!weekMap.has(wk)) weekMap.set(wk, { first: i, last: i });
    else weekMap.get(wk).last = i;
  }

  const weeks = [];
  for (const [wk, { first, last }] of [...weekMap].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    weeks.push({
      weekEnd:    wk,
      monOpen:    open[first],
      friClose:   close[last],
      macroScore: macroScore[last],
      vixZ:       vixZ[last],
    });
  }
  return weeks;
}

// ── Position scalar ───────────────────────────────────────────────────────────

function posScalar(vixZ) {
  if (vixZ > 1.0)  return 0.25;
  if (vixZ < -0.5) return 1.00;
  return 0.75;
}

// ── Backtest ──────────────────────────────────────────────────────────────────

// Runs the weekly long/flat backtest on a weekly bars array.
// Returns { equityCurve, bhCurve, weeklyRets, bhRets, trades }
function runWeeklyBacktest(weeks, cfg) {
  const { longThreshold, vixZMax, costs } = cfg;

  const equityCurve = [{ date: weeks[0]?.weekEnd ?? '', equity: 1 }];
  const bhCurve     = [{ date: weeks[0]?.weekEnd ?? '', equity: 1 }];
  const weeklyRets  = [];
  const bhRets      = [];
  const trades      = [];

  let stratEq = 1, bhEq = 1;

  for (let i = 1; i < weeks.length; i++) {
    const sig  = weeks[i - 1];  // Friday signal (previous week's close)
    const curr = weeks[i];      // current week: enter Mon open, exit Fri close

    const mon = curr.monOpen, fri = curr.friClose;
    const weekRet = (isFinite(mon) && isFinite(fri) && mon > 0)
      ? (fri - mon) / mon : NaN;

    // B&H
    const bhRet = isFinite(weekRet) ? weekRet : 0;
    bhEq *= (1 + bhRet);
    bhRets.push(bhRet);
    bhCurve.push({ date: curr.weekEnd, equity: bhEq });

    // Strategy
    const score = sig.macroScore;
    const vz    = sig.vixZ;
    let stratRet = 0;
    let ps = 0;

    // If VIX z-score is missing, treat as NORMAL regime (allow entry at 0.75 scalar)
    const vixBlocked = isFinite(vz) && vz >= vixZMax;
    if (isFinite(score) && !vixBlocked && score > longThreshold && isFinite(weekRet)) {
      ps = isFinite(vz) ? posScalar(vz) : 0.75;
      stratRet = weekRet * ps - costs;

      const volReg = isFinite(vz) ? (vz > 1.0 ? 'HIGH' : vz < -0.5 ? 'LOW' : 'NORMAL') : 'NORMAL';
      trades.push({
        weekEnd:    curr.weekEnd,
        posScalar:  ps,
        monOpen:    mon,
        friClose:   fri,
        weekRet,
        stratRet,
        macroScore: score,
        vixZ:       vz,
        volRegime:  volReg,
        win:        stratRet > 0,
      });
    }

    stratEq *= (1 + stratRet);
    weeklyRets.push(stratRet);
    equityCurve.push({ date: curr.weekEnd, equity: stratEq });
  }

  return { equityCurve, bhCurve, weeklyRets, bhRets, trades };
}

// ── Performance metrics ───────────────────────────────────────────────────────

function drawdownSeries(equityCurve) {
  let peak = equityCurve[0].equity;
  return equityCurve.map(({ date, equity }) => {
    peak = Math.max(peak, equity);
    return { date, dd: (equity - peak) / peak };
  });
}

function metrics(weeklyRets, equityCurve, totalWeeks, trades) {
  const n = weeklyRets.length;
  if (!n) return {};

  const finalEq = equityCurve[equityCurve.length - 1].equity;
  const years   = totalWeeks / 52;
  const cagr    = Math.pow(finalEq, 1 / years) - 1;

  const mn = weeklyRets.reduce((a, r) => a + r, 0) / n;
  const vr = weeklyRets.reduce((a, r) => a + (r - mn) ** 2, 0) / n;
  const sd = Math.sqrt(vr);
  const sharpe = sd > 1e-10 ? mn / sd * Math.sqrt(52) : 0;

  const dn = weeklyRets.filter(r => r < 0);
  const dsv = dn.length ? Math.sqrt(dn.reduce((a, r) => a + r * r, 0) / dn.length) : 1e-10;
  const sortino = mn / dsv * Math.sqrt(52);

  let peak = equityCurve[0].equity, maxDD = 0;
  for (const { equity } of equityCurve) {
    peak = Math.max(peak, equity);
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  const wins  = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const avgWin  = wins.length   ? wins.reduce((a, t) => a + t.stratRet, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.stratRet, 0) / losses.length : 0;

  const grossWin  = wins.reduce((a, t) => a + t.stratRet, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.stratRet, 0));
  const profitFactor = grossLoss > 1e-10 ? grossWin / grossLoss : Infinity;

  const calmar = maxDD < -1e-10 ? cagr / Math.abs(maxDD) : Infinity;

  return {
    cagr, sharpe, sortino, maxDD,
    winRate, avgWin, avgLoss, profitFactor, calmar,
    timeInMarket: totalWeeks > 0 ? trades.length / totalWeeks : 0,
    finalEquity: finalEq, years, totalWeeks, nTrades: trades.length,
  };
}

function bhMetrics(bhRets, bhCurve, totalWeeks) {
  const n = bhRets.length;
  if (!n) return {};

  const finalEq = bhCurve[bhCurve.length - 1].equity;
  const years   = totalWeeks / 52;
  const cagr    = Math.pow(finalEq, 1 / years) - 1;

  const mn = bhRets.reduce((a, r) => a + r, 0) / n;
  const vr = bhRets.reduce((a, r) => a + (r - mn) ** 2, 0) / n;
  const sd = Math.sqrt(vr);
  const sharpe = sd > 1e-10 ? mn / sd * Math.sqrt(52) : 0;

  let peak = bhCurve[0].equity, maxDD = 0;
  for (const { equity } of bhCurve) {
    peak = Math.max(peak, equity);
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  return { cagr, sharpe, maxDD, finalEquity: finalEq, years };
}

// ── Walk-forward validation ───────────────────────────────────────────────────

function wfSharpe(weeklyRets) {
  const n = weeklyRets.length;
  if (n < 4) return 0;
  const mn = weeklyRets.reduce((a, r) => a + r, 0) / n;
  const vr = weeklyRets.reduce((a, r) => a + (r - mn) ** 2, 0) / n;
  const sd = Math.sqrt(vr);
  return sd > 1e-10 ? mn / sd * Math.sqrt(52) : 0;
}

function runWalkForward(dates, rawFactors, qqq, spy, vix, cfg) {
  const n = dates.length;
  const { wfTrain, wfTest, wfStep, weights, longThreshold, vixZMax, costs, vixWindow, zWindow } = cfg;

  const windows     = [];
  const qqqOosRets  = []; // { ret, date }[]
  const spyOosRets  = []; // { ret, date }[]

  for (let start = 0; start + wfTrain + wfTest <= n; start += wfStep) {
    const trainEnd = start + wfTrain;
    const testEnd  = Math.min(start + wfTrain + wfTest, n);

    // Compute fixed z-score params from training window only
    const netLiqZ    = fixedZscore(rawFactors.netliqPct, start, trainEnd);
    const curveZ     = fixedZscore(rawFactors.curve,     start, trainEnd);
    const creditZ    = fixedZscore(rawFactors.credit,    start, trainEnd);
    const realYieldZ = fixedZscore(rawFactors.realYield, start, trainEnd);
    const ismZ       = fixedZscore(rawFactors.ism,       start, trainEnd);
    const vixZ       = fixedZscore(vix,                  start, trainEnd);

    const macroScore = compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ, weights);

    // Build weekly bars for QQQ and SPY (over full range but we'll slice to windows)
    const qqqWeeks = buildWeekly(dates, qqq.open, qqq.close, macroScore, vixZ);
    const spyWeeks = buildWeekly(dates, spy.open, spy.close,  macroScore, vixZ);

    // Slice train and test weekly bars by date range
    const trainStartDate = dates[start];
    const trainEndDate   = dates[trainEnd - 1];
    const testStartDate  = dates[trainEnd];
    const testEndDate    = dates[testEnd - 1];

    const qqqTrain = qqqWeeks.filter(w => w.weekEnd >= trainStartDate && w.weekEnd <= trainEndDate);
    const qqqTest  = qqqWeeks.filter(w => w.weekEnd >  trainEndDate   && w.weekEnd <= testEndDate);
    const spyTrain = spyWeeks.filter(w => w.weekEnd >= trainStartDate && w.weekEnd <= trainEndDate);
    const spyTest  = spyWeeks.filter(w => w.weekEnd >  trainEndDate   && w.weekEnd <= testEndDate);

    if (qqqTrain.length < 10 || qqqTest.length < 2) continue;

    const qqqISResult = runWeeklyBacktest([...qqqTrain], cfg);
    const qqqOSResult = runWeeklyBacktest([qqqTrain[qqqTrain.length - 1], ...qqqTest], cfg);
    const spyISResult = runWeeklyBacktest([...spyTrain], cfg);
    const spyOSResult = runWeeklyBacktest([spyTrain[spyTrain.length - 1], ...spyTest], cfg);

    const qqqISsharpe  = wfSharpe(qqqISResult.weeklyRets);
    const qqqOOSsharpe = wfSharpe(qqqOSResult.weeklyRets);
    const spyISsharpe  = wfSharpe(spyISResult.weeklyRets);
    const spyOOSsharpe = wfSharpe(spyOSResult.weeklyRets);

    const qqqOosRet = qqqOSResult.equityCurve.length > 1
      ? qqqOSResult.equityCurve[qqqOSResult.equityCurve.length - 1].equity - 1 : 0;
    const spyOosRet = spyOSResult.equityCurve.length > 1
      ? spyOSResult.equityCurve[spyOSResult.equityCurve.length - 1].equity - 1 : 0;

    windows.push({
      trainStart: trainStartDate,
      trainEnd:   trainEndDate,
      testStart:  testStartDate,
      testEnd:    testEndDate,
      qqqISSharpe: round4(qqqISsharpe),
      qqqOOSSharpe: round4(qqqOOSsharpe),
      qqqOosReturn: round4(qqqOosRet),
      spyISSharpe: round4(spyISsharpe),
      spyOOSSharpe: round4(spyOOSsharpe),
      spyOosReturn: round4(spyOosRet),
    });

    // Collect OOS (weekly returns + equity curve dates) for stitched curve
    for (let ri = 0; ri < qqqOSResult.weeklyRets.length; ri++) {
      const date = qqqTest[ri]?.weekEnd ?? testEndDate;
      qqqOosRets.push({ ret: qqqOSResult.weeklyRets[ri], date });
      spyOosRets.push({ ret: spyOSResult.weeklyRets[ri], date: spyTest[ri]?.weekEnd ?? testEndDate });
    }
  }

  // Stitched OOS equity curve
  const qqqOosCurve = stitchCurve(qqqOosRets);
  const spyOosCurve = stitchCurve(spyOosRets);

  const qqqMeanOOS = windows.length ? windows.reduce((a, w) => a + w.qqqOOSSharpe, 0) / windows.length : 0;
  const qqqMeanIS  = windows.length ? windows.reduce((a, w) => a + w.qqqISSharpe,  0) / windows.length : 0;
  const spyMeanOOS = windows.length ? windows.reduce((a, w) => a + w.spyOOSSharpe, 0) / windows.length : 0;
  const spyMeanIS  = windows.length ? windows.reduce((a, w) => a + w.spyISSharpe,  0) / windows.length : 0;

  return {
    windows,
    QQQ: {
      oosCurve: qqqOosCurve,
      meanOOSSharpe: round4(qqqMeanOOS),
      meanISSharpe:  round4(qqqMeanIS),
      wfe: round4(qqqMeanIS > 1e-6 ? qqqMeanOOS / qqqMeanIS : 0),
    },
    SPY: {
      oosCurve: spyOosCurve,
      meanOOSSharpe: round4(spyMeanOOS),
      meanISSharpe:  round4(spyMeanIS),
      wfe: round4(spyMeanIS > 1e-6 ? spyMeanOOS / spyMeanIS : 0),
    },
  };
}

// Stitch { ret, date }[] into a continuous equity curve with dates
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

function round4(v) {
  return isFinite(v) ? Math.round(v * 10000) / 10000 : 0;
}

// ── Regime breakdown ──────────────────────────────────────────────────────────

function regimeBreakdown(trades, weeks) {
  const regimes = [
    { name: 'VIX LOW  (<−0.5)',   filter: t => t.vixZ < -0.5  },
    { name: 'VIX NORMAL',         filter: t => t.vixZ >= -0.5 && t.vixZ <= 1.0 },
    { name: 'VIX HIGH  (>1.0)',   filter: t => t.vixZ > 1.0   },
    { name: 'Macro Score >1',     filter: t => t.macroScore > 1.0 },
    { name: 'Macro Score 0.5–1',  filter: t => t.macroScore >= 0.5 && t.macroScore <= 1.0 },
  ];

  return regimes.map(({ name, filter }) => {
    const sub = trades.filter(filter);
    if (!sub.length) return { name, nTrades: 0, winRate: 0, avgReturn: 0, sharpe: 0 };
    const rts   = sub.map(t => t.stratRet);
    const mn    = rts.reduce((a, r) => a + r, 0) / rts.length;
    const vr    = rts.reduce((a, r) => a + (r - mn) ** 2, 0) / rts.length;
    const sd    = Math.sqrt(vr);
    const sh    = sd > 1e-10 ? mn / sd * Math.sqrt(52) : 0;
    const wins  = sub.filter(t => t.win).length;
    const cumRet = sub.reduce((a, t) => a * (1 + t.stratRet), 1) - 1;
    return {
      name,
      nTrades: sub.length,
      winRate:   round4(wins / sub.length),
      avgReturn: round4(mn),
      cumReturn: round4(cumRet),
      sharpe:    round4(sh),
    };
  });
}

// ── Macro score daily series (for chart) ─────────────────────────────────────

// Subsample daily macro score to weekly for charting (too many points otherwise)
function weeklyMacroScoreSeries(dates, macroScore, investedWeeks) {
  const invested = new Set(investedWeeks);
  const seen = new Set();
  const result = [];
  for (let i = 0; i < dates.length; i++) {
    const wk = friWeekKey(dates[i]);
    if (seen.has(wk)) continue;
    seen.add(wk);
    result.push({
      date:     wk,
      score:    isFinite(macroScore[i]) ? round4(macroScore[i]) : null,
      invested: invested.has(wk),
    });
  }
  return result;
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

  // 1. Build raw factors (forward-fill + publication lags applied)
  const raw = buildRawFactors(data);

  // 2. Rolling z-scores for full-sample backtest
  const { zWindow, vixWindow } = cfg;
  const netLiqZ    = rollingZscore(raw.netliqPct, zWindow);
  const curveZ     = rollingZscore(raw.curve,     zWindow);
  const creditZ    = rollingZscore(raw.credit,    zWindow);
  const realYieldZ = rollingZscore(raw.realYield, zWindow);
  const ismZ       = rollingZscore(raw.ism,        zWindow);
  const vixZ       = rollingZscore(raw.vix,        vixWindow);

  // 3. Composite macro score
  const macroScore = compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ, cfg.weights);

  // 4. Build weekly bars
  const qqqWeeks = buildWeekly(dates, data.qqq.open, data.qqq.close, macroScore, vixZ);
  const spyWeeks = buildWeekly(dates, data.spy.open, data.spy.close,  macroScore, vixZ);

  // 5. Run full-sample backtest
  const qqqResult = runWeeklyBacktest(qqqWeeks, cfg);
  const spyResult = runWeeklyBacktest(spyWeeks, cfg);

  // 6. Compute metrics
  const qqqMet = metrics(qqqResult.weeklyRets, qqqResult.equityCurve, qqqWeeks.length, qqqResult.trades);
  const spyMet = metrics(spyResult.weeklyRets, spyResult.equityCurve, spyWeeks.length, spyResult.trades);
  const qqqBH  = bhMetrics(qqqResult.bhRets, qqqResult.bhCurve, qqqWeeks.length);
  const spyBH  = bhMetrics(spyResult.bhRets, spyResult.bhCurve, spyWeeks.length);

  // 7. Drawdown series
  const qqqStratDD = drawdownSeries(qqqResult.equityCurve);
  const qqqBHDD    = drawdownSeries(qqqResult.bhCurve);
  const spyStratDD = drawdownSeries(spyResult.equityCurve);
  const spyBHDD    = drawdownSeries(spyResult.bhCurve);

  // 8. Walk-forward validation (compute on raw factors, uses fixed z-scores per window)
  const wf = runWalkForward(dates, raw, data.qqq, data.spy, raw.vix, cfg);

  // 9. Regime breakdowns
  const qqqRegime = regimeBreakdown(qqqResult.trades, qqqWeeks);
  const spyRegime = regimeBreakdown(spyResult.trades, spyWeeks);

  // 10. Macro score series (weekly, for chart)
  const qqqInvestedWeeks = new Set(qqqResult.trades.map(t => t.weekEnd));
  const spyInvestedWeeks = new Set(spyResult.trades.map(t => t.weekEnd));
  const macroScoreSeries = weeklyMacroScoreSeries(dates, macroScore, qqqInvestedWeeks);

  // 11. Verdict
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

  // Round metrics for output
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
      totalWeeks:   m.totalWeeks,
      nTrades:      m.nTrades,
    };
  }
  function rndBH(m) {
    return { cagr: round4(m.cagr), sharpe: round4(m.sharpe), maxDD: round4(m.maxDD), finalEquity: round4(m.finalEquity) };
  }

  // Thin the equity/dd curves to weekly resolution (already weekly)
  function thinEquity(curve) {
    return curve.map(p => ({ date: p.date, equity: round4(p.equity) }));
  }
  function thinDD(curve) {
    return curve.map(p => ({ date: p.date, dd: round4(p.dd) }));
  }
  function thinBH(curve) {
    return curve.map(p => ({ date: p.date, equity: round4(p.equity) }));
  }

  return {
    runAt:     new Date().toISOString(),
    dateRange: { start: dates[0], end: dates[n - 1] },
    nDays:     n,
    QQQ: {
      metrics:        rndMet(qqqMet),
      bh:             rndBH(qqqBH),
      equityCurve:    thinEquity(qqqResult.equityCurve),
      bhCurve:        thinBH(qqqResult.bhCurve),
      drawdown:       thinDD(qqqStratDD),
      bhDrawdown:     thinDD(qqqBHDD),
      macroScore:     macroScoreSeries,
      trades:         qqqResult.trades.map(t => ({
        weekEnd:    t.weekEnd,
        posScalar:  t.posScalar,
        monOpen:    round4(t.monOpen),
        friClose:   round4(t.friClose),
        weekRet:    round4(t.weekRet),
        stratRet:   round4(t.stratRet),
        macroScore: round4(t.macroScore),
        vixZ:       round4(t.vixZ),
        volRegime:  t.volRegime,
        win:        t.win,
      })),
      walkForward:    { ...wf.QQQ, windows: wf.windows },
      regime:         qqqRegime,
      verdict:        verdict(qqqMet, qqqBH, wf.QQQ),
    },
    SPY: {
      metrics:        rndMet(spyMet),
      bh:             rndBH(spyBH),
      equityCurve:    thinEquity(spyResult.equityCurve),
      bhCurve:        thinBH(spyResult.bhCurve),
      drawdown:       thinDD(spyStratDD),
      bhDrawdown:     thinDD(spyBHDD),
      macroScore:     macroScoreSeries,
      trades:         spyResult.trades.map(t => ({
        weekEnd:    t.weekEnd,
        posScalar:  t.posScalar,
        monOpen:    round4(t.monOpen),
        friClose:   round4(t.friClose),
        weekRet:    round4(t.weekRet),
        stratRet:   round4(t.stratRet),
        macroScore: round4(t.macroScore),
        vixZ:       round4(t.vixZ),
        volRegime:  t.volRegime,
        win:        t.win,
      })),
      walkForward:    { ...wf.SPY, windows: wf.windows },
      regime:         spyRegime,
      verdict:        verdict(spyMet, spyBH, wf.SPY),
    },
  };
}
