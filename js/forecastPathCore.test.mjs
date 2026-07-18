/**
 * forecastPathCore unit tests — synthetic GBM data, no network.
 * Run: node js/forecastPathCore.test.mjs
 *
 * Contracts under test:
 *   1. No lookahead — the cone at i is unchanged when every bar ≥ i mutates.
 *   2. Cone shape — envelopes widen monotonically with h and straddle the center.
 *   3. Calibration on well-specified synthetic data — containment near the
 *      claimed 50% / 75% (wide tolerance; it's a sanity floor, not a fit).
 *   4. samplePaths determinism (same seed ⇒ identical) + consensus ≈ drift path.
 *   5. nextWeekday skips weekends.
 */
import assert from 'node:assert/strict';
import {
  buildForecastContext, coneFromContext, forecastCone, samplePaths,
  calibrationTally, nextWeekday, PATH_DEFAULTS,
  buildIntradayContext, intradayCone, intradaySamplePaths, intradayTally,
  profileMult, INTRADAY_DEFAULTS, intradayRealizedZ, normCdf,
} from './forecastPathCore.js';

// ── Synthetic GBM daily bars (seeded) ────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function syntheticBars(n, { sigma = 0.006, mu = 0, seed = 7 } = {}) {
  const rng = mulberry32(seed);
  const bars = [];
  let c = 1.1000;
  let d = new Date('2018-01-02T00:00:00Z');
  for (let i = 0; i < n; i++) {
    const open = c;
    const close = open * Math.exp(mu + sigma * gauss(rng));
    const hi = Math.max(open, close) * (1 + 0.4 * sigma * Math.abs(gauss(rng)));
    const lo = Math.min(open, close) * (1 - 0.4 * sigma * Math.abs(gauss(rng)));
    bars.push({ time: d.toISOString().substring(0, 10), open, high: hi, low: lo, close });
    c = close;
    do { d = new Date(d.getTime() + 86400e3); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  }
  return bars;
}

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }

const bars = syntheticBars(1200);

// 1) No lookahead: mutate everything from i onward → cone identical.
{
  const i = 800, H = 10;
  const a = forecastCone(bars, i, { horizonDays: H });
  const mutated = bars.map((b, k) => k >= i ? { ...b, open: 9, high: 9.9, low: 8, close: 9.5 } : b);
  const b = forecastCone(mutated, i, { horizonDays: H });
  ok(a && b, 'cones computed');
  assert.deepEqual(
    { anchor: a.anchor, sigma: a.sigma, mu: a.mu, trend: a.trendScore,
      steps: a.steps.map(s => [s.center, s.p50Up, s.p75Dn]) },
    { anchor: b.anchor, sigma: b.sigma, mu: b.mu, trend: b.trendScore,
      steps: b.steps.map(s => [s.center, s.p50Up, s.p75Dn]) },
    'no lookahead: future bars must not affect the cone');
  passed++;
}

// 2) Cone shape: widening with h, ordered envelopes, live cone works.
{
  const ctx = buildForecastContext(bars);
  const cone = coneFromContext(ctx, 800, 10);
  let prevW50 = 0, prevW75 = 0;
  for (const s of cone.steps) {
    const w50 = s.p50Up - s.p50Dn, w75 = s.p75Up - s.p75Dn;
    ok(w75 > w50, `p75 wider than p50 at h=${s.h}`);
    ok(w50 > prevW50 && w75 > prevW75, `cone widens at h=${s.h}`);
    ok(s.p50Dn < s.center && s.center < s.p50Up, `center inside envelope at h=${s.h}`);
    prevW50 = w50; prevW75 = w75;
  }
  const live = coneFromContext(ctx, bars.length, 5);
  ok(live && live.steps.length === 5 && live.anchor === bars[bars.length - 1].close, 'live cone (i = n) anchors on last close');
  ok(live.steps.every(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date)), 'live cone dates are YYYY-MM-DD');
}

// 3) Calibration on driftless synthetic GBM: containment near claims.
{
  const t = calibrationTally(bars, { horizonDays: 5 });
  ok(t.full.n >= 30, `enough non-overlapping windows (${t.full.n})`);
  for (const s of t.full.perStep) {
    ok(s.c50 > 0.30 && s.c50 < 0.70, `P50 containment sane at h=${s.h} (${s.c50.toFixed(2)})`);
    ok(s.c75 > 0.55 && s.c75 < 0.92, `P75 containment sane at h=${s.h} (${s.c75.toFixed(2)})`);
  }
  ok(t.recent.n >= 5 && t.recent.perStep.length === 5, 'recent slice tallied');
  ok(t.claimed.p50 === 0.5 && t.claimed.p75 === 0.75, 'claims stated');
}

