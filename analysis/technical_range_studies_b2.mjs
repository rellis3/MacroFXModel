// Batch 2 of the technical range tests (M1 harness): T3b, T4, T5, T6.
// Pre-registered in MD files/TECHNICAL_RANGE_TESTS.md (commit 0e68f7a) before running.
//   node --max-old-space-size=8192 analysis/technical_range_studies_b2.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'technical_range_studies.json');
const REPS = 1000, MIN_N = 40, SEED = 20260918, PASS_ATR = 0.10;
const INSTR = { EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', AUDUSD: 'audusd', USDCAD: 'usdcad', GOLD: 'gold', NQ: 'nas100_usd', SPX500: 'spx500' };
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = (x, dp = 3) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const pc = x => x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`;
const log = (...a) => console.log(...a);
function isoWeek(d) { const t = new Date(d + 'T00:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(); const jan4 = new Date(Date.UTC(y, 0, 4)); return `${y}-${Math.round(((t - jan4) / 864e5 + ((jan4.getUTCDay() + 6) % 7)) / 7) + 1}`; }
const londonHM = t => { const d = new Date(t * 1000); const s = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }); const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const results = { studies: {} };
const bootShare = (bools, seed) => { const rnd = mulberry32(seed); const n = bools.length; if (!n) return { p: null, lo: null, hi: null, n: 0 }; const ps = []; for (let k = 0; k < REPS; k++) { let c = 0; for (let j = 0; j < n; j++) if (bools[Math.floor(rnd() * n)]) c++; ps.push(c / n); } ps.sort((a, b) => a - b); return { p: bools.filter(Boolean).length / n, lo: ps[Math.floor(REPS * 0.025)], hi: ps[Math.floor(REPS * 0.975)], n }; };
const bootDiffShare = (a, b, seed) => { const rnd = mulberry32(seed); const ds = []; for (let k = 0; k < REPS; k++) { let ca = 0, cb = 0; for (let j = 0; j < a.length; j++) if (a[Math.floor(rnd() * a.length)]) ca++; for (let j = 0; j < b.length; j++) if (b[Math.floor(rnd() * b.length)]) cb++; ds.push(ca / a.length - cb / b.length); } ds.sort((x, y) => x - y); return { diff: a.filter(Boolean).length / a.length - b.filter(Boolean).length / b.length, lo: ds[Math.floor(REPS * 0.025)], hi: ds[Math.floor(REPS * 0.975)] }; };
const bootMean = (v, seed) => { const rnd = mulberry32(seed); const n = v.length; if (!n) return { mean: null, lo: null, hi: null }; const ms = []; for (let k = 0; k < REPS; k++) { let s = 0; for (let j = 0; j < n; j++) s += v[Math.floor(rnd() * n)]; ms.push(s / n); } ms.sort((a, b) => a - b); return { mean: v.reduce((s, x) => s + x, 0) / n, lo: ms[Math.floor(REPS * 0.025)], hi: ms[Math.floor(REPS * 0.975)] }; };
const find = d => Math.abs(d.diff) >= 0.15 && (d.lo > 0 || d.hi < 0) ? 'FINDING' : 'no different';

const T = {};
for (const [inst, key] of Object.entries(INSTR)) {
  let packed; try { packed = await loadM1ForPair(key); } catch (e) { log(`  ${inst}: ${e.message}`); continue; }
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const all = [...sessions.keys()].sort();
  const dates = all.filter(d => (sessions.get(d)?.length ?? 0) >= 300);
  const rows = dates.map((date, i) => { const b = sessions.get(date); let hi = -Infinity, lo = Infinity; for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; } return { i, date, o: b[0].open, h: hi, l: lo, c: b[b.length - 1].close, week: isoWeek(date), dow: new Date(date + 'T00:00:00Z').getUTCDay(), bars: b }; });
  const tr = (r, p) => Math.max(r.h - r.l, Math.abs(r.h - p.c), Math.abs(r.l - p.c));
  for (let i = 1; i < rows.length; i++) rows[i].tr = tr(rows[i], rows[i - 1]);
  for (let i = 14; i < rows.length; i++) { let s = 0; for (let k = i - 13; k <= i; k++) s += rows[k].tr; rows[i].atr = s / 14; }
  for (let i = 264; i < rows.length; i++) {
    const r = rows[i]; const atrPrev = rows[i - 1].atr; if (!r.atr || !atrPrev) continue;
    const win = rows.slice(i - 250, i).map(x => x.atr / x.c).filter(Number.isFinite);
    r.atrQ = Math.min(4, Math.floor(win.filter(v => v < r.atr / r.c).length / win.length * 5));
    r.trend20 = Math.log(r.c / rows[i - 20].c);
    r.rng = (r.h - r.l) / atrPrev; r.atrPrev = atrPrev;
    const f5 = rows.slice(i + 1, i + 6); if (f5.length === 5) r.r5 = (Math.max(...f5.map(x => x.h)) - Math.min(...f5.map(x => x.l))) / r.atr;
    const b = r.bars;
    const hm = b.map(x => londonHM(x.time));
    // T3b: first 2h and the 09:00 price
    const i2 = hm.findIndex(m => m >= 540); const win2 = b.filter((x, k) => hm[k] >= 420 && hm[k] < 540);
    if (win2.length && i2 > 0) { r.h2Atr = (Math.max(...win2.map(x => x.high)) - Math.min(...win2.map(x => x.low))) / atrPrev; r.move2 = win2[win2.length - 1].close - r.o; r.p9 = b[i2].open; r.after9 = r.c - r.p9; }
    // T4: opening range 07:00-08:00, first close beyond it before 13:30
    const or = b.filter((x, k) => hm[k] >= 420 && hm[k] < 480);
    if (or.length >= 30) {
      const orH = Math.max(...or.map(x => x.high)), orL = Math.min(...or.map(x => x.low)), orW = orH - orL;
      let brk = -1, side = 0;
      for (let k = 0; k < b.length; k++) { if (hm[k] < 480 || hm[k] >= 810) continue; if (b[k].close > orH) { brk = k; side = 1; break; } if (b[k].close < orL) { brk = k; side = -1; break; } }
      if (brk > 0 && orW > 0) {
        const after = b.slice(brk + 1);
        const ext = side > 0 ? Math.max(...after.map(x => x.high)) - orH : orL - Math.min(...after.map(x => x.low));
        // returned inside within 60 minutes?
        let backIn = false, extBeforeBack = 0; for (let k = brk + 1; k < b.length && hm[k] - hm[brk] <= 60; k++) { const inside = b[k].close <= orH && b[k].close >= orL; if (inside) { backIn = true; break; } extBeforeBack = Math.max(extBeforeBack, side > 0 ? b[k].high - orH : orL - b[k].low); }
        // speed at the break: |Δclose over the prior 15 bars| / ATR (tapeSpeedEngine convention, per-bar)
        const s15 = brk >= 15 ? Math.abs(b[brk].close - b[brk - 15].close) / 15 / atrPrev : null;
        r.orb = { side, orW, follow: extBeforeBack >= 0.5 * orW || (!backIn && ext >= 0.5 * orW), fade: backIn, closeBeyond: side > 0 ? r.c > orH : r.c < orL, rangeAfter: (Math.max(...after.map(x => x.high)) - Math.min(...after.map(x => x.low))) / atrPrev, speed: s15, hm: hm[brk] };
      } else r.orb = null;
    }
    r.ok = true;
  }
  const pop = rows.filter(r => r.ok);
  const v = pop.map(r => r.trend20).sort((a, b) => a - b), t1 = v[Math.floor(v.length / 3)], t2 = v[Math.floor(2 * v.length / 3)];
  for (const r of pop) r.trendT = r.trend20 < t1 ? 0 : r.trend20 < t2 ? 1 : 2;
  // T5: Monday gap vs Friday close (indices, gold)
  for (let i = 1; i < rows.length; i++) { const r = rows[i], p = rows[i - 1]; if (r.dow === 1 && r.atrPrev) { r.gap = (r.o - p.c) / r.atrPrev; r.gapFilledDay = r.gap > 0 ? r.l <= p.c : r.h >= p.c; const f5 = rows.slice(i, i + 5); r.gapFilled5 = r.gap > 0 ? f5.some(x => x.l <= p.c) : f5.some(x => x.h >= p.c); } }
  for (const r of rows) delete r.bars;
  T[inst] = { rows, pop };
  log(`  ${inst}: ${pop.length} sessions with features`);
}
function paired(inst, days, outcome, { excludeFn = null, seed = SEED, label = '' } = {}) {
  const pop = T[inst].pop.filter(r => r[outcome] != null);
  const setupIdx = new Set(days.map(r => r.i));
  const pool = pop.filter(r => !setupIdx.has(r.i) && !(excludeFn && excludeFn(r)));
  const cell = new Map(); for (const r of pool) { const k = `${r.atrQ}|${r.trendT}`; (cell.get(k) ?? cell.set(k, []).get(k)).push(r); }
  const rnd = mulberry32(seed); const pairs = [];
  for (const d of days) { if (d[outcome] == null) continue; const c = (cell.get(`${d.atrQ}|${d.trendT}`) ?? []).filter(x => x.week !== d.week); if (!c.length) continue; const x = c[Math.floor(rnd() * c.length)]; pairs.push({ week: d.week, d: d[outcome] - x[outcome], s: d[outcome], c: x[outcome] }); }
  const res = { label, inst, outcome, n: days.length, paired: pairs.length, scored: pairs.length >= MIN_N };
  if (!res.scored) return res;
  const weeks = [...new Set(pairs.map(p => p.week))], byW = new Map(); for (const p of pairs) (byW.get(p.week) ?? byW.set(p.week, []).get(p.week)).push(p.d);
  const means = []; for (let k = 0; k < REPS; k++) { let s = 0, n = 0; for (let j = 0; j < weeks.length; j++) for (const v of byW.get(weeks[Math.floor(rnd() * weeks.length)])) { s += v; n++; } means.push(s / n); } means.sort((a, b) => a - b);
  Object.assign(res, { diff: pairs.reduce((s, p) => s + p.d, 0) / pairs.length, lo: means[Math.floor(REPS * 0.025)], hi: means[Math.floor(REPS * 0.975)], setupMean: pairs.reduce((s, p) => s + p.s, 0) / pairs.length, ctlMean: pairs.reduce((s, p) => s + p.c, 0) / pairs.length });
  res.pass = res.diff >= PASS_ATR && res.lo > 0; res.calmer = res.hi < 0; return res;
}
const line = r => !r.scored ? `    ${r.label} ${r.outcome}: n=${r.n} (${r.paired} paired) — below MIN_N` : `    ${r.label} ${r.outcome}: n=${r.n}  setup ${r.setupMean.toFixed(3)} vs control ${r.ctlMean.toFixed(3)}  diff ${fmt(r.diff)} [${fmt(r.lo)}, ${fmt(r.hi)}]  ${r.pass ? 'PASS' : r.calmer ? 'calmer' : 'null'}`;

// ═══ T3b ══════════════════════════════════════════════════════════════════════
log('\n═══ T3b  after-09:00 continuation: sign(close − 09:00) = sign(2h move) ═══');
results.studies.T3b = {};
for (const inst of Object.keys(T)) {
  const pop = T[inst].pop.filter(r => r.h2Atr != null && r.after9 != null && r.move2 != null && r.move2 !== 0);
  const setup = pop.filter(r => r.h2Atr >= 0.6), ctl = pop.filter(r => r.h2Atr < 0.4);
  const cont = r => Math.sign(r.after9) === Math.sign(r.move2);
  const dS = bootShare(setup.map(cont), SEED + 1), dC = bootShare(ctl.map(cont), SEED + 2), dd = bootDiffShare(setup.map(cont), ctl.map(cont), SEED + 3);
  const mv = bootMean(setup.map(r => Math.sign(r.move2) * r.after9 / r.atrPrev), SEED + 4), mc = bootMean(ctl.map(r => Math.sign(r.move2) * r.after9 / r.atrPrev), SEED + 5);
  log(`    ${inst}: after-09:00 continued the morning in ${pc(dS.p)} [${pc(dS.lo)}, ${pc(dS.hi)}] of fast starts (n=${setup.length}) vs ${pc(dC.p)} on ordinary mornings → diff ${fmt(dd.diff * 100, 0)}pp [${fmt(dd.lo * 100, 0)}, ${fmt(dd.hi * 100, 0)}] ${find(dd)}; mean after-09:00 move in the morning's direction ${fmt(mv.mean, 2)} ATR [${fmt(mv.lo, 2)}, ${fmt(mv.hi, 2)}] vs ${fmt(mc.mean, 2)}`);
  results.studies.T3b[inst] = { n: setup.length, cont: dS, ctl: dC, diff: dd, meanAfter: mv, meanAfterCtl: mc };
}
// ═══ T4 ═══════════════════════════════════════════════════════════════════════
log('\n═══ T4  opening-range (07:00–08:00) breakout: follow-through or fade ═══');
results.studies.T4 = {};
for (const inst of Object.keys(T)) {
  const brk = T[inst].pop.filter(r => r.orb);
  const noBrk = T[inst].pop.filter(r => r.orb === null);
  const fol = bootShare(brk.map(r => r.orb.follow), SEED + 6), fad = bootShare(brk.map(r => r.orb.fade), SEED + 7), cb = bootShare(brk.map(r => r.orb.closeBeyond), SEED + 8);
  log(`    ${inst}: breakouts ${brk.length} of ${brk.length + noBrk.length} sessions; extended ≥0.5×OR before returning ${pc(fol.p)} [${pc(fol.lo)}, ${pc(fol.hi)}]; back inside within 60m ${pc(fad.p)}; closed beyond ${pc(cb.p)} [${pc(cb.lo)}, ${pc(cb.hi)}]`);
  // by speed at the break: fastest tercile vs slowest
  const sp = brk.filter(r => r.orb.speed != null).map(r => r.orb.speed).sort((a, b) => a - b); const q1 = sp[Math.floor(sp.length / 3)], q2 = sp[Math.floor(2 * sp.length / 3)];
  const slow = brk.filter(r => r.orb.speed != null && r.orb.speed < q1), fast = brk.filter(r => r.orb.speed != null && r.orb.speed >= q2);
  const dF = bootDiffShare(fast.map(r => r.orb.follow), slow.map(r => r.orb.follow), SEED + 9), dCl = bootDiffShare(fast.map(r => r.orb.closeBeyond), slow.map(r => r.orb.closeBeyond), SEED + 10);
  log(`      fast-tape breaks (n=${fast.length}) vs slow (n=${slow.length}): follow-through ${pc(fast.filter(r => r.orb.follow).length / fast.length)} vs ${pc(slow.filter(r => r.orb.follow).length / slow.length)} → ${fmt(dF.diff * 100, 0)}pp [${fmt(dF.lo * 100, 0)}, ${fmt(dF.hi * 100, 0)}] ${find(dF)}; closed beyond ${pc(fast.filter(r => r.orb.closeBeyond).length / fast.length)} vs ${pc(slow.filter(r => r.orb.closeBeyond).length / slow.length)} → ${fmt(dCl.diff * 100, 0)}pp ${find(dCl)}`);
  for (const r of T[inst].pop) r.rangeAfterBrk = r.orb ? r.orb.rangeAfter : null;
  // range after the break vs matched non-breakout sessions' range after 08:00 -- approximate control: the non-break session's whole post-08:00 range
  results.studies.T4[inst] = { n: brk.length, sessions: brk.length + noBrk.length, follow: fol, fade: fad, closeBeyond: cb, fastVsSlowFollow: dF, fastVsSlowClose: dCl };
}
// ═══ T5 ═══════════════════════════════════════════════════════════════════════
log('\n═══ T5  Monday gap vs Friday close (indices, gold) ═══');
results.studies.T5 = {};
for (const inst of ['NQ', 'SPX500', 'GOLD']) {
  const mons = T[inst].rows.filter(r => r.gap != null && r.ok);
  const o = {};
  for (const [tag, lo, hi] of [['<0.25 ATR', 0, 0.25], ['0.25–0.5', 0.25, 0.5], ['>0.5 ATR', 0.5, Infinity]]) {
    const g = mons.filter(r => Math.abs(r.gap) >= lo && Math.abs(r.gap) < hi);
    if (g.length < 10) { log(`    ${inst} gap ${tag}: n=${g.length}, too few`); continue; }
    const fd = bootShare(g.map(r => r.gapFilledDay), SEED + 11), f5 = bootShare(g.map(r => r.gapFilled5), SEED + 12);
    const t = paired(inst, g, 'rng', { excludeFn: r => r.dow === 1, label: `${inst} Monday gap ${tag}` });
    log(`    ${inst} gap ${tag}: n=${g.length}; filled same session ${pc(fd.p)} [${pc(fd.lo)}, ${pc(fd.hi)}]; within 5 sessions ${pc(f5.p)}`); log(line(t));
    o[tag] = { n: g.length, filledDay: fd, filled5: f5, range: t };
  }
  results.studies.T5[inst] = o;
}
// ═══ T6 ═══════════════════════════════════════════════════════════════════════
log('\n═══ T6  calendar range profiles (range / ATR14, vs all sessions) ═══');
results.studies.T6 = {};
const DOW = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };
for (const inst of Object.keys(T)) {
  const pop = T[inst].pop.filter(r => r.rng != null);
  const all = bootMean(pop.map(r => r.rng), SEED + 13);
  const parts = [];
  const o = { all: all.mean };
  for (const d of [1, 2, 3, 4, 5]) { const v = pop.filter(r => r.dow === d).map(r => r.rng); const b = bootMean(v, SEED + 14 + d); parts.push(`${DOW[d]} ${b.mean.toFixed(2)}${(b.lo > all.mean || b.hi < all.mean) ? '*' : ''}`); o[DOW[d]] = b; }
  const monthEnd = r => { const d = new Date(r.date + 'T00:00:00Z'); const nx = new Date(d); nx.setUTCDate(nx.getUTCDate() + 1); const n2 = new Date(d); n2.setUTCDate(n2.getUTCDate() + 4); return nx.getUTCMonth() !== d.getUTCMonth() || n2.getUTCMonth() !== d.getUTCMonth() && d.getUTCDate() >= 27; };
  const qEnd = r => monthEnd(r) && [2, 5, 8, 11].includes(new Date(r.date + 'T00:00:00Z').getUTCMonth());
  const mStart = r => new Date(r.date + 'T00:00:00Z').getUTCDate() <= 2;
  for (const [tag, f] of [['month-end (last 2)', monthEnd], ['quarter-end', qEnd], ['month-start (first 2)', mStart]]) { const v = pop.filter(f).map(r => r.rng); const b = bootMean(v, SEED + 20); parts.push(`${tag} ${b.mean?.toFixed(2)}${b.mean != null && (b.lo > all.mean || b.hi < all.mean) ? '*' : ''} (n=${v.length})`); o[tag] = b; }
  log(`    ${inst}: all ${all.mean.toFixed(2)} · ${parts.join(' · ')}   (* = interval clear of the all-sessions mean)`);
  results.studies.T6[inst] = o;
}
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { studies: {} };
fs.writeFileSync(OUT, JSON.stringify({ ...prev, ranAtB2: new Date().toISOString(), studies: { ...prev.studies, ...results.studies } }, null, 1));
log('\nwrote ' + path.relative(process.cwd(), OUT));
