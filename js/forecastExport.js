/**
 * Forecast export brick — produces the live forecaster's export TEXT for an
 * arbitrary daily σ (e.g. the benchmark's OOS-winning estimator), so the output
 * is byte-identical to vol-forecast.html's ⬇ Export / Export v2 / Extended and
 * drops straight into the same Pine Script indicator.
 *
 * Band MATH is NOT re-implemented: `forecastFields` imports `_buildOutput`,
 * `_driftD`, `_bmMaxQuantile` and `ASSET_PARAMS` from volForecast.js (the single
 * source — its June-recalibrated correction factors). Only the FORMAT builders
 * are copied here (they live inside the HTML page and can't be imported);
 * `js/forecastExport.test.mjs` golden-tests them against verbatim reference copies
 * so they can't silently drift from the page.
 *
 * `harShadowFields` is the daily HAR-RV challenger: bench estimator in, incumbent
 * band math out, attached as `f.har` beside the primary forecast (see
 * volForecastScheduler.js). Disable with env VOL_FORECAST_HAR=0 — the primary
 * forecast fields are never touched either way.
 */

import { _buildOutput, _driftD, _bmMaxQuantile, ASSET_PARAMS } from './volForecast.js';
import { realizedVarSeries, sigmaSeriesForExport, ivVarSeries } from './volForecastBench.js';

// Build the full forecast field object for one instrument from a daily-σ series.
// `series`   — daily σ history (fractional), last element = sigmaFwd (per the
//              forecaster's convention; gives vol_pct / cone / vol-of-vol context).
// `sigmaFwd` — the forward σ (fractional) the bands are built from.
// `ohlc`     — daily bars (oldest→newest), for the drift term.
// Mirrors computeForecast()'s v2 block exactly (volForecast.js:468-492).
function forecastFields(series, sigmaFwd, ohlc, assetClass = 'fx') {
  const base = _buildOutput(series, sigmaFwd, assetClass, 1.0);
  const p   = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const sp  = sigmaFwd * 100;
  const d   = _driftD(ohlc, sigmaFwd);
  const r2v = x => Math.round(x * 100) / 100;
  return Object.assign(base, {
    drift_d:      d,
    oh_v2_median: r2v(_bmMaxQuantile( d, 0.5)  * p.oc_50_corr * sp),
    oh_v2_75:     r2v(_bmMaxQuantile( d, 0.75) * p.oc_75_corr * sp),
    ol_v2_median: r2v(_bmMaxQuantile(-d, 0.5)  * p.oc_50_corr * sp),
    ol_v2_75:     r2v(_bmMaxQuantile(-d, 0.75) * p.oc_75_corr * sp),
  });
}

// ── HAR-RV shadow forecast (challenger σ, incumbent band math) ────────────────
// Composes the benchmark's walk-forward HAR-RV estimator (volForecastBench.js —
// fit on the Garman-Klass realised-variance proxy of the SAME daily bars the
// primary forecast uses, no extra data dependency) with `forecastFields` above,
// so the shadow's HL/OC bands go through the identical Feller/half-normal math
// and correction factors as the incumbent. Purely additive: callers attach the
// result as `f.har` next to the primary fields — the primary numbers never move.
// Returns null when HAR can't produce a forecast (insufficient bars) — store the
// null so consumers can tell "computed, unavailable" from "never attempted".
function harShadowFields(ohlc, assetClass = 'fx', newsMult = 1.0) {
  const { series, sigmaFwd } = sigmaSeriesForExport(ohlc, 'harRV', { rv: realizedVarSeries(ohlc, 'gk') });
  if (!Number.isFinite(sigmaFwd) || sigmaFwd <= 0 || series.length < 60) return null;
  // Same news-multiplier convention as computeForecast(): scale σ before bands.
  const sF  = newsMult > 1 ? sigmaFwd * newsMult : sigmaFwd;
  const out = forecastFields(series, sF, ohlc, assetClass);
  out.news_mult = Math.round(newsMult * 100) / 100;
  return out;
}

