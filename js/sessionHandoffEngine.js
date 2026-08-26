/**
 * Session Handoff — the SESSION-BOUNDARY companion to Level Atlas / Session
 * Path. Neither of those asks this question: both are anchored to the fitted
 * forecast ladder (a rung/band derived from sigma). This engine has no ladder
 * at all — it asks a purely session-to-session question: "given how the
 * session that JUST CLOSED behaved, what does the NEXT session tend to do?"
 * One row per session boundary, not per touch or per checkpoint.
 * Chronologically: London→NY, NY→Asia, Asia→London (Asia is the one that
 * crosses the calendar-date boundary — see HANDOFFS, checked empirically
 * against real session start times, not assumed from key naming).
 *
 * ── THE SHAPE READ, CARRIED OVER FROM SESSION PATH ───────────────────────────
 * The same reversal-trap lesson applies one level up: a session that ran hard
 * in one direction and HELD near that extreme into its close is a different
 * setup from one that ran just as hard and gave most of it back before
 * closing — even though both "moved the same amount". So every closing
 * session is characterised by:
 *   side      — which direction it tried to go (whichever of high-open /
 *               open-low was bigger)
 *   giveback  — how much of that directional extent it gave back by the
 *               close: `1·held` (closed near its own extreme) /
 *               `2·partial-giveback` / `3·full-reversal` (closed back near or
 *               through the open — a failed push, not a held one)
 *   travel    — the session's own one-sidedness (this session's version of
 *               Level Atlas's `churn`, its single biggest touch-level
 *               finding): `1·churned` (chopped both ways, extent barely
 *               exceeds half the session's own range) vs `3·driven` (one-sided)
 *
 * ── TWO OUTCOMES, TESTED SEPARATELY ─────────────────────────────────────────
 * `continued` — does the NEXT session's close end up further in `side`'s
 * direction than the closing session's OWN close (i.e. does the baton keep
 * moving the same way)? Close-to-close, not open-to-close, so an overnight
 * gap (real for indices, near-zero for FX) is folded into the read rather
 * than hidden by starting the clock at the next session's own open.
 * Checked on real EURUSD/GOLD/GBPUSD/US30/NQ: a clean, consistent COIN FLIP
 * (48-53% across every side/giveback/travel/vol cut on every instrument) —
 * an honest null, not a bug (see `sessionHandoffReport.js`'s own header).
 *
 * `nextVol`/`nextRatio` — the NEXT session's own realized-range regime
 * (`sessionVolBucket`, same causal trailing-median formula, applied to the
 * session that's ABOUT to happen instead of the one that just closed). This
 * is volatility CLUSTERING, not direction, and unlike `continued` it is a
 * real, strong, monotonic effect on every instrument checked: a `3·wild`
 * closing session is followed by another wild session roughly 2-4x as often
 * as a `1·quiet` closing session is (EURUSD 16.5%→32.7%, GOLD 14.6%→33.8%,
 * US30 10.8%→40.5%) — consistent with the well-established GARCH/vol-
 * clustering literature, unlike session-to-session directional persistence,
 * which efficient-market theory gives no a-priori reason to expect (and
 * which is exactly what the `continued` null above confirms).
 *
 * ── NO-LOOKAHEAD CONTRACT ─────────────────────────────────────────────────
 * A row's context (side/giveback/travel/vol) reads ONLY the closing session's
 * own, already-fully-formed OHLC — that session is over by the time the
 * question is asked. `vol` is a trailing median over PRIOR sessions of the
 * SAME type only (`sessionVolBucket`, already causal). The outcome reads only
 * the NEXT session's own close, never anything from a session after that.
 *
 * Reuses `sessionRangeSeries`/`sessionVolBucket` from `levelAtlasEngine.js`
 * (session open/high/low/close + the trailing-median vol bucket) — no second
 * session-boundary walk, no second vol-regime formula.
 *
 * Pure: no network, no I/O. Callers supply packed M1.
 */

import { sessionRangeSeries, sessionVolBucket, prevSessionVolBucket, SESSION_BOUNDS } from './levelAtlasEngine.js';

function dowOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }

export const SESSIONS = Object.keys(SESSION_BOUNDS);   // ['Asia', 'London', 'NY']
export const TRANSITIONS = ['London→NY', 'NY→Asia', 'Asia→London'];   // actual chronological order — see HANDOFFS below
export const SIDES = ['up', 'down'];

// Which session CLOSES into which, and whether the next one is the SAME date
// key or the FOLLOWING date. Checked empirically against real session start
// times (`t0`), not assumed from the key-naming convention — the ACTUAL
// chronological order per date-key D is London(D) 07:00 → NY(D) 13:00 →
// Asia(D) 22:00 → London(D+1) 07:00. So Asia(D) is the one that crosses the
// date boundary into the NEXT key, not NY→Asia as the naming might suggest
// (Asia is keyed to the date it STARTS on, which already sits BETWEEN that
// day's NY close and the next day's London open).
const HANDOFFS = [
  { transition: 'London→NY', from: 'London', to: 'NY', sameDate: true },
  { transition: 'NY→Asia', from: 'NY', to: 'Asia', sameDate: true },
  { transition: 'Asia→London', from: 'Asia', to: 'London', sameDate: false },
];

function nextDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// The closing session's own directional shape. `side` is whichever extreme
// (high or low) sits further from the open; `giveback` reads how much of
// that extent the close surrendered (see module header). Returns null when
// there's no usable range (a session with zero/near-zero data).
function sessionShape(sess) {
  if (!sess || !(sess.range > 0)) return null;
  const { open, close, hi, lo, range } = sess;
  const upExtent = hi - open, downExtent = open - lo;
  const side = upExtent >= downExtent ? 'up' : 'down';
  const extent = Math.max(upExtent, downExtent);
  if (!(extent > 0)) return null;
  const travelRatio = extent / range;   // in [0.5, 1] by construction — one-sidedness
  const travel = travelRatio >= 0.85 ? '3·driven' : travelRatio >= 0.65 ? '2·mixed' : '1·churned';
  // closeExtent: how far the close ended up in the SIDE direction from open
  // (can be negative — closed on the OTHER side of the open than the extreme).
  const closeExtent = side === 'up' ? (close - open) : (open - close);
  const givebackRatio = (extent - closeExtent) / extent;   // 0 = closed at the extreme, 1 = back at open, >1 = through it
  const giveback = givebackRatio <= 0.25 ? '1·held' : givebackRatio <= 0.65 ? '2·partial-giveback' : '3·full-reversal';
  return { side, travel, giveback };
}

/**
 * Walk one instrument's full history and emit one record per (day, handoff) —
 * i.e. one per session boundary that actually closed both sides.
 *
 *   sessionHandoffWalk(packed, { instrument, assetClass })
 *     -> { rows: [...], coverage: { from, to, sessions } }
 */
export function sessionHandoffWalk(packed, { instrument, assetClass = 'fx', minLookback = 20, liveWindowDays = null } = {}) {
  const sym = String(instrument).toUpperCase();
  const rangeMap = sessionRangeSeries(packed);
  const dates = [...new Set([...rangeMap.keys()].map(k => k.split('|')[0]))].sort();
  if (dates.length <= minLookback) return { rows: [], coverage: null };

  const dateIdx = new Map(dates.map((d, k) => [d, k]));
  const startIdx = liveWindowDays != null ? Math.max(minLookback, dates.length - liveWindowDays) : minLookback;
  const rows = [];
  for (let i = startIdx; i < dates.length; i++) {
    const date = dates[i];
    const priorDates = dates.slice(0, i);
    const dow = dowOf(date);
    for (const { transition, from, to, sameDate } of HANDOFFS) {
      const closing = rangeMap.get(`${date}|${from}`);
      const nextDateKey = sameDate ? date : nextDate(date);
      const next = rangeMap.get(`${nextDateKey}|${to}`);
      if (!closing || !next || !(closing.range > 0) || !(next.close > 0)) continue;
      const shape = sessionShape(closing);
      if (!shape) continue;
      const volBucket = sessionVolBucket(rangeMap, date, from, priorDates)?.bucket ?? null;
      // Persistence check (#4): does the CLOSING session's own predecessor
      // (one hop further back) ALSO carry information about the NEXT
      // session's volatility, beyond what `vol` (the immediate predecessor)
      // already captures? Reuses the SAME shared helper Level Atlas/Session
      // Path now use — one canonical "what closed before this" answer.
      const prevVolBucket = prevSessionVolBucket(rangeMap, date, from, dates);

      const continued = shape.side === 'up' ? (next.close > closing.close) : (next.close < closing.close);

      // nextVol — the NEXT session's OWN vol regime (same causal trailing-
      // median formula, just applied to the session about to happen instead
      // of the one that closed). Needs THAT session's own prior-dates list,
      // which is only the same as `priorDates` for a same-date handoff
      // (Asia→London's next-date crossing needs one more date included).
      const nextIdx = dateIdx.get(nextDateKey);
      const nextPriorDates = nextIdx != null ? dates.slice(0, nextIdx) : priorDates;
      const nextVolInfo = sessionVolBucket(rangeMap, nextDateKey, to, nextPriorDates);

      rows.push({
        instrument: sym, assetClass, date, transition,
        side: shape.side, giveback: shape.giveback, travel: shape.travel,
        vol: volBucket, prevVol: prevVolBucket, dow,
        continued,
        nextVol: nextVolInfo?.bucket ?? null, nextRatio: nextVolInfo?.ratio ?? null,
      });
    }
  }
  return { rows, coverage: { from: dates[startIdx], to: dates.at(-1), sessions: dates.length } };
}
