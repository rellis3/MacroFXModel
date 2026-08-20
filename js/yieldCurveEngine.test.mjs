// Synthetic tests for yieldCurveEngine.js. No network.
//   node js/yieldCurveEngine.test.mjs
import { YIELD_CURVE_UNIVERSE, mergeSlope, yieldCurveScore } from './yieldCurveEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[mergeSlope — forward-fills the latest KNOWN short rate onto each long-yield date]');
{
  const long = [{ date: '2024-01-01', value: 4.2 }, { date: '2024-02-01', value: 4.3 }, { date: '2024-03-01', value: 4.4 }];
  const short = [{ date: '2024-01-01', value: 5.0 }];
  const merged = mergeSlope(long, short);
  ok('all 3 dates use the same (only known) short rate', merged.every(m => m.short === 5.0));
  ok('slope = long - short for each', merged[2].slope === -0.6, merged[2].slope);
}
{
  // Short rate updates partway through: March's slope should pick up the
  // NEW short rate, not stay on January's (no future-leaking either).
  const long = [{ date: '2024-01-01', value: 4.2 }, { date: '2024-02-01', value: 4.3 }, { date: '2024-03-01', value: 4.4 }];
  const short = [{ date: '2024-01-01', value: 5.0 }, { date: '2024-03-01', value: 4.5 }];
  const merged = mergeSlope(long, short);
  ok('Jan+Feb use the Jan short rate', merged[0].short === 5.0 && merged[1].short === 5.0);
  ok('Mar uses the new Mar short rate (forward-filled, not future-leaking)', merged[2].short === 4.5);
}

console.log('[yieldCurveScore — normal (upward-sloping) curve reads positive slope, not inverted]');
{
  const longObs = new Map(), shortObs = new Map();
  for (let i = 0; i < 13; i++) {
    const d = `2024-${String(i + 1).padStart(2, '0')}-01`;
    longObs.set(d, 4.5);
    shortObs.set(d, 3.8);
  }
  const r = yieldCurveScore(longObs, shortObs);
  ok('latestSlope is 0.7 (4.5 - 3.8)', r.latestSlope === 0.7, r.latestSlope);
  ok('not inverted', r.inverted === false);
}

console.log('[yieldCurveScore — inversion flips the flag and reads negative slope]');
{
  const longObs = new Map(), shortObs = new Map();
  for (let i = 0; i < 13; i++) {
    const d = `2024-${String(i + 1).padStart(2, '0')}-01`;
    longObs.set(d, 3.8);
    shortObs.set(d, 4.5);
  }
  const r = yieldCurveScore(longObs, shortObs);
  ok('latestSlope is -0.7 (inverted: short pays more than long)', r.latestSlope === -0.7, r.latestSlope);
  ok('inverted is true', r.inverted === true);
}

console.log('[yieldCurveScore — sudden steepening reads strongly positive vs own trailing history]');
{
  const longObs = new Map(), shortObs = new Map();
  for (let i = 0; i < 19; i++) {
    const d = `d${String(i).padStart(2, '0')}`;
    longObs.set(d, 4.0); shortObs.set(d, 3.9); // flat, slope 0.1
  }
  longObs.set('d19', 5.0); shortObs.set('d19', 3.9); // steepens sharply to 1.1
  const r = yieldCurveScore(longObs, shortObs);
  ok('latestSlope is the steepened value (1.1)', r.latestSlope === 1.1, r.latestSlope);
  ok('z reads strongly positive (unusual vs its own recent history)', r.z > 2, r.z);
  ok('score has no floating-point tail', r.score === +r.score.toFixed(2), r.score);
}

console.log('[yieldCurveScore — too little history]');
{
  const longObs = new Map([['d0', 4.2], ['d1', 4.3]]);
  const shortObs = new Map([['d0', 5.0]]);
  const r = yieldCurveScore(longObs, shortObs);
  ok('short series -> null score, not a crash', r.score === null);
  ok('short series -> inverted also null (early-return path)', r.inverted === null);
  ok('still reports the latest raw slope', r.latestSlope === -0.7, r.latestSlope);
}

console.log('[YIELD_CURVE_UNIVERSE sanity]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => YIELD_CURVE_UNIVERSE[c]));
  ok('USD uses GS2/GS10 (already confirmed, in production via econTrendEngine)', YIELD_CURVE_UNIVERSE.USD.short === 'GS2' && YIELD_CURVE_UNIVERSE.USD.long === 'GS10');
  ok('every non-USD currency has both a short and long series', Object.entries(YIELD_CURVE_UNIVERSE).filter(([c]) => c !== 'USD').every(([, cfg]) => cfg.short && cfg.long));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll yieldCurveEngine tests passed.');
