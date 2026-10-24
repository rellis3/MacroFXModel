#!/usr/bin/env node
/**
 * q6-netliq-rerun / liquidity gate: runs server.js's OWN `_computeLiquidityGate` (and the day-bar
 * builder `_liqGateBarsFromH1`) on all six instruments of LIQUIDITY_GATE_INSTRUMENTS with the route's
 * default config (threshold 0.25, stop 3%, risk 1%, requireBoth). The functions are lifted out of
 * server.js verbatim by name at run time (server.js cannot be imported without starting the server),
 * so there is no hand copy to drift.
 *
 * Substitutions (no OANDA_KEY / FRED_KEY in this session):
 *   - OANDA H1 mid candles -> the local OANDA H1 caches portfolioBacktest/cache/<stem>_h1.parquet
 *     (2016-01-04 -> 2026-08-20; the route asks from 2015-01-01, the cache starts a year later).
 *   - FRED API -> the fredgraph dump (fetch_fred.mjs), from 2015-01-01, cut at 2026-08-21 (lockbox).
 *
 *   node scripts/q6-netliq-rerun/run_liqgate.mjs <fixed|old>
 * mode old: WTREGEN x1000 before it reaches computeNetLiqZ, which then computes exactly the
 * 2026-07-02..2026-10-17 line (WALCL/1000 - TGA in $M - RRP).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTDIR = path.join(ROOT, 'analysis', 'output', 'q6-netliq-rerun');
const mode = process.argv[2];
if (!['fixed', 'old'].includes(mode)) { console.error('usage: run_liqgate.mjs <fixed|old>'); process.exit(2); }
const FROM = '2015-01-01', END = '2026-08-21';

// ── lift the server's functions/constants by name ────────────────────────────
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
function lift(name) {
  const re = new RegExp(`^(?:async )?function ${name}\\s*\\(|^const ${name}\\s*=`, 'm');
  const m = re.exec(server); if (!m) throw new Error(`not found in server.js: ${name}`);
  let i = m.index;
  if (server.startsWith('const', i)) { const end = server.slice(i).search(/\r?\n/); return server.slice(i, i + end); }   // single-line consts
  // body starts at the '{' that ends the (single-line) signature, not at a `= {}` default parameter
  const eol = server.slice(i).search(/\r?\n/);
  let depth = 0, j = server.lastIndexOf('{', i + eol);
  for (; j < server.length; j++) { if (server[j] === '{') depth++; else if (server[j] === '}') { depth--; if (depth === 0) break; } }
  return server.slice(i, j + 1);
}
const NAMES = ['LIQ_GATE_PUB_LAG_WEEKLY', 'LIQ_GATE_Z_WINDOW', 'LIQ_GATE_MIN_Z_WINDOW', 'forwardFillAlign',
  '_liqGatePctChange', '_liqGateApplyLag', '_liqGateRollingZ', 'computeNetLiqZ', 'computeCoherenceZ',
  '_qmrStats', '_liqGateStats', 'pearsonCorr', 'signHitRate',
  '_computeLiquidityGate', '_liqGateBarsFromH1'];
const netLiqUrl = pathToFileURL(path.join(ROOT, 'js', 'netLiquidity.js')).href;
const metricsUrl = pathToFileURL(path.join(ROOT, 'js', 'metricsCore.js')).href;
const modSrc = `import { netLiquiditySeriesBn as _netLiquiditySeriesBn, netLiqUnitWarnings as _netLiqUnitWarnings } from ${JSON.stringify(netLiqUrl)};\n`
  + `import { sharpeStdError as _sharpeStdError, minTrackRecordLength as _minTrackRecordLength } from ${JSON.stringify(metricsUrl)};\n`
  + NAMES.map(lift).join('\n\n') + `\nexport { _computeLiquidityGate, _liqGateBarsFromH1 };\n`;
const tmp = path.join(os.tmpdir(), `liqgate_${process.pid}.mjs`);
fs.writeFileSync(tmp, modSrc);
const { _computeLiquidityGate, _liqGateBarsFromH1 } = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });

// ── FRED (route's LIQUIDITY_GATE_FRED_IDS, Map<date,value> from FROM) ────────
const fred = JSON.parse(fs.readFileSync(path.join(OUTDIR, 'fred.json'), 'utf8'));
const IDS = { walcl: 'WALCL', wtregen: 'WTREGEN', rrpon: 'RRPONTSYD', curve: 'T10Y2Y', credit: 'BAMLH0A0HYM2' };
const fredRaw = {};
for (const [k, sid] of Object.entries(IDS)) {
  fredRaw[k] = new Map(fred[sid].filter(o => o.date >= FROM && o.date <= END)
    .map(o => [o.date, (mode === 'old' && k === 'wtregen') ? o.value * 1000 : o.value]));
}

// ── H1 → day bars via the server's own builder ───────────────────────────────
async function readH1(stem) {
  const fp = path.join(ROOT, 'portfolioBacktest', 'cache', `${stem}_h1.parquet`);
  const b = fs.readFileSync(fp); const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const file = { byteLength: ab.byteLength, slice: (s, e) => Promise.resolve(ab.slice(s, e)) };
  const meta = await parquetMetadataAsync(file);
  let rows; await parquetRead({ file, metadata: meta, columns: ['open', 'high', 'low', 'close', 'datetime'], rowFormat: 'object', onComplete: d => (rows = d) });
  return rows.map(r => ({ t: (r.datetime instanceof Date ? r.datetime : new Date(r.datetime)).toISOString().substring(0, 16), o: r.open, h: r.high, l: r.low, c: r.close }))
    .filter(b => b.t.substring(0, 10) >= FROM && b.t.substring(0, 10) <= END);
}
const INSTR = { NAS100_USD: 'nas100_usd', SPX500_USD: 'spx500', US30_USD: 'us30', US2000_USD: 'us2000', DE30_USD: 'de30', UK100_GBP: 'uk100' };
const cfg = { netliqThreshold: 0.25, stopPct: 3.0, riskPct: 1.0, requireBoth: true };
const out = { mode, ranAt: new Date().toISOString(), from: FROM, end: END, cfg, fredFetchedAt: fred._fetchedAt, results: {} };
for (const [inst, stem] of Object.entries(INSTR)) {
  const bars = _liqGateBarsFromH1(await readH1(stem));
  const r = _computeLiquidityGate(bars, fredRaw, cfg);
  const firstGate2 = r.dates.find((d, i) => r.gate2Series[i]);
  const finiteCredit = r.creditZ.findIndex(Number.isFinite);
  out.results[inst] = { bars: bars.length, span: `${bars[0].date} -> ${bars.at(-1).date}`, stats: r.stats, diagnostics: r.diagnostics,
    firstCreditZ: finiteCredit >= 0 ? r.dates[finiteCredit] : null, firstAlignedDay: firstGate2 ?? null,
    trades: r.trades.length, longs: r.trades.filter(t => t.direction === 'LONG').length, shorts: r.trades.filter(t => t.direction === 'SHORT').length,
    stops: r.trades.filter(t => t.exitReason === 'STOP').length };
  // context only (not part of the engine): buy-and-hold daily close-to-close Sharpe over the span
  // where the gate could trade (from the first day credit z exists), and the share of days in a trade.
  if (finiteCredit >= 0) {
    const rets = []; for (let i = finiteCredit + 1; i < bars.length; i++) rets.push(bars[i].close / bars[i - 1].close - 1);
    const mu = rets.reduce((a, b) => a + b, 0) / rets.length, sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length);
    let inTrade = 0; const span = new Set(); for (const t of r.trades) { for (let i = r.dates.indexOf(t.date); i >= 0 && i < r.dates.length && r.dates[i] <= t.exitDate; i++) span.add(i); }
    inTrade = span.size;
    out.results[inst].buyHoldSharpeSameSpan = +(mu / sd * Math.sqrt(252)).toFixed(2);
    out.results[inst].shareOfDaysInTrade = +(inTrade / (bars.length - finiteCredit)).toFixed(3);
  }
  const s = r.stats;
  console.log(`${inst.padEnd(11)} B&H Sharpe same span ${out.results[inst].buyHoldSharpeSameSpan ?? 'n/a'}  in-trade share ${out.results[inst].shareOfDaysInTrade ?? 'n/a'}`);
  console.log(`${inst.padEnd(11)} bars ${bars.length} creditZ from ${out.results[inst].firstCreditZ}  trades ${s.n} (L${out.results[inst].longs}/S${out.results[inst].shorts})  win ${(s.winRate * 100).toFixed(0)}%  Sharpe ${s.sharpe} (SE ${s.sharpeSE})  CAGR ${s.cagr}%  maxDD ${s.maxDD}%  total ${s.totalReturn}%  corrWeekly ${r.diagnostics.corrWeekly?.toFixed?.(3)} hitWeekly ${r.diagnostics.hitRateWeekly?.toFixed?.(3)}`);
}
fs.writeFileSync(path.join(OUTDIR, `liqgate_${mode}.json`), JSON.stringify(out, null, 1));
console.log('written', path.relative(ROOT, path.join(OUTDIR, `liqgate_${mode}.json`)));
