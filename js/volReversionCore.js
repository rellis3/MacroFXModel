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
// spike → bounce" idea) — was attempted and dropped. Unlike price-vs-trailing-anchor
// (where any anchor's spurious reversion is a known, well-behaved artifact to net
// out), vol-richness is a much smoother/more autocorrelated series, and neither a
// circular-shift nor a block-permuted surrogate of it calibrated to a small null on
// a pure random walk (mean |icEdge| 0.06–0.30 across designs tried, sandbox-tested,
// not shipped). That's a real finding, not a shortcut: this specific claim needs a
// properly significance-corrected (block-bootstrap / Newey-West) test, which is
// more scope than this pass — flagged here rather than shipped uncalibrated.
//
// Reuses forwardRealizedVol/trailingRealizedVol/spearman from creditLeadLagEngine.js
// (already generic, not credit-specific), rollingZScore from statsCore.js, and ouFit
// from ouCore.js. No re-implementation of any of this project's shared math
// (CLAUDE.md Lego Principle 1).

import { forwardRealizedVol, trailingRealizedVol, spearman } from './creditLeadLagEngine.js';
import { rollingZScore } from './statsCore.js';
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
