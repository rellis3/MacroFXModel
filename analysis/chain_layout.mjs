// Finds a placement of the 24 chain chips on the 6 x 4 grid with fewer crossing lines.
//   node analysis/chain_layout.mjs            -> prints the current layout's score, the best found, and the grid
//
// WHY. The chain graphic (today.html CHAIN_POS, mirrored in js/newsletter.js) was hand-laid when it had 18 chips. Each new leg (funding, the
// non-US yield gaps, JGB, 2Y, bitcoin) took whatever slot was free, so long links now run corner to corner and cross a dozen others. This is the
// same placement problem a circuit board has: minimise crossings and lines passing under unrelated chips, keep causes left of effects, and move
// as few chips as possible from where the reader already expects them.
//
// Scoring is on straight centre-to-centre segments, which is how the diagonal links are drawn. Pure and deterministic (seeded).
import { CHAIN_LINKS } from '../js/macroChain.js';

export const COLS = 6, ROWS = 4;
export const CURRENT = {
  oil: [0, 0], bei: [1, 0], us10y: [2, 0], real: [3, 0], dxy: [4, 0], audusd: [5, 0],
  usdcad: [0, 1], crack: [1, 1], us30y: [2, 1], gold: [4, 1], usdjpy: [5, 1],
  vix: [0, 2], hy: [1, 2], spx: [2, 2], nq: [3, 2], copper: [4, 2], btc: [5, 2],
  funding: [3, 1], giltgap: [0, 3], gbpusd: [1, 3], bundgap: [2, 3], eurusd: [3, 3], jgbgap: [4, 3], us2y: [5, 3],
};
export const LINKS = CHAIN_LINKS.map(l => l.id.split('-'));   // [from, to]
const W = { cross: 10, under: 7, len: 0.6, back: 2.5, move: Number(process.env.MOVE ?? 0.35), flat: 0 };   // MOVE=1.5 keeps more chips where the reader expects them
const CW = 1.55;   // a column is wider than a row is tall, as drawn

const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
const segCross = (p1, p2, p3, p4) => { const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4); return d1 * d2 < -1e-9 && d3 * d4 < -1e-9; };
// does the segment p->q pass through the chip centred at c (half-width .42 col, half-height .3 row), ignoring the ends themselves?
const under = (p, q, c) => { for (let i = 1; i < 20; i++) { const t = i / 20, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t; if (Math.abs(x - c[0]) < 0.42 * CW && Math.abs(y - c[1]) < 0.3) return true; } return false; };
const pt = pos => k => [pos[k][0] * CW, pos[k][1]];

export function score(pos, base = CURRENT) {
  const P = pt(pos), segs = LINKS.map(([a, b]) => [P(a), P(b), a, b]);
  let cross = 0, hidden = 0, len = 0, back = 0, move = 0;
  for (let i = 0; i < segs.length; i++) {
    const [p, q, a, b] = segs[i];
    len += Math.hypot(p[0] - q[0], p[1] - q[1]); if (pos[a][0] > pos[b][0]) back++;
    for (let j = i + 1; j < segs.length; j++) { const [r, s, c, d] = segs[j]; if (a === c || a === d || b === c || b === d) continue; if (segCross(p, q, r, s)) cross++; }
    for (const k of Object.keys(pos)) if (k !== a && k !== b && under(p, q, P(k))) hidden++;
  }
  for (const k of Object.keys(pos)) move += Math.abs(pos[k][0] - base[k][0]) + Math.abs(pos[k][1] - base[k][1]);
  return { cross, hidden, len: +len.toFixed(1), back, move, cost: W.cross * cross + W.under * hidden + W.len * len + W.back * back + W.move * move };
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function optimise({ seed = 7, restarts = Number(process.env.RESTARTS ?? 40), steps = Number(process.env.STEPS ?? 30000) } = {}) {
  const keys = Object.keys(CURRENT), slots = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) slots.push([c, r]);
  let best = null;
  for (let rs = 0; rs < restarts; rs++) {
    const rand = rng(seed * 1000 + rs);
    let pos = rs === 0 ? structuredClone(CURRENT) : (() => { const sh = [...slots].sort(() => rand() - 0.5), o = {}; keys.forEach((k, i) => { o[k] = sh[i]; }); return o; })();
    let cur = score(pos).cost, T = 12;
    for (let i = 0; i < steps; i++) {
      T = 12 * (1 - i / steps) + 0.05;
      const a = keys[Math.floor(rand() * keys.length)], b = keys[Math.floor(rand() * keys.length)]; if (a === b) continue;
      [pos[a], pos[b]] = [pos[b], pos[a]]; const c2 = score(pos).cost;
      if (c2 <= cur || rand() < Math.exp((cur - c2) / T)) cur = c2; else [pos[a], pos[b]] = [pos[b], pos[a]];
    }
    const s = score(pos); if (!best || s.cost < best.s.cost) best = { pos: structuredClone(pos), s };
  }
  return best;
}
const grid = pos => { const g = Array.from({ length: ROWS }, () => Array(COLS).fill('.')); for (const [k, [c, r]] of Object.entries(pos)) g[r][c] = k; return g.map(row => row.map(x => x.padEnd(8)).join('')).join('\n'); };

if (process.argv[1]?.endsWith('chain_layout.mjs')) {
  const cur = score(CURRENT); console.log('CURRENT  ', JSON.stringify(cur)); console.log(grid(CURRENT));
  const best = optimise(); console.log('\nBEST     ', JSON.stringify(best.s)); console.log(grid(best.pos));
  console.log('\n' + JSON.stringify(best.pos));
}
