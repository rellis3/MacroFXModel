// Synthetic tests for tradeBalanceEngine.js. No network.
//   node js/tradeBalanceEngine.test.mjs
import { TRADE_BALANCE_UNIVERSE, toSeries, latestZScore, tradeBalanceScore } from './tradeBalanceEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[toSeries]');
{
  const m = new Map([['2024-02-01', -100], ['2024-01-01', -80]]);
  ok('sorted ascending', toSeries(m)[0].date === '2024-01-01');
}

console.log('[tradeBalanceScore — steady deficit reads neutral, not unusual]');
{
  const m = new Map();
  for (let i = 0; i < 20; i++) m.set(`m${String(i).padStart(2, '0')}`, -70000);
  const r = tradeBalanceScore(m);
  ok('latestValue is -70000', r.latestValue === -70000);
  ok('flat/steady level -> z near 0 (nothing unusual vs its own history)', Math.abs(r.z) < 0.5, r.z);
  ok('surplus is false (raw sign)', r.surplus === false);
}

console.log('[tradeBalanceScore — sudden widening surplus reads strongly positive, no %-change blowup]');
{
  // 19 months flat near a small deficit, then a jump to a large surplus —
  // exactly the "crosses zero" case that would break a naive %-change calc.
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`m${String(i).padStart(2, '0')}`, -50);
  m.set('m19', 4000);
  const r = tradeBalanceScore(m);
  ok('latestValue is the jump (4000)', r.latestValue === 4000);
  ok('surplus is true', r.surplus === true);
  ok('z reads strongly positive (unusual vs its own recent history)', r.z > 2, r.z);
  ok('score saturates toward +1, not NaN/Infinity from a %-change blowup', r.score > 0.8, r.score);
}

console.log('[tradeBalanceScore — surplus flag reads the raw sign directly]');
{
  const m = new Map();
  for (let i = 0; i < 10; i++) m.set(`m${i}`, 20000 + i * 5);
  const r = tradeBalanceScore(m);
  ok('surplus is true for a positive level', r.surplus === true);
}

console.log('[tradeBalanceScore — too little history]');
{
  const m = new Map([['m0', -100], ['m1', -120]]);
  const r = tradeBalanceScore(m);
  ok('short series -> null score, not a crash', r.score === null);
  ok('short series -> surplus also null (early-return path, before the raw sign is ever read)', r.surplus === null);
  ok('still reports the latest raw value', r.latestValue === -120);
}

console.log('[tradeBalanceScore — rounds long floating-point tails]');
{
  const m = new Map();
  for (let i = 0; i < 8; i++) m.set(`m${String(i).padStart(2, '0')}`, -100);
  m.set('m08', -764.720600000001);
  const r = tradeBalanceScore(m);
  ok('latestValue rounds to 2dp', r.latestValue === -764.72, r.latestValue);
}

console.log('[tradeBalanceScore — score field itself is rounded, not just latestValue]');
{
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`m${String(i).padStart(2, '0')}`, i % 2 === 0 ? 1.05 : 0.95);
  m.set('m19', 1.03);
  const r = tradeBalanceScore(m);
  ok('score has no floating-point tail', r.score === +r.score.toFixed(2), r.score);
}

console.log('[TRADE_BALANCE_UNIVERSE sanity]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => TRADE_BALANCE_UNIVERSE[c]));
  ok('USD uses the goods+services balance of payments series', TRADE_BALANCE_UNIVERSE.USD === 'BOPGSTB');
  ok('all 7 non-USD entries use the uniform XTNTVA01 M667S (USD-converted) family', Object.entries(TRADE_BALANCE_UNIVERSE).filter(([c]) => c !== 'USD').every(([, s]) => /^XTNTVA01[A-Z]{2}M667S$/.test(s)));
  ok('AUD/CAD/NZD (commodity currencies) have confirmed monthly coverage', ['AUD', 'CAD', 'NZD'].every(c => /M667S$/.test(TRADE_BALANCE_UNIVERSE[c])));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll tradeBalanceEngine tests passed.');
