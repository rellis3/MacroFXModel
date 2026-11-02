// node --test js/stateAssets.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summariseAssets, retN, pctOf, beta } from './stateAssets.js';

const N = 300, dates = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10));
const lin = (a, b) => dates.map((_, i) => a + b * i);
const y10 = dates.map((_, i) => 4 + 0.01 * Math.sin(i));                       // wiggles
const xlu = dates.map((_, i) => 100 * (1 - 0.02 * (y10[i] - 4) * 100 / 10) + i * 0.001);   // falls when yields rise

test('returns, relative strength vs SPY, percentiles, credit in bp', () => {
  const bundle = { dates, series: { spy: lin(100, 0.1), xlk: lin(100, 0.2), xle: lin(100, 0.0), rsp: lin(100, -0.05), dspx: lin(10, 0.01), ig: lin(1, 0.001), us10y: y10, xlu } };
  const A = summariseAssets(bundle);
  assert.equal(A.sectors[0].key, 'xlk');                                        // strongest relative first
  assert.ok(A.sectors.find(s => s.key === 'xlk').rel20 > 0 && A.sectors.find(s => s.key === 'xle').rel20 < 0);
  assert.equal(A.internals.find(x => x.key === 'dspx').pct, 100);   // the newest value is the series high
  assert.equal(A.credit[0].chg20bp, 2);
  assert.match(A.breadth.read, /narrowing/);
  const u = A.drivers.find(d => d.key === 'xlu');
  assert.ok(u.y10per10bp < 0 && u.y10r < -0.9, JSON.stringify(u));             // measured, right sign
  assert.equal(u.oilBeta, null);                                                // no oil series → no number
});

test('helpers and empty input', () => {
  assert.equal(Math.round(retN([100, null, 110], 2)), 10);
  assert.equal(pctOf([1, 2, 3]), null);                                         // too short
  assert.equal(beta([1, 2], [1, 2]), null);
  assert.equal(summariseAssets({}), null);
});
