/**
 * GEX LADDER — per-strike dealer gamma, split BY EXPIRY, for the horizontal strike
 * ladder on oi-dashboard.html (the COG-style "GEX (OI)" chart: strikes down the side,
 * one stacked colour per expiry, spot / walls drawn across).
 *
 * WHY per expiry: the single-expiry gexProfile shows one column of the book. Near
 * expiry the 0/1-DTE contracts carry most of the gamma per contract (gamma ∝ 1/√T),
 * so the strike that actually gets hedged today can be invisible in the monthly's
 * profile. Stacking the expiries shows which horizon each bar comes from.
 *
 * Same maths and sign convention as fullBookGex (and the platform's single-expiry GEX):
 * per strike, callGex = callOI·γ·mult·spot, putGex = putOI·γ·mult·spot, net = call − put
 * (dealers long calls / short puts), γ = Black-Scholes gamma at that expiry's DTE + vol.
 * Summing `net` over strikes for a series equals fullBookGex's byExpiry gex for that leg.
 *
 * VOLUME GAMMA: the same weighting applied to TODAY's traded volume instead of resting
 * OI — where today's activity carries gamma. Volume is summed across expiries, so it is
 * weighted at ONE expiry's gamma (the nearest, where most volume trades). Net when the
 * call/put split is known, gross (unsigned) otherwise — a gross bar says "busy", not
 * which way dealers lean.
 *
 * SECOND-ORDER GREEKS per strike, per expiry, same book and same sign convention:
 *   dex   = (callOI·N(d1) + putOI·(N(d1)−1))·mult — the platform's DEX (oiCalcExposures), per strike.
 *   charm = (callOI − putOI)·mult·∂Δ/∂t, PER DAY — how much hedge the book needs
 *           from time passing alone (what pins price into expiry).
 *   vanna = (callOI − putOI)·mult·∂Δ/∂σ, PER 1 VOL POINT — how much hedge a 1-point
 *           move in implied vol forces.
 * All three are in UNITS OF THE UNDERLYING (like DEX), so a day's charm or a vol point's
 * vanna reads directly against the delta bars. (The headline cex/vex are ×spot.)
 * Each expiry uses one (ATM) vol across its strikes, so charm/vanna here are the
 * per-strike shape; the headline charm/vanna flips use the full per-strike smile.
 *
 * Pure, offline-testable. Analysis/display only — nothing trades off this.
 */

import { bsGamma, bsCharm, bsVanna } from './gammaGreeks.js';

// Standard normal CDF (Abramowitz-Stegun 7.1.26, |err| < 1.5e-7) — for N(d1) call delta.
function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

const r5 = v => (Number.isFinite(v) ? +v.toPrecision(5) : 0);

