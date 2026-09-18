// Eight market-sense tests, one harness. Pre-registered in
// MD files/MARKET_SENSE_TESTS.md (commit 1da0940) before the first run.
//
//   node analysis/market_sense_studies.mjs [S1,S3,...]     (needs OANDA_KEY)
//
// Every study: setup days → one paired control each (same instrument, different
// ISO week, same ATR-percentile quintile, same 20-day trend tercile, not in the
// setup) → paired mean difference with an ISO-week block bootstrap. Outcomes are
// ranges in ATR14 measured at the setup day. Population audits printed per study.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1 } from '../js/volBacktestEngine.js';
import { allMeetings } from '../js/fomcHistory.js';
import { YIELD_SPREAD_DEFAULTS } from '../js/yieldSpreadCore.js';
// ZSCORE_PAIRS + buildRollingZSeries inlined from js/zscoreSpreadEngine.js (pure;
// copied rather than imported so this harness does not pull in that module's M1/
// hyparquet loader, which this offline script has no use for).
const ZSCORE_PAIRS = {
  usdjpy: { label: 'USDJPY', pairDisplay: 'USD/JPY', baseSeries: 'GS2', quoteSeries: 'IRSTCI01JPM156N', pip: 0.01, defaultThreshold: 2.0 },
  eurusd: { label: 'EURUSD', pairDisplay: 'EUR/USD', baseSeries: 'GS2', quoteSeries: 'IRSTCI01DEM156N', pip: 0.0001, defaultThreshold: 2.5 },
  gbpusd: { label: 'GBPUSD', pairDisplay: 'GBP/USD', baseSeries: 'GS2', quoteSeries: 'IR3TIB01GBM156N', pip: 0.0001, defaultThreshold: 2.5 },
  audusd: { label: 'AUDUSD', pairDisplay: 'AUD/USD', baseSeries: 'GS2', quoteSeries: 'IR3TIB01AUM156N', pip: 0.0001, defaultThreshold: 2.5 },
  usdcad: { label: 'USDCAD', pairDisplay: 'USD/CAD', baseSeries: 'GS2', quoteSeries: 'IRSTCI01CAM156N', pip: 0.0001, defaultThreshold: 2.0 },
  usdchf: { label: 'USDCHF', pairDisplay: 'USD/CHF', baseSeries: 'GS2', quoteSeries: 'IR3TIB01CHM156N', pip: 0.0001, defaultThreshold: 2.0 },
};
function _shiftDate(dateStr, deltaDays) { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + deltaDays); return d.toISOString().substring(0, 10); }
function _dateRangeDays(fromStr, toStr) { const out = []; let d = new Date(fromStr + 'T00:00:00Z'); const end = new Date(toStr + 'T00:00:00Z'); while (d <= end) { out.push(d.toISOString().substring(0, 10)); d = new Date(d.getTime() + 86_400_000); } return out; }
function buildRollingZSeries(usObs, otherObs, zWindow, dateFrom, dateTo) {
  const fredFrom = _shiftDate(dateFrom, -(zWindow + 14)); const days = _dateRangeDays(fredFrom, dateTo);
  let lastUs = null, lastOther = null; const spread = new Array(days.length);
  for (let i = 0; i < days.length; i++) { const d = days[i]; if (usObs.has(d)) lastUs = usObs.get(d); if (otherObs.has(d)) lastOther = otherObs.get(d); spread[i] = (lastUs != null && lastOther != null) ? lastUs - lastOther : null; }
  const zByDate = new Map(); const win = []; let sum = 0, sumSq = 0; const warmup = Math.min(zWindow, 30);
  for (let i = 0; i < days.length; i++) {
    const v = spread[i];
    if (v != null) { win.push(v); sum += v; sumSq += v * v; if (win.length > zWindow) { const old = win.shift(); sum -= old; sumSq -= old * old; } }
    if (v != null && win.length >= warmup) { const n = win.length, mean = sum / n, variance = Math.max(0, sumSq / n - mean * mean), std = Math.sqrt(variance); if (std > 1e-9) zByDate.set(days[i], { z: (v - mean) / std, spread: v }); }
  }
  return zByDate;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(OUT_DIR(), 'market_sense_studies.json');
function OUT_DIR() { const d = path.join(__dirname, 'output'); fs.mkdirSync(d, { recursive: true }); return d; }
const REPS = 1000, MIN_N = 40, SEED = 20260917;
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const PASS_ATR = 0.10;
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = (x, dp = 3) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const results = { ranAt: new Date().toISOString(), studies: {} };
const log = (...a) => console.log(...a);

// ── data ────────────────────────────────────────────────────────────────────
async function fred(id) {
  const csv = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`).then(r => { if (!r.ok) throw new Error(`${id} HTTP ${r.status}`); return r.text(); });
  const out = new Map();
  for (const line of csv.split('\n').slice(1)) { const [d, v] = line.trim().split(','); const x = parseFloat(v); if (d && Number.isFinite(x)) out.set(d, x); }
  return out;
}
function isoWeek(d) { const t = new Date(d + 'T00:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(); const jan4 = new Date(Date.UTC(y, 0, 4)); return `${y}-${Math.round(((t - jan4) / 864e5 + ((jan4.getUTCDay() + 6) % 7)) / 7) + 1}`; }
const INSTR = ['NAS100_USD', 'SPX500_USD', 'US2000_USD', 'XAU_USD', 'EUR_USD', 'USD_JPY', 'GBP_USD', 'AUD_USD', 'USD_CAD'];
const FRED_IDS = { vix: 'VIXCLS', vix3m: 'VXVCLS', us2y: 'DGS2', us10y: 'DGS10', real: 'DFII10', bei: 'T10YIE', wti: 'DCOILWTICO', dxy: 'DTWEXBGS' };
log('fetching…');
const bars = {};
for (const s of INSTR) { bars[s] = (await fetchD1(s, 5000)).sort((a, b) => a.date < b.date ? -1 : 1); log(`  ${s} ${bars[s].length} bars ${bars[s][0].date} → ${bars[s].at(-1).date}`); }
const F = {};
for (const [k, id] of Object.entries(FRED_IDS)) { F[k] = await fred(id); log(`  ${id} ${F[k].size}`); }

// Per-instrument daily table with ATR14, ATR-rank quintile, trend tercile, week,
// forward ranges, and every FRED series carried forward across missing sessions.
function table(sym) {
  const b = bars[sym];
  const rows = b.map((x, i) => ({ i, date: x.date, o: x.open, h: x.high, l: x.low, c: x.close, week: isoWeek(x.date) }));
  const tr = (r, p) => Math.max(r.h - r.l, Math.abs(r.h - p.c), Math.abs(r.l - p.c));
  for (let i = 1; i < rows.length; i++) rows[i].tr = tr(rows[i], rows[i - 1]);
  for (let i = 14; i < rows.length; i++) rows[i].atr = rows.slice(i - 13, i + 1).reduce((s, r) => s + r.tr, 0) / 14;
  for (const k of Object.keys(F)) { let last = null; for (const r of rows) { const v = F[k].get(r.date); if (v != null) last = v; r[k] = last; } }
  for (let i = 264; i < rows.length; i++) {
    const r = rows[i]; if (!r.atr) continue;
    const win = rows.slice(i - 250, i).map(x => x.atr / x.c).filter(Number.isFinite);
    r.atrRank = win.filter(v => v < r.atr / r.c).length / win.length;
    r.atrQ = Math.min(4, Math.floor(r.atrRank * 5));
    r.trend20 = Math.log(r.c / rows[i - 20].c);
    r.ret1 = Math.log(r.c / rows[i - 1].c);
    const f5 = rows.slice(i + 1, i + 6), f20 = rows.slice(i + 1, i + 21);
    if (f5.length === 5) r.r5 = (Math.max(...f5.map(x => x.h)) - Math.min(...f5.map(x => x.l))) / r.atr;
    if (f20.length === 20) r.r20 = (Math.max(...f20.map(x => x.h)) - Math.min(...f20.map(x => x.l))) / r.atr;
    if (rows[i + 1]) r.r1 = (rows[i + 1].h - rows[i + 1].l) / r.atr;
    r.day0 = (r.h - r.l) / (rows[i - 1].atr ?? r.atr);   // the setup day's own range, on the prior ATR
    r.ok = true;
  }
  const pop = rows.filter(r => r.ok);
  const v = pop.map(r => r.trend20).sort((a, b) => a - b), t1 = v[Math.floor(v.length / 3)], t2 = v[Math.floor(2 * v.length / 3)];
  for (const r of pop) r.trendT = r.trend20 < t1 ? 0 : r.trend20 < t2 ? 1 : 2;
  return { rows, pop, byDate: new Map(rows.map(r => [r.date, r])) };
}
const T = {}; for (const s of INSTR) T[s] = table(s);

// ── the paired test ─────────────────────────────────────────────────────────
// setupDays: rows of T[sym].pop; outcome: key on the row; excludeFn: rows that may
// not serve as controls (the setup itself, by default). Returns {n, paired, diff, lo, hi, setupMean, ctlMean, pass, calmer}.
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
// bootstrap over an arbitrary set of paired differences (used by S6)
function bootMean(vals, groups, seed = SEED) {
  const rnd = mulberry32(seed); const keys = [...new Set(groups)]; const byG = new Map(); vals.forEach((v, i) => (byG.get(groups[i]) ?? byG.set(groups[i], []).get(groups[i])).push(v));
  const means = []; for (let k = 0; k < REPS; k++) { let s = 0, n = 0; for (let j = 0; j < keys.length; j++) for (const v of byG.get(keys[Math.floor(rnd() * keys.length)])) { s += v; n++; } means.push(s / n); }
  means.sort((a, b) => a - b); return { mean: vals.reduce((s, v) => s + v, 0) / vals.length, lo: means[Math.floor(REPS * 0.025)], hi: means[Math.floor(REPS * 0.975)] };
}
const want = id => !ONLY || ONLY.has(id);
const sinceR1 = r => r.date >= '2018-01-01';
// Episodes from a boolean series on one instrument's rows: [{start, len}]
function episodes(rows, flagFn) { const out = []; let cur = null; for (const r of rows) { const f = !!flagFn(r); if (f && !cur) cur = { start: r, len: 0 }; if (f) cur.len++; if (!f && cur) { out.push(cur); cur = null; } } if (cur) out.push(cur); return out; }
const median = a => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const pct = (a, p) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : null; };

// ═══ S1 VIX term structure ═══════════════════════════════════════════════════
if (want('S1')) {
  log('\n═══ S1  VIX term structure inverts → the week gets wide ═══');
  const ref = T.SPX500_USD.rows;
  const inv = r => r.vix != null && r.vix3m != null && r.vix >= r.vix3m;
  const entry = [], exit = [];
  for (let i = 3; i < ref.length; i++) { if (inv(ref[i]) && !inv(ref[i - 1]) && !inv(ref[i - 2]) && !inv(ref[i - 3])) entry.push(ref[i].date); if (!inv(ref[i]) && inv(ref[i - 1]) && inv(ref[i - 2]) && inv(ref[i - 3])) exit.push(ref[i].date); }
  const eps = episodes(ref.filter(r => r.vix3m != null), inv);
  log(`  inversion episodes ${eps.length}: median ${median(eps.map(e => e.len))} sessions, p75 ${pct(eps.map(e => e.len), 0.75)}; entries ${entry.length}, exits ${exit.length}`);
  const out = { entries: entry.length, exits: exit.length, episodes: eps.length, medianLen: median(eps.map(e => e.len)), p75Len: pct(eps.map(e => e.len), 0.75), tests: [] };
  for (const sym of ['SPX500_USD', 'NAS100_USD', 'USD_JPY', 'XAU_USD']) {
    const days = entry.map(d => T[sym].byDate.get(d)).filter(r => r?.ok);
    const ex = exit.map(d => T[sym].byDate.get(d)).filter(r => r?.ok);
    const excl = r => inv(T.SPX500_USD.byDate.get(r.date) ?? {});
    for (const t of [paired(sym, days, 'r5', { excludeFn: excl, label: `${sym} entry` }), paired(sym, days, 'r20', { excludeFn: excl, label: `${sym} entry` }), paired(sym, days.filter(sinceR1), 'r5', { excludeFn: excl, label: `${sym} entry R1` }), paired(sym, ex, 'r5', { excludeFn: excl, label: `${sym} exit` })]) { log(line(t)); out.tests.push(t); }
  }
  results.studies.S1 = out;
}

// ═══ S2 stock-bond correlation flip ══════════════════════════════════════════
if (want('S2')) {
  log('\n═══ S2  stocks and bonds falling together (corr(SPX ret, Δ10Y) < −0.20) ═══');
  const rows = T.SPX500_USD.rows;
  for (let i = 1; i < rows.length; i++) rows[i].dy = rows[i].us10y != null && rows[i - 1].us10y != null ? rows[i].us10y - rows[i - 1].us10y : null;
  for (let i = 21; i < rows.length; i++) {
    const w = rows.slice(i - 19, i + 1).filter(r => r.ret1 != null && r.dy != null); if (w.length < 15) continue;
    const mx = w.reduce((s, r) => s + r.ret1, 0) / w.length, my = w.reduce((s, r) => s + r.dy, 0) / w.length;
    let sxy = 0, sxx = 0, syy = 0; for (const r of w) { sxy += (r.ret1 - mx) * (r.dy - my); sxx += (r.ret1 - mx) ** 2; syy += (r.dy - my) ** 2; }
    rows[i].sbCorr = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const neg = r => r.sbCorr != null && r.sbCorr < -0.20;
  const flips = [];
  for (let i = 10; i < rows.length; i++) if (neg(rows[i]) && rows.slice(i - 10, i).every(r => r.sbCorr != null && !neg(r))) flips.push(rows[i].date);
  const eps = episodes(rows.filter(r => r.sbCorr != null), neg);
  log(`  negative-correlation episodes ${eps.length}: median ${median(eps.map(e => e.len))} sessions, p75 ${pct(eps.map(e => e.len), 0.75)}; flips ${flips.length}; share of days negative ${(rows.filter(neg).length / rows.filter(r => r.sbCorr != null).length * 100).toFixed(0)}%`);
  const out = { flips: flips.length, episodes: eps.length, medianLen: median(eps.map(e => e.len)), p75Len: pct(eps.map(e => e.len), 0.75), tests: [] };
  const excl = r => neg(rows[r.i] ?? {}) ;
  for (const sym of ['XAU_USD', 'EUR_USD', 'USD_JPY', 'SPX500_USD']) {
    const days = flips.map(d => T[sym].byDate.get(d)).filter(r => r?.ok);
    const exclSym = r => { const s = T.SPX500_USD.byDate.get(r.date); return s && neg(s); };
    for (const t of [paired(sym, days, 'r20', { excludeFn: exclSym, label: sym }), paired(sym, days, 'r5', { excludeFn: exclSym, label: sym }), paired(sym, days.filter(sinceR1), 'r20', { excludeFn: exclSym, label: `${sym} R1` })]) { log(line(t)); out.tests.push(t); }
  }
  results.studies.S2 = out;
}

// ═══ S3 front-end shock → FX vol ═════════════════════════════════════════════
if (want('S3')) {
  log('\n═══ S3  front-end shock (|Δ2Y 5d| top decile) → FX 5-day range ═══');
  const ref = T.EUR_USD.rows;
  for (let i = 5; i < ref.length; i++) ref[i].d2y5 = ref[i].us2y != null && ref[i - 5].us2y != null ? (ref[i].us2y - ref[i - 5].us2y) * 100 : null;
  const abs = ref.filter(r => r.ok && r.d2y5 != null).map(r => Math.abs(r.d2y5)).sort((a, b) => a - b);
  const thr = abs[Math.floor(abs.length * 0.9)];
  log(`  top-decile threshold |Δ2Y 5d| ≥ ${thr.toFixed(0)}bp`);
  const out = { thresholdBp: thr, tests: [] };
  for (const sym of ['EUR_USD', 'USD_JPY', 'GBP_USD']) {
    const rows = T[sym].rows; for (let i = 5; i < rows.length; i++) rows[i].d2y5 = rows[i].us2y != null && rows[i - 5].us2y != null ? (rows[i].us2y - rows[i - 5].us2y) * 100 : null;
    const shock = r => r.d2y5 != null && Math.abs(r.d2y5) >= thr;
    // first day of a shock (not already shocked the day before), so setups are not five copies of one week
    const days = T[sym].pop.filter((r, k, arr) => shock(r) && !(rows[r.i - 1] && shock(rows[r.i - 1])));
    const up = days.filter(r => r.d2y5 > 0), dn = days.filter(r => r.d2y5 < 0);
    for (const t of [paired(sym, days, 'r5', { excludeFn: shock, label: `${sym} any` }), paired(sym, up, 'r5', { excludeFn: shock, label: `${sym} 2Y up` }), paired(sym, dn, 'r5', { excludeFn: shock, label: `${sym} 2Y down` }), paired(sym, days.filter(sinceR1), 'r5', { excludeFn: shock, label: `${sym} R1` })]) { log(line(t)); out.tests.push(t); }
  }
  results.studies.S3 = out;
}

// ═══ S4 oil → breakevens lag ═════════════════════════════════════════════════
if (want('S4')) {
  log('\n═══ S4  oil 20d move ≥10% → breakeven change over the next 5/10/20 sessions ═══');
  const rows = T.EUR_USD.rows;   // any daily calendar will do; the series are FRED
  for (let i = 20; i < rows.length; i++) { rows[i].oil20 = rows[i].wti && rows[i - 20].wti ? (rows[i].wti / rows[i - 20].wti - 1) * 100 : null; rows[i].bei20 = rows[i].bei != null && rows[i - 20].bei != null ? (rows[i].bei - rows[i - 20].bei) * 100 : null; }
  for (const h of [5, 10, 20]) for (let i = 0; i < rows.length - h; i++) rows[i][`beiF${h}`] = rows[i].bei != null && rows[i + h].bei != null ? (rows[i + h].bei - rows[i].bei) * 100 : null;
  const out = { tests: [], xcorr: [] };
  for (const [tag, f, sign] of [['oil up ≥10%', r => r.oil20 != null && r.oil20 >= 10, +1], ['oil down ≤−10%', r => r.oil20 != null && r.oil20 <= -10, -1]]) {
    const days = T.EUR_USD.pop.filter((r) => f(r) && !(rows[r.i - 1] && f(rows[r.i - 1])));   // first day of the condition
    for (const h of [5, 10, 20]) {
      const t = paired('EUR_USD', days, `beiF${h}`, { excludeFn: r => r.oil20 != null && Math.abs(r.oil20) >= 10, floor: 5, label: `${tag} → BEI next ${h}` });
      if (t.scored) t.pass = sign > 0 ? (t.diff >= 5 && t.lo > 0) : (t.diff <= -5 && t.hi < 0);
      log(line(t)); out.tests.push(t);
    }
    if (days.length) { const reached = days.filter(r => r.beiF20 != null && sign * r.beiF20 >= 5).length; log(`    share of ${tag} episodes where BEI moved ≥5bp the same way within 20 sessions: ${(reached / days.filter(r => r.beiF20 != null).length * 100).toFixed(0)}%  (n=${days.length})`); out[`reached_${sign > 0 ? 'up' : 'down'}`] = reached / Math.max(1, days.filter(r => r.beiF20 != null).length); }
  }
  // cross-correlation of 20d oil change with 20d breakeven change measured k sessions later
  const base = rows.filter(r => r.oil20 != null && r.bei20 != null);
  for (let k = 0; k <= 20; k += 5) {
    const xs = [], ys = []; for (let i = 0; i < rows.length - k; i++) if (rows[i].oil20 != null && rows[i + k].bei20 != null) { xs.push(rows[i].oil20); ys.push(rows[i + k].bei20); }
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const c = sxy / Math.sqrt(sxx * syy); out.xcorr.push({ lag: k, corr: c }); log(`    xcorr(oil20, bei20 lagged ${k}) = ${c.toFixed(2)}`);
  }
  results.studies.S4 = out;
}

// ═══ S5 which side of a broken link gives way ════════════════════════════════
if (want('S5')) {
  log('\n═══ S5  broken-link resolution over the next 20 sessions (base rates) ═══');
  const rows = T.XAU_USD.rows;
  for (let i = 20; i < rows.length; i++) { rows[i].real20 = rows[i].real != null && rows[i - 20].real != null ? (rows[i].real - rows[i - 20].real) * 100 : null; rows[i].dxy20 = rows[i].dxy && rows[i - 20].dxy ? (rows[i].dxy / rows[i - 20].dxy - 1) * 100 : null; rows[i].gold20 = Math.log(rows[i].c / rows[i - 20].c) * 100; }
  for (let i = 0; i < rows.length - 20; i++) { rows[i].realF = rows[i].real != null && rows[i + 20].real != null ? (rows[i + 20].real - rows[i].real) * 100 : null; rows[i].dxyF = rows[i].dxy && rows[i + 20].dxy ? (rows[i + 20].dxy / rows[i].dxy - 1) * 100 : null; rows[i].goldF = Math.log(rows[i + 20].c / rows[i].c) * 100; }
  const out = {};
  const desc = (tag, days, legs) => {
    log(`  ${tag}: n=${days.length} episodes (first day of the condition)`);
    const o = { n: days.length };
    for (const [name, key, up, dn, unit] of legs) {
      const v = days.map(r => r[key]).filter(Number.isFinite); if (!v.length) continue;
      const b = bootMean(v, days.filter(r => Number.isFinite(r[key])).map(r => r.week));
      const shareUp = v.filter(x => x >= up).length / v.length, shareDn = v.filter(x => x <= dn).length / v.length;
      const base = T.XAU_USD.pop.map(r => r[key]).filter(Number.isFinite); const baseMean = base.reduce((s, x) => s + x, 0) / base.length;
      log(`    ${name} next 20: mean ${fmt(b.mean, 1)}${unit} [${fmt(b.lo, 1)}, ${fmt(b.hi, 1)}] (unconditional ${fmt(baseMean, 1)}${unit}); ≥${up}${unit} in ${(shareUp * 100).toFixed(0)}%, ≤${dn}${unit} in ${(shareDn * 100).toFixed(0)}%`);
      o[name] = { mean: b.mean, lo: b.lo, hi: b.hi, base: baseMean, shareUp, shareDn };
    }
    return o;
  };
  const condA = r => r.real20 != null && r.real20 >= 15 && r.dxy20 != null && r.dxy20 <= -0.5;
  const daysA = T.XAU_USD.pop.filter(r => condA(r) && !(rows[r.i - 1] && condA(rows[r.i - 1])) && r.realF != null && r.dxyF != null);
  out.a = desc('(a) real +15bp & dollar −0.5% over 20d', daysA, [['dollar', 'dxyF', 0.5, -0.5, '%'], ['real yield', 'realF', 8, -8, 'bp']]);
  const condB = r => r.real20 != null && r.real20 >= 15 && r.gold20 >= 2;
  const daysB = T.XAU_USD.pop.filter(r => condB(r) && !(rows[r.i - 1] && condB(rows[r.i - 1])) && r.realF != null);
  out.b = desc('(b) real +15bp & gold +2% over 20d', daysB, [['gold', 'goldF', 2, -2, '%'], ['real yield', 'realF', 8, -8, 'bp']]);
  results.studies.S5 = out;
}

// ═══ S6 priced in: FOMC decision-day range vs prior 2Y repricing ═════════════
if (want('S6')) {
  log('\n═══ S6  "priced in": decision-day range vs |Δ2Y| over the prior 20 sessions ═══');
  const meetings = allMeetings().map(m => m.date).filter(d => d <= bars.EUR_USD.at(-1).date);
  const out = { meetings: meetings.length, tests: [] };
  for (const sym of ['EUR_USD', 'USD_JPY', 'XAU_USD', 'SPX500_USD']) {
    const rows = T[sym].rows, byDate = T[sym].byDate;
    const pts = [];
    for (const d of meetings) {
      const r = byDate.get(d); if (!r?.ok) continue;
      const prev = rows[r.i - 20]; if (!prev?.us2y || r.us2y == null) continue;
      pts.push({ date: d, pre: Math.abs(r.us2y - prev.us2y) * 100, day0: r.day0, r1: r.r1, week: d.slice(0, 7) });
    }
    if (pts.length < 30) { log(`    ${sym}: only ${pts.length} decision days with data — not scored`); continue; }
    const s = [...pts].sort((a, b) => a.pre - b.pre); const t1 = s[Math.floor(s.length / 3)].pre, t2 = s[Math.floor(2 * s.length / 3)].pre;
    const lo = pts.filter(p => p.pre < t1), hi = pts.filter(p => p.pre >= t2);
    const dLo = bootMean(lo.map(p => p.day0), lo.map(p => p.week), SEED), dHi = bootMean(hi.map(p => p.day0), hi.map(p => p.week), SEED + 1);
    // difference hi − lo with a bootstrap over meetings drawn independently in each tercile
    const rnd = mulberry32(SEED + 7); const diffs = []; for (let k = 0; k < REPS; k++) { const a = hi.map(() => hi[Math.floor(rnd() * hi.length)].day0), b = lo.map(() => lo[Math.floor(rnd() * lo.length)].day0); diffs.push(a.reduce((x, y) => x + y, 0) / a.length - b.reduce((x, y) => x + y, 0) / b.length); } diffs.sort((a, b) => a - b);
    const diff = dHi.mean - dLo.mean, dl = diffs[Math.floor(REPS * 0.025)], dh = diffs[Math.floor(REPS * 0.975)];
    const unc = T[sym].pop.map(r => r.day0).filter(Number.isFinite); const uncMean = unc.reduce((a, b) => a + b, 0) / unc.length;
    const verdict = diff <= -PASS_ATR && dh < 0 ? 'PASS (priced-in: moves LESS)' : diff >= PASS_ATR && dl > 0 ? 'OPPOSITE (more repricing → BIGGER decision day)' : 'null';
    log(`    ${sym}: ${pts.length} meetings; tercile cut-points |Δ2Y| ${t1.toFixed(0)}/${t2.toFixed(0)}bp; decision-day range: low-repricing ${dLo.mean.toFixed(2)} ATR vs high-repricing ${dHi.mean.toFixed(2)} ATR (unconditional day ${uncMean.toFixed(2)}); diff ${fmt(diff, 2)} [${fmt(dl, 2)}, ${fmt(dh, 2)}]  ${verdict}`);
    out.tests.push({ sym, n: pts.length, t1, t2, lo: dLo, hi: dHi, diff, dl, dh, uncMean, verdict });
  }
  results.studies.S6 = out;
}

// ═══ S7 surprise size → range, by release family ═════════════════════════════
if (want('S7')) {
  log('\n═══ S7  data surprise |z| → release-session range, by family ═══');
  const api = await fetch('https://macrofxmodel-production.up.railway.app/api/econ-surprise?history=1').then(r => r.json());
  const series = api?.series ?? {};
  const FAMILY = [['cpi', /\bcpi\b|consumer price|inflation rate/i], ['employment', /non-farm|nonfarm|payroll|unemployment|jobless|claims|employment change/i], ['gdp', /\bgdp\b/i], ['rate decision', /rate decision|cash rate|official bank rate|federal funds|interest rate|policy rate|refinancing/i], ['retail sales', /retail sales/i], ['pmi', /\bpmi\b|ism /i]];
  const PAIR = { US: ['EUR_USD', 'USD_JPY'], GB: ['GBP_USD'], EU: ['EUR_USD'], JP: ['USD_JPY'], AU: ['AUD_USD'], CA: ['USD_CAD'] };
  const sessionDate = ms => { const t = new Date(ms); if (t.getUTCHours() >= 21) t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  const rel = [];   // {family, ccy, sym, date, z}
  for (const [key, list] of Object.entries(series)) {
    const [ccy, name] = key.split('|'); const fam = FAMILY.find(([, re]) => re.test(name))?.[0]; if (!fam || !PAIR[ccy]) continue;
    for (const x of list) if (Number.isFinite(x.z) && x.ms) for (const sym of PAIR[ccy]) rel.push({ family: fam, ccy, sym, date: sessionDate(x.ms), z: Math.abs(x.z) });
  }
  log(`  usable releases ${rel.length} across ${new Set(rel.map(r => r.family)).size} families`);
  const out = { releases: rel.length, tests: [] };
  const relDates = new Map(); for (const r of rel) (relDates.get(r.sym) ?? relDates.set(r.sym, new Set()).get(r.sym)).add(r.date);
  for (const fam of FAMILY.map(f => f[0])) {
    const fr = rel.filter(r => r.family === fam);
    const zs = fr.map(r => r.z).sort((a, b) => a - b); const zt = zs[Math.floor(zs.length * 2 / 3)] ?? 0;
    for (const sym of ['EUR_USD', 'USD_JPY', 'GBP_USD', 'AUD_USD', 'USD_CAD']) {
      const mine = fr.filter(r => r.sym === sym); if (mine.length < MIN_N) continue;
      const days = [...new Map(mine.filter(r => r.z >= zt).map(r => [r.date, T[sym].byDate.get(r.date)])).values()].filter(r => r?.ok);
      const allDays = [...new Map(mine.map(r => [r.date, T[sym].byDate.get(r.date)])).values()].filter(r => r?.ok);
      const excl = r => relDates.get(sym)?.has(r.date);
      for (const t of [paired(sym, days, 'day0', { excludeFn: excl, label: `${fam} ${sym} top-|z| (≥${zt.toFixed(2)})` }), paired(sym, allDays, 'day0', { excludeFn: excl, label: `${fam} ${sym} all` }), paired(sym, days, 'r1', { excludeFn: excl, label: `${fam} ${sym} top-|z| next day` })]) { log(line(t)); out.tests.push(t); }
    }
  }
  results.studies.S7 = out;
}

// ═══ S8 rotation: NAS100 vs US2000 20d relative return extremes ══════════════
if (want('S8')) {
  log('\n═══ S8  rotation: |NAS100 − US2000| 20d relative return, top decile ═══');
  const n = T.NAS100_USD, r2 = T.US2000_USD;
  for (const r of n.pop) { const o = r2.byDate.get(r.date); const o20 = o ? r2.rows[o.i - 20] : null; r.rel20 = (o && o20 && r.trend20 != null) ? (r.trend20 - Math.log(o.c / o20.c)) * 100 : null; }
  const vals = n.pop.filter(r => r.rel20 != null).map(r => Math.abs(r.rel20)).sort((a, b) => a - b); const thr = vals[Math.floor(vals.length * 0.9)];
  const ext = r => r.rel20 != null && Math.abs(r.rel20) >= thr;
  const days = n.pop.filter(r => ext(r) && !(n.rows[r.i - 1] && ext(n.rows[r.i - 1])));
  log(`  top-decile threshold |rel20| ≥ ${thr.toFixed(1)}pp; extremes ${days.length}`);
  const out = { thresholdPp: thr, n: days.length, tests: [] };
  for (const t of [paired('NAS100_USD', days, 'r20', { excludeFn: ext, label: 'NAS100' }), paired('NAS100_USD', days, 'r5', { excludeFn: ext, label: 'NAS100' }), paired('NAS100_USD', days.filter(sinceR1), 'r20', { excludeFn: ext, label: 'NAS100 R1' })]) { log(line(t)); out.tests.push(t); }
  const sp = days.map(d => T.SPX500_USD.byDate.get(d.date)).filter(r => r?.ok);
  for (const t of [paired('SPX500_USD', sp, 'r20', { excludeFn: r => ext(n.byDate.get(r.date) ?? {}), label: 'SPX500' })]) { log(line(t)); out.tests.push(t); }
  // persistence: does the extreme extend or mean-revert over the next 20?
  const fwd = days.map(d => { const f = n.rows[d.i + 20]; const o = r2.byDate.get(d.date), of = o ? r2.rows[o.i + 20] : null; return (f && of) ? Math.sign(d.rel20) * ((Math.log(f.c / d.c) - Math.log(of.c / o.c)) * 100) : null; }).filter(Number.isFinite);
  if (fwd.length) { const b = bootMean(fwd, days.slice(0, fwd.length).map(d => d.week)); log(`    next-20 relative return in the direction of the extreme: mean ${fmt(b.mean, 1)}pp [${fmt(b.lo, 1)}, ${fmt(b.hi, 1)}]; extended in ${(fwd.filter(x => x > 0).length / fwd.length * 100).toFixed(0)}% (base rate, not a signal)`); out.persist = b; }
  results.studies.S8 = out;
}


// ═══ S9 two moves after the Fed ══════════════════════════════════════════════
// Pre-registered 2026-09-17 evening (commit 6b800f2), after S1–S8 had run.
if (want('S9')) {
  log('\n═══ S9  two moves after the Fed: day 0 vs the next 5 / 20 sessions ═══');
  const meetings = new Set(allMeetings().map(m => m.date));
  const rowsX = T.EUR_USD.rows;   // a daily calendar carrying the FRED series
  const spx = T.SPX500_USD;
  const dayRows = [];
  for (let i = 1; i < rowsX.length - 20; i++) {
    const r = rowsX[i], p = rowsX[i - 1];
    if (r.us2y == null || p.us2y == null || r.us10y == null || p.us10y == null || !r.dxy || !p.dxy) continue;
    const sp = spx.byDate.get(r.date); const spp = sp ? spx.rows[sp.i - 1] : null; const sp5 = sp ? spx.rows[sp.i + 5] : null, sp20 = sp ? spx.rows[sp.i + 20] : null;
    dayRows.push({
      date: r.date, week: r.week, i, fomc: meetings.has(r.date),
      d2y0: (r.us2y - p.us2y) * 100, d10y0: (r.us10y - p.us10y) * 100, dxy0: (r.dxy / p.dxy - 1) * 100, spx0: (sp && spp) ? Math.log(sp.c / spp.c) * 100 : null,
      d2y5: (rowsX[i + 5].us2y - r.us2y) * 100, d2y20: (rowsX[i + 20].us2y - r.us2y) * 100,
      d10y5: (rowsX[i + 5].us10y - r.us10y) * 100, d10y20: (rowsX[i + 20].us10y - r.us10y) * 100,
      curve5: ((rowsX[i + 5].us10y - rowsX[i + 5].us2y) - (r.us10y - r.us2y)) * 100, curve20: ((rowsX[i + 20].us10y - rowsX[i + 20].us2y) - (r.us10y - r.us2y)) * 100,
      dxy5: rowsX[i + 5].dxy ? (rowsX[i + 5].dxy / r.dxy - 1) * 100 : null, dxy20: rowsX[i + 20].dxy ? (rowsX[i + 20].dxy / r.dxy - 1) * 100 : null,
      spx5: (sp && sp5) ? Math.log(sp5.c / sp.c) * 100 : null, spx20: (sp && sp20) ? Math.log(sp20.c / sp.c) * 100 : null,
    });
  }
  const fomcDays = dayRows.filter(d => d.fomc && d.date >= '2016-01-01');
  const others = dayRows.filter(d => !d.fomc && d.date >= '2016-01-01');
  log(`  FOMC decision days with data ${fomcDays.length}; non-FOMC days ${others.length} (2016→)`);
  const rnd = mulberry32(SEED + 9);
  // matched control: a non-FOMC day whose |day-0 move| in the same instrument sits in the same quintile, different week
  const quint = (key) => { const v = others.map(o => Math.abs(o[key])).filter(Number.isFinite).sort((a, b) => a - b); return x => Math.min(4, Math.floor(v.filter(q => q < Math.abs(x)).length / v.length * 5)); };
  const match = (days, key) => { const q = quint(key); const pool = others.filter(o => Number.isFinite(o[key])); return days.map(d => { const qd = q(d[key]); const c = pool.filter(o => q(o[key]) === qd && o.week !== d.week); return c.length ? c[Math.floor(rnd() * c.length)] : null; }); };
  const share = (arr, fn) => { const v = arr.filter(x => x != null); return v.length ? v.filter(fn).length / v.length : null; };
  const bootShare = (arr, fn, seed) => { const v = arr.filter(x => x != null); if (!v.length) return { p: null, lo: null, hi: null, n: 0 }; const r2 = mulberry32(seed); const ps = []; for (let k = 0; k < REPS; k++) { let c = 0; for (let j = 0; j < v.length; j++) if (fn(v[Math.floor(r2() * v.length)])) c++; ps.push(c / v.length); } ps.sort((a, b) => a - b); return { p: share(v, fn), lo: ps[Math.floor(REPS * 0.025)], hi: ps[Math.floor(REPS * 0.975)], n: v.length }; };
  const bootDiffShare = (a, fa, b, fb, seed) => { const r2 = mulberry32(seed); const ds = []; const va = a.filter(x => x != null), vb = b.filter(x => x != null); for (let k = 0; k < REPS; k++) { let ca = 0, cb = 0; for (let j = 0; j < va.length; j++) if (fa(va[Math.floor(r2() * va.length)])) ca++; for (let j = 0; j < vb.length; j++) if (fb(vb[Math.floor(r2() * vb.length)])) cb++; ds.push(ca / va.length - cb / vb.length); } ds.sort((x, y) => x - y); return { diff: share(va, fa) - share(vb, fb), lo: ds[Math.floor(REPS * 0.025)], hi: ds[Math.floor(REPS * 0.975)] }; };
  const out = {};
  // (a) curve after a hawkish / dovish day 0
  const hawk = fomcDays.filter(d => d.d2y0 >= 5), dove = fomcDays.filter(d => d.d2y0 <= -5);
  log(`  hawkish day-0 (2Y ≥ +5bp): ${hawk.length} meetings; dovish (≤ −5bp): ${dove.length}`);
  for (const [tag, days] of [['hawkish', hawk], ['dovish', dove]]) {
    if (days.length < 15) { log(`    ${tag}: n=${days.length}, too thin`); continue; }
    const ctl = match(days, 'd2y0');
    for (const h of [5, 20]) {
      const pairsV = days.map((d, k) => ctl[k] ? d[`curve${h}`] - ctl[k][`curve${h}`] : null).filter(Number.isFinite);
      const b = bootMean(pairsV, days.slice(0, pairsV.length).map(d => d.week), SEED + h);
      const own = days.map(d => d[`curve${h}`]).reduce((s, v) => s + v, 0) / days.length;
      const c10 = days.map(d => d[`d10y${h}`]).reduce((s, v) => s + v, 0) / days.length, c2 = days.map(d => d[`d2y${h}`]).reduce((s, v) => s + v, 0) / days.length;
      log(`    ${tag} → next ${h}: 2Y ${fmt(c2, 1)}bp, 10Y ${fmt(c10, 1)}bp, curve ${fmt(own, 1)}bp; vs matched non-FOMC ${fmt(b.mean, 1)}bp [${fmt(b.lo, 1)}, ${fmt(b.hi, 1)}]  ${tag === 'hawkish' && b.mean <= -5 && b.hi < 0 ? 'FLATTENS MORE (pass)' : 'no difference'}`);
      (out.curve ??= []).push({ tag, h, n: days.length, d2y: c2, d10y: c10, curve: own, vsControl: b });
    }
  }
  // (b)(c)(d) fade / continuation on FOMC days vs matched big days
  for (const [name, k0, k5, k20] of [['2Y', 'd2y0', 'd2y5', 'd2y20'], ['10Y', 'd10y0', 'd10y5', 'd10y20'], ['dollar', 'dxy0', 'dxy5', 'dxy20'], ['SPX500', 'spx0', 'spx5', 'spx20']]) {
    const days = fomcDays.filter(d => Number.isFinite(d[k0]) && Number.isFinite(d[k20]));
    const ctl = match(days, k0).filter(Boolean);
    const cont = (x, kf) => Math.sign(x[kf]) === Math.sign(x[k0]) && x[k0] !== 0;
    const fade = (x, kf) => Math.sign(x[kf]) === -Math.sign(x[k0]) && Math.abs(x[kf]) >= 0.5 * Math.abs(x[k0]);
    for (const [lbl, kf] of [['5', k5], ['20', k20]]) {
      const cF = bootShare(days, x => cont(x, kf), SEED + 1), cC = bootShare(ctl, x => cont(x, kf), SEED + 2), dC = bootDiffShare(days, x => cont(x, kf), ctl, x => cont(x, kf), SEED + 3);
      const fF = bootShare(days, x => fade(x, kf), SEED + 4), fC = bootShare(ctl, x => fade(x, kf), SEED + 5), dF = bootDiffShare(days, x => fade(x, kf), ctl, x => fade(x, kf), SEED + 6);
      const finding = Math.abs(dF.diff) >= 0.15 && (dF.lo > 0 || dF.hi < 0) ? (dF.diff > 0 ? 'FADES MORE THAN A NORMAL BIG DAY' : 'FADES LESS') : 'no difference from an ordinary big day';
      log(`    ${name} next ${lbl}: continuation FOMC ${(cF.p * 100).toFixed(0)}% vs matched ${(cC.p * 100).toFixed(0)}% (diff ${fmt(dC.diff * 100, 0)}pp [${fmt(dC.lo * 100, 0)}, ${fmt(dC.hi * 100, 0)}]); gave back ≥ half: FOMC ${(fF.p * 100).toFixed(0)}% vs matched ${(fC.p * 100).toFixed(0)}% (diff ${fmt(dF.diff * 100, 0)}pp [${fmt(dF.lo * 100, 0)}, ${fmt(dF.hi * 100, 0)}])  n=${days.length}  → ${finding}`);
      (out.moves ??= []).push({ name, h: lbl, n: days.length, contFomc: cF.p, contCtl: cC.p, contDiff: dC, fadeFomc: fF.p, fadeCtl: fC.p, fadeDiff: dF, finding });
    }
  }
  results.studies.S9 = out;
}

// ═══ S10 crowded short in long bonds into the Fed ════════════════════════════
// Pre-registered 2026-09-17 (commit 5966a70) before running.
if (want('S10')) {
  log('\n═══ S10  crowded short in long bonds into the Fed ═══');
  const S30 = await fred('DGS30');
  async function cftc(names) {
    const rows = [];
    for (const name of names) {
      const u = `https://publicreporting.cftc.gov/resource/gpe5-46if.json?market_and_exchange_names=${encodeURIComponent(name)}&$limit=3000&$order=report_date_as_yyyy_mm_dd%20ASC`;
      const r = await fetch(u, { signal: AbortSignal.timeout(30000) }).then(x => x.json());
      for (const x of r) rows.push({ date: String(x.report_date_as_yyyy_mm_dd).slice(0, 10), oi: +(x.open_interest_all ?? x.open_interest), levL: +(x.lev_money_positions_long_all ?? x.lev_money_positions_long), levS: +(x.lev_money_positions_short_all ?? x.lev_money_positions_short) });
    }
    const byDate = new Map(); for (const r of rows) if (Number.isFinite(r.oi) && r.oi > 0 && Number.isFinite(r.levL) && Number.isFinite(r.levS)) byDate.set(r.date, r);
    const out = [...byDate.values()].sort((a, b) => a.date < b.date ? -1 : 1);
    for (let i = 0; i < out.length; i++) { const r = out[i]; r.net = (r.levL - r.levS) / r.oi; r.gross = (r.levL + r.levS) / r.oi; const win = out.slice(Math.max(0, i - 156), i).map(x => x.net); r.pct = win.length >= 52 ? win.filter(v => v < r.net).length / win.length : null; }
    return out;
  }
  const tb = await cftc(['U.S. TREASURY BONDS - CHICAGO BOARD OF TRADE', 'UST BOND - CHICAGO BOARD OF TRADE']);
  const tn = await cftc(['10-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE', 'UST 10Y NOTE - CHICAGO BOARD OF TRADE']);
  log(`  T-bond COT ${tb.length} weeks ${tb[0]?.date} → ${tb.at(-1)?.date}; 10Y note ${tn.length} weeks`);
  const lastReportOnOrBefore = (series, date) => { let best = null; for (const r of series) { if (r.date <= date) best = r; else break; } return best; };
  const rowsX = T.EUR_USD.rows;   // daily calendar; add DGS30 carried forward
  { let last = null; for (const r of rowsX) { const v = S30.get(r.date); if (v != null) last = v; r.us30 = last; } }
  const idx = new Map(rowsX.map(r => [r.date, r.i]));
  const meetings = allMeetings().map(m => m.date).filter(d => d >= '2010-01-01' && idx.has(d) && idx.get(d) + 20 < rowsX.length);
  // Tuesday of the meeting week: the report dated on/before it is the positioning INTO the meeting
  const tueOf = d => { const t = new Date(d + 'T00:00:00Z'); const dow = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dow + 1); return t.toISOString().slice(0, 10); };
  const rec = [];
  for (const d of meetings) {
    const i = idx.get(d), r = rowsX[i], p = rowsX[i - 1];
    const rep = lastReportOnOrBefore(tb, tueOf(d)), rep2 = rep ? tb[tb.indexOf(rep) - 2] : null;
    const repN = lastReportOnOrBefore(tn, tueOf(d)), repN2 = repN ? tn[tn.indexOf(repN) - 2] : null;
    if (!rep || rep.pct == null || r.us30 == null || r.us10y == null || p?.us2y == null) continue;
    rec.push({ date: d, week: r.week, pct: rep.pct, net: rep.net, gross: rep.gross, dGross: rep2 ? rep.gross - rep2.gross : null, dGrossN: (repN && repN2) ? repN.gross - repN2.gross : null,
      d2y0: (r.us2y - p.us2y) * 100, d30_5: (rowsX[i + 5].us30 - r.us30) * 100, d30_20: (rowsX[i + 20].us30 - r.us30) * 100, d10_5: (rowsX[i + 5].us10y - r.us10y) * 100, d10_20: (rowsX[i + 20].us10y - r.us10y) * 100,
      d30_0: (r.us30 - p.us30) * 100 });
  }
  log(`  FOMC meetings with positioning + yields: ${rec.length}`);
  const out = { n: rec.length };
  // (1) squaring up: gross positioning change into the meeting vs random fortnights
  const rndS = mulberry32(SEED + 10);
  const randFort = (series, k) => { const v = []; for (let j = 0; j < k; j++) { const a = 2 + Math.floor(rndS() * (series.length - 2)); v.push(series[a].gross - series[a - 2].gross); } return v; };
  for (const [name, key, series] of [['T-bond', 'dGross', tb], ['10Y note', 'dGrossN', tn]]) {
    const v = rec.map(r => r[key]).filter(Number.isFinite); const b = bootMean(v, rec.filter(r => Number.isFinite(r[key])).map(r => r.week), SEED + 11);
    const rf = randFort(series, 2000); const rb = rf.reduce((s, x) => s + x, 0) / rf.length;
    log(`    (1) ${name}: leveraged gross/OI change over the two reports into the meeting ${fmt(b.mean * 100, 2)}pp [${fmt(b.lo * 100, 2)}, ${fmt(b.hi * 100, 2)}] vs random fortnights ${fmt(rb * 100, 2)}pp  → ${b.hi < rb ? 'SQUARES UP (gross falls more than usual)' : 'no squaring-up visible'}`);
    out[`squareUp_${key}`] = { fomc: b, random: rb };
  }
  // (2) how crowded were shorts into each meeting; terciles
  const sorted = [...rec].sort((a, b) => a.pct - b.pct); const t1 = sorted[Math.floor(rec.length / 3)].pct, t2 = sorted[Math.floor(2 * rec.length / 3)].pct;
  const short = rec.filter(r => r.pct < t1), rest = rec.filter(r => r.pct >= t1), long = rec.filter(r => r.pct >= t2);
  log(`    (2) leveraged-fund net/OI percentile at the meeting: tercile cut-points ${(t1 * 100).toFixed(0)}th / ${(t2 * 100).toFixed(0)}th; crowded-short meetings ${short.length} (mean net ${(short.reduce((s, r) => s + r.net, 0) / short.length * 100).toFixed(1)}% of OI), rest ${rest.length}`);
  // (3) the rally: 30Y and 10Y after the decision, crowded-short vs rest; then vs matched non-FOMC days in the same positioning tercile
  const bootDiffMean = (a, b, seed) => { const r2 = mulberry32(seed); const ds = []; for (let k = 0; k < REPS; k++) { const x = a.map(() => a[Math.floor(r2() * a.length)]), y = b.map(() => b[Math.floor(r2() * b.length)]); ds.push(x.reduce((s, v) => s + v, 0) / x.length - y.reduce((s, v) => s + v, 0) / y.length); } ds.sort((x, y) => x - y); return { diff: a.reduce((s, v) => s + v, 0) / a.length - b.reduce((s, v) => s + v, 0) / b.length, lo: ds[Math.floor(REPS * 0.025)], hi: ds[Math.floor(REPS * 0.975)] }; };
  // non-FOMC comparison: every non-FOMC day 2010→ with a report percentile, same tercile
  const fomcSet = new Set(meetings);
  const daily = [];
  for (let i = 1; i < rowsX.length - 20; i++) { const r = rowsX[i]; if (r.date < '2010-01-01' || fomcSet.has(r.date) || r.us30 == null || rowsX[i + 20].us30 == null) continue; const rep = lastReportOnOrBefore(tb, r.date); if (!rep || rep.pct == null) continue; daily.push({ date: r.date, pct: rep.pct, d30_5: (rowsX[i + 5].us30 - r.us30) * 100, d30_20: (rowsX[i + 20].us30 - r.us30) * 100, d10_5: (rowsX[i + 5].us10y - r.us10y) * 100 }); }
  const dShort = daily.filter(d => d.pct < t1), dRest = daily.filter(d => d.pct >= t1);
  for (const [lbl, key] of [['30Y d0..d+5', 'd30_5'], ['30Y d0..d+20', 'd30_20'], ['10Y d0..d+5', 'd10_5'], ['10Y d0..d+20', 'd10_20']]) {
    const a = short.map(r => r[key]), b = rest.map(r => r[key]);
    const f = bootDiffMean(a, b, SEED + 12);
    const na = dShort.map(r => r[key]).filter(Number.isFinite), nb = dRest.map(r => r[key]).filter(Number.isFinite);
    const g = na.length && nb.length ? bootDiffMean(na, nb, SEED + 13) : null;
    const pass = key === 'd30_5' && f.diff <= -5 && f.hi < 0 && g && f.diff < g.diff;
    log(`    (3) ${lbl}: crowded-short meetings ${fmt(a.reduce((s, v) => s + v, 0) / a.length, 1)}bp vs rest ${fmt(b.reduce((s, v) => s + v, 0) / b.length, 1)}bp → diff ${fmt(f.diff, 1)}bp [${fmt(f.lo, 1)}, ${fmt(f.hi, 1)}]  |  same split on NON-FOMC days: diff ${g ? `${fmt(g.diff, 1)}bp [${fmt(g.lo, 1)}, ${fmt(g.hi, 1)}]` : 'n/a'}  ${pass ? 'PASS' : ''}`);
    (out.rally ??= []).push({ lbl, nShort: a.length, nRest: b.length, fomcDiff: f, nonFomcDiff: g, pass });
  }
  // consensus sub-split
  const cons = short.filter(r => Math.abs(r.d2y0) < 5), consRest = rest.filter(r => Math.abs(r.d2y0) < 5);
  if (cons.length >= 10 && consRest.length >= 10) { const f = bootDiffMean(cons.map(r => r.d30_5), consRest.map(r => r.d30_5), SEED + 14); log(`    (3b) consensus decisions only (day-0 |Δ2Y| < 5bp): crowded-short ${cons.length} vs rest ${consRest.length}: 30Y d0..d+5 diff ${fmt(f.diff, 1)}bp [${fmt(f.lo, 1)}, ${fmt(f.hi, 1)}]`); out.consensus = { n: cons.length, nRest: consRest.length, diff: f }; }
  else log(`    (3b) consensus sub-split too thin (${cons.length} vs ${consRest.length})`);
  // today
  const nowRep = tb.at(-1); log(`    now: T-bond leveraged net ${(nowRep.net * 100).toFixed(1)}% of OI, ${nowRep.pct != null ? Math.round(nowRep.pct * 100) + 'th' : '?'} percentile (report ${nowRep.date}); into the 2026-09-16 meeting: ${(() => { const r = rec.find(x => x.date === '2026-09-16'); return r ? `${Math.round(r.pct * 100)}th percentile, ${r.pct < t1 ? 'CROWDED SHORT tercile' : 'not crowded short'}` : 'not in sample (needs d+20)'; })()}`);
  out.now = { date: nowRep.date, net: nowRep.net, pct: nowRep.pct, t1, t2 };
  results.studies.S10 = out;
}

