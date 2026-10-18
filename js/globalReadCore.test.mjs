import assert from 'node:assert/strict';
import { tradePlan, currencyTier, recordRow, snapshotRow, attachRealised, scoreRecord, combineDirection, effectiveIc, freshness, rangeView, behaviourOf, stateAxes, environmentLabel, buildGlobalRead, storyDirection, normCdf, solve, TIER_P } from './globalReadCore.js';
import { assembleGlobalReadInput } from './globalReadInputs.js';
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
  const ax = stateAxes({ dxy20dPct: 2.7, usdMove20Pct: 1.7, us10y20dBp: 21, real20dBp: 19, hikesPriced: 3.5, medianVolPctIdx: 13, medianVolPctFx: 43, frontState: 'calm', hy20dBp: 47, csi: 0.8, liquidityBlocked: true });
  assert.equal(ax.usd.agree, '2/2'); assert.ok(ax.rates.score > 0.4 && ax.vol.score < -0.3 && ax.credit.score > 0.3);
  assert.match(environmentLabel(ax), /real-rate dollar regime.*compressed volatility.*credit widening under a calm tape/);
  // CSI is + = stress (creditStressCore cuts exposure at z >= 1): a calm CSI must pull the credit axis DOWN
  assert.ok(stateAxes({ csi: -1.2 }).credit.score < 0 && stateAxes({ csi: 1.2 }).credit.score > 0);
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

t('trade plan: stance follows behaviour; direction line only with an active tested input', () => {
  const exp = tradePlan({ sym: 'GBPUSD', behaviour: { label: 'expansion' }, range: { pAbove75: 0.35 }, direction: { pUp: 0.5, shown: [] } });
  assert.equal(exp.stance, 'FOLLOW BREAKS'); assert.match(exp.direction, /No tested direction/);
  const cap = tradePlan({ sym: 'EURUSD', behaviour: { label: 'exhaustion (capped)' }, range: { pAbove75: 0.15 }, direction: { pUp: 0.5, shown: [] } });
  assert.equal(cap.stance, 'TAKE PROFIT AT LINES'); assert.match(cap.lines, /not a fade signal/);
  const two = tradePlan({ sym: 'NQ', behaviour: { label: 'two-way' }, range: { pAbove75: 0.26 }, direction: { pUp: 0.5, shown: [] } });
  assert.doesNotMatch(two.lines, /20–22 UTC/);
  const ys = tradePlan({ sym: 'USDJPY', behaviour: { label: 'two-way' }, range: { pAbove75: 0.25 }, direction: { pUp: 0.6, shown: [{ id: 'yield-spread', label: '2Y yield-spread sleeve', s: 1, e: 0.25, note: 'z 2.9' }] } });
  assert.match(ys.direction, /UP 60% from 2Y yield-spread sleeve/);
});

t('currency tier maps pair direction into currency space and averages range pressure', () => {
  const cards = { EURUSD: { sym: 'EURUSD', range: { pAbove75: 0.15 }, direction: { pUp: 0.6 } }, USDJPY: { sym: 'USDJPY', range: { pAbove75: 0.35 }, direction: { pUp: 0.5 } } };
  const t2 = currencyTier({ USD: { dollarShare: null }, EUR: { dollarShare: 0.79 } }, cards);
  assert.equal(t2.EUR.pStronger, 0.6); assert.equal(t2.USD.pStronger, 0.45); assert.equal(t2.USD.rangePressure, 0.25);
  assert.match(t2.EUR.notes[0], /USD story/);
});

