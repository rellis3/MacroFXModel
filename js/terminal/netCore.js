// js/terminal/netCore.js: the maths behind Jarvis's NETWORK view (jarvisViewNet.js). Pure: no DOM, no fetch.
// Input is the daily-close panel /api/corr-terminal serves. Everything here DESCRIBES how markets moved together over a trailing window of daily returns;
// a correlation is a description of the past window, not a relationship that persists, and nothing here forecasts anything.
import { spokenName } from './jarvisNames.js';
import { series, matrix, labelOf, retOf, corrWin, sdWin } from './corrMath.js';

export const WINDOW = 60, DEFAULT_THR = 0.5, MAX_LINKS = 260;
/** The time scrub: window lengths offered, the step between scrub dates (5 trading days = a week), and the look-back for "the biggest change" (~3 months). */
export const WINDOWS = [20, 60, 120], STEP_DAYS = 5, CHANGE_BACK = 63;
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
export function forceLayout(m, { iters = 400, seed = 7, init = null } = {}) {
  const n = m.length, P = new Float32Array(n * 3), r = rng(seed), warm = init && init.length === n * 3 && Array.prototype.every.call(init, Number.isFinite);
  if (warm) P.set(init); else for (let i = 0; i < n * 3; i++) P[i] = r() - 0.5;     // warm start: begin from the previous arrangement, so nodes move rather than jump
  const F = new Float32Array(n * 3), hot = warm ? 0.1 : 0.25;
  for (let it = 0; it < iters; it++) {
    const step = hot * (1 - it / iters) + 0.01; F.fill(0);
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
/** Warm-started layout: few, cooler iterations from the previous positions. The cloud keeps its orientation, so a changed matrix reads as nodes gliding. */
export const relayout = (m, prev, { iters = 140, seed = 7 } = {}) => forceLayout(m, { iters, seed, init: prev });
/** Mean distance a node moved between two layouts (same node order). */
export function meanShift(A, B) { const n = Math.min(A.length, B.length) / 3 | 0; if (!n) return null; let s = 0; for (let i = 0; i < n; i++) s += Math.hypot(A[i * 3] - B[i * 3], A[i * 3 + 1] - B[i * 3 + 1], A[i * 3 + 2] - B[i * 3 + 2]); return s / n; }

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

// ── the time scrub: point-in-time windows ──
// Every matrix below is built from returns on days <= its end index only (corrWin reads (end - w, end]), so a scrubbed date never sees a later day.

/** Each id's daily log returns as a Float64Array, NaN where missing. Built once; every window reads these. */
export function returnsOf(S, ids) { return ids.map(id => { const r = retOf(S, id) ?? [], out = new Float64Array(S.n).fill(NaN); for (let i = 0; i < S.n; i++) { const v = r[i]; if (v != null && Number.isFinite(v)) out[i] = v; } return out; }); }

/** The scrub dates as end indices, ascending: the last day, then every `every` trading days back, while a full window of `w` days still fits. */
export function scrubSteps(n, w = WINDOW, every = STEP_DAYS) { const out = []; for (let e = n - 1; e >= w; e -= every) out.push(e); return out.reverse(); }

/** Index of pair (i, j), i < j, in the packed upper triangle of an n-market matrix. */
export const triIx = (n, i, j) => (i < j ? i * (2 * n - i - 1) / 2 + (j - i - 1) : j * (2 * n - j - 1) / 2 + (i - j - 1));
/** The window-w correlation of every pair ending on day `end` (pairwise-complete days, null -> NaN when too thin), packed upper triangle. */
export function triAt(R, end, w) {
  const n = R.length, t = new Float32Array(n * (n - 1) / 2); let k = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const c = corrWin(R[i], R[j], end, w); t[k++] = c == null ? NaN : c; }
  return t;
}
/** A packed triangle as the n x n matrix the layout uses (1 on the diagonal, null where unknown). */
export function toMatrix(tri, n) {
  const m = Array.from({ length: n }, (_, i) => { const row = new Array(n).fill(null); row[i] = 1; return row; }); let k = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = tri[k++]; m[i][j] = m[j][i] = Number.isFinite(v) ? v : null; }
  return m;
}

