// Run the daily band-fade test (MD files/BAND_FADE_DAILY.md) from the command line.
//   node scripts/run_band_fade.mjs [out.json]
// Reads M1 (local parquet / R2, read-only); writes only the optional local JSON.
import { writeFileSync } from 'node:fs';
import { runBandFade } from '../js/bandFade/bandFadeEngine.js';

const out = process.argv[2] || null;
const t0 = Date.now();
const res = await runBandFade({ progress: m => console.error(`[band-fade ${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`) });
if (out) writeFileSync(out, JSON.stringify(res));
const s1 = res.stage1, s2 = res.stage2;
console.log(JSON.stringify({
  calendar: res.calendar, splitDate: res.splitDate,
  stage1: { primary: s1.primary, context: s1.context, buckets_h5: s1.buckets.h5, stack_h5: s1.stack_h5 },
  stage2: { verdict: s2.verdict, checks: s2.checks, control: s2.control, exitMix: s2.exitMix, metrics: s2.metrics, yearly: s2.yearly },
}, null, 1));
