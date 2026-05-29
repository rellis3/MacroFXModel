/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology:
 *   σ (commodity) : Garman-Klass EWMA on daily OHLC bars
 *                     gk_t = 0.5·[ln(H/L)]² − (2·ln2−1)·[ln(C/O)]²
 *                     v_t  = λ·v_{t-1} + (1−λ)·gk_t          λ=0.94
 *                     σ_t  = √v_t
 *                     Gold has large intraday H-L ranges that partly reverse
 *                     by close; GK captures this, close-to-close misses it.
 *
 *   σ (index/fx)  : Close-to-close EWMA (RiskMetrics, λ=0.94)
 *                     v_t = λ·v_{t-1} + (1−λ)·r²_t    r = ln(C_t/C_{t-1})
 *                     For 24-hour FX and equity-index futures, the Oanda
 *                     daily open/close are near-continuous so the GK C/O
 *                     term can drag estimates down. Close-to-close matches
 *                     the reference system on NQ and all FX pairs.
 *
 *   H-L range : Analytical BM range distribution percentiles
 *               (median=1.572σ, 75th=2.049σ) with per-asset-class correction
 *   O-C move  : Half-normal percentiles (|N(0,σ)|) with per-asset-class correction
 *   News mult : High-impact US event overlay (FOMC, NFP, CPI etc.)
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

// ── Garman-Klass EWMA ─────────────────────────────────────────────────────────
// For commodity (gold): captures large intraday ranges that close-to-close misses.
// gk = 0.5·ln(H/L)² − (2ln2−1)·ln(C/O)²   clamped ≥ 0
function gkEwmaVolSeries(bars, lambda = EWMA_LAMBDA) {
  const n    = bars.length;
  const out  = new Array(n);
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

// ── Close-to-close EWMA ───────────────────────────────────────────────────────
// For index and FX: Oanda daily O/C are near-continuous so GK's C/O term
// can depress estimates. Close-to-close matches reference on NQ and all FX.
function ccEwmaVolSeries(bars, lambda = EWMA_LAMBDA) {
  const n    = bars.length;
  const out  = new Array(n - 1);  // one σ per log return, not per bar
  const initN = Math.min(20, n - 1);
  let v = 0;
  for (let i = 1; i <= initN; i++) {
    const r = Math.log(bars[i].close / bars[i - 1].close);
    v += r * r;
  }
  v = Math.max(v / initN, 1e-10);
  for (let i = 1; i < n; i++) {
    const r = Math.log(bars[i].close / bars[i - 1].close);
    v = lambda * v + (1 - lambda) * r * r;
    out[i - 1] = Math.sqrt(v);
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

  // Commodity uses GK (captures gold's large intraday ranges).
  // Index and FX use close-to-close EWMA (GK's C/O term drags these down).
  const volSeries = assetClass === 'commodity'
    ? gkEwmaVolSeries(ohlc)
    : ccEwmaVolSeries(ohlc);

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
