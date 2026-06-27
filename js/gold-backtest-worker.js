// gold-backtest-worker.js — Gold strategy backtester Web Worker (type: module)
import { tsToLondon, computeATR, computeDirection } from './backtest-engine.js';
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

// ── Structural Fibonacci (M30 swing-based) ────────────────────────────────────
// Matches the gold bot's structural-fibs.js logic:
//   - Find N-bar swing pivots in the lookback window
//   - Project GP zone (0.618–0.65) + point levels (0.382, 0.5, 0.786, 0.886)
//   - Three passes: full range, swing highs vs range low, range high vs swing lows
// Entry zones are where multiple projections cluster (confluence).
const GP_LOW_FIB  = 0.618;
const GP_HIGH_FIB = 0.65;
const POINT_FIBS  = [0.382, 0.5, 0.786, 0.886];
const PIVOT_N     = 5;

function buildStructuralFibLevels(m30Win) {
  if (m30Win.length < PIVOT_N * 2 + 2) return [];

  const rawHighs = [], rawLows = [];
  for (let i = PIVOT_N; i < m30Win.length - PIVOT_N; i++) {
    const b = m30Win[i];
    let isH = true, isL = true;
    for (let k = i - PIVOT_N; k <= i + PIVOT_N; k++) {
      if (k === i) continue;
      if (m30Win[k].h >= b.h) isH = false;
      if (m30Win[k].l <= b.l) isL = false;
    }
    if (isH) rawHighs.push(b.h);
    if (isL) rawLows.push(b.l);
  }
  if (!rawHighs.length || !rawLows.length) return [];

  const rangeHigh = Math.max(...rawHighs);
  const rangeLow  = Math.min(...rawLows);

  // Filter to the 5 most significant pivots, excluding those within 30 pips of the
  // absolute extreme (they would produce degenerate near-zero retracements).
  // Matches the structural-fibs.js logic used by the live dashboard.
  const snapThresh = PIP * 30;
  const filteredHighs = rawHighs
    .filter(h => rangeHigh - h > snapThresh)
    .sort((a, b) => b - a)
    .slice(0, 5);
  const filteredLows = rawLows
    .filter(l => l - rangeLow > snapThresh)
    .sort((a, b) => a - b)
    .slice(0, 5);

  const levels = [];

  const addFibs = (ancH, ancL) => {
    const r = ancH - ancL;
    if (r < 1) return;
    // Support levels: price retraced DOWN from ancH toward ancL → expect bounce LONG
    for (const fib of POINT_FIBS) {
      levels.push({ price: ancL + r * fib, fib, type: 'point', dir: 'long' });
    }
    levels.push({
      gpLow:  ancL + r * GP_LOW_FIB,
      gpHigh: ancL + r * GP_HIGH_FIB,
      price:  ancL + r * ((GP_LOW_FIB + GP_HIGH_FIB) / 2),
      fib: 'gp', type: 'gp', dir: 'long',
    });
    // Resistance levels: price retraced UP from ancL toward ancH → expect bounce SHORT
    for (const fib of POINT_FIBS) {
      levels.push({ price: ancH - r * fib, fib, type: 'point', dir: 'short' });
    }
    levels.push({
      gpLow:  ancH - r * GP_HIGH_FIB,
      gpHigh: ancH - r * GP_LOW_FIB,
      price:  ancH - r * ((GP_LOW_FIB + GP_HIGH_FIB) / 2),
      fib: 'gp', type: 'gp', dir: 'short',
    });
  };

  // Pass 1: full lookback range
  addFibs(rangeHigh, rangeLow);
  // Pass 2: top 5 swing highs vs range low (short retracements from each swing high)
  for (const sh of filteredHighs) {
    if (sh > rangeLow + 1) addFibs(sh, rangeLow);
  }
  // Pass 3: range high vs top 5 swing lows (long retracements from each swing low)
  for (const sl of filteredLows) {
    if (rangeHigh > sl + 1) addFibs(rangeHigh, sl);
  }

  return levels;
}

// Pre-compute structural fibs per trading day for performance
function buildStructuralFibMap(m30, fibLookbackDays) {
  const map     = new Map();
  let   lbStart = 0;
  let   lastDate = '';

  for (let i = 0; i < m30.length; i++) {
    const b = m30[i];
    if (b.lDay === 0 || b.lDay === 6) continue;
    if (b.lDate === lastDate) continue; // rebuild once per day

    lastDate = b.lDate;
    const lbTs = b.ts - fibLookbackDays * 86400_000;
    while (lbStart < i && m30[lbStart].ts < lbTs) lbStart++;

    map.set(b.lDate, buildStructuralFibLevels(m30.slice(lbStart, i + 1)));
  }
  return map;
}

