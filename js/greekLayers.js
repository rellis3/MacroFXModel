/**
 * Greek layers for the OI Lab: every option greek as a per-strike dealer exposure, built from the same
 * per-expiry book legs (oiBookLegs) the gamma ladder and ripple use, so the layers can never describe a
 * different book. Pure and offline-testable.
 *
 * CONTEXT, NOT LEVELS. Only delta, gamma, vanna and charm make dealers trade the underlying. Vega, theta
 * and rho are profit-and-loss exposures dealers manage with other options, and the higher-order greeks
 * (vomma, veta, zomma, speed, color, ultima) refine those. None of these has been validated as a price
 * level (see oi_research_book/LEVEL_TYPES_PLACEBO_PREREG.md); they are here to show where sensitivity
 * sits, and are off the indicator.
 *
 * MATHS. Black-76 on the futures price (r = 0, q = 0). Each leg uses its own ATM IV (`leg.sigma`), so on
 * CME books there is no skew and the higher-order greeks are estimates. Greeks that are not closed-form
 * in the repo (vomma, veta, zomma, speed, color, ultima) are central finite differences of the primary
 * greeks, so the definitions cannot drift from the formulas; the test checks them against the textbook
 * closed forms where those exist.
 *
 * SIGN CONVENTION (same as the platform's GEX): dealers are long calls and short puts, so a symmetric
 * greek's net exposure is (callOI - putOI) x greek x multiplier. Delta and rho differ between calls and
 * puts, so they use the call and put value explicitly.
 */
import { bsGamma, bsVanna, bsCharm } from './gammaGreeks.js';

const SQRT2PI = Math.sqrt(2 * Math.PI);
const pdf = x => Math.exp(-0.5 * x * x) / SQRT2PI;
// Abramowitz-Stegun 7.1.26 style normal CDF (max error ~1e-7, plenty for exposure shapes)
function cdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = pdf(x), p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
const d12 = (S, K, T, s) => { const v = s * Math.sqrt(T), d1 = (Math.log(S / K) + 0.5 * s * s * T) / v; return { d1, d2: d1 - v }; };
const ok = (S, K, T, s) => S > 0 && K > 0 && T > 0 && s > 0;

export const bsVega = (S, K, T, s) => ok(S, K, T, s) ? S * pdf(d12(S, K, T, s).d1) * Math.sqrt(T) : 0;          // per 1.00 of vol
export const bsDeltaCall = (S, K, T, s) => ok(S, K, T, s) ? cdf(d12(S, K, T, s).d1) : 0;
export const bsPriceCall = (S, K, T, s) => { if (!ok(S, K, T, s)) return 0; const { d1, d2 } = d12(S, K, T, s); return S * cdf(d1) - K * cdf(d2); };
export const bsPricePut = (S, K, T, s) => { if (!ok(S, K, T, s)) return 0; const { d1, d2 } = d12(S, K, T, s); return K * cdf(-d2) - S * cdf(-d1); };
// theta per YEAR, calls and puts identical at r = 0 (futures-style): -S pdf(d1) sigma / (2 sqrt(T))
export const bsTheta = (S, K, T, s) => ok(S, K, T, s) ? -S * pdf(d12(S, K, T, s).d1) * s / (2 * Math.sqrt(T)) : 0;
// Black-76 rho = -T x option price (discounting only)
export const bsRhoCall = (S, K, T, s) => -T * bsPriceCall(S, K, T, s);
export const bsRhoPut = (S, K, T, s) => -T * bsPricePut(S, K, T, s);
const g0 = (S, K, T, s) => bsGamma(S, K, T, s) || 0;

// finite-difference helpers (relative steps, central)
export function bsVomma(S, K, T, s) { const h = s * 1e-3; return (bsVega(S, K, T, s + h) - bsVega(S, K, T, s - h)) / (2 * h); }
export function bsVeta(S, K, T, s) { const h = Math.min(T * 1e-3, T / 4); return -(bsVega(S, K, T + h, s) - bsVega(S, K, T - h, s)) / (2 * h); }   // d vega / d(time passing)
export function bsZomma(S, K, T, s) { const h = s * 1e-3; return (g0(S, K, T, s + h) - g0(S, K, T, s - h)) / (2 * h); }
export function bsSpeed(S, K, T, s) { const h = S * 1e-4; return (g0(S + h, K, T, s) - g0(S - h, K, T, s)) / (2 * h); }
export function bsColor(S, K, T, s) { const h = Math.min(T * 1e-3, T / 4); return -(g0(S, K, T + h, s) - g0(S, K, T - h, s)) / (2 * h); }   // d gamma / d(time passing)
export function bsUltima(S, K, T, s) { const h = s * 1e-3; return (bsVomma(S, K, T, s + h) - bsVomma(S, K, T, s - h)) / (2 * h); }

