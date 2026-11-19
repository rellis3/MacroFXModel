// js/terminal/netCore.js: the maths behind Jarvis's NETWORK view (jarvisViewNet.js). Pure: no DOM, no fetch.
// Input is the daily-close panel /api/corr-terminal serves. Everything here DESCRIBES how markets moved together over a trailing window of daily returns;
// a correlation is a description of the past window, not a relationship that persists, and nothing here forecasts anything.
import { spokenName } from './jarvisNames.js';
import { series, matrix, changes, labelOf } from './corrMath.js';

export const WINDOW = 60, DEFAULT_THR = 0.5, MAX_LINKS = 260;
/** The clusters drawn as halos. A market in none of them is its own loose node. */
export const CLUSTERS = [
  { id: 'eq', name: 'Equity indices', ids: ['NQ', 'SPX500', 'US30', 'US2000'] },
  { id: 'usd', name: 'Dollar majors', ids: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'USDCNH', 'USDZAR'] },
  { id: 'cross', name: 'FX crosses', ids: ['EURGBP', 'EURCHF', 'GBPCHF', 'GBPJPY', 'EURJPY', 'AUDJPY', 'CADJPY'] },
  { id: 'met', name: 'Metals', ids: ['GOLD', 'SILVER', 'PLATINUM', 'COPPER'] },
  { id: 'en', name: 'Energy', ids: ['WTI', 'BRENT'] },
];
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'CNH', 'ZAR'];
const legs = id => (/^[A-Z]{6}$/.test(id) ? [id.slice(0, 3), id.slice(3)].filter(c => CCYS.includes(c)) : []);
/** True when two FX markets share a currency, which makes their correlation partly arithmetic. */
export const sharesCurrency = (a, b) => legs(a).some(c => legs(b).includes(c));
export const clusterOf = id => CLUSTERS.find(c => c.ids.includes(id))?.id ?? null;

/** A seeded generator (mulberry32). */
export const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/**
 * Force-directed layout of a correlation matrix in 3D. Each pair wants to sit at the correlation distance sqrt(2 (1 - r)): 0 for r = 1, 1.41 for r = 0, 2 for r = -1,
 * so tightly correlated markets are pulled together and negatively correlated ones are pushed apart (stress minimisation by gradient steps, cooling step size).
 * A missing correlation (null) exerts no pull, only a weak repulsion. Deterministic for a given seed. Returns a Float32Array of n*3 positions, centred and scaled to radius 1.
 */
export function forceLayout(m, { iters = 400, seed = 7 } = {}) {
  const n = m.length, P = new Float32Array(n * 3), r = rng(seed);
  for (let i = 0; i < n * 3; i++) P[i] = r() - 0.5;
  const F = new Float32Array(n * 3);
  for (let it = 0; it < iters; it++) {
    const step = 0.25 * (1 - it / iters) + 0.01; F.fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2], d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) { dx = r() - 0.5; dy = r() - 0.5; dz = r() - 0.5; d = Math.hypot(dx, dy, dz) + 1e-6; }
      const c = m[i][j], known = Number.isFinite(c), want = known ? Math.sqrt(Math.max(0, 2 * (1 - c))) : 1.6;
      if (!known && d > want) continue;                                           // no data: only a weak push apart, never a pull
      const w = known ? 1 / Math.max(0.35, want * want) : 0.15, k = w * (d - want) / d;      // close pairs weigh more, so the tight clusters stay tight
      F[i * 3] -= k * dx; F[i * 3 + 1] -= k * dy; F[i * 3 + 2] -= k * dz; F[j * 3] += k * dx; F[j * 3 + 1] += k * dy; F[j * 3 + 2] += k * dz;
    }
    for (let i = 0; i < n * 3; i++) P[i] += step * F[i] / Math.max(1, n * 0.12);
  }
  let cx = 0, cy = 0, cz = 0; for (let i = 0; i < n; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; } cx /= n; cy /= n; cz /= n;
  let mx = 1e-9; for (let i = 0; i < n; i++) { P[i * 3] -= cx; P[i * 3 + 1] -= cy; P[i * 3 + 2] -= cz; mx = Math.max(mx, Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])); }
  for (let i = 0; i < n * 3; i++) P[i] /= mx;
  return P;
}

/** How well the layout kept the correlation distances: the Pearson correlation between layout distance and correlation distance over all pairs (1 = perfect). */
export function layoutFit(P, m) {
  const xs = [], ys = [];
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) { const c = m[i][j]; if (!Number.isFinite(c)) continue; xs.push(Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2])); ys.push(Math.sqrt(Math.max(0, 2 * (1 - c)))); }
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n; let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
  return b > 0 && c > 0 ? a / Math.sqrt(b * c) : null;
}

