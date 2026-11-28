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
 * The interval is read automatically: the headline "estimate [lo, hi]" in the result (one cued headline/primary, else
 * the first that is not a placebo / mirror / shifted / post-hoc side arm), turned into the claimed direction (an entry's
 * `headline: { est, lo, hi, sign }` or a hand `grade` wins). The reading is returned so a page can show it and a person
 * can correct it. An entry with no interval is graded from its verdict and trust, labelled so.
 */

export const GRADES = ['strong', 'leaning', 'faint', 'untested', 'against', 'context'];
export const GRADE_WORD = { strong: 'Strong', leaning: 'Leaning', faint: 'Faint', untested: 'Untested properly', against: 'Against', context: 'Context' };
// weight band per grade; within a band the weight moves with how much of the interval lies on the claim side
const BAND = { strong: [80, 95], leaning: [55, 75], faint: [30, 50], untested: [20, 35], against: [3, 15] };

const NUM = String.raw`[-+−]?\d*\.?\d+`;
const UNIT = String.raw`%|pp|bp|ATR|sigma|σ|R|pts|log|x|K`;
// "est [unit] [/period] [up to four words] [lo, hi(, note)]": the words cover "% per trade", "ATR against the crowd",
// "vs control"; a trailing note inside the bracket ("month blocks") is allowed
const INTERVAL = new RegExp(String.raw`(${NUM})\s*(${UNIT})?(?![\w])\s*(?:\/\w+\s*)?(?:[A-Za-z][\w'-]*\s+){0,4}\[\s*(${NUM})\s*(?:%|pp|bp)?\s*,\s*(${NUM})\s*(?:%|pp|bp)?\s*(?:,[^\]\[]*)?\]`, 'g');
// a negative-sounding word in the estimate's own clause means "a positive number here may be worse" ("log-loss gain" is not)
const NEGATIVE_FRAMING = /(?<![-\w])(worse|worsen\w*|loss|loses|losing|narrower|cost|penalt\w*|drawdown|error)\b/i;
// cue words that mark a side arm rather than the headline: placebo, mirror, shifted control, post-hoc / described
const SIDE_ARM = /\b(placebo\w*|mirror\w*|shift(?:ed)?|shuffle[sd]?|neighbour[\w-]*|descriptive|described|post-hoc|secondary|planted|control itself|without 20\d\d)\b/i;
// ...unless that cue is the baseline of the headline comparison ("hold MINUS coin-flip placebo", "AGAINST a matched control")
const SIDE_AS_BASELINE = /\b(minus|vs\.?|versus|against|beats|over|than)\s+(?:[\w.,-]+\s+){0,3}?(placebo\w*|control|mirror\w*|shift(?:ed)?)\b[^;]*$/i;
const HEADLINE_CUE = /\b(headline|primary)\b/i;
const num = s => Number(String(s).replace(/−/g, '-'));

/** The text of the estimate's own sentence before it (back to the last "; " or ". "). */
function clauseBefore(text, at) {
  const pre = text.slice(Math.max(0, at - 160), at);
  let cut = pre.lastIndexOf(';');
  for (const m of pre.matchAll(/\.\s/g)) cut = Math.max(cut, m.index + 1);
  return pre.slice(cut + 1);
}

