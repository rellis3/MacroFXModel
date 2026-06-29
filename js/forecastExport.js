/**
 * Forecast export brick — produces the live forecaster's export TEXT for an
 * arbitrary daily σ (e.g. the benchmark's OOS-winning estimator), so the output
 * is byte-identical to vol-forecast.html's ⬇ Export / Export v2 / Extended and
 * drops straight into the same Pine Script indicator.
 *
 * Band MATH is NOT re-implemented: `forecastFields` imports `_buildOutput`,
 * `_driftD`, `_bmMaxQuantile` and `ASSET_PARAMS` from volForecast.js (the single
 * source — its June-recalibrated correction factors). Only the three FORMAT
 * builders are copied here (they live inside the HTML page and can't be imported);
 * `js/forecastExport.test.mjs` golden-tests them against verbatim reference copies
 * so they can't silently drift from the page.
 */

import { _buildOutput, _driftD, _bmMaxQuantile, ASSET_PARAMS } from './volForecast.js';

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

// Convenience: all three export strings for a built `data` object.
function buildAllExports(data) {
  return {
    plain:    buildExportText(data),
    v2:       buildExportV2Text(data),
    extended: buildExtendedText(data),
  };
}

export { forecastFields, buildExportText, buildExportV2Text, buildExtendedText, buildAllExports };
