import test from 'node:test';
import assert from 'node:assert/strict';
import {
  driftPrecision, yearsToDetectDrift, carryDrift, driftVsCarry,
  driftComposition, driftAnatomy,
} from './driftAnatomy.js';

// ── Precision ────────────────────────────────────────────────────────────────

test('driftPrecision: SE is 1/sqrt(win) and t is d*sqrt(win)', () => {
  const p = driftPrecision(0.5, 14);
  assert.ok(Math.abs(p.se - 1 / Math.sqrt(14)) < 1e-4, `se=${p.se}`);
  assert.ok(Math.abs(p.t - 0.5 * Math.sqrt(14)) < 1e-3, `t=${p.t}`);
});

// The headline claim of the whole module: none of volForecast.js's DRIFT_BANDS
// thresholds clears the 2-sigma bar at win=14. If this ever fails, either the bands
// moved or the window did, and the readout's wording needs revisiting with it.
test('driftPrecision: every DRIFT_BANDS threshold is sub-significant at win=14', () => {
  for (const [word, min] of [['Mild', 0.15], ['Strong', 0.25], ['Very strong', 0.35], ['Extreme', 0.50]]) {
    const p = driftPrecision(min, 14);
    assert.equal(p.significant, false, `${word} (|d|=${min}) should NOT be significant, t=${p.t}`);
  }
  // …and "Extreme" is the closest to it, which is the honest ordering.
  assert.ok(driftPrecision(0.50, 14).t > driftPrecision(0.35, 14).t);
});

test('driftPrecision: significance flips exactly at |t| = 1.96', () => {
  const dCrit = 1.959963984540054 / Math.sqrt(14);
  assert.equal(driftPrecision(dCrit * 1.001, 14).significant, true);
  assert.equal(driftPrecision(dCrit * 0.999, 14).significant, false);
  assert.equal(driftPrecision(-dCrit * 1.001, 14).significant, true, 'sign-symmetric');
});

test('driftPrecision: daysToSignificance inverts the t-stat', () => {
  const d = 0.30;
  const n = driftPrecision(d, 14).daysToSignificance;
  // At that window length the reading would just clear the bar.
  assert.ok(driftPrecision(d, n).significant, `n=${n} should be enough`);
  assert.ok(!driftPrecision(d, n - 2).significant, `n-2=${n - 2} should not be`);
});

test('driftPrecision: CI straddles zero exactly when the reading is not significant', () => {
  const weak = driftPrecision(0.25, 14);
  assert.ok(weak.ci95[0] < 0 && weak.ci95[1] > 0, `CI ${weak.ci95} should contain 0`);
  const strong = driftPrecision(0.80, 14);
  assert.ok(strong.ci95[0] > 0, `CI ${strong.ci95} should exclude 0`);
});

test('driftPrecision: a longer window shrinks the error bar', () => {
  assert.ok(driftPrecision(0.3, 60).se < driftPrecision(0.3, 14).se);
  assert.ok(Math.abs(driftPrecision(0.3, 60).t) > Math.abs(driftPrecision(0.3, 14).t));
});

test('driftPrecision: unusable input returns nulls, never throws', () => {
  for (const bad of [[NaN, 14], [0.3, 1], [null, 14], [undefined, undefined]]) {
    const p = driftPrecision(bad[0], bad[1]);
    assert.equal(p.t, null);
    assert.equal(p.se, null);
  }
  assert.equal(driftPrecision(0, 14).daysToSignificance, null, 'zero drift is never resolvable');
});

// The two horizon statements must be the same statement. `daysToSignificance` works
// in d-units over a window; `yearsToDetectDrift` works in annualised %. Fed a
// CONSISTENT sigma — the one the drift ratio was actually divided by — they have to
// land on the same number of days, or one of the two formulas is wrong.
test('yearsToDetectDrift agrees with daysToSignificance on consistent inputs', () => {
  for (const d of [0.53, 0.30, 0.80, -0.45]) {
    const sigDailyPct = 0.9057;                       // any sigma, as long as it is the SAME one
    const pctPerDay   = d * sigDailyPct;
    const sigAnnPct   = sigDailyPct * Math.sqrt(252);
    const viaYears = yearsToDetectDrift(pctPerDay * 252, sigAnnPct) * 252;
    const viaWindow = driftPrecision(d, 14).daysToSignificance;
    // daysToSignificance ceils (you cannot observe a fractional day), so the
    // annualised form must land in the one-day window BELOW it — never above.
    assert.ok(viaYears <= viaWindow + 1e-6 && viaWindow - viaYears < 1.001,
      `d=${d}: ${viaYears.toFixed(3)} days annualised vs ${viaWindow} days windowed`);
  }
});

