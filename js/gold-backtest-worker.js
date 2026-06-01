// gold-backtest-worker.js — Gold strategy backtester Web Worker (type: module)
import {
  tsToLondon, computeBodyRange, computeATR, detectConfluences,
  projectFibLevels, getPipSize, getDigits, computeDirection, ema, FIB_LEVELS,
} from './backtest-engine.js';
import { assessEntry } from './vumanchu.js';

const PIP    = 0.1;
const SYMBOL = 'XAU/USD';

// ── Storage ────────────────────────────────────────────────────────────────────
const _bars = { m1: [], m5: [], m30: [] };

function post(type, payload) { self.postMessage({ type, payload }); }

// ── Entry point ────────────────────────────────────────────────────────────────
self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'parse') handleParse(payload);
  else if (type === 'run') handleRun(payload);
};

// ── CSV Parser ─────────────────────────────────────────────────────────────────
function handleParse({ tf, text }) {
  post('progress', { tf, status: 'Parsing…' });
  const lines = text.split('\n');
  const bars  = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const p = raw.split(',');
    if (p.length < 5) continue;
    const ts = parseInt(p[0], 10);
    if (isNaN(ts)) continue;
    const o = +p[1], h = +p[2], l = +p[3], c = +p[4];
    if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;
    const vol = +p[5] || 1;
    bars.push({ ts, o, h, l, c, vol, ...tsToLondon(ts) });
    if (i % 100000 === 0) post('progress', { tf, rows: i, total: lines.length - 1 });
  }
  bars.sort((a, b) => a.ts - b.ts);
  _bars[tf] = bars;
  post('parsed', { tf, count: bars.length });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function buildDailyBars(m30) {
  const map = new Map();
  for (const b of m30) {
    if (b.lDay === 0 || b.lDay === 6) continue;
    if (!map.has(b.lDate)) {
      map.set(b.lDate, { ts: b.ts, o: b.o, h: b.h, l: b.l, c: b.c, lDate: b.lDate, lDay: b.lDay });
    } else {
      const d = map.get(b.lDate);
      d.h = Math.max(d.h, b.h);
      d.l = Math.min(d.l, b.l);
      d.c = b.c;
    }
  }
  return [...map.values()].sort((a, b) => (a.lDate < b.lDate ? -1 : 1));
}

function buildAsiaRangeMap(m5) {
  // Body range of M5 bars from 00:00–05:59 London
  const dayBodies = new Map();
  for (const b of m5) {
    if (b.lDay === 0 || b.lDay === 6 || b.lHour >= 6) continue;
    if (!dayBodies.has(b.lDate)) dayBodies.set(b.lDate, []);
    dayBodies.get(b.lDate).push(b);
  }
  const result = new Map();
  for (const [date, bars] of dayBodies) {
    if (bars.length < 6) continue;
    const high = Math.max(...bars.map(b => Math.max(b.o, b.c)));
    const low  = Math.min(...bars.map(b => Math.min(b.o, b.c)));
    if (high > low) result.set(date, { high, low, range: high - low });
  }
  return result;
}

function buildMondayRangeMap(m30) {
  const weekBodies = new Map();
  for (const b of m30) {
    if (b.lDay !== 1) continue;
    const wk = getWeekStart(b.lDate);
    if (!weekBodies.has(wk)) weekBodies.set(wk, []);
    weekBodies.get(wk).push(b);
  }
  const result = new Map();
  for (const [wk, bars] of weekBodies) {
    if (bars.length < 10) continue;
    const high = Math.max(...bars.map(b => Math.max(b.o, b.c)));
    const low  = Math.min(...bars.map(b => Math.min(b.o, b.c)));
    if (high > low) result.set(wk, { high, low, range: high - low });
  }
  return result;
}

function buildPivotMap(dailyBars) {
  const map = new Map();
  for (let i = 1; i < dailyBars.length; i++) {
    const p  = dailyBars[i - 1];
    const pp = (p.h + p.l + p.c) / 3;
    const r1 = 2 * pp - p.l;
    const s1 = 2 * pp - p.h;
    const r2 = pp + (p.h - p.l);
    const s2 = pp - (p.h - p.l);
    map.set(dailyBars[i].lDate, { pp, r1, s1, r2, s2 });
  }
  return map;
}

