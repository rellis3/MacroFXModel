// node js/biasEngineV2.econ.test.mjs   (plans/BIAS_ENGINE_V2_SPEC.md §6.2: economic sanity, each answer fixed by theory)
import assert from 'node:assert/strict';
import { buildVariant, VARIANTS, SWITCHES, riskFactorAt } from './biasEngineV2.js';
import { snapshot, strip, riskSeries, weekdays, ISSUE_DATE } from './biasEngineV2.fixture.mjs';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok ', name); };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const ON = sw => Object.fromEntries(SWITCHES.map(s => [s, sw.includes(s)]));
const drv = (m, k) => m.drivers.find(x => x.key === k);
/** A snapshot where EUR and CAD are identical (2.5% policy, the same strip), so any difference is the scenario's. */
function flat() {
  const s = snapshot();
  s.extra.futures.banks.EUR = strip('EUR', { bp: [0, 0, 0], chg: [0, 0, 0] }); s.extra.futures.banks.CAD = strip('CAD', { bp: [0, 0, 0], chg: [0, 0, 0] });
  return s;
}

ok('E1 the base pays 2 pp more carry: carry +2 for the pair', () => {
  const s = flat(); s.extra.policyRates.rates.EUR.rate = 4.5;
  near(drv(buildVariant(s, VARIANTS.v2).markets.EURCAD, 'carry').d, 2);
});

ok('E2 the base has +50 bp priced over 6 months, the quote none, no change: repricing +0.5 (the level half)', () => {
  const s = flat(); s.extra.futures.banks.EUR = strip('EUR', { bp: [25, 50, 60], chg: [0, 0, 0] });
  const r = drv(buildVariant(s, VARIANTS.v2).markets.EURCAD, 'repricing');
  near(r.d, 0.5); assert.ok(r.components.level > 0 && r.components.change === 0);
});

ok('E3 the base repriced +25 bp hawkish in 20 business days, the quote unchanged, equal levels: repricing +0.5 (the change half)', () => {
  const s = flat(); s.extra.futures.banks.EUR = strip('EUR', { bp: [0, 0, 0], chg: [0, 25, 0] });
  const r = drv(buildVariant(s, VARIANTS.v2).markets.EURCAD, 'repricing');
  near(r.d, 0.5); assert.ok(r.components.change > 0 && r.components.level === 0);
});

ok('E4 a hawkish base with a crowded long COT scores the same as without the COT; the crowding shows in context', () => {
  const a = buildVariant(snapshot(), VARIANTS.v2), s = snapshot(); s.v1.cot.EUR = { pct: 99, share: 30, asOf: s.v1.cot.EUR.asOf };
  const b = buildVariant(s, VARIANTS.v2);
  assert.equal(b.markets.EURUSD.score, a.markets.EURUSD.score);
  assert.equal(b.markets.EURUSD.context.cot.EUR.crowded, true);
});

ok('E5 a risk-off shock: F ≤ −1.5; through V1\'s roles JPY and CHF are bid, AUD and NZD offered, indices down', () => {
  const s = riskSeries(), n = s.vix.length, shock = (xs, f) => xs.map((p, i) => (i >= n - 5 ? { ...p, value: f(p.value) } : p));
  const sh = { vix: shock(s.vix, v => v * 2.6), vix3m: shock(s.vix3m, v => v * 1.6), hy: shock(s.hy, v => v + 1.5), spx: shock(s.spx, v => v * 0.88) };
  const F = riskFactorAt(sh, ISSUE_DATE).score;
  assert.ok(F <= -1.5, `F ${F}`);
  const snap = snapshot(); snap.extra.riskSeries = sh;
  const v = buildVariant(snap, VARIANTS.v2), d = (c, k = 'risk') => drv(v.currencies[c], k)?.d;
  assert.ok(d('JPY') > 0 && d('CHF') > 0 && d('AUD') < 0 && d('NZD') < 0, JSON.stringify(['JPY', 'CHF', 'AUD', 'NZD'].map(c => d(c))));
  assert.ok(drv(v.markets.NQ, 'risk').d < 0 && drv(v.markets.SPX500, 'risk').d < 0);
});

ok('E6 calm markets with steadily rising equities only: F stays near zero (no risk-on lean from drift)', () => {
  const ds = weekdays(500), mk = (f) => ds.map((d, i) => ({ date: d, value: f(i) }));
  let u = 1; const noise = () => { u = (1664525 * u + 1013904223) >>> 0; return u / 2 ** 32 - 0.5; };
  const series = { vix: mk(() => 15 + noise()), vix3m: mk(() => 16.5 + noise()), hy: mk(() => 3 + noise() * 0.02), spx: mk(i => 4000 * Math.exp(0.0006 * i + noise() * 0.01)) };
  const fs = ds.slice(-100).map(d => riskFactorAt(series, d).score);
  const m = fs.reduce((a, x) => a + x, 0) / fs.length;
  assert.ok(Math.abs(m) <= 0.25, `mean F ${m}`);
});

ok('E7 a hawkish US repricing (+50 bp priced, +25 bp in 20 bd): the Fed path is negative for gold and US indices', () => {
  const s = snapshot(); s.extra.futures.banks.USD = strip('USD', { kind: '1m', bp: [30, 50, 60], chg: [10, 25, 20] });
  const v = buildVariant(s, VARIANTS.v2);
  for (const m of ['GOLD', 'NQ', 'SPX500', 'US30']) assert.ok(drv(v.markets[m], 'fedPath').d < 0, m);
  near(drv(v.markets.GOLD, 'fedPath').d, -1);
});

ok('E8 a currency whose only fresh data is one factor: no data driver, lower data quality, and no call from it', () => {
  const s = snapshot();
  for (const k of ['gdp', 'ism', 'cpi', 'laborMarket', 'retailSales']) s.extra.scorecard.GBP.asOf[k] = '2024-01-01';
  const v = buildVariant(s, VARIANTS.v2), base = buildVariant(snapshot(), VARIANTS.v2);
  assert.equal(drv(v.currencies.GBP, 'data'), undefined);
  assert.ok(v.currencies.GBP.missing.some(x => x.key === 'data'));
  assert.ok(v.currencies.GBP.dataQuality < base.currencies.GBP.dataQuality);
});

ok('E9 the base pays 2 pp more carry but cuts are priced (the gap expected to shrink 50 bp): carry +2 and repricing −0.5, two separate contributions', () => {
  const s = flat(); s.extra.policyRates.rates.EUR.rate = 4.5;
  s.extra.futures.banks.EUR = { ...strip('EUR'), rungs: strip('EUR', { bp: [0, 0, 0] }).rungs.map(r => ({ ...r, rate: 4.5 - 0.25, rate4wAgo: 4.5 - 0.25, month: r.month })) };
  s.extra.futures.banks.EUR.rungs = s.extra.futures.banks.EUR.rungs.map((r, i) => ({ ...r, rate: 4.5 - [0.1, 0.5, 0.7][i], rate4wAgo: 4.5 - [0.1, 0.5, 0.7][i] }));
  const m = buildVariant(s, VARIANTS.v2).markets.EURCAD, c = drv(m, 'carry'), r = drv(m, 'repricing');
  near(c.d, 2); near(r.d, -0.5);
  assert.ok(c.contrib > 0 && r.contrib < 0);
  assert.notEqual(c.family, undefined); assert.equal(c.family, r.family);   // one family: monetary, counted once as evidence
});

console.log(`${passed} passed`);
