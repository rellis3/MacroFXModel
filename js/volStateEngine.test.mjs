// Synthetic, no-network unit tests for volStateEngine.js — proves each
// function is pure (same input → same output, no mutation) and behaves
// correctly on hand-built edge cases before it's wired into any live payload.
//
//   node js/volStateEngine.test.mjs

import assert from 'node:assert/strict';
import {
  volAcceleration, termStructureState, ivPremium, pathEfficiency,
  touchProbability, costRatio,
} from './volStateEngine.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

console.log('volStateEngine');

// ── volAcceleration ──────────────────────────────────────────────────────
{
  const flat = [0.01, 0.01, 0.01, 0.01, 0.01];
  const r = volAcceleration(flat);
  ok('flat series → d1≈0, label stable', r.d1 === 0 && r.label === 'stable', JSON.stringify(r));

  const accelerating = [0.008, 0.009, 0.0102, 0.012, 0.015];
  const rAcc = volAcceleration(accelerating);
  ok('rising+accelerating series flags accelerating or rising',
     ['accelerating', 'rising'].includes(rAcc.label), JSON.stringify(rAcc));
  ok('d1 positive on rising series', rAcc.d1 > 0, JSON.stringify(rAcc));

  const falling = [0.02, 0.018, 0.015, 0.011, 0.007];
  const rFall = volAcceleration(falling);
  ok('falling series → negative d1', rFall.d1 < 0, JSON.stringify(rFall));

  ok('too-short series → insufficient_data', volAcceleration([0.01, 0.01]).label === 'insufficient_data');
  ok('empty/undefined series does not throw', volAcceleration(undefined).label === 'insufficient_data');

  // purity: input array not mutated
  const before = [...accelerating];
  volAcceleration(accelerating);
  ok('does not mutate input array', JSON.stringify(before) === JSON.stringify(accelerating));
}

// ── termStructureState ───────────────────────────────────────────────────
{
  const expanding = termStructureState({ vol_pct: 40, cone_5d: 90, cone_21d: 70, cone_63d: 55 });
  ok('short vol >> long vol → expanding', expanding.label === 'expanding', JSON.stringify(expanding));
  ok('expanding + confirmed by 21d → inflection true', expanding.inflection === true, JSON.stringify(expanding));

  const compressing = termStructureState({ vol_pct: 60, cone_5d: 10, cone_21d: 30, cone_63d: 45 });
  ok('short vol << long vol → compressing', compressing.label === 'compressing', JSON.stringify(compressing));

  const stable = termStructureState({ vol_pct: 50, cone_5d: 52, cone_21d: 49, cone_63d: 50 });
  ok('near-equal percentiles → stable', stable.label === 'stable', JSON.stringify(stable));

  ok('missing cone_5d → insufficient_data', termStructureState({ vol_pct: 50 }).label === 'insufficient_data');
}

// ── ivPremium ─────────────────────────────────────────────────────────────
{
  const r = ivPremium(12, 8);
  ok('iv above realised → positive premium', r.premium === 4 && r.premium_pct === 50, JSON.stringify(r));
  const r2 = ivPremium(6, 8);
  ok('iv below realised → negative premium', r2.premium === -2, JSON.stringify(r2));
  ok('null iv → nulls, no throw', ivPremium(null, 8).premium === null);
  ok('zero realised → nulls, no throw (no div/0)', ivPremium(10, 0).premium === null);
}

// ── pathEfficiency ────────────────────────────────────────────────────────
{
  const open = 100;
  // Straight trend: monotonic closes, path length == net move → efficiency 1.
  const trendBars = [101, 102, 103, 104, 105].map(c => ({ mid: { c: String(c) } }));
  const trend = pathEfficiency(trendBars, open);
  ok('straight trend → efficiency ≈ 1', Math.abs(trend.efficiency - 1) < 1e-9, JSON.stringify(trend));

  // Round trip: up then back to open → net move 0 → efficiency 0.
  const chopBars = [105, 110, 108, 102, 100].map(c => ({ mid: { c: String(c) } }));
  const chop = pathEfficiency(chopBars, open);
  ok('round-trip back to open → efficiency 0', chop.efficiency === 0, JSON.stringify(chop));
  ok('chop path_length > trend path_length for same net move envelope', chop.path_length > trend.path_length);

  ok('too few bars → nulls, no throw', pathEfficiency([{ mid: { c: '101' } }], open).efficiency === null);
  ok('bad open → nulls, no throw', pathEfficiency(trendBars, 0).efficiency === null);
  ok('non-array bars → nulls, no throw', pathEfficiency(null, open).efficiency === null);
}

// ── touchProbability ──────────────────────────────────────────────────────
{
  ok('zero remaining distance → probability 1', touchProbability(0, 0.5, 0.5) === 1);
  ok('already through the level (negative) → probability 1', touchProbability(-0.1, 0.5, 0.5) === 1);

  const near = touchProbability(0.1, 1.0, 0.9);   // small distance, plenty of time+vol
  const far  = touchProbability(3.0, 1.0, 0.9);   // huge distance relative to vol/time
  ok('near target → high probability', near > 0.7, `near=${near}`);
  ok('far target → low probability', far < 0.05, `far=${far}`);
  ok('probability is monotonically decreasing in distance',
     touchProbability(0.5, 1, 0.5) > touchProbability(1.5, 1, 0.5));
  ok('probability is monotonically increasing in remaining time',
     touchProbability(1, 1, 0.9) > touchProbability(1, 1, 0.1));
  ok('invalid sigma → null, no throw', touchProbability(1, 0, 0.5) === null);
  ok('invalid remainingFrac → null, no throw', touchProbability(1, 1, 0) === null);

  // sanity bound: probability never exceeds 1 or drops below 0
  for (const [d, s, t] of [[0.01, 5, 1], [10, 0.01, 0.01], [0.0001, 0.0001, 1]]) {
    const p = touchProbability(d, s, t);
    ok(`bounded [0,1] for d=${d},s=${s},t=${t}`, p === null || (p >= 0 && p <= 1));
  }
}

// ── costRatio ─────────────────────────────────────────────────────────────
{
  ok('spread half of sigma → ratio 0.5', costRatio(0.05, 0.1) === 0.5);
  ok('zero spread → ratio 0', costRatio(0, 0.1) === 0);
  ok('zero sigma → null, no throw', costRatio(0.05, 0) === null);
  ok('negative spread → null, no throw', costRatio(-1, 0.1) === null);
}

console.log(failures === 0 ? `\nAll tests passed.` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