// Transform backtest bars {h,l,c,o,vol} → vumanchu {high,low,close,open,volume}
function toVmuBars(bars) {
  return bars.map(b => ({ high: b.h, low: b.l, close: b.c, open: b.o, volume: b.vol ?? 1 }));
}

// Binary search: first index where bars[idx].ts >= ts
function lowerBound(bars, ts) {
  let lo = 0, hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].ts < ts) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// Build daily bar index: date → index in dailyBars
function buildDailyIdx(dailyBars) {
  const map = new Map();
  for (let i = 0; i < dailyBars.length; i++) map.set(dailyBars[i].lDate, i);
  return map;
}

// ── Trade management ───────────────────────────────────────────────────────────
function tickTrade(trade, bar, tp1PartialPct) {
  const { dir, slPrice, tp1Price, tp2Price, tp1Hit, slDist } = trade;
  const isLong = dir === 'long';

  // Update MFE / MAE
  const fav = isLong ? bar.h - trade.entryPrice : trade.entryPrice - bar.l;
  const adv = isLong ? trade.entryPrice - bar.l : bar.h - trade.entryPrice;
  if (fav > trade.mfePts) trade.mfePts = fav;
  if (adv > trade.maePts) trade.maePts = adv;

  if (isLong) {
    // TP1 check (mark partial exit)
    if (!tp1Hit && bar.h >= tp1Price) {
      trade.tp1Hit = true;
      trade.slPrice = trade.entryPrice; // Move SL to BE
    }
    // SL check
    if (bar.l <= trade.slPrice) {
      const r = trade.tp1Hit
        ? trade.tp1R * tp1PartialPct + 0 * (1 - tp1PartialPct)
        : -1;
      return { exitPrice: trade.slPrice, result: trade.tp1Hit ? 'tp1+sl_be' : 'sl', r };
    }
    // TP2 check
    if (trade.tp1Hit && bar.h >= tp2Price) {
      const r = trade.tp1R * tp1PartialPct + trade.tp2R * (1 - tp1PartialPct);
      return { exitPrice: tp2Price, result: 'tp1+tp2', r };
    }
  } else {
    if (!tp1Hit && bar.l <= tp1Price) {
      trade.tp1Hit = true;
      trade.slPrice = trade.entryPrice;
    }
    if (bar.h >= trade.slPrice) {
      const r = trade.tp1Hit
        ? trade.tp1R * tp1PartialPct + 0 * (1 - tp1PartialPct)
        : -1;
      return { exitPrice: trade.slPrice, result: trade.tp1Hit ? 'tp1+sl_be' : 'sl', r };
    }
    if (trade.tp1Hit && bar.l <= tp2Price) {
      const r = trade.tp1R * tp1PartialPct + trade.tp2R * (1 - tp1PartialPct);
      return { exitPrice: tp2Price, result: 'tp1+tp2', r };
    }
  }
  return null;
}

function closeTrade(trade, exitBar, exitReason, tp1PartialPct) {
  const dir = trade.dir;
  const eodR = dir === 'long'
    ? (exitBar.c - trade.entryPrice) / trade.slDist
    : (trade.entryPrice - exitBar.c) / trade.slDist;
  const r = trade.tp1Hit
    ? trade.tp1R * tp1PartialPct + eodR * (1 - tp1PartialPct)
    : eodR;
  trade.exitTs    = exitBar.ts;
  trade.exitPrice = exitBar.c;
  trade.result    = exitReason;
  trade.r         = r;
  trade.mfe       = trade.slDist > 0 ? trade.mfePts / trade.slDist : 0;
  trade.mae       = trade.slDist > 0 ? trade.maePts / trade.slDist : 0;
}

