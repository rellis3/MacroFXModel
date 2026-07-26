// WaveTrend cross-check: compute wt2 via the REAL js/vumanchuCore on the synthetic
// bars mtf_divergence.py wrote, so the Python port can be validated bit-for-bit.
import fs from 'node:fs';
import { computeWaveTrend } from '../js/vumanchuCore.js';

const { bars, wt } = JSON.parse(fs.readFileSync(new URL('./_wt_bars.json', import.meta.url)));
const { wt2 } = computeWaveTrend(bars, wt);
fs.writeFileSync(new URL('./_wt_js.json', import.meta.url), JSON.stringify(wt2));
console.log(`wrote _wt_js.json (${wt2.length} wt2 values)`);
