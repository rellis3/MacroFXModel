// Synthetic tests for macroScorecardEngine.js. No network.
//   node js/macroScorecardEngine.test.mjs
import {
  CCYS, scorecardForCcy, buildScorecard, topBottomPair,
  rollUpFactors, dominantFactor, factorBoard, FACTORS, FACTOR_WEIGHTS, MIN_FACTORS_FOR_PAIR,
  readDim, MAX_AGE_BY_CADENCE,
} from './macroScorecardEngine.js';

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
  // Three factors each, so all three clear the coverage floor.
  const byCcy = {
    USD: { cpi: 0.8, gdp: 0.8, laborMarket: 0.8 },
    EUR: { cpi: 0.1, gdp: 0.1, laborMarket: 0.1 },
    JPY: { cpi: -0.7, gdp: -0.7, laborMarket: -0.7 },
  };
  const { ranked } = buildScorecard(byCcy);
  const pair = topBottomPair(ranked);
  ok('long is the strongest (USD)', pair.long === 'USD');
  ok('short is the weakest (JPY)', pair.short === 'JPY');
  ok('gap is positive and matches the spread', Math.abs(pair.gap - 1.5) < 0.01, pair.gap);
}
{
  // Everyone reads near-neutral and close together -> no confident pair, not a forced one.
  const byCcy = {
    USD: { cpi: 0.05, gdp: 0.05, laborMarket: 0.05 },
    EUR: { cpi: 0.02, gdp: 0.02, laborMarket: 0.02 },
    JPY: { cpi: -0.03, gdp: -0.03, laborMarket: -0.03 },
  };
  const { ranked } = buildScorecard(byCcy);
  const pair = topBottomPair(ranked);
  ok('small gap -> null, not a low-confidence forced pair', pair === null);
}
{
  const pair = topBottomPair([{ ccy: 'USD', composite: 0.5 }]);
  ok('fewer than 2 ranked currencies -> null, not a crash', pair === null);
}

console.log('[factors - the accidental weighting the roll-up removes]');
const reads = o => Object.fromEntries(Object.entries(o).map(([d, v]) => [d, { score: v, stale: false }]));
{
  // THE BUG, in one case. Rates is measured by three series, inflation by one. Under a
  // flat mean over dimensions three bullish rates reads outvote one bearish inflation
  // read 3-to-1 - not because anyone decided rates matters three times more, but
  // because three series happen to point at it.
  const r = rollUpFactors(reads({ rateDiff: 1, realYield: 1, yieldCurve: 1, cpi: -1 }));
  ok('a flat mean over dims would have read +0.50 (rates wins 3:1)', Math.abs((1 + 1 + 1 - 1) / 4 - 0.5) < 1e-9);
  ok('factor-weighted reads 0.00 - rates and inflation count once each', r.composite === 0, r.composite);
  ok('rates scores the mean of its three series', r.factors.rates.score === 1, r.factors.rates.score);
  ok('inflation scores on its one', r.factors.inflation.score === -1, r.factors.inflation.score);
}
{
  const r = rollUpFactors(reads({ rateDiff: 0.5, realYield: null, yieldCurve: 0.1 }));
  ok('a null dim is excluded, not averaged in as a zero', Math.abs(r.factors.rates.score - 0.3) < 1e-9, r.factors.rates.score);
  ok('coverage says how much of the factor is actually backed', r.factors.rates.coverage === 0.67, r.factors.rates.coverage);
  ok('a factor with nothing usable is null, not a confident 0', r.factors.growth.score === null);
  ok('the composite is taken over scored factors only', r.factorsScored === 1 && r.composite === 0.3, `${r.factorsScored} / ${r.composite}`);
}
{
  // Stale must behave exactly like missing - that gate is the reason readDim marks it.
  const r = rollUpFactors({ rateDiff: { score: 0.8, stale: false }, realYield: { score: -0.9, stale: true } });
  ok('a stale dim is excluded from its factor', r.factors.rates.score === 0.8, r.factors.rates.score);
  ok('and is named as excluded rather than silently vanishing', r.factors.rates.excludedStale.includes('realYield'));
}
{
  const { factors } = rollUpFactors(reads({ cpi: 0.2, gdp: -0.9 }));
  const d = dominantFactor(factors);
  ok('dominantFactor picks the largest absolute pull', d.key === 'growth', d.key);
  ok('and carries its label for display', d.label === 'Growth', d.label);
  ok('nothing scored -> no dominant factor, not a fake one', dominantFactor(rollUpFactors({}).factors) === null);
}
{
  ok('cbSentiment sits in no factor - banked null, never scores',
     !Object.values(FACTORS).some(f => f.dims.includes('cbSentiment')));
  ok('weights are equal, and stated rather than accidental', Object.values(FACTOR_WEIGHTS).every(w => w === 1));
}
{
  const r = scorecardForCcy('USD', { rateDiff: 1, realYield: 1, yieldCurve: 1, cpi: -1 });
  ok('scorecardForCcy.composite is the FACTOR composite', r.composite === 0, r.composite);
  ok('the old flat-dim mean survives as dimMeanComposite', Math.abs(r.dimMeanComposite - 0.5) < 1e-9, r.dimMeanComposite);
  ok('and the dominant factor comes along for the one-line read', r.dominant != null && r.factorsTotal === 6);
}

