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

// A stretched-up reading, still near its extreme (extending). surprise carries
// the path fields the server now computes: dispPct/peakPct/reversing.
const base = {
  pair: 'GOLD', anchor: 2400, p75Lo: 2390, p75Hi: 2410, p75HalfPct: 0.42,
  driftBp: 3, upcomingEvents: [], trustHours: [], shakyHours: [],
  dayBudget: { hour: 10, reliable: false }, calib: { n: 460 },
  surprise: { pct: 94, z: 1.8, dispPct: 0.62, peakPct: 0.66, retraceFrac: 0.06, reversing: false },
};
const sup = (o) => ({ ...base, surprise: { ...base.surprise, ...o } });

// No surprise + no reliable budget → null.
ok(detectSurprise({ ...base, surprise: null, dayBudget: { hour: 10, reliable: false } }) === null, 'no surprise, no budget → no alert');

// Mid-cone, budget not extreme → null.
ok(detectSurprise(sup({ pct: 55, z: 0.2 })) === null, 'mid-cone → no alert');

// STRETCHED UP, extending.
{
  const d = detectSurprise(base);
  ok(d && d.category === 'stretched' && d.direction === 'up' && d.phase === 'extending', 'high pct → stretched up, extending');
  ok(d.text.includes('stretched up') && d.text.includes('stretched to the upside'), 'stretched-up wording');
  ok(d.text.includes('near its intraday extreme'), 'extending mentions still near extreme');
  ok(d.text.includes('👉 <b>Next:</b>') && d.text.toLowerCase().includes('not a signal'), 'has next-steps, not-a-signal');
  ok(d.dedupeKey === 'stretched:extending', 'dedupeKey carries phase');
  ok(d.severity === 1, 'severity 1 in [90,95)');
}

// STRETCHED DOWN (low pct) is NOT quiet — it's a big down move.
{
  const d = detectSurprise({ ...base, pair: 'EURUSD', anchor: 1.095, p75Lo: 1.0932, p75Hi: 1.0968,
    surprise: { pct: 6, z: -1.9, dispPct: -0.55, peakPct: -0.58, retraceFrac: 0.05, reversing: false } });
  ok(d && d.category === 'stretched' && d.direction === 'down', 'low pct → stretched DOWN (not quiet)');
  ok(d.text.includes('stretched down') && d.text.includes('downside'), 'stretched-down wording');
  ok(!d.text.includes('tend to expand'), 'a down move is not framed as quiet/expansion');
}

// REVERSING: pulled back from the intraday extreme → late-fade wording.
{
  const d = detectSurprise(sup({ pct: 93, z: 2.0, dispPct: 0.77, peakPct: 1.5, retraceFrac: 0.49, reversing: true }));
  ok(d.category === 'stretched' && d.phase === 'reversing', 'reversing phase');
  ok(d.text.includes('now reversing') && d.text.includes('already started reversing'), 'reversing headline + lead');
  ok(d.text.includes('+1.50%') && d.text.includes('+0.77%'), 'quotes peak and current displacement');
  ok(d.text.toLowerCase().includes('late') && d.text.includes("don't chase"), 'late-fade next-steps');
  ok(d.dedupeKey === 'stretched:reversing', 'reversing has a distinct dedupe key');
}

// TRUE quiet = compressed range budget (NOT the displacement pct).
{
  const d = detectSurprise({ ...base, pair: 'EURUSD', anchor: 1.095, p75Lo: 1.0940, p75Hi: 1.0960,
    surprise: { pct: 52, z: 0.1, dispPct: 0.02, peakPct: 0.05, retraceFrac: 0.2, reversing: false },
    dayBudget: { hour: 10, reliable: true, consumedPercentile: 12, rangeSoFarPct: 0.18, typicalFullPct: 0.9 } });
  ok(d && d.category === 'quiet', 'low range budget → quiet');
  ok(d.text.includes('quiet / compressed') && d.text.includes('tend to expand'), 'quiet wording from budget');
  ok(d.text.includes('1.0940') && d.text.includes('1.0960'), 'quiet next-steps quotes range edges');
  ok(d.text.includes('coin flip'), 'quiet reminds direction is a coin flip');
}

// Quiet needs a RELIABLE budget.
ok(detectSurprise({ ...base, surprise: { pct: 50, z: 0 }, dayBudget: { hour: 10, reliable: false, consumedPercentile: 5 } }) === null, 'unreliable budget → no quiet alert');

// Severity ramps with tail depth (stretched).
ok(detectSurprise(sup({ pct: 96, z: 2.1 })).severity === 2, 'severity 2 at 96');
ok(detectSurprise(sup({ pct: 99, z: 3.0 })).severity === 3, 'severity 3 at 99');

// Magnitude floor: extreme pct but tiny z → suppressed (guards thin cones).
ok(detectSurprise(sup({ pct: 93, z: 0.5 })) === null, 'z below floor suppresses');

// Calibration guard: too few windows → no stretch (and no reliable budget here).
ok(detectSurprise({ ...base, calib: { n: 40 }, surprise: { pct: 97, z: 2.5, reversing: false } }) === null, 'thin calibration suppresses stretch');

// Event context line + event-aware next-steps.
{
  const d = detectSurprise({ ...sup({ pct: 95, z: 2.0 }), upcomingEvents: ['13:30Z'] });
  ok(d.text.includes('Event near/inside') && d.text.includes('13:30Z'), 'event context line');
  ok(d.text.includes('event moves') || d.text.includes('event in the window'), 'event-aware next-step');
}

// Shaky-hour caveat (stretched only).
{
  const d = detectSurprise({ ...sup({ pct: 95, z: 2.0 }), shakyHours: [10] });
  ok(d.text.includes('less reliable'), 'shaky-hour caveat present');
}

// Day-budget reinforcement (stretched + high consumed).
{
  const d = detectSurprise({ ...sup({ pct: 95, z: 2.0 }),
    dayBudget: { hour: 10, reliable: true, consumedPercentile: 88, rangeSoFarPct: 1.1 } });
  ok(d.text.includes('already travelled') && d.text.includes('88th'), 'budget reinforcement');
}

// Dedupe (keys are opaque strings — category or category:phase).
{
  const now = 1_700_000_000, gap = SURPRISE_DEFAULTS.minGapMin * 60;
  let st = {};
  ok(shouldFire(st, 'GOLD', 'stretched:extending', now, gap) === true, 'first fire allowed');
  st = recordFired(st, 'GOLD', 'stretched:extending', now);
  ok(shouldFire(st, 'GOLD', 'stretched:extending', now + 600, gap) === false, 'within gap suppressed');
  ok(shouldFire(st, 'GOLD', 'stretched:reversing', now + 600, gap) === true, 'reversing transition fires through the gap');
  ok(shouldFire(st, 'GOLD', 'stretched:extending', now + gap + 1, gap) === true, 'after gap allowed');
  ok(shouldFire(st, 'EURUSD', 'stretched:extending', now + 600, gap) === true, 'other pair independent');
}

console.log(`surpriseAlertCore.test.mjs — all assertions passed (${passed} checks)`);
