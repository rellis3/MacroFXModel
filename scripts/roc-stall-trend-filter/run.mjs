// scripts/roc-stall-trend-filter/run.mjs: the registered run of roc-stall-trend-filter (forge/ROC_STALL_TREND_FILTER_PREREG.md).
// One scored cell (T1), six reported cells, the disaggregation and the descriptive variants, exactly as the prereg lists them.
//   node scripts/roc-stall-trend-filter/run.mjs <daily.json> <outdir>
import fs from 'node:fs';
import path from 'node:path';
import { loadDaily, features, eventsAndControl, sumsArm, pooled, eventCount, monthFilter, bootstrap, pTwoSided, rng, CELLS, REPORTED, ALL_CELLS, START, HOLD_START } from './lib.mjs';

const SEED = 20261118, B_MAIN = 2000, B_PLACEBO = 500, B_SERIES = 400, B_DESC = 1000;
const ALLOW = 0.02;                                   // the synthetic-zero allowance on gate (a), prereg section 3/4
const [file, outdir = '.'] = process.argv.slice(2);
const daily = loadDaily(file), names = Object.keys(daily);
const Fs = {}; for (const k of names) Fs[k] = features(daily[k]);
const f4 = x => +Number(x).toFixed(4);
const R = rng(SEED + 7);
const GROUPS = { indices: ['SPX', 'NDX', 'RUT', 'DJI', 'DAX', 'FTSE', 'N225', 'HSI'], sectors: ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLP', 'XLI', 'XLU', 'XLB'], commodities: ['GOLD', 'SILVER', 'COPPER', 'WTI'], fx: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'], bonds: ['TLT'], crypto: ['BTC'] };

const perSeriesFor = (F, cell) => names.map(k => sumsArm(F[k], cell.flag, cell.outcome, cell.h, cell.arm));
const effPlus = (per, filter, k, B, seed) => { const e = pooled(per, filter), bs = bootstrap(per, filter, k, B, seed); return { effect: f4(e), lo: f4(bs.lo), hi: f4(bs.hi), sd: f4(bs.sd), n: eventCount(per, filter) }; };
const placebo = (cell, F, B) => {
  const eff = [];
  for (let b = 0; b < B; b++) { const pp = names.map(k => { const f = F[k]; const sh = 100 + Math.floor(R() * (f.N - 200)); return sumsArm(f, cell.flag, cell.outcome, cell.h, cell.arm, sh); }); const e = pooled(pp, monthFilter('hold')); if (Number.isFinite(e)) eff.push(e * cell.expect); }
  eff.sort((a, b) => a - b);
  return eff;
};
const bh = (ps, q = 0.10) => { const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), out = new Array(ps.length).fill(false); let kmax = -1; idx.forEach(([p], r) => { if (p <= q * (r + 1) / ps.length) kmax = r; }); for (let r = 0; r <= kmax; r++) out[idx[r][1]] = true; return out; };

const results = { prereg: 'forge/ROC_STALL_TREND_FILTER_PREREG.md', seed: SEED, runAt: new Date().toISOString(), series: names, window: [START, '2026-08-21'], allowance: ALLOW, cells: {}, reported: {}, disaggregation: {}, descriptive: {} };

