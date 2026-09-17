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

// merge into the existing output rather than overwrite it when only some studies ran
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { studies: {} };
fs.writeFileSync(OUT, JSON.stringify({ ...prev, ranAt: results.ranAt, studies: { ...prev.studies, ...results.studies } }, null, 1));
log('wrote ' + path.relative(process.cwd(), OUT));
