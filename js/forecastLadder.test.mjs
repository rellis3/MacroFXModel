/**
 * Tests for the fitted ladder — the properties that, if they broke, would leave the
 * bands looking perfectly plausible while being wrong. That is the failure mode this
 * whole rebuild exists to remove, so these assertions are about MEANING, not shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildLadder, flattenLadder, paramsFor, RUNGS } from './forecastLadder.js';
import { LADDER_PARAMS } from './forecastLadderParams.js';
import { SIGMA_ESTIMATORS } from './forecastSigma.js';

const SIGMA = 0.007;   // 0.7%/day

test('rungs are strictly ordered p50 < p75 < p90 for every quantity and instrument', () => {
  for (const name of Object.keys(LADDER_PARAMS.pairs)) {
    const L = buildLadder(SIGMA, { instrument: name });
    for (const q of ['hl', 'oc', 'oh', 'ol']) {
      if (!L[q]) continue;
      assert.ok(L[q].p50 < L[q].p75, `${name} ${q}: p50 !< p75`);
      assert.ok(L[q].p75 < L[q].p90, `${name} ${q}: p75 !< p90`);
    }
  }
});

test('the H-L rung is wider than the one-sided O-H / O-L rungs', () => {
  // A range contains both excursions by construction; a fit that inverted this
  // would mean the widths had been wired to the wrong realized column.
  for (const name of Object.keys(LADDER_PARAMS.pairs)) {
    const L = buildLadder(SIGMA, { instrument: name });
    for (const r of RUNGS) {
      if (L.hl?.[r] == null || L.oh?.[r] == null) continue;
      assert.ok(L.hl[r] > L.oh[r], `${name} ${r}: H-L not wider than O-H`);
      assert.ok(L.hl[r] > L.ol[r], `${name} ${r}: H-L not wider than O-L`);
    }
  }
});

test('the event multiplier is two-sided — quiet days below 1.0, event days above', () => {
  // The specific regression this guards: the old detectNewsMultiplier floored at 1.0
  // and so could never express a quiet day, which is about half the calendar.
  const quiet = buildLadder(SIGMA, { instrument: 'EURUSD', eventTag: 'none' });
  const nfp   = buildLadder(SIGMA, { instrument: 'EURUSD', eventTag: 'NFP' });
  assert.ok(quiet.event_mult < 1.0, `quiet multiplier ${quiet.event_mult} should be < 1`);
  assert.ok(nfp.event_mult > 1.0, `NFP multiplier ${nfp.event_mult} should be > 1`);
  assert.ok(nfp.hl.p50 > quiet.hl.p50);
});

test('an unknown event tag is a no-op, never a silent distortion', () => {
  const a = buildLadder(SIGMA, { instrument: 'EURUSD', eventTag: 'BANK_HOLIDAY_ON_MARS' });
  assert.equal(a.event_mult, 1);
});

test('weekly and monthly use their OWN fitted widths, not sqrt-scaled daily ones', () => {
  const d = buildLadder(SIGMA, { instrument: 'EURUSD', horizon: 'daily' });
  const w = buildLadder(SIGMA, { instrument: 'EURUSD', horizon: 'weekly' });
  assert.equal(w.width_source, 'fitted-weekly');
  // If it were sqrt-scaled the ratio would be exactly sqrt(5); the fitted width
  // differs because vol mean-reverts inside a week.
  const ratio = w.hl.p50 / d.hl.p50;
  assert.notEqual(Math.round(ratio * 1e6), Math.round(Math.sqrt(5) * 1e6));
  assert.ok(ratio > 1.5 && ratio < Math.sqrt(5) * 1.15, `weekly/daily ratio ${ratio} implausible`);
});

test('an instrument with no fitted params falls back to its class, flagged', () => {
  const f = paramsFor('SOMETHING_NEW', 'index');
  assert.equal(f.source, 'class-default');
  const L = buildLadder(SIGMA, { instrument: 'SOMETHING_NEW', assetClass: 'index' });
  assert.equal(L.params_source, 'class-default');
  assert.ok(L.hl.p50 > 0);
});

test('every shipped instrument carries the estimator its widths were fit against', () => {
  // Widths are quantiles of (realized / sigma) for ONE sigma series. A spec that
  // named an estimator this repo cannot compute would silently decalibrate.
  for (const [name, p] of Object.entries(LADDER_PARAMS.pairs)) {
    assert.ok(p.estimator, `${name} has no estimator`);
    assert.ok(SIGMA_ESTIMATORS[p.estimator], `${name}: unknown estimator ${p.estimator}`);
  }
});

test('shipped params are calibrated — last-fold OOS exceedance near nominal', () => {
  const target = { p50: 0.50, p75: 0.25, p90: 0.10 };
  const errs = { p50: [], p75: [], p90: [] };
  for (const p of Object.values(LADDER_PARAMS.pairs)) {
    for (const [k, v] of Object.entries(p.oos_exceed ?? {})) {
      const rung = k.slice(-3);
      if (target[rung] != null && v != null) errs[rung].push(Math.abs(v - target[rung]));
    }
  }
  for (const rung of ['p50', 'p75', 'p90']) {
    const mean = errs[rung].reduce((s, x) => s + x, 0) / errs[rung].length;
    assert.ok(mean < 0.05, `${rung} mean |OOS − nominal| = ${mean.toFixed(3)}, expected < 0.05`);
  }
});

test('JS sigma estimators reproduce the Python they were fit with', () => {
  const fx = JSON.parse(readFileSync(new URL('./forecastSigma.fixture.json', import.meta.url)));
  for (const [name, fn] of Object.entries(SIGMA_ESTIMATORS)) {
    const got = fn(fx.bars), want = fx.expected[name];
    for (let i = 0; i < want.length; i++) {
      const w = want[i], g = got[i];
      const wF = w !== null && Number.isFinite(w);
      assert.equal(wF, Number.isFinite(g), `${name}[${i}]: finite mismatch`);
      if (wF) assert.ok(Math.abs(w - g) / Math.abs(w) < 1e-10, `${name}[${i}]: ${w} vs ${g}`);
    }
  }
});

test('flattenLadder exposes all twelve rungs', () => {
  const flat = flattenLadder(buildLadder(SIGMA, { instrument: 'GOLD' }));
  assert.equal(Object.keys(flat).length, 12);
});
