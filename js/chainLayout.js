/**
 * Scoring for the chain graphic's layout (today.html and the newsletter draw the same 24 chips on the same grid).
 *
 * WHY THIS EXISTS. The chain was hand-laid for 18 chips. Each new leg (funding, the non-US yield gaps, JGB, 2Y, bitcoin) took whatever slot was free,
 * and by 2026-10-23 the picture had 14 pairs of crossing lines and 16 lines running underneath chips they have nothing to do with. Nobody noticed the
 * tangle growing because every addition looked fine on its own. So the layout is now measured, and a test fails if a change makes it worse.
 *
 * Scoring is on straight centre-to-centre segments, which is how the diagonal links are drawn.
 * Pure: no DOM, no clock. Tested in js/chainLayout.test.mjs. analysis/chain_layout.mjs searches for better placements with the same scorer.
 */
export const CW = 1.55;   // a column is wider than a row is tall, as drawn

const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
const segCross = (p1, p2, p3, p4) => { const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4); return d1 * d2 < -1e-9 && d3 * d4 < -1e-9; };
/** Does the segment p-q pass through the chip centred at c (half-width .42 columns, half-height .3 rows)? */
const passesUnder = (p, q, c) => { for (let i = 1; i < 20; i++) { const t = i / 20, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t; if (Math.abs(x - c[0]) < 0.42 * CW && Math.abs(y - c[1]) < 0.3) return true; } return false; };

/** links: array of [fromKey, toKey]. pos: { key: [col, row] }. Returns counts of crossings, lines under unrelated chips, backwards links, and total length. */
export function layoutScore(pos, links, { onlyIds = null } = {}) {
  const P = k => [pos[k][0] * CW, pos[k][1]];
  const ls = links.filter(([a, b]) => pos[a] && pos[b]).filter(([a, b]) => !onlyIds || onlyIds.has(`${a}-${b}`));
  let cross = 0, hidden = 0, len = 0, back = 0;
  for (let i = 0; i < ls.length; i++) {
    const [a, b] = ls[i], p = P(a), q = P(b);
    len += Math.hypot(p[0] - q[0], p[1] - q[1]); if (pos[a][0] > pos[b][0]) back++;
    for (let j = i + 1; j < ls.length; j++) { const [c, d] = ls[j]; if (a === c || a === d || b === c || b === d) continue; if (segCross(p, q, P(c), P(d))) cross++; }
    for (const k of Object.keys(pos)) if (k !== a && k !== b && passesUnder(p, q, P(k))) hidden++;
  }
  return { cross, hidden, back, len: +len.toFixed(1) };
}
