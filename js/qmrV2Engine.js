// js/qmrV2Engine.js — QMR v2: parquet M1 data, gates on/off, both-sides native.
//
// Everything validated on 2026-07-28/29 rebuilt into one engine, because the
// findings were spread across the old H1 engine plus three separate re-walks
// and that is exactly how numbers drift apart.
//
// WHAT CHANGED FROM v1 (server.js _computeNqQmr):
//
// 1. DATA. v1 runs on OANDA H1. This walks exits on real M1 bars from the R2
//    parquet store, with the gates still read off resampled H1 (they ARE hourly
//    decisions — reading them on M1 would invent precision the rule never had).
//    The M1 audit found H1 exits unbiased (-0.0018%/trade, t=-0.15), so this is
//    about removing the assumption, not about expecting a different answer.
//
// 2. GATES ON/OFF. The control arm measured the gates' DIRECTION call at zero
//    (dirAlpha -0.006%, t=-0.08) and the coin-flip return flat across gate
//    strictness (0.172% gates-off vs 0.186% strict), with gates-off scoring the
//    HIGHER Sharpe. So "do the gates earn their place" is a live question, and
//    an engine that cannot switch them off cannot answer it. gatesMode:'off'
//    trades every day whose overnight range clears minRangePct — nothing else.
//
// 3. BOTH-SIDES IS NATIVE, not reconstructed afterwards. v1 computed a
//    direction, then a control arm, then averaged. Here the two legs are walked
//    jointly from the start (qmrCore.bothSidesWalk), which is the only way to
//    get an honest combined MAE — the book is net flat at entry and only
//    develops P&L once one leg closes.
//
// With gates OFF and both sides on, "direction" has no meaning: entry is
// 13:00 UTC, both legs, half size, every qualifying day.

import {
  QMR_TIMING, QMR_COSTS, walkTrade, bothSidesWalk, netReturn, qmrStats,
  groupBarsByDate, overnightRange, entryBarFor,
} from './qmrCore.js';
import { resampleTo } from './barUtils.js';

// Measured round-trip spread per instrument (/api/nq-qmr/spread-check, 2500 H1
// bid/ask candles, 2026-07-29). NOT assumptions. A single global cost was wrong
// by 2.7x on gold while nearly right on NQ.
export const QMR_V2_SPREAD = {
  nq: 0.00937, spx500: 0.00937, us30: 0.00937, gold: 0.01521,
};

// Per-instrument defaults. Gold and the indices live on different % scales —
// running gold on an index's scale searches a region it never occupies, the
// units error that produced a 1-trade backtest earlier in this repo.
export const QMR_V2_DEFAULTS = {
  nq:     { gate1Threshold: 0.60, gate2MinMovePct: 0.10, stopMultiplier: 0.45, minRangePct: 0.15, tpPct: 1.50, riskPct: 1.00, eodHour: 20 },
  spx500: { gate1Threshold: 0.60, gate2MinMovePct: 0.10, stopMultiplier: 0.45, minRangePct: 0.15, tpPct: 1.50, riskPct: 1.00, eodHour: 20 },
  us30:   { gate1Threshold: 0.60, gate2MinMovePct: 0.10, stopMultiplier: 0.45, minRangePct: 0.15, tpPct: 1.50, riskPct: 1.00, eodHour: 20 },
  gold:   { gate1Threshold: 0.60, gate2MinMovePct: 0.05, stopMultiplier: 0.45, minRangePct: 0.10, tpPct: 0.80, riskPct: 1.00, eodHour: 19 },
};

// packed {n,times,opens,highs,lows,closes} -> {t,o,h,l,c}[] on an ISO minute
const unpack = (packed, fromEpoch = 0) => {
  const out = [];
  for (let i = 0; i < packed.n; i++) {
    if (packed.times[i] < fromEpoch) continue;
    out.push({
      t: new Date(packed.times[i] * 1000).toISOString().substring(0, 16),
      o: packed.opens[i], h: packed.highs[i], l: packed.lows[i], c: packed.closes[i],
      time: packed.times[i],
    });
  }
  return out;
};

