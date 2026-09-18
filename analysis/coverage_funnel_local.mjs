// S13-S16 (MD files/MARKET_SENSE_TESTS.md, commit 26203b3), run OFFLINE.
//
// This session's network egress is blocked to FRED, OANDA, this desk's own
// Railway API and CFTC -- the same four hosts analysis/market_sense_studies.mjs
// needs for S13-S16 there (see that file's S13-S16 additions, committed but not
// run). npm's registry came back, so this script does the parts of S13-S16 that
// are reachable with ZERO network calls, from two local sources only:
//   - VolRangeForecaster/data/m1/*.parquet  M1 bars, 25 of the registry's 26 FX
//     pairs + gold (missing: NZD/CAD -- no local file), resampled to daily here
//   - calendar_events.csv                    this desk's own release history,
//     2014-01 -> 2026-07 (actual/previous/consensus)
//
// What this CANNOT do without network, and does not claim to:
//   - S13(b) the yield-spread sleeve reconstruction needs FRED (GS2 + 6 foreign
//     short-rate series). NOT RUN.
//   - S14's rates/credit family needs FRED (DGS2/10/30, DFII10, T10YIE, HY, VIX,
//     DXY). NOT RUN -- so S14's registered ">=3 of 4 families" bar is scored
//     against a 3-family ceiling here, not the registered 4. Said plainly below,
//     not silently.
//   - S15(a) the oil leg needs WTI bars, which exist nowhere locally in this
//     repo (VolRangeForecaster/data/m1 is FX + gold only). NOT RUN.
//   - S16 is conditional on S15(a) returning something. Since S15(a) did not
//     run, S16 does NOT run either.
//
//   node analysis/coverage_funnel_local.mjs [S13,S14,S15]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const M1_DIR = path.join(__dirname, '..', 'VolRangeForecaster', 'data', 'm1');
const OUT = path.join(__dirname, 'output', 'coverage_funnel_local.json');
const REPS = 1000, MIN_N = 40, SEED = 20260918;
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const PASS_ATR = 0.10;
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = (x, dp = 3) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const log = (...a) => console.log(...a);
const results = { ranAt: new Date().toISOString(), mode: 'offline-local-data-only', notRun: [
  { id: 'S13b', reason: 'yield-spread sleeve reconstruction needs FRED (GS2 + 6 foreign short-rate series)' },
  { id: 'S14-rates-credit', reason: 'needs FRED (DGS2/10/30, DFII10, T10YIE, HY, VIX, DXY); S14 scored on a 3-family ceiling here, not the registered 4' },
  { id: 'S15a', reason: 'the oil leg needs WTI bars, not present anywhere locally in this repo' },
  { id: 'S16', reason: 'conditional on S15(a), which did not run' },
], studies: {} };

