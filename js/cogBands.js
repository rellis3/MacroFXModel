/**
 * COG bands — the volatility-range line set COG publishes, as a reusable brick.
 *
 * This is the SAME calc the vol-forecast-v2 "⬇ COG" export uses: a fixed constant
 * set applied to a daily σ, with NO per-asset-class correction (COG uses one
 * uniform set for fx / indices / gold). It reproduces his published numbers —
 * median H-L ≈ raw Feller (~1.56σ), 75th + O-C run tighter than Feller's 75th.
 *
 * Single source of truth for the constants: `COG_CONST` from cogReverseEngineer.js
 * (back-solved from COG's manual). Never re-inline the numbers — importing them
 * here is what keeps the bot's lines bit-identical to the v2 export (Lego #1).
 *
 * Contract — a DROP-IN for `computeBands(open, sigma, assetClass)` in
 * forecastCore.js: same output keys, so a caller can swap band systems by choosing
 * the brick. The difference is deliberate:
 *   • computeBands: Feller BM/HN constants × per-asset-class width correction.
 *   • computeCogBands: COG's constants, uniform (no correction, no assetClass arg).
 *
 * σ is a daily FRACTION (e.g. 0.0034), exactly the σ the producer/forecaster
 * already compute (volSigmaSeries / nextSigma). Horizon-agnostic: pass a σ already
 * scaled by √periods for weekly/monthly — the constants don't change.
 *
 * Pure (no network / no state) and synthetic-testable.
 */
import { COG_CONST } from './cogReverseEngineer.js';

// COG bands from a daily σ fraction. Output shape mirrors computeBands so it's a
// drop-in swap; `open` places the ± price levels. No assetClass — COG is uniform.
export function computeCogBands(open, sigma) {
  const hl50  = COG_CONST.BM_P50 * sigma;   // median high/low distance (frac)
  const hl75  = COG_CONST.BM_P75 * sigma;   // 75th-pct high/low distance
  const ocMed = COG_CONST.HN_P50 * sigma;   // median close displacement
  const oc75  = COG_CONST.HN_P75 * sigma;   // 75th-pct close displacement
  return {
    hl50, hl75, ocMed, oc75,
    up50: open * (1 + hl50), dn50: open * (1 - hl50),
    up75: open * (1 + hl75), dn75: open * (1 - hl75),
    ocUp: open * (1 + ocMed), ocDn: open * (1 - ocMed),
  };
}

// Re-export the constants so a caller can read/label the active band set without
// reaching into cogReverseEngineer directly.
export { COG_CONST };
