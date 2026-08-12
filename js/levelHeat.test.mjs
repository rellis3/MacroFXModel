// LEVEL HEAT — hot/cold tag per level from gamma-weighted exposure, + contiguous hot zones.
//   node js/levelHeat.test.mjs
import { levelHeat, hotZones } from './levelHeat.js';
let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

// gexProfile with a gamma peak at 1.15 (ATM), tapering to the wings — the shape BS gamma
// makes: near spot = high call+put gamma $, far = low.
const gp = [
  { strike: 1.13, callGex: 20, putGex: 60 },
  { strike: 1.14, callGex: 120, putGex: 300 },
  { strike: 1.15, callGex: 900, putGex: 1100 },   // peak (2000)
  { strike: 1.16, callGex: 250, putGex: 150 },
  { strike: 1.17, callGex: 40, putGex: 15 },
];
console.log('[per-level heat]');
{
  const out = levelHeat(gp, [
    { price: 1.15, type: 'max_pain' },   // at the peak → hot
    { price: 1.145, type: 'gamma_flip' },// between strikes → interpolated
    { price: 1.17, type: 'call_wall' },  // far tail → cold
  ]);
  const at = t => out.find(o => o.type === t);
  ok('level at the gamma peak is HOT (heat ≈ 1)', at('max_pain').heatBucket === 'hot' && at('max_pain').heat > 0.95, `${at('max_pain').heat}`);
  ok('far-tail wall is COLD despite being a "wall"', at('call_wall').heatBucket === 'cold', `${at('call_wall').heat}`);
  ok('between-strike level interpolates (0<heat<1)', at('gamma_flip').heat > 0 && at('gamma_flip').heat < 1, `${at('gamma_flip').heat}`);
  ok('heat ordering follows gamma exposure', at('max_pain').heat > at('gamma_flip').heat && at('gamma_flip').heat > at('call_wall').heat);
  ok('every level carries heat/bucket/gammaExposure', out.every(o => o.heat != null && o.heatBucket && o.gammaExposure != null));
}
console.log('[hot zones]');
{
  const z = hotZones(gp, { hotFrac: 0.6 });
  ok('one hot zone around the peak', z.length === 1 && z[0].peakStrike === 1.15, JSON.stringify(z));
  ok('peakHeat is 1.0 at the max', z[0].peakHeat === 1);
}
console.log('[guards]');
{
  ok('no profile → levels blanked, not dropped', levelHeat([], [{ price: 1.1, type: 'x' }]).length === 1
    && levelHeat([], [{ price: 1.1 }])[0].heat === null);
  ok('no profile → no zones', hotZones([]).length === 0);
  ok('all-zero gamma → blanked', levelHeat([{ strike: 1, callGex: 0, putGex: 0 }], [{ price: 1 }])[0].heatBucket === null);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
