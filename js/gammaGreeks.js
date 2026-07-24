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

// Zero-crossing of a per-strike net-exposure profile (the charm/vanna analogue of the
// gamma flip): the strike where the running sign flips, nearer-zero side.
function _crossing(profile, key) {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1][key], b = profile[i][key];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.sign(a) !== 0 && Math.sign(b) !== Math.sign(a)) {
      return Math.abs(b) < Math.abs(a) ? profile[i].strike : profile[i - 1].strike;
    }
  }
  return null;
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
    charmFlip: _crossing(rows, 'netCharm'), vannaFlip: _crossing(rows, 'netVanna'),
    profile: rows,
  };
}
