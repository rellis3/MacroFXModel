/*
 * backtest_real.mjs — REAL-data backtest for the Global Liquidity FX system (CLI).
 *
 * Uses the EXACT engine that powers the live phone page and the SAME shared core
 * (backtestCore.mjs) the Railway server endpoint uses — so CLI, server and
 * dashboard can never drift. Pulls:
 *   - FX weekly returns  ← the project's real M1 parquet caches (hyparquet)
 *   - FRED weekly series ← one of (priority order):
 *       1. --fred-json <file>     a saved /api/fredhistory-shaped dump
 *       2. FRED_KEY env           fetched live from the FRED API (full history)
 *       3. synthetic (fallback)   clearly labelled — verifies mechanics only
 *
 *   node GlobalLiquidity/backtest_real.mjs
 *   FRED_KEY=xxxx node GlobalLiquidity/backtest_real.mjs      # ← real headline number
 *   node GlobalLiquidity/backtest_real.mjs --fred-json fred.json
 *
 * The headline Sharpe is only "real" when FRED is real (key or dump). With
 * synthetic FRED the number is meaningless by construction — the harness says so.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { loadEngine } from './engineLoader.mjs';
import { computeBacktest, weeklyReturns, FRED_IDS, FX_FILE_ALIAS } from './backtestCore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FX_DIRS = [
  path.join(ROOT, 'VolRangeForecaster', 'data', 'm1'),
  path.join(ROOT, 'portfolioBacktest', 'cache'),
];
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

// ── FX: read a parquet cache (close+datetime only → ~3x faster) → weekly rets ─
async function readParquet(file) {
  const ab = fs.readFileSync(file);
  const buf = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
  const f = { byteLength: buf.byteLength, slice: (s, e) => Promise.resolve(buf.slice(s, e)) };
  const meta = await parquetMetadataAsync(f);
  let rows;
  await parquetRead({ file: f, metadata: meta, columns: ['close', 'datetime'],
                      rowFormat: 'object', onComplete: (d) => (rows = d) });
  return rows;
}

async function loadFx(pairs) {
  const out = {}; let found = 0;
  for (const pair of pairs) {
    const stem = (FX_FILE_ALIAS[pair] || pair).toLowerCase();
    let file = null;
    for (const dir of FX_DIRS) { const p = path.join(dir, stem + '_m1.parquet'); if (fs.existsSync(p)) { file = p; break; } }
    if (!file) continue;
    try {
      const rows = await readParquet(file);
      out[pair] = weeklyReturns(rows.map((r) => ({ t: (r.datetime instanceof Date ? r.datetime : new Date(r.datetime)).getTime(), close: r.close })));
      found++;
    } catch (e) { console.error(`  ! ${pair}: ${e.message}`); }
  }
  return { out, found };
}

// ── FRED ─────────────────────────────────────────────────────────────────────
async function fetchFredSeries(seriesId, key) {
  const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}` +
            `&api_key=${key}&file_type=json&observation_start=2008-01-01&sort_order=asc`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`FRED ${seriesId} HTTP ${r.status}`);
  const d = await r.json();
  return (d.observations || []).filter((o) => o.value && o.value !== '.').map((o) => ({ date: o.date, value: parseFloat(o.value) }));
}

async function loadFred(E) {
  const jsonArg = argVal('--fred-json');
  if (jsonArg && fs.existsSync(jsonArg)) return { payload: JSON.parse(fs.readFileSync(jsonArg, 'utf8')), source: `dump:${path.basename(jsonArg)}` };
  const key = process.env.FRED_KEY || process.env.FRED_API_KEY;
  if (key) {
    const payload = {};
    for (const [k, sid] of Object.entries(FRED_IDS)) {
      try { payload[k] = await fetchFredSeries(sid, key); process.stdout.write(`  fred ${k} (${payload[k].length})\n`); }
      catch (e) { console.error(`  ! ${e.message}`); payload[k] = []; }
    }
    return { payload, source: 'FRED API (live)' };
  }
  return { payload: E.synthetic(620, 7), source: 'SYNTHETIC (no key/dump — mechanics only)' };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const E = loadEngine();
  console.log('Loading real FX from parquet caches…');
  const { out: fxByPair, found } = await loadFx(E.CFG.PAIRS);
  console.log(`  ${found}/${E.CFG.PAIRS.length} pairs loaded`);
  console.log('Loading FRED…');
  const { payload, source } = await loadFred(E);

  const r = computeBacktest({ engine: E, payload, fxByPair, fredSource: source });

  const pct = (x) => (x == null ? 'n/a' : (x * 100).toFixed(1) + '%');
  console.log('\n' + '='.repeat(60));
  console.log('  GLOBAL LIQUIDITY — REAL-DATA BACKTEST');
  console.log('='.repeat(60));
  console.log(`  FRED source        : ${r.fredSource}`);
  console.log(`  FX pairs (covered) : ${r.coveredPairs}/${r.totalPairs} from real parquet`);
  console.log(`  Weeks              : ${r.weeks}  (${r.start} → ${r.asOf})`);
  console.log('  ' + '-'.repeat(56));
  console.log(`  Sharpe (net)       : ${r.sharpe}`);
  console.log(`  Ann. return        : ${pct(r.annReturn)}`);
  console.log(`  Ann. vol           : ${pct(r.annVol)}  (target 10%)`);
  console.log(`  Max drawdown       : ${pct(r.maxDrawdown)}`);
  console.log(`  Hit rate (weeks)   : ${pct(r.hitRate)}`);
  console.log(`  Avg gross leverage : ${r.avgGross}x`);
  console.log(`  Trades/week        : ${r.tradesPerWeek}`);
  console.log(`  Risk-gate weeks    : ${r.gateWeeks}`);
  console.log(`  Regimes            : ${JSON.stringify(r.regimes)}`);
  console.log('  ' + '-'.repeat(56));
  console.log(`  Walk-forward       : ${r.walkForward.windows} windows`);
  console.log(`  IS Sharpe (mean)   : ${r.walkForward.isSharpe}`);
  console.log(`  OOS Sharpe (mean)  : ${r.walkForward.oosSharpe}`);
  console.log(`  WFE (OOS/IS)       : ${r.walkForward.wfe}   (target >= 0.5)`);
  console.log(`  OOS windows +ve    : ${pct(r.walkForward.oosPositiveShare)}`);
  if (!r.real) {
    console.log('\n  NOTE: FRED is SYNTHETIC — the headline Sharpe is meaningless by');
    console.log('        construction (no real liquidity→FX relationship). FX is REAL.');
    console.log('        Re-run with FRED_KEY=... (or --fred-json) for a real number.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
