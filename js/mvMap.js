/**
 * The relationship map — the chain graphic's idea, applied to the whole board.
 *
 * WHY THIS REPLACES A LIST. The wiring card was twenty rows in a table: every link
 * present, every number correct, and nothing understood. A list can tell you that
 * real yields and gold are related; only a picture tells you that real yields sit
 * UPSTREAM of gold, the dollar and the Nasdaq at once, so a move there arrives in
 * three places. That upstream/downstream shape is the whole point of macro, and it
 * is spatial information — it cannot be written down in a column.
 *
 * HOW TO READ IT, and this is deliberately encoded rather than explained:
 *   - LEFT to RIGHT is roughly cause to effect. Rates drive, everything else answers.
 *   - A LINE means these two normally move together. Its THICKNESS is how tightly
 *     they actually have, over three years.
 *   - GREEN holding · AMBER come apart today · GREY DASHED too loose to mean anything
 *   - A node's RING is how unusual that market's own move is. A thick ring with no
 *     amber lines is a market moving on its own, which is its own kind of story.
 *
 * Positions are hand-laid, not force-directed. A force layout rearranges itself every
 * day as the numbers change, so you never learn where anything is; a fixed map becomes
 * a place you know your way around, which is the point when the goal is learning.
 *
 * Pure: no fetch, no DOM. Tested in js/mvMap.test.mjs.
 */

/** Column = causal stage, row = position within it. Hand-laid so the map never moves. */
export const LAYOUT = {
  // 0 — what sets the price of money
  us2y: [0, 0], tips: [0, 1], bei: [0, 2], jgbgap: [0, 3], bundgap: [0, 4], giltgap: [0, 5],
  // 1 — what it costs to borrow, and what fear costs
  vix: [1, 0], ovx: [1, 1], hy: [1, 2], ccc: [1, 3], dxy: [1, 4.5],
  // 2 — currencies
  usdjpy: [2, 0], eurusd: [2, 1.5], gbpusd: [2, 3], audusd: [2, 4], usdcad: [2, 5],
  // 3 — equity
  spx: [3, 0], nq: [3, 1], r2k: [3, 2], de30: [3, 3], jp225: [3, 4],
  // 4 — real things
  gold: [4, 0], silver: [4, 1], oil: [4, 2.5], copper: [4, 4], btc: [4, 5],
};

const COLW = 196, ROWH = 74, PADX = 62, PADY = 42, RX = 46, RY = 17;
export const MAP_W = PADX * 2 + COLW * 4 + RX * 2;
export const MAP_H = PADY * 2 + ROWH * 5 + RY * 2;

