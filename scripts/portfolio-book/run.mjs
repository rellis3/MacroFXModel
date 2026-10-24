/**
 * portfolio-book — the scored run for forge/PORTFOLIO_BOOK_PREREG.md.
 *
 *   node scripts/portfolio-book/run.mjs
 *
 * Runs every price sleeve through js/harness/runStudy.mjs (vol target, measured costs,
 * carry, date-block bootstrap, DSR — fixed there), builds the vol-premium proxy from the
 * store's VIX and SPX500 closes, then scores the book with js/portfolioBook.js — the same
 * module the page uses. Writes analysis/output/portfolio-book/:
 *   book.json        sleeve legs + trades for the page (contributions as ints, 1e-8 units)
 *   results.json     every cell's standard score, the gate, correlations
 *   trades_P1.csv    P1 trades in the owner's import template
 *   trades_P2.csv    P2 trades in the same template
 * Window ends 2026-08-21 (lockbox); nothing after it is scored or written.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBook, scoreStream, gate, sleeveCorrelation, bookTrades, toCsv, P1_WEIGHTS, P2_WEIGHTS, BOOK, stdev } from '../../js/portfolioBook.js';
import { buildPortfolio, SAMPLE } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FOLD = process.env.FOLD !== '0';   // FOLD=0: the registered run (weekend rows counted as days), kept beside the corrected one
const OUT = process.env.PB_OUT ? path.resolve(process.env.PB_OUT) : path.join(ROOT, 'analysis', 'output', 'portfolio-book', ...(FOLD ? [] : ['registered']));
const log = m => process.stderr.write(`${m}\n`);

const LEGACY_COST = process.env.PB_LEGACY_COST === '1';   // the index-cost rule used before validate A2 (2026-10-25)
const { dates, sleeves, runs } = await buildPortfolio({ sample: SAMPLE, fold: FOLD, log, ...(LEGACY_COST ? { indexCostFrac: null } : {}) });
const SLEEVES = ['S1', 'S1g', 'S2', 'S3', 'S3g', 'S4'].map(id => ({ id }));

// ── score: 8 sleeve cells, P1, P2, mirror (N = 11) ──
const solo = id => buildBook({ dates, sleeves: [sleeves[id]] }, { [id]: 1 });
const bookIds = ['S1g', 'S2', 'S3g', 'S4', 'S5g'];
const data = { dates, sleeves: bookIds.map(id => sleeves[id]) };
const P1 = buildBook(data, P1_WEIGHTS), P2 = buildBook(data, P2_WEIGHTS);
const mirrorData = { dates, sleeves: data.sleeves.map(s => ({ ...s, legs: s.legs.map(l => ({ ...l, c: l.c.map(x => -x) })) })) };
const MIRROR = buildBook(mirrorData, P1_WEIGHTS);

// sleeve-level stream for scoring = the sleeve scaled to 10% on its own (sleeve normalisation)
const streams = {};
for (const id of ['S1', 'S1g', 'S2', 'S3', 'S3g', 'S4', 'S5', 'S5g']) streams[id] = solo(id).sleeves[0].scaled;
streams.P1 = P1.rets; streams.P2 = P2.rets; streams.mirror = MIRROR.rets;
const firstLive = r => r.findIndex(x => x !== 0);
const srP = Object.values(streams).map(r => scoreStream(dates, r, { startIdx: firstLive(r) }).srPeriod).filter(Number.isFinite);
const varTrialSr = stdev(srP, 1) ** 2;
const cells = {};
for (const [id, r] of Object.entries(streams)) { const sc = scoreStream(dates, r, { varTrialSr, startIdx: firstLive(r) }); delete sc.equity; delete sc.eqDates; cells[id] = sc; }
const g = gate(cells.P1);
const corr = sleeveCorrelation(P1);
const harness = Object.fromEntries(SLEEVES.map(s => { const c = runs[s.id].cells[0]; return [s.id, { sharpeOosHarness: c.pnl.sharpeOos, sharpeAllHarness: c.pnl.sharpeAll, grossOos: c.pnl.sharpeGrossOos, costDragAnnBp: c.pnl.costDragAnnBp, carryAnnBp: c.pnl.carryAnnBp, turnoverPerYear: c.pnl.turnoverPerYear, tradesOos: c.pnl.tradesOos, pfOos: c.pnl.pfOos, winOos: c.pnl.winOos, notes: runs[s.id].notes }]; }));

// ── write ──
await mkdir(OUT, { recursive: true });
const names = Object.fromEntries(Object.values(sleeves).map(s => [s.id, s.name]));
await writeFile(path.join(OUT, 'book.json'), JSON.stringify({
  id: 'portfolio-book', builtAt: new Date().toISOString(), weekendFold: FOLD, prereg: 'forge/PORTFOLIO_BOOK_PREREG.md', window: SAMPLE, book: BOOK,
  weights: { P1: P1_WEIGHTS, P2: P2_WEIGHTS }, dates, sleeves: data.sleeves,
  cellScores: cells, names, varTrialSr,
}));
await writeFile(path.join(OUT, 'results.json'), JSON.stringify({
  id: 'portfolio-book', ranAt: new Date().toISOString(), weekendFold: FOLD, prereg: 'forge/PORTFOLIO_BOOK_PREREG.md', seed: BOOK.seed, window: SAMPLE,
  trials: Object.keys(streams).length, varTrialSr, gate: g, cells, correlation: corr, harness, names,
  costs: runs.S2.costs,
}, null, 1));
const tP1 = bookTrades(data, P1), tP2 = bookTrades(data, P2);
await writeFile(path.join(OUT, 'trades_P1.csv'), toCsv(tP1));
await writeFile(path.join(OUT, 'trades_P2.csv'), toCsv(tP2));

const pick = c => ({ sharpe: c.sharpe, cagr: c.cagrPct, vol: c.volPct, mdd: c.maxDdPct, is: c.sharpeIs, oos: c.sharpeOos, halves: c.sharpeHalves, p: c.pValue, dsr: c.dsr, t: c.tStat, skew: c.skew, from: c.from });
console.log(JSON.stringify({ gate: g, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, pick(v)])), corr: corr.matrix, trades: { P1: tP1.length, P2: tP2.length }, harness: Object.fromEntries(Object.entries(harness).map(([k, v]) => [k, { oos: v.sharpeOosHarness, all: v.sharpeAllHarness, gross: v.grossOos, costBp: v.costDragAnnBp, carryBp: v.carryAnnBp }])) }, null, 1));
