/**
 * portfolio-book-prop — daily prop rows for the Portfolio Book (forge/PORTFOLIO_BOOK_PROP_PREREG.md §3, build step 1).
 *
 * Builds the all-haircuts book exactly as portfolio-book-validate's combined book (one-day delay, CFD financing,
 * no NAS100, no FOMC), captures each leg's held position, and turns the book into one row per weekday:
 *   Return %  the book's daily return
 *   MAE %     intraday worst point: Σ legs exposure × adverse excursion from the prior close to the day's NY-close bar
 *             low (long) / high (short), as if every leg hit its worst together; capped at min(0, Return %)
 *   MAE_cc %  min(0, Return %): close-to-close only (the optimistic bound)
 * Book A = S1g + S2 + S3g (CFD-tradeable). Book B = A + S5g (vol proxy, reference only).
 *
 *   node scripts/portfolio-book-prop/build_rows.mjs
 * → analysis/output/portfolio-book-prop/{rows_A.csv, rows_B.csv, terminal_A.csv, build.json}
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { buildPortfolio } from '../portfolio-book/build.mjs';
import { buildBook, bookTrades, toCsv, scoreStream, UNIT } from '../../js/portfolioBook.js';
import { makeTransform } from '../portfolio-book-validate/delay_transform.mjs';
import { openStore } from '../../js/harness/features.mjs';

const OUT = 'analysis/output/portfolio-book-prop';
const FROM = '2016-01-04', TO = '2026-08-21';
const D1 = { eurusd: 'EURUSD', gbpusd: 'GBPUSD', audusd: 'AUDUSD', nzdusd: 'NZDUSD', usdcad: 'USDCAD', usdchf: 'USDCHF', usdjpy: 'USDJPY', xauusd: 'GOLD', spx500: 'SPX500' };
const BOOKS = { A: { S1g: 1, S2: 1, S3g: 1 }, B: { S1g: 1, S2: 1, S3g: 1, S5g: 1 } };
const log = m => process.stderr.write(`${m}\n`);

const store = await openStore();
const transform = makeTransform(store, { delay: true, finance: true });
// held positions per (sleeve, inst): captured from the transform, same delay rule as delay_transform.mjs
const held = {};
const capture = async (sid, inst, p, ctx) => {
  const n = p.dates.length, h = new Map();
  for (let i = 2; i < n; i++) h.set(p.dates[i], p.pos[i - 2]);   // delay: the position earning day i was decided two closes back
  (held[sid] ??= {})[inst] = { h, dates: p.dates };
  return transform(sid, inst, p, ctx);
};

log('build (S1g, S2, S3g, S5g; delay + financing; no NAS100)');
const b0 = await buildPortfolio({ sleeveIds: ['S1g', 'S2', 'S3g', 'S5g'], store, log, legTransform: capture, s5Delay: 1, exclude: { S1g: ['nas100'], S2: ['nas100'] } });

const dates = b0.dates, N = dates.length, di = new Map(dates.map((d, i) => [d, i]));
const ny = {};
for (const [inst, name] of Object.entries(D1)) {
  const rows = JSON.parse(await readFile(`analysis/output/ladder_candidates/d1/${name}.json`, 'utf8'));
  const m = new Map(); rows.forEach((r, i) => { if (i) m.set(r.d, { pc: rows[i - 1].c, h: r.h, l: r.l, c: r.c }); });
  ny[inst] = m;
}
const px = {};
for (const inst of Object.keys(D1)) px[inst] = new Map((await store.series(`px_d1_${inst}`, { from: '2007-01-01', to: TO })).map(r => [String(r.date), Number(r.value)]));

const result = { id: 'portfolio-book-prop', ranAt: new Date().toISOString(), window: { from: FROM, to: TO }, books: {} };
await mkdir(OUT, { recursive: true });

for (const [bk, weights] of Object.entries(BOOKS)) {
  const sleeves = Object.keys(weights).map(id => b0.sleeves[id]);
  const data = { dates, sleeves };
  const book = buildBook(data, weights);
  const recon = new Array(N).fill(0), mae = new Array(N).fill(0);
  let legDays = 0, missingBar = 0;
  sleeves.forEach((s, si) => {
    const B = book.sleeves[si];
    const nLegs = new Array(N).fill(0);
    for (const leg of s.legs) for (const d of (held[s.id]?.[leg.inst]?.dates ?? [])) { const k = di.get(d); if (k != null) nLegs[k]++; }
    for (const leg of s.legs) {
      const H = held[s.id]?.[leg.inst];
      for (let k = 0; k < N; k++) {
        const f = B.scale[k] * B.wNorm[k] * book.bookScale[k];
        if (!(f > 0)) continue;
        const contrib = (leg.c[k] / UNIT) * f;   // this leg's share of the book's return today
        if (!H) { mae[k] += Math.min(0, contrib); continue; }   // the vol proxy: no bar
        const pos = H.h.get(dates[k]);
        if (!pos || !nLegs[k]) { mae[k] += Math.min(0, contrib); continue; }
        const e = (pos / nLegs[k]) * f;
        const p0 = px[leg.inst].get(dates[k - 1] ?? ''), p1 = px[leg.inst].get(dates[k]);
        if (p0 && p1) recon[k] += e * (p1 / p0 - 1);
        const inWin = dates[k] >= FROM && dates[k] <= TO;
        if (inWin) legDays++;
        const bar = ny[leg.inst].get(dates[k]);
        if (!bar) { if (inWin) missingBar++; mae[k] += Math.min(0, contrib); continue; }
        const adv = e > 0 ? bar.l / bar.pc - 1 : bar.h / bar.pc - 1;
        mae[k] += Math.min(0, e * adv, contrib);
      }
    }
  });
  const idx = dates.map((d, k) => k).filter(k => dates[k] >= FROM && dates[k] <= TO && book.rets.slice(0, k + 1).some(r => r !== 0));
  const r = idx.map(k => book.rets[k]), rc = idx.map(k => recon[k]);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const mr = mean(r), mc = mean(rc);
  const corr = r.reduce((s, x, i) => s + (x - mr) * (rc[i] - mc), 0) / Math.sqrt(r.reduce((s, x) => s + (x - mr) ** 2, 0) * rc.reduce((s, x) => s + (x - mc) ** 2, 0));
  const rows = idx.map(k => ({ Date: dates[k], ret: book.rets[k] * 100, mae: Math.min(mae[k], book.rets[k], 0) * 100, maeCc: Math.min(book.rets[k], 0) * 100 }));
  await writeFile(`${OUT}/rows_${bk}.csv`, 'Date,Return %,MAE %,MAE_cc %\n' + rows.map(x => `${x.Date},${x.ret.toFixed(6)},${x.mae.toFixed(6)},${x.maeCc.toFixed(6)}`).join('\n') + '\n');
  const sc = scoreStream(dates.slice(idx[0], idx.at(-1) + 1), book.rets.slice(idx[0], idx.at(-1) + 1), { startIdx: 0 });
  result.books[bk] = {
    weights, days: rows.length, reconCorr: +corr.toFixed(4), reconPass: corr >= 0.98, legDays, missingBar,
    window: { sharpe: sc.sharpe, cagrPct: sc.cagrPct, volPct: sc.volPct, maxDdPct: sc.maxDdPct },
    meanDailyPct: +(mean(r) * 100).toFixed(5), sdDailyPct: +(Math.sqrt(mean(r.map(x => (x - mr) ** 2))) * 100).toFixed(4),
    maeMedianPct: +rows.map(x => x.mae).sort((a, b) => a - b)[Math.floor(rows.length / 2)].toFixed(4),
    maeWorstPct: +Math.min(...rows.map(x => x.mae)).toFixed(3), retWorstPct: +Math.min(...rows.map(x => x.ret)).toFixed(3),
  };
  log(`${bk}: ${rows.length} days, recon corr ${corr.toFixed(4)}, Sharpe ${sc.sharpe}, missing bars ${missingBar}/${legDays}`);
  if (bk === 'A') {
    const trades = bookTrades(data, book).filter(t => t['Exit Date'] >= FROM && t.Date <= TO);
    await writeFile(`${OUT}/terminal_A.csv`, toCsv(trades));
    result.books.A.trades = trades.length;
  }
}
await writeFile(`${OUT}/build.json`, JSON.stringify(result, null, 1));
if (!result.books.A.reconPass) { log('RECONSTRUCTION CHECK FAILED (prereg §3 stop rule): no prop cell may run'); process.exit(2); }
