// node --test js/terminal/legChartCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingCorr, visibleSpan, legPrices, lineRaw, PRESETS, neededLegs } from './legChartCore.js';

test('visibleSpan clamps to the data and refuses a window too short to test', () => {
  assert.deepEqual(visibleSpan({ from: -5.2, to: 400.4 }, 300), { from: 0, to: 299 });
  assert.equal(visibleSpan({ from: 10, to: 50 }, 300), null);
  assert.equal(visibleSpan(null, 300), null);
});
test('rollingCorr: a line that equals the price changes correlates ~1 at lag 0, and the lag sign matches the Shift', () => {
  let s = 99; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
  const steps = Array.from({ length: 400 }, rnd), line = []; let a = 0; for (const d of steps) { a += d; line.push(a); }
  const px = [100]; for (let i = 1; i < 400; i++) px.push(px[i - 1] * Math.exp(steps[i - 3 >= 0 ? i - 3 : 0] * 0.01));   // price follows the line 3 bars later
  const r3 = rollingCorr(line, px, 96, 3).filter(p => p.r != null), r0 = rollingCorr(line, px, 96, 0).filter(p => p.r != null);
  assert.ok(r3.at(-1).r > 0.95, 'lag +3 = line leads price by 3');
  assert.ok(Math.abs(r0.at(-1).r) < 0.4);
});
test('legPrices: nothing without a leg, and never carries past the end of the leg data', () => {
  assert.deepEqual(legPrices(null, [0, 900], 900), [null, null]);
  const L = { m15: [{ t: 0, o: 96, h: 96, l: 96, c: 96 }, { t: 900, o: 96, h: 96, l: 96, c: 96 }] };
  const out = legPrices(L, [0, 900, 1800, 2700], 900);
  assert.equal(out[1], 96); assert.equal(out[3], null);
});
test('lineRaw: the C.OG spread is the SOFR rate minus the Euribor rate in bp (Euribor 3.95, SOFR 4.20 -> +25)', () => {
  const legs = { I2: { m15: [{ t: 0, o: 96.05, h: 96.05, l: 96.05, c: 96.05 }] }, SR32: { m15: [{ t: 0, o: 95.8, h: 95.8, l: 95.8, c: 95.8 }] } };
  const r = lineRaw(PRESETS[0], legs, [0], 900);
  assert.ok(Math.abs(r[0] - 25) < 1e-9, String(r[0]));
  assert.deepEqual(neededLegs(PRESETS[0]), ['I2', 'SR32']);
});
