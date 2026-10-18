/**
 * Dealer hedging scenarios — what the options book forces dealers to trade if price, implied
 * vol or time move. The engine behind the "Dealer hedging map" on oi-dashboard-v2.html
 * (C.OG's 2026-10-18 chart: OI by strike, zero gamma, IV-shift fans, a hedging-requirement line).
 *
 * Every number re-prices the WHOLE book at a hypothetical state with Black-Scholes; nothing is
 * read off the strike ladder at today's spot. That is the textbook zero gamma (see the GEX FLIP
 * note in gammaGreeks.js for why a strike walk is wrong).
 *
 *   gamma(P, dv)  dealer gamma at price P with every IV shifted by dv vol points, as futures
 *                 contracts dealers must trade per 1% move (sign: + = they trade AGAINST the
 *                 move, damping it; − = WITH it, amplifying it).
 *   delta(P, dv)  dealer delta, futures-contract equivalents.
 *   hedge(P, dv)  the futures dealers must BUY (+) or SELL (−) to stay flat if price goes from
 *                 spot to P (and IV shifts by dv): −(delta(P, dv) − delta(spot, 0)).
 *   vanna flow    the same trade for an IV change with price still: −(delta(S, dv) − delta(S, 0)).
 *   charm flow    the same trade for one calendar day passing, price and IV still.
 *
 * ASSUMPTIONS, all of them visible on the page:
 *   - Dealer side: long calls, short puts (the platform's convention everywhere). It is not
 *     known; flip it and every sign flips. The range effect of the GEX sign is REAL on NQ in
 *     our tests; walls as support/resistance and direction from it are not.
 *   - IV shifts are parallel and sticky-strike (each contract keeps its own IV + dv).
 *   - Expiry time is floored at 30 minutes (the gamma singularity), as cboeChain.js does.
 *
 * Contracts: [{ K, T (years), cp: 'C'|'P', oi, iv (decimal) }]. `optMult` is the option's
 * multiplier, `futMult` the hedge future's ($ per point); CME futures options are one future
 * each (optMult = futMult), Cboe SPX is 100 against ES 50. Pure, no I/O.
 */
import { bsGamma } from './gammaGreeks.js';

const SQRT2PI = Math.sqrt(2 * Math.PI);
const T_FLOOR = 30 * 60e3 / (365 * 864e5);
const DAY = 1 / 365;

// Abramowitz–Stegun 7.1.26 via erf; |error| < 1.5e-7, plenty for hedge sizing.
export function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function bsDelta(S, K, T, sigma, cp) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) return cp === 'C' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  return cp === 'C' ? normCdf(d1) : normCdf(d1) - 1;
}

const dealerSign = cp => (cp === 'C' ? 1 : -1);        // long calls, short puts
const volOf = (c, dv) => Math.max(0.01, (c.iv || 0) + dv / 100);

/** Dealer delta and gamma for the whole book at one state. */
export function bookAt(contracts, P, { dv = 0, dt = 0, ratio = 1 } = {}) {
  let delta = 0, gamma = 0;
  for (const c of contracts) {
    if (!(c.oi > 0) || !(c.iv > 0)) continue;
    const T = Math.max(T_FLOOR, c.T - dt);
    if (c.T - dt <= 0) continue;                         // expired by then: no exposure left
    const s = volOf(c, dv), pos = dealerSign(c.cp) * c.oi * ratio;
    delta += pos * bsDelta(P, c.K, T, s, c.cp);
    const g = bsGamma(P, c.K, T, s);
    if (g) gamma += pos * g * P * 0.01;                   // Δdelta for a 1% move
  }
  return { delta, gamma };
}

function crossings(grid, vals, spot) {
  const out = [];
  for (let i = 1; i < grid.length; i++) {
    const a = vals[i - 1], b = vals[i];
    if (a === 0 || Math.sign(a) === Math.sign(b)) continue;
    const P = grid[i - 1] + (grid[i] - grid[i - 1]) * (a / (a - b));
    out.push({ price: P, dir: a > 0 ? 'long->short' : 'short->long', distPct: (P / spot - 1) * 100 });
  }
  return out.sort((x, y) => Math.abs(x.distPct) - Math.abs(y.distPct));
}

/**
 * The full scenario set. opts: spot (required), lo/hi (price grid, default ±4%), n (grid points),
 * shifts (IV shifts in vol points; 0 is always included), optMult, futMult.
 */
