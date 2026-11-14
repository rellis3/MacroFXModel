// post-release-drift-pooled step 02: point-in-time HAR-800 sigma (data-rules item 2).
// Input JSON: { window, minBars, bars: [{open,high,low,close}, ...] } = NY-close daily bars built from M1, oldest first.
// Output JSON array: out[i] = forecastSigma(bars[max(0,i-window+1) .. i], 'har_rv_log') = the forecast for bar i+1
// (daily fraction), or null when fewer than minBars bars exist. Reads and writes local files only.
import { readFileSync, writeFileSync } from 'node:fs';
import { forecastSigma } from '../../js/forecastSigma.js';

const [, , inPath, outPath] = process.argv;
const { window, minBars, bars } = JSON.parse(readFileSync(inPath, 'utf8'));
const out = new Array(bars.length).fill(null);
for (let i = 0; i < bars.length; i++) {
  if (i + 1 < minBars) continue;
  const s = forecastSigma(bars.slice(Math.max(0, i - window + 1), i + 1), 'har_rv_log');
  out[i] = Number.isFinite(s) && s > 0 ? s : null;
}
writeFileSync(outPath, JSON.stringify(out));
