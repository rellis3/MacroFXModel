// Trade Decision Engine — the FAST LOOP (pure, synchronous, no I/O).
//
// One call path: decide(snapshot, request) →
//   hard gates (staleness / news / no-zone, fail-closed)
//   → buildEventFeatures (bounded 0..1, relative units — never absolute price)
//   → logistic score against the model registry
//   → { decision, direction, probability, size_multiplier, top_factors, … }
//
// Everything expensive lives in the slow loop (featureState.js). This module is
// a lookup + a dot product + a sigmoid: microseconds. It is deterministic given
// (snapshot, request, nowMs) so any logged decision can be replayed exactly.
//
// Action/direction defaulting reuses the repo's selector brick
// (selectStrategy from forecastCore — the brain is a selector, not more knobs).

import { selectStrategy } from '../js/forecastCore.js';
import { MODEL_V0 } from './modelV0.js';
import { newsGate, pairCurrencies, DEFAULT_NEWS_CFG } from './newsGate.js';

export const DECIDE_DEFAULTS = {
  maxStalenessMs: 15 * 60_000,  // live snapshots older than this fail closed
  maxDistSigma: 0.35,           // a zone farther than this from price ≠ a touch
};

// ── Macro alignment (the TDE-side half of the macro contract) ────────────────
// The snapshot carries a direction-agnostic macro context (regime + the pair's
// risk-sensitivity from the canonical PAIR_DRIVERS-derived source); the
// per-direction ALIGNED/OPPOSED resolution happens HERE, after action/direction
// defaulting — exactly like the fade/follow features. macroCore (the Tier-1
// brick, built separately) owns computing {regime}; this resolver owns nothing
// but the sign convention:
//   riskSens > 0  ⇒ pair RISES in risk-off (defensive, e.g. EUR/AUD)
//   riskSens < 0  ⇒ pair FALLS in risk-off (risk proxy, e.g. AUD/JPY)
// Pairs with |riskSens| below MACRO_RISK_SENS_MIN have ambiguous risk character
// and resolve NEUTRAL. Threshold frozen BEFORE any results exist (pre-registered).
export const MACRO_RISK_SENS_MIN = 0.4;

// ── Intraday feature names (zero-weighted in v0 — the macro discipline) ──────
// Computed and logged on every event (live + backfill) but ABSENT from
// MODEL_V0.weights, so they cannot move a live score until an ablation fit
// (fitLogistic features: [...v0, ...INTRADAY_FEATURES]) earns them promotion.
export const INTRADAY_FEATURES = [
  'intraday_range_exhausted_follow',  // chasing after >100% of median range used
  'intraday_range_exhausted_fade',    // fading at the edge of the expected range
  'intraday_fade_too_early',          // fading before the day has shown a range
  'intraday_vwap_stretch_fade',       // fading stretched from session VWAP
];

// → +1 aligned / 0 neutral / −1 opposed
export function macroState(riskSens, regime, direction) {
  if (!regime || regime === 'NEUTRAL' || !Number.isFinite(riskSens)) return 0;
  if (Math.abs(riskSens) < MACRO_RISK_SENS_MIN) return 0;
  if (regime !== 'RISK_ON' && regime !== 'RISK_OFF') return 0;
  const expected = (regime === 'RISK_OFF') === (riskSens > 0) ? 'long' : 'short';
  return direction === expected ? 1 : -1;
}

const clamp01 = x => Math.max(0, Math.min(1, x));
const sigmoid = z => 1 / (1 + Math.exp(-z));

// ── Session phase from UTC hour (coarse, v0) ─────────────────────────────────
export function sessionPhaseUTC(ms) {
  const h = new Date(ms).getUTCHours();
  if (h >= 22 || h < 7) return 'asia';
  if (h < 12) return 'london';
  if (h < 19) return 'ny';
  return 'late';
}

// ── Nearest zone within tolerance (distance in σ-of-price units) ─────────────
export function nearestZone(zones, price, sigmaAbs, maxDistSigma = DECIDE_DEFAULTS.maxDistSigma) {
  if (!Array.isArray(zones) || !zones.length || !(sigmaAbs > 0)) return null;
  let best = null, bestD = Infinity;
  for (const z of zones) {
    const d = Math.abs(z.price - price) / sigmaAbs;
    if (d < bestD) { bestD = d; best = z; }
  }
  return bestD <= maxDistSigma ? { zone: best, distSigma: +bestD.toFixed(3) } : null;
}

