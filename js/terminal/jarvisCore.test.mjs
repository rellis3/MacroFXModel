// js/terminal/jarvisCore.test.mjs: the pure half of Jarvis (the 3D chain easter egg).
import test from 'node:test';
import assert from 'node:assert/strict';
import { layout3d, project, nodeStyle, buildGraph, arcPoint, bootLines } from './jarvisCore.js';
import { CHAIN_LAYOUT, evaluateChain } from '../macroChain.js';
import { buildCommands, search, grouped } from './commandCore.js';

test('layout3d: every chain node sits on the unit cylinder, higher rows lower down', () => {
  const p = layout3d();
  assert.deepEqual(Object.keys(p).sort(), Object.keys(CHAIN_LAYOUT).sort());
  for (const [k, [x, y, z]] of Object.entries(p)) assert.ok(Math.abs(Math.hypot(x, z) - 1) < 1e-9, `${k} not on the cylinder`);
  assert.ok(p.oil[1] > p.giltgap[1]);
});

test('project: perspective makes far things smaller, yaw of a full turn changes nothing', () => {
  const near = project([0, 0, -1], { zoom: 1 }), far = project([0, 0, 1], { zoom: 1 });
  assert.ok(near.s > far.s && near.z < far.z);
  const a = project([0.5, 0.2, 0.3], { yaw: 0 }), b = project([0.5, 0.2, 0.3], { yaw: Math.PI * 2 });
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
});

test('nodeStyle: no data, quiet, moved up/down and the wrong end of a broken link', () => {
  assert.equal(nodeStyle(null).tone, 'none');
  assert.equal(nodeStyle({ delta: 0.2, moved: false, floor: 3 }).tone, 'quiet');
  assert.equal(nodeStyle({ delta: 4, moved: true, dir: 'up', floor: 3 }).tone, 'up');
  assert.equal(nodeStyle({ delta: -4, moved: true, dir: 'down', floor: 3 }).tone, 'dn');
  assert.equal(nodeStyle({ delta: 4, moved: true, dir: 'up', floor: 3 }, true).tone, 'wrong');
  assert.ok(nodeStyle({ delta: 30, moved: true, dir: 'up', floor: 3 }).size <= 1);
});

test('buildGraph: a real evaluation gives a node per layout key and an edge per link', () => {
  const links = evaluateChain({ oil: { delta: -4, last: 70 }, bei: { delta: 8, last: 230 } });
  const g = buildGraph(links);
  assert.equal(g.nodes.length, Object.keys(CHAIN_LAYOUT).length);
  assert.ok(g.edges.length > 0 && g.edges.every(e => e.verdict));
  assert.deepEqual(buildGraph([]).edges, []);
});

test('arcPoint: ends are the endpoints and the middle bows towards the axis', () => {
  const a = [1, 0, 0], b = [-1, 0, 0];
  assert.deepEqual(arcPoint(a, b, 0).map(v => +v.toFixed(9)), [1, 0, 0]);
  assert.deepEqual(arcPoint(a, b, 1).map(v => +v.toFixed(9)), [-1, 0, 0]);
  const m = arcPoint([1, 0, 0], [0, 0, 1], 0.5), straight = [0.5, 0, 0.5];
  assert.ok(Math.hypot(m[0], m[2]) < Math.hypot(straight[0], straight[2]));
});

test('bootLines: says what it is, the counts and the headline; copes with no chain', () => {
  const l = bootLines({ holding: 5, broken: 2, quiet: 20, judged: 7, headline: 'H' }, 1);
  assert.ok(l[0].includes('description only') && l.some(x => x.includes('5 holding')) && l.includes('H'));
  assert.ok(bootLines(null, 20).some(x => x.includes('not loaded')));
});

test('the JARVIS command is an easter egg: typing the exact word finds it, nothing else does, and it is not in the ? list', () => {
  const all = buildCommands({ isOn: () => true });
  const hit = search(all, 'jarvis');
  assert.equal(hit[0]?.cmd.id, 'jarvis');
  assert.deepEqual(hit[0].action ?? hit[0].cmd.action, { kind: 'jarvis' });
  assert.ok(!search(all, 'jarv').some(r => r.cmd.id === 'jarvis'), 'a partial word must not reveal it');
  assert.ok(!grouped(all).flatMap(g => g.items).some(c => c.id === 'jarvis'));
  assert.ok(!buildCommands({ isOn: id => id !== 'widget.jarvis' }).some(c => c.id === 'jarvis'), 'a login without the surface never gets the command');
});

