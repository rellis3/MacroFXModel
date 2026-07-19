/**
 * Reversion Ladder — the "fade a vol band, target the level below it" brick.
 *
 * This is a VISUAL / DIAGNOSTIC brick, not an edge claim. It answers one
 * question, session by session: if we faded each forecast line the moment price
 * touched it and tried to revert one band inward, how often would that have
 * won vs lost? The tally it produces is an IN-SAMPLE backtest result rendered
 * as on-chart trades — useful for seeing structure, NOT evidence of edge (the
 * honest test is still the OOS harness). Fading statistical extremes is
 * folklore-adjacent; the default prior is null.
 *
 * The trade mechanic (fixed spec, no tunables to fit):
 *   • Entry  — fade the touched line: SELL an up-line, BUY a down-line, on first
 *              touch within the session (a limit fill at the line).
 *   • Target — the ADJACENT INNER band (the next forecast line closer to the
 *              open on the same side); the innermost band reverts to the open.
 *   • Stop   — SYMMETRIC: the same distance beyond entry as the target is inside
 *              it (1:1 on distance), i.e. further from the open.
 *   • Resolve — the SHARED fill walker `walkBars` (imported from forecastCore.js,
 *              never copied): SL checked first (conservative), TP not booked on
 *              the limit fill bar (no lookahead), a candle that straddles both
 *              target and stop counts as a LOSS, and an unresolved position marks
 *              to the session's last close ('expired').
 *
 * Calc-agnostic: it takes the four band percentages ({hl_median, hl_75,
 * oc_median, oc_75}) already produced by the page's Original / COG toggle, so
 * both calcs run through the identical mechanic and can be compared directly.
 *
 * Pure — no network, no DOM; unit-tested on synthetic bars in
 * reversionLadder.test.mjs.
 */

import { walkBars } from './forecastCore.js';

// The 8 forecast lines, mirroring forecast-replay's LEVELS so the overlay and
// the ladder agree on a single definition. `band` names the percentage field on
// the bands object; side +1 = above the open, -1 = below.
export const LADDER_LINES = [
  { key: 'H_med',  band: 'hl_median', side:  1, label: 'H med',  color: '#34d399', dash: [7, 4] },
  { key: 'H_p75',  band: 'hl_75',     side:  1, label: 'H p75',  color: '#10b981', dash: [2, 4] },
  { key: 'Cp_med', band: 'oc_median', side:  1, label: 'C+ med', color: '#60a5fa', dash: [7, 4] },
  { key: 'Cp_p75', band: 'oc_75',     side:  1, label: 'C+ p75', color: '#3b82f6', dash: [2, 4] },
  { key: 'Cm_med', band: 'oc_median', side: -1, label: 'C- med', color: '#fbbf24', dash: [7, 4] },
  { key: 'Cm_p75', band: 'oc_75',     side: -1, label: 'C- p75', color: '#f59e0b', dash: [2, 4] },
  { key: 'L_med',  band: 'hl_median', side: -1, label: 'L med',  color: '#f87171', dash: [7, 4] },
  { key: 'L_p75',  band: 'hl_75',     side: -1, label: 'L p75',  color: '#ef4444', dash: [2, 4] },
];

// Build the 8 line prices off `open` from a bands-pct object and assign each its
// reversion target = the adjacent line closer to the open on the same side (or
// the open itself for the innermost). Percentages are in PERCENT (e.g. 0.45 =
// 0.45%). Lines whose band pct is missing/non-positive are dropped. Returns
// { open, lines:[{...LINE, pct, price, target}], byKey } or null if degenerate.
export function ladderLevels(open, pcts) {
  if (!(open > 0) || !pcts) return null;
  const lines = [];
  for (const L of LADDER_LINES) {
    const pct = pcts[L.band];
    if (pct == null || !(pct > 0)) continue;
    lines.push({ ...L, pct, price: open * (1 + L.side * pct / 100) });
  }
  if (!lines.length) return null;
  for (const side of [1, -1]) {
    const sideLines = lines.filter(l => l.side === side).sort((a, b) => a.pct - b.pct);
    for (let i = 0; i < sideLines.length; i++) {
      // Target is the next line inward; the innermost reverts to the open.
      sideLines[i].target = i === 0 ? open : sideLines[i - 1].price;
    }
  }
  const byKey = {};
  for (const l of lines) byKey[l.key] = l;
  return { open, lines, byKey };
}

// Run the fade-and-revert race for every armed line over one session's intraday
// candles. `bars` are {time,open,high,low,close} in ascending time order.
// opts: { armed:Set<key>|null (null = all), costPct:number (round-trip %, netted
// off the gross move) }. Returns an array of resolved trades.
export function reversionTrades(open, bars, pcts, opts = {}) {
  const { armed = null, costPct = 0 } = opts;
  const lad = ladderLevels(open, pcts);
  if (!lad || !bars || !bars.length) return [];
  const lastClose = bars[bars.length - 1].close;
  const trades = [];
  for (const L of lad.lines) {
    if (armed && !armed.has(L.key)) continue;
    const isBuy = L.side < 0;                 // fade: buy a down-line, sell an up-line
    const entry = L.price;
    const target = L.target;
    const dist = Math.abs(entry - target);
    const stop = isBuy ? entry - dist : entry + dist;   // symmetric, further from open
    const r = walkBars(bars, entry, target, stop, isBuy, 'limit', open);
    if (!r) continue;                          // line never touched this session
    // walkBars labels a POSITIVE mark-to-close as 'win' (and a non-positive one
    // as 'open'), which conflates "reached the target" with "expired in profit".
    // Separate them: a true target-hit books exactly the entry→target distance;
    // anything else that isn't a stop is an expiry (marked to the session close).
    const winPct = Math.abs(entry - target) / open * 100;
    const outcome = r.outcome === 'loss' ? 'loss'
                  : (r.outcome === 'win' && Math.abs(r.pnlPct - winPct) <= 1e-9) ? 'win'
                  : 'expired';
    const exitPrice = outcome === 'win' ? target : outcome === 'loss' ? stop : lastClose;
    trades.push({
      key: L.key, label: L.label, color: L.color, side: isBuy ? 'BUY' : 'SELL',
      entry, target, stop, exitPrice, pct: L.pct,
      outcome, grossPct: r.pnlPct, netPct: r.pnlPct - costPct,
      entryTime: r.fillTime, exitTime: r.exitTime,
    });
  }
  return trades;
}

// Tally a flat list of trades into per-line + overall stats. `netPct` is summed
// (a rough cumulative %, not compounded — for eyeballing, not a live-equity claim).
export function tallyTrades(trades) {
  const blank = () => ({ n: 0, wins: 0, losses: 0, expired: 0, netPct: 0, winRate: 0 });
  const byKey = {};
  const total = blank();
  for (const t of trades) {
    const s = byKey[t.key] || (byKey[t.key] = blank());
    for (const acc of [s, total]) {
      acc.n++;
      if (t.outcome === 'win') acc.wins++;
      else if (t.outcome === 'loss') acc.losses++;
      else acc.expired++;
      acc.netPct += t.netPct;
    }
  }
  for (const s of [...Object.values(byKey), total]) s.winRate = s.n ? s.wins / s.n : 0;
  return { byKey, total };
}
