// node js/flowChain.test.mjs — the lead/lag maths behind flow-chain.html, on synthetic data.
import { changes, ffill, columnOf, corrAtLag, leadLagProfile, placeboBand, rangeIdx, mulberry32, FLOW_SERIES, FLOW_SPREADS, kindOf } from './flowChain.js';

let fail = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fail++; };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;

// changes: rates in bp, prices in log-return %
ok('rate change in bp', near(changes([4.00, 4.10, 4.25], 2, 'rate')[2], 25));
ok('price change in log %', near(changes([100, 101, 110], 2, 'price')[2], Math.log(1.1) * 100));
ok('missing end → null', changes([1, null, 3], 1, 'rate')[1] === null && changes([1, null, 3], 1, 'rate')[2] === null);

// ffill: holiday gaps filled, long gaps left empty
const f = ffill([1, null, null, 2, null, null, null, null, null, null, 3], 5);
ok('ffill fills ≤ 5', f[1] === 1 && f[2] === 1 && f[8] === 2);
ok('ffill stops after 5', f[9] === null && f[10] === 3);

// spreads from the payload
const payload = { dates: ['a', 'b'], line: { us_2y: [4, 4.2], de_2y: [3, 2.9] }, ohlc: { eurusd: { o: [1, 1], h: [1, 1], l: [1, 1], c: [1.1, 1.2] } } };
ok('spread a − b', near(columnOf(payload, 'us_de_2y')[1], 1.3, 1e-12));
ok('ohlc column is the close', columnOf(payload, 'eurusd')[1] === 1.2);
ok('every spread leg is a catalogued series', Object.values(FLOW_SPREADS).every(s => FLOW_SERIES[s.a] && FLOW_SERIES[s.b]));
ok('spread kind is rate', kindOf('us_de_2y') === 'rate' && kindOf('eurusd') === 'price');

// planted lead: follower copies the leader's daily moves 20 rows later, plus noise
const rng = mulberry32(7), T = 3000, LEAD = 20, N = 10;
const lx = [100], ly = [100];
const dx = Array.from({ length: T }, () => rng() - 0.5);
for (let t = 1; t < T; t++) { lx.push(lx[t - 1] + dx[t]); ly.push(ly[t - 1] + (t > LEAD ? dx[t - LEAD] : 0) + (rng() - 0.5) * 0.5); }
const X = changes(lx, N, 'rate'), Y = changes(ly, N, 'rate');
const prof = leadLagProfile(X, Y, { n: N, maxLag: 40 });
const best = prof.reduce((a, b) => ((b.r ?? -1) > (a.r ?? -1) ? b : a));
ok('planted 20-row lead peaks at lag 20', best.lag === LEAD, `best lag ${best.lag}, r ${best.r?.toFixed(3)}`);
ok('profile flags window overlap', prof.find(p => p.lag === 5).overlap && !prof.find(p => p.lag === 20).overlap);
const band = placeboBand(X, Y, { n: N, maxLag: 40, shifts: 30 });
const i20 = prof.findIndex(p => p.lag === LEAD), iNeg = prof.findIndex(p => p.lag === -30);
ok('lead sits far outside the chance band', prof[i20].r > band.hi[i20]);
ok('a lag with no relation sits inside the band', prof[iNeg].r >= band.lo[iNeg] - 0.02 && prof[iNeg].r <= band.hi[iNeg] + 0.02,
  `r ${prof[iNeg].r?.toFixed(3)} band [${band.lo[iNeg]?.toFixed(3)}, ${band.hi[iNeg]?.toFixed(3)}]`);
const band2 = placeboBand(X, Y, { n: N, maxLag: 40, shifts: 30 });
ok('band is seeded (same twice)', band.hi.every((v, i) => v === band2.hi[i]));
ok('search-aware level is above the one-lag band', band.searchLead > band.hi[0] && band.searchFoll > band.hi[0], `search ${band.searchLead?.toFixed(3)} vs band ${band.hi[0]?.toFixed(3)}`);
ok('planted lead beats the search-aware level', prof[i20].r > band.searchLead);

// no relation at all: profile stays near zero
const Z = changes(Array.from({ length: T }, (_, i) => i + rng()), N, 'rate');
ok('unrelated series: |r| small at every lag', leadLagProfile(Z, Y, { n: N, maxLag: 40 }).every(p => p.r == null || Math.abs(p.r) < 0.12));

// corrAtLag needs 30 pairs
ok('too few pairs → null', corrAtLag([1, 2, 3], [1, 2, 3], 0).r === null);

// rangeIdx
const D = ['2020-01-01', '2020-06-01', '2021-01-01', '2022-01-01'];
const r = rangeIdx(D, '2020-03-01', '2021-06-01');
ok('rangeIdx inclusive window', r.from === 1 && r.to === 3);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
