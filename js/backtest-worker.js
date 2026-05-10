// backtest-worker.js — Web Worker: CSV parsing and backtest execution
// Loaded as type:'module'. Import path is relative to worker file location.

import {
  FIB_LEVELS, tsToLondon, computeBodyRange, projectFibLevels, detectConfluences,
  computeATR, computeSignal, getPipSize, getDigits,
} from './backtest-engine.js';

// ── Storage ────────────────────────────────────────────────────────────────────

const _bars = {}; // _bars[symbol][tf] = [] oldest→newest

// ── Entry point ────────────────────────────────────────────────────────────────

self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'parse') handleParse(payload);
  else if (type === 'run')   handleRun(payload);
};

// ── CSV Parser ─────────────────────────────────────────────────────────────────

function handleParse({ symbol, tf, text }) {
  if (!_bars[symbol]) _bars[symbol] = {};
  post('progress', { symbol, tf, status: 'Parsing…', rows: 0 });

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

    const { lDate, lHour, lMin, lDay } = tsToLondon(ts);
    bars.push({ ts, o, h, l, c, lDate, lHour, lMin, lDay });

    if (i % 50000 === 0) post('progress', { symbol, tf, rows: i, total: lines.length - 1 });
  }

  bars.sort((a, b) => a.ts - b.ts);
  _bars[symbol][tf] = bars;
  post('parsed', { symbol, tf, count: bars.length });
}

// ── Backtest ───────────────────────────────────────────────────────────────────