function scoreCell(cell, { full = false } = {}) {
  const per = perSeriesFor(Fs, cell), r = { id: cell.id, label: cell.label, expect: cell.expect, bar: cell.bar };
  r.disc = effPlus(per, monthFilter('disc'), cell.k, B_MAIN, SEED + 1);
  r.hold = effPlus(per, monthFilter('hold'), cell.k, B_MAIN, SEED + 2);
  r.h1 = f4(pooled(per, monthFilter('hold', 'h1'))); r.h2 = f4(pooled(per, monthFilter('hold', 'h2')));
  r.p = pTwoSided(r.hold.effect, r.hold.sd);
  const eff = placebo(cell, Fs, B_PLACEBO), q95 = eff[Math.floor(0.95 * eff.length)], real = r.hold.effect * cell.expect;
  r.placebo = { q95: f4(q95), mean: f4(eff.reduce((a, b) => a + b, 0) / eff.length), sd: f4(Math.sqrt(eff.reduce((a, b) => a + b * b, 0) / eff.length - (eff.reduce((a, b) => a + b, 0) / eff.length) ** 2)), pct: f4(eff.filter(v => v <= real).length / eff.length), beats95: real > q95, draws: eff.length };
  if (full) {
    r.loso = names.map((k, i) => ({ k, e: f4(pooled(per.filter((_, j) => j !== i), monthFilter('hold'))) }));
    r.losoSignOk = r.loso.every(x => Math.sign(x.e) === Math.sign(r.hold.effect) || x.e === 0);
    r.perSeries = names.map((k, i) => { const one = [per[i]], f = monthFilter('hold'), e = pooled(one, f); if (!Number.isFinite(e)) return { k, e: null, n: 0 }; const bs = bootstrap(one, f, cell.k, B_SERIES, SEED + 100 + i); return { k, e: f4(e), sd: f4(bs.sd), p: pTwoSided(e, bs.sd), n: eventCount(one, f) }; });
    r.perGroup = Object.entries(GROUPS).map(([g, xs]) => { const sub = per.filter((_, i) => xs.includes(names[i])), f = monthFilter('hold'), e = pooled(sub, f); if (!Number.isFinite(e)) return { g, e: null, n: 0 }; const bs = bootstrap(sub, f, cell.k, B_SERIES, SEED + 200); return { g, e: f4(e), sd: f4(bs.sd), p: pTwoSided(e, bs.sd), n: eventCount(sub, f) }; });
    r.byYear = {}; for (let y = 2013; y <= 2026; y++) { const f = m => Math.floor(m / 12) === y; const e = pooled(per, f); if (Number.isFinite(e)) r.byYear[y] = { e: f4(e), n: eventCount(per, f) }; }
  }
  return r;
}

// the scored cell
for (const cell of CELLS) {
  const r = scoreCell(cell, { full: true }), s = cell.expect, h = r.hold;
  const a = h.effect * s > 0 && (s > 0 ? h.lo > ALLOW : h.hi < -ALLOW), b = r.disc.effect * s > 0, c = r.h1 * s > 0 && r.h2 * s > 0, d = true, e = r.placebo.beats95, f = r.losoSignOk;
  r.gate = { a, b, c, d, e, f };
  const pass = a && b && c && d && e;
  const upperInBar = s > 0 ? h.hi < cell.bar : h.lo > -cell.bar;           // one-sided: an effect of the bar's size in the claim's direction is ruled out
  const sizePass = s > 0 ? h.lo > cell.bar : h.hi < -cell.bar;
  r.verdict = pass ? (f ? 'VALIDATED' : 'CONTEXT') : upperInBar ? 'NULL' : 'UNDERPOWERED';
  r.note = pass ? 'passes every gate' : sizePass ? 'passes size, fails stability' : upperInBar ? 'a rise of the bar size is ruled out' : '';
  r.material = Math.abs(h.effect) >= cell.bar;
  // disaggregation BH
  const ps = r.perSeries.filter(x => x.e != null).map(x => x.p), fl = bh(ps); let j = 0; r.perSeries.forEach(x => { if (x.e != null) x.bh = fl[j++]; });
  const pg = r.perGroup.filter(x => x.e != null).map(x => x.p), fg = bh(pg); j = 0; r.perGroup.forEach(x => { if (x.e != null) x.bh = fg[j++]; });
  r.chanceBaseline = { perSeries: { tests: ps.length, expectedFalse: +(ps.length * 0.10).toFixed(1), passes: fl.filter(Boolean).length }, perGroup: { tests: pg.length, expectedFalse: +(pg.length * 0.10).toFixed(1), passes: fg.filter(Boolean).length } };
  results.cells[cell.id] = r;
}

// reported cells, BH across the six as a chance baseline
for (const cell of REPORTED) results.reported[cell.id] = scoreCell(cell);
const rp = REPORTED.map(c => results.reported[c.id].p), rbh = bh(rp); REPORTED.forEach((c, i) => { results.reported[c.id].bh = rbh[i]; });
results.reported._chanceBaseline = { tests: rp.length, expectedFalse: +(rp.length * 0.10).toFixed(1), passes: rbh.filter(Boolean).length };