export function hedgingScenario(contracts, { spot, lo, hi, n = 121, shifts = [-2, 0, 2, 4], optMult = 1, futMult = 1 } = {}) {
  if (!(spot > 0) || !Array.isArray(contracts)) return null;
  const book = contracts.filter(c => c && c.K > 0 && c.oi > 0 && c.iv > 0 && c.T > 0 && (c.cp === 'C' || c.cp === 'P'));
  if (!book.length) return null;
  const ratio = optMult / futMult;
  lo = lo ?? spot * 0.96; hi = hi ?? spot * 1.04;
  const sh = [...new Set([0, ...shifts])].sort((a, b) => a - b);
  const grid = Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
  const base = bookAt(book, spot, { ratio });
  const curves = sh.map(dv => {
    const pts = grid.map(P => bookAt(book, P, { dv, ratio }));
    const gamma = pts.map(p => p.gamma);
    return { dv, gamma, delta: pts.map(p => p.delta), hedge: pts.map(p => -(p.delta - base.delta)),
      zeroGamma: crossings(grid, gamma, spot) };
  });
  const at = (dv, dt = 0, P = spot) => bookAt(book, P, { dv, dt, ratio });
  const up = at(0, 0, spot * 1.01), dn = at(0, 0, spot * 0.99);
  const vanna = Object.fromEntries(sh.filter(dv => dv !== 0).map(dv => [dv, -(at(dv).delta - base.delta)]));
  const charm = -(at(0, DAY).delta - base.delta);

  // OI by strike (futures-contract equivalents) for the bars.
  const byK = new Map();
  for (const c of book) {
    const r = byK.get(c.K) || { K: c.K, calls: 0, puts: 0 };
    if (c.cp === 'C') r.calls += c.oi * ratio; else r.puts += c.oi * ratio;
    byK.set(c.K, r);
  }
  const strikes = [...byK.values()].sort((a, b) => a.K - b.K);
  const inWin = strikes.filter(s => s.K >= lo && s.K <= hi);
  const top = (key) => inWin.reduce((b, s) => (s[key] > (b?.[key] ?? -1) ? s : b), null);
  const maxPain = (() => {
    let best = null, min = Infinity;
    for (const s of strikes) {
      let pain = 0;
      for (const o of strikes) pain += o.calls * Math.max(0, s.K - o.K) + o.puts * Math.max(0, o.K - s.K);
      if (pain < min) { min = pain; best = s.K; }
    }
    return best;
  })();
  const total = (s) => s.calls + s.puts;
  const wall = inWin.reduce((b, s) => (total(s) > (b ? total(b) : -1) ? s : b), null);

  return {
    spot, grid, shifts: sh, curves, strikes: inWin, n: book.length,
    atSpot: {
      gamma: base.gamma, delta: base.delta,
      regime: base.gamma > 0 ? 'long' : base.gamma < 0 ? 'short' : 'flat',
      hedgeUp1pct: -(up.delta - base.delta), hedgeDown1pct: -(dn.delta - base.delta),
      vanna, charm,
    },
    zeroGamma: curves.find(c => c.dv === 0).zeroGamma,
    levels: { callWall: top('calls')?.K ?? null, putWall: top('puts')?.K ?? null, majorWall: wall?.K ?? null, maxPain },
  };
}

/** Plain-English reading of a scenario, for the panel. Numbers in, sentences out; no claims beyond them. */
export function hedgingRead(sc, { fmt = v => v.toFixed(1), unit = 'contracts' } = {}) {
  if (!sc) return [];
  const a = sc.atSpot, k = v => `${Math.abs(Math.round(v)).toLocaleString('en-GB')} ${unit}`;
  const z = sc.zeroGamma[0];
  const out = [];
  out.push(a.regime === 'long'
    ? `Dealers are LONG gamma at spot: a 1% rise makes them sell about ${k(a.hedgeUp1pct)}, a 1% fall makes them buy about ${k(a.hedgeDown1pct)}. Their hedging leans against moves (the damping loop).`
    : `Dealers are SHORT gamma at spot: a 1% rise makes them BUY about ${k(a.hedgeUp1pct)}, a 1% fall makes them SELL about ${k(a.hedgeDown1pct)}. Their hedging chases moves (the amplifying loop).`);
  if (z) out.push(`Zero gamma sits at ${fmt(z.price)} (${z.distPct >= 0 ? '+' : ''}${z.distPct.toFixed(2)}% from spot). ${z.dir === 'long->short'
    ? 'Below it hedging damps; above it hedging chases, so a break higher can feed itself.'
    : 'Above it hedging damps; below it hedging chases, so a break lower can feed itself.'}`);
  else out.push('No zero-gamma crossing inside the window: the whole window is one regime.');
  const zs = sc.curves.filter(c => c.dv !== 0 && c.zeroGamma[0]).map(c => `${c.dv > 0 ? '+' : ''}${c.dv} vol → ${fmt(c.zeroGamma[0].price)}`);
  const hiIv = sc.curves.filter(c => c.dv > 0 && c.zeroGamma[0]).pop();
  const moves = z && hiIv ? (Math.abs(hiIv.zeroGamma[0].distPct) < Math.abs(z.distPct) ? 'toward' : 'away from') : null;
  if (zs.length) out.push(`Zero gamma moves with implied vol: ${zs.join(', ')}.${moves ? ` Higher IV moves it ${moves} spot here.` : ''}`);
  const v = a.vanna[-2];
  if (Number.isFinite(v)) out.push(`Vanna: if IV falls 2 points with price unchanged, dealers ${v >= 0 ? 'buy' : 'sell'} about ${k(v)} (the "vol crush" flow).`);
  if (Number.isFinite(a.charm)) out.push(`Charm: one day passing, price and IV unchanged, makes dealers ${a.charm >= 0 ? 'buy' : 'sell'} about ${k(a.charm)} (largest into an expiry).`);
  return out;
}
