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
 * Two trading STYLES (see STYLES), both with a fixed spec and no tunables:
 *   • fade_all           — every touched line is a FADE: enter (limit) at the
 *                          line, target the ADJACENT INNER band (innermost →
 *                          the open), SELL an up-line / BUY a down-line.
 *   • follow_med_fade_75 — MEDIAN lines FOLLOW (enter on a break THROUGH the
 *                          line, target the adjacent OUTER band, continue the
 *                          move) and 75th lines FADE. "Ride the median, fade the
 *                          extreme."
 * The stop is SYMMETRIC either way (equal distance the other side of entry —
 * 1:1 on distance).
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
  { key: 'H_med',  band: 'hl_median', side:  1, tier: 'med', label: 'H med',  color: '#34d399', dash: [7, 4] },
  { key: 'H_p75',  band: 'hl_75',     side:  1, tier: 'p75', label: 'H p75',  color: '#10b981', dash: [2, 4] },
  { key: 'Cp_med', band: 'oc_median', side:  1, tier: 'med', label: 'C+ med', color: '#60a5fa', dash: [7, 4] },
  { key: 'Cp_p75', band: 'oc_75',     side:  1, tier: 'p75', label: 'C+ p75', color: '#3b82f6', dash: [2, 4] },
  { key: 'Cm_med', band: 'oc_median', side: -1, tier: 'med', label: 'C- med', color: '#fbbf24', dash: [7, 4] },
  { key: 'Cm_p75', band: 'oc_75',     side: -1, tier: 'p75', label: 'C- p75', color: '#f59e0b', dash: [2, 4] },
  { key: 'L_med',  band: 'hl_median', side: -1, tier: 'med', label: 'L med',  color: '#f87171', dash: [7, 4] },
  { key: 'L_p75',  band: 'hl_75',     side: -1, tier: 'p75', label: 'L p75',  color: '#ef4444', dash: [2, 4] },
];

// Trading-style selector — how each armed line is traded on a touch:
//   • fade_all           — every line is a FADE (revert one band inward). The
//                          original behaviour.
//   • follow_med_fade_75 — MEDIAN lines are a FOLLOW (continue the move: enter on
//                          a break THROUGH the band, target the next band OUT);
//                          75th lines are a FADE (revert inward). "Ride the
//                          median, fade the extreme."
// A `follow` on the outermost band (no band further out) is skipped.
export const STYLES = {
  fade_all:           { label: 'Fade all',            action: () => 'fade' },
  follow_med_fade_75: { label: 'Cont med · fade 75th', action: L => (L.tier === 'med' ? 'follow' : 'fade') },
};

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
      // `target` = the next line inward (fade); the innermost reverts to the open.
      // `outerTarget` = the next line outward (follow); null for the outermost.
      sideLines[i].target = i === 0 ? open : sideLines[i - 1].price;
      sideLines[i].outerTarget = i === sideLines.length - 1 ? null : sideLines[i + 1].price;
    }
  }
  const byKey = {};
  for (const l of lines) byKey[l.key] = l;
  return { open, lines, byKey };
}

