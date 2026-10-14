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

/* ── ROUTING ──────────────────────────────────────────────────────────────────
 *
 * Lines used to be a single quadratic arc from node centre to node centre, bowed a
 * fixed amount off the straight line. On a graph where thirteen of twenty links span
 * two or more columns, that means thirteen diagonals cutting through whatever happens
 * to sit between their ends: measured, twenty intrusions through boxes the line has
 * nothing to do with, which is exactly what "messy" looks like. A line crossing the
 * S&P box on its way from real yields to gold reads as a connection to the S&P.
 *
 * So lines are now routed like a circuit board: out of the SIDE of a box, down a clear
 * vertical lane in the gutter between two columns, along a clear horizontal lane between
 * two rows, and into the side of the far box. Lanes are allocated so two lines never sit
 * on top of each other, and a lane is only accepted if it is clear of every box it would
 * pass. Crossings still happen -- any drawing of this graph has some -- but they happen
 * at right angles, which the eye reads as two separate wires rather than a tangle.
 *
 * Allocation is deterministic: same links in, same picture out. The map stays a place
 * you know your way around, which was the point of hand-laying the positions.
 */
const GUT = 8;          // clearance between a box edge and the nearest lane
const CLR = RY + 7;     // a horizontal lane must clear a box centre by this much
const CORNER = 9;       // corner radius

/** The clear vertical strip to the RIGHT of column i (i = -1 is the left margin). */
function gutterRange(i) {
  if (i < 0) return [10, PADX - GUT];
  const xc = PADX + RX + i * COLW;
  if (i >= 4) return [xc + RX + GUT, MAP_W - 10];
  return [xc + RX + GUT, xc + COLW - RX - GUT];
}

const NODES = Object.entries(LAYOUT).map(([k, p]) => ({ k, x: PADX + RX + p[0] * COLW, y: PADY + RY + p[1] * ROWH }));

/** Turn a right-angled polyline into a path with rounded corners. */
function roundPath(pts, r = CORNER) {
  const p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.6);
  const f = v => v.toFixed(1);
  if (p.length < 3) return `M${p.map(q => f(q[0]) + ',' + f(q[1])).join(' L')}`;
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    const r1 = Math.min(r, l1 / 2), r2 = Math.min(r, l2 / 2);
    d += ` L${f(b[0] + (a[0] - b[0]) / l1 * r1)},${f(b[1] + (a[1] - b[1]) / l1 * r1)}`
       + ` Q${f(b[0])},${f(b[1])} ${f(b[0] + (c[0] - b[0]) / l2 * r2)},${f(b[1] + (c[1] - b[1]) / l2 * r2)}`;
  }
  return d + ` L${f(p.at(-1)[0])},${f(p.at(-1)[1])}`;
}

/** Lane bookkeeping for one build, so two lines never share a strip of space. */
function newLanes() {
  const rows = [], guts = {};
  return {
    /** A horizontal lane between x0 and x1, clear of every box but the two ends. */
    row(x0, x1, ideal, skip) {
      const lo = Math.min(x0, x1) - 2, hi = Math.max(x0, x1) + 2;
      const blocked = y => NODES.some(n => !skip.has(n.k) && n.x + RX > lo && n.x - RX < hi && Math.abs(n.y - y) < CLR);
      const taken = y => rows.some(u => Math.abs(u.y - y) < 9 && u.x1 > lo && u.x0 < hi);
      for (let d = 0; d <= 340; d += 3) {
        for (const y of (d ? [ideal - d, ideal + d] : [ideal])) {
          if (y < 44 || y > MAP_H - 12) continue;
          if (!blocked(y) && !taken(y)) { rows.push({ y, x0: lo, x1: hi }); return y; }
        }
      }
      return ideal;   // nothing clear: draw it anyway rather than silently drop a link
    },
    /** A vertical lane inside gutter i, as near `ideal` as one is free. */
    gut(i, ideal) {
      const [lo, hi] = gutterRange(i), arr = guts[i] ??= [];
      for (let d = 0; d <= hi - lo; d += 4) {
        for (const x of (d ? [ideal - d, ideal + d] : [ideal])) {
          if (x < lo || x > hi) continue;
          if (!arr.some(u => Math.abs(u - x) < 9)) { arr.push(x); return x; }
        }
      }
      return Math.min(hi, Math.max(lo, ideal));
    },
  };
}

