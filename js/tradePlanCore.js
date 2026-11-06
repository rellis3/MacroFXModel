// js/tradePlanCore.js — the trade-plan shadow rule (forge/TRADE_PLAN_SHADOW_PREREG.md), frozen 2026-11-06.
//
// Two layers, joined: the DIRECTION layer (the tested 1-to-10 direction score; 8-10 LONG, 1-3 SHORT, else NO TRADE)
// decides whether there is a trade and which way; the VOL layer (the live daily ladder, with the stress-shadow lines for
// the stop when that factor exists) sets stop, target and size. Display-only forward record; never a bot input.
//
// Pure: no I/O, no clock. Tested in js/tradePlanCore.test.mjs.

export const RULE = Object.freeze({
  markets: Object.freeze(['NQ', 'SPX500', 'GOLD', 'EURUSD', 'GBPUSD', 'USDJPY']),
  oanda: Object.freeze({ NQ: 'NAS100_USD', SPX500: 'SPX500_USD', GOLD: 'XAU_USD', EURUSD: 'EUR_USD', GBPUSD: 'GBP_USD', USDJPY: 'USD_JPY' }),
  costKey: Object.freeze({ NQ: 'nq', SPX500: 'spx500', GOLD: 'gold', EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy' }),
  ledgerKey: Object.freeze({ NQ: 'nq', SPX500: 'es', GOLD: 'gold', EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy' }),
  b0Long: Object.freeze(['NQ', 'SPX500', 'GOLD']),       // buy-and-hold drift baseline; FX has no B0 arm
  longMin: 8, shortMax: 3,
  stopBeyondSigma: 0.35,                                 // nq-lines-as-exhaustion: median overshoot 0.3-0.5σ
  stopRung: 'p90', targetRung: 'p75',
  exitMinLondon: 21 * 60 + 55,                           // last bar opening before 21:55 London
  seed: 20261106,
  start: '2026-11-09',                                   // first London session after deploy (prereg: forward only)
  judgeTrades: 100, judgeDate: '2027-11-06', underpoweredDate: '2028-11-06',
  version: 'trade-plan-shadow-v1',
});

const fin = Number.isFinite;

/** Direction layer: score -> LONG / SHORT / NO TRADE. */
export function decisionOf(score) {
  if (!fin(score)) return 'NO TRADE';
  if (score >= RULE.longMin) return 'LONG';
  if (score <= RULE.shortMax) return 'SHORT';
  return 'NO TRADE';
}

/** FNV-1a 32-bit. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const coinSide = (date, sym, seed = RULE.seed) => (fnv1a(`${seed}|${date}|${sym}`) % 2 === 0 ? 'LONG' : 'SHORT');
export const b0Side = sym => (RULE.b0Long.includes(sym) ? 'LONG' : null);

/**
 * Both sides' plans from the open, the live flat ladder (% of open), σ (% of open) and the stress factor (null = live lines).
 * Returns null when a needed rung is missing.
 */
export function buildPlans({ open, flat, sigmaPct, stressFactor = null }) {
  if (!(open > 0) || !flat || !(sigmaPct > 0)) return null;
  const f = fin(stressFactor) && stressFactor > 0 ? stressFactor : 1;
  const { oh_p75, ol_p75, oh_p90, ol_p90 } = flat;
  if (![oh_p75, ol_p75, oh_p90, ol_p90].every(v => fin(v) && v > 0)) return null;
  const beyond = RULE.stopBeyondSigma * sigmaPct;
  const mk = (side, tgtPct, stopPct) => {
    const s = side === 'LONG' ? 1 : -1;
    const target = open * (1 + s * tgtPct / 100), stop = open * (1 - s * stopPct / 100);
    return { side, target, stop, targetPct: tgtPct, stopPct, targetSigma: tgtPct / sigmaPct, stopSigma: stopPct / sigmaPct, rr: tgtPct / stopPct };
  };
  return {
    open, sigmaPct, lines: fin(stressFactor) ? 'stress shadow (stop)' : 'live', stressFactor: fin(stressFactor) ? stressFactor : null,
    used: { oh_p75, ol_p75, oh_p90_stop: oh_p90 * f, ol_p90_stop: ol_p90 * f, beyondPct: beyond },
    LONG: mk('LONG', oh_p75, ol_p90 * f + beyond),
    SHORT: mk('SHORT', ol_p75, oh_p90 * f + beyond),
  };
}

/**
 * Score one side over M1 bars [{t (sec, open time), o, h, l, c}] ascending, from the entry bar.
 * Stop wins a bar that touches both. Exit otherwise at the close of the last bar opening before endSec.
 * costPct = round-trip cost, % of price.
 */
export function scoreSide(plan, open, bars, endSec, costPct = 0) {
  const s = plan.side === 'LONG' ? 1 : -1, risk = Math.abs(open - plan.stop);
  if (!(risk > 0)) return null;
  const inWin = bars.filter(b => b.t < endSec);
  if (!inWin.length) return null;
  let exit = null, how = null, at = null, both = false;
  for (const b of inWin) {
    const hitStop = s > 0 ? b.l <= plan.stop : b.h >= plan.stop;
    const hitTgt = s > 0 ? b.h >= plan.target : b.l <= plan.target;
    if (hitStop) { exit = plan.stop; how = 'stop'; at = b.t; both = hitTgt; break; }
    if (hitTgt) { exit = plan.target; how = 'target'; at = b.t; break; }
  }
  if (exit == null) { const last = inWin.at(-1); exit = last.c; how = 'close'; at = last.t; }
  const gross = s * (exit - open) / risk, costR = (costPct / 100) * open / risk;
  return { how, exit: +exit.toPrecision(10), at, both, grossR: +gross.toFixed(4), costR: +costR.toFixed(4), netR: +(gross - costR).toFixed(4) };
}

// ── summary of the forward record ────────────────────────────────────────────────────────────────────────────────────
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** Mean and session-clustered bootstrap 95% interval of `val(row)` over rows [{date, ...}]. */
export function clusteredMean(rows, val, { B = 2000, seed = RULE.seed } = {}) {
  const v = rows.map(x => ({ date: x.date, y: val(x) })).filter(x => fin(x.y));
  if (!v.length) return { n: 0, mean: null, ci: null, sessions: 0 };
  const by = new Map();
  for (const x of v) { const a = by.get(x.date) ?? []; a.push(x.y); by.set(x.date, a); }
  const groups = [...by.values()];
  const mean = v.reduce((a, x) => a + x.y, 0) / v.length;
  let ci = null;
  if (groups.length >= 10) {
    const r = rng(seed), out = [];
    for (let b = 0; b < B; b++) {
      let s = 0, n = 0;
      for (let k = 0; k < groups.length; k++) { const g = groups[Math.floor(r() * groups.length)]; for (const y of g) { s += y; n++; } }
      out.push(s / n);
    }
    out.sort((a, b) => a - b);
    ci = [+out[Math.floor(0.025 * B)].toFixed(4), +out[Math.floor(0.975 * B) - 1].toFixed(4)];
  }
  return { n: v.length, sessions: groups.length, mean: +mean.toFixed(4), ci };
}

/**
 * rows: [{date, sym, decision, score, out: {LONG: scoreSide, SHORT: scoreSide}, coin, b0}] (scored rows only).
 * Primary: trade rows' net R, and paired (decision - coin flip) on the same rows. B0 paired on index/gold trade rows.
 */
export function summarise(rows, today = null) {
  const scored = rows.filter(x => x.out?.LONG && x.out?.SHORT);
  const trades = scored.filter(x => x.decision === 'LONG' || x.decision === 'SHORT');
  const noTrade = scored.filter(x => x.decision === 'NO TRADE');
  const R = (x, side) => x.out[side]?.netR;
  const opp = s => (s === 'LONG' ? 'SHORT' : 'LONG');
  const b0Rows = trades.filter(x => x.b0);
  const hows = { target: 0, stop: 0, close: 0 };
  for (const x of trades) { const h = x.out[x.decision]?.how; if (h in hows) hows[h]++; }
  const judgeReady = trades.length >= RULE.judgeTrades && (today ?? '') >= RULE.judgeDate;
  return {
    rows: scored.length, sessions: new Set(scored.map(x => x.date)).size, tradeRows: trades.length, noTradeRows: noTrade.length,
    decision: clusteredMean(trades, x => R(x, x.decision)),
    coinOnTradeRows: clusteredMean(trades, x => R(x, x.coin)),
    pairedVsCoin: clusteredMean(trades, x => R(x, x.decision) - R(x, x.coin)),
    b0OnTradeRows: clusteredMean(b0Rows, x => R(x, x.b0)),
    pairedVsB0: clusteredMean(b0Rows, x => R(x, x.decision) - R(x, x.b0)),
    mirror: clusteredMean(trades, x => R(x, opp(x.decision))),
    exits: hows,
    noTradeLong: clusteredMean(noTrade, x => R(x, 'LONG')),
    noTradeShort: clusteredMean(noTrade, x => R(x, 'SHORT')),
    coinAllRows: clusteredMean(scored, x => R(x, x.coin)),
    b0AllRows: clusteredMean(scored.filter(x => x.b0), x => R(x, x.b0)),
    judge: { atTrades: RULE.judgeTrades, atDate: RULE.judgeDate, ready: judgeReady, verdict: 'CONTEXT (forward record, not judged)' },
  };
}
