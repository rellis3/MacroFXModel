#!/usr/bin/env node
// hedge-finder-book: the routine concentration read (stats-defaults "Controls that should be routine"), DESCRIPTIVE and
// post-hoc (prereg Amendment A1). Reads analysis/output/hedge-finder-book/arms.json written by run.mjs.
// ES5 change F vs U and C1 vs U by calendar year, the last 3 years, and with the book's worst 1% of days removed.
import fs from 'node:fs';
import * as L from './lib.mjs';

const OUT = new URL('../../analysis/output/hedge-finder-book/', import.meta.url);
const A = JSON.parse(fs.readFileSync(new URL('arms.json', OUT), 'utf8'));
const rel = (a, b) => L.es(a) / L.es(b) - 1;
const sel = f => A.dates.map((d, t) => (f(d, t) ? t : -1)).filter(t => t >= 0);
const cut = idx => ({ n: idx.length, F: rel(idx.map(t => A.F[t]), idx.map(t => A.U[t])), C1: rel(idx.map(t => A.C1[t]), idx.map(t => A.U[t])) });
const years = [...new Set(A.dates.map(d => d.slice(0, 4)))];
const byYear = Object.fromEntries(years.map(y => [y, cut(sel(d => d.startsWith(y)))]));
const last3 = cut(sel(d => d >= '2023-08-22'));
const worst = [...A.U].sort((a, b) => a - b)[Math.floor(A.U.length * 0.01)];
const noTop1 = cut(sel((_, t) => A.U[t] > worst));
const yearsCut = Object.values(byYear).filter(v => v.F < 0).length;
const out = { note: 'descriptive, post-hoc (Amendment A1); ES5 relative change vs the unhedged book', byYear, yearsWithCutF: `${yearsCut}/${years.length}`, last3, withoutWorst1pct: noTop1 };
fs.writeFileSync(new URL('concentration.json', OUT), JSON.stringify(out, null, 2));
const pc = v => `${(v * 100).toFixed(1)}%`;
console.log(Object.entries(byYear).map(([y, v]) => `${y} ${pc(v.F)}`).join('  '));
console.log(`years with a cut ${out.yearsWithCutF}; last 3y F ${pc(last3.F)} C1 ${pc(last3.C1)} (n ${last3.n}); without worst 1% F ${pc(noTop1.F)} C1 ${pc(noTop1.C1)}`);