/**
 * One line, as a right-angled route plus the clear spot its label can sit in.
 *
 * Three shapes, because three things are being drawn. A link INSIDE a column is a
 * vertical drop, or a loop out into the gutter when something sits between the two.
 * A FORWARD link leaves the right of its box and enters the left of the next, so the
 * left-to-right causal reading is in the geometry rather than only in the column
 * headings. A BACKWARD link -- crude into breakevens, copper into the Aussie -- leaves
 * the LEFT and enters the RIGHT, which makes feedback look like feedback instead of
 * like a line drawn the wrong way.
 */
function routeEdge(L, lanes) {
  const A = pos(L.a), B = pos(L.b);
  const cA = LAYOUT[L.a][0], cB = LAYOUT[L.b][0];
  const skip = new Set([L.a, L.b]);

  if (cA === cB) {
    const between = NODES.some(n => !skip.has(n.k) && Math.abs(n.x - A.x) < 1
      && n.y > Math.min(A.y, B.y) && n.y < Math.max(A.y, B.y));
    if (!between) {
      const dir = B.y > A.y ? 1 : -1;
      // the mechanism goes in the gap BETWEEN the two boxes -- 34px of clear space, and
      // the only place on a short vertical drop where a horizontal plate fits at all
      return { pts: [[A.x, A.y + dir * RY], [B.x, B.y - dir * (RY + 2)]],
               lab: [A.x, (A.y + B.y) / 2, A.x - RX + 4, A.x + RX - 4] };
    }
    const right = cA < 4, gi = right ? cA : cA - 1, [lo, hi] = gutterRange(gi);
    const gx = lanes.gut(gi, right ? lo + 16 : hi - 16);
    const sgn = right ? 1 : -1;
    return { pts: [[A.x + sgn * RX, A.y], [gx, A.y], [gx, B.y], [B.x + sgn * (RX + 2), B.y]],
             lab: [gx, (A.y + B.y) / 2] };
  }

  const fwd = cB > cA, sgn = fwd ? 1 : -1;
  const sx = A.x + sgn * RX, ex = B.x - sgn * (RX + 2);
  const g1 = fwd ? cA : cA - 1, g2 = fwd ? cB - 1 : cB;

  if (Math.abs(cB - cA) === 1) {
    const [lo, hi] = gutterRange(g1);
    const gx = lanes.gut(g1, (lo + hi) / 2);
    return { pts: [[sx, A.y], [gx, A.y], [gx, B.y], [ex, B.y]], lab: [gx, (A.y + B.y) / 2] };
  }

  const [l1, h1] = gutterRange(g1), [l2, h2] = gutterRange(g2);
  const gx1 = lanes.gut(g1, fwd ? l1 + 18 : h1 - 18);
  const gx2 = lanes.gut(g2, fwd ? h2 - 18 : l2 + 18);
  const ly = lanes.row(gx1, gx2, (A.y + B.y) / 2, skip);
  return { pts: [[sx, A.y], [gx1, A.y], [gx1, ly], [gx2, ly], [gx2, B.y], [ex, B.y]],
           lab: [(gx1 + gx2) / 2, ly, Math.min(gx1, gx2), Math.max(gx1, gx2)] };
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Short labels — "Investment-grade OAS" does not fit in a 92px node. */
export const SHORT = {
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
export function buildMap(links = [], board = [], { apartZ = 3.1, sel = null } = {}) {
  // `sel` is {what:'node'|'link', id} -- the thing the reader has open in the card under
  // the map. It is passed IN rather than toggled with a DOM class after render because
  // renderMap() rebuilds the whole svg from innerHTML on every draw, which would wipe a
  // class set from outside and leave the card open with nothing on the map lit up.
  const selNode = sel?.what === 'node' ? sel.id : null;
  const selLink = sel?.what === 'link' ? sel.id : null;
  const byKey = Object.fromEntries(board.map(b => [b.key, b]));
  const drawn = links.filter(l => pos(l.a) && pos(l.b));

  // Edges first so nodes sit on top of them. Longest-span links are routed FIRST so
  // they get the roomiest lanes -- they are the ones with the furthest to travel and
  // the most to collide with; short hops can always find a gutter afterwards.
  const lanes = newLanes();
  const order = [...drawn].sort((x, y) =>
    Math.abs(LAYOUT[y.b][0] - LAYOUT[y.a][0]) - Math.abs(LAYOUT[x.b][0] - LAYOUT[x.a][0]));
  const routed = new Map(order.map(L => [L.id, routeEdge(L, lanes)]));

  // Mechanism plates, placed greedily: a label that would land on one already placed is
  // dropped rather than drawn over it. Two labels on top of each other teach nothing and
  // cost the picture more than the one that goes missing -- the card names the mechanism
  // on click either way. Longest span first again, so the lines that travel furthest and
  // are hardest to follow keep their label.
  const plates = [];
  const labelFor = L => {
    const r = routed.get(L.id), lab = EDGE_LABEL[L.id];
    if (!lab || !r?.lab || L.weak) return null;
    const cls = Math.abs(L.z) >= apartZ ? 'apart' : 'hold';
    const w = lab.length * 4.5 + 6, [cx, ly, runLo, runHi] = r.lab;
    // Try the middle of the clear run first, then slide along it. A label only gets
    // dropped when the whole run is spoken for -- which is rarer than it sounds, since
    // these runs are long and the plates are short.
    const spots = runLo == null ? [cx]
      : [cx, runLo + w / 2 + 10, runHi - w / 2 - 10, cx - (cx - runLo) / 2, cx + (runHi - cx) / 2]
          .filter(x => x - w / 2 >= runLo - 2 && x + w / 2 <= runHi + 2);
    const free = spots.find(x => !plates.some(q =>
      q.x1 > x - w / 2 && q.x0 < x + w / 2 && q.y1 > ly - 7 && q.y0 < ly + 7));
    if (free == null) return null;
    plates.push({ x0: free - w / 2, x1: free + w / 2, y0: ly - 7, y1: ly + 7 });
    const lx = free;
    return `<text x="${lx.toFixed(0)}" y="${(ly + 3).toFixed(0)}" class="mmL ${cls}" text-anchor="middle"
      paint-order="stroke" stroke-width="3.5">${esc(lab)}</text>`;
  };
  const labels = Object.fromEntries(order.map(L => [L.id, labelFor(L)]));

  const edges = drawn.map(L => {
    const apart = !L.weak && Math.abs(L.z) >= apartZ;
    const cls = L.weak ? 'loose' : apart ? 'apart' : 'hold';
    // thickness is the REAL strength of the link, so a loose one looks loose
    const w = L.weak ? 1 : 1.2 + Math.min(Math.abs(L.corr), 1) * 3.4;
    const lab = EDGE_LABEL[L.id];
    // a selected NODE lights its own lines too, or clicking a box dims away the very
    // thing the box is there to show you -- what it is connected to
    const onSel = selLink === L.id ? ' sel' : selNode && (L.a === selNode || L.b === selNode) ? ' lit' : '';
    const d = roundPath(routed.get(L.id).pts);
    return `<g class="mmEg ${cls}${onSel}" onclick="mapPick('link','${esc(L.id)}')">
      <title>${esc(L.labelA)} → ${esc(L.labelB)} — ${
        L.weak ? 'too loose to mean anything' : apart ? 'come apart today' : 'holding'} (${Math.abs(L.corr).toFixed(2)})${lab ? ' · ' + esc(lab) : ''}</title>
      <path class="mmHit" d="${d}"/>
      <path class="mmE ${cls}" d="${d}" stroke-width="${w.toFixed(1)}" marker-end="url(#mmArrow-${cls})"/>
      ${labels[L.id] ?? ''}
    </g>`;
  }).join('');

  const touched = new Set(drawn.flatMap(l => [l.a, l.b]));
  // when a LINK is open, light both its ends too -- the card names two markets and the
  // reader should not have to trace an arc back to find which boxes they are
  const selL = selLink ? drawn.find(l => l.id === selLink) : null;
  const selLinkEnds = new Set(selL ? [selL.a, selL.b] : []);
  // ...and, for a selected node, its neighbours: "what does a move here arrive at" is
  // the question the map exists to answer, so the answer must not be dimmed out
  if (selNode) for (const l of drawn) { if (l.a === selNode) selLinkEnds.add(l.b); else if (l.b === selNode) selLinkEnds.add(l.a); }
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
    return `<g class="mmN${hot}${selNode === k ? ' sel' : ''}${sel && selNode !== k && selLinkEnds.has(k) ? ' lit' : ''}" onclick="mapPick('node','${esc(k)}')" tabindex="0">
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
