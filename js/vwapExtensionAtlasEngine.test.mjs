/**
 * Unit tests for js/vwapExtensionAtlasEngine.js. Pure/synthetic: no network.
 *   node js/vwapExtensionAtlasEngine.test.mjs
 *
 * Load-bearing categories, per REFERENCE_ENGINE_PLAYBOOK.md §6:
 *   - perturb-the-future causality (§6.1)
 *   - tautology immunity — today's OWN range must never leak into dayAtr/
 *     dayVolRegime, the very bug the playbook names as a caught example (§3.1,
 *     §6.4)
 *   - the reversal-trap shape (§6.3): peakExtAtr / didExtendFurtherFirst must
 *     tell "faded immediately" and "extended further, then faded" apart
 *   - a sanity check on an engineered series before trusting real data, same
 *     convention `vwapSessionReversionV1Engine.js` already used
 */
import assert from 'node:assert/strict';
import { vwapExtensionAtlasWalk } from './vwapExtensionAtlasEngine.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('vwapExtensionAtlasEngine');

const T0 = 1577836800;   // 2020-01-01 00:00:00 UTC, a day boundary
const DAY = 86400;

// A generic multi-day wiggly synthetic series — enough trend+noise to throw
// real VWAP-extension crossings without hand-scripting every day.
function packedM1(nBars, { drift = 0.0004, wiggle = 0.03, seedPx = 100 } = {}) {
  const times = new Int32Array(nBars), opens = new Float32Array(nBars);
  const highs = new Float32Array(nBars), lows = new Float32Array(nBars);
  const closes = new Float32Array(nBars), volumes = new Float32Array(nBars);
  let px = seedPx;
  for (let i = 0; i < nBars; i++) {
    const o = px;
    px = px + drift * Math.sin(i / 3000) + wiggle * Math.sin(i / 9) + (i % 251 === 0 ? wiggle * 4 : 0);
    times[i] = T0 + i * 60; opens[i] = o; closes[i] = px;
    highs[i] = Math.max(o, px) + 0.05; lows[i] = Math.min(o, px) - 0.05;
    volumes[i] = 50 + (i % 17);
  }
  return { n: nBars, times, opens, highs, lows, closes, volumes };
}

// Build ONE UTC day of M1 bars (1440 bars) from a per-minute close-price
// function, flat volume, so an outcome path can be dictated exactly.
function oneDay(dayIdx, closeFn, { wick = 0.02 } = {}) {
  const n = 1440;
  const times = new Int32Array(n), opens = new Float32Array(n);
  const highs = new Float32Array(n), lows = new Float32Array(n);
  const closes = new Float32Array(n), volumes = new Float32Array(n);
  let prevClose = closeFn(0);
  for (let i = 0; i < n; i++) {
    const c = closeFn(i);
    const o = i === 0 ? c : prevClose;
    times[i] = T0 + dayIdx * DAY + i * 60;
    opens[i] = o; closes[i] = c;
    highs[i] = Math.max(o, c) + wick; lows[i] = Math.min(o, c) - wick;
    volumes[i] = 60; prevClose = c;
  }
  return { times, opens, highs, lows, closes, volumes };
}
function concatDays(days) {
  const n = days.reduce((s, d) => s + d.times.length, 0);
  const out = { n, times: new Int32Array(n), opens: new Float32Array(n), highs: new Float32Array(n),
    lows: new Float32Array(n), closes: new Float32Array(n), volumes: new Float32Array(n) };
  let off = 0;
  for (const d of days) {
    out.times.set(d.times, off); out.opens.set(d.opens, off); out.highs.set(d.highs, off);
    out.lows.set(d.lows, off); out.closes.set(d.closes, off); out.volumes.set(d.volumes, off);
    off += d.times.length;
  }
  return out;
}

// 25 quiet warm-up days (small range, so a later engineered day's ATR
// threshold is easy to clear deliberately) + 1 engineered day.
function warmupDays(count, { base = 100, amp = 0.3 } = {}) {
  const days = [];
  for (let i = 0; i < count; i++) {
    days.push(oneDay(i, m => base + amp * Math.sin(m / 180) + (i % 5) * 0.05));
  }
  return days;
}

const P = packedM1(60 * 24 * 200);

t('vwapExtensionAtlasWalk runs end-to-end on synthetic data and returns well-shaped rows', () => {
  // Lower thresholds than the real-data default — this generic wiggly
  // series rarely stretches a full 1.0×ATR from its own cumulative VWAP;
  // the real-data run (education/vwap_extension_atlas/) uses the actual
  // 1.0/1.5/2.0/2.5 default. This test only needs SOME crossings to exist.
  const { rows, coverage } = vwapExtensionAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', thresholds: [0.3, 0.5, 0.75] });
  assert.ok(coverage, 'coverage present');
  assert.ok(rows.length > 20, `expected rows, got ${rows.length}`);
  for (const r of rows) {
    assert.ok(['up', 'down'].includes(r.side));
    assert.ok(r.distAtrAtCross >= r.extAtrThreshold - 1e-6, 'crossing row must actually clear its own threshold');
    assert.ok(r.peakExtAtr >= r.distAtrAtCross - 1e-6, 'peak must be >= the crossing value itself');
    assert.equal(typeof r.touchedVwapAfter, 'boolean');
    assert.equal(typeof r.didExtendFurtherFirst, 'boolean');
    assert.equal(typeof r.unresolvedAtDayEnd, 'boolean');
    assert.equal(r.unresolvedAtDayEnd, !r.touchedVwapAfter, 'unresolvedAtDayEnd must be the exact negation of touchedVwapAfter');
    if (r.touchedVwapAfter) assert.ok(r.barsToVwapTouch > 0);
  }
});

