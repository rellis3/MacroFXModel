// Unit tests for creditCore.js — synthetic series, no network.
// Run: node js/creditCore.test.mjs
import { creditFeatures, creditGateFromFeatures, creditGate } from './creditCore.js';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; } else { failed++; console.error('  ✗', msg); } };
const near = (a, b, tol, msg) => ok(a != null && Math.abs(a - b) <= tol, `${msg} (got ${a}, want ~${b})`);

// helpers to build oldest→newest series
const flat = (v, n) => Array.from({ length: n }, () => v);
const ramp = (v0, perStep, n) => Array.from({ length: n }, (_, i) => v0 + perStep * i);

// ── 1. Too little data → null ────────────────────────────────────────────────
ok(creditFeatures([]) === null, 'empty series returns null');
ok(creditFeatures(null) === null, 'null series returns null');

// ── 2. Level + bps conversion ────────────────────────────────────────────────
{
  const f = creditFeatures(flat(3.0, 30));
  ok(f != null, 'flat series returns features');
  near(f.levelBps, 300, 0, 'level 3.00pp → 300bps');
  ok(f.widening === 0, 'flat series → not widening');
}

// ── 3. Steadily widening series → positive velocity, high percentile ─────────
{
  const s = ramp(2.5, 0.02, 40);                       // rises 2.5 → ~3.28 over 40d
  const f = creditFeatures(s);
  ok(f.d5 > 0, 'rising series → positive 5d change');
  ok(f.widening === 1, 'rising series → widening=1');
  ok(f.pct != null && f.pct >= 90, `rising series → high percentile (got ${f.pct})`);
  ok(f.aboveAvg === true, 'rising series → above its 20d average');
  ok(f.daysInRegime >= 5, `rising series → persistent regime (got ${f.daysInRegime})`);
}

// ── 4. Tightening series → negative velocity, low percentile ─────────────────
{
  const s = ramp(4.0, -0.02, 40);
  const f = creditFeatures(s);
  ok(f.d5 < 0, 'falling series → negative 5d change');
  ok(f.widening === -1, 'falling series → widening=-1');
  ok(f.pct != null && f.pct <= 10, `falling series → low percentile (got ${f.pct})`);
}

// ── 5. Acceleration sign — convex (accelerating) widening ────────────────────
{
  // slow then fast widening → 5d slope increasing → accel +1
  const s = [...ramp(3.0, 0.005, 8), ...ramp(3.04, 0.05, 8)];
  const f = creditFeatures(s);
  ok(f.accel === 1, `convex widening → accel +1 (got ${f.accel})`);
}

// ── 6. nowValue / prevValue override the series tail (today's fresher print) ──
{
  const s = flat(3.0, 30);
  const f = creditFeatures(s, { nowValue: 3.25, prevValue: 3.10 });
  near(f.d1, 15, 0, 'prevValue drives 1d change (3.25-3.10=15bps)');
  near(f.levelBps, 325, 0, 'nowValue drives the level');
  ok(f.widening === 1, 'fresh jump → widening (d5 vs series tail)');
}

// ── 7. Quality spread (CCC − BB) + direction ─────────────────────────────────
{
  const f = creditFeatures(flat(3.0, 30), { cccNow: 7.8, bbNow: 2.1, cccPrev: 7.4, bbPrev: 2.05 });
  near(f.quality, 570, 0, 'CCC-BB = 7.8-2.1 = 5.70pp → 570bps');
  ok(f.qualityDir === 1, 'CCC decompressing vs BB → qualityDir +1');
}

// ── 8. Gate logic ────────────────────────────────────────────────────────────
{
  // widening + accelerating → RISK-OFF
  const g1 = creditGateFromFeatures({ widening: 1, accel: 1, pct: 60, levelBps: 350 });
  ok(g1.gate === 'RISK-OFF', `widening+accel → RISK-OFF (got ${g1.gate})`);
  // widening + stretched level (no accel) → RISK-OFF
  const g2 = creditGateFromFeatures({ widening: 1, accel: 0, pct: 85, levelBps: 350 });
  ok(g2.gate === 'RISK-OFF', `widening+stretched → RISK-OFF (got ${g2.gate})`);
  // widening, calm level, not accelerating → CAUTION
  const g3 = creditGateFromFeatures({ widening: 1, accel: 0, pct: 40, levelBps: 300 });
  ok(g3.gate === 'CAUTION', `widening only → CAUTION (got ${g3.gate})`);
  // tightening from a calm level → RISK-ON
  const g4 = creditGateFromFeatures({ widening: -1, accel: 0, pct: 30, levelBps: 300 });
  ok(g4.gate === 'RISK-ON', `tightening+calm → RISK-ON (got ${g4.gate})`);
  // tightening but still stretched → not the all-clear (NEUTRAL)
  const g5 = creditGateFromFeatures({ widening: -1, accel: 0, pct: 90, levelBps: 500 });
  ok(g5.gate === 'NEUTRAL', `tightening but stretched → NEUTRAL (got ${g5.gate})`);
  // flat → NEUTRAL
  const g6 = creditGateFromFeatures({ widening: 0, accel: 0, pct: 50, levelBps: 300 });
  ok(g6.gate === 'NEUTRAL', `flat → NEUTRAL (got ${g6.gate})`);
  ok(creditGateFromFeatures(null) === null, 'gate of null → null');
}

// ── 9. creditGate() convenience combines both ────────────────────────────────
{
  const g = creditGate(ramp(2.5, 0.03, 40));
  ok(g && g.gate && g.levelBps != null, 'creditGate() returns features + gate');
  ok(g.gate === 'RISK-OFF', `strong steady widen from high pct → RISK-OFF (got ${g.gate})`);
}

console.log(`\ncreditCore.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
