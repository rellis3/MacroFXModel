// The live paper-record h1TrendState must equal the research label (asym_htf_build) at the same signal times.
//   node scripts/rangebook/h1_live_parity.mjs gold
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
const { h1TrendState } = await import(pathToFileURL(path.resolve('../MacroFXModel-paper/js/paperRecordCore.js')).href);
const PAIR = process.argv[2] ?? 'gold';
const lastSun = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); };
const ukMidnight = date => { const [y, m, d] = date.split('-').map(Number), u = Date.UTC(y, m - 1, d) / 1000; const a = Date.UTC(y, 2, lastSun(y, 2), 1) / 1000, b = Date.UTC(y, 9, lastSun(y, 9), 1) / 1000; return u >= a && u < b ? u - 3600 : u; };
const S = await loadM1ForPair(PAIR);
const rows = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_asym_htf.json`, 'utf8')).rows;
const picks = rows.filter((_, i) => i % Math.floor(rows.length / 60) === 0).slice(0, 60);
let ok = 0, bad = [];
for (const r of picks) {
  const t = ukMidnight(r.date) + r.min * 60, end = Math.min(S.n, Math.max(0, (() => { let lo = 0, hi = S.n; while (lo < hi) { const m = (lo + hi) >> 1; if (S.times[m] < t) lo = m + 1; else hi = m; } return lo; })()));
  const from = Math.max(0, end - 200 * 1440);
  const sub = { n: end - from, times: S.times.subarray(from, end), closes: S.closes.subarray(from, end) };
  const g = h1TrendState(sub, t);
  if (g === r.h1) ok++; else bad.push([r.date, r.line, r.h1, g]);
}
console.log(`${PAIR}: ${ok}/${picks.length} match`, bad.slice(0, 5));
