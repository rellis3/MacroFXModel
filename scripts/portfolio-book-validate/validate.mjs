/**
 * portfolio-book-validate — T1 (future-poisoning), T2 (CFD financing), T3 (one-day delay),
 * T4 (no NAS100), T5 (no FOMC), T8 (2004-07 holdout) and the combined haircut book.
 * forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md. T0/T9 are separate (run.mjs with PB_OUT; compare_rebuild.py).
 *
 *   node scripts/portfolio-book-validate/validate.mjs
 * → analysis/output/portfolio-book-validate/validate.json
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { buildPortfolio, SAMPLE } from '../portfolio-book/build.mjs';
import { buildBook, scoreStream, P1_WEIGHTS } from '../../js/portfolioBook.js';
import { makeTransform as makeLegTransform } from './delay_transform.mjs';

const OUT = 'analysis/output/portfolio-book-validate';
const log = m => process.stderr.write(`${m}\n`);
const BOOK_IDS = ['S1g', 'S2', 'S3g', 'S4', 'S5g'];
const CUTS = ['2012-06-29', '2017-03-31', '2022-09-30'];

const pick = sc => ({ sharpe: sc.sharpe, cagrPct: sc.cagrPct, volPct: sc.volPct, maxDdPct: sc.maxDdPct, tStat: sc.tStat, sharpeIs: sc.sharpeIs, sharpeOos: sc.sharpeOos, halves: sc.sharpeHalves, worstMonthPct: sc.worstMonthPct, yearsPositive: sc.yearsPositive, from: sc.from, to: sc.to });
function scoreBook(b, weights, ids = BOOK_IDS) {
  const data = { dates: b.dates, sleeves: ids.filter(id => b.sleeves[id]).map(id => b.sleeves[id]) };
  const bk = buildBook(data, weights);
  const s0 = bk.rets.findIndex(r => r !== 0);
  return { book: bk, score: pick(scoreStream(b.dates, bk.rets, { startIdx: s0 })) };
}

const save = async () => { await mkdir(OUT, { recursive: true }); await writeFile(`${OUT}/validate.json`, JSON.stringify(result, null, 1)); };
const result = { id: 'portfolio-book-validate', ranAt: new Date().toISOString(), prereg: 'forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md', tests: {} };

// ── base (weekend-folded, as the parent's page) ──
log('base build');
const base = await buildPortfolio({ log });
const store = base.store;
const baseScore = scoreBook(base, P1_WEIGHTS).score;
result.base = baseScore;
log(`base P1 Sharpe ${baseScore.sharpe}`);

const makeTransform = opts => makeLegTransform(store, opts);   // T2/T3 transforms: ./delay_transform.mjs

// ── T2 financing, T3 delay, T4 no NAS100, T5 no FOMC, combined (reuse the base harness runs) ──
log('T2 financing');
const t2 = await buildPortfolio({ store, runs: base.runs, legTransform: makeTransform({ finance: true }), log });
result.tests.T2 = { ...scoreBook(t2, P1_WEIGHTS).score, bar: 'Sharpe > 0.66' };
result.tests.T2.pass = result.tests.T2.sharpe > 0.66;
await save();

log('T3 delay');
const t3 = await buildPortfolio({ store, runs: base.runs, legTransform: makeTransform({ delay: true }), s5Delay: 1, log });
result.tests.T3 = { ...scoreBook(t3, P1_WEIGHTS).score, bar: '>= 0.75 x base Sharpe', ratio: null };
result.tests.T3.ratio = +(result.tests.T3.sharpe / baseScore.sharpe).toFixed(3);
result.tests.T3.pass = result.tests.T3.ratio >= 0.75;
await save();

log('T4 no NAS100');
const t4 = await buildPortfolio({ store, runs: base.runs, exclude: { S1g: ['nas100'], S2: ['nas100'] }, log });
result.tests.T4 = { ...scoreBook(t4, P1_WEIGHTS).score, bar: 'Sharpe > 0.66' };
result.tests.T4.pass = result.tests.T4.sharpe > 0.66;

const noFomc = { ...P1_WEIGHTS, S4: 0 };
result.tests.T5 = { ...scoreBook(base, noFomc).score, bar: 'Sharpe > 0.66 (not blind: audit printed 0.98)' };
result.tests.T5.pass = result.tests.T5.sharpe > 0.66;
await save();

log('combined haircut book');
const comb = await buildPortfolio({ store, runs: base.runs, legTransform: makeTransform({ delay: true, finance: true }), s5Delay: 1, exclude: { S1g: ['nas100'], S2: ['nas100'] }, log });
result.tests.combined = { ...scoreBook(comb, noFomc).score, bar: 'descriptive' };
// per-sleeve view of the combined book
result.tests.combinedSleeves = Object.fromEntries(['S1g', 'S2', 'S3g', 'S5g'].map(id => [id, pick(scoreStream(comb.dates, buildBook({ dates: comb.dates, sleeves: [comb.sleeves[id]] }, { [id]: 1 }).sleeves[0].scaled, { startIdx: Math.max(0, buildBook({ dates: comb.dates, sleeves: [comb.sleeves[id]] }, { [id]: 1 }).sleeves[0].scaled.findIndex(r => r !== 0)) })).sharpe]));
result.tests.combinedCfdOnly = { ...scoreBook(comb, { S1g: 1, S2: 1, S3g: 1, S4: 0, S5g: 0 }).score, bar: 'descriptive: CFD-tradeable sleeves, all haircuts' };

// ── T1 future-poisoning: cut the data, compare every leg's daily contribution strictly before the cut ──
result.tests.T1 = { cuts: {}, bar: '100% identical before each cut' };
const baseIdx = new Map(base.dates.map((d, i) => [d, i]));
for (const cut of CUTS) {
  log(`T1 cut ${cut}`);
  // isEnd only drives the harness's IS/OOS summary, never a position; it must sit inside the cut window
  const b = await buildPortfolio({ sample: { ...SAMPLE, to: cut, isEnd: cut > SAMPLE.isEnd ? SAMPLE.isEnd : '2010-01-01' }, store, log });
  let compared = 0, mismatched = 0; const examples = [];
  for (const [sid, s] of Object.entries(b.sleeves)) {
    const bs = base.sleeves[sid];
    s.legs.forEach((leg, li) => {
      const bl = bs.legs.find(x => x.inst === leg.inst);
      b.dates.forEach((d, k) => {
        if (d >= cut) return;
        const j = baseIdx.get(d); compared++;
        const v0 = bl ? bl.c[j] : 0;
        if (leg.c[k] !== v0) { mismatched++; if (examples.length < 8) examples.push({ sleeve: sid, inst: leg.inst, date: d, cut: leg.c[k], full: v0 }); }
      });
    });
  }
  // the book itself (sleeve + book scaling) before the cut
  const bk = scoreBook(b, P1_WEIGHTS).book, bf = scoreBook(base, P1_WEIGHTS).book;
  let bookMax = 0; b.dates.forEach((d, k) => { if (d < cut) bookMax = Math.max(bookMax, Math.abs(bk.rets[k] - bf.rets[baseIdx.get(d)])); });
  result.tests.T1.cuts[cut] = { compared, mismatched, examples, bookMaxAbsDiff: bookMax };
  await save();
}
result.tests.T1.pass = Object.values(result.tests.T1.cuts).every(c => c.mismatched === 0 && c.bookMaxAbsDiff < 1e-12);

// ── T8 2004-05-03 → 2007-12-31: S1 (ungated beta), S2 trend, S5 (ungated vol proxy) ──
log('T8 holdout 2004-07');
const t8 = await buildPortfolio({ sample: { from: '2004-05-03', to: '2007-12-31', isEnd: '2006-01-01' }, sleeveIds: ['S1', 'S2', 'S5'], store, log });
result.tests.T8 = { ...scoreBook(t8, { S1: 1, S2: 1, S5: 1 }, ['S1', 'S2', 'S5']).score, bar: 'Sharpe > 0 (UNDERPOWERED: sign check)' };
result.tests.T8.sleeves = Object.fromEntries(['S1', 'S2', 'S5'].map(id => { const st = buildBook({ dates: t8.dates, sleeves: [t8.sleeves[id]] }, { [id]: 1 }).sleeves[0].scaled; return [id, pick(scoreStream(t8.dates, st, { startIdx: Math.max(0, st.findIndex(r => r !== 0)) })).sharpe]; }));
result.tests.T8.pass = result.tests.T8.sharpe > 0;

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/validate.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ base: baseScore.sharpe, ...Object.fromEntries(Object.entries(result.tests).map(([k, v]) => [k, v.cuts ? { pass: v.pass, cuts: Object.fromEntries(Object.entries(v.cuts).map(([c, x]) => [c, [x.compared, x.mismatched, x.bookMaxAbsDiff]])) } : (typeof v.sharpe === 'number' ? { sharpe: v.sharpe, cagr: v.cagrPct, mdd: v.maxDdPct, pass: v.pass, ratio: v.ratio } : v)])) }, null, 1));
