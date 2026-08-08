// Synthetic tests for ismEngine.js. No network.
//   node js/ismEngine.test.mjs
import { ISM_UNIVERSE, toSeries, yoyPct, industrialProductionScore, diffusionIndexScore, businessConfidenceScore, ismScore } from './ismEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[toSeries / yoyPct]');
{
  const m = new Map([['2024-02-01', 101], ['2024-01-01', 100]]);
  ok('sorted ascending', toSeries(m)[0].date === '2024-01-01');
}

console.log('[industrialProductionScore — index level -> YoY -> z vs own history]');
{
  const m = new Map();
  for (let i = 0; i < 13; i++) m.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 100 * (1 + (0.03 / 12) * i));
  const r = industrialProductionScore(m);
  ok('latestYoy is ~3%', Math.abs(r.latestYoy - 3) < 0.2, r.latestYoy);
}

console.log('[diffusionIndexScore — Philly Fed / Empire State style, already zero-centered]');
{
  // 20 flat-ish months around +5, then a clear step DOWN into contraction.
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`d${String(i).padStart(2, '0')}`, 5);
  m.set('d19', -12);
  const r = diffusionIndexScore(m);
  ok('latestValue is the contraction print', r.latestValue === -12);
  ok('expanding flag is false (raw sign)', r.expanding === false);
  ok('z reads strongly negative (unusual vs its own recent history)', r.z < -2, r.z);
}
{
  const m = new Map([['d0', 3], ['d1', 4]]);
  const r = diffusionIndexScore(m);
  ok('short history -> null score, not a crash', r.score === null);
  ok('short history -> expanding also null (early-return path, before the raw sign is ever read)', r.expanding === null);
}

console.log('[businessConfidenceScore — same treatment, quarterly lookback for quarterly currencies]');
{
  const m = new Map();
  for (let i = 0; i < 15; i++) m.set(`d${String(i).padStart(2, '0')}`, 10 + i * 0.1);
  const monthly = businessConfidenceScore(m, false);
  const quarterly = businessConfidenceScore(m, true);
  ok('both produce a score (enough points for either lookback)', monthly.score != null && quarterly.score != null);
}

console.log('[ismScore — USD composite averages 3 dims]');
{
  const industrialProduction = new Map();
  for (let i = 0; i < 13; i++) industrialProduction.set(`2024-${String(i + 1).padStart(2, '0')}-01`, 100 * (1 + (0.02 / 12) * i));
  const philFed = new Map();
  for (let i = 0; i < 20; i++) philFed.set(`p${String(i).padStart(2, '0')}`, i === 19 ? 15 : 3);
  const empireState = new Map();
  for (let i = 0; i < 20; i++) empireState.set(`e${String(i).padStart(2, '0')}`, 2);
  const r = ismScore('USD', { industrialProduction, philFed, empireState });
  ok('coverage lists all three USD dims', ['industrialProduction', 'philFed', 'empireState'].every(k => r.coverage.includes(k)));
  ok('activity composite is a number', typeof r.activity === 'number', r.activity);
}
{
  const r = ismScore('USD', {});
  ok('empty USD input -> no dims, activity null, not a crash', r.coverage.length === 0 && r.activity === null);
}

console.log('[ismScore — non-USD composite IS the single businessConfidence score]');
{
  const m = new Map();
  for (let i = 0; i < 15; i++) m.set(`d${String(i).padStart(2, '0')}`, 10 + i);
  const r = ismScore('GBP', { businessConfidence: m });
  ok('coverage lists only businessConfidence', r.coverage.length === 1 && r.coverage[0] === 'businessConfidence');
  ok('activity equals the businessConfidence score directly', r.activity === r.dims.businessConfidence.score);
}

console.log('[diffusionIndexScore — rounds long floating-point tails]');
{
  const m = new Map();
  for (let i = 0; i < 8; i++) m.set(`d${String(i).padStart(2, '0')}`, 3);
  m.set('d08', -12.847362991);
  const r = diffusionIndexScore(m);
  ok('latestValue rounds to 2dp', r.latestValue === -12.85, r.latestValue);
}

console.log('[diffusionIndexScore — score field itself is rounded, not just latestValue]');
{
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`d${String(i).padStart(2, '0')}`, i % 2 === 0 ? 1.05 : 0.95);
  m.set('d19', 1.03);
  const r = diffusionIndexScore(m);
  ok('score has no floating-point tail', r.score === +r.score.toFixed(2), r.score);
}

console.log('[ISM_UNIVERSE sanity]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => ISM_UNIVERSE[c]));
  ok('USD has 3 real proxy series, NOT an ISM series (confirmed unavailable on FRED)', Object.keys(ISM_UNIVERSE.USD).length === 3 && !Object.values(ISM_UNIVERSE.USD).some(s => /ISM|NAPM/i.test(s)));
  ok('every non-USD currency has exactly one businessConfidence series', Object.entries(ISM_UNIVERSE).filter(([c]) => c !== 'USD').every(([, cfg]) => Object.keys(cfg).length === 1 && cfg.businessConfidence));
  ok('JPY and CAD use the confirmed country-prefixed naming (not the standard suffix template)', ISM_UNIVERSE.JPY.businessConfidence.startsWith('JPN') && ISM_UNIVERSE.CAD.businessConfidence.startsWith('CAN'));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll ismEngine tests passed.');
