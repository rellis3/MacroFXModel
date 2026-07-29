// js/volReversionCore.js — Does NQ's OWN realized vol mean-revert, and does that
// carry forecastable information — the institutional VRP/OU claim (VIX's mean-
// reversion is the textbook OU example) tested directly, instead of "does price
// revert to a macro/mechanical fair value" (both already NULL — MVE_RUN_GUIDE.md
// §6/§10b). Two functions:
//
//   volOuDiagnostic — does NQ's own vol-richness series mean-revert at all, and how
//      fast (κ/half-life via ouCore.ouFit)? A standalone fact, not a forecast claim.
//
//   scoreVolPredictsForwardVol — does today's vol-RICHNESS (z-scored realized vol vs
//      its own trailing history) predict NQ's FORWARD realized vol, BEYOND vol's own
//      naive persistence (today's raw level is usually the best guess of tomorrow's —
//      that persistence is the honest benchmark, the same discipline
//      creditLeadLagEngine.js already uses via its pastVol benchmark).
//
//      IMPORTANT interpretation note, found while validating this on synthetic data:
//      z-scoring vs a rolling window is LITERALLY how you strip out slow regime-level
//      information — so on any series where the vol regime itself is persistent
//      (real markets), raw level will tend to beat the standardized z at predicting
//      future RAW level, structurally, almost regardless of whether vol "really"
//      mean-reverts. A negative/null icEdge here does NOT mean vol doesn't
//      mean-revert (volOuDiagnostic answers that separately) — it means
//      standardizing doesn't help forecast forward vol beyond just using the raw
//      current level. Different, narrower claim; don't conflate the two.
//
// A THIRD claim — does vol-richness predict NQ's forward PRICE return (the "vol
// spike → bounce" idea)? A first attempt was dropped in the PR that introduced this
// file: neither a circular-shift nor a naive block-permuted surrogate calibrated to
// a small null on a pure random walk (mean |icEdge| 0.06–0.30 across designs tried).
// Re-examined 2026-07-28: the missing piece wasn't the block-bootstrap METHOD, it was
// a properly-clamped block length and a real calibration PROOF rather than an ad hoc
// |icEdge| eyeball check. `scoreVolPredictsForwardReturn` below uses the new
// `blockBootstrapIC` brick (statsCore.js — promoted from backtestStats.js's own
// battle-tested stationary block bootstrap, not a new implementation) and its
// calibration is verified directly in volReversionCore.test.mjs: the test's
// FALSE-POSITIVE RATE on repeated independent pure-random-walk simulations, which is
// the actual thing "calibrated" means — not the magnitude of any single |icEdge|
// reading, which is expected to be nonzero even under a perfectly centered null.
//
// Reuses forwardRealizedVol/trailingRealizedVol/spearman from creditLeadLagEngine.js
// (already generic, not credit-specific), forwardReturns from nasdaqResearch.js,
// rollingZScore + blockBootstrapIC from statsCore.js, and ouFit from ouCore.js. No
// re-implementation of any of this project's shared math (CLAUDE.md Lego Principle 1).

import { forwardRealizedVol, trailingRealizedVol, spearman } from './creditLeadLagEngine.js';
import { forwardReturns } from './nasdaqResearch.js';
import { rollingZScore, blockBootstrapIC } from './statsCore.js';
import { ouFit } from './ouCore.js';

// ── Vol-richness z-score: trailing realized vol, standardized against its OWN
// trailing history. Both legs are causal (rv[t] uses returns ≤ t; z[t]'s window
// includes rv[t] itself but nothing after it) — same "no future data" contract as
// every other series helper in this codebase.
export function volRichnessZ(closes, { rvWindow = 20, zWindow = 150, ann = 252 } = {}) {
  const rv = trailingRealizedVol(closes, rvWindow, ann);
  const z = rollingZScore(rv, zWindow);
  return { rv, z };
}

// ── Standalone fact: does NQ's own vol-richness series actually mean-revert, and
// how fast? (Not a forecast-power claim — ouFit.ok says "reverting on this sample",
// per ouCore.js's own contract, not "tradeable".)
export function volOuDiagnostic(closes, opts = {}) {
  const { z } = volRichnessZ(closes, opts);
  return ouFit(z.filter(Number.isFinite));
}