t('record: row → realised from the daily-read score → R1/R2/D1 summary', () => {
  const read = { headline: 'h', conviction: { range: 10 }, meta: { asOf: '2026-10-13T07:05:00Z' }, cards: {
    GBPUSD: { sym: 'GBPUSD', range: { mult: 1.2, hlP50: 0.4, hlP75: 0.54, pAbove75: 0.36 }, behaviour: { label: 'expansion' }, plan: { stance: 'FOLLOW BREAKS' }, direction: { pUp: 0.5, nLive: 0 }, clarity: 0.4 },
    EURUSD: { sym: 'EURUSD', range: { mult: 0.85, hlP50: 0.6, hlP75: 0.79, pAbove75: 0.14 }, behaviour: { label: 'contained' }, plan: { stance: 'TAKE PROFIT AT LINES' }, direction: { pUp: 0.6, nLive: 1 }, clarity: 0.3 } } };
  const rows = [];
  for (let i = 0; i < 31; i++) {
    const row = recordRow(read, `2026-09-${String(i + 1).padStart(2, '0')}`);
    assert.ok(attachRealised(row, [{ sym: 'GBPUSD', hl: 0.6, oc: 0.1, band: 2 }, { sym: 'EURUSD', hl: 0.5, oc: 0.2, band: 0 }]));
    assert.equal(attachRealised(row, [{ sym: 'GBPUSD', hl: 0.9, oc: 0.1, band: 3 }]), false);    // never overwritten
    rows.push(row);
  }
  const sc = scoreRecord(rows);
  assert.equal(sc.sessions, 31); assert.ok(sc.R1.medianRatio < 1); assert.equal(sc.R2.expansionRate, 1); assert.equal(sc.R2.containedRate, 0);
  assert.ok(sc.R2.brierSkill > 0); assert.equal(sc.D1.n, 31); assert.ok(sc.D1.brierSkill > 0); assert.match(sc.verdict, /R1 PASS · R2 PASS · D1 PASS/);
  assert.match(scoreRecord(rows.slice(0, 5)).verdict, /too early: 5 of 30/);
});

t('input assembly survives every route missing; a firing deflated input (2Y sleeve, null since 2026-10-17) moves nothing', () => {
  const empty = buildGlobalRead(assembleGlobalReadInput({}, { now: Date.parse('2026-10-13T08:00:00Z') }));
  assert.equal(Object.keys(empty.cards).length, 10); assert.equal(empty.conviction.direction, 0);
  const D = {
    'yield-spread/plan': { plan: { entryThreshold: 2.75, signals: { usdjpy: { z: 3.1, inverted: false, asOf: '2026-10-12' } } } },
    'daily-read': { days: { '2026-10-13': { setup: { at: '2026-10-12T22:09:00Z', rows: [{ sym: 'USDJPY', ratio: 0.88, edges: [1.044, 1.182], lines: { hl_p50: 0.59, hl_p75: 0.79 }, tag: 'exhaust' }] } } } },
  };
  const r = buildGlobalRead(assembleGlobalReadInput(D, { now: Date.parse('2026-10-13T08:00:00Z') }));
  assert.equal(r.cards.USDJPY.direction.pUp, 0.5); assert.match(r.cards.USDJPY.plan.direction, /No tested direction/); assert.equal(r.cards.USDJPY.plan.stance, 'TAKE PROFIT AT LINES');
  assert.equal(r.currencies.JPY.pStronger, 0.5);
});


t('story arm: nulls get a nominal weight, one family is ~one voice, evidence-weighted arm is untouched', () => {
  const nul = (id, family, s) => ({ id, family, s, e: 0, tier: 'null' });
  const rates = ['a', 'b', 'c', 'd', 'e'].map(i => nul('r' + i, 'rates', 1));
  const six = storyDirection([...rates, nul('x', 'price-state', 1), nul('y', 'positioning', 1)]);
  const one = storyDirection([nul('r', 'rates', 1), nul('x', 'price-state', 1), nul('y', 'positioning', 1)]);
  assert.ok(six.pUp > 0.5 && six.pUp < 0.6);                       // modest by construction
  assert.ok(six.pUp - one.pUp < 0.02);                              // five rates reads are not five votes
  assert.equal(storyDirection([nul('u', 'rates', 1), nul('d', 'price-state', -1)]).pUp, 0.5);   // disagreement cancels
  assert.equal(storyDirection([nul('z', 'rates', 0)]).nLive, 0);
  assert.equal(combineDirection([nul('r', 'rates', 1)]).nLive, 0);   // D1 still gives a null no weight
  const card = buildGlobalRead({ dir: { EURUSD: [nul('r', 'rates', 1), nul('x', 'price-state', 1)] } }).cards.EURUSD;
  assert.equal(card.direction.nLive, 0); assert.ok(card.direction.story.pUp > 0.5);
});

