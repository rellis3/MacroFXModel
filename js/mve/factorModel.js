// mve/factorModel.js — Phase 6. The SAFE form of the "Market Relationship Engine":
// a shared-factor (dynamic factor) model, NOT a causal propagation graph (that is
// the overfitting trap — MARKET_VALUATION_ENGINE.md Part 9.1). Each instrument's
// return is regressed on a SMALL set of common macro factors (e.g. real-rate,
// DXY, risk-appetite, inflation-expectations, liquidity). The loadings give a
// cross-asset coherence check: given today's factor moves, where "should" each
// instrument be, and does the independent single-asset fair value agree?
//
// Read-only / diagnostic by design — it does not size trades on its own until the
// single-instrument MVE has proven OOS edge.

import { olsFit, olsPredict } from './ols.js';

// Fit loadings for one instrument: instrumentRet ~ factorRets (rows aligned).
// factorRets: [{ name, series }]. Returns { loadings, intercept, r2, sigma }.
export function fitLoadings(instrumentRet, factorRets, window = 250) {
  const n = instrumentRet.length;
  const len = Math.min(n, ...factorRets.map(f => f.series.length), window);
  if (len < 20) return null;
  const y = instrumentRet.slice(instrumentRet.length - len);
  const F = [];
  for (let i = 0; i < len; i++) F.push(factorRets.map(f => f.series[f.series.length - len + i]));
  const fit = olsFit(F, y);
  if (!fit) return null;
  const loadings = {};
  factorRets.forEach((f, i) => { loadings[f.name] = +fit.beta[i].toFixed(5); });
  return { loadings, intercept: fit.intercept, r2: +Math.max(0, fit.r2).toFixed(3), sigma: fit.sigma, n: len, fit };
}

// Expected instrument return implied by the latest factor moves (a factor-model
// "fair" return). factorMoves: { name: value }. Returns the predicted return.
export function factorImpliedReturn(model, factorMoves) {
  if (!model) return null;
  const x = Object.keys(model.loadings).map(k => factorMoves[k] ?? 0);
  return olsPredict(model.fit, x);
}

// Cross-asset coherence: for each instrument compare its INDEPENDENT single-asset
// fair-value gap (from the MVE) against the factor-model-implied direction. When
// they disagree the standalone signal is less trustworthy (idiosyncratic, not
// macro-driven). rows: [{ name, standaloneGap, factorImplied }]. Returns flags.
export function coherenceCheck(rows) {
  return rows.map(r => {
    const agree = Number.isFinite(r.standaloneGap) && Number.isFinite(r.factorImplied)
      ? Math.sign(r.standaloneGap) === Math.sign(r.factorImplied)
      : null;
    return { name: r.name, agree, standaloneGap: r.standaloneGap, factorImplied: r.factorImplied,
             note: agree === false ? 'idiosyncratic — factor model disagrees, discount confidence' :
                   agree === true  ? 'macro-coherent — factor model confirms' : 'insufficient data' };
  });
}
