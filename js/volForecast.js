/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology — estimator chosen per asset class:
 *
 *   Primary (when OANDA_KEY is set): M15 realized variance pipeline
 *     M15 log-returns are aggregated to daily realized variance (RV).
 *     RV series is cached in KV and updated incrementally each day.
 *
 *   commodity : EWMA on daily realized variance (M15) — λ=0.94 (primary)
 *               Garman-Klass EWMA on daily OHLC (fallback, no Oanda key)
 *                 gk_t = 0.5·[ln(H/L)]² − (2·ln2−1)·[ln(C/O)]²
 *                 v_t  = λ·v_{t-1} + (1−λ)·gk_t
 *                 Gold has large intraday H-L ranges that partially reverse
 *                 by close; GK captures this, close-to-close misses it (~25%
 *                 underestimate).
 *
 *   index/fx  : Realized GARCH(1,1) — uses daily RV as innovation (primary)
 *               σ²_t = ω + α·RV_{t-1} + β·σ²_{t-1}
 *               More efficient than r²_{t-1}: M15 captures every intraday
 *               move vs 4 OHLC endpoints per day.
 *               GARCH(1,1) on close-to-close log returns (fallback)
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

// Garman-Klass adjustment constant: 2·ln2 − 1 ≈ 0.3863
const GK_ADJ = 2 * Math.LN2 - 1;

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
// hl_75_corr / oc_corr calibrated from reference data (May 29, 2026).
const ASSET_PARAMS = {
  commodity: { hl_75_corr: 0.989, oc_corr: 1.163 },
  index:     { hl_75_corr: 0.950, oc_corr: 1.111, garch_omega: 4.76e-6 },
  fx:        { hl_75_corr: 0.894, oc_corr: 0.948, garch_omega: 6.70e-7 },
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

// ── Garman-Klass EWMA ─────────────────────────────────────────────────────────
// For commodity (gold): captures large intraday ranges that close-to-close misses.
function gkEwmaVolSeries(bars, lambda = EWMA_LAMBDA) {
  const n     = bars.length;
  const out   = new Array(n);
  const initN = Math.min(20, n);
  let v = 0;
  for (let i = 0; i < initN; i++) {
    const lnHL = Math.log(bars[i].high / bars[i].low);
    const lnCO = Math.log(bars[i].close / bars[i].open);
    v += Math.max(0.5 * lnHL * lnHL - GK_ADJ * lnCO * lnCO, 0);
  }
  v = Math.max(v / initN, 1e-10);
  for (let i = 0; i < n; i++) {
    const lnHL = Math.log(bars[i].high / bars[i].low);
    const lnCO = Math.log(bars[i].close / bars[i].open);
    const gk   = Math.max(0.5 * lnHL * lnHL - GK_ADJ * lnCO * lnCO, 0);
    v = lambda * v + (1 - lambda) * gk;
    out[i] = Math.sqrt(v);
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

  // Commodity: GK-EWMA captures full intraday range.
  // Index/FX: GARCH with ω floor prevents quiet-period collapse.
  const volSeries = assetClass === 'commodity'
    ? gkEwmaVolSeries(ohlc)
    : garch11VolSeries(ohlc, p.garch_omega);

  const sigmaFwd    = volSeries.at(-1);
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
    hl_median:  r2(BM_RANGE_P50                * sigmaFwdPct * newsMult),
    hl_75:      r2(BM_RANGE_P75 * p.hl_75_corr * sigmaFwdPct * newsMult),
    oc_median:  r2(HN_P50       * p.oc_corr    * sigmaFwdPct * newsMult),
    oc_75:      r2(HN_P75       * p.oc_corr    * sigmaFwdPct * newsMult),
    news_mult:  r2(newsMult),
  };
}
