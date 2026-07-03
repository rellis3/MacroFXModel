// Golden tests for the forecast export brick.
//   - the 3 format builders must be byte-identical to vol-forecast.html's originals
//   - forecastFields must match the forecaster's own _buildOutput + v2 drift block
//
//   node js/forecastExport.test.mjs

import { forecastFields, harShadowFields, buildExportText, buildExportV2Text, buildExtendedText, buildExportHarText, buildAllExports } from './forecastExport.js';
import { _buildOutput, _driftD, _bmMaxQuantile, ASSET_PARAMS } from './volForecast.js';
import { realizedVarSeries, sigmaSeriesForExport } from './volForecastBench.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Reference copies — VERBATIM from vol-forecast.html (the source of truth) ───
function refBuildExportText(data) {
  const LINE_WIDTH = 29;
  function divider(name) {
    const prefix = `──── ${name} `;
    return prefix + '─'.repeat(Math.max(0, LINE_WIDTH - prefix.length));
  }
  const lines = ['**VOL & RANGE FORECAST**', `**For session: ${data.session_label}**`, ''];
  for (const [name, f] of Object.entries(data.instruments ?? {})) {
    lines.push(divider(name));
    lines.push(`Volatility (annualized) : ${f.vol_annual.toFixed(2)}%`);
    lines.push(`High to Low range       : ${f.hl_median.toFixed(2)}% median · ${f.hl_75.toFixed(2)}% 75th Percentile`);
    lines.push(`Open to Close move      : ${f.oc_median.toFixed(2)}% median · ${f.oc_75.toFixed(2)}% 75th Percentile`);
    lines.push('');
  }
  return lines.join('\n');
}
function refBuildExportV2Text(data) {
  const LINE_WIDTH = 29;
  const divider = name => { const p = `──── ${name} `; return p + '─'.repeat(Math.max(0, LINE_WIDTH - p.length)); };
  const lines = ['**VOL & RANGE FORECAST v2**', `**For session: ${data.session_label}**`, ''];
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
function refBuildExtendedText(data) {
  const LW = 29;
  const div = n => { const p = `──── ${n} `; return p + '─'.repeat(Math.max(0, LW - p.length)); };
  const f2  = x => (typeof x === 'number' ? x.toFixed(2) : '—');
  const lines = ['**VOL & RANGE FORECAST — EXTENDED**', `**For session: ${data.session_label}**`, ''];
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

function refBuildExportHarText(data) {
  const LINE_WIDTH = 29;
  const divider = name => { const p = `──── ${name} `; return p + '─'.repeat(Math.max(0, LINE_WIDTH - p.length)); };
  const lines = ['**VOL & RANGE FORECAST — HAR-RV**', `**For session: ${data.session_label}**`, ''];
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

// ── Sample data covering the field set + drift label branches ─────────────────
const sample = {
  session_label: 'Mon 30 Jun 2026',
  instruments: {
    EURUSD: { vol_annual: 7.12, vol_pct: 42, hl_median: 0.55, hl_75: 0.74, oc_median: 0.33, oc_75: 0.56,
              oh_median: 0.33, oh_75: 0.56, ol_median: 0.33, ol_75: 0.56, hl_5d: 1.23, hl_20d: 2.46,
              oc_5d: 0.74, oc_20d: 1.48, drift_d: 0.12, oh_v2_median: 0.38, oh_v2_75: 0.62, ol_v2_median: 0.29, ol_v2_75: 0.50 },
    GOLD:   { vol_annual: 14.8, vol_pct: 71, hl_median: 1.10, hl_75: 1.48, oc_median: 0.66, oc_75: 1.12,
              oh_median: 0.66, oh_75: 1.12, ol_median: 0.66, ol_75: 1.12, hl_5d: 2.46, hl_20d: 4.92,
              oc_5d: 1.48, oc_20d: 2.95, drift_d: -0.34, oh_v2_median: 0.50, oh_v2_75: 0.90, ol_v2_median: 0.82, ol_v2_75: 1.35 },
  },
};

// HAR sample: one instrument with a shadow, one attempted-but-unavailable (null)
const harSample = {
  session_label: 'Mon 30 Jun 2026',
  instruments: {
    EURUSD: { ...sample.instruments.EURUSD,
              har: { vol_annual: 6.44, hl_median: 0.50, hl_75: 0.67, oc_median: 0.30, oc_75: 0.51 } },
    GOLD:   { ...sample.instruments.GOLD, har: null },
  },
};

console.log('[format builders — byte-identical to vol-forecast.html]');
ok('buildExportText matches page original',     buildExportText(sample)     === refBuildExportText(sample));
ok('buildExportV2Text matches page original',   buildExportV2Text(sample)   === refBuildExportV2Text(sample));
ok('buildExtendedText matches page original',   buildExtendedText(sample)   === refBuildExtendedText(sample));
ok('buildExportHarText matches page original',  buildExportHarText(harSample) === refBuildExportHarText(harSample));
ok('HAR export skips instruments without a shadow',
   buildExportHarText(harSample).includes('EURUSD') && !buildExportHarText(harSample).includes('GOLD'));
ok('buildAllExports includes har only when a shadow exists',
   buildAllExports(harSample).har === buildExportHarText(harSample) && buildAllExports(sample).har === undefined);

console.log('[forecastFields — uses the forecaster\'s own band math]');
// deterministic synthetic bars (no Math.random)
const N = 320, ohlc = [];
let px = 1.10;
for (let i = 0; i < N; i++) {
  const r = 0.003 * Math.sin(i / 5) + 0.0003;
  const o = px, c = o * (1 + r);
  ohlc.push({ open: o, high: Math.max(o, c) * 1.002, low: Math.min(o, c) * 0.998, close: c });
  px = c;
}
const series = ohlc.map((_, i) => 0.005 + 0.001 * Math.sin(i / 9));   // synthetic σ history
const sigmaFwd = series[series.length - 1];
const ff   = forecastFields(series, sigmaFwd, ohlc, 'fx');
const base = _buildOutput(series, sigmaFwd, 'fx', 1.0);

ok('plain/extended fields delegate to _buildOutput',
   ff.vol_annual === base.vol_annual && ff.hl_75 === base.hl_75 && ff.oc_median === base.oc_median
   && ff.hl_5d === base.hl_5d && ff.oc_20d === base.oc_20d && ff.vol_pct === base.vol_pct);

// v2 drift block must replicate computeForecast() exactly
const p = ASSET_PARAMS.fx, sp = sigmaFwd * 100, d = _driftD(ohlc, sigmaFwd), r2v = x => Math.round(x * 100) / 100;
ok('drift_d matches _driftD',     ff.drift_d === d, `d=${d}`);
ok('oh_v2_75 matches forecaster',  ff.oh_v2_75 === r2v(_bmMaxQuantile( d, 0.75) * p.oc_75_corr * sp));
ok('ol_v2_median matches forecaster', ff.ol_v2_median === r2v(_bmMaxQuantile(-d, 0.5) * p.oc_50_corr * sp));

console.log('[harShadowFields — bench HAR-RV σ through the incumbent band math]');
const har = harShadowFields(ohlc, 'fx', 1.0);
ok('produces a shadow on sufficient synthetic bars', har !== null);
if (har) {
  ok('fields finite and ordered',
     Number.isFinite(har.vol_annual) && har.vol_annual > 0
     && har.hl_75 > har.hl_median && har.hl_median > 0
     && har.oc_75 > har.oc_median && har.oc_median > 0);
  // Delegation identity: byte-equal to composing the two bricks by hand — proves
  // harShadowFields adds NO math of its own (only the news_mult display field).
  const { series: hs, sigmaFwd: hsF } = sigmaSeriesForExport(ohlc, 'harRV', { rv: realizedVarSeries(ohlc, 'gk') });
  const manual = forecastFields(hs, hsF, ohlc, 'fx');
  manual.news_mult = 1.0;
  ok('delegates exactly to sigmaSeriesForExport + forecastFields',
     JSON.stringify(har) === JSON.stringify(manual));
  // News multiplier scales σ before the bands, same convention as computeForecast.
  const har12    = harShadowFields(ohlc, 'fx', 1.2);
  const manual12 = forecastFields(hs, hsF * 1.2, ohlc, 'fx');
  manual12.news_mult = 1.2;
  ok('news multiplier scales bands via σ', JSON.stringify(har12) === JSON.stringify(manual12));
}
ok('returns null when bars are insufficient', harShadowFields(ohlc.slice(0, 70), 'fx', 1.0) === null);

// round-trip: feed forecastFields output straight into the builders without throwing
console.log('[round-trip]');
const data2 = { session_label: 'test', instruments: { EURUSD: ff } };
ok('plain export builds from forecastFields output',    typeof buildExportText(data2) === 'string' && buildExportText(data2).includes('VOL & RANGE FORECAST'));
ok('v2 export builds from forecastFields output',       buildExportV2Text(data2).includes('Open High (upside)'));
ok('extended export builds from forecastFields output', buildExtendedText(data2).includes('EXTENDED'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll forecast-export tests passed.');
process.exit(failures ? 1 : 0);