// descriptive variants (cannot change a verdict)
const desc = {};
const t1 = CELLS[0];
desc.mixedArm = (() => { const c = { ...t1, arm: 0, label: 'TOP stall in the MIXED state -> Z20 vs same-state controls' }; const per = perSeriesFor(Fs, c); return { label: c.label, ...effPlus(per, monthFilter('hold'), 1, B_DESC, SEED + 300) }; })();
desc.upMinusDown = { label: 'T1 effect minus T5 effect (point estimates, holdout)', value: f4(results.cells.T1.hold.effect - results.reported.T5.hold.effect) };
for (const [label, opts] of [['SMA100', { smaN: 100 }], ['slope 40', { slopeN: 40 }]]) {
  const F2 = {}; for (const k of names) F2[k] = features(daily[k], opts);
  const per = names.map(k => sumsArm(F2[k], 'TOP', 'Z', 20, 1));
  desc[label.replace(' ', '_')] = { label: `T1 with ${label}`, ...effPlus(per, monthFilter('hold'), 1, B_DESC, SEED + 310), disc: f4(pooled(per, monthFilter('disc'))) };
}
// T1 events against the parent's ALL-session control: how much of the parent's +0.05 was uptrend drift
desc.upEventsVsAllControl = (() => {
  const per = names.map(k => {
    const F = Fs[k], { ev, near } = eventsAndControl(F, 'TOP'), out = F.Z[20], rec = new Map();
    const get = m => { let r = rec.get(m); if (!r) { r = { es: 0, en: 0, cs: 0, cn: 0 }; rec.set(m, r); } return r; };
    const isEv = new Uint8Array(F.N); for (const i of ev) isEv[i] = 1;
    for (let i = 0; i < F.N; i++) { if (F.date[i] < START || !Number.isFinite(out[i])) continue; if (isEv[i]) { if (F.trend[i] === 1) { const r = get(F.mon[i]); r.es += out[i]; r.en++; } } else if (!near[i]) { const r = get(F.mon[i]); r.cs += out[i]; r.cn++; } }
    return rec;
  });
  return { label: 'UP-arm TOP events against ALL non-flag sessions (the parent control), Z20 holdout', ...effPlus(per, monthFilter('hold'), 1, B_DESC, SEED + 320) };
})();
// control means by state: the uptrend drift itself
desc.controlDrift = (() => {
  const acc = { UP: [0, 0], DOWN: [0, 0], MIXED: [0, 0], ALL: [0, 0] };
  for (const k of names) { const F = Fs[k], { near } = eventsAndControl(F, 'TOP'), z = F.Z[20]; for (let i = 0; i < F.N; i++) { if (F.date[i] < HOLD_START || !Number.isFinite(z[i]) || near[i]) continue; const a = F.trend[i] === 1 ? 'UP' : F.trend[i] === -1 ? 'DOWN' : 'MIXED'; acc[a][0] += z[i]; acc[a][1]++; acc.ALL[0] += z[i]; acc.ALL[1]++; } }
  return { label: 'mean Z20 of non-flag sessions by trend state (holdout, pooled over series)', ...Object.fromEntries(Object.entries(acc).map(([a, [s, n]]) => [a, { mean: f4(s / n), n }])) };
})();
results.descriptive = desc;

fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(path.join(outdir, 'results.json'), JSON.stringify(results, null, 1));
const row = (id, r) => console.log(id.padEnd(4), String(r.disc.effect).padEnd(8), String(r.hold.effect).padEnd(8), `[${r.hold.lo}, ${r.hold.hi}]`.padEnd(20), `${r.h1}/${r.h2}`.padEnd(16), String(r.placebo.pct).padEnd(6), r.gate ? Object.values(r.gate).map(x => x ? 'Y' : 'n').join('') : (r.bh ? 'BH' : '  '), ' ', r.verdict ?? '', r.note ?? '');
console.log('cell disc      hold     [lo, hi]             h1/h2            plc%   gates   verdict');
for (const c of CELLS) row(c.id, results.cells[c.id]);
for (const c of REPORTED) row(c.id, results.reported[c.id]);
console.log('descriptive:', JSON.stringify(desc, null, 0).slice(0, 1500));