function handleRun({ symbol, cfg }) {
  const { m1, m5, m30 } = _bars[symbol] || {};
  if (!m5?.length || !m30?.length) {
    post('error', 'Missing M5 or M30 data for ' + symbol);
    return;
  }

  post('progress', { status: 'Precomputing ranges…', pct: 2 });

  // 1. Daily bars (oldest first)
  const allDailyBars = buildDailyBars(m30);
  const dailyBarMap  = new Map(allDailyBars.map(b => [b.lDate, b]));

  // 2. Asia range map: date → {high,low,range}
  const asiaRangeMap = buildAsiaRangeMap(m5);

  // 3. Monday range map: date → {high,low,range}
  const mondayRangeMap = buildMondayRangeMap(m30);

  // 4. Sorted trading dates
  const tradingDateSet = new Set();
  for (const b of m5) { if (b.lDay !== 0 && b.lDay !== 6) tradingDateSet.add(b.lDate); }
  const tradingDates = [...tradingDateSet].sort();

  // 5. Monday range per trading date (rolling)
  const mondayLookup = buildMondayLookup(tradingDates, mondayRangeMap);

  // 6. Bar indices by date
  const m5ByDate  = indexByDate(m5);
  const m30ByDate = indexByDate(m30);
  const m1ByDate  = m1?.length ? indexByDate(m1) : new Map();

  post('progress', { status: 'Running backtest…', pct: 5 });

  // ── Config ────────────────────────────────────────────────────────────────
  const rrRatio       = cfg.rrRatio       ?? 2.2;
  const slFraction    = cfg.slFraction    ?? 0.35;
  const minConviction = cfg.minConviction ?? 0.0;
  const minConfirms   = cfg.minConfirms   ?? 2;
  const proxATR       = cfg.entryProximityATR ?? 0.30;
  const warmupDays    = cfg.warmupDays    ?? 100;
  const features      = cfg.features;

  // ── Transaction cost config ────────────────────────────────────────────────
  const spreadPips   = cfg.spread   ?? 0;
  const slippagePips = cfg.slippage ?? 0;
  const totalCostPips = spreadPips + slippagePips;

  // ── Kill switch config (in R, at 1% risk 1R = 1%) ─────────────────────────
  const killDailyR   = cfg.killDaily   > 0 ? -(cfg.killDaily)   : null;
  const killWeeklyR  = cfg.killWeekly  > 0 ? -(cfg.killWeekly)  : null;
  const killMonthlyR = cfg.killMonthly > 0 ? -(cfg.killMonthly) : null;

  // ── State ─────────────────────────────────────────────────────────────────
  const trades     = [];
  const bayesian   = {};
  for (const key of Object.keys(features)) bayesian[key] = { fires: 0, wins: 0 };

  // Kill switch tracking
  let dailyR = 0,   lastDayKey   = '';
  let weeklyR = 0,  lastWeekKey  = '';
  let monthlyR = 0, lastMonthKey = '';

  let openTrade      = null;
  let bar5mWin       = []; // newest first, max 350
  let bar30mWin      = []; // oldest first, max 350
  let dailyBarWin    = []; // oldest first, max 150

  // ── Main loop ─────────────────────────────────────────────────────────────
  for (let di = 0; di < tradingDates.length; di++) {
    const date = tradingDates[di];

    if (di % 100 === 0) {
      post('progress', { status: 'Backtesting…', pct: 5 + Math.round(90 * di / tradingDates.length) });
    }

    const m5Today  = m5ByDate.get(date)  || [];
    const m30Today = m30ByDate.get(date) || [];
    const m1Today  = m1ByDate.get(date)  || [];

    // ── Skip warmup ───────────────────────────────────────────────────────
    if (di < warmupDays) {
      // Still build windows so features are warm when we start trading
      for (const b of m30Today) { bar30mWin.push(b); if (bar30mWin.length > 350) bar30mWin.shift(); }
      for (const b of m5Today)  { bar5mWin.unshift(b); if (bar5mWin.length > 350) bar5mWin.pop(); }
      const db = dailyBarMap.get(date);
      if (db) { dailyBarWin.push(db); if (dailyBarWin.length > 150) dailyBarWin.shift(); }
      continue;
    }

    // ── Asia range ────────────────────────────────────────────────────────
    const asiaRange = asiaRangeMap.get(date);
    if (!asiaRange || asiaRange.range <= 0) {
      updateWindows(m5Today, m30Today, date, dailyBarMap, bar5mWin, bar30mWin, dailyBarWin);
      continue;
    }
    const prevDate = di > 0 ? tradingDates[di - 1] : null;
    const prevAsia = prevDate ? asiaRangeMap.get(prevDate) : null;
    if (!prevAsia) {
      updateWindows(m5Today, m30Today, date, dailyBarMap, bar5mWin, bar30mWin, dailyBarWin);
      continue;
    }

    const confluences = detectConfluences(
      projectFibLevels(asiaRange), projectFibLevels(prevAsia), symbol
    );
    if (!confluences.length) {
      updateWindows(m5Today, m30Today, date, dailyBarMap, bar5mWin, bar30mWin, dailyBarWin);
      continue;
    }

    const mondayRange = mondayLookup.get(date) || null;

    // ── Kill switch period resets ──────────────────────────────────────────
    const dayKey   = date;
    const weekKey  = getWeekKey(date);
    const monthKey = date.slice(0, 7);
    if (dayKey   !== lastDayKey)   { dailyR   = 0; lastDayKey   = dayKey;   }
    if (weekKey  !== lastWeekKey)  { weeklyR  = 0; lastWeekKey  = weekKey;  }
    if (monthKey !== lastMonthKey) { monthlyR = 0; lastMonthKey = monthKey; }

    // ── Interleaved M30 pointer (look-ahead free) ─────────────────────────
    let m30Ptr = 0;
    let m1Ptr  = 0;

    // ── M5 bar loop ───────────────────────────────────────────────────────
    for (const m5 of m5Today) {
      // Advance M30 window to bars before this M5 bar
      while (m30Ptr < m30Today.length && m30Today[m30Ptr].ts < m5.ts) {
        bar30mWin.push(m30Today[m30Ptr++]);
        if (bar30mWin.length > 350) bar30mWin.shift();
      }

      // Advance M5 window (newest-first)
      bar5mWin.unshift(m5);
      if (bar5mWin.length > 350) bar5mWin.pop();

      const m5CloseTs = m5.ts + 5 * 60 * 1000;

      // ── Scan M1 bars for open trade exit ──────────────────────────────
      if (openTrade) {
        while (m1Ptr < m1Today.length && m1Today[m1Ptr].ts < m5CloseTs) {
          const m1 = m1Today[m1Ptr++];
          if (m1.ts < openTrade.entryTs) continue;
          const ex = checkExit(m1, openTrade);
          if (ex) {
            const pip = getPipSize(symbol);
            const costR = openTrade.slDist > 0 ? totalCostPips * pip / openTrade.slDist : 0;
            const closed = recordClose(openTrade, ex.price, ex.result, m1.ts, trades, bayesian, costR);
            dailyR += closed.r; weeklyR += closed.r; monthlyR += closed.r;
            openTrade = null;
            break;
          }
        }
      }

      // ── EOD exit ──────────────────────────────────────────────────────
      if (openTrade && m5.lHour >= 21) {
        const pip = getPipSize(symbol);
        const costR = openTrade.slDist > 0 ? totalCostPips * pip / openTrade.slDist : 0;
        const closed = recordClose(openTrade, m5.c, 'eod', m5CloseTs, trades, bayesian, costR);
        dailyR += closed.r; weeklyR += closed.r; monthlyR += closed.r;
        openTrade = null;
        continue;
      }

      // ── Kill switch gate ───────────────────────────────────────────────
      const killActive = (killDailyR   !== null && dailyR   <= killDailyR)
                      || (killWeeklyR  !== null && weeklyR  <= killWeeklyR)
                      || (killMonthlyR !== null && monthlyR <= killMonthlyR);

      // ── Entry check ───────────────────────────────────────────────────
      if (!openTrade && !killActive && m5.lHour >= 8 && m5.lHour <= 16) {
        const price = m5.c;
        // Need at least 20 bars in window for ATR
        if (bar5mWin.length < 20) continue;
        const atr = computeATR(bar5mWin.slice(0, 50).reverse(), 14);
        if (atr <= 0) continue;
        const prox = atr * proxATR;

        for (const conf of confluences) {
          if (Math.abs(price - conf.price) > prox) continue;
          const entryDir = conf.price > price ? 'short' : 'long';

          const rb = computeSignal({
            bars5mRev: bar5mWin,
            bars30m:   bar30mWin,
            dailyBars: dailyBarWin,
            asiaRange, mondayRange, atr, symbol,
            entryDir, price,
            todayDate: date,
            featureCfg: features,
          });

          if (rb.conviction >= minConviction && rb.confirmCount >= minConfirms) {
            const slDist = Math.max(asiaRange.range * slFraction, getPipSize(symbol) * 5);
            openTrade = {
              dir:      entryDir,
              entry:    price,
              sl:       entryDir === 'long' ? price - slDist : price + slDist,
              tp:       entryDir === 'long' ? price + slDist * rrRatio : price - slDist * rrRatio,
              slDist,
              entryTs:  m5CloseTs,
              date,
              conf:     conf.price,
              rb,
            };
            break;
          }
        }
      }
    }

    // ── Drain remaining M30 bars ──────────────────────────────────────────
    while (m30Ptr < m30Today.length) {
      bar30mWin.push(m30Today[m30Ptr++]);
      if (bar30mWin.length > 350) bar30mWin.shift();
    }

    // ── End-of-day: drain remaining M1 and force-close ───────────────────
    if (openTrade) {
      const pip = getPipSize(symbol);
      const costR = openTrade.slDist > 0 ? totalCostPips * pip / openTrade.slDist : 0;
      let eodClosed = false;
      while (m1Ptr < m1Today.length) {
        const m1 = m1Today[m1Ptr++];
        if (m1.ts < openTrade.entryTs) continue;
        const ex = checkExit(m1, openTrade);
        if (ex) {
          const closed = recordClose(openTrade, ex.price, ex.result, m1.ts, trades, bayesian, costR);
          dailyR += closed.r; weeklyR += closed.r; monthlyR += closed.r;
          openTrade = null;
          eodClosed = true;
          break;
        }
      }
      if (!eodClosed) {
        const lb = m1Today[m1Today.length - 1] ?? m5Today[m5Today.length - 1];
        const closed = recordClose(openTrade, lb?.c ?? openTrade.entry, 'eod', lb?.ts ?? openTrade.entryTs, trades, bayesian, costR);
        dailyR += closed.r; weeklyR += closed.r; monthlyR += closed.r;
        openTrade = null;
      }
    }

    // ── Add today's completed daily bar to window ─────────────────────────
    const db = dailyBarMap.get(date);
    if (db) { dailyBarWin.push(db); if (dailyBarWin.length > 150) dailyBarWin.shift(); }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  post('progress', { status: 'Computing statistics…', pct: 96 });
  const result = computeStats(trades, rrRatio, bayesian);
  post('result', { ...result, symbol, costsPips: totalCostPips });
}

// ── Exit check ─────────────────────────────────────────────────────────────────

function checkExit(bar, trade) {
  if (trade.dir === 'long') {
    if (bar.l <= trade.sl) return { price: trade.sl, result: 'sl' };
    if (bar.h >= trade.tp) return { price: trade.tp, result: 'tp' };
  } else {
    if (bar.h >= trade.sl) return { price: trade.sl, result: 'sl' };
    if (bar.l <= trade.tp) return { price: trade.tp, result: 'tp' };
  }
  return null;
}

function recordClose(trade, exitPrice, result, exitTs, trades, bayesian, costR = 0) {
  const sign  = trade.dir === 'long' ? 1 : -1;
  const rawR  = (exitPrice - trade.entry) * sign / trade.slDist;
  const r     = rawR - costR;
  const t = {
    dir: trade.dir, entry: trade.entry, exit: exitPrice, sl: trade.sl, tp: trade.tp,
    result, r, date: trade.date, entryTs: trade.entryTs, exitTs,
    rb: trade.rb, conf: trade.conf,
  };
  trades.push(t);
  const isWin = r > 0;
  for (const res of (trade.rb?.results || [])) {
    if (!bayesian[res.key]) continue;
    if (res.signal !== null) { bayesian[res.key].fires++; if (isWin) bayesian[res.key].wins++; }
  }
  return t;
}

// ── Window helpers ─────────────────────────────────────────────────────────────

function updateWindows(m5Today, m30Today, date, dailyBarMap, bar5mWin, bar30mWin, dailyBarWin) {
  for (const b of m30Today) { bar30mWin.push(b); if (bar30mWin.length > 350) bar30mWin.shift(); }
  for (const b of m5Today)  { bar5mWin.unshift(b); if (bar5mWin.length > 350) bar5mWin.pop(); }
  const db = dailyBarMap.get(date);
  if (db) { dailyBarWin.push(db); if (dailyBarWin.length > 150) dailyBarWin.shift(); }
}

function indexByDate(bars) {
  const map = new Map();
  for (const b of bars) {
    if (!map.has(b.lDate)) map.set(b.lDate, []);
    map.get(b.lDate).push(b);
  }
  return map;
}

// ── Week key helper ───────────────────────────────────────────────────────────

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

// ── Precompute helpers ─────────────────────────────────────────────────────────

function buildDailyBars(bars30m) {
  const byDate = new Map();
  for (const b of bars30m) {
    if (!byDate.has(b.lDate)) byDate.set(b.lDate, []);
    byDate.get(b.lDate).push(b);
  }
  return [...byDate.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, bars]) => ({
    lDate: date,
    o: bars[0].o,
    h: Math.max(...bars.map(b => b.h)),
    l: Math.min(...bars.map(b => b.l)),
    c: bars[bars.length - 1].c,
  }));
}

