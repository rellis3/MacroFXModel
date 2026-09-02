// js/outlookEngine.js — Market Outlook Engine (Tier-1 brick).
//
// Turns signals ALREADY computed elsewhere on this dashboard — the pair
// composite (technical+COT+macro+carry, from `pairCompositeEngine.js`), COT
// positioning, the realised-vol percentile gap already used for the card's
// "σ building/cooling" chip, and the yield-spread z-score family (the one
// component in this repo with a real OOS result — see
// `MD files/YIELD_SPREAD_STRATEGY.md`) — into a labelled 5-day / 20-day
// directional read per pair, plus how much of the horizon an upcoming
// high-impact release eats into.
//
// Pure: plain objects in, plain object out — no DOM, no network, no globals
// (Lego Principle 1: one shared core, imported — never copied). Horizon-
// agnostic (Lego Principle 3): reuses `forecastCore.js`'s own `HORIZONS`
// labels/√-scaling convention so a horizon added there needs no new engine
// here — 'weekly' is the 5-day read, 'monthly' is the 20-day read.
//
// THIS IS A CONTEXT COMPOSITE, NOT A NEW BACKTESTED SIGNAL — same posture as
// `pairCompositeEngine.js`. It reports what already-built reads agree or
// disagree on; agreement is arithmetic, not a validated probability. The one
// exception is the yield-spread leg, tagged VALIDATED below — and even that
// carries the caveat that only USDJPY's sign has been confirmed live
// (`js/yieldSpreadEngine.js`'s own header note); every other pair's z uses
// the engine's automatic FRED-based orientation, unconfirmed live.
import { HORIZONS } from './forecastCore.js';

export { HORIZONS };

const round1 = v => (v == null ? null : +v.toFixed(1));
const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Per-horizon leg weights. NOT fitted — a small principled table, not swept
// (CLAUDE.md: "the brain is a selector, not more knobs"). Rationale per leg:
//  • composite   — the page's own base read; counts at every horizon, a bit
//    less at 20d because a same-day technical/COT snapshot says less about
//    a month out than about the next few sessions.
//  • yieldSpread — mean-reversion in a macro/yield spread plays out over
//    weeks-to-months, not a single session (MARKET_VALUATION_ENGINE.md
//    Q-Final #1) — weight rises from 5d to 20d.
//  • cot         — weekly-cadence positioning data; more a swing-horizon
//    read than a next-few-days one, so it counts a bit more at 20d.
// volRegime is deliberately absent from this table — it never sets direction
// (see volRegimeDriver below), only confidence.
export const HORIZON_WEIGHTS = {
  weekly:  { composite: 1.0, yieldSpread: 0.5, cot: 0.5 },
  monthly: { composite: 0.7, yieldSpread: 1.0, cot: 0.7 },
};

// |biasScore| below this reads NEUTRAL — matches pairCompositeEngine's 0.12
// on its -1..1 scale, carried through on this engine's -100..100 scale.
const BIAS_NEUTRAL_BAND = 12;

function biasLabel(score) {
  if (score == null) return null;
  if (score > BIAS_NEUTRAL_BAND) return 'BULLISH';
  if (score < -BIAS_NEUTRAL_BAND) return 'BEARISH';
  return 'NEUTRAL';
}

// `composite` = pairCompositeEngine.pairComposite() output: { score (-1..1),
// direction, agree, total, legs }.
function compositeDriver(composite) {
  if (!composite || composite.score == null) return null;
  return {
    name: 'composite', label: 'Signal composite (technical/COT/macro/carry)',
    status: 'CONTEXT', score: clip(composite.score, -1, 1),
    detail: `${composite.agree}/${composite.total} of this dashboard's own signals agree — arithmetic agreement, not a backtested rule.`,
  };
}

// `yieldSpread` = { z, inverted } read off /api/yield-spread/plan — already
// sign-oriented (z>0 ⇒ long the pair) by the engine's own resolveInverted
// (see js/yieldSpreadCore.js directionFromZ). Only the 6 pairs in
// js/zscoreSpreadEngine.js's ZSCORE_PAIRS carry this leg; every other pair
// gets no yield-spread driver at all (missing, never a neutral zero — same
// convention pairComposite/cotPairBias already use).
function yieldSpreadDriver(yieldSpread) {
  if (!yieldSpread || yieldSpread.z == null) return null;
  // 3σ ≈ full-scale, same saturation convention cotPairBias uses at 4σ for a
  // Z that runs a little hotter.
  const dirScore = clip(yieldSpread.z / 3, -1, 1);
  return {
    name: 'yieldSpread', label: 'Yield-spread z-score',
    status: 'VALIDATED', score: dirScore,
    detail: `z=${round1(yieldSpread.z)} (US-vs-local short-rate spread, 90d rolling). The one component here with a real OOS result — PF 2.19, Sharpe ~1.14, positive every year 2022-2026 (YIELD_SPREAD_STRATEGY.md). Direction is engine-auto-oriented; only confirmed live for USDJPY.`,
  };
}

