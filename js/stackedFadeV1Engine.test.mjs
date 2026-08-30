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

t('requirePmoAgree: upper-band touch with pmoValue>0 (agrees) fires a SELL', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = { ...touchFor({ side: 'up', wtStateValue: -5 }), pmoValue: 3 };
  const { trades, meta } = runStackedFade(packed, [touch], { requirePmoAgree: true });
  assert.equal(meta.pool, 1);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].side, 'SELL');
});

t('requirePmoAgree: upper-band touch with pmoValue<0 (disagrees) is excluded entirely', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = { ...touchFor({ side: 'up', wtStateValue: -5 }), pmoValue: -3 };
  const { trades, meta } = runStackedFade(packed, [touch], { requirePmoAgree: true });
  assert.equal(meta.pool, 0);
  assert.equal(trades.length, 0);
});

t('requirePmoAgree: lower-band touch with pmoValue<0 (agrees) fires a BUY', () => {
  const packed = buildPacked({ side: 'dn', entryPx: 101, tpPx: 103 });
  const touch = { ...touchFor({ side: 'dn', wtStateValue: 5 }), pmoValue: -3 };
  const { trades } = runStackedFade(packed, [touch], { requirePmoAgree: true });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].side, 'BUY');
});

t('requirePmoAgree: a touch missing pmoValue (null) is excluded, not silently included', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = { ...touchFor({ side: 'up', wtStateValue: -5 }), pmoValue: null };
  const { trades, meta } = runStackedFade(packed, [touch], { requirePmoAgree: true });
  assert.equal(meta.pool, 0);
  assert.equal(trades.length, 0);
});

t('requireApproachSpike: a touch with approachVel=3·spike fires', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = { ...touchFor({ side: 'up', wtStateValue: +5 }), approachVel: '3·spike' };
  const { trades, meta } = runStackedFade(packed, [touch], { requireApproachSpike: true });
  assert.equal(meta.pool, 1);
  assert.equal(trades.length, 1);
});

t('requireApproachSpike: a touch with approachVel=1·grind is excluded', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = { ...touchFor({ side: 'up', wtStateValue: +5 }), approachVel: '1·grind' };
  const { trades, meta } = runStackedFade(packed, [touch], { requireApproachSpike: true });
  assert.equal(meta.pool, 0);
  assert.equal(trades.length, 0);
});

t('tpRetraceFrac=1.0 (default): fade TP is exactly vwapAtTouch, unchanged', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });   // vwapAtTouch=99
  const touch = touchFor({ side: 'up', wtStateValue: +5 });
  const { trades } = runStackedFade(packed, [touch], {});
  assert.ok(Math.abs(trades[0].tp - 99) < 1e-6, `tp should be vwapAtTouch=99, got ${trades[0].tp}`);
});

t('tpRetraceFrac=0.5: fade TP sits halfway between entry and vwapAtTouch, SL unchanged', () => {
  // up-touch (SELL): entry~101 (next bar open), vwapAtTouch=99 -> half-retrace tp=100.
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 100 });
  const touch = touchFor({ side: 'up', wtStateValue: +5 });
  const full = runStackedFade(packed, [touch], { tpRetraceFrac: 1.0 });
  const half = runStackedFade(packed, [touch], { tpRetraceFrac: 0.5 });
  assert.ok(Math.abs(half.trades[0].tp - 100) < 1e-6, `half-retrace tp should be 100 (halfway to vwap=99 from entry=101), got ${half.trades[0].tp}`);
  assert.ok(Math.abs(full.trades[0].sl - half.trades[0].sl) < 1e-6, 'SL is unaffected by tpRetraceFrac');
});

t('excludeOverlap: a touch with overlapWindow=true is excluded', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = { ...touchFor({ side: 'up', wtStateValue: +5 }), overlapWindow: true };
  const { trades, meta } = runStackedFade(packed, [touch], { excludeOverlap: true });
  assert.equal(meta.pool, 0);
  assert.equal(trades.length, 0);
});