/** Every "estimate [lo, hi]" in a result text, in order, each with its clause and whether it reads as a side arm. */
export function readIntervals(text) {
  const t = String(text ?? ''), out = [];
  for (const m of t.matchAll(INTERVAL)) {
    let [est, lo, hi] = [num(m[1]), num(m[3]), num(m[4])];
    if (![est, lo, hi].every(Number.isFinite)) continue;
    if (lo > hi) [lo, hi] = [hi, lo];
    if (est < lo - 1e-12 || est > hi + 1e-12) continue;            // not an estimate with its own interval
    const unit = m[2] ?? '';
    const ratio = unit === 'x';                                      // a ratio: no effect is 1, not 0
    const clause = clauseBefore(t, m.index);
    const side = SIDE_ARM.test(clause) && !SIDE_AS_BASELINE.test(clause);
    const snippet = (clause.slice(-70) + t.slice(m.index, m.index + m[0].length)).replace(/\s+/g, ' ').trim();
    // a positive number that means "worse" (worse, loss, narrower, cost...) cannot be read as "the claimed way"
    const signUnclear = NEGATIVE_FRAMING.test(clause + m[0]);
    out.push({ est, lo, hi, unit, ratio, null0: ratio ? 1 : 0, snippet, signUnclear, side, headlineCue: HEADLINE_CUE.test(clause), source: 'text' });
  }
  return out;
}

/**
 * The headline "estimate [lo, hi]" in a result text, or null: the first one whose clause names it the headline or
 * primary; else the first that is not a placebo / mirror / shifted / post-hoc side arm. If every interval is a side arm,
 * none is the headline and null is returned (the entry is then graded from its verdict).
 */
export function readInterval(text) {
  const all = readIntervals(text);
  return all.find(c => c.headlineCue && !c.side) ?? all.find(c => !c.side) ?? null;
}

const clamp01 = x => Math.max(0, Math.min(1, x));
const weightIn = (grade, share) => { const [a, b] = BAND[grade]; return Math.round(a + (b - a) * clamp01(share)); };

/**
 * The interval to grade from: the entry's own `headline: { est, lo, hi, sign, unit, note }` wins over the text
 * (any of est/lo/hi may be given; `sign: -1` alone keeps the text numbers but says the claim points negative).
 * Without an explicit sign a VALIDATED entry whose interval sits wholly below zero is read as a negative-direction
 * claim (it passed its own test, so its estimate is its claim's direction). Returns the reading plus the interval
 * turned into "the claimed way" units: eff/effLo/effHi > 0 means the claimed way.
 */
export function headlineOf(e) {
  const h = e?.headline;
  const text = readInterval(e?.result);
  let base = text;
  if (h && [h.est, h.lo, h.hi].some(Number.isFinite)) {
    const est = h.est ?? text?.est, lo = h.lo ?? text?.lo, hi = h.hi ?? text?.hi;
    if ([est, lo, hi].every(Number.isFinite)) {
      const ratio = (h.unit ?? text?.unit) === 'x';
      base = { est, lo: Math.min(lo, hi), hi: Math.max(lo, hi), unit: h.unit ?? text?.unit ?? '', ratio, null0: h.null0 ?? (ratio ? 1 : 0),
        snippet: h.note ?? `headline set on the entry: ${est} [${lo}, ${hi}]`, signUnclear: false, side: false, source: 'entry' };
    }
  }
  if (!base) return null;
  let sign = h?.sign === -1 || h?.sign === 1 ? h.sign : null, inferred = false;
  if (sign == null) {
    if (e?.verdict === 'validated' && base.hi - base.null0 < 0) { sign = -1; inferred = true; } else sign = 1;
  }
  const z = base.null0;
  const [a, b] = sign > 0 ? [base.lo - z, base.hi - z] : [z - base.hi, z - base.lo];
  const signUnclear = h?.sign != null ? false : base.signUnclear;      // a sign set by a person settles "worse"-framing
  return { ...base, signUnclear, sign, signInferred: inferred, eff: sign * (base.est - z), effLo: a, effHi: b, wrongWay: b < 0 };
}

/**
 * Grade one entry. audit = EVIDENCE_AUDIT[id] (or undefined). Returns
 * { grade, weight, trust, basis, iv, review, wrongWay } where iv = the interval read (or null; eff/effLo/effHi are
 * in the claimed direction) and basis = one plain sentence of why. An entry may carry `grade` (one of GRADES bar
 * context) with `gradeWhy` to settle what neither the text nor `headline` can.
 */
