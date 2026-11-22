// node js/terminal/shockwaveCore.test.mjs: the RELEASE SHOCKWAVE shaping, on the committed Release Reaction record (analysis/output/release_layer1, the same shape /api/release-layer1 serves).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { familiesOf, releasesOf, unitFor, rawAt, resample, lineAt, bandStats, typical30, biggest, depthOf, dateTicks, fanOf, areaScale, nextToday, placeLabels, nativeText, shockwaveScript, CAP, OFFS, MARKETS } from './shockwaveCore.js';

const dir = fileURLToPath(new URL('../../analysis/output/release_layer1/', import.meta.url));
const sum = JSON.parse(readFileSync(dir + 'summary.json', 'utf8')), PATHS = JSON.parse(readFileSync(dir + 'paths.json', 'utf8'));
const rows = sum.rows, NOW = Date.parse('2026-11-20T09:00:00Z');
let n = 0; const t = (name, f) => { f(); n++; };

t('families: real record, desk order, small families dropped', () => {
  const f = familiesOf(rows, NOW);
  assert.deepEqual(f.slice(0, 6).map(x => x.f), ['NFP', 'CPI', 'FOMC', 'ECB', 'BOE', 'BOJ']);
  assert.equal(f.find(x => x.f === 'NFP').n, 28);
  assert.ok(!f.some(x => x.f === 'PCE' || x.f === 'RETAIL'));          // 1 and 2 releases: too few to draw a family
  assert.deepEqual(familiesOf(null), []); assert.deepEqual(familiesOf([{}, null, { id: 'x', family: 'CPI', t: 'bad' }]), []);
});

t('releasesOf: oldest first, future and upcoming excluded', () => {
  const r = releasesOf(rows, 'CPI', NOW); assert.equal(r.length, 25); assert.ok(Date.parse(r[0].t) < Date.parse(r.at(-1).t));
  const extra = [...rows, { id: 'z|CPI', family: 'CPI', t: '2026-12-10T13:30:00Z', status: 'upcoming' }];
  assert.equal(releasesOf(extra, 'CPI', NOW).length, 25);
});

t('unitFor: median |m30| of the family; pooled when the family is thin; null when nothing', () => {
  const u = unitFor(rows, 'NFP', 'eurusd', NOW); assert.ok(u.unit > 0.05 && u.unit < 0.6, String(u.unit)); assert.equal(u.pooled, false);
  const v = unitFor(rows, 'NFP', 'vxn', NOW); assert.ok(v === null || v.pooled);       // VXN: one print in the whole record
  assert.equal(unitFor([], 'NFP', 'eurusd', NOW), null);
  assert.equal(unitFor([{ id: 'a', family: 'CPI', t: '2025-01-01T00:00:00Z', M: { nq: { m30: 0 } } }], 'CPI', 'nq', NOW), null);   // a zero unit is no unit
});

t('rawAt / resample: 1-minute and 15-minute paths, rebased at the release', () => {
  const p = PATHS['2026-10-14T12:30:00Z|CPI'].sofr; assert.equal(rawAt(p, 0), p.v[30]); assert.equal(rawAt(p, OFFS[0]), p.v[0]); assert.equal(rawAt(p, 999), null);
  const l = resample(p, 2); assert.equal(l.segs.length, 1); assert.equal(l.segs[0][0][0], -30); assert.equal(l.segs[0].at(-1)[0], 240);
  assert.equal(lineAt(l, 30), p.v[60] / 2);
  const z = PATHS['2024-05-03T12:30:00Z|NFP'].zt; assert.equal(z.step, 15);
  const lz = resample(z, 0.05); assert.equal(lz.segs.length, 1, 'a 15-minute path is bridged, not split');
  const a0 = rawAt(z, 0) / 0.05, a15 = rawAt(z, 15) / 0.05; assert.ok(Math.abs(lineAt(lz, 8) - (a0 + (a15 - a0) * 8 / 15)) < 1e-9);
  assert.equal(resample(null, 1).segs.length, 0); assert.equal(resample(p, 0).segs.length, 0); assert.equal(resample(p, NaN).segs.length, 0);
});

t('resample: long gaps split, values capped AND flagged, abs folds', () => {
  const v = Array(271).fill(null); for (let i = 0; i < 40; i++) v[i] = i * 0.1; for (let i = 100; i < 271; i++) v[i] = -1;
  const l = resample({ step: 1, v }, 0.1); assert.equal(l.segs.length, 2); assert.ok(l.capped);
  for (const s of l.segs) for (const [, y] of s) assert.ok(Math.abs(y) <= CAP + 1e-9);
  assert.ok(resample({ step: 1, v }, 1, { abs: true }).segs.every(s => s.every(([, y]) => y >= 0)));
  assert.equal(resample({ step: 1, v: [1, null, null] }, 1).segs.length, 0);
});

t('bandStats: median and quartiles, null under three lines', () => {
  const mk = k => ({ segs: [[[0, k], [2, k]]] });
  const b = bandStats([mk(1), mk(2), mk(3), mk(4)]), at0 = b.find(x => x.m === 0);
  assert.equal(at0.med, 2.5); assert.equal(at0.lo, 1.75); assert.equal(at0.hi, 3.25); assert.equal(at0.n, 4);
  assert.equal(b.find(x => x.m === 10).med, null);
  assert.equal(bandStats([mk(1), mk(2)]).find(x => x.m === 0).med, null);
});

