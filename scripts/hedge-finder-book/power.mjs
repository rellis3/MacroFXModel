#!/usr/bin/env node
// hedge-finder-book: the power table, BEFORE registration. Reads only the CONTROL arm (the unhedged proxy book) and
// plants synthetic hedges of known strength on it; no hedge built by the finder or by any control is computed here.
// Prereg §5.   node scripts/hedge-finder-book/power.mjs   -> analysis/output/hedge-finder-book/power.json
//
// A planted hedge with book-level correlation rho: c_t = rho z_t + sqrt(1-rho^2) e_t, z_t = b_t / sigma_t (sigma_t =
// the book's trailing 60-day sd to t-1), e_t = z at a half-sample circular shift (same fat tails, independent);
// hedge P&L = -rho sigma_t c_t, the min-variance hedge, which removes rho^2 of the variance. For each rho: the planted
// relative change in ES5 and max drawdown and their paired block-bootstrap SE (21-day blocks, B 500 for the table).
import fs from 'node:fs';
import * as L from './lib.mjs';

const OUT = new URL('../../analysis/output/hedge-finder-book/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const P = L.loadPanel();
const cost = L.makeCost(P.ff, P.dates);
const book = L.buildBook(P, cost).filter(d => d.date >= L.SCORE_FROM);
const b = book.map(d => d.net), n = b.length;
const sig = b.map((_, t) => (t >= 60 ? L.sd(b.slice(t - 60, t)) : L.sd(b.slice(0, 60))));
const z = b.map((v, t) => v / sig[t]);
const e = z.map((_, t) => z[(t + Math.floor(n / 2)) % n]);
const idx = L.blockIndex(n, { B: 500, L: 21, seed: L.SEED });
const rel = (h, u, f) => f(h) / f(u) - 1;
const rows = [];
for (const rho of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
  const h = b.map((v, t) => v - rho * sig[t] * (rho * z[t] + Math.sqrt(1 - rho * rho) * e[t]));
  const pt = { es: rel(h, b, L.es), mdd: rel(h, b, L.maxDD), ddy: rel(h, b, L.ddYear), es21: rel(h, b, L.es21), sh: L.sharpe(h) - L.sharpe(b) };
  const bs = { es: [], mdd: [], ddy: [], es21: [], sh: [] };
  for (const ix of idx) { const hb = L.take(h, ix), ub = L.take(b, ix); bs.es.push(rel(hb, ub, L.es)); bs.mdd.push(rel(hb, ub, L.maxDD)); bs.ddy.push(rel(hb, ub, L.ddYear)); bs.es21.push(rel(hb, ub, L.es21)); bs.sh.push(L.sharpe(hb) - L.sharpe(ub)); }
  const se = Object.fromEntries(Object.entries(bs).map(([k, a]) => [k, L.sd(a)]));
  rows.push({ rho, planted: pt, se, mde: Object.fromEntries(Object.entries(se).map(([k, v]) => [k, 2.8 * v])) });
  const f = k => `${k} ${(pt[k] * 100).toFixed(1)}% se ${(se[k] * 100).toFixed(2)} mde ${(2.8 * se[k] * 100).toFixed(1)}`;
  console.log(`rho ${rho.toFixed(2)} | ${['es', 'mdd', 'ddy', 'es21'].map(f).join(' | ')} | dSharpe ${pt.sh.toFixed(3)} se ${se.sh.toFixed(3)}`);
}
const out = { id: 'hedge-finder-book', seed: L.SEED, B: 500, block: 21, nDays: n, from: book[0].date, to: book.at(-1).date, nMonths: Math.round(n / 21), rows,
  note: 'control arm only (unhedged proxy book); planted min-variance hedges; no finder or control hedge computed' };
fs.writeFileSync(new URL('power.json', OUT), JSON.stringify(out, null, 2));
console.log(`n ${n} days, ${out.from} -> ${out.to}`);