/** A cache of every scrub step's matrix for one window length, filled a few steps at a time (latest first) so the HUD never freezes. */
export const makeScan = (R, steps, w) => ({ R, steps, w, tri: new Array(steps.length).fill(null), left: steps.length, next: steps.length - 1, done: !steps.length });
/** Compute up to `k` more steps; returns true when the whole history is cached. Also fills one specific step first when asked (the one on screen). */
export function scanSome(scan, k = 4, want = -1) {
  if (want >= 0 && want < scan.steps.length && !scan.tri[want]) { scan.tri[want] = triAt(scan.R, scan.steps[want], scan.w); scan.left--; k--; }
  while (k > 0 && scan.next >= 0) { const s = scan.next--; if (!scan.tri[s]) { scan.tri[s] = triAt(scan.R, scan.steps[s], scan.w); scan.left--; k--; } }
  scan.done = scan.left <= 0; return scan.done;
}
/** One step's packed matrix, computing it now if the background scan has not reached it. */
export function triOf(scan, s) { if (!scan.tri[s]) { scan.tri[s] = triAt(scan.R, scan.steps[s], scan.w); scan.left--; scan.done = scan.left <= 0; } return scan.tri[s]; }
/** One pair's correlation at every cached step (NaN where not computed yet or too thin): the strip chart. */
export function pairPath(scan, i, j) { const n = scan.R.length, k = triIx(n, i, j), out = new Float32Array(scan.steps.length).fill(NaN); scan.tri.forEach((t, s) => { if (t) out[s] = t[k]; }); return out; }

/**
 * The headline pair for the strip: the pair whose correlation swung the most (max - min) across the scrub history, leaving out FX pairs that share a currency
 * (partly arithmetic). Needs at least half the steps known. { a, b, i, j, lo, hi, range } or null.
 */
export function swingPair(scan, ids) {
  const n = ids.length; let best = null; const need = Math.max(3, scan.steps.length / 2);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (sharesCurrency(ids[i], ids[j])) continue;
    const k = triIx(n, i, j); let lo = Infinity, hi = -Infinity, c = 0;
    for (const t of scan.tri) { const v = t?.[k]; if (Number.isFinite(v)) { c++; if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (c >= need && (!best || hi - lo > best.range)) best = { a: ids[i], b: ids[j], i, j, lo, hi, range: hi - lo };
  }
  return best;
}

/** The pair whose window-w correlation changed most between `back` trading days ago and `end` (shared-currency FX pairs left out). Point-in-time at `end`. */
export function biggestChange(R, ids, { w = WINDOW, end = (R[0]?.length ?? 0) - 1, back = CHANGE_BACK } = {}) {
  const then = end - back; if (then < w) return null;
  const A = triAt(R, end, w), B = triAt(R, then, w), n = ids.length; let best = null, k = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++, k++) {
    const now = A[k], was = B[k]; if (!Number.isFinite(now) || !Number.isFinite(was) || sharesCurrency(ids[i], ids[j])) continue;
    if (!best || Math.abs(now - was) > Math.abs(best.delta)) best = { a: ids[i], b: ids[j], now, then: was, delta: now - was, end, from: then };
  }
  return best;
}

/** How big each market's move was on day `end` against its own spread over the `look` days before it (point-in-time): { id: { move (%), ratio, size 0..1, tone } }. */
export const FULL_AT = 3, QUIET_BELOW = 0.5;
export function dayMoves(R, ids, end, look = 60) {
  const out = {};
  ids.forEach((id, i) => { const x = R[i], v = x?.[end]; if (!Number.isFinite(v) || end < 2) return; const sd = sdWin(x, end - 1, look); if (!(sd > 0)) return; const ratio = Math.abs(v) / sd; out[id] = { move: v * 100, ratio, size: Math.min(1, ratio / FULL_AT), tone: ratio < QUIET_BELOW ? 'quiet' : v >= 0 ? 'up' : 'dn' }; });
  return out;
}

/** The extremes of one matrix: hi = tightest pair, lo = most opposed (with the shared-currency flag). */
export function extremes(ids, m) {
  let hi = null, lo = null;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const r = m[i][j]; if (!Number.isFinite(r)) continue;
    if (!hi || r > hi.r) hi = { a: ids[i], b: ids[j], r, shared: sharesCurrency(ids[i], ids[j]) };
    if (!lo || r < lo.r) lo = { a: ids[i], b: ids[j], r, shared: sharesCurrency(ids[i], ids[j]) };
  }
  return { hi, lo };
}

