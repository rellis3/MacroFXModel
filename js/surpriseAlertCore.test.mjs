/**
 * surpriseAlertCore unit tests — synthetic, no network, no clock.
 * Run: node js/surpriseAlertCore.test.mjs
 */
import assert from 'node:assert/strict';
import {
  detectSurprise, shouldFire, recordFired, SURPRISE_DEFAULTS,
} from './surpriseAlertCore.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };

const base = {
  pair: 'GOLD', anchor: 2400, p75Lo: 2390, p75Hi: 2410, p75HalfPct: 0.42,
  driftBp: 3, upcomingEvents: [], trustHours: [], shakyHours: [],
  dayBudget: { hour: 10, reliable: false }, calib: { n: 460 },
};

// No surprise object → null.
ok(detectSurprise({ ...base, surprise: null }) === null, 'null surprise → no alert');

// Mid-cone → null.
ok(detectSurprise({ ...base, surprise: { pct: 55, z: 0.2 } }) === null, 'mid-cone → no alert');

// STRETCHED: high pct + positive z.
{
  const d = detectSurprise({ ...base, surprise: { pct: 94, z: 1.8 } });
  ok(d && d.category === 'stretched', 'high pct → stretched');
  ok(d.text.includes('94th pct') && d.text.includes('continuation is statistically stretched'), 'stretched lead text');
  ok(d.text.includes('👉 <b>Next:</b>') && d.text.toLowerCase().includes('not a signal'), 'has next-steps, not-a-signal');
  ok(d.severity === 1, 'severity 1 in [90,95)');
}

// QUIET: low pct + negative z, plus range edges appear in next-steps.
{
  const d = detectSurprise({ ...base, pair: 'EURUSD', anchor: 1.095, p75Lo: 1.0932, p75Hi: 1.0968,
    surprise: { pct: 6, z: -1.9 } });
  ok(d && d.category === 'quiet', 'low pct → quiet');
  ok(d.text.includes('tend to expand'), 'quiet lead text');
  ok(d.text.includes('1.0932') && d.text.includes('1.0968'), 'quiet next-steps quotes range edges');
  ok(d.text.includes('coin flip'), 'quiet reminds direction is a coin flip');
}

// Severity ramps with tail depth.
ok(detectSurprise({ ...base, surprise: { pct: 96, z: 2.1 } }).severity === 2, 'severity 2 at 96');
ok(detectSurprise({ ...base, surprise: { pct: 99, z: 3.0 } }).severity === 3, 'severity 3 at 99');

// Magnitude floor: extreme pct but tiny z → suppressed (guards thin cones).
ok(detectSurprise({ ...base, surprise: { pct: 93, z: 0.5 } }) === null, 'z below floor suppresses');

// Calibration guard: too few windows → null even at an extreme.
ok(detectSurprise({ ...base, calib: { n: 40 }, surprise: { pct: 97, z: 2.5 } }) === null, 'thin calibration suppresses');

// Event context line + event-aware next-steps.
{
  const d = detectSurprise({ ...base, upcomingEvents: ['13:30Z'], surprise: { pct: 95, z: 2.0 } });
  ok(d.text.includes('Event near/inside') && d.text.includes('13:30Z'), 'event context line');
  ok(d.text.includes('event moves') || d.text.toLowerCase().includes('event can') || d.text.includes('event in the window'), 'event-aware next-step');
}

// Shaky-hour caveat.
{
  const d = detectSurprise({ ...base, shakyHours: [10], dayBudget: { hour: 10, reliable: false }, surprise: { pct: 95, z: 2.0 } });
  ok(d.text.includes('less reliable'), 'shaky-hour caveat present');
}

// Day-budget reinforcement (stretched + high consumed).
{
  const d = detectSurprise({ ...base, dayBudget: { hour: 10, reliable: true, consumedPercentile: 88, rangeSoFarPct: 1.1 },
    surprise: { pct: 95, z: 2.0 } });
  ok(d.text.includes('already travelled') && d.text.includes('88th'), 'budget reinforcement');
}

// Dedupe.
{
  const now = 1_700_000_000, gap = SURPRISE_DEFAULTS.minGapMin * 60;
  let st = {};
  ok(shouldFire(st, 'GOLD', 'stretched', now, gap) === true, 'first fire allowed');
  st = recordFired(st, 'GOLD', 'stretched', now);
  ok(shouldFire(st, 'GOLD', 'stretched', now + 600, gap) === false, 'within gap suppressed');
  ok(shouldFire(st, 'GOLD', 'stretched', now + gap + 1, gap) === true, 'after gap allowed');
  ok(shouldFire(st, 'GOLD', 'quiet', now + 600, gap) === true, 'other category independent');
  ok(shouldFire(st, 'EURUSD', 'stretched', now + 600, gap) === true, 'other pair independent');
}

console.log(`surpriseAlertCore.test.mjs — all assertions passed (${passed} checks)`);
