/**
 * Charm & vanna — the vol/time siblings of gamma, as closed-form Black-Scholes
 * greeks + GEX-style aggregate exposures. Pure, offline-testable.
 *
 *   charm  = ∂Δ/∂time  (delta decay) — the CLOCK overlay: dealer hedging into the
 *            close / into expiry that tightens a pin then releases post-OpEx.
 *   vanna  = ∂Δ/∂vol   (= ∂vega/∂spot) — the VOL-CONDITIONAL bias: the "vanna rally"
 *            as IV mean-reverts down (mechanical dealer buying in +gamma).
 *
 * DATA: needs a per-strike implied vol (`sigmaFn`). With a REAL IV surface these are
 * accurate; on a FLAT assumed vol (the fallback, same as the gamma flip uses) CHARM
 * is a decent approximation but VANNA is only illustrative — vanna is fundamentally a
 * skew phenomenon. The caller passes `source: 'iv' | 'flat'` through so every surface
 * can label which it is. Aggregation mirrors the platform's GEX convention exactly
 * (`(callOI − putOI) × greek × mult × spot`) so charm/vanna sit next to GEX cleanly.
 *
 * HONESTY: positioning context, folklore-tier edge, partial on FX — NOT a validated
 * signal. q (dividend) is taken 0 (futures-style); r defaults 0 (rate effect on
 * charm is second-order at these DTEs — pass a real r to include it).
 */

const SQRT2PI = Math.sqrt(2 * Math.PI);
const normPdf = x => Math.exp(-0.5 * x * x) / SQRT2PI;

function _d1d2(spot, strike, T, sigma, r = 0) {
  const vt = sigma * Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) / vt;
  return { d1, d2: d1 - vt, vt };
}

// Vanna (∂Δ/∂σ), per unit spot per unit vol. Identical for calls and puts (parity).
export function bsVanna(spot, strike, T, sigma, { r = 0 } = {}) {
  if (!(spot > 0) || !(strike > 0) || !(T > 0) || !(sigma > 0)) return 0;
  const { d1, d2 } = _d1d2(spot, strike, T, sigma, r);
  return -normPdf(d1) * d2 / sigma;
}

// Charm (∂Δ/∂time), per YEAR (divide by 365 for per-calendar-day). q=0 → identical
// for calls and puts. Positive charm ⇒ the option's delta is rising as time passes.
export function bsCharm(spot, strike, T, sigma, { r = 0 } = {}) {
  if (!(spot > 0) || !(strike > 0) || !(T > 0) || !(sigma > 0)) return 0;
  const { d1, d2, vt } = _d1d2(spot, strike, T, sigma, r);
  return -normPdf(d1) * (2 * r * T - d2 * vt) / (2 * T * vt);
}

// Zero-crossing of a per-strike exposure profile.
//
// The old version returned the FIRST sign change walking up from the lowest strike,
// snapped to whichever side was nearer zero. Both parts were wrong. Deep in the tails
// the exposure is noise flickering either side of zero, so it latched on hundreds of
// points below spot and never got near the money — on gold it returned 3,200 for BOTH
// charm and vanna, which is the giveaway: two genuinely different exposure curves
// cannot share a zero at the same strike. Snapping also quantised the answer to the
// strike grid ($25 on gold, 50 pips on EUR/USD).
//
// Now: collect EVERY crossing, interpolate each to its true zero, and return the one
// closest to spot — the regime boundary price is actually near, not an artefact from
// the far tail. Without a spot it falls back to the largest-magnitude swing, which is
// the dominant boundary rather than the first one encountered.
function _crossing(profile, key, spot = null) {
  const hits = [];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1][key], b = profile[i][key];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) continue;
    if (Math.sign(b) !== Math.sign(a)) {
      const ka = profile[i - 1].strike, kb = profile[i].strike;
      const t = Math.abs(a) / (Math.abs(a) + Math.abs(b));      // linear interp to zero
      hits.push({ price: ka + t * (kb - ka), mag: Math.abs(a) + Math.abs(b) });
    }
  }
  if (!hits.length) return null;
  const pick = Number.isFinite(spot)
    ? hits.reduce((m, h) => (Math.abs(h.price - spot) < Math.abs(m.price - spot) ? h : m))
    : hits.reduce((m, h) => (h.mag > m.mag ? h : m));
  return pick.price;
}

// BS gamma — the missing sibling of bsVanna/bsCharm, sharing the same _d1d2.
export function bsGamma(spot, strike, T, sigma, { r = 0 } = {}) {
  if (!(spot > 0) || !(strike > 0) || !(T > 0) || !(sigma > 0)) return null;
  const { d1, vt } = _d1d2(spot, strike, T, sigma, r);
  return Math.exp(-d1 * d1 / 2) / SQRT2PI / (spot * vt);
}