// ── HAR-IV shadow forecast (the COG-v2 gold σ) ───────────────────────────────
// The gold leg of COG-v2: the bench's OOS-winning gold σ (HAR-IV — realised-variance
// HAR + a forward-looking implied-variance regressor from GVZ) run through the SAME
// forecaster band math + correction factors as everything else. Mirror of
// harShadowFields, but HAR-IV needs the implied-vol series, so the caller passes
// `ivAnnualPctByBar` — annualised IV % aligned per-bar to `ohlc` (NaN where absent;
// e.g. GVZ forward-filled onto gold's D1 dates). Only the IV-covered span trains, so
// partial history (GVZ from ~2008) is fine. assetClass defaults to commodity (gold),
// so the bands are the per-asset-CALIBRATED set — i.e. NO COG widening, by design.
// Returns null when HAR-IV can't forecast (no IV / too few bars). Purely additive:
// callers attach it as `f.harIv`; the primary/COG numbers never move.
function harIvShadowFields(ohlc, ivAnnualPctByBar, assetClass = 'commodity', newsMult = 1.0) {
  if (!Array.isArray(ivAnnualPctByBar) || ivAnnualPctByBar.length !== ohlc.length) return null;
  const ivVar = ivVarSeries(ivAnnualPctByBar);
  const { series, sigmaFwd } = sigmaSeriesForExport(ohlc, 'harIV',
    { rv: realizedVarSeries(ohlc, 'gk'), ivVar });
  if (!Number.isFinite(sigmaFwd) || sigmaFwd <= 0 || series.length < 60) return null;
  const sF  = newsMult > 1 ? sigmaFwd * newsMult : sigmaFwd;
  const out = forecastFields(series, sF, ohlc, assetClass);
  out.news_mult = Math.round(newsMult * 100) / 100;
  return out;
}

// ── Format builders — VERBATIM copies of vol-forecast.html (golden-tested) ────
// data = { session_label, instruments: { NAME: fields } }

function buildExportText(data) {
  const LINE_WIDTH = 29;

  function divider(name) {
    const prefix = `──── ${name} `;
    return prefix + '─'.repeat(Math.max(0, LINE_WIDTH - prefix.length));
  }

  const lines = [
    '**VOL & RANGE FORECAST**',
    `**For session: ${data.session_label}**`,
    '',
  ];

  for (const [name, f] of Object.entries(data.instruments ?? {})) {
    lines.push(divider(name));
    lines.push(`Volatility (annualized) : ${f.vol_annual.toFixed(2)}%`);
    lines.push(
      `High to Low range       : ${f.hl_median.toFixed(2)}% median · ${f.hl_75.toFixed(2)}% 75th Percentile`
    );
    lines.push(
      `Open to Close move      : ${f.oc_median.toFixed(2)}% median · ${f.oc_75.toFixed(2)}% 75th Percentile`
    );
    lines.push('');
  }

  return lines.join('\n');
}

