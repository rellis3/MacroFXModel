// Tests for js/factorRisk.js and js/scenarioEngine.js on synthetic data with known factor loadings.
//   node js/factorRisk.test.mjs
import assert from 'node:assert/strict';
import { logReturns, levelChanges, commonDates, carryBasket, ridge, solve, symEigen, buildFactorModel, bookFactorRisk, modelSummary, positions } from './factorRisk.js';
import { normaliseShocks, fillDrivers, runScenario, riskOffShock, replay, standardScenarios, bookRiskText, parseScenarioQuestion, STANDARD_SCENARIOS, REPLAYS } from './scenarioEngine.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const close = (a, b, tol) => Math.abs(a - b) <= tol;

// a seeded normal generator so every series is fixed
let s0 = 20261104; const u = () => { s0 = (s0 * 16807) % 2147483647; return s0 / 2147483647; };
const g = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());

// 700 weekdays from 2023-01-02 (covers August 2024, not March 2020)
const dates = []; for (let d = new Date('2023-01-02T00:00:00Z'); dates.length < 701; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10));
const T = dates.length - 1;
const ser = f => Array.from({ length: T }, f);
const usd = ser(() => 0.4 * g()), risk = ser(() => 1.0 * g()), wti = ser(() => 2 * g()), copper = ser(() => 1.4 * g()), rates = ser(() => 6 * g()), gold = ser(() => 0.9 * g());
const vix = risk.map(r => -1.2 * r + 0.5 * g()), r10 = rates.map(r => 0.8 * r + 2 * g());
// each currency against USD: minus the dollar, AUD/NZD risk-on, JPY a haven, CAD with oil, plus noise
const ccy = {
  EUR: ser((_, i) => -usd[i] + 0.15 * g()), GBP: ser((_, i) => -usd[i] + 0.15 * g()), CHF: ser((_, i) => -usd[i] - 0.1 * risk[i] + 0.15 * g()),
  JPY: ser((_, i) => -usd[i] - 0.3 * risk[i] + 0.2 * g()), AUD: ser((_, i) => -usd[i] + 0.4 * risk[i] + 0.2 * g()), NZD: ser((_, i) => -usd[i] + 0.35 * risk[i] + 0.2 * g()),
  CAD: ser((_, i) => -usd[i] + 0.06 * wti[i] + 0.15 * g()),
};
const path = (r, p0 = 100) => { let p = p0; return dates.map((d, i) => { if (i) p *= Math.exp(r[i - 1] / 100); return { date: d, close: p }; }); };
const neg = a => a.map(x => -x), sub = (a, b) => a.map((x, i) => x - b[i]);
const closes = {
  EURUSD: path(ccy.EUR), GBPUSD: path(ccy.GBP), AUDUSD: path(ccy.AUD), NZDUSD: path(ccy.NZD),
  USDJPY: path(neg(ccy.JPY)), USDCAD: path(neg(ccy.CAD)), USDCHF: path(neg(ccy.CHF)),
  AUDJPY: path(sub(ccy.AUD, ccy.JPY)), EURGBP: path(sub(ccy.EUR, ccy.GBP)),
  SPX500: path(risk), NQ: path(risk.map(r => 1.2 * r + 0.3 * g())), WTI: path(wti), COPPER: path(copper), GOLD: path(gold),
};
const level = (ch, start, scale) => { let v = start; return dates.map((d, i) => { if (i) v += ch[i - 1] / scale; return { date: d, value: +v.toFixed(4) }; }); };
const fred = { DGS2: level(rates, 4, 100), DGS10: level(r10, 4.2, 100), VIXCLS: level(vix, 18, 1) };
const policyRates = { USD: 4.5, EUR: 2, GBP: 4, JPY: 0.5, AUD: 3.6, NZD: 3, CAD: 2.5, CHF: 0 };
const model = buildFactorModel({ closes, fred, policyRates, window: 500, asOf: dates.at(-1) });

t('returns, level changes and common dates', () => {
  const r = logReturns([{ date: '2026-01-02', close: 110 }, { date: '2026-01-01', close: 100 }]);
  assert.ok(close(r.get('2026-01-02'), 100 * Math.log(1.1), 1e-12));
  const c = levelChanges([{ date: 'a', value: 4 }, { date: 'b', value: '.' }, { date: 'c', value: 4.25 }], 100);
  assert.equal(c.get('c'), 25); assert.equal(c.size, 1);
  assert.deepEqual(commonDates([new Map([['x', 1], ['y', 1]]), new Map([['y', 1], ['z', 1]])]), ['y']);
});

t('linear algebra: solve and the symmetric eigen-decomposition', () => {
  assert.deepEqual(solve([[2, 1], [1, 3]], [3, 5]).map(v => +v.toFixed(9)), [0.8, 1.4]);
  const e = symEigen([[2, 1], [1, 2]]), vs = [...e.values].sort((a, b) => a - b);
  assert.ok(close(vs[0], 1, 1e-9) && close(vs[1], 3, 1e-9));
});

