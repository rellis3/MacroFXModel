// node --test js/intradayProbShadowRoutes.test.mjs — the logger writes once, never overwrites, and records refusals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIpsShadow, londonMidnightSec, IPS_PREFIX } from './intradayProbShadowRoutes.js';

const date = '2026-10-13';                                   // a Tuesday, BST
const mid = londonMidnightSec(date);
function mkDeps(store = {}) {
  const bars = [];
  for (let i = 0; i < 9 * 60; i++) bars.push({ t: mid + i * 60, open: '1.1000', high: String(1.1 + i * 0.000004), low: '1.0995', close: '1.1000' });
  return {
    store,
    getJSON: async k => store[k] ?? null,
    putJSON: async (k, v) => { if (store[k]) throw new Error('overwrite attempted'); store[k] = v; },
    fetchM1: async (_i, from, to) => bars.filter(b => b.t >= Date.parse(from) / 1000 && b.t < Date.parse(to) / 1000),
    getForecast: () => ({ session_date: date, computed_at: '2026-10-12T22:01:00Z',
      instruments: { EURUSD: { hl_median: 0.6, data_source: 'oanda', ladder_flat: { oh_p50: 0.1, oh_p75: 0.2, oh_p90: 0.3, ol_p50: 0.1, ol_p75: 0.2, ol_p90: 0.3, hl_p50: 0.5 } } } }),
    instruments: [{ name: 'EURUSD', oandaInstrument: 'EUR_USD' }],
    oosFor: () => ({ oh_p50: 0.5, oh_p75: 0.25, oh_p90: 0.1, ol_p50: 0.5, ol_p75: 0.25, ol_p90: 0.1 }),
    codeCommit: 'test',
  };
}

test('checkpoint is written once with inputs, predictions and T1 events', async () => {
  const d = mkDeps();
  const s = createIpsShadow({ ...d, now: () => (mid + 8 * 3600 + 120) * 1000 });
  const r1 = await s._writeCheckpoint(date, 8);
  assert.equal(r1.n_ok, 1);
  const rec = d.store[`${IPS_PREFIX}/${date}/08.json`];
  assert.equal(rec.instruments.EURUSD.ok, true);
  assert.ok(rec.instruments.EURUSD.T2.L_A);                 // range 0.4% < 0.6% line
  assert.ok(Array.isArray(rec.instruments.EURUSD.T1));
  const r2 = await s._writeCheckpoint(date, 8);
  assert.equal(r2.skipped, 'exists');                       // never overwritten
});

test('a forecast for another session is refused, not used', async () => {
  const d = mkDeps();
  d.getForecast = () => ({ session_date: '2026-10-12', instruments: {} });
  const s = createIpsShadow({ ...d, now: () => (mid + 3 * 3600) * 1000 });
  await s._writeCheckpoint(date, 3);
  assert.equal(d.store[`${IPS_PREFIX}/${date}/03.json`].instruments.EURUSD.why, 'forecast is not for this session');
});

test('outcomes written once from logged opens', async () => {
  const d = mkDeps();
  const s = createIpsShadow({ ...d, now: () => (mid + 8 * 3600) * 1000 });
  await s._writeCheckpoint(date, 8);
  const o = await s._writeOutcomes(date);
  assert.equal(o.n, 1);
  assert.equal((await s._writeOutcomes(date)).skipped, 'exists');
});
