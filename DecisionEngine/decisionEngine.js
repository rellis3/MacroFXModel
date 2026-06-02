// Decision Engine — pure modifier chain, no DOM, no side effects.
// Input: normalised DecisionInputs object
// Output: DecisionState object
//
// The chain always resolves — NO_TRADE is an explicit result, not a fallback.
// Hierarchy: Event gate → Regime → Vol modifier → Range gating → Session → Confidence

export const MODES = {
  TREND_CONTINUATION:   'TREND_CONTINUATION',
  MEAN_REVERSION:       'MEAN_REVERSION',
  BREAKOUT:             'BREAKOUT',
  POSITION_MANAGEMENT:  'POSITION_MANAGEMENT',
  EXHAUSTION:           'EXHAUSTION',
  NO_TRADE:             'NO_TRADE',
};

export const PARTICIPATION = {
  FULL:     'FULL',
  REDUCED:  'REDUCED',
  MINIMUM:  'MINIMUM',
  NO_TRADE: 'NO_TRADE',
};

/**
 * @typedef {object} DecisionInputs
 * @property {'BULL'|'BEAR'|'RANGE'|'TRANSITION'} regime
 * @property {'COMPRESSION'|'NORMAL'|'EXPANSION'|'EXTREME'} volState
 * @property {number} rangeUtil        — ratio: sessionRange / forecastMedianRange (1.0 = median complete)
 * @property {'EARLY'|'MID'|'LATE'} sessionPhase
 * @property {number} confidence       — 0–1 from regime-confidence.js sizingMult
 * @property {{level:'high'|'medium'|'low'|'none', label:string}|null} eventRisk
 * @property {number|null} cotPercentile  — 0–1, null if unavailable
 */

/**
 * @typedef {object} DecisionState
 * @property {string}  mode
 * @property {string}  participation
 * @property {{long:boolean, short:boolean, breakout:boolean, fade:boolean, newEntry:boolean, addOn:boolean}} permissions
 * @property {number}  riskMult        — 0 | 0.5 | 0.75 | 1.0 | 1.25
 * @property {string}  bias
 * @property {string[]} reasons
 * @property {DecisionInputs} inputs
 */

function noTrade(reason, inputs) {
  return {
    mode: MODES.NO_TRADE,
    participation: PARTICIPATION.NO_TRADE,
    permissions: { long: false, short: false, breakout: false, fade: false, newEntry: false, addOn: false },
    riskMult: 0,
    bias: 'Stand aside — conditions do not support a trade',
    reasons: [reason],
    inputs,
  };
}

// ── Step 0 — Event gate (hard override) ──────────────────────────────────────
// NO_TRADE within 1 hour either side of a high-impact event:
//   – Pre-event:  minutesUntil <= 60 (or timing unknown)
//   – Post-event: minutesSince <= 60 (spike/settlement window)
// 1–4 hours out: REDUCED participation (confidence capped at 0.5 by caller).

function applyEventGate(inputs) {
  const ev = inputs.eventRisk;
  if (!ev || ev.level === 'none' || ev.level === 'low') return null;
  if (ev.level === 'high') {
    // Post-event spike window
    if (ev.minutesSince != null && ev.minutesSince <= 60) {
      return noTrade(`High-impact event released ${ev.minutesSince}m ago: ${ev.label || 'scheduled'} — stand aside`, inputs);
    }
    // Pre-event: hard NO_TRADE within 1h; beyond that treat as medium
    const mins = ev.minutesUntil;
    if (mins == null || mins <= 60) {
      return noTrade(`High-impact event${mins != null ? ` in ${mins}m` : ''}: ${ev.label || 'scheduled'} — stand aside`, inputs);
    }
    // 1–4h window: fall through to medium handling (confidence capped below)
  }
  // medium or high >1h: let chain continue but cap confidence
  return null;
}

// ── Step 1 — Regime → base mode + base permissions ───────────────────────────

