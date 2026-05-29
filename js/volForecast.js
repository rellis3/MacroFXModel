/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology:
 *   σ         : GARCH(1,1) on log close-to-close returns — one-step-ahead daily σ
 *                 σ²_t = ω + α·r²_{t-1} + β·σ²_{t-1}
 *                 α=0.10, β=0.85 (α+β=0.95) — same as vol.js live engine
 *                 ω is per-asset-class, sets the long-run variance floor
 *                 long-run σ_annual = √(ω / (1−α−β)) × √252
 *
 *   Why GARCH over EWMA(λ=0.94)?
 *     EWMA is GARCH with ω=0 and α+β=1 — no long-run floor, vol drifts down in
 *     quiet periods and under-estimates structural regimes (e.g. gold's elevated
 *     2024-2026 vol). GARCH mean-reverts to ω-implied long-run σ, keeping
 *     estimates grounded even after a calm patch.
 *
 *   H-L range : Analytical Brownian-motion range distribution percentiles
 *               (BM range median=1.572σ, 75th=2.049σ) with per-asset-class correction
 *   O-C move  : Half-normal distribution percentiles (|N(0,σ)|)
 *               with per-asset-class correction for overnight gap behaviour
 *   News mult : High-impact US event overlay (FOMC, NFP, CPI etc.)
 *
 * Per-asset-class corrections (derived from reference data):
 *   commodity  Futures overnight gaps inflate OC vs half-normal (+16%)
 *   index      Equity futures — moderate gap effect (+11%)
 *   fx         24h spot trading — fewer gaps, tighter HL 75th (-5 to -10%)
 */

const TRADING_DAYS = 252;

// ── GARCH(1,1) parameters ─────────────────────────────────────────────────────
// Matches the live vol.js engine — consistent across the whole dashboard.
const G_ALPHA = 0.10;   // shock response (weight on last squared return)
const G_BETA  = 0.85;   // persistence  (weight on previous variance)
// α + β = 0.95 → long-run mean reversion with half-life ≈ 13 sessions

// ── Analytical BM range distribution constants ────────────────────────────────
const BM_RANGE_P50 = 1.572;
const BM_RANGE_P75 = 2.049;

// ── Half-normal O-C percentiles ───────────────────────────────────────────────
const HN_P50 = 0.6745;
const HN_P75 = 1.1503;

// ── Per-asset-class parameters ────────────────────────────────────────────────
// garch_omega : long-run variance floor for GARCH(1,1)
//   ω = (σ_annual_target / √252)² × (1 − α − β)
//   commodity → 24 % long-run   ω ≈ 1.14e-5
//   index     → 20 % long-run   ω ≈ 7.94e-6
//   fx        → 7.5% long-run   ω ≈ 1.12e-6
// hl_75_corr / oc_corr calibrated from reference data (May 29, 2026).
const ASSET_PARAMS = {
  commodity: { garch_omega: 1.14e-5, hl_75_corr: 0.989, oc_corr: 1.163 },
  index:     { garch_omega: 7.94e-6, hl_75_corr: 0.950, oc_corr: 1.111 },
  fx:        { garch_omega: 1.12e-6, hl_75_corr: 0.894, oc_corr: 0.948 },
};

// ── News event multipliers ────────────────────────────────────────────────────
const NEWS_PATTERNS = [
  { re: /federal\s*fund|fomc.*rate|fed.*rate/i, mult: 1.35, label: 'FOMC Rate' },
  { re: /non.?farm|nonfarm|payroll/i,           mult: 1.30, label: 'NFP'       },
  { re: /consumer\s*price|cpi/i,                mult: 1.25, label: 'CPI'       },
  { re: /personal\s*consumption|pce/i,          mult: 1.20, label: 'PCE'       },
  { re: /gross\s*domestic|gdp/i,                mult: 1.15, label: 'GDP'       },
  { re: /producer\s*price|ppi/i,                mult: 1.15, label: 'PPI'       },
];

export function detectNewsMultiplier(events = []) {
  const usHigh = events.filter(e =>
    e.country === 'US' && String(e.impact ?? '').toLowerCase() === 'high',
  );
  let best = { mult: 1.0, label: null };
  for (const ev of usHigh) {
    for (const p of NEWS_PATTERNS) {
      if (p.re.test(ev.event) && p.mult > best.mult) best = { mult: p.mult, label: p.label };
    }
  }
  return best;
}

// ── GARCH(1,1) vol series ─────────────────────────────────────────────────────
// Initialized at the unconditional (long-run) variance so the seed has no
// transient effect on the final estimate after the ~100-bar burn-in.
function garch11VolSeries(logReturns, omega) {
  const n = logReturns.length;
  const out = new Array(n);
  let sigma2 = omega / (1 - G_ALPHA - G_BETA);   // start at long-run variance
  for (let i = 0; i < n; i++) {
    sigma2 = omega + G_ALPHA * logReturns[i] ** 2 + G_BETA * sigma2;
    out[i] = Math.sqrt(sigma2);
  }
  return out;
}

// ── Main forecast ─────────────────────────────────────────────────────────────
/**
 * @param {Array<{close}>} ohlc        Daily bars, oldest → newest
 * @param {string}         assetClass  'commodity' | 'index' | 'fx'
 * @param {number}         newsMult    Output of detectNewsMultiplier()
 * @returns forecast object — all values are percentages
 */
export function computeForecast(ohlc, assetClass = 'fx', newsMult = 1.0) {
  const n = ohlc.length;
  if (n < 60) throw new Error(`Need ≥60 bars, got ${n}`);

  const closes = ohlc.map(b => b.close);
  const logRet = [];
  for (let i = 1; i < n; i++) logRet.push(Math.log(closes[i] / closes[i - 1]));

  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;

  // One-step-ahead GARCH(1,1) σ forecast
  const sigmaFwd    = garch11VolSeries(logRet, p.garch_omega).at(-1);
  const sigmaFwdPct = sigmaFwd * 100;
  const volAnnual   = sigmaFwdPct * Math.sqrt(TRADING_DAYS);

  const r2 = x => Math.round(x * 100) / 100;

  return {
    vol_annual: r2(volAnnual),
    hl_median:  r2(BM_RANGE_P50                * sigmaFwdPct * newsMult),
    hl_75:      r2(BM_RANGE_P75 * p.hl_75_corr * sigmaFwdPct * newsMult),
    oc_median:  r2(HN_P50       * p.oc_corr    * sigmaFwdPct * newsMult),
    oc_75:      r2(HN_P75       * p.oc_corr    * sigmaFwdPct * newsMult),
    news_mult:  r2(newsMult),
  };
}
