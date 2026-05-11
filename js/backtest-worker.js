// backtest-worker.js — Web Worker: CSV parsing and backtest execution
// Loaded as type:'module'. Import path is relative to worker file location.

import {
  FIB_LEVELS, tsToLondon, computeBodyRange, projectFibLevels, detectConfluences,
  computeATR, computeDirection, getPipSize, getDigits,
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

  // 4. Sorted trading dates (filtered by configured date range)
  const tradingDateSet = new Set();
  for (const b of m5) { if (b.lDay !== 0 && b.lDay !== 6) tradingDateSet.add(b.lDate); }
  const _allDates = [...tradingDateSet].sort();
  const _sd = cfg.startDate || null;
  const _ed = cfg.endDate   || null;
  const tradingDates = _allDates.filter(d => (!_sd || d >= _sd) && (!_ed || d <= _ed));

  // 5. Monday range per trading date (rolling) — build over all dates so
  //    lookups are correct even when start date cuts off early Mondays
  const mondayLookup     = buildMondayLookup(_allDates, mondayRangeMap);
  const prevMondayLookup = buildPrevMondayLookup(_allDates, mondayRangeMap);

  // 7. Bar indices by date
  const m5ByDate  = indexByDate(m5);
  const m30ByDate = indexByDate(m30);
  const m1ByDate  = m1?.length ? indexByDate(m1) : new Map();

  post('progress', { status: 'Running backtest…', pct: 5 });

  // ── Config ────────────────────────────────────────────────────────────────
  const rrRatio       = cfg.rrRatio       ?? 2.2;
  const slMode        = cfg.slMode        ?? 'range';
  const slFraction    = cfg.slFraction    ?? 0.35;
  const slMult        = cfg.slMult        ?? 1.5;
  const minSlPips     = cfg.minSlPips     ?? 5;
  const tpMode        = cfg.tpMode        ?? 'fixedR';
  const tpBuf         = cfg.tpBuf         ?? 5;
  const tpAtrFallback = cfg.tpAtrFallback ?? 5;
  const tpVolLo       = cfg.tpVolLo       ?? 2.0;
  const tpVolMed      = cfg.tpVolMed      ?? 3.0;
  const tpVolHi       = cfg.tpVolHi       ?? 5.0;
  const reEnterTp     = cfg.reEnterTp     ?? true;
  const flipOnSL      = cfg.flipOnSL      ?? false;
  const minConviction = cfg.minConviction ?? 0.0;
  const minConfirms   = cfg.minConfirms   ?? 2;
  const proxATR       = cfg.entryProximityATR ?? 0.30;
  const warmupDays    = cfg.warmupDays    ?? 100;
  const atrPeriod     = cfg.atrPeriod     ?? 14;
  const features      = cfg.features;
  const method        = cfg.method        ?? 'asia';
  const signalFilter  = cfg.signalFilter  ?? 'all_conf';
  const confTolPips   = cfg.confTolPips   ?? null;
  const entryWindow      = cfg.entryWindow      ?? 800;  // HHMM int e.g. 800 = 08:00
  const levelReentry     = Math.max(1, cfg.levelReentry ?? 2);
  const candleConfirmN   = cfg.candleConfirmN   ?? 0;    // 0 = disabled
  const candleConfirmPct = cfg.candleConfirmPct ?? 0.6;  // fraction of N bars that must close in dir
  const requireSweep     = cfg.requireSweep     ?? false;
  const sweepPips        = cfg.sweepPips        ?? 2;
  const secondTouchOnly  = cfg.secondTouchOnly  ?? false;
  const useM1Features    = cfg.useM1Features    ?? false;
  const rejectionBar     = cfg.rejectionBar     ?? false;  // same-bar wick rejection filter
  const rejWickPct       = cfg.rejWickPct       ?? 0.40;  // wick must be ≥ X of bar range
  const rejMinAtrPct     = cfg.rejMinAtrPct     ?? 0.30;  // bar range must be ≥ X of ATR
  const enabledFibSet = cfg.enabledFibs?.length
    ? new Set(cfg.enabledFibs.map(f => +f))
    : null;

  // ── Transaction cost config ────────────────────────────────────────────────
  const spreadPips    = cfg.spread      ?? 0;
  const slippagePips  = cfg.slippage    ?? 0;
  const commission    = cfg.commission  ?? 0;  // £/lot
  const totalCostPips = spreadPips + slippagePips;
  const posMode       = cfg.posMode     ?? 'fixed';
  const fixedSize     = cfg.fixedSize   ?? 10;   // £/pip
  const riskPct       = (cfg.riskPct    ?? 1.0) / 100;  // convert % → fraction

  // ── Kill switch config (in R) ──────────────────────────────────────────────
  const killDailyR   = cfg.killDaily   > 0 ? -(cfg.killDaily)   : null;
  const killWeeklyR  = cfg.killWeekly  > 0 ? -(cfg.killWeekly)  : null;
  const killMonthlyR = cfg.killMonthly > 0 ? -(cfg.killMonthly) : null;

  // ── Entry window from HHMM int ────────────────────────────────────────────
  const ewStartH = Math.floor(entryWindow / 100);
  const ewStartM = entryWindow % 100;
  const ewStartMins = ewStartH * 60 + ewStartM;  // minutes since midnight London
  const ewEndMins   = 20 * 60;  // always close by 20:00 London

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
  let bar1mWin       = []; // newest first, max 600 — only populated when useM1Features=true
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
      if (useM1Features) {
        for (const b of m1Today) { bar1mWin.unshift(b); if (bar1mWin.length > 600) bar1mWin.pop(); }
      }
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

    // ── Fib level filtering ───────────────────────────────────────────────
    const todayFibs = filterFibs(projectFibLevels(asiaRange), enabledFibSet);
    const prevFibs  = filterFibs(projectFibLevels(prevAsia),  enabledFibSet);

    const mondayRange     = mondayLookup.get(date)     || null;
    const prevMondayRange = prevMondayLookup.get(date) || null;

    // ── Confluence computation (method-aware) ─────────────────────────────
    let confluences = [];
    if (method === 'asia' || method === 'both') {
      confluences.push(...detectConfluences(todayFibs, prevFibs, symbol, confTolPips));
    }
    if ((method === 'monday' || method === 'both') && mondayRange && prevMondayRange) {
      const mFibs  = filterFibs(projectFibLevels(mondayRange),     enabledFibSet);
      const pmFibs = filterFibs(projectFibLevels(prevMondayRange),  enabledFibSet);
      confluences.push(...detectConfluences(mFibs, pmFibs, symbol, confTolPips));
    }

    // ── Signal filter ─────────────────────────────────────────────────────
    if (signalFilter === 'tight_only') {
      confluences = confluences.filter(c => c.isTight);
    } else if (signalFilter === 'all_levels') {
      // Trade at every enabled fib level — confluences not required
      confluences = todayFibs.map(f => ({ price: f.price, todayFib: f.fib, isTight: false, density: 1 }));
    }

    if (!confluences.length) {
      updateWindows(m5Today, m30Today, date, dailyBarMap, bar5mWin, bar30mWin, dailyBarWin);
      continue;
    }

    // ── Kill switch period resets ──────────────────────────────────────────
    const dayKey   = date;
    const weekKey  = getWeekKey(date);
    const monthKey = date.slice(0, 7);
    if (dayKey   !== lastDayKey)   { dailyR   = 0; lastDayKey   = dayKey;   }
    if (weekKey  !== lastWeekKey)  { weeklyR  = 0; lastWeekKey  = weekKey;  }
    if (monthKey !== lastMonthKey) { monthlyR = 0; lastMonthKey = monthKey; }

    // ── Per-day level touch counter (for re-entry limit) ─────────────────
    const dayLevelTouches = new Map();
    // ── Per-day sweep tracker: confKey → true when price has already wicked
    //    past the level by ≥ sweepPips, confirming liquidity was taken ─────
    const dayLevelSwept   = new Map();

    // ── Interleaved pointers ───────────────────────────────────────────────
    let m30Ptr = 0;
    let m5Ptr  = 0;  // tracks how far into m5Today we've ingested for windows
    let m1Ptr  = 0;  // tracks how far into m1Today we've ingested for bar1mWin

    // ── M1 bar loop (primary entry + exit loop) ───────────────────────────
    // M5 bars are used only for: ATR computation, feature windows, EOD exit,
    // and as wick-fallback exit when M1 is absent. All entry detection and
    // exit precision runs on M1 bars.
    // If M1 data is absent for this day, fall back to M5 as the entry loop.
    const entryBars = m1Today.length >= 200 ? m1Today : m5Today;
    const barDurMs  = m1Today.length >= 200 ? 60000   : 300000;

    for (let _bi = 0; _bi < entryBars.length; _bi++) {
      const bar = entryBars[_bi];
      const barCloseTs = bar.ts + barDurMs;

      // ── Advance M30 window up to this bar ─────────────────────────────
      while (m30Ptr < m30Today.length && m30Today[m30Ptr].ts < bar.ts) {
        bar30mWin.push(m30Today[m30Ptr++]);
        if (bar30mWin.length > 350) bar30mWin.shift();
      }

      // ── Advance M5 window up to this bar (newest-first) ───────────────
      while (m5Ptr < m5Today.length && m5Today[m5Ptr].ts < bar.ts) {
        bar5mWin.unshift(m5Today[m5Ptr++]);
        if (bar5mWin.length > 350) bar5mWin.pop();
      }

      // ── Advance M1 window up to this bar (newest-first) ───────────────
      // Only maintained when useM1Features=true to avoid the O(n) cost otherwise.
      // When entryBars IS m1Today this lags one bar behind (uses closed M1 bars only).
      if (useM1Features && m1Today.length > 0) {
        while (m1Ptr < m1Today.length && m1Today[m1Ptr].ts < bar.ts) {
          bar1mWin.unshift(m1Today[m1Ptr++]);
          if (bar1mWin.length > 600) bar1mWin.pop();
        }
      }

      // ── Exit check for open trade ──────────────────────────────────────
      if (openTrade && bar.ts >= openTrade.entryTs) {
        const ex = checkExit(bar, openTrade);
        if (ex) {
          const pip   = getPipSize(symbol);
          const costR = openTrade.slDist > 0 ? totalCostPips * pip / openTrade.slDist : 0;
          const closed = recordClose(openTrade, ex.price, ex.result, barCloseTs, trades, bayesian, costR);
          dailyR += closed.r; weeklyR += closed.r; monthlyR += closed.r;
          const closedTrade = openTrade;
          openTrade = null;
          // ── Re-enter at TP level ───────────────────────────────────
          if (ex.result === 'tp' && reEnterTp && closedTrade.confKey) {
            const st = dayLevelTouches.get(closedTrade.confKey);
            if (st) { st.clearedSince = true; dayLevelTouches.set(closedTrade.confKey, st); }
          }
          // ── Flip on SL ─────────────────────────────────────────────
          if (ex.result === 'sl' && flipOnSL && bar.lHour < 20) {
            openTrade = buildFlipTrade(closedTrade, barCloseTs, date, confluences, getPipSize(symbol), slMode, slMult, slFraction, minSlPips, tpMode, tpBuf, tpAtrFallback, tpVolLo, tpVolMed, tpVolHi, rrRatio, asiaRange);
          }
        }
      }

      // ── EOD exit ──────────────────────────────────────────────────────
      if (openTrade && bar.lHour >= 21) {
        const pip   = getPipSize(symbol);
        const costR = openTrade.slDist > 0 ? totalCostPips * pip / openTrade.slDist : 0;
        const eodPrice = openTrade.dir === 'long'
          ? Math.max(openTrade.sl, Math.min(openTrade.tp, bar.c))
          : Math.min(openTrade.sl, Math.max(openTrade.tp, bar.c));
        const closed = recordClose(openTrade, eodPrice, 'eod', barCloseTs, trades, bayesian, costR);
        dailyR += closed.r; weeklyR += closed.r; monthlyR += closed.r;
        openTrade = null;
        continue;
      }

      // ── Passive sweep scan ────────────────────────────────────────────
      // Track every bar: if price wicks past a confluence level by ≥ sweepPips
      // and then closes back on the other side, mark it as swept. This must
      // run even when a trade is open so future entries can use the flag.
      if (requireSweep) {
        const pip = getPipSize(symbol);
        const sweepDist = sweepPips * pip;
        for (const conf of confluences) {
          const ck = conf.price.toFixed(5);
          if (dayLevelSwept.get(ck)) continue;  // already marked
          // Wick past level by ≥ sweepPips AND close back through it
          const wickedBelow = bar.l <= conf.price - sweepDist && bar.c > conf.price;
          const wickedAbove = bar.h >= conf.price + sweepDist && bar.c < conf.price;
          if (wickedBelow || wickedAbove) dayLevelSwept.set(ck, true);
        }
      }

      // ── Kill switch gate ───────────────────────────────────────────────
      const killActive = (killDailyR   !== null && dailyR   <= killDailyR)
                      || (killWeeklyR  !== null && weeklyR  <= killWeeklyR)
                      || (killMonthlyR !== null && monthlyR <= killMonthlyR);

      // ── Entry check ───────────────────────────────────────────────────
      const barMins = bar.lHour * 60 + bar.lMin;
      if (!openTrade && !killActive && barMins >= ewStartMins && barMins < ewEndMins) {
        if (bar5mWin.length < 20) continue;
        const atr = computeATR(bar5mWin.slice(0, 50).reverse(), atrPeriod);
        if (atr <= 0) continue;
        const pip  = getPipSize(symbol);
        const prox = atr * proxATR;

        for (const conf of confluences) {
          // ── Level proximity check ───────────────────────────────────
          // Use bar high/low wick to detect a touch of the level,
          // not just close price — catches intra-bar level touches
          const touched = bar.l <= conf.price + prox && bar.h >= conf.price - prox;
          if (!touched) continue;

          // ── Level re-entry guard ────────────────────────────────────
          const confKey = conf.price.toFixed(5);
          const touches = dayLevelTouches.get(confKey) || { count: 0, clearedSince: true };
          if (touches.count >= levelReentry) continue;
          if (touches.count > 0 && !touches.clearedSince) {
            // Use the bar's full wick range for the cleared-distance check
            const clearDist = Math.max(Math.abs(bar.h - conf.price), Math.abs(bar.l - conf.price));
            if (clearDist >= atr * 0.5) {
              touches.clearedSince = true;
              dayLevelTouches.set(confKey, touches);
            } else {
              continue;
            }
          }

          // ── Direction from feature votes ────────────────────────────
          // computeDirection tallies weighted long/short votes from all features
          // and returns the winning side. Tie → null (skip trade).
          const rb = computeDirection({
            bars5mRev: bar5mWin, bars1mRev: bar1mWin, bars30m: bar30mWin, dailyBars: dailyBarWin,
            asiaRange, mondayRange, atr, symbol,
            price: bar.c, todayDate: date, featureCfg: features, useM1Features,
          });

          // No feature majority → skip (don't fall back to price-vs-level default)
          if (!rb.entryDir) continue;
          const entryDir = rb.entryDir;

          if (rb.conviction < minConviction || rb.confirmCount < minConfirms) continue;

          // ── Mean-reversion guard ────────────────────────────────────
          // Only trade toward the range midpoint. If features say 'long' but
          // price is below the level (meaning we'd be buying into a resistance),
          // that's a breakout trade — skip it.
          const rangeMid = asiaRange.high - asiaRange.range / 2;
          const mrDir    = bar.c > rangeMid ? 'short' : 'long';
          if (entryDir !== mrDir) continue;

          // ── Rejection bar filter ─────────────────────────────────────
          // Confirm quality on the TOUCH BAR ITSELF — no look-ahead, no R cost.
          // Three checks run simultaneously:
          //   1. Bar range ≥ rejMinAtrPct × ATR  (not a doji/flat bar)
          //   2. Close is on the correct side of the confluence level
          //      (long: bar.c > conf.price  |  short: bar.c < conf.price)
          //   3. Wick toward the level is ≥ rejWickPct of the bar's total range
          //      (long: lower wick = min(o,c) - low  |  short: high - max(o,c))
          if (rejectionBar) {
            const barRange = bar.h - bar.l;
            // 1. Not a doji
            if (barRange < atr * rejMinAtrPct) continue;
            // 2. Close must be back on the entry side of the level
            if (entryDir === 'long'  && bar.c <= conf.price) continue;
            if (entryDir === 'short' && bar.c >= conf.price) continue;
            // 3. Wick toward level must be meaningful
            const lowerWick = Math.min(bar.o, bar.c) - bar.l;
            const upperWick = bar.h - Math.max(bar.o, bar.c);
            const wick = entryDir === 'long' ? lowerWick : upperWick;
            if (wick / barRange < rejWickPct) continue;
          }

          // ── Liquidity sweep gate ─────────────────────────────────────
          // Require price to have already wicked through this level (taken
          // liquidity) before we enter. Prevents fading an untested level.
          if (requireSweep && !dayLevelSwept.get(confKey)) continue;

          // ── Second-touch-only gate ───────────────────────────────────
          // Treat the first bar touch as observation only. Only enter on the
          // second approach to the level (after price has left and returned).
          if (secondTouchOnly) {
            const st = dayLevelTouches.get(confKey) || { count: 0, clearedSince: true };
            if (st.count === 0) {
              // First touch — log it but don't trade
              st.count = 1;
              st.clearedSince = false;
              dayLevelTouches.set(confKey, st);
              continue;
            }
            // Second+ touch only enters if price clearly left and returned
            if (!st.clearedSince) continue;
          }

          // ── N-candle momentum confirmation ───────────────────────────
          // After the touch bar, look ahead at the next candleConfirmN M1
          // bars and require at least candleConfirmPct of them to close in
          // the trade direction. This filters sweep-and-reverse fakeouts.
          if (candleConfirmN > 0) {
            const confirmBars = entryBars.slice(_bi + 1, _bi + 1 + candleConfirmN);
            if (confirmBars.length < candleConfirmN) continue; // not enough bars left today
            let dirCount = 0;
            for (const cb of confirmBars) {
              if (entryDir === 'long'  && cb.c > cb.o) dirCount++;
              if (entryDir === 'short' && cb.c < cb.o) dirCount++;
            }
            if (dirCount / candleConfirmN < candleConfirmPct) continue;
            // Entry is placed after the confirmation window closes
            // Use the close of the last confirmation bar as entry bar
          }

          // ── SL calculation (from conf.price, not bar.c) ────────────
          let slDist;
          if (slMode === 'atr') {
            slDist = Math.max(slMult * atr, minSlPips * pip);
          } else if (slMode === 'atr30m') {
            const atr30 = bar30mWin.length >= 15 ? computeATR(bar30mWin.slice(-50), atrPeriod) : atr;
            slDist = Math.max(slMult * atr30, minSlPips * pip);
          } else {
            slDist = Math.max(asiaRange.range * slFraction, minSlPips * pip);
          }

          // ── TP calculation (from conf.price) ───────────────────────
          const entryPrice = conf.price;
          let tpDist;
          if (tpMode === 'structural') {
            const bufDist = tpBuf * pip;
            let tpPrice = null;
            const sortedConfs = [...confluences].sort((a, b) => a.price - b.price);
            if (entryDir === 'long') {
              const cands = sortedConfs.filter(l => l.price > entryPrice + pip * 0.5);
              if (cands.length) tpPrice = cands[0].price - bufDist;
            } else {
              const cands = sortedConfs.filter(l => l.price < entryPrice - pip * 0.5).reverse();
              if (cands.length) tpPrice = cands[0].price + bufDist;
            }
            tpDist = tpPrice !== null ? Math.abs(tpPrice - entryPrice) : tpAtrFallback * atr;
          } else if (tpMode === 'volScaledR') {
            const rangePips = asiaRange.range / pip;
            const regime = rangePips > 50 ? 'high' : rangePips > 25 ? 'med' : 'low';
            const volR   = regime === 'high' ? tpVolHi : regime === 'med' ? tpVolMed : tpVolLo;
            tpDist = slDist * volR;
          } else {
            tpDist = slDist * rrRatio;
          }

          if (tpDist <= 0) continue;

          const slPrice = entryDir === 'long' ? entryPrice - slDist : entryPrice + slDist;
          const tpPrice = entryDir === 'long' ? entryPrice + tpDist : entryPrice - tpDist;

          touches.count++;
          touches.clearedSince = false;
          dayLevelTouches.set(confKey, touches);

          openTrade = {
            dir:      entryDir,
            entry:    entryPrice,
            sl:       slPrice,
            tp:       tpPrice,
            slDist,
            tpDist,
            entryTs:  barCloseTs,
            date,
            conf:     conf.price,
            confKey,
            todayFib: conf.todayFib ?? null,
            yestFib:  conf.yestFib  ?? null,
            rb,
          };
          break;
        }
      }
    }

    // ── Ingest any remaining M5 bars into windows ──────────────────────────
    while (m5Ptr < m5Today.length) {
      bar5mWin.unshift(m5Today[m5Ptr++]);
      if (bar5mWin.length > 350) bar5mWin.pop();
    }

    // ── Drain remaining M30 bars ──────────────────────────────────────────
    while (m30Ptr < m30Today.length) {
      bar30mWin.push(m30Today[m30Ptr++]);
      if (bar30mWin.length > 350) bar30mWin.shift();
    }

    // ── Drain remaining M1 bars ───────────────────────────────────────────
    if (useM1Features) {
      while (m1Ptr < m1Today.length) {
        bar1mWin.unshift(m1Today[m1Ptr++]);
        if (bar1mWin.length > 600) bar1mWin.pop();
      }
    }

    // ── EOD force-close: any trade still open after the bar loop ─────────
    // The bar loop already handles the 21:00 exit via the EOD block.
    // This catches trades entered on the very last bar of the day.
    if (openTrade) {
      const pip   = getPipSize(symbol);
      const costR = openTrade.slDist > 0 ? totalCostPips * pip / openTrade.slDist : 0;
      const lb    = entryBars[entryBars.length - 1];
      const rawClose = lb?.c ?? openTrade.entry;
      const eodPrice = openTrade.dir === 'long'
        ? Math.max(openTrade.sl, Math.min(openTrade.tp, rawClose))
        : Math.min(openTrade.sl, Math.max(openTrade.tp, rawClose));
      const closed = recordClose(openTrade, eodPrice, 'eod', lb?.ts ?? openTrade.entryTs, trades, bayesian, costR);
      dailyR += closed.r; weeklyR += closed.r; monthlyR += closed.r;
      openTrade = null;
    }

    // ── Add today's completed daily bar to window ─────────────────────────
    const db = dailyBarMap.get(date);
    if (db) { dailyBarWin.push(db); if (dailyBarWin.length > 150) dailyBarWin.shift(); }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  post('progress', { status: 'Computing statistics…', pct: 96 });
  const result = computeStats(trades, rrRatio, bayesian);

  // Break-even cost: max pip cost/trade before strategy goes flat
  const pip = getPipSize(symbol);
  const avgSlDist = trades.length
    ? trades.reduce((s, t) => s + t.slDist, 0) / trades.length
    : 0;
  result.breakEvenCostPips = result.meanR > 0 && avgSlDist > 0
    ? +(result.meanR * avgSlDist / pip).toFixed(2)
    : 0;

  post('result', { ...result, symbol, costsPips: totalCostPips, posMode, commission });
}