// ═══ S11 price vs yield spread: divergence, alignment, who pays ══════════════
// Pre-registered 2026-09-17 (commit 276661e) before running.
if (want('S11')) {
  log('\n═══ S11  price vs 10Y yield spread: divergence vs alignment ═══');
  const bond = {};
  for (const sym of ['USB10Y_USD', 'DE10YB_EUR', 'UK10YB_GBP']) { try { bond[sym] = (await fetchD1(sym, 5000)).sort((a, b) => a.date < b.date ? -1 : 1); log(`  ${sym} ${bond[sym].length} bars ${bond[sym][0]?.date} → ${bond[sym].at(-1)?.date}`); } catch (e) { log(`  ${sym}: ${e.message}`); } await new Promise(r => setTimeout(r, 150)); }
  const out = {};
  for (const [pair, sym, foreign] of [['EUR/USD', 'EUR_USD', 'DE10YB_EUR'], ['GBP/USD', 'GBP_USD', 'UK10YB_GBP']]) {
    const us = new Map((bond.USB10Y_USD ?? []).map(b => [b.date, b.close])), fo = new Map((bond[foreign] ?? []).map(b => [b.date, b.close]));
    const rows = T[sym].rows;
    for (const r of rows) { const u = us.get(r.date), f = fo.get(r.date); r.spread = (u != null && f != null) ? u - f : null; }   // +US price − foreign price ∝ foreign yield − US yield
    // carry forward across missing bond sessions
    { let last = null; for (const r of rows) { if (r.spread != null) last = r.spread; else r.spread = last; } }
    for (let i = 270; i < rows.length; i++) {
      const r = rows[i]; if (!r.ok || r.spread == null || rows[i - 20].spread == null) continue;
      r.pair20 = Math.log(r.c / rows[i - 20].c) * 100;
      r.spr20 = r.spread - rows[i - 20].spread;
      const w = rows.slice(i - 250, i).map((x, k) => (x.spread != null && rows[i - 250 + k - 20]?.spread != null) ? x.spread - rows[i - 250 + k - 20].spread : null).filter(Number.isFinite);
      const wp = rows.slice(i - 250, i).map((x, k) => Number.isFinite(x.pair20) ? x.pair20 : null).filter(Number.isFinite);
      const sd = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
      if (w.length < 100 || wp.length < 100) continue;
      r.sprZ = r.spr20 / sd(w); r.pairZ = r.pair20 / sd(wp);
      r.gap = r.pairZ - r.sprZ;
    }
    // second pass: forward gap needs the FORWARD row's z-scores, which the first pass had not reached yet
    for (let i = 270; i < rows.length - 20; i++) { const r = rows[i], n = rows[i + 20]; if (r.gap == null || n?.pairZ == null || n?.sprZ == null) continue; r.gapF = n.pairZ - n.sprZ; r.pairF = Math.log(n.c / r.c) * 100; r.sprF = n.spread != null ? n.spread - r.spread : null; }
    const pop = T[sym].pop.filter(r => r.sprZ != null && r.pairZ != null);
    const div = r => Math.abs(r.sprZ) >= 1 && Math.abs(r.pairZ) >= 1 && Math.sign(r.sprZ) !== Math.sign(r.pairZ);
    const ali = r => Math.abs(r.sprZ) >= 1 && Math.abs(r.pairZ) >= 1 && Math.sign(r.sprZ) === Math.sign(r.pairZ);
    const first = (f) => pop.filter(r => f(r) && !(rows[r.i - 1] && f(rows[r.i - 1])));
    const dDays = first(div), aDays = first(ali);
    log(`  ${pair}: population ${pop.length} days; divergence episodes ${dDays.length}, alignment episodes ${aDays.length} (first day of each)`);
    const o = { pop: pop.length, divergence: dDays.length, alignment: aDays.length, tests: [] };
    for (const [tag, days, ex] of [['divergence', dDays, div], ['alignment', aDays, ali]]) {
      for (const t of [paired(sym, days, 'r20', { excludeFn: r => div(r) || ali(r), label: `${pair} ${tag}` }), paired(sym, days, 'r5', { excludeFn: r => div(r) || ali(r), label: `${pair} ${tag}` })]) { log(line(t)); o.tests.push(t); }
    }
    // closure base rates on divergence days
    const withF = dDays.filter(r => r.gapF != null && r.pairF != null && r.sprF != null);
    if (withF.length >= 20) {
      const closed = withF.filter(r => Math.abs(r.gapF) <= 0.5 * Math.abs(r.gap));
      const byPair = closed.filter(r => Math.sign(r.pairF) === -Math.sign(r.pairZ) && Math.abs(r.pairF) >= Math.abs(r.sprF) / 0.01 * 0);   // pair moved back toward the spread
      const pairBack = withF.filter(r => Math.sign(r.pairF) === -Math.sign(r.pairZ)).length / withF.length;
      const sprBack = withF.filter(r => Math.sign(r.sprF) === -Math.sign(r.sprZ)).length / withF.length;
      const bC = bootShareArr(withF.map(r => Math.abs(r.gapF) <= 0.5 * Math.abs(r.gap)), SEED + 21), bP = bootShareArr(withF.map(r => Math.sign(r.pairF) === -Math.sign(r.pairZ)), SEED + 22), bS = bootShareArr(withF.map(r => Math.sign(r.sprF) === -Math.sign(r.sprZ)), SEED + 23);
      log(`    closure over the next 20 sessions (n=${withF.length}): gap halved in ${(bC.p * 100).toFixed(0)}% [${(bC.lo * 100).toFixed(0)}, ${(bC.hi * 100).toFixed(0)}]; the PAIR reversed toward the spread in ${(bP.p * 100).toFixed(0)}% [${(bP.lo * 100).toFixed(0)}, ${(bP.hi * 100).toFixed(0)}]; the SPREAD reversed toward the pair in ${(bS.p * 100).toFixed(0)}% [${(bS.lo * 100).toFixed(0)}, ${(bS.hi * 100).toFixed(0)}]`);
      const uncPair = pop.filter(r => r.pairF != null).length ? pop.filter(r => r.pairF != null && Math.sign(r.pairF) === -Math.sign(r.pairZ)).length / pop.filter(r => r.pairF != null).length : null;
      log(`    unconditional: the pair reverses its own 20-day sign over the next 20 in ${(uncPair * 100).toFixed(0)}% of all days`);
      o.closure = { n: withF.length, closed: bC, pairBack: bP, spreadBack: bS, uncPairBack: uncPair };
    } else log(`    closure: too few divergence episodes with forward data (${withF.length})`);
    out[pair] = o;
  }
  results.studies.S11 = out;
}
function bootShareArr(bools, seed) { const rnd = mulberry32(seed); const n = bools.length; const ps = []; for (let k = 0; k < REPS; k++) { let c = 0; for (let j = 0; j < n; j++) if (bools[Math.floor(rnd() * n)]) c++; ps.push(c / n); } ps.sort((a, b) => a - b); return { p: bools.filter(Boolean).length / n, lo: ps[Math.floor(REPS * 0.025)], hi: ps[Math.floor(REPS * 0.975)] }; }