// `volRegime` = { volPct, cone5d } — the card's own existing 252d/5d
// volatility percentile pair (no new fetch; identical numbers behind the
// "σ building/cooling" chip). This is a MEASUREMENT of regime, not a
// directional driver — it never sets bias, only confidence: a market
// mid-transition is one where today's snapshot says less about the next
// few sessions.
function volRegimeDriver(volRegime) {
  if (!volRegime || volRegime.volPct == null || volRegime.cone5d == null) return null;
  const gap = volRegime.cone5d - volRegime.volPct;
  const state = gap >= 15 ? 'BUILDING' : gap <= -15 ? 'COOLING' : 'STABLE';
  return {
    name: 'volRegime', label: 'Volatility regime', status: 'CONTEXT',
    score: 0, confidenceAdj: state === 'STABLE' ? 0.05 : -0.05,
    detail: `σ is ${state.toLowerCase()} — 5-day window ranks P${volRegime.cone5d} vs P${volRegime.volPct} over the last year.`,
  };
}

// `cotRead` = cotFor(name)-shaped: { dir, bias (-1..1), level, pct, derived }.
function cotDriver(cotRead) {
  if (!cotRead || cotRead.bias == null) return null;
  return {
    name: 'cot', label: 'Positioning (COT)', status: 'CONTEXT',
    score: clip(cotRead.bias, -1, 1),
    detail: cotRead.level
      ? `${cotRead.level} crowding, ${cotRead.dir}${cotRead.derived ? ' (derived cross)' : ''} — crowded one-way bets can snap back.`
      : `${cotRead.dir} positioning.`,
  };
}

// `events` = pairEvents(name)-shaped array, each carrying `ms` (epoch) and
// `impact`. Returns how many fall inside the horizon's forward window.
function eventRiskFor(events, windowMs) {
  const now = Date.now();
  const inWindow = (events ?? []).filter(e => e.ms >= now && e.ms - now <= windowMs);
  const high = inWindow.filter(e => (e.impact ?? '').toLowerCase() === 'high');
  return { count: inWindow.length, highCount: high.length, next: inWindow[0] ?? null };
}

// inputs = { composite, yieldSpread, volRegime, cot, events }. Each field is
// optional — a caller with only some of these signals loaded still gets a
// read built from what it has (never padded with a neutral zero for what's
// missing, same discipline as pairComposite).
export function computeOutlook(inputs = {}, horizonKey = 'weekly') {
  const horizon = HORIZONS[horizonKey] ?? HORIZONS.weekly;
  const w = HORIZON_WEIGHTS[horizonKey] ?? HORIZON_WEIGHTS.weekly;

  const drivers = [];
  const c = compositeDriver(inputs.composite);   if (c) drivers.push(c);
  const y = yieldSpreadDriver(inputs.yieldSpread); if (y) drivers.push(y);
  const v = volRegimeDriver(inputs.volRegime);   if (v) drivers.push(v);
  const o = cotDriver(inputs.cot);               if (o) drivers.push(o);

  const directional = drivers.filter(d => d.name !== 'volRegime');
  let biasScore = null, agree = 0;
  if (directional.length) {
    let wsum = 0, ssum = 0;
    for (const d of directional) { const wt = w[d.name] ?? 1; wsum += wt; ssum += wt * d.score; }
    biasScore = wsum > 0 ? round1(clip(ssum / wsum, -1, 1) * 100) : null;
  }
  const bias = biasLabel(biasScore);
  if (bias) {
    const sign = bias === 'BULLISH' ? 1 : bias === 'BEARISH' ? -1 : 0;
    agree = directional.filter(d => d.score !== 0 && Math.sign(d.score) === sign).length;
  }

  const windowMs = horizon.windowDays * 24 * 3600e3;
  const eventRisk = eventRiskFor(inputs.events, windowMs);

  // Confidence: leg-agreement fraction (30-70pt) + validated-leg bonus (+15) +
  // vol-regime stability adj (±5) − event-risk penalty (up to −20, a
  // high-impact release inside the window can overturn the read before it
  // plays out). Arithmetic, not a calibrated probability — same honesty
  // posture as every other composite here.
  let confidence = null;
  if (bias) {
    const agreeFrac = directional.length ? agree / directional.length : 0;
    let conf = 30 + agreeFrac * 40;
    if (y) conf += 15;
    if (v?.confidenceAdj) conf += v.confidenceAdj * 100;
    conf -= Math.min(20, eventRisk.highCount * 10);
    confidence = Math.round(clip(conf, 5, 95));
  }

  return {
    horizonKey, horizonLabel: horizon.label, bias, biasScore, confidence,
    agree, total: directional.length, drivers, eventRisk,
    disclaimer: 'CONTEXT composite, not a validated predictive signal — see MD files/CLAUDE.md. The yield-spread leg (when present) is the one component with a real OOS result behind it.',
  };
}

// Convenience: both trading horizons in one call, for a side-by-side view.
export function computeOutlookAllHorizons(inputs = {}, horizonKeys = ['weekly', 'monthly']) {
  const out = {};
  for (const k of horizonKeys) out[k] = computeOutlook(inputs, k);
  return out;
}