function buildAsiaRangeMap(bars5m) {
  const byDate = new Map();
  for (const b of bars5m) {
    if (b.lHour < 6 && b.lDay !== 0 && b.lDay !== 6) {
      if (!byDate.has(b.lDate)) byDate.set(b.lDate, []);
      byDate.get(b.lDate).push(b);
    }
  }
  const map = new Map();
  for (const [date, bars] of byDate.entries()) {
    if (bars.length >= 36) {
      const r = computeBodyRange(bars);
      if (r && r.range > 0) map.set(date, r);
    }
  }
  return map;
}

function buildMondayRangeMap(bars30m) {
  const byDate = new Map();
  for (const b of bars30m) {
    if (b.lDay !== 1) continue;
    if (!byDate.has(b.lDate)) byDate.set(b.lDate, []);
    byDate.get(b.lDate).push(b);
  }
  const map = new Map();
  for (const [date, bars] of byDate.entries()) {
    if (bars.length >= 20) {
      const r = computeBodyRange(bars);
      if (r) map.set(date, r);
    }
  }
  return map;
}

function buildMondayLookup(tradingDates, mondayRangeMap) {
  const lookup = new Map();
  let current  = null;
  for (const date of tradingDates) {
    if (mondayRangeMap.has(date)) current = date;
    lookup.set(date, current ? mondayRangeMap.get(current) : null);
  }
  return lookup;
}

