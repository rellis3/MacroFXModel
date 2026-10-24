#!/usr/bin/env node
/**
 * q6-netliq-rerun / GLI: the three Global Liquidity backtests the server runs
 * (computeBacktest, computeNqBacktest, computeRegressionTest from GlobalLiquidity/backtestCore.mjs,
 * engine via GlobalLiquidity/engineLoader.mjs), with the server's own FX loading (close+datetime,
 * chunked, accumulateWeekly) from the LOCAL M1 caches instead of R2, and FRED from the fredgraph dump
 * (fetch_fred.mjs) instead of the API (no FRED_KEY in this session). Observation start 2008-01-01 as
 * the server's _gliFetchFred; everything cut at 2026-08-21 (lockbox; the local M1 caches end there).
 *
 *   node scripts/q6-netliq-rerun/run_gli.mjs <fixed|old>
 *
 * mode old: WTREGEN is multiplied by 1000 before it reaches the engine, so the engine's fixed line
 * (WALCL/1000 - TGA/1000 - RRP) computes exactly the 2026-07-02..2026-10-17 line (WALCL/1000 - TGA - RRP,
 * TGA left in $M, roughly minus the TGA). Nothing else differs between the modes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { loadEngine } from '../../GlobalLiquidity/engineLoader.mjs';
import { computeBacktest, computeNqBacktest, computeRegressionTest, accumulateWeekly, weeklyReturnsFromByWeek, FRED_IDS, FX_FILE_ALIAS } from '../../GlobalLiquidity/backtestCore.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTDIR = path.join(ROOT, 'analysis', 'output', 'q6-netliq-rerun');
const mode = process.argv[2];
if (!['fixed', 'old'].includes(mode)) { console.error('usage: run_gli.mjs <fixed|old>'); process.exit(2); }
const START = '2008-01-01', END = '2026-08-21';
const END_MS = Date.parse(END + 'T23:59:59Z');

const fred = JSON.parse(fs.readFileSync(path.join(OUTDIR, 'fred.json'), 'utf8'));
const payload = {};
for (const [k, sid] of Object.entries(FRED_IDS)) {
  payload[k] = (fred[sid] || []).filter(o => o.date >= START && o.date <= END)
    .map(o => ({ date: o.date, value: (mode === 'old' && k === 'tga') ? o.value * 1000 : o.value }));
}

const DIRS = [path.join(ROOT, 'VolRangeForecaster', 'data', 'm1'), path.join(ROOT, 'portfolioBacktest', 'cache')];
async function weeklyFor(stem) {
  let fp = null;
  for (const d of DIRS) { const p = path.join(d, `${stem}_m1.parquet`); if (fs.existsSync(p)) { fp = p; break; } }
  if (!fp) return null;
  const b = fs.readFileSync(fp); const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const file = { byteLength: ab.byteLength, slice: (s, e) => Promise.resolve(ab.slice(s, e)) };
  const meta = await parquetMetadataAsync(file);
  const total = Number(meta.num_rows), CHUNK = 150000, byWeek = new Map();
  for (let s = 0; s < total; s += CHUNK) {
    let rows;
    await parquetRead({ file, metadata: meta, columns: ['close', 'datetime'], rowFormat: 'object', rowStart: s, rowEnd: Math.min(s + CHUNK, total), onComplete: d => (rows = d) });
    accumulateWeekly(byWeek, rows.map(r => ({ t: (r.datetime instanceof Date ? r.datetime : new Date(r.datetime)).getTime(), close: r.close })).filter(p => p.t <= END_MS));
  }
  return { rets: weeklyReturnsFromByWeek(byWeek), file: path.relative(ROOT, fp) };
}

const engine = loadEngine();
// Weekly returns are unit-independent, so they are built once and cached for the other mode.
const CACHE = path.join(OUTDIR, 'gli_fx_weekly.cache.json');
let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : null;
if (!cache) {
  cache = { fx: {}, files: {}, nq: null, nqFile: null };
  for (const pair of engine.CFG.PAIRS) {
    const stem = (FX_FILE_ALIAS[pair] || pair).toLowerCase();
    const w = await weeklyFor(stem);
    if (w && w.rets.size) { cache.fx[pair] = [...w.rets]; cache.files[pair] = w.file; }
  }
  const w = await weeklyFor('nq');
  if (w) { cache.nq = [...w.rets]; cache.nqFile = w.file; }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}
const fxByPair = Object.fromEntries(Object.entries(cache.fx).map(([k, v]) => [k, new Map(v)]));
const fxFiles = cache.files;
console.log(`[gli ${mode}] FX pairs loaded ${Object.keys(fxByPair).length}/${engine.CFG.PAIRS.length}`);
const nq = cache.nq ? { rets: new Map(cache.nq), file: cache.nqFile } : null;
const src = `fredgraph dump ${fred._fetchedAt} (units ${mode})`;

const bt = computeBacktest({ engine, payload, fxByPair, fredSource: src }); delete bt.equity;
const nqbt = nq ? computeNqBacktest({ engine, payload, nqReturns: nq.rets, fredSource: src }) : null;
const reg = computeRegressionTest({ engine, payload, fxByPair, fredSource: src });

const out = { mode, ranAt: new Date().toISOString(), start: START, end: END, fxFiles, nqFile: nq?.file ?? null, backtest: bt, nq: nqbt, regression: reg };
fs.writeFileSync(path.join(OUTDIR, `gli_${mode}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ weeks: bt.weeks, span: `${bt.start} -> ${bt.asOf}`, covered: `${bt.coveredPairs}/${bt.totalPairs}`, sharpe: bt.sharpe, annRet: bt.annReturn, maxDD: bt.maxDrawdown, wf: bt.walkForward, regimes: bt.regimes, gateWeeks: bt.gateWeeks }, null, 1));
if (nqbt) { console.log('NQ buy&hold Sharpe', nqbt.buyHoldSharpe); for (const [k, r] of Object.entries(nqbt.rules)) console.log(`  ${k}: Sharpe ${r.sharpe} OOS ${r.oosSharpe} time-in ${r.timeInMarket}`); console.log('  ' + nqbt.verdict); }
console.log(`regression: ${reg.significantPairs}/${reg.pairsTested} pairs |t|>=1.96; pooled t ${reg.pooled?.tStatNW}`);
console.log('written', path.relative(ROOT, path.join(OUTDIR, `gli_${mode}.json`)));
