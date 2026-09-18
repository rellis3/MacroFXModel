// Three technical range tests, one harness. Pre-registered in
// MD files/TECHNICAL_RANGE_TESTS.md (commit bbead67) before the first run.
//
//   node analysis/technical_range_studies.mjs [T1,T2,T3]   (local M1 archive; no network)
//
// Sessions are London calendar days from the M1 archive (bucketM1IntoSessions),
// daily OHLC built from the sessions, ATR14 from those. Same paired-control
// method as market_sense_studies.mjs: same ATR quintile, same 20-session trend
// tercile, different ISO week, not itself a setup; week-block bootstrap.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'technical_range_studies.json'); fs.mkdirSync(path.dirname(OUT), { recursive: true });
const REPS = 1000, MIN_N = 40, SEED = 20260918, PASS_ATR = 0.10;
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const INSTR = { EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', AUDUSD: 'audusd', USDCAD: 'usdcad', GOLD: 'gold', NQ: 'nas100_usd', SPX500: 'spx500' };
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = (x, dp = 3) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const log = (...a) => console.log(...a);
function isoWeek(d) { const t = new Date(d + 'T00:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(); const jan4 = new Date(Date.UTC(y, 0, 4)); return `${y}-${Math.round(((t - jan4) / 864e5 + ((jan4.getUTCDay() + 6) % 7)) / 7) + 1}`; }
const pct = (a, p) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : null; };
const results = { ranAt: new Date().toISOString(), studies: {} };

// ── build per-instrument tables ─────────────────────────────────────────────
// London-hour of an M1 bar (epoch seconds), for the first-hour / first-2h windows.
const londonHM = t => { const d = new Date(t * 1000); const s = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }); const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const T = {};
for (const [inst, key] of Object.entries(INSTR)) {
  let packed; try { packed = await loadM1ForPair(key); } catch (e) { log(`  ${inst}: ${e.message}`); continue; }
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const all = [...sessions.keys()].sort();
  const dates = all.filter(d => (sessions.get(d)?.length ?? 0) >= 300);
  const rows = dates.map((date, i) => { const b = sessions.get(date); let hi = -Infinity, lo = Infinity; for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; } return { i, date, o: b[0].open, h: hi, l: lo, c: b[b.length - 1].close, week: isoWeek(date), bars: b }; });
  const tr = (r, p) => Math.max(r.h - r.l, Math.abs(r.h - p.c), Math.abs(r.l - p.c));
  for (let i = 1; i < rows.length; i++) rows[i].tr = tr(rows[i], rows[i - 1]);
  for (let i = 14; i < rows.length; i++) { let s = 0; for (let k = i - 13; k <= i; k++) s += rows[k].tr; rows[i].atr = s / 14; }
  for (let i = 264; i < rows.length; i++) {
    const r = rows[i]; if (!r.atr) continue;
    const atrPrev = rows[i - 1].atr; if (!atrPrev) continue;
    const win = rows.slice(i - 250, i).map(x => x.atr / x.c).filter(Number.isFinite);
    r.atrQ = Math.min(4, Math.floor(win.filter(v => v < r.atr / r.c).length / win.length * 5));
    r.trend20 = Math.log(r.c / rows[i - 20].c);
    r.rng = (r.h - r.l) / atrPrev;                       // this session's range on the PRIOR ATR (no look-ahead)
    if (rows[i + 1]) r.r1 = (rows[i + 1].h - rows[i + 1].l) / r.atr;
    const f5 = rows.slice(i + 1, i + 6); if (f5.length === 5) r.r5 = (Math.max(...f5.map(x => x.h)) - Math.min(...f5.map(x => x.l))) / r.atr;
    r.upNext = rows[i + 1] ? (rows[i + 1].c > rows[i + 1].o ? 1 : 0) : null;
    // intraday windows on THIS session (London clock): first hour after 07:00, first 2h, first hour after 13:30
    const b = r.bars;
    const win1 = b.filter(x => { const m = londonHM(x.time); return m >= 420 && m < 480; });
    const win2 = b.filter(x => { const m = londonHM(x.time); return m >= 420 && m < 540; });
    const ny1 = b.filter(x => { const m = londonHM(x.time); return m >= 810 && m < 870; });
    const rngOf = arr => arr.length ? Math.max(...arr.map(x => x.high)) - Math.min(...arr.map(x => x.low)) : null;
    r.h1 = rngOf(win1), r.h2 = rngOf(win2), r.ny1 = rngOf(ny1);
    r.h1Frac = r.h1 != null ? r.h1 / (r.h - r.l) : null; r.ny1Frac = r.ny1 != null ? r.ny1 / (r.h - r.l) : null;
    r.h2Atr = r.h2 != null ? r.h2 / atrPrev : null;
    if (win2.length) { const last2 = win2[win2.length - 1]; r.move2 = last2.close - r.o; r.rest = (() => { const after = b.filter(x => londonHM(x.time) >= 540); return after.length ? (Math.max(...after.map(x => x.high)) - Math.min(...after.map(x => x.low))) / atrPrev : null; })(); }
    r.closePos = (r.h - r.l) > 0 ? (r.c - r.l) / (r.h - r.l) : null;   // 0 = closed at the low, 1 = at the high
    r.h1Held = win1.length ? (Math.max(...win1.map(x => x.high)) >= r.h - 1e-9 || Math.min(...win1.map(x => x.low)) <= r.l + 1e-9) : null;
    r.ok = true;
  }
  const pop = rows.filter(r => r.ok);
  const v = pop.map(r => r.trend20).sort((a, b) => a - b), t1 = v[Math.floor(v.length / 3)], t2 = v[Math.floor(2 * v.length / 3)];
  for (const r of pop) r.trendT = r.trend20 < t1 ? 0 : r.trend20 < t2 ? 1 : 2;
  for (const r of rows) delete r.bars;   // free memory
  T[inst] = { rows, pop, dropped: all.length - dates.length };
  log(`  ${inst}: ${dates.length} sessions ${dates[0]} → ${dates.at(-1)} (${all.length - dates.length} thin sessions dropped), ${pop.length} with features`);
}