// 4) samplePaths: deterministic, right shape, consensus tracks the drift path.
{
  const ctx = buildForecastContext(bars);
  const a = samplePaths(ctx, 800, 10);
  const b = samplePaths(ctx, 800, 10);
  assert.deepEqual(a, b, 'same seed ⇒ identical paths'); passed++;
  ok(a.paths.length === PATH_DEFAULTS.nPaths && a.paths[0].length === 10, 'nPaths × H candles');
  for (const p of a.paths) for (const c of p) ok(c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close), 'valid OHLC');
  const cone = coneFromContext(ctx, 800, 10);
  const last = a.consensus[9], center = cone.steps[9].center;
  ok(Math.abs(last.close - center) / center < 0.01, `consensus ≈ drift path (${last.close.toFixed(5)} vs ${center.toFixed(5)})`);
  const c = samplePaths(ctx, 800, 10, { seed: 99 });
  ok(c.paths[0][0].close !== a.paths[0][0].close, 'different seed ⇒ different paths');
}

// 5) nextWeekday skips weekends.
{
  assert.equal(nextWeekday('2026-07-17'), '2026-07-20'); passed++;   // Fri → Mon
  assert.equal(nextWeekday('2026-07-14'), '2026-07-15'); passed++;   // Tue → Wed
}

// ── Intraday: synthetic M15 bars with a KNOWN hour-of-day vol regime ─────────
// Weekday-only 15-min grid; σ doubles during 07–15 UTC ("London"), halves off.
function syntheticM15(nDays, { sigmaQuiet = 0.0004, loudMult = 2, seed = 11 } = {}) {
  const rng = mulberry32(seed);
  const bars = [];
  let c = 1.1000;
  const d = new Date('2026-03-02T00:00:00Z');   // a Monday
  for (let day = 0; day < nDays; day++) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    for (let k = 0; k < 96; k++) {
      const t = d.getTime() / 1000 + k * 900;
      const hr = new Date(t * 1000).getUTCHours();
      const sig = sigmaQuiet * (hr >= 7 && hr < 15 ? loudMult : 1);
      const open = c;
      const close = open * Math.exp(sig * gauss(rng));
      const hi = Math.max(open, close) * (1 + 0.3 * sig * Math.abs(gauss(rng)));
      const lo = Math.min(open, close) * (1 - 0.3 * sig * Math.abs(gauss(rng)));
      bars.push({ time: t, open, high: hi, low: lo, close });
      c = close;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return bars;
}
const m15 = syntheticM15(55);   // ~5280 bars

// 6) Intraday no-lookahead: mutate everything from i onward → cone identical.
{
  const i = 3000, H = 16;
  const ctxA = buildIntradayContext(m15);
  const mutated = m15.map((b, k) => k >= i ? { ...b, open: 9, high: 9.9, low: 8, close: 9.5 } : b);
  const ctxB = buildIntradayContext(mutated);
  const a = intradayCone(ctxA, i, H), b = intradayCone(ctxB, i, H);
  assert.deepEqual(
    { anchor: a.anchor, s: a.sigmaBar, mu: a.mu, steps: a.steps.map(s => [s.center, s.p50Up, s.p75Dn]) },
    { anchor: b.anchor, s: b.sigmaBar, mu: b.mu, steps: b.steps.map(s => [s.center, s.p50Up, s.p75Dn]) },
    'intraday no lookahead'); passed++;
}

// 7) Hour-of-day profile recovers the 2× loud/quiet regime (causally).
{
  const ctx = buildIntradayContext(m15);
  const i = 4000;
  const loud = profileMult(ctx, i, 10), quiet = profileMult(ctx, i, 20);
  const ratio = loud / quiet;
  ok(ratio > 1.6 && ratio < 2.4, `profile recovers ~2× loud/quiet (got ${ratio.toFixed(2)})`);
  ok(profileMult(ctx, 50, 10) === 1, 'profile is 1 before enough observations');
}

// 8) Intraday cone shape + widening, and the loud-hours steps widen FASTER.
{
  const ctx = buildIntradayContext(m15);
  const cone = intradayCone(ctx, 3000, 16);
  let prevW = 0;
  for (const s of cone.steps) {
    const w = s.p75Up - s.p75Dn;
    ok(w > prevW, `intraday cone widens at h=${s.h}`);
    ok(s.p50Dn < s.center && s.center < s.p50Up, `center inside at h=${s.h}`);
    prevW = w;
  }
  const live = intradayCone(ctx, m15.length, 8);
  ok(live && live.anchor === m15[m15.length - 1].close, 'live intraday cone anchors on last close');
  for (const s of live.steps) {
    const day = new Date(s.time * 1000).getUTCDay();
    ok(day !== 6, 'live cone step never lands on Saturday');
  }
}

// 9) Intraday calibration near claims on well-specified synthetic data.
{
  const t = intradayTally(m15, { horizonBars: 16 });
  ok(t.full.n >= 100, `enough intraday windows (${t.full.n})`);
  for (const s of t.full.perStep) {
    ok(s.c50 > 0.35 && s.c50 < 0.65, `intraday P50 sane at h=${s.h} (${s.c50.toFixed(2)})`);
    ok(s.c75 > 0.60 && s.c75 < 0.90, `intraday P75 sane at h=${s.h} (${s.c75.toFixed(2)})`);
  }
  ok(t.claimed.p50 === 0.5 && t.claimed.p75 === 0.75, 'intraday claims stated');
}

// 10) Intraday sample paths: deterministic, valid OHLC, consensus ≈ drift path.
{
  const ctx = buildIntradayContext(m15);
  const a = intradaySamplePaths(ctx, 3000, 16);
  const b = intradaySamplePaths(ctx, 3000, 16);
  assert.deepEqual(a, b, 'intraday same seed ⇒ identical'); passed++;
  ok(a.paths.length === INTRADAY_DEFAULTS.nPaths && a.paths[0].length === 16, 'nPaths × H intraday candles');
  for (const p of a.paths) for (const c of p) ok(c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close), 'valid intraday OHLC');
  const cone = intradayCone(ctx, 3000, 16);
  const last = a.consensus[15], center = cone.steps[15].center;
  ok(Math.abs(last.close - center) / center < 0.005, `intraday consensus ≈ drift path`);
}

