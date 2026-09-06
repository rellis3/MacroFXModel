// Synthetic, no-network tests for js/globalLiquidityEngine.js's runHistory()
// `scores` output (the raw per-pair liquidity-impulse spread the regression
// test needs) and for GlobalLiquidity/backtestCore.mjs's computeRegressionTest.
// Mirrors GlobalLiquidity/test_smoke.py's posture: not a test of edge, a test
// that the machine is wired correctly (shapes, no lookahead, honest stats).
//   node js/globalLiquidityEngine.test.mjs
import { loadEngine } from '../GlobalLiquidity/engineLoader.mjs';
import { computeRegressionTest } from '../GlobalLiquidity/backtestCore.mjs';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

const E = loadEngine();

console.log('[globalLiquidityEngine — runHistory scores]');
{
  const payload = E.synthetic(400, 7);
  const hist = E.runHistory(payload);
  ok('scores has one row per date', hist.scores.length === hist.dates.length);
  ok('each score row has one entry per pair', hist.scores.every((row) => row.length === hist.pairs.length));
  ok('scores are finite numbers', hist.scores.every((row) => row.every((v) => Number.isFinite(v))));

  // scored/weights must agree: any pair actually in the traded book must rank
  // among the highest/lowest raw scores that week (the book is a discretised
  // view of the same continuous spread runHistory now exposes separately).
  const i = hist.dates.length - 1;
  const { book } = E.run(payload);
  const scoreByPair = {}; hist.pairs.forEach((p, j) => { scoreByPair[p] = hist.scores[i][j]; });
  const sortedScores = hist.pairs.map((p) => scoreByPair[p]).slice().sort((a, b) => b - a);
  const longs = book.filter((b) => b.weight > 0), shorts = book.filter((b) => b.weight < 0);
  ok('every long position\'s raw score sits in the top slice of that week\'s ranking',
     longs.every((b) => scoreByPair[b.pair] >= sortedScores[Math.min(sortedScores.length - 1, 2)] - 1e-9));
  ok('every short position\'s raw score sits in the bottom slice of that week\'s ranking',
     shorts.every((b) => scoreByPair[b.pair] <= sortedScores[Math.max(0, sortedScores.length - 3)] + 1e-9));

  // No-lookahead: truncating the payload to weeks [0..k] must reproduce the
  // same score history for weeks [0..k] — a later week's data must never
  // leak backwards into an earlier week's spread.
  const k = 250;
  const truncated = {}; for (const key of Object.keys(payload)) truncated[key] = payload[key].filter((pt) => new Date(pt.date) <= new Date(payload[key][k]?.date ?? payload[key].at(-1).date));
  const histTrunc = E.runHistory(truncated);
  const cut = Math.min(200, histTrunc.dates.length - 1);
  ok('scores at week `cut` are unchanged whether or not later weeks exist (no lookahead)',
     hist.scores[cut].every((v, j) => Math.abs(v - histTrunc.scores[cut][j]) < 1e-9),
     `full=${hist.scores[cut][0].toFixed(4)} truncated=${histTrunc.scores[cut][0].toFixed(4)}`);
}

console.log('[GlobalLiquidity/backtestCore — computeRegressionTest]');
{
  const payload = E.synthetic(420, 11);
  const hist = E.runHistory(payload);

  // Deterministic pseudo-random FX returns per pair (no real relationship to
  // the liquidity spread) — this is the null case: significance should show
  // up at roughly the false-positive rate, not systematically.
  function fakeFx(seed) {
    let s = seed >>> 0;
    const m = new Map();
    for (const d of hist.dates) { s = (s * 1664525 + 1013904223) >>> 0; m.set(d, (s / 4294967296 - 0.5) * 0.02); }
    return m;
  }
  const fxByPair = {}; E.CFG.PAIRS.forEach((p, j) => { fxByPair[p] = fakeFx(1000 + j); });

  const reg = computeRegressionTest({ engine: E, payload, fxByPair, fredSource: 'synthetic' });
  ok('tests most pairs (enough synthetic FX coverage)', reg.pairsTested >= 20, `pairsTested=${reg.pairsTested}`);
  ok('every per-pair result has an NW t-stat and R²', reg.perPair.every((p) => Number.isFinite(p.tStatNW) && Number.isFinite(p.r2)));
  ok('pooled regression is present and finite', reg.pooled && Number.isFinite(reg.pooled.tStatNW));
  ok('unrelated (random) FX: false-positive rate stays low, not systematic',
     reg.significantPairs <= Math.ceil(reg.pairsTested * 0.25), `${reg.significantPairs}/${reg.pairsTested} "significant" on pure noise`);
  ok('a caveat about pooled cross-sectional correlation is always reported', typeof reg.caveat === 'string' && reg.caveat.length > 0);
  ok('marked as real when fredSource is not synthetic-labelled', computeRegressionTest({ engine: E, payload, fxByPair, fredSource: 'FRED API (Railway key)' }).real === true);
  ok('marked as not-real when fredSource says synthetic', reg.real === false);
}

console.log(failures === 0 ? '\nALL PASSED ✓' : `\n${failures} CHECK(S) FAILED ✗`);
process.exit(failures === 0 ? 0 : 1);
