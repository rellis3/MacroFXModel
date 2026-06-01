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
//   fx    → 7.5% long-run ω = 6.70e-7
//
// hl_50_corr / hl_75_corr / oc_50_corr / oc_75_corr
//   Calibrated from June 1 2026 reference data (same-day comparison).
//   OC median and 75th need separate corrections because the reference
//   system's OC75/OC50 ratio differs from the theoretical half-normal ratio.
const ASSET_PARAMS = {
  commodity: { hl_50_corr: 0.985, hl_75_corr: 0.938, oc_50_corr: 0.991, oc_75_corr: 1.084 },
  index:     { hl_50_corr: 1.000, hl_75_corr: 0.937, oc_50_corr: 1.139, oc_75_corr: 1.099, garch_omega: 4.76e-6 },
  fx:        { hl_50_corr: 0.921, hl_75_corr: 0.863, oc_50_corr: 0.987, oc_75_corr: 0.932, garch_omega: 6.70e-7 },
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

// ── Main forecast ─────────────────────────────────────────────────────────────
/**
 * @param {Array<{open,high,low,close}>} ohlc  Daily bars, oldest → newest
 * @param {string}  assetClass  'commodity' | 'index' | 'fx'
 * @param {number}  newsMult    Output of detectNewsMultiplier()
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

  const sigmaFwd    = volSeries.at(-1);
  const sigmaFwdPct = sigmaFwd * 100;
  const volAnnual   = sigmaFwdPct * Math.sqrt(TRADING_DAYS);

  const r2 = x => Math.round(x * 100) / 100;

  return {
    vol_annual: r2(volAnnual),
    hl_median:  r2(BM_RANGE_P50 * p.hl_50_corr * sigmaFwdPct * newsMult),
    hl_75:      r2(BM_RANGE_P75 * p.hl_75_corr * sigmaFwdPct * newsMult),
    oc_median:  r2(HN_P50       * p.oc_50_corr * sigmaFwdPct * newsMult),
    oc_75:      r2(HN_P75       * p.oc_75_corr * sigmaFwdPct * newsMult),
    news_mult:  r2(newsMult),
  };
}

// ── Realized-variance based estimators (M15 bar pipeline) ─────────────────────

// EWMA on daily realized variance — for commodity (gold).
function ewmaOnRV(rvValues, lambda = EWMA_LAMBDA) {
  const initN = Math.min(20, rvValues.length);
  let v = rvValues.slice(0, initN).reduce((s, r) => s + r, 0) / initN;
  v = Math.max(v, 1e-10);
  for (const rv of rvValues) v = lambda * v + (1 - lambda) * rv;
  return Math.sqrt(v);
}

// Realized GARCH(1,1) — for index/fx.
// Uses daily RV as innovation term (more efficient than r²_{t-1}).
// ω floor prevents quiet-period collapse.
function garchOnRV(rvValues, omega) {
  let sigma2 = omega / (1 - G_ALPHA - G_BETA);
  for (const rv of rvValues) sigma2 = omega + G_ALPHA * rv + G_BETA * sigma2;
  return Math.sqrt(Math.max(sigma2, 0));
}

/**
 * Forecast from pre-computed daily realized variances (M15 pipeline).
 * @param {Array<{date:string, rv:number}>} dailyRVs  Oldest → newest
 * @param {string} assetClass  'commodity'|'index'|'fx'
 * @param {number} newsMult
 */
export function computeForecastFromRV(dailyRVs, assetClass = 'fx', newsMult = 1.0) {
  if (dailyRVs.length < 60) throw new Error(`Need ≥60 daily RV values, got ${dailyRVs.length}`);

  const rvValues = dailyRVs.map(d => d.rv);
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;

  const sigmaFwd = assetClass === 'commodity'
    ? ewmaOnRV(rvValues)
    : garchOnRV(rvValues, p.garch_omega);

  const sigmaFwdPct = sigmaFwd * 100;
  const volAnnual   = sigmaFwdPct * Math.sqrt(TRADING_DAYS);
  const r2 = x => Math.round(x * 100) / 100;

  return {
    vol_annual: r2(volAnnual),
    hl_median:  r2(BM_RANGE_P50 * p.hl_50_corr * sigmaFwdPct * newsMult),
    hl_75:      r2(BM_RANGE_P75 * p.hl_75_corr * sigmaFwdPct * newsMult),
    oc_median:  r2(HN_P50       * p.oc_50_corr * sigmaFwdPct * newsMult),
    oc_75:      r2(HN_P75       * p.oc_75_corr * sigmaFwdPct * newsMult),
    news_mult:  r2(newsMult),
  };
}
