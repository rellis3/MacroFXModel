import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVERS, buildAssetPrompt, validateAnalysis } from './assetAnalysis.js';
import { DESK_UNIVERSE } from './deskPack.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
import { TASK_CLASS, resolveTask } from './modelRouter.js';

test('every desk group has a driver checklist', () => {
  for (const g of Object.keys(DESK_UNIVERSE)) assert.ok(DRIVERS[g]?.length >= 4, g);
});

test('gold is read against real yields, the dollar and flows, not only "global tone + USD"', () => {
  const t = DRIVERS.metals.join(' ');
  for (const w of ['real yields', 'breakevens', 'DXY', 'ETF']) assert.match(t, new RegExp(w));
});

test('the analysis runs on DeepSeek by default, and falls back when there is no DeepSeek key', () => {
  assert.equal(TASK_CLASS['desk-asset'].defaultProvider, 'deepseek');
  assert.equal(resolveTask('desk-asset', { keys: { anthropic: 'a', deepseek: 'd' }, provider: 'anthropic' }).provider, 'deepseek');
  assert.equal(resolveTask('desk-asset', { keys: { anthropic: 'a' }, provider: 'anthropic' }).provider, 'anthropic');
});

const RUN = {
  date: '2026-11-10', finishedAt: '2026-11-10T06:58:00Z',
  analysts: { yields_curve: { ok: true, report: { headline: '10y real yield up 4bp', confidence: 'medium', points: [{ claim: 'real yields higher', evidence: 'real-yield', impact: { USD: 1 } }], gaps: [] } } },
  debate: {
    global: { view: { tone: 'risk_on', summary: 'equities bid' } },
    currency: { view: { currencies: { USD: { bias: 1, why: 'rates' } }, ranking: ['USD'] } },
    assets: { metals: { ok: true, view: { instruments: { GOLD: { rating: 'SHORT', conviction: 'low', why: 'USD firm' } } } } },
  },
  head: { ok: true, book: { global: { tone: 'risk_on' }, currencies: { USD: { bias: 1, why: 'rates' } }, instruments: { GOLD: { rating: 'SHORT', size: 0.5, why: 'USD firm' } }, risks: ['CPI'], gaps: [] } },
};

test('the prompt carries the checklist, the card, the leg rulings, the analysts and the evidence', () => {
  const { system, prompt, meta } = buildAssetPrompt({ name: 'GOLD', run: RUN, ledger: DESK_EVIDENCE, newsText: 'Gold rises as dollar slips', date: '2026-11-10' });
  assert.match(system, /ONE market: GOLD/);
  assert.match(system, /contradicts/);
  assert.match(prompt, /Driver checklist/);
  assert.match(prompt, /"rating":"SHORT"/);
  assert.match(prompt, /10y real yield up 4bp/);
  assert.match(prompt, /Gold rises as dollar slips/);
  assert.deepEqual(meta.legs, ['USD']);
  assert.ok(meta.hasCard && !meta.hasPack);
  assert.ok(meta.evidence.length > 0);
  assert.ok(meta.chars < 200_000, 'fits DeepSeek\'s context');
});

test('no run and no pack: the prompt says so rather than failing', () => {
  const { prompt, meta } = buildAssetPrompt({ name: 'EURUSD', ledger: [] });
  assert.match(prompt, /no card for this market today/);
  assert.match(prompt, /no Desk Pack today/);
  assert.deepEqual(meta.legs, ['EUR', 'USD']);
});

test('an unknown market is refused', () => {
  assert.throws(() => buildAssetPrompt({ name: 'NOPE' }), /unknown market/);
});

test('the reply is validated and trimmed', () => {
  assert.equal(validateAnalysis(null).ok, false);
  assert.equal(validateAnalysis({ headline: 'x' }).ok, false, 'no drivers');
  const v = validateAnalysis({ headline: 'Gold up 1% against higher real yields', drivers: [{ driver: 'real yields', reading: '+4bp', fits: 'Contradicts' }, { driver: 'USD', reading: 'DXY -0.4%', fits: 'weird' }],
    card: { agree: 'nope' }, confidence: 'very', watch: ['CPI', 7] });
  assert.equal(v.ok, true);
  assert.equal(v.value.drivers[0].fits, 'contradicts');
  assert.equal(v.value.drivers[1].fits, 'mixed');
  assert.equal(v.value.card.agree, 'partly');
  assert.equal(v.value.confidence, 'low');
  assert.deepEqual(v.value.watch, ['CPI']);
});