console.log('[factorBoard - which factor is separating currencies, not who is strong]');
{
  // Everyone reads the same on inflation; rates runs from +0.9 to -0.8. Rates is
  // what the board is trading on today, however loud the inflation prints were.
  const byCcy = {
    USD: { rateDiff: 0.9, cpi: 0.4 },
    EUR: { rateDiff: 0.0, cpi: 0.4 },
    JPY: { rateDiff: -0.8, cpi: 0.4 },
  };
  const { ranked } = buildScorecard(byCcy);
  const b = factorBoard(ranked);
  ok('rates is the driver - widest dispersion', b.driver.key === 'rates', b.driver.key);
  ok('and its spread is the max-min, not a level', Math.abs(b.driver.spread - 1.7) < 1e-9, b.driver.spread);
  ok('an agreed factor has zero spread and cannot separate anyone', b.factors.inflation.spread === 0, b.factors.inflation.spread);
  ok('the driver names both ends', b.driver.high === 'USD' && b.driver.low === 'JPY');
}
{
  // One currency scored on a factor has NO spread - null, not 0. A zero would rank
  // it as the calmest factor on the board when it is simply unmeasured.
  const { ranked } = buildScorecard({ USD: { gdp: 0.9 }, EUR: { cpi: 0.1 } });
  const b = factorBoard(ranked);
  ok('a factor only one currency has scored -> spread null, not 0', b.factors.growth.spread === null);
  ok('it still reports who holds it and out of how many', b.factors.growth.n === 1 && b.factors.growth.of === 2);
  ok('a factor nobody has scored -> spread null, empty ranking', b.factors.labour.spread === null && b.factors.labour.n === 0);
}
{
  ok('an empty board has no driver, rather than a fabricated one', factorBoard([]).driver === null);
}