// Run the touch-and-resolve race for every armed line over one session's
// intraday candles. `bars` are {time,open,high,low,close} in ascending time
// order. opts: { armed:Set<key>|null (null = all), costPct:number (round-trip %,
// netted off the gross move), style:'fade_all'|'follow_med_fade_75' (default
// 'fade_all') }. Each line becomes a FADE or a FOLLOW per the style:
//   • fade   — limit at the line, target the adjacent INNER band, SELL up-line /
//              BUY down-line (revert toward the open).
//   • follow — stop through the line, target the adjacent OUTER band, BUY up-line
//              / SELL down-line (continue the move). Skipped on the outermost
//              band (nothing further out to target).
// The stop is SYMMETRIC either way (equal distance the other side of entry).
// Returns an array of resolved trades.
export function reversionTrades(open, bars, pcts, opts = {}) {
  const { armed = null, costPct = 0, style = 'fade_all', sltp = null, forwardBars = null } = opts;
  const lad = ladderLevels(open, pcts);
  if (!lad || !bars || !bars.length) return [];
  const styleDef = STYLES[style] || STYLES.fade_all;
  // SL/TP mode:
  //   • 'level' (default) — TP = the adjacent band (inner for fade / outer for
  //     follow), SL = symmetric (1:1 on distance). The original behaviour.
  //   • 'fixed' — SL = a fixed PRICE distance `slDist` (the caller converts
  //     pips/points → price), TP = slDist × `tpMult`, both off the entry in the
  //     trade's direction. Lets you A/B "tight defined-risk stop, 2R target" vs
  //     the band geometry. Entry line + fade/follow direction are unchanged.
  const fixed = sltp && sltp.mode === 'fixed' && sltp.slDist > 0;
  // EOD handling. By default the walk sees only THIS session's bars, so anything
  // unresolved marks to the session close ('expired') — kill-at-EOD. Pass
  // `forwardBars` (the following sessions' bars, ascending) to LET THE TRADE RUN
  // past EOD: the walk continues into them so SL/TP can resolve later. The ENTRY
  // is still constrained to this session (fillTime ≤ the session's last bar), so
  // kill and run trade the IDENTICAL set of entries — only the exit differs.
  const walkArr = (forwardBars && forwardBars.length) ? bars.concat(forwardBars) : bars;
  const sessionEnd = bars[bars.length - 1].time;
  const lastClose = walkArr[walkArr.length - 1].close;
  const trades = [];
  for (const L of lad.lines) {
    if (armed && !armed.has(L.key)) continue;
    const action = styleDef.action(L);
    let isBuy, bandTarget, entryType;
    if (action === 'follow') {
      if (L.outerTarget == null) continue;    // outermost: nothing further out to target
      isBuy = L.side > 0;                      // continue the move: up-line BUY, down-line SELL
      bandTarget = L.outerTarget; entryType = 'stop';
    } else {
      isBuy = L.side < 0;                      // fade: up-line SELL, down-line BUY
      bandTarget = L.target; entryType = 'limit';
    }
    const entry = L.price;
    let tp, stop;
    if (fixed) {
      const slDist = sltp.slDist, tpDist = slDist * (sltp.tpMult > 0 ? sltp.tpMult : 1);
      tp   = entry + (isBuy ? tpDist : -tpDist);
      stop = entry + (isBuy ? -slDist : slDist);
    } else {
      tp = bandTarget;
      const dist = Math.abs(entry - bandTarget);
      stop = isBuy ? entry - dist : entry + dist;   // symmetric
    }
    const r = walkBars(walkArr, entry, tp, stop, isBuy, entryType, open);
    if (!r) continue;                          // line never touched at all
    // Run-mode only: reject a fill that first occurred AFTER this session — such
    // an entry wouldn't exist in kill mode, so dropping it keeps the two modes'
    // trade sets identical (only the exit horizon differs).
    if (r.fillTime != null && r.fillTime > sessionEnd) continue;
    // walkBars labels a POSITIVE mark-to-close as 'win' (and a non-positive one
    // as 'open'), which conflates "reached the target" with "expired in profit".
    // Separate them: a true target-hit books exactly the entry→TP distance;
    // anything else that isn't a stop is an expiry (marked to the session close).
    const winPct = Math.abs(entry - tp) / open * 100;
    const outcome = r.outcome === 'loss' ? 'loss'
                  : (r.outcome === 'win' && Math.abs(r.pnlPct - winPct) <= 1e-9) ? 'win'
                  : 'expired';
    const exitPrice = outcome === 'win' ? tp : outcome === 'loss' ? stop : lastClose;
    trades.push({
      key: L.key, label: L.label, color: L.color, side: isBuy ? 'BUY' : 'SELL', action,
      entry, target: tp, stop, exitPrice, pct: L.pct,
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
