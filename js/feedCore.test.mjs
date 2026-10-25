// Synthetic, no-network unit tests for the Feed maths.
//   node js/feedCore.test.mjs
import { weekKey, weekly, rangePos, liquidity, liquidityRead, pearson, crossAsset, commodities } from './feedCore.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const days = (n, from = '2022-01-03') => { const out = [], d = new Date(from + 'T12:00:00Z'); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; };
const weds = n => days(n * 5).filter(d => new Date(d + 'T12:00:00Z').getUTCDay() === 3);

console.log('weeks');
ok('Wednesday maps to its Friday', weekKey('2026-10-21') === '2026-10-23');
ok('Friday maps to itself', weekKey('2026-10-23') === '2026-10-23');
ok('Saturday maps to the next Friday', weekKey('2026-10-24') === '2026-10-30');
const wk = weekly(new Map([['2026-10-19', 1], ['2026-10-21', 2], ['2026-10-23', 3], ['2026-10-26', 4]]));
ok('weekly keeps the last print of the week', wk.get('2026-10-23') === 3 && wk.get('2026-10-30') === 4 && wk.size === 2);
ok('range position: low 0, high 100, middle 50', rangePos([1, 3], 1) === 0 && rangePos([1, 3], 3) === 100 && rangePos([1, 3], 2) === 50);

console.log('liquidity');
const W = weds(200);
const walcl = new Map(W.map((d, i) => [d, 7000 - i * 5])), tga = new Map(W.map((d, i) => [d, 800 + (i % 3) * 10]));
const rrp = new Map(W.map((d, i) => [d, Math.max(0, 500 - i * 3)])), reserves = new Map(W.map((d, i) => [d, 3000 + i]));
const sofr = new Map(W.map(d => [d, 4.33])), iorb = new Map(W.map(d => [d, 4.40]));
// last week: TGA drains 200 -> net liquidity jumps
tga.set(W.at(-1), 600);
const L = liquidity({ walcl, tga, rrp, reserves, sofr, iorb });
const g = k => L.rows.find(r => r.key === k);
ok('six rows', L.rows.length === 6, L.rows.map(r => r.key).join(','));
ok('net liquidity = balance sheet − TGA − RRP', Math.abs(g('net').latest - (g('walcl').latest - g('tga').latest - g('rrp').latest)) < 0.2);
ok('SOFR − IORB is −7bp', Math.abs(g('spread').latest + 7) < 0.01, String(g('spread').latest));
ok('year change on the balance sheet is −260', Math.abs(g('walcl').year + 260) < 0.01, String(g('walcl').year));
ok('a 200bn TGA drain is an unusual week for net liquidity', g('net').zWeek > 3, String(g('net').zWeek));
ok('the read names the TGA drain', /rose .* with the TGA draining/.test(L.read), L.read);
ok('read is null without a net row', liquidityRead([]) === null);

console.log('cross-asset');
ok('pearson of a line with itself is 1', Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
const D = days(600);
const common = D.map(() => gauss()), noise = () => D.map(() => gauss());
const lvl = (rets, s0 = 100) => { let v = s0; return new Map(D.map((d, i) => [d, v *= Math.exp(rets[i] * 0.01)])); };
const nA = noise(), nB = noise(), nC = noise();
// first half: S&P and gold move together; second half: opposite
const goldR = D.map((_, i) => (i < 300 ? 1 : -1) * common[i] + 0.2 * nB[i]);
const legs = [
  { key: 'spx', label: 'S&P 500', kind: 'price', map: lvl(common.map((c, i) => c + 0.2 * nA[i])) },
  { key: 'gold', label: 'Gold', kind: 'price', map: lvl(goldR) },
  { key: 'ust10', label: 'UST 10Y', kind: 'yield', map: (() => { let y = 4; return new Map(D.map((d, i) => [d, y += 0.02 * nC[i]])); })() },
  { key: 'dead', label: 'No data', kind: 'price', map: new Map() },
];
const X = crossAsset(legs, { window: 63, keepWeeks: 156 });
const pair = (a, b) => X.pairs.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
ok('three legs, three pairs, empty leg reported', X.pairs.length === 3 && X.missing.includes('dead'));
ok('S&P × gold ends strongly negative', pair('spx', 'gold').last < -0.8, String(pair('spx', 'gold').last));
ok('its series starts strongly positive', pair('spx', 'gold').series[0][1] > 0.8);
ok('independent yield leg near zero', Math.abs(pair('spx', 'ust10').last) < 0.35, String(pair('spx', 'ust10').last));
ok('a flipped pair sits at a low percentile of its own history', pair('spx', 'gold').pctl < 60, String(pair('spx', 'gold').pctl));

console.log('commodities');
const cd = days(1100);
const mk = (key, f) => ({ key, label: key, group: 'x', map: new Map(cd.map((d, i) => [d, f(i)])) });
const C = commodities([
  mk('up', i => 100 + i), mk('down', i => 1000 - i), mk('flat', () => 50), mk('wave', i => 100 + 10 * Math.sin(i / 40)),
], { window: 104, keepWeeks: 104 });
const row = k => C.rows.find(r => r.key === k);
ok('four markets plus the basket', C.rows.length === 5 && !!row('basket'));
ok('a steady riser sits at the top of its range', row('up').pos === 100 && row('up').z > 1.5, `${row('up').pos} ${row('up').z}`);
ok('a steady faller sits at the bottom', row('down').pos === 0 && row('down').z < -1.5);
ok('flat has no z and a mid position', row('flat').z === null && row('flat').pos === 50);
ok('ranked by z, highest first', C.rows[0].key === 'up' && C.rows.at(-1).key !== 'up');
ok('104 coloured cells', row('wave').cells.length === 104, String(row('wave').cells.length));
ok('cells are inside 0..100', C.rows.every(r => r.cells.every(([, v]) => v === null || (v >= 0 && v <= 100))));
ok('a riser spent half its window above its median', Math.abs(row('up').above - 50) <= 2, String(row('up').above));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
