// Synthetic, no-network unit tests for statsCore.hurstDFA — the calibrated
// Hurst estimator. Randomness comes from a deterministic LCG (fixed seed), so
// these are reproducible: a true white-noise series must read ≈0.5, which is
// the property that makes the number interpretable at all.
//
// Written after the live Analytics Desk showed GOLD 0.903 and EURUSD 0.882 —
// two opposite markets, same reading. Root cause: short-lag R/S on price
// LEVELS saturates near 0.9 for any series (documented below).
//
//   node js/hurstDfa.test.mjs

import { hurstDFA } from './statsCore.js';
import { computeHurst } from './rangeBiasCore.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

// Deterministic uniform noise in [-0.5, 0.5] (LCG — reproducible across runs).
let seed = 12345;
const rnd = () => { seed = (1103515245 * seed + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
const N = 3000;
const white = Array.from({ length: N }, rnd);
const walk = []; { let c = 0; for (const v of white) walk.push(c += v); }              // integrated
const anti = []; { let p = 0; for (const v of white) { const r = -0.7 * p + v; p = r; anti.push(r); } }
const pers = []; { let s = 0; for (const v of white) { s = 0.85 * s + v; pers.push(s); } }

console.log('[hurstDFA — the defining calibration points]');
{
  const hw = hurstDFA(white);
  ok('white noise → H ≈ 0.5 (independent increments)', Math.abs(hw - 0.5) < 0.05, `H=${hw.toFixed(3)}`);
  const hr = hurstDFA(walk);
  ok('random walk (a LEVEL series) → H ≈ 1.5, i.e. H+1', Math.abs(hr - 1.5) < 0.08, `H=${hr.toFixed(3)}`);
  ok('anti-persistent increments → H < 0.5', hurstDFA(anti) < 0.45, `H=${hurstDFA(anti).toFixed(3)}`);
  ok('persistent increments → H > 0.5', hurstDFA(pers) > 0.6, `H=${hurstDFA(pers).toFixed(3)}`);
  ok('ordering anti < white < persistent', hurstDFA(anti) < hw && hw < hurstDFA(pers));
}

console.log('\n[contract / degeneracy]');
{
  ok('too short → null (never a fake 0.5)', hurstDFA(white.slice(0, 20)) === null);
  ok('empty → null', hurstDFA([]) === null);
  ok('constant series → null (no fluctuation to scale)', hurstDFA(new Array(200).fill(3)) === null);
  ok('NaNs filtered, still finite', Number.isFinite(hurstDFA(white.concat([NaN, NaN]))));
  // Scale invariance: multiplying the series by a constant cannot change H.
  const scaled = white.map(v => v * 1000);
  ok('scale-invariant (×1000 → same H)', Math.abs(hurstDFA(scaled) - hurstDFA(white)) < 1e-9);
}

console.log('\n[why this replaced short-lag R/S on levels — the measured defect]');
{
  // The incumbent computeHurst (lags [2,4,8,16], applied to price levels) is
  // kept in rangeBiasCore for the LIVE range-bias feature. These asserts pin
  // WHY the desk does not use it: it returns ~0.9 regardless of the market,
  // so it cannot separate a trend from a random walk.
  const lvlTrend = Array.from({ length: 500 }, (_, i) => 1.10 * Math.exp(0.0008 * i));
  const lvlWalk = walk.slice(0, 500).map(v => 1.10 + v * 0.001);
  const oldTrend = computeHurst(lvlTrend), oldWalk = computeHurst(lvlWalk);
  ok('incumbent saturates high on a TREND (≥0.85)', oldTrend >= 0.85, `H=${oldTrend.toFixed(3)}`);
  ok('incumbent ALSO saturates high on a RANDOM WALK (≥0.85)', oldWalk >= 0.85, `H=${oldWalk.toFixed(3)}`);
  ok('incumbent cannot separate them (gap < 0.1)', Math.abs(oldTrend - oldWalk) < 0.10,
     `${oldTrend.toFixed(3)} vs ${oldWalk.toFixed(3)}`);

  // The honest comparison: a market with PERSISTENT increments (returns
  // positively autocorrelated) vs one with independent increments. This is the
  // distinction a Hurst reading is supposed to make. Note a constant-drift
  // exponential curve is NOT this test — its returns are a constant, so any
  // correct estimator reads ≈0 on them (no fluctuation to scale).
  const persRets = [], iidRets = [];
  { let p = 0; for (let i = 0; i < 1200; i++) { const e = rnd(); const r = 0.85 * p + e; p = r; persRets.push(r); iidRets.push(e); } }
  const hPers = hurstDFA(persRets), hIid = hurstDFA(iidRets);
  ok('DFA separates persistent from independent increments (gap ≥ 0.2)', hPers - hIid >= 0.2,
     `${hPers.toFixed(3)} vs ${hIid.toFixed(3)}`);
  ok('constant increments (pure drift) → degenerate ≈0, not a fake "trending" 0.9',
     hurstDFA(new Array(500).fill(0.0008).map((v, i) => v)) === null || hurstDFA(Array.from({ length: 500 }, (_, i) => 0.0008 + (i === 0 ? 1e-12 : 0))) < 0.35);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
