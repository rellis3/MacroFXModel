import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, groupPlanes, priceTicks, priceDecimals, niceStep, chartScale, timeTicks, nearestIndex, priceAtY, barChange, planeAlpha, autoDolly, stepKey, fullTime, dateLabel, DAY } from './jarvisChartCore.js';

const day = d => d * DAY, mk = (d, n, secs, base = 100) => Array.from({ length: n }, (_, i) => ({ t: day(d) + i * secs, o: base + i, h: base + i + 2, l: base + i - 1, c: base + i + 1 }));
test('ema: seeded with the simple average of the first n, null before, same length, constant series stays constant', () => {
  const e = ema([1, 2, 3, 4, 5], 3); assert.equal(e.length, 5); assert.equal(e[0], null); assert.equal(e[1], null); assert.equal(e[2], 2); assert.ok(Math.abs(e[3] - 3) < 1e-12 && Math.abs(e[4] - 4) < 1e-12);
  assert.deepEqual(ema([5, 5, 5, 5], 2).slice(1), [5, 5, 5]); assert.deepEqual(ema([1, 2], 5), [null, null]); assert.deepEqual(ema([], 3), []);
  const r = ema([10, 11, 13, 12, 15, 14], 3), k = 2 / 4; assert.ok(Math.abs(r[3] - (12 * k + r[2] * (1 - k))) < 1e-12);
});
test('ema: it only looks backward (changing a later value never changes an earlier one)', () => {
  const a = ema([1, 2, 3, 4, 5, 6], 3), b = ema([1, 2, 3, 4, 5, 60], 3); assert.deepEqual(a.slice(0, 5), b.slice(0, 5));
});
test('groupPlanes: one plane per UTC day, newest first, slots by clock time, capped planes', () => {
  const bars = [...mk(100, 96, 900), ...mk(101, 96, 900), ...mk(102, 40, 900)], p = groupPlanes(bars, '15m');
  assert.equal(p.length, 3); assert.equal(p[0].bars.length, 40); assert.equal(p[1].bars.length, 96); assert.equal(p[0].k, 0); assert.ok(p[0].date > p[1].date);
  assert.equal(p[0].slots, 96); assert.equal(p[1].bars[95].s, 95); assert.equal(p[0].bars[0].s, 0);
  const many = []; for (let d = 100; d < 130; d++) many.push(...mk(d, 24, 3600)); assert.equal(groupPlanes(many, '1h').length, 8); assert.equal(groupPlanes(many, '1h', { maxPlanes: 3 }).length, 3);
});
test('groupPlanes: 5 minute days are merged under the bar cap, OHLC preserved, gi points at the last raw bar', () => {
  const raw = mk(100, 288, 300), p = groupPlanes(raw, '5m');
  assert.ok(p[0].bars.length <= 150); assert.equal(p[0].step, 2); const b = p[0].bars[0]; assert.equal(b.o, raw[0].o); assert.equal(b.c, raw[1].c); assert.equal(b.h, Math.max(raw[0].h, raw[1].h)); assert.equal(b.l, Math.min(raw[0].l, raw[1].l)); assert.equal(b.gi, 1);
  assert.equal(p[0].partial, false); assert.equal(groupPlanes(mk(100, 3, 900), '15m')[0].partial, true);
});
test('groupPlanes: daily blocks of 22 counted back from the latest; bad rows and empty input are safe', () => {
  const raw = Array.from({ length: 50 }, (_, i) => ({ t: day(100 + i), o: 1, h: 2, l: 0.5, c: 1.5 })), p = groupPlanes(raw, '1d');
  assert.equal(p.length, 3); assert.equal(p[0].bars.length, 22); assert.equal(p[1].bars.length, 22); assert.equal(p[2].bars.length, 6); assert.equal(p[0].bars[21].gi, 49);
  assert.equal(groupPlanes([], '15m'), null); assert.equal(groupPlanes([{ t: 1, o: NaN, h: 1, l: 1, c: 1 }], '15m'), null); assert.equal(groupPlanes(mk(1, 5, 900), '4h'), null);
});
test('priceTicks: round numbers inside the range, about the target count; empty for a flat range', () => {
  const t = priceTicks(27010, 27990, 6); assert.ok(t.length >= 4 && t.length <= 9); assert.ok(t.every(p => p >= 27010 && p <= 27990)); assert.ok(t.every(p => p % 50 === 0));
  const fx = priceTicks(1.1201, 1.1299, 5); assert.ok(fx.length >= 3); assert.ok(fx.every(p => p >= 1.1201 - 1e-9 && p <= 1.1299 + 1e-9)); assert.deepEqual(priceTicks(5, 5), []);
  assert.equal(niceStep(0.7), 0.5); assert.equal(niceStep(130), 100); assert.equal(niceStep(0), 1);
});
test('priceDecimals: indices none, FX enough for the step', () => { assert.equal(priceDecimals(28000, 100), 0); assert.ok(priceDecimals(1.12, 0.005) >= 3); assert.equal(priceDecimals(4000, 0.5), 1); });
test('chartScale: covers the near planes and the extras with padding; older planes are ignored', () => {
  const planes = [{ bars: [{ l: 10, h: 20 }] }, { bars: [{ l: 8, h: 12 }] }, { bars: [{ l: 9, h: 11 }] }, { bars: [{ l: 0, h: 500 }] }], s = chartScale(planes, 3, [25]);
  assert.ok(s.lo < 8 && s.hi > 25 && s.hi < 40); assert.ok(chartScale([{ bars: [{ l: 5, h: 5 }] }]).hi > 5);
});
test('timeTicks: intraday every few hours on the hour; daily every fifth bar', () => {
  const p = groupPlanes(mk(100, 96, 900), '15m')[0], t = timeTicks(p); assert.ok(t.length >= 4 && t.length <= 9); assert.equal(t[0].label, '00:00'); assert.equal(t[1].s, 12); assert.equal(t[1].label, '03:00');
  const d = groupPlanes(Array.from({ length: 22 }, (_, i) => ({ t: day(100 + i), o: 1, h: 2, l: 1, c: 1 })), '1d')[0]; assert.equal(timeTicks(d).length, 5); assert.deepEqual(timeTicks(null), []);
});
test('crosshair hit-test: nearest bar within reach, none outside; price from the pointer y inverts the axis', () => {
  const xs = [10, 20, 30, 40]; assert.equal(nearestIndex(xs, 4, 22), 1); assert.equal(nearestIndex(xs, 4, 100, 40), -1); assert.equal(nearestIndex(xs, 4, 38.9), 3); assert.equal(nearestIndex(xs, 0, 5), -1);
  assert.equal(priceAtY(500, 500, 100, 10, 20), 10); assert.equal(priceAtY(100, 500, 100, 10, 20), 20); assert.equal(priceAtY(300, 500, 100, 10, 20), 15); assert.equal(priceAtY(5, 7, 7, 10, 20), 10);
  assert.ok(Math.abs(barChange({ o: 100, c: 101 }) - 1) < 1e-12); assert.equal(barChange({ o: 0, c: 1 }), 0);
});
test('planeAlpha: the plane in focus is solid, older planes fade with age, planes the camera passed fade out; autoDolly stays in range', () => {
  assert.equal(planeAlpha(0, 0), 1); assert.ok(planeAlpha(3, 0) < planeAlpha(1, 0)); assert.ok(planeAlpha(7, 0) >= 0.2); assert.equal(planeAlpha(0, 1), 0); assert.ok(planeAlpha(0, 0.5) > 0 && planeAlpha(0, 0.5) < 1);
  for (let t = 0; t < 100; t += 3) { const v = autoDolly(t, 6); assert.ok(v >= -1e-9 && v <= 5 + 1e-9); } assert.equal(autoDolly(5, 1), 0); assert.equal(autoDolly(0, 6), 0);
});
test('stepKey wraps both ways; labels are UTC', () => {
  assert.equal(stepKey(['A', 'B', 'C'], 'C', 1), 'A'); assert.equal(stepKey(['A', 'B', 'C'], 'A', -1), 'C'); assert.equal(stepKey(['A', 'B'], 'Z', 1), 'A'); assert.equal(stepKey([], 'A', 1), null);
  assert.equal(dateLabel(Date.UTC(2026, 10, 19) / 1000), 'Thu 19 Nov'); assert.equal(fullTime(Date.UTC(2026, 10, 19, 12, 45) / 1000, '15m'), 'Thu 19 Nov 12:45 UTC'); assert.equal(fullTime(Date.UTC(2026, 10, 19) / 1000, '1d'), 'Thu 19 Nov');
});
test('the CANDLES view keeps the id session, has its own environment, and the toolbar commands move the chart state', async () => {
  const { viewsOf } = await import('./jarvisModules.js'); const { chartCommand } = await import('./jarvisViewSession.js');
  const v = viewsOf().find(x => x.id === 'session'); assert.ok(v); assert.equal(v.label, 'CANDLES'); assert.equal(v.env.accent, 'blue2'); assert.equal(v.env.chrome, 'clean'); assert.equal(typeof v.draw, 'function');
  const api = { st: { sel: null } }; chartCommand('mk:GOLD', api); assert.equal(api.st.sel, 'GOLD'); chartCommand('mkn', api); assert.notEqual(api.st.sel, 'GOLD'); chartCommand('tf:1h', api); chartCommand('tf:zz', api); chartCommand('replay', api); chartCommand('replay', api); chartCommand('mk:NOPE', api);
});
test('spreadLabels: no two tags closer than the gap, order kept, clamped into the band', async () => {
  const { spreadLabels } = await import('./jarvisChartCore.js');
  const y = spreadLabels([100, 102, 101, 300], 16, 0, 400), s = [...y].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] - s[i - 1] >= 16 - 1e-9); assert.equal(y[3], 300); assert.ok(y[0] < y[2] && y[2] < y[1]);
  const z = spreadLabels([395, 398], 16, 0, 400); assert.ok(z[1] <= 400 && z[1] - z[0] >= 16 - 1e-9); assert.deepEqual(spreadLabels([], 10), []);
});
test('showFlight: continuous between acts, starts high, rides low along the bars left to right, prints in step', async () => {
  const { showFlight } = await import('./jarvisChartCore.js');
  const geo = { x0: -3, x1: 3, hy: 3, depth: -8, yAt: q => 1 + q };
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const c of [0.2, 0.8]) { const a = showFlight(c - 1e-6, geo), b = showFlight(c + 1e-6, geo); assert.ok(d(a.pos, b.pos) < 1e-3 && d(a.tgt, b.tgt) < 1e-3, `jump at ${c}`); }
  const s0 = showFlight(0, geo), m1 = showFlight(0.35, geo), m2 = showFlight(0.65, geo);
  assert.ok(s0.pos[1] > m1.pos[1] * 2, 'starts high, flies down'); assert.ok(m1.pos[1] < 1.5, 'low along the candles'); assert.ok(m2.pos[0] > m1.pos[0], 'rides left to right');
  assert.equal(s0.printed, 0); assert.ok(m2.printed > m1.printed); assert.equal(showFlight(1, geo).printed, 1); assert.equal(showFlight(0.5, geo).act, 'ride');
  assert.ok([showFlight(NaN, geo), showFlight(-1, geo), showFlight(2, { x0: 0, x1: 0, hy: 1 })].every(f => f.pos.every(Number.isFinite)));
});
