// js/cogExplainability.js — V2 explainability helpers.
//
// V1's gate files already format human-readable `reasons[]` strings (e.g.
// "DXY weakening (liquidity supportive) (+0.42)") and raw `contributions[]`/
// `breakdown[]` arrays — but each gate's directional phrase table (PHRASES
// in cogDirectionGate.js/cogThreshold1Gate.js) is a private, unexported
// local to that file. This module never reaches into those tables (it
// can't); it builds V2's mandatory `{factor, contribution, explanation}`
// triples purely from what each gate already returns publicly:
// contributions[]/breakdown[] (the numbers) and reasons[] (the already-
// phrased text, for the gates that have it). Nothing here invents new
// market interpretation — it only reformats/diffs numbers V1 already
// computed.

// Strips the trailing " (+0.42)" / " (-1.30)" suffix every Threshold1/Gate3
// `reasons[]` string ends with — that number is redundant once `contribution`
// is carried as its own field on the returned object.
const SUFFIX_RE = /\s*\([+-]?\d+(?:\.\d+)?\)\s*$/;

// For Threshold1/Gate3-shaped evaluations: `contributions[]` entries carry
// {label, contribution}; `reasons[]` is built by those gates by ranking
// contributions by |contribution| descending and slicing — the exact same
// ranking re-derived here, so `ranked[k]` and `reasons[k]` always refer to
// the same input and can be zipped positionally without guessing.
export function factorReasonsFromContributions(contributions, reasons) {
  if (!reasons || !reasons.length) return [];
  const ranked = (contributions || [])
    .filter(c => c.contribution != null)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, reasons.length);
  return ranked.map((c, idx) => ({
    factor: c.label,
    contribution: c.contribution,
    explanation: (reasons[idx] || '').replace(SUFFIX_RE, ''),
  }));
}

// For compositeRampScore-shaped evaluations (Gate2/Risk, Trigger Gate):
// `breakdown[]` entries carry {label, subScore, rawValue} but no pre-phrased
// reasons[] to borrow text from, so the explanation is built directly from
// the numbers — still "no black boxes" (every figure shown is one the gate
// itself produced), just not a hand-written market phrase the way
// Threshold1/Gate3's PHRASES tables are. `worstFirst` defaults to true
// (most-concerning-first) since this is mainly used to explain why a gate
// ISN'T clearing; pass false to rank best-first instead (e.g. explaining why
// the Trigger Gate did arm).
export function factorReasonsFromBreakdown(breakdown, { worstFirst = true, limit = 4 } = {}) {
  const ranked = (breakdown || [])
    .filter(c => c.subScore != null)
    .sort((a, b) => worstFirst ? a.subScore - b.subScore : b.subScore - a.subScore)
    .slice(0, limit);
  return ranked.map(c => ({
    factor: c.label,
    subScore: c.subScore,
    explanation: `${c.label}: ${c.subScore.toFixed(0)}/100${c.rawValue != null ? ` (raw ${c.rawValue.toFixed(2)})` : ''}`,
  }));
}

function biggestDelta(prevList, nextList, valueKey) {
  const prevById = new Map((prevList || []).map(c => [c.id, c]));
  let biggest = null, delta = 0;
  for (const c of (nextList || [])) {
    const prevVal = prevById.get(c.id)?.[valueKey] ?? 0;
    const nextVal = c[valueKey] ?? 0;
    const d = nextVal - prevVal;
    if (Math.abs(d) > Math.abs(delta)) { delta = d; biggest = c; }
  }
  return biggest ? { entry: biggest, delta } : null;
}

// Causal "why did this gate's state just change" phrase for Setup Gate
// transitions (Threshold1-shaped): the contribution that moved the most
// between the previous and current bar, named without re-deriving market
// phrasing this module has no access to.
export function describeContributionTransition(prevEvaluation, nextEvaluation) {
  const found = biggestDelta(prevEvaluation?.contributions, nextEvaluation?.contributions, 'contribution');
  if (!found) return null;
  const { entry, delta } = found;
  const verb = delta >= 0 ? 'strengthening' : 'weakening';
  return `${entry.label} ${verb} the most (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`;
}

// Same diff, for compositeRampScore-shaped breakdowns (Risk Gate, Trigger
// Gate) — "improved"/"deteriorated" instead of "strengthening"/"weakening"
// since subScore is an absolute [0,100] reading, not a signed vote.
export function describeBreakdownTransition(prevEvaluation, nextEvaluation) {
  const found = biggestDelta(prevEvaluation?.breakdown, nextEvaluation?.breakdown, 'subScore');
  if (!found) return null;
  const { entry, delta } = found;
  const verb = delta >= 0 ? 'improved' : 'deteriorated';
  return `${entry.label} ${verb} the most (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`;
}

// HH:MM formatter for session-local minuteOfDay values (e.g. 870 -> "14:30")
// — every V2 journal line is timestamped with this.
export function fmtTime(minuteOfDay) {
  if (!Number.isFinite(minuteOfDay)) return '--:--';
  const h = Math.floor(minuteOfDay / 60) % 24;
  const m = Math.floor(minuteOfDay % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
