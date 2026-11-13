// node --test js/deskViewerView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isTradeText, scrubText, sanitizeRun, sanitizeRunIndex, sanitizeUpdate, sanitizeWeekly, sanitizeHistory, sanitizeNews, validateSharedRead } from './deskViewerView.js';

test('trade language is caught, analysis that uses the same words is not', () => {
  for (const t of ['Buy the dip at 1.0850.', 'Entry 1.0840-1.0860, stop 1.0800.', 'Take profit at 1.0950', 'Target 4,100 for the move', 'Go long EURUSD on a retest', 'Invalidation below 1.0780',
    'We recommend adding to the long', 'Position sizing 0.8 of the book', 'Risk reward is 3:1', 'stop-loss under the low', 'Scale in on weakness']) assert.ok(isTradeText(t), t);
  for (const t of ['The 2% inflation target is still far off.', 'Central-bank buying supports gold.', 'Short-term yields rose 6bp.', 'Real yields fell, which lifts gold.', 'Dealers sell into rallies when gamma is positive.',
    'The pair is near the p75 forecast line of 1.0912.', 'What would flip it: a hot payrolls print.', 'Options walls cluster at 4,100 and 4,150.']) assert.ok(!isTradeText(t), t);
});

test('scrubText drops only the offending sentences', () => {
  assert.equal(scrubText('The dollar is firm on rates. Buy the dip at 1.0850. Credit is calm.'), 'The dollar is firm on rates. Credit is calm.');
  assert.equal(scrubText('Entry 1.0840, stop 1.0800.'), '');
});

const RUN = { ok: true, date: '2026-11-13', startedAt: 's', finishedAt: 'f', mode: 'scheduled', tokens: 123, roles: { secret: 1 },
  head: { ok: true, book: { headline: 'Dollar firm, risk on. Buy EURUSD at 1.08.', global: { tone: 'risk_on', summary: 'Risk is bid.' },
    currencies: { USD: { bias: 1, why: 'Rates support it.', conviction: 'high' } },
    instruments: { EURUSD: { rating: 'SHORT', conviction: 'high', size: 0.9, sizeBeforeCap: 1.2, cappedBy: ['usd'], why: 'Rates favour the dollar. Entry 1.0840.', invalidation: '1.0900', plan: { zone: '1.0840', invalidation: '1.0900', timing: 'london' }, levels: { open: 1.08, up: { p50: 1.09 }, down: { p50: 1.07 } } } },
    risks: ['NFP surprise could flip USD.', 'Stop at 1.0900 is tight.'], gaps: ['no OI today'], exposure: { after: { USD: 1 } } } },
  debate: { currency: { view: { currencies: { USD: { bias: 1, conviction: 'high', why: 'Rates.', flip: 'a hot print' } }, ranking: ['USD'] } }, global: { view: { tone: 'risk_on', conviction: 'medium', summary: 'ok', drivers: ['credit'], flip: ['VIX > 25'] } },
    assets: { fx_majors: { view: { summary: 'fine', instruments: { EURUSD: { rating: 'SHORT', conviction: 'high', why: 'rates', plan: { zone: 'x', invalidation: 'y', timing: 'z' } } } } } },
    risk: { secret: 1 } },
  analysts: { rates_cb: { ok: true, id: 'rates_cb', report: { headline: 'Fed on hold.', confidence: 'medium', points: [{ claim: 'Dots hawkish.', evidence: 'SEP', impact: { USD: 1 } }, { claim: 'Take profit at 1.09.', evidence: '', impact: {} }], gaps: [] }, cost: 5 } },
  economist: { releases: [{ at: 'x', event: 'NFP', playbook: { markets: {} } }], view: { briefs: [{ event: 'NFP', sizeAndSpeed: 'Big and fast.', priced: 'half', ifHot: 'USD up', ifCold: 'USD down', bookAtRisk: 'our EURUSD short', watch: 'revisions' }] } } };

test('sanitizeRun: analysis kept, trade fields and owner data dropped (default)', () => {
  const v = sanitizeRun(RUN, () => false), c = v.head.book.instruments.EURUSD;
  assert.equal(v.head.book.headline, 'Dollar firm, risk on.');
  assert.equal(c.rating, 'SHORT'); assert.equal(c.conviction, 'high'); assert.equal(c.why, 'Rates favour the dollar.');
  for (const k of ['size', 'sizeBeforeCap', 'cappedBy', 'plan', 'invalidation']) assert.ok(!(k in c), k);
  assert.ok(c.levels.up.p50, 'forecast ranges stay: information');
  assert.deepEqual(v.head.book.risks, ['NFP surprise could flip USD.']);
  assert.ok(!('exposure' in v.head.book)); assert.ok(!('mode' in v) && !('tokens' in v) && !('roles' in v)); assert.ok(!('risk' in v.debate));
  assert.ok(!('plan' in v.debate.assets.fx_majors.view.instruments.EURUSD));
  assert.equal(v.analysts.rates_cb.report.points.length, 1);
  assert.ok(!('bookAtRisk' in v.economist.view.briefs[0]));
  assert.ok(!JSON.stringify(v).includes('1.0840') && !JSON.stringify(v).includes('1.0900') && !JSON.stringify(v).includes('exposure'));
});

test('sanitizeRun: the owner can switch a trade-level sub-surface on', () => {
  const v = sanitizeRun(RUN, id => id === 'panel.asset.size'), c = v.head.book.instruments.EURUSD;
  assert.equal(c.size, 0.9); assert.ok(!('plan' in c));
  const w = sanitizeRun(RUN, id => id === 'panel.asset.plan');
  assert.equal(w.head.book.instruments.EURUSD.plan.zone, '1.0840'); assert.ok(!('size' in w.head.book.instruments.EURUSD));
});

