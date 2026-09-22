// Synthetic, no-network unit tests for the MVE book layer (js/mve/bookFactor.js).
// Seeded (mulberry32), so every run is identical. Each block proves a property the
// real run relies on — most importantly that the audit tells a disguised DOLLAR
// bet apart from a genuine RELATIVE-VALUE edge, and invents nothing on noise.
//
//   node js/mve/bookFactor.test.mjs

import { symmetricEigen, symmetricEigenvalues } from '../diversificationCore.js';
import { mulberry32 } from '../statsCore.js';
import {
  CCYS, USD_MAJORS, alignCloses, currencyReturns, windowFactors, noiseBand, kBeatingNoise,
  pairToCurrency, currencyToPair, projectOut, exposureColumns, positionsAfterClose,
  runBookLayer, readBook, publicBookResult,
} from './bookFactor.js';

let failures = 0, tests = 0;
const ok = (name, cond, extra = '') => { tests++; console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const rng = mulberry32(12345);
const gauss = () => { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };

console.log('symmetricEigen');
{
  const m = 8;
  const B = Array.from({ length: m }, () => Array.from({ length: m }, gauss));
  const A = B.map((r, i) => r.map((_, j) => B.reduce((s, row) => s + row[i] * row[j], 0)));   // BᵀB, symmetric PSD
  const { values, vectors } = symmetricEigen(A);
  let maxResid = 0, maxOrth = 0;
  for (let k = 0; k < m; k++) {
    const Av = A.map(row => row.reduce((s, v, j) => s + v * vectors[k][j], 0));
    Av.forEach((v, i) => { maxResid = Math.max(maxResid, Math.abs(v - values[k] * vectors[k][i])); });
    for (let l = 0; l < m; l++) {
      const d = vectors[k].reduce((s, v, i) => s + v * vectors[l][i], 0);
      maxOrth = Math.max(maxOrth, Math.abs(d - (k === l ? 1 : 0)));
    }
  }
  ok('A·v = λ·v for every pair', maxResid < 1e-8, `max resid ${maxResid.toExponential(2)}`);
  ok('eigenvectors orthonormal', maxOrth < 1e-10);
  ok('values descending', values.every((v, i) => i === 0 || values[i - 1] >= v));
  ok('symmetricEigenvalues is the same computation', symmetricEigenvalues(A).every((v, i) => near(v, values[i])));
}

console.log('pair ↔ currency');
{
  const w = pairToCurrency({ eurusd: 1, usdjpy: -2 });
  ok('EURUSD +1 → EUR +1, USD −1', w[CCYS.indexOf('EUR')] === 1 && w[CCYS.indexOf('USD')] === -1 - 2);
  ok('USDJPY −2 → JPY +2', w[CCYS.indexOf('JPY')] === 2);
  ok('USD-pair book has Σw = 0', near(w.reduce((a, b) => a + b, 0), 0));
  const back = currencyToPair(w);
  ok('round trip onto the USD majors is exact', near(back.eurusd, 1) && near(back.usdjpy, -2) && near(back.gbpusd, 0));
  const x = pairToCurrency({ eurgbp: 1 });
  ok('crosses map too (EURGBP → +EUR −GBP)', x[CCYS.indexOf('EUR')] === 1 && x[CCYS.indexOf('GBP')] === -1);
}

console.log('projection');
{
  const cols = [Array.from({ length: 8 }, gauss), Array.from({ length: 8 }, gauss), new Array(8).fill(1)];
  const w = Array.from({ length: 8 }, gauss);
  const wn = projectOut(w, cols);
  const maxExp = Math.max(...cols.map(c => Math.abs(c.reduce((s, v, i) => s + v * wn[i], 0))));
  ok('projected book has zero exposure to every column', maxExp < 1e-10, `max ${maxExp.toExponential(2)}`);
  const wn2 = projectOut(wn, cols);
  ok('projection is idempotent', wn.every((v, i) => near(v, wn2[i], 1e-12)));
}

console.log('alignCloses');
{
  const c = { eurusd: [{ date: '2020-01-03', close: 1 }, { date: '2020-01-05', close: 1.01 }, { date: '2020-01-06', close: 1.02 }] };
  const a = alignCloses(c, ['eurusd']);
  ok('Sunday stub dropped, Monday return spans Friday → Monday', a.dates.join() === '2020-01-03,2020-01-06');
}

console.log('positionsAfterClose');
{
  const dates = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-06'];
  const pos = positionsAfterClose([{ pair: 'EURUSD', date: '2020-01-02', exitDate: '2020-01-06', dir: 'SHORT' }], dates);
  ok('flat before entry close', !pos[0].eurusd);
  ok('held after entry close and until the exit close', pos[1].eurusd === -1 && pos[2].eurusd === -1);
  ok('flat after the exit close', !pos[3].eurusd);
}

// ── synthetic market: 2 currency factors + idiosyncratic, with a planted reverting
//    EUR residual and a MOMENTUM dollar factor, so both kinds of edge exist. ──────
function synthMarket(nDays = 1500) {
  const pairs = Object.keys(USD_MAJORS);
  const usdLoad = { EUR: 1, GBP: 0.9, AUD: 1.1, NZD: 1.1, JPY: 0.6, CAD: 0.7, CHF: 0.8 };
  const riskLoad = { EUR: 0.1, GBP: 0.3, AUD: 1, NZD: 1, JPY: -0.8, CAD: 0.5, CHF: -0.6 };
  const closes = Object.fromEntries(pairs.map(p => [p, [1]]));
  const dates = [];
  const d0 = Date.UTC(2015, 0, 1);
  let fPrev = 0, eurIdioLevel = 0;
  const fUsd = [], eIdio = [];
  let cal = 0;
  for (let t = 0; t < nDays; t++) {
    // weekdays only, like real FX closes (alignCloses drops weekend stubs)
    let dt; do { dt = new Date(d0 + cal++ * 86_400_000); } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
    dates.push(dt.toISOString().slice(0, 10));
    if (t === 0) continue;
    const f = 0.12 * fPrev + 0.004 * gauss();           // dollar factor with mild momentum (realistic edge size)
    const g = 0.004 * gauss();                           // risk factor, no memory
    const prevLevel = eurIdioLevel;
    eurIdioLevel = 0.85 * eurIdioLevel + 0.0012 * gauss(); // reverting EUR residual level (idio-sized, not factor-sized)
    const eurIdioRet = eurIdioLevel - prevLevel;
    fUsd.push(f); eIdio.push(eurIdioLevel);
    fPrev = f;
    for (const p of pairs) {
      const [ccy, sign] = USD_MAJORS[p];
      let r = usdLoad[ccy] * f + riskLoad[ccy] * g + 0.0015 * gauss();
      if (ccy === 'EUR') r += eurIdioRet;
      const last = closes[p][closes[p].length - 1];
      closes[p].push(last * Math.exp(sign * r));          // pair return = sign × currency return
    }
  }
  const closesByPair = Object.fromEntries(pairs.map(p => [p, closes[p].map((c, i) => ({ date: dates[i], close: c }))]));
  return { closesByPair, dates, fUsd, eIdio };
}

console.log('factor model on synthetic currencies');
const mkt = synthMarket();
const aligned = alignCloses(mkt.closesByPair);
const cr = currencyReturns(aligned);
{
  const fm = windowFactors(cr.R.slice(0, 120));
  const band = noiseBand(120, 8, { sims: 200 });
  ok('noise band descends by rank', band.every((v, i) => i === 0 || band[i - 1] >= v));
  const k = kBeatingNoise(fm.shares, band);
  ok('2-factor market: 1–3 components beat noise', k >= 1 && k <= 3, `k=${k}, shares ${fm.shares.slice(0, 3).map(s => (s * 100).toFixed(1)).join('/')}%`);
  ok('basket-demeaned correlation matrix has a ~0 eigenvalue (rank 7)', Math.abs(fm.values[7]) < 1e-8);
}

// Sleeves (positions after close t, using information up to close t only):
//   dollarBeta: every USD pair signed with yesterday's dollar-factor move (momentum)
//   relValue:   EURUSD only, against the planted EUR residual level
//   noise:      random USD-pair positions
function sleeves() {
  const closeDates = aligned.dates;
  const n = closeDates.length;
  const r2 = mulberry32(99);
  const dollar = [], rel = [], noise = [];
  for (let i = 0; i < n; i++) {
    const f = i >= 1 ? mkt.fUsd[i - 1] : 0;           // fUsd[i-1] is the factor move INTO close i
    const e = i >= 1 ? mkt.eIdio[i - 1] : 0;
    const s = Math.sign(f);
    dollar.push(Object.fromEntries(Object.entries(USD_MAJORS).map(([p, [, sign]]) => [p, s * sign])));
    rel.push({ eurusd: e > 0 ? -1 : 1 });
    // random direction, held ~10 days like the real sleeves (daily flips would just measure cost)
    if (i % 10 === 0) noise.cur = { eurusd: r2() < 0.5 ? 1 : -1, usdjpy: r2() < 0.5 ? 1 : -1, audusd: r2() < 0.5 ? 1 : -1 };
    noise.push({ ...noise.cur });
  }
  return { dollarBeta: dollar, relValue: rel, noise };
}

console.log('book layer — the audit must tell a dollar bet from relative value');
const costOneWay = Object.fromEntries(Object.keys(USD_MAJORS).map(p => [p, 0.0001]));
const res = runBookLayer({ ...cr, books: sleeves(), splitDate: cr.dates[Math.floor(cr.dates.length * 0.6)], costOneWay, K: 2, shadowResidual: true });
{
  const d = res.books.dollarBeta, r = res.books.relValue, z = res.books.noise;
  ok('dollar-beta sleeve: raw edge exists', d.raw.gross.OOS.sharpe > 0.7, `raw OOS gross ${d.raw.gross.OOS.sharpe}`);
  ok('dollar-beta sleeve: neutral OOS Sharpe collapses (< 0.3)', d.neutral.net.OOS.sharpe < 0.3, `neutral ${d.neutral.net.OOS.sharpe}`);
  ok('dollar-beta sleeve: most ex-ante variance is factor', d.meanFactorVarShare > 0.7, `share ${d.meanFactorVarShare}`);
  ok('rel-value sleeve: the hedge cuts volatility', r.neutral.gross.OOS.annVolPct < r.raw.gross.OOS.annVolPct, `vol ${r.raw.gross.OOS.annVolPct}% → ${r.neutral.gross.OOS.annVolPct}%`);
  ok('rel-value sleeve reads RELATIVE-VALUE', readBook(r).verdict === 'RELATIVE-VALUE', readBook(r).read);
  ok('dollar-beta sleeve does NOT read RELATIVE-VALUE', readBook(d).verdict !== 'RELATIVE-VALUE', readBook(d).read);
  const se = Math.sqrt(252 / z.raw.gross.OOS.days);
  ok('noise sleeve: raw and neutral gross Sharpe within 2 SE of zero', Math.abs(z.raw.gross.OOS.sharpe) < 2 * se && Math.abs(z.neutral.gross.OOS.sharpe) < 2 * se,
    `raw ${z.raw.gross.OOS.sharpe} neutral ${z.neutral.gross.OOS.sharpe} (2SE ${(2 * se).toFixed(2)})`);
  ok('ex-ante risk of a raw single-pair USD position is mostly factor too', r.meanFactorVarShare > 0.5, `share ${r.meanFactorVarShare}`);
  ok('shadow residual sleeve runs and trades', res.books.pcaResidual.activeDays > 100);
}

console.log('no lookahead');
{
  const cut = 900;
  const trunc = { dates: cr.dates.slice(0, cut), R: cr.R.slice(0, cut), pairRet: Object.fromEntries(Object.entries(cr.pairRet).map(([p, a]) => [p, a.slice(0, cut)])) };
  const books = sleeves();
  const a = runBookLayer({ ...cr, books, splitDate: '2099-01-01', costOneWay, K: 2, shadowResidual: true });
  const b = runBookLayer({ ...trunc, books, splitDate: '2099-01-01', costOneWay, K: 2, shadowResidual: true });
  const sa = a.books.pcaResidual._streams.neutral, sb = b.books.pcaResidual._streams.neutral;
  const sa2 = a.books.dollarBeta._streams.neutral, sb2 = b.books.dollarBeta._streams.neutral;
  ok('truncating the future leaves every past day identical', sb.every((v, i) => v === sa[i]) && sb2.every((v, i) => v === sa2[i]), `${sb.length} days compared`);
}

console.log('public result');
{
  const pub = publicBookResult(res);
  ok('streams stripped, curve + reading present', !pub.books.relValue._streams && pub.books.relValue.curve.length > 10 && pub.books.relValue.reading.verdict);
}

console.log(`\n${failures ? '❌' : '✅'} bookFactor tests: ${tests - failures}/${tests} passed`);
if (failures) process.exit(1);