// ── local M1 -> daily OHLC (schema: open,high,low,close,volume,spread_open,spread_close,datetime; datetime at index 7) ──
async function dailyFromM1(pairKey) {
  const file = path.join(M1_DIR, `${pairKey}_m1.parquet`);
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const vfile = { byteLength: ab.byteLength, slice: (s, e) => Promise.resolve(ab.slice(s, e)) };
  const meta = await parquetMetadataAsync(vfile);
  const total = Number(meta.num_rows ?? 0);
  const byDate = new Map();
  const chunkRows = 500_000;
  for (let start = 0; start < total; start += chunkRows) {
    const end = Math.min(start + chunkRows, total);
    let chunk; await parquetRead({ file: vfile, metadata: meta, rowStart: start, rowEnd: end, onComplete: d => (chunk = d) });
    for (const row of chunk) {
      const dtRaw = row[7]; const dt = dtRaw instanceof Date ? dtRaw.toISOString() : String(dtRaw);
      const date = dt.slice(0, 10);
      let d = byDate.get(date);
      if (!d) { d = { date, open: row[0], high: row[1], low: row[2], close: row[3] }; byDate.set(date, d); }
      else { if (row[1] > d.high) d.high = row[1]; if (row[2] < d.low) d.low = row[2]; d.close = row[3]; }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date < b.date ? -1 : 1);
}

const PAIR_FILES = {
  eurusd: 'EUR_USD', gbpusd: 'GBP_USD', audusd: 'AUD_USD', nzdusd: 'NZD_USD', usdcad: 'USD_CAD', usdchf: 'USD_CHF',
  eurgbp: 'EUR_GBP', euraud: 'EUR_AUD', eurcad: 'EUR_CAD', eurchf: 'EUR_CHF', eurnzd: 'EUR_NZD',
  audnzd: 'AUD_NZD', audcad: 'AUD_CAD', audchf: 'AUD_CHF', gbpaud: 'GBP_AUD', gbpcad: 'GBP_CAD', gbpchf: 'GBP_CHF', gbpnzd: 'GBP_NZD',
  usdjpy: 'USD_JPY', eurjpy: 'EUR_JPY', gbpjpy: 'GBP_JPY', audjpy: 'AUD_JPY', cadjpy: 'CAD_JPY', chfjpy: 'CHF_JPY', nzdjpy: 'NZD_JPY',
  gold: 'XAU_USD',
};   // 25 of the registry's 26 FX pairs (no local NZD/CAD file) + gold

log('loading local M1 → daily for 25 FX pairs + gold (a few minutes)…');
const bars = {};
for (const [key, sym] of Object.entries(PAIR_FILES)) {
  const t0 = Date.now();
  bars[sym] = await dailyFromM1(key);
  log(`  ${sym} ${bars[sym].length} daily bars ${bars[sym][0]?.date} → ${bars[sym].at(-1)?.date} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

function isoWeek(d) { const t = new Date(d + 'T00:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(); const jan4 = new Date(Date.UTC(y, 0, 4)); return `${y}-${Math.round(((t - jan4) / 864e5 + ((jan4.getUTCDay() + 6) % 7)) / 7) + 1}`; }
function table(sym) {
  const b = bars[sym];
  const rows = b.map((x, i) => ({ i, date: x.date, week: isoWeek(x.date), h: x.high, l: x.low, c: x.close }));
  const tr = (r, p) => Math.max(r.h - r.l, Math.abs(r.h - p.c), Math.abs(r.l - p.c));
  for (let i = 1; i < rows.length; i++) rows[i].tr = tr(rows[i], rows[i - 1]);
  for (let i = 14; i < rows.length; i++) rows[i].atr = rows.slice(i - 13, i + 1).reduce((s, r) => s + r.tr, 0) / 14;
  for (let i = 264; i < rows.length; i++) {
    const r = rows[i]; if (!r.atr) continue;
    const win = rows.slice(i - 250, i).map(x => x.atr / x.c).filter(Number.isFinite);
    r.atrRank = win.filter(v => v < r.atr / r.c).length / win.length;
    r.atrQ = Math.min(4, Math.floor(r.atrRank * 5));
    r.trend20 = Math.log(r.c / rows[i - 20].c);
    r.ret1 = Math.log(r.c / rows[i - 1].c);
    const f5 = rows.slice(i + 1, i + 6), f20 = rows.slice(i + 1, i + 21);
    if (f5.length === 5) { r.r5 = (Math.max(...f5.map(x => x.h)) - Math.min(...f5.map(x => x.l))) / r.atr; r.retF5 = Math.log(f5.at(-1).c / r.c); }
    if (f20.length === 20) { r.r20 = (Math.max(...f20.map(x => x.h)) - Math.min(...f20.map(x => x.l))) / r.atr; r.retF20 = Math.log(f20.at(-1).c / r.c); }
    r.day0 = (r.h - r.l) / (rows[i - 1].atr ?? r.atr);
    r.ok = true;
  }
  const pop = rows.filter(r => r.ok);
  const v = pop.map(r => r.trend20).sort((a, b) => a - b), t1 = v[Math.floor(v.length / 3)], t2 = v[Math.floor(2 * v.length / 3)];
  for (const r of pop) r.trendT = r.trend20 < t1 ? 0 : r.trend20 < t2 ? 1 : 2;
  return { rows, pop, byDate: new Map(rows.map(r => [r.date, r])) };
}
const T = {}; for (const sym of Object.values(PAIR_FILES)) T[sym] = table(sym);

// ── the paired test (identical discipline to analysis/market_sense_studies.mjs) ──
function paired(sym, setupDays, outcome, { excludeFn = null, seed = SEED, floor = PASS_ATR, label = '' } = {}) {
  const pop = T[sym].pop.filter(r => r[outcome] != null);
  const setupIdx = new Set(setupDays.map(r => r.i));
  const pool = pop.filter(r => !setupIdx.has(r.i) && !(excludeFn && excludeFn(r)));
  const cell = new Map(); for (const r of pool) { const k = `${r.atrQ}|${r.trendT}`; (cell.get(k) ?? cell.set(k, []).get(k)).push(r); }
  const rnd = mulberry32(seed);
  const pairs = []; let noCtl = 0;
  for (const d of setupDays) {
    if (d[outcome] == null) continue;
    const cands = (cell.get(`${d.atrQ}|${d.trendT}`) ?? []).filter(c => c.week !== d.week);
    if (!cands.length) { noCtl++; continue; }
    const c = cands[Math.floor(rnd() * cands.length)];
    pairs.push({ week: d.week, d: d[outcome] - c[outcome], s: d[outcome], c: c[outcome] });
  }
  const res = { label, sym, outcome, n: setupDays.length, paired: pairs.length, noCtl, scored: pairs.length >= MIN_N };
  if (!res.scored) return res;
  const weeks = [...new Set(pairs.map(p => p.week))], byW = new Map(); for (const p of pairs) (byW.get(p.week) ?? byW.set(p.week, []).get(p.week)).push(p.d);
  const means = [];
  for (let k = 0; k < REPS; k++) { let s = 0, n = 0; for (let j = 0; j < weeks.length; j++) for (const v of byW.get(weeks[Math.floor(rnd() * weeks.length)])) { s += v; n++; } means.push(s / n); }
  means.sort((a, b) => a - b);
  Object.assign(res, { diff: pairs.reduce((s, p) => s + p.d, 0) / pairs.length, lo: means[Math.floor(REPS * 0.025)], hi: means[Math.floor(REPS * 0.975)],
    setupMean: pairs.reduce((s, p) => s + p.s, 0) / pairs.length, ctlMean: pairs.reduce((s, p) => s + p.c, 0) / pairs.length });
  res.pass = res.diff >= floor && res.lo > 0;
  res.calmer = res.hi < 0;
  return res;
}
const line = r => !r.scored ? `    ${r.label || r.sym} ${r.outcome}: n=${r.n} (${r.paired} paired) — below MIN_N, not scored`
  : `    ${r.label || r.sym} ${r.outcome}: n=${r.n} (${r.paired} paired)  setup ${r.setupMean.toFixed(3)} vs control ${r.ctlMean.toFixed(3)}  diff ${fmt(r.diff)} [${fmt(r.lo)}, ${fmt(r.hi)}]  ${r.pass ? 'PASS' : r.calmer ? 'calmer' : 'null'}`;
function bootShareArr(bools, seed) { const rnd = mulberry32(seed); const n = bools.length; const ps = []; for (let k = 0; k < REPS; k++) { let c = 0; for (let j = 0; j < n; j++) if (bools[Math.floor(rnd() * n)]) c++; ps.push(c / n); } ps.sort((a, b) => a - b); return { p: bools.filter(Boolean).length / n, lo: ps[Math.floor(REPS * 0.025)], hi: ps[Math.floor(REPS * 0.975)] }; }

// symmetric-matrix eigen-decomposition (cyclic Jacobi) — n ≤ 26, a few sweeps converge
function corrMatrix(syms, dates, retMap) {
  const X = syms.map(s => dates.map(d => retMap[s].get(d)));
  const n = syms.length, C = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let a = 0; a < n; a++) for (let b = a; b < n; b++) {
    const xa = X[a], xb = X[b], ma = xa.reduce((s, v) => s + v, 0) / xa.length, mb = xb.reduce((s, v) => s + v, 0) / xb.length;
    let sab = 0, saa = 0, sbb = 0; for (let k = 0; k < xa.length; k++) { sab += (xa[k] - ma) * (xb[k] - mb); saa += (xa[k] - ma) ** 2; sbb += (xb[k] - mb) ** 2; }
    const c = saa && sbb ? sab / Math.sqrt(saa * sbb) : 0; C[a][b] = c; C[b][a] = c;
  }
  return C;
}
function nEffFromCorr(C) {
  const n = C.length; let A = C.map(row => row.slice());
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-14) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      const app = A[p][p], aqq = A[q][q], apq = A[p][q];
      A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq; A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq; A[p][q] = 0; A[q][p] = 0;
      for (let i = 0; i < n; i++) { if (i === p || i === q) continue; const aip = A[i][p], aiq = A[i][q]; A[i][p] = c * aip - s * aiq; A[p][i] = A[i][p]; A[i][q] = s * aip + c * aiq; A[q][i] = A[i][q]; }
    }
  }
  const eig = []; for (let i = 0; i < n; i++) eig.push(A[i][i]);
  eig.sort((a, b) => b - a);
  const sum = eig.reduce((s, v) => s + v, 0), sumSq = eig.reduce((s, v) => s + v * v, 0);
  return { eig, nEff: sumSq ? (sum * sum) / sumSq : n };
}

const ALL_SYMS = Object.values(PAIR_FILES);

// ═══ S13(a) breadth: N_eff of the raw-instrument daily returns (local subset) ═
if (want('S13')) {
  log('\n═══ S13(a)  N_eff of daily-return correlation, 25 FX + gold (local subset — no NZD/CAD) ═══');
  const retBySym = {}; const dateSet = new Set();
  for (const sym of ALL_SYMS) { const m = new Map(); for (const r of T[sym].pop) if (Number.isFinite(r.ret1)) { m.set(r.date, r.ret1); dateSet.add(r.date); } retBySym[sym] = m; }
  const commonDates = [...dateSet].filter(d => ALL_SYMS.every(sym => retBySym[sym].has(d))).sort();
  log(`  common trading dates: ${commonDates.length}`);
  const out = {};
  if (commonDates.length >= 500) {
    const { eig, nEff } = nEffFromCorr(corrMatrix(ALL_SYMS, commonDates, retBySym));
    log(`  N_eff = ${nEff.toFixed(2)} of ${ALL_SYMS.length} (top 6 eigenvalues: ${eig.slice(0, 6).map(x => x.toFixed(2)).join(', ')})`);
    out.rawNEff = { symbols: ALL_SYMS.length, days: commonDates.length, nEff, topEig: eig.slice(0, 8) };
    const majors = ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY'];
    const { nEff: neM } = nEffFromCorr(corrMatrix(majors, commonDates, retBySym));
    log(`  majors-only (7 USD pairs): N_eff = ${neM.toFixed(2)} of 7`);
    out.majorsNEff = { symbols: majors.length, nEff: neM };
    const crosses = ALL_SYMS.filter(s => !majors.includes(s) && s !== 'XAU_USD');
    const { nEff: neC } = nEffFromCorr(corrMatrix(crosses, commonDates, retBySym));
    log(`  crosses-only (${crosses.length} pairs): N_eff = ${neC.toFixed(2)} of ${crosses.length}`);
    out.crossesNEff = { symbols: crosses.length, nEff: neC };
  } else log(`  only ${commonDates.length} common dates — N_eff not computed`);
  out.notRun = { part: 'S13(b) yield-spread sleeve', reason: 'needs FRED' };
  results.studies.S13 = out;
}

// ═══ S14 regime breaks: FX majors + crosses + gold only (no local rates/credit) ═
if (want('S14')) {
  log('\n═══ S14  first close outside the trailing 3-year range (≥60 sessions since the last one) — FX + gold only ═══');
  function regimeBreaks(rows, window = 756, cooldown = 60) {
    const out = []; let lastBreak = -1e9;
    for (let i = window; i < rows.length; i++) {
      const r = rows[i]; if (r.c == null) continue;
      let hi = -Infinity, lo = Infinity, cnt = 0;
      for (let j = i - window; j < i; j++) { const v = rows[j].c; if (v != null) { if (v > hi) hi = v; if (v < lo) lo = v; cnt++; } }
      if (cnt < window * 0.9) continue;
      if (r.c > hi || r.c < lo) { if (i - lastBreak >= cooldown) out.push(r); lastBreak = i; }
    }
    return out;
  }
  const FAMILIES = {
    'FX majors': ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY'],
    'FX crosses': ALL_SYMS.filter(s => !['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY', 'XAU_USD'].includes(s)),
    'metals (gold only — no local SPX500/NAS100)': ['XAU_USD'],
  };
  const out = { families: {} };
  let familiesClearing = 0, familiesAttempted = 0;
  for (const [fam, syms] of Object.entries(FAMILIES)) {
    log(`  — ${fam} —`);
    let famClears = false; const famTests = [];
    for (const sym of syms) {
      const t = T[sym]; if (!t) { log(`    ${sym}: no table, skipped`); continue; }
      const breaks = regimeBreaks(t.rows);
      if (breaks.length < 5) { log(`    ${sym}: ${breaks.length} qualifying breaks — too few even to test`); continue; }
      for (const tst of [paired(sym, breaks, 'r5', { label: `${sym} break` }), paired(sym, breaks, 'r20', { label: `${sym} break` })]) {
        log(line(tst)); famTests.push(tst);
        if (tst.scored && tst.pass) famClears = true;
      }
    }
    familiesAttempted++;
    if (famClears) familiesClearing++;
    out.families[fam] = { tests: famTests, clears: famClears };
    log(`    ${fam}: ${famClears ? 'CLEARS the bar (≥30 episodes, +0.30 ATR, CI clear of zero, on at least one member)' : 'does not clear'}`);
  }
  log(`  rates/credit: NOT RUN (needs FRED) — the registered ≥3-of-4-families bar is not evaluable here; reporting against the ${familiesAttempted} families actually tested`);
  out.familiesAttempted = familiesAttempted; out.familiesClearing = familiesClearing;
  out.note = `registered rule needs ≥3 of 4 families; only ${familiesAttempted} of 4 could be attempted locally (rates/credit needs FRED)`;
  log(`  ${familiesClearing} of ${familiesAttempted} attempted families clear.`);
  results.studies.S14 = out;
}

// ═══ S15(b) the non-reaction, generalized: every family × pair from calendar_events.csv ═
if (want('S15')) {
  log('\n═══ S15(b)  the non-reaction (generalized leg): top-decile surprise, bottom-tercile move ═══');
  log('  S15(a) oil leg: NOT RUN — no local WTI bars.');
  const csvPath = path.join(__dirname, '..', 'calendar_events.csv');
  const csvLines = fs.readFileSync(csvPath, 'utf8').split('\n');
  const header = csvLines[0].split(','); const cidx = Object.fromEntries(header.map((h, k) => [h.trim(), k]));
  const FAMILY = [['cpi', /\bcpi\b|consumer price|inflation rate/i], ['employment', /non-farm|nonfarm|payroll|unemployment|jobless|claims|employment change/i], ['gdp', /\bgdp\b/i], ['rate decision', /rate decision|cash rate|official bank rate|federal funds|interest rate|policy rate|refinancing/i], ['pmi', /\bpmi\b|ism /i]];
  const COUNTRY2CODE = { 'United States': 'US', 'Euro Area': 'EU', 'United Kingdom': 'GB', Japan: 'JP', Australia: 'AU', Canada: 'CA' };
  const CODE = { US: 'USD', GB: 'GBP', EU: 'EUR', JP: 'JPY', AU: 'AUD', CA: 'CAD' };
  const PAIR2 = { US: ['EUR_USD', 'USD_JPY'], GB: ['GBP_USD'], EU: ['EUR_USD'], JP: ['USD_JPY'], AU: ['AUD_USD'], CA: ['USD_CAD'] };
  const byKey = new Map();
  for (let k = 1; k < csvLines.length; k++) {
    const line = csvLines[k]; if (!line) continue;
    const cells = line.split(',');
    const country = cells[cidx.country], event = cells[cidx.event];
    const code = COUNTRY2CODE[country]; if (!code) continue;
    const fam = FAMILY.find(([, re]) => re.test(event))?.[0]; if (!fam) continue;
    const date = cells[cidx.date], actual = parseFloat(cells[cidx.actual]), consensus = parseFloat(cells[cidx.consensus]);
    if (!date || !Number.isFinite(actual) || !Number.isFinite(consensus)) continue;
    const key = `${code}|${event}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)).push({ date, surprise: actual - consensus, fam, code });
  }
  const rel2 = [];
  let seriesUsed = 0;
  for (const [key, list] of byKey) {
    if (list.length < 20) continue;
    const surp = list.map(x => x.surprise), m = surp.reduce((a, b) => a + b, 0) / surp.length;
    const sd = Math.sqrt(surp.reduce((s, v) => s + (v - m) ** 2, 0) / surp.length);
    if (!sd) continue;
    seriesUsed++;
    for (const x of list) {
      const z = (x.surprise - m) / sd;
      for (const sym of (PAIR2[x.code] ?? [])) {
        const [base, quote] = sym.split('_'); const dir = CODE[x.code] === base ? 1 : CODE[x.code] === quote ? -1 : 0;
        if (!dir) continue; rel2.push({ ccy: x.code, sym, date: x.date, z, dir, fam: x.fam });
      }
    }
  }
  log(`  ${seriesUsed} (country,event) series with ≥20 prints, own-series z-scores; ${rel2.length} usable release-pair rows`);
  const bySym = new Map(); for (const r of rel2) (bySym.get(r.sym) ?? bySym.set(r.sym, []).get(r.sym)).push(r);
  const genOut = []; let genPass = 0, genScored = 0;
  for (const [sym, list] of bySym) {
    const t = T[sym]; if (!t) continue;
    const rows = list.map(r => ({ ...r, row: t.byDate.get(r.date) })).filter(r => r.row?.ok);
    if (rows.length < 60) { log(`    ${sym}: only ${rows.length} matched — skipped`); continue; }
    const zs = rows.map(r => Math.abs(r.z)).sort((a, b) => a - b), zThr = zs[Math.floor(zs.length * 0.9)];
    const day0s = rows.map(r => r.row.day0).filter(Number.isFinite).sort((a, b) => a - b), reactT1 = day0s[Math.floor(day0s.length / 3)];
    const topS = rows.filter(r => Math.abs(r.z) >= zThr);
    const setup2 = topS.filter(r => r.row.day0 != null && r.row.day0 <= reactT1);
    const dirRows2 = setup2.filter(r => Number.isFinite(r.row.retF5) && Number.isFinite(r.row.retF20));
    if (dirRows2.length < 20) { log(`    ${sym}: only ${dirRows2.length} non-reaction episodes — not scored`); continue; }
    const s5 = bootShareArr(dirRows2.map(r => Math.sign(r.row.retF5) === Math.sign(r.dir)), SEED + 60);
    const s20 = bootShareArr(dirRows2.map(r => Math.sign(r.row.retF20) === Math.sign(r.dir)), SEED + 61);
    const scored2 = dirRows2.length >= 40; if (scored2) { genScored++; if (s5.lo > 0.5 || s5.hi < 0.5) genPass++; }
    log(`    ${sym}: n=${dirRows2.length} non-reaction episodes (of ${topS.length} top-decile, ${rows.length} total)${scored2 ? '' : ' — below 40, not scored'}. Implied-direction share next-5d ${(s5.p * 100).toFixed(0)}% [${(s5.lo * 100).toFixed(0)},${(s5.hi * 100).toFixed(0)}], next-20d ${(s20.p * 100).toFixed(0)}% [${(s20.lo * 100).toFixed(0)},${(s20.hi * 100).toFixed(0)}]`);
    genOut.push({ sym, n: dirRows2.length, nTopSurprise: topS.length, share5: s5, share20: s20, scored: scored2 });
  }
  log(`  VERDICT: ${genScored} symbol(s) scored, ${genPass} of those with CI excluding 50%`);
  results.studies.S15 = { seriesUsed, totalRows: rel2.length, bySym: genOut, scored: genScored, pass: genPass, note: 'generalized leg only — S15(a) oil leg not run, no local WTI bars' };
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { studies: {} };
fs.writeFileSync(OUT, JSON.stringify({ ...prev, ranAt: results.ranAt, mode: results.mode, notRun: results.notRun, studies: { ...prev.studies, ...results.studies } }, null, 1));
log('\nwrote ' + path.relative(process.cwd(), OUT));
