#!/usr/bin/env node
/**
 * macro-confluence-rerun: runs a registered macro-confluence study script UNCHANGED except for
 * three declared, mechanical substitutions, so the re-run is the registered code and not a rewrite.
 *
 *   node scripts/macro-confluence-rerun/run.mjs <direction|baa_credit> <fixed|old> [aligned]
 *
 * Substitutions (each asserted to match exactly once, or the run aborts):
 *   1. `fetchD1` (OANDA, needs OANDA_KEY, not available to this session) -> the same OANDA D1 closes
 *      read from the feature store (analysis/output/macro-confluence-rerun/closes.json, written by
 *      export_closes.py), cut at END_DATE = 2026-10-02 (the last bar the 2026-10-03 run could see) and
 *      the last `count` rows taken, as fetchD1(sym, 5000) did. Close only (open/high/low set to close);
 *      the direction studies read close only.
 *   2. OUT -> analysis/output/macro-confluence-rerun/<study>_<mode>.json
 *   3. mode `old` only: the net-liquidity line is put back to the 2026-10-03 arithmetic
 *      (walcl - tga - rrp in mixed units, RRP effectively dropped) to check the substitution
 *      reproduces the banked numbers. Mode `fixed` runs the script's current line (UNITS FIX 2026-10-17).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [study, mode, alignArg] = process.argv.slice(2);
const align = alignArg === 'aligned';
if (!['direction', 'baa_credit'].includes(study) || !['fixed', 'old'].includes(mode) || (alignArg && !align)) {
  console.error('usage: run.mjs <direction|baa_credit> <fixed|old> [aligned]'); process.exit(2);
}
const END_DATE = '2026-10-02';
const src = fs.readFileSync(path.join(ROOT, 'analysis', `macro_confluence_${study}_study.mjs`), 'utf8');

function sub(s, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`substitution matched ${n} times: ${from.slice(0, 80)}`);
  return s.replace(from, () => to);
}
const closesPath = path.join(ROOT, 'analysis', 'output', 'macro-confluence-rerun', 'closes.json').replace(/\\/g, '/');
const outPath = path.join(ROOT, 'analysis', 'output', 'macro-confluence-rerun', `${study}_${mode}${align ? '_aligned' : ''}.json`).replace(/\\/g, '/');

let code = src;
code = sub(code, "import { fetchD1 } from '../js/volBacktestEngine.js';",
  `const __CLOSES = JSON.parse(fs.readFileSync(${JSON.stringify(closesPath)}, 'utf8'));
const __SYM = { EUR_USD: 'EURUSD', SPX500_USD: 'SPX500', XAU_USD: 'GOLD' };
async function fetchD1(sym, count) {
  const rows = __CLOSES[__SYM[sym]].rows.filter(r => r[0] <= ${JSON.stringify(END_DATE)}).slice(-count);
  return rows.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c }));
}`);
code = code.replace(/const OUT = path\.join\(__dirname, 'output', '[a-z_]+\.json'\);/, () => `const OUT = ${JSON.stringify(outPath)};`);
if (!code.includes(`const OUT = ${JSON.stringify(outPath)};`)) throw new Error('OUT substitution failed');
if (mode === 'old') {
  code = sub(code, 'walclAsOf[i] / 1000 - tgaAsOf[i] / 1000 - rrpAsOf[i]', 'walclAsOf[i] - tgaAsOf[i] - rrpAsOf[i]');
}
if (align) {
  // 4. `aligned` only: the registered script reads every instrument's bar at the EURUSD spine's
  //    POSITION i (L.bars[i]); L.idx (date -> row) is built but never used. SPX500/GOLD have a
  //    different number of rows, so their outcomes were read at other dates. Join by date instead;
  //    a spine date the instrument has no bar for (holiday, FX weekend row) gives no outcome, counted below.
  code = sub(code,
    'const outcome = (L, i, n) => (i < 0 || i + n >= L.bars.length) ? null : (L.bars[i + n].close / L.bars[i].close - 1) * 100;',
    `const __miss = {};
const outcome = (L, i0, n) => { const i = L.idx.get(dates[i0]); if (i == null) { const k = L.bars[0].date + '|' + n; __miss[k] = (__miss[k] || 0) + 1; return null; }
  return (i + n >= L.bars.length) ? null : (L.bars[i + n].close / L.bars[i].close - 1) * 100; };
process.on('exit', () => console.log('[aligned] spine dates with no bar on that date, per instrument-start|H (events+control):', JSON.stringify(__miss)));`);
}
const tmp = path.join(os.tmpdir(), `mcr_${study}_${mode}_${process.pid}.mjs`);
fs.writeFileSync(tmp, code);
console.log(`[rerun] ${study} mode=${mode} END_DATE=${END_DATE} -> ${path.relative(ROOT, outPath)}`);
try { await import(pathToFileURL(tmp).href); } finally { fs.rmSync(tmp, { force: true }); }