// Transform backtest bars → vumanchu {high,low,close,open,volume}
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

  // tp1Hit captured at bar OPEN: true only if TP1 was confirmed on a PRIOR bar.
  if (isLong) {
    // Same-bar pessimism: if TP1 was NOT already confirmed and this bar's range
    // spans BOTH the (original) stop and TP1, we cannot prove which came first —
    // assume the stop hit first and book the full loss. Only move SL to BE (and
    // continue toward TP2) when the original stop was NOT touched on this bar.
    if (!tp1Hit && bar.l <= slPrice) {
      return { exitPrice: slPrice, result: 'sl', r: -1 };
    }
    if (!tp1Hit && bar.h >= tp1Price) {
      trade.tp1Hit = true;
      trade.slPrice = trade.entryPrice; // move SL to BE
    }
    if (bar.l <= trade.slPrice) {
      const r = trade.tp1Hit
        ? trade.tp1R * tp1PartialPct + 0 * (1 - tp1PartialPct)
        : -1;
      return { exitPrice: trade.slPrice, result: trade.tp1Hit ? 'tp1+sl_be' : 'sl', r };
    }
    if (trade.tp1Hit && bar.h >= tp2Price) {
      const r = trade.tp1R * tp1PartialPct + trade.tp2R * (1 - tp1PartialPct);
      return { exitPrice: tp2Price, result: 'tp1+tp2', r };
    }
  } else {
    if (!tp1Hit && bar.h >= slPrice) {
      return { exitPrice: slPrice, result: 'sl', r: -1 };
    }
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
  // Per exact level (GP, .786, .886, .5, .382, PP, R1, S1…)
  const map = new Map();
  for (const t of trades) {
    const k = t.level ?? 'Unknown';
    if (!map.has(k)) map.set(k, { level: k, n: 0, wins: 0, r: 0, avgMfe: 0, avgMae: 0 });
    const e = map.get(k);
    e.n++; e.r += t.r ?? 0;
    e.avgMfe += t.mfe ?? 0;
    e.avgMae += t.mae ?? 0;
    if ((t.r ?? 0) > 0) e.wins++;
  }
  const levels = [...map.values()]
    .sort((a, b) => {
      // Sort: GP first, then .786, .886, .5, .382, Pivot, Unknown
      const order = { GP: 0, '.786': 1, '.886': 2, '.5': 3, '.382': 4, Pivot: 5 };
      const oa = order[a.level] ?? 9, ob = order[b.level] ?? 9;
      return oa !== ob ? oa - ob : b.n - a.n;
    })
    .map(s => ({
      ...s,
      winRate: s.n > 0 ? +(s.wins / s.n * 100).toFixed(1) : 0,
      r: +s.r.toFixed(2),
      avgMfe: s.n > 0 ? +(s.avgMfe / s.n).toFixed(2) : 0,
      avgMae: s.n > 0 ? +(s.avgMae / s.n).toFixed(2) : 0,
    }));

  // Per zone variant (GP, .786, .886, .5, .382, Pivot)
  const vmap = new Map();
  for (const t of trades) {
    const k = t.zoneVariant ?? t.level ?? 'Unknown';
    if (!vmap.has(k)) vmap.set(k, { variant: k, n: 0, wins: 0, r: 0, avgMfe: 0, avgMae: 0 });
    const e = vmap.get(k);
    e.n++; e.r += t.r ?? 0;
    e.avgMfe += t.mfe ?? 0;
    e.avgMae += t.mae ?? 0;
    if ((t.r ?? 0) > 0) e.wins++;
  }
  const variants = [...vmap.values()]
    .sort((a, b) => {
      const order = { GP: 0, '.786': 1, '.886': 2, '.5': 3, '.382': 4, Pivot: 5 };
      const oa = order[a.variant] ?? 9, ob = order[b.variant] ?? 9;
      return oa !== ob ? oa - ob : b.n - a.n;
    })
    .map(s => ({
      ...s,
      winRate: s.n > 0 ? +(s.wins / s.n * 100).toFixed(1) : 0,
      r: +s.r.toFixed(2),
      avgMfe: s.n > 0 ? +(s.avgMfe / s.n).toFixed(2) : 0,
      avgMae: s.n > 0 ? +(s.avgMae / s.n).toFixed(2) : 0,
    }));

  return { levels, variants };
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
    cur = new Date(isEnd);
    cur.setUTCMonth(cur.getUTCMonth() + oosMonths);
    if (cur >= end) break;
  }
  return windows.slice(0, 12);
}

