/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology:
 *   σ         : Garman-Klass EWMA on daily OHLC bars — one-step-ahead daily σ
 *                 gk_t = 0.5·[ln(H/L)]² − (2·ln2−1)·[ln(C/O)]²
 *                 v_t  = λ·v_{t-1} + (1−λ)·gk_t          λ=0.94
 *                 σ_t  = √v_t
 *
 *   Why GK over close-to-close GARCH/EWMA?
 *     Close-to-close vol only sees the overnight gap between closes.
 *     For gold (large intraday H-L ranges that partially reverse by close),
 *     close-to-close understates realized vol by 25-35%.
 *     GK uses the full bar (O,H,L,C) — 5-8× more statistically efficient
 *     than close-to-close and captures the true intraday range.
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
const EWMA_LAMBDA  = 0.94;

// Garman-Klass adjustment constant: 2·ln2 − 1 ≈ 0.3863
const GK_ADJ = 2 * Math.LN2 - 1;

// ── Analytical BM range distribution constants ────────────────────────────────
const BM_RANGE_P50 = 1.572;
const BM_RANGE_P75 = 2.049;

// ── Half-normal O-C percentiles ───────────────────────────────────────────────
const HN_P50 = 0.6745;
const HN_P75 = 1.1503;

// ── Per-asset-class parameters ────────────────────────────────────────────────
// hl_75_corr / oc_corr calibrated from reference data (May 29, 2026).
const ASSET_PARAMS = {
  commodity: { hl_75_corr: 0.989, oc_corr: 1.163 },
  index:     { hl_75_corr: 0.950, oc_corr: 1.111 },
  fx:        { hl_75_corr: 0.894, oc_corr: 0.948 },
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

// ── Garman-Klass EWMA vol series ──────────────────────────────────────────────
// Uses full OHLC bars — 5-8× more efficient than close-to-close estimators.
// GK variance: gk = 0.5·ln(H/L)² − (2ln2−1)·ln(C/O)²
// Seeded from the sample mean of the first 20 bars to kill the transient.
function gkEwmaVolSeries(bars, lambda = EWMA_LAMBDA) {
  const n = bars.length;
  const out = new Array(n);

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

  const sigmaFwd    = gkEwmaVolSeries(ohlc).at(-1);
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
