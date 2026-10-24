#!/usr/bin/env node
/**
 * macro-confluence-rerun, range study: runs analysis/macro_confluence_range_study.mjs UNCHANGED except
 * for declared, mechanical substitutions (each asserted to match exactly once, or the run aborts).
 * Needs OANDA (real D1 high/low), so run it through the key wrapper:
 *
 *   python scratchpad/runstudy.py scripts/macro-confluence-rerun/run_range.mjs <fixed|old> [aligned]
 *
 *   1. fetchD1 → the same OANDA fetch, cut at END_DATE = 2026-10-02 (the last bar the 2026-10-03 run
 *      could see) and the last `count` rows taken, so the window equals the original run's.
 *   2. OUT → analysis/output/macro-confluence-rerun/range_<mode>[_aligned].json
 *   3. mode `old`: the net-liquidity line put back to the 2026-10-03 arithmetic (mixed units). With
 *      `old` and no `aligned`, the run must reproduce the banked analysis/output/macro_confluence_range.json.
 *   4. `aligned`: fwdRange read the instrument at the EURUSD spine's POSITION i (L.bars[i]); L.idx
 *      (date → row) was built and never used, so SPX500/GOLD outcomes came from other dates. Join by
 *      date; a spine date the instrument has no bar for gives no outcome (counted, printed).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [mode, alignArg] = process.argv.slice(2);
const align = alignArg === 'aligned';
if (!['fixed', 'old'].includes(mode) || (alignArg && !align)) { console.error('usage: run_range.mjs <fixed|old> [aligned]'); process.exit(2); }
if (!process.env.OANDA_API_KEY && !process.env.OANDA_KEY) { console.error('needs OANDA: run via python scratchpad/runstudy.py'); process.exit(2); }
const END_DATE = '2026-10-02';
const src = fs.readFileSync(path.join(ROOT, 'analysis', 'macro_confluence_range_study.mjs'), 'utf8').replace(/\r\n/g, '\n');
const sub = (s, from, to) => { const n = s.split(from).length - 1; if (n !== 1) throw new Error(`substitution matched ${n} times: ${from.slice(0, 80)}`); return s.replace(from, () => to); };
const outPath = path.join(ROOT, 'analysis', 'output', 'macro-confluence-rerun', `range_${mode}${align ? '_aligned' : ''}.json`).split(path.sep).join('/');
const engine = pathToFileURL(path.join(ROOT, 'js', 'volBacktestEngine.js')).href;

let code = src;
code = sub(code, "import { fetchD1 } from '../js/volBacktestEngine.js';",
  `import { fetchD1 as __fetchD1 } from ${JSON.stringify(engine)};
// The same OANDA request the original made on 2026-10-03, pinned to that moment: OANDA counts the
// 5000 bars back from \`to\`, so a request made today would start ~3 weeks later.
async function fetchD1(sym, count) {
  const __f = globalThis.fetch;
  globalThis.fetch = (u, o) => __f(String(u).includes('/candles?') ? String(u) + '&to=2026-10-03T00:00:00Z' : u, o);
  try { return (await __fetchD1(sym, count)).filter(b => b.date <= ${JSON.stringify(END_DATE)}); }
  finally { globalThis.fetch = __f; }
}`);
code = sub(code, "const OUT = path.join(__dirname, 'output', 'macro_confluence_range.json');", `const OUT = ${JSON.stringify(outPath)};`);
if (mode === 'old') code = sub(code, 'walclAsOf[i] / 1000 - tgaAsOf[i] / 1000 - rrpAsOf[i]', 'walclAsOf[i] - tgaAsOf[i] - rrpAsOf[i]');
if (align) {
  code = sub(code, `const fwdRange = (L, i, n) => {
  if (i < 0 || i + n >= L.bars.length || L.atr[i] == null) return null;`, `const __miss = {};
const fwdRange = (L, i0, n) => {
  const i = L.idx.get(dates[i0]);
  if (i == null) { const k = L.bars[0].date + '|' + n; __miss[k] = (__miss[k] || 0) + 1; return null; }
  if (i < 0 || i + n >= L.bars.length || L.atr[i] == null) return null;`);
  code += `\nconsole.log('[aligned] spine dates with no bar on that date, per instrument-start|H:', JSON.stringify(__miss));\n`;
}
// the temp copy lives in analysis/, so the script's own relative paths resolve as before
const tmp = path.join(ROOT, 'analysis', `.mcr_range_${mode}${align ? '_aligned' : ''}_${process.pid}.mjs`);
fs.writeFileSync(tmp, code);
console.log(`[rerun] range mode=${mode}${align ? ' aligned' : ''} END_DATE=${END_DATE} -> ${path.relative(ROOT, outPath)}`);
try { await import(pathToFileURL(tmp).href); } finally { fs.rmSync(tmp, { force: true }); }
