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

/**
 * The radar: what is unusual right now, ranked by how big each move is against its own noise floor. Nodes only (the chain's ends), plus the broken links.
 * Description of this window's tape: "unusual" means large against that series' normal 20-day noise, not that anything follows.
 */
export function radarRank(graph, names = {}) {
  const items = [];
  for (const n of graph?.nodes ?? []) {
    const e = n.end; if (!e || e.delta == null || !(e.floor > 0)) continue;
    const ratio = Math.abs(e.delta) / e.floor, wrong = n.style.tone === 'wrong';
    if (!e.moved && !wrong) continue;
    items.push({ key: n.key, label: names[n.key] ?? n.key, text: e.text, tone: n.style.tone, ratio, why: wrong ? `the wrong-way end of a broken link, ${ratio.toFixed(1)}x its normal noise` : `${ratio.toFixed(1)}x its normal noise` });
  }
  items.sort((a, b) => (b.tone === 'wrong') - (a.tone === 'wrong') || b.ratio - a.ratio);
  const broken = (graph?.edges ?? []).filter(e => e.verdict === 'broken').map(e => ({ id: e.id, short: e.short, read: String(e.link?.read ?? '') }));
  return { items, broken };
}

/** /api/services -> the few numbers worth reading: this process's memory (what Railway bills), uptime, and the services that used the most time today. */
export function systemSummary(j) {
  const m = j?.memory ?? {}, rows = Array.isArray(j?.services) ? j.services : [];
  const top = rows.filter(r => (r.today?.totalMs ?? 0) > 0).sort((a, b) => b.today.totalMs - a.today.totalMs).slice(0, 8)
    .map(r => ({ id: r.id, minutes: +(r.today.totalMs / 60000).toFixed(1), runs: r.today.runs ?? 0, errors: r.today.errors ?? 0 }));
  return { ok: !!j?.ok, rssMB: m.rssMB ?? null, peakRssMB: m.peakRssMB ?? null, heapUsedMB: m.heapUsedMB ?? null, uptimeH: j?.uptimeSec != null ? +(j.uptimeSec / 3600).toFixed(1) : null, enabled: j?.counts?.enabled ?? null, total: j?.counts?.total ?? null, top };
}

// ───────────────────────── Skyline: the chain as a trading city ─────────────────────────
/** Towers on a street grid: the chain layout's column is east-west, its row is north-south. height 0..1 follows the move against its noise (a quiet market is a low block). */
export function skyline(graph, layout = CHAIN_LAYOUT) {
  const cols = Math.max(...Object.values(layout).map(p => p[0])) + 1, rows = Math.max(...Object.values(layout).map(p => p[1])) + 1, out = {};
  for (const n of graph?.nodes ?? []) {
    const p = layout[n.key]; if (!p) continue;
    out[n.key] = { key: n.key, x: (p[0] - (cols - 1) / 2) * 0.5, z: (p[1] - (rows - 1) / 2) * 0.42, h: 0.06 + 0.94 * n.style.size, tone: n.style.tone };
  }
  return out;
}

/** The 8 corners of a tower (a box w wide, base at floorY, height h), as 3D points; faces index into them: top, then the four sides. */
export function towerBox(t, floorY = -0.55, w = 0.15) {
  const x0 = t.x - w, x1 = t.x + w, z0 = t.z - w, z1 = t.z + w, y0 = floorY, y1 = floorY + t.h * 1.1;
  return { pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], faces: { top: [4, 5, 6, 7], sides: [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] }, topCentre: [t.x, y1, t.z] };
}

// ───────────────────────── Time scrub ─────────────────────────
/** The chain inputs as they were on a date: every dated series cut at that day (arrays of { date }), nothing else touched. No lookahead: nothing after `date` survives. */
export function trimInputs(x, date) {
  if (Array.isArray(x)) {
    if (x.length && x[0] && typeof x[0] === 'object' && 'date' in x[0]) return x.filter(p => String(p.date) <= date);
    return x.map(v => trimInputs(v, date));
  }
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'live').map(([k, v]) => [k, trimInputs(v, date)]));
  return x;
}

// ───────────────────────── Voice ─────────────────────────
/** The best synthesised voice on offer: a British male first, then any British voice, then any English one, then whatever there is. voices = speechSynthesis.getVoices(). */
export function pickVoice(voices) {
  const v = voices ?? []; if (!v.length) return null;
  const score = x => { const n = `${x.name} ${x.lang}`.toLowerCase(); let s = 0; if (/en[-_]gb/.test(n)) s += 50; else if (/^en/.test(String(x.lang).toLowerCase())) s += 20; if (/daniel|george|ryan|arthur|oliver|male/.test(n)) s += 30; if (/google|natural|neural|online/.test(n)) s += 10; if (/female|zira|hazel|susan|samantha/.test(n)) s -= 20; return s; };
  return [...v].sort((a, b) => score(b) - score(a))[0];
}

/** "hey jarvis what is oil doing" -> { woke: true, query: 'what is oil doing' }. A bare "jarvis" wakes him with no query. Matches the word anywhere so a clipped "hey" does not matter. */
export function wakeParse(text) {
  const t = String(text ?? '').trim(), m = t.match(/\bjarvis\b[\s,.:;!?-]*(.*)$/i);
  return m ? { woke: true, query: m[1].trim() } : { woke: false, query: '' };
}

// ───────────────────────── Watching ─────────────────────────
/** What the watcher compares: each link's verdict and each moved node's size against its noise. */
export function watchSnapshot(graph, names = {}) {
  const links = Object.fromEntries((graph?.edges ?? []).map(e => [e.id, { verdict: e.verdict, short: e.short }]));
  const nodes = {};
  for (const n of graph?.nodes ?? []) { const e = n.end; if (e && e.delta != null && e.floor > 0) nodes[n.key] = { label: names[n.key] ?? n.key, text: e.text, ratio: Math.abs(e.delta) / e.floor, moved: !!e.moved }; }
  return { links, nodes };
}

/**
 * What changed between two snapshots, as plain events a person would want to hear: a link breaking or healing, a market newly well beyond its noise.
 * Description only: "broke" means the textbook link did not follow this window, not that a trade exists.
 */
export function watchDiff(prev, next, { bigAt = 2 } = {}) {
  if (!prev || !next) return [];
  const ev = [];
  for (const [id, l] of Object.entries(next.links)) {
    const was = prev.links[id]?.verdict;
    if (!was || was === l.verdict) continue;
    if (l.verdict === 'broken') ev.push({ kind: 'broke', level: 'warn', id, text: `The link ${l.short} just broke: both ends moved and the textbook did not hold.` });
    else if (was === 'broken' && l.verdict === 'holding') ev.push({ kind: 'healed', level: 'info', id, text: `The link ${l.short} is holding again.` });
  }
  for (const [k, n] of Object.entries(next.nodes)) {
    const was = prev.nodes[k];
    if (n.moved && n.ratio >= bigAt && (!was || was.ratio < bigAt)) ev.push({ kind: 'big', level: 'info', id: k, text: `${n.label} is ${n.text}, ${n.ratio.toFixed(1)} times its normal noise.` });
  }
  return ev;
}

/** Server memory against a limit: 'ok' | 'high' | 'critical'. limitMB is the owner's own number (the plan's memory), 0 = no limit set. */
export function memoryState(rssMB, limitMB) {
  if (!(limitMB > 0) || rssMB == null) return 'ok';
  const r = rssMB / limitMB; return r >= 0.95 ? 'critical' : r >= 0.8 ? 'high' : 'ok';
}
