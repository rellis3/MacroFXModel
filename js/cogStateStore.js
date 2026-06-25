// js/cogStateStore.js — V2 generic gate persistence/transition tracker.
//
// V1 has no equivalent of this file: it snapshots a gate once at a fixed
// window's end and discards the snapshot the next day. V2's whole premise is
// that gate validity PERSISTS across bars until something explicitly
// invalidates it, so every gate needs the same three pieces of bookkeeping:
// the current evaluation, the bar a still-valid streak began at (validSince),
// and a log of every label transition. This file is that bookkeeping,
// factored out once so cogStateEngine.js doesn't reimplement it three times
// (once per gate).
//
// Deliberately gate-agnostic: it knows nothing about Setup/Risk/Trigger
// semantics. Callers supply `isValidFn`/`labelFn`/`reasonFn` so the same
// functions work for a Threshold1-shaped evaluation, a Gate2-shaped one, and
// a Trigger-Gate-shaped one without this file branching on which.

export function createGateState(name) {
  return { name, current: null, validSince: null, transitions: [] };
}

// `bar` = { index, date, minuteOfDay } for the bar being evaluated.
// `isValidFn(evaluation)` -> boolean, `labelFn(evaluation)` -> string (the
// human-readable state label, e.g. 'LONG'/'INVALID'/'ARMED_SHORT'),
// `reasonFn(nextEvaluation, prevEvaluationOrNull)` -> string|null, called
// only when the label actually changes, so callers can defer any "why did
// this change" diffing until a transition is known to have happened.
export function updateGateState(gateState, evaluation, bar, { isValidFn, labelFn, reasonFn }) {
  const wasValid = gateState.current ? isValidFn(gateState.current) : false;
  const isValid = isValidFn(evaluation);
  const prevLabel = gateState.current ? labelFn(gateState.current) : 'INVALID';
  const label = labelFn(evaluation);

  let transition = null;
  if (label !== prevLabel) {
    transition = {
      index: bar.index,
      date: bar.date,
      minuteOfDay: bar.minuteOfDay,
      from: prevLabel,
      to: label,
      reason: reasonFn ? reasonFn(evaluation, gateState.current) : null,
    };
    gateState.transitions.push(transition);
  }

  if (!wasValid && isValid) gateState.validSince = { index: bar.index, date: bar.date, minuteOfDay: bar.minuteOfDay };
  else if (wasValid && !isValid) gateState.validSince = null;

  gateState.current = evaluation;
  return { transitioned: transition != null, transition };
}

export function resetGateState(gateState) {
  gateState.current = null;
  gateState.validSince = null;
  gateState.transitions = [];
}