/** The links worth drawing: |r| at or above thr, strongest first, at most `cap`. [{ a, b (indices), r }]. */
export function pickLinks(m, thr = DEFAULT_THR, cap = MAX_LINKS) {
  const out = [];
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) { const r = m[i][j]; if (Number.isFinite(r) && Math.abs(r) >= thr) out.push({ a: i, b: j, r }); }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r)).slice(0, cap);
}

/** Mean correlation inside each cluster (needs 2 or more of its markets present), tightest first. */
export function clusterTightness(ids, m) {
  const ix = new Map(ids.map((k, i) => [k, i])), out = [];
  for (const c of CLUSTERS) {
    const mem = c.ids.filter(k => ix.has(k)).map(k => ix.get(k)); if (mem.length < 2) continue;
    let s = 0, n = 0; for (let a = 0; a < mem.length; a++) for (let b = a + 1; b < mem.length; b++) { const r = m[mem[a]][mem[b]]; if (Number.isFinite(r)) { s += r; n++; } }
    if (n) out.push({ id: c.id, name: c.name, mean: s / n, n: mem.length });
  }
  return out.sort((x, y) => y.mean - x.mean);
}

/** A market's strongest positive and negative partners: { pos: [{ k, r }], neg: [{ k, r }] }. */
export function partners(ids, m, i, top = 3) {
  const row = ids.map((k, j) => ({ k, r: m[i][j] })).filter((x, j) => j !== i && Number.isFinite(x.r));
  return { pos: row.filter(x => x.r > 0).sort((a, b) => b.r - a.r).slice(0, top), neg: row.filter(x => x.r < 0).sort((a, b) => a.r - b.r).slice(0, top) };
}

/**
 * The whole model from the corr-terminal body: { ids, labels, m, P (layout), fit, window, asOf, S (the returns), tight, hi, lo, moved } or null when the panel is missing or too short.
 * hi / lo = the tightest and the most opposed pair now; moved = the pair whose 20-day correlation moved most against its 120-day level.
 */
export function buildNet(resp, { w = WINDOW, seed = 7 } = {}) {
  const panel = resp?.ok === false ? null : resp?.panel ?? resp; if (!panel?.syms?.length || !panel?.dates?.length || !panel.closes) return null;
  const S = series(panel); if (S.n < w + 5) return null;
  const ids = S.ids.filter(k => S.ret[k]?.some(v => v != null));
  if (ids.length < 6) return null;
  const { m } = matrix(S, ids, w);
  const P = forceLayout(m, { seed });
  let hi = null, lo = null;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const r = m[i][j]; if (!Number.isFinite(r)) continue;
    if (!hi || r > hi.r) hi = { a: ids[i], b: ids[j], r, shared: sharesCurrency(ids[i], ids[j]) };
    if (!lo || r < lo.r) lo = { a: ids[i], b: ids[j], r, shared: sharesCurrency(ids[i], ids[j]) };
  }
  const moved = changes(S, ids, { w: 20, base: 120, top: 1 })[0] ?? null;
  return { ids, labels: Object.fromEntries(ids.map(k => [k, labelOf(k)])), m, P, fit: layoutFit(P, m), window: w, asOf: S.dates[S.n - 1], S, tight: clusterTightness(ids, m), hi, lo, moved };
}

const f2 = v => (v >= 0 ? '' : 'minus ') + Math.abs(v).toFixed(2);
const pairName = (net, a, b) => `${spokenName(a)} and ${spokenName(b)}`;
/** The spoken script for the SHOW scene, from the real numbers. Short: the director waits for the narration. */
export function netScript(net) {
  if (!net?.hi || !net?.lo) return null;
  const s = [`This is the correlation network. Each market is a node, and markets that have moved together over the last ${net.window} trading days are pulled close, those that moved opposite are pushed apart.`];
  s.push(`The tightest pair is ${pairName(net, net.hi.a, net.hi.b)}, at ${f2(net.hi.r)}${net.hi.shared ? ', though they share a currency, so part of that is arithmetic' : ''}.`);
  s.push(`The most opposed pair is ${pairName(net, net.lo.a, net.lo.b)}, at ${f2(net.lo.r)}${net.lo.shared ? ', again partly arithmetic' : ''}.`);
  const t = net.tight[0]; if (t) s.push(`The most tightly bound group is ${t.name.toLowerCase()}, averaging ${f2(t.mean)} inside the group.`);
  const mv = net.moved; if (mv && Math.abs(mv.delta) >= 0.15) s.push(`The biggest recent change is ${pairName(net, mv.a, mv.b)}: ${f2(mv.now)} over twenty days against ${f2(mv.base)} over a hundred and twenty.`);
  s.push('This describes how these markets moved together in the past. It is not a relationship that persists, and it is not a forecast.');
  return s.join(' ');
}