/** The picture at one scrub step: { s, end, date, m, P (warm-started from prev), fit, hi, lo, tight }. */
export function stepState(net, scan, s, prevP = null) {
  const m = toMatrix(triOf(scan, s), net.ids.length), P = prevP ? relayout(m, prevP) : forceLayout(m), end = scan.steps[s];
  return { s, end, date: net.dates[end], w: scan.w, m, P, fit: layoutFit(P, m), ...extremes(net.ids, m), tight: clusterTightness(net.ids, m) };
}

/**
 * The whole model from the corr-terminal body: { ids, labels, m, P (layout), fit, window, asOf, S (the returns), R, dates, tight, hi, lo, change } or null when the panel is missing or too short.
 * hi / lo = the tightest and the most opposed pair now; change = the pair whose correlation changed most over the last ~3 months (CHANGE_BACK days).
 */
export function buildNet(resp, { w = WINDOW, seed = 7 } = {}) {
  const panel = resp?.ok === false ? null : resp?.panel ?? resp; if (!panel?.syms?.length || !panel?.dates?.length || !panel.closes) return null;
  const S = series(panel); if (S.n < w + 5) return null;
  const ids = S.ids.filter(k => S.ret[k]?.some(v => v != null));
  if (ids.length < 6) return null;
  const { m } = matrix(S, ids, w);
  const P = forceLayout(m, { seed }), R = returnsOf(S, ids);
  return { ids, labels: Object.fromEntries(ids.map(k => [k, labelOf(k)])), m, P, fit: layoutFit(P, m), window: w, asOf: S.dates[S.n - 1], S, R, dates: S.dates, tight: clusterTightness(ids, m), ...extremes(ids, m), change: biggestChange(R, ids, { w }) };
}

const f2 = v => (v >= 0 ? '' : 'minus ') + Math.abs(v).toFixed(2);
const pairName = (net, a, b) => `${spokenName(a)} and ${spokenName(b)}`;
/** The spoken script for the SHOW scene in parts, each tagged with what it talks about (intro, hi, lo, group, change, outro): [{ act, text }] or null. */
export function netScriptParts(net) {
  if (!net?.hi || !net?.lo) return null;
  const s = [{ act: 'intro', text: `This is the correlation network. Each market is a node, and markets that have moved together over the last ${net.window} trading days are pulled close, those that moved opposite are pushed apart.` }];
  s.push({ act: 'hi', text: `The tightest pair is ${pairName(net, net.hi.a, net.hi.b)}, at ${f2(net.hi.r)}${net.hi.shared ? ', though they share a currency, so part of that is arithmetic' : ''}.` });
  s.push({ act: 'lo', text: `The most opposed pair is ${pairName(net, net.lo.a, net.lo.b)}, at ${f2(net.lo.r)}${net.lo.shared ? ', again partly arithmetic' : ''}.` });
  const t = net.tight?.[0]; if (t) s.push({ act: 'group', text: `The most tightly bound group is ${t.name.toLowerCase()}, averaging ${f2(t.mean)} inside the group.` });
  const mv = net.change; if (mv && Math.abs(mv.delta) >= 0.15) s.push({ act: 'change', text: `Over the last three months the biggest change is ${pairName(net, mv.a, mv.b)}, from ${f2(mv.then)} to ${f2(mv.now)}${Math.sign(mv.then) !== Math.sign(mv.now) && Math.abs(mv.then) >= 0.2 && Math.abs(mv.now) >= 0.2 ? ', a change of sign' : ''}.` });
  s.push({ act: 'outro', text: 'This describes how these markets moved together in the past. It is not a relationship that persists, and it is not a forecast.' });
  return s;
}
/** The spoken script for the SHOW scene, from the real numbers. Short: the director waits for the narration. */
export function netScript(net) { const p = netScriptParts(net); return p ? p.map(x => x.text).join(' ') : null; }