test('sanitizeRun: a failed run stays a failure and carries no internals', () => {
  assert.deepEqual(sanitizeRun({ ok: false, error: 'no run', stack: 'x' }, () => false), { ok: false, error: 'no run', running: undefined });
});

test('index, update, weekly, history, news', () => {
  assert.deepEqual(sanitizeRunIndex({ ok: true, days: [{ date: 'd', headOk: true, cost: 9 }] }), { ok: true, days: [{ date: 'd', headOk: true }] });
  const u = sanitizeUpdate({ ok: true, date: 'd', job: { x: 1 }, slots: { london: { at: 'a', view: { headline: 'Held.', changes: [{ instrument: 'EURUSD', to: 'LONG', size: 1, why: 'Fed' }], watch: ['CPI'] } } },
    live: { instruments: { EURUSD: { rating: 'LONG', size: 1, why: 'Fed', from: 'london', was: 'SHORT' } } } }, () => false);
  assert.ok(!('job' in u)); assert.ok(!('size' in u.slots.london.view.changes[0])); assert.ok(!('size' in u.live.instruments.EURUSD));
  const w = sanitizeWeekly({ ok: true, week: 'W', label: 'l', job: 1, view: { headline: 'h', ranking: ['USD'], currencies: { USD: { bias: 1, why: 'w' } }, themes: [{ title: 't', body: 'Buy USD at 100.' }, { title: 'ok', body: 'fine' }], week: [{ when: 'Mon', event: 'e', why: 'y' }], scenarios: [{ if: 'a', then: 'b' }], lastWeek: 'x', ideas: [{ level: 1 }] } });
  assert.ok(!('job' in w) && !('ideas' in w.view)); assert.equal(w.view.themes[0].body, ''); assert.equal(w.view.themes[1].body, 'fine');
  const h = sanitizeHistory({ ok: true, rows: [{ date: 'd', tone: 't', ranking: [], biases: {}, score: { S: 1 } }] }); assert.ok(!('score' in h.rows[0]));
  const n = sanitizeNews({ ok: true, items: [{ title: 't', read: { tier: 1, why: 'because', book: 'our EURUSD short', impact: { USD: 1 } }, pairs: [{ inst: 'EURUSD', dir: -1, stance: 'supports', card: 'SHORT' }] }] });
  assert.ok(!('book' in n.items[0].read)); assert.deepEqual(n.items[0].pairs[0], { inst: 'EURUSD', dir: -1 });
});

test('validateSharedRead: educational, signal-free, and refuses an instruction headline', () => {
  const good = { headline: 'Gold firmer as real yields slip.', drivers: [{ driver: 'Real yields', reading: '10y TIPS -4bp (fred)', fits: 'supports' }], contradictions: [], bull: 'Real yields keep falling. Buy at 2000.', bear: 'The dollar rebounds.',
    bias: 'bullish', levels: 'Entry 2000, stop 1980. Forecast p75 2031.', watch: ['US CPI'], gaps: [], confidence: 'medium' };
  const v = validateSharedRead(good);
  assert.ok(v.ok); assert.equal(v.value.bull, 'Real yields keep falling.'); assert.equal(v.value.levels, 'Forecast p75 2031.'); assert.ok(v.stripped >= 2); assert.equal(v.value.bias, 'bullish');
  assert.ok(!('card' in v.value));
  assert.equal(validateSharedRead({ ...good, headline: 'Buy gold at 2000.' }).ok, false);
  assert.equal(validateSharedRead({ ...good, drivers: [] }).ok, false);
  assert.equal(validateSharedRead({ ...good, bias: 'long' }).value.bias, 'mixed');
});

import { sanitizeStoredRead, sanitizerFor } from './deskViewerView.js';
test('a read stored before the change loses its card and its plan-like lines', () => {
  const old = { ok: true, inst: 'GOLD', card: { rating: 'LONG', size: 1, plan: { zone: '2000' } }, meta: { hasCard: true }, analysis: { headline: 'Gold up on real yields.', drivers: [{ driver: 'Real yields', reading: '-4bp', fits: 'supports' }],
    contradictions: [], bull: 'Higher. Entry 2000.', bear: 'Lower.', levels: 'Zone 2000, invalidation 1980. p75 2031.', watch: ['CPI'], gaps: [], confidence: 'low', card: { agree: 'agree', why: 'long it' } } };
  const v = sanitizeStoredRead(old);
  assert.equal(v.card, null); assert.ok(!('meta' in v)); assert.ok(!('card' in v.analysis)); assert.equal(v.analysis.audience, 'shared');
  assert.ok(!/2000|1980|invalidation/.test(JSON.stringify(v.analysis).replace('p75 2031', '')), JSON.stringify(v.analysis));
  const shared = { ok: true, analysis: { audience: 'shared', headline: 'h' } }; assert.equal(sanitizeStoredRead(shared), shared);
});
test('sanitizerFor maps the allowlisted routes only', () => {
  assert.ok(sanitizerFor('/api/desk-run')); assert.ok(sanitizerFor('/api/desk-run?date=x')); assert.ok(sanitizerFor('/api/desk-run/index/')); assert.equal(sanitizerFor('/api/desk-run/roles'), null); assert.equal(sanitizerFor('/api/rates'), null);
});
