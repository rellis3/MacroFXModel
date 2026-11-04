/**
 * Write a system's standard outputs (js/systemExports.js, plan §9ac) to analysis/output/systems/<id>/:
 * trades.json, tearsheet.json, toolkit_pct.csv, toolkit_r.csv, toolkit_cash.csv, data_terminal.csv. Over 5,000 trades:
 * trades.json.gz and tearsheet.json only (the CSVs are built on request).
 *
 * From a study:   import { writeSystemOutputs } from '../scripts/systems/writeSystemOutputs.mjs';
 *                 await writeSystemOutputs('ppp-gap', rawTrades, { model: 'PPP gap', registerId: 'ppp-gap', costR: 0.05 });
 * From the shell: node scripts/systems/writeSystemOutputs.mjs <id> <trades.json | data_terminal.csv> [--account 100000]
 * The id should be the register row id, so the research pod's lifecycle finds it. Python studies use
 * forge/system_exports.py, which writes the same files.
 */
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseTrades, parseTerminalCsv, systemFiles } from '../../js/systemExports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BIG = 5000;
export const systemDir = id => path.join(ROOT, 'analysis', 'output', 'systems', id);

export async function writeSystemOutputs(id, raw, meta = {}, { account = 100000, dir = systemDir(id) } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(id)) throw new Error('id must be a lower-case register id (a-z, 0-9, -)');
  const { trades, errors } = normaliseTrades(raw, meta);
  if (!trades.length) throw new Error(`no usable trades: ${errors.slice(0, 3).join('; ')}`);
  await mkdir(dir, { recursive: true });
  // Large systems (over BIG trades): the trade list is stored gzipped and the CSVs are not written; the server builds
  // them on request (/api/system-backtest/csv) and the page builds them in the browser. Keeps the repo small.
  const big = trades.length > BIG;
  const files = systemFiles(id, trades, { ...meta, writtenAt: new Date().toISOString(), skipped: errors.length, csvOnDemand: big || undefined }, { account });
  const written = [];
  for (const [f, body] of Object.entries(files)) {
    if (big && f.endsWith('.csv')) { await rm(path.join(dir, f), { force: true }); continue; }
    if (big && f === 'trades.json') { await writeFile(path.join(dir, 'trades.json.gz'), gzipSync(body, { level: 9 })); await rm(path.join(dir, f), { force: true }); written.push('trades.json.gz'); continue; }
    await writeFile(path.join(dir, f), body); written.push(f);
  }
  if (!big) await rm(path.join(dir, 'trades.json.gz'), { force: true });
  return { dir, trades: trades.length, skipped: errors.length, files: written };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [id, src] = process.argv.slice(2), ai = process.argv.indexOf('--account');
  if (!id || !src) { console.log('usage: node scripts/systems/writeSystemOutputs.mjs <id> <trades.json | data_terminal.csv> [--account 100000]'); process.exit(1); }
  const text = await readFile(src, 'utf8');
  const raw = src.endsWith('.csv') ? parseTerminalCsv(text).trades : (j => j.trades ?? j)(JSON.parse(text));
  console.log(await writeSystemOutputs(id, raw, { model: id }, { account: ai > 0 ? +process.argv[ai + 1] : 100000 }));
}
