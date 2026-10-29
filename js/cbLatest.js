// js/cbLatest.js — the `<bank>_latest` pointer rule for the factory-built
// central-bank engines (RBNZ / RBA / BoC / SNB in server.js).
//
// `latest` means the most recently PUBLISHED analysed document — the same
// meaning the BoJ/ECB pointers end up with because their polls walk releases
// in publication order (BoJ latest = the 06-16 minutes, published after the
// 07-31 statement). The factory used to write the pointer from whatever was
// analysed LAST, so a backfill or a late capture of an older meeting moved it
// backwards (live 2026-10-26: RBA latest 08-11 while 09-29 was analysed; BoC
// latest 07-15 while 09-02 was analysed).
//
// Publication time of a document, best first:
//   1. its own publish date, if the fetcher recorded one (raw.publishedOn);
//   2. the bank calendar's expectedAt for that (kind, meetingDate) — statement
//      = decision day, minutes/deliberations = meeting date + the bank's lag;
//   3. the meeting date itself.
// Ties (statement + SMP/MPR on the same day) go to the statement, so the
// headline document wins on decision day.

const KIND_RANK = { statement: 0 };   // lower = preferred on a publication tie

export function publishedAtMs({ kind, meetingDate, publishedOn = null }, releases = []) {
  if (publishedOn) {
    const t = Date.parse(publishedOn.length === 10 ? publishedOn + 'T12:00:00Z' : publishedOn);
    if (Number.isFinite(t)) return t;
  }
  const rel = releases.find(r => r.kind === kind && r.meetingDate === meetingDate);
  if (rel && Number.isFinite(rel.expectedAt)) return rel.expectedAt;
  return Date.parse(meetingDate + 'T12:00:00Z');
}

// Positive when a is newer than b.
export function compareLatest(a, b, releases = []) {
  const d = publishedAtMs(a, releases) - publishedAtMs(b, releases);
  if (d) return d;
  const ra = KIND_RANK[a.kind] ?? 1, rb = KIND_RANK[b.kind] ?? 1;
  return rb - ra;
}

// The "never move backwards" rule: replace only when there is no pointer, or
// the candidate is the same document, or it is strictly newer.
export function shouldReplaceLatest(current, candidate, releases = []) {
  if (!current || !current.kind || !current.meetingDate) return true;
  if (current.kind === candidate.kind && current.meetingDate === candidate.meetingDate) return true;
  return compareLatest(candidate, current, releases) > 0;
}

// Newest of a set of analysed documents ({kind, meetingDate[, publishedOn]}).
export function pickLatest(docs, releases = []) {
  let best = null;
  for (const d of docs) if (!best || compareLatest(d, best, releases) > 0) best = d;
  return best;
}