// ── Claim: vol-richness → forward realized vol, benchmarked against vol's own
// raw-level persistence. IS/OOS split (oosFrac trailing fraction), Spearman IC.
// horizon=1 is never computable (forwardRealizedVol needs ≥2 forward returns to
// form a variance estimate) — excluded from the default, not silently dropped.
export function scoreVolPredictsForwardVol(closes, { rvWindow = 20, zWindow = 150, ann = 252,
                                                       horizons = [5, 10, 20, 60],
                                                       oosFrac = 0.35 } = {}) {
  const T = closes.length;
  const { rv, z } = volRichnessZ(closes, { rvWindow, zWindow, ann });
  const minHist = zWindow + rvWindow + 10;
  if (T < minHist + Math.max(...horizons) + 60) {
    return { ok: false, error: `need ≥ ${minHist + Math.max(...horizons) + 60} bars, got ${T}` };
  }

  const perHorizon = {};
  for (const H of horizons) {
    const fwd = forwardRealizedVol(closes, H, ann);
    const idxAll = [];
    for (let t = minHist; t < T; t++) {
      if (Number.isFinite(z[t]) && Number.isFinite(rv[t]) && Number.isFinite(fwd[t])) idxAll.push(t);
    }
    const split = Math.floor(idxAll.length * (1 - oosFrac));
    const oosIdx = idxAll.slice(split);
    if (oosIdx.length < 30) { perHorizon[H] = { n: oosIdx.length, insufficient: true }; continue; }
    const zOos = oosIdx.map(t => z[t]), rvOos = oosIdx.map(t => rv[t]), fwdOos = oosIdx.map(t => fwd[t]);
    const icModel = spearman(zOos, fwdOos).ic;         // does the STANDARDIZED reading predict forward vol
    const icBench = spearman(rvOos, fwdOos).ic;        // vol's own RAW level = the persistence benchmark
    perHorizon[H] = {
      n: oosIdx.length,
      icModel: icModel != null ? +icModel.toFixed(4) : null,
      icBenchmark: icBench != null ? +icBench.toFixed(4) : null,
      icEdge: (icModel != null && icBench != null) ? +(icModel - icBench).toFixed(4) : null,
    };
  }
  const edges = Object.values(perHorizon).filter(h => h.icEdge != null);
  const bestEdge = edges.length ? Math.max(...edges.map(h => h.icEdge)) : null;
  const verdict = bestEdge == null ? 'insufficient data'
    : bestEdge > 0.05
      ? `SURVIVES vs persistence: vol-richness z beats vol's own raw-level persistence at predicting forward realized vol (best icEdge ${bestEdge}) — standardizing adds real information here, not just "vol is currently high".`
      : `NULL vs persistence: vol-richness z does NOT meaningfully beat vol's own raw level (best icEdge ${bestEdge}). Any forecast power is vol clustering (today's level predicting tomorrow's) — the z-score construction adds nothing beyond that.`;
  return { ok: true, oosFrac, horizons, perHorizon, bestEdge, verdict };
}

// ── Claim: vol-richness → forward PRICE return ("vol spike → bounce"), tested
// against a block-bootstrap null rather than an i.i.d. t-test — both z and the
// overlapping-window forward return are autocorrelated, so rankIC's t-test would
// be too liberal (blockBootstrapIC's own docstring, statsCore.js). OOS-only
// (same split convention as scoreVolPredictsForwardVol above) — the IS slice is
// not reported as evidence (CLAUDE.md: "In-sample improvement is not evidence").
export function scoreVolPredictsForwardReturn(closes, { rvWindow = 20, zWindow = 150, ann = 252,
                                                          horizons = [5, 10, 20, 60], oosFrac = 0.35,
                                                          nBoot = 1000, seed = 0x9e3779b9 } = {}) {
  const T = closes.length;
  const { z } = volRichnessZ(closes, { rvWindow, zWindow, ann });
  const minHist = zWindow + rvWindow + 10;
  if (T < minHist + Math.max(...horizons) + 60) {
    return { ok: false, error: `need ≥ ${minHist + Math.max(...horizons) + 60} bars, got ${T}` };
  }

  const perHorizon = {};
  for (const H of horizons) {
    const fwd = forwardReturns(closes, H);
    const idxAll = [];
    for (let t = minHist; t < T; t++) if (Number.isFinite(z[t]) && Number.isFinite(fwd[t])) idxAll.push(t);
    const split = Math.floor(idxAll.length * (1 - oosFrac));
    const oosIdx = idxAll.slice(split);
    if (oosIdx.length < 30) { perHorizon[H] = { n: oosIdx.length, insufficient: true }; continue; }
    const zOos = oosIdx.map(t => z[t]), fwdOos = oosIdx.map(t => fwd[t]);
    const test = blockBootstrapIC(zOos, fwdOos, { meanBlock: zWindow, nBoot, seed: (seed ^ (H * 0x1000193)) >>> 0 });
    perHorizon[H] = test.ok ? test : { n: oosIdx.length, insufficient: true };
  }

  // Picking the best of N horizon tests is itself a multiple-comparison problem
  // (CLAUDE.md: "count the cells and state the chance-baseline (multiple
  // testing)") — measured directly on a pure random walk with this exact 4-horizon
  // default: false-positive rate on the RAW best p-value is ~14%, not the nominal
  // 5% (volReversionCore.test.mjs). Bonferroni-correct across the number of
  // horizons actually tested (not the requested list — insufficient/skipped
  // horizons don't count as trials).
  const sig = Object.entries(perHorizon).filter(([, h]) => h.pValue != null);
  const best = sig.length ? sig.reduce((a, b) => Math.abs(b[1].ic) > Math.abs(a[1].ic) ? b : a) : null;
  const pAdj = best ? Math.min(1, best[1].pValue * sig.length) : null;
  const verdict = !best ? 'insufficient data'
    : pAdj < 0.05
      ? `SURVIVES block-bootstrap null (Bonferroni-adjusted across ${sig.length} horizons): vol-richness IC vs forward H=${best[0]} price return is ${best[1].ic} (raw p=${best[1].pValue}, adj p=${pAdj.toFixed(4)}), beyond what the predictor's own serial dependence explains by chance alone.`
      : `NULL vs block-bootstrap: no horizon's IC clears its own serial-dependence null after multiple-testing correction (best |IC|=${best[1].ic} at H=${best[0]}, raw p=${best[1].pValue}, adj p=${pAdj.toFixed(4)} across ${sig.length} horizons). No detectable "vol spike → bounce" effect once autocorrelation is accounted for.`;
  return { ok: true, oosFrac, horizons, perHorizon,
           best: best ? { horizon: +best[0], ...best[1], pAdjusted: +pAdj.toFixed(4) } : null, verdict };
}
