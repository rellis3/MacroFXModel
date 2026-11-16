// scripts/roc-stall/run.mjs: the registered run of roc-stall-50d (forge/ROC_STALL_50D_PREREG.md). Holdout opened here, once.
//   node scripts/roc-stall/run.mjs <daily.json> <outdir>
import fs from 'node:fs';
import path from 'node:path';
import { loadDaily, features, eventsAndControl, sums, pooled, eventCount, monthFilter, bootstrap, pTwoSided, holm, CELLS, rng, START, DISC_END, HOLD_START } from './lib.mjs';

const SEED = 20261116, B_MAIN = 2000, B_PLACEBO = 500, B_SERIES = 400, B_DESC = 1000;
const [file, outdir = '.'] = process.argv.slice(2);
const daily = loadDaily(file), names = Object.keys(daily);
const Fs = {}; for (const k of names) Fs[k] = features(daily[k]);
const f4 = x => +Number(x).toFixed(4);
const R = rng(SEED + 7);

const perSeriesFor = (F, cell) => names.map(k => sums(F[k], cell.flag, cell.outcome, cell.h));
const effPlus = (per, filter, k, B, seed) => { const e = pooled(per, filter), bs = bootstrap(per, filter, k, B, seed); return { effect: f4(e), lo: f4(bs.lo), hi: f4(bs.hi), sd: f4(bs.sd), n: eventCount(per, filter) }; };

const results = { prereg: 'forge/ROC_STALL_50D_PREREG.md', seed: SEED, runAt: new Date().toISOString(), series: names, window: [START, '2026-08-21'], cells: {}, descriptive: {} };
const pvals = [];

for (const cell of CELLS) {
  const per = perSeriesFor(Fs, cell), r = { id: cell.id, label: cell.label, expect: cell.expect, bar: cell.bar };
  r.disc = effPlus(per, monthFilter('disc'), cell.k, B_MAIN, SEED + 1);
  r.hold = effPlus(per, monthFilter('hold'), cell.k, B_MAIN, SEED + 2);
  r.h1 = f4(pooled(per, monthFilter('hold', 'h1'))); r.h2 = f4(pooled(per, monthFilter('hold', 'h2')));
  r.p = pTwoSided(r.hold.effect, r.hold.sd); pvals.push(r.p);
  // shift placebo on the holdout: independent circular rotation per series
  const eff = []; for (let b = 0; b < B_PLACEBO; b++) { const pp = names.map(k => { const F = Fs[k]; const sh = 100 + Math.floor(R() * (F.N - 200)); return sums(F, cell.flag, cell.outcome, cell.h, sh); }); const e = pooled(pp, monthFilter('hold')); if (Number.isFinite(e)) eff.push(e * cell.expect); }
  eff.sort((a, b) => a - b); const q95 = eff[Math.floor(0.95 * eff.length)], real = r.hold.effect * cell.expect;
  r.placebo = { q95: f4(q95), mean: f4(eff.reduce((a, b) => a + b, 0) / eff.length), pct: f4(eff.filter(v => v <= real).length / eff.length), beats95: real > q95, draws: eff.length };
  // leave one series out
  r.loso = names.map((k, i) => ({ k, e: f4(pooled(per.filter((_, j) => j !== i), monthFilter('hold'))) }));
  r.losoSignOk = r.loso.every(x => Math.sign(x.e) === Math.sign(r.hold.effect) || x.e === 0);
  // per series (holdout) with bootstrap p, then BH q = 0.10
  r.perSeries = names.map((k, i) => { const one = [per[i]], f = monthFilter('hold'), e = pooled(one, f); if (!Number.isFinite(e)) return { k, e: null, n: 0 }; const bs = bootstrap(one, f, cell.k, B_SERIES, SEED + 100 + i); return { k, e: f4(e), sd: f4(bs.sd), p: pTwoSided(e, bs.sd), n: eventCount(one, f) }; });
  r.byYear = {}; for (let y = 2013; y <= 2026; y++) { const f = m => Math.floor(m / 12) === y; const e = pooled(per, f); if (Number.isFinite(e)) r.byYear[y] = { e: f4(e), n: eventCount(per, f) }; }
  results.cells[cell.id] = r;
}
const hm = holm(pvals, 0.05);
CELLS.forEach((cell, i) => {
  const r = results.cells[cell.id], sign = cell.expect, h = r.hold;
  const a = h.effect * sign > 0 && (sign > 0 ? h.lo > 0 : h.hi < 0);
  const b = r.disc.effect * sign > 0, c = r.h1 * sign > 0 && r.h2 * sign > 0, d = hm[i], e = r.placebo.beats95, f = r.losoSignOk;
  r.gate = { a, b, c, d, e, f }; r.holm = d;
  const inside = h.lo > -cell.bar && h.hi < cell.bar;
  const wrong = h.effect * sign < 0 && (sign > 0 ? h.hi < 0 : h.lo > 0);
  r.verdict = a && b && c && d && e ? (f ? 'VALIDATED' : 'CONTEXT') : inside ? 'NULL' : 'UNDERPOWERED';
  r.note = wrong ? 'interval excludes zero in the OPPOSITE direction to the registered one' : (a && b && c && d && e ? 'passes every gate' : '');
  r.material = Math.abs(h.effect) >= cell.bar;
});