function getBaseMode(regime) {
  const bases = {
    BULL:       { mode: MODES.TREND_CONTINUATION, long: true,  short: false, breakout: true,  fade: false, bias: 'Join bullish movement — buy pullbacks' },
    BEAR:       { mode: MODES.TREND_CONTINUATION, long: false, short: true,  breakout: true,  fade: false, bias: 'Join bearish movement — sell rallies' },
    RANGE:      { mode: MODES.MEAN_REVERSION,     long: true,  short: true,  breakout: false, fade: true,  bias: 'Fade range extremes on confirmed rejection' },
    TRANSITION: { mode: MODES.BREAKOUT,           long: false, short: false, breakout: true,  fade: false, bias: 'Wait for breakout confirmation — no pre-emption' },
  };
  const b = bases[regime] ?? bases.TRANSITION;
  return {
    mode: b.mode,
    participation: PARTICIPATION.FULL,
    permissions: { long: b.long, short: b.short, breakout: b.breakout, fade: b.fade, newEntry: true, addOn: false },
    riskMult: 1.0,
    bias: b.bias,
    reasons: [],
  };
}

// ── Step 2 — Vol state modifies participation level ───────────────────────────
// Vol is never directional. It adjusts participation and catches regime conflicts.

function applyVolModifier(state, volState) {
  if (volState === 'EXTREME') {
    return {
      ...state,
      permissions: { ...state.permissions, newEntry: false, addOn: false },
      participation: PARTICIPATION.MINIMUM,
      riskMult: state.riskMult * 0.5,
      reasons: [...state.reasons, 'Vol EXTREME — no new entries, manage existing only'],
    };
  }
  if (volState === 'EXPANSION' && state.mode === MODES.MEAN_REVERSION) {
    return {
      ...state,
      mode: MODES.BREAKOUT,
      permissions: { ...state.permissions, fade: false, breakout: true },
      riskMult: state.riskMult * 0.75,
      bias: 'Vol expanding inside range — breakout likely, fades suspended',
      reasons: [...state.reasons, 'Vol EXPANSION in range regime — switched to BREAKOUT mode'],
    };
  }
  if (volState === 'COMPRESSION' && state.mode === MODES.TREND_CONTINUATION) {
    return {
      ...state,
      permissions: { ...state.permissions, breakout: true },
      bias: state.bias + ' · Vol compressed — favour breakout-style entries',
    };
  }
  return state;
}

// ── Step 3 — Range utilisation gates specific trade types ─────────────────────

function applyRangeGating(state, rangeUtil) {
  if (rangeUtil > 1.5) {
    return {
      ...state,
      mode: MODES.EXHAUSTION,
      participation: PARTICIPATION.MINIMUM,
      permissions: { long: false, short: false, breakout: false, fade: false, newEntry: false, addOn: false },
      riskMult: state.riskMult * 0.5,
      bias: 'Range >150% of forecast — exit priority, no new entries',
      reasons: [...state.reasons, `Range at ${Math.round(rangeUtil * 100)}% of median — extreme extension`],
    };
  }
  if (rangeUtil > 1.25 && state.mode === MODES.TREND_CONTINUATION) {
    return {
      ...state,
      mode: MODES.POSITION_MANAGEMENT,
      permissions: { ...state.permissions, newEntry: false, addOn: false },
      participation: state.participation === PARTICIPATION.FULL ? PARTICIPATION.REDUCED : state.participation,
      riskMult: state.riskMult * 0.75,
      bias: 'Trend extended past 125% of median — hold positions, no new trend entries',
      reasons: [...state.reasons, `Range at ${Math.round(rangeUtil * 100)}% — trend entry window closed`],
    };
  }
  if (rangeUtil > 1.0 && state.permissions.fade) {
    return {
      ...state,
      bias: state.bias + ' · Only on confirmed rejection — no anticipation',
    };
  }
  if (rangeUtil < 0.5 && state.permissions.fade) {
    return {
      ...state,
      permissions: { ...state.permissions, fade: false },
      reasons: [...state.reasons, 'Range <50% of median — too early to fade, direction not established'],
    };
  }
  return state;
}

// ── Step 4 — Session phase adjusts bias and add-on permission ─────────────────

