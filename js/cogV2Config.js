// js/cogV2Config.js — V2-only config constants.
//
// V1's cogConfig.js is intentionally never edited for this rebuild (see
// cogStateEngine.js header for the full architectural diagnosis) — every new
// threshold/window/component list V2 needs lives here instead. Where a V2
// constant is just "the V1 number, reused" (e.g. the trigger window) it is
// derived directly from cogConfig.js rather than re-typed, so the two files
// can never silently drift apart.
//
// Core diagnosis this config encodes: V1's cogEventBacktestEngine.js is a
// WINDOW-DRIVEN engine — Threshold1 window -> Gate2 window -> Gate3 window ->
// one decision per day at a fixed entryBar. Real COG behavior (per direct
// observation) is a PERSISTENT ASYNCHRONOUS STATE MACHINE: gate validation
// timings vary day to day (Gate 1 can validate at 23:30 the previous night OR
// 11:30am), entry is not a fixed candle, and if no entry has happened ~5
// minutes after the NY cash-equity open the setup is usually dead for the
// day. V2 (cogStateEngine.js) reuses every gate's underlying math UNCHANGED
// (Threshold1/Gate2/Gate3 imported directly from their V1 files, never
// copied) but wraps it in a continuous per-bar evaluator that PERSISTS a
// VALID state until explicitly invalidated, instead of snapshotting once at
// a window's end.

import { COG_INTRADAY_SCHEDULE } from './cogConfig.js';

// ── Trigger Gate active window ──────────────────────────────────────────
// Reuses COG_INTRADAY_SCHEDULE.gate3Window verbatim (14:20-14:35 session-
// local minutes) rather than inventing new numbers: that window already
// brackets the observed real-world entry time (14:20-14:35 UK). Under this
// schedule's session-local minute convention (sessionStartMinute 480 = 08:00
// UK, matching a UK trading-day clock), 09:30 ET (NY cash-equity open, 5
// hours behind UK time when both are in their respective daylight-saving
// periods) lands at minute 870 = 14:30 UK — i.e. gate3Window's own
// endMinute (875 = 14:35) is EXACTLY "NY open + 5 minutes", which is the
// observed real-world dead-setup cutoff. No new number invented: the
// coincidence is read directly off the existing schedule.
export const COG_V2_TRIGGER_WINDOW = {
  startMinute: COG_INTRADAY_SCHEDULE.gate3Window.startMinute,
  endMinute: COG_INTRADAY_SCHEDULE.gate3Window.endMinute,
  label: 'Trigger Gate active window (14:20-14:35 UK / NY open to NY open+5m)',
};

export const COG_V2_NY_OPEN_MINUTE = COG_V2_TRIGGER_WINDOW.endMinute - 5; // 870 = 14:30 UK
export const COG_V2_ENTRY_DEADLINE_MINUTE = COG_V2_TRIGGER_WINDOW.endMinute; // 875 = 14:35 UK = NY open + 5m

// ── Setup Gate (Threshold 1, reused unmodified) ─────────────────────────
// No new score/threshold constants needed — cogStateEngine.js consumes
// computeThreshold1's output directly every bar (it is already a per-bar
// time series in V1; only the artificial "check once at window end"
// restriction the old event engine imposed is removed). This section exists
// so the mapping is documented in one place rather than left implicit.
export const COG_V2_SETUP_NOTE =
  'Setup Gate = computeThreshold1() (cogThreshold1Gate.js) evaluated every bar, ' +
  'continuously, with no fixed window — V2 adds a persistence/validSince layer ' +
  '(cogStateStore.js) on top, it does not change the underlying math.';

// ── Risk Gate (Gate 2, reused unmodified) ───────────────────────────────
// Gate 2's own inputs (vol percentiles, GARCH, daily cross-asset closes) are
// genuinely daily-resolution in this system — see cogConfig.js's Gate 2
// header — so there is no real intraday signal to fake here. "Persist and
// update continuously" for this gate means: stop gating its already-computed
// daily value behind an artificial midday window (V1's gate2Window) and
// instead expose it from the start of the trading day, tracking validSince/
// transitions across days. This is a disclosed limitation, not a faked one.
export const COG_V2_RISK_NOTE =
  'Risk Gate = computeRiskGate() (cogRiskGate.js), frozen per calendar day ' +
  '(same daily-resolution inputs as V1) but visible/tracked continuously from ' +
  'the start of the trading day rather than gated to a fixed midday window.';

// ── Trigger Gate (NEW — NQ price-action impulse + Gate3 direction) ─────
// The one gate V1 never modeled at all: genuine intraday entry timing off
// the traded instrument's own price action. Gate3's cross-asset direction
// read (cogDirectionGate.js, reused unmodified, still daily-resolution) only
// answers "which way" — this adds the "is right now the moment" half via a
// same-bar NQ impulse score, combined through compositeRampScore exactly
// like Gate 2's own ramp-scoring convention.
export const COG_V2_IMPULSE_PARAMS = {
  momentumBurstBars: 3,       // ~15 min at the dataset's 5-min bar interval — short-horizon "burst" ROC
  momentumZWindowBars: 96,    // ~1 trading day of bars (see COG_INTRADAY_SCHEDULE) — rolling baseline for the burst z-score
  volumeZWindowBars: 96,
  openingRangeBars: 6,        // first ~30 min of the session defines the opening range the break is measured against
  zClip: 3,
};

// Components combined via nasdaqTransforms.compositeRampScore — same
// "weight-present, missing data abstains" discipline as every other gate in
// this system. All four raw values are DIRECTION-ALIGNED by
// computeTriggerGate before being passed in here, so every ramp reads as
// "higher raw value = more supportive of triggering now", independent of
// LONG/SHORT (same convention COG_EXIT_SCORE's components use).
export const COG_V2_TRIGGER_SCORE = {
  range: [0, 100],
  armThreshold: 60,   // impulseScore must clear this, AND the window must be active, AND direction must agree with the Setup Gate, to ARM
  minCoverage: 0.5,
  components: [
    { id: 'momentumBurst', label: 'NQ momentum burst (short-horizon ROC z-score, direction-aligned)', weight: 1.2, rampLow: -1.0, rampHigh: 2.5 },
    { id: 'openingRangeBreak', label: 'Opening-range break (normalized distance, direction-aligned)', weight: 1.0, rampLow: -0.5, rampHigh: 1.5 },
    { id: 'volumeSpike', label: 'Volume spike (z-score vs trailing average)', weight: 0.5, rampLow: -1.0, rampHigh: 2.0,
      note: 'Synthetic dataset volume is NOT signal-correlated (see cogDataSources.js) — this component genuinely abstains-to-noise on synthetic data; a disclosed gap, not a faked one. Wire a real intraday volume feed before trusting this weight live.' },
    { id: 'orderflowProxy', label: 'Orderflow proxy (close position within bar range, direction-aligned)', weight: 0.8, rampLow: 0.3, rampHigh: 0.9 },
  ],
};
