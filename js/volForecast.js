/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology — primary estimator per asset class (last updated 2026-06-15 evening):
 *
 *   commodity : Yang-Zhang estimator (same as fx)
 *                 σ²_YZ = σ²_overnight + k·σ²_OC + (1−k)·σ²_RS
 *                 Switched 2026-06-30: HV20 was Δ+19.8% above ref (3 sessions), YZ Δ+1.6%.
 *                 HV20 slow 20-day window cannot shed prior-week elevated vol fast enough;
 *                 YZ OHLC weighting adapts faster and lands at the right level.
 *                 Previous: HV20 std(log_returns[-20:])×√252 (Jun-15 Δ−6%, drifted to +20%)
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
// commodity (GOLD, YZ) — estimator switched 2026-06-30 from HV20 → YZ (see VOL_CALIBRATION_TRACKER.md).
//   Correction factors below were calibrated against HV20 and will be slightly off with YZ.
//   After 3+ clean YZ sessions, recalibrate: oc_50_corr 1.12→~0.98 (shape-only, ~+14% residual expected).
// commodity (GOLD, HV20) — prior recalibration 2026-06-26:
//   Original Jun-15 factors were fit when HV20 vol underestimated reference by −6%; the
//   vol bias has since drifted to a consistent +3–7% overestimate (Jun-22 through Jun-26),
//   flipping the sign and making the original factors pull in the wrong direction (HL med
//   trending −3%→−4%→−8%→−10% over the week). Same shape-factor analysis as index:
//   S = (ours_vol / ref_vol) × corr / (1 + Δ_HL%) extracted across 5 sessions:
//     Jun-22: S_hl50=1.029 S_hl75=0.930 S_oc50=1.010† S_oc75=1.076
//     Jun-23: S_hl50=1.005 S_hl75=0.938 S_oc50=1.144  S_oc75=1.109
//     Jun-24: S_hl50=1.053 S_hl75=0.954 S_oc50=1.174  S_oc75=1.131
//     Jun-25: S_hl50=1.059 S_hl75=0.949 S_oc50=1.185  S_oc75=1.106
//     Jun-26: S_hl50=1.026 S_hl75=0.987 S_oc50=1.174  S_oc75=1.157
//     avg:    hl50=1.034   hl75=0.952   oc50=1.169†  oc75=1.116
//   †Jun-22 OC med was a +15.5% outlier spike (not recurred) — excluded from oc_50 avg.
//   Unlike index, GOLD's vol bias is stable (~+4% typical), so factors are set to the
//   composite ideal (S / 1.04) rather than shape-only, targeting near-zero HL/OC Δ at
//   the typical vol level. With these factors displayed error ≈ (vol_Δ − 4%) × shape.
//   REVERT VALUES (Jun-15 vol-contaminated): hl_50=0.93 hl_75=0.88 oc_50=1.09 oc_75=1.03
//
// fx (EURUSD, YZ) — refined 2026-06-17 (1 day ahead of planned Jun-18 checkpoint):
//   Jun-17 compare: HL med Δ−3.7%, HL 75p Δ+1.5%, OC med Δ−4.0%, OC 75p Δ−7.3%.
//   New factors close these small residual gaps; re-check after another session.
//
// index (GARCH) — correction factors recalibrated 2026-06-26 (see VOL_CALIBRATION_TRACKER.md).
//   Original Jun-17 factors (0.81/0.78/0.85/0.90) were fit on a single day when our raw
//   vol overestimated reference by +22.3% — they conflated a stable distribution-shape
//   constant with a transient vol-level bias, so they broke as the raw gap narrowed and
//   eventually reversed (gap trajectory: +22.3% → +59% → +18% → +9.7% → −4.9% → −21%).
//
//   New approach: extract the pure shape factor S = (ref_HL × ours_vol × old_corr)
//   / (ref_vol × ours_HL_displayed) across 3 sessions spanning +22% to −21% raw vol Δ:
//     Jun-17: S_hl50=0.991 S_hl75=0.954 S_oc50=1.040 S_oc75=1.101
//     Jun-25: S_hl50=0.984 S_hl75=0.945 S_oc50=1.089 S_oc75=1.105
//     Jun-26: S_hl50=0.950 S_hl75=0.920 S_oc50=1.044 S_oc75=1.095
//     avg:    hl50=0.975   hl75=0.940   oc50=1.058   oc75=1.100  (±0.02–0.04 noise)
//   Shape factors are stable across all three; composite factors were not.
//   With shape-only factors, displayed HL/OC error tracks raw vol Δ linearly — no more
//   sign flips or amplification from a contaminated constant.
//   REVERT VALUES (Jun-17 vol-contaminated): hl_50=0.81 hl_75=0.78 oc_50=0.85 oc_75=0.90
//
//   Derived from NQ only — SPX500/DE30/UK100/US30/US2000 share this class but have no
//   reference data yet; monitor once available.
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
export const ASSET_PARAMS = {
  commodity: { hl_50_corr: 0.99, hl_75_corr: 0.92, oc_50_corr: 1.12, oc_75_corr: 1.07 },
  index:     { hl_50_corr: 0.97, hl_75_corr: 0.94, oc_50_corr: 1.06, oc_75_corr: 1.10, garch_omega: 4.76e-6,
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

// ── Drifted-BM helpers for Export v2 OH/OL (additive — does NOT touch _buildOutput) ──
// Standard normal CDF — Abramowitz & Stegun 26.2.17, |error| < 7.5e-8
function _Phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const y = 1 - p * Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  return x >= 0 ? y : 1 - y;
}

// p-th quantile of max(Bt, t∈[0,1]) where Bt = d·t + Wt (unit diffusion).
// CDF: F(x) = Φ(x−d) − exp(2dx)·Φ(−x−d)  [reflection principle, drifted BM].
// At d=0, F(0.6745)=0.50 and F(1.1503)=0.75 — recovers HN_P50/P75 exactly.
export function _bmMaxQuantile(d, p) {
  const F = x => _Phi(x - d) - Math.exp(2 * d * x) * _Phi(-x - d);
  let lo = 0, hi = Math.abs(d) + 6;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (F(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Signed drift / vol ratio  d = μ_daily / σ_fwd  (dimensionless).
// Uses last `win` close-to-close log returns; denominator is the PRIMARY vol
// estimate (sigmaFwd) so d is in natural BM units for the formula above.
// Clamped to ±2 to guard against tiny-σ edge cases.
export function _driftD(ohlc, sigmaFwd, win = 14) {
  if (ohlc.length < win + 2 || sigmaFwd < 1e-14) return 0;
  const closes = ohlc.slice(-(win + 1)).map(b => b.close);
  let mu = 0;
  for (let i = 1; i < closes.length; i++) mu += Math.log(closes[i] / closes[i - 1]);
  mu /= win;
  return +Math.max(-2, Math.min(2, mu / sigmaFwd)).toFixed(4);
}

// ── Shared output builder ─────────────────────────────────────────────────────
export function _buildOutput(volSeries, sigmaFwd, assetClass, newsMult) {
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
  //   commodity YZ: switched 2026-06-30 — HV20 (+19.8% above ref, 3 sessions) vs YZ (+1.6%)
  //     HV20 slow 20-day window can't shed prior-week elevated vol; YZ OHLC adapts faster.
  //     Previous: HV20 (Jun-15 Δ−6%, later drifted to +20%).
  //   index EWMA(0.90) gave 33.54% vs ref 20.95% (Δ−37.5%) — too reactive after spike → revert to GARCH
  //   fx HV30 gave 4.59% vs ref 5.53% (Δ+20.5%) — too slow → switch to YZ (was Δ+12%, best available)
  let volSeries;
  if (assetClass === 'commodity') {
    volSeries = yangZhangVolSeries(ohlc);                // switched 2026-06-30: HV20 Δ+20% vs YZ Δ+1.6%
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

  // v2 asymmetric OH/OL — additive fields, nothing above changes
  const _p       = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const _sp      = sigmaFwd * 100;
  const _d       = _driftD(ohlc, sigmaFwd);
  const r2v      = x => Math.round(x * 100) / 100;

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
    // v2: drift parameter and drifted-BM OH/OL percentiles
    drift_d:       _d,
    oh_v2_median:  r2v(_bmMaxQuantile( _d, 0.5)  * _p.oc_50_corr * _sp),
    oh_v2_75:      r2v(_bmMaxQuantile( _d, 0.75) * _p.oc_75_corr * _sp),
    ol_v2_median:  r2v(_bmMaxQuantile(-_d, 0.5)  * _p.oc_50_corr * _sp),
    ol_v2_75:      r2v(_bmMaxQuantile(-_d, 0.75) * _p.oc_75_corr * _sp),
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