import { radarRank, systemSummary } from './jarvisCore.js';
test('radarRank: ranks the moved ends by size against their noise, broken-link ends first, quiet ones left out', () => {
  const g = buildGraph(evaluateChain({ oil: { delta: -9, last: 70 }, bei: { delta: 1, last: 230 }, us10y: { delta: 40, last: 4 }, real: { delta: -30, last: 2 } }));
  const r = radarRank(g, { oil: 'Oil' });
  assert.ok(r.items.length >= 2 && r.items.every(i => i.ratio > 0 && !(i.tone === 'quiet')));
  for (let i = 1; i < r.items.length; i++) if (r.items[i - 1].tone !== 'wrong' || r.items[i].tone === 'wrong') assert.ok(r.items[i - 1].ratio >= r.items[i].ratio || r.items[i].tone === 'wrong');
  assert.deepEqual(radarRank(null).items, []);
});
test('systemSummary: memory, uptime and the busiest services today; copes with an empty or failed payload', () => {
  const s = systemSummary({ ok: true, uptimeSec: 7200, memory: { rssMB: 812.3, peakRssMB: 990, heapUsedMB: 400 }, counts: { enabled: 40, total: 60 },
    services: [{ id: 'a', today: { totalMs: 120000, runs: 4, errors: 1 } }, { id: 'b', today: { totalMs: 0 } }, { id: 'c', today: { totalMs: 600000, runs: 2, errors: 0 } }] });
  assert.equal(s.rssMB, 812.3); assert.equal(s.uptimeH, 2); assert.deepEqual(s.top.map(t => t.id), ['c', 'a']);
  assert.equal(systemSummary(null).ok, false);
});

import { skyline, towerBox, trimInputs, pickVoice, wakeParse, watchSnapshot, watchDiff, memoryState } from './jarvisCore.js';
test('skyline: a tower per node, taller for bigger moves, a quiet market is a low block', () => {
  const g = buildGraph(evaluateChain({ oil: { delta: -9, last: 70 }, bei: { delta: 0.5, last: 230 } }));
  const s = skyline(g); assert.equal(Object.keys(s).length, Object.keys(CHAIN_LAYOUT).length);
  assert.ok(s.oil.h > s.bei.h && s.bei.h < 0.3);
  const b = towerBox(s.oil); assert.equal(b.pts.length, 8); assert.equal(b.faces.sides.length, 4);
  assert.ok(b.topCentre[1] > -0.55);
});
test('trimInputs: nothing after the date survives (no lookahead); undated parts and the live block are handled', () => {
  const t = trimInputs({ fred: { us10y: [{ date: '2026-11-01', value: 1 }, { date: '2026-11-10', value: 2 }] }, ohlc: { nq: [{ date: '2026-11-12', value: 3 }] }, live: { x: 1 }, crack: null }, '2026-11-05');
  assert.deepEqual(t.fred.us10y.map(p => p.date), ['2026-11-01']); assert.deepEqual(t.ohlc.nq, []); assert.ok(!('live' in t)); assert.equal(t.crack, null);
});
test('pickVoice: a British male beats a female or a non-English voice; no voices gives null', () => {
  const v = [{ name: 'Samantha', lang: 'en-US' }, { name: 'Google UK English Male', lang: 'en-GB' }, { name: 'Amelie', lang: 'fr-FR' }];
  assert.equal(pickVoice(v).name, 'Google UK English Male'); assert.equal(pickVoice([]), null);
});
test('wakeParse: finds the wake word anywhere and returns what follows', () => {
  assert.deepEqual(wakeParse('hey Jarvis, what is oil doing?'), { woke: true, query: 'what is oil doing?' });
  assert.deepEqual(wakeParse('Jarvis'), { woke: true, query: '' });
  assert.equal(wakeParse('what is oil doing').woke, false);
});
test('watchDiff: a link breaking or healing and a market newly well past its noise are events; no change is none', () => {
  const mk = (link, ratio) => ({ links: { a: { verdict: link, short: 'oil to inflation' } }, nodes: { oil: { label: 'Oil', text: '-4%', ratio, moved: true } } });
  const p = mk('holding', 1.2), n = mk('broken', 2.6), ev = watchDiff(p, n);
  assert.deepEqual(ev.map(e => e.kind).sort(), ['big', 'broke']);
  assert.deepEqual(watchDiff(n, p).map(e => e.kind), ['healed']);
  assert.deepEqual(watchDiff(p, p), []); assert.deepEqual(watchDiff(null, p), []);
  const g = buildGraph(evaluateChain({ oil: { delta: -9, last: 70 } })); assert.ok(watchSnapshot(g).nodes.oil.ratio > 1);
});
test('memoryState: no limit is ok; 80 percent is high; 95 percent is critical', () => {
  assert.equal(memoryState(900, 0), 'ok'); assert.equal(memoryState(800, 1000), 'high'); assert.equal(memoryState(960, 1000), 'critical'); assert.equal(memoryState(500, 1000), 'ok');
});

