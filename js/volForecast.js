/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology — primary estimator per asset class (last updated 2026-06-15 evening):
 *
 *   commodity : 20-day simple historical volatility (HV20)
 *                 std(log_returns[-20:]) × √252
 *                 Jun-15 morning compare: HV20 Δ−6% vs ref (acceptable).
 *                 Previous: Rogers-Satchell EWMA λ=0.94 (Δ+15.5%)
 *
 *   index     : GARCH(1,1) α=0.06 β=0.87 (interim, was β=0.91 — 2026-06-19)
 *                 ω floor = 1.11e-5 (rescaled, still ~20% long-run). Reverted from
 *                 EWMA(0.90) after EWMA spiked Δ−37.5% on first large-move day
 *                 (NQ 33.54% vs ref 20.95%). EWMA(0.90) half-life only 6.6 days —
 *                 too reactive, no floor. β=0.91's 23-day half-life then proved too
 *                 STICKY (Jun-17/18/19 NQ trajectory) — β=0.87 (~9.5-day half-life)
 *                 is a provisional middle ground pending grid search; see
 *                 MD files/VOL_CALIBRATION_TRACKER.md.
 *                 Previous trial: EWMA(λ=0.90)
 *
 *   fx        : Yang-Zhang (YZ) estimator, window=30
 *                 σ²_YZ = σ²_overnight + k·σ²_OC + (1−k)·σ²_RS
 *                 Jun-15 morning compare showed YZ Δ+12% (reference 12% above YZ).
 *                 HV30 was tried first but underestimated by Δ+20.5%.
 *                 Previous trial: HV30; before that: GARCH(1,1)
 *
 *   Legacy shadow (stored as legacy_ fields for before/after comparison):
 *                 commodity → RS-EWMA λ=0.94
 *                 index/fx  → GARCH(1,1) α=0.06 β=0.91
 *
 *   H-L range : BM range distribution percentiles (P50=1.572σ, P75=2.049σ)
 *   O-C move  : Half-normal percentiles (|N(0,σ)|)
 *   Correction factors reset to 1.0 (previous corrections calibrated for GARCH/RS-EWMA)
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
// garch_omega : long-run variance floor for GARCH — kept for the legacy shadow
//   series even though GARCH is no longer the primary estimator.
//   index → 20% long-run  ω = 4.76e-6
//   fx    → 5.5% long-run ω = 3.60e-7
//
// hl_50_corr / hl_75_corr / oc_50_corr / oc_75_corr
//   Reset to 1.0 on 2026-06-15 when primaries switched to HV20/EWMA/HV30.
// Calibration history — corrections derived as ref_value / our_uncorrected_value:
//
// commodity (GOLD, HV20) — calibrated 2026-06-15, confirmed 2026-06-17:
//   Jun-17 compare with these factors already applied: HL med Δ−2.6%, HL 75p Δ−0.9%,
//   OC med Δ+2.3%, OC 75p Δ−0.5% — all within noise, no change.
//
// fx (EURUSD, YZ) — refined 2026-06-17 (1 day ahead of planned Jun-18 checkpoint):
//   Jun-17 compare: HL med Δ−3.7%, HL 75p Δ+1.5%, OC med Δ−4.0%, OC 75p Δ−7.3%.
//   New factors close these small residual gaps; re-check after another session.
//
// index (GARCH) — calibrated 2026-06-17 from first post-revert compare (NQ only):
//   Jun-17 compare: ours 26.56% vs ref 21.71% vol (Δ−22.3%, we overestimate).
//   HL med Δ−23.5%, HL 75p Δ−28.9%, OC med Δ−17.7%, OC 75p Δ−11.6%.
//   GARCH persistence (α+β=0.97, half-life ~23 days) keeps vol elevated long after
//   a shock has passed — same symptom direction as the earlier EWMA(0.90) overshoot,
//   different mechanism (EWMA over-reacts instantly; GARCH stays sticky afterward).
//   Factors below derived from NQ only — SPX500/DE30/UK100/US30/US2000 share this
//   class but have no reference data yet; monitor once available, may need to split
//   index into per-instrument corrections if they diverge from NQ's behavior.
//
// index GARCH persistence — INTERIM FIX 2026-06-19 (see MD files/VOL_CALIBRATION_TRACKER.md):
//   3-session trajectory (Jun-17 Δ+22.3%, Jun-18 Δ+3.5%, Jun-19 Δ+33.7%) showed the
//   Δ+22.3%/Δ+33.7% overestimates recur whenever a prior-day shock hasn't fully decayed —
//   confirms this is a structural persistence problem, not noise the static hl/oc
//   correction factors above can fix (those only correct distribution shape, not decay
//   speed). garch_beta_interim/garch_omega_interim below halve the half-life
//   (23d → ~9.5d: β 0.91→0.87, α unchanged, ω rescaled to keep the same 20% long-run
//   variance anchor) as a conservative provisional step — NOT a final calibration.
//   Applies to the primary index estimator only; garch_omega (legacy shadow column)
//   is untouched so the before/after comparison stays meaningful. Revisit via grid
//   search once enough (ours, ref) pairs have accumulated (tracker file has the table).
const ASSET_PARAMS = {
  commodity: { hl_50_corr: 0.93, hl_75_corr: 0.88, oc_50_corr: 1.09, oc_75_corr: 1.03 },
  index:     { hl_50_corr: 0.81, hl_75_corr: 0.78, oc_50_corr: 0.85, oc_75_corr: 0.90, garch_omega: 4.76e-6,
               garch_beta_interim: 0.87, garch_omega_interim: 1.11e-5 },
  fx:        { hl_50_corr: 1.04, hl_75_corr: 0.99, oc_50_corr: 1.10, oc_75_corr: 1.08, garch_omega: 3.60e-7 },
};