// 11) By-hour + range-budget diagnostics in the tally.
{
  const t = intradayTally(m15, { horizonBars: 16 });
  const hourN = t.byHour.reduce((s, r) => s + r.n, 0);
  ok(hourN === t.full.n, `byHour cells partition all windows (${hourN}/${t.full.n})`);
  for (const r of t.byHour) ok(r.hour >= 0 && r.hour < 24 && r.n > 0, 'byHour rows sane');
  const b = t.budget;
  ok(b.cold.n + b.normal.n + b.hot.n + b.skipped === t.full.n, 'budget buckets + skipped partition all windows');
  // Well-specified synthetic → overall median |z| near the claimed 0.674.
  ok(b.overall.medAbsZ > 0.45 && b.overall.medAbsZ < 0.95, `overall med|z| near claim (${b.overall.medAbsZ})`);
  // Synthetic GBM has NO true budget effect → hot vs cold must not fabricate one.
  if (b.hot.n >= 20 && b.cold.n >= 20)
    ok(Math.abs(b.hot.medAbsZ - b.cold.medAbsZ) < 0.35, `no fabricated budget signal (hot ${b.hot.medAbsZ} vs cold ${b.cold.medAbsZ})`);
  ok(t.claimed.medAbsZ === 0.674, 'medAbsZ claim stated');
}

// 12) Surprise meter: price AT the P75 upper bound → pct ≈ Φ(1.1503) ≈ 0.875.
{
  const ctx = buildIntradayContext(m15);
  const i = 3000, h = 8;
  const cone = intradayCone(ctx, i, h);
  const r = intradayRealizedZ(ctx, i, h, cone.steps[h - 1].p75Up);
  ok(Math.abs(r.z - 1.1503494) < 1e-6, `z at p75Up is Z75 (${r.z.toFixed(7)})`);
  ok(Math.abs(r.pct - 0.875) < 0.002, `pct at p75Up ≈ 87.5% (${(r.pct * 100).toFixed(1)}%)`);
  const mid = intradayRealizedZ(ctx, i, h, cone.steps[h - 1].center);
  ok(Math.abs(mid.z) < 1e-9 && Math.abs(mid.pct - 0.5) < 1e-6, 'pct at center is 50%');
  ok(Math.abs(normCdf(0)) - 0.5 < 1e-6 && normCdf(3) > 0.998 && normCdf(-3) < 0.002, 'normCdf sane');
}

console.log(`forecastPathCore.test.mjs — all assertions passed (${passed} checks)`);
