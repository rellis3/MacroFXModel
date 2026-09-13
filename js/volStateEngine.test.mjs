// Synthetic, no-network unit tests for volStateEngine.js — proves each
// function is pure (same input → same output, no mutation) and behaves
// correctly on hand-built edge cases before it's wired into any live payload.
//
//   node js/volStateEngine.test.mjs

import assert from 'node:assert/strict';
import {
  volAcceleration, termStructureState, ivPremium, pathEfficiency,
  touchProbability, costRatio, medianTimeToTouch, rangeEfficiencyRatio,
  realisedSkew, amihudIlliquidity, carryToVol,
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

// ── medianTimeToTouch ─────────────────────────────────────────────────────
{
  // Both sides of every comparison below go through the function's own 3dp
  // rounding, so 1e-3 tolerance (not 1e-6) is the right bar — otherwise the
  // rounding itself trips the assertion, not a real mismatch.
  const Z50 = 0.6744897501960817;
  const r = medianTimeToTouch(1, 1);
  ok('median time-to-touch matches the closed-form constant',
     Math.abs(r.medianFrac - Math.pow(1 / Z50, 2)) < 1e-3, JSON.stringify(r));
  ok('p75 time is LONGER than median time (75% confidence needs more time than 50%)',
     r.p75Frac > r.medianFrac, JSON.stringify(r));

  const near = medianTimeToTouch(0.1, 1);
  const far  = medianTimeToTouch(2, 1);
  ok('closer target → shorter median time', near.medianFrac < far.medianFrac);

  const doubleSigma = medianTimeToTouch(1, 2);   // t ∝ 1/σ² for fixed distance
  ok('doubling σ quarters the median time (t ∝ 1/σ²)',
     Math.abs(doubleSigma.medianFrac - r.medianFrac / 4) < 1e-3,
     `double=${doubleSigma.medianFrac} r/4=${r.medianFrac / 4}`);

  ok('invalid σ → nulls, no throw', medianTimeToTouch(1, 0).medianFrac === null);
  ok('non-positive distance → nulls, no throw', medianTimeToTouch(0, 1).medianFrac === null);
  ok('negative σ → nulls, no throw', medianTimeToTouch(1, -1).medianFrac === null);
}

// ── rangeEfficiencyRatio ──────────────────────────────────────────────────
{
  // Gap-driven: the whole day-to-day move happens at the OPEN (a gap from
  // yesterday's close), then the session itself barely moves — so today's
  // OWN high-low range stays tiny and roughly CONSTANT regardless of the
  // gap size, while close-to-close still captures the full move. This is
  // the actual mechanism Parkinson misses (it only sees each day's own
  // H/L, never the gap between one day's close and the next day's open) —
  // an earlier draft of this test scaled the day's range WITH the move
  // itself, which defeats the point: if the range fully contains the move,
  // Parkinson tracks it just as well as close-to-close does, and the ratio
  // comes out flat/low instead of high. Varying gap size (+0.5%/+1.8%
  // alternating, not a constant return) also matters — a razor-smooth
  // constant-return ramp has ZERO close-to-close variance by definition.
  let p = 100;
  const trendBars = [];
  for (let i = 0; i < 25; i++) {
    const ret = i % 2 === 0 ? 0.005 : 0.018;
    const o = p * (1 + ret);   // gap from yesterday's close to today's open
    const c = o * 1.0002;      // today itself barely moves after opening
    trendBars.push({ open: o, high: Math.max(o, c) * 1.0001, low: Math.min(o, c) * 0.9999, close: c });
    p = c;
  }
  const trend = rangeEfficiencyRatio(trendBars, 20);
  ok('gap-driven moves with tight intraday ranges → ratio > 1, label trending',
     trend.ratio > 1.15 && trend.label === 'trending', JSON.stringify(trend));

  // Choppy: wide daily ranges, but closes keep reverting near the same level
  // (alternating ±0.1% off the previous close) — big ranges, little net progress.
  let base = 100;
  const choppyBars = [];
  for (let i = 0; i < 25; i++) {
    const c = base * (i % 2 === 0 ? 1.001 : 0.999);
    choppyBars.push({ open: base, high: base * 1.02, low: base * 0.98, close: c });
    base = c;
  }
  const choppy = rangeEfficiencyRatio(choppyBars, 20);
  ok('wide ranges with reverting closes → ratio < 1, label choppy',
     choppy.ratio < 0.85 && choppy.label === 'choppy', JSON.stringify(choppy));

  ok('too few bars → insufficient_data', rangeEfficiencyRatio(trendBars.slice(0, 5), 20).label === 'insufficient_data');
  ok('empty/undefined → insufficient_data, no throw', rangeEfficiencyRatio(undefined).label === 'insufficient_data');

  // purity: inputs not mutated
  const beforeLen = trendBars.length;
  rangeEfficiencyRatio(trendBars, 20);
  ok('does not mutate input array', trendBars.length === beforeLen);
}

// ── realisedSkew ──────────────────────────────────────────────────────────
{
  // Downside-heavy: down days move further than up days (JPY-cross-like).
  let p = 100;
  const downHeavy = [];
  for (let i = 0; i < 65; i++) {
    const o = p;
    p *= (i % 2 === 0) ? 1.005 : 0.985;   // up +0.5%, down -1.5%
    downHeavy.push({ open: o, high: Math.max(o, p) * 1.001, low: Math.min(o, p) * 0.999, close: p });
  }
  const dh = realisedSkew(downHeavy, 60);
  ok('bigger down-day moves → downside-heavy', dh.ratio > 1.15 && dh.label === 'downside-heavy', JSON.stringify(dh));

  // Upside-heavy: mirror — up days move further than down days.
  p = 100;
  const upHeavy = [];
  for (let i = 0; i < 65; i++) {
    const o = p;
    p *= (i % 2 === 0) ? 1.015 : 0.995;   // up +1.5%, down -0.5%
    upHeavy.push({ open: o, high: Math.max(o, p) * 1.001, low: Math.min(o, p) * 0.999, close: p });
  }
  const uh = realisedSkew(upHeavy, 60);
  ok('bigger up-day moves → upside-heavy', uh.ratio < (1 / 1.15) && uh.label === 'upside-heavy', JSON.stringify(uh));

  // Symmetric: equal-magnitude up/down alternation.
  p = 100;
  const symm = [];
  for (let i = 0; i < 65; i++) {
    const o = p;
    p *= (i % 2 === 0) ? 1.01 : 0.99;
    symm.push({ open: o, high: Math.max(o, p) * 1.001, low: Math.min(o, p) * 0.999, close: p });
  }
  const sy = realisedSkew(symm, 60);
  ok('equal-magnitude up/down → symmetric', sy.label === 'symmetric', JSON.stringify(sy));

  ok('too few bars → insufficient_data', realisedSkew(downHeavy.slice(0, 10), 60).label === 'insufficient_data');
  ok('empty/undefined → insufficient_data, no throw', realisedSkew(undefined).label === 'insufficient_data');
}

// ── amihudIlliquidity ─────────────────────────────────────────────────────
{
  const bars = [{ volume: 100 }, { volume: 150 }, { volume: 200 }];   // total 450
  const r = amihudIlliquidity(bars, 0.9);
  ok('range ÷ total volume', r.totalVolume === 450 && Math.abs(r.illiquidity - 0.9 / 450) < 1e-9, JSON.stringify(r));

  const thin  = amihudIlliquidity([{ volume: 10 }], 0.9);
  const thick = amihudIlliquidity([{ volume: 10000 }], 0.9);
  ok('same range, less volume → higher illiquidity', thin.illiquidity > thick.illiquidity);

  ok('zero total volume → illiquidity null (no div/0), volume still reported',
     amihudIlliquidity([{ volume: 0 }], 0.9).illiquidity === null);
  ok('missing volume field defaults to 0, does not throw',
     amihudIlliquidity([{}], 0.9).totalVolume === 0);
  ok('empty bars array → nulls, no throw', amihudIlliquidity([], 0.9).totalVolume === null);
  ok('non-array bars → nulls, no throw', amihudIlliquidity(null, 0.9).totalVolume === null);
  ok('negative rangePct → nulls, no throw', amihudIlliquidity(bars, -1).totalVolume === null);
}

// ── carryToVol ────────────────────────────────────────────────────────────
{
  ok('positive carry, ratio computed', carryToVol(3, 6) === 0.5, JSON.stringify(carryToVol(3, 6)));
  ok('negative carry (a genuine negative-carry pair) is NOT rejected, unlike costRatio',
     carryToVol(-2, 8) === -0.25, JSON.stringify(carryToVol(-2, 8)));
  ok('zero carry → ratio 0, not null', carryToVol(0, 8) === 0);
  ok('zero vol → null, no throw (no div/0)', carryToVol(3, 0) === null);
  ok('negative vol (invalid) → null, no throw', carryToVol(3, -8) === null);
  ok('null carry → null, no throw', carryToVol(null, 8) === null);
  ok('NaN carry → null, no throw', carryToVol(NaN, 8) === null);
  ok('undefined carry → null, no throw', carryToVol(undefined, 8) === null);
}

console.log(failures === 0 ? `\nAll tests passed.` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
