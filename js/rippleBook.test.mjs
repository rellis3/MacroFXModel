// RIPPLE BOOK — per-strike gamma split by DTE bucket, built on gexLadder/fullBookGex (same maths).
//   node js/rippleBook.test.mjs
import { rippleBook } from './rippleBook.js';
import { fullBookGex } from './fullBookGex.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const strikes = [95, 98, 100, 102, 105];
const legs = [
  { dte: 1,  strikes, calls: [0, 0, 500, 3000, 800], puts: [800, 3000, 500, 0, 0], sigma: 0.2 },
  { dte: 30, strikes, calls: [0, 0, 2000, 4000, 6000], puts: [6000, 4000, 2000, 0, 0], sigma: 0.2 },
  { dte: 90, strikes, calls: [0, 0, 100, 100, 9000], puts: [9000, 100, 100, 0, 0], sigma: 0.2 },
];
const r = rippleBook(legs, 100, { mult: 1 });
ok('builds', !!r && r.rows.length === 5);
ok('null on no legs', rippleBook([], 100) === null);
const fb = fullBookGex(legs, 100, { mult: 1 });
const sumNet = r.rows.reduce((a, x) => a + x.net, 0);
ok('strike nets sum to the fullBookGex total (same maths)', Math.abs(sumNet - fb.gex) / Math.abs(fb.gex) < 1e-3, `${sumNet.toFixed(1)} vs ${fb.gex}`);
ok('bucket nets sum to the strike net', r.rows.every(x => Math.abs(Object.values(x.byBucket).reduce((a, b) => a + b, 0) - x.net) < 1e-3 * (1 + Math.abs(x.net))));
ok('shares sum to ~1', r.rows.every(x => { const s = Object.values(x.share).reduce((a, b) => a + b, 0); return s === 0 || Math.abs(s - 1) < 0.01; }));
ok('at-the-money strike is driven by the 0–1 DTE spike', r.rows.find(x => x.strike === 100).driver === 'd0_1', r.rows.find(x => x.strike === 100).driver);
ok('far OTM strike is driven by later expiries, not the 1-DTE', ['d8_45', 'd46p'].includes(r.rows.find(x => x.strike === 105).driver));
ok('call wall above spot, put wall below', r.walls.call.strike > 100 && r.walls.put.strike < 100);
ok('top nodes sorted by |net|', r.nodes.every((x, i, a) => i === 0 || Math.abs(a[i - 1].net) >= Math.abs(x.net)));
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
