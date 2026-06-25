// js/cogExecutionTrigger.js — V2 Trigger Gate: NQ price-action impulse +
// Gate3 direction.
//
// The one gate V1 never modeled (see cogV2Config.js header): genuine
// intraday entry timing off the traded instrument's own price action.
// Direction itself is NOT computed here — it is read straight off Gate 3
// (cogDirectionGate.js, reused unmodified, still daily-resolution, frozen
// per calendar day) via the caller-supplied `gate3Series`/`dayIndexForBar`.
// This file only answers "given that Gate 3 already says LONG/SHORT, is
// NQ's own price action confirming that *right now*, inside the active
// window?" — combined through nasdaqTransforms.compositeRampScore exactly
// like Gate 2's own ramp-scoring convention, so the breakdown shape (and
// therefore cogExplainability.js's factorReasonsFromBreakdown) is identical
// between the two gates.
//
// All four raw components are computed DIRECTION-ALIGNED before being
// handed to compositeRampScore: "higher raw value = more supportive of
// triggering now", independent of LONG/SHORT, same convention
// COG_EXIT_SCORE's components use. volumeSpike is the one exception by
// design — a volume surge is supportive of triggering on EITHER side, so it
// is left direction-agnostic (see COG_V2_TRIGGER_SCORE's note).

import { roc, rollingZScore, compositeRampScore } from './nasdaqTransforms.js';
import { COG_V2_IMPULSE_PARAMS, COG_V2_TRIGGER_SCORE, COG_V2_TRIGGER_WINDOW } from './cogV2Config.js';

// Precomputes the three NQ-only series this gate needs, once over the whole
// dataset (never per-bar): momentum/volume z-scores are plain whole-series
// transforms, but the opening-range break and orderflow proxy are PER-DAY
// (the opening range itself only means something measured against that same
// day's first `openingRangeBars` bars), so those two are built per
// `tradingDays` entry instead.
function computeImpulseSeries(ohlc, n, tradingDays) {
  const { momentumBurstBars, momentumZWindowBars, openingRangeBars, volumeZWindowBars, zClip } = COG_V2_IMPULSE_PARAMS;
  const momentumZ = rollingZScore(roc(ohlc.close, momentumBurstBars), momentumZWindowBars, zClip);
  const volumeZ = rollingZScore(roc(ohlc.volume, momentumBurstBars), volumeZWindowBars, zClip);

  const openingRangeBreak = new Array(n).fill(NaN);
  const orderflowProxy = new Array(n).fill(NaN);
  for (const day of tradingDays) {
    const bars = day.bars;
    if (!bars.length) continue;
    const rangeBars = bars.slice(0, openingRangeBars);
    let hi = -Infinity, lo = Infinity;
    for (const i of rangeBars) { hi = Math.max(hi, ohlc.high[i]); lo = Math.min(lo, ohlc.low[i]); }
    const span = (Number.isFinite(hi) && Number.isFinite(lo) && hi > lo) ? (hi - lo) : NaN;

    for (const i of bars) {
      if (Number.isFinite(span)) {
        if (ohlc.close[i] > hi) openingRangeBreak[i] = (ohlc.close[i] - hi) / span;
        else if (ohlc.close[i] < lo) openingRangeBreak[i] = (ohlc.close[i] - lo) / span;
        else openingRangeBreak[i] = 0;
      }
      const barRange = ohlc.high[i] - ohlc.low[i];
      orderflowProxy[i] = barRange > 0 ? (ohlc.close[i] - ohlc.low[i]) / barRange : 0.5;
    }
  }
  return { momentumZ, volumeZ, openingRangeBreak, orderflowProxy };
}

// Ranked reason strings, same "top contributors first" convention as every
// other gate's `reasons[]` — ranked by subScore (compositeRampScore's [0,100]
// per-component scale) since this breakdown shape has no signed
// `contribution` field the way Threshold1/Gate3's contributions[] do.
function buildReasons(breakdown, limit = 3) {
  return breakdown
    .filter(c => c.subScore != null)
    .sort((a, b) => b.subScore - a.subScore)
    .slice(0, limit)
    .map(c => `${c.label} (score ${c.subScore.toFixed(0)})`);
}

// Computes the full Trigger Gate time series, one entry per INTRADAY bar.
// `ohlc` = { open, high, low, close, volume } for the traded NQ instrument.
// `gate3Series`/`dayIndexForBar` give this bar's frozen daily direction read
// exactly the way cogThreshold1Gate.js's slow leg is frozen per day.
// Returns: { dataValid, armed, direction, impulseScore, coverage, breakdown,
// reasons, windowActive }.
export function computeTriggerGate({ ohlc, n, minuteOfDay, tradingDays, dayIndexForBar, gate3Series }) {
  const { armThreshold, minCoverage, components } = COG_V2_TRIGGER_SCORE;
  const { startMinute, endMinute } = COG_V2_TRIGGER_WINDOW;
  const { momentumZ, volumeZ, openingRangeBreak, orderflowProxy } = computeImpulseSeries(ohlc, n, tradingDays);

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const gate3 = gate3Series[dayIndexForBar[i]];
    const direction = gate3 && gate3.dataValid ? gate3.state : 'INVALID';
    const directionUsable = direction === 'LONG' || direction === 'SHORT';
    const sideSign = direction === 'LONG' ? 1 : -1;

    const valuesById = {};
    if (directionUsable) {
      if (Number.isFinite(momentumZ[i])) valuesById.momentumBurst = sideSign * momentumZ[i];
      if (Number.isFinite(openingRangeBreak[i])) valuesById.openingRangeBreak = sideSign * openingRangeBreak[i];
      if (Number.isFinite(orderflowProxy[i])) valuesById.orderflowProxy = direction === 'LONG' ? orderflowProxy[i] : 1 - orderflowProxy[i];
    }
    if (Number.isFinite(volumeZ[i])) valuesById.volumeSpike = volumeZ[i];

    const { score, coverage, breakdown } = compositeRampScore(valuesById, components);
    const dataValid = coverage >= minCoverage;

    const windowActive = minuteOfDay[i] >= startMinute && minuteOfDay[i] <= endMinute;
    const armed = windowActive && directionUsable && dataValid && score != null && score >= armThreshold;

    out[i] = {
      dataValid, armed, direction, impulseScore: score, coverage, breakdown,
      reasons: buildReasons(breakdown), windowActive,
    };
  }
  return out;
}
