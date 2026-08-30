/**
 * Unit tests for js/stackedFadeV1Engine.js. Pure/synthetic: no network.
 *   node js/stackedFadeV1Engine.test.mjs
 *
 * Focus: the engine's own filter/wiring logic (touch -> trade), not
 * walkBars/causalAtr arithmetic (already Tier-1 primitives elsewhere).
 * Load-bearing: the new `requireMomentumAgree` gate (2026-08-27) — sell
 * only when wt1>0 at an upper-band touch, buy only when wt1<0 at a
 * lower-band touch — must correctly include/exclude by side+sign, and the
 * default (no gate) must remain sign-agnostic (regression for V0/V1/V2).
 */
import assert from 'node:assert/strict';
import { runStackedFade } from './stackedFadeV1Engine.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('stackedFadeV1Engine');

const T0 = 1577836800;   // 2020-01-01 00:00:00 UTC, day-aligned
const DAY = 86400;

// N quiet-but-non-degenerate days (TR>0, so causalAtr doesn't return null),
// followed by one "test day" whose minute-61 bar is overridden to be the
// touch's entry/fill bar with a clean, unambiguous win path.
function buildPacked({ side, entryPx, tpPx, testDayIdx = 3, nDays = 4 }) {
  const barsPerDay = 1440;
  const n = nDays * barsPerDay;
  const times = new Int32Array(n), opens = new Float32Array(n), highs = new Float32Array(n),
        lows = new Float32Array(n), closes = new Float32Array(n), volumes = new Float32Array(n);
  for (let d = 0; d < nDays; d++) {
    const dayStart = T0 + d * DAY;
    for (let m = 0; m < barsPerDay; m++) {
      const i = d * barsPerDay + m;
      const px = 100 + 0.3 * Math.sin((d * barsPerDay + m) / 11);   // small wiggle -> TR>0
      times[i] = dayStart + m * 60;
      opens[i] = px; closes[i] = px + 0.02;
      highs[i] = px + 0.08; lows[i] = px - 0.08;
      volumes[i] = 10;
    }
  }
  // Override the test day's entry/fill bar (minute 61) with the engineered path.
  const fillIdx = testDayIdx * barsPerDay + 61;
  const isBuy = side === 'dn';
  opens[fillIdx] = entryPx;
  if (isBuy) {
    highs[fillIdx] = tpPx + 0.2;      // reaches TP (above entry)
    lows[fillIdx] = entryPx - 0.1;    // stays well clear of SL (below entry)
  } else {
    lows[fillIdx] = tpPx - 0.2;       // reaches TP (below entry)
    highs[fillIdx] = entryPx + 0.1;   // stays well clear of SL (above entry)
  }
  closes[fillIdx] = tpPx;
  return { n, times, opens, highs, lows, closes, volumes };
}

function touchFor({ side, testDayIdx = 3, wtStateValue }) {
  const dayStart = T0 + testDayIdx * DAY;
  const touchEpoch = dayStart + 60 * 60;   // minute 60 -> entry lands on minute 61
  return {
    ordinal: 1, band: 3, side, date: `test-${testDayIdx}`, session: 'London',
    epoch: touchEpoch, minsIntoSession: 60, candleReject: '2·neutral',
    wtState: wtStateValue > 0 ? '3·extended' : '1·counter', wtStateValue,
    vwapAtTouch: side === 'up' ? 99 : 102,
  };
}

t('default (no gate): an upper-band touch with POSITIVE wt1 still fires (V0 is sign-agnostic)', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = touchFor({ side: 'up', wtStateValue: +5 });
  const { trades } = runStackedFade(packed, [touch], {});
  assert.equal(trades.length, 1);
  assert.equal(trades[0].side, 'SELL');
});

t('default (no gate): an upper-band touch with NEGATIVE wt1 also fires (V0 is sign-agnostic)', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = touchFor({ side: 'up', wtStateValue: -5 });
  const { trades } = runStackedFade(packed, [touch], {});
  assert.equal(trades.length, 1);
});

t('requireMomentumAgree: upper-band touch with wt1>0 (agrees) fires a SELL', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = touchFor({ side: 'up', wtStateValue: +5 });
  const { trades, meta } = runStackedFade(packed, [touch], { requireMomentumAgree: true });
  assert.equal(meta.pool, 1);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].side, 'SELL');
});

t('requireMomentumAgree: upper-band touch with wt1<0 (disagrees) is excluded entirely', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = touchFor({ side: 'up', wtStateValue: -5 });
  const { trades, meta } = runStackedFade(packed, [touch], { requireMomentumAgree: true });
  assert.equal(meta.pool, 0);
  assert.equal(trades.length, 0);
});

t('requireMomentumAgree: lower-band touch with wt1<0 (agrees) fires a BUY', () => {
  const packed = buildPacked({ side: 'dn', entryPx: 101, tpPx: 103 });
  const touch = touchFor({ side: 'dn', wtStateValue: -5 });
  const { trades } = runStackedFade(packed, [touch], { requireMomentumAgree: true });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].side, 'BUY');
});

t('requireMomentumAgree: lower-band touch with wt1>0 (disagrees) is excluded entirely', () => {
  const packed = buildPacked({ side: 'dn', entryPx: 101, tpPx: 103 });
  const touch = touchFor({ side: 'dn', wtStateValue: +5 });
  const { trades, meta } = runStackedFade(packed, [touch], { requireMomentumAgree: true });
  assert.equal(meta.pool, 0);
  assert.equal(trades.length, 0);
});