function buildExportV2Text(data) {
  const LINE_WIDTH = 29;
  const divider = name => { const p = `──── ${name} `; return p + '─'.repeat(Math.max(0, LINE_WIDTH - p.length)); };

  const lines = [
    '**VOL & RANGE FORECAST v2**',
    `**For session: ${data.session_label}**`,
    '',
  ];

  for (const [name, f] of Object.entries(data.instruments ?? {})) {
    const d      = f.drift_d ?? 0;
    const oh_med = f.oh_v2_median ?? f.oc_median;
    const oh_75  = f.oh_v2_75    ?? f.oc_75;
    const ol_med = f.ol_v2_median ?? f.oc_median;
    const ol_75  = f.ol_v2_75    ?? f.oc_75;
    const dLabel = Math.abs(d) < 0.05 ? 'Neutral'
                 : d > 0 ? (d > 0.20 ? 'Bullish ↑' : 'Mild bullish lean ↑')
                          : (d < -0.20 ? 'Bearish ↓' : 'Mild bearish lean ↓');

    lines.push(divider(name));
    lines.push(`Volatility (annualized) : ${f.vol_annual.toFixed(2)}%`);
    lines.push(`High to Low range       : ${f.hl_median.toFixed(2)}% median · ${f.hl_75.toFixed(2)}% 75th`);
    lines.push(`Open to Close move      : ${f.oc_median.toFixed(2)}% median · ${f.oc_75.toFixed(2)}% 75th`);
    lines.push(`Open High (upside)      : ${oh_med.toFixed(2)}% median · ${oh_75.toFixed(2)}% 75th`);
    lines.push(`Open Low  (downside)    : ${ol_med.toFixed(2)}% median · ${ol_75.toFixed(2)}% 75th`);
    lines.push(`Drift (d=μ/σ)           : ${d >= 0 ? '+' : ''}${d.toFixed(3)}  →  ${dLabel}`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildExtendedText(data) {
  const LW = 29;
  const div = n => { const p = `──── ${n} `; return p + '─'.repeat(Math.max(0, LW - p.length)); };
  const f2  = x => (typeof x === 'number' ? x.toFixed(2) : '—');

  const lines = [
    '**VOL & RANGE FORECAST — EXTENDED**',
    `**For session: ${data.session_label}**`,
    '',
  ];

  for (const [name, f] of Object.entries(data.instruments ?? {})) {
    lines.push(div(name));
    lines.push(`Vol (ann)       : ${f2(f.vol_annual)}%  [${f.vol_pct ?? '—'}th pct of 252-day history]`);
    lines.push(`H-L median      : ${f2(f.hl_median)}%  (75th ${f2(f.hl_75)}%)`);
    lines.push(`O-C median      : ${f2(f.oc_median)}%  (75th ${f2(f.oc_75)}%)`);
    lines.push(`O-H median      : ${f2(f.oh_median)}%  (75th ${f2(f.oh_75)}%)  [max up leg = same dist as O-C]`);
    lines.push(`O-L median      : ${f2(f.ol_median)}%  (75th ${f2(f.ol_75)}%)  [max down leg = same dist as O-C]`);
    lines.push(`5-day H-L       : ${f2(f.hl_5d)}%  (5-session range)`);
    lines.push(`20-day H-L      : ${f2(f.hl_20d)}%  (20-session range)`);
    lines.push(`5-day O-C       : ${f2(f.oc_5d)}%`);
    lines.push(`20-day O-C      : ${f2(f.oc_20d)}%`);
    lines.push('');
  }

  return lines.join('\n');
}

// HAR-RV shadow export — identical line format to buildExportText, HAR numbers.
// Reads each instrument's `f.har` sub-object (attached by the scheduler);
// instruments without a HAR shadow are skipped so the block never shows stale
// or mixed-estimator numbers.
function buildExportHarText(data) {
  const LINE_WIDTH = 29;
  const divider = name => { const p = `──── ${name} `; return p + '─'.repeat(Math.max(0, LINE_WIDTH - p.length)); };

  const lines = [
    '**VOL & RANGE FORECAST — HAR-RV**',
    `**For session: ${data.session_label}**`,
    '',
  ];

  for (const [name, f] of Object.entries(data.instruments ?? {})) {
    const h = f?.har;
    if (!h) continue;
    lines.push(divider(name));
    lines.push(`Volatility (annualized) : ${h.vol_annual.toFixed(2)}%`);
    lines.push(`High to Low range       : ${h.hl_median.toFixed(2)}% median · ${h.hl_75.toFixed(2)}% 75th Percentile`);
    lines.push(`Open to Close move      : ${h.oc_median.toFixed(2)}% median · ${h.oc_75.toFixed(2)}% 75th Percentile`);
    lines.push('');
  }

  return lines.join('\n');
}

// Convenience: all export strings for a built `data` object. `har` is included
// only when at least one instrument carries a HAR shadow block.
function buildAllExports(data) {
  const out = {
    plain:    buildExportText(data),
    v2:       buildExportV2Text(data),
    extended: buildExtendedText(data),
  };
  if (Object.values(data.instruments ?? {}).some(f => f && f.har)) out.har = buildExportHarText(data);
  return out;
}

export { forecastFields, harShadowFields, harIvShadowFields, buildExportText, buildExportV2Text, buildExtendedText, buildExportHarText, buildAllExports };
