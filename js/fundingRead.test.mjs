import assert from 'node:assert/strict';
import { pctile, valueDaysAgo, diffSeries, buildFundingRead, fundingLine, ord, toPoints } from './fundingRead.js';

assert.equal(pctile([1, 2, 3, 4], 3), 75);
assert.equal(pctile([], 1), null);
assert.equal(ord(1), '1st'); assert.equal(ord(73), '73rd'); assert.equal(ord(11), '11th'); assert.equal(ord(22), '22nd');
const pts = [{ date: '2026-09-01', value: 1 }, { date: '2026-09-20', value: 2 }, { date: '2026-10-14', value: 3 }];
assert.deepEqual(valueDaysAgo(pts, 28), { date: '2026-09-01', value: 1 });          // latest on or before 2026-09-16
assert.deepEqual(diffSeries([{ date: 'a', value: 3.9 }, { date: 'b', value: 4 }], [{ date: 'a', value: 3.85 }], 100).map(p => Math.round(p.value)), [5]);
assert.deepEqual(toPoints(new Map([['2026-01-02', 2], ['2026-01-01', 1]])).map(p => p.value), [1, 2]);

const wk = (n, f) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2020, 0, 1) + i * 7 * 86400e3).toISOString().slice(0, 10), value: f(i) }));
const read = buildFundingRead({
  swaplines: wk(200, i => (i === 199 ? 12 : 0.1)),                 // a draw: stress
  sofr: wk(200, () => 4.0), iorb: wk(200, () => 3.9),               // +10bp: tight
  rrp: wk(200, i => (i > 190 ? 10 : 500)),                          // buffer gone
  reserves: wk(200, i => 3000 + i),
  ustLev: wk(200, i => -100 - i * 3),                               // short growing to a record
  custodyUst: wk(200, i => 3000 - (i > 195 ? 60 : 0)),              // selling
});
const st = Object.fromEntries(read.items.map(i => [i.id, i.state]));
assert.equal(st.swaplines, 'stress');
assert.equal(st.sofrIorb, 'tight');
assert.equal(st.rrp, 'buffer gone');
assert.equal(st.basisTrade, 'record short');
assert.equal(st.custodyUst, 'selling');
assert.ok(read.flags.includes('swaplines') && read.flags.includes('basisTrade'));
assert.match(fundingLine(read), /^Funding & leverage: swap lines \$12\.0bn \(stress\).*Context, untested as a forecast\.$/);
assert.equal(fundingLine({ items: [] }), null);
console.log('fundingRead: all passed');
