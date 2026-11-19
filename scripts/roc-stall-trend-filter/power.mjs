// scripts/roc-stall-trend-filter/power.mjs: design-only numbers for forge/ROC_STALL_TREND_FILTER_PREREG.md section 5 (run BEFORE any outcome
// at a real event is read): event counts per arm (flags and trend state only), the placebo SD of the pooled effect from rotated flags,
// and a planted-signal positive control on synthetic random walks with the real calendars.
//   node scripts/roc-stall-trend-filter/power.mjs <daily.json> <outdir>
import fs from 'node:fs';
import path from 'node:path';
import { loadDaily, features, eventsAndControl, sumsArm, pooled, monthFilter, ALL_CELLS as CELLS, rng, DISC_END } from './lib.mjs';

const SEED = 20261118, PLACEBO_B = 200, ZERO_WORLDS = 16;
const [file, outdir = '.'] = process.argv.slice(2);
const daily = loadDaily(file), names = Object.keys(daily);
const Fs = {}; for (const k of names) Fs[k] = features(daily[k]);
const periodOf = d => d <= DISC_END ? 'disc' : 'hold';
const armName = t => (t === 1 ? 'UP' : t === -1 ? 'DOWN' : 'MIXED');

// counts: the parent's de-clustered TOP and BOTTOM events split by trend state at the flag (no outcome read)
const counts = {};
for (const flag of ['TOP', 'BOT']) {
  const c = { disc: { UP: 0, DOWN: 0, MIXED: 0 }, hold: { UP: 0, DOWN: 0, MIXED: 0 }, holdBySeries: {} };
  for (const k of names) {
    const F = Fs[k], { ev } = eventsAndControl(F, flag); const bs = { UP: 0, DOWN: 0, MIXED: 0 };
    for (const i of ev) { const a = armName(F.trend[i]), p = periodOf(F.date[i]); c[p][a]++; if (p === 'hold') bs[a]++; }
    c.holdBySeries[k] = bs;
  }
  counts[flag] = c;
}
// share of all sessions in each state (holdout), for the reader
const stateShare = { UP: 0, DOWN: 0, MIXED: 0, n: 0 };
for (const k of names) { const F = Fs[k]; for (let i = 0; i < F.N; i++) { if (F.date[i] <= DISC_END) continue; stateShare.n++; stateShare[armName(F.trend[i])]++; } }
for (const a of ['UP', 'DOWN', 'MIXED']) stateShare[a] = +(stateShare[a] / stateShare.n).toFixed(3);

// placebo SD on the holdout: one random rotation per series per draw; the arm is read at the rotated position
const R = rng(SEED), power = {};
for (const cell of CELLS) {
  const effs = [];
  for (let b = 0; b < PLACEBO_B; b++) {
    const per = names.map(k => { const F = Fs[k]; const sh = 100 + Math.floor(R() * (F.N - 200)); return sumsArm(F, cell.flag, cell.outcome, cell.h, cell.arm, sh); });
    const e = pooled(per, monthFilter('hold')); if (Number.isFinite(e)) effs.push(e);
  }
  const mean = effs.reduce((a, b) => a + b, 0) / effs.length, sd = Math.sqrt(effs.reduce((a, b) => a + (b - mean) ** 2, 0) / (effs.length - 1));
  const mde = 2.8 * sd;
  const arm = armName(cell.arm);
  power[cell.id] = { label: cell.label, nHold: counts[cell.flag].hold[arm], nDisc: counts[cell.flag].disc[arm], placeboMean: +mean.toFixed(4), placeboSD: +sd.toFixed(4), mde: +mde.toFixed(4), bar: cell.bar, verdict: mde <= cell.bar ? 'POWERED' : 'UNDERPOWERED', draws: effs.length };
}

// positive control: synthetic random walks on the real calendars; known-zero over eight worlds, planted-at-the-bar on world 1
function synthetic(seed) {
  const Rn = rng(seed), gauss = () => { let u = 0, v = 0; while (!u) u = Rn(); while (!v) v = Rn(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out = {}; for (const k of names) { let p = 100; out[k] = daily[k].map(r => { p *= Math.exp(0.01 * gauss()); return [r[0], p]; }); } return out;
}
const pos = {};
for (const cell of CELLS) pos[cell.id] = { zeroWorlds: [], plantedBar: null, plantedValue: cell.expect * cell.bar };
for (let w = 1; w <= ZERO_WORLDS; w++) {
  const SF = {}; const synth = synthetic(SEED + w); for (const k of names) SF[k] = features(synth[k]);
  for (const cell of CELLS) {
    const per = names.map(k => sumsArm(SF[k], cell.flag, cell.outcome, cell.h, cell.arm));
    pos[cell.id].zeroWorlds.push(+pooled(per, monthFilter('all')).toFixed(4));
    if (w === 1) {
      const per2 = names.map(k => {
        const F = SF[k], arr = cell.outcome === 'Z' ? F.Z[cell.h] : F.LV[cell.h], save = Float64Array.from(arr), { ev } = eventsAndControl(F, cell.flag);
        for (const i of ev) if (F.trend[i] === cell.arm && Number.isFinite(arr[i])) arr[i] += cell.expect * cell.bar;
        const s = sumsArm(F, cell.flag, cell.outcome, cell.h, cell.arm); arr.set(save); return s;
      });
      pos[cell.id].plantedBar = +pooled(per2, monthFilter('all')).toFixed(4);
    }
  }
}
for (const cell of CELLS) { const z = pos[cell.id].zeroWorlds, m = z.reduce((a, b) => a + b, 0) / z.length, sd = Math.sqrt(z.reduce((a, b) => a + (b - m) ** 2, 0) / (z.length - 1)); pos[cell.id].zeroMean = +m.toFixed(4); pos[cell.id].zeroSE = +(sd / Math.sqrt(z.length)).toFixed(4); }

fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(path.join(outdir, 'power.json'), JSON.stringify({ seed: SEED, placeboDraws: PLACEBO_B, series: names.length, counts, stateShareHoldout: stateShare, power, positiveControl: pos }, null, 1));
for (const flag of ['TOP', 'BOT']) console.log(flag, 'events (de-clustered) by arm:', JSON.stringify(counts[flag].disc), 'disc;', JSON.stringify(counts[flag].hold), 'hold'); console.log('session share holdout', JSON.stringify(stateShare));
console.table(Object.fromEntries(Object.entries(power).map(([k, v]) => [k, { n_disc: v.nDisc, n_hold: v.nHold, placeboMean: v.placeboMean, placeboSD: v.placeboSD, MDE: v.mde, bar: v.bar, verdict: v.verdict }])));
console.table(Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, { zeroMean: v.zeroMean, zeroSE: v.zeroSE, plantedBar: v.plantedBar, planted: v.plantedValue }])));
