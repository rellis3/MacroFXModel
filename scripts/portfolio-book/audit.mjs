/**
 * portfolio-book audit (descriptive, POST-HOC: results seen). Concentration and mechanics
 * checks on the scored book; nothing here can promote the registered verdict.
 *   node scripts/portfolio-book/audit.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { buildBook, scoreStream, P1_WEIGHTS } from '../../js/portfolioBook.js';
import { deflatedSharpe, stdev } from '../../js/harness/stats.mjs';

const B = JSON.parse(await readFile('analysis/output/portfolio-book/book.json', 'utf8'));
const R = JSON.parse(await readFile('analysis/output/portfolio-book/results.json', 'utf8'));
const out = {};
const first = r => r.findIndex(x => x !== 0);
const sc = (w, sleeves = B.sleeves) => { const b = buildBook({ dates: B.dates, sleeves }, w); return scoreStream(B.dates, b.rets, { startIdx: first(b.rets), varTrialSr: B.varTrialSr }); };
const pick = c => ({ sharpe: c.sharpe, cagr: c.cagrPct, mdd: c.maxDdPct, oos: c.sharpeOos, halves: c.sharpeHalves, t: c.tStat, worstMonth: c.worstMonthPct });

// 1. leave-one-sleeve-out
out.leaveOneOut = {};
for (const id of Object.keys(P1_WEIGHTS)) out.leaveOneOut[`without ${id}`] = pick(sc({ ...P1_WEIGHTS, [id]: 0 }));
out.onlyPriceSleevesNoFomc = pick(sc({ S1g: 1, S2: 1, S3g: 1 }));

// 2. DSR sensitivity to how trial variance is measured (registered: all 11 cells incl. mirror)
const cells = R.cells;
const srs = k => Object.entries(cells).filter(([id]) => k(id)).map(([, c]) => c.sharpe / Math.sqrt(252));
const P1 = cells.P1;
const dsrWith = (v, N = 11) => deflatedSharpe({ srPeriod: P1.sharpe / Math.sqrt(252), n: P1.nDays, skew: P1.skew, kurt: P1.kurt, nTrials: N, varTrialSr: v }).dsr;
out.dsr = {
  registered_allCellsInclMirror: { varTrialSr: R.varTrialSr, dsr: P1.dsr },
  excludingMirror: dsrWith(stdev(srs(id => id !== 'mirror'), 1) ** 2),
  bookCellsOnly_P1_P2: dsrWith(stdev(srs(id => id === 'P1' || id === 'P2'), 1) ** 2),
  ownSamplingVariance_N11: dsrWith(undefined),
};

// 3. concentration: best years removed, per-year
const b = buildBook({ dates: B.dates, sleeves: B.sleeves }, P1_WEIGHTS);
const full = scoreStream(B.dates, b.rets, { startIdx: first(b.rets) });
out.perYearP1 = full.perYearPct;
const yrs = Object.entries(full.perYearPct).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([y]) => y);
const keep = b.rets.map((r, i) => (yrs.includes(B.dates[i].slice(0, 4)) ? 0 : r));
out.withoutBest3Years = { removed: yrs, ...pick(scoreStream(B.dates, keep, { startIdx: first(keep) })) };
// best 1% of days
const sorted = [...b.rets].sort((x, y) => y - x); const cut = sorted[Math.floor(sorted.length * 0.01)];
const trimmed = b.rets.map(r => (r >= cut && r > 0 ? 0 : r));
out.withoutBest1pctDays = pick(scoreStream(B.dates, trimmed, { startIdx: first(trimmed) }));
// 4. 2x costs proxy: subtract each sleeve's harness cost drag once more is not path-exact; report harness gross vs net instead
out.harnessGrossVsNet = Object.fromEntries(Object.entries(R.harness).map(([k, v]) => [k, { grossOos: v.grossOos, netOos: v.sharpeOosHarness, costDragAnnBp: v.costDragAnnBp }]));
// 5. crisis windows
const win = (a, z) => { let e = 1; B.dates.forEach((d, i) => { if (d >= a && d <= z) e *= 1 + b.rets[i]; }); return +((e - 1) * 100).toFixed(2); };
out.crises = { gfc_2008: win('2008-09-01', '2009-03-31'), volmageddon_2018: win('2018-01-26', '2018-02-28'), q4_2018: win('2018-10-01', '2018-12-31'), covid_2020: win('2020-02-19', '2020-04-30'), rates_2022: win('2022-01-01', '2022-12-31'), yen_carry_2024: win('2024-07-15', '2024-08-15'), tariffs_2025: win('2025-03-15', '2025-04-30') };
await writeFile('analysis/output/portfolio-book/audit.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
