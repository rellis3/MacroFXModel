// Prints the info map's derived data as JSON with fs.readdirSync forced into one directory order ('asc' = byte order like Linux, 'desc' =
// reverse). js/infoMapOrder.test.mjs runs it both ways and requires the same output: the derived file must not depend on the machine's
// directory order (Windows lists case-insensitively, Linux by bytes; that mismatch kept main's Tests red on 2026-11-16).
//   node scripts/info_map_order_probe.mjs asc|desc
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mode = process.argv[2] === 'desc' ? 'desc' : 'asc';
const real = fs.readdirSync;
fs.readdirSync = (...a) => {
  const r = real(...a);
  if (!Array.isArray(r) || (r.length && typeof r[0] !== 'string')) return r;
  const sorted = [...r].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return mode === 'asc' ? sorted : sorted.reverse();
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { computeDerived } = await import(pathToFileURL(path.join(root, 'scripts/build_info_map.mjs')).href);
const d = computeDerived();
for (const f of Object.values(d.families)) for (const p of f.pages) p.lastModified = null;
process.stdout.write(JSON.stringify(d));
