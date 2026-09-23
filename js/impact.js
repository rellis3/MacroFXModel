/**
 * Impact propagation — this moved, so what did it do to everything downstream?
 *
 * THE GAP THIS FILLS. The desk could already run the question backwards
 * (explainMove: "gold is down, what accounts for it?") and sideways (confirmations:
 * "this mechanism implies four things, did they happen?"). It could not run it
 * FORWARDS, which is the one a macro reader actually asks: the 2-year moved 52bp, so
 * what should that have done to the curve, to banks, to gold, to the dollar — and
 * which of those actually took it?
 *
 * HOW THE EXPECTATION IS BUILT. Entirely in standardised space, because that is the
 * only place a 52bp yield move and a 6% gold move are comparable. If the source moved
 * z_s, and the pair's three-year relationship is r, the partner's expected move is
 * simply r × z_s. Compare that to what the partner actually did and the ratio is the
 * TRANSMISSION: 1.0 means it took the move exactly as the relationship implies, 0
 * means it ignored it, above 1 means it overshot, negative means it went the other
 * way entirely.
 *
 * WHY r AND NOT A FITTED MODEL. r is already an OLS slope on standardised legs
 * (scoreLink), so it IS the fitted coefficient — no second model, no new assumptions,
 * and the same number the map draws its line thickness from. One estimate, used
 * consistently, is worth more than three that can disagree.
 *
 * WHAT THIS IS NOT. Not causation and not a forecast. Both legs are measured over the
 * same twenty sessions, so this cannot tell you the source moved first — it tells you
 * whether the two are where the relationship says they should be relative to each
 * other. "Blocked" is the interesting verdict and it means something did not travel,
 * never that it is about to.
 *
 * Pure: no fetch, no DOM. Tested in js/impact.test.mjs.
 */

const MIN_CORR = 0.2;        // matches the scan's "too loose to break" floor
const MIN_EXPECT = 0.45;     // below this the implied move is inside the noise anyway

/** How the partner's actual move compares with what the relationship implied. */
export function classify(expectedZ, actualZ) {
  if (expectedZ == null || actualZ == null) return null;
  if (Math.abs(expectedZ) < MIN_EXPECT) return { verdict: 'too small', ratio: null };
  const ratio = actualZ / expectedZ;
  if (ratio < -0.15) return { verdict: 'reversed', ratio };
  if (ratio < 0.25) return { verdict: 'blocked', ratio };
  if (ratio < 0.65) return { verdict: 'partial', ratio };
  if (ratio <= 1.4) return { verdict: 'transmitted', ratio };
  return { verdict: 'overshot', ratio };
}

export const VERDICTS = {
  transmitted: { label: 'Transmitted', tone: 'bull', means: 'Moved about as much as the relationship implies. The chain is working here.' },
  partial: { label: 'Partial', tone: 'grey', means: 'Took some of the move but not all of it. Either something is offsetting it, or it has further to go.' },
  blocked: { label: 'Blocked', tone: 'amber', means: 'Barely moved at all against a relationship that says it should have. Something else is holding it, and that something is not on this board.' },
  reversed: { label: 'Reversed', tone: 'red', means: 'Went the OPPOSITE way to what the relationship implies. The strongest signal available here — whatever is driving this market is bigger than the link.' },
  overshot: { label: 'Overshot', tone: 'blue', means: 'Moved considerably more than the relationship implies. Either it is carrying a second story of its own, or positioning amplified it.' },
  'too small': { label: 'Too small', tone: 'grey', means: 'The implied move is inside its own noise, so there is nothing to judge.' },
};

const fmtUnit = (v, kind) => {
  if (v == null) return '—';
  const s = v > 0 ? '+' : '';
  if (kind === 'price') return `${s}${v.toFixed(1)}%`;
  if (kind === 'rate' || kind === 'gap') return `${s}${Math.round(v)}bp`;
  if (kind === 'usd') return `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(0)}`;
  return `${s}${v.toFixed(1)}`;
};

