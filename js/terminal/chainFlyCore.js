// js/terminal/chainFlyCore.js: the PURE half of the chain FLY-THROUGH (jarvisViewChain.js draws it). No DOM, no fetch.
// The macro chain as a place you fly through, cause to effect: the flow axis is depth (z), causes near the start, effects far away; risk, credit and equities branch left, currencies and metals right.
// The camera rides a rail through the busiest path (the nodes on judged links, broken ones first in attention), a pure function of progress p in 0..1, so it is testable and the SHOW can drive it.
// DESCRIPTION ONLY: it says which textbook links held or broke over the window. None of it is a forecast or a validated forward signal.
import { THEME } from './jarvisCore.js';

const LANE = { Energy: 0, Rates: 0, Currencies: 1.1, 'Metals and crypto': 1.7, Equities: -1.1, Risk: -1.7, Credit: -2.3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Depth level of every node: the longest cause->effect path reaching it (cycle-safe, capped). edges = [{ from, to }]. */
export function flowLevels(keys, edges) {
  const lv = Object.fromEntries(keys.map(k => [k, 0]));
  for (let pass = 0; pass < keys.length; pass++) {
    let moved = false;
    for (const e of edges) if (e.from in lv && e.to in lv && e.from !== e.to && lv[e.to] < lv[e.from] + 1 && lv[e.from] + 1 <= keys.length) { lv[e.to] = lv[e.from] + 1; moved = true; }
    if (!moved) break;
  }
  return lv;
}

/** 3D positions: x = lane (theme) with a spread when several nodes share a level and lane, y = a gentle stagger, z = level * 2.6 (the flow axis). Returns { pos: {key:[x,y,z]}, level, maxZ }. */
export function flyLayout(graph) {
  const nodes = graph?.nodes ?? [], keys = nodes.map(n => n.key), lv = flowLevels(keys, graph?.edges ?? []), slot = {}, pos = {};
  for (const k of keys) {
    const lane = LANE[THEME[k]] ?? 0, id = `${lv[k]}|${lane}`, i = slot[id] = (slot[id] ?? -1) + 1;
    const spread = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.62;
    pos[k] = [lane * 1.35 + spread, ((keys.indexOf(k) * 7) % 5 - 2) * 0.28, lv[k] * 2.6];
  }
  return { pos, level: lv, maxZ: Math.max(0, ...Object.values(pos).map(p => p[2])) };
}

/** Spoken size of a move: "down three percent", "up eight basis points". */
export function spokenMove(end) {
  if (!end || end.delta == null || !Number.isFinite(end.delta)) return 'with no reading';
  const a = Math.abs(end.delta), dir = end.delta < 0 ? 'down' : 'up', nice = a < 10 ? (Math.round(a * 10) / 10).toString() : String(Math.round(a));
  if (end.unit === 'bp') return `${dir} ${nice} basis points`;
  if (end.unit === 'pct') return `${dir} ${nice} percent`;
  return `${dir} ${nice} points`;
}

/**
 * The rail: stops in flight order (shallow to deep), each { key, pos, cam, kind: 'broken'|'holding'|'move', label, text, level }.
 * A stop is a node on a judged link (holding or broken) or a node that moved beyond its noise; broken ends come first when the list must be trimmed.
 * cam = where the camera passes: beside the node so the node ring frames it.
 */
export function flyRoute(graph, layout, names = {}, max = 12) {
  const nodes = graph?.nodes ?? [], edges = graph?.edges ?? [], by = Object.fromEntries(nodes.map(n => [n.key, n])), kind = {};
  for (const e of edges) {
    if (e.verdict !== 'broken' && e.verdict !== 'holding') continue;
    for (const k of [e.from, e.to]) { if (!by[k]) continue; if (e.verdict === 'broken') kind[k] = 'broken'; else if (!kind[k]) kind[k] = 'holding'; }
  }
  for (const n of nodes) if (!kind[n.key] && n.end?.moved) kind[n.key] = 'move';
  let keys = Object.keys(kind);
  if (!keys.length) keys = nodes.filter(n => n.end && n.end.delta != null).sort((a, b) => b.style.size - a.style.size).slice(0, 6).map(n => n.key);
  const rank = k => ({ broken: 0, holding: 1, move: 2 }[kind[k]] ?? 3);
  if (keys.length > max) keys = keys.sort((a, b) => rank(a) - rank(b) || (by[b].style.size - by[a].style.size)).slice(0, max);
  keys.sort((a, b) => layout.pos[a][2] - layout.pos[b][2] || layout.pos[a][0] - layout.pos[b][0]);
  const stops = keys.map(k => {
    const p = layout.pos[k], side = p[0] > 0 ? -1 : 1;
    return { key: k, pos: p, cam: [p[0] + side * 0.32, p[1] + 0.12, p[2]], kind: kind[k] ?? 'move', label: names[k] ?? k, text: by[k].end?.text ?? '', level: layout.level[k] };
  });
  // one stop per depth slice for the camera: two nodes at the same depth would make a hairpin, so nudge later ones forward a little
  for (let i = 1; i < stops.length; i++) if (stops[i].cam[2] - stops[i - 1].cam[2] < 0.7) stops[i].cam[2] = stops[i - 1].cam[2] + 0.7;
  return { stops, times: defaultTimes(stops) };
}

/** Progress p at which the camera reaches each path point (start, every stop, end): weighted by segment, longer around broken stops, so the camera slows at a broken link. Length stops.length + 2, from 0 to 1. */
export function defaultTimes(stops) {
  const n = stops.length, w = [];
  for (let i = 0; i <= n; i++) { const a = stops[i - 1], b = stops[i]; w.push(1 + ((a?.kind === 'broken') + (b?.kind === 'broken')) * 0.45); }
  const tot = w.reduce((s, x) => s + x, 0), out = [0]; let acc = 0;
  for (const x of w) { acc += x; out.push(acc / tot); }
  out[out.length - 1] = 1; return out;
}

const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
/** The rail's control points: a start pulled back before the first stop, every stop's camera point, an end pushed past the last. */
export function railPoints(route) {
  const s = route.stops;
  if (!s.length) return [[0, 0, -4], [0, 0, 0.001], [0, 0, 4]];
  const a = s[0].cam, b = s[s.length - 1].cam;
  return [[a[0], a[1] + 0.25, a[2] - 3.4], ...s.map(x => x.cam), [b[0], b[1] + 0.2, b[2] + 3.4]];
}

/** Where on the rail progress p is: { i: segment, s: 0..1 inside it }. The easing keeps a little speed at a stop but slows into and out of it. */
export function railParam(times, p) {
  p = clamp(p, 0, 1); let i = 0;
  while (i < times.length - 2 && p > times[i + 1]) i++;
  const span = times[i + 1] - times[i] || 1, u = clamp((p - times[i]) / span, 0, 1), e = u * u * (3 - 2 * u);
  return { i, s: 0.4 * u + 0.6 * e };
}

/** The rail position at (segment, s): Catmull-Rom through the control points. Writes into out. */
export function railAt(pts, i, s, out = new Array(3).fill(0)) {
  const n = pts.length, g = j => pts[clamp(j, 0, n - 1)];
  for (let d = 0; d < 3; d++) out[d] = cr(g(i - 1)[d], g(i)[d], g(i + 1)[d], g(i + 2)[d], s);
  return out;
}

/** The camera at progress p: { eye, target, roll, speed }. Pure; times defaults to the route's (a SHOW passes its own, tied to the words). roll banks into lateral turns. */
export function camAt(route, p, times = route.times) {
  const pts = railPoints(route), { i, s } = railParam(times, p), eye = railAt(pts, i, s), q = railParam(times, Math.min(1, p + 0.045));
  let target = railAt(pts, q.i, q.s);
  if (q.i === i && q.s - s < 1e-4) { const b = railAt(pts, i, Math.max(0, s - 0.05)); target = [eye[0] + (eye[0] - b[0]) * 20, eye[1] + (eye[1] - b[1]) * 20, eye[2] + (eye[2] - b[2]) * 20]; }
  const a = railParam(times, Math.max(0, p - 0.03)), b2 = railParam(times, Math.min(1, p + 0.03)), pa = railAt(pts, a.i, a.s), pb = railAt(pts, b2.i, b2.s);
  const dx = pb[0] - pa[0], dz = pb[2] - pa[2], dx2 = target[0] - eye[0], dz2 = target[2] - eye[2];
  const roll = clamp((dx2 * 0.5 - dx * 0.0) / (Math.abs(dz2) + 1) * 0.55, -0.12, 0.12) * (dz >= 0 ? 1 : -1);
  const speed = Math.hypot(dx, dz) / Math.max(1e-6, (Math.min(1, p + 0.03) - Math.max(0, p - 0.03)));
  return { eye, target, roll, speed };
}

/** A projector for a camera { eye, target, roll } plus the viewer's own look offsets (yaw, pitch). project(p, out) -> out { x, y, z } (x, y in focal units; z = depth ahead, > 0 is in front). */
export function makeProjector(cam, yaw = 0, pitch = 0, f = 1.25) {
  let fx = cam.target[0] - cam.eye[0], fy = cam.target[1] - cam.eye[1], fz = cam.target[2] - cam.eye[2];
  const L = Math.hypot(fx, fy, fz) || 1; fx /= L; fy /= L; fz /= L;
  // look offsets: yaw about the vertical, then pitch
  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  let gx = fx * cyw + fz * syw, gz = -fx * syw + fz * cyw, gy = fy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), hl = Math.hypot(gx, gz) || 1;
  const hx = gx / hl, hz = gz / hl, ny = gy * cp + sp, nh = Math.sqrt(Math.max(0, 1 - Math.min(1, ny * ny)));
  gx = hx * nh; gz = hz * nh; gy = clamp(ny, -0.99, 0.99);
  // right = forward x up (up = +y), then roll the right/up pair about the forward axis
  let rx = gz, rz = -gx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  let ux = -(gy * rz), uy = gz * rx - gx * rz, uz = gy * rx; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const cr2 = Math.cos(cam.roll || 0), sr = Math.sin(cam.roll || 0);
  const Rx = rx * cr2 + ux * sr, Ry = uy * sr, Rz = rz * cr2 + uz * sr, Ux = ux * cr2 - rx * sr, Uy = uy * cr2, Uz = uz * cr2 - rz * sr;
  const ex = cam.eye[0], ey = cam.eye[1], ez = cam.eye[2];
  return (p, out = { x: 0, y: 0, z: 0 }) => {
    const dx = p[0] - ex, dy = p[1] - ey, dz = p[2] - ez, z = dx * gx + dy * gy + dz * gz;
    out.z = z; const k = f / Math.max(z, 1e-3);
    out.x = (dx * Rx + dy * Ry + dz * Rz) * k; out.y = -(dx * Ux + dy * Uy + dz * Uz) * k; return out;
  };
}

