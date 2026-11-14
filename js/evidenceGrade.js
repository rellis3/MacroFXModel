/**
 * Evidence grade: a confidence weight for every Evidence Book entry, in place of reading "null" as "dead".
 *
 * Owner direction 2026-11-13: a null at our power means "this test did not see it", not "proven false"; several past
 * nulls were later found to be bugs, lookahead or underpowered. So each entry gets a GRADE and a WEIGHT (0-100) built
 * from what is already recorded, never from a re-slice of old data:
 *
 *   1. what the data showed: the estimate and its interval, read from the result text ("+0.08 [-0.02, +0.18]");
 *   2. how much to trust the test itself: the 2026-10-31 code audit (js/evidenceAudit.js: stands / reopened / unverified);
 *   3. the banked verdict word, only as a tie-break (it says whether the study judged itself powered).
 *
 * Grades:
 *   strong     validated, the test audited sound, the interval clear of zero
 *   leaning    the interval sits clear of zero (or mostly on the claim side) but something is missing: not audited,
 *              failed cost/placebo, or a null that still pointed the claimed way
 *   faint      the estimate points the claimed way, the interval straddles zero: something may be there, too small to see
 *   untested   the test is suspect (reopened / unverified) or could only have seen a large effect: unknown, not dead
 *   against    the test was sound and powered AND the estimate sits at zero or the wrong way; the only grade that argues
 *              the claim does not hold, and it still carries a small weight
 *   context    a description or base rate, not a claim of prediction (not graded)
 *
 * The weight only moves up with NEW data scored forward (an alert ledger), never by re-reading the same history.
 * The interval is read automatically (first "estimate [lo, hi]" in the result); the reading is returned so a page can
 * show it and a person can correct it. An entry with no interval is graded from its verdict and trust, labelled so.
 */

export const GRADES = ['strong', 'leaning', 'faint', 'untested', 'against', 'context'];
export const GRADE_WORD = { strong: 'Strong', leaning: 'Leaning', faint: 'Faint', untested: 'Untested properly', against: 'Against', context: 'Context' };
// weight band per grade; within a band the weight moves with how much of the interval lies on the claim side
const BAND = { strong: [80, 95], leaning: [55, 75], faint: [30, 50], untested: [20, 35], against: [3, 15] };

const NUM = String.raw`[-+−]?\d*\.?\d+`;
const INTERVAL = new RegExp(String.raw`(${NUM})\s*(%|pp|bp|ATR|sigma|σ|R|pts)?\s*(?:/\w+\s*)?\[\s*(${NUM})\s*%?\s*,\s*(${NUM})\s*%?\s*\]`);
const NEGATIVE_FRAMING = /\b(worse|worsen\w*|loss|loses|losing|narrower|cost|penalt\w*|drawdown|error)\b/i;
const num = s => Number(String(s).replace('−', '-'));

/** The first "estimate [lo, hi]" in a result text, or null. */
export function readInterval(text) {
  const m = String(text ?? '').match(INTERVAL);
  if (!m) return null;
  let [est, lo, hi] = [num(m[1]), num(m[3]), num(m[4])];
  if (![est, lo, hi].every(Number.isFinite)) return null;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (est < lo - 1e-12 || est > hi + 1e-12) return null;          // not an estimate with its own interval
  const s = m.index, snippet = String(text).slice(Math.max(0, s - 60), s + m[0].length).replace(/\s+/g, ' ').trim();
  // a positive number that means "worse" (worse, loss, narrower, cost...) cannot be read as "the claimed way"
  const signUnclear = NEGATIVE_FRAMING.test(snippet);
  return { est, lo, hi, unit: m[2] ?? '', snippet, signUnclear };
}

const clamp01 = x => Math.max(0, Math.min(1, x));
const weightIn = (grade, share) => { const [a, b] = BAND[grade]; return Math.round(a + (b - a) * clamp01(share)); };

/**
 * Grade one entry. audit = EVIDENCE_AUDIT[id] (or undefined). Returns
 * { grade, weight, trust, basis, iv } where iv = the interval read (or null) and basis = one plain sentence of why.
 */
export function gradeEntry(e, audit) {
  const v = e?.verdict;
  const trust = audit?.status ?? (v === 'context' ? 'n/a' : 'unaudited');
  if (v === 'context') return { grade: 'context', weight: null, trust, basis: 'A description or base rate; no claim of prediction.', iv: null, review: false };
  const read = readInterval(e?.result);
  const review = !!read?.signUnclear;                                // a person must read which way the number points
  const iv = review ? null : read;
  const share = iv ? (iv.hi === iv.lo ? (iv.est > 0 ? 1 : 0) : clamp01(iv.hi / (iv.hi - iv.lo))) : null;   // share of the interval above zero
  const suspect = trust === 'reopened' || trust === 'unverified';
  const sound = trust === 'stands';
  const out = (grade, basis, s = share ?? 0.5) => ({ grade, weight: weightIn(grade, s), trust, basis: review ? `${basis} (Interval found but its sign needs a person to read: "${read.snippet}".)` : basis, iv: read, review });

  if (v === 'validated') {
    if (sound && (!iv || iv.lo > 0)) return out('strong', 'Passed its pre-registered test; the code audit found it sound.', share ?? 1);
    return out('leaning', suspect ? `Passed its test, but the code audit marked it ${trust}: real until the re-check says otherwise.` : 'Passed its test, but the interval or the audit leaves doubt.', share ?? 0.7);
  }
  if (suspect) return out('untested', `The test itself is ${trust} in the code audit, so its answer is unknown, not dead.`, share ?? 0.5);
  if (v === 'underpowered') {
    if (iv && iv.lo > 0) return out('leaning', 'The interval is clear of zero the claimed way; the study ruled itself underpowered for its own bar, so not proven.', share);
    if (iv && iv.est > 0 && share >= 0.6) return out('faint', 'Pointed the claimed way, but the test could only have seen a large effect.');
    return out('untested', 'The test could only have seen a large effect; a small one is still possible.', share ?? 0.5);
  }
  // null
  if (!iv) return out(sound ? 'against' : 'untested', sound ? 'Tested and audited sound; no readable interval in the record, graded from the verdict.' : 'No readable interval in the record and the test was not audited.', 0.5);
  if (iv.lo > 0) return out('leaning', 'The interval is clear of zero the claimed way; it failed on something else (cost, placebo, a half or the bar), not on "nothing there".', share);
  if (iv.est > 0 && share >= 0.6) return out('faint', 'The estimate points the claimed way; the interval still includes zero.', share);
  if (!sound) return out('untested', 'Straddles zero and the test was not audited.', share);
  return out('against', iv.hi <= 0 ? 'The test was sound and the estimate came out the wrong way.' : 'The test was sound and powered, and the estimate sits at zero.', share);
}

/** Grade every entry. Returns [{ id, ...gradeEntry }] in the book's order. */
export function gradeAll(entries, auditMap = {}) {
  return entries.map(e => ({ id: e.id, verdict: e.verdict, ...gradeEntry(e, auditMap[e.id]) }));
}

/** Counts by grade, and the cross-table verdict -> grade. */
export function gradeCounts(graded) {
  const byGrade = Object.fromEntries(GRADES.map(g => [g, 0]));
  const cross = {};
  for (const r of graded) { byGrade[r.grade]++; (cross[r.verdict] ??= Object.fromEntries(GRADES.map(g => [g, 0])))[r.grade]++; }
  return { byGrade, cross };
}
