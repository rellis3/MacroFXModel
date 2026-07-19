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
  profileMult, INTRADAY_DEFAULTS, intradayRealizedZ, normCdf, eventMult,
  intradayReachability, reachabilityCalibration,
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

// 13) bandsFn calibration swap: envelopes change, the drift line does not.
{
  const cogBands = (open, sigma) => ({
    ocUp: open * (1 + 0.74 * sigma), ocDn: open * (1 - 0.74 * sigma), oc75: 1.24 * sigma,
  });
  const a = forecastCone(bars, 800, { horizonDays: 5 });
  const b = forecastCone(bars, 800, { horizonDays: 5, bandsFn: cogBands });
  for (let k = 0; k < 5; k++) {
    ok(a.steps[k].center === b.steps[k].center, `drift line calibration-independent at h=${k + 1}`);
    ok(a.steps[k].p50Up !== b.steps[k].p50Up, `envelope differs under swapped calibration at h=${k + 1}`);
    ok(b.steps[k].p75Up > b.steps[k].p50Up && b.steps[k].p50Dn > b.steps[k].p75Dn, `swapped envelopes ordered at h=${k + 1}`);
  }
  const t = calibrationTally(bars, { horizonDays: 5, bandsFn: cogBands });
  ok(t.full.n >= 30 && t.full.perStep.every(s => s.c50 != null && s.c75 != null), 'tally grades the swapped calibration');
}

// 14) Event-aware cone: multiplier LEARNED from planted events, honest A/B.
{
  // Every 3rd weekday: an "event" at 20:00 UTC (a quiet hour — decoupled from
  // any session pattern), σ × 2.5 for the 4 bars after it.
  function syntheticWithEvents(nDays, seed = 21) {
    const rng = mulberry32(seed);
    const bars = [], events = [];
    let c = 1.2; const d = new Date('2026-03-02T00:00:00Z'); let dayNum = 0;
    for (let day = 0; day < nDays; day++) {
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
      const evT = d.getTime() / 1000 + 20 * 3600;
      const hasEvent = dayNum % 3 === 0;
      if (hasEvent) events.push(evT);
      for (let k = 0; k < 96; k++) {
        const t = d.getTime() / 1000 + k * 900;
        let sig = 0.0004;
        if (hasEvent && t >= evT && t < evT + 4 * 900) sig *= 2.5;
        const open = c, close = open * Math.exp(sig * gauss(rng));
        bars.push({ time: t, open, high: Math.max(open, close), low: Math.min(open, close), close });
        c = close;
      }
      d.setUTCDate(d.getUTCDate() + 1); dayNum++;
    }
    return { bars, events };
  }
  const evOpts = { eventPre: 0, eventPost: 4 * 900 - 1 };
  const { bars: eb, events } = syntheticWithEvents(60);
  const ctxAware = buildIntradayContext(eb, { events, eventAware: true, ...evOpts });
  const i0 = eb.length - 100;
  const m = eventMult(ctxAware, i0);
  ok(m > 1.2 && m < 3.3, `event factor learned (${m.toFixed(2)})`);
  // The hour-20 bucket contains the event bars, so the APPLIED multiplier is
  // the product profileMult × eventMult — the contamination cancels and the
  // product must recover the planted ×2.5.
  const applied = m * profileMult(ctxAware, i0, 20);
  ok(applied > 1.9 && applied < 3.1, `applied event-step widening ≈2.5 (got ${applied.toFixed(2)})`);

  const base  = intradayTally(eb, { horizonBars: 8, events, eventAware: false, ...evOpts });
  const aware = intradayTally(eb, { horizonBars: 8, events, eventAware: true,  ...evOpts });
  ok(base.eventSplit && aware.eventSplit && base.eventSplit.eventAware === false && aware.eventSplit.eventAware === true, 'event split present, mode recorded');
  ok(base.eventSplit.event.n >= 10, `enough event windows (${base.eventSplit.event.n})`);
  const dBase = Math.abs(base.eventSplit.event.c75 - 0.75);
  const dAware = Math.abs(aware.eventSplit.event.c75 - 0.75);
  ok(dAware <= dBase + 0.02, `conditioned event-bucket c75 no further from claim (base off ${dBase.toFixed(2)}, aware ${dAware.toFixed(2)})`);
  ok(Math.abs((aware.eventSplit.quiet.c75 ?? 0) - (base.eventSplit.quiet.c75 ?? 0)) < 0.05, 'quiet windows unchanged by the conditioner');

  // No events passed → no split, behavior identical to the pre-event brick.
  const t0 = intradayTally(m15, { horizonBars: 16 });
  ok(t0.eventSplit === null, 'no events → eventSplit null');
  // Mutation no-lookahead still holds with events wired.
  const iMut = 3000;
  const mutated = eb.map((b, k) => k >= iMut ? { ...b, open: 9, high: 9.9, low: 8, close: 9.5 } : b);
  const cA = intradayCone(buildIntradayContext(eb, { events, eventAware: true, ...evOpts }), iMut, 8);
  const cB = intradayCone(buildIntradayContext(mutated, { events, eventAware: true, ...evOpts }), iMut, 8);
  assert.deepEqual(cA.steps.map(s => [s.center, s.p75Up]), cB.steps.map(s => [s.center, s.p75Up]), 'event-aware cone: no lookahead'); passed++;
}