// ═══ S12 lead-up × surprise → direction after FOMC (base-rate table) ═════════
// Pre-registered 2026-09-17 (commit 9809b3a) before running.
if (want('S12')) {
  log('\n═══ S12  after FOMC: 30Y lead-up × day-0 surprise → where SPX / dollar / gold were 5 sessions later ═══');
  const S30 = await fred('DGS30');
  const rowsX = T.EUR_USD.rows; { let last = null; for (const r of rowsX) { const v = S30.get(r.date); if (v != null) last = v; r.us30 = last; } }
  const idx = new Map(rowsX.map(r => [r.date, r.i]));
  const spx = T.SPX500_USD, gold = T.XAU_USD;
  const meetings = allMeetings().map(m => m.date).filter(d => d >= '2016-01-01' && idx.has(d) && idx.get(d) + 5 < rowsX.length);
  const rec = [];
  for (const d of meetings) {
    const i = idx.get(d), r = rowsX[i], p = rowsX[i - 1], pre = rowsX[i - 20], f = rowsX[i + 5];
    if (!r || !p || !pre || !f || r.us30 == null || pre.us30 == null || r.us2y == null || p.us2y == null || !r.dxy || !f.dxy) continue;
    const s0 = spx.byDate.get(d), s5 = s0 ? spx.rows[s0.i + 5] : null, g0 = gold.byDate.get(d), g5 = g0 ? gold.rows[g0.i + 5] : null;
    rec.push({ date: d, lead: (r.us30 - pre.us30) * 100, surp: (r.us2y - p.us2y) * 100,
      spx: (s0 && s5) ? Math.log(s5.c / s0.c) * 100 : null, dxy: (f.dxy / r.dxy - 1) * 100, gold: (g0 && g5) ? Math.log(g5.c / g0.c) * 100 : null });
  }
  log(`  meetings ${rec.length}`);
  const leadCls = x => x.lead >= 8 ? '30Y UP into it' : x.lead <= -8 ? '30Y DOWN into it' : '30Y flat into it';
  const surpCls = x => x.surp >= 5 ? 'hawkish' : x.surp <= -5 ? 'dovish' : 'neutral';
  const out = { n: rec.length, cells: [] };
  const share = (v, seed) => { if (!v.length) return null; const b = bootShareArr(v.map(x => x > 0), seed); return b; };
  log(`  ${'cell'.padEnd(34)} n    SPX up%        mean    dollar up%     mean    gold up%       mean`);
  for (const L of ['30Y UP into it', '30Y flat into it', '30Y DOWN into it']) for (const Sx of ['hawkish', 'neutral', 'dovish']) {
    const cell = rec.filter(x => leadCls(x) === L && surpCls(x) === Sx);
    const n = cell.length;
    const f = (key, seed) => { const v = cell.map(x => x[key]).filter(Number.isFinite); if (v.length < 10) return `n<10`; const b = share(v, seed); const m = v.reduce((s, x) => s + x, 0) / v.length; return `${(b.p * 100).toFixed(0)}% [${(b.lo * 100).toFixed(0)},${(b.hi * 100).toFixed(0)}] ${fmt(m, 2)}%`; };
    log(`  ${(L + ' × ' + Sx).padEnd(34)} ${String(n).padStart(2)}   ${f('spx', SEED + 31).padEnd(22)} ${f('dxy', SEED + 32).padEnd(22)} ${f('gold', SEED + 33)}`);
    out.cells.push({ lead: L, surprise: Sx, n, spx: n >= 10 ? share(cell.map(x => x.spx).filter(Number.isFinite), SEED + 31) : null, dxy: n >= 10 ? share(cell.map(x => x.dxy), SEED + 32) : null, gold: n >= 10 ? share(cell.map(x => x.gold).filter(Number.isFinite), SEED + 33) : null });
  }
  // margins: surprise alone, lead-up alone
  log('  margins:');
  for (const Sx of ['hawkish', 'neutral', 'dovish']) { const cell = rec.filter(x => surpCls(x) === Sx); const f = (key, seed) => { const v = cell.map(x => x[key]).filter(Number.isFinite); const b = share(v, seed); const m = v.reduce((s, x) => s + x, 0) / v.length; return `${(b.p * 100).toFixed(0)}% [${(b.lo * 100).toFixed(0)},${(b.hi * 100).toFixed(0)}] ${fmt(m, 2)}%`; }; log(`  ${('surprise ' + Sx).padEnd(34)} ${String(cell.length).padStart(2)}   ${f('spx', SEED + 34).padEnd(22)} ${f('dxy', SEED + 35).padEnd(22)} ${f('gold', SEED + 36)}`); }
  for (const L of ['30Y UP into it', '30Y flat into it', '30Y DOWN into it']) { const cell = rec.filter(x => leadCls(x) === L); const f = (key, seed) => { const v = cell.map(x => x[key]).filter(Number.isFinite); const b = share(v, seed); const m = v.reduce((s, x) => s + x, 0) / v.length; return `${(b.p * 100).toFixed(0)}% [${(b.lo * 100).toFixed(0)},${(b.hi * 100).toFixed(0)}] ${fmt(m, 2)}%`; }; log(`  ${('lead-up ' + L).padEnd(34)} ${String(cell.length).padStart(2)}   ${f('spx', SEED + 37).padEnd(22)} ${f('dxy', SEED + 38).padEnd(22)} ${f('gold', SEED + 39)}`); }
  // and the day itself (the reaction, for contrast)
  const day0 = rec.map(x => { const i = idx.get(x.date); const r = rowsX[i], p = rowsX[i - 1]; const s = spx.byDate.get(x.date), sp = s ? spx.rows[s.i - 1] : null; return { surp: x.surp, spx0: (s && sp) ? Math.log(s.c / sp.c) * 100 : null, dxy0: (r.dxy / p.dxy - 1) * 100 }; });
  for (const Sx of ['hawkish', 'dovish']) { const c = day0.filter(x => surpCls(x) === Sx); const spxUp = c.filter(x => x.spx0 != null && x.spx0 > 0).length / c.filter(x => x.spx0 != null).length, dxyUp = c.filter(x => x.dxy0 > 0).length / c.length; log(`  ON THE DAY, ${Sx} surprise (n=${c.length}): SPX up ${(spxUp * 100).toFixed(0)}%, dollar up ${(dxyUp * 100).toFixed(0)}% -- the reaction, for contrast with the rows above`); out[`day0_${Sx}`] = { n: c.length, spxUp, dxyUp }; }
  results.studies.S12 = out;
}