// ── Main backtest run ──────────────────────────────────────────────────────────
function handleRun(cfg) {
  const m5  = _bars.m5;
  const m30 = _bars.m30;
  const m1  = _bars.m1;

  if (!m5?.length || !m30?.length) {
    post('error', 'Missing M5 or M30 data');
    return;
  }
  const hasM1 = m1?.length > 0;
  if (!hasM1) {
    post('progress', { status: 'M1 not available — using M5 for trade management (introduces inside-bar ambiguity)', pct: 1 });
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
  const fibLookbackDays  = cfg.fibLookbackDays   ?? 30;
  const _sd              = cfg.startDate         ?? null;
  const _ed              = cfg.endDate           ?? null;
  const isSplit          = cfg.isSplit           ?? 0;
  const wfoEnabled       = cfg.wfoEnabled        ?? false;
  const wfoIsMonths      = cfg.wfoIsMonths       ?? 6;
  const wfoOosMonths     = cfg.wfoOosMonths      ?? 2;
  const maxDailyLoss     = cfg.maxDailyLoss      ?? 0;
  const maxDailyTrades   = cfg.maxDailyTrades    ?? 3;

  // Gate toggles
  const useStructuralFib = cfg.useStructuralFib ?? true;  // M30 swing-based Fib entry zones
  const useSessionBonus  = cfg.useSessionBonus  ?? true;  // Asia/Monday range proximity → bonus star
  const usePivot         = cfg.usePivot         ?? true;
  const useVwapChop      = cfg.useVwapChop      ?? true;
  const useVmu           = cfg.useVmu           ?? true;
  const requireVmuAgree  = cfg.requireVmuAgree  ?? false;
  const useSession       = cfg.useSession       ?? true;
  const useChoch         = cfg.useChoch         ?? true;
  const useHtfEma        = cfg.useHtfEma        ?? true;
  const useAdx           = cfg.useAdx           ?? false;

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

  // ── Pre-compute structural fibs per day ──────────────────────────────────────
  post('progress', { status: 'Building structural fibs…', pct: 4 });
  const structFibMap = buildStructuralFibMap(m30, fibLookbackDays);

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
      const nextTs = i + 1 < m5.length ? m5[i + 1].ts : bar.ts + 300_000;
      let closed = false;

      if (hasM1) {
        // Entry is taken at the signal M5 bar's CLOSE (bar.c). Management must
        // only see M1 price action AT/AFTER that close, never the M1 bars that
        // make up the signal bar itself (which preceded the fill). The first
        // managed bar is the M5 bar AFTER the signal bar, so for that bar
        // bar.ts already equals the entry close; for the signal bar itself we
        // must not scan its own M1 bars. Clamp the scan start to the entry close
        // (= signal bar open + one M5 bar = entryTs + 300000) so no pre-entry M1
        // bar can stop/TP the position (removes lookahead / fill optimism),
        // while still advancing normally on later bars.
        const m1Start = lowerBound(m1, Math.max(bar.ts, openTrade.entryTs + 300000));
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
        // M1 unavailable — use M5 bar (introduces inside-bar ambiguity)
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

    const asiaRange   = asiaRangeMap.get(lDate);
    const mondayRange = mondayRangeMap.get(getWeekStart(lDate));
    const pivots      = pivotMap.get(lDate);

    const price = bar.c;
    const m5Win = m5.slice(Math.max(0, i - 100), i + 1);
    const atr   = computeATR(m5Win, 14);
    if (!atr) continue;

    // ── Structural fib levels (primary entry zones) ───────────────────────────
    // Gold bot entries are where multiple M30-swing Fibonacci projections converge.
    // Levels: GP zone (0.618–0.65) and point retracements (0.382, 0.786, 0.886).
    const structFibs = structFibMap.get(lDate) ?? [];

    if (useStructuralFib && !structFibs.length) continue;

    let nearestLevel = null, nearestDist = Infinity;
    let inGpZone = false;

    // Map fib values to gold bot zone variant labels (matching Python bot convention)
    const fibVariantLabel = (fib) => {
      if (fib === 0.382) return '.382';
      if (fib === 0.5)   return '.5';
      if (fib === 0.786) return '.786';
      if (fib === 0.886) return '.886';
      return `Fib-${fib}`;
    };

    for (const lvl of structFibs) {
      if (lvl.type === 'gp') {
        if (price >= lvl.gpLow && price <= lvl.gpHigh) {
          if (!inGpZone) {
            inGpZone = true;
            nearestDist = 0;
            // Use the first matching GP zone's direction
            nearestLevel = { price: lvl.price, src: 'GP', variant: 'GP', dir: lvl.dir };
          }
        }
      } else {
        const dist = Math.abs(price - lvl.price);
        if (dist < fibTolerance && dist < nearestDist && !inGpZone) {
          nearestDist = dist;
          const vLabel = fibVariantLabel(lvl.fib);
          nearestLevel = { price: lvl.price, src: vLabel, variant: vLabel, dir: lvl.dir };
        }
      }
    }

    // Daily pivots as entry levels — R1/R2 are resistance (short), S1/S2 are support (long)
    if (!nearestLevel && usePivot && pivots) {
      const pivotEntries = [
        { price: pivots.pp, src: 'PP', variant: 'Pivot', dir: 'both'  },
        { price: pivots.r1, src: 'R1', variant: 'Pivot', dir: 'short' },
        { price: pivots.s1, src: 'S1', variant: 'Pivot', dir: 'long'  },
        { price: pivots.r2, src: 'R2', variant: 'Pivot', dir: 'short' },
        { price: pivots.s2, src: 'S2', variant: 'Pivot', dir: 'long'  },
      ];
      for (const pl of pivotEntries) {
        const dist = Math.abs(price - pl.price);
        if (dist < fibTolerance && dist < nearestDist) {
          nearestDist = dist;
          nearestLevel = { ...pl };
        }
      }
    }

    if (!nearestLevel) continue;

    // ── Confluence count (how many fib projections cluster near current price) ──
    let confluenceCount = 0;
    for (const lvl of structFibs) {
      const dist = lvl.type === 'gp'
        ? (price >= lvl.gpLow && price <= lvl.gpHigh
            ? 0
            : Math.min(Math.abs(price - lvl.gpLow), Math.abs(price - lvl.gpHigh)))
        : Math.abs(price - lvl.price);
      if (dist < fibTolerance * 1.5) confluenceCount++;
    }
    if (pivots && usePivot) {
      for (const pl of [pivots.pp, pivots.r1, pivots.s1, pivots.r2, pivots.s2]) {
        if (Math.abs(price - pl) < fibTolerance) { confluenceCount++; break; }
      }
    }

    // minConfirms now gates fib confluence (require 2+ projections from different
    // swing pairs to agree — this is the gold bot's core confluence requirement)
    if (confluenceCount < minConfirms) continue;

    // ── Asia/Monday session bonus (not a gate — adds star when nearby) ─────────
    let sessionBonus = 0;
    if (useSessionBonus) {
      if (asiaRange) {
        for (const fib of [0.382, 0.5, 0.618, 0.65, 0.786, 1.0]) {
          if (Math.abs(price - (asiaRange.low + asiaRange.range * fib)) < fibTolerance * 1.5) {
            sessionBonus++; break;
          }
        }
      }
      if (mondayRange) {
        for (const fib of [0.382, 0.5, 0.618, 0.786, 1.0]) {
          if (Math.abs(price - (mondayRange.low + mondayRange.range * fib)) < fibTolerance * 1.5) {
            sessionBonus++; break;
          }
        }
      }
    }

    // ── Direction: derived from fib geometry, confirmed by M30 CHoCH/BOS ───────
    //
    // 'ancL + r*fib' levels are support (price retraced DOWN → expect LONG bounce).
    // 'ancH - r*fib' levels are resistance (price retraced UP → expect SHORT bounce).
    // computeDirection was designed for Asia-range entries and most of its features
    // require price to be within atr*0.22 of an Asia/Monday boundary — they return
    // null at structural fib levels. Using it for direction here produced coin-flip
    // results. We use CHoCH/BOS alone as the structural confirmation filter.
    //
    // Note: this matches how the live gold bot determines trade direction —
    // the fib zone implies the reversal direction; structure confirms it.

    const m5Rev = m5.slice(Math.max(0, i - 200), i + 1).reverse();

    let m30Start = 0;
    for (let j = 0; j < m30.length; j++) {
      if (m30[j].lDate === lDate) { m30Start = Math.max(0, j - 200); break; }
    }
    const m30Win2 = m30.slice(m30Start, m30Start + 201);

    const dIdx = dailyIdxMap.get(lDate) ?? -1;
    const dailySlice = dIdx > 0 ? dailyBars.slice(Math.max(0, dIdx - 80), dIdx) : [];

    // Run CHoCH/BOS check in isolation (the only feature that directly signals
    // reversal structure without needing Asia/Monday boundary proximity)
    const chochOnlyCfg = Object.fromEntries(
      Object.keys(featureCfg).map(k => [k, { ...featureCfg[k], enabled: false }])
    );
    chochOnlyCfg.chochBos = { enabled: true, weight: 1, label: 'CHoCH / BOS' };
    const chochResult = computeDirection({
      bars5mRev: m5Rev, bars30m: m30Win2, dailyBars: dailySlice,
      asiaRange, mondayRange, atr, symbol: SYMBOL, price, todayDate: lDate,
      featureCfg: chochOnlyCfg,
    });
    const chochDir = chochResult.entryDir; // 'long', 'short', or null

    // Resolve final entry direction
    let entryDir = nearestLevel.dir;
    if (entryDir === 'both') {
      // PP has no inherent direction — require CHoCH to provide it
      if (!chochDir) continue;
      entryDir = chochDir;
    }

    // If M30 structure actively opposes the fib direction → skip
    // (null CHoCH = structure neutral → fine to take the trade)
    if (useChoch && chochDir && chochDir !== entryDir) continue;

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
    const slippage  = spread;
    const entryPrice = entryDir === 'long' ? price + slippage : price - slippage;
    const slDist    = Math.max(atr * slAtrMult, PIP * 50);
    const slPrice   = entryDir === 'long' ? entryPrice - slDist : entryPrice + slDist;
    const tp1Price  = entryDir === 'long' ? entryPrice + slDist * tp1R : entryPrice - slDist * tp1R;
    const tp2Price  = entryDir === 'long' ? entryPrice + slDist * tp2R : entryPrice - slDist * tp2R;

    const isOos = splitDate ? lDate >= splitDate : false;

    // Stars: choch alignment replaces conviction score
    const chochConfirms = chochDir === entryDir;
    const stars = Math.min(5,
      (inGpZone ? 2 : 1)
      + (confluenceCount >= 5 ? 1 : 0)
      + (chochConfirms ? 1 : 0)
      + (vmuResult?.signal === 'agree' ? 1 : 0)
      + sessionBonus
    );

    openTrade = {
      entryTs: bar.ts, entryPrice, exitTs: null, exitPrice: null,
      dir: entryDir, slPrice, tp1Price, tp2Price, slDist,
      tp1R, tp2R, tp1Hit: false,
      mfePts: 0, maePts: 0, mfe: 0, mae: 0, r: 0,
      result: '', holdingBars: 0,
      level: nearestLevel.src,
      zoneVariant: nearestLevel.variant,
      levelDir: entryDir,
      inGpZone,
      lDate, lHour, lDay,
      conviction: chochConfirms ? 0.5 : 0.0,
      confirmCount: confluenceCount,
      confluenceCount,
      vmuSignal: vmuResult?.signal ?? 'n/a',
      vmuComponents: vmuResult?.components ?? 0,
      isOos, stars,
      featureVotes: chochResult.results?.map(r => ({ key: r.key, signal: r.signal, val: r.val, pts: r.pts })) ?? [],
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
  const { levels, variants } = computeLevelStats(allTrades);

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

  // Trade sample for table and backtest-viewer.html (last 500)
  const tradeSample = allTrades.slice(-500).map(t => ({
    entryTs: t.entryTs, exitTs: t.exitTs,
    entryPrice: t.entryPrice, exitPrice: t.exitPrice,
    slPrice: t.slPrice, tp1Price: t.tp1Price, tp2Price: t.tp2Price,
    dir: t.dir, result: t.result,
    r: +t.r.toFixed(3), mfe: +t.mfe.toFixed(2), mae: +t.mae.toFixed(2),
    level: t.level, zoneVariant: t.zoneVariant, inGpZone: t.inGpZone,
    stars: t.stars, lDate: t.lDate, lHour: t.lHour, lDay: t.lDay,
    vmuSignal: t.vmuSignal, conviction: t.conviction, confirmCount: t.confirmCount,
    confluenceCount: t.confluenceCount,
    isOos: t.isOos,
  }));

  post('result', {
    allStats, isStats, oosStats,
    sessions, days, levels, variants, mc, wfoResults,
    tradeSample, totalTrades: allTrades.length,
    cfg,
  });
}
