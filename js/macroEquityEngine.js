/**
 * macroEquityEngine.js — v3
 * Macro-Regime-Conditional Equity Backtester — pure JS engine.
 * N-instrument support: QQQ, SPY, Russell 2000, DAX (EU mode), optional TLT (inverted bond hedge).
 * Multi-state allocation · 200-day MA trend filter · Monthly rebalancing.
 */

// ── Default configuration ─────────────────────────────────────────────────────

export const ME_DEFAULT_CONFIG = {
  weights: { netLiq: 0.40, curve: 0.20, credit: 0.20, realYield: 0.15, ism: 0.05 },
  highBand:  1.0,    // score > this → 100% base allocation
  midBand:   0.0,    // score > this → 75%
  lowBand:  -1.0,    // score > this → 50%; below = 25%
  allocFloor:         0.50,  // min alloc for standard (equity) instruments
  invertedAllocFloor: 0.15,  // min alloc for inverted (bond hedge) instruments
  zWindow:   252,
  vixWindow:  60,
  ma200Period: 200,
  wfTrain:   504,
  wfTest:    252,    // ~12 monthly bars for meaningful OOS Sharpe
  wfStep:     63,    // quarterly
  costs:     0.001,  // 0.10% per month proportional to allocation change
  netLiqChangeDays: 21,
};

const PUB_LAG_WEEKLY  = 5;
const PUB_LAG_MONTHLY = 21;

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
    if (isFinite(arr[i]) && isFinite(prev) && Math.abs(prev) > 1e-10)
      out[i] = (arr[i] - prev) / Math.abs(prev);
  }
  return out;
}

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
    const mn = s / cnt;
    const vr = Math.max(s2 / cnt - mn * mn, 1e-12);
    z[i] = (arr[i] - mn) / Math.sqrt(vr);
  }
  return z;
}

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

function round4(v) { return isFinite(v) ? Math.round(v * 10000) / 10000 : 0; }

// Simple moving average (requires 80% of period to be valid)
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
// data.instruments is a dict of { key: { open, close, label, inverted } }
function buildRawFactors(data) {
  const { fred } = data;

  const walcl        = fwdFill(fred.walcl);
  const wtregen      = fwdFill(fred.wtregen);
  const rrpontsyd    = fwdFill(fred.rrpontsyd);
  const t10y2y       = fwdFill(fred.t10y2y);
  const bamlh0a0hym2 = fwdFill(fred.bamlh0a0hym2);
  const dfii10       = fwdFill(fred.dfii10);
  const napm         = fwdFill(fred.napm);
  const eupmi        = fwdFill(fred.eupmi  ?? new Array(napm.length).fill(NaN));
  const vix          = fwdFill(data.vix);

  const walclLag     = applyLag(walcl,        PUB_LAG_WEEKLY);
  const wtregenLag   = applyLag(wtregen,       PUB_LAG_WEEKLY);
  const rrpoLag      = applyLag(rrpontsyd,     PUB_LAG_WEEKLY);
  const curveLag     = applyLag(t10y2y,        PUB_LAG_WEEKLY);
  const creditLag    = applyLag(bamlh0a0hym2,  PUB_LAG_WEEKLY);
  const realYieldLag = applyLag(dfii10,        PUB_LAG_WEEKLY);
  const ismLag       = applyLag(napm,          PUB_LAG_MONTHLY);
  const ismEULag     = applyLag(eupmi,         PUB_LAG_MONTHLY);

  const netliq = walclLag.map((w, i) => {
    const wt = wtregenLag[i], rr = rrpoLag[i];
    return (isFinite(w) && isFinite(wt) && isFinite(rr)) ? w - wt - rr : NaN;
  });
  const netliqPct = pctChange(netliq, ME_DEFAULT_CONFIG.netLiqChangeDays);

  // Per-instrument 200-day MA and 12-month momentum
  const instFactors = {};
  for (const [key, inst] of Object.entries(data.instruments)) {
    instFactors[key] = {
      ma200:  computeMA(inst.close, 200),
      mom12m: pctChange(inst.close, 252),
    };
  }

  return {
    netliqPct,
    curve:     curveLag,
    credit:    creditLag,
    realYield: realYieldLag,
    ism:       ismLag,
    ismEU:     ismEULag,
    vix,
    instruments: instFactors,
  };
}