// ── Stats ──────────────────────────────────────────────────────────────────────
function computeStats(trades, riskPct = 1.0) {
  if (!trades?.length) return null;
  const rVals = trades.map(t => t.r ?? 0);
  const n = rVals.length;
  const wins = rVals.filter(r => r > 0).length;

  let equity = 1, peak = 1, maxDD = 0;
  const equityCurve   = [{ x: 0, y: 0 }];
  const drawdownCurve = [{ x: 0, y: 0 }];
  let cumR = 0;
  for (let i = 0; i < n; i++) {
    cumR  += rVals[i];
    equity = 1 + cumR * (riskPct / 100);
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
    equityCurve.push({ x: i + 1, y: cumR });
    drawdownCurve.push({ x: i + 1, y: -dd * 100 });
  }

  const mean = rVals.reduce((a, b) => a + b, 0) / n;
  const variance = rVals.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const stdR = Math.sqrt(variance);

  const firstTs = trades[0].entryTs, lastTs = trades[n - 1].entryTs;
  const years = Math.max(0.01, (lastTs - firstTs) / (365.25 * 86400000));
  const tpy   = n / years;
  const sharpe = stdR > 0 ? (mean / stdR) * Math.sqrt(tpy) : 0;

  const finalEq = 1 + cumR * (riskPct / 100);
  const cagr = (Math.pow(Math.max(finalEq, 0.001), 1 / years) - 1) * 100;
  const calmar = maxDD > 0 ? cagr / (maxDD * 100) : 0;

  const gp = rVals.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const gl = Math.abs(rVals.filter(r => r < 0).reduce((a, b) => a + b, 0));
  const pf = gl > 0 ? gp / gl : gp > 0 ? 99 : 0;

  const mfes  = trades.map(t => t.mfe ?? 0);
  const maes  = trades.map(t => t.mae ?? 0);
  const avgMfe = mfes.reduce((a, b) => a + b, 0) / n;
  const avgMae = maes.reduce((a, b) => a + b, 0) / n;
  const mfeCap = avgMfe > 0 ? Math.max(0, mean) / avgMfe : 0;

  // Downsample curves to ≤500 points
  const step    = Math.max(1, Math.ceil(equityCurve.length / 500));
  const eqSmall = equityCurve.filter((_, i)   => i % step === 0 || i === equityCurve.length   - 1);
  const ddSmall = drawdownCurve.filter((_, i) => i % step === 0 || i === drawdownCurve.length - 1);

  // Monthly breakdown
  const monthMap = {};
  for (const t of trades) {
    const k = t.lDate?.slice(0, 7) ?? 'Unknown';
    if (!monthMap[k]) monthMap[k] = { yearMonth: k, trades: 0, wins: 0, totalR: 0 };
    monthMap[k].trades++;
    if ((t.r ?? 0) > 0) monthMap[k].wins++;
    monthMap[k].totalR += (t.r ?? 0);
  }
  const monthly = Object.values(monthMap)
    .sort((a, b) => (a.yearMonth < b.yearMonth ? -1 : 1))
    .map(m => ({ ...m, totalR: +m.totalR.toFixed(2) }));

  return {
    n, wins, losses: n - wins,
    winRate: +(wins / n * 100).toFixed(1),
    meanR: +mean.toFixed(3), stdR: +stdR.toFixed(3),
    sharpe: +sharpe.toFixed(2), cagr: +cagr.toFixed(2),
    calmar: +calmar.toFixed(2),
    maxDD: +(maxDD * 100).toFixed(2),
    profitFactor: +pf.toFixed(2),
    avgMfe: +avgMfe.toFixed(2), avgMae: +avgMae.toFixed(2),
    mfeCaptureRatio: +mfeCap.toFixed(3),
    equityCurve: eqSmall, drawdownCurve: ddSmall, monthly,
    dateRange: {
      first: trades[0].lDate,
      last:  trades[n - 1].lDate,
      years: +years.toFixed(1),
    },
  };
}

function runMonteCarlo(rVals, riskPct, N_SIM = 500, N_PTS = 200) {
  if (rVals.length < 10) return null;
  const n    = rVals.length;
  const step = Math.max(1, Math.floor(n / N_PTS));
  const xs   = [];
  for (let i = step - 1; i < n; i += step) xs.push(i);
  if (xs[xs.length - 1] !== n - 1) xs.push(n - 1);
  const M = xs.length;
  const bandVals = Array.from({ length: M }, () => []);
  const finals = [], maxDDs = [];

  for (let s = 0; s < N_SIM; s++) {
    let cumR = 0, peak = 1, mdd = 0, pi = 0;
    for (let i = 0; i < n; i++) {
      cumR += rVals[(Math.random() * n) | 0];
      const eq = 1 + cumR * (riskPct / 100);
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? (peak - eq) / peak : 0;
      if (dd > mdd) mdd = dd;
      if (pi < M && xs[pi] === i) { bandVals[pi].push(cumR); pi++; }
    }
    finals.push(cumR);
    maxDDs.push(mdd);
  }

  const pct = (arr, p) => { arr.sort((a, b) => a - b); return arr[Math.floor(arr.length * p / 100)]; };
  const bands = bandVals.map(v => {
    v.sort((a, b) => a - b);
    const L = v.length;
    return {
      p5:  v[Math.floor(L * 0.05)], p25: v[Math.floor(L * 0.25)],
      p50: v[Math.floor(L * 0.50)], p75: v[Math.floor(L * 0.75)],
      p95: v[Math.floor(L * 0.95)],
    };
  });

  return {
    bands, xs, N_SIM, N_PTS: xs.length,
    finalP5:  pct([...finals], 5),
    finalP50: pct([...finals], 50),
    finalP95: pct([...finals], 95),
    ddP95:    pct([...maxDDs], 95) * 100,
  };
}