t('requireMomentumAgree: a touch missing wtStateValue (null) is excluded, not silently included', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = { ...touchFor({ side: 'up', wtStateValue: +5 }), wtStateValue: null };
  const { trades, meta } = runStackedFade(packed, [touch], { requireMomentumAgree: true });
  assert.equal(meta.pool, 0);
  assert.equal(trades.length, 0);
});

// ── action:'follow' (2026-08-30) — with-trend, next-band-out target ─────────
// Quiet packed data where the entry bar just fills (open=entry) and price
// stays near entry for the rest of the window (walkBars returns 'open',
// mark-to-close) — enough to check direction/TP/SL WIRING without re-testing
// walkBars/fill-arithmetic itself (already covered for 'fade').
function buildQuietPacked({ entryPx, testDayIdx = 3, nDays = 4 }) {
  const barsPerDay = 1440;
  const n = nDays * barsPerDay;
  const times = new Int32Array(n), opens = new Float32Array(n), highs = new Float32Array(n),
        lows = new Float32Array(n), closes = new Float32Array(n), volumes = new Float32Array(n);
  for (let d = 0; d < nDays; d++) {
    const dayStart = T0 + d * DAY;
    for (let m = 0; m < barsPerDay; m++) {
      const i = d * barsPerDay + m;
      const px = 100 + 0.05 * Math.sin((d * barsPerDay + m) / 11);
      times[i] = dayStart + m * 60;
      opens[i] = px; closes[i] = px + 0.01; highs[i] = px + 0.03; lows[i] = px - 0.03;
      volumes[i] = 10;
    }
  }
  const fillIdx = testDayIdx * barsPerDay + 61;
  opens[fillIdx] = entryPx; highs[fillIdx] = entryPx + 0.03; lows[fillIdx] = entryPx - 0.03; closes[fillIdx] = entryPx;
  return { n, times, opens, highs, lows, closes, volumes };
}

function followTouchFor({ side, band = 2, fixedSigma = 1, vwapAtTouch = 100, bandSlope = '3·expanding', testDayIdx = 3 }) {
  const dayStart = T0 + testDayIdx * DAY;
  return {
    ordinal: 1, band, side, date: `test-${testDayIdx}`, session: 'London',
    epoch: dayStart + 60 * 60, minsIntoSession: 60, candleReject: '2·neutral',
    wtState: '2·neutral', wtStateValue: 0, vwapAtTouch, fixedSigma, bandSlope,
  };
}

t("action:'follow': an up-side touch fires a BUY (opposite of fade's mapping)", () => {
  const touch = followTouchFor({ side: 'up' });   // vwap=100, band=2, σ=1 -> entry~102, tp=103, sl=101
  const packed = buildQuietPacked({ entryPx: 102 });
  const { trades } = runStackedFade(packed, [touch], { action: 'follow' });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].side, 'BUY');
  assert.equal(trades[0].action, 'follow');
  assert.ok(Math.abs(trades[0].tp - 103) < 1e-6, `tp should be the (band+1)σ level, got ${trades[0].tp}`);
  assert.ok(Math.abs(trades[0].sl - 101) < 1e-6, `sl should be the (band-1)σ level, got ${trades[0].sl}`);
});

t("action:'follow': a down-side touch fires a SELL (opposite of fade's mapping)", () => {
  const touch = followTouchFor({ side: 'dn', vwapAtTouch: 100 });   // tp=97, sl=99
  const packed = buildQuietPacked({ entryPx: 98 });
  const { trades } = runStackedFade(packed, [touch], { action: 'follow' });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].side, 'SELL');
  assert.ok(Math.abs(trades[0].tp - 97) < 1e-6, `tp should be the (band+1)σ level, got ${trades[0].tp}`);
  assert.ok(Math.abs(trades[0].sl - 99) < 1e-6, `sl should be the (band-1)σ level, got ${trades[0].sl}`);
});

t("default action is still 'fade' when omitted (backward-compat)", () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = touchFor({ side: 'up', wtStateValue: +5 });
  const { trades } = runStackedFade(packed, [touch], {});
  assert.equal(trades[0].action, 'fade');
  assert.equal(trades[0].side, 'SELL');   // fade's own mapping: up-touch -> SELL
});

t('requireBandSlopeExpanding: excludes a touch whose bandSlope is not expanding', () => {
  const touch = followTouchFor({ side: 'up', bandSlope: '2·stable' });
  const packed = buildQuietPacked({ entryPx: 102 });
  const { trades, meta } = runStackedFade(packed, [touch], { action: 'follow', requireBandSlopeExpanding: true });
  assert.equal(meta.pool, 0);
  assert.equal(trades.length, 0);
});

t('requireBandSlopeExpanding: includes a touch whose bandSlope IS expanding', () => {
  const touch = followTouchFor({ side: 'up', bandSlope: '3·expanding' });
  const packed = buildQuietPacked({ entryPx: 102 });
  const { trades, meta } = runStackedFade(packed, [touch], { action: 'follow', requireBandSlopeExpanding: true });
  assert.equal(meta.pool, 1);
  assert.equal(trades.length, 1);
});

console.log(`${passed} passed`);
process.exit(process.exitCode || 0);