// Composite macro score from z-scored factors.
// Credit and real yield are inverted (rising = bearish).
function compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ, w) {
  const n = netLiqZ.length;
  const score = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = netLiqZ[i], b = curveZ[i], c = creditZ[i], d = realYieldZ[i], e = ismZ[i];
    if ([a, b, c, d, e].every(isFinite)) {
      score[i] = a * w.netLiq + b * w.curve + (-c) * w.credit + (-d) * w.realYield + e * w.ism;
    } else {
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

function getMonthKey(dateStr) { return dateStr.substring(0, 7); }

// Group daily bars into calendar months.
// If inverted=true, the macroScore is negated (bond hedge: high alloc when macro is weak).
function buildMonthly(dates, open, close, macroScore, vixZ, ma200arr, mom12marr, inverted = false) {
  const monthMap = new Map();
  for (let i = 0; i < dates.length; i++) {
    const mk = getMonthKey(dates[i]);
    if (!monthMap.has(mk)) monthMap.set(mk, { first: i, last: i });
    else monthMap.get(mk).last = i;
  }
  const months = [];
  for (const [mk, { first, last }] of [...monthMap].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const rawScore = macroScore[last];
    months.push({
      monthKey:   mk,
      monOpen:    open[first],
      monClose:   close[last],
      macroScore: isFinite(rawScore) ? (inverted ? -rawScore : rawScore) : NaN,
      vixZ:       vixZ[last],
      closePrice: close[last],
      ma200:      ma200arr[last],
      mom12m:     mom12marr[last],
    });
  }
  return months;
}

// ── Allocation function ───────────────────────────────────────────────────────

function computeAlloc(score, vixZ, closePrice, ma200Price, mom12mVal, cfg) {
  const { highBand, midBand, lowBand } = cfg;

  let base;
  if (score > highBand)     base = 1.00;
  else if (score > midBand) base = 0.75;
  else if (score > lowBand) base = 0.50;
  else                      base = 0.25;

  let trendFactor = 1.0;
  if (isFinite(ma200Price) && isFinite(closePrice)) {
    const aboveMA = closePrice > ma200Price;
    const posMom  = isFinite(mom12mVal) ? mom12mVal > 0 : true;
    if (aboveMA && posMom)      trendFactor = 1.00;
    else if (aboveMA || posMom) trendFactor = 0.80;
    else                        trendFactor = 0.55;
  }

  let vixFactor = 1.0;
  if (isFinite(vixZ)) {
    if (vixZ < -0.5)      vixFactor = 1.00;
    else if (vixZ < 0.75) vixFactor = 0.85;
    else if (vixZ < 1.5)  vixFactor = 0.60;
    else                  vixFactor = 0.30;
  }

  const floor = isFinite(cfg.allocFloor) ? cfg.allocFloor : 0.50;
  return Math.max(floor, Math.min(1.0, base * trendFactor * vixFactor));
}

// ── Monthly backtest ──────────────────────────────────────────────────────────

// floorOverride: use for inverted (bond) instruments to override the equity floor.
function runMonthlyBacktest(months, cfg, floorOverride = null) {
  const { costs } = cfg;
  const effectiveCfg = floorOverride != null ? { ...cfg, allocFloor: floorOverride } : cfg;

  const equityCurve = [{ date: months[0]?.monthKey ?? '', equity: 1 }];
  const bhCurve     = [{ date: months[0]?.monthKey ?? '', equity: 1 }];
  const monthlyRets = [];
  const bhRets      = [];
  const trades      = [];

  let stratEq = 1, bhEq = 1;
  let prevAlloc = 0;

  for (let i = 1; i < months.length; i++) {
    const sig  = months[i - 1];
    const curr = months[i];

    const monthRet = (isFinite(curr.monOpen) && isFinite(curr.monClose) && curr.monOpen > 0)
      ? (curr.monClose - curr.monOpen) / curr.monOpen : NaN;

    const bhRet = isFinite(monthRet) ? monthRet : 0;
    bhEq *= (1 + bhRet);
    bhRets.push(bhRet);
    bhCurve.push({ date: curr.monthKey, equity: bhEq });

    const score = sig.macroScore;
    const alloc = isFinite(score)
      ? computeAlloc(score, sig.vixZ, sig.closePrice, sig.ma200, sig.mom12m, effectiveCfg)
      : (effectiveCfg.allocFloor ?? 0.50);

    const allocDelta = Math.abs(alloc - prevAlloc);
    const txCost = allocDelta > 0.05 ? costs * allocDelta : 0;

    let stratRet = 0;
    if (isFinite(monthRet)) stratRet = alloc * monthRet - txCost;

    stratEq *= (1 + stratRet);
    monthlyRets.push(stratRet);
    equityCurve.push({ date: curr.monthKey, equity: stratEq });

    const vz = sig.vixZ;
    const volReg = !isFinite(vz) ? 'NORMAL'
      : vz >= 1.5 ? 'EXTREME' : vz >= 0.75 ? 'HIGH' : vz < -0.5 ? 'LOW' : 'NORMAL';
    const aboveMA    = isFinite(sig.ma200) && isFinite(sig.closePrice) && sig.closePrice > sig.ma200;
    const trendState = !isFinite(sig.ma200) ? 'N/A' : aboveMA ? 'ABOVE MA' : 'BELOW MA';

    trades.push({
      monthKey: curr.monthKey, alloc,
      monOpen: curr.monOpen, monClose: curr.monClose,
      monthRet, stratRet, macroScore: score,
      vixZ: sig.vixZ, volRegime: volReg, trendState,
      win: stratRet > 0,
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

function metrics(monthlyRets, equityCurve, totalMonths, trades) {
  const n = monthlyRets.length;
  if (!n) return {};
  const finalEq = equityCurve[equityCurve.length - 1].equity;
  const years   = totalMonths / 12;
  const cagr    = Math.pow(finalEq, 1 / years) - 1;

  const mn = monthlyRets.reduce((a, r) => a + r, 0) / n;
  const vr = monthlyRets.reduce((a, r) => a + (r - mn) ** 2, 0) / n;
  const sd = Math.sqrt(vr);
  const sharpe  = sd > 1e-10 ? mn / sd * Math.sqrt(12) : 0;

  const dn  = monthlyRets.filter(r => r < 0);
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
  const winRate      = trades.length ? wins.length / trades.length : 0;
  const avgWin       = wins.length   ? wins.reduce((a, t) => a + t.stratRet, 0) / wins.length : 0;
  const avgLoss      = losses.length ? losses.reduce((a, t) => a + t.stratRet, 0) / losses.length : 0;
  const grossWin     = wins.reduce((a, t) => a + t.stratRet, 0);
  const grossLoss    = Math.abs(losses.reduce((a, t) => a + t.stratRet, 0));
  const profitFactor = grossLoss > 1e-10 ? grossWin / grossLoss : Infinity;
  const calmar       = maxDD < -1e-10 ? cagr / Math.abs(maxDD) : Infinity;
  const timeInMarket = trades.length ? trades.reduce((a, t) => a + t.alloc, 0) / trades.length : 0;

  return { cagr, sharpe, sortino, maxDD, winRate, avgWin, avgLoss, profitFactor, calmar,
    timeInMarket, finalEquity: finalEq, years, totalMonths, nTrades: trades.length };
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

// Generic N-instrument walk-forward.
// instruments = { KEY: { open, close, inverted, label } }
function runWalkForward(dates, rawFactors, instruments, vix, cfg) {
  const n = dates.length;
  const { wfTrain, wfTest, wfStep, weights } = cfg;

  const windows     = [];
  const instOosRets = {};
  for (const key of Object.keys(instruments)) instOosRets[key] = [];

  for (let start = 0; start + wfTrain + wfTest <= n; start += wfStep) {
    const trainEnd = start + wfTrain;
    const testEnd  = Math.min(start + wfTrain + wfTest, n);

    const netLiqZ    = fixedZscore(rawFactors.netliqPct, start, trainEnd);
    const curveZ     = fixedZscore(rawFactors.curve,     start, trainEnd);
    const creditZ    = fixedZscore(rawFactors.credit,    start, trainEnd);
    const realYieldZ = fixedZscore(rawFactors.realYield, start, trainEnd);
    const vixZ       = fixedZscore(vix,                  start, trainEnd);
    // Lazy per-ISM-mode macro score — computed once per window per mode
    let macroScoreUS = null;
    let macroScoreEU = null;
    const getMacroScore = (euMode) => {
      if (euMode) {
        if (!macroScoreEU) {
          const ismEUZ = fixedZscore(rawFactors.ismEU, start, trainEnd);
          macroScoreEU = compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismEUZ, weights);
        }
        return macroScoreEU;
      }
      if (!macroScoreUS) {
        const ismZ = fixedZscore(rawFactors.ism, start, trainEnd);
        macroScoreUS = compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ, weights);
      }
      return macroScoreUS;
    };

    const trainStartDate = dates[start];
    const trainEndDate   = dates[trainEnd - 1];
    const testStartDate  = dates[trainEnd];
    const testEndDate    = dates[testEnd - 1];
    const trainStartMK   = getMonthKey(trainStartDate);
    const trainEndMK     = getMonthKey(trainEndDate);
    const testEndMK      = getMonthKey(testEndDate);

    const windowEntry = { trainStart: trainStartDate, trainEnd: trainEndDate,
      testStart: testStartDate, testEnd: testEndDate };
    let hasEnoughData = false;

    for (const [key, inst] of Object.entries(instruments)) {
      const instF    = rawFactors.instruments[key];
      const inverted = inst.inverted ?? false;
      const floor    = inverted ? (cfg.invertedAllocFloor ?? 0.15) : (cfg.allocFloor ?? 0.50);
      const macroScore = getMacroScore(inst.euMode ?? false);

      const allMonths = buildMonthly(dates, inst.open, inst.close, macroScore, vixZ,
        instF.ma200, instF.mom12m, inverted);

      const trainMonths = allMonths.filter(m => m.monthKey >= trainStartMK && m.monthKey <= trainEndMK);
      const testMonths  = allMonths.filter(m => m.monthKey >  trainEndMK   && m.monthKey <= testEndMK);

      if (trainMonths.length < 10 || testMonths.length < 2) continue;
      hasEnoughData = true;

      const isResult = runMonthlyBacktest([...trainMonths], cfg, floor);
      const osResult = runMonthlyBacktest([trainMonths[trainMonths.length - 1], ...testMonths], cfg, floor);

      const isSh  = wfSharpe(isResult.monthlyRets);
      const oosSh = wfSharpe(osResult.monthlyRets);
      const oosRt = osResult.equityCurve.length > 1
        ? osResult.equityCurve[osResult.equityCurve.length - 1].equity - 1 : 0;

      windowEntry[`${key}ISSharpe`]  = round4(isSh);
      windowEntry[`${key}OOSSharpe`] = round4(oosSh);
      windowEntry[`${key}OosReturn`] = round4(oosRt);

      for (let ri = 0; ri < osResult.monthlyRets.length; ri++) {
        const date = testMonths[ri]?.monthKey ?? testEndDate;
        instOosRets[key].push({ ret: osResult.monthlyRets[ri], date });
      }
    }

    if (hasEnoughData) windows.push(windowEntry);
  }

  const wfResult = { windows };
  for (const key of Object.keys(instruments)) {
    const oosCurve = stitchCurve(instOosRets[key]);
    const meanOOS  = windows.length ? windows.reduce((a, w) => a + (w[`${key}OOSSharpe`] ?? 0), 0) / windows.length : 0;
    const meanIS   = windows.length ? windows.reduce((a, w) => a + (w[`${key}ISSharpe`]  ?? 0), 0) / windows.length : 0;
    wfResult[key] = {
      oosCurve,
      meanOOSSharpe: round4(meanOOS),
      meanISSharpe:  round4(meanIS),
      wfe: round4(meanIS > 1e-6 ? meanOOS / meanIS : 0),
    };
  }

  return wfResult;
}

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
    return { name, nTrades: sub.length,
      winRate: round4(wins / sub.length), avgReturn: round4(mn),
      cumReturn: round4(cumRet), sharpe: round4(sh) };
  });
}

// ── Portfolio combiner ────────────────────────────────────────────────────────

// Combines equity instruments + one inverted bond instrument into a unified
// portfolio where equity_alloc is driven by the primary equity's macro signal
// and bond_alloc = 1 - equity_alloc (always fully deployed).
function buildPortfolioResult(equityKeys, bondKey, result, cfg) {
  const primaryKey = equityKeys[0];
  const eqMaps  = Object.fromEntries(equityKeys.map(k =>
    [k, new Map(result[k].trades.map(t => [t.monthKey, t]))]));
  const bondMap = new Map(result[bondKey].trades.map(t => [t.monthKey, t]));

  // Common months across all instruments
  const commonMonths = [...eqMaps[primaryKey].keys()]
    .filter(mk => equityKeys.every(k => eqMaps[k].has(mk)) && bondMap.has(mk))
    .sort();

  if (commonMonths.length < 12) return null;

  const portRets   = [];
  const bhRets     = [];
  const portCurve  = [{ date: commonMonths[0], equity: 1 }];
  const bhCurve    = [{ date: commonMonths[0], equity: 1 }];
  const portTrades = [];
  let portEq = 1, bhEq = 1, prevAlloc = null;

  for (const mk of commonMonths) {
    const primaryT  = eqMaps[primaryKey].get(mk);
    const bondT     = bondMap.get(mk);
    if (!primaryT || !bondT) continue;

    const rawEquityAlloc = primaryT.alloc;
    // Apply TLT floor: bond always gets at least invertedAllocFloor of the portfolio
    const bondFloor   = cfg.invertedAllocFloor ?? 0.15;
    const bondAlloc   = Math.max(bondFloor, 1 - rawEquityAlloc);
    const equityAlloc = 1 - bondAlloc;  // equity is the remainder after bond floor

    // Average monthly return across all equity instruments
    let avgEqRet = 0, nEq = 0;
    for (const k of equityKeys) {
      const t = eqMaps[k].get(mk);
      if (t && isFinite(t.monthRet)) { avgEqRet += t.monthRet; nEq++; }
    }
    if (nEq > 0) avgEqRet /= nEq;

    const bondRet = isFinite(bondT.monthRet) ? bondT.monthRet : 0;

    let portRet = equityAlloc * avgEqRet + bondAlloc * bondRet;
    if (prevAlloc !== null && Math.abs(equityAlloc - prevAlloc) > 0.05)
      portRet -= cfg.costs * Math.abs(equityAlloc - prevAlloc);
    prevAlloc = equityAlloc;

    // B&H: equal-weight static across all instruments, no rebalancing cost
    const nInst  = equityKeys.length + 1;
    const bhRet  = (equityKeys.reduce((s, k) => s + (eqMaps[k].get(mk)?.monthRet ?? 0), 0)
                    + bondRet) / nInst;

    portEq *= (1 + portRet);
    bhEq   *= (1 + bhRet);
    portRets.push(portRet);
    bhRets.push(bhRet);
    portCurve.push({ date: mk, equity: round4(portEq) });
    bhCurve.push({   date: mk, equity: round4(bhEq) });

    portTrades.push({
      monthKey: mk, alloc: round4(equityAlloc),
      monOpen: round4(primaryT.monOpen), monClose: round4(primaryT.monClose),
      monthRet: round4(avgEqRet), stratRet: round4(portRet),
      macroScore: round4(primaryT.macroScore), vixZ: round4(primaryT.vixZ),
      volRegime: primaryT.volRegime, trendState: primaryT.trendState,
      win: portRet > 0,
    });
  }

  const totalMo = commonMonths.length;
  const met     = metrics(portRets, portCurve, totalMo, portTrades);
  const bh      = bhMetrics(bhRets, bhCurve, totalMo);
  const stratDD = drawdownSeries(portCurve);
  const bhDD    = drawdownSeries(bhCurve);
  const regime  = regimeBreakdown(portTrades);

  const eqLabels  = equityKeys.map(k => (result[k].label ?? k).split('—')[0].trim()).join('+');
  const bondLabel = (result[bondKey].label ?? bondKey).split('—')[0].trim();

  return {
    label:       `${eqLabels} + ${bondLabel} Portfolio`,
    inverted:    false,
    isPortfolio: true,
    metrics:     rndMet(met),
    bh:          rndBH(bh),
    equityCurve: thinEquity(portCurve),
    bhCurve:     thinEquity(bhCurve),
    drawdown:    thinDD(stratDD),
    bhDrawdown:  thinDD(bhDD),
    macroScore:  result[primaryKey].macroScore,
    trades:      portTrades,
    walkForward: { windows: [], meanOOSSharpe: null, meanISSharpe: null, wfe: null, oosCurve: [] },
    regime,
    verdict:     {
      oosSharpe:   { value: null, pass: null, target: 0.5 },
      wfe:         { value: null, pass: null, target: 0.5 },
      maxDD:       { strat: round4(met.maxDD), bh: round4(bh.maxDD), pass: Math.abs(met.maxDD) < Math.abs(bh.maxDD) },
      overallPass: null,
      isPortfolio: true,
    },
  };
}



// Returns raw (non-inverted) composite score with per-instrument alloc for shading.
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

// ── Output helpers ────────────────────────────────────────────────────────────

function rndMet(m) {
  return {
    cagr: round4(m.cagr), sharpe: round4(m.sharpe), sortino: round4(m.sortino),
    maxDD: round4(m.maxDD), winRate: round4(m.winRate), avgWin: round4(m.avgWin),
    avgLoss: round4(m.avgLoss), profitFactor: round4(m.profitFactor),
    calmar: round4(m.calmar), timeInMarket: round4(m.timeInMarket),
    finalEquity: round4(m.finalEquity), years: round4(m.years),
    totalMonths: m.totalMonths, nTrades: m.nTrades,
  };
}

function rndBH(m) {
  return { cagr: round4(m.cagr), sharpe: round4(m.sharpe),
    maxDD: round4(m.maxDD), finalEquity: round4(m.finalEquity) };
}

function thinEquity(curve) { return curve.map(p => ({ date: p.date, equity: round4(p.equity) })); }
function thinDD(curve)     { return curve.map(p => ({ date: p.date, dd: round4(p.dd) })); }

function verdictFn(met, bh, wfData) {
  const oosSh  = wfData?.meanOOSSharpe ?? 0;
  const wfeVal = wfData?.wfe ?? 0;
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

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the full macro-regime-conditional equity backtest.
 *
 * @param {object} data
 *   { dates: string[],
 *     instruments: { KEY: { open: number[], close: number[], label: string, inverted?: boolean } },
 *     vix: number[],
 *     fred: { walcl, wtregen, rrpontsyd, t10y2y, bamlh0a0hym2, dfii10, napm, eupmi? } }
 * @param {object} [config] - Overrides for ME_DEFAULT_CONFIG
 * @returns {object} Full backtest result with per-instrument sections
 */
export function runMacroEquityBacktest(data, config = {}) {
  const cfg = { ...ME_DEFAULT_CONFIG, ...config,
    weights: { ...ME_DEFAULT_CONFIG.weights, ...(config.weights ?? {}) } };

  const { dates, instruments } = data;
  const n = dates.length;

  const raw = buildRawFactors(data);

  const { zWindow, vixWindow } = cfg;
  const netLiqZ    = rollingZscore(raw.netliqPct, zWindow);
  const curveZ     = rollingZscore(raw.curve,     zWindow);
  const creditZ    = rollingZscore(raw.credit,    zWindow);
  const realYieldZ = rollingZscore(raw.realYield, zWindow);
  const ismZ       = rollingZscore(raw.ism,   zWindow);
  const ismEUZ     = rollingZscore(raw.ismEU, zWindow);
  const vixZ       = rollingZscore(raw.vix,   vixWindow);
  const macroScoreUS = compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismZ,   cfg.weights);
  const macroScoreEU = compositeScore(netLiqZ, curveZ, creditZ, realYieldZ, ismEUZ, cfg.weights);

  const wf = runWalkForward(dates, raw, instruments, raw.vix, cfg);

  const result = {
    runAt:       new Date().toISOString(),
    dateRange:   { start: dates[0], end: dates[n - 1] },
    nDays:       n,
    instruments: Object.keys(instruments),
  };

  for (const [key, inst] of Object.entries(instruments)) {
    const instRaw    = raw.instruments[key];
    const inverted   = inst.inverted ?? false;
    const floor      = inverted ? (cfg.invertedAllocFloor ?? 0.15) : (cfg.allocFloor ?? 0.50);
    const macroScore = (inst.euMode ?? false) ? macroScoreEU : macroScoreUS;

    const months   = buildMonthly(dates, inst.open, inst.close, macroScore, vixZ,
      instRaw.ma200, instRaw.mom12m, inverted);
    const btResult = runMonthlyBacktest(months, cfg, floor);
    const totalMo  = months.length;
    const met      = metrics(btResult.monthlyRets, btResult.equityCurve, totalMo, btResult.trades);
    const bh       = bhMetrics(btResult.bhRets, btResult.bhCurve, totalMo);
    const stratDD  = drawdownSeries(btResult.equityCurve);
    const bhDD     = drawdownSeries(btResult.bhCurve);
    const regime   = regimeBreakdown(btResult.trades);
    const mScore   = monthlyMacroScoreSeries(dates, macroScore, btResult.trades);

    result[key] = {
      label:       inst.label ?? key,
      inverted,
      metrics:     rndMet(met),
      bh:          rndBH(bh),
      equityCurve: thinEquity(btResult.equityCurve),
      bhCurve:     thinEquity(btResult.bhCurve),
      drawdown:    thinDD(stratDD),
      bhDrawdown:  thinDD(bhDD),
      macroScore:  mScore,
      trades:      btResult.trades.map(t => ({
        monthKey: t.monthKey, alloc: round4(t.alloc),
        monOpen: round4(t.monOpen), monClose: round4(t.monClose),
        monthRet: round4(t.monthRet), stratRet: round4(t.stratRet),
        macroScore: round4(t.macroScore), vixZ: round4(t.vixZ),
        volRegime: t.volRegime, trendState: t.trendState, win: t.win,
      })),
      walkForward: { ...wf[key], windows: wf.windows },
      regime,
      verdict:     verdictFn(met, bh, wf[key]),
    };
  }

  // Portfolio mode: combine equity instruments + TLT into a single always-deployed portfolio
  if (cfg.portfolioMode) {
    const equityKeys = result.instruments.filter(k => !instruments[k]?.inverted);
    const bondKey    = result.instruments.find(k  =>  instruments[k]?.inverted);
    if (equityKeys.length > 0 && bondKey) {
      const portfolio = buildPortfolioResult(equityKeys, bondKey, result, cfg);
      if (portfolio) {
        result.PORTFOLIO = portfolio;
        result.instruments = [...result.instruments, 'PORTFOLIO'];
      }
    }
  }

  return result;
}