// ── Feature builder (shared by live scoring AND any future training fit) ─────
// snapshot: FeatureSnapshot (ARCHITECTURE.md §2). request: { price?, action?,
// direction?, approachSigma? }. zoneHit: { zone, distSigma } from nearestZone.
// Returns { features, meta } — features all bounded 0..1.
export function buildEventFeatures(snapshot, request, zoneHit, nowMs, softNewsSoon) {
  const { regime, T, volPct, sigmaDaily, dayOpen } = snapshot;
  const zone = zoneHit.zone;
  const sigmaAbs = sigmaDaily * dayOpen;

  // action/direction: honor the bot's proposal, else derive from the selector
  let action = request.action ?? null;
  let direction = request.direction ?? null;
  const spec = selectStrategy(T, regime);
  if (action !== 'fade' && action !== 'follow') action = spec.action;
  const zoneAbove = zone.price >= dayOpen;
  if (direction !== 'long' && direction !== 'short') {
    if (action === 'fade') direction = zoneAbove ? 'short' : 'long';
    else direction = regime === 'BULL' ? 'long' : regime === 'BEAR' ? 'short'
                   : (zoneAbove ? 'long' : 'short');   // breakout side of the zone
  }

  const stretch = sigmaAbs > 0 ? Math.abs(zone.price - dayOpen) / sigmaAbs : 0;
  // intraday state: per-call override (backfill's per-touch state, or a bot
  // computing its own) → slow-loop snapshot block (≤ staleness gate old) → none
  const intra = request.intraday ?? snapshot.intraday ?? null;
  const approach = Math.abs(Number(request.approachSigma) || intra?.approachSigma || 0);
  const rangeUsed = Number.isFinite(intra?.rangeUsed) ? intra.rangeUsed : null;
  const phase = sessionPhaseUTC(nowMs);
  const trendy = regime === 'BULL' || regime === 'BEAR';
  const isFade = action === 'fade';

  const features = {
    fade_range_regime:     isFade && regime === 'RANGE' ? 1 : 0,
    follow_trend_regime:  !isFade && trendy && T >= 0.55 ? 1 : 0,
    fade_on_trend_day:     isFade ? clamp01((T - 0.55) / 0.45) : 0,
    follow_on_quiet_day:  !isFade ? clamp01((0.45 - T) / 0.45) : 0,
    confluence:            clamp01((Math.min(zone.count ?? 1, 4) - 1) / 3),
    zone_score:            clamp01((zone.score ?? 0) / 6),
    stretch_fade:          isFade ? clamp01((stretch - 0.5) / 1.5) : 0,
    stretch_follow_chase: !isFade ? clamp01((stretch - 1.0) / 1.5) : 0,
    vol_extreme:           volPct > 0.9 ? clamp01((volPct - 0.9) / 0.1) : 0,
    vol_compressed:        volPct < 0.2 ? clamp01((0.2 - volPct) / 0.2) : 0,
    news_soon:             softNewsSoon ? 1 : 0,
    late_session:          phase === 'late' ? 1 : 0,
    fast_approach_fade:    isFade ? clamp01((approach - 0.8) / 1.5) : 0,
    fast_approach_follow: !isFade ? clamp01((approach - 0.8) / 1.5) : 0,
    // SIGNED −1..+1 (the one exception to the 0..1 convention): one degree of
    // freedom ties the aligned bonus to the opposed penalty — the symmetric
    // prior — and halves the variance of a rarely-active feature. Zero when the
    // snapshot has no macro context, so pre-macro training rows are unaffected.
    // v0 carries NO weight for it: it enters scoring only via a promoted fit.
    macro_align:           snapshot.macro
      ? macroState(snapshot.macro.riskSens, snapshot.macro.regime, direction) : 0,
    // intraday (zero-weighted in v0 — see INTRADAY_FEATURES): all 0 when no
    // intraday state exists, so D1-only rows are unchanged
    intraday_range_exhausted_follow: !isFade && rangeUsed != null ? clamp01((rangeUsed - 1.0) / 0.5) : 0,
    intraday_range_exhausted_fade:    isFade && rangeUsed != null ? clamp01((rangeUsed - 1.0) / 0.5) : 0,
    intraday_fade_too_early:          isFade && rangeUsed != null ? clamp01((0.4 - rangeUsed) / 0.4) : 0,
    intraday_vwap_stretch_fade:       isFade && intra ? clamp01((Math.abs(intra.vwapDistSigma ?? 0) - 0.5) / 1.0) : 0,
  };

  return { features, meta: { action, direction, stretch: +stretch.toFixed(3), phase, zoneAbove, intraday: intra ? { rangeUsed, posInRange: intra.posInRange ?? null, vwapDistSigma: intra.vwapDistSigma ?? null, source: request.intraday ? 'request' : 'snapshot' } : null } };
}