// ── News event multipliers ────────────────────────────────────────────────────
// Applied to all asset classes (commodity included as of 2026-06-18 — see below).
// Recalibrated 2026-06-12 from Jun 12 reference (CPI day): EURUSD implied ×1.11,
// NQ implied ×1.07. FOMC/NFP not yet observed in reference data; reduced proportionally.
//
// 2026-06-18: new Fed Chair's first speech caused a major repricing in GOLD, NQ,
// and EURUSD alike (user-confirmed: "huge news day ... price went crazy"). Two gaps
// fixed by this change:
//   1. No NEWS_PATTERNS entry matched a Fed Chair speech/testimony calendar event
//      (only scheduled data releases were covered) — added 'Fed Chair Speech' below.
//   2. commodity was unconditionally excluded from any news multiplier, on the
//      assumption gold isn't event-driven — contradicted by Jun-18 data, where GOLD's
//      reaction was comparable to fx/index. Exclusion removed in computeForecast().
//   Fed Chair speech mult set at 1.18 (between NFP and FOMC) pending calibration
//   against a clean single-event reference compare.
const NEWS_PATTERNS = [
  { re: /federal\s*fund|fomc.*rate|fed.*rate/i,         mult: 1.21, label: 'FOMC Rate'       },
  { re: /fed\s*chair|fomc\s*press\s*conference|monetary\s*policy\s*testimony|humphrey.?hawkins/i,
                                                          mult: 1.18, label: 'Fed Chair Speech' },
  { re: /non.?farm|nonfarm|payroll/i,                   mult: 1.16, label: 'NFP'       },
  { re: /consumer\s*price|cpi/i,                        mult: 1.11, label: 'CPI'       },
  { re: /personal\s*consumption|pce/i,                  mult: 1.08, label: 'PCE'       },
  { re: /gross\s*domestic|gdp/i,                        mult: 1.05, label: 'GDP'       },
  { re: /producer\s*price|ppi/i,                        mult: 1.05, label: 'PPI'       },
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

// ── Yang-Zhang volatility estimator (shadow — no empirical corrections) ───────
// Combines overnight (C→O) variance, OC variance, and Rogers-Satchell intraday
// range. k = 0.34/(1.34+(N+1)/(N-1)) minimises estimation error (YZ 2000).
// Returns daily sigma (fraction) per bar; null for first `window` positions.
export function yangZhangVolSeries(bars, window = 30) {
  const n = bars.length;
  const out = new Array(n).fill(null);
  const k = 0.34 / (1.34 + (window + 1) / (window - 1));
  for (let i = window; i < n; i++) {
    const s = bars.slice(i - window, i + 1); // window+1 bars → window overnight gaps
    let muOn = 0, muOc = 0, varOn = 0, varOc = 0, rs = 0;
    for (let j = 1; j <= window; j++) {
      muOn += Math.log(s[j].open / s[j - 1].close);
      muOc += Math.log(s[j].close / s[j].open);
    }
    muOn /= window; muOc /= window;
    for (let j = 1; j <= window; j++) {
      const dOn = Math.log(s[j].open / s[j - 1].close) - muOn;
      const dOc = Math.log(s[j].close / s[j].open) - muOc;
      varOn += dOn * dOn;
      varOc += dOc * dOc;
      rs += Math.log(s[j].high / s[j].close) * Math.log(s[j].high / s[j].open)
          + Math.log(s[j].low  / s[j].close) * Math.log(s[j].low  / s[j].open);
    }
    varOn /= (window - 1); varOc /= (window - 1); rs /= window;
    out[i] = Math.sqrt(Math.max(varOn + k * varOc + (1 - k) * rs, 0));
  }
  return out;
}

// ── 20-day simple historical volatility (shadow) ──────────────────────────────
// std(log_returns[-window:]) — fully reactive, no mean reversion.
// Returns daily sigma (fraction) per bar; null for first `window` positions.
export function hv20Series(bars, window = 20) {
  const n = bars.length;
  const out = new Array(n).fill(null);
  for (let i = window; i < n; i++) {
    let sum = 0, sum2 = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const r = Math.log(bars[j].close / bars[j - 1].close);
      sum  += r;
      sum2 += r * r;
    }
    const mean = sum / window;
    const variance = (sum2 - window * mean * mean) / (window - 1);
    out[i] = Math.sqrt(Math.max(variance, 0));
  }
  return out;
}