function paired(inst, days, outcome, { excludeFn = null, seed = SEED, label = '' } = {}) {
  const pop = T[inst].pop.filter(r => r[outcome] != null);
  const setupIdx = new Set(days.map(r => r.i));
  const pool = pop.filter(r => !setupIdx.has(r.i) && !(excludeFn && excludeFn(r)));
  const cell = new Map(); for (const r of pool) { const k = `${r.atrQ}|${r.trendT}`; (cell.get(k) ?? cell.set(k, []).get(k)).push(r); }
  const rnd = mulberry32(seed); const pairs = []; let noCtl = 0;
  for (const d of days) { if (d[outcome] == null) continue; const c = (cell.get(`${d.atrQ}|${d.trendT}`) ?? []).filter(x => x.week !== d.week); if (!c.length) { noCtl++; continue; } const x = c[Math.floor(rnd() * c.length)]; pairs.push({ week: d.week, d: d[outcome] - x[outcome], s: d[outcome], c: x[outcome] }); }
  const res = { label, inst, outcome, n: days.length, paired: pairs.length, noCtl, scored: pairs.length >= MIN_N };
  if (!res.scored) return res;
  const weeks = [...new Set(pairs.map(p => p.week))], byW = new Map(); for (const p of pairs) (byW.get(p.week) ?? byW.set(p.week, []).get(p.week)).push(p.d);
  const means = []; for (let k = 0; k < REPS; k++) { let s = 0, n = 0; for (let j = 0; j < weeks.length; j++) for (const v of byW.get(weeks[Math.floor(rnd() * weeks.length)])) { s += v; n++; } means.push(s / n); } means.sort((a, b) => a - b);
  Object.assign(res, { diff: pairs.reduce((s, p) => s + p.d, 0) / pairs.length, lo: means[Math.floor(REPS * 0.025)], hi: means[Math.floor(REPS * 0.975)], setupMean: pairs.reduce((s, p) => s + p.s, 0) / pairs.length, ctlMean: pairs.reduce((s, p) => s + p.c, 0) / pairs.length });
  res.pass = res.diff >= PASS_ATR && res.lo > 0; res.calmer = res.hi < 0;
  return res;
}
const line = r => !r.scored ? `    ${r.label} ${r.outcome}: n=${r.n} (${r.paired} paired) — below MIN_N, not scored`
  : `    ${r.label} ${r.outcome}: n=${r.n}  setup ${r.setupMean.toFixed(3)} vs control ${r.ctlMean.toFixed(3)}  diff ${fmt(r.diff)} [${fmt(r.lo)}, ${fmt(r.hi)}]  ${r.pass ? 'PASS' : r.calmer ? 'calmer' : 'null'}`;