// ── shared: fetch every registry FX pair not already loaded (S13 & S14) ─────
const REGISTRY_FX = ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_CAD', 'USD_CHF',
  'EUR_GBP', 'EUR_AUD', 'EUR_CAD', 'EUR_CHF', 'EUR_NZD', 'AUD_NZD', 'AUD_CAD', 'AUD_CHF', 'NZD_CAD',
  'GBP_AUD', 'GBP_CAD', 'GBP_CHF', 'GBP_NZD', 'USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'];
async function ensureRegistryFX() {
  for (const sym of REGISTRY_FX) {
    if (!bars[sym]) { bars[sym] = (await fetchD1(sym, 5000)).sort((a, b) => a.date < b.date ? -1 : 1); log(`  ${sym} ${bars[sym].length} bars ${bars[sym][0].date} → ${bars[sym].at(-1).date}`); }
    if (!T[sym]) T[sym] = table(sym);
  }
}
// symmetric-matrix eigen-decomposition (cyclic Jacobi) — n ≤ 27, a few sweeps converge
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

// ═══ S13 breadth: does watching more pairs add anything? ════════════════════
// Pre-registered 2026-09-17 (commit 26203b3) before running. Scope note printed
// below: the registered universes 1/2/4/8/16/26 assumed a strategy that runs on
// all 26; the only strategy on this desk with a validated multi-pair record
// (the yield-spread z-score sleeve) is defined on exactly 6 pairs and does not
// extend to the other 20 without inventing an untested spread definition for
// each — so (b) is scored on its real ceiling, N=1..6, not N=26.
if (want('S13')) {
  log('\n═══ S13  does watching more pairs add breadth? (N and N_eff) ═══');
  await ensureRegistryFX();
  const out = {};

  // ---- (a) raw-instrument N_eff across the registry's 26 FX + gold ----
  const ALL26 = [...REGISTRY_FX, 'XAU_USD'];
  const retBySym = {}; const dateSet = new Set();
  for (const sym of ALL26) { const m = new Map(); for (const r of T[sym].pop) if (Number.isFinite(r.ret1)) { m.set(r.date, r.ret1); dateSet.add(r.date); } retBySym[sym] = m; }
  const commonDates = [...dateSet].filter(d => ALL26.every(sym => retBySym[sym].has(d))).sort();
  log(`  common trading dates across all 26 FX + gold: ${commonDates.length}`);
  if (commonDates.length >= 500) {
    const { eig, nEff } = nEffFromCorr(corrMatrix(ALL26, commonDates, retBySym));
    log(`  raw daily-return correlation, 26 FX + gold (n=${commonDates.length} days): N_eff = ${nEff.toFixed(2)} of 27 (top 5 eigenvalues: ${eig.slice(0, 5).map(x => x.toFixed(2)).join(', ')})`);
    out.rawNEff = { symbols: ALL26.length, days: commonDates.length, nEff, topEig: eig.slice(0, 6) };
    const majors = ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY'];
    const { nEff: neM } = nEffFromCorr(corrMatrix(majors, commonDates, retBySym));
    log(`  majors-only (7 USD pairs): N_eff = ${neM.toFixed(2)} of 7`);
    out.majorsNEff = { symbols: majors.length, nEff: neM };
  } else log(`  only ${commonDates.length} common dates — N_eff not computed`);

  // ---- (b) the validated yield-spread sleeve, reconstructed pure from FRED CSV
  // + OANDA daily closes already in this harness (not the production engine —
  // a faithful re-derivation of YIELD_SPREAD_STRATEGY.md's rule for this test):
  // entry |z|≥pair default, zWindow 126, exit |z|≤1.5 or 20-day hold, USD-role
  // sign convention, 0.02% round-trip cost. ----
  const usdBase = { usdjpy: true, usdcad: true, usdchf: true, eurusd: false, gbpusd: false, audusd: false };
  const OANDA_OF = { usdjpy: 'USD_JPY', eurusd: 'EUR_USD', gbpusd: 'GBP_USD', audusd: 'AUD_USD', usdcad: 'USD_CAD', usdchf: 'USD_CHF' };
  const gs2 = await fred('GS2');
  const zWindow = 126, zExit = 1.5, maxHold = 20, costRT = (YIELD_SPREAD_DEFAULTS.costPct ?? 0.02) / 100;
  const sleeveDaily = {};
  for (const [key, cfg] of Object.entries(ZSCORE_PAIRS)) {
    const foreign = await fred(cfg.quoteSeries);
    const sym = OANDA_OF[key]; const rows = T[sym].rows;
    const zByDate = buildRollingZSeries(gs2, foreign, zWindow, rows[0].date, rows.at(-1).date);
    const thr = cfg.defaultThreshold ?? 2.0;
    let pos = null; const daily = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i], p = rows[i - 1], z = zByDate.get(r.date)?.z ?? null;
      let pnl = 0;
      if (pos) { pnl = pos.dir * Math.log(r.c / p.c); pos.hold++; if (z == null || Math.abs(z) <= zExit || pos.hold >= maxHold) { pnl -= costRT / 2; pos = null; } }
      if (!pos && z != null && Math.abs(z) >= thr) { pos = { dir: usdBase[key] ? Math.sign(z) : -Math.sign(z), hold: 0 }; pnl -= costRT / 2; }
      daily.set(r.date, pnl);
    }
    sleeveDaily[key] = daily;
  }
  const sleeveKeys = Object.keys(ZSCORE_PAIRS);
  const sleeveDates = [...sleeveDaily[sleeveKeys[0]].keys()].filter(d => sleeveKeys.every(k => sleeveDaily[k].has(d))).sort();
  log(`  yield-spread sleeve reconstructed, ${sleeveKeys.length} pairs, ${sleeveDates.length} common trading days`);
  const sharpe = vals => { const m = vals.reduce((a, b) => a + b, 0) / vals.length, sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length); return sd ? (m / sd) * Math.sqrt(252) : 0; };
  const combos = arr => { const out = []; for (let m = 1; m < (1 << arr.length); m++) { const c = []; for (let b = 0; b < arr.length; b++) if (m & (1 << b)) c.push(arr[b]); out.push(c); } return out; };
  const bySize = {};
  for (const c of combos(sleeveKeys)) { const vals = sleeveDates.map(d => c.reduce((s, k) => s + sleeveDaily[k].get(d), 0) / c.length); (bySize[c.length] ??= []).push(sharpe(vals)); }
  log('  equal-weight combined Sharpe by universe size (mean over every C(6,k) combo of that size):');
  const sizeSummary = [];
  for (let k = 1; k <= 6; k++) { const v = bySize[k], m = v.reduce((a, b) => a + b, 0) / v.length; log(`    N=${k}: mean Sharpe ${m.toFixed(2)} over ${v.length} combos (range ${Math.min(...v).toFixed(2)} to ${Math.max(...v).toFixed(2)})`); sizeSummary.push({ n: k, meanSharpe: m, min: Math.min(...v), max: Math.max(...v), combos: v.length }); }
  const sleeveRetBySym = {}; for (const k of sleeveKeys) sleeveRetBySym[k] = new Map(sleeveDates.map(d => [d, sleeveDaily[k].get(d)]));
  const { eig: sleeveEig, nEff: sleeveNEff } = nEffFromCorr(corrMatrix(sleeveKeys, sleeveDates, sleeveRetBySym));
  log(`  sleeve's own 6-pair daily-P&L correlation: N_eff = ${sleeveNEff.toFixed(2)} of 6 (eigenvalues: ${sleeveEig.map(x => x.toFixed(2)).join(', ')})`);
  const n1 = sizeSummary[0].meanSharpe, n6 = sizeSummary[5].meanSharpe, gain = n6 - n1;
  log(`  N=6 mean Sharpe ${n6.toFixed(2)} vs N=1 mean Sharpe ${n1.toFixed(2)}: gain ${fmt(gain, 2)}. Registered pass bar (N=26 vs N=4, ≥0.3, CI clear of zero) is not measurable at this sleeve's real 6-pair ceiling — reported as N=6 vs N=1 instead, scope limit stated above.`);
  out.sleeve = { keys: sleeveKeys, days: sleeveDates.length, bySize: sizeSummary, nEff: sleeveNEff, eig: sleeveEig, n1MeanSharpe: n1, n6MeanSharpe: n6, gain };
  results.studies.S13 = out;
}

