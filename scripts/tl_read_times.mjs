// scripts/tl_read_times.mjs — set every lesson's "~N min read" label from the page itself (js/readTime.js).
//   node scripts/tl_read_times.mjs          rewrite labels that are off by more than the tolerance
//   node scripts/tl_read_times.mjs --check  report only (exit 1 if any label is off)
// Idempotent. Touches ONLY the number inside the existing "~N min read" label; every other byte is preserved.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMinutes, labelMinutes } from '../js/readTime.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIRS = ['theory-lab/lessons', 'cog/lessons'];
export const tolerance = n => Math.max(2, Math.round(n * 0.2));   // a lesson edited by a few paragraphs should not need a re-run
const check = process.argv.includes('--check');

let changed = 0, off = 0, total = 0;
for (const d of DIRS) {
  for (const f of fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.html') && !f.endsWith('-micro.html'))) {
    const p = path.join(root, d, f), html = fs.readFileSync(p, 'utf8');
    const label = labelMinutes(html); if (label == null) continue;
    total++;
    const want = readMinutes(html);
    if (Math.abs(label - want) <= tolerance(want)) continue;
    off++;
    if (check) { console.log(`${d}/${f}: says ${label}, reads ${want}`); continue; }
    const next = html.replace(/(~?\s*)(\d+)(\s*min(?:ute)?s?\s*read)/i, (_, a, _n, c) => `${a}${want}${c}`);
    if (next !== html) { fs.writeFileSync(p, next); changed++; }
  }
}
console.log(`${total} lessons labelled; ${check ? `${off} off` : `${changed} updated`}`);
if (check && off) process.exit(1);