function computeSessions(trades) {
  const sess = {
    london:  { name: 'London',  h0:  7, h1: 12, n: 0, wins: 0, r: 0 },
    overlap: { name: 'Overlap', h0: 12, h1: 16, n: 0, wins: 0, r: 0 },
    ny:      { name: 'NY',      h0: 16, h1: 20, n: 0, wins: 0, r: 0 },
    other:   { name: 'Other',   h0:  0, h1:  7, n: 0, wins: 0, r: 0 },
  };
  for (const t of trades) {
    const h = t.lHour ?? 10;
    const s = h < 12 ? 'london' : h < 16 ? 'overlap' : h < 20 ? 'ny' : 'other';
    sess[s].n++; sess[s].r += t.r ?? 0;
    if ((t.r ?? 0) > 0) sess[s].wins++;
  }
  return Object.values(sess).map(s => ({ ...s, winRate: s.n > 0 ? +(s.wins / s.n * 100).toFixed(1) : 0, r: +s.r.toFixed(2) }));
}

function computeDays(trades) {
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const map = new Map();
  for (const t of trades) {
    const d = t.lDay ?? 1;
    if (!map.has(d)) map.set(d, { name: DOW[d], n: 0, wins: 0, r: 0 });
    const e = map.get(d);
    e.n++; e.r += t.r ?? 0;
    if ((t.r ?? 0) > 0) e.wins++;
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, s]) => ({ ...s, winRate: s.n > 0 ? +(s.wins / s.n * 100).toFixed(1) : 0, r: +s.r.toFixed(2) }));
}

function computeLevelStats(trades) {
  const map = new Map();
  for (const t of trades) {
    const k = t.level ?? 'Unknown';
    if (!map.has(k)) map.set(k, { level: k, n: 0, wins: 0, r: 0 });
    const e = map.get(k);
    e.n++; e.r += t.r ?? 0;
    if ((t.r ?? 0) > 0) e.wins++;
  }
  return [...map.values()]
    .sort((a, b) => b.n - a.n)
    .map(s => ({ ...s, winRate: s.n > 0 ? +(s.wins / s.n * 100).toFixed(1) : 0, r: +s.r.toFixed(2) }));
}

function computeGateEffectiveness(allTrades, filteredTrades) {
  // Compare all candidate entries vs filtered to show gate impact
  const filtered = new Set(filteredTrades.map(t => t.entryTs));
  const excluded = allTrades.filter(t => !filtered.has(t.entryTs));
  return {
    total:    allTrades.length,
    taken:    filteredTrades.length,
    excluded: excluded.length,
    gateCounts: {},
  };
}

// ── WFO helpers ────────────────────────────────────────────────────────────────
function buildWfoWindows(sortedDates, isMonths, oosMonths) {
  const windows = [];
  if (!sortedDates.length) return windows;
  const start = new Date(sortedDates[0] + 'T00:00:00Z');
  const end   = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00Z');

  let cur = new Date(start);
  while (true) {
    const isEnd = new Date(cur);
    isEnd.setUTCMonth(isEnd.getUTCMonth() + isMonths);
    const oosEnd = new Date(isEnd);
    oosEnd.setUTCMonth(oosEnd.getUTCMonth() + oosMonths);
    if (isEnd > end) break;
    const isEndStr  = isEnd.toISOString().slice(0, 10);
    const oosEndStr = oosEnd > end ? end.toISOString().slice(0, 10) : oosEnd.toISOString().slice(0, 10);
    windows.push({
      isStart:  cur.toISOString().slice(0, 10),
      isEnd:    isEndStr,
      oosStart: isEndStr,
      oosEnd:   oosEndStr,
    });
    cur = new Date(isEnd); // anchor walk
    cur.setUTCMonth(cur.getUTCMonth() + oosMonths);
    if (cur >= end) break;
  }
  return windows.slice(0, 12); // cap at 12 windows
}