t('ridge recovers known betas with a high R²', () => {
  const a = ser(() => g()), b = ser(() => g()), y = a.map((x, i) => 2 * x - b[i] + 0.1 * g());
  const r = ridge(y, [a, b], { lambda: 0.001 });
  assert.ok(close(r.beta[0], 2, 0.05) && close(r.beta[1], -1, 0.05), r.beta.join());
  assert.ok(r.r2 > 0.99); assert.equal(r.n, T);
});

t('carry basket: top three and bottom three policy rates', () => {
  const c = carryBasket(policyRates);
  assert.deepEqual(c.long, ['USD', 'GBP', 'AUD']); assert.deepEqual(c.short, ['EUR', 'JPY', 'CHF']);
  assert.equal(carryBasket({ USD: 1, EUR: 2 }), null);
});

t('the model: five factors, betas match the loadings, n and R² carried', () => {
  assert.deepEqual(model.factors, ['USD', 'CARRY', 'RISK', 'COMMOD', 'RATES']);
  assert.equal(model.factorDays.n, 500);
  const nq = model.instruments.NQ; assert.ok(nq.ok && close(nq.beta.RISK, 1.2, 0.08), `NQ RISK beta ${nq.beta.RISK}`);
  const jpy = model.instruments.USDJPY; assert.ok(jpy.beta.USD > 0.6, `USDJPY USD beta ${jpy.beta.USD}`); assert.ok(jpy.r2 > 0.6 && jpy.n === 500);
  const eur = model.instruments.EURUSD; assert.ok(eur.beta.USD < -0.6, `EURUSD USD beta ${eur.beta.USD}`);
  const s = modelSummary(model); assert.equal(s.factors.length, 5); assert.ok(s.betas.NQ.r2 > 0.8); assert.equal(s.factorCorr.length, 5);
  assert.deepEqual(model.missing, []);
});

t('a missing FRED key drops RATES and the yield drivers, not the model', () => {
  const m = buildFactorModel({ closes, fred: {}, policyRates });
  assert.deepEqual(m.factors, ['USD', 'CARRY', 'RISK', 'COMMOD']);
  assert.ok(m.missing.some(x => /RATES/.test(x))); assert.ok(m.instruments.NQ.ok);
});

const dollarBook = { EURUSD: { rating: 'SHORT', size: 1 }, GBPUSD: { rating: 'SHORT', size: 1 }, AUDUSD: { rating: 'SHORT', size: 1 }, NZDUSD: { rating: 'SHORT', size: 1 },
  USDJPY: { rating: 'LONG', size: 1 }, USDCAD: { rating: 'LONG', size: 1 }, USDCHF: { rating: 'STRONG_LONG', size: 1.2 }, EURGBP: { rating: 'FLAT', size: 1 }, NATGAS: { rating: 'LONG', size: 1 } };
const mixedBook = { SPX500: { rating: 'LONG', size: 1 }, WTI: { rating: 'LONG', size: 1 }, GOLD: { rating: 'LONG', size: 1 }, EURGBP: { rating: 'SHORT', size: 1 }, COPPER: { rating: 'SHORT', size: 1 } };

