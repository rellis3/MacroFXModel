/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology — estimator chosen per asset class:
 *
 *   commodity : Rogers-Satchell EWMA on daily OHLC — λ=0.94
 *                 rs_t = ln(H/C)·ln(H/O) + ln(L/C)·ln(L/O)
 *                 v_t  = λ·v_{t-1} + (1−λ)·rs_t
 *                 RS handles non-zero drift correctly (gold 2024-2026 uptrend).
 *                 Unlike Garman-Klass it is always ≥ 0 and does not subtract
 *                 the directional CO component, so it doesn't understate vol
 *                 in trending markets.
 *
 *   index/fx  : GARCH(1,1) on close-to-close log returns
 *                 σ²_t = ω + α·r²_{t-1} + β·σ²_{t-1}
 *                 α=0.06, β=0.91 (α+β=0.97, ~23-day half-life)
 *                 ω sets the long-run variance floor — prevents estimates
 *                 collapsing in quiet patches. Pure EWMA (ω=0) drops ~15%
 *                 too low for FX in calm regimes. The ω floor keeps FX in
 *                 line with the reference quant system.
 *
 *   H-L range : BM range distribution percentiles (P50=1.572σ, P75=2.049σ)
 *               with per-asset-class correction
 *   O-C move  : Half-normal percentiles (|N(0,σ)|) with per-asset-class correction
 *   O-H / O-L : Same distribution as O-C by BM reflection principle —
 *               max(B_t) ~ |B_T|, so median O-H = median O-L = median O-C
 *   N-day     : √T scaling — σ_N = σ_1 × √N (independent days)
 *   Vol pct   : Percentile rank of current σ in trailing 252-bar history (0–100)
 *   News mult : High-impact US event overlay (FOMC, NFP, CPI etc.)
 */

const TRADING_DAYS = 252;
const EWMA_LAMBDA  = 0.94;

// GARCH(1,1) parameters for index/fx (daily close-to-close)
const G_ALPHA = 0.06;
const G_BETA  = 0.91;
// α+β=0.97, 1−α−β=0.03

// ── Analytical BM range distribution constants ────────────────────────────────
const BM_RANGE_P50 = 1.572;
const BM_RANGE_P75 = 2.049;

// ── Half-normal O-C percentiles ───────────────────────────────────────────────
const HN_P50 = 0.6745;
const HN_P75 = 1.1503;

