/*
 * backtest_real.mjs — REAL-data backtest for the Global Liquidity FX system.
 *
 * Uses the EXACT engine that powers the live phone page (js/globalLiquidityEngine.js)
 * so the backtest and the dashboard can never drift. Pulls:
 *   - FX weekly returns  ← the project's real M1 parquet caches (hyparquet)
 *   - FRED weekly series ← one of (priority order):
 *       1. --fred-json <file>     a saved /api/fredhistory-shaped dump
 *       2. FRED_KEY env           fetched live from the FRED API (full history)
 *       3. synthetic (fallback)   clearly labelled — verifies mechanics only
 *
 * Then it runs the engine week-by-week, applies each week's target book to the
 * NEXT week's FX returns (no lookahead), vol-targets the portfolio, charges
 * costs on turnover, and reports Sharpe / drawdown / trades-per-week plus a
 * walk-forward (IS/OOS Sharpe, WFE).
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
import vm from 'vm';
import { fileURLToPath } from 'url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FX_DIR_CANDIDATES = [
  path.join(ROOT, 'VolRangeForecaster', 'data', 'm1'),
  path.join(ROOT, 'portfolioBacktest', 'cache'),
];
const WEEK_MS = 7 * 864e5;
const COST_PER_UNIT_TURNOVER = 0.0002;   // ~2bp per unit gross traded
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

// ── Load the browser engine via a sandbox (it's a classic script, not ESM) ───
function loadEngine() {
  const code = fs.readFileSync(path.join(ROOT, 'js', 'globalLiquidityEngine.js'), 'utf8');
  const sandbox = { self: {}, console, Date, Math, isNaN, Array, Object, JSON, parseFloat };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.self.GLIEngine;
}

// ── FX: read a parquet cache → weekly (Friday) close → log returns ───────────
async function readParquet(file) {
  const ab = fs.readFileSync(file);
  const buf = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
  const f = { byteLength: buf.byteLength, slice: (s, e) => Promise.resolve(buf.slice(s, e)) };
  const meta = await parquetMetadataAsync(f);
  let rows;
  // Only decode close + datetime — skipping OHLV cuts time/memory ~3x on M1 caches.
  await parquetRead({ file: f, metadata: meta, columns: ['close', 'datetime'],
                      rowFormat: 'object', onComplete: (d) => (rows = d) });
  return rows;     // [{ close, datetime }]
}

// Weekly close: last close on/of each ISO week, keyed by that week's Friday date.
function weeklyClose(rows) {
  const byWeek = new Map();
  for (const r of rows) {
    const dt = r.datetime instanceof Date ? r.datetime : new Date(r.datetime);
    const close = r.close;
    if (!(close > 0)) continue;
    // snap to the Friday of that week
    const d = new Date(dt); const dow = d.getUTCDay();       // 0 Sun .. 6 Sat
    const toFri = (5 - dow + 7) % 7; const fri = new Date(d.getTime() + toFri * 864e5);
    const key = fri.toISOString().slice(0, 10);
    const t = dt.getTime();
    const cur = byWeek.get(key);
    if (!cur || t >= cur.t) byWeek.set(key, { t, close });   // keep latest in week
  }
  return byWeek;   // Map<'YYYY-MM-DD', {t, close}>
}

async function loadFxReturns(pairs) {
  const out = {};                      // pair -> Map<weekDate, logRet>
  let found = 0;
  const fileAlias = { XAUUSD: 'gold' };   // gold cache is gold_m1.parquet
  for (const pair of pairs) {
    const stem = (fileAlias[pair] || pair).toLowerCase();
    let file = null;
    for (const dir of FX_DIR_CANDIDATES) {
      const p = path.join(dir, stem + '_m1.parquet');
      if (fs.existsSync(p)) { file = p; break; }
    }
    if (!file) continue;
    try {
      const wk = weeklyClose(await readParquet(file));
      const keys = [...wk.keys()].sort();
      const rets = new Map();
      for (let i = 1; i < keys.length; i++) {
        const a = wk.get(keys[i - 1]).close, b = wk.get(keys[i]).close;
        if (a > 0 && b > 0) rets.set(keys[i], Math.log(b / a));
      }
      out[pair] = rets; found++;
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
  return (d.observations || []).filter((o) => o.value && o.value !== '.')
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
}

const FRED_IDS = {
  walcl: 'WALCL', tga: 'WTREGEN', rrp: 'RRPONTSYD', ecb_assets: 'ECBASSETSW',
  boj_assets: 'JPNASSETS', cny_res: 'TRESEGCNM052N', dexuseu: 'DEXUSEU',
  dexjpus: 'DEXJPUS', dexusuk: 'DEXUSUK', dexchus: 'DEXCHUS', sofr: 'SOFR',
  iorb: 'IORB', hy: 'BAMLH0A0HYM2', dxy: 'DTWEXBGS', bei: 'T10YIE',
  tips: 'DFII10', vix: 'VIXCLS', indpro: 'INDPRO',
};

async function loadFred(E) {
  const jsonArg = argVal('--fred-json');
  if (jsonArg && fs.existsSync(jsonArg)) {
    return { payload: JSON.parse(fs.readFileSync(jsonArg, 'utf8')), source: `dump:${path.basename(jsonArg)}` };
  }
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

// ── Stats ────────────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
function sharpe(r) {
  const x = r.filter((v) => isFinite(v)); if (x.length < 4) return 0;
  const m = mean(x), sd = Math.sqrt(mean(x.map((v) => (v - m) ** 2)) * x.length / (x.length - 1));
  return sd > 1e-12 ? (m / sd) * Math.sqrt(52) : 0;
}
function maxDD(eq) { let pk = -Infinity, dd = 0; for (const e of eq) { pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); } return dd; }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const E = loadEngine();
  console.log('Loading real FX from parquet caches…');
  const { out: fx, found } = await loadFxReturns(E.CFG.PAIRS);
  console.log(`  ${found}/${E.CFG.PAIRS.length} pairs loaded`);
  console.log('Loading FRED…');
  const { payload, source } = await loadFred(E);

  const hist = E.runHistory(payload);
  if (hist.error) { console.error('engine:', hist.error); process.exit(1); }
  const { dates, pairs, weights, regime, gate, grossMult, conviction } = hist;
  const m = pairs.length, n = dates.length;

  // Align FX returns onto the engine's weekly grid (nearest week within 4 days).
  const R = dates.map(() => new Array(m).fill(0));
  const fxCover = new Array(m).fill(0);
  for (let j = 0; j < m; j++) {
    const rets = fx[pairs[j]]; if (!rets) continue;
    const keys = [...rets.keys()].sort(); let ptr = 0;
    for (let i = 0; i < n; i++) {
      const t = +new Date(dates[i]);
      while (ptr < keys.length && +new Date(keys[ptr]) < t - 4 * 864e5) ptr++;
      if (ptr < keys.length && Math.abs(+new Date(keys[ptr]) - t) <= 4 * 864e5) { R[i][j] = rets.get(keys[ptr]); fxCover[j]++; }
    }
  }
  const coveredPairs = fxCover.filter((c) => c > 20).length;

  // Gross-1 book return (apply week i-1 weights to week i returns).
  const bookRet = new Array(n).fill(0);
  for (let i = 1; i < n; i++) { let s = 0; for (let j = 0; j < m; j++) s += weights[i - 1][j] * R[i][j]; bookRet[i] = s; }

  // Vol-target + conviction + risk-gate sizing → net returns & turnover.
  const TARGET = 0.10, LOOK = 52, MAXG = 3.0, FLOOR = 0.30;
  const net = new Array(n).fill(0), gross = new Array(n).fill(0); let trades = 0;
  let prevState = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    const seg = bookRet.slice(Math.max(0, i - LOOK), i).filter((v) => v !== 0);
    let volScale = 1;
    if (seg.length >= 8) { const m0 = mean(seg); const sd = Math.sqrt(mean(seg.map((v) => (v - m0) ** 2)) * seg.length / (seg.length - 1)) * Math.sqrt(52); volScale = sd > 1e-6 ? TARGET / sd : 0; }
    const g = Math.min(MAXG, Math.max(0, volScale * Math.max(FLOOR, conviction[i]) * grossMult[i]));
    gross[i] = g;
    // turnover / trade count from sign-state changes of the sized book
    const state = weights[i].map((w) => Math.sign(Math.abs(w) > 1e-6 ? w : 0));
    let dw = 0; for (let j = 0; j < m; j++) { if (state[j] !== prevState[j]) trades++; dw += Math.abs(weights[i][j] - (i ? weights[i - 1][j] : 0)); }
    prevState = state;
    const cost = dw * g * COST_PER_UNIT_TURNOVER;
    net[i] = (i ? bookRet[i] * gross[i - 1] : 0) - cost;
  }

  const warm = 52;
  const valid = net.slice(warm);
  const eq = []; let c = 1; for (const r of net) { c *= 1 + r; eq.push(c); }
  const annRet = mean(valid) * 52, annVol = Math.sqrt(mean(valid.map((v) => (v - mean(valid)) ** 2)) * valid.length / (valid.length - 1)) * Math.sqrt(52);

  // Walk-forward: 156 train / 52 test / 26 step.
  const wins = []; let s = warm;
  while (s + 156 + 52 <= n) { wins.push({ is: sharpe(net.slice(s, s + 156)), oos: sharpe(net.slice(s + 156, s + 156 + 52)) }); s += 26; }
  const isM = mean(wins.map((w) => w.is)), oosM = mean(wins.map((w) => w.oos));

  const realFred = !source.startsWith('SYNTHETIC');
  const regCount = {}; regime.forEach((r) => (regCount[r] = (regCount[r] || 0) + 1));

  console.log('\n' + '='.repeat(60));
  console.log('  GLOBAL LIQUIDITY — REAL-DATA BACKTEST');
  console.log('='.repeat(60));
  console.log(`  FRED source        : ${source}`);
  console.log(`  FX pairs (covered) : ${coveredPairs}/${m} from real parquet`);
  console.log(`  Weeks              : ${n}  (${dates[0]} → ${dates[n - 1]})`);
  console.log('  ' + '-'.repeat(56));
  console.log(`  Sharpe (net)       : ${sharpe(valid).toFixed(3)}`);
  console.log(`  Ann. return        : ${(annRet * 100).toFixed(1)}%`);
  console.log(`  Ann. vol           : ${(annVol * 100).toFixed(1)}%  (target 10%)`);
  console.log(`  Max drawdown       : ${(maxDD(eq) * 100).toFixed(1)}%`);
  console.log(`  Hit rate (weeks)   : ${(valid.filter((v) => v > 0).length / valid.length * 100).toFixed(1)}%`);
  console.log(`  Avg gross leverage : ${mean(gross.slice(warm)).toFixed(2)}x`);
  console.log(`  Trades/week        : ${(trades / n).toFixed(2)}`);
  console.log(`  Risk-gate weeks    : ${gate.filter(Boolean).length}`);
  console.log(`  Regimes            : ${JSON.stringify(regCount)}`);
  console.log('  ' + '-'.repeat(56));
  console.log(`  Walk-forward       : ${wins.length} windows`);
  console.log(`  IS Sharpe (mean)   : ${isM.toFixed(3)}`);
  console.log(`  OOS Sharpe (mean)  : ${oosM.toFixed(3)}`);
  console.log(`  WFE (OOS/IS)       : ${Math.abs(isM) > 1e-6 ? (oosM / isM).toFixed(3) : 'n/a'}   (target >= 0.5)`);
  console.log(`  OOS windows +ve    : ${(wins.filter((w) => w.oos > 0).length / (wins.length || 1) * 100).toFixed(0)}%`);
  if (!realFred) {
    console.log('\n  NOTE: FRED is SYNTHETIC — the headline Sharpe is meaningless by');
    console.log('        construction (no real liquidity→FX relationship). FX is REAL.');
    console.log('        Re-run with FRED_KEY=... (or --fred-json) for a real number.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
