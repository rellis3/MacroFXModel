// OI PROFILE — strongest-DTE book, reaction levels, bars, smile (real points only), text format.
//   node js/oiProfile.test.mjs
import { buildOiProfile, buildProfileText, shiftProfilePrices, chunkText } from './oiProfile.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const strikes = [];
for (let k = 90; k <= 110; k += 1) strikes.push(k);
const shape = (peakAt, w, big) => strikes.map(k => Math.round(big * Math.exp(-(((k - peakAt) / w) ** 2))));
const legs = [
  { dte: 1, strikes, calls: shape(103, 1.5, 4000), puts: shape(97, 1.5, 3000), sigma: 0.2 },      // tall near-expiry spikes either side
  { dte: 30, strikes, calls: shape(106, 3, 600), puts: shape(94, 3, 500), sigma: 0.2 },
];
const inst = {
  spot: 100, refMove: { move: 2 }, maxPain: 100.5, gexFlip: 101.2, gammaFlip: 100.8,
  greeksFlow: { vannaFlip: 99.1, charmFlip: 100.2 }, expectedMove: { upper: 103.2, lower: 96.8, pct: 1.3, dte: 0.6 },
  volumeMagnets: [{ strike: 98, volume: 500 }, { strike: 102, volume: 200 }],
  volCP: [[98, 100, 400], [102, 150, 50], [150, 9, 9]],
  ivSmile: { strikes: [97, 98, 99, 100], iv: [0.22, 0.2, 0.19, 0.18] },
  ivDynamics: { atmIV: 18.1 }, riskReversal: { rr: 1.5, tilt: 'downside' },
};
const hedge = { zeroGamma: [{ price: 101.7 }], atSpot: { regime: 'short', hedgeUp1pct: 520, hedgeDown1pct: -780 }, grid: [95, 100, 105],
  curves: [-2, 0, 2, 4].map(dv => ({ dv, gamma: [-3, -1, 2], hedge: [-5, 0, 6] })) };
