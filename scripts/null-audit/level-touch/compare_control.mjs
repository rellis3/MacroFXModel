// Step 2: compare a directory of re-run control JSONs against the banked copies (as committed in
// e27a2775), ignoring generatedAt.
//   node scripts/null-audit/level-touch/compare_control.mjs <bankedDir> <rerunDir>
import fs from 'fs'; import path from 'path';
const [bankedDir, rerunDir] = process.argv.slice(2);
let maxAbs = 0, cells = 0, mism = 0; const worst = [];
for (const f of fs.readdirSync(bankedDir).filter(f => f.endsWith('-control.json'))) {
  const old = JSON.parse(fs.readFileSync(path.join(bankedDir, f), 'utf8'));
  const now = JSON.parse(fs.readFileSync(path.join(rerunDir, f), 'utf8'));
  for (const ctl of ['A', 'B']) for (const fam of Object.keys(old[ctl])) for (const k of Object.keys(old[ctl][fam])) {
    const a = old[ctl][fam][k], b = now[ctl]?.[fam]?.[k]; cells++;
    const d = Math.abs((a ?? 0) - (b ?? 0)); if (d > maxAbs) maxAbs = d;
    if (d > 1e-12) { mism++; if (worst.length < 10) worst.push([f, ctl, fam, k, a, b]); }
  }
}
console.log({ cells, mismatchedCells: mism, maxAbsDiff: maxAbs }, worst);