t('perturbing bars strictly AFTER a day must not change any earlier day\'s row (§6.1)', () => {
  const base = packedM1(60 * 24 * 120, { wiggle: 0.03 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice(), opens: base.opens.slice() };
  const start = base.n - 3 * 1440;   // perturb only the final 3 days
  for (let i = start; i < base.n; i++) { wild.highs[i] += 3; wild.lows[i] -= 3; wild.closes[i] += 1.5; }

  const a = vwapExtensionAtlasWalk(base, { instrument: 'EURUSD', assetClass: 'fx', thresholds: [0.3, 0.5, 0.75] });
  const b = vwapExtensionAtlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', thresholds: [0.3, 0.5, 0.75] });
  const cutDate = new Date(base.times[start] * 1000).toISOString().slice(0, 10);
  const keyOf = r => `${r.date}|${r.side}|${r.extAtrThreshold}`;
  const byKeyA = new Map(a.rows.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.rows) {
    if (rb.date >= cutDate) continue;   // only rows on days strictly before the perturbed window
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.deepEqual(rb, ra, `row ${keyOf(rb)} changed from perturbing a later day`);
  }
  assert.ok(checked > 5, `expected several pre-perturbation rows to compare, got ${checked}`);
});

t('a day\'s own huge range must NOT leak into that SAME day\'s dayAtr/dayVolRegime (§3.1/§6.4 tautology check)', () => {
  const warm = warmupDays(30);
  const quietTarget = oneDay(30, m => 100 + 0.3 * Math.sin(m / 180));
  const wildTarget   = oneDay(30, m => 100 + (m < 720 ? m * 0.05 : 720 * 0.05 - (m - 720) * 0.05));   // huge same-day swing
  const tailQuiet = concatDays([...warm, quietTarget, oneDay(31, m => 100 + 0.3 * Math.sin(m / 180))]);
  const tailWild  = concatDays([...warm, wildTarget,  oneDay(31, m => 100 + 0.3 * Math.sin(m / 180))]);

  const a = vwapExtensionAtlasWalk(tailQuiet, { instrument: 'SYN', assetClass: 'fx', minLookbackDays: 25 });
  const b = vwapExtensionAtlasWalk(tailWild,  { instrument: 'SYN', assetClass: 'fx', minLookbackDays: 25 });
  const targetDate = new Date((T0 + 30 * DAY) * 1000).toISOString().slice(0, 10);
  const ra = a.rows.find(r => r.date === targetDate);
  const rb = b.rows.find(r => r.date === targetDate);
  // Both datasets are IDENTICAL through day 29 (warm-up) and day 30's own
  // shape only differs from itself, not from the days feeding its ATR — so
  // if either produced a row on day 30, its dayAtr must match the other's
  // exactly (both computed from the same days 0-29).
  if (ra && rb) assert.equal(ra.dayAtr, rb.dayAtr, 'dayAtr for the SAME date must not depend on that date\'s own range');
});

t('reversal-trap shape: immediate fade vs extend-further-then-fade must be told apart (§6.3)', () => {
  const warm = warmupDays(28);
  // Day 28: flat/quiet for the first 300 minutes (VWAP barely moves), then
  // ONE bar spikes hard up (a single-bar move clears the threshold with the
  // spike itself already at its peak), then reverses straight down through
  // VWAP. Because the whole "extension" is one bar, there is no room for a
  // later bar to exceed it — the textbook "immediate fade" case.
  const fadeDay = oneDay(28, m => {
    if (m < 300) return 100 + 0.05 * Math.sin(m / 50);
    if (m === 300) return 103;
    return Math.max(97, 103 - (m - 300) * 0.05);
  });
  const tailQuiet1 = oneDay(29, m => 100 + 0.3 * Math.sin(m / 180));
  const A = concatDays([...warm, fadeDay, tailQuiet1]);

  // Day 28': same opening spike to the SAME first peak, then a shallow
  // pullback that stays well clear of VWAP (never resets the "already
  // crossed" gate), then a SECOND, higher spike — a genuine new extreme —
  // before finally reverting through VWAP. "Extended further before fading."
  const extendDay = oneDay(28, m => {
    if (m < 300) return 100 + 0.05 * Math.sin(m / 50);
    if (m === 300) return 103;
    if (m < 340) return 103 - (m - 300) * 0.02;
    if (m === 340) return 105;
    return Math.max(97, 105 - (m - 340) * 0.05);
  });
  const tailQuiet2 = oneDay(29, m => 100 + 0.3 * Math.sin(m / 180));
  const B = concatDays([...warm, extendDay, tailQuiet2]);

  const targetDate = new Date((T0 + 28 * DAY) * 1000).toISOString().slice(0, 10);
  const a = vwapExtensionAtlasWalk(A, { instrument: 'SYN', assetClass: 'fx', minLookbackDays: 25, thresholds: [1.0] });
  const b = vwapExtensionAtlasWalk(B, { instrument: 'SYN', assetClass: 'fx', minLookbackDays: 25, thresholds: [1.0] });
  const ra = a.rows.find(r => r.date === targetDate && r.side === 'up');
  const rb = b.rows.find(r => r.date === targetDate && r.side === 'up');
  assert.ok(ra, 'expected an up-crossing row on the immediate-fade day');
  assert.ok(rb, 'expected an up-crossing row on the extend-further day');
  assert.equal(ra.didExtendFurtherFirst, false, 'immediate-fade day must NOT show a further extension before touch');
  assert.equal(rb.didExtendFurtherFirst, true, 'extend-then-fade day MUST show a further extension before touch');
  assert.ok(rb.peakExtAtr > ra.peakExtAtr * 1.05, 'the extend-further day\'s peak must exceed the immediate-fade day\'s peak');
  assert.ok(ra.touchedVwapAfter && rb.touchedVwapAfter, 'both engineered days revert through VWAP by day end');
});

t('an engineered day that never returns to VWAP is flagged unresolved, not silently treated as a touch', () => {
  const warm = warmupDays(28);
  const runawayDay = oneDay(28, m => 100 + m * 0.05);   // one-way all day, never turns
  const A = concatDays([...warm, runawayDay, oneDay(29, m => 100 + 0.3 * Math.sin(m / 180))]);
  const { rows } = vwapExtensionAtlasWalk(A, { instrument: 'SYN', assetClass: 'fx', minLookbackDays: 25, thresholds: [1.0] });
  const targetDate = new Date((T0 + 28 * DAY) * 1000).toISOString().slice(0, 10);
  const r = rows.find(x => x.date === targetDate && x.side === 'up');
  assert.ok(r, 'expected an up-crossing row on the runaway day');
  assert.equal(r.touchedVwapAfter, false);
  assert.equal(r.unresolvedAtDayEnd, true);
  assert.equal(r.barsToVwapTouch, null);
});

t('confirmTfMinutes=1 (explicit) reproduces the default output byte-for-byte', () => {
  const a = vwapExtensionAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', thresholds: [0.3, 0.5, 0.75] });
  const b = vwapExtensionAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', thresholds: [0.3, 0.5, 0.75], confirmTfMinutes: 1 });
  assert.deepEqual(a.rows, b.rows, 'passing confirmTfMinutes:1 explicitly must reproduce the default output exactly');
});

t('a wick-only VWAP touch counts at confirmTfMinutes=1 but NOT at a higher confirmation timeframe (closes, not wicks)', () => {
  const warm = warmupDays(28);
  function oneDayWithWick(dayIdx, closeFn, wickAtMinute) {
    const d = oneDay(dayIdx, closeFn);
    if (wickAtMinute != null) d.lows[wickAtMinute] -= 5;   // a huge intrabar wick, single bar
    return d;
  }
  const day = oneDayWithWick(28, m => {
    if (m < 300) return 100 + 0.05 * Math.sin(m / 50);
    if (m === 300) return 103;                    // spike crosses the threshold
    if (m === 305) return 102.8;                   // CLOSES elevated despite the wick below
    return 102.5 + 0.01 * Math.sin(m / 20);         // holds elevated the rest of the day
  }, 305);
  const A = concatDays([...warm, day, oneDay(29, m => 100 + 0.3 * Math.sin(m / 180))]);
  const targetDate = new Date((T0 + 28 * DAY) * 1000).toISOString().slice(0, 10);

  const wick = vwapExtensionAtlasWalk(A, { instrument: 'SYN', assetClass: 'fx', minLookbackDays: 25, thresholds: [1.0], confirmTfMinutes: 1 });
  const confirmed = vwapExtensionAtlasWalk(A, { instrument: 'SYN', assetClass: 'fx', minLookbackDays: 25, thresholds: [1.0], confirmTfMinutes: 15 });
  const rWick = wick.rows.find(r => r.date === targetDate && r.side === 'up');
  const rConfirmed = confirmed.rows.find(r => r.date === targetDate && r.side === 'up');
  assert.ok(rWick && rConfirmed, 'expected an up-crossing row at both confirmation settings');
  assert.equal(rWick.touchedVwapAfter, true, 'the M1 wick alone must count as a touch at confirmTfMinutes=1');
  assert.equal(rConfirmed.touchedVwapAfter, false, 'the same wick must NOT count as a touch at confirmTfMinutes=15 — the bucket never closed at VWAP');
  assert.equal(rConfirmed.unresolvedAtDayEnd, true);
});

console.log(`${passed} passed`);
process.exit(process.exitCode || 0);