// ── EWMA volatility (shadow, λ=0.90) ─────────────────────────────────────────
// σ²_t = λ·σ²_{t-1} + (1−λ)·r²_t  —  faster decay than GARCH β=0.91.
// Returns daily sigma (fraction) per bar; null for bar 0.
export function ewmaVolSeries(bars, lambda = 0.90) {
  const n = bars.length;
  const out = new Array(n).fill(null);
  if (n < 2) return out;
  let sigma2 = Math.pow(Math.log(bars[1].close / bars[0].close), 2);
  out[1] = Math.sqrt(sigma2);
  for (let i = 2; i < n; i++) {
    const r = Math.log(bars[i].close / bars[i - 1].close);
    sigma2 = lambda * sigma2 + (1 - lambda) * r * r;
    out[i] = Math.sqrt(sigma2);
  }
  return out;
}


// For index/fx: ω floor prevents estimates collapsing in quiet regimes.
// Initialized at unconditional variance ω/(1−α−β) — no seed transient.
// alpha/beta default to the original global constants; index's primary
// estimator overrides beta (see ASSET_PARAMS.index.garch_beta_interim, 2026-06-19)
// to shorten persistence while the legacy shadow series keeps the originals.
function garch11VolSeries(bars, omega, alpha = G_ALPHA, beta = G_BETA) {
  const n   = bars.length;
  const out = new Array(n - 1);
  let sigma2 = omega / (1 - alpha - beta);
  for (let i = 1; i < n; i++) {
    const r = Math.log(bars[i].close / bars[i - 1].close);
    sigma2 = omega + alpha * r * r + beta * sigma2;
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

  // Volatility cone — percentile of current σ in shorter lookback windows.
  // Comparing 5d/21d/63d percentiles reveals whether vol is expanding (5d > 252d)
  // or contracting (5d < 252d), which a single percentile number cannot show.
  const _conePct = n => {
    const w = volSeries.slice(-n);
    return w.length >= Math.ceil(n * 0.8)
      ? Math.round(w.filter(v => v < sigmaFwd).length / w.length * 100)
      : null;
  };
  const cone_5d  = _conePct(5);
  const cone_21d = _conePct(21);
  const cone_63d = _conePct(63);

  // Vol-of-vol: coefficient of variation of the last 20 daily σ readings.
  // High VoV = vol itself is jumping around, forecasts are less reliable.
  const recent = volSeries.slice(-20);
  const vovMu  = recent.reduce((s, v) => s + v, 0) / recent.length;
  const vovSig = Math.sqrt(recent.reduce((s, v) => s + (v - vovMu) ** 2, 0) / recent.length);
  const vol_vov = vovMu > 0 ? Math.round(vovSig / vovMu * 100) : 0;
  const vol_vov_label = vol_vov < 10 ? 'Stable' : vol_vov < 20 ? 'Moderate' : 'Unstable';

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
    cone_5d,
    cone_21d,
    cone_63d,
    vol_vov,
    vol_vov_label,
    hl_median:  r2(BM_RANGE_P50 * p.hl_50_corr * sigmaFwdPct),
    hl_75:      r2(BM_RANGE_P75 * p.hl_75_corr * sigmaFwdPct),
    hl_5d:      r2(BM_RANGE_P50 * p.hl_50_corr * sigmaFwdPct * sqrt5),
    hl_5d_75:   r2(BM_RANGE_P75 * p.hl_75_corr * sigmaFwdPct * sqrt5),
    hl_20d:     r2(BM_RANGE_P50 * p.hl_50_corr * sigmaFwdPct * sqrt20),
    hl_20d_75:  r2(BM_RANGE_P75 * p.hl_75_corr * sigmaFwdPct * sqrt20),
    oc_median:  r2(oc_med),
    oc_75:      r2(oc_75v),
    oc_5d:      r2(oc_med * sqrt5),
    oc_5d_75:   r2(oc_75v * sqrt5),
    oc_20d:     r2(oc_med * sqrt20),
    oc_20d_75:  r2(oc_75v * sqrt20),
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
 * @param {number}  newsMult    Output of detectNewsMultiplier() — when > 1, scales
 *                              sigmaFwd (and thus all HL/OC ranges) before correction.
 * @returns forecast object — all values are percentages
 */
export function computeForecast(ohlc, assetClass = 'fx', newsMult = 1.0) {
  const n = ohlc.length;
  if (n < 60) throw new Error(`Need ≥60 bars, got ${n}`);

  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;

  // Primary estimators — updated 2026-06-15 evening based on reference comparison:
  //   commodity HV20: vol 29.34% vs ref 27.59% (Δ−6%)  ← keep, close enough
  //   index EWMA(0.90) gave 33.54% vs ref 20.95% (Δ−37.5%) — too reactive after spike → revert to GARCH
  //   fx HV30 gave 4.59% vs ref 5.53% (Δ+20.5%) — too slow → switch to YZ (was Δ+12%, best available)
  let volSeries;
  if (assetClass === 'commodity') {
    volSeries = hv20Series(ohlc, 20);                    // kept: RS-EWMA was Δ+15.5%, HV20 Δ−6%
  } else if (assetClass === 'index') {
    // Interim persistence fix 2026-06-19: shorter beta/omega than the legacy shadow
    // below (see ASSET_PARAMS.index comment) — provisional pending grid search.
    volSeries = garch11VolSeries(ohlc, p.garch_omega_interim, G_ALPHA, p.garch_beta_interim);
  } else {
    volSeries = yangZhangVolSeries(ohlc);                // switched: HV30 too slow (Δ+20.5%), YZ was Δ+12%
  }

  // Legacy shadow — old estimator (RS-EWMA for commodity, GARCH for index/fx).
  // Stored in KV so the compare table can show before/after side-by-side.
  const legacySeries = assetClass === 'commodity'
    ? rsEwmaVolSeries(ohlc)
    : garch11VolSeries(ohlc, p.garch_omega);

  // US event multiplier applies to all asset classes (commodity included as of
  // 2026-06-18 — Jun-18 Fed Chair speech moved GOLD as much as fx/index).
  const sigmaFwd = newsMult > 1
    ? volSeries.at(-1) * newsMult
    : volSeries.at(-1);

  // Shadow estimators: raw BM percentiles, no empirical corrections.
  const yzArr     = yangZhangVolSeries(ohlc);
  const hvArr     = hv20Series(ohlc, 20);
  const ewmaArr   = ewmaVolSeries(ohlc, 0.90);
  const sigmaYZ     = yzArr.at(-1)       ?? 0;
  const sigmaHV     = hvArr.at(-1)       ?? 0;
  const sigmaEWMA   = ewmaArr.at(-1)     ?? 0;
  const sigmaLegacy = legacySeries.at(-1) ?? 0;
  const yzPct     = sigmaYZ     * 100;
  const hvPct     = sigmaHV     * 100;
  const ewmaPct   = sigmaEWMA   * 100;
  const legacyPct = sigmaLegacy * 100;
  const r2s = x => Math.round(x * 100) / 100;

  return Object.assign(_buildOutput(volSeries, sigmaFwd, assetClass, newsMult), {
    yz_vol_annual:     r2s(yzPct     * Math.sqrt(TRADING_DAYS)),
    yz_hl_median:      r2s(BM_RANGE_P50 * yzPct),
    yz_oc_median:      r2s(HN_P50       * yzPct),
    hv_vol_annual:     r2s(hvPct     * Math.sqrt(TRADING_DAYS)),
    hv_hl_median:      r2s(BM_RANGE_P50 * hvPct),
    hv_oc_median:      r2s(HN_P50       * hvPct),
    ewma_vol_annual:   r2s(ewmaPct   * Math.sqrt(TRADING_DAYS)),
    ewma_hl_median:    r2s(BM_RANGE_P50 * ewmaPct),
    ewma_oc_median:    r2s(HN_P50       * ewmaPct),
    legacy_vol_annual: r2s(legacyPct * Math.sqrt(TRADING_DAYS)),
    legacy_hl_median:  r2s(BM_RANGE_P50 * legacyPct),
    legacy_oc_median:  r2s(HN_P50       * legacyPct),
  });
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

  const sigmaFwd = newsMult > 1
    ? volSeries.at(-1) * newsMult
    : volSeries.at(-1);
  return _buildOutput(volSeries, sigmaFwd, assetClass, newsMult);
}