const pos = key => {
  const p = LAYOUT[key]; if (!p) return null;
  return { x: PADX + RX + p[0] * COLW, y: PADY + RY + p[1] * ROWH };
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Short labels — "Investment-grade OAS" does not fit in a 92px node. */
const SHORT = {
  us2y: '2-year', tips: 'Real 10y', bei: 'Breakevens', jgbgap: 'JGB gap', bundgap: 'Bund gap',
  giltgap: 'Gilt gap', vix: 'VIX', ovx: 'Oil vol', hy: 'High yield', ccc: 'CCC', dxy: 'Dollar',
  usdjpy: 'USD/JPY', eurusd: 'EUR/USD', gbpusd: 'GBP/USD', audusd: 'AUD/USD', usdcad: 'USD/CAD',
  spx: 'S&P 500', nq: 'Nasdaq', r2k: 'Russell', de30: 'DAX', jp225: 'Nikkei',
  gold: 'Gold', silver: 'Silver', oil: 'Crude', copper: 'Copper', btc: 'Bitcoin',
};
export const STAGES = ['What sets\nthe price of money', 'What borrowing\nand fear cost', 'Currencies', 'Equity', 'Real things'];

/**
 * Build the map.
 *
 * `links` is scanLinks() output, `board` is scanBoard() output. `apartZ` must be the
 * same threshold the findings use, or the map will colour a link amber that the page
 * never mentions.
 */
export function buildMap(links = [], board = [], { apartZ = 3.1 } = {}) {
  const byKey = Object.fromEntries(board.map(b => [b.key, b]));
  const drawn = links.filter(l => pos(l.a) && pos(l.b));

  // Edges first so nodes sit on top of them.
  const edges = drawn.map(L => {
    const A = pos(L.a), B = pos(L.b);
    const apart = !L.weak && Math.abs(L.z) >= apartZ;
    const cls = L.weak ? 'loose' : apart ? 'apart' : 'hold';
    // A gentle arc, bowed away from the straight line, so parallel links between the
    // same columns do not stack into one stripe.
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(46, len * 0.17);
    const cx = mx - (dy / len) * bow, cy = my + (dx / len) * bow;
    // thickness is the REAL strength of the link, so a loose one looks loose
    const w = L.weak ? 1 : 1.2 + Math.min(Math.abs(L.corr), 1) * 3.4;
    return `<path class="mmE ${cls}" d="M${A.x},${A.y} Q${cx.toFixed(0)},${cy.toFixed(0)} ${B.x},${B.y}"
      stroke-width="${w.toFixed(1)}" data-id="${esc(L.id)}"
      onclick="mapPick('link','${esc(L.id)}')"><title>${esc(L.labelA)} ↔ ${esc(L.labelB)} — ${
      L.weak ? 'too loose to mean anything' : apart ? 'come apart today' : 'holding'} (${Math.abs(L.corr).toFixed(2)})</title></path>`;
  }).join('');

  const touched = new Set(drawn.flatMap(l => [l.a, l.b]));
  const nodes = Object.keys(LAYOUT).filter(k => touched.has(k)).map(k => {
    const p = pos(k), b = byKey[k];
    const z = Math.abs(b?.z ?? 0);
    // the ring thickens with how unusual this market's OWN move is
    const ring = z >= 3.6 ? 3 : z >= 2.6 ? 2 : 1;
    const hot = z >= 3.6 ? ' hot' : z >= 2.6 ? ' warm' : '';
    const dir = b?.change == null ? '' : b.change > 0 ? ' up' : ' dn';
    const val = b ? (b.kind === 'price' ? `${b.change > 0 ? '+' : ''}${b.change.toFixed(1)}%`
      : b.kind === 'rate' || b.kind === 'gap' ? `${b.change > 0 ? '+' : ''}${Math.round(b.change)}bp`
      : `${b.change > 0 ? '+' : ''}${b.change.toFixed(1)}`) : '';
    return `<g class="mmN${hot}" onclick="mapPick('node','${esc(k)}')" tabindex="0">
      <rect x="${p.x - RX}" y="${p.y - RY}" width="${RX * 2}" height="${RY * 2}" rx="8"
        class="mmBox" stroke-width="${ring}"/>
      <text x="${p.x}" y="${p.y - 2}" class="mmT" text-anchor="middle">${esc(SHORT[k] ?? k)}</text>
      <text x="${p.x}" y="${p.y + 10}" class="mmV${dir}" text-anchor="middle">${esc(val)}</text>
    </g>`;
  }).join('');

  const heads = STAGES.map((s, i) => {
    const x = PADX + RX + i * COLW;
    return s.split('\n').map((ln, j) =>
      `<text x="${x}" y="${18 + j * 12}" class="mmH" text-anchor="middle">${esc(ln)}</text>`).join('');
  }).join('');

  const counts = {
    apart: drawn.filter(l => !l.weak && Math.abs(l.z) >= apartZ).length,
    hold: drawn.filter(l => !l.weak && Math.abs(l.z) < apartZ).length,
    loose: drawn.filter(l => l.weak).length,
  };
  return {
    svg: `<svg class="mmap" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img"
      aria-label="How the markets on this board connect: ${counts.hold} links holding, ${counts.apart} come apart today, ${counts.loose} too loose to mean anything. Left to right is roughly cause to effect.">
      ${heads}${edges}${nodes}</svg>`,
    counts, nodes: [...touched],
  };
}
