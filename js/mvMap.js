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


/**
 * The mechanism, in two or three words, written ON the line.
 *
 * This is the difference between a picture of connections and a picture that
 * teaches. A bare line says "these two are related"; "cost of carry" says WHY, and
 * after you have seen it on the line ten times you know it without reading it. The
 * full sentence still lives in the panel underneath — this is the handle, not the
 * explanation.
 */
export const EDGE_LABEL = {
  'tips-gold': 'cost of carry', 'tips-nq': 'discount rate', 'oil-bei': 'pass-through',
  'us2y-r2k': 'funding cost', 'hy-spx': 'lenders vote first', 'ccc-hy': 'same stack',
  'vix-spx': 'insurance price', 'vix-ovx': 'both fear', 'copper-audusd': 'China proxy',
  'oil-usdcad': 'oil exporter', 'dxy-gold': 'priced in $', 'dxy-btc': 'risk beta',
  'jgbgap-usdjpy': 'carry pays', 'bundgap-eurusd': 'follow the yield',
  'giltgap-gbpusd': 'follow the yield', 'spx-de30': 'global risk',
  'usdjpy-jp225': 'exporter earnings', 'gold-silver': 'same metal trade',
  'vix-hy': 'one worry, two prices', 'r2k-nq': 'breadth',
};

const COLW = 214, ROWH = 84, PADX = 54, PADY = 52, RX = 58, RY = 25;
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
/**
 * Stages named by the ROLE they play, not by what they contain.
 *
 * "Currencies" is a category; "Transmission" tells you what currencies are DOING in
 * the story -- carrying a rates move into everything priced in another unit. Naming
 * the role is what turns a diagram into an explanation, and it costs nothing.
 */
export const STAGES = [
  ['Drivers', "what's moving"],
  ['Mechanism', 'what it costs'],
  ['Transmission', 'how it travels'],
  ['Result', 'who pays'],
  ['Real things', 'the other side'],
];

/**
 * What each market IS, in three or four words, under its name on the map.
 *
 * The densest piece of teaching available: "US 2-year * policy expectations" tells a
 * reader what the number is FOR, every single time they look at it, with no tooltip
 * and no click. A value with no role attached is trivia.
 */
export const ROLE = {
  us2y: 'policy expectations', tips: 'the true cost of money', bei: 'expected inflation',
  jgbgap: 'the carry trade', bundgap: "the euro's rate leg", giltgap: "the pound's rate leg",
  vix: 'price of insurance', ovx: 'fear, in oil', hy: 'what junk pays', ccc: 'the weakest borrowers',
  dxy: 'the unit of account',
  usdjpy: 'carry and haven', eurusd: 'the biggest pair', gbpusd: 'rates plus risk premium',
  audusd: 'China and metals', usdcad: 'the oil currency',
  spx: 'the benchmark', nq: 'long-duration equity', r2k: 'small, domestic, floating',
  de30: 'European industry', jp225: "the yen's mirror",
  gold: 'four trades, one name', silver: 'gold with a factory leg', oil: 'the first domino',
  copper: 'the growth metal', btc: 'high-beta risk',
};

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
    // trim the line so the arrowhead lands on the node edge, not under the box
    const t = 0.88, qx = (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * cx + t * t * B.x;
    const qy = (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * cy + t * t * B.y;
    const lab = EDGE_LABEL[L.id];
    // the label sits at the arc's midpoint, upright, on its own plate so it stays
    // readable where lines cross
    const lx = 0.25 * A.x + 0.5 * cx + 0.25 * B.x, ly = 0.25 * A.y + 0.5 * cy + 0.25 * B.y;
    return `<g class="mmEg ${cls}" onclick="mapPick('link','${esc(L.id)}')">
      <title>${esc(L.labelA)} → ${esc(L.labelB)} — ${
        L.weak ? 'too loose to mean anything' : apart ? 'come apart today' : 'holding'} (${Math.abs(L.corr).toFixed(2)})${lab ? ' · ' + esc(lab) : ''}</title>
      <path class="mmE ${cls}" d="M${A.x},${A.y} Q${cx.toFixed(0)},${cy.toFixed(0)} ${qx.toFixed(0)},${qy.toFixed(0)}"
        stroke-width="${w.toFixed(1)}" marker-end="url(#mmArrow-${cls})"/>
      ${lab && !L.weak ? `<text x="${lx.toFixed(0)}" y="${ly.toFixed(0)}" class="mmL ${cls}" text-anchor="middle"
        paint-order="stroke" stroke-width="3.5">${esc(lab)}</text>` : ''}
    </g>`;
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
      <rect x="${p.x - RX}" y="${p.y - RY + 3}" width="3" height="${RY * 2 - 6}" rx="1.5"
        class="mmStage s${LAYOUT[k][0]}"/>
      <text x="${p.x}" y="${p.y - 8}" class="mmT" text-anchor="middle">${esc(SHORT[k] ?? k)}</text>
      <text x="${p.x}" y="${p.y + 5}" class="mmV${dir}" text-anchor="middle">${esc(val)}${b?.change == null ? '' : b.change > 0 ? ' ↑' : ' ↓'}</text>
      <text x="${p.x}" y="${p.y + 16}" class="mmR" text-anchor="middle">${esc(ROLE[k] ?? '')}</text>
    </g>`;
  }).join('');

  const heads = STAGES.map(([name, role], i) => {
    const x = PADX + RX + i * COLW;
    return `<text x="${x}" y="18" class="mmH" text-anchor="middle">${esc(name)}</text>
            <text x="${x}" y="31" class="mmHr" text-anchor="middle">${esc(role)}</text>`;
  }).join('');

  const counts = {
    apart: drawn.filter(l => !l.weak && Math.abs(l.z) >= apartZ).length,
    hold: drawn.filter(l => !l.weak && Math.abs(l.z) < apartZ).length,
    loose: drawn.filter(l => l.weak).length,
  };
  return {
    svg: `<svg class="mmap" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img"
      aria-label="How the markets on this board connect: ${counts.hold} links holding, ${counts.apart} come apart today, ${counts.loose} too loose to mean anything. Left to right is roughly cause to effect.">
      <defs>${['hold', 'apart', 'loose'].map(c => `<marker id="mmArrow-${c}" viewBox="0 0 10 10" refX="8" refY="5"
        markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" class="mmA ${c}"/></marker>`).join('')}</defs>
      ${heads}${edges}${nodes}</svg>`,
    counts, nodes: [...touched],
  };
}
