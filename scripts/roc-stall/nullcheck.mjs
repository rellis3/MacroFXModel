import { loadDaily, features, sums, pooled, monthFilter, CELLS, rng } from './lib.mjs';
const daily = loadDaily(process.argv[2]), names = Object.keys(daily);
const res = Object.fromEntries(CELLS.map(c => [c.id, []]));
for (let seed = 1; seed <= 8; seed++) {
  const Rn = rng(777 + seed), g = () => { let u = 0, v = 0; while (!u) u = Rn(); while (!v) v = Rn(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const per = {}; 
  const F = {}; for (const k of names) { let p = 100; F[k] = features(daily[k].map(r => { p *= Math.exp(0.01 * g()); return [r[0], p]; })); }
  for (const c of CELLS) { const s = names.map(k => sums(F[k], c.flag, c.outcome, c.h)); res[c.id].push(+pooled(s, monthFilter('all')).toFixed(3)); }
}
for (const [k, v] of Object.entries(res)) { const m = v.reduce((a, b) => a + b, 0) / v.length; console.log(k, v.join(' '), ' mean', m.toFixed(3)); }