// 15) Target reachability: monotone in distance, deterministic, no lookahead.
{
  const ctx = buildIntradayContext(m15);
  const i = 3000, H = 16;
  const anchor = m15[i - 1].close;
  const cone = intradayCone(ctx, i, H);
  const sdH = Math.log(cone.steps[H - 1].p75Up / cone.steps[H - 1].center) / 1.1503494;

  const near = intradayReachability(ctx, i, anchor * Math.exp(0.5 * sdH), H);
  const far  = intradayReachability(ctx, i, anchor * Math.exp(2.5 * sdH), H);
  ok(near.pTouch > far.pTouch, `nearer target more reachable (${near.pTouch.toFixed(2)} > ${far.pTouch.toFixed(2)})`);
  ok(near.pTouch >= 0 && far.pTouch >= 0 && near.pTouch <= 1, 'pTouch in [0,1]');
  ok(near.side === 'up' && intradayReachability(ctx, i, anchor * Math.exp(-sdH), H).side === 'down', 'side tag correct');
  // A very close target (0.1σ) should touch most of the time (reflection ≈ 92%).
  const close = intradayReachability(ctx, i, anchor * Math.exp(0.1 * sdH), H);
  ok(close.pTouch > 0.6, `0.1σ target reached often (${close.pTouch.toFixed(2)})`);
  // Deterministic (seeded).
  const a = intradayReachability(ctx, i, anchor * 1.001, H);
  const b = intradayReachability(ctx, i, anchor * 1.001, H);
  ok(a.pTouch === b.pTouch && a.medBarsToTouch === b.medBarsToTouch, 'reachability deterministic');
  // No lookahead: future bars can't change the estimate.
  const mutated = m15.map((bb, k) => k >= i ? { ...bb, open: 9, high: 9.9, low: 8, close: 9.5 } : bb);
  const cMut = intradayReachability(buildIntradayContext(mutated), i, anchor * 1.001, H);
  ok(cMut.pTouch === a.pTouch, 'reachability no lookahead');
}

// 16) Reachability calibration: on well-specified GBM, predicted ≈ realized.
{
  const rc = reachabilityCalibration(m15, { horizonBars: 16, calibPaths: 120 });
  ok(rc.nPredictions >= 200, `enough reachability predictions (${rc.nPredictions})`);
  ok(rc.gap != null && rc.gap < 0.15, `reliability gap small on synthetic (${rc.gap?.toFixed(3)})`);
  // The high-prob bins should realize high, low bins low (monotone reliability).
  const lo = rc.curve.find(c => c.bin === 0 && c.n >= 10);
  const hi = rc.curve.find(c => c.bin === 0.9 && c.n >= 10);
  if (lo && hi) ok(hi.realized > lo.realized, `reliability monotone (${lo.realized?.toFixed(2)} → ${hi.realized?.toFixed(2)})`);
}