t('typical30 and biggest on the real record', () => {
  const ty = typical30(rows, 'CPI', 'nq', NOW); assert.equal(ty.unit, '%'); assert.ok(ty.n >= 20); assert.ok(ty.lo <= ty.med && ty.med <= ty.hi); assert.equal(ty.up + ty.dn <= ty.n, true);
  assert.equal(typical30(rows, 'CPI', 'nope', NOW), null);
  const rel = releasesOf(rows, 'CPI', NOW), b = biggest(rel, 'nq', ty.med, 3);
  assert.equal(b.length, 3); assert.ok(b[0].size >= b[1].size && b[1].size >= b[2].size); assert.deepEqual(biggest(rel, 'nq', 0), []);
});

t('depth and date ticks', () => {
  const t0 = Date.parse('2024-04-01T00:00:00Z'), t1 = Date.parse('2026-10-28T00:00:00Z');
  assert.equal(depthOf('2026-10-28T00:00:00Z', t0, t1), 0); assert.equal(depthOf('2024-04-01T00:00:00Z', t0, t1), 1); assert.equal(depthOf('bad', t0, t1), 0); assert.equal(depthOf('2025-01-01', t1, t0), 0);
  const tk = dateTicks(t0, t1); assert.ok(tk.some(x => x.label === '2025')); assert.ok(tk.every(x => x.f >= 0 && x.f <= 1)); assert.deepEqual(dateTicks(5, 1), []);
});

t('fanOf: the newest release, every market with a path, biggest first, missing named', () => {
  const rel = releasesOf(rows, 'CPI', NOW), last = rel.at(-1), units = {};
  for (const m of MARKETS) { const u = unitFor(rows, 'CPI', m.k, NOW); if (u) units[m.k] = u.unit; }
  const f = fanOf(last, PATHS[last.id], units);
  assert.ok(f.spokes.length >= 14, String(f.spokes.length)); assert.ok(f.missing.includes('VXN'));
  for (let i = 1; i < f.spokes.length; i++) assert.ok((f.spokes[i - 1].size ?? -1) >= (f.spokes[i].size ?? -1));
  assert.ok(f.spokes.every(s => s.line.segs[0][0][0] === 0));          // spokes start at the release instant
  assert.deepEqual(fanOf(null, null, null).spokes, []);
});

t('areaScale: area proportional, capped', () => {
  assert.equal(areaScale(0), 0); assert.ok(Math.abs(areaScale(4) / areaScale(1) - 2) < 1e-9); assert.equal(areaScale(40), areaScale(CAP)); assert.equal(areaScale(NaN), 0);
});

t('nextToday: only later today in London, families we hold', () => {
  const now = Date.parse('2026-11-20T09:00:00Z');
  const ev = { events: [{ family: 'NFP', t: '2026-11-20T13:30:00Z', released: false }, { family: 'CPI', t: '2026-11-21T13:30:00Z' }, { family: 'ECB', t: '2026-11-20T08:00:00Z', released: true }] };
  assert.deepEqual(nextToday(ev, null, now), { family: 'NFP', ms: Date.parse('2026-11-20T13:30:00Z'), hm: '13:30' });
  assert.equal(nextToday(ev, null, now, ['CPI']), null);
  assert.equal(nextToday(null, { ahead: [{ family: 'boe', t: '2026-11-20T12:00:00Z' }] }, now).family, 'BOE');
  assert.equal(nextToday(null, null, now), null); assert.equal(nextToday({ events: [{ t: 'x' }] }, null, now), null);
});

t('placeLabels: no overlaps, priority wins', () => {
  const items = [{ x: 100, y: 100, w: 80, h: 12, prio: 1 }, { x: 105, y: 100, w: 80, h: 12, prio: 5 }, { x: 110, y: 100, w: 80, h: 12, prio: 3 }];
  const p = placeLabels(items, 400, 300); assert.deepEqual(p[1], { x: 105, y: 100 });
  const boxes = p.map((q, i) => q && { x: q.x - 43, y: q.y - 12, w: 86, h: 17 }).filter(Boolean);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)); }
  assert.equal(placeLabels([{ x: 10, y: 10, w: 50, h: 12 }], 400, 300, [{ x: 0, y: 0, w: 400, h: 300 }])[0], null);
});

t('words: native units and the SHOW line (size, not direction; no forecast words)', () => {
  assert.equal(nativeText(4.5, 'bp'), '4.5 bp'); assert.equal(nativeText(-0.214, '%', true), '−0.21%'); assert.equal(nativeText(null, '%'), 'n/a');
  const typ = typical30(rows, 'NFP', 'eurusd', NOW), s = shockwaveScript({ family: 'NFP', mkt: 'eurusd', typ, next: { hm: '13:30' } });
  assert.match(s, /US payrolls is due at 13:30 London/); assert.match(s, /first thirty minutes/); assert.match(s, /not a forecast/);
  assert.doesNotMatch(s, /\bwill\b|\bexpect|\btarget/i);
  assert.match(shockwaveScript({ family: 'CPI', mkt: 'nq', typ: typical30(rows, 'CPI', 'nq', NOW) }), /most recent big release was the US CPI/);
  assert.equal(shockwaveScript({ family: 'CPI', mkt: 'nq', typ: null }), null);
});

console.log(`shockwaveCore: ${n} tests passed`);