console.log('[topBottomPair - a thin read is not comparable to a deep one]');
{
  // THE TRAP the factor layer sharpened. GBP scores on two factors and lands at the
  // top; USD scores on all six and lands mid-table. With fewer factors each surviving
  // one dominates, so a thin read swings further from neutral for no reason other
  // than having less behind it - and the extremes are exactly where thin rows land.
  const byCcy = {
    GBP: { cpi: 0.5, rateDiff: 0.2 },                                        // 2 factors
    USD: { cpi: 0.3, rateDiff: 0.6, gdp: 0.2, laborMarket: -0.4, tradeBalance: -0.2, retailSales: 0.1 },
    JPY: { cpi: 0.2, rateDiff: -0.9, gdp: 0.1, laborMarket: 0.0 },
  };
  const { ranked } = buildScorecard(byCcy);
  ok('GBP still RANKS top - thin coverage does not hide a row', ranked[0].ccy === 'GBP', ranked[0].ccy);
  const pair = topBottomPair(ranked);
  ok('but the headline pair is taken from the deep rows only', pair.long === 'USD', pair.long);
  ok('and GBP is named as set aside, not silently dropped', pair.setAside.includes('GBP'));
  ok('the pair reports how deep each leg is', pair.longFactors === 6 && pair.shortFactors === 4,
     `${pair.longFactors}/${pair.shortFactors}`);
  ok('the floor is stated on the result, not implicit', pair.minFactors === MIN_FACTORS_FOR_PAIR);
}
{
  // Fewer than two rows clear the floor -> no pair at all. "There is nothing
  // comparable enough to pair today" is a real answer this must be able to give.
  const { ranked } = buildScorecard({ USD: { cpi: 0.9, gdp: 0.8, laborMarket: 0.7 }, EUR: { cpi: -0.9 } });
  ok('one deep row and one thin -> null, not a lopsided pair', topBottomPair(ranked) === null);
  ok('the floor can be lowered explicitly when a caller means to',
     topBottomPair(ranked, { minFactors: 1 })?.short === 'EUR');
}

console.log('[staleness is judged by CADENCE, not by dimension]');
{
  // THE BUG, measured against the live board on 2026-09-10: 25 currency-dimensions
  // were flagged stale, and roughly half were healthy QUARTERLY prints judged
  // against a monthly budget. Most dimensions mix cadences across currencies --
  // retail sales is monthly for the US and quarterly for the other seven -- so no
  // single per-dimension number can be right for both.
  const NOW = Date.parse('2026-09-10T12:00:00Z');
  const at = (dim, asOf, cadence) => readDim(dim, { score: 0.5, asOf, cadence }, NOW);

  // GBP retail sales published for Q2 on 2026-04-01 is 162 days old in September
  // and completely normal. It was being struck through and dropped.
  ok('a normal quarterly print is NOT stale', at('retailSales', '2026-04-01', 'quarterly').stale === false);
  ok('even a full two quarters back is not stale', at('retailSales', '2026-01-01', 'quarterly').stale === false);
  ok('the same date WOULD have been stale on the old dimension budget',
     at('retailSales', '2026-01-01', 'monthly').stale === true);

  // The gate must still do its actual job.
  ok('a series that stopped in 2022 is still caught', at('retailSales', '2022-01-01', 'quarterly').stale === true);
  ok('JPY CPI, dead since 2021, is still caught', at('cpi', '2021-06-01', 'monthly').stale === true);
  ok('a dead MONTHLY series is unaffected by the quarterly widening',
     at('cpi', '2025-03-01', 'monthly').stale === true);
  ok('a normal monthly print stays fresh', at('cpi', '2026-07-01', 'monthly').stale === false);

  ok('the cadence budget is reported, not just applied', at('cpi', '2026-07-01', 'monthly').maxAgeDays === MAX_AGE_BY_CADENCE.monthly);
  ok('and the cadence itself comes back for display', at('cpi', '2026-07-01', 'quarterly').cadence === 'quarterly');
}
{
  const NOW = Date.parse('2026-09-10T12:00:00Z');
  // No cadence reported -> fall back to the per-dimension budget exactly as before,
  // so an engine that has not been taught to emit cadence keeps working.
  const r = readDim('cpi', { score: 0.5, asOf: '2026-07-01' }, NOW);
  ok('a dim with no cadence falls back to the dimension budget', r.maxAgeDays === 130, r.maxAgeDays);
  ok('and reports cadence null rather than guessing one', r.cadence === null);
  ok('a bare number is still trusted and never stale', readDim('cpi', 0.4, NOW).stale === false);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll macroScorecardEngine tests passed.');
