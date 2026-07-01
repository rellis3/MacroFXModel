/**
 * Stop-loss study unit tests — runStopStudy + pnlAtSL (perLineStrategy).
 *
 * Pure, synthetic touches (no network). Runs offline in the sandbox — real numbers
 * need a Railway Refresh (M1 unreachable here). Run: node js/stopStudy.test.mjs
 *
 * The re-pricing model: a fade at candidate SL distance s (% of price) is stopped
 * (loss −s) iff its stored adverse excursion extPct > s; else it keeps its original
 * barrier outcome. Tightening-only (s clamped ≤ the outer band distOut), conservative
 * ordering (extPct treated as if hit). We assert:
 *   (a) losers have LARGE extPct, winners SMALL → a tighter SL cuts losers, keeps
 *       winners → bestSL < bandSL and expBest > expBand.
 *   (b) winners' MAE ≈ losers' (winners dip near the outer line) → tightening also
 *       stops winners → bestSL ≈ bandSL (no false improvement).
 *   (c) pnlAtSL(t, distOut) reconciles with pnlFor's fade gross-minus-cost.
 */

import assert from 'node:assert/strict';
import { runStopStudy, pnlAtSL, pnlFor } from './perLineStrategy.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Canonical up-line fade touch: open=100, level=102, inner=101 (distIn=1, the TP),
// outer=103 (distOut=1, the current band SL). extPct = adverse excursion (% of price).
const mk = (date, reverted, extPct) => ({
  date, open: 100, line: 'OC50_up', name: 'OC50', side: 'up',
  reverted, level: 102, innerLvl: 101, outerLvl: 103,
  decidedBy: 'barrier', closePx: 100, cell: 'OC50_up|fast', extPct,
});
// Spread dates across a year so the daily portfolio series has variance.
const dateAt = (yr, i) => `${yr}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`;

// Build one pair's touches: IS (learns the fade policy) + OOS (re-priced). 75% revert
// so buildPolicy picks 'fade'. winnerMae / loserMae set the excursion scenario.
function buildPair(yrIS, yrOOS, nIS, nOOS, winnerMae, loserMae) {
  const ts = [];
  for (let i = 0; i < nIS; i++) { const rev = i % 4 !== 0; ts.push(mk(dateAt(yrIS, i), rev, rev ? winnerMae : loserMae)); }
  for (let i = 0; i < nOOS; i++) { const rev = i % 4 !== 0; ts.push(mk(dateAt(yrOOS, i), rev, rev ? winnerMae : loserMae)); }
  return ts;
}

const OPTS = { splitFrac: 0.5, minN: 20, marginPct: 0.01, costByPair: { P: 0.01 }, classByPair: { P: 'fx' } };

console.log('runStopStudy:');

// (a) winners dip SMALL, losers run to the outer → tighter SL cuts losers, keeps winners.
test('(a) small-MAE winners + big-MAE losers → bestSL < bandSL, expBest > expBand', () => {
  const study = runStopStudy({ P: buildPair('2020', '2023', 60, 60, 0.2, 1.0) }, OPTS);
  assert.ok(study, 'study returned');
  const r = study.perPair.P;
  assert.ok(r, 'pair P present');
  assert.ok(r.n >= 30, `n ≥ 30 (${r.n})`);
  assert.ok(r.bestSL < r.bandSL, `bestSL ${r.bestSL} should be < bandSL ${r.bandSL}`);
  assert.ok(r.expBest > r.expBand, `expBest ${r.expBest} should beat expBand ${r.expBand}`);
  // Portfolio per-pair-optimal should beat the band baseline on expectancy.
  assert.ok(study.portfolio.perPairOpt.expectancy > study.portfolio.band.expectancy,
    `portfolio perPairOpt exp ${study.portfolio.perPairOpt.expectancy} !> band ${study.portfolio.band.expectancy}`);
  assert.ok(study.portfolio.delta.perPairOpt.expectancy > 0, 'delta expectancy positive');
});

// (b) winners dip almost to the outer line → tightening also stops winners → no gain.
test('(b) winners MAE ≈ losers MAE → bestSL ≈ bandSL, no false improvement', () => {
  const study = runStopStudy({ P: buildPair('2020', '2023', 60, 60, 0.99, 1.0) }, OPTS);
  const r = study.perPair.P;
  assert.ok(r.bestSL >= 0.8 * r.bandSL, `bestSL ${r.bestSL} should stay near bandSL ${r.bandSL} (not a tight stop)`);
  // Tightening must NOT manufacture a material expectancy jump (winners get stopped too).
  assert.ok((r.expBest - r.expBand) < 0.01, `expBest−expBand ${(r.expBest - r.expBand)} should be ~0 (no false edge)`);
});

// (c) pnlAtSL(t, distOut) reconciles with pnlFor's fade result (band SL = original).
test('(c) pnlAtSL(t, distOut) == pnlFor fade (gross − cost) for winner and loser', () => {
  const cost = 0.012;
  const distOut = (103 - 102) / 100 * 100;                    // 1.0 (% of price)
  for (const rev of [true, false]) {
    const t = mk('2022-06-01', rev, rev ? 0.3 : 1.0);          // extPct ≤ distOut in both cases
    const viaFor = pnlFor(t, 'fade', { costPct: cost, slipPct: 0 });
    const viaSL  = pnlAtSL(t, distOut, { costPct: cost });
    assert.ok(near(viaFor, viaSL), `reconcile ${rev ? 'winner' : 'loser'}: pnlFor ${viaFor} vs pnlAtSL ${viaSL}`);
  }
});

// Asset-class-optimal variant is present and priced across the same OOS fades.
test('portfolio has band / perPairOpt / assetClassOpt with trades', () => {
  const study = runStopStudy({ P: buildPair('2020', '2023', 60, 60, 0.2, 1.0) }, OPTS);
  for (const k of ['band', 'perPairOpt', 'assetClassOpt']) {
    assert.ok(study.portfolio[k], `portfolio.${k} present`);
    assert.ok(study.portfolio[k].trades > 0, `portfolio.${k} has trades`);
  }
  assert.ok(study.classDetail.fx, 'fx class detail present');
  assert.ok(typeof study.note === 'string' && study.note.length > 0, 'note present');
});

console.log(`\n${passed} checks passed.`);
