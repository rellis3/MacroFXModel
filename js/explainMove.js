/**
 * Why did this market move?
 *
 * The question a learner actually has, and the one the page could not answer. You
 * could see gold was down 6.4%, and to find out why you had to hold the board in
 * your head, remember which things gold answers to, look each of them up, and decide
 * whether their moves pointed the right way. That is exactly the skill — so the page
 * should do it in front of you, every time, until you can do it yourself.
 *
 * HOW IT WORKS. Every link touching this market is a candidate explanation. For each
 * one: how far did the OTHER leg move (in its own standardised terms), does the link
 * actually hold over three years, and did the partner move in the direction that
 * would explain this? A candidate is only an explanation if all three are true.
 *
 * THE ANSWER THIS EXISTS FOR IS "NOTHING". A market that moved hard with no partner
 * explaining it is the genuinely interesting case: the driver is off this board.
 * Most attribution tools cannot say that, because they rank candidates and print the
 * top one whatever its score. This one refuses, and refusing is the finding.
 *
 * WHAT IT IS NOT. Not causation. These are co-movements consistent with a stated
 * mechanism, over the same twenty sessions, with no lead-lag test behind them. It
 * tells you which story FITS, never which story is true — and when several fit, it
 * says so rather than picking.
 *
 * Pure: no fetch, no DOM. Tested in js/explainMove.test.mjs.
 */

const MIN_MOVE = 0.8;      // below this the partner has not moved enough to explain anything
const MIN_CORR = 0.2;      // matches the scan's "too loose to break" floor

const fmt = (r) => {
  if (!r || r.change == null) return '—';
  const s = r.change > 0 ? '+' : '';
  if (r.kind === 'price') return `${s}${r.change.toFixed(1)}%`;
  if (r.kind === 'rate' || r.kind === 'gap') return `${s}${Math.round(r.change)}bp`;
  if (r.kind === 'usd') return `${r.change < 0 ? '-' : '+'}$${Math.abs(r.change).toFixed(0)}`;
  return `${s}${r.change.toFixed(1)}`;
};

/**
 * Explain one market's move from the links that touch it.
 *
 * Returns `{ key, label, move, z, candidates, explained, verdict }`. `candidates` is
 * every link that touches this market, scored and sorted — including the ones that do
 * NOT explain it, because "the dollar barely moved, so it is not the dollar" is half
 * of what you want to know.
 */
export function explainMove(key, board = [], links = [], { minMove = MIN_MOVE } = {}) {
  const B = Array.isArray(board) ? board : [];
  const L = Array.isArray(links) ? links : [];
  const me = B.find(r => r.key === key);
  if (!me) return null;

  const candidates = [];
  for (const l of L) {
    if (l.a !== key && l.b !== key) continue;
    const otherKey = l.a === key ? l.b : l.a;
    const other = B.find(r => r.key === otherKey);
    if (!other) continue;

    // Both legs in standardised terms, so a 52bp yield move and a 6% gold move are
    // comparable. `corr` already carries the historical sign of the relationship.
    const zMine = me.z ?? 0, zOther = other.z ?? 0;
    const tooLoose = Math.abs(l.corr ?? 0) < MIN_CORR;
    const partnerMoved = Math.abs(zOther) >= minMove;
    // did the partner move the way this relationship says it should, to produce MY move?
    const expectedSign = Math.sign(l.corr ?? 0) * Math.sign(zOther);
    const consistent = !tooLoose && partnerMoved && Math.sign(zMine) === expectedSign && zMine !== 0;

    candidates.push({
      link: l.id, key: otherKey, label: l.a === key ? l.labelB : l.labelA,
      mechanism: l.normally, corr: l.corr,
      move: fmt(other), z: zOther,
      // how much this candidate can carry: a tight link whose partner moved a lot
      weight: tooLoose || !partnerMoved ? 0 : +(Math.abs(l.corr) * Math.abs(zOther)).toFixed(2),
      consistent,
      why: tooLoose ? 'this link is too loose to explain anything'
        : !partnerMoved ? 'it barely moved, so it cannot be the reason'
        : consistent ? 'moved the way this relationship says it should'
        : 'moved, but the wrong way for this to be the explanation',
    });
  }
  candidates.sort((a, b) => b.weight - a.weight || Math.abs(b.z) - Math.abs(a.z));

  const explained = candidates.filter(c => c.consistent && c.weight > 0);
  const moved = Math.abs(me.z ?? 0) >= minMove;

  let verdict;
  // "+5.2% has not moved enough to need explaining" is true and reads as nonsense.
  // The gap between the raw number and the z IS the page's core lesson -- a big
  // number is not automatically rare -- so this sentence teaches it rather than
  // stating a threshold nobody can see.
  if (!moved) verdict = { kind: 'quiet', text: `${fmt(me)} sounds like a lot, but for ${me.label} that is an ordinary twenty sessions (z ${me.z >= 0 ? '+' : ''}${(me.z ?? 0).toFixed(1)}) — well inside what it does anyway. There is nothing here to explain, and that is the most common answer on any board.` };
  else if (!explained.length) verdict = { kind: 'unexplained', text: `Nothing on this board explains it. ${me.label} is ${fmt(me)}, which is a real move, and not one market it is normally connected to moved in a way that accounts for it. That means the driver is OFF this board — a story specific to this market rather than a macro one. That is a finding, not a gap.` };
  else if (explained.length === 1) verdict = { kind: 'one', text: `${explained[0].label} is the candidate. It is ${explained[0].move}, the two normally move ${explained[0].corr > 0 ? 'together' : 'against each other'} (${Math.abs(explained[0].corr).toFixed(2)}), and it moved the way that relationship says it should.` };
  else verdict = { kind: 'several', text: `${explained.length} candidates fit, and this page cannot separate them: ${explained.slice(0, 3).map(c => `${c.label} ${c.move}`).join(', ')}. They are also correlated with each other, so they are probably one story wearing several names rather than several reasons.` };

  return {
    key, label: me.label, move: fmt(me), z: me.z ?? 0, what: me.what,
    moved, candidates, explained, verdict,
    caveat: 'These are co-movements over the same twenty sessions, consistent with a stated mechanism. No lead-lag test sits behind them, so this tells you which story FITS, never which one is true.',
  };
}