// ── Logistic scorer with per-feature contributions (for top_factors) ─────────
export function scoreLogistic(features, model) {
  let z = model.intercept;
  const contributions = [];
  for (const [name, w] of Object.entries(model.weights)) {
    const v = features[name] ?? 0;
    if (v === 0) continue;
    const c = w * v;
    z += c;
    contributions.push({ name, value: +v.toFixed(3), contribution: +c.toFixed(3) });
  }
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { p: sigmoid(z), z: +z.toFixed(4), contributions };
}

// ── The decision (the whole fast loop) ───────────────────────────────────────
export function decide(snapshot, request = {}, opts = {}) {
  const t0 = Date.now();
  const model = opts.model ?? MODEL_V0;
  const cfg = { ...DECIDE_DEFAULTS, ...opts };
  const nowMs = opts.nowMs ?? Date.now();

  const base = {
    ok: true, pair: request.pair ?? snapshot?.pair ?? null,
    model_version: model.version, calibrated: model.calibrated === true,
    mode: snapshot?.mode ?? null,
  };
  const skip = (reason, extra = {}) => ({
    ...base, decision: 'skip', direction: null, action: null,
    probability: null, size_multiplier: 0, reasons: [reason], ...extra,
    latency_ms: Date.now() - t0,
  });

  // 1) snapshot present + fresh (fail closed — stale confidence is the worst bug)
  if (!snapshot) return skip('no_snapshot');
  const staleMs = nowMs - (snapshot.builtAt ?? 0);
  base.feature_staleness_ms = Math.max(0, staleMs);
  if (snapshot.mode !== 'synthetic' && staleMs > cfg.maxStalenessMs) {
    return skip('stale_features', { feature_staleness_ms: staleMs });
  }

  // 2) news hard gate
  const gate = newsGate(snapshot.calendar, nowMs, pairCurrencies(snapshot.pair),
    { ...DEFAULT_NEWS_CFG, ...(opts.newsCfg ?? {}) });
  if (gate.blocked) return skip('news_window', { news: gate.reason });

  // 3) a zone must be in reach — the engine scores zone touches, not open space.
  //    own_level: the caller vouches that THEIR level (a hand-pulled fib, an
  //    order-flow line…) sits at `price`. If the map already has a zone there,
  //    it is used (their level agrees with the map → real confluence); if not,
  //    the price is scored as a standalone external level (confluence 1) rather
  //    than refused. Confluence features then measure how much the engine's own
  //    map agrees with the caller's level.
  const price = Number(request.price) || snapshot.price;
  const sigmaAbs = snapshot.sigmaDaily * snapshot.dayOpen;
  let hit = nearestZone(snapshot.zones, price, sigmaAbs, cfg.maxDistSigma);
  if (!hit && request.own_level) {
    hit = { zone: { price, count: 1, score: 1, sources: ['external'], kinds: ['external'] }, distSigma: 0 };
  }
  if (!hit) return skip('no_level_nearby', { price });

  // 4–5) features → probability
  const { features, meta } = buildEventFeatures(snapshot, request, hit, nowMs, gate.softNewsSoon);
  const scored = scoreLogistic(features, model);

  // 6) threshold + continuous sizing dial
  const go = scored.p >= model.goThreshold;
  const sc = model.sizeCurve;
  const size = go ? +Math.min(sc.cap, sc.base + (scored.p - model.goThreshold) * sc.slope).toFixed(2) : 0;

  // 7) transparency
  const top_factors = scored.contributions.slice(0, 4).map(c =>
    `${c.name}=${c.value} (${c.contribution >= 0 ? '+' : ''}${c.contribution})`);

  return {
    ...base,
    decision: go ? 'go' : 'skip',
    direction: meta.direction, action: meta.action,
    probability: +scored.p.toFixed(4),
    size_multiplier: size,
    regime: snapshot.regime, T: +snapshot.T.toFixed(3),
    vol_percentile: +snapshot.volPct.toFixed(3),
    zone: {
      price: zoneRound(hit.zone.price, snapshot.pair),
      distance_sigma: hit.distSigma,
      confluence: hit.zone.count,
      sources: hit.zone.sources ?? [],
      kinds: hit.zone.kinds ?? [],
    },
    session_phase: meta.phase, stretch_sigma: meta.stretch,
    top_factors,
    features,               // full vector — this is what the decision log stores
    reasons: go ? [] : ['probability_below_threshold'],
    news_soon: gate.softNewsSoon, next_high_impact_min: gate.nextHighImpactMin,
    macro: snapshot.macro
      ? { regime: snapshot.macro.regime, align: features.macro_align, stale: snapshot.macro.stale === true }
      : null,
    intraday: meta.intraday,
    latency_ms: Date.now() - t0,
  };
}

function zoneRound(p, _pair) { return +Number(p).toFixed(5); }