// ───────── THE BRIEF's analysis (owner, 26 Nov 2026: "cross asset explains what the visual is, but doesn't give analysis on the day") ─────────
// The guide video explains the picture (netScriptParts); the brief reads the day through it: which of the markets we trade are really one trade, which usual partners split, where the move was.
export const NET_CORE = ['NQ', 'GOLD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'];
const ixOf = net => new Map(net.ids.map((k, i) => [k, i]));
/** The biggest block of core markets that move as one with a single anchor over the window (|r| >= thr): { a, mem: [{ k, r }] } (mem sorted by |r|) or null under 2 members. */
export function oneTrade(net, thr = 0.6) {
  const ix = ixOf(net); let best = null;
  for (const a of NET_CORE) {
    if (!ix.has(a)) continue;
    const mem = NET_CORE.filter(b => b !== a && ix.has(b)).map(b => ({ k: b, r: net.m[ix.get(a)][ix.get(b)] })).filter(x => Number.isFinite(x.r) && Math.abs(x.r) >= thr).sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    const avg = mem.reduce((s, x) => s + Math.abs(x.r), 0) / (mem.length || 1);
    if (!best || mem.length > best.mem.length || (mem.length === best.mem.length && avg > best.avg)) best = { a, mem, avg };
  }
  return best && best.mem.length >= 2 ? best : null;
}
/** Usual partners that split on the day: |r| >= thr over the window, both moved at least minRatio of their usual, and the day's signs disagree with the relationship. Biggest first; a core market first. */
export function splits(net, moves, thr = 0.6, minRatio = 0.5) {
  const out = [], ids = net.ids, core = new Set(NET_CORE);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const r = net.m[i][j], a = moves?.[ids[i]], b = moves?.[ids[j]];
    if (!Number.isFinite(r) || Math.abs(r) < thr || !a || !b || !(a.ratio >= minRatio) || !(b.ratio >= minRatio) || !a.move || !b.move) continue;
    if (Math.sign(a.move * b.move) === Math.sign(r)) continue;
    out.push({ a: ids[i], b: ids[j], r, ma: a.move, mb: b.move, score: Math.min(a.ratio, b.ratio) * Math.abs(r) * (core.has(ids[i]) || core.has(ids[j]) ? 2 : 1) });
  }
  return out.sort((x, y) => y.score - x.score);
}
/**
 * Side by side with splits() (Helix review wave 1.3): a baseline for a "split". At r = 0.6 the day's signs disagree about 30% of the time by chance, so a sign split alone is noise.
 * For each tight pair (|r| >= thr, both moves measured) the residual z of the spread: d = (za - sign(r) zb) / sqrt(2 (1 - |r|)), za / zb = each signed move in its own 60-day sd (ratio).
 * A pair is OUT OF LINE when |d| >= zMin; a SPLIT also needs the signs to disagree with the relationship. Under the null |d| >= 2 happens 4.55% of the time, so
 * expected = tested x 0.0455 is how many out-of-line pairs chance alone gives. { list: splits (|d| >= zMin, signs split; biggest |d| first, a core pair first), out, tested, expected }.
 */
