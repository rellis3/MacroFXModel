import assert from 'node:assert/strict';
import { combineDirection, effectiveIc, freshness, rangeView, behaviourOf, stateAxes, environmentLabel, buildGlobalRead, normCdf, solve, TIER_P } from './globalReadCore.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('normCdf and solve are sane', () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-6); assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-3);
  assert.deepEqual(solve([[2, 0], [0, 4]], [2, 8]).map(x => +x.toFixed(6)), [1, 2]);
});

t('a banked null carries zero weight however strongly it fires', () => {
  assert.equal(effectiveIc({ tier: 'null', ic: 0.5 }), 0);
  assert.equal(effectiveIc({ tier: 'untested', ic: 0.5 }), 0);
  const d = combineDirection([{ id: 'cot', family: 'positioning', s: 1, e: 0 }, { id: 'lean', family: 'price', s: 1, e: 0 }]);
  assert.equal(d.pUp, 0.5); assert.equal(d.nLive, 0); assert.equal(d.shown.length, 2);
});

t('effective IC = P(real|tier) × IC × shrink × fresh; tiny n_eff shrinks hard', () => {
  assert.equal(effectiveIc({ tier: 'confirmed', ic: 0.2 }), TIER_P.confirmed * 0.2);
  const big = effectiveIc({ tier: 'descriptive', ic: 0.6, n_eff: 300 }), small = effectiveIc({ tier: 'descriptive', ic: 0.6, n_eff: 6 });
  assert.ok(small < big / 4, `${small} vs ${big}`);
  assert.equal(effectiveIc({ tier: 'validated', ic: 0.3 }, 0), 0);
});

t('freshness: full inside cadence, zero by 3× cadence', () => {
  assert.equal(freshness(0.5, 1), 1); assert.equal(freshness(2, 1), 0.5); assert.equal(freshness(3, 1), 0); assert.equal(freshness(null), 0);
});

t('one confirmed input gives a modest, calibrated lean, not certainty', () => {
  const d = combineDirection([{ id: 'ys', family: 'rates-rv', s: 1, e: 0.247 }]);
  assert.ok(d.pUp > 0.57 && d.pUp < 0.63, String(d.pUp)); assert.equal(d.agreement, null);
});

t('opposing inputs cancel; correlated inputs do not double count', () => {
  const opp = combineDirection([{ id: 'a', family: 'x', s: 1, e: 0.2 }, { id: 'b', family: 'y', s: -1, e: 0.2 }]);
  assert.ok(Math.abs(opp.pUp - 0.5) < 1e-3); assert.equal(opp.agreement, 0);
  const indep = combineDirection([{ id: 'a', family: 'x', s: 1, e: 0.2 }, { id: 'b', family: 'y', s: 1, e: 0.2 }]);
  const same = combineDirection([{ id: 'a', family: 'x', s: 1, e: 0.2 }, { id: 'b', family: 'x', s: 1, e: 0.2 }]);
  const one = combineDirection([{ id: 'a', family: 'x', s: 1, e: 0.2 }]);
  assert.ok(indep.pUp > same.pUp && same.pUp > one.pUp, `${indep.pUp} ${same.pUp} ${one.pUp}`);
});

t('range: centred joint multipliers; rich IV widens, calm front narrows, no event double count', () => {
  const row = { sym: 'GBPUSD', ratio: 1.3, edges: [0.974, 1.093], eventMult: 0.95, lines: { hl_p50: 0.41, hl_p75: 0.54 } };
  const base = rangeView({ ...row, ratio: Math.sqrt(0.974 * 1.093) }, {});
  assert.ok(Math.abs(base.mult - 1) < 0.005, String(base.mult));          // typical IV÷σ, no flags → the plain ladder
  const rich = rangeView(row, {}); assert.ok(rich.mult > 1.15 && rich.pAbove75 > 0.32);
  const calm = rangeView(row, { frontCalm: true, frontDear: false }); assert.ok(calm.mult < rich.mult);
  assert.ok(!rich.drivers.some(d => d.id === 'event'));
  assert.ok(Math.abs(rangeView({ ...row, ratio: Math.sqrt(0.974 * 1.093) }, {}).pAbove75 - 0.25) < 0.005);
});

t('nq down-week and short gamma apply to indices only', () => {
  const lines = { hl_p50: 1.3, hl_p75: 1.75 };
  const nq = rangeView({ sym: 'NQ', ratio: 1.1, edges: [1.0, 1.21], lines }, { nqDownWeek: true, gexShortNq: true });
  const fx = rangeView({ sym: 'EURUSD', ratio: 1.03, edges: [0.959, 1.102], lines }, { nqDownWeek: true, gexShortNq: true });
  assert.ok(nq.drivers.some(d => d.id === 'nq-dw') && nq.drivers.some(d => d.id === 'gex'));
  assert.ok(!fx.drivers.some(d => d.id === 'nq-dw' || d.id === 'gex'));
});

t('behaviour labels follow P(beyond p75)', () => {
  assert.equal(behaviourOf({ pAbove75: 0.4 }).label, 'expansion');
  assert.equal(behaviourOf({ pAbove75: 0.12 }, { tag: 'exhaust' }).label, 'exhaustion (capped)');
  assert.equal(behaviourOf({ pAbove75: 0.25 }, { hmmRange: true }).label, 'two-way, low variance');
});

t('state axes and label: real-rate dollar, calm vol, credit leaking', () => {
  const ax = stateAxes({ dxy20dPct: 2.7, usdMove20Pct: 1.7, us10y20dBp: 21, real20dBp: 19, hikesPriced: 3.5, medianVolPctIdx: 13, medianVolPctFx: 43, frontState: 'calm', hy20dBp: 47, csi: -1.36, liquidityBlocked: true });
  assert.equal(ax.usd.agree, '2/2'); assert.ok(ax.rates.score > 0.4 && ax.vol.score < -0.3 && ax.credit.score > 0.3);
  assert.match(environmentLabel(ax), /real-rate dollar regime.*compressed volatility.*credit widening under a calm tape/);
});

t('buildGlobalRead ranks by clarity and reports separate range / direction conviction', () => {
  const r = buildGlobalRead({
    rows: [{ sym: 'NQ', ratio: 1.6, edges: [1.0, 1.34], lines: { hl_p50: 1.3, hl_p75: 1.75 } }, { sym: 'GOLD', ratio: 1.04, edges: [0.975, 1.103], lines: { hl_p50: 1.5, hl_p75: 1.96 } }],
    dir: { USDJPY: [{ id: 'yield-spread', family: 'rates-rv', s: 1, e: 0.247 }] },
    health: [{ id: 'x', state: 'dead' }], checks: [{ problem: 'p' }], persist: { vixInvert5d: 0.09 },
  });
  assert.deepEqual(r.ranked.map(x => x.sym), ['USDJPY', 'NQ', 'GOLD']);   // an active confirmed direction input outranks a wide range day
  assert.ok(r.cards.USDJPY.direction.pUp > 0.55);
  assert.ok(r.conviction.direction > 0 && r.conviction.range > 0 && r.conviction.dataQuality < 100);
  assert.equal(r.scenarios[0].p, 0.91);
});

console.log(`globalReadCore: ${n} tests passed`);
