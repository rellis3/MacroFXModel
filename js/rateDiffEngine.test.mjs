// Synthetic tests for rateDiffEngine.js. No network.
//   node js/rateDiffEngine.test.mjs
import { RATE_DIFF_UNIVERSE, rateDiffScore } from './rateDiffEngine.js';
import { YIELD_CURVE_UNIVERSE } from './yieldCurveEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[RATE_DIFF_UNIVERSE — reuses YIELD_CURVE_UNIVERSE\'s short leg, single source of truth]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => RATE_DIFF_UNIVERSE[c]));
  ok('USD uses GS2 (same short-end proxy macro.js\'s us2y uses)', RATE_DIFF_UNIVERSE.USD === 'GS2');
  ok('every entry matches YIELD_CURVE_UNIVERSE\'s .short (no drifting duplicate copy)',
    Object.entries(RATE_DIFF_UNIVERSE).every(([ccy, id]) => id === YIELD_CURVE_UNIVERSE[ccy].short));
}

console.log('[rateDiffScore — flat rate reads z=0, no crash]');
{
  const obs = new Map();
  for (let i = 0; i < 13; i++) obs.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 4.5);
  const r = rateDiffScore(obs);
  ok('latestRate is 4.5', r.latestRate === 4.5, r.latestRate);
  ok('z is 0 (perfectly flat vs own history)', r.z === 0, r.z);
}

console.log('[rateDiffScore — sharp hike reads strongly positive vs own trailing history (widening in this ccy\'s favor)]');
{
  const obs = new Map();
  for (let i = 0; i < 19; i++) obs.set(`d${String(i).padStart(2, '0')}`, 1.0);   // flat at 1.0%
  obs.set('d19', 2.5);   // sudden hike
  const r = rateDiffScore(obs);
  ok('latestRate is the hiked value (2.5)', r.latestRate === 2.5, r.latestRate);
  ok('z reads strongly positive (unusual vs its own recent history)', r.z > 2, r.z);
  ok('score is clipped into [-1, 1]', r.score <= 1 && r.score >= -1, r.score);
}

console.log('[rateDiffScore — a cut reads negative (narrowing in this ccy\'s favor / differential shrinking)]');
{
  const obs = new Map();
  for (let i = 0; i < 19; i++) obs.set(`d${String(i).padStart(2, '0')}`, 5.0);   // flat at 5.0%
  obs.set('d19', 3.0);   // sudden cut
  const r = rateDiffScore(obs);
  ok('latestRate is the cut value (3.0)', r.latestRate === 3.0, r.latestRate);
  ok('z reads strongly negative', r.z < -2, r.z);
  ok('score reads negative', r.score < 0, r.score);
}

console.log('[rateDiffScore — too little history]');
{
  const obs = new Map([['d0', 4.2], ['d1', 4.3]]);
  const r = rateDiffScore(obs);
  ok('score is null, not a crash', r.score === null);
  ok('z is null', r.z === null);
  ok('still reports the latest raw rate', r.latestRate === 4.3, r.latestRate);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll rateDiffEngine tests passed.');