export const Z_TAIL_2 = 0.0455;
export function splitsZ(net, moves, thr = 0.6, zMin = 2) {
  const list = [], ids = net?.ids ?? [], core = new Set(NET_CORE); let tested = 0, out = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const r = net.m[i][j], a = moves?.[ids[i]], b = moves?.[ids[j]];
    if (!Number.isFinite(r) || Math.abs(r) < thr || !a || !b || !Number.isFinite(a.ratio) || !Number.isFinite(b.ratio) || !a.move || !b.move) continue;
    tested++;
    const za = Math.sign(a.move) * a.ratio, zb = Math.sign(b.move) * b.ratio, d = (za - Math.sign(r) * zb) / Math.sqrt(2 * (1 - Math.min(0.95, Math.abs(r))));
    if (Math.abs(d) < zMin) continue; out++;
    if (Math.sign(a.move * b.move) === Math.sign(r)) continue;
    list.push({ a: ids[i], b: ids[j], r, ma: a.move, mb: b.move, z: d, core: core.has(ids[i]) || core.has(ids[j]) });
  }
  list.sort((x, y) => (y.core - x.core) || (Math.abs(y.z) - Math.abs(x.z)));
  return { list, out, tested, expected: tested * Z_TAIL_2 };
}
const chanceWords = e => (e < 1 ? 'fewer than one' : e < 1.5 ? 'about one' : `about ${Math.round(e)}`);
/** Where the day's move was: the cluster with the biggest average move against its usual (>= 0.8), with its direction when most agree: { id, name, mean, ids, dir: 'up'|'dn'|null } or null. */
export function moveGroup(net, moves) {
  let best = null;
  for (const c of CLUSTERS) {
    const m = c.ids.map(k => ({ k, x: moves?.[k] })).filter(o => o.x && Number.isFinite(o.x.ratio)); if (m.length < 2) continue;
    const mean = m.reduce((s, o) => s + o.x.ratio, 0) / m.length, up = m.filter(o => o.x.move > 0).length;
    if (!best || mean > best.mean) best = { id: c.id, name: c.name, mean, ids: m.map(o => o.k), dir: up >= m.length * 0.75 ? 'up' : up <= m.length * 0.25 ? 'dn' : null };
  }
  return best && best.mean >= 0.8 ? best : null;
}
const xWord = r => `${r.toFixed(1)} times`;
const dirWord = (k, move) => `${spokenName(k)} ${move > 0 ? 'rose' : 'fell'}`;
/** The BRIEF's spoken analysis in parts, each with the markets it names (ids) so the camera flies to them: [{ act, text, ids }] or null. when = 'today' | 'yesterday' (whose moves these are). */
export function netBriefParts(net, moves, when = 'today') {
  if (!net?.m) return null;
  const s = [], Day = when === 'yesterday' ? 'Yesterday' : 'Today', day = when === 'yesterday' ? 'yesterday' : 'today';
  const g = moveGroup(net, moves);
  s.push({ act: 'intro', ids: g?.ids ?? [], text: g ? `What moved together ${day}. The move was in ${g.name.toLowerCase()}${g.dir ? `, ${g.dir === 'up' ? 'higher' : 'lower'} as a group` : ''}, at ${xWord(g.mean)} their usual size on average.` : `What moved together ${day}. Nothing moved much: no group ran at its usual size.` });
  // a break must be two sigma out of line on the pair's own spread, said with how many chance alone gives (Helix review wave 1.3)
  const Zs = splitsZ(net, moves), sp = Zs.list[0];
  const base = Zs.tested >= 5 ? ` Of ${Zs.tested} tight pairs, ${numW(Zs.out)} ${Zs.out === 1 ? 'is' : 'are'} two sigma or more out of line ${day}; chance alone gives ${chanceWords(Zs.expected)}.` : '';
  if (sp) s.push({ act: 'split', ids: [sp.a, sp.b], text: `The break: ${spokenName(sp.a)} and ${spokenName(sp.b)} normally move ${sp.r > 0 ? 'together' : 'opposite'}, at ${f2(sp.r)}, but ${day} ${dirWord(sp.a, sp.ma)} while ${dirWord(sp.b, sp.mb)}, ${Math.abs(sp.z).toFixed(1)} sigma out of line. For the day, the pair has moved against its usual relationship.${base}` });
  else s.push({ act: 'split', ids: [], text: `${Day}'s moves kept to their usual pattern: no tight pair split by two sigma or more.${base}` });
  const ot = oneTrade(net);
  if (ot) {
    const w = ot.mem.filter(x => x.r > 0).map(x => spokenName(x.k)), ag = ot.mem.filter(x => x.r < 0).map(x => spokenName(x.k));
    const usd = [ot.a, ...ot.mem.map(x => x.k)].every(k => k === 'GOLD' || /USD/.test(k));
    s.push({ act: 'block', ids: [ot.a, ...ot.mem.map(x => x.k)], text: `Moving as one: ${spokenName(ot.a)}${w.length ? ` moves with ${list(w)}` : ''}${ag.length ? `${w.length ? ', and' : ''} against ${list(ag)}` : ''}. Over this window that has been one ${usd ? 'dollar ' : ''}move, not ${numW(ot.mem.length + 1)} separate ones.` });
  }
  s.push({ act: 'outro', ids: [], text: 'Past relationships, not a forecast.' });
  return s;
}
/**
 * The figure under the BRIEF's caption: the same headline the narration speaks, so the number on screen is the day's analysis, not the 3-month change.
 * Order: the split (the actionable one), then the one-trade block, then the group that moved. name = id -> short label. { value, label } or null.
 */