// GEX FLIP — the price at which TOTAL net dealer gamma exposure crosses zero.
//
// This is the real definition, and it is NOT what a per-strike sign scan measures.
// Gamma depends on where spot IS: every strike's contribution changes as price moves
// (gamma peaks when spot = strike). So the flip has to be found by re-evaluating the
// WHOLE book at candidate prices and root-finding, not by walking the strike ladder
// once at today's spot. On gold the per-strike scan said 3,655 and this says ~4,100
// against another desk's 4,118 — a 460-point error versus ~20.
//
// Above the flip dealers are long gamma (hedging damps moves); below it they are short
// gamma (hedging amplifies). Returns the interpolated crossing nearest spot, or null.
// EVERY crossing, not just the nearest — [{ price, dir, distPct }] sorted by price.
//
// A one-sided book does not give the textbook single handover. USD/CAD (P/C 0.34,
// 24 strikes) has THREE crossings — 1.4103, 1.4296, 1.4936 — so net GEX alternates
// and the book is really a set of BANDS:
//     …–1.4103  long gamma   suppress
//   1.4103–1.4296  SHORT gamma  amplify   <- a short-gamma pocket, spot sits at its edge
//   1.4296–1.4936  long gamma   suppress
// Returning only the nearest reported that pocket's lower edge as if it were the
// whole structure, and — because three roots sit 0.6%, 2.0% and 6.6% away — a few
// pips of basis changed WHICH root won, which read as a 9.4% "drift" between two
// runs over the same book. The roots were not moving; a different one was chosen.
//
// `dir` is the side of the sign change and is the part a consumer actually needs:
// 'long->short' crossing upward means price is entering amplification, 'short->long'
// means it is entering suppression. Three bare prices cannot be told apart.
export function gexFlipCrossings(strikes, calls, puts, { sigmaFn, sigma = 0.2, T, r = 0, mult = 1,
                                                         spot = null, span = 0.25, steps = 400 } = {}) {
  if (!Array.isArray(strikes) || strikes.length < 2 || !(T > 0)) return [];
  const anchor = Number.isFinite(spot) && spot > 0
    ? spot : strikes.slice().sort((a, b) => a - b)[Math.floor(strikes.length / 2)];
  if (!(anchor > 0)) return [];
  const sig = k => { const s = sigmaFn ? sigmaFn(k) : sigma; return (s > 0 ? s : sigma); };
  const total = S => {
    let t = 0;
    for (let i = 0; i < strikes.length; i++) {
      const g = bsGamma(S, strikes[i], T, sig(strikes[i]), { r });
      if (g != null) t += g * ((calls[i] || 0) - (puts[i] || 0)) * mult * S;
    }
    return t;
  };
  const lo = anchor * (1 - span), hi = anchor * (1 + span), step = (hi - lo) / steps;
  const out = [];
  let prev = { S: lo, v: total(lo) };
  for (let S = lo + step; S <= hi; S += step) {
    const v = total(S);
    if (Number.isFinite(prev.v) && Number.isFinite(v) && prev.v !== 0 && Math.sign(v) !== Math.sign(prev.v)) {
      const t = Math.abs(prev.v) / (Math.abs(prev.v) + Math.abs(v));
      const price = prev.S + t * (S - prev.S);
      out.push({ price, dir: prev.v > 0 ? 'long->short' : 'short->long',
                 distPct: +(((price / anchor) - 1) * 100).toFixed(2) });
    }
    prev = { S, v };
  }
  return out;
}

// The crossing nearest spot — unchanged behaviour, kept so every existing caller and
// the stored `gexFlip` scalar keep meaning exactly what they did. Delegates to
// gexFlipCrossings so there is ONE scan, not a second copy free to drift.
export function gexFlipPrice(strikes, calls, puts, opts = {}) {
  const hits = gexFlipCrossings(strikes, calls, puts, opts);
  if (!hits.length) return null;
  const anchor = Number.isFinite(opts.spot) && opts.spot > 0
    ? opts.spot : strikes.slice().sort((a, b) => a - b)[Math.floor(strikes.length / 2)];
  return hits.reduce((m, h) => (Math.abs(h.price - anchor) < Math.abs(m.price - anchor) ? h : m)).price;
}

// Aggregate charm & vanna exposure across the chain, mirroring GEX:
//   netGreek(strike) = (callOI − putOI) × greek × mult × spot
// `sigmaFn(strike)` supplies the per-strike IV (real surface or flat const); `T` is
// years-to-expiry; `mult` the contract multiplier. Returns totals, per-strike
// profiles (sorted by strike) and the zero-crossing "flip" levels.
export function charmVannaExposure(strikes, calls, puts, spot, { sigmaFn, T, r = 0, mult = 1 } = {}) {
  if (!Array.isArray(strikes) || !(spot > 0) || !(T > 0) || typeof sigmaFn !== 'function') return null;
  const rows = [];
  let cex = 0, vex = 0;
  for (let i = 0; i < strikes.length; i++) {
    const k = strikes[i];
    const sig = sigmaFn(k);
    if (!(sig > 0)) continue;
    const net = ((calls[i] || 0) - (puts[i] || 0)) * mult * spot;
    const charm = bsCharm(spot, k, T, sig, { r });
    const vanna = bsVanna(spot, k, T, sig, { r });
    const netCharm = net * charm, netVanna = net * vanna;
    cex += netCharm; vex += netVanna;
    rows.push({ strike: k, netCharm, netVanna });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.strike - b.strike);
  return {
    cex: +cex.toFixed(2), vex: +vex.toFixed(2),
    charmFlip: _crossing(rows, 'netCharm', spot), vannaFlip: _crossing(rows, 'netVanna', spot),
    profile: rows,
  };
}