const p0 = buildOiProfile(inst, { legs, mult: 1, flat: 0.2, hedge });
const topCall = p0.levels.filter(l => l.type === 'call_wall')[0].price;
const p = buildOiProfile(inst, { legs, mult: 1, flat: 0.2, hedge, reach: pr => (pr === topCall ? { p: 0.46, eta: 45 } : null) });
ok('builds', !!p && p.levels.length > 4);
ok('the near-expiry bucket carries the gamma → strongest book is 0–1 DTE', p.book.id === 'd0_1', `${p.book.id} ${p.book.share}%`);
const by = t => p.levels.filter(l => l.type === t);
ok('call walls sit above spot, put walls below', by('call_wall').every(l => l.price > 100) && by('put_wall').every(l => l.price < 100) && by('call_wall').length >= 1 && by('put_wall').length >= 1);
ok('the top call wall is the max-GAMMA strike (nearer spot than the 103 OI peak: 1-DTE gamma at 3% out is tiny)', by('call_wall').some(l => l.strength === 1) && by('call_wall').every(l => l.price <= 103), by('call_wall').map(l => l.price + ':' + l.strength.toFixed(2)).join(','));
ok('zero gamma comes from the hedging map', by('zero_gamma')[0]?.price === 101.7);
ok('levels sorted high → low', p.levels.every((l, i, a) => i === 0 || a[i - 1].price >= l.price));
ok('touch odds attach where supplied, blank elsewhere', p.levels.find(l => l.price === topCall).touchPct === 46 && p.levels.find(l => l.price === topCall).etaMin === 45 && by('put_wall')[0].touchPct === null);
ok('every level carries a label and an expectation word', p.levels.every(l => l.label && typeof l.expect === 'string'));
ok('regime from the hedging map: short gamma = BREAKOUT', p.regime === 'BREAKOUT');
ok('gamma bars binned inside the window', p.gex.length > 3 && p.gex.every(r => Math.abs(r.price - 100) <= 3.2 * 2 + 1e-9));
ok('volume outside the window is dropped (150 is far)', !p.volume.some(r => r.price > 110));
ok('smile keeps ONLY the stored points (nothing invented)', p.smile.length === 4 && p.smile[0].iv === 22);
ok('helix carries 4 gamma strands + hedge per row', p.helix.length >= 2 && p.helix[0].g.length === 4);
const t = buildProfileText(p, { name: 'NQ', generated: 'test', digits: 2 });
const rows = t.split('\n');
ok('title and instrument header lines', rows[0].startsWith('──── OI PROFILE') && rows[3] === 'NQ', rows[3]);
ok('M line carries spot, regime, zero gamma', /^M\|spot\|100\.00\|regime\|BREAKOUT/.test(rows.find(r => r.startsWith('M|'))) && /zg\|101\.70/.test(rows.find(r => r.startsWith('M|'))));
ok('level lines have 9 pipe fields; the last is the OI change in % of the OI at that strike, or - when there is no change data', rows.filter(r => r.startsWith('L|')).every(r => { const q = r.split('|'); return q.length === 9 && /^(-?\d+|-)$/.test(q[8]); }));
ok('every data line is pipe-delimited with a known tag', rows.filter(r => /^[A-Z]\d?\|/.test(r)).every(r => 'MHLGVOSX'.includes(r[0])));
ok('no exponent notation anywhere (Pine tonumber-safe)', !rows.some(r => /\d[eE][+-]?\d/.test(r) && /^[MHLGVOSX]\d?\|/.test(r)));
ok('no empty fields between pipes (Pine split-safe)', rows.filter(r => /^[MHLGVOSX]\d?\|/.test(r)).every(r => !/\|\|/.test(r) && !/\|$/.test(r)), rows.find(r => /^[MHLGVOSX]\d?\|/.test(r) && (/\|\|/.test(r) || /\|$/.test(r))));
ok('bar series are scaled to ±1000', Math.max(...rows.filter(r => r.startsWith('G|')).map(r => Math.abs(+r.split('|')[2]))) <= 1000.05);
ok('no prose lines in the paste (only title, Generated, name and data lines)', rows.filter(r => r && !/^[MHLGVOSX]\d?\|/.test(r)).length === 3, rows.filter(r => r && !/^[MHLGVOSX]\d?\|/.test(r)).join(' / '));
ok('degenerate input is null', buildOiProfile({ spot: 0 }, { legs: [] }) === null && buildProfileText(null) === '');
const fut = shiftProfilePrices(p, v => v + 170);
ok('futures terms: every price shifts by the basis, magnitudes and distances do not', fut.spot === p.spot + 170 && fut.levels.every((l, i) => l.price === p.levels[i].price + 170 && l.strength === p.levels[i].strength) && fut.gex[0].net === p.gex[0].net && fut.refMove === p.refMove && fut.binWidth === p.binWidth && fut.zeroGamma === p.zeroGamma + 170);
ok('futures terms are stamped on the M line (the indicator shows it)', /\|terms\|futures/.test(buildProfileText(fut, { name: 'NQ', generated: 't' })) && /\|terms\|spot/.test(buildProfileText(p, { name: 'NQ', generated: 't' })));
const big = Array.from({ length: 900 }, (_, i) => `G|${29000 + i}.5|${i}`).join(String.fromCharCode(10));
const parts = chunkText(big, 3900);
ok('chunkText: every part fits the 4,096-character Pine string limit', parts.length > 1 && parts.every(x => x.length <= 3900));
ok('chunkText: parts rejoin to the original, split only on line boundaries', parts.join(String.fromCharCode(10)) === big);
ok('integers only in the bar series (compact)', rows.filter(r => /^[GVO]\|/.test(r)).every(r => /^[GVO]\|[\d.]+\|-?\d+$/.test(r)), rows.find(r => /^[GVO]\|/.test(r) && !/^[GVO]\|[\d.]+\|-?\d+$/.test(r)));
// a put-heavy strike ABOVE spot is not a wall (put walls look below spot, call walls rank call gamma), but its net gamma is large: it becomes a short-gamma node
{
  const ks = []; for (let k = 90; k <= 110; k += 1) ks.push(k);
  const calls = ks.map(k => (k === 101 ? 4000 : k === 104 ? 3000 : k === 108 ? 2500 : 0));
  const puts = ks.map(k => (k === 95 ? 3500 : k === 102 ? 2600 : 0));
  const pn = buildOiProfile({ spot: 100, refMove: { move: 2 } }, { legs: [{ dte: 4, strikes: ks, calls, puts, sigma: 0.2 }], mult: 1, flat: 0.2 });
  const nodes = pn.levels.filter(l => l.type === 'short_gamma_node');
  ok('a put-heavy strike above spot becomes a SHORT-GAMMA NODE, not a wall', nodes.some(l => Math.abs(l.price - 102) < 0.6), JSON.stringify(pn.levels.map(l => l.label + '@' + l.price)));
  ok('nodes are skipped where a wall or the peak already sits', pn.levels.every(l => !(l.type.endsWith('gamma_node') && pn.levels.some(w => (w.type === 'call_wall' || w.type === 'put_wall' || w.type === 'gamma_peak') && Math.abs(w.price - l.price) < 0.25))));
  ok('the node survives into the paste text', buildProfileText(pn, { name: 'X', digits: 2 }).includes('|short_gamma_node|'));
}
// the call/put volume split (volCP) can be dropped by a re-analyse; the VOLUME column must fall back to the per-strike totals in rawVol, not go empty
{
  const T = String.fromCharCode(9), N = String.fromCharCode(10);
  const noSplit = { ...inst, volCP: null, rawVol: ['98' + T + '500', '102' + T + '200', '99' + T + '100'].join(N) };
  const pv = buildOiProfile(noSplit, { legs, mult: 1, flat: 0.2, hedge });
  ok('volume bars fall back to rawVol when volCP is missing', pv.volume.length >= 2 && pv.volume.some(r => Math.abs(r.price - 98) < 1.5), JSON.stringify(pv.volume));
  const none = buildOiProfile({ ...inst, volCP: null, rawVol: '' }, { legs, mult: 1, flat: 0.2, hedge });
  ok('no volume data at all: the column is simply empty, nothing invented', none.volume.length === 0);
}
// OI change column: empty and absent from the paste without change data; shifted with the other columns
{
  const pc = buildOiProfile(inst, { legs, mult: 1, flat: 0.2, hedge });
  ok('no change data: oiChg is an empty array and the paste has no C lines', Array.isArray(pc.oiChg) && pc.oiChg.length === 0 && !buildProfileText(pc, { name: 'X', digits: 2 }).split(String.fromCharCode(10)).some(l => l.startsWith('C|')));
  const withChg = { ...pc, oiChg: [{ price: 99, v: 40 }, { price: 101, v: -60 }] };
  const lines = buildProfileText(withChg, { name: 'X', digits: 2 }).split(String.fromCharCode(10)).filter(l => l.startsWith('C|'));
  ok('change rows are signed, scaled to +-1000 and written as C lines', lines.length === 2 && lines.includes('C|101.00|-1000') && lines.includes('C|99.00|667'), lines.join(' '));
  ok('shifting prices moves the change rows too', shiftProfilePrices(withChg, v => v + 10).oiChg[0].price === 109);
}
// ALL BOOKS: every expiry bucket's walls are listed; the normal build is untouched
{
  const base = buildOiProfile(inst, { legs, mult: 1, flat: 0.2, hedge });
  const all = buildOiProfile(inst, { legs, mult: 1, flat: 0.2, hedge, allBooks: true });
  ok('allBooks off: no extra lines and no tags (the normal paste is unchanged)', base.levels.every(l => !l.tags && !l.hidden) && base.levels.length === p0.levels.length);
  const hid = all.levels.filter(l => l.hidden);
  ok('allBooks adds lines from the other bucket, each faint (strength <= 1) and tagged with its book', hid.length >= 1 && hid.every(l => l.strength > 0 && l.strength <= 1 && /^[0-9]/.test(l.tags[0]) && l.label.includes(' · ')), JSON.stringify(hid.map(l => l.label + '@' + l.price.toFixed(1) + ':' + l.strength.toFixed(2))));
  ok('allBooks keeps every line the normal build drew, at the same price and strength', base.levels.every(b => all.levels.some(a => a.type === b.type && Math.abs(a.price - b.price) < 1e-9 && a.strength === b.strength)));
  ok('allBooks lines stay sorted high to low and survive into the paste text', all.levels.every((l, i, a) => i === 0 || a[i - 1].price >= l.price) && buildProfileText(all, { name: 'X', digits: 2 }).split(String.fromCharCode(10)).filter(r => r.startsWith('L|')).length === all.levels.length);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
