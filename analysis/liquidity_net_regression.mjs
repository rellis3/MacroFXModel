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
 * Every regression uses Newey-West (HAC) standard errors (js/metricsCore.js
 * neweyWestOLS) — the regression course's default for autocorrelated
 * financial time series — and a chronological 70/30 in-sample/out-of-sample
 * split, reporting the OOS R² computed from the IS-fitted coefficients (the
 * actual overfitting check, not just a bigger in-sample t-stat).
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
import { fetchFredSeries, forwardFillToDates } from '../js/fredFetch.js';
import { weeklyReturns, alignFxToGrid } from '../GlobalLiquidity/backtestCore.mjs';
import { neweyWestOLS } from '../js/metricsCore.js';
import { rollingZScore } from '../js/statsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NQ_DIRS = [
  path.join(ROOT, 'VolRangeForecaster', 'data', 'm1'),
  path.join(ROOT, 'portfolioBacktest', 'cache'),
];
const WEEK_MS = 7 * 864e5;

const FRED_SERIES = { walcl: 'WALCL', tga: 'WTREGEN', rrp: 'RRPONTSYD' };
const IMPULSE_SMOOTH = 4, IMPULSE_LOOKBACK = 13, Z_WINDOW = 156; // weeks — matches js/globalLiquidityEngine.js CFG

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (k, dflt) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : dflt; };
const fredJsonPath = argVal('--fred-json', null);
const pubLagWeeks = parseInt(argVal('--lag', '2'), 10);          // publication lag (matches GLI's PUB_LAG.cb)
const horizons = argVal('--horizons', '4,8,13').split(',').map((s) => parseInt(s, 10));

// ── Tiny causal math helpers (mirrors js/globalLiquidityEngine.js's _math) ──
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
function ffillArr(a) { const out = a.slice(); let last = NaN; for (let i = 0; i < out.length; i++) { if (!isNum(out[i])) out[i] = last; else last = out[i]; } return out; }
function lagArr(a, k) { if (k <= 0) return a.slice(); const out = new Array(a.length).fill(NaN); for (let i = k; i < a.length; i++) out[i] = a[i - k]; return out; }
function smaArr(a, win) { const out = new Array(a.length).fill(NaN); for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - win + 1); j <= i; j++) if (isNum(a[j])) { s += a[j]; n++; } if (n) out[i] = s / n; } return out; }
function rocArr(a, k) { const out = new Array(a.length).fill(NaN); for (let i = k; i < a.length; i++) if (isNum(a[i]) && isNum(a[i - k])) out[i] = a[i] - a[i - k]; return out; }

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
    // A slow multi-year drift plus two "QE-firehose" episodes (planted, like
    // globalLiquidityEngine.js's own synthetic() stress episodes) so the
    // control case has genuine, findable signal to recover.
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