t('seven dollar cards are one bet: the dollar carries most of the risk and the flag says so', () => {
  const r = bookFactorRisk(model, dollarBook);
  assert.ok(r.ok); assert.equal(r.cards, 7); assert.deepEqual(r.uncovered, ['NATGAS']);
  assert.equal(r.concentration.topFactor.key, 'USD'); assert.ok(r.concentration.topFactor.share > 0.5, `USD share ${r.concentration.topFactor.share}`);
  assert.match(r.concentration.flag, /7 cards, but \d+% of the book's risk is one dollar bet \(long/);
  assert.ok(r.concentration.effectiveBets < 2.5, `effective bets ${r.concentration.effectiveBets}`);
  assert.ok(close(r.allContributions.reduce((a, c) => a + c.share, 0), 1, 0.01));
  const p = r.var.parametric; assert.ok(p['0.99'].var > p['0.95'].var && p['0.95'].es > p['0.95'].var);
  assert.ok(r.var.historical['0.99'].var > 0);
  assert.ok(close(p['0.95'].var, 1.6449 * r.sigma, 0.01));
  assert.ok(r.factors.find(f => f.key === 'USD').perSigma > 0);
});

t('a mixed book has more effective bets and no flag', () => {
  const a = bookFactorRisk(model, dollarBook), b = bookFactorRisk(model, mixedBook);
  assert.ok(b.ok && b.concentration.effectiveBets > a.concentration.effectiveBets);
  assert.equal(b.concentration.flag, null);
  assert.ok(b.concentration.enb > 2);
});

t('no history: ok false with a reason', () => {
  const r = bookFactorRisk(model, { NATGAS: { rating: 'LONG', size: 1 } });
  assert.equal(r.ok, false); assert.deepEqual(r.uncovered, ['NATGAS']);
});

t('shocks: levels, unknown drivers and errors', () => {
  const s = normaliseShocks(model, { vix: { to: 30 }, RATES: 25, FOO: 1, OIL: 'x' });
  assert.ok(close(s.shocks.VIX, 30 - model.levels.VIX.value, 1e-9)); assert.equal(s.shocks.RATES, 25);
  assert.equal(s.errors.length, 2);
});

t('conditional fill = Σ_rs Σ_ss⁻¹ s; isolated leaves unnamed factors at zero', () => {
  const C = model.jointCov, K = model.joint, i = K.indexOf('USD'), j = K.indexOf('RATES');
  const f = fillDrivers(model, { RATES: 25 });
  assert.ok(close(f.USD.value, C[i][j] / C[j][j] * 25, 1e-9)); assert.equal(f.RATES.given, true);
  const iso = fillDrivers(model, { RATES: 25 }, { mode: 'isolated' }); assert.equal(iso.USD.value, 0);
  const oil = fillDrivers(model, { OIL: 10 }, { mode: 'isolated' });
  assert.ok(oil.COMMOD.value > 3, `oil +10% → commodity factor ${oil.COMMOD.value}`);   // COMMOD is half WTI
});

t('a dollar +2% scenario gains on the dollar book, by its betas', () => {
  const r = runScenario(model, dollarBook, { USD: 2 }, { mode: 'isolated' });
  assert.ok(r.ok && r.book.pnl > 0);
  const { live } = positions(model, dollarBook), want = live.reduce((s, p) => s + p.x * model.instruments[p.name].beta.USD * 2, 0);
  assert.ok(close(r.book.pnl, want, 0.01));
  assert.ok(r.currencies.EUR < -1 && r.currencies.JPY < -1, JSON.stringify(r.currencies));
  const c = runScenario(model, dollarBook, { USD: 2 }); assert.ok(c.currencies.EUR < -1.6 && c.drivers.USD.given && !c.drivers.CARRY.given, JSON.stringify(c.currencies));
  assert.deepEqual(r.book.missing, ['NATGAS']);
});

t('the risk-off day: an average of the worst 5% S&P days, risk down and VIX up', () => {
  const ro = riskOffShock(model);
  assert.ok(ro.shocks.RISK < -1.5 && ro.shocks.VIX > 1); assert.ok(ro.n >= 30);
});

t('replays: realised moves where the history covers the window, listed where not', () => {
  const r = replay(model, mixedBook, REPLAYS.find(x => x.key === 'yen_carry_2024'));
  assert.ok(r.covered);
  const realised = n => { const at = d => closes[n].find(x => x.date === d).close; return 100 * Math.log(at('2024-08-05') / at('2024-07-31')); };
  const { live } = positions(model, mixedBook), want = live.reduce((s, p) => s + p.x * realised(p.name), 0);
  assert.ok(close(r.pnl, want, 2e-3), `${r.pnl} vs ${want}`);
  assert.ok(close(r.drivers.RISK, realised('SPX500'), 0.01));
  const covid = replay(model, mixedBook, REPLAYS.find(x => x.key === 'covid_2020'));
  assert.equal(covid.covered, false); assert.equal(covid.missing.length, 5);
});

t('the standard set runs on a book; the prompt text carries VaR, the warning and the scenarios', () => {
  const sc = standardScenarios(model, dollarBook);
  assert.equal(sc.scenarios.length, STANDARD_SCENARIOS.length); assert.ok(sc.scenarios.every(s => s.ok), JSON.stringify(sc.scenarios.filter(s => !s.ok)));
  assert.equal(sc.replays.length, REPLAYS.length);
  const txt = bookRiskText(bookFactorRisk(model, dollarBook), sc);
  assert.match(txt, /VaR/); assert.match(txt, /WARNING: 7 cards/); assert.match(txt, /Dollar \+2%/); assert.match(txt, /Yen carry unwind/);
  assert.match(bookRiskText({ ok: false, reason: 'x' }), /not available: x/);
});

t('questions in plain words become shocks', () => {
  assert.deepEqual(parseScenarioQuestion('What if the Fed hikes 25bp, oil +10%, VIX to 30?'), { RATES: 25, OIL: 10, VIX: { to: 30 } });
  assert.deepEqual(parseScenarioQuestion('a 50bp Fed cut and the dollar down 2%'), { RATES: -50, USD: -2 });
  assert.deepEqual(parseScenarioQuestion('S&P −3% and gold up 4%; 10y +15bp'), { RISK: -3, GOLD: 4, US10Y: 15 });
  assert.deepEqual(parseScenarioQuestion('why is the desk short USDJPY?'), {});
  const r = runScenario(model, dollarBook, parseScenarioQuestion('What if the Fed hikes 25bp, oil +10%, VIX to 30?'));
  assert.ok(r.ok && r.drivers.RATES.value === 25 && r.drivers.OIL.given);
});

console.log(`factorRisk + scenarioEngine: ${n} tests passed`);
