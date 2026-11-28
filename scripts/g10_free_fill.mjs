// First fill of the G10 free-source capture (plans/DATA_CAPTURE_G10.md §3 phase 3): everything js/g10FreeCapture.js
// pulls daily, plus the deep history (the BoE fitted-curve archives back to 1979 and the discontinued SNB spot curve).
// Writes to the production R2 archive, append-only (mergeSeries / mergeTable never drop a stored point).
//
//   railway run node scripts/g10_free_fill.mjs            (needs R2_ACCESS_KEY / R2_SECRET_KEY)
//   node scripts/g10_free_fill.mjs --dry                  (no R2: fetch and print what would be written)
//
// Heavy: about 100 MB of BoE downloads, ~3 minutes, ~400 MB peak memory. Run it once, from a laptop, not on Railway.
import { createDataArchive } from '../js/dataArchive.js';
import { putJSON, getJSON, listKeys, r2Configured } from '../js/r2Store.js';
import { fetchBoeSeries } from '../js/boeSeries.js';
import { archiveG10Free } from '../js/g10FreeCapture.js';

const dry = process.argv.includes('--dry');
if (!dry && !r2Configured()) { console.error('R2 credentials missing (run under `railway run`, or pass --dry)'); process.exit(1); }
const seen = [];
const archive = dry
  ? { enabled: true,
      mergeSeries: async (f, id, p) => { seen.push(`series/${f}/${id}: ${p.length} points ${p[0]?.date}..${p.at(-1)?.date}`); return { wrote: true }; },
      mergeTable: async (f, id, r) => { seen.push(`tables/${f}/${id}: ${r.length} rows ${r[0]?.date}..${r.at(-1)?.date}`); return { wrote: true }; } }
  : createDataArchive({ putJSON, getJSON, listKeys, configured: r2Configured, minIntervalMs: 0 });
const r = await archiveG10Free(archive, { fetchBoe: fetchBoeSeries, deep: true });
for (const s of seen) console.log(s);
console.log(JSON.stringify(r, null, 1));
process.exit(r.ok ? 0 : 1);
