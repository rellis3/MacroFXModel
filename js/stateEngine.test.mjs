/**
 * stateEngine — synthetic series, no network.
 * Run: node --test js/stateEngine.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildState, firstCross, levelPercentile, linkEvidence, flowOrder, TIERS, LINK_EVIDENCE } from './stateEngine.js';
import { CHAIN_NODES, CHAIN_LINKS } from './macroChain.js';
import { EVIDENCE_AUDIT } from './evidenceAudit.js';

// Business-day series ending 2026-10-30; `jumpOn` = date the step happens, `size` in the series' own units.
function series(start, { jumpOn = null, size = 0, n = 800 } = {}) {
  const out = []; const d = new Date('2026-10-30T00:00:00Z');
  for (let k = 0; out.length < n; k++) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.unshift({ date: d.toISOString().slice(0, 10) }); d.setUTCDate(d.getUTCDate() - 1); }
  return out.map(p => ({ date: p.date, value: start + (jumpOn && p.date >= jumpOn ? size : 0) }));
}

const S = {
  us2y: series(3.9, { jumpOn: '2026-10-14', size: 0.20 }),   // rates move first: +20bp on 14 Oct
  us10y: series(4.2, { jumpOn: '2026-10-14', size: 0.15 }),
  us30y: series(4.6, { jumpOn: '2026-10-14', size: 0.05 }),  // curve flattening 2s30s −15bp
  real: series(1.9, { jumpOn: '2026-10-14', size: 0.12 }),
  bei: series(2.3, { jumpOn: '2026-10-14', size: 0.03 }),
  hy: series(3.0, { jumpOn: '2026-10-20', size: 0.30 }),     // credit second: +30bp on 20 Oct
  dxy: series(120, { jumpOn: '2026-10-22', size: 1.2 }),     // FX third: +1%
  spx: series(6000, { jumpOn: '2026-10-27', size: -180 }),   // equities fourth: −3%
  nq: series(21000, { jumpOn: '2026-10-27', size: -840 }),   // −4%
  vix: series(16, { jumpOn: '2026-10-28', size: 6 }),        // vol last: 22, +6
  oil: series(70),
};

test('nodes in every tier exist in the chain and every mapped link exists', () => {
  for (const t of TIERS) for (const k of t.nodes) assert.ok(CHAIN_NODES[k], k);
  const ids = new Set(CHAIN_LINKS.map(l => l.id));
  for (const id of Object.keys(LINK_EVIDENCE)) assert.ok(ids.has(id), id);
  for (const list of Object.values(LINK_EVIDENCE)) for (const e of list) assert.ok(EVIDENCE_AUDIT[e], `ledger id ${e} not in the audit`);
});

test('firstCross finds the date a node first moves past its floor', () => {
  assert.deepEqual(firstCross(S.us2y, CHAIN_NODES.us2y).date, '2026-10-14');
  assert.equal(firstCross(S.us2y, CHAIN_NODES.us2y).dir, 'up');
  assert.equal(firstCross(S.oil, CHAIN_NODES.oil), null);
});

test('levelPercentile is prior-only and in 0..100', () => {
  const p = levelPercentile(S.hy);
  assert.ok(p.pct >= 0 && p.pct <= 100);
  assert.ok(p.spanDays > 1000 && p.spanDays <= 1095);
  assert.ok(levelPercentile(S.hy.slice(-90)).spanDays < 130);   // a 90-print cache is a ~4-month answer
  assert.equal(levelPercentile(S.hy.slice(0, 10)), null);
});

test('tier states describe the synthetic moves', () => {
  const st = buildState(S, { now: Date.parse('2026-10-31T12:00:00Z') });
  const by = Object.fromEntries(st.tiers.map(t => [t.id, t.state]));
  assert.match(by.rates.headline, /Yields rising, real-yield led/);
  assert.match(by.rates.detail, /flattening/);
  assert.match(by.credit.headline, /widening/);
  assert.equal(by.credit.tone, 'risk-off');
  assert.match(by.fx.headline, /strengthening/);
  assert.match(by.equities.headline, /falling/);
  assert.match(by.equities.detail, /growth lagging/);
  assert.match(by.vol.headline, /elevated, rising/);
});

test('flow order follows the textbook when the data does', () => {
  const st = buildState(S, { now: Date.parse('2026-10-31T12:00:00Z') });
  assert.deepEqual(st.flow.sequence.map(s => s.id), ['rates', 'credit', 'fx', 'equities', 'vol']);
  assert.equal(st.flow.textbook, true);
  const swapped = { ...S, spx: series(6000, { jumpOn: '2026-10-12', size: -180 }) };
  const st2 = buildState(swapped, { now: Date.parse('2026-10-31T12:00:00Z') });
  assert.equal(st2.flow.sequence[0].id, 'equities');
  assert.equal(st2.flow.textbook, false);
  assert.match(st2.flow.text, /NOT the textbook order/);
});

test('every chain link carries an evidence status; unmapped links are untested', () => {
  const st = buildState(S);
  for (const l of st.chain.links) assert.ok(['stands', 'reopened', 'unverified', 'untested'].includes(l.evidenceAudit.status), l.id);
  assert.equal(linkEvidence('oil-gold-nonexistent').status, 'untested');
  assert.equal(linkEvidence('real-dxy').status, 'reopened');           // yields-to-fx-direction was reopened
  assert.equal(linkEvidence('x', () => 'stands').status, 'untested');
  assert.equal(linkEvidence('move-vix', () => 'stands').status, 'stands');
});

test('missing series are reported, not invented', () => {
  const st = buildState({ us10y: S.us10y });
  const credit = st.tiers.find(t => t.id === 'credit');
  assert.ok(credit.readings.every(r => r.missing));
  assert.equal(credit.state.tone, 'unknown');
  assert.ok(st.chain.links.some(l => l.verdict === 'unmeasured'));
});

test('health marks stale inputs', () => {
  const st = buildState({ us10y: S.us10y, hy: S.hy.slice(0, -10) }, { now: Date.parse('2026-10-31T12:00:00Z') });
  const h = Object.fromEntries(st.health.map(x => [x.key, x]));
  assert.equal(h.us10y.stale, false);
  assert.equal(h.hy.stale, true);
});

import { assembleChainSeries, ohlcToSessionSeries, fundingSpread, yieldGap } from './stateSources.js';

test('sources: OANDA candles move to their session date; funding and gaps are point by point', () => {
  assert.deepEqual(ohlcToSessionSeries({ values: [{ datetime: '2026-10-29', close: '70.1' }, { time: '2026-10-28T21:00:00Z', close: 69 }] }),
    [{ date: '2026-10-29', value: 69 }, { date: '2026-10-30', value: 70.1 }]);
  const f = fundingSpread([{ date: '2021-07-28', value: 0.05 }, { date: '2021-07-29', value: 0.05 }, { date: '2021-07-30', value: 0.06 }],
    [{ date: '2021-07-29', value: 0.15 }], [{ date: '2021-07-28', value: 0.10 }]);
  assert.deepEqual(f.map(p => +p.value.toFixed(2)), [-0.05, -0.10, -0.09]);
  assert.deepEqual(yieldGap([{ date: '2026-10-29', value: 4.5 }, { date: '2026-10-30', value: 4.6 }], [{ date: '2026-10-30', value: 4.2 }]).map(p => +p.value.toFixed(2)), [0.4]);
  const { series, sources } = assembleChainSeries({ fredHist: { us10y: S.us10y, tips: S.real } });
  assert.ok(series.us10y && series.real && !series.hy);
  assert.equal(sources.real, 'FRED tips');
});
