/**
 * Tests for the cross-pair research trend spotter. Synthetic per-pair JSON where
 * the answer is known: a robust cross-pair pattern that spans types, one clearly
 * broken pair that must be excluded, and a type that ranks lower. Pure, no network.
 *
 *   node --test js/crossPairResearch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCrossPair, pairType, signTestP, portfolioIndependence } from './crossPairResearch.js';

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

test('analyze: hidden relationships aggregate the per-pair feature scans', () => {
  // Attach a featureScan to each pair where vov consistently drives misses (+ρ),
  // across majors/JPY/EUR/gold — a robust, type-diverse hidden relationship.
  const book = goodBook();
  const scan = (vovRho) => ({
    nDays: 400,
    correlations: [
      { key: 'vov', label: 'Vol-of-vol (forecast-time)', n: 400, rhoAbsErr: vovRho, rhoCompletion: 0.1 },
      { key: 'volAnnual', label: 'Annualised vol', n: 400, rhoAbsErr: 0.01, rhoCompletion: 0.0 },
    ],
    importance: [{ key: 'vov', label: 'Vol-of-vol', absRho: Math.abs(vovRho), rho: vovRho }],
    missProfile: { bigMissRatePct: 12, n: 400, features: [] },
    dayTypes: { k: 4, n: 380, clusters: [{ n: 150, sharePct: 39.5, meanCompletion: 60, meanEfficiency: 0.3, meanAbsErr: 30, label: 'quiet & range-bound' }] },
  });
  const rhos = { EURUSD: 0.22, GBPUSD: 0.19, USDJPY: 0.25, EURJPY: 0.2, GBPJPY: 0.18, EURGBP: 0.21, EURAUD: 0.17, GOLD: 0.23, USDCHF: 0.05 };
  for (const [p, rho] of Object.entries(rhos)) book.perPair[p].featureScan = scan(rho);
  const r = analyzeCrossPair(book);
  assert.ok(r.hidden, 'hidden section present');
  assert.equal(r.generatedFrom.scannedPairs, 9);
  const vov = r.hidden.relationships.find(x => x.key === 'vov');
  assert.equal(vov.direction, 'higher → bigger miss');
  assert.equal(vov.robust, true, 'vov→miss is robust across types');
  assert.ok(r.hidden.dayTypes.some(d => d.label === 'quiet & range-bound'), 'pooled day-types present');
  assert.ok(r.hypotheses.some(h => /Vol-of-vol/i.test(h.text) && h.dataNeeded.includes('per-day scan')));
});

test('analyze: touch behaviour + bot questions surface from intraday data', () => {
  const book = goodBook();
  const mk = (touch, cont, rev, rangeRev, bullCont) => ({ daily: { touches: {
    medianExtension: { n: 200, touchRatePct: touch, continuePct: cont, reversePct: rev, meanMfePips: 22, meanMaePips: 18,
      byRegime: { BULL: { continuePct: bullCont }, BEAR: { continuePct: bullCont - 3 }, RANGE: { reverse20Pct: rangeRev } } },
    direction: { firstUpperPct: 55 } } } });
  // Every pair fades at the line (reverse > continue) and fades-in-range/follows-in-trend.
  const intr = { perPair: {
    EURUSD: mk(70, 40, 48, 58, 55), GBPUSD: mk(66, 38, 47, 55, 53), USDJPY: mk(72, 42, 46, 60, 56),
    EURJPY: mk(64, 39, 49, 57, 52), GBPJPY: mk(61, 37, 50, 54, 51), GOLD: mk(75, 35, 52, 62, 58),
  } };
  const r = analyzeCrossPair(book, intr, { minPairsForConsistency: 5 });
  assert.ok(r.touchBehaviour && !r.touchBehaviour.insufficient, 'touch behaviour computed');
  assert.equal(r.touchBehaviour.fadeVsFollow.direction, 'fade (reversion at the line dominates)');
  assert.equal(r.touchBehaviour.fadeVsFollow.robust, true, 'fade tendency robust across types');
  assert.ok(r.touchBehaviour.ranked[0].touchRatePct >= r.touchBehaviour.ranked.at(-1).touchRatePct, 'ranked by touch rate');
  // Bot questions = 3 gates (G1-G3) + 8 mechanics. This mock has touch data but no
  // placebo/fadePayoff blocks, so G1/G2 are GAP here; Q3 direction answerable; Q4
  // retest is the remaining mechanics gap; Q8 costs → screen.
  assert.equal(r.botQuestions.length, 11);
  assert.match(r.botQuestions[0].q, /^G1/);
  const q = lbl => r.botQuestions.find(x => x.q.startsWith(lbl));
  assert.match(q('4.').status, /GAP/);                  // retest sequence still a gap
  assert.match(q('3.').status, /answerable/);           // direction
  assert.match(q('8.').status, /screen/);               // costs → screen
});

test('portfolioIndependence: correlated pairs collapse to fewer effective bets', () => {
  // Three pairs move almost identically (one bet); a fourth is independent.
  const dates = Array.from({ length: 200 }, (_, i) => `d${i}`);
  // deterministic pseudo returns (seeded LCG)
  let s = 1; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
  const common = dates.map(() => rnd());
  const mk = (corrWithCommon) => { const o = {}; dates.forEach((d, i) => { o[d] = corrWithCommon * common[i] + (1 - corrWithCommon) * rnd(); }); return o; };
  const returnsByPair = { A: mk(0.98), B: mk(0.97), C: mk(0.96), D: mk(0.0) };
  const p = portfolioIndependence(returnsByPair, ['A', 'B', 'C', 'D']);
  assert.ok(p, 'portfolio computed');
  assert.equal(p.nPairs, 4);
  assert.ok(p.effectiveBets < 4, `effective bets < 4 given the ABC cluster (got ${p.effectiveBets})`);
  assert.ok(p.effectiveBets >= 1.5, 'but more than 1 (D is independent)');
  assert.ok(p.meanCorr > 0, 'positive mean correlation from the cluster');
});

test('analyze: G1 placebo + G2 payoff-shape fold from the intraday touch data', () => {
  const book = goodBook();
  // Real median reverses a lot (55%); placebo reverses less (40%) → forecast beats placebo.
  // Fade PnL negatively skewed with avg-loss > avg-win → short gamma.
  const mk = (edge, skew, winLoss) => ({ daily: { touches: {
    medianExtension: { n: 200, touchRatePct: 70, continuePct: 30, reversePct: 55, meanMfePips: 22, meanMaePips: 18,
      byRegime: { BULL: { continuePct: 54 }, BEAR: { continuePct: 51 }, RANGE: { reverse20Pct: 56 } } },
    placebo: { n: 180, reversePct: 55 - edge, realReversePct: 55, edgeVsPlaceboPp: edge },
    fadePayoff: { n: 200, meanPips: 0.5, medianPips: 2, skew, p5: -40, p95: 15, worstPips: -80, winRatePct: 58, avgWinPips: 8, avgLossPips: -14, winLossRatio: winLoss },
    direction: { firstUpperPct: 54 } } } });
  const intr = { perPair: {
    EURUSD: mk(14, -1.2, 0.57), GBPUSD: mk(12, -1.0, 0.6), USDJPY: mk(15, -1.4, 0.55),
    EURJPY: mk(11, -0.9, 0.62), GBPJPY: mk(13, -1.1, 0.58), GOLD: mk(16, -1.3, 0.5),
  } };
  const r = analyzeCrossPair(book, intr, { minPairsForConsistency: 5 });
  const tb = r.touchBehaviour;
  assert.ok(tb.placebo, 'G1 placebo folded');
  assert.equal(tb.placebo.robust, true, 'forecast beats placebo robustly across types');
  assert.ok(tb.placebo.medianEdgePp > 1);
  assert.ok(tb.payoffShape, 'G2 payoff shape folded');
  assert.equal(tb.payoffShape.shortGamma, true, 'flagged short-gamma (neg skew + avg-loss > avg-win)');
  assert.match(tb.payoffShape.verdict, /SHORT-GAMMA/);
  // Gate questions present + answerable.
  assert.match(r.botQuestions[0].q, /^G1/);
  assert.match(r.botQuestions[1].q, /^G2/);
});

test('analyze: cost-survival compares median / 75th / calm lines, FX-aware', () => {
  const book = goodBook();
  // Median fades weakly (dies); 75th fades harder (bigger gross); calm-day median
  // fades hardest. All FX so the FX-aware verdict applies (no index rescue).
  const blk = (rev, cont) => ({ n: 200, touchRatePct: 70, continuePct: cont, reversePct: rev });
  const mk = (mRev, pRev, cRev) => ({ daily: { touches: {
    medianExtension: { ...blk(mRev, 100 - mRev), byRegime: {} },
    p75Extension: blk(pRev, 100 - pRev),
    conditionalCalm: blk(cRev, 100 - cRev),
    direction: { firstUpperPct: 54 } } } });
  // Use goodBook's own pairs (so they exist in recs); all non-index FX/crosses.
  const fxPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'EURJPY', 'GBPJPY', 'EURGBP', 'EURAUD'];
  const intr = { perPair: {} };
  // median rev 54 (gross ~1.6, dies vs 1.5-2.5 cost at ×2), 75th rev 62, calm rev 66 (hardest fade)
  for (const p of fxPairs) intr.perPair[p] = mk(54, 62, 66);
  const r = analyzeCrossPair(book, intr, { minPairsForConsistency: 5 });
  const bl = r.costSurvival.byLine;
  assert.ok(bl.median && bl.p75 && bl.calm, 'all three lines summarised');
  // 75th and calm clear ×2 on FX where the median doesn't.
  assert.ok(bl.p75.fxSurvivingX2 >= bl.median.fxSurvivingX2, '75th survives ≥ median');
  assert.ok(bl.calm.fxSurvivingX2 >= bl.p75.fxSurvivingX2, 'calm survives ≥ 75th');
  assert.ok(bl.median.medianFxNetX1 <= bl.calm.medianFxNetX1, 'calm net ≥ median net');
});

test('analyze: cost-survival screen nets the ±20-pip bracket and flags survivors', () => {
  const book = goodBook();
  // EURUSD/GBPUSD fade hard (survive ×1); GBPJPY marginal (dies); NQ follows weakly (dies).
  const mk = (rev, cont) => ({ daily: { touches: {
    medianExtension: { n: 200, touchRatePct: 70, continuePct: cont, reversePct: rev, meanMfePips: 22, meanMaePips: 18,
      byRegime: { BULL: { continuePct: 54 }, BEAR: { continuePct: 51 }, RANGE: { reverse20Pct: 56 } } },
    direction: { firstUpperPct: 54 } } } });
  const rv = { EURUSD: [58, 33], GBPUSD: [57, 34], USDJPY: [55, 36], EURJPY: [47, 45], GBPJPY: [46, 44], GOLD: [59, 32] };
  const intr = { perPair: {} };
  for (const [p, [rev, cont]] of Object.entries(rv)) intr.perPair[p] = mk(rev, cont);
  const r = analyzeCrossPair(book, intr, { minPairsForConsistency: 5 });
  const cs = r.costSurvival;
  assert.ok(cs && !cs.insufficient, 'cost survival computed');
  assert.equal(cs.barrierPips, 20);
  const eur = cs.ranked.find(x => x.pair === 'EURUSD');
  assert.equal(eur.side, 'fade');
  assert.ok(eur.grossPips > eur.costPips, 'EURUSD gross beats its cost');
  assert.equal(eur.survivesX1, true);
  const jpy = cs.ranked.find(x => x.pair === 'GBPJPY');
  assert.equal(jpy.survivesX1, false, 'marginal pair dies on costs');
  assert.ok(cs.survivingX1 >= 3 && cs.survivingX1 <= 6);
  assert.match(cs.note, /SCREEN/);
});

test('analyze: session relationships fold into hidden.session across pairs', () => {
  const book = goodBook();
  const sessScan = (asiaRho) => ({
    nDays: 400,
    correlations: [{ key: 'vov', label: 'Vol-of-vol', n: 400, rhoAbsErr: 0.2, rhoCompletion: 0.1 }],
    importance: [{ key: 'vov', label: 'Vol-of-vol', absRho: 0.2, rho: 0.2 }],
    missProfile: { bigMissRatePct: 12, n: 400, features: [] },
    dayTypes: { k: 4, n: 380, clusters: [{ n: 150, sharePct: 40, meanCompletion: 60, meanEfficiency: 0.3, meanAbsErr: 30, label: 'quiet & range-bound' }] },
    sessionRelationships: { nDays: 400, note: 'within-day (session shares are end-of-day)', correlations: [
      { key: 'asiaPct', label: 'Asia share of daily range', n: 400, rhoAbsErr: asiaRho, rhoCompletion: 0.05 },
      { key: 'londonPct', label: 'London share of daily range', n: 400, rhoAbsErr: 0.02, rhoCompletion: 0.0 },
    ] },
  });
  const rhos = { EURUSD: -0.2, GBPUSD: -0.18, USDJPY: -0.22, EURJPY: -0.19, GBPJPY: -0.17, EURGBP: -0.21, EURAUD: -0.16, GOLD: -0.2, USDCHF: -0.05 };
  for (const [p, rho] of Object.entries(rhos)) book.perPair[p].featureScan = sessScan(rho);
  const r = analyzeCrossPair(book);
  assert.ok(r.hidden.session, 'hidden.session present');
  const asia = r.hidden.session.relationships.find(x => x.key === 'asiaPct');
  assert.equal(asia.direction, 'bigger share → smaller miss');
  assert.equal(asia.robust, true, 'Asia-share relationship robust across types');
  assert.ok(r.hypotheses.some(h => /Asia share/i.test(h.text) && h.dataNeeded.includes('session join')));
});

test('analyze: empty input returns insufficient, not a throw', () => {
  assert.equal(analyzeCrossPair({ perPair: {} }).insufficient, true);
  assert.equal(analyzeCrossPair(null).insufficient, true);
});