// 17) Implied-vol width conditioner: scales the day's σ, causal, off by default.
{
  // ivByDate = 10 baseline, the LAST 5 calendar days spike to 20 → recent
  // implied deviates above its own trailing median (the causal signal).
  const days = new Set(m15.map(b => new Date(b.time * 1000).toISOString().substring(0, 10)));
  const dayArr = [...days].sort();
  const ivByDate = {};
  dayArr.forEach((d, k) => { ivByDate[d] = k >= dayArr.length - 5 ? 20 : 10; });

  // Off by default → identical to no iv.
  const c0 = intradayCone(buildIntradayContext(m15), 3000, 16);
  const cOff = intradayCone(buildIntradayContext(m15, { ivByDate, ivConditioner: false }), 3000, 16);
  ok(c0.steps[0].p75Up === cOff.steps[0].p75Up, 'iv conditioner OFF ⇒ no change');
  ok((cOff.ivMult ?? 1) === 1, 'ivMult 1 when off');

  // On, a window anchored in the last (spiked) day → mult elevated, cone wider.
  const ctxIv = buildIntradayContext(m15, { ivByDate, ivConditioner: true, ivBaselineDays: 20 });
  const lateI = m15.length - 10;   // within the final day
  const cOn = intradayCone(ctxIv, lateI, 16);
  const cBase = intradayCone(buildIntradayContext(m15), lateI, 16);
  ok(cOn.ivMult > 1.3, `recent iv spike → mult elevated (${cOn.ivMult?.toFixed(2)})`);
  ok(cOn.steps[5].p75Up - cOn.anchor > cBase.steps[5].p75Up - cBase.anchor, 'iv-on cone wider on high-iv day');

  // Causal / no lookahead: mutating future bars leaves the cone put.
  const cA = intradayCone(buildIntradayContext(m15, { ivByDate, ivConditioner: true, ivBaselineDays: 20 }), lateI, 16);
  const mutBars = m15.map((b, k) => k >= lateI ? { ...b, close: 9 } : b);
  const cB = intradayCone(buildIntradayContext(mutBars, { ivByDate, ivConditioner: true, ivBaselineDays: 20 }), lateI, 16);
  ok(Math.abs(cA.ivMult - cB.ivMult) < 1e-9, 'iv mult causal (future bars irrelevant)');

  // Tally carries an ivStat; with a mid-sample spike the multiplier varies.
  const ivMid = {};
  dayArr.forEach((d, k) => { ivMid[d] = (k > 25 && k < 32) ? 22 : 10; });   // a spike, then back
  const tIv = intradayTally(m15, { horizonBars: 16, ivByDate: ivMid, ivConditioner: true, ivBaselineDays: 20 });
  ok(tIv.ivStat && tIv.ivStat.on === true && tIv.ivStat.varied === true, 'ivStat shows the multiplier varied');
  ok(tIv.overall && tIv.overall.c75 != null, 'tally overall cell present for the A/B');
  const tOff = intradayTally(m15, { horizonBars: 16, ivByDate, ivConditioner: false, ivBaselineDays: 20 });
  ok(tOff.ivStat === null || tOff.ivStat.on === false, 'ivStat off-run flagged off');
}

// 18) Path adherence: pooled containment across horizon, sane on synthetic.
{
  const t = intradayTally(m15, { horizonBars: 16 });
  ok(t.adherence && t.adherence.n > 0, 'adherence computed');
  ok(t.adherence.p50 > 0.35 && t.adherence.p50 < 0.65, `adherence P50 near 50% (${(t.adherence.p50*100).toFixed(0)}%)`);
  ok(t.adherence.p75 > 0.6 && t.adherence.p75 < 0.9, `adherence P75 near 75% (${(t.adherence.p75*100).toFixed(0)}%)`);
  ok(t.adherence.p75 > t.adherence.p50, 'P75 band contains more than P50 (nested)');
  ok(t.adherenceRecent && t.adherenceRecent.n > 0, 'recent adherence computed');
}

console.log(`forecastPathCore.test.mjs — all assertions passed (${passed} checks)`);
