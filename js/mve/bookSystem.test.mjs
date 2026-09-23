// Synthetic tests for the sized system backtest (js/mve/bookSystem.js).
//   node js/mve/bookSystem.test.mjs

import { mulberry32 } from '../statsCore.js';
import { USD_MAJORS, alignCloses, currencyReturns } from './bookFactor.js';
import { runBookSystem, systemMetrics, byPeriod, readSystem } from './bookSystem.js';
import { sharpeRatio } from '../metricsCore.js';

let failures = 0, tests = 0;
const ok = (name, cond, extra = '') => { tests++; console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const rng = mulberry32(2024);
const gauss = () => { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };

// Weekday synthetic market: a dollar factor with momentum, a risk factor, and a
// reverting EUR residual (same construction as bookFactor.test.mjs).
function synth(nDays = 1400) {
  const pairs = Object.keys(USD_MAJORS);
  const usdLoad = { EUR: 1, GBP: 0.9, AUD: 1.1, NZD: 1.1, JPY: 0.6, CAD: 0.7, CHF: 0.8 };
  const riskLoad = { EUR: 0.1, GBP: 0.3, AUD: 1, NZD: 1, JPY: -0.8, CAD: 0.5, CHF: -0.6 };
  const closes = Object.fromEntries(pairs.map(p => [p, [1]]));
  const dates = []; let cal = 0, fPrev = 0, lvl = 0; const fUsd = [0], eLvl = [0];
  for (let t = 0; t < nDays; t++) {
    let dt; do { dt = new Date(Date.UTC(2015, 0, 1) + cal++ * 864e5); } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
    dates.push(dt.toISOString().slice(0, 10));
    if (t === 0) continue;
    const f = 0.12 * fPrev + 0.004 * gauss(), g = 0.004 * gauss();
    const prevL = lvl; lvl = 0.85 * lvl + 0.0012 * gauss();
    fUsd.push(f); eLvl.push(lvl); fPrev = f;
    for (const p of pairs) {
      const [ccy, sign] = USD_MAJORS[p];
      let r = usdLoad[ccy] * f + riskLoad[ccy] * g + 0.0015 * gauss();
      if (ccy === 'EUR') r += lvl - prevL;
      closes[p].push(closes[p][closes[p].length - 1] * Math.exp(sign * r));
    }
  }
  return { closesByPair: Object.fromEntries(pairs.map(p => [p, closes[p].map((c, i) => ({ date: dates[i], close: c }))])), dates, fUsd, eLvl };
}
const mkt = synth();
const aligned = alignCloses(mkt.closesByPair);
const cr = currencyReturns(aligned);
const cd = aligned.dates;

// Trades built from information at the entry close only, held 5 days.
function tradesFrom(signalAt, pair, hold = 5) {
  const out = [];
  for (let i = 1; i + hold < cd.length; i += hold + 1) {
    const s = signalAt(i); if (!s) continue;
    out.push({ sleeve: 'syn', pair, dir: s > 0 ? 'LONG' : 'SHORT', date: cd[i], exitDate: cd[i + hold] });
  }
  return out;
}
const relTrades = tradesFrom(i => (mkt.eLvl[i] > 0 ? -1 : 1), 'EURUSD');
const dollarTrades = [];
for (const p of Object.keys(USD_MAJORS)) dollarTrades.push(...tradesFrom(i => {
  const f = mkt.fUsd[i]; return (USD_MAJORS[p][1]) * (f > 0 ? 1 : -1);
}, p, 1));   // the planted dollar momentum is 1-day, so the bet holds 1 day

console.log('sizing + accounting');
const rel = runBookSystem({ ...cr, closeDates: cd, trades: relTrades });
{
  // Unhedged packages carry factor vol, so the 10% target is reachable under the cap:
  const unh = runBookSystem({ ...cr, closeDates: cd, trades: relTrades, opts: { hedge: false } });
  const vol = r => { const a = r.net.filter((_, i) => r.leverage[i] > 0); const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)) * Math.sqrt(252); };
  ok('unhedged: realised vol on active days ≈ the 10% target', Math.abs(vol(unh) - 0.10) < 0.02, `${(vol(unh) * 100).toFixed(1)}%`);
  ok('ex-ante vol = target unless the gross cap binds', rel.exAnteVol.every((v, i) => rel.leverage[i] === 0 || Math.abs(v - 0.10) < 1e-9 || rel.leverage[i] >= 5 - 1e-9));
  // A hedged single-pair package has little vol left; reaching 10% would need > 5× gross,
  // so the cap binds and realised vol sits BELOW target — a real property, reported.
  ok('hedged: when the cap binds, realised vol ≤ target', vol(rel) <= 0.11, `${(vol(rel) * 100).toFixed(1)}%`);
  ok('gross leverage never exceeds the 5× cap', Math.max(...rel.leverage) <= 5 + 1e-9, `max ${Math.max(...rel.leverage).toFixed(2)}`);
  const tradeGross = rel.trades.reduce((a, t) => a + t.grossPct, 0) / 100;
  const bookGross = rel.gross.reduce((a, b) => a + b, 0);
  ok('per-trade gross P&L sums to the book (hedge is linear; only the 4-dp rounding differs)', Math.abs(tradeGross - bookGross) < rel.trades.length * 5e-7, `${tradeGross.toExponential(6)} vs ${bookGross.toExponential(6)}`);
  const tradeCost = rel.trades.reduce((a, t) => a + t.costPct, 0) / 100, bookCost = rel.cost.reduce((a, b) => a + b, 0);
  ok('trade costs ≥ book costs (the book nets turnover; 4-dp rounding aside)', tradeCost >= bookCost - rel.trades.length * 5e-7);
  ok('every trade has an R-unit and MAE ≤ 0', rel.trades.every(t => t.riskPct > 0 && t.maePct <= 0));
}