// ═══ S14 regime breaks: does a first-in-years range break precede anything ══
// Pre-registered 2026-09-17 (commit 26203b3) before running.
if (want('S14')) {
  log('\n═══ S14  first close outside the trailing 3-year range (≥60 sessions since the last one) ═══');
  await ensureRegistryFX();
  const S30b = await fred('DGS30'), HYb = await fred('BAMLH0A0HYM2');
  const rowsCal = T.EUR_USD.rows;
  { let l30 = null, lhy = null; for (const r of rowsCal) { const v30 = S30b.get(r.date); if (v30 != null) l30 = v30; r.us30 = l30; const vhy = HYb.get(r.date); if (vhy != null) lhy = vhy; r.hy = lhy; } }
  function levelTable(seriesMap) {
    const rows = rowsCal.map(r => ({ i: r.i, date: r.date, week: r.week }));
    let last = null; for (const r of rows) { const v = seriesMap.get(r.date); if (v != null) last = v; r.c = last; }
    for (let i = 1; i < rows.length; i++) rows[i].tr = (rows[i].c != null && rows[i - 1].c != null) ? Math.abs(rows[i].c - rows[i - 1].c) : null;
    for (let i = 14; i < rows.length; i++) { const win = rows.slice(i - 13, i + 1).map(r => r.tr).filter(Number.isFinite); if (win.length === 14) rows[i].atr = win.reduce((a, b) => a + b, 0) / 14; }
    for (let i = 264; i < rows.length; i++) {
      const r = rows[i]; if (!r.atr || r.c == null) continue;
      const win = rows.slice(i - 250, i).map(x => x.atr).filter(Number.isFinite);
      r.atrQ = win.length ? Math.min(4, Math.floor(win.filter(v => v < r.atr).length / win.length * 5)) : null;
      r.trend20 = (rows[i - 20]?.c != null) ? r.c - rows[i - 20].c : null;
      const f5 = rows.slice(i + 1, i + 6), f20 = rows.slice(i + 1, i + 21), vals = a => a.map(x => x.c).filter(Number.isFinite);
      if (f5.length === 5) { const v = vals(f5); r.r5 = (v.length === 5 && r.atr) ? (Math.max(...v) - Math.min(...v)) / r.atr : null; }
      if (f20.length === 20) { const v = vals(f20); r.r20 = (v.length === 20 && r.atr) ? (Math.max(...v) - Math.min(...v)) / r.atr : null; }
      r.day0 = rows[i - 1]?.atr ? r.tr / rows[i - 1].atr : (r.atr ? r.tr / r.atr : null);
      r.ok = r.atrQ != null && r.trend20 != null;
    }
    const pop = rows.filter(r => r.ok);
    const v = pop.map(r => r.trend20).filter(Number.isFinite).sort((a, b) => a - b);
    if (v.length) { const t1 = v[Math.floor(v.length / 3)], t2 = v[Math.floor(2 * v.length / 3)]; for (const r of pop) r.trendT = r.trend20 < t1 ? 0 : r.trend20 < t2 ? 1 : 2; }
    return { rows, pop, byDate: new Map(rows.map(r => [r.date, r])) };
  }
  T.FRED_DGS2 = levelTable(F.us2y); T.FRED_DGS10 = levelTable(F.us10y); T.FRED_DGS30 = levelTable(S30b);
  T.FRED_DFII10 = levelTable(F.real); T.FRED_T10YIE = levelTable(F.bei); T.FRED_HY = levelTable(HYb);
  T.FRED_VIX = levelTable(F.vix); T.FRED_DXY = levelTable(F.dxy);

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
    'FX crosses': ['EUR_GBP', 'EUR_AUD', 'EUR_CAD', 'EUR_CHF', 'EUR_NZD', 'AUD_NZD', 'AUD_CAD', 'AUD_CHF', 'NZD_CAD', 'GBP_AUD', 'GBP_CAD', 'GBP_CHF', 'GBP_NZD', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY', 'CHF_JPY', 'NZD_JPY'],
    'metals/indices': ['XAU_USD', 'SPX500_USD', 'NAS100_USD'],
    'rates/credit': ['FRED_DGS2', 'FRED_DGS10', 'FRED_DGS30', 'FRED_DFII10', 'FRED_T10YIE', 'FRED_HY', 'FRED_VIX', 'FRED_DXY'],
  };
  const out = { families: {} };
  let familiesClearing = 0;
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
    if (famClears) familiesClearing++;
    out.families[fam] = { tests: famTests, clears: famClears };
    log(`    ${fam}: ${famClears ? 'CLEARS the bar (≥30 episodes, +0.30 ATR, CI clear of zero, on at least one member)' : 'does not clear'}`);
  }
  const verdict = familiesClearing >= 3 ? `PASS — ${familiesClearing}/4 families clear` : `NULL — only ${familiesClearing}/4 families clear (bar was ≥3/4)`;
  log(`  VERDICT: ${verdict}`);
  out.familiesClearing = familiesClearing; out.verdict = verdict;
  results.studies.S14 = out;
}

