/**
 * Residual-Reversion Core — a MINIMAL-DOF, price-only test of "does the residual
 * of a simple fair-value model mean-revert, out-of-sample, after costs?"
 *
 * Why this exists (and how it differs from js/mve/*):
 *   The MVE engine (js/mve/validateInstrument.js) already tests the MACRO-factor
 *   residual (price − OLS(price ~ rate differentials)) and is a documented NULL on
 *   FX (MD files/RESIDUAL_REVERSION_FX_TEST.md). This brick tests the OTHER minimal
 *   object the desk keeps circling: a PRICE-ONLY AR(1) residual — price minus its
 *   own AR(1) one-step forecast — with essentially nothing to overfit. No FRED, no
 *   factor soup, no threshold sweep on the entry decision. It is the bare
 *   "is this thing stretched and does it snap back" question, asked honestly.
 *
 * The minimal-DOF discipline (CLAUDE.md backtest-build section):
 *   - The signal is the bare SIGN of the standardized residual. No entry threshold
 *     is optimised on the entry decision (a threshold is only swept later, and paid
 *     for in the deflated Sharpe across the small hold set).
 *   - The fair value is fit CAUSALLY: at bar i the AR(1) uses only data < i.
 *   - The benchmark is a trailing-mean anchor z-score built the SAME way, because
 *     ANY trailing anchor "reverts" on a random walk — only the model's EDGE over
 *     that spurious baseline is real signal.
 *
 * Pre-registered outcomes (state before running):
 *   "It worked"   = OOS icEdge > 0.03 at some horizon AND the horizon-matched fade
 *                   clears deflated-Sharpe ≥ 0.95 after costs, on ≥30 OOS trades.
 *   "It didn't"   = anything else, including a positive RAW icPredictive that does
 *                   NOT beat the trailing-mean benchmark (the spurious-reversion
 *                   trap this brick exists to catch).
 *
 * Pure: no network, no DOM, no env. Pass in a price series (newest-last number[]
 * or fetchD1-shaped bars); get back the walk-forward OOS report. The runner
 * (analysis/residual_reversion_minimal.mjs) does the fetching + IS/OOS split.
 *
 * Reused bricks (Lego Principle 1 — imported, never copied):
 *   js/ouCore.js        ouFit / ouConvergence / empiricalSnapback (OU diagnostics)
 *   js/backtestStats.js deflatedSharpe (López de Prado multiple-testing correction)
 */

import { ouFit, ouConvergence, empiricalSnapback } from './ouCore.js';
import { deflatedSharpe } from './backtestStats.js';

// ── Small pure helpers (local, no shared-brick equivalent worth importing) ────
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const stdev = a => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// ── Causal AR(1) one-step forecast ───────────────────────────────────────────
// Fit AR(1):  p_t = c + phi·p_{t-1} + e   on the trailing `window` bars STRICTLY
// before index i, then forecast p_i = c + phi·p_{i-1}. The residual is
// price[i] − forecast. phi is clamped to (-0.999, 0.999) so a near-unit-root fit
// doesn't produce an explosive "fair value". Returns null when the window is too
// thin or degenerate (zero variance).
function ar1Forecast(price, i, window) {
  const s = Math.max(1, i - window);          // need p_{i-1}, so window ends at i-1
  const x = [], y = [];
  for (let j = s; j < i; j++) { x.push(price[j - 1]); y.push(price[j]); }
  if (x.length < 10) return null;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0;
  for (let k = 0; k < x.length; k++) { const dx = x[k] - mx; sxy += dx * (y[k] - my); sxx += dx * dx; }
  if (sxx <= 0) return null;
  const phi = Math.max(-0.999, Math.min(0.999, sxy / sxx));
  const c = my - phi * mx;
  const resid = y.map((v, k) => v - (c + phi * x[k]));
  const sigma = stdev(resid) || 1e-12;        // in-sample residual std (the honest band)
  const forecast = c + phi * price[i - 1];    // one-step-ahead, uses only ≤ i-1
  return { forecast, sigma, phi };
}

// ── Walk-forward OOS residual series ─────────────────────────────────────────
// At each bar i (params fit strictly on < i):
//   z      — AR(1) standardized residual: (price[i] − AR1 forecast) / residual σ.
//            This is the model's "stretched" reading. Positive = above forecast.
//   zBench — trailing-mean anchor: (price[i] − rolling mean) / rolling σ, SAME
//            window. The spurious-reversion null the model must beat.
// Returns { idx[], z[], zBench[], phi[] } aligned to price indices.
export function oosResidualSeries(price, { window = 120, minTrain = 150 } = {}) {
  const N = price.length;
  const idx = [], z = [], zBench = [], phi = [];
  const start = Math.max(window, minTrain);
  for (let i = start; i < N; i++) {
    const f = ar1Forecast(price, i, window);
    if (!f || !(f.sigma > 0)) continue;
    // benchmark: trailing mean/std over the same window (strictly < i)
    const s = Math.max(0, i - window);
    const win = price.slice(s, i);
    if (win.length < 10) continue;
    const bm = mean(win);
    const bsd = stdev(win);
    if (!(bsd > 0)) continue;
    idx.push(i);
    z.push((price[i] - f.forecast) / f.sigma);
    zBench.push((price[i] - bm) / bsd);
    phi.push(f.phi);
  }
  return { idx, z, zBench, phi };
}