export function gradeEntry(e, audit) {
  const v = e?.verdict;
  const trust = audit?.status ?? (v === 'context' ? 'n/a' : 'unaudited');
  if (v === 'context') return { grade: 'context', weight: null, trust, basis: 'A description or base rate; no claim of prediction.', iv: null, review: false, wrongWay: false };
  const read = headlineOf(e);
  const review = !!read?.signUnclear;                                // a person must read which way the number points
  const iv = review ? null : read;
  const share = iv ? (iv.effHi === iv.effLo ? (iv.eff > 0 ? 1 : 0) : clamp01(iv.effHi / (iv.effHi - iv.effLo))) : null;   // share of the interval on the claimed side
  const suspect = trust === 'reopened' || trust === 'unverified';
  const sound = trust === 'stands' || trust === 'resolved';   // resolved = re-run fixed the audit's defect and re-banked
  const fmt = x => `${x >= 0 ? '+' : '−'}${Math.abs(+x.toPrecision(3))}`;
  const noteSign = iv && iv.sign < 0 ? ` (The claim points negative${iv.signInferred ? ', read from the passed test' : ''}; in the claimed direction the effect is ${fmt(iv.eff)} [${fmt(iv.effLo)}, ${fmt(iv.effHi)}].)` : '';
  const out = (grade, basis, s = share ?? 0.5) => ({ grade, weight: weightIn(grade, s), trust,
    basis: (review ? `${basis} (Interval found but its sign needs a person to read: "${read.snippet}".)` : basis) + noteSign,
    iv: read, review, wrongWay: !!iv?.wrongWay });

  if (e?.grade && GRADES.includes(e.grade) && e.grade !== 'context') return out(e.grade, e.gradeWhy ? `Set by hand: ${e.gradeWhy}` : 'Grade set by hand on the entry.', share ?? 0.5);
  if (v === 'validated') {
    if (sound && (!iv || iv.effLo > 0)) return out('strong', 'Passed its pre-registered test; the code audit found it sound.', share ?? 1);
    return out('leaning', suspect ? `Passed its test, but the code audit marked it ${trust}: real until the re-check says otherwise.` : 'Passed its test, but the interval or the audit leaves doubt.', share ?? 0.7);
  }
  if (suspect) return out('untested', `The test itself is ${trust} in the code audit, so its answer is unknown, not dead.`, share ?? 0.5);
  // clear of zero the OTHER way: whatever the study's own bar, the data argue against the claim as written
  if (iv?.wrongWay) return out('against', `The interval is clear of zero against the claimed direction (${fmt(iv.eff)} [${fmt(iv.effLo)}, ${fmt(iv.effHi)}] the claimed way)${sound ? '' : '; the test was not audited'}.`, share);
  if (v === 'underpowered') {
    if (iv && iv.effLo > 0) return out('leaning', 'The interval is clear of zero the claimed way; the study ruled itself underpowered for its own bar, so not proven.', share);
    if (iv && iv.eff > 0 && share >= 0.6) return out('faint', 'Pointed the claimed way, but the test could only have seen a large effect.');
    return out('untested', 'The test could only have seen a large effect; a small one is still possible.', share ?? 0.5);
  }
  // null
  if (!iv) return out(sound ? 'against' : 'untested', sound ? 'Tested and audited sound; no readable interval in the record, graded from the verdict.' : 'No readable interval in the record and the test was not audited.', 0.5);
  if (iv.effLo > 0) return out('leaning', 'The interval is clear of zero the claimed way; it failed on something else (cost, placebo, a half or the bar), not on "nothing there".', share);
  if (iv.eff > 0 && share >= 0.6) return out('faint', 'The estimate points the claimed way; the interval still includes zero.', share);
  if (!sound) return out('untested', 'Straddles zero and the test was not audited.', share);
  return out('against', 'The test was sound and powered, and the estimate sits at zero.', share);
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