// other horizons and lookbacks (descriptive; BH is applied across the whole descriptive table below)
const desc = [];
for (const flag of ['TOP', 'BOT', 'ACC_DN']) for (const [outc, hs] of [['Z', [5, 10, 20, 60]], ['LV', [10, 20, 60]]]) for (const h of hs) {
  const cell = { flag, outcome: outc, h, k: Math.max(1, Math.ceil(h / 21)) };
  const per = perSeriesFor(Fs, cell), e = effPlus(per, monthFilter('hold'), cell.k, B_DESC, SEED + 300 + h);
  desc.push({ flag, outcome: outc, h, ...e, p: pTwoSided(e.effect, e.sd) });
}
const bh = (ps, q = 0.10) => { const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), out = new Array(ps.length).fill(false); let kmax = -1; idx.forEach(([p], r) => { if (p <= q * (r + 1) / ps.length) kmax = r; }); for (let r = 0; r <= kmax; r++) out[idx[r][1]] = true; return out; };
const bhFlags = bh(desc.map(x => x.p)); desc.forEach((x, i) => { x.bh = bhFlags[i]; });
results.descriptive.horizons = desc;
results.descriptive.chanceBaseline = { tests: desc.length, expectedFalse: +(desc.length * 0.10).toFixed(1), passes: bhFlags.filter(Boolean).length };

// sensitivity (descriptive): thresholds and lookbacks, TOP stall -> Z20 / LV20
const sens = [];
for (const [label, opts] of [['pHi 0.70', { pHi: 0.70 }], ['pHi 0.90', { pHi: 0.90 }], ['band 0.15', { band: 0.15 }], ['band 0.35', { band: 0.35 }], ['ROC_20', { n: 20 }], ['ROC_100', { n: 100 }]]) {
  const F2 = {}; for (const k of names) F2[k] = features(daily[k], opts);
  for (const [outc, h] of [['Z', 20], ['LV', 20]]) { const per = names.map(k => sums(F2[k], 'TOP', outc, h)); sens.push({ variant: label, outcome: outc + h, ...effPlus(per, monthFilter('hold'), 1, 500, SEED + 500) }); }
}
results.descriptive.sensitivity = sens;

// descriptive facts: how often, how long, what usually follows
const facts = {};
for (const flag of ['TOP', 'BOT']) {
  let evHold = 0, yrs = 0, runs = [], zE = [], zC = [], lE = [], lC = [];
  for (const k of names) {
    const F = Fs[k], { ev, near } = eventsAndControl(F, flag), isEv = new Set(ev), f = F.flags[flag];
    let run = 0; for (let i = 0; i < F.N; i++) { if (f[i]) run++; else if (run) { runs.push(run); run = 0; } }
    for (let i = 0; i < F.N; i++) { if (F.date[i] < HOLD_START) continue; const z = F.Z[20][i], l = F.LV[20][i]; if (isEv.has(i)) { evHold++; if (Number.isFinite(z)) zE.push(z); if (Number.isFinite(l)) lE.push(l); } else if (!near[i]) { if (Number.isFinite(z)) zC.push(z); if (Number.isFinite(l)) lC.push(l); } }
    yrs += F.date.filter(d => d >= HOLD_START).length / 252;
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return f4(s[Math.floor(p * (s.length - 1))]); }, m = a => f4(a.reduce((x, y) => x + y, 0) / a.length);
  facts[flag] = { eventsPerSeriesYearHoldout: f4(evHold / yrs), meanRunSessions: f4(runs.reduce((a, b) => a + b, 0) / runs.length), z20: { event: { mean: m(zE), p10: q(zE, 0.1), median: q(zE, 0.5), p90: q(zE, 0.9), n: zE.length }, control: { mean: m(zC), p10: q(zC, 0.1), median: q(zC, 0.5), p90: q(zC, 0.9), n: zC.length } }, lv20: { event: { mean: m(lE), p10: q(lE, 0.1), median: q(lE, 0.5), p90: q(lE, 0.9) }, control: { mean: m(lC), p10: q(lC, 0.1), median: q(lC, 0.5), p90: q(lC, 0.9) } } };
}
results.descriptive.facts = facts;

fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(path.join(outdir, 'results.json'), JSON.stringify(results, null, 1));
console.log('cell  disc        hold [lo, hi]            h1/h2        MDE-bar  plc%  gates(abcdef)         verdict');
for (const cell of CELLS) { const r = results.cells[cell.id]; console.log(cell.id.padEnd(5), String(r.disc.effect).padEnd(8), String(r.hold.effect).padEnd(8), `[${r.hold.lo}, ${r.hold.hi}]`.padEnd(18), `${r.h1}/${r.h2}`.padEnd(14), String(cell.bar).padEnd(6), String(r.placebo.pct).padEnd(6), Object.values(r.gate).map(x => x ? 'Y' : 'n').join(''), ' ', r.verdict, r.note); }
