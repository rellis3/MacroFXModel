/**
 * Unit tests for fxFactorSignals — pure, synthetic, no network.
 * Run: node js/fxFactorSignals.test.mjs
 */
import {
  annualVolAt, ewmaVolSeries, yzAnnualVolByDate, invertBars, mapToDates,
  tstatTrendAt, ewmacForecastSeries, rescaleForecastSeries, combineForecasts,
  carryForecastSeries, multiHorizonScoreAt, residualReturnsAt,
  correlationFactorAt, volRegimeMultiplierSeries, bufferedWeight,
  doubleSortSelect, riskGateSeries,
} from './fxFactorSignals.js';
import { mulberry32 } from './statsCore.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + name); } }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const rng = mulberry32(7);
const gauss = () => { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
const day = i => new Date(Date.UTC(2010, 0, 1) + i * 86400000).toISOString().slice(0, 10);

// ── vol ────────────────────────────────────────────────────────────────────────
{
  const r = Array.from({ length: 3000 }, () => 0.01 * gauss());
  const v = annualVolAt(r, 2999, 2000);
  ok('annualVolAt ≈ 0.01·√252', Math.abs(v - 0.01 * Math.sqrt(252)) < 0.01);
  ok('annualVolAt NaN before window', Number.isNaN(annualVolAt(r, 5, 60)));
  const e = ewmaVolSeries(r, 32);
  ok('ewmaVol NaN before minObs', Number.isNaN(e[5]));
  ok('ewmaVol level', Math.abs(e[2999] - 0.1587) < 0.06);
  // no lookahead: changing a future return must not change past values
  const r2 = r.slice(); r2[2000] = 0.5;
  const e2 = ewmaVolSeries(r2, 32);
  ok('ewmaVol no lookahead', e2[1999] === e[1999] && e2[2000] !== e[2000]);
}
{
  // YZ on constant-range bars: positive, keyed by date, starts after window
  const bars = []; let c = 1;
  for (let i = 0; i < 100; i++) { const o = c; c = o * Math.exp(0.005 * gauss()); bars.push({ date: day(i), open: o, high: Math.max(o, c) * 1.002, low: Math.min(o, c) * 0.998, close: c }); }
  const m = yzAnnualVolByDate(bars, 21);
  ok('YZ first key after window', !m.has(day(20)) && m.has(day(21)));
  ok('YZ plausible', [...m.values()].every(v => v > 0.01 && v < 1));
  const inv = invertBars(bars);
  ok('invertBars high/low swap', near(inv[5].high, 1 / bars[5].low) && near(inv[5].low, 1 / bars[5].high));
  const mapped = mapToDates([day(0), day(21), day(22), day(200)], m);
  ok('mapToDates ffill', Number.isNaN(mapped[0]) && mapped[1] === m.get(day(21)) && mapped[3] === m.get(day(99)));
}

// ── trend signals ──────────────────────────────────────────────────────────────
{
  const up = Array.from({ length: 300 }, () => 0.001 + 0.001 * gauss());
  ok('tstat strong up → +1', tstatTrendAt(up, 299, 252) === 1);
  ok('tstat strong down → −1', tstatTrendAt(up.map(x => -x), 299, 252) === -1);
  const noise = Array.from({ length: 300 }, () => 0.01 * gauss());
  const t = tstatTrendAt(noise, 299, 252);
  ok('tstat noise in (−1,1)', Math.abs(t) <= 1);
  ok('tstat 0 before window', tstatTrendAt(up, 100, 252) === 0);
}
{
  const p = []; let v = 1; for (let i = 0; i < 800; i++) { v *= Math.exp(0.001 + 0.005 * gauss()); p.push(v); }
  const f = ewmacForecastSeries(p, 16);
  ok('EWMAC NaN before slow window', Number.isNaN(f[60]));
  ok('EWMAC positive on uptrend', f[799] > 0 && Math.abs(f[799]) <= 20);
  let threw = false; try { ewmacForecastSeries(p, 3); } catch { threw = true; }
  ok('EWMAC unknown speed throws', threw);
  const rs = rescaleForecastSeries(f.map(x => (Number.isFinite(x) ? x * 3 : x)), { minHist: 100 });
  const tail = rs.slice(-300).filter(Number.isFinite);
  ok('rescale caps ±20', tail.every(x => Math.abs(x) <= 20));
  const combo = combineForecasts([ewmacForecastSeries(p, 8), ewmacForecastSeries(p, 32)], null, { minHist: 50 });
  ok('combineForecasts finite tail', Number.isFinite(combo[799]));
}
{
  const carry = Array(400).fill(3), vol = Array(400).fill(0.1);
  const f = carryForecastSeries(carry, vol);
  ok('carry forecast = 3%/10% × 30 = 9', near(f[399], 9, 1e-6));
  ok('carry forecast cap', carryForecastSeries(Array(10).fill(50), Array(10).fill(0.05))[9] === 20);
}
{
  const r = Array.from({ length: 300 }, () => 0.0005 + 0.005 * gauss());
  ok('multiHorizon positive on drift', multiHorizonScoreAt(r, 299) > 0);
  ok('multiHorizon NaN before 252', Number.isNaN(multiHorizonScoreAt(r, 200)));
}
{
  // Residuals remove a shared dollar factor: A = DOL + idio, residual ≈ idio
  const n = 300, dol = Array.from({ length: n }, () => 0.01 * gauss());
  const R = {};
  for (const c of ['A', 'B', 'C', 'D']) R[c] = dol.map(x => x + 0.002 * gauss());
  const res = residualReturnsAt(R, n - 1, 252);
  const resStd = Math.sqrt(res.A.reduce((s, x) => s + x * x, 0) / res.A.length);
  ok('residual strips dollar factor', resStd < 0.004);
  ok('residual null before window', residualReturnsAt(R, 100, 252) === null);
}

// ── sizing ─────────────────────────────────────────────────────────────────────
{
  const n = 200, common = Array.from({ length: n }, () => 0.01 * gauss());
  const same = { A: common.slice(), B: common.slice(), C: common.slice() };
  const cfSame = correlationFactorAt({ A: 1, B: 1, C: 1 }, same, n - 1);
  ok('CF ρ=1 all long → 1', near(cfSame.cf, 1, 1e-6));
  const indep = { A: [], B: [], C: [] };
  for (let i = 0; i < n; i++) for (const c of ['A', 'B', 'C']) indep[c].push(0.01 * gauss());
  const cfInd = correlationFactorAt({ A: 1, B: 1, C: 1 }, indep, n - 1, { maxCF: 10 });
  ok('CF ρ≈0 → ≈√N', Math.abs(cfInd.cf - Math.sqrt(3)) < 0.35);
  const cfHedged = correlationFactorAt({ A: 1, B: -1 }, { A: common, B: common }, n - 1);
  ok('CF long/short same asset → capped', cfHedged.cf === 2.5);
  ok('CF single asset → 1', correlationFactorAt({ A: 1 }, same, n - 1).cf === 1);
}
{
  const vol = [...Array.from({ length: 1500 }, () => 0.1 * (1 + 0.2 * gauss())), ...Array(100).fill(0.3)];
  const m = volRegimeMultiplierSeries(vol, { minHist: 500 });
  ok('vol regime NaN before history', Number.isNaN(m[100]));
  ok('vol regime in [0.5,2]', m.filter(Number.isFinite).every(x => x >= 0.5 && x <= 2));
  ok('vol spike lowers multiplier', m[1599] < m[1499]);
}
{
  ok('buffer keeps old inside band', bufferedWeight(0.5, 0.55, 0.1) === 0.5);
  ok('buffer trades to edge up', near(bufferedWeight(0.5, 0.8, 0.1), 0.7));
  ok('buffer trades to edge down', near(bufferedWeight(0.5, 0.2, 0.1), 0.3));
  ok('buffer width 0 → target', bufferedWeight(0.5, 0.8, 0) === 0.8);
}
{
  const carry = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
  const mom = { A: -1, B: 2, C: 0, D: 0, E: 3, F: -2 };
  const sel = doubleSortSelect(carry, mom);
  ok('double sort long = high carry winner', sel.long.join() === 'B');
  ok('double sort short = low carry loser', sel.short.join() === 'F');
  ok('double sort too few → empty', doubleSortSelect({ A: 1, B: 2 }, { A: 1, B: 2 }).long.length === 0);
}
{
  const n = 600;
  const vix = Array.from({ length: n }, (_, i) => (i === n - 1 ? 60 : 15 + (i % 7)));
  const vix3m = Array.from({ length: n }, (_, i) => (i === n - 1 ? 30 : 25));
  const ust = Array.from({ length: n }, (_, i) => (i === n - 1 ? 5 : 3 + 0.01 * Math.sin(i)));
  const g = riskGateSeries({ vix, vix3m, ust10: ust });
  ok('gate calm → 1', g[300].m === 1);
  ok('gate all three flags → 0', g[n - 1].m === 0 && g[n - 1].inverted && g[n - 1].vixHigh && g[n - 1].rateShock);
  const g1 = riskGateSeries({ vix: Array(10).fill(25), vix3m: Array(10).fill(20), ust10: Array(10).fill(3) });
  ok('gate inversion only → 0.5', g1[9].m === 0.5);
}

console.log(`fxFactorSignals: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
