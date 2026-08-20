// Synthetic tests for consumerConfidenceEngine.js. No network.
//   node js/consumerConfidenceEngine.test.mjs
import { CONFIDENCE_UNIVERSE, toSeries, latestZScore, confidenceScore, consumerConfidenceCompositeScore } from './consumerConfidenceEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[toSeries]');
{
  const m = new Map([['2024-02-01', 101], ['2024-01-01', 100]]);
  ok('sorted ascending', toSeries(m)[0].date === '2024-01-01');
}

console.log('[confidenceScore — flat-then-drop reads strongly negative vs own trailing history]');
{
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`d${String(i).padStart(2, '0')}`, 95);
  m.set('d19', 70);
  const r = confidenceScore(m);
  ok('latestValue is the drop print', r.latestValue === 70, r.latestValue);
  ok('z reads strongly negative (unusual vs its own recent history)', r.z < -2, r.z);
  ok('score has no floating-point tail', r.score === +r.score.toFixed(2), r.score);
}

console.log('[confidenceScore — short history -> null score, not a crash]');
{
  const m = new Map([['d0', 90], ['d1', 92]]);
  const r = confidenceScore(m);
  ok('short history -> null score', r.score === null);
  ok('short history -> null z', r.z === null);
  ok('still reports the latest raw value', r.latestValue === 92, r.latestValue);
}

console.log('[confidenceScore — quarterly lookback still produces a score with enough points]');
{
  const m = new Map();
  for (let i = 0; i < 15; i++) m.set(`d${String(i).padStart(2, '0')}`, 10 + i * 0.1);
  const monthly = confidenceScore(m, false);
  const quarterly = confidenceScore(m, true);
  ok('both produce a score', monthly.score != null && quarterly.score != null);
}

console.log('[confidenceScore — percentage-balance style series (negative-to-positive range) scores the same way]');
{
  const m = new Map();
  for (let i = 0; i < 19; i++) m.set(`d${String(i).padStart(2, '0')}`, -5);
  m.set('d19', 8);
  const r = confidenceScore(m);
  ok('latestValue is the upswing print', r.latestValue === 8, r.latestValue);
  ok('z reads strongly positive (unusual vs its own recent history)', r.z > 2, r.z);
}

console.log('[consumerConfidenceCompositeScore — single dimension IS the composite]');
{
  const m = new Map();
  for (let i = 0; i < 15; i++) m.set(`d${String(i).padStart(2, '0')}`, 10 + i);
  const r = consumerConfidenceCompositeScore('GBP', m);
  ok('coverage lists only confidence', r.coverage.length === 1 && r.coverage[0] === 'confidence');
  ok('confidence equals the score directly', r.confidence === r.score);
}
{
  const r = consumerConfidenceCompositeScore('USD', null);
  ok('null input -> no coverage, confidence null, not a crash', r.coverage.length === 0 && r.confidence === null);
}

console.log('[CONFIDENCE_UNIVERSE sanity]');
{
  ok('covers 7 currencies (CAD deliberately excluded — confirmed discontinued at source)', Object.keys(CONFIDENCE_UNIVERSE).length === 7 && !CONFIDENCE_UNIVERSE.CAD);
  ok('USD uses UMCSENT (Michigan, not Conference Board — that one is not on FRED)', CONFIDENCE_UNIVERSE.USD === 'UMCSENT');
  ok('EUR uses Germany, consistent with this codebase\'s EUR-via-Germany convention', CONFIDENCE_UNIVERSE.EUR === 'CSCICP02DEM460S');
  ok('every non-USD series uses the CSCICP02 OECD family', Object.entries(CONFIDENCE_UNIVERSE).filter(([c]) => c !== 'USD').every(([, id]) => id.startsWith('CSCICP02') || id.startsWith('NZLCSCICP02')));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll consumerConfidenceEngine tests passed.');
