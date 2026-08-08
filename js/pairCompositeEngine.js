// js/pairCompositeEngine.js — Pair Composite Signal (Tier-1 brick).
//
// Combines already-computed per-leg signals (positioning/COT, fundamentals/
// macro, carry, technical — whichever a caller has) for ONE FX pair into a
// single directional read. Pure: plain numbers/objects in, plain object out —
// no DOM, no network, no globals (Lego Principle: one shared core, imported —
// never copied — see MD files/LEGO_MODULES.md). Shared by today.html (all 26
// tracked crosses) and indexv2.html (per-pair drill view).
//
// This is a CONTEXT combiner, not a backtested trading rule — same posture as
// cot-extremes.html's own crowding-alert disclaimer. It reports what several
// already-built signals agree or disagree on; agreement here is arithmetic,
// not a validated probability of anything. Nothing in this file has been
// backtested — do not present it as more certain than that upstream.

const clip = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const round2 = v => (v == null ? null : +v.toFixed(2));

// ── cotPairBias ──────────────────────────────────────────────────────────
// Turns two currencies' OWN CFTC positioning (Z-score + percentile, already
// computed server-side by _worker.js's /api/cot-extremes) into one continuous
// [-1,+1] read for the PAIR they form together — base long-crowded AND quote
// short-crowded reinforce toward +1 (long the pair, i.e. the crowd already
// owns this trade), and vice versa toward -1. This generalizes the
// "reinforcing pair" logic cot-extremes.html's crowdingCards() combo loop
// already uses (90th/10th-percentile extremes only, binary flag) into a
// continuous score usable for every tracked pair, not just a flag at the
// extremes — and the `extreme` flag below reproduces that exact binary read
// for callers that just want the alert, using the identical 90/10 threshold.
//
// `cotByCcy` = { CCY: { specZ, specPct } | undefined, ... } — a currency-keyed
// snapshot. A currency absent from this map means "no positioning read for
// that leg" (e.g. this feed has no direct USD-index future) and is treated
// as missing, never as a zero/flat reading.
export function cotPairBias(baseCcy, quoteCcy, cotByCcy = {}) {
  const b = cotByCcy[baseCcy], q = cotByCcy[quoteCcy];
  if (!b && !q) return { score: null, extreme: false, base: null, quote: null };
  // Z-score spread between the two legs, scaled so a lone +/-4 Z leg (this
  // project's saturation point for "maximally stretched" — the same
  // zToScore convention every numeric engine here uses) reads as a full
  // +/-1 on its own.
  const bz = b?.specZ ?? 0, qz = q?.specZ ?? 0;
  const score = (b?.specZ == null && q?.specZ == null) ? null : round2(clip((bz - qz) / 4));
  const long90 = p => p != null && p >= 90;
  const short10 = p => p != null && p <= 10;
  const extreme =
    (long90(b?.specPct) && short10(q?.specPct)) ||
    (short10(b?.specPct) && long90(q?.specPct));
  return {
    score, extreme,
    base: b ? { z: b.specZ ?? null, pctile: b.specPct ?? null } : null,
    quote: q ? { z: q.specZ ?? null, pctile: q.specPct ?? null } : null,
  };
}

// ── pairComposite ────────────────────────────────────────────────────────
// `legs` = { name: { score: -1..1|null, label?: string }, ... } — caller
// supplies each leg ALREADY normalized to base-favored-positive [-1,+1]
// (e.g. macroEdgeFor's base-minus-quote composite, cotPairBias's score
// above, a technical pairSignal read). Averages whichever legs are actually
// present — missing is left out, never averaged in as a neutral zero, same
// convention as macroScorecardEngine.js. `agree` counts how many present
// legs share the composite's sign — the closest thing to a confidence read
// this combiner offers, and it is plain arithmetic agreement, not a
// validated probability of anything.
export function pairComposite(legs = {}) {
  const entries = Object.entries(legs).filter(([, v]) => v && v.score != null);
  if (!entries.length) return { score: null, direction: null, agree: 0, total: 0, legs: [] };
  const score = round2(entries.reduce((s, [, v]) => s + v.score, 0) / entries.length);
  const sign = Math.sign(score);
  const agree = entries.filter(([, v]) => v.score !== 0 && Math.sign(v.score) === sign).length;
  const direction = Math.abs(score) < 0.12 ? 'NEUTRAL' : (score > 0 ? 'LONG' : 'SHORT');
  return {
    score, direction, agree, total: entries.length,
    legs: entries.map(([name, v]) => ({ name, score: v.score, label: v.label ?? name })),
  };
}
