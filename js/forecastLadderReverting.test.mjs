/**
 * Tests for the reverting weekly/monthly ladder (forge/HORIZON_REVERSION_PREREG.md).
 * About meaning, not shape: the √h ladder is the HL→∞ limit, a spike narrows the
 * bands, calm widens them, and the export stays parseable by the weekly indicator.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { revertingHorizonSigma, sigmaAndVbar, buildRevertingLadder } from './forecastLadderReverting.js';
import { REVERTING_PARAMS } from './forecastLadderRevertingParams.js';
import { computeForecast } from './volForecast.js';
import { buildLadderExportText } from './ladderExport.js';

const near = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;

test('infinite half-life reproduces the √h ladder exactly', () => {
  for (const span of [5, 20]) {
    assert.ok(near(revertingHorizonSigma(0.006, 0.000016, span, Infinity), 0.006 * Math.sqrt(span)));
  }
});

test('σ_t equal to its long-run level gives the √h answer at any half-life', () => {
  const s = 0.005;
  assert.ok(near(revertingHorizonSigma(s, s * s, 5, 5), s * Math.sqrt(5), 1e-15));
});

test('after a spike the band comes in; after a calm spell it widens', () => {
  const lr = 0.005, vbar = lr * lr;
  const spike = revertingHorizonSigma(0.010, vbar, 5, 5), calm = revertingHorizonSigma(0.0025, vbar, 5, 5);
  assert.ok(spike < 0.010 * Math.sqrt(5), 'spike must be narrower than √h');
  assert.ok(calm > 0.0025 * Math.sqrt(5), 'calm must be wider than √h');
  // and it never overshoots past the long-run level
  assert.ok(spike > lr * Math.sqrt(5) && calm < lr * Math.sqrt(5));
});

test('matches the Python arm-B formula (forge/run_horizon_reversion.horizon_sigma)', () => {
  // σ_h² = span·V̄ + (σ_t² − V̄)·Σφ^k — closed form for span 5, HL 5, by hand
  const sT = 0.008, vbar = 0.004 ** 2, phi = 0.5 ** (1 / 5);
  let geo = 0; for (let k = 0; k < 5; k++) geo += phi ** k;
  assert.ok(near(revertingHorizonSigma(sT, vbar, 5, 5), Math.sqrt(5 * vbar + (sT * sT - vbar) * geo)));
});

// Synthetic bars: a calm year then a volatile final month, so σ_t > long-run.
function bars(n = 400, calm = 0.003, wild = 0.012, wildFrom = 370) {
  let px = 1.10, seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  return Array.from({ length: n }, (_, i) => {
    const v = i >= wildFrom ? wild : calm, open = px, close = px * (1 + rnd() * 2 * v);
    px = close;
    return { time: 1.6e9 + i * 86400, open, high: Math.max(open, close) * (1 + v / 2),
             low: Math.min(open, close) * (1 - v / 2), close };
  });
}

test('sigmaAndVbar only uses bars it is given (no lookahead)', () => {
  const b = bars();
  const a = sigmaAndVbar(b.slice(0, 380), 'yz_10'), full = sigmaAndVbar(b, 'yz_10');
  const again = sigmaAndVbar(b.slice(0, 380), 'yz_10');
  assert.deepEqual(a, again);
  assert.notDeepEqual(a, full);
});

test('reverting ladder: ordered rungs, and narrower than √h after a vol spike', () => {
  const L = buildRevertingLadder(bars(), { instrument: 'EURUSD', horizon: 'weekly' });
  assert.ok(L, 'EURUSD has fitted reverting widths');
  for (const q of ['hl', 'oc', 'oh', 'ol']) {
    assert.ok(L[q].p50 < L[q].p75 && L[q].p75 < L[q].p90, `${q} rungs ordered`);
  }
  assert.ok(L.sigma_daily_pct > L.sigma_longrun_pct, 'fixture is in a spike');
  assert.ok(L.sigma_used_pct < L.sigma_sqrt_h_pct, 'σ_h below √h after a spike');
  assert.equal(L.event_mult, 1, 'null event tag → ×1.0');
});

test('unknown instrument → null, never a guessed width', () => {
  assert.equal(buildRevertingLadder(bars(), { instrument: 'NOT_A_PAIR', horizon: 'weekly' }), null);
});

test('every fitted pair has all 12 rungs for both horizons', () => {
  for (const [name, p] of Object.entries(REVERTING_PARAMS.pairs)) {
    for (const hz of ['weekly', 'monthly']) {
      for (const q of ['hl', 'oc', 'oh', 'ol']) {
        const w = p[hz]?.width?.[q];
        assert.ok(Array.isArray(w) && w.length === 3 && w[0] < w[1] && w[1] < w[2], `${name} ${hz} ${q}`);
      }
    }
  }
});

test('computeForecast carries both reverting ladders; export keeps the indicator headers', () => {
  const f = computeForecast(bars(), 'fx', 1.0, { instrument: 'EURUSD', eventTag: null });
  assert.ok(f.ladder_weekly_rev && f.ladder_monthly_rev);
  assert.ok(f.ladder_weekly, 'incumbent weekly ladder untouched');
  const txt = buildLadderExportText({ session_label: 'TEST', instruments: { EURUSD: f } }, 'weekly_rev');
  assert.match(txt, /WEEKLY \(REVERTING/);
  assert.match(txt, /── 5-Day \(Weekly\)/);      // pine/weekly_vol_overlay.pine section headers
  assert.match(txt, /── 20-Day \(Monthly\)/);
  const inc = buildLadderExportText({ session_label: 'TEST', instruments: { EURUSD: f } }, 'weekly');
  assert.notEqual(txt, inc, 'reverting numbers differ from the √h export');
  assert.doesNotMatch(inc, /REVERTING/, 'incumbent weekly export unchanged');
});