// ── Statistics ─────────────────────────────────────────────────────────────────

function computeStats(trades, rrRatio, bayesian) {
  const empty = {
    totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
    meanR: 0, stdR: 0, sharpe: 0, calmar: 0, kelly: 0, cagr: 0, maxDrawdown: 0,
    equityCurve: [], monteCarlo: null, bayesian, tradeSample: [],
    dateRange: null,
  };
  if (!trades.length) return empty;

  const rVals  = trades.map(t => t.r);
  const wins   = rVals.filter(r => r > 0).length;
  const losses = trades.length - wins;
  const winRate = wins / trades.length;

  const sumW = rVals.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const sumL = Math.abs(rVals.filter(r => r <= 0).reduce((a, b) => a + b, 0));
  const profitFactor = sumL > 0 ? sumW / sumL : sumW > 0 ? Infinity : 0;

  const meanR = rVals.reduce((a, b) => a + b, 0) / rVals.length;
  const variance = rVals.reduce((a, b) => a + (b - meanR) ** 2, 0) / rVals.length;
  const stdR  = Math.sqrt(variance);

  const firstDate = trades[0].date, lastDate = trades[trades.length - 1].date;
  const years = Math.max(0.01,
    (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (365.25 * 86400000));
  const tpy   = trades.length / years;
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(tpy) : 0;

  // Equity curve + drawdown curve (cumulative R, 1% risk)
  const riskPct = 0.01;
  let cumR = 0, equity = 1, peak = 1, maxDD = 0;
  const equityCurve    = [{ x: 0, y: 0 }];
  const drawdownCurve  = [{ x: 0, y: 0 }];
  for (let i = 0; i < rVals.length; i++) {
    cumR += rVals[i];
    equity = 1 + cumR * riskPct;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
    equityCurve.push({ x: i + 1, y: cumR });
    drawdownCurve.push({ x: i + 1, y: -dd });
  }

  const finalEq = 1 + cumR * riskPct;
  const cagr    = Math.pow(Math.max(finalEq, 0.001), 1 / years) - 1;
  const calmar  = maxDD > 0 ? cagr / maxDD : 0;
  const kelly   = Math.max(0, winRate > 0 ? (winRate * (rrRatio + 1) - 1) / rrRatio : 0);

  // Bayesian
  for (const key of Object.keys(bayesian)) {
    const b = bayesian[key];
    b.winRate = b.fires > 0 ? b.wins / b.fires : null;
  }

  // Monte Carlo
  const monteCarlo = runMonteCarlo(rVals, riskPct);

  // Sample equity + drawdown curves ≤500 pts
  const step  = Math.max(1, Math.floor(equityCurve.length / 500));
  const curve = equityCurve.filter((_, i) => i % step === 0 || i === equityCurve.length - 1);
  const ddCurve = drawdownCurve.filter((_, i) => i % step === 0 || i === drawdownCurve.length - 1);

  // Monthly breakdown
  const monthlyMap = {};
  for (const t of trades) {
    const key = t.date.slice(0, 7);
    if (!monthlyMap[key]) monthlyMap[key] = { yearMonth: key, trades: 0, wins: 0, totalR: 0 };
    monthlyMap[key].trades++;
    if (t.r > 0) monthlyMap[key].wins++;
    monthlyMap[key].totalR += t.r;
  }
  const monthly = Object.values(monthlyMap)
    .sort((a, b) => a.yearMonth < b.yearMonth ? -1 : 1)
    .map(m => ({ ...m, totalR: +m.totalR.toFixed(2) }));

  // Last 200 trades
  const tradeSample = trades.slice(-200).map(t => ({
    dir: t.dir, date: t.date, entry: t.entry, exit: t.exit,
    result: t.result, r: +t.r.toFixed(3), conf: t.conf,
  }));

  return {
    totalTrades: trades.length, wins, losses, winRate,
    profitFactor, meanR, stdR, sharpe, calmar, kelly, cagr, maxDrawdown: maxDD,
    equityCurve: curve, drawdownCurve: ddCurve, monthly,
    monteCarlo, bayesian, tradeSample,
    dateRange: { first: firstDate, last: lastDate, years: +years.toFixed(1) },
  };
}

function runMonteCarlo(rVals, riskPct, N_SIM = 1000, N_PTS = 200) {
  if (rVals.length < 10) return null;
  const n    = rVals.length;
  const step = Math.max(1, Math.floor(n / N_PTS));
  const xs   = [];
  for (let i = step - 1; i < n; i += step) xs.push(i);
  if (!xs.length || xs[xs.length - 1] !== n - 1) xs.push(n - 1);
  const M = xs.length;

  // bands[pointIdx] accumulates cumR values across sims
  const bandVals = Array.from({ length: M }, () => []);
  const finals = [], maxDDs = [];

  for (let s = 0; s < N_SIM; s++) {
    let cumR = 0, peak = 1, mdd = 0, pi = 0;
    for (let i = 0; i < n; i++) {
      cumR += rVals[(Math.random() * n) | 0];
      const eq = 1 + cumR * riskPct;
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? (peak - eq) / peak : 0;
      if (dd > mdd) mdd = dd;
      if (pi < M && xs[pi] === i) { bandVals[pi].push(cumR); pi++; }
    }
    finals.push(1 + cumR * riskPct);
    maxDDs.push(mdd);
  }

  const pct = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(p * (s.length - 1))];
  };

  const bands = bandVals.map((vals, pi) => ({
    i:   xs[pi],
    p5:  pct(vals, 0.05),
    p25: pct(vals, 0.25),
    p50: pct(vals, 0.50),
    p75: pct(vals, 0.75),
    p95: pct(vals, 0.95),
  }));

  return {
    bands,
    finalEquity:  { p5: pct(finals, 0.05), p25: pct(finals, 0.25), p50: pct(finals, 0.50), p75: pct(finals, 0.75), p95: pct(finals, 0.95) },
    maxDrawdown:  { p5: pct(maxDDs, 0.05), p25: pct(maxDDs, 0.25), p50: pct(maxDDs, 0.50), p75: pct(maxDDs, 0.75), p95: pct(maxDDs, 0.95) },
    n: N_SIM,
  };
}

// ── Utility ────────────────────────────────────────────────────────────────────

function post(type, payload) {
  self.postMessage({ type, payload });
}