test('yearsToDetectDrift: short horizons survive rounding', () => {
  // A fixed 1-decimal round would report every one of these as 0.0.
  const y = yearsToDetectDrift(120.96, 14.377);
  assert.ok(y > 0, `${y}`);
  assert.ok(Math.abs(y * 252 - 13.68) < 0.5, `${(y * 252).toFixed(2)} days`);
});

test('yearsToDetectDrift: Merton horizon scales with (sigma/mu)^2', () => {
  // 8% annual vol, 5%/yr true drift -> ~10 years.
  const t = yearsToDetectDrift(5, 8);
  assert.ok(t > 9 && t < 11, `${t} years`);
  // Halving the drift quadruples the horizon.
  assert.ok(Math.abs(yearsToDetectDrift(2.5, 8) / t - 4) < 0.05);
  // Sign does not matter — it is a magnitude question.
  assert.equal(yearsToDetectDrift(-5, 8), t);
  assert.equal(yearsToDetectDrift(0, 8), null);
  assert.equal(yearsToDetectDrift(5, 0), null);
});

// ── Carry ────────────────────────────────────────────────────────────────────

test('carryDrift: CIP sign — the higher-rate currency is at a forward discount', () => {
  // EURUSD, base EUR 2%, quote USD 4%. USD pays more, so the forward sits ABOVE
  // spot: more USD per EUR later. Forward-implied spot drift is POSITIVE.
  const c = carryDrift(2.0, 4.0);
  assert.ok(c.fwdDriftPctPerDay > 0, `${c.fwdDriftPctPerDay}`);
  assert.equal(c.fwdDriftPctPerYear, 2);
  assert.ok(Math.abs(c.fwdDriftPctPerDay - 2 / 252) < 1e-5);
});

test('carryDrift: the accrual leg is the exact mirror of the forward drift', () => {
  const c = carryDrift(4.0, 1.5);
  assert.ok(Math.abs(c.fwdDriftPctPerDay + c.carryAccrualPctPerDay) < 1e-9);
  // Long the HIGH-rate base earns positive accrual.
  assert.ok(c.carryAccrualPctPerDay > 0, `${c.carryAccrualPctPerDay}`);
});

test('carryDrift: level rates give exactly zero drift, not a near-miss', () => {
  const c = carryDrift(3.25, 3.25);
  assert.equal(c.fwdDriftPctPerDay, 0);
  assert.equal(c.diffPct, 0);
});

test('carryDrift: missing rates return nulls', () => {
  assert.equal(carryDrift(NaN, 4).fwdDriftPctPerDay, null);
  assert.equal(carryDrift(2, undefined).fwdDriftPctPerDay, null);
});

test('driftVsCarry: a huge move against a tiny differential reads as repricing', () => {
  const c = carryDrift(2.0, 4.0);                       // +0.0079%/day
  const v = driftVsCarry(-0.48, c.fwdDriftPctPerDay);   // observed -0.48%/day
  assert.ok(v.multiple < -20, `multiple=${v.multiple}`);
  assert.equal(v.withCarry, false);
  assert.match(v.label, /repricing/);
  assert.ok(Math.abs(v.excessPctPerDay - (-0.48 - c.fwdDriftPctPerDay)) < 1e-4);
});

test('driftVsCarry: a carry-scale move in the carry direction is labelled as such', () => {
  const c = carryDrift(2.0, 4.0);
  const v = driftVsCarry(c.fwdDriftPctPerDay * 2, c.fwdDriftPctPerDay);
  assert.equal(v.multiple, 2);
  assert.equal(v.withCarry, true);
  assert.match(v.label, /carry-scale/);
});

test('driftVsCarry: a zero differential does not manufacture an infinite multiple', () => {
  const v = driftVsCarry(-0.48, 0);
  assert.equal(v.multiple, null);
  assert.ok(Number.isFinite(v.excessPctPerDay));
  assert.match(v.label, /no rate differential/);
});

// ── Composition ──────────────────────────────────────────────────────────────

const zeros = n => new Array(n).fill(0);

test('driftComposition: no jumps -> the whole drift is diffusive', () => {
  const daily = new Array(14).fill(-0.0048);
  const c = driftComposition(daily, zeros(14));
  assert.equal(c.jumpShare, 0);
  assert.equal(c.jumpDays, 0);
  assert.ok(Math.abs(c.contPctPerDay - (-0.48)) < 1e-3, `${c.contPctPerDay}`);
  assert.equal(c.label, 'diffusive grind');
});