/** One entry per layer the lab can show. `kind`: flow = makes dealers trade the underlying; pnl = a profit-and-loss exposure; refine = a higher-order refinement. */
export const GREEKS = [
  { key: 'dex',   label: 'DEX',   name: 'delta',  kind: 'flow',   text: 'Net dealer delta by strike: the size of the hedge they are carrying right now.' },
  { key: 'gex',   label: 'GEX',   name: 'gamma',  kind: 'flow',   text: 'Gamma: right = dealers lean against moves (pin), left = they chase them (speed up). The only one with a tested link to next-day range.' },
  { key: 'vanna', label: 'VANNA', name: 'vanna',  kind: 'flow',   text: 'Delta change when implied vol moves. Matters on event days and IV resets; small otherwise.' },
  { key: 'charm', label: 'CHARM', name: 'charm',  kind: 'flow',   text: 'Delta change as time passes: a steady hedging drift into the close and expiry. Untested as a signal.' },
  { key: 'vex',   label: 'VEX',   name: 'vega',   kind: 'pnl',    text: 'Where the book is most sensitive to a vol move. A profit-and-loss exposure: dealers hedge it with options, not the underlying.' },
  { key: 'tex',   label: 'TEX',   name: 'theta',  kind: 'pnl',    text: 'Daily time decay by strike: where sellers collect the most premium for price staying put.' },
  { key: 'rho',   label: 'RHO',   name: 'rho',    kind: 'pnl',    text: 'Interest-rate sensitivity (discounting). Negligible for short-dated FX and index options; shown for completeness.' },
  { key: 'vomma', label: 'VOMMA', name: 'vomma',  kind: 'refine', text: 'How vega changes as vol moves: the convexity of the vol exposure. A risk-limit term, not a spot flow.' },
  { key: 'veta',  label: 'VETA',  name: 'veta',   kind: 'refine', text: 'How vega changes as time passes.' },
  { key: 'zomma', label: 'ZOMMA', name: 'zomma',  kind: 'refine', text: 'How gamma changes as vol moves: shows where the gamma estimate is most sensitive to the vol assumption.' },
  { key: 'speed', label: 'SPEED', name: 'speed',  kind: 'refine', text: 'How gamma changes as price moves: where gamma is about to build or fade.' },
  { key: 'color', label: 'COLOR', name: 'color',  kind: 'refine', text: 'How gamma changes as time passes: where gamma is decaying fastest.' },
  { key: 'ultima', label: 'ULTIMA', name: 'ultima', kind: 'refine', text: 'Third-order vol sensitivity. A model-risk term; effectively noise for a trading read.' },
  { key: 'oi',    label: 'OI',    name: 'contracts', kind: 'raw', text: 'Calls minus puts in contracts. The raw positioning every other layer is built from.' },
];

/** per-strike net exposure of every layer for one leg at one strike */
export function exposureAt(S, K, T, s, calls, puts, mult) {
  const c = calls || 0, p = puts || 0, net = c - p;
  const m = mult || 1;
  const dc = bsDeltaCall(S, K, T, s);
  return {
    // dealer long calls (+delta) and short puts (delta of a put is dc-1, negative, so being short it adds +|delta|)
    dex: m * S * (c * dc + p * (1 - dc)),
    gex: net * m * S * (g0(S, K, T, s)),
    vanna: net * m * S * bsVanna(S, K, T, s),
    charm: net * m * S * bsCharm(S, K, T, s),
    vex: net * m * bsVega(S, K, T, s) / 100,                       // per 1 vol point
    tex: net * m * bsTheta(S, K, T, s) / 365,                      // per calendar day
    rho: m * (c * bsRhoCall(S, K, T, s) - p * bsRhoPut(S, K, T, s)) / 100,   // dealer long calls, short puts; per 1 rate point
    vomma: net * m * bsVomma(S, K, T, s) / 1e4,
    veta: net * m * bsVeta(S, K, T, s) / 100 / 365,
    zomma: net * m * S * bsZomma(S, K, T, s),
    speed: net * m * S * bsSpeed(S, K, T, s),
    color: net * m * S * bsColor(S, K, T, s) / 365,
    ultima: net * m * bsUltima(S, K, T, s) / 1e6,
    oi: net,
  };
}

/**
 * Per-strike layers from the book legs. `legs` are oiBookLegs(inst).legs ({dte, strikes, calls, puts, sigma}).
 * maxDte limits the expiries included (3 = the near set the gamma ladder uses; Infinity = whole book).
 * Returns { rows: [{strike, ...layer}], totals, vega: {net, byExpiry:[{dte, share}], peakStrike} }.
 */
export function greekLayers(legs, spot, { mult = 1, maxDte = Infinity, lo = -Infinity, hi = Infinity, flatSigma = 0.2 } = {}) {
  if (!Array.isArray(legs) || !(spot > 0)) return null;
  const byStrike = new Map(), totals = {}, vegaByExp = [];
  for (const l of legs) {
    if (Number.isFinite(l.dte) && l.dte > maxDte) continue;
    const T = Math.max((Number.isFinite(l.dte) ? l.dte : 1) , 0.25) / 365;   // quarter-day floor: the gamma clock must not blow up
    const s = l.sigma > 0 ? l.sigma : flatSigma;
    let legVega = 0;
    for (let i = 0; i < l.strikes.length; i++) {
      const K = l.strikes[i];
      if (!(K > 0)) continue;
      const e = exposureAt(spot, K, T, s, l.calls[i], l.puts[i], mult);
      legVega += e.vex;
      for (const k in e) totals[k] = (totals[k] || 0) + e[k];
      if (K < lo || K > hi) continue;
      const row = byStrike.get(K) || { strike: K };
      for (const k in e) row[k] = (row[k] || 0) + e[k];
      byStrike.set(K, row);
    }
    vegaByExp.push({ dte: l.dte ?? null, code: l.code ?? null, vega: legVega });
  }
  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const absTot = vegaByExp.reduce((a, x) => a + Math.abs(x.vega), 0) || 1;
  const peak = rows.reduce((m, r) => (Math.abs(r.vex || 0) > Math.abs(m?.vex || 0) ? r : m), null);
  return {
    rows, totals,
    vega: { net: totals.vex || 0, byExpiry: vegaByExp.map(x => ({ ...x, share: Math.abs(x.vega) / absTot })), peakStrike: peak?.strike ?? null },
  };
}
