// Growth stocks vs yields → Nasdaq range. Pre-registered in
// MD files/GROWTH_VS_YIELDS_TEST.md (commit 9e24f44) before this was first run.
//
//   node analysis/growth_vs_yields_study.mjs            (needs OANDA_KEY in env)
//
// Claim: when yields have moved sharply and growth stocks have moved with or
// against them, Nasdaq's next session is unusually wide. Four setups (S1..S4,
// see the MD), primary outcome next-day range / ATR14, one paired control per
// setup day (different ISO week, same ATR-percentile quintile, same 20-day
// trend tercile, not itself in any setup), ISO-week block bootstrap.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1 } from '../js/volBacktestEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });
const REPS = 1000, MIN_N = 40, SEED = 20260917;
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── data ────────────────────────────────────────────────────────────────────
async function fred(id) {
  const csv = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`).then(r => { if (!r.ok) throw new Error(`${id} HTTP ${r.status}`); return r.text(); });
  const out = new Map();
  for (const line of csv.split('\n').slice(1)) { const [d, v] = line.trim().split(','); const x = parseFloat(v); if (d && Number.isFinite(x)) out.set(d, x); }
  return out;
}
const nq = (await fetchD1('NAS100_USD', 5000)).sort((a, b) => a.date < b.date ? -1 : 1);
const [dgs10, dfii10] = await Promise.all([fred('DGS10'), fred('DFII10')]);
console.log(`NAS100 bars ${nq.length} (${nq[0].date} → ${nq.at(-1).date}); DGS10 ${dgs10.size}; DFII10 ${dfii10.size}`);

// ── features on the merged calendar ─────────────────────────────────────────
const rows = [];
for (let i = 0; i < nq.length; i++) {
  const b = nq[i];
  rows.push({ i, date: b.date, o: b.open, h: b.high, l: b.low, c: b.close, y10: dgs10.get(b.date) ?? null, yr: dfii10.get(b.date) ?? null });
}
// ATR14, trailing 250d ATR% percentile, 20d trend tercile, 5d features, outcomes
const tr = (r, p) => Math.max(r.h - r.l, Math.abs(r.h - p.c), Math.abs(r.l - p.c));
for (let i = 1; i < rows.length; i++) rows[i].tr = tr(rows[i], rows[i - 1]);
for (let i = 14; i < rows.length; i++) rows[i].atr = rows.slice(i - 13, i + 1).reduce((s, r) => s + r.tr, 0) / 14;
for (let i = 0; i < rows.length; i++) rows[i].week = isoWeek(rows[i].date);
// carry the last known yield forward across OANDA sessions FRED does not have (holidays)
for (let i = 1; i < rows.length; i++) { if (rows[i].y10 == null) rows[i].y10 = rows[i - 1].y10; if (rows[i].yr == null) rows[i].yr = rows[i - 1].yr; }
for (let i = 264; i < rows.length - 5; i++) {
  const r = rows[i];
  if (!r.atr || r.y10 == null || rows[i - 5].y10 == null) continue;
  r.atrPct = r.atr / r.c;
  const win = rows.slice(i - 250, i).map(x => x.atr / x.c).filter(Number.isFinite);
  r.atrRank = win.filter(v => v < r.atrPct).length / win.length;
  r.atrQ = Math.min(4, Math.floor(r.atrRank * 5));
  r.trend20 = Math.log(r.c / rows[i - 20].c);
  r.y5 = (r.y10 - rows[i - 5].y10) * 100;
  r.yr5 = (r.yr != null && rows[i - 5].yr != null) ? (r.yr - rows[i - 5].yr) * 100 : null;
  r.nq5 = Math.log(r.c / rows[i - 5].c) * 100;
  const n1 = rows[i + 1];
  r.out1 = (n1.h - n1.l) / r.atr;
  r.abs1 = Math.abs(Math.log(n1.c / r.c)) * 100;
  const fwd = rows.slice(i + 1, i + 6);
  r.out5 = (Math.max(...fwd.map(x => x.h)) - Math.min(...fwd.map(x => x.l))) / r.atr;
  r.ret5 = Math.log(fwd.at(-1).c / r.c) * 100;
  r.ok = true;
}
const pop = rows.filter(r => r.ok);
const terc = (() => { const v = pop.map(r => r.trend20).sort((a, b) => a - b); return [v[Math.floor(v.length / 3)], v[Math.floor(2 * v.length / 3)]]; })();
for (const r of pop) r.trendT = r.trend20 < terc[0] ? 0 : r.trend20 < terc[1] ? 1 : 2;
function isoWeek(d) { const t = new Date(d + 'T00:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(); const jan4 = new Date(Date.UTC(y, 0, 4)); return `${y}-${Math.round(((t - jan4) / 864e5 + ((jan4.getUTCDay() + 6) % 7)) / 7) + 1}`; }

// ── setups, controls, bootstrap ─────────────────────────────────────────────
const SETUPS = (yb, nb, key = 'y5') => ({
  S1: { label: `rates up ≥${yb}bp, growth down ≤−${nb}% (textbook)`, f: r => r[key] >= yb && r.nq5 <= -nb },
  S2: { label: `rates up ≥${yb}bp, growth up ≥+${nb}% (divergent)`, f: r => r[key] >= yb && r.nq5 >= nb },
  S3: { label: `rates down ≤−${yb}bp, growth up ≥+${nb}% (textbook, mirror)`, f: r => r[key] <= -yb && r.nq5 >= nb },
  S4: { label: `rates down ≤−${yb}bp, growth down ≤−${nb}% (divergent, mirror)`, f: r => r[key] <= -yb && r.nq5 <= -nb },
});
function run(name, popIn, setups) {
  const rnd = mulberry32(SEED);
  const inAny = new Set(); for (const s of Object.values(setups)) for (const r of popIn) if (s.f(r)) inAny.add(r.i);
  const controlsPool = popIn.filter(r => !inAny.has(r.i));
  const byCell = new Map(); for (const r of controlsPool) { const k = `${r.atrQ}|${r.trendT}`; (byCell.get(k) ?? byCell.set(k, []).get(k)).push(r); }
  const lines = [`\n== ${name}  (population ${popIn.length} days, ${inAny.size} in any setup, ${controlsPool.length} eligible controls) ==`];
  const res = {};
  for (const [id, s] of Object.entries(setups)) {
    const days = popIn.filter(s.f);
    const pairs = [];
    let noCtl = 0;
    for (const d of days) {
      const cands = (byCell.get(`${d.atrQ}|${d.trendT}`) ?? []).filter(c => c.week !== d.week);
      if (!cands.length) { noCtl++; continue; }
      const c = cands[Math.floor(rnd() * cands.length)];
      pairs.push({ week: d.week, d1: d.out1 - c.out1, d5: d.out5 - c.out5, a1: d.abs1 - c.abs1, r5: d.ret5, out1: d.out1, cout1: c.out1 });
    }
    const boot = key => {
      const weeks = [...new Set(pairs.map(p => p.week))]; const byW = new Map(); for (const p of pairs) (byW.get(p.week) ?? byW.set(p.week, []).get(p.week)).push(p[key]);
      const means = [];
      for (let k = 0; k < REPS; k++) { let s = 0, n = 0; for (let j = 0; j < weeks.length; j++) { const w = byW.get(weeks[Math.floor(rnd() * weeks.length)]); for (const v of w) { s += v; n++; } } means.push(s / n); }
      means.sort((a, b) => a - b);
      return { mean: pairs.reduce((s, p) => s + p[key], 0) / pairs.length, lo: means[Math.floor(REPS * 0.025)], hi: means[Math.floor(REPS * 0.975)] };
    };
    if (pairs.length < MIN_N) { lines.push(`${id} ${s.label}: n=${days.length} (${pairs.length} paired, ${noCtl} no control) — BELOW MIN_N ${MIN_N}, not scored`); res[id] = { n: days.length, paired: pairs.length, scored: false }; continue; }
    const b1 = boot('d1'), b5 = boot('d5'), a1 = boot('a1');
    const setupMean = pairs.reduce((s, p) => s + p.out1, 0) / pairs.length, ctlMean = pairs.reduce((s, p) => s + p.cout1, 0) / pairs.length;
    const up5 = pairs.filter(p => p.r5 > 0).length / pairs.length;
    const pass = b1.mean >= 0.10 && b1.lo > 0;
    lines.push(`${id} ${s.label}: n=${days.length} (${pairs.length} paired, ${noCtl} no control)`);
    lines.push(`    next-day range/ATR  setup ${setupMean.toFixed(3)} vs control ${ctlMean.toFixed(3)}  diff ${fmt(b1.mean)} [${fmt(b1.lo)}, ${fmt(b1.hi)}]  ${pass ? 'PASS' : 'null'}`);
    lines.push(`    next-5d range/ATR   diff ${fmt(b5.mean)} [${fmt(b5.lo)}, ${fmt(b5.hi)}]   |  next-day |ret| diff ${fmt(a1.mean)}pp [${fmt(a1.lo)}, ${fmt(a1.hi)}]   |  5d up-share ${(up5 * 100).toFixed(0)}% (exploratory)`);
    res[id] = { n: days.length, paired: pairs.length, scored: true, d1: b1, d5: b5, a1, up5, pass, setupMean, ctlMean };
  }
  console.log(lines.join('\n'));
  return res;
}
const fmt = x => `${x >= 0 ? '+' : ''}${x.toFixed(3)}`;

const base = pop.reduce((s, r) => s + r.out1, 0) / pop.length;
console.log(`\nPopulation ${pop.length} days ${pop[0].date} → ${pop.at(-1).date}; unconditional next-day range ${base.toFixed(3)} ATR`);
const results = {
  main: run('MAIN  DGS10, 10bp / 1%', pop, SETUPS(10, 1)),
  r1: run('R1  2018-01-01 onward', pop.filter(r => r.date >= '2018-01-01'), SETUPS(10, 1)),
  r2: run('R2  thresholds 15bp / 2%', pop, SETUPS(15, 2)),
  r3: run('R3  real yield (DFII10) instead of nominal', pop.filter(r => r.yr5 != null), SETUPS(10, 1, 'yr5')),
};
// population audit: every filter step
const audit = { bars: nq.length, withAtrAndYields: pop.length, S1: pop.filter(SETUPS(10, 1).S1.f).length, S2: pop.filter(SETUPS(10, 1).S2.f).length, S3: pop.filter(SETUPS(10, 1).S3.f).length, S4: pop.filter(SETUPS(10, 1).S4.f).length };
console.log('\nPopulation audit:', JSON.stringify(audit));
fs.writeFileSync(path.join(OUT, 'growth_vs_yields_study.json'), JSON.stringify({ ranAt: new Date().toISOString(), base, audit, results }, null, 1));
console.log(`\nwrote analysis/output/growth_vs_yields_study.json`);

// ── POST-HOC (added after the first run, labelled as such) ──────────────────
// S1 and S4 both passed and S2 and S3 both failed: the sign of the YIELD move is
// opposite between the two passes and between the two nulls, so what separates
// pass from null is Nasdaq's own 5-day direction, not yields. Check directly.
const POST = {
  T1: { label: 'growth down ≤−1%, rates QUIET (|Δ5| < 5bp)', f: r => r.nq5 <= -1 && Math.abs(r.y5) < 5 },
  T2: { label: 'growth down ≤−1%, any rates', f: r => r.nq5 <= -1 },
  T3: { label: 'growth up ≥+1%, rates QUIET (|Δ5| < 5bp)', f: r => r.nq5 >= 1 && Math.abs(r.y5) < 5 },
  T4: { label: 'rates up ≥10bp, growth FLAT (|nq5| < 1%)', f: r => r.y5 >= 10 && Math.abs(r.nq5) < 1 },
};
const post = run('POST-HOC  is it yields, or just Nasdaq falling?', pop, POST);
const j = JSON.parse(fs.readFileSync(path.join(OUT, 'growth_vs_yields_study.json'), 'utf8'));
j.postHoc = post; fs.writeFileSync(path.join(OUT, 'growth_vs_yields_study.json'), JSON.stringify(j, null, 1));
