// node --test js/levelScenarioShadowRoutes.test.mjs — the S3 logger writes once, never overwrites, refuses a stale forecast, scores outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelScenarioShadow, scoreOutcomes, REACH_PREFIX } from './levelScenarioShadowRoutes.js';
import { londonMidnightSec } from './intradayProbShadowRoutes.js';

const date = '2026-10-13';                                   // a Tuesday, BST
const mid = londonMidnightSec(date);
function mkDeps(store = {}) {
  const bars = [];                                           // slow drift up from 1.1000, then a jump at 14:00 through 1.1040
  for (let i = 0; i < 22 * 60; i++) { const c = 1.1 + i * 0.0000015 + (i >= 14 * 60 ? 0.003 : 0); bars.push({ t: mid + i * 60, open: String(c), high: String(c + 0.0002), low: String(c - 0.0002), close: String(c) }); }
  return {
    store,
    getJSON: async k => store[k] ?? null,
    putJSON: async (k, v) => { if (store[k]) throw new Error('overwrite attempted'); store[k] = v; },
    fetchM1: async (_i, from, to) => bars.filter(b => b.t >= Date.parse(from) / 1000 && b.t < Date.parse(to) / 1000),
    getForecast: () => ({ session_date: date, computed_at: '2026-10-12T22:01:00Z',
      instruments: { EURUSD: { ladder: { sigma_daily_pct: 0.5 }, ladder_flat: { oh_p50: 0.25, oh_p75: 0.4, oh_p90: 0.6, ol_p50: 0.25, ol_p75: 0.4, ol_p90: 0.6 } } } }),
    getConfluence: async () => ({ generatedAt: 'x', instruments: { eurusd: { date: '2026-10-12', levels: [{ price: 1.104, source: 'pivot' }, { price: 1.097, source: 'round_number' }] } } }),
    instruments: [{ name: 'EURUSD', oandaInstrument: 'EUR_USD' }],
    codeCommit: 'test',
  };
}

test('checkpoint written once with eligible levels, probabilities and the race', async () => {
  const d = mkDeps();
  const s = createLevelScenarioShadow({ ...d, now: () => (mid + 10 * 3600 + 60) * 1000 });
  assert.equal((await s._writeCheckpoint(date, 10)).n_ok, 1);
  const r = d.store[`${REACH_PREFIX}/${date}/10.json`].instruments.EURUSD;
  assert.equal(r.ok, true);
  assert.ok(r.levels.some(l => l.family === 'pivot') && r.levels.some(l => l.family === 'asia'));
  for (const l of r.levels) assert.ok(l.p.end >= 0 && l.p.end <= 1 && l.p['30'] <= l.p.end + 1e-9);
  assert.ok(r.race && r.race.pUpFirst > 0 && r.race.pUpFirst < 1);
  assert.equal((await s._writeCheckpoint(date, 10)).skipped, 'exists');
});

test('a forecast for another session is refused', async () => {
  const d = mkDeps();
  d.getForecast = () => ({ session_date: '2026-10-12', instruments: {} });
  const s = createLevelScenarioShadow({ ...d });
  await s._writeCheckpoint(date, 3);
  assert.equal(d.store[`${REACH_PREFIX}/${date}/03.json`].instruments.EURUSD.why, 'forecast is not for this session');
});

test('outcomes score first touches after the checkpoint and the race', async () => {
  const d = mkDeps();
  const s = createLevelScenarioShadow({ ...d });
  await s._writeCheckpoint(date, 10);
  await s._writeOutcomes(date);
  const o = d.store[`${REACH_PREFIX}/${date}/outcomes.json`].checkpoints['10'].EURUSD;
  const piv = o.levels.find(l => Math.abs(l.price - 1.104) < 1e-9);
  assert.equal(piv.t_min, 240);                              // the 14:00 jump crosses 1.1040
  assert.equal(o.race, 'up');
  assert.equal((await s._writeOutcomes(date)).skipped, 'exists');
});

test('scoreOutcomes: same-minute double touch is ambiguous, none is neither', () => {
  const bars = [{ t: 100, high: 2, low: 0 }];
  assert.equal(scoreOutcomes(bars, 100, 200, [], { up: 1.5, down: 0.5 }).race, 'amb');
  assert.equal(scoreOutcomes(bars, 100, 200, [], { up: 3, down: -1 }).race, 'neither');
});
