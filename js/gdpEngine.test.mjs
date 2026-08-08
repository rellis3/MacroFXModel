// Synthetic tests for gdpEngine.js. No network.
//   node js/gdpEngine.test.mjs
import { GDP_UNIVERSE, toSeries, latestZScore, gdpScore } from './gdpEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[toSeries]');
{
  const m = new Map([['2024-01-01', 0.5], ['2023-10-01', 0.3]]);
  ok('sorted ascending', toSeries(m)[0].date === '2023-10-01');
}

console.log('[gdpScore — steady growth reads neutral-to-positive, not accelerating]');
{
  // 20 quarters of a steady, unremarkable 0.4% QoQ print.
  const m = new Map();
  for (let i = 0; i < 20; i++) m.set(`q${String(i).padStart(2, '0')}`, 0.4);
  const r = gdpScore(m);
  ok('latestGrowth is 0.4', r.latestGrowth === 0.4);
  ok('flat/steady print -> z near 0 (nothing unusual vs its own history)', Math.abs(r.z) < 0.5, r.z);
  ok('no recession flag on positive growth', r.recessionFlag === false);
}

console.log('[gdpScore — acceleration reads positive]');
{
  // 19 quarters flat at 0.3%, then a clear step-up to 1.2%.
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`q${String(i).padStart(2, '0')}`, 0.3);
  m.set('q19', 1.2);
  const r = gdpScore(m);
  ok('latest print is the step-up (1.2)', r.latestGrowth === 1.2);
  ok('z is strongly positive (unusual acceleration vs recent history)', r.z > 2, r.z);
  ok('score saturates toward +1', r.score > 0.8, r.score);
}

console.log('[gdpScore — two consecutive negative quarters flags technical recession]');
{
  const m = new Map();
  for (let i = 0; i < 18; i++) m.set(`q${String(i).padStart(2, '0')}`, 0.3);
  m.set('q18', -0.2);
  m.set('q19', -0.4);
  const r = gdpScore(m);
  ok('recessionFlag is true', r.recessionFlag === true);
  ok('z reads negative (contraction vs recent growth norm)', r.z < 0, r.z);
}
{
  // One negative quarter alone is NOT a technical recession.
  const m = new Map();
  for (let i = 0; i < 18; i++) m.set(`q${String(i).padStart(2, '0')}`, 0.3);
  m.set('q18', 0.5);
  m.set('q19', -0.2);
  const r = gdpScore(m);
  ok('single negative quarter -> recessionFlag stays false', r.recessionFlag === false);
}

console.log('[gdpScore — too little history]');
{
  const m = new Map([['q0', 0.4], ['q1', 0.3]]);
  const r = gdpScore(m);
  ok('short series -> null score, not a crash', r.score === null && r.recessionFlag === false);
  ok('still reports the latest raw value', r.latestGrowth === 0.3);
}

console.log('[gdpScore — rounds long floating-point tails (live report: 0.518254492928838%)]');
{
  const m = new Map();
  for (let i = 0; i < 8; i++) m.set(`q${String(i).padStart(2, '0')}`, 0.3);
  m.set('q08', 0.518254492928838);
  const r = gdpScore(m);
  ok('latestGrowth rounds to 2dp', r.latestGrowth === 0.52, r.latestGrowth);
}

console.log('[GDP_UNIVERSE sanity]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => GDP_UNIVERSE[c]));
  ok('every series uses the same OECD Q657S family (genuinely comparable across currencies)', Object.values(GDP_UNIVERSE).every(s => /^NAEXKP01[A-Z]{2}Q657S$/.test(s)));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll gdpEngine tests passed.');