// ── Per-asset-class parameters ────────────────────────────────────────────────
// garch_omega : long-run variance floor for GARCH (index/fx only)
//   ω = (σ_annual_target / √252)² × (1−α−β)
//   index → 20% long-run  ω = 4.76e-6
//   fx    → 5.5% long-run ω = 3.60e-7  (was 6.70e-7 / 7.5% — recalibrated
//           2026-06-04: equilibrates near 5% with typical 0.30%/day FX returns)
//
// hl_50_corr / hl_75_corr / oc_50_corr / oc_75_corr
//   Recalibrated 2026-06-08 from reference back-solves (3-day post-omega-fix avg
//   Jun 4–8, reference vol as basis). Key changes:
//   FX oc_50_corr: 1.038→0.956 (was ~10% above reference on every day; omega fix
//     alone corrects vol level but the OC distribution correction also ran high)
//   FX hl_75_corr: 0.912→0.888, FX oc_75_corr: 1.015→0.954 — same direction
//   index: hl/oc corrections reduced 2–3% toward reference 3-day averages
//   commodity: oc_50_corr 1.144→1.126 (minor, 4-day avg excl Jun 8 OC anomaly)
const ASSET_PARAMS = {
  commodity: { hl_50_corr: 1.018, hl_75_corr: 0.940, oc_50_corr: 1.126, oc_75_corr: 1.085 },
  index:     { hl_50_corr: 0.993, hl_75_corr: 0.947, oc_50_corr: 1.061, oc_75_corr: 1.112, garch_omega: 4.76e-6 },
  fx:        { hl_50_corr: 0.955, hl_75_corr: 0.888, oc_50_corr: 0.956, oc_75_corr: 0.954, garch_omega: 3.60e-7 },
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

// ── Rogers-Satchell EWMA ──────────────────────────────────────────────────────
// For commodity (gold): handles non-zero drift; always ≥ 0; no CO subtraction.
// rs = ln(H/C)·ln(H/O) + ln(L/C)·ln(L/O)
function rsEwmaVolSeries(bars, lambda = EWMA_LAMBDA) {
  const n     = bars.length;
  const out   = new Array(n);
  const initN = Math.min(20, n);
  let v = 0;
  for (let i = 0; i < initN; i++) {
    const rs = Math.log(bars[i].high / bars[i].close) * Math.log(bars[i].high / bars[i].open)
             + Math.log(bars[i].low  / bars[i].close) * Math.log(bars[i].low  / bars[i].open);
    v += rs;
  }
  v = Math.max(v / initN, 1e-10);
  for (let i = 0; i < n; i++) {
    const rs = Math.log(bars[i].high / bars[i].close) * Math.log(bars[i].high / bars[i].open)
             + Math.log(bars[i].low  / bars[i].close) * Math.log(bars[i].low  / bars[i].open);
    v = lambda * v + (1 - lambda) * rs;
    out[i] = Math.sqrt(Math.max(v, 0));
  }
  return out;
}

// ── GARCH(1,1) close-to-close ─────────────────────────────────────────────────
// For index/fx: ω floor prevents estimates collapsing in quiet regimes.
// Initialized at unconditional variance ω/(1−α−β) — no seed transient.
function garch11VolSeries(bars, omega) {
  const n   = bars.length;
  const out = new Array(n - 1);
  let sigma2 = omega / (1 - G_ALPHA - G_BETA);
  for (let i = 1; i < n; i++) {
    const r = Math.log(bars[i].close / bars[i - 1].close);
    sigma2 = omega + G_ALPHA * r * r + G_BETA * sigma2;
    out[i - 1] = Math.sqrt(sigma2);
  }
  return out;
}

// ── EWMA on daily realized variances — full series ───────────────────────────
function ewmaOnRVSeries(rvValues, lambda = EWMA_LAMBDA) {
  const initN = Math.min(20, rvValues.length);
  let v = rvValues.slice(0, initN).reduce((s, r) => s + r, 0) / initN;
  v = Math.max(v, 1e-10);
  const out = new Array(rvValues.length);
  for (let i = 0; i < rvValues.length; i++) {
    v = lambda * v + (1 - lambda) * rvValues[i];
    out[i] = Math.sqrt(v);
  }
  return out;
}

// ── Realized GARCH(1,1) — full series ────────────────────────────────────────
function garchOnRVSeries(rvValues, omega) {
  let sigma2 = omega / (1 - G_ALPHA - G_BETA);
  const out = new Array(rvValues.length);
  for (let i = 0; i < rvValues.length; i++) {
    sigma2 = omega + G_ALPHA * rvValues[i] + G_BETA * sigma2;
    out[i] = Math.sqrt(Math.max(sigma2, 0));
  }
  return out;
}

// ── Scalar wrappers (kept for compatibility) ──────────────────────────────────
function ewmaOnRV(rvValues, lambda = EWMA_LAMBDA) {
  return ewmaOnRVSeries(rvValues, lambda).at(-1);
}

function garchOnRV(rvValues, omega) {
  return garchOnRVSeries(rvValues, omega).at(-1);
}

// ── Shared output builder ─────────────────────────────────────────────────────
function _buildOutput(volSeries, sigmaFwd, assetClass, newsMult) {
  const p           = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const sigmaFwdPct = sigmaFwd * 100;
  const volAnnual   = sigmaFwdPct * Math.sqrt(TRADING_DAYS);

  // Percentile rank in trailing 252 bars (strictly-less count → avoids 100th on plateau)
  const hist252 = volSeries.slice(-252);
  const vol_pct = Math.round(hist252.filter(v => v < sigmaFwd).length / hist252.length * 100);

  const sqrt5  = Math.sqrt(5);
  const sqrt20 = Math.sqrt(20);
  const r2     = x => Math.round(x * 100) / 100;

  // O-H and O-L have the same distribution as O-C by the BM reflection principle:
  // max(B_t, t∈[0,T]) ~ |B_T|, so median/75th are identical to the O-C values.
  // They are kept as explicit named fields for API clarity.
  const oc_med = HN_P50 * p.oc_50_corr * sigmaFwdPct;
  const oc_75v = HN_P75 * p.oc_75_corr * sigmaFwdPct;

  return {
    vol_annual: r2(volAnnual),
    vol_pct,
    hl_median:  r2(BM_RANGE_P50 * p.hl_50_corr * sigmaFwdPct),
    hl_75:      r2(BM_RANGE_P75 * p.hl_75_corr * sigmaFwdPct),
    hl_5d:      r2(BM_RANGE_P50 * p.hl_50_corr * sigmaFwdPct * sqrt5),
    hl_20d:     r2(BM_RANGE_P50 * p.hl_50_corr * sigmaFwdPct * sqrt20),
    oc_median:  r2(oc_med),
    oc_75:      r2(oc_75v),
    oc_5d:      r2(oc_med * sqrt5),
    oc_20d:     r2(oc_med * sqrt20),
    oh_median:  r2(oc_med),
    oh_75:      r2(oc_75v),
    ol_median:  r2(oc_med),
    ol_75:      r2(oc_75v),
    news_mult:  r2(newsMult),
  };
}

// ── Main forecast ─────────────────────────────────────────────────────────────
/**
 * @param {Array<{open,high,low,close}>} ohlc  Daily bars, oldest → newest
 * @param {string}  assetClass  'commodity' | 'index' | 'fx'
 * @param {number}  newsMult    Output of detectNewsMultiplier() — stored in output as
 *                              informational context only, not applied to ranges.
 * @returns forecast object — all values are percentages
 */
export function computeForecast(ohlc, assetClass = 'fx', newsMult = 1.0) {
  const n = ohlc.length;
  if (n < 60) throw new Error(`Need ≥60 bars, got ${n}`);

  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;

  // Commodity: RS-EWMA handles drift; never subtracts directional component.
  // Index/FX: GARCH with ω floor prevents quiet-period collapse.
  const volSeries = assetClass === 'commodity'
    ? rsEwmaVolSeries(ohlc)
    : garch11VolSeries(ohlc, p.garch_omega);

  // newsMult is NOT applied to ranges — reference methodology uses pure vol-based
  // forecasts; event days are already embedded in the historical vol estimate.
  // The multiplier is retained in output as informational context for the dashboard.
  return _buildOutput(volSeries, volSeries.at(-1), assetClass, newsMult);
}

// ── Realized-variance based estimators (M15 bar pipeline) ─────────────────────

/**
 * Forecast from pre-computed daily realized variances (M15 pipeline).
 * @param {Array<{date:string, rv:number}>} dailyRVs  Oldest → newest
 * @param {string} assetClass  'commodity'|'index'|'fx'
 * @param {number} newsMult
 */
export function computeForecastFromRV(dailyRVs, assetClass = 'fx', newsMult = 1.0) {
  if (dailyRVs.length < 60) throw new Error(`Need ≥60 daily RV values, got ${dailyRVs.length}`);

  const rvValues = dailyRVs.map(d => d.rv);
  const p        = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;

  const volSeries = assetClass === 'commodity'
    ? ewmaOnRVSeries(rvValues)
    : garchOnRVSeries(rvValues, p.garch_omega);

  return _buildOutput(volSeries, volSeries.at(-1), assetClass, newsMult);
}
