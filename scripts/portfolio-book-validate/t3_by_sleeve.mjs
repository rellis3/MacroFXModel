/** T3 follow-up (descriptive): which sleeve gains from the one-day delay? Sleeve Sharpe undelayed vs delayed. */
import { writeFile } from 'node:fs/promises';
import { buildPortfolio } from '../portfolio-book/build.mjs';
import { buildBook, scoreStream } from '../../js/portfolioBook.js';
import { makeTransform } from './delay_transform.mjs';
const base = await buildPortfolio({});
const del = await buildPortfolio({ store: base.store, runs: base.runs, legTransform: makeTransform(base.store, { delay: true }), s5Delay: 1 });
const sh = (b, id) => { const st = buildBook({ dates: b.dates, sleeves: [b.sleeves[id]] }, { [id]: 1 }).sleeves[0].scaled; return scoreStream(b.dates, st, { startIdx: Math.max(0, st.findIndex(r => r !== 0)) }); };
const out = {};
for (const id of ['S1', 'S1g', 'S2', 'S3', 'S3g', 'S4', 'S5', 'S5g']) { const a = sh(base, id), d = sh(del, id); out[id] = { sharpe: a.sharpe, delayed: d.sharpe, maxDd: a.maxDdPct, maxDdDelayed: d.maxDdPct }; }
await writeFile('analysis/output/portfolio-book-validate/t3_by_sleeve.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