function applySessionTiming(state, sessionPhase) {
  if (sessionPhase === 'LATE') {
    const newParticipation = state.participation === PARTICIPATION.FULL ? PARTICIPATION.REDUCED : state.participation;
    const lateBreakout = state.mode === MODES.MEAN_REVERSION
      ? 'Fade confirmed extremes — late session only, tight stops'
      : 'Hold or exit existing positions — no new breakout entries';
    return {
      ...state,
      participation: newParticipation,
      permissions: { ...state.permissions, breakout: false, addOn: false },
      bias: lateBreakout,
      reasons: [...state.reasons, 'Late session — breakouts suspended, participation reduced'],
    };
  }
  if (sessionPhase === 'EARLY' && state.mode === MODES.TREND_CONTINUATION) {
    return {
      ...state,
      permissions: { ...state.permissions, addOn: true },
      bias: 'Early session — join movement on pullbacks, add-ons permitted',
    };
  }
  if (sessionPhase === 'MID' && state.mode === MODES.TREND_CONTINUATION) {
    return {
      ...state,
      bias: 'Mid session — do not chase, manage existing exposure',
    };
  }
  return state;
}

// ── Step 5 — Confidence scales participation ──────────────────────────────────
// This handles all grey-area state combinations without needing to name them.

function applyConfidenceScaling(state, confidence, cotPercentile, regime) {
  let conf = confidence;

  // COT modifier: extreme positioning amplifies or reduces confidence
  if (cotPercentile != null) {
    const cotExtreme = cotPercentile > 0.9 || cotPercentile < 0.1;
    if (cotExtreme) {
      const cotBull = cotPercentile > 0.9;
      const regimeBull = regime === 'BULL';
      if (cotBull === regimeBull) {
        conf = Math.min(1.0, conf + 0.1); // COT confirms regime
      } else {
        conf = Math.max(0, conf - 0.15); // COT conflicts with regime
        state = { ...state, reasons: [...state.reasons, 'COT extreme positioning conflicts with regime direction'] };
      }
    }
  }

  if (conf < 0.3) {
    return {
      ...state,
      mode: MODES.NO_TRADE,
      participation: PARTICIPATION.NO_TRADE,
      permissions: { long: false, short: false, breakout: false, fade: false, newEntry: false, addOn: false },
      riskMult: 0,
      bias: 'Stand aside — regime confidence too low to identify valid state',
      reasons: [...state.reasons, `Confidence ${Math.round(conf * 100)}% — below minimum threshold`],
    };
  }
  if (conf < 0.5) {
    return {
      ...state,
      participation: PARTICIPATION.REDUCED,
      permissions: { ...state.permissions, addOn: false },
      riskMult: state.riskMult * 0.5,
      reasons: [...state.reasons, `Confidence ${Math.round(conf * 100)}% — reduced participation`],
    };
  }
  if (conf < 0.7) {
    const newPart = state.participation === PARTICIPATION.FULL ? PARTICIPATION.REDUCED : state.participation;
    return {
      ...state,
      participation: newPart,
      riskMult: state.riskMult * 0.75,
    };
  }
  // High confidence: scale riskMult up, capped at 1.25
  const scaledMult = Math.min(state.riskMult * (0.75 + conf * 0.25), 1.25);
  return { ...state, riskMult: +(scaledMult.toFixed(2)) };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full decision engine modifier chain.
 * @param {DecisionInputs} inputs
 * @returns {DecisionState}
 */
export function runDecisionEngine(inputs) {
  // Step 0: event gate
  const eventBlock = applyEventGate(inputs);
  if (eventBlock) return eventBlock;

  // Cap confidence at 0.5 for medium events (but don't override NO_TRADE)
  const effectiveInputs = (inputs.eventRisk?.level === 'medium')
    ? { ...inputs, confidence: Math.min(inputs.confidence, 0.5) }
    : inputs;

  // Steps 1–4: modifier chain
  let state = getBaseMode(effectiveInputs.regime);
  state = applyVolModifier(state, effectiveInputs.volState);
  state = applyRangeGating(state, effectiveInputs.rangeUtil);
  state = applySessionTiming(state, effectiveInputs.sessionPhase);

  // Step 5: confidence + COT
  state = applyConfidenceScaling(state, effectiveInputs.confidence, effectiveInputs.cotPercentile, effectiveInputs.regime);

  return { ...state, inputs: effectiveInputs };
}