import { GEO, THEME, REGIONS, llToVec, globeProject, greatArc, bubbleLayout, THEME_ORDER } from './jarvisCore.js';
import { CHAIN_NODES } from '../macroChain.js';
test('GEO and THEME place every chain node; every location is a real latitude and longitude', () => {
  for (const k of Object.keys(CHAIN_NODES)) { assert.ok(GEO[k], `${k} has no place on the globe`); assert.ok(THEME[k], `${k} has no bubble theme`); assert.ok(THEME_ORDER.includes(THEME[k]), `${k} theme`); }
  for (const [k, [la, lo]] of Object.entries(GEO)) assert.ok(Math.abs(la) <= 90 && Math.abs(lo) <= 180, `${k} out of range`);
  for (const [k, r] of Object.entries(REGIONS)) assert.ok(r.length === 3 && r[2] >= 1, k);
});
test('globeProject: the centre point faces the viewer, the far side does not, and a turned globe moves a place', () => {
  const c = globeProject(llToVec(10, 20), { lat: 10, lon: 20 }); assert.ok(Math.abs(c.x) < 1e-9 && Math.abs(c.y) < 1e-9 && c.z > 0.999);
  assert.ok(globeProject(llToVec(-10, -160), { lat: 10, lon: 20 }).z < 0);
  assert.ok(globeProject(llToVec(0, 30), { lat: 0, lon: 0 }).x > 0 && globeProject(llToVec(0, -30), { lat: 0, lon: 0 }).x < 0);
  assert.ok(globeProject(llToVec(0, 0), { lat: 0, lon: 0 }, 0.3).z > 1.29);
});
test('greatArc: starts and ends on the two points, lifts in the middle, stays on a unit sphere at the ends', () => {
  const a = llToVec(50, 8), b = llToVec(35, 139), s = greatArc(a, b, 0), e = greatArc(a, b, 1), m = greatArc(a, b, 0.5);
  assert.ok(Math.hypot(s.v[0] - a[0], s.v[1] - a[1], s.v[2] - a[2]) < 1e-6 && Math.hypot(e.v[0] - b[0], e.v[1] - b[1], e.v[2] - b[2]) < 1e-6);
  assert.ok(m.h > 0.05 && s.h < 1e-9);
});
test('bubbleLayout: every bubble placed, none overlapping, bigger moves are bigger bubbles', () => {
  const keys = Object.keys(CHAIN_NODES), sizes = Object.fromEntries(keys.map((k, i) => [k, i % 4 === 0 ? 1 : 0.1])), L = bubbleLayout(keys, sizes);
  assert.equal(Object.keys(L).length, keys.length);
  let worst = 0; for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const A = L[keys[i]], B = L[keys[j]]; worst = Math.max(worst, A.r + B.r - Math.hypot(A.x - B.x, A.y - B.y)); }
  assert.ok(worst < 0.004, `bubbles overlap by ${worst}`);
  assert.ok(L[keys[0]].r > L[keys[1]].r);
});

test('systemSummary carries the container total and the per-process rows (empty list when the server did not send them)', () => {
  const s = systemSummary({ ok: true, memory: { rssMB: 4100, processes: { containerMB: 6100, rows: [{ id: 'server', rssMB: 4100 }, { id: 'botGold', rssMB: 900 }] } } });
  assert.equal(s.containerMB, 6100); assert.equal(s.procs.length, 2);
  const e = systemSummary({ ok: true, memory: { rssMB: 1 } }); assert.deepEqual(e.procs, []); assert.equal(e.containerMB, null);
});