// ── Main backtest run ──────────────────────────────────────────────────────────
function handleRun(cfg) {
  const m5  = _bars.m5;
  const m30 = _bars.m30;
  const m1  = _bars.m1;

  if (!m5?.length || !m30?.length) {
    post('error', 'Missing M5 or M30 data — please load both timeframes first');
    return;
  }

  post('progress', { status: 'Building structures…', pct: 2 });

  // ── Pre-compute context maps ─────────────────────────────────────────────────
  const dailyBars      = buildDailyBars(m30);
  const dailyIdxMap    = buildDailyIdx(dailyBars);
  const asiaRangeMap   = buildAsiaRangeMap(m5);
  const mondayRangeMap = buildMondayRangeMap(m30);
  const pivotMap       = buildPivotMap(dailyBars);

  // ── Config ───────────────────────────────────────────────────────────────────
  const riskPct          = cfg.riskPct          ?? 1.0;
  const slAtrMult        = cfg.slAtrMult        ?? 1.3;
  const tp1R             = cfg.tp1R             ?? 1.5;
  const tp2R             = cfg.tp2R             ?? 2.5;
  const tp1PartialPct    = cfg.tp1PartialPct    ?? 0.5;
  const spread           = (cfg.spread          ?? 0.3) * PIP;
  const fibTolPips       = cfg.fibTolPips       ?? 200;
  const fibTolerance     = fibTolPips * PIP;
  const minConviction    = cfg.minConviction     ?? 0;
  const minConfirms      = cfg.minConfirms       ?? 2;
  const vwapChopMult     = cfg.vwapChopMult      ?? 0.25;
  const minVmuComponents = cfg.minVmuComponents  ?? 2;
  const sessionStart     = cfg.sessionStart      ?? 7;
  const sessionEnd       = cfg.sessionEnd        ?? 19;
  const warmupDays       = cfg.warmupDays        ?? 60;
  const _sd              = cfg.startDate         ?? null;
  const _ed              = cfg.endDate           ?? null;
  const isSplit          = cfg.isSplit           ?? 0;
  const wfoEnabled       = cfg.wfoEnabled        ?? false;
  const wfoIsMonths      = cfg.wfoIsMonths       ?? 6;
  const wfoOosMonths     = cfg.wfoOosMonths      ?? 2;
  const maxDailyLoss     = cfg.maxDailyLoss      ?? 0;  // max daily loss in R (0 = unlimited)
  const maxDailyTrades   = cfg.maxDailyTrades    ?? 3;

  // Gate toggles
  const useAsiaFib   = cfg.useAsiaFib   ?? true;
  const useMondayFib = cfg.useMondayFib ?? true;
  const usePivot     = cfg.usePivot     ?? true;
  const useVwapChop  = cfg.useVwapChop  ?? true;
  const useVmu       = cfg.useVmu       ?? true;
  const requireVmuAgree = cfg.requireVmuAgree ?? false;
  const useSession   = cfg.useSession   ?? true;
  const useChoch     = cfg.useChoch     ?? true;
  const useHtfEma    = cfg.useHtfEma    ?? true;
  const useAdx       = cfg.useAdx       ?? false;

  // Feature config for computeDirection
  const featureCfg = {
    rangePosition: { enabled: true,      weight: 1, label: 'Range Position' },
    chochBos:      { enabled: useChoch,  weight: 2, label: 'CHoCH / BOS' },
    wickRejection: { enabled: true,      weight: 1, label: 'Wick Rejection' },
    rsiDivergence: { enabled: true,      weight: 1, label: 'RSI Divergence' },
    orderBlock:    { enabled: true,      weight: 1, label: 'Order Block' },
    htfEma:        { enabled: useHtfEma, weight: 1, label: 'HTF EMA 21/50' },
    vwapSlope:     { enabled: true,      weight: 1, label: 'TWAP Slope' },
    adxFilter:     { enabled: useAdx,    weight: 1, label: 'ADX Filter' },
    hurstRegime:   { enabled: true,      weight: 1, label: 'Hurst Regime' },
    fvgBias:       { enabled: true,      weight: 1, label: 'FVG Bias' },
    weeklyPivot:   { enabled: false,     weight: 1, label: 'Weekly Pivot' },
    ichimokuCloud: { enabled: false,     weight: 1, label: 'Ichimoku Cloud' },
    macdSignal:    { enabled: false,     weight: 1, label: 'MACD' },
  };

  post('progress', { status: 'Simulating trades…', pct: 5 });

  const allTrades = [];
  let openTrade   = null;
  let warmupCount = 0;
  let prevDate    = '';
  let vwapTpv = 0, vwapVol = 0;
  let dailyTradeCount = 0, dailyR = 0;

  // IS / OOS split date
  let splitDate = null;
  if (isSplit > 0) {
    const allDates = [...new Set(
      m5.filter(b => (!_sd || b.lDate >= _sd) && (!_ed || b.lDate <= _ed) && b.lDay > 0 && b.lDay < 6)
         .map(b => b.lDate)
    )].sort();
    const idx = Math.floor(allDates.length * isSplit / 100);
    splitDate = allDates[idx] ?? null;
  }

  // ── Main walk loop (M5) ──────────────────────────────────────────────────────
  for (let i = 0; i < m5.length; i++) {
    const bar = m5[i];
    const { lDate, lHour, lMin, lDay } = bar;

    if (lDay === 0 || lDay === 6) continue;
    if (_sd && lDate < _sd) continue;
    if (_ed && lDate > _ed) continue;

    // ── Day boundary ─────────────────────────────────────────────────────────
    if (lDate !== prevDate) {
      prevDate = lDate;
      warmupCount++;
      vwapTpv = 0; vwapVol = 0;
      dailyTradeCount = 0; dailyR = 0;
    }

    // Update session VWAP
    const tp = (bar.h + bar.l + bar.c) / 3;
    vwapTpv += tp * bar.vol;
    vwapVol += bar.vol;

    if (warmupCount < warmupDays) continue;

    // ── Manage open trade ─────────────────────────────────────────────────────
    if (openTrade) {
      // Get M1 bars overlapping this M5 period
      const nextTs = i + 1 < m5.length ? m5[i + 1].ts : bar.ts + 300_000;
      let closed = false;

      if (m1.length) {
        const m1Start = lowerBound(m1, bar.ts);
        for (let j = m1Start; j < m1.length && m1[j].ts < nextTs; j++) {
          const result = tickTrade(openTrade, m1[j], tp1PartialPct);
          if (result) {
            openTrade.exitTs    = m1[j].ts;
            openTrade.exitPrice = result.exitPrice;
            openTrade.result    = result.result;
            openTrade.r         = result.r;
            openTrade.mfe       = openTrade.slDist > 0 ? openTrade.mfePts / openTrade.slDist : 0;
            openTrade.mae       = openTrade.slDist > 0 ? openTrade.maePts / openTrade.slDist : 0;
            allTrades.push(openTrade);
            openTrade = null;
            closed = true;
            break;
          }
        }
      } else {
        // Use M5 bar directly
        const result = tickTrade(openTrade, bar, tp1PartialPct);
        if (result) {
          openTrade.exitTs    = bar.ts;
          openTrade.exitPrice = result.exitPrice;
          openTrade.result    = result.result;
          openTrade.r         = result.r;
          openTrade.mfe       = openTrade.slDist > 0 ? openTrade.mfePts / openTrade.slDist : 0;
          openTrade.mae       = openTrade.slDist > 0 ? openTrade.maePts / openTrade.slDist : 0;
          allTrades.push(openTrade);
          openTrade = null;
          closed = true;
        }
      }

      // EOD exit
      if (!closed && openTrade && lHour >= sessionEnd) {
        closeTrade(openTrade, bar, 'eod', tp1PartialPct);
        allTrades.push(openTrade);
        openTrade = null;
      }
      continue;
    }

    // ── Entry check ───────────────────────────────────────────────────────────
    if (useSession && (lHour < sessionStart || lHour >= sessionEnd)) continue;
    if (maxDailyTrades > 0 && dailyTradeCount >= maxDailyTrades) continue;
    if (maxDailyLoss > 0 && dailyR <= -maxDailyLoss) continue;

    const asiaRange  = asiaRangeMap.get(lDate);
    const mondayRange = mondayRangeMap.get(getWeekStart(lDate));
    const pivots      = pivotMap.get(lDate);

    if (useAsiaFib && !asiaRange) continue;

    // ── Build candidate levels ───────────────────────────────────────────────
    const price = bar.c;
    const m5Win = m5.slice(Math.max(0, i - 100), i + 1);
    const atr   = computeATR(m5Win, 14);
    if (!atr) continue;

    let nearestLevel = null, nearestDist = Infinity;

    const checkLevel = (lvlPrice, src, dir) => {
      const dist = Math.abs(price - lvlPrice);
      if (dist < fibTolerance && dist < nearestDist) {
        nearestDist  = dist;
        nearestLevel = { price: lvlPrice, src, dir };
      }
    };

    if (asiaRange && useAsiaFib) {
      for (const fib of [0, 0.236, 0.382, 0.5, 0.618, 0.65, 0.786, 0.886, 1, 1.236, 1.382, 1.618, -0.236, -0.382]) {
        checkLevel(asiaRange.low + asiaRange.range * fib, `Asia-${fib}`, fib >= 0.5 ? 'short' : fib <= 0.5 ? 'long' : 'both');
      }
    }
    if (mondayRange && useMondayFib) {
      for (const fib of [0, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, -0.272, -0.618]) {
        checkLevel(mondayRange.low + mondayRange.range * fib, `Mon-${fib}`, fib >= 0.5 ? 'short' : fib <= 0.5 ? 'long' : 'both');
      }
    }
    if (pivots && usePivot) {
      checkLevel(pivots.pp, 'DailyPP', 'both');
      checkLevel(pivots.r1, 'DailyR1', 'short');
      checkLevel(pivots.s1, 'DailyS1', 'long');
      checkLevel(pivots.r2, 'DailyR2', 'short');
      checkLevel(pivots.s2, 'DailyS2', 'long');
    }

    if (!nearestLevel) continue;

    // ── Feature direction ─────────────────────────────────────────────────────
    const m5Rev = m5.slice(Math.max(0, i - 200), i + 1).reverse();

    let m30Start = 0;
    for (let j = 0; j < m30.length; j++) {
      if (m30[j].lDate === lDate) { m30Start = Math.max(0, j - 200); break; }
    }
    const m30Win = m30.slice(m30Start, m30Start + 201);

    const dIdx = dailyIdxMap.get(lDate) ?? -1;
    const dailySlice = dIdx > 0 ? dailyBars.slice(Math.max(0, dIdx - 80), dIdx) : [];

    const dirResult = computeDirection({
      bars5mRev: m5Rev,
      bars30m:   m30Win,
      dailyBars: dailySlice,
      asiaRange, mondayRange, atr,
      symbol: SYMBOL, price, todayDate: lDate, featureCfg,
    });

    const { entryDir, conviction, confirmCount } = dirResult;
    if (!entryDir) continue;
    if (conviction < minConviction) continue;
    if (confirmCount < minConfirms) continue;

    // Level direction constraint
    if (nearestLevel.dir && nearestLevel.dir !== 'both' && nearestLevel.dir !== entryDir) continue;

    // ── VMU Gate ──────────────────────────────────────────────────────────────
    let vmuResult = null;
    if (useVmu) {
      const vmuBars = toVmuBars(m5Rev.slice(0, 100).reverse());
      vmuResult = assessEntry(vmuBars, entryDir, { minComponents: minVmuComponents });
      if (vmuResult.signal === 'oppose') continue;
      if (requireVmuAgree && vmuResult.signal !== 'agree') continue;
    }

    // ── VWAP chop gate ────────────────────────────────────────────────────────
    if (useVwapChop && vwapVol > 0) {
      const vwap = vwapTpv / vwapVol;
      if (Math.abs(price - vwap) < atr * vwapChopMult) continue;
    }

    // ── Enter trade ───────────────────────────────────────────────────────────
    const slippage = spread;
    const entryPrice = entryDir === 'long' ? price + slippage : price - slippage;
    const slDist  = Math.max(atr * slAtrMult, PIP * 50);
    const slPrice  = entryDir === 'long' ? entryPrice - slDist : entryPrice + slDist;
    const tp1Price = entryDir === 'long' ? entryPrice + slDist * tp1R : entryPrice - slDist * tp1R;
    const tp2Price = entryDir === 'long' ? entryPrice + slDist * tp2R : entryPrice - slDist * tp2R;

    const isOos = splitDate ? lDate >= splitDate : false;

    openTrade = {
      entryTs: bar.ts, entryPrice, exitTs: null, exitPrice: null,
      dir: entryDir, slPrice, tp1Price, tp2Price, slDist,
      tp1R, tp2R, tp1Hit: false,
      mfePts: 0, maePts: 0, mfe: 0, mae: 0, r: 0,
      result: '', holdingBars: 0,
      level: nearestLevel.src, levelDir: nearestLevel.dir,
      lDate, lHour, lDay,
      conviction: +conviction.toFixed(3),
      confirmCount, vmuSignal: vmuResult?.signal ?? 'n/a',
      vmuComponents: vmuResult?.components ?? 0,
      isOos,
      stars: Math.min(4, 1 + (conviction > 0.3 ? 1 : 0) + (confirmCount >= 3 ? 1 : 0) + (vmuResult?.signal === 'agree' ? 1 : 0)),
      featureVotes: dirResult.results?.map(r => ({ key: r.key, signal: r.signal, val: r.val, pts: r.pts })) ?? [],
    };
    dailyTradeCount++;
    if (i % 1000 === 0) post('progress', { status: 'Simulating…', pct: Math.round(5 + (i / m5.length) * 85) });
  }

  // Close any open trade at end
  if (openTrade) {
    const last = m5[m5.length - 1];
    closeTrade(openTrade, last, 'eod', tp1PartialPct);
    allTrades.push(openTrade);
  }

  post('progress', { status: 'Computing statistics…', pct: 92 });

  // ── Partition IS/OOS ──────────────────────────────────────────────────────
  const isTrades  = splitDate ? allTrades.filter(t => !t.isOos) : allTrades;
  const oosTrades = splitDate ? allTrades.filter(t =>  t.isOos) : [];

  const allStats  = computeStats(allTrades,  riskPct);
  const isStats   = isTrades.length  ? computeStats(isTrades,  riskPct) : null;
  const oosStats  = oosTrades.length ? computeStats(oosTrades, riskPct) : null;

  const sessions = computeSessions(allTrades);
  const days     = computeDays(allTrades);
  const levels   = computeLevelStats(allTrades);

  post('progress', { status: 'Running Monte Carlo…', pct: 95 });
  const mc = runMonteCarlo(allTrades.map(t => t.r), riskPct);

  // ── WFO ──────────────────────────────────────────────────────────────────────
  let wfoResults = null;
  if (wfoEnabled) {
    const allDates = [...new Set(allTrades.map(t => t.lDate))].sort();
    const wfoWindows = buildWfoWindows(allDates, wfoIsMonths, wfoOosMonths);
    wfoResults = wfoWindows.map(w => {
      const isTr  = allTrades.filter(t => t.lDate >= w.isStart  && t.lDate < w.isEnd);
      const oosTr = allTrades.filter(t => t.lDate >= w.oosStart && t.lDate < w.oosEnd);
      return {
        ...w,
        isStats:  computeStats(isTr,  riskPct),
        oosStats: computeStats(oosTr, riskPct),
        isTrades:  isTr.length,
        oosTrades: oosTr.length,
      };
    });
  }

  // Trade sample for table (last 500)
  const tradeSample = allTrades.slice(-500).map(t => ({
    entryTs: t.entryTs, exitTs: t.exitTs,
    entryPrice: t.entryPrice, exitPrice: t.exitPrice,
    dir: t.dir, result: t.result,
    r: +t.r.toFixed(3), mfe: +t.mfe.toFixed(2), mae: +t.mae.toFixed(2),
    level: t.level, stars: t.stars, lDate: t.lDate, lHour: t.lHour, lDay: t.lDay,
    vmuSignal: t.vmuSignal, conviction: t.conviction, confirmCount: t.confirmCount,
    isOos: t.isOos,
  }));

  post('result', {
    allStats, isStats, oosStats,
    sessions, days, levels, mc, wfoResults,
    tradeSample, totalTrades: allTrades.length,
    cfg,
  });
}
