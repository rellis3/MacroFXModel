/**
 * FULL-BOOK GEX — net dealer gamma exposure aggregated across EVERY expiry and strike,
 * each option weighted by its OWN gamma (which embeds its DTE and IV). This is the
 * SpotGamma / SqueezeMetrics "whole option book" view, as opposed to the single-expiry
 * GEX the walls and the traded PIN/BREAKOUT regime are read from (`oiCalcExposures`).
 *
 * WHY it's a different number: gamma explodes as T→0, so a near-dated ATM contract counts
 * far more than a far-dated OTM one. The single-expiry view picks ONE expiry (the liquid
 * monthly, usually) and ignores the rest; this weighs the 0-DTE's intensity and the
 * monthly's size TOGETHER. On CME FX the monthly dominates so the two often agree; on
 * indices (0-DTE is huge) they can diverge, which is the whole point of computing both.
 *
 * The per-expiry breakdown (`byExpiry`) answers "which expiry is driving the book today?"
 * — the question a single column can't.
 *
 * Pure, offline-testable; reuses `bsGamma` from gammaGreeks.js (no copy). Sign convention
 * matches the platform's single-expiry GEX: (callOI − putOI) × gamma × mult × spot
 * (dealers long calls / short puts). Analysis view — NOT a validated signal; whether the
 * full-book flip reads the tape better than the single-expiry one is an open, testable
 * question, most likely to matter on indices.
 */

import { bsGamma } from './gammaGreeks.js';

// legs = [{ dte, strikes:[], calls:[], puts:[], sigma? }] — one per expiry column.
//   dte in DAYS (floored to 1 to dodge the T→0 gamma singularity); sigma = that expiry's
//   IV in DECIMAL (falls back to `flatSigma`). strikes already in spot-equivalent price.
// opts: mult (contract multiplier), flatSigma, span (± fraction of spot for the flip
//   root-find), steps (root-find resolution).
// Returns { gex, flip, regime, byExpiry:[{dte,gex,sharePct}], nExpiries, nContracts } or null.
export function fullBookGex(legs, spot, { mult = 1, flatSigma = 0.2, span = 0.25, steps = 400 } = {}) {
  if (!Array.isArray(legs) || !legs.length || !(spot > 0)) return null;
  const clean = legs.map(l => ({
    dte: Number.isFinite(l?.dte) ? l.dte : null,
    T: Math.max(1, Number.isFinite(l?.dte) && l.dte > 0 ? l.dte : 14) / 365,
    sigma: (l?.sigma > 0) ? l.sigma : flatSigma,
    strikes: Array.isArray(l?.strikes) ? l.strikes : [],
    calls: Array.isArray(l?.calls) ? l.calls : [],
    puts: Array.isArray(l?.puts) ? l.puts : [],
  })).filter(l => l.strikes.length);
  if (!clean.length) return null;

  // Net GEX across the whole book at candidate price S.
  const total = (S) => {
    let g = 0;
    for (const l of clean) {
      for (let i = 0; i < l.strikes.length; i++) {
        const gm = bsGamma(S, l.strikes[i], l.T, l.sigma);
        if (gm != null) g += gm * ((l.calls[i] || 0) - (l.puts[i] || 0)) * mult * S;
      }
    }
    return g;
  };
  const gex = total(spot);

  // Per-expiry contribution AT spot — which expiry drives the book (share of |gex|).
  let absSum = 0;
  const rows = clean.map(l => {
    let g = 0;
    for (let i = 0; i < l.strikes.length; i++) {
      const gm = bsGamma(spot, l.strikes[i], l.T, l.sigma);
      if (gm != null) g += gm * ((l.calls[i] || 0) - (l.puts[i] || 0)) * mult * spot;
    }
    absSum += Math.abs(g);
    return { dte: l.dte, gex: g };
  });
  const byExpiry = rows
    .map(e => ({ dte: e.dte, gex: +e.gex.toFixed(2), sharePct: absSum > 0 ? +(Math.abs(e.gex) / absSum * 100).toFixed(1) : 0 }))
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex));

  // Zero-gamma flip: root-find total(S)=0 nearest spot (re-evaluating the whole book as
  // spot moves — same rigour as gexFlipPrice, extended across expiries).
  const lo = spot * (1 - span), hi = spot * (1 + span), step = (hi - lo) / steps;
  const hits = [];
  let prev = { S: lo, v: total(lo) };
  for (let S = lo + step; S <= hi + 1e-9; S += step) {
    const v = total(S);
    if (Number.isFinite(prev.v) && Number.isFinite(v) && prev.v !== 0 && Math.sign(v) !== Math.sign(prev.v)) {
      const t = Math.abs(prev.v) / (Math.abs(prev.v) + Math.abs(v));
      hits.push(prev.S + t * (S - prev.S));
    }
    prev = { S, v };
  }
  const flip = hits.length ? hits.reduce((m, h) => (Math.abs(h - spot) < Math.abs(m - spot) ? h : m)) : null;

  const nContracts = clean.reduce((n, l) =>
    n + l.calls.reduce((a, b) => a + (b || 0), 0) + l.puts.reduce((a, b) => a + (b || 0), 0), 0);

  return {
    gex: +gex.toFixed(2),
    flip: flip != null ? +flip.toFixed(6) : null,
    regime: gex > 0 ? 'PIN' : gex < 0 ? 'BREAKOUT' : 'NEUTRAL',
    byExpiry, nExpiries: clean.length, nContracts: Math.round(nContracts),
  };
}