export function netBriefFigure(net, moves, when = 'today', name = k => k) {
  if (!net?.m) return null;
  const day = when === 'yesterday' ? 'yesterday' : 'today', arw = m => (m > 0 ? '▲' : '▼');
  const sp = splitsZ(net, moves).list[0];
  if (sp) return { value: `${name(sp.a)} ${arw(sp.ma)} · ${name(sp.b)} ${arw(sp.mb)}`, label: `split ${day}; usually ${f2(sp.r)} ${sp.r > 0 ? 'together' : 'opposite'}` };
  const ot = oneTrade(net);
  if (ot) return { value: `1 move, not ${ot.mem.length + 1}`, label: `${[ot.a, ...ot.mem.map(x => x.k)].map(name).join(', ')}` };
  const g = moveGroup(net, moves);
  if (g) return { value: `${g.mean.toFixed(1)}× usual`, label: `${g.name}${g.dir ? `, ${g.dir === 'up' ? 'higher' : 'lower'}` : ''} ${day}` };
  return null;
}
const numW = n => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n);
const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/**
 * Where each act of the SHOW sits in the narration, by its share of the characters (the narrator reads at a steady pace): [{ act, a, b }] covering 0..1.
 * The closing sentence is folded into the act before it (the camera stays on the headline while the caveat is read); the headline is the 3-month change when it is spoken, else the tightest pair.
 */
export function showActs(net, given = null) {
  const parts = given ?? netScriptParts(net); if (!parts?.length) return [];
  const tot = parts.reduce((s, x) => s + x.text.length + 1, 0); let at = 0; const out = [];
  for (const x of parts) { const a = at / tot; at += x.text.length + 1; if (x.act === 'outro' && out.length > 1) out[out.length - 1].b = 1; else out.push({ act: x.act, a, b: at / tot, ids: x.ids ?? null }); }
  out[out.length - 1].b = 1; return out;
}
/** The act at progress p with a focus that eases in at its start and out at its end (not at the very end of the scene): { act, focus 0..1, k (0..1 through the act) }. */
export function showAct(acts, p, edge = 0.1) {
  const x = Math.max(0, Math.min(1, Number(p) || 0)), a = acts.find(s => x >= s.a && x < s.b) ?? acts[acts.length - 1];
  if (!a) return { act: 'intro', focus: 0, k: 0, ids: null };
  const e = Math.max(1e-6, Math.min(edge, (a.b - a.a) / 3)), inF = Math.min(1, (x - a.a) / e), outF = a.b >= 1 ? 1 : Math.min(1, (a.b - x) / e);      // a short act still reaches full focus
  const named = a.ids?.length > 0;
  return { act: a.act, ids: a.ids ?? null, focus: a.act === 'outro' || (a.act === 'intro' && !named) ? 0 : Math.max(0, Math.min(inF, outF)), k: (x - a.a) / Math.max(1e-9, a.b - a.a) };
}
/**
 * The nodes an act frames (indices into ids): hi / lo = the pair; change = the pair plus each end's k strongest partners in m (the cluster around the headline pair);
 * group = the tightest cluster's members. { nodes, pair: [i, j] | null }; empty when the act names nothing.
 */
export function actNodes(net, m, act, k = 2, ids = null) {
  const ix = id => net.ids.indexOf(id), none = { nodes: [], pair: null };
  if (ids?.length) { const n = ids.map(ix).filter(i => i >= 0); return { nodes: n, pair: n.length === 2 ? [Math.min(...n), Math.max(...n)] : null }; }
  if (act === 'group') { const t = net.tight?.[0], c = t && CLUSTERS.find(x => x.id === t.id); return c ? { nodes: c.ids.map(ix).filter(i => i >= 0), pair: null } : none; }
  const pr = act === 'hi' ? net.hi : act === 'lo' ? net.lo : act === 'change' ? net.change : null; if (!pr) return none;
  const i = ix(pr.a), j = ix(pr.b); if (i < 0 || j < 0) return none;
  const set = new Set([i, j]);
  if (act === 'change' && m) for (const e of [i, j]) m[e].map((r, q) => ({ q, r: Number.isFinite(r) ? Math.abs(r) : NaN })).filter(x => x.q !== i && x.q !== j && Number.isFinite(x.r)).sort((x, y) => y.r - x.r).slice(0, k).forEach(x => set.add(x.q));
  return { nodes: [...set], pair: [Math.min(i, j), Math.max(i, j)] };
}

/** Node radius (world units) for a move size 0..1: AREA proportional to the size above a small floor, so a reading never jumps. */
export const nodeRadius = (size, rMax = 0.16, floor = 0.06) => rMax * Math.sqrt(floor + (1 - floor) * Math.max(0, Math.min(1, Number(size) || 0)));
