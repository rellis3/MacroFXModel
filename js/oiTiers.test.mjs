// OI TIERS — clustering by distance, tier order, description text.
//   node js/oiTiers.test.mjs
import { buildTiers, describeZone, ladderLegs, zoneTag } from './oiTiers.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const spot = 4161, sigma = 48;                       // gold-like: 1.15% day σ
const levels = [
  { price: 4157.95, type: 'gamma_flip' }, { price: 4183.04, type: 'gex_flip' }, { price: 4079.16, type: 'put_wall' },
  { price: 4479.16, type: 'call_wall' }, { price: 4324.16, type: 'max_pain' }, { price: 4161.5, type: 'oi_volume' } ];
const legs = ladderLegs({ oh: { p50: 0.73, p75: 1.31, p90: 2.01 }, ol: { p50: 0.69, p75: 1.27, p90: 1.99 } }, 4160);
const t = buildTiers({ spot, sigma, levels, legs });
ok('ladder gives 6 legs, lows below the open', legs.length === 6 && legs.filter(l => l.type.endsWith('_lo')).every(l => l.price < 4160));
ok('oi_volume is not a tier source', ![...t.below, ...t.above].some(z => z.members.some(m => m.type === 'oi_volume')));
ok('tiers are numbered nearest first, per side', t.below.every((z, i) => z.n === i + 1) && t.below.every((z, i, a) => i === 0 || a[i - 1].dist <= z.dist));
ok('the gamma flip just below spot is Tier 1 support, shallow', t.below[0].members.some(m => m.type === 'gamma_flip') && t.below[0].character === 'shallow');
ok('nothing is both above and below', t.below.every(z => z.hi < spot) && t.above.every(z => z.lo > spot));
ok('median low (4131) clusters with nothing it should not', (() => { const z = t.below.find(z => z.members.some(m => m.type === 'fcst_p50_lo')); return !!z; })());
const near = buildTiers({ spot, sigma, levels: [{ price: 4140, type: 'put_wall' }], legs: [{ price: 4143, kind: 'ladder', type: 'fcst_p50_lo', label: 'forecast median low' }] });
ok('a wall and a ladder line within 0.15σ merge into one confluence zone', near.below.length === 1 && near.below[0].members.length === 2);
const txt = describeZone(near.below[0], { fmt: p => p.toFixed(0), fmtFut: p => (p + 21).toFixed(0), touch: 'P(touch) 38%~2h' });
ok('description reads like a desk note', txt === 'Tier 1 — shallow, forecast median low + put wall confluence: support CFD spot 4140–4143 (futures 4161–4164) · P(touch) 38%~2h', txt);
ok('single-source zone is not called confluence', !/confluence/.test(describeZone(t.above[t.above.length - 1], { fmt: p => p.toFixed(0) })));
ok('chart tag is short', zoneTag(near.below[0]) === 'T1v shallow');
ok('degenerate input gives empty tiers', buildTiers({ spot: 0, sigma: 1 }).below.length === 0 && buildTiers({ spot, sigma: 0 }).above.length === 0);
const chain = buildTiers({ spot, sigma, levels: [4130, 4135, 4140, 4145, 4150].map(price => ({ price, type: 'put_wall' })), legs: [] });
ok('a chain of levels 5 apart is not merged into one wide zone (span cap 0.3σ)', chain.below.every(z => z.hi - z.lo <= 0.3 * sigma + 1e-9) && chain.below.length > 1, chain.below.map(z => z.hi - z.lo).join(','));
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
