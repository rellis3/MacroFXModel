// Step 3 harness: copy the study's OWN scripts (unchanged logic) into study_copy/, rewriting only
// (a) relative import paths, (b) the M1 directory (PLANT_M1_DIR) and (c) output dirs (PLANT_OUT),
// so the banked pipeline can be run on planted data without touching the real outputs.
// Prints every changed line so the reader can see nothing else moved.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const dst = path.join(here, 'study_copy'); fs.mkdirSync(dst, { recursive: true });
for (const f of ['line_touch_response_study', 'line_touch_control_study', 'line_touch_control_report']) {
  const src = fs.readFileSync(path.join(root, 'analysis', f + '.mjs'), 'utf8').split('\n');
  const out = src.map(l => l
    .replaceAll("'../js/", "'../../../../js/")
    .replace('loadM1ForPair(pair)', 'loadM1ForPair(pair, process.env.PLANT_M1_DIR)')
    .replace("path.join(__dirname, 'output', 'line-touch-response')", "path.join(process.env.PLANT_OUT, 'line-touch-response')")
    .replace("path.join(__dirname, 'output', 'line-touch-control')", "path.join(process.env.PLANT_OUT, 'line-touch-control')"));
  out.forEach((l, i) => { if (l !== src[i]) console.log(`${f}:${i + 1}: ${l.trim()}`); });
  fs.writeFileSync(path.join(dst, f + '.mjs'), out.join('\n'));
}