const bootShare = (bools, seed) => { const rnd = mulberry32(seed); const n = bools.length; if (!n) return { p: null, lo: null, hi: null }; const ps = []; for (let k = 0; k < REPS; k++) { let c = 0; for (let j = 0; j < n; j++) if (bools[Math.floor(rnd() * n)]) c++; ps.push(c / n); } ps.sort((a, b) => a - b); return { p: bools.filter(Boolean).length / n, lo: ps[Math.floor(REPS * 0.025)], hi: ps[Math.floor(REPS * 0.975)] }; };
const bootDiffShare = (a, b, seed) => { const rnd = mulberry32(seed); const ds = []; for (let k = 0; k < REPS; k++) { let ca = 0, cb = 0; for (let j = 0; j < a.length; j++) if (a[Math.floor(rnd() * a.length)]) ca++; for (let j = 0; j < b.length; j++) if (b[Math.floor(rnd() * b.length)]) cb++; ds.push(ca / a.length - cb / b.length); } ds.sort((x, y) => x - y); return { diff: a.filter(Boolean).length / a.length - b.filter(Boolean).length / b.length, lo: ds[Math.floor(REPS * 0.025)], hi: ds[Math.floor(REPS * 0.975)] }; };
const R1 = r => r.date >= '2022-01-01';
const pc = x => x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`;

// ═══ T1 inside day / NR7 → expansion ═════════════════════════════════════════
if (want('T1')) {
  log('\n═══ T1  inside day / NR7 → next-session range ═══');
  const out = {};
  for (const inst of Object.keys(T)) {
    const rows = T[inst].rows;
    const inside = r => rows[r.i - 1] && r.h <= rows[r.i - 1].h && r.l >= rows[r.i - 1].l;
    const nr7 = r => r.i >= 7 && rows.slice(r.i - 6, r.i).every(p => (r.h - r.l) <= (p.h - p.l));
    const o = {};
    for (const [tag, f] of [['inside day', inside], ['NR7', nr7]]) {
      const days = T[inst].pop.filter(f);
      const up = bootShare(days.map(r => r.upNext).filter(x => x != null).map(Boolean), SEED + 1);
      for (const t of [paired(inst, days, 'r1', { excludeFn: r => inside(r) || nr7(r), label: `${inst} ${tag}` }), paired(inst, days, 'r5', { excludeFn: r => inside(r) || nr7(r), label: `${inst} ${tag}` }), paired(inst, days.filter(R1), 'r1', { excludeFn: r => inside(r) || nr7(r), label: `${inst} ${tag} R1` })]) { log(line(t)); (o[tag] ??= { tests: [] }).tests.push(t); }
      log(`      next-day close>open after ${tag}: ${pc(up.p)} [${pc(up.lo)}, ${pc(up.hi)}] (base rate; n=${days.length})`);
      o[tag].upNext = up; o[tag].n = days.length;
    }
    out[inst] = o;
  }
  results.studies.T1 = out;
}

// ═══ T2 first hour as a fraction of the day (base rates) ═════════════════════
if (want('T2')) {
  log('\n═══ T2  first hour after London 07:00 / New York 13:30 as a fraction of the session range ═══');
  const out = {};
  log(`  ${'instrument'.padEnd(8)} n      London h1 p25/p50/p75      NY h1 p25/p50/p75      h1 high/low held as session extreme`);
  for (const inst of Object.keys(T)) {
    const pop = T[inst].pop.filter(r => r.h1Frac != null && r.ny1Frac != null && r.h - r.l > 0);
    const l = pop.map(r => r.h1Frac), n = pop.map(r => r.ny1Frac);
    const held = bootShare(pop.map(r => !!r.h1Held), SEED + 2);
    log(`  ${inst.padEnd(8)} ${String(pop.length).padStart(5)}   ${pc(pct(l, .25))} / ${pc(pct(l, .5))} / ${pc(pct(l, .75))}            ${pc(pct(n, .25))} / ${pc(pct(n, .5))} / ${pc(pct(n, .75))}             ${pc(held.p)} [${pc(held.lo)}, ${pc(held.hi)}]`);
    out[inst] = { n: pop.length, london: [pct(l, .25), pct(l, .5), pct(l, .75)], ny: [pct(n, .25), pct(n, .5), pct(n, .75)], h1Held: held };
  }
  results.studies.T2 = out;
}

// ═══ T3 trend-day recognition from early range expansion ═════════════════════
if (want('T3')) {
  log('\n═══ T3  first 2h after London open ≥ 0.6 ATR → the rest of the day ═══');
  const out = {};
  for (const inst of Object.keys(T)) {
    const o = {};
    for (const [tag, thr] of [['≥0.6 ATR', 0.6], ['≥0.8 ATR (R2)', 0.8]]) {
      const f = r => r.h2Atr != null && r.h2Atr >= thr;
      const days = T[inst].pop.filter(f);
      const ctlPool = T[inst].pop.filter(r => r.h2Atr != null && r.h2Atr < 0.4);   // ordinary mornings, for the base-rate comparisons
      const tFull = paired(inst, days, 'rng', { excludeFn: f, label: `${inst} ${tag} full-session range` });
      const tRest = paired(inst, days, 'rest', { excludeFn: f, label: `${inst} ${tag} range AFTER 09:00` });
      log(line(tFull)); log(line(tRest));
      const trend = r => r.closePos != null && (r.closePos >= 0.8 || r.closePos <= 0.2);
      const cont = r => r.move2 != null && Math.sign(r.c - r.o) === Math.sign(r.move2) && r.move2 !== 0;
      const dT = bootDiffShare(days.map(trend), ctlPool.map(trend), SEED + 3), dC = bootDiffShare(days.map(cont), ctlPool.map(cont), SEED + 4);
      const sT = bootShare(days.map(trend), SEED + 5), cT = bootShare(ctlPool.map(trend), SEED + 6), sC = bootShare(days.map(cont), SEED + 7), cC = bootShare(ctlPool.map(cont), SEED + 8);
      const find = d => Math.abs(d.diff) >= 0.15 && (d.lo > 0 || d.hi < 0) ? 'FINDING' : 'no different';
      log(`      trend-day close (top/bottom 20%): setup ${pc(sT.p)} vs ordinary mornings ${pc(cT.p)} → diff ${fmt(dT.diff * 100, 0)}pp [${fmt(dT.lo * 100, 0)}, ${fmt(dT.hi * 100, 0)}]  ${find(dT)}   |   close on the side of the 2h move: setup ${pc(sC.p)} vs ${pc(cC.p)} → diff ${fmt(dC.diff * 100, 0)}pp [${fmt(dC.lo * 100, 0)}, ${fmt(dC.hi * 100, 0)}]  ${find(dC)}   n=${days.length}`);
      o[tag] = { n: days.length, full: tFull, rest: tRest, trendDay: { setup: sT, ctl: cT, diff: dT }, continuation: { setup: sC, ctl: cC, diff: dC } };
    }
    out[inst] = o;
  }
  results.studies.T3 = out;
}
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { studies: {} };
fs.writeFileSync(OUT, JSON.stringify({ ...prev, ranAt: results.ranAt, dropped: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.dropped])), studies: { ...prev.studies, ...results.studies } }, null, 1));
log('\nwrote ' + path.relative(process.cwd(), OUT));