// legs = [{ dte, code?, strikes:[], calls:[], puts:[], sigma? }] — strikes spot-equivalent.
// opts: mult, flatSigma, maxSeries (nearest expiries kept individually; the rest are summed
//   into one "later" series so the ladder still totals the whole book), windowFrac (strikes
//   kept within ±frac of spot), vol ({ strikes, calls?, puts?, totals?, dte, sigma }).
// Returns { strikes, series:[{label,dte,code,sigma,call[],put[],net[],total}], vol, nExpiries } or null.
export function gexLadder(legs, spot, { mult = 1, flatSigma = 0.2, maxSeries = 4, windowFrac = 0.12, vol = null } = {}) {
  if (!(spot > 0)) return null;
  const lo = spot * (1 - windowFrac), hi = spot * (1 + windowFrac);
  const T = dte => (Number.isFinite(dte) ? Math.max(1, dte) : 14) / 365;   // 0 DTE → 1 day (gamma singularity); unknown → 14, as fullBookGex
  const clean = (Array.isArray(legs) ? legs : [])
    .filter(l => Array.isArray(l?.strikes) && l.strikes.length)
    .map(l => ({ ...l, sigma: l.sigma > 0 ? l.sigma : flatSigma }))
    .sort((a, b) => (a.dte ?? 1e9) - (b.dte ?? 1e9));

  // Union of strikes inside the window, keyed by a rounded value so float noise from the
  // basis shift doesn't split one strike into two rows.
  const key = s => s.toPrecision(10);
  const sMap = new Map();
  const addStrike = s => { if (Number.isFinite(s) && s >= lo && s <= hi && !sMap.has(key(s))) sMap.set(key(s), s); };
  for (const l of clean) l.strikes.forEach(addStrike);
  if (vol && Array.isArray(vol.strikes)) vol.strikes.forEach(addStrike);
  const strikes = [...sMap.values()].sort((a, b) => a - b);
  if (strikes.length < 2) return null;
  const idx = new Map(strikes.map((s, i) => [key(s), i]));

  const zeros = () => new Array(strikes.length).fill(0);
  const blank = () => ({ call: zeros(), put: zeros(), dex: zeros(), charm: zeros(), vanna: zeros() });
  const fill = (into, l) => {
    const t = T(l.dte);
    for (let i = 0; i < l.strikes.length; i++) {
      const j = idx.get(key(l.strikes[i])); if (j == null) continue;
      const k = l.strikes[i], c = l.calls[i] || 0, p = l.puts[i] || 0;
      const g = bsGamma(spot, k, t, l.sigma); if (g == null) continue;
      into.call[j] += c * g * mult * spot;
      into.put[j]  += p * g * mult * spot;
      const d1 = (Math.log(spot / k) + 0.5 * l.sigma * l.sigma * t) / (l.sigma * Math.sqrt(t));
      const cd = normCdf(d1);
      into.dex[j]   += (c * cd + p * (cd - 1)) * mult;
      into.charm[j] += (c - p) * mult * bsCharm(spot, k, t, l.sigma) / 365;
      into.vanna[j] += (c - p) * mult * bsVanna(spot, k, t, l.sigma) * 0.01;
    }
  };
  const sum = a => a.reduce((x, y) => x + y, 0);
  const finish = (s, meta) => {
    const net = s.call.map((c, i) => c - s.put[i]);
    return { ...meta, call: s.call.map(r5), put: s.put.map(r5), net: net.map(r5), total: r5(sum(net)),
      dex: s.dex.map(r5), charm: s.charm.map(r5), vanna: s.vanna.map(r5),
      totals: { dex: r5(sum(s.dex)), charm: r5(sum(s.charm)), vanna: r5(sum(s.vanna)) } };
  };

  const series = [];
  clean.slice(0, maxSeries).forEach(l => {
    const s = blank(); fill(s, l);
    series.push(finish(s, { label: Number.isFinite(l.dte) ? `${l.dte} DTE` : 'expiry', dte: l.dte ?? null, code: l.code ?? null, sigma: +l.sigma.toFixed(4) }));
  });
  const rest = clean.slice(maxSeries);
  if (rest.length) {
    const s = blank(); rest.forEach(l => fill(s, l));
    series.push(finish(s, { label: `later (${rest.length})`, dte: rest[0].dte ?? null, code: null, sigma: null, rest: true }));
  }

  let volOut = null;
  if (vol && Array.isArray(vol.strikes) && vol.strikes.length) {
    const split = Array.isArray(vol.calls) && Array.isArray(vol.puts);
    const t = T(vol.dte), sg = vol.sigma > 0 ? vol.sigma : flatSigma;
    const v = { call: new Array(strikes.length).fill(0), put: new Array(strikes.length).fill(0), gross: new Array(strikes.length).fill(0), volume: new Array(strikes.length).fill(0) };
    for (let i = 0; i < vol.strikes.length; i++) {
      const j = idx.get(key(vol.strikes[i])); if (j == null) continue;
      const g = bsGamma(spot, vol.strikes[i], t, sg); if (g == null) continue;
      const w = g * mult * spot;
      const c = split ? (vol.calls[i] || 0) : 0, p = split ? (vol.puts[i] || 0) : 0;
      const tot = split ? c + p : (vol.totals?.[i] || 0);
      v.call[j] += c * w; v.put[j] += p * w; v.gross[j] += tot * w; v.volume[j] += tot;
    }
    volOut = { split, dte: vol.dte ?? null, sigma: +sg.toFixed(4),
      call: v.call.map(r5), put: v.put.map(r5), gross: v.gross.map(r5), volume: v.volume.map(r5),
      net: split ? v.call.map((c, i) => r5(c - v.put[i])) : null };
  }

  return { strikes: strikes.map(v => +v.toPrecision(10)), series, vol: volOut, nExpiries: clean.length };
}
