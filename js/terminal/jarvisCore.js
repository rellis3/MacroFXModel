// js/terminal/jarvisCore.js: the PURE half of Jarvis (the owner-only easter egg; jarvisView.js draws it). No DOM, no fetch.
//
// Jarvis draws the macro chain (js/macroChain.js, the same links and verdicts as the Chain tab) as a rotating 3D object: markets are nodes on a cylinder,
// each link is a thread with a particle flowing from cause to effect, colour = verdict. DESCRIPTION ONLY: it shows what moved and which textbook links held or
// broke over the window. Nothing here is a forecast or a signal, and the view says so.
import { CHAIN_LAYOUT } from '../macroChain.js';

/** Node positions on a cylinder (radius 1): the layout's column is the angle, its row is the height. Causes keep their order round the ring. */
export function layout3d(layout = CHAIN_LAYOUT) {
  const cols = Math.max(...Object.values(layout).map(p => p[0])) + 1, rows = Math.max(...Object.values(layout).map(p => p[1])) + 1, out = {};
  for (const [k, [c, r]] of Object.entries(layout)) {
    const a = (c / cols) * Math.PI * 2 + (r % 2) * (Math.PI / cols);      // odd rows are offset half a step so nodes do not stack into columns
    out[k] = [Math.cos(a), ((rows - 1) / 2 - r) * 0.34, Math.sin(a)];
  }
  return out;
}

/** Rotate a point by yaw (around the vertical) then pitch, then perspective-project. cam = { yaw, pitch, zoom, f }. Returns { x, y, s, z } (s = scale, z = depth: bigger is farther). */
export function project(p, cam) {
  const { yaw = 0, pitch = 0, zoom = 1, f = 3.2 } = cam ?? {};
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp;
  const s = (f / (f + z2)) * zoom;
  return { x: x1 * s, y: -y2 * s, s, z: z2 };
}

/**
 * How a node is drawn from a chain end ({ delta, moved, dir, floor }). size 0..1 is the move as a share of its noise floor (capped at 3x);
 * tone: 'up' | 'dn' (moved), 'wrong' (the wrong-way end of a broken link), 'quiet', 'none' (no data).
 */
export function nodeStyle(end, wrong = false) {
  if (!end || end.delta == null || !Number.isFinite(end.delta)) return { tone: 'none', size: 0.15 };
  const share = end.floor > 0 ? Math.min(3, Math.abs(end.delta) / end.floor) / 3 : (end.moved ? 0.5 : 0.1);
  if (wrong) return { tone: 'wrong', size: Math.max(0.45, share) };
  if (end.moved) return { tone: end.dir === 'up' ? 'up' : 'dn', size: Math.max(0.35, share) };
  return { tone: 'quiet', size: Math.max(0.12, Math.min(0.3, share)) };
}

/** The graph for drawing: every node of the layout with its end data, every link with its verdict. links = evaluateChain output. */
export function buildGraph(links, layout = CHAIN_LAYOUT) {
  const ends = {};
  for (const l of links ?? []) { if (l.a?.key) ends[l.a.key] = l.a; if (l.b?.key) ends[l.b.key] = l.b; }
  const wrong = new Set((links ?? []).filter(l => l.verdict === 'broken').map(l => l.b?.key));
  const pos = layout3d(layout);
  const nodes = Object.keys(pos).map(k => ({ key: k, pos: pos[k], end: ends[k] ?? null, style: nodeStyle(ends[k], wrong.has(k)) }));
  const edges = (links ?? []).filter(l => pos[l.a?.key] && pos[l.b?.key]).map(l => ({ id: l.id, from: l.a.key, to: l.b.key, verdict: l.verdict, short: l.short ?? l.id, link: l }));
  return { nodes, edges };
}

/** A point along the curve between two 3D points, bowed towards the cylinder axis so threads cross the middle and not the outside. t in 0..1. */
export function arcPoint(a, b, t, bow = 0.35) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2, c = [mx * (1 - bow), my, mz * (1 - bow)], u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]];
}

/** The boot lines Jarvis types as it comes online, from what the chain says. */
export function bootLines(sum, win) {
  const w = win === 1 ? 'one-day' : `${win}-day`;
  return [
    'J.A.R.V.I.S. · desk intelligence · description only, never a trade',
    `Reading the macro chain over ${w} closes…`,
    sum ? `${sum.holding} holding · ${sum.broken} broken · ${sum.quiet} quiet · ${sum.judged} judged` : 'The chain feeds are not loaded.',
    sum?.headline ?? '',
  ].filter(Boolean);
}

export const VERDICT_WORD = { holding: 'holding', broken: 'broken', quiet: 'quiet', unmeasured: 'no data', notlive: 'not live' };