console.log('the system must tell a dollar bet from relative value');
{
  const split = cd[Math.floor(cd.length * 0.6)];
  const m = (res) => systemMetrics(res.net, res.dates, { leverage: res.leverage, costs: res.cost, trades: res.trades });
  const relH = m(rel), relU = m(runBookSystem({ ...cr, closeDates: cd, trades: relTrades, opts: { hedge: false } }));
  const dolH = m(runBookSystem({ ...cr, closeDates: cd, trades: dollarTrades })), dolU = m(runBookSystem({ ...cr, closeDates: cd, trades: dollarTrades, opts: { hedge: false } }));
  ok('relative-value trades: the hedged system keeps a positive edge', relH.sharpe > 0.25, `hedged ${relH.sharpe} vs unhedged ${relU.sharpe}`);
  // Gross of costs: a 1-day round trip on 7 legs every other day pays turnover that
  // swamps any small edge, which is a cost question, not the hedge question tested here.
  const gs = r => +sharpeRatio(r.gross, 252, 1).toFixed(3);
  const dG = gs(runBookSystem({ ...cr, closeDates: cd, trades: dollarTrades, opts: { hedge: false } }));
  const dGH = gs(runBookSystem({ ...cr, closeDates: cd, trades: dollarTrades }));
  const pcsOnly = runBookSystem({ ...cr, closeDates: cd, trades: dollarTrades, opts: { hedgeMode: 'pcs' } });
  const dGP = gs(pcsOnly);
  ok('dollar-bet trades: unhedged system has the edge (gross)', dG > 0.5, `unhedged gross ${dG} (net ${dolU.sharpe})`);
  ok('dollar-bet trades: PCs + USD-neutral hedge removes it (gross < 0.3)', dGH < 0.3, `pcs+usd gross ${dGH}`);
  ok('regression guard: the PC-only hedge LEAKS the dollar edge (why pcs+usd exists)', dGP > 0.3, `pcs-only gross ${dGP}`);
  const usdOf = r => { const u = r.usdShare.filter(v => v != null); return u.length ? u.reduce((a, b) => a + b, 0) / u.length : 0; };   // no book left = no dollar left
  const rawU = runBookSystem({ ...cr, closeDates: cd, trades: dollarTrades, opts: { hedge: false } });
  ok('leftover-dollar diagnostic: raw ≈ 100%, pcs-only > 0, pcs+usd = 0', usdOf(rawU) > 0.99 && usdOf(pcsOnly) > 0.05 && usdOf(runBookSystem({ ...cr, closeDates: cd, trades: dollarTrades })) < 1e-9,
    `raw ${(usdOf(rawU) * 100).toFixed(0)}% · pcs ${(usdOf(pcsOnly) * 100).toFixed(0)}% · pcs+usd 0%`);
  const dFull = runBookSystem({ ...cr, closeDates: cd, trades: dollarTrades });
  ok('a pure dollar book under pcs+usd is FLAT, not noise levered to the cap', Math.max(...dFull.leverage) === 0);
  ok('CAGR consistent with the compounded curve', Math.abs((1 + relH.cagrPct / 100) ** relH.years - (1 + relH.totalPct / 100)) < 1e-3);
  ok('metrics carry trades, win rate, profit factor', relH.trades === rel.trades.length && relH.winRatePct > 0 && relH.profitFactor > 0);
  const yr = byPeriod(rel.dates, rel.net, 4);
  const compounded = Object.values(yr).reduce((a, v) => a * (1 + v / 100), 1);
  ok('yearly returns compound to the total', Math.abs(compounded - (1 + relH.totalPct / 100)) < 1e-2);
  const rd = readSystem(relH, relH, relH, relH);
  ok('readSystem returns all five pre-registered checks', Object.keys(rd.checks).length === 5);
  void split;
}

console.log('no lookahead');
{
  const cut = 900;
  const tr = { dates: cr.dates.slice(0, cut), R: cr.R.slice(0, cut), pairRet: Object.fromEntries(Object.entries(cr.pairRet).map(([p, a]) => [p, a.slice(0, cut)])) };
  const a = runBookSystem({ ...cr, closeDates: cd, trades: relTrades }), b = runBookSystem({ ...tr, closeDates: cd, trades: relTrades });
  ok('truncating the future leaves every past day identical', b.net.every((v, i) => v === a.net[i]), `${b.net.length} days`);
}

console.log(`\n${failures ? '❌' : '✅'} bookSystem tests: ${tests - failures}/${tests} passed`);
if (failures) process.exit(1);
