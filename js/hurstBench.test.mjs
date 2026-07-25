// Synthetic, no-network unit tests for hurstBench — the estimator A/B.
// Series are constructed so the saturation claim is verifiable rather than
// asserted: a set of markets with genuinely DIFFERENT character must produce
// a spread of readings from a working estimator and a pinned distribution
// from a degenerate one.
//
//   node js/hurstBench.test.mjs

import { benchInstrument, poolBench, voteFor, efficiencyRatio, LIVE_THRESHOLDS } from './hurstBench.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

let seed = 24680;
const rnd = () => { seed = (1103515245 * seed + 12345) % 2147483648; return seed / 2147483648 - 0.5; };

console.log('[voteFor — the live thresholds]');
{
  ok('below 0.45 → mean-reverting', voteFor(0.40) === 'mean-reverting');
  ok('above 0.55 → trending', voteFor(0.60) === 'trending');
  ok('between → neutral', voteFor(0.50) === 'neutral');
  ok('boundaries are exclusive as in featureHurst', voteFor(0.45) === 'neutral' && voteFor(0.55) === 'neutral');
  ok('null/NaN → none (never a silent vote)', voteFor(null) === 'none' && voteFor(NaN) === 'none');
  ok('thresholds exported for the page to state', LIVE_THRESHOLDS.revert === 0.45 && LIVE_THRESHOLDS.trend === 0.55);
}

console.log('\n[efficiencyRatio — the forward character measure]');
{
  const straight = [1, 2, 3, 4, 5];
  ok('straight line → ER = 1', near(efficiencyRatio(straight, 0, 4), 1));
  const chop = [1, 2, 1, 2, 1];
  ok('perfect chop → ER = 0', near(efficiencyRatio(chop, 0, 4), 0));
  const half = [1, 3, 2];   // net 1, path 2+1=3
  ok('partial → net/path exactly', near(efficiencyRatio(half, 0, 2), 1 / 3));
  ok('flat series → null (no path), not a fake 0', efficiencyRatio([5, 5, 5], 0, 2) === null);
  ok('out of range → null', efficiencyRatio([1, 2], 0, 9) === null);
}

// ── A market set with deliberately DIFFERENT character ───────────────────────
// If an estimator is working, its readings across these must SPREAD. If it is
// saturated, they collapse to one value regardless of the market.
function mkBars(rets, start = 1.10) {
  const bars = []; let p = start;
  for (let i = 0; i < rets.length; i++) {
    const o = p; p *= 1 + rets[i];
    bars.push({ date: `2020-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
                open: o, high: Math.max(o, p) * 1.001, low: Math.min(o, p) * 0.999, close: p });
  }
  return bars;
}
const N = 1400;
const iid = Array.from({ length: N }, () => 0.006 * rnd());
const persist = []; { let s = 0; for (let i = 0; i < N; i++) { s = 0.85 * s + 0.004 * rnd(); persist.push(s); } }
const anti = [];    { let p = 0; for (let i = 0; i < N; i++) { const r = -0.7 * p + 0.006 * rnd(); p = r; anti.push(r); } }

console.log('\n[benchInstrument — plumbing before verdict]');
{
  const r = benchInstrument(mkBars(iid), { window: 250, forward: 20, step: 5 });
  ok('returns a result with rows', r && r.n > 40, `n=${r?.n}`);
  ok('both estimators produce a distribution', Number.isFinite(r.incumbent.dist.median) && Number.isFinite(r.dfa.dist.median));
  ok('IS/OOS split present for both', Number.isFinite(r.incumbent.ic.oos.ic) && Number.isFinite(r.dfa.ic.oos.ic));
  ok('IC carries its sample size (n travels with the claim)', r.dfa.ic.oos.n > 0 && r.incumbent.ic.oos.n > 0);
  ok('vote shares sum to 1', near(Object.values(r.dfa.votes.share).reduce((a, b) => a + b, 0), 1, 1e-9));
  ok('too-short input → null, not a fabricated result', benchInstrument(mkBars(iid.slice(0, 50))) === null);
}

console.log('\n[the saturation claim — measured, not asserted]');
{
  const runs = [iid, persist, anti].map(rs => benchInstrument(mkBars(rs), { window: 250, forward: 20, step: 5 }));
  const oldMedians = runs.map(r => r.incumbent.dist.median);
  const newMedians = runs.map(r => r.dfa.dist.median);
  const spread = xs => Math.max(...xs) - Math.min(...xs);

  // Measured 2026-07-25: 0.869 (iid) / 0.926 (persistent) / 0.779 (anti-
  // persistent). Even the ANTI-persistent market — the one case that should
  // read well below 0.5 — comes back at 0.78, i.e. far above the 0.55
  // "trending" threshold. The bar is 0.75, set from the measurement.
  ok('incumbent reads high on ALL three market types (≥0.75 each, incl. the anti-persistent one)',
     oldMedians.every(m => m >= 0.75), oldMedians.map(m => m.toFixed(3)).join(' / '));
  ok('incumbent misreads the ANTI-persistent market as trending (>0.55)',
     oldMedians[2] > LIVE_THRESHOLDS.trend, `anti reads ${oldMedians[2].toFixed(3)}`);
  ok('DFA reads the anti-persistent market below the incumbent by ≥0.35',
     oldMedians[2] - newMedians[2] >= 0.35, `${oldMedians[2].toFixed(3)} vs ${newMedians[2].toFixed(3)}`);
  ok('incumbent barely separates them (spread < 0.15)', spread(oldMedians) < 0.15, `spread=${spread(oldMedians).toFixed(3)}`);
  ok('DFA separates them by a real margin (spread > 0.25)', spread(newMedians) > 0.25,
     `${newMedians.map(m => m.toFixed(3)).join(' / ')} spread=${spread(newMedians).toFixed(3)}`);
  ok('DFA orders them correctly: anti < iid < persistent',
     newMedians[2] < newMedians[0] && newMedians[0] < newMedians[1]);

  // The decision-level consequence: at the live thresholds, the incumbent's
  // vote is a CONSTANT on every one of these markets.
  ok('incumbent votes "trending" ~always on all three (dominant ≥0.95)',
     runs.every(r => r.incumbent.votes.dominantShare >= 0.95),
     runs.map(r => r.incumbent.votes.dominantShare.toFixed(2)).join(' / '));
  ok('DFA produces a genuinely varying vote on at least one market (dominant < 0.95)',
     runs.some(r => r.dfa.votes.dominantShare < 0.95),
     runs.map(r => r.dfa.votes.dominantShare.toFixed(2)).join(' / '));
  ok('the two estimators disagree materially (some market >20% of the time)',
     runs.some(r => r.disagreeShare > 0.2), runs.map(r => r.disagreeShare.toFixed(2)).join(' / '));
}

console.log('\n[poolBench]');
{
  const runs = [iid, persist, anti].map(rs => benchInstrument(mkBars(rs), { window: 250, forward: 20, step: 5 }));
  const p = poolBench(runs);
  ok('pools all instruments', p.instruments === 3);
  ok('reports both estimators\' dominant-vote share', p.incumbent.meanDominantVoteShare > p.dfa.meanDominantVoteShare);
  ok('reports median OOS IC for both (the predictiveness benchmark = 0)',
     Number.isFinite(p.incumbent.medianOosIC) && Number.isFinite(p.dfa.medianOosIC));
  ok('counts instruments clearing |IC| ≥ 0.2 rather than eyeballing',
     Number.isInteger(p.dfa.instrumentsWithOosICabs02));
  ok('empty → null', poolBench([]) === null);
  ok('nulls filtered', poolBench([null, ...runs]).instruments === 3);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