/**
 * What one market's move did to everything it touches.
 *
 * Returns the direct effects sorted by how big the IMPLIED move was — the things
 * that should have moved most, whether or not they did. Sorting by actual movement
 * would hide the blocked ones, which are the interesting half.
 */
export function impactOf(key, board = [], links = [], { minCorr = MIN_CORR } = {}) {
  const B = Array.isArray(board) ? board : [];
  const L = Array.isArray(links) ? links : [];
  const src = B.find(r => r.key === key);
  if (!src || src.z == null) return null;

  const direct = [];
  for (const l of L) {
    if (l.a !== key && l.b !== key) continue;
    if (Math.abs(l.corr ?? 0) < minCorr) continue;              // no relationship, no implication
    const otherKey = l.a === key ? l.b : l.a;
    const other = B.find(r => r.key === otherKey);
    if (!other || other.z == null) continue;
    const expectedZ = l.corr * src.z;
    const c = classify(expectedZ, other.z);
    if (!c) continue;
    direct.push({
      key: otherKey, label: l.a === key ? l.labelB : l.labelA,
      link: l.id, corr: l.corr, mechanism: l.normally,
      expectedZ: +expectedZ.toFixed(2), actualZ: +other.z.toFixed(2),
      actual: fmtUnit(other.change, other.kind), kind: other.kind,
      ...c, ratio: c.ratio == null ? null : +c.ratio.toFixed(2),
    });
  }
  direct.sort((a, b) => Math.abs(b.expectedZ) - Math.abs(a.expectedZ));

  const tally = {};
  for (const d of direct) tally[d.verdict] = (tally[d.verdict] ?? 0) + 1;
  const judged = direct.filter(d => d.verdict !== 'too small');

  return {
    key, label: src.label, move: fmtUnit(src.change, src.kind), z: +src.z.toFixed(2), what: src.what,
    direct, tally,
    // the headline: did this move travel, or stop where it started?
    travelled: judged.length ? +(judged.filter(d => d.verdict === 'transmitted' || d.verdict === 'overshot').length / judged.length).toFixed(2) : null,
    blocked: direct.filter(d => d.verdict === 'blocked' || d.verdict === 'reversed'),
    caveat: 'Both legs measured over the same twenty sessions, so this shows whether the two sit where the relationship implies — not that one caused the other, and not what happens next.',
  };
}

/**
 * The board's biggest movers, each propagated.
 *
 * This is the page-level view: not "what moved" but "what moved AND what that did",
 * which is the question a macro reader is actually asking.
 */
export function impactBoard(board = [], links = [], { top = 4, minZ = 1.2, minCorr = MIN_CORR } = {}) {
  const B = Array.isArray(board) ? board : [];
  const L = Array.isArray(links) ? links : [];
  // Only markets that actually SIT in a tight relationship can propagate anything.
  // Ranking purely by |z| returned nothing on live data: the board's most extreme
  // movers were the 2-year and the 2s10s curve, and neither has a link above 0.20 --
  // which is itself worth knowing, and is why `orphans` comes back too.
  const connected = new Set();
  for (const l of L) if (Math.abs(l.corr ?? 0) >= minCorr) { connected.add(l.a); connected.add(l.b); }
  const movers = B.filter(r => r.z != null && Math.abs(r.z) >= minZ).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  // Returns an object rather than an array with a property bolted on: an array that
  // is not quite an array is the kind of thing that passes tests and breaks callers.
  return {
    rows: movers.filter(r => connected.has(r.key)).slice(0, top)
      .map(s => impactOf(s.key, B, L, { minCorr })).filter(r => r && r.direct.length),
    orphans: movers.filter(r => !connected.has(r.key)).slice(0, 6)
      .map(r => ({ key: r.key, label: r.label, z: +r.z.toFixed(2) })),
  };
}
