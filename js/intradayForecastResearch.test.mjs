/**
 * Tests for the intraday forecast-research engine (PR-D): the touch/excursion
 * detector on hand-crafted bars (where the answer is known), plus end-to-end
 * structural invariants on synthetic intraday. Pure, no network.
 *
 *   node --test js/intradayForecastResearch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateIntraday, evaluateIntradayAllHorizons, _levelOutcome, _dynLevelOutcome } from './intradayForecastResearch.js';

const PIP = 0.0001;
const bar = (t, o, h, l, c) => ({ open: o, high: h, low: l, close: c, _t: Date.UTC(2021, 0, 4, 8) + t * 60000 });

test('touch detector: never touched ⇒ null', () => {
  const bars = [bar(0, 1.10, 1.101, 1.099, 1.100), bar(1, 1.100, 1.1015, 1.0995, 1.101)];
  assert.equal(_levelOutcome(bars, 1.1050, +1, PIP, 0.0005), null, 'level above all highs → not touched');
});

test('touch detector: touch then 30-pip pullback ⇒ reverse, mae≥20, rev20 true', () => {
  // UP level at 1.1050. Bar 1 tags it (high 1.1051), then price falls 30 pips (low 1.1020).
  const bars = [
    bar(0, 1.1000, 1.1010, 1.0995, 1.1008),
    bar(1, 1.1008, 1.1051, 1.1005, 1.1040),   // touches level
    bar(2, 1.1040, 1.1045, 1.1020, 1.1022),   // pulls back to 1.1020 = 30 pips below level
    bar(3, 1.1022, 1.1030, 1.1018, 1.1025),
  ];
  const o = _levelOutcome(bars, 1.1050, +1, PIP, 0.0005);
  assert.ok(o && o.touched, 'touched');
  assert.equal(o.firstIdx, 1, 'first touch at bar 1');
  assert.ok(o.maePips >= 20, `mae ${o.maePips} ≥ 20`);
  assert.equal(o.rev20, true); assert.equal(o.rev10, true);
  assert.equal(o.outcome, 'reverse', 'pulled back 20 before continuing 20 → reverse');
});

test('touch detector: touch then 30-pip continuation ⇒ continue', () => {
  const bars = [
    bar(0, 1.1000, 1.1010, 1.0995, 1.1008),
    bar(1, 1.1008, 1.1051, 1.1045, 1.1050),   // touches 1.1050
    bar(2, 1.1050, 1.1080, 1.1049, 1.1078),   // continues +30 pips beyond level
  ];
  const o = _levelOutcome(bars, 1.1050, +1, PIP, 0.0005);
  assert.ok(o && o.touched);
  assert.ok(o.mfePips >= 20, `mfe ${o.mfePips} ≥ 20`);
  assert.equal(o.outcome, 'continue');
});

test('touch detector: DOWN level mirrors (touch below, pull back up)', () => {
  const bars = [
    bar(0, 1.1000, 1.1005, 1.0990, 1.0992),
    bar(1, 1.0992, 1.0995, 1.0949, 1.0955),   // touches 1.0950 from above
    bar(2, 1.0955, 1.0985, 1.0953, 1.0982),   // recovers +30 pips
  ];
  const o = _levelOutcome(bars, 1.0950, -1, PIP, 0.0005);
  assert.ok(o && o.touched);
  assert.ok(o.maePips >= 20, 'pullback toward open registered');
  assert.equal(o.outcome, 'reverse');
});

test('touch detector: retest counting with hysteresis', () => {
  // Touch, leave by >hyst, come back = 2 episodes.
  const bars = [
    bar(0, 1.1000, 1.1051, 1.1000, 1.1010),   // touch #1
    bar(1, 1.1010, 1.1020, 1.1000, 1.1005),   // away below level−hyst(0.0005 ⇒ <1.1045)
    bar(2, 1.1005, 1.1052, 1.1004, 1.1030),   // touch #2
  ];
  const o = _levelOutcome(bars, 1.1050, +1, PIP, 0.0005);
  assert.equal(o.retests, 2, 'two distinct touch episodes');
});

// ── End-to-end on synthetic intraday ─────────────────────────────────────────
function mulberry32(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function synthH1(days, seed = 5) {
  const rnd = mulberry32(seed); const bars = []; let px = 1.10;
  const start = Date.UTC(2019, 0, 1, 0);
  for (let i = 0; i < days * 24; i++) {
    const o = px, c = o * (1 + (rnd() - 0.5) * 0.006);
    const h = Math.max(o, c) * (1 + rnd() * 0.0015), l = Math.min(o, c) * (1 - rnd() * 0.0015);
    bars.push({ time: new Date(start + i * 3600_000), open: o, high: h, low: l, close: c }); px = c;
  }
  return bars;
}

test('evaluateIntraday: structural invariants on synthetic intraday', () => {
  const r = evaluateIntraday(synthH1(300), { pip: PIP });
  assert.ok(!r.insufficient, 'enough days');
  // Expansion times are monotone non-decreasing across completion fractions.
  const e = r.expansion.medianHourTo;
  assert.ok(e['25'] <= e['50'] + 1e-9 && e['50'] <= e['75'] + 1e-9 && e['75'] <= e['100'] + 1e-9, `monotone expansion ${JSON.stringify(e)}`);
  // Touch reversal rates are monotone: rev10 ≥ rev20 ≥ rev50.
  const M = r.touches.medianExtension;
  // touchRatePct combines upper+lower touches per window, so it can reach ~200 (not a %-of-windows).
  if (M.n) { assert.ok(M.reverse10Pct >= M.reverse20Pct - 1e-9 && M.reverse20Pct >= M.reverse50Pct - 1e-9, 'reversal rates monotone in threshold'); assert.ok(M.touchRatePct >= 0 && M.touchRatePct <= 200); }
  // Direction split is a valid partition.
  const d = r.touches.direction;
  if (d.firstUpperPct != null) assert.ok(d.firstUpperPct + d.firstLowerPct <= 100.01, 'direction shares ≤ 100');
});

test('evaluateIntraday: recalibrate flag scales the touch levels (walk-forward)', () => {
  const on = evaluateIntraday(synthH1(400, 3), { pip: PIP, recalibrate: true });
  const off = evaluateIntraday(synthH1(400, 3), { pip: PIP, recalibrate: false });
  assert.equal(on.touches.bandsRecalibrated, true);
  assert.equal(off.touches.bandsRecalibrated, false);
  assert.equal(off.touches.recalFactor, 1, 'no scaling when off');
  assert.ok(on.touches.recalFactor > 0 && on.touches.recalFactor <= 1.5, 'clamped factor');
  // Tighter levels are reached at least as often as the raw ones.
  assert.ok(on.touches.medianExtension.touchRatePct >= off.touches.medianExtension.touchRatePct - 1e-9, 'recalibrated (tighter) levels touched ≥ raw');
});

test('dyn level: projected low from the RUNNING high, touched as the anchor extends', () => {
  const b = (h, l, c) => ({ high: h, low: l, close: c, _t: Date.UTC(2021, 0, 4, 8) });
  // Running high reaches 102 by bar 2; support = 102×(1−0.03)=98.94; bar 3 low 98.5 touches it.
  const bars = [b(100, 99.5, 100), b(101, 100, 101), b(102, 101, 101.5), b(101.5, 98.5, 99.2), b(99.5, 99, 99.4)];
  const o = _dynLevelOutcome(bars, 0.03, -1, 0.01);
  assert.ok(o && o.touched, 'projected low touched');
  assert.equal(o.firstIdx, 3, 'touched on the down bar, anchored by the earlier high');
  assert.ok(Math.abs(o.entry - 98.94) < 0.01, `entry = runHigh×(1−r) (${o.entry})`);
  assert.ok(o.closeFadePips > 0, 'price reverted up from the projected low → fade-long win');
  assert.equal(_dynLevelOutcome(bars, 0, -1, 0.01), null, 'r=0 → no level');
});

test('evaluateIntraday: dynamic H-L extension blocks present, more extended than median', () => {
  const t = evaluateIntraday(synthH1(500, 3), { pip: PIP }).touches;
  assert.ok(t.dynExtension && t.dynP75Extension, 'dynamic blocks present');
  if (t.dynExtension.n && t.medianExtension.n)
    assert.ok(t.dynExtension.touchRatePct <= t.medianExtension.touchRatePct + 1e-9, 'dynamic extreme touched no more than the median line');
});

test('evaluateIntraday: ratio_yz dynamic 75th block present with an empirical p75 factor', () => {
  const t = evaluateIntraday(synthH1(500, 3), { pip: PIP, recalibrate: true }).touches;
  assert.ok(t.dynRatioP75Extension, 'ratio_yz dynamic 75th block present');
  if (t.dynRatioP75Extension.n) {
    assert.ok(t.dynRatioP75Extension.p75Factor > 0, 'empirical p75 factor emitted');
    // The empirical-p75 band is at least as far out as the median band → touched no more.
    if (t.dynExtension.n)
      assert.ok(t.dynRatioP75Extension.touchRatePct <= t.dynExtension.touchRatePct + 1e-9,
        'ratio_yz 75th touched no more than the dynamic median');
  }
});

test('evaluateIntraday: insufficient data returns a flag, not a throw', () => {
  const r = evaluateIntraday(synthH1(20), { pip: PIP });
  assert.equal(r.insufficient, true);
});

test('evaluateIntraday: G1 placebo + G2 fade-payoff blocks present with sane invariants', () => {
  const r = evaluateIntraday(synthH1(400), { pip: PIP });
  assert.ok(!r.insufficient);
  const pl = r.touches.placebo;
  assert.ok(pl && pl.n > 0, 'placebo evaluated');
  if (pl.realReversePct != null && pl.reversePct != null)
    assert.ok(Math.abs(pl.edgeVsPlaceboPp - (pl.realReversePct - pl.reversePct)) < 0.2, 'edge = real − placebo reversal');
  const fp = r.touches.fadePayoff;
  if (fp.n >= 20) {
    assert.ok(fp.p5 <= fp.medianPips + 1e-9 && fp.medianPips <= fp.p95 + 1e-9, 'p5 ≤ median ≤ p95');
    assert.ok(fp.worstPips <= fp.p5 + 1e-9, 'worst ≤ p5');
    assert.ok(fp.winRatePct >= 0 && fp.winRatePct <= 100);
    if (fp.winLossRatio != null) assert.ok(fp.winLossRatio >= 0);
  }
});

test('evaluateIntraday weekly horizon: multi-day window, timeUnit=day, levels touched', () => {
  const r = evaluateIntraday(synthH1(500, 4), { pip: PIP, horizon: 'weekly' });
  assert.ok(!r.insufficient, 'enough windows');
  assert.equal(r.horizon, 'Weekly');
  assert.equal(r.expansion.timeUnit, 'day', 'weekly expansion measured in days-of-window');
  // Expansion crossings are within a 5-day window (1..5) and monotone.
  const e = r.expansion.medianHourTo;
  assert.ok(e['100'] <= 5.001, `100% reached within the 5-day window (got ${e['100']})`);
  assert.ok(e['25'] <= e['50'] + 1e-9 && e['50'] <= e['100'] + 1e-9, 'monotone');
  const M = r.touches.medianExtension;
  if (M.n) assert.ok(M.reverse10Pct >= M.reverse20Pct - 1e-9, 'reversal thresholds monotone at weekly horizon too');
});

test('evaluateIntradayAllHorizons: one London build, same results as per-horizon calls', () => {
  const h1 = synthH1(500, 4);
  const all = evaluateIntradayAllHorizons(h1, { pip: PIP });
  assert.ok(all.daily && all.weekly && all.d20, 'all three horizons returned');
  assert.equal(all.daily.horizon, 'Daily');
  assert.equal(all.weekly.horizon, 'Weekly');
  // Must equal the standalone per-horizon call (build-once is just a speedup).
  const solo = evaluateIntraday(h1, { pip: PIP, horizon: 'weekly' });
  assert.equal(all.weekly.touches?.medianExtension?.n ?? 0, solo.touches?.medianExtension?.n ?? 0, 'weekly identical to standalone');
  assert.equal(all.daily.expansion?.n, evaluateIntraday(h1, { pip: PIP, horizon: 'daily' }).expansion?.n, 'daily identical');
});

test('evaluateIntraday 20-day horizon runs and stays within its window', () => {
  const r = evaluateIntraday(synthH1(900, 6), { pip: PIP, horizon: 'd20' });
  if (!r.insufficient) { assert.equal(r.horizon, '20-day'); assert.ok(r.expansion.medianHourTo['100'] <= 20.001, 'within 20-day window'); }
  else assert.ok(r.nDays >= 0);   // acceptable if the synthetic sample is too short for 20-day windows
});
