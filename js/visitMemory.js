/**
 * visitMemory — what a rung's PRIOR visits are allowed to tell the CURRENT
 * touch. Shared by levelAtlasEngine.js and asiaFibAtlasEngine.js so the two
 * walks cannot drift on it.
 *
 * Why it exists (2026-09-28): both engines resolve a touch's outcome by
 * racing FORWARD through the rest of the day, and store that outcome in the
 * rung's visit history the instant the touch fires. A rung re-arms after only
 * a 0.15-0.5 rung-span pullback, so the NEXT touch of the same rung can fire
 * before the previous one has actually reached either barrier -- and
 * `hist.at(-1).outcome` then hands it a result nobody could have known yet.
 * That is the prevOutcomeSameDay leak (the "single cleanest effect in the
 * book"), the same class analysis/daily_open_retest_confluence_study.mjs and
 * analysis/dynamic_hl_level_confluence_study.mjs had already found and gated
 * in their own copies. The live path never had it: at "now" an unresolved
 * prior touch is still 'neither'. These helpers make the backtest walk see
 * exactly that.
 *
 * A visit is { outcome, resolveTime, ...dayKey }. `resolveTime` is the epoch
 * second the outcome became real (null for 'neither').
 */

/** The outcome a visit had AS OF epoch second `t`: its real outcome once it
 *  has resolved by then, otherwise 'neither' (what live would have seen). */
export function knownOutcome(visit, t) {
  if (!visit) return null;
  return visit.resolveTime != null && visit.resolveTime <= t ? visit.outcome : 'neither';
}

/** prevOutcomeSameDay, causally: the most recent same-day visit whose
 *  outcome was already resolved (and not 'neither') by `t`, else null.
 *  Scans back past still-unresolved visits, exactly like the live ladder
 *  (asiaFibAtlasEngine's `lastTouchByKey`), which only ever sees resolved
 *  touches. */
export function prevOutcomeSameDayAt(hist, dayNow, t, dayKey = 'dayIdx') {
  for (let x = hist.length - 1; x >= 0; x--) {
    const v = hist[x];
    if (v[dayKey] !== dayNow) break;          // history is chronological; earlier days are cross-day
    const o = knownOutcome(v, t);
    if (o !== 'neither') return o;
  }
  return null;
}

/** Rolling out/back rate over the ≤5 stored visits, each read AS OF `t`. */
export function rollingRateAt(hist, t) {
  if (hist.length < 3) return null;
  let out = 0, back = 0;
  for (const v of hist) {
    const o = knownOutcome(v, t);
    if (o === 'out') out++; else if (o === 'back') back++;
  }
  return { n: hist.length, outPct: +(out / hist.length * 100).toFixed(0), backPct: +(back / hist.length * 100).toFixed(0) };
}