/** Depth fog: 1 up close, fading to ~0.05 by `far`. Nothing behind the camera. */
export const fogAlpha = (z, far = 13) => (z <= 0.15 ? 0 : clamp(1 - (z - 1.5) / far, 0.05, 1) * clamp((z - 0.15) / 0.7, 0, 1));

/** How strongly stop i's label shows at progress p (1 at the moment the camera passes, gone by 0.05 of the flight away). */
export const labelAlpha = (times, i, p) => clamp(1 - Math.abs(p - times[i + 1]) / 0.05, 0, 1);

const sayList = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const cleanLabel = s => String(s ?? '').replace(/\s*\([^)]*\)/g, '').trim();

/**
 * The spoken flight, in order. Returns { text, marks, sentences }: marks[i] = the fraction of the script's words spoken by the time the camera should be at stop i
 * (so the SHOW can tie the camera to the voice); the first and last entries bracket the intro and close. Plain short sentences: this is read aloud.
 * Built only from the real nodes and edges: the first stop starts the story, every later stop says how the links INTO it fared.
 */
export function flyScript(graph, route, names = {}) {
  if (!graph || !route?.stops?.length) return null;
  const edges = graph.edges ?? [], stops = route.stops, seen = new Set(), sent = [], at = [];
  const nm = k => { const t = cleanLabel(names[k] ?? k).replace(/\//g, ' ').replace(/^US /, 'the US '); return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t; }, cap = t => t[0].toUpperCase() + t.slice(1);
  const end = k => graph.nodes.find(n => n.key === k)?.end;
  sent.push('Let us fly the chain, from cause to effect.');
  stops.forEach((s, i) => {
    const ins = edges.filter(e => e.to === s.key && seen.has(e.from) && (e.verdict === 'holding' || e.verdict === 'broken'));
    const mv = spokenMove(end(s.key));
    if (i === 0) sent.push(`We start at ${nm(s.key)}, ${mv}.`);
    else if (!ins.length) sent.push(`Next, ${nm(s.key)}, ${mv}.`);
    for (const e of ins) {
      if (e.verdict === 'holding') sent.push(`${cap(nm(e.from))} is feeding ${nm(e.to)}, and that link is holding: ${nm(e.to)} is ${mv}, as the textbook says.`);
      else sent.push(`Here the link from ${nm(e.from)} to ${nm(e.to)} has broken. Both moved, and the textbook did not hold. ${nm(e.to)} is ${mv}.`);
    }
    at.push(sent.length - 1); seen.add(s.key);
  });
  const hold = edges.filter(e => e.verdict === 'holding').length, brk = edges.filter(e => e.verdict === 'broken').length;
  const brokenNames = edges.filter(e => e.verdict === 'broken').map(e => e.short);
  sent.push(`That is the flight. ${hold} ${hold === 1 ? 'link is' : 'links are'} holding and ${brk} ${brk === 1 ? 'is' : 'are'} broken${brk ? `: ${sayList(brokenNames)}` : ''}. This describes which links held or broke. It is not a signal.`);
  const words = sent.map(x => x.split(/\s+/).filter(Boolean).length), tot = words.reduce((a, b) => a + b, 0);
  const cum = []; let acc = 0; for (const w of words) { acc += w; cum.push(acc / tot); }
  // the camera reaches a stop as its last sentence is being spoken; intro word-share is the start point, the closing line is the end
  const marks = [0, ...at.map(i => Math.max(0.02, cum[i] - words[i] / tot * 0.5)), 1];
  for (let i = 1; i < marks.length; i++) if (marks[i] <= marks[i - 1]) marks[i] = Math.min(1, marks[i - 1] + 0.001);
  marks[marks.length - 1] = 1;
  return { text: sent.join(' '), sentences: sent, marks };
}

/** One call for the view and the SHOW: layout, route, script. Deterministic for a given graph. */
export function buildFly(graph, names = {}) {
  if (!graph?.nodes?.length) return null;
  const layout = flyLayout(graph), route = flyRoute(graph, layout, names), script = flyScript(graph, route, names);
  return { layout, route, script };
}
