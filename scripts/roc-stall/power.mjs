// scripts/roc-stall/power.mjs: the design-only numbers for forge/ROC_STALL_50D_PREREG.md section 5 (run BEFORE any outcome at a real event is read).
//  - event counts per cell and period: flags only, no outcome is read;
//  - placebo SD of the pooled effect on the holdout: flags rotated by a random shift per series (outcomes at rotated flags, not at real events);
//  - a planted-signal positive control on synthetic random-walk series with the real dates: does the exact pipeline recover a known effect?
//   node scripts/roc-stall/power.mjs <daily.json> <outdir>
import fs from 'node:fs';
import path from 'node:path';
import { loadDaily, features, eventsAndControl, sums, pooled, monthFilter, bootstrap, CELLS, rng, START, DISC_END } from './lib.mjs';

const SEED = 20261116, PLACEBO_B = 200;
const [file, outdir = '.'] = process.argv.slice(2);
const daily = loadDaily(file), names = Object.keys(daily);
const Fs = {}; for (const k of names) Fs[k] = features(daily[k]);

const periodOf = d => d <= DISC_END ? 'disc' : 'hold';
const counts = {};
for (const cell of CELLS) {
  const c = { disc: 0, hold: 0, bySeries: {} };
  for (const k of names) {
    const { ev } = eventsAndControl(Fs[k], cell.flag);
    let n = 0; for (const i of ev) { const p = periodOf(Fs[k].date[i]); c[p]++; if (p === 'hold') n++; }
    c.bySeries[k] = n;
  }
  counts[cell.id] = c;
}

// placebo SD on the holdout: one random rotation per series per draw
const R = rng(SEED), power = {};
for (const cell of CELLS) {
  const effs = [];
  for (let b = 0; b < PLACEBO_B; b++) {
    const per = names.map(k => { const F = Fs[k]; const sh = 100 + Math.floor(R() * (F.N - 200)); return sums(F, cell.flag, cell.outcome, cell.h, sh); });
    const e = pooled(per, monthFilter('hold')); if (Number.isFinite(e)) effs.push(e);
  }
  const mean = effs.reduce((a, b) => a + b, 0) / effs.length, sd = Math.sqrt(effs.reduce((a, b) => a + (b - mean) ** 2, 0) / (effs.length - 1));
  const mde = 2.8 * sd;                                         // 80% power, two-sided alpha 0.05 (1.96 + 0.84)
  power[cell.id] = { label: cell.label, nHold: counts[cell.id].hold, nDisc: counts[cell.id].disc, placeboMean: +mean.toFixed(4), placeboSD: +sd.toFixed(4), mde: +mde.toFixed(4), bar: cell.bar, verdict: mde <= cell.bar ? 'POWERED' : 'UNDERPOWERED', draws: effs.length };
}

// planted-signal positive control on synthetic series with the real calendars (no real outcome is read)
function synthetic(seed) {
  const Rn = rng(seed), gauss = () => { let u = 0, v = 0; while (!u) u = Rn(); while (!v) v = Rn(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out = {};
  for (const k of names) { let p = 100; out[k] = daily[k].map(r => { p *= Math.exp(0.01 * gauss()); return [r[0], p]; }); }
  return out;
}
const synth = synthetic(SEED + 1), pos = {};
const SF = {}; for (const k of names) SF[k] = features(synth[k]);
for (const cell of CELLS) {
  const row = {};
  for (const planted of [0, cell.expect * cell.bar]) {
    const per = names.map(k => {
      const F = SF[k], arr = cell.outcome === 'Z' ? F.Z[cell.h] : F.LV[cell.h], save = Float64Array.from(arr);
      if (planted) { const { ev } = eventsAndControl(F, cell.flag); for (const i of ev) if (Number.isFinite(arr[i])) arr[i] += planted; }
      const s = sums(F, cell.flag, cell.outcome, cell.h); arr.set(save); return s;
    });
    row[planted === 0 ? 'planted0' : 'plantedBar'] = +pooled(per, monthFilter('all')).toFixed(4);
  }
  row.plantedValue = cell.expect * cell.bar; pos[cell.id] = row;
}

fs.mkdirSync(outdir, { recursive: true });
const result = { seed: SEED, placeboDraws: PLACEBO_B, window: [START, DISC_END], series: names.length, counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { disc: v.disc, hold: v.hold }])), power, positiveControl: pos };
fs.writeFileSync(path.join(outdir, 'power.json'), JSON.stringify(result, null, 1));
console.table(Object.fromEntries(Object.entries(power).map(([k, v]) => [k, { n_disc: v.nDisc, n_hold: v.nHold, placeboSD: v.placeboSD, MDE: v.mde, bar: v.bar, verdict: v.verdict }])));
console.table(pos);