// ── Full validation report ────────────────────────────────────────────────────
// price: number[] newest-last closes. horizons/thresholds: the small hold/z sweep
// (held fixed and paid for in the deflated Sharpe). costRt: round-trip cost as a
// FRACTION of price (e.g. 0.0002 = 0.02%). IS/OOS split is chronological by index.
export function validateResidualReversion(price, {
  instrument = 'UNKNOWN',
  window = 120,
  minTrain = 150,
  horizons = [1, 5, 10, 20, 60],
  thresholds = [0.0, 0.5, 1.0, 1.5, 2.0],   // 0.0 = the bare-sign minimal-DOF arm
  oosFrac = 0.5,                             // chronological: last oosFrac of OOS points = OOS
  costRt = 0.0002,
  periodsPerYear = 252,
} = {}) {
  if (!price || price.length < minTrain + Math.max(...horizons) + 10) {
    return { ok: false, error: `need ≥ ${minTrain + Math.max(...horizons) + 10} bars, got ${price?.length ?? 0}` };
  }
  const { idx, z, zBench, phi } = oosResidualSeries(price, { window, minTrain });
  if (idx.length < 30) return { ok: false, error: `only ${idx.length} OOS points` };

  // Chronological IS/OOS split on the OOS scoring series (no refit — the walk is
  // already causal; this just chooses which slice we judge as "out of sample").
  const splitAt = Math.floor(idx.length * (1 - oosFrac));
  const oosIdx = idx.slice(splitAt), oosZ = z.slice(splitAt), oosZB = zBench.slice(splitAt);

  const scoreSlice = (sIdx, sZ, sZB) => {
    // IC + hit rate per horizon vs the trailing-mean benchmark.
    const perHorizon = {};
    for (const H of horizons) {
      const zs = [], zb = [], rets = [];
      for (let k = 0; k < sIdx.length; k++) {
        const i = sIdx[k];
        if (i + H >= price.length) break;
        rets.push((price[i + H] - price[i]) / price[i]);
        zs.push(sZ[k]); zb.push(sZB[k]);
      }
      if (zs.length < 20) { perHorizon[H] = { n: zs.length, insufficient: true }; continue; }
      const icM = pearson(zs, rets), icB = pearson(zb, rets);
      let hit = 0, act = 0;
      for (let k = 0; k < zs.length; k++) {
        if (Math.abs(zs[k]) >= 1.0) { act++; if (Math.sign(-zs[k]) === Math.sign(rets[k])) hit++; }
      }
      const icPred = icM == null ? null : +(-icM).toFixed(4);
      const icBenchPred = icB == null ? null : +(-icB).toFixed(4);
      perHorizon[H] = {
        n: zs.length,
        icPredictive: icPred,                 // RAW (spurious-inflated)
        icBenchmark: icBenchPred,             // trailing-mean anchor's spurious IC
        icEdge: (icPred != null && icBenchPred != null) ? +(icPred - icBenchPred).toFixed(4) : null, // the REAL number
        hitRate: act ? +(hit / act).toFixed(3) : null,
        nActionable: act,
      };
    }

    // z-fade strategy, horizon-matched holding + non-overlapping entries + costs.
    const fwdRet = (i, H) => (i + H < price.length ? (price[i + H] - price[i]) / price[i] : null);
    const configs = [];
    for (const hold of horizons) {
      for (const thr of thresholds) {
        const trPnls = [];
        let lastEntry = -Infinity, wins = 0;
        for (let k = 0; k < sIdx.length; k++) {
          const i = sIdx[k];
          if (Math.abs(sZ[k]) < thr) continue;
          if (i - lastEntry < hold) continue;             // non-overlapping
          const r = fwdRet(i, hold);
          if (r == null) continue;
          const pnl = -Math.sign(sZ[k]) * r - costRt;      // fade the residual, pay cost
          trPnls.push(pnl); if (pnl > 0) wins++; lastEntry = i;
        }
        const m = mean(trPnls), sd = stdev(trPnls);
        const perTradeSR = sd > 0 ? m / sd : 0;
        const annSharpe = sd > 0 ? perTradeSR * Math.sqrt(periodsPerYear / hold) : 0;
        configs.push({ hold, threshold: thr, trades: trPnls.length,
                       hitRate: trPnls.length ? +(wins / trPnls.length).toFixed(3) : null,
                       annualizedSharpe: +annSharpe.toFixed(2), perTradeSR, trPnls });
      }
    }
    const eligible = configs.filter(c => c.trades >= 15);
    const best = (eligible.length ? eligible : configs).slice().sort((a, b) => b.annualizedSharpe - a.annualizedSharpe)[0];
    const dsr = best ? deflatedSharpe(best.trPnls, configs.map(c => c.perTradeSR)) : null;
    return { perHorizon, configs, best, dsr };
  };

  const oos = scoreSlice(oosIdx, oosZ, oosZB);

  // OU diagnostic on the FULL causal residual z-series (is it even reverting?).
  const ou = ouFit(z);
  const snapback = empiricalSnapback(z, { entry: 1.5, band: 0.5, horizon: 10 });

  // ── Honest verdict, keyed off OOS icEDGE (beating the spurious anchor) ──────
  const edges = Object.entries(oos.perHorizon).filter(([, r]) => r.icEdge != null);
  const bestH = edges.sort((a, b) => b[1].icEdge - a[1].icEdge)[0];
  const bestEdge = bestH ? bestH[1].icEdge : 0;
  const holdStr = oos.best ? `${oos.best.hold}-bar hold @ z≥${oos.best.threshold}` : 'n/a';
  const oosTrades = oos.best?.trades ?? 0;
  let verdict;
  if (bestEdge > 0.03 && oos.dsr && oos.dsr.dsr >= 0.95 && oosTrades >= 30)
    verdict = `SURVIVES: the AR(1) residual beats a trailing-mean anchor OOS (best icEdge ${bestEdge} at ${bestH[0]}-bar) and the horizon-matched fade (${holdStr}) clears deflated-Sharpe ${oos.dsr.dsr} on ${oosTrades} OOS trades after a ${costRt * 100}% round-trip cost. Candidate — confirm on more instruments first.`;
  else if (bestEdge > 0.03)
    verdict = `WEAK/INCONCLUSIVE: real OOS edge over the benchmark (icEdge ${bestEdge} at ${bestH[0]}-bar) but the best fade (${holdStr}) reaches deflated Sharpe ${oos.dsr?.dsr ?? 'n/a'} on ${oosTrades} OOS trades — short of the 0.95 / ≥30-trade bar. NOT proven.`;
  else
    verdict = `NULL: the AR(1) residual does NOT beat a trailing-mean anchor OOS (best icEdge ${bestEdge}). Any apparent "reversion" is the spurious reversion any trailing anchor shows. Do NOT wire in.`;

  return {
    ok: true,
    instrument,
    window, horizons, costRt,
    oosPoints: oosIdx.length,
    totalPoints: idx.length,
    meanPhi: phi.length ? +mean(phi).toFixed(4) : null,   // <1 ⇒ reverting on average; ≈1 ⇒ near unit root
    perHorizon: oos.perHorizon,
    strategy: {
      bestHold: oos.best?.hold, bestThreshold: oos.best?.threshold,
      trades: oos.best?.trades, hitRate: oos.best?.hitRate,
      annualizedSharpe: oos.best?.annualizedSharpe,
      deflatedSharpe: oos.dsr ? oos.dsr.dsr : null,
      nConfigsTried: oos.configs.length,
    },
    ou: ou && ou.ok ? { kappa: +ou.kappa.toFixed(4), halfLife: +ou.halfLife.toFixed(1), tStat: +ou.tStat.toFixed(2) } : { ok: false },
    snapbackBaseRate: snapback,
    verdict,
    note: 'icEdge = AR(1)-residual icPredictive − trailing-mean-benchmark icPredictive; it is the REAL signal (raw icPredictive is inflated by the spurious detrending reversion any anchor shows). Signal is the bare SIGN of the residual (minimal DOF); the hold×threshold sweep is paid for in the deflated Sharpe. Costs on throughout.',
  };
}

// ── Synthetic-data self-check (used by the unit test) ─────────────────────────
// mulberry32 deterministic PRNG + Box-Muller gaussian, so a seed reproduces exactly.
export function _synth(seed, n, model) {
  let s = seed >>> 0;
  const r = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const p = [1.0];
  for (let i = 1; i < n; i++) {
    if (model === 'rw') p.push(p[i - 1] + 0.001 * g());                    // random walk: NO reversion
    else if (model === 'ar1') p.push(p[i - 1] + (-0.10) * (p[i - 1] - 1.0) + 0.001 * g()); // mean-reverting to 1.0
    else p.push(p[i - 1] + 0.001 * g());
  }
  return p;
}
