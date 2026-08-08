// Synthetic tests for macroScorecardEngine.js. No network.
//   node js/macroScorecardEngine.test.mjs
import { CCYS, scorecardForCcy, buildScorecard, topBottomPair } from './macroScorecardEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[scorecardForCcy — averages available dims, skips null/missing]');
{
  const r = scorecardForCcy('USD', { cpi: 0.4, gdp: 0.2, ism: null, laborMarket: 0.6 });
  ok('composite averages only the 3 non-null dims', Math.abs(r.composite - 0.4) < 0.001, r.composite);
  ok('coverage lists only the covered dims', r.coverage.length === 3 && !r.coverage.includes('ism'));
}
{
  const r = scorecardForCcy('CHF', {});
  ok('no dims -> composite null, not 0 (missing data != neutral)', r.composite === null);
}

console.log('[buildScorecard — ranks descending, separates uncovered]');
{
  const byCcy = {
    USD: { cpi: 0.5, gdp: 0.5 },
    EUR: { cpi: -0.3, gdp: -0.1 },
    JPY: { cpi: 0.1 },
    CHF: {}, // no coverage at all
  };
  const { ranked, uncovered } = buildScorecard(byCcy);
  ok('CHF is uncovered, not ranked with a fake 0', uncovered.includes('CHF'));
  ok('ranked excludes CHF', !ranked.some(r => r.ccy === 'CHF'));
  ok('USD ranks above EUR (0.5 > -0.2)', ranked.findIndex(r => r.ccy === 'USD') < ranked.findIndex(r => r.ccy === 'EUR'));
  ok('every currency accounted for exactly once (ranked + uncovered = 8)', ranked.length + uncovered.length === CCYS.length);
}
{
  const { ranked, uncovered } = buildScorecard({});
  ok('completely empty input -> everyone uncovered, ranked empty, no crash', ranked.length === 0 && uncovered.length === CCYS.length);
}

console.log('[topBottomPair — long strongest / short weakest, with a confidence floor]');
{
  const byCcy = { USD: { cpi: 0.8 }, EUR: { cpi: 0.1 }, JPY: { cpi: -0.7 } };
  const { ranked } = buildScorecard(byCcy);
  const pair = topBottomPair(ranked);
  ok('long is the strongest (USD)', pair.long === 'USD');
  ok('short is the weakest (JPY)', pair.short === 'JPY');
  ok('gap is positive and matches the spread', Math.abs(pair.gap - 1.5) < 0.01, pair.gap);
}
{
  // Everyone reads near-neutral and close together -> no confident pair, not a forced one.
  const byCcy = { USD: { cpi: 0.05 }, EUR: { cpi: 0.02 }, JPY: { cpi: -0.03 } };
  const { ranked } = buildScorecard(byCcy);
  const pair = topBottomPair(ranked);
  ok('small gap -> null, not a low-confidence forced pair', pair === null);
}
{
  const pair = topBottomPair([{ ccy: 'USD', composite: 0.5 }]);
  ok('fewer than 2 ranked currencies -> null, not a crash', pair === null);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll macroScorecardEngine tests passed.');