// ── Flip trade builder ─────────────────────────────────────────────────────────

function buildFlipTrade(original, entryTs, date, confluences, pip, slMode, slMult, slFraction, minSlPips, tpMode, tpBuf, tpAtrFallback, tpVolLo, tpVolMed, tpVolHi, rrRatio, asiaRange) {
  const flipDir = original.dir === 'long' ? 'short' : 'long';
  const price   = original.entry;

  // Same SL distance as original
  const slDist = original.slDist;
  const slPrice = flipDir === 'long' ? price - slDist : price + slDist;

  // TP: next confluence in breakout direction — skip flip if none exists
  const bufDist = tpBuf * pip;
  const sortedConfs = [...confluences].sort((a, b) => a.price - b.price);
  let tpPrice = null;
  if (flipDir === 'long') {
    const cands = sortedConfs.filter(l => l.price > price + pip * 0.5);
    if (cands.length) tpPrice = cands[0].price - bufDist;
  } else {
    const cands = sortedConfs.filter(l => l.price < price - pip * 0.5).reverse();
    if (cands.length) tpPrice = cands[0].price + bufDist;
  }
  // No structural target → skip flip trade rather than using an arbitrary ATR fallback
  if (tpPrice === null) return null;
  const tpDist = Math.abs(tpPrice - price);
  if (tpDist <= 0) return null;

  return {
    dir:     flipDir,
    entry:   price,
    sl:      slPrice,
    tp:      flipDir === 'long' ? price + tpDist : price - tpDist,
    slDist,
    tpDist,
    entryTs,
    date,
    conf:    original.conf,
    confKey: null,
    rb:      original.rb,
    tag:     '⚡flip',
  };
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
    rb: trade.rb, conf: trade.conf, slDist: trade.slDist,
    todayFib: trade.todayFib ?? null,
    yestFib:  trade.yestFib  ?? null,
    tag: trade.tag || '',
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

// ── Fib level filter ──────────────────────────────────────────────────────────

function filterFibs(lvls, enabledFibSet) {
  if (!enabledFibSet) return lvls;
  return lvls.filter(l => enabledFibSet.has(l.fib));
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

function buildPrevMondayLookup(tradingDates, mondayRangeMap) {
  // Returns the Monday range from the week BEFORE the current week
  const lookup = new Map();
  let prev = null, current = null;
  for (const date of tradingDates) {
    if (mondayRangeMap.has(date)) {
      prev = current;
      current = date;
    }
    lookup.set(date, prev ? mondayRangeMap.get(prev) : null);
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

  // Last 200 trades — include feature votes and SD level for trade log detail
  const tradeSample = trades.slice(-200).map(t => ({
    dir:      t.dir,
    date:     t.date,
    entry:    t.entry,
    exit:     t.exit,
    result:   t.result,
    r:        +t.r.toFixed(3),
    conf:     t.conf,
    todayFib: t.todayFib ?? null,
    yestFib:  t.yestFib  ?? null,
    tag:      t.tag || '',
    features: (t.rb?.results || []).map(f => ({
      key:    f.key,
      label:  f.label,
      signal: f.signal,
      val:    String(f.val ?? ''),
      pts:    f.pts,
      icon:   f.icon,
    })),
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
