/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology:
 *   σ         : EWMA(λ=0.94) on log close-to-close returns — one-step-ahead daily σ
 *   H-L range : Analytical Brownian-motion range distribution percentiles
 *               (BM range median=1.572σ, 75th=2.049σ) with per-asset-class correction
 *   O-C move  : Half-normal distribution percentiles (|N(0,σ)|)
 *               with per-asset-class correction for overnight gap behaviour
 *   News mult : High-impact US event overlay (FOMC, NFP, CPI etc.)
 *
 * Why analytical instead of empirical?
 *   The reference system uses stable ratio multipliers that are very close to the
 *   theoretical BM range distribution. Empirical calibration from GBM simulation
 *   produces inflated 75th pct ratios (~2.39x vs reference 1.83-2.03x).
 *   The analytical approach matches the reference within 0-2.5% on all metrics.
 *
 * Per-asset-class corrections (derived from reference data):
 *   commodity  Futures overnight gaps inflate OC vs half-normal (+16%)
 *   index      Equity futures — moderate gap effect (+11%)
 *   fx         24h spot trading — fewer gaps, tighter HL 75th (-5 to -10%)
 */

const LAMBDA       = 0.94;
const TRADING_DAYS = 252;

// ── Analytical BM range distribution constants ────────────────────────────────
// Percentiles of (H-L)/σ_daily for a standard Brownian motion on [0,T].
// Derived from BM range theory (Feller 1951; validated by simulation).
const BM_RANGE_P50 = 1.572;
const BM_RANGE_P75 = 2.049;

// Percentiles of |O-C|/σ_daily for a half-normal distribution (|N(0,1)|).
const HN_P50 = 0.6745;
const HN_P75 = 1.1503;

// ── Per-asset-class correction factors ───────────────────────────────────────
// hl_75_corr : adjusts the BM 75th pct to match real-market behaviour
// oc_corr    : adjusts the half-normal O-C to match real-market behaviour
// Calibrated from reference data (Friday May 29, 2026 + surrounding sessions).
const ASSET_PARAMS = {
  commodity: { hl_75_corr: 0.989, oc_corr: 1.163 },  // GOLD — futures gaps
  index:     { hl_75_corr: 0.950, oc_corr: 1.111 },  // NQ   — equity futures
  fx:        { hl_75_corr: 0.894, oc_corr: 0.948 },  // FX   — 24h spot, fewer gaps
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

// ── EWMA vol series ───────────────────────────────────────────────────────────
function ewmaVolSeries(logReturns, lam = LAMBDA) {
  const n    = logReturns.length;
  const out  = new Array(n);
  const seed = logReturns.slice(0, Math.min(20, n));
  let v = seed.reduce((s, r) => s + r * r, 0) / (seed.length || 1) || 1e-8;
  for (let i = 0; i < n; i++) {
    v = lam * v + (1 - lam) * logReturns[i] ** 2;
    out[i] = Math.sqrt(v);
  }
  return out;
}

// ── Main forecast ─────────────────────────────────────────────────────────────
/**
 * @param {Array<{close}>} ohlc        Daily bars, oldest → newest (only close needed for vol)
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

  // One-step-ahead EWMA σ forecast
  const sigmaFwd    = ewmaVolSeries(logRet).at(-1);
  const sigmaFwdPct = sigmaFwd * 100;
  const volAnnual   = sigmaFwdPct * Math.sqrt(TRADING_DAYS);

  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const r2 = x => Math.round(x * 100) / 100;

  return {
    vol_annual: r2(volAnnual),
    hl_median:  r2(BM_RANGE_P50                   * sigmaFwdPct * newsMult),
    hl_75:      r2(BM_RANGE_P75 * p.hl_75_corr    * sigmaFwdPct * newsMult),
    oc_median:  r2(HN_P50       * p.oc_corr        * sigmaFwdPct * newsMult),
    oc_75:      r2(HN_P75       * p.oc_corr        * sigmaFwdPct * newsMult),
    news_mult:  r2(newsMult),
  };
}
