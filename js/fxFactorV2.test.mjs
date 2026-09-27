/**
 * Unit tests for fxFactorV2 (+ the weightsAt hooks it relies on in
 * trendBasketEngine / carryEngine) — pure, synthetic, no network.
 * Run: node js/fxFactorV2.test.mjs
 */
import { runTrendBasket } from './trendBasketEngine.js';
import { runCarryBasket } from './carryEngine.js';
import {
  runFxFactorV2, makeTsmomWeights, makeTrendIncumbentWeights, makeCarryIncumbentWeights,
  makeResidualXsWeights, makeCarryMomentumFilterWeights, makeCarryDoubleSortWeights,
  makeCarverWeights, withVolRegime, withRiskGate, verdictVs, summarizeDaily, lagDateMap,
} from './fxFactorV2.js';
import { mulberry32 } from './statsCore.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + name); } }
const day = i => new Date(Date.UTC(2006, 0, 2) + i * 86400000).toISOString().slice(0, 10);

// Deterministic synthetic universe: 7 ccys with a common dollar factor,
// slow trends, OHLC bars, monthly rates and daily VIX/VIX3M/10y.
function synth(N = 1800, seed = 11) {
  const rng = mulberry32(seed);
  const g = () => { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
  const C = ['EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'CAD', 'CHF'];
  const priceByCcy = {}, ohlcByCcy = {}, rateByCcy = {};
  const dol = Array.from({ length: N }, () => 0.004 * g());
  C.forEach((c, k) => {
    let v = 1; priceByCcy[c] = []; ohlcByCcy[c] = []; const rm = new Map();
    for (let i = 0; i < N; i++) {
      const o = v;
      v *= Math.exp(0.0003 * Math.sin(i / 250 + k) + dol[i] + 0.004 * g());
      priceByCcy[c].push({ t: day(i), v });
      ohlcByCcy[c].push({ date: day(i), open: o, high: Math.max(o, v) * (1 + 0.002 * Math.abs(g())), low: Math.min(o, v) * (1 - 0.002 * Math.abs(g())), close: v });
      if (i % 30 === 0) rm.set(day(i), 1 + k * 0.6 + Math.sin(i / 400 + k));
    }
    rateByCcy[c] = rm;
  });
  rateByCcy.USD = new Map([...Array(N).keys()].filter(i => i % 30 === 0).map(i => [day(i), 2.5]));
  const vix = new Map(), vix3m = new Map(), ust10 = new Map();
  for (let i = 0; i < N; i++) { const x = 18 + 6 * Math.sin(i / 90) + 2 * g(); vix.set(day(i), x); vix3m.set(day(i), 20 + 3 * Math.sin(i / 120)); ust10.set(day(i), 3 + 0.5 * Math.sin(i / 300)); }
  return { priceByCcy, ohlcByCcy, rateByCcy, gateInputs: { vix, vix3m, ust10 } };
}
const data = synth();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ── The hooks: a selector reproducing the default rule is byte-identical ─────────
{
  const base = runTrendBasket(data.priceByCcy, { returnDaily: true });
  const hook = runTrendBasket(data.priceByCcy, { returnDaily: true, weightsAt: makeTrendIncumbentWeights() });
  ok('trend hook identity (daily returns)', same(base.dailyReturns, hook.dailyReturns));
  ok('trend hook exposes currentWeights', hook.currentWeights && !('currentWeights' in base));
  const cb = runCarryBasket(data.priceByCcy, data.rateByCcy, { returnDaily: true });
  const ch = runCarryBasket(data.priceByCcy, data.rateByCcy, { returnDaily: true, weightsAt: makeCarryIncumbentWeights() });
  ok('carry hook identity (daily returns)', same(cb.daily.ret, ch.daily.ret));
  const none = runTrendBasket(data.priceByCcy, { returnDaily: true, weightsAt: () => ({}) });
  ok('empty selector ⇒ flat book', none.dailyReturns.every(x => x === 0));
}

// ── No lookahead: a prefix run matches the full run on the common prefix ────────
{
  const M = 1400;
  const cut = obj => Object.fromEntries(Object.entries(obj).map(([c, s]) => [c, s.slice(0, M)]));
  const cutData = { priceByCcy: cut(data.priceByCcy), ohlcByCcy: cut(data.ohlcByCcy) };
  const selectors = {
    T1: () => makeTsmomWeights({ signal: 'tstat', vol: 'yz', corrFactor: true, ohlcByCcy: data.ohlcByCcy }),
    T2: () => withVolRegime(makeTrendIncumbentWeights()),
    T5: () => makeResidualXsWeights(),
  };
  for (const [id, mk] of Object.entries(selectors)) {
    const full = runTrendBasket(data.priceByCcy, { returnDaily: true, weightsAt: mk() });
    const part = runTrendBasket(cutData.priceByCcy, { returnDaily: true, weightsAt: mk() });
    ok(`no lookahead ${id}`, same(part.dailyReturns, full.dailyReturns.slice(0, M)));
  }
  const cutRates = data.rateByCcy;   // rates are date-keyed; prices define the calendar
  const carrySel = {
    C1: () => makeCarryMomentumFilterWeights(),
    C1b: () => makeCarryDoubleSortWeights(),
    C2: () => withVolRegime(makeCarryIncumbentWeights(), { retKey: 'spotRet' }),
    C3: () => withRiskGate(makeCarryIncumbentWeights(), data.gateInputs),
    K1: () => makeCarverWeights(),
  };
  for (const [id, mk] of Object.entries(carrySel)) {
    const opts = { returnDaily: true, rebalDays: id === 'K1' ? 1 : 21 };
    const full = runCarryBasket(data.priceByCcy, cutRates, { ...opts, weightsAt: mk() });
    const part = runCarryBasket(cutData.priceByCcy, cutRates, { ...opts, weightsAt: mk() });
    ok(`no lookahead ${id}`, same(part.daily.ret, full.daily.ret.slice(0, M)));
  }
}

// ── Behaviour ───────────────────────────────────────────────────────────────────
{
  const xs = runTrendBasket(data.priceByCcy, { returnDaily: true, rebalDays: 21, weightsAt: makeResidualXsWeights() });
  const w = Object.values(xs.currentWeights);
  ok('T5 dollar-neutral (Σw≈0)', Math.abs(w.reduce((a, b) => a + b, 0)) < 1e-9);
  ok('T5 holds 2 long + 2 short', w.filter(x => x > 0).length === 2 && w.filter(x => x < 0).length === 2);

  // Perfectly co-moving universe: CF must shrink gross exposure vs the incumbent's √N assumption.
  const one = data.priceByCcy.EUR;
  const clones = Object.fromEntries(['A', 'B', 'C', 'D'].map(c => [c, one]));
  const inc = runTrendBasket(clones, { returnDaily: true, weightsAt: makeTrendIncumbentWeights() });
  const cf = runTrendBasket(clones, { returnDaily: true, weightsAt: makeTsmomWeights({ corrFactor: true }) });
  const gross = r => Object.values(r.currentWeights).reduce((a, b) => a + Math.abs(b), 0);
  ok('CF halves gross on ρ=1 clones (√4 → 1)', Math.abs(gross(cf) - gross(inc) / 2) < 1e-6);

  const riskOff = { vix: new Map([...data.gateInputs.vix.keys()].map(d => [d, 40])), vix3m: new Map([...data.gateInputs.vix.keys()].map(d => [d, 20])), ust10: data.gateInputs.ust10 };
  const gated = runCarryBasket(data.priceByCcy, data.rateByCcy, { returnDaily: true, weightsAt: withRiskGate(makeCarryIncumbentWeights(), riskOff) });
  ok('gate permanently inverted ⇒ ≤ half size', Object.values(gated.currentWeights).every(x => Math.abs(x) < 1));
}

// ── Verdict + summaries ───────────────────────────────────────────────────────
{
  const inc = { sharpe: 0.3, days: 1000 }, SE = Math.sqrt(252 / 1000);
  ok('verdict within-noise', verdictVs(inc, { sharpe: 0.3 + SE / 2, days: 1000 }, { oosRebalances: 100 }).verdict === 'within-noise');
  ok('verdict no-improvement', verdictVs(inc, { sharpe: 0.3 - 2 * SE, days: 1000 }, { oosRebalances: 100 }).verdict === 'no-improvement');
  ok('verdict wins', verdictVs(inc, { sharpe: 0.3 + 2 * SE, days: 1000 }, { oosRebalances: 100 }).verdict === 'wins-oos');
  ok('verdict too few rebalances', verdictVs(inc, { sharpe: 5, days: 1000 }, { oosRebalances: 10 }).verdict === 'too-few-oos-rebalances');
  const s = summarizeDaily([0.01, -0.01, 0.02]);
  ok('summarizeDaily fields', s.days === 3 && Number.isFinite(s.sharpe) && s.maxDDPct <= 0);
}

// ── Orchestrator end-to-end ─────────────────────────────────────────────────────
{
  const res = runFxFactorV2(data);
  const ids = f => (res.families[f]?.variants || []).map(v => v.id).join(',');
  ok('trend family ids', ids('trend') === 'T0,T1,T1a,T1b,T1c,T2,T5');
  ok('carry family ids', ids('carry') === 'C0,C1,C1b,C2,C3');
  ok('combined family ids', ids('combined') === 'KB,K1,K2');
  const all = Object.values(res.families).flatMap(f => f.variants);
  ok('no variant errored', all.every(v => !v.error));
  ok('every non-incumbent has a verdict', all.filter(v => !['T0', 'C0', 'KB'].includes(v.id)).every(v => typeof v.vsIncumbent?.verdict === 'string'));
  ok('OOS summaries finite', all.every(v => Number.isFinite(v.oos.sharpe) && v.oos.days > 100));
  ok('multiple-testing block', res.multipleTesting.primaryTests === 8 && all.filter(v => v.preRegistered && v.vsIncumbent).every(v => typeof v.vsIncumbent.survivesBonferroni === 'boolean'));
  ok('rate lag note present', res.notes.some(n => /lagged 60 days/.test(n)));
  const lagged = lagDateMap(new Map([['2020-01-31', 1]]), 60);
  ok('lagDateMap shifts dates', lagged.get('2020-03-31') === 1 && lagged.size === 1);
  const noRates = runFxFactorV2({ priceByCcy: data.priceByCcy });
  ok('no rates ⇒ carry skipped with note', !noRates.families.carry && noRates.notes.some(n => /rates/.test(n)));
}

console.log(`fxFactorV2: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
