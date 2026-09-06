/*
 * liquidity_net_regression.mjs — Stage A of the liquidity regression-testing
 * roadmap: replicate the ONE liquidity relationship that's already widely
 * documented (education/QUANT_MACRO_LESSONS_1-6.md §2.4/§3.5 — the Fed's 2020
 * ~$3T injection: "fundamentals said sell; liquidity said buy; liquidity
 * won") BEFORE testing anything less-charted on the FX cross-section. If this
 * control case doesn't come back with a relationship that survives an
 * out-of-sample split, the pipeline is broken, not the hypothesis — the
 * discipline education/regression-analysis-course-notes.md Lesson 7 insists
 * on ("in-sample R² of 0.9 means nothing if OOS R² is 0.1").
 *
 * ⚠️ THIS IS A RESEARCH DIAGNOSTIC, NOT A TRADING SIGNAL OR SYSTEM. It answers
 * one question — does Net Liquidity's impulse have an honest, out-of-sample
 * relationship with forward Nasdaq returns — and reports both sides of that
 * answer. It does not size a position, gate a book, backtest P&L, or claim to
 * beat buy-and-hold. Any of that is a separate, later, human decision built
 * on TOP of a finding here — not an output of this script. (Matches the
 * "liquidity is a condition, not a signal" framing in the course notes.)
 *
 * Net Liquidity ≈ Fed balance sheet (WALCL) − TGA (WTREGEN) − RRP (RRPONTSYD)
 * — the exact formula from QUANT_MACRO_LESSONS_1-6.md §3.5/§6.3. Tested at
 * 4/8/13-week forward horizons (the hypothesis window that same lesson names)
 * using the impulse construction (13w rate-of-change of a smoothed level,
 * z-scored, publication-lagged) already used by GlobalLiquidity/gli.py and
 * js/globalLiquidityEngine.js, for consistency with the rest of the repo.
 *
 * The actual math (impulse construction, Newey-West regression, IS/OOS split)
 * lives in liquidityNetRegressionCore.mjs, shared with the Railway server
 * endpoint (/api/liquidity-analysis/net-liquidity-nq/run) — this file is just
 * I/O (fetch/load the data) + a human-readable report.
 *
 * Usage:
 *   node analysis/liquidity_net_regression.mjs                     # synthetic (offline, mechanics-only — clearly labelled DEMO)
 *   FRED_KEY=xxxx node analysis/liquidity_net_regression.mjs        # live FRED + real NQ (R2, or local parquet cache)
 *   node analysis/liquidity_net_regression.mjs --fred-json fred.json --lag 2 --horizons 4,8,13
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { fetchFredSeries } from '../js/fredFetch.js';
import { computeNetLiquidityRegression, weeklyReturns } from './liquidityNetRegressionCore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NQ_DIRS = [
  path.join(ROOT, 'VolRangeForecaster', 'data', 'm1'),
  path.join(ROOT, 'portfolioBacktest', 'cache'),
];
const WEEK_MS = 7 * 864e5;
const FRED_SERIES = { walcl: 'WALCL', tga: 'WTREGEN', rrp: 'RRPONTSYD', vix: 'VIXCLS', hy: 'BAMLH0A0HYM2' };
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (k, dflt) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : dflt; };
const fredJsonPath = argVal('--fred-json', null);
const pubLagWeeks = parseInt(argVal('--lag', '2'), 10);
const horizons = argVal('--horizons', '4,8,13').split(',').map((s) => parseInt(s, 10));

// ── Net Liquidity data: FRED (json dump / live / synthetic fallback) ───────
async function loadFredMaps() {
  if (fredJsonPath) {
    const dump = JSON.parse(fs.readFileSync(fredJsonPath, 'utf8'));
    const maps = {};
    for (const k of Object.keys(FRED_SERIES)) maps[k] = new Map((dump[k] || []).map((o) => [o.date, o.value]));
    return { maps, source: `--fred-json ${fredJsonPath}` };
  }
  const fredKey = process.env.FRED_KEY || process.env.FRED_API_KEY;
  if (fredKey) {
    const maps = {};
    for (const [k, seriesId] of Object.entries(FRED_SERIES)) maps[k] = await fetchFredSeries(seriesId, '2003-01-01', fredKey);
    return { maps, source: 'FRED API (live)' };
  }
  return { maps: null, source: null };
}

// Deterministic synthetic Net Liquidity components — mechanics-only, clearly
// labelled DEMO everywhere it's used. NOT real market data.
function syntheticFredMaps(nWeeks = 700, seed = 13) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const start = +new Date('2012-01-06');
  const maps = { walcl: new Map(), tga: new Map(), rrp: new Map() };
  let walcl = 2_900_000; // $M, ~pre-2013 Fed balance sheet scale
  for (let i = 0; i < nWeeks; i++) {
    const date = new Date(start + i * WEEK_MS).toISOString().slice(0, 10);
    const qe1 = Math.exp(-0.5 * ((i - Math.floor(0.30 * nWeeks)) / 10) ** 2);
    const qe2 = Math.exp(-0.5 * ((i - Math.floor(0.68 * nWeeks)) / 14) ** 2);
    walcl += 900 + 9000 * qe1 + 7000 * qe2 + 400 * (rnd() - 0.5);
    maps.walcl.set(date, walcl);
    maps.tga.set(date, 450 + 220 * Math.abs(Math.sin(i / 11)) + 30 * (rnd() - 0.5));
    maps.rrp.set(date, Math.max(0, 700 - 550 * (qe1 + qe2) + 60 * (rnd() - 0.5)));
  }
  return { maps, source: 'SYNTHETIC (offline demo — not real market data)' };
}

// ── NQ weekly returns: local parquet cache → R2 → synthetic fallback ───────
async function readParquetPoints(ab) {
  const f = { byteLength: ab.byteLength, slice: (s, e) => Promise.resolve(ab.slice(s, e)) };
  const meta = await parquetMetadataAsync(f);
  let rows;
  await parquetRead({ file: f, metadata: meta, columns: ['close', 'datetime'], rowFormat: 'object', onComplete: (d) => (rows = d) });
  return rows.map((r) => ({ t: (r.datetime instanceof Date ? r.datetime : new Date(r.datetime)).getTime(), close: r.close }));
}

async function loadNqWeeklyReturns() {
  for (const dir of NQ_DIRS) {
    const fp = path.join(dir, 'nq_m1.parquet');
    if (fs.existsSync(fp)) {
      const buf = fs.readFileSync(fp);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return { rets: weeklyReturns(await readParquetPoints(ab)), source: `local parquet (${fp})` };
    }
  }
  if (process.env.R2_ACCESS_KEY && process.env.R2_SECRET_KEY) {
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({
        endpoint: process.env.R2_ENDPOINT || 'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com',
        region: 'auto',
        credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY },
        requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
      });
      const key = `${process.env.R2_KEY_PREFIX || 'm1'}/nq_m1.parquet`;
      const resp = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET || 'r2-storage', Key: key }));
      const buf = Buffer.from(await resp.Body.transformToByteArray());
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return { rets: weeklyReturns(await readParquetPoints(ab)), source: 'R2 (nq_m1.parquet)' };
    } catch (e) {
      console.warn(`  ! R2 NQ fetch failed: ${e.message}`);
    }
  }
  return { rets: null, source: null };
}

// Deterministic synthetic NQ weekly log returns, WITH a genuine (planted)
// positive dependence on a hidden liquidity-like drift so the control case's
// mechanics can be verified end-to-end without live data. NOT real prices.
function syntheticNqReturns(dates, liquidityLike) {
  let s = 4242 >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const rets = new Map();
  for (let i = 0; i < dates.length; i++) {
    const drift = isNum(liquidityLike[i]) ? 0.002 * liquidityLike[i] : 0;
    rets.set(dates[i], drift + (rnd() - 0.5) * 0.05);
  }
  return rets;
}

function printReport(result) {
  console.log('='.repeat(78));
  console.log('Net Liquidity → forward Nasdaq returns — Stage A control-case regression test');
  console.log('RESEARCH DIAGNOSTIC ONLY. Not a trading signal, not a system, no position sizing.');
  console.log('='.repeat(78));
  console.log(`\nNet Liquidity data source: ${result.fredSource}`);
  console.log(`NASDAQ (NQ) data source:  ${result.nqSource}`);
  console.log(`Real data: ${result.real ? 'YES' : 'NO — at least one input is synthetic; treat all numbers below as mechanics-only'}`);
  console.log(`\nWeeks of history: ${result.weeks}  (${result.start} → ${result.asOf})`);
  console.log(`Net Liquidity impulse: publication lag ${result.pubLagWeeks}w, ${result.impulseSmoothWeeks}w smooth, ${result.impulseLookbackWeeks}w rate-of-change, z-scored over ${result.zWindowWeeks}w\n`);

  console.log('Horizon  n(IS/OOS)   β         IS t(NW)   IS R²    OOS R²    OOS hit-rate   Verdict');
  console.log('-'.repeat(110));
  for (const r of result.results) {
    const row = r.n
      ? `${String(r.horizonWeeks + 'w').padEnd(8)} ${String(r.nIS + '/' + r.nOOS).padEnd(11)} ${r.beta.toFixed(4).padStart(8)}  ${r.tStatNW.toFixed(2).padStart(9)}  ${r.r2IS.toFixed(3).padStart(7)}  ${(r.r2OOS ?? NaN).toFixed(3).padStart(8)}   ${(r.hitRateOOS * 100).toFixed(1).padStart(10)}%   ${r.verdict}`
      : `${String(r.horizonWeeks + 'w').padEnd(8)} ${r.verdict}`;
    console.log(row);
  }

  if (result.regime) {
    const g = result.regime;
    console.log(`\nRegime split (education/macro-deep-dives-notes.md Lesson 3 — "regime conditioning is mandatory"):`);
    console.log(`Stress = ${g.stressWeeks}w (${(g.stressShare * 100).toFixed(1)}%) across ${g.stressEpisodes} independent episode(s) — credit (HY OAS) or vol (VIX) z-score > 2.0. Calm = ${g.calmWeeks}w.\n`);
    const printRegimeTable = (label, rows) => {
      console.log(`  ${label}:`);
      console.log('  Horizon  n(IS/OOS)   β         IS t(NW)   IS R²    OOS R²    OOS hit-rate   Verdict');
      for (const r of rows) {
        const row = r.n
          ? `  ${String(r.horizonWeeks + 'w').padEnd(8)} ${String(r.nIS + '/' + r.nOOS).padEnd(11)} ${r.beta.toFixed(4).padStart(8)}  ${r.tStatNW.toFixed(2).padStart(9)}  ${r.r2IS.toFixed(3).padStart(7)}  ${(r.r2OOS ?? NaN).toFixed(3).padStart(8)}   ${(r.hitRateOOS * 100).toFixed(1).padStart(10)}%   ${r.verdict}`
          : `  ${String(r.horizonWeeks + 'w').padEnd(8)} ${r.verdict}`;
        console.log(row);
      }
    };
    printRegimeTable('STRESS weeks', g.resultsStress);
    printRegimeTable('CALM weeks', g.resultsCalm);
    console.log(`\n  ⚠️  ${g.caveat}`);
  } else {
    console.log('\n(No VIX/HY OAS data available — regime-conditioned split skipped.)');
  }

  console.log('\n' + '-'.repeat(78));
  console.log('Reading this: OOS R² can be NEGATIVE (the IS-fitted line predicts worse than');
  console.log('just guessing the OOS mean) — that is the honest overfitting signal the');
  console.log('regression course insists on, not a bug. |t| ≥ 3 is the Harvey-Liu-Zhu bar for');
  console.log('a mined factor; 2–3 is "suggestive, don\'t over-interpret" per the same notes.');
  console.log('This script does not decide anything — it reports whether the control case');
  console.log('(the most well-documented liquidity relationship there is) actually holds up.');
}

async function main() {
  let { maps: fredMaps, source: fredSource } = await loadFredMaps();
  if (!fredMaps) ({ maps: fredMaps, source: fredSource } = syntheticFredMaps());

  let { rets: nqRets, source: nqSource } = await loadNqWeeklyReturns();
  if (!nqRets) {
    const { buildWeeklyGrid, computeNetLiquidityImpulse } = await import('./liquidityNetRegressionCore.mjs');
    const dates = buildWeeklyGrid(fredMaps);
    const { impulse } = computeNetLiquidityImpulse(dates, fredMaps, pubLagWeeks);
    nqRets = syntheticNqReturns(dates, impulse);
    nqSource = 'SYNTHETIC (offline demo — not real prices)';
  }

  const result = computeNetLiquidityRegression({ fredMaps, fredSource, nqRets, nqSource, pubLagWeeks, horizons });
  printReport(result);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