// `packed` = M1 from loadM1ForPair. Everything else is config.
export function runQmrV2(packed, cfg = {}) {
  const key = cfg.instrument ?? 'nq';
  const d = { ...(QMR_V2_DEFAULTS[key] ?? QMR_V2_DEFAULTS.nq), ...cfg };
  const {
    gate1Threshold, gate2MinMovePct, stopMultiplier, minRangePct, tpPct, riskPct, eodHour,
    gatesMode = 'on', side = 'both', exitFromHour = null,
    costPct = QMR_V2_SPREAD[key] ?? QMR_COSTS.costPct,
    stopSlipPct = QMR_COSTS.stopSlipPct,
    minStopPct = 0.10,
    fromDate = null,
  } = d;

  const fromEpoch = fromDate ? Math.floor(new Date(fromDate + 'T00:00:00Z').getTime() / 1000) : 0;
  const m1 = unpack(packed, fromEpoch);
  if (!m1.length) return { error: 'no M1 bars in range' };

  // Gates read H1, exits walk M1. Resample once.
  const h1raw = resampleTo(m1.map(b => ({ time: b.time, open: b.o, high: b.h, low: b.l, close: b.c })), 60);
  const h1 = h1raw.map(b => ({
    t: new Date(b.time * 1000).toISOString().substring(0, 16),
    o: b.open, h: b.high, l: b.low, c: b.close,
  })).sort((a, b) => a.t.localeCompare(b.t));

  const byDateH1 = groupBarsByDate(h1);
  const byDateM1 = groupBarsByDate(m1);
  const dates = Object.keys(byDateH1).sort();
  const hh = n => String(n).padStart(2, '0');

  const trades = [];
  const skips = { weekend: 0, noOvernight: 0, lowRange: 0, gate1: 0, gate2: 0, noEntry: 0, noWalk: 0 };
  let equity = 1;
  const curve = [];

  for (let i = 1; i < dates.length; i++) {
    const today = dates[i], prev = dates[i - 1];
    const dow = new Date(today + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) { skips.weekend++; continue; }

    const on = overnightRange(byDateH1, prev, today);
    if (!on) { skips.noOvernight++; continue; }
    if (on.rangePct < minRangePct) { skips.lowRange++; continue; }

    // ── Direction. With gates OFF this is skipped entirely: for a both-sides
    // book the direction was never used, and the control arm says the gates do
    // not select better days either. Entry becomes "every qualifying day".
    let dir = null;
    if (gatesMode === 'on') {
      const g1bar = (byDateH1[today] || []).find(b => b.t.substring(11, 13) === hh(QMR_TIMING.gate1Hour - 1));
      if (!g1bar) { skips.gate1++; continue; }
      const pos = (g1bar.c - on.low) / on.range;
      const g1 = pos >= gate1Threshold ? 'LONG' : pos <= 1 - gate1Threshold ? 'SHORT' : null;
      if (!g1) { skips.gate1++; continue; }

      const ldn = (byDateH1[today] || []).find(b => b.t.substring(11, 13) === hh(QMR_TIMING.londonOpenHour));
      const g2bar = (byDateH1[today] || []).find(b => b.t.substring(11, 13) === hh(QMR_TIMING.gate2Hour - 1));
      if (!ldn || !g2bar) { skips.gate2++; continue; }
      const move = (g2bar.c - ldn.o) / ldn.o * 100;
      if (move > gate2MinMovePct && g1 === 'LONG') dir = 'LONG';
      else if (move < -gate2MinMovePct && g1 === 'SHORT') dir = 'SHORT';
      else { skips.gate2++; continue; }
    } else {
      dir = 'LONG';   // placeholder; unused when side === 'both'
    }

    const entryBar = entryBarFor(byDateH1[today] || []);
    if (!entryBar) { skips.noEntry++; continue; }
    const entryHH = entryBar.t.substring(11, 16);
    const entry = entryBar.o;

    // Exit walk on M1, from the entry minute through the exit hour.
    // exitFromHour: null = honest (exposure starts the minute after entry).
    // Set to entryHour+1 to REPRODUCE the v1 H1 engine, which walked bars
    // strictly after the 13:00 bar and therefore could not stop you out during
    // the hour you entered - an hour that contains the 13:30 UTC NY cash open.
    const startAfter = exitFromHour == null ? entryHH : hh(exitFromHour) + ':00';
    const after = (byDateM1[today] || [])
      .filter(b => b.t.substring(11, 16) >= startAfter && parseInt(b.t.substring(11, 13)) <= eodHour)
      .sort((a, b) => a.t.localeCompare(b.t));
    if (after.length < 30) { skips.noWalk++; continue; }

    const stopPct = Math.max(+(on.rangePct * stopMultiplier).toFixed(4), minStopPct);
    const lev = riskPct / stopPct;
    const timing = { ...QMR_TIMING, eodHour };

    let ret, mae, mfe, reason, legs = null;
    if (side === 'both') {
      const w = bothSidesWalk(after, entry, stopPct, tpPct, timing);
      if (!w) { skips.noWalk++; continue; }
      // Cost once on the combined notional; stop slippage pro-rata to the legs
      // that actually stopped (each leg is half the notional).
      ret = (w.movePct - costPct - stopSlipPct * (w.stoppedLegs / 2)) * lev;
      mae = w.maePct * lev; mfe = w.mfePct * lev; reason = w.exitReason; legs = w.stoppedLegs;
    } else {
      const w = walkTrade(after, dir, entry, stopPct, tpPct, timing);
      if (!w) { skips.noWalk++; continue; }
      ret = netReturn(w.movePct, w.exitReason, lev, costPct, stopSlipPct);
      reason = w.exitReason;
      mae = 0; mfe = 0;
      for (const b of after) {
        const fav = dir === 'LONG' ? (b.h - entry) / entry * 100 : (entry - b.l) / entry * 100;
        const adv = dir === 'LONG' ? (b.l - entry) / entry * 100 : (entry - b.h) / entry * 100;
        if (fav > mfe) mfe = fav; if (adv < mae) mae = adv;
      }
      mae *= lev; mfe *= lev;
    }

    equity *= (1 + ret / 100);
    trades.push({
      date: today, direction: side === 'both' ? 'BOTH' : dir, entry: +entry.toFixed(2),
      stopPct: +stopPct.toFixed(3), leverage: +lev.toFixed(2), exitReason: reason,
      stoppedLegs: legs, ret: +ret.toFixed(4), tradeReturn: +ret.toFixed(4),
      mae: +mae.toFixed(3), mfe: +mfe.toFixed(3), m1Bars: after.length,
    });
    curve.push({ date: today, equity: +equity.toFixed(6) });
  }

  return {
    config: { instrument: key, gatesMode, side, exitFromHour, gate1Threshold, gate2MinMovePct,
              stopMultiplier, minRangePct, tpPct, riskPct, eodHour, costPct, stopSlipPct },
    dataSource: 'parquet-m1', m1Bars: m1.length, h1Bars: h1.length,
    dateRange: { start: trades[0]?.date ?? null, end: trades[trades.length - 1]?.date ?? null },
    trades, curve, stats: qmrStats(trades, curve, equity), skips,
  };
}