// ═══ S15 the non-reaction: a top-decile surprise, a bottom-tercile move ═════
// Pre-registered 2026-09-17 (commit 26203b3) before running.
let _s15OilSetup = null;   // shared with S16, same process only
if (want('S15') || want('S16')) {
  log('\n═══ S15  the non-reaction: top-decile surprise, bottom-tercile same-day move ═══');
  const out = { oil: null, generalized: null };

  // ---- (a) oil: EIA Weekly Crude Oil Inventory vs WTI ----
  const csvPath = path.join(__dirname, '..', 'calendar_events.csv');
  const csvLines = fs.readFileSync(csvPath, 'utf8').split('\n');
  const header = csvLines[0].split(','); const cidx = Object.fromEntries(header.map((h, k) => [h.trim(), k]));
  const eia = [];
  for (let k = 1; k < csvLines.length; k++) {
    const line = csvLines[k]; if (!line) continue;
    const cells = line.split(',');
    if (cells[cidx.event] !== 'EIA Weekly Crude Oil Inventory') continue;
    const date = cells[cidx.date], actual = parseFloat(cells[cidx.actual]), consensus = parseFloat(cells[cidx.consensus]);
    if (!date || !Number.isFinite(actual) || !Number.isFinite(consensus)) continue;
    eia.push({ date, actual, consensus, surprise: actual - consensus });
  }
  log(`  EIA Weekly Crude Oil Inventory rows with actual+consensus: ${eia.length}`);
  if (eia.length >= 40) {
    const surp = eia.map(r => r.surprise), m = surp.reduce((a, b) => a + b, 0) / surp.length;
    const sd = Math.sqrt(surp.reduce((s, v) => s + (v - m) ** 2, 0) / surp.length);
    for (const r of eia) r.z = sd ? (r.surprise - m) / sd : 0;
    if (!bars.WTICO_USD) { bars.WTICO_USD = (await fetchD1('WTICO_USD', 5000)).sort((a, b) => a.date < b.date ? -1 : 1); log(`  WTICO_USD ${bars.WTICO_USD.length} bars ${bars.WTICO_USD[0].date} → ${bars.WTICO_USD.at(-1).date}`); }
    if (!T.WTICO_USD) T.WTICO_USD = table('WTICO_USD');
    const wti = T.WTICO_USD;
    for (let i = 0; i < wti.rows.length; i++) { const r = wti.rows[i], f5 = wti.rows[i + 5], f20 = wti.rows[i + 20]; r.retF5 = f5 ? Math.log(f5.c / r.c) : null; r.retF20 = f20 ? Math.log(f20.c / r.c) : null; }
    const rel = eia.map(r => ({ ...r, row: wti.byDate.get(r.date) })).filter(r => r.row?.ok);
    log(`  matched to WTI trading calendar: ${rel.length}`);
    const zs = rel.map(r => Math.abs(r.z)).sort((a, b) => a - b), zThr = zs[Math.floor(zs.length * 0.9)];
    const day0s = rel.map(r => r.row.day0).filter(Number.isFinite).sort((a, b) => a - b), reactT1 = day0s[Math.floor(day0s.length / 3)];
    const topSurprise = rel.filter(r => Math.abs(r.z) >= zThr);
    const setup = topSurprise.filter(r => r.row.day0 != null && r.row.day0 <= reactT1);
    log(`  top-decile |z| ≥ ${zThr.toFixed(2)} (n=${topSurprise.length}); of those, bottom-tercile same-day reaction (day0 ≤ ${reactT1.toFixed(2)} ATR): n=${setup.length}`);
    _s15OilSetup = setup;
    const setupRows = setup.map(r => r.row);
    const excl = r => topSurprise.some(x => x.date === r.date);
    const rangeTests = [paired('WTICO_USD', setupRows, 'r5', { excludeFn: excl, label: 'EIA non-reaction' }), paired('WTICO_USD', setupRows, 'r20', { excludeFn: excl, label: 'EIA non-reaction' })];
    for (const t of rangeTests) log(line(t));
    const dirRows = setup.filter(r => Number.isFinite(r.row.retF5) && Number.isFinite(r.row.retF20));
    const implied = r => -Math.sign(r.surprise);   // actual > consensus (bigger build/smaller draw) is bearish
    const scored = dirRows.length >= 40;
    const share5 = dirRows.length ? bootShareArr(dirRows.map(r => Math.sign(r.row.retF5) === implied(r)), SEED + 51) : null;
    const share20 = dirRows.length ? bootShareArr(dirRows.map(r => Math.sign(r.row.retF20) === implied(r)), SEED + 52) : null;
    log(`  directional share, in the surprise-implied direction (n=${dirRows.length}${scored ? '' : ' — BELOW the 40-episode floor, not scored'}): next-5d ${share5 ? (share5.p * 100).toFixed(0) : 'n/a'}%${share5 ? ` [${(share5.lo * 100).toFixed(0)},${(share5.hi * 100).toFixed(0)}]` : ''}; next-20d ${share20 ? (share20.p * 100).toFixed(0) : 'n/a'}%${share20 ? ` [${(share20.lo * 100).toFixed(0)},${(share20.hi * 100).toFixed(0)}]` : ''}`);
    const pass = scored && (share5.lo > 0.5 || share5.hi < 0.5);
    log(`  VERDICT (oil leg): ${pass ? 'PASS — CI excludes 50%' : scored ? 'NULL — CI includes 50%' : 'NOT SCORED — below the 40-episode floor'}`);
    out.oil = { rows: eia.length, matched: rel.length, zThr, reactT1, nTopSurprise: topSurprise.length, nSetup: setup.length, nDir: dirRows.length, scored, share5, share20, rangeTests, pass };
  } else { log(`  only ${eia.length} EIA rows with both actual and consensus — below MIN_N, not scored`); out.oil = { rows: eia.length, scored: false }; }

  // ---- (b) generalized: the S7 surprise store, every family × pair ----
  const api = await fetch('https://macrofxmodel-production.up.railway.app/api/econ-surprise?history=1').then(r => r.json());
  const series = api?.series ?? {};
  const CODE = { US: 'USD', GB: 'GBP', EU: 'EUR', JP: 'JPY', AU: 'AUD', CA: 'CAD' };
  const PAIR2 = { US: ['EUR_USD', 'USD_JPY'], GB: ['GBP_USD'], EU: ['EUR_USD'], JP: ['USD_JPY'], AU: ['AUD_USD'], CA: ['USD_CAD'] };
  const sessionDate = ms => { const t = new Date(ms); if (t.getUTCHours() >= 21) t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  const rel2 = [];
  for (const [key, list] of Object.entries(series)) {
    const [ccy, name] = key.split('|'); if (!PAIR2[ccy] || !CODE[ccy]) continue;
    for (const x of list) if (Number.isFinite(x.z) && x.ms) for (const sym of PAIR2[ccy]) {
      const [base, quote] = sym.split('_'); const dir = CODE[ccy] === base ? 1 : CODE[ccy] === quote ? -1 : 0;
      if (!dir) continue; rel2.push({ ccy, sym, date: sessionDate(x.ms), z: x.z, dir });
    }
  }
  log(`  generalized store: ${rel2.length} usable release-pair rows`);
  const bySym = new Map(); for (const r of rel2) (bySym.get(r.sym) ?? bySym.set(r.sym, []).get(r.sym)).push(r);
  const genOut = []; let genPass = 0, genScored = 0;
  for (const [sym, list] of bySym) {
    const t = T[sym]; if (!t) continue;
    for (let i = 0; i < t.rows.length; i++) { const r = t.rows[i]; if (r.retF5 === undefined) { const f5 = t.rows[i + 5], f20 = t.rows[i + 20]; r.retF5 = f5 ? Math.log(f5.c / r.c) : null; r.retF20 = f20 ? Math.log(f20.c / r.c) : null; } }
    const rows = list.map(r => ({ ...r, row: t.byDate.get(r.date) })).filter(r => r.row?.ok);
    if (rows.length < 60) continue;
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
  log(`  generalized VERDICT: ${genScored} symbol(s) scored, ${genPass} of those with CI excluding 50%`);
  out.generalized = { totalRows: rel2.length, bySym: genOut, scored: genScored, pass: genPass };
  if (want('S15')) results.studies.S15 = out;
}

// ═══ S16 weird × technical: does a recent breakout change the finding? ══════
// Conditional pre-registration, 2026-09-17 (commit 26203b3): runs only if S15
// returned anything. NOTE: uses a 10-session prior-high/low close-through as
// the breakout proxy, not motif_track's tracked-level object — wiring the live
// tracker into this offline harness is out of scope here; a stated scope
// substitution, not a silent one.
if (want('S16')) {
  log('\n═══ S16  weird × technical: non-reaction episodes split by a prior breakout ═══');
  if (!_s15OilSetup || _s15OilSetup.length < 10) {
    log(`  S15's oil non-reaction setup has ${_s15OilSetup?.length ?? 0} episodes — too few to split; S16 not scored.`);
    results.studies.S16 = { skipped: true, n: _s15OilSetup?.length ?? 0 };
  } else {
    const wti = T.WTICO_USD;
    for (let i = 10; i < wti.rows.length; i++) { const r = wti.rows[i], win = wti.rows.slice(i - 10, i).map(x => x.c).filter(Number.isFinite); r.breakout10 = (win.length === 10 && r.c != null) ? (r.c > Math.max(...win) || r.c < Math.min(...win)) : false; }
    const withBO = _s15OilSetup.filter(r => r.row.breakout10 === true), noBO = _s15OilSetup.filter(r => r.row.breakout10 === false);
    log(`  of ${_s15OilSetup.length} non-reaction episodes: ${withBO.length} had a prior 10-session breakout, ${noBO.length} did not`);
    const implied = r => -Math.sign(r.surprise);
    const shareFor = grp => { const v = grp.filter(r => Number.isFinite(r.row.retF5)); return v.length ? bootShareArr(v.map(r => Math.sign(r.row.retF5) === implied(r)), SEED + 70) : null; };
    const sBO = shareFor(withBO), sNo = shareFor(noBO);
    log(`  next-5d implied-direction share: with breakout ${sBO ? `${(sBO.p * 100).toFixed(0)}% [${(sBO.lo * 100).toFixed(0)},${(sBO.hi * 100).toFixed(0)}] (n=${withBO.length})` : 'n/a'}; without ${sNo ? `${(sNo.p * 100).toFixed(0)}% [${(sNo.lo * 100).toFixed(0)},${(sNo.hi * 100).toFixed(0)}] (n=${noBO.length})` : 'n/a'}`);
    const diff = (sBO && sNo) ? sBO.p - sNo.p : null;
    const scored = withBO.length >= 30 && noBO.length >= 30;
    const conjAdds = scored && diff != null && diff >= 0.10 && sBO.lo > sNo.hi;
    log(`  VERDICT: ${!scored ? `NOT SCORED — needs ≥30 in each subgroup (have ${withBO.length} / ${noBO.length})` : conjAdds ? `CONJUNCTION ADDS — breakout subgroup beats the other by ${(diff * 100).toFixed(0)}pp with the CIs separated` : 'NO CONJUNCTION — the split does not clear the registered bar'}`);
    results.studies.S16 = { withBreakout: withBO.length, withoutBreakout: noBO.length, shareBreakout: sBO, shareNoBreakout: sNo, diff, scored, conjAdds };
  }
}

// merge into the existing output rather than overwrite it when only some studies ran
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { studies: {} };
fs.writeFileSync(OUT, JSON.stringify({ ...prev, ranAt: results.ranAt, studies: { ...prev.studies, ...results.studies } }, null, 1));
log('wrote ' + path.relative(process.cwd(), OUT));