test('driftComposition: a trend delivered entirely by two jumps', () => {
  const daily = zeros(14), jump = zeros(14);
  daily[3] = -0.04; jump[3] = -0.04;
  daily[9] = -0.028; jump[9] = -0.028;
  const c = driftComposition(daily, jump);
  assert.ok(Math.abs(c.jumpShare - 1) < 1e-6, `share=${c.jumpShare}`);
  assert.equal(c.jumpDays, 2);
  assert.ok(Math.abs(c.contPctPerDay) < 1e-6, 'no diffusive residue');
  assert.match(c.label, /event-driven/);
});

test('driftComposition: jump and grind components sum back to the total', () => {
  const daily = [-0.01, -0.002, -0.031, 0.004, -0.008, -0.019, 0.002,
                 -0.005, -0.012, -0.001, -0.026, 0.003, -0.007, -0.004];
  const jump  = [0, 0, -0.025, 0, 0, -0.011, 0, 0, 0, 0, -0.02, 0, 0, 0];
  const c = driftComposition(daily, jump);
  assert.ok(Math.abs(c.jumpPctPerDay + c.contPctPerDay - c.muPctPerDay) < 1e-3);
  assert.equal(c.jumpDays, 3);
  assert.equal(c.n, 14);
});

test('driftComposition: share is NOT clamped — opposing jumps read negative', () => {
  // The grind is bearish; the one jump went the other way.
  const daily = zeros(14).map(() => -0.006);
  const jump = zeros(14); jump[5] = +0.012; daily[5] = +0.012;
  const c = driftComposition(daily, jump);
  assert.ok(c.jumpShare < 0, `share=${c.jumpShare} should be negative`);
  assert.match(c.label, /against opposing jumps/);
});

test('driftComposition: share above 1 when jumps carried a trend the grind opposed', () => {
  const daily = zeros(14).map(() => +0.001);
  const jump = zeros(14);
  daily[7] = -0.05; jump[7] = -0.06;   // jump bigger than the day's net move
  const c = driftComposition(daily, jump);
  assert.ok(c.jumpShare > 1.05, `share=${c.jumpShare}`);
  assert.match(c.label, /jumps alone/);
});

test('driftComposition: a flat series has no composition to report', () => {
  const c = driftComposition(zeros(14), zeros(14));
  assert.equal(c.jumpShare, null);
  assert.match(c.label, /no net drift/);
});

test('driftComposition: mismatched or empty inputs return nulls, never throw', () => {
  assert.equal(driftComposition([1, 2, 3], [1, 2]).n, 0);
  assert.equal(driftComposition([], []).n, 0);
  assert.equal(driftComposition(null, null).n, 0);
});

test('driftComposition: non-finite entries are skipped, not propagated', () => {
  const daily = [-0.01, NaN, -0.01, -0.01];
  const jump  = [0, 0, 0, 0];
  const c = driftComposition(daily, jump);
  assert.equal(c.n, 3);
  assert.ok(Number.isFinite(c.muPctPerDay));
});

// ── Composer ─────────────────────────────────────────────────────────────────

test('driftAnatomy: precision always present; optional blocks null without data', () => {
  const a = driftAnatomy({ d: -0.53, pctPerDay: -0.48, win: 14 });
  assert.ok(a.precision.t < 0);
  assert.equal(a.carry, null);
  assert.equal(a.composition, null);
  assert.match(a.text, /t = -1\.98/);
});

test('driftAnatomy: attaches carry and composition when the data is supplied', () => {
  const daily = zeros(14).map(() => -0.0048);
  const jump  = zeros(14); jump[2] = -0.03; daily[2] = -0.03;
  const a = driftAnatomy({
    d: -0.53, pctPerDay: -0.48, win: 14,
    rates: { basePct: 2.0, quotePct: 4.0 },
    returns: { daily, jump },
    sigmaAnnualPct: 14.377,          // the sigma d=-0.53 / -0.48%/day actually implies
  });
  assert.ok(a.carry.multiple < 0);
  assert.ok(a.composition.jumpShare > 0);
  assert.ok(a.yearsToDetect > 0);
  assert.match(a.text, /carry/);
  assert.match(a.text, /jump-delivered/);
});

test('driftAnatomy: a sub-significant reading says so in the text', () => {
  const a = driftAnatomy({ d: 0.25, pctPerDay: 0.22, win: 14 });
  assert.match(a.text, /not distinguishable from zero/);
});

test('driftAnatomy: returns a stable shape on empty input', () => {
  const a = driftAnatomy({});
  for (const k of ['precision', 'carry', 'composition', 'yearsToDetect', 'text']) {
    assert.ok(k in a, `missing ${k}`);
  }
  assert.equal(a.text, null);
});
