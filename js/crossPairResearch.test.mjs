/**
 * Tests for the cross-pair research trend spotter. Synthetic per-pair JSON where
 * the answer is known: a robust cross-pair pattern that spans types, one clearly
 * broken pair that must be excluded, and a type that ranks lower. Pure, no network.
 *
 *   node --test js/crossPairResearch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCrossPair, pairType, signTestP } from './crossPairResearch.js';

// Minimal per-pair summary in the vfr_research shape the engine emits.
function summary({ sharp = 0.5, skill = 0.15, exMed = 55, ex75 = 27, medErr = 8, dirHit = 53, persistBase = 45, persistAfter = 58 } = {}) {
  return {
    perComponent: { daily: { hl: { sharpnessCorr: sharp, exceedMedianPct: exMed, exceed75Pct: ex75 } } },
    dailyHlSkillVsClimatology: skill,
    errorDist: { medianPctErr: medErr },
    fcSkewDirHitPct: dirHit,
    persistence: { n: 200, baseExceedMedianPct: persistBase, afterAbove75Pct: persistAfter },
  };
}

test('pairType classifies the six buckets', () => {
  assert.equal(pairType('EURUSD'), 'major');
  assert.equal(pairType('USDJPY'), 'major');
  assert.equal(pairType('EURJPY'), 'jpy_cross');
  assert.equal(pairType('GBPJPY'), 'jpy_cross');
  assert.equal(pairType('EURGBP'), 'eur_cross');
  assert.equal(pairType('GBPAUD'), 'other_cross');
  assert.equal(pairType('GOLD'), 'gold');
  assert.equal(pairType('NQ'), 'index');
});

test('signTestP: unanimous is tiny, even split is ~1', () => {
  assert.ok(signTestP(10, 10) < 0.01, 'all agree → significant');
  assert.ok(signTestP(10, 5) > 0.9, 'even split → not significant');
});

// A book where EVERY pair under-forecasts the range (exceedMedian > 50) and vol
// clusters — a genuine cross-pair trend spanning majors, JPY, EUR and gold.
function goodBook() {
  const perPair = {
    EURUSD: summary({ sharp: 0.6, skill: 0.20, exMed: 56 }),
    GBPUSD: summary({ sharp: 0.55, skill: 0.18, exMed: 54 }),
    USDJPY: summary({ sharp: 0.5, skill: 0.15, exMed: 57 }),
    EURJPY: summary({ sharp: 0.48, skill: 0.12, exMed: 55 }),
    GBPJPY: summary({ sharp: 0.45, skill: 0.10, exMed: 58 }),
    EURGBP: summary({ sharp: 0.4, skill: 0.09, exMed: 53 }),
    EURAUD: summary({ sharp: 0.42, skill: 0.11, exMed: 54 }),
    GOLD:   summary({ sharp: 0.5, skill: 0.14, exMed: 56 }),
    // One clearly broken pair: uninformative + worse than climatology + miscalibrated.
    USDCHF: summary({ sharp: -0.05, skill: -0.12, exMed: 78, ex75: 45, medErr: 40 }),
  };
  return { perPair, pairs: Object.keys(perPair) };
}

test('analyze: broken pair is EXCLUDED with reasons; good pairs tradeable', () => {
  const r = analyzeCrossPair(goodBook());
  assert.equal(r.nPairs, 9);
  assert.ok(r.trust.exclude.includes('USDCHF'), 'USDCHF excluded');
  const reasons = r.trust.perPair.USDCHF.reasons.join(' ');
  assert.match(reasons, /uninformative|climatology|miscalibrated/);
  // At least the strongest pairs are tradeable.
  assert.ok(r.trust.trade.includes('EURUSD'));
  assert.ok(!r.trust.exclude.includes('EURUSD'));
});

test('analyze: reliability ranking puts the broken pair last', () => {
  const r = analyzeCrossPair(goodBook());
  assert.equal(r.reliability.at(-1).pair, 'USDCHF', 'worst pair ranks last');
  assert.ok(r.reliability[0].score >= r.reliability.at(-1).score, 'scores descend');
  // Scores are 0..100 and present.
  for (const row of r.reliability) if (row.score != null) assert.ok(row.score >= 0 && row.score <= 100);
});

test('analyze: the cross-pair under-forecast trend is flagged ROBUST across types', () => {
  const r = analyzeCrossPair(goodBook());
  const calib = r.consistency.find(c => c.key === 'calib_dir');
  assert.ok(calib, 'calibration-direction metric present');
  assert.equal(calib.direction, 'positive', 'positive = bands too tight / range under-forecast');
  assert.ok(calib.typeSpread >= 2, 'spans ≥2 pair types');
  assert.equal(calib.robust, true, 'flagged robust (sign test + type spread)');
  // A robust finding produces a "testable now" hypothesis.
  assert.ok(r.hypotheses.some(h => /calibration|under-forecast/i.test(h.text) && h.dataNeeded.startsWith('none')));
});

test('analyze: a coin-flip metric is NOT flagged robust', () => {
  // Build a book where direction-skill is a genuine coin flip across pairs.
  const perPair = {};
  const dirs = [53, 47, 52, 48, 51, 49, 54, 46];
  const names = ['EURUSD', 'GBPUSD', 'USDJPY', 'EURJPY', 'GBPJPY', 'EURGBP', 'EURAUD', 'GOLD'];
  names.forEach((nm, i) => { perPair[nm] = summary({ dirHit: dirs[i] }); });
  const r = analyzeCrossPair({ perPair, pairs: names });
  const dir = r.consistency.find(c => c.key === 'dir_skill');
  assert.ok(dir, 'direction metric present');
  assert.equal(dir.robust, false, 'coin-flip direction not robust');
});

test('analyze: intraday payload adds the touch-continue consistency metric', () => {
  const book = goodBook();
  const mk = (cont, rev) => ({ daily: { touches: { medianExtension: { n: 100, continuePct: cont, reversePct: rev } } } });
  const intraday = { perPair: { EURUSD: mk(40, 45), GBPUSD: mk(38, 47), USDJPY: mk(42, 44), GOLD: mk(35, 50) } };
  const r = analyzeCrossPair(book, intraday, { minPairsForConsistency: 4 });
  assert.equal(r.generatedFrom.intradayPairs, 4);
  const inC = r.consistency.find(c => c.key === 'in_continue');
  assert.ok(inC, 'intraday continue-vs-reverse metric present');
  assert.equal(inC.direction, 'negative', 'reverse dominates in this synthetic set');
});

test('analyze: empty input returns insufficient, not a throw', () => {
  assert.equal(analyzeCrossPair({ perPair: {} }).insufficient, true);
  assert.equal(analyzeCrossPair(null).insufficient, true);
});