t('story-only reads: tape so far, US yields and credit tone enter the story arm and never the tested one', () => {
  const D = { 'vol-forecast/session': { instruments: { EURUSD: { oc: 0.2, forecast: { oc_median: 0.25 } } } },
    'macro-changes': { rows: [{ key: 'us10y', deltas: { 20: 25 }, last: 4.5 }, { key: 'hy', deltas: { 20: 50 } }] } };
  const inp = assembleGlobalReadInput(D, { now: Date.parse('2026-10-13T08:00:00Z') });
  const ids = inp.dir.EURUSD.map(x => x.id);
  for (const id of ['today-tape', 'us-yields', 'risk-tone']) assert.ok(ids.includes(id), id);
  const tape = inp.dir.EURUSD.find(x => x.id === 'today-tape');
  assert.equal(tape.e, 0); assert.ok(tape.s > 0.5);                 // up so far, no tested weight
  const r = buildGlobalRead(inp).cards.EURUSD;
  assert.equal(r.direction.nLive, 0); assert.ok(r.direction.story.reads.length >= 3);
  assert.ok(r.direction.story.reads.find(x => x.id === 'us-yields').s < 0);   // USD side: EURUSD falls when US yields rise
});

t('10:00 snapshot (D3) is scored on the move that is left, not the morning move', () => {
  const read = { meta: { asOf: '2026-10-13T10:05:00Z' }, cards: { EURUSD: { sym: 'EURUSD', direction: { story: { pUp: 0.6, nLive: 4 } } }, GOLD: { sym: 'GOLD', direction: { story: { nLive: 0 } } } } };
  const snap = snapshotRow(read, { EURUSD: { oc: 0.3 }, GOLD: { oc: 0.1 } });
  assert.deepEqual(Object.keys(snap), ['EURUSD']);                  // no story, no snapshot
  const cardsRow = day => ({ day, conviction: {}, snap10: snap, cards: { EURUSD: { hlP50: 0.4, hlP75: 0.5, mult: 1, realisedHl: 0.5, beyondP75: false, oc: 0.2, pUp: 0.5, nLive: 0, pUpStory: 0.5, nStory: 0 } } });
  const rows = Array.from({ length: 31 }, (_, i) => cardsRow(`2026-09-${String(i + 1).padStart(2, '0')}`));
  // close +0.2 but 0.3 had already happened by 10:00 → the remaining move is DOWN, so an UP call misses
  const sc = scoreRecord(rows);
  assert.equal(sc.D3.n, 31); assert.equal(sc.D3.hits, 0);
  rows.forEach(r => { r.cards.EURUSD.oc = 0.6; });
  assert.equal(scoreRecord(rows).D3.hits, 31);
});

t('audit 2026-10-16: an inactive tested input is a nominal story read; GEX is centred both ways', () => {
  // 2Y spread below its entry: tested s = 0 but tier weight > 0. The story must not give it the confirmed weight.
  const ys = { id: 'yield-spread', family: 'rates-rv', s: 0, sStory: -0.4, e: 0.247, tier: 'confirmed' };
  const other = [{ id: 'a', family: 'price-state', s: 0.4, e: 0 }, { id: 'b', family: 'macro-state', s: 0.4, e: 0 }];
  const st = storyDirection([ys, ...other]);
  assert.ok(st.pUp > 0.5, `two nominal ups should outweigh one nominal down, got ${st.pUp}`);
  assert.ok(st.reads.every(r => r.contrib != null));
  // active tested input keeps its evidence weight
  assert.ok(storyDirection([{ ...ys, s: -1, sStory: -1 }, ...other]).pUp < 0.5);
  // GEX: short gamma is ordinary (~ +9%), long gamma quieter; neither alone makes "expansion"
  const row = { sym: 'NQ', ratio: null, lines: { hl_p50: 1.33, hl_p75: 1.79 } };
  const sh = rangeView(row, { gexShortNq: true }), lg = rangeView(row, { gexShortNq: false }), no = rangeView(row, {});
  assert.ok(sh.mult > 1 && sh.mult < 1.12 && lg.mult < 1 && no.mult === 1, `${sh.mult} ${lg.mult} ${no.mult}`);
  assert.notEqual(behaviourOf(sh).label, 'expansion');
});

console.log(`globalReadCore: ${n} tests passed`);