t('excludeOverlap: a touch with overlapWindow=false still fires', () => {
  const packed = buildPacked({ side: 'up', entryPx: 101, tpPx: 99 });
  const touch = { ...touchFor({ side: 'up', wtStateValue: +5 }), overlapWindow: false };
  const { trades, meta } = runStackedFade(packed, [touch], { excludeOverlap: true });
  assert.equal(meta.pool, 1);
  assert.equal(trades.length, 1);
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
  // Touch bar (minute 60) also closes at entryPx — satisfies the new
  // confirmTfMinutes<=1 default (the touch bar's OWN close must already be
  // beyond the band, not just its wick) for every existing 'follow' test.
  const touchIdx = testDayIdx * barsPerDay + 60;
  opens[touchIdx] = entryPx; highs[touchIdx] = entryPx + 0.03; lows[touchIdx] = entryPx - 0.03; closes[touchIdx] = entryPx;
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

t("followSlSigma: tightening the stop moves SL closer to entry, TP unchanged (widens R:R)", () => {
  // vwap=100, band=2, σ=1 -> TP fixed at 103 regardless; SL at (band-followSlSigma)σ.
  const touch = followTouchFor({ side: 'up' });
  const packed = buildQuietPacked({ entryPx: 102 });
  const wide = runStackedFade(packed, [touch], { action: 'follow', followSlSigma: 1.0 }).trades[0];   // SL=101 (original)
  const tight = runStackedFade(packed, [touch], { action: 'follow', followSlSigma: 0.5 }).trades[0];  // SL=101.5
  assert.ok(Math.abs(wide.tp - 103) < 1e-6 && Math.abs(tight.tp - 103) < 1e-6, 'TP is unaffected by followSlSigma');
  assert.ok(Math.abs(wide.sl - 101) < 1e-6, `default followSlSigma=1.0 keeps the original SL=101, got ${wide.sl}`);
  assert.ok(Math.abs(tight.sl - 101.5) < 1e-6, `followSlSigma=0.5 moves SL to 101.5 (closer to entry), got ${tight.sl}`);
  assert.ok(tight.sl > wide.sl, 'a smaller followSlSigma must move the stop CLOSER to entry, not further');
});

// ── confirmTfMinutes (2026-08-30) — "look at the 1m/3m closed candle" ───────
t("confirmTfMinutes=1 (default): a touch that WICKS beyond the band but CLOSES back inside is not traded", () => {
  const touch = followTouchFor({ side: 'up' });   // level = 102
  const packed = buildQuietPacked({ entryPx: 102 });
  // Override the touch bar (minute 60) to wick to 102.05 but close back at 100.5 -- below the level.
  const touchIdx = 3 * 1440 + 60;
  packed.highs[touchIdx] = 102.05; packed.closes[touchIdx] = 100.5; packed.opens[touchIdx] = 100.4;
  const { trades } = runStackedFade(packed, [touch], { action: 'follow' });
  assert.equal(trades.length, 0, 'a wick-only touch (close back inside the band) must not be traded');
});

t("confirmTfMinutes=3: waits for the enclosing 3-minute bucket's own close, not the touch bar's", () => {
  // dayStart-aligned 3m buckets close when (minuteOfDay+1)%3===0 -- for a
  // touch at minute 60, that's minute 62 (60,61,62 form one bucket).
  const touch = followTouchFor({ side: 'up' });   // level = 102, epoch = minute 60
  const packed = buildQuietPacked({ entryPx: 102 });
  const touchIdx = 3 * 1440 + 60, bucketCloseIdx = 3 * 1440 + 62, entryIdx = 3 * 1440 + 63;
  // Touch bar itself closes back inside (would fail confirmTfMinutes=1) --
  // but the bucket's OWN close (minute 62) is beyond the level.
  packed.closes[touchIdx] = 100.5; packed.opens[touchIdx] = 100.4;
  packed.closes[bucketCloseIdx] = 102.2; packed.highs[bucketCloseIdx] = 102.3; packed.lows[bucketCloseIdx] = 100.2;
  packed.opens[entryIdx] = 102.5; packed.highs[entryIdx] = 102.6; packed.lows[entryIdx] = 102.4; packed.closes[entryIdx] = 102.5;
  const oneMin = runStackedFade(packed, [touch], { action: 'follow', confirmTfMinutes: 1 });
  assert.equal(oneMin.trades.length, 0, 'sanity: this same touch fails confirmTfMinutes=1 (its own close is inside)');
  const threeMin = runStackedFade(packed, [touch], { action: 'follow', confirmTfMinutes: 3 });
  assert.equal(threeMin.trades.length, 1, 'confirmTfMinutes=3 confirms off the bucket close instead');
  assert.ok(Math.abs(threeMin.trades[0].entry - 102.5) < 1e-6, `entry should be the bar AFTER the confirming bucket close (minute 63), got ${threeMin.trades[0].entry}`);
});

t('followSlSigma: an SL config that lands on the wrong side of entry is rejected, not silently mis-priced', () => {
  // band=1, vwap=100, σ=1 -> entry~101. followSlSigma=-1 -> SL=(1-(-1))σ=2σ=102,
  // ABOVE entry for a BUY -- a nonsensical stop that must be filtered, not traded.
  const touch = followTouchFor({ side: 'up', band: 1 });
  const packed = buildQuietPacked({ entryPx: 101 });
  const { trades } = runStackedFade(packed, [touch], { action: 'follow', followSlSigma: -1 });
  assert.equal(trades.length, 0, 'an SL config that lands on the wrong side of entry must be rejected, not traded');
});

console.log(`${passed} passed`);
process.exit(process.exitCode || 0);
