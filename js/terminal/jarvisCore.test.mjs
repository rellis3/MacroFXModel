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
