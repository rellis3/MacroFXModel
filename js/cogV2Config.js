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

// ── Setup Gate hysteresis (V2 overlay, does not touch cogThreshold1Gate.js) ─
// Threshold1's own thresholds (35/-35 in COG_THRESHOLD1_SCORE) classify per
// bar independently. V2 wraps that output in a hysteresis layer here:
// the gate only ENTERS a direction once the score exceeds enterThreshold
// (higher bar than T1's own 35); once entered, it STAYS valid until the score
// falls below stayThreshold (wide band to survive brief pullbacks).
// Wide bands chosen after diagnostic analysis: median score at VALID→INVALID
// transition was 16.3 — stay>15 is exactly that floor; enter>45 ensures we
// don't arm on marginal threshold crossings (score was at median=35.0 at
// INVALID→VALID transitions, meaning many entries were barely above threshold).
export const COG_V2_SETUP_HYSTERESIS = {
  enterThreshold: 45,  // Enter BULLISH/BEARISH: |score| must clear this (vs T1's raw 35)
  stayThreshold: 15,   // Stay valid: |score| must stay above this once entered (wide band)
};

// ── Slow-series pre-smoothing (V2 path only, slow FRED series) ───────────
// WALCL, RRPONTSYD, WTREGEN update weekly; ECBASSETSW/JPNASSETS monthly.
// Passing them raw to computeThreshold1's 1d/7d ROC z-score sub-signals
// generates extreme noise (a weekly WALCL print produces a spike on the
// publication date and flat-lines for 4 more days). The fix: apply a rolling
// mean to these series BEFORE computing ROC z-scores, so the z-score engine
// sees a smoothed regime trend rather than print-day spikes.
// `ids` lists the slow FRED inputs to smooth; credit (BAMLH0A0HYM2) is omitted
// because it is genuinely daily-meaningful (tighter spread = risk appetite).
// `windowDays` = rolling mean lookback in daily bars.
export const COG_V2_SLOW_SMOOTH = {
  windowDays: 30,
  ids: ['walcl', 'rrp', 'tga', 'ecb', 'boj'],
};

// ── Weighted confidence model (V2, replaces binary gate conjunction) ──────
// Instead of "all three gates must be simultaneously boolean-valid", entry
// fires when a weighted blend of three continuous confidence scores clears a
// threshold. This eliminates the binary flip problem: a gate at 34/35 and a
// gate at 36/35 look identical in the boolean model but are both captured here
// as distinct confidence contributions. Direction (setup vs trigger) must still
// agree — confidence scoring only replaces the valid/invalid boolean, not the
// directional requirement.
// Confidence signals (each 0–100):
//   setup_conf   = |setup_score|          (how far from zero — max at ±100)
//   risk_conf    = risk gate score        (Risk Gate's own composite 0–100)
//   trigger_conf = trigger impulse score  (Trigger Gate's own 0–100)
//
// Calibration note (3 seeds × 3257 days, 1976 trigger-armed bars):
//   setup_conf:   mean=16, P50=14, P75=24, P99=45
//   risk_conf:    mean=50, P50=50, P75=63, P99=86
//   trigger_conf: mean=69, P50=67, P75=73, P99=90
//   Combined at full-entry-eligible bars: mean=47.8, P25=43, P75=51.6, max=55.6
//   minScore=40 requires setup_conf ≥ ~19 at median risk/trigger (P52 of setup
//   distribution), filtering truly marginal setup states while keeping the bulk
//   of real opportunities. 78 was unreachable (max achievable = 55.6).
export const COG_V2_CONFIDENCE = {
  setupWeight: 0.45,
  riskWeight: 0.35,
  triggerWeight: 0.20,
  minScore: 40,  // calibrated: max achievable is ~56; 40 filters weakest setup states
};

// ── Minimum setup persistence (stub, currently disabled) ─────────────────
// After hysteresis, setup streaks are expected to lengthen (from median 2 bars
// to ~30 bars). If the streaks are still too short, this param adds a minimum-
// bars-valid requirement before a setup can contribute to an entry. Disabled
// by default (0 = no minimum); enable after observing post-hysteresis streak
// lengths in the diagnostic. Build now, enable later.
export const COG_V2_MIN_SETUP_PERSIST_BARS = 0;