// ── Build the weekly grid + Net Liquidity impulse ──────────────────────────
function buildWeeklyGrid(fredMaps) {
  let minT = Infinity, maxT = -Infinity;
  for (const m of Object.values(fredMaps)) {
    if (!m.size) continue;
    const keys = [...m.keys()].sort();
    minT = Math.min(minT, +new Date(keys[0])); maxT = Math.max(maxT, +new Date(keys.at(-1)));
  }
  const dates = [];
  for (let t = minT; t <= maxT; t += WEEK_MS) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

function computeNetLiquidityImpulse(dates, fredMaps) {
  const walcl = ffillArr(forwardFillToDates(dates, fredMaps.walcl));
  const tga = ffillArr(forwardFillToDates(dates, fredMaps.tga));
  const rrp = ffillArr(forwardFillToDates(dates, fredMaps.rrp));
  // WALCL is $millions on FRED; TGA/RRP are $billions — convert WALCL→$B first
  // (same unit trap globalLiquidityEngine.js documents for its own USD block).
  const netLiquidity = dates.map((_, i) => (isNum(walcl[i]) ? walcl[i] / 1000 : NaN) - (isNum(tga[i]) ? tga[i] : 0) - (isNum(rrp[i]) ? rrp[i] : 0));
  const lagged = lagArr(netLiquidity, pubLagWeeks);      // publication lag — can't know this week's release this week
  const smoothed = smaArr(lagged, IMPULSE_SMOOTH);
  const changeK = rocArr(smoothed, IMPULSE_LOOKBACK);
  const impulse = rollingZScore(changeK, Z_WINDOW);
  return { netLiquidity, impulse };
}

// ── Forward NQ returns at a given horizon (sum of weekly log returns) ──────
function forwardReturns(weeklyRet, horizonWeeks) {
  const n = weeklyRet.length;
  const out = new Array(n).fill(NaN);
  for (let i = 0; i + horizonWeeks < n; i++) {
    let s = 0, ok = true;
    for (let h = 1; h <= horizonWeeks; h++) { const v = weeklyRet[i + h]; if (!isNum(v)) { ok = false; break; } s += v; }
    if (ok) out[i] = s;
  }
  return out;
}

// ── Chronological IS/OOS regression test ───────────────────────────────────
function isOosTest(x, y, isFrac = 0.7) {
  const pairs = []; for (let i = 0; i < x.length; i++) if (isNum(x[i]) && isNum(y[i])) pairs.push([x[i], y[i]]);
  const n = pairs.length;
  if (n < 60) return null; // not enough overlapping history for a meaningful split
  const cut = Math.floor(n * isFrac);
  const xIS = pairs.slice(0, cut).map((p) => p[0]), yIS = pairs.slice(0, cut).map((p) => p[1]);
  const xOOS = pairs.slice(cut).map((p) => p[0]), yOOS = pairs.slice(cut).map((p) => p[1]);
  if (xOOS.length < 20) return null;

  const fit = neweyWestOLS(xIS, yIS);
  const yOosMean = yOOS.reduce((a, b) => a + b, 0) / yOOS.length;
  let ssrOos = 0, sstOos = 0, hits = 0;
  for (let i = 0; i < xOOS.length; i++) {
    const yhat = fit.intercept + fit.beta * xOOS[i];
    ssrOos += (yOOS[i] - yhat) ** 2;
    sstOos += (yOOS[i] - yOosMean) ** 2;
    if (Math.sign(fit.beta * xOOS[i]) === Math.sign(yOOS[i])) hits++;
  }
  const r2Oos = sstOos > 1e-12 ? 1 - ssrOos / sstOos : null;
  return {
    n, nIS: xIS.length, nOOS: xOOS.length,
    beta: fit.beta, r2IS: fit.r2, tStatNW: fit.tStatNW,
    r2OOS: r2Oos, hitRateOOS: hits / xOOS.length,
  };
}

// ── Report ──────────────────────────────────────────────────────────────────
function verdictFor(res) {
  if (!res) return 'insufficient overlapping history for an honest IS/OOS split';
  const robust = Math.abs(res.tStatNW) >= 3;   // Harvey-Liu-Zhu factor-discovery bar (regression-analysis-course-notes.md L4)
  const suggestive = Math.abs(res.tStatNW) >= 2;
  const survivesOos = res.r2OOS != null && res.r2OOS > 0;
  if (robust && survivesOos) return 'ROBUST — |t|≥3 in-sample AND positive out-of-sample R² (survives the honest check)';
  if (suggestive && survivesOos) return 'SUGGESTIVE ONLY — |t| between 2 and 3; per Harvey-Liu-Zhu this is below the factor-discovery bar, treat with caution';
  if (!survivesOos) return 'DOES NOT SURVIVE OUT-OF-SAMPLE — in-sample fit does not carry forward; textbook overfitting signature';
  return 'NO SIGNAL — not distinguishable from noise in-sample';
}

async function main() {
  console.log('='.repeat(78));
  console.log('Net Liquidity → forward Nasdaq returns — Stage A control-case regression test');
  console.log('RESEARCH DIAGNOSTIC ONLY. Not a trading signal, not a system, no position sizing.');
  console.log('='.repeat(78));

  let { maps: fredMaps, source: fredSource } = await loadFredMaps();
  if (!fredMaps) ({ maps: fredMaps, source: fredSource } = syntheticFredMaps());
  console.log(`\nNet Liquidity data source: ${fredSource}`);

  const dates = buildWeeklyGrid(fredMaps);
  const { netLiquidity, impulse } = computeNetLiquidityImpulse(dates, fredMaps);

  let { rets: nqRets, source: nqSource } = await loadNqWeeklyReturns();
  const isSyntheticFred = /SYNTHETIC/.test(fredSource);
  if (!nqRets) { nqRets = syntheticNqReturns(dates, impulse); nqSource = 'SYNTHETIC (offline demo — not real prices)'; }
  console.log(`NASDAQ (NQ) data source:  ${nqSource}`);
  const real = !isSyntheticFred && !/SYNTHETIC/.test(nqSource);
  console.log(`Real data: ${real ? 'YES' : 'NO — at least one input is synthetic; treat all numbers below as mechanics-only'}`);

  const { R: alignedRet } = alignFxToGrid(dates, ['NQ'], { NQ: nqRets });
  const nqWeekly = alignedRet.map((row) => row[0]);

  console.log(`\nWeeks of history: ${dates.length}  (${dates[0]} → ${dates.at(-1)})`);
  console.log(`Net Liquidity impulse: publication lag ${pubLagWeeks}w, ${IMPULSE_SMOOTH}w smooth, ${IMPULSE_LOOKBACK}w rate-of-change, z-scored over ${Z_WINDOW}w\n`);

  console.log('Horizon  n(IS/OOS)   β         IS t(NW)   IS R²    OOS R²    OOS hit-rate   Verdict');
  console.log('-'.repeat(110));
  for (const h of horizons) {
    const y = forwardReturns(nqWeekly, h);
    const res = isOosTest(impulse, y);
    const row = res
      ? `${String(h + 'w').padEnd(8)} ${String(res.nIS + '/' + res.nOOS).padEnd(11)} ${res.beta.toFixed(4).padStart(8)}  ${res.tStatNW.toFixed(2).padStart(9)}  ${res.r2IS.toFixed(3).padStart(7)}  ${(res.r2OOS ?? NaN).toFixed(3).padStart(8)}   ${(res.hitRateOOS * 100).toFixed(1).padStart(10)}%   ${verdictFor(res)}`
      : `${String(h + 'w').padEnd(8)} ${verdictFor(res)}`;
    console.log(row);
  }

  console.log('\n' + '-'.repeat(78));
  console.log('Reading this: OOS R² can be NEGATIVE (the IS-fitted line predicts worse than');
  console.log('just guessing the OOS mean) — that is the honest overfitting signal the');
  console.log('regression course insists on, not a bug. |t| ≥ 3 is the Harvey-Liu-Zhu bar for');
  console.log('a mined factor; 2–3 is "suggestive, don\'t over-interpret" per the same notes.');
  console.log('This script does not decide anything — it reports whether the control case');
  console.log('(the most well-documented liquidity relationship there is) actually holds up.');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
