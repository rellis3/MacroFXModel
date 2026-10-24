/**
 * T6 (forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md): the vol-premium proxy vs the Cboe PUT index
 * (cash-secured monthly at-the-money SPX put writing; public CSV saved under
 * analysis/output/portfolio-book-validate/cboe_put/). Monthly returns, 2008-02 → 2026-08.
 * Bar: correlation ≥ 0.6 AND S5 Sharpe − PUT excess-return Sharpe ≤ 0.4.
 *
 *   node scripts/portfolio-book-validate/t6_put_benchmark.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { buildPortfolio } from '../portfolio-book/build.mjs';
import { buildBook } from '../../js/portfolioBook.js';
import { mean, stdev } from '../../js/harness/stats.mjs';

const OUT = 'analysis/output/portfolio-book-validate';
const b = await buildPortfolio({ sleeveIds: ['S5', 'S5g'], log: m => process.stderr.write(`${m}\n`) });

// PUT: month-end closes (CSV dates are MM/DD/YYYY)
const csv = (await readFile(`${OUT}/cboe_put/PUT_History.csv`, 'utf8')).trim().split(/\r?\n/).slice(1);
const put = csv.map(l => { const [d, v] = l.split(','); const [m, dd, y] = d.split('/'); return { d: `${y}-${m}-${dd}`, v: Number(v) }; }).filter(r => Number.isFinite(r.v)).sort((a, z) => a.d.localeCompare(z.d));
const monthEnd = new Map(); for (const r of put) monthEnd.set(r.d.slice(0, 7), r.v);
const months = [...monthEnd.keys()].sort();
const putRet = new Map(); for (let i = 1; i < months.length; i++) putRet.set(months[i], monthEnd.get(months[i]) / monthEnd.get(months[i - 1]) - 1);

// cash: rate3m_usd, latest published value for the month (a benchmark's cash leg, not a signal)
const rates = new Map((await b.store.series('rate3m_usd')).map(x => [String(x.date).slice(0, 7), Number(x.value) / 100]));
const rf = m => { let k = m; for (let i = 0; i < 6; i++) { if (rates.has(k)) return rates.get(k) / 12; const t = new Date(k + '-01T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() - 1); k = t.toISOString().slice(0, 7); } return 0; };

function monthly(id) {
  const st = buildBook({ dates: b.dates, sleeves: [b.sleeves[id]] }, { [id]: 1 }).sleeves[0].scaled;
  const m = new Map(); b.dates.forEach((d, i) => { const k = d.slice(0, 7); m.set(k, (m.get(k) ?? 1) * (1 + st[i])); });
  return new Map([...m].map(([k, v]) => [k, v - 1]));
}
const corr = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, bx = 0, by = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); bx += (x[i] - mx) ** 2; by += (y[i] - my) ** 2; } return a / Math.sqrt(bx * by); };
const sr = v => mean(v) / stdev(v, 1) * Math.sqrt(12);

const out = { id: 'portfolio-book-validate/T6', window: ['2008-02', '2026-08'], bar: 'corr >= 0.6 AND S5 Sharpe - PUT excess Sharpe <= 0.4' };
for (const id of ['S5', 'S5g']) {
  const s = monthly(id);
  const ks = [...s.keys()].filter(k => k >= '2008-02' && k <= '2026-08' && putRet.has(k));
  const x = ks.map(k => s.get(k)), y = ks.map(k => putRet.get(k) - rf(k));
  const worst = (arr) => Math.min(...arr);
  out[id] = { months: ks.length, corr: +corr(x, y).toFixed(3), sharpeProxy: +sr(x).toFixed(3), sharpePutExcess: +sr(y).toFixed(3), gap: +(sr(x) - sr(y)).toFixed(3),
    worstMonthProxyPct: +(worst(x) * 100).toFixed(2), worstMonthPutPct: +(worst(y) * 100).toFixed(2),
    halves: ['2008-02', '2017-05'].map((lo, i) => { const sel = ks.map((k, j) => [k, j]).filter(([k]) => (i === 0 ? k < '2017-05' : k >= '2017-05')).map(([, j]) => j); return { from: lo, sharpeProxy: +sr(sel.map(j => x[j])).toFixed(3), sharpePut: +sr(sel.map(j => y[j])).toFixed(3) }; }) };
}
out.pass = out.S5.corr >= 0.6 && out.S5.gap <= 0.4;
await writeFile(`${OUT}/t6_put_benchmark.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
