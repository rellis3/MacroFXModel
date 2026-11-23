// Upload analysis/output/futures-bars/store/<SYM>/<YYYY-MM>.json.gz to R2 futures-bars/v1/... (new prefix only).
// Never overwrites: keys already present are skipped.   railway run node scripts/futures-bars/upload_store.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { putBuffer, listKeys } from '../../js/r2Store.js';
const base = new URL('../../analysis/output/futures-bars/store/', import.meta.url);
const have = new Set((await listKeys('futures-bars/v1/')) ?? []);
let up = 0, skip = 0, bytes = 0;
for (const sym of readdirSync(base)) {
  for (const f of readdirSync(new URL(`${sym}/`, base))) {
    const key = `futures-bars/v1/${sym}/${f}`;
    if (have.has(key)) { skip++; continue; }
    const buf = readFileSync(new URL(`${sym}/${f}`, base));
    await putBuffer(key, buf, 'application/gzip'); up++; bytes += buf.length;
  }
}
console.log(`uploaded ${up} (${(bytes / 1e6).toFixed(1)} MB), skipped ${skip} already present`);
