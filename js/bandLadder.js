/**
 * The day's band reads, all of them, so you can see which one actually told you something.
 *
 * The panel shows one read "as at 13:30" and says it re-reads at each checkpoint. The
 * obvious question is whether the morning read was the useful one or whether the value
 * is in the re-checking — and the parameters answer it, so this is built around the
 * answer rather than around a list.
 *
 * WHAT THE CLOCK ALONE DOES: nothing much. p(median reached before the close | not yet
 * reached) decays monotonically through the session — EUR/USD 48% at 07:00, 26% by
 * 13:30, 8% by 16:30. A re-read on a day where nothing has happened is not a sharper
 * read; it is the same read with less session left to be right in.
 *
 * WHAT THE STATE CHANGE DOES: a great deal. Reaching the median lifts the odds of the
 * 75th by a median of 3.3x, and on 64 of 64 instrument-checkpoint cells the lift is at
 * least 1.5x. It also GROWS later in the day (EUR/USD 2.2x at 07:00, 8.7x at 16:30),
 * because late in a session only a genuinely trending day gets there at all.
 *
 * So the ladder marks the checkpoints where the READ CHANGED BRANCH and says plainly
 * that the others are the clock running down. The thing worth watching for is a band
 * being reached, not the hour passing.
 *
 * Reconstruction is exact for the part that matters: the session carries the timestamp
 * each band was reached, so whether it had been reached by an earlier checkpoint is a
 * fact, not an estimate. The one soft edge is which SIDE the panel would have picked
 * when neither band had been reached — that tiebreak uses how far price had travelled,
 * which is only known as it stands now. Those rows are flagged `sideAssumed`.
 *
 * Pure: no fetch, no DOM. Tested in js/bandLadder.test.mjs.
 */

const _UK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, hour: '2-digit', minute: '2-digit' });

/** Minutes since UK midnight for an ISO instant — BST and GMT both, read at the instant. */
export function ukMinutesOf(iso) {
  const ms = Date.parse(String(iso ?? '').replace(/(\.\d{3})\d+Z$/, '$1Z'));
  if (!Number.isFinite(ms)) return null;
  const p = Object.fromEntries(_UK.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return (+p.hour % 24) * 60 + +p.minute;
}

/** Which branch the read takes for one side at one checkpoint. */
export function branchAt({ medMins = null, b75Mins = null } = {}, cpMins) {
  if (b75Mins != null && b75Mins <= cpMins) return 'stretch';   // the 75th is in
  if (medMins != null && medMins <= cpMins) return 'extended';  // the median is in
  return 'waiting';                                             // neither reached
}

/**
 * The whole day's ladder, one row per checkpoint reached so far.
 *
 * `changed` marks a row whose branch differs from the row before it — the informative
 * event. Every other row is the same read with less time left, and `whyUnchanged` says
 * so rather than letting a reader infer that eight readings mean eight pieces of news.
 */
export function ladder({ params = null, session = null, checkpoints = [], nowMins = 0 } = {}) {
  if (!params?.byCheckpoint || !session || !checkpoints.length) return { ok: false, reason: 'no band parameters for this instrument', rows: [] };

  const up = { medMins: ukMinutesOf(session.oh_reached_at), b75Mins: ukMinutesOf(session.oh_75_reached_at), ratio: session.oh_ratio ?? 0 };
  const dn = { medMins: ukMinutesOf(session.ol_reached_at), b75Mins: ukMinutesOf(session.ol_75_reached_at), ratio: session.ol_ratio ?? 0 };

  const rows = [];
  let prevKey = null;
  for (const [label, mins] of checkpoints) {
    if (mins > nowMins) break;
    const row = params.byCheckpoint[label];
    if (!row) continue;
    const bUp = branchAt(up, mins), bDn = branchAt(dn, mins);
    const rank = b => b === 'stretch' ? 3 : b === 'extended' ? 2 : 0;
    // the same ordering the panel uses: the side that has extended furthest, then the
    // side that has travelled more of its band
    const upFirst = rank(bUp) !== rank(bDn) ? rank(bUp) > rank(bDn) : up.ratio >= dn.ratio;
    const side = upFirst ? 'up' : 'dn';
    const branch = upFirst ? bUp : bDn;
    const pr = row[side];
    const key = `${side}|${branch}`;
    const p = branch === 'stretch' ? pr?.stall75?.p
      : branch === 'extended' ? pr?.p75givenMed?.p
      : pr?.pMedGivenNot?.p;
    const base = branch === 'extended' ? pr?.p75givenNot?.p : null;
    rows.push({
      cp: label, mins, side, branch, p: p ?? null,
      lift: (branch === 'extended' && p != null && base) ? +(p / base).toFixed(2) : null,
      n: (branch === 'stretch' ? pr?.stall75?.n : branch === 'extended' ? pr?.p75givenMed?.n : pr?.pMedGivenNot?.n) ?? null,
      changed: prevKey !== null && key !== prevKey,
      first: prevKey === null,
      // the side tiebreak needs how far price had travelled, which is only known as it
      // stands now — so a row where neither band was reached has an assumed side
      sideAssumed: branch === 'waiting' && rank(bUp) === rank(bDn),
    });
    prevKey = key;
  }
  const changes = rows.filter(r => r.changed);
  return {
    ok: true, rows, changes: changes.length,
    // the honest summary, and the answer to "is the value in the re-checking?"
    whyUnchanged: changes.length === 0
      ? 'Nothing changed state today: every re-read is the same read with less of the session left to be right in. The odds fall through the day because time runs out, not because the market said anything new.'
      : `The read changed at ${changes.map(c => c.cp).join(' and ')} — a band was reached. That is the informative event; the other checkpoints are the clock running down.`,
  };
}

/**
 * The lift from reaching the median, across the whole parameter set.
 *
 * Quoted on the panel so the claim "watch for the state change, not the hour" is backed
 * by the same numbers the read itself is built from, rather than asserted.
 */
export function medianLift(params = {}, checkpoints = []) {
  const all = [];
  for (const P of Object.values(params ?? {})) {
    for (const [label] of checkpoints) {
      for (const side of ['up', 'dn']) {
        const u = P?.byCheckpoint?.[label]?.[side];
        const a = u?.p75givenMed?.p, b = u?.p75givenNot?.p;
        if (a != null && b) all.push(a / b);
      }
    }
  }
  if (!all.length) return null;
  all.sort((x, y) => x - y);
  return { median: +all[Math.floor(all.length / 2)].toFixed(2), n: all.length,
           atLeast15: Math.round((100 * all.filter(x => x >= 1.5).length) / all.length) };
}
