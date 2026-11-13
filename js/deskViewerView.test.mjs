// node --test js/deskViewerView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isTradeText, scrubText, isTradeLevelText, scrubLevels, stripTrade, sanitizeRun, sanitizeRunIndex, sanitizeUpdate, sanitizeWeekly, sanitizeHistory, sanitizeNews, validateSharedRead } from './deskViewerView.js';

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

test('sanitizeRun: the whole book is kept (directions, reasons, exposure, risk); only entries, stops, targets, invalidation and the plan are cut', () => {
  const v = sanitizeRun(RUN, () => false), c = v.head.book.instruments.EURUSD;
  assert.equal(v.head.book.headline, 'Dollar firm, risk on.', 'an imperative sentence with a level is cut, the analysis stays');
  assert.equal(c.rating, 'SHORT', 'the direction stays'); assert.equal(c.conviction, 'high'); assert.equal(c.why, 'Rates favour the dollar.', 'the reason stays, the entry sentence goes');
  for (const k of ['plan', 'invalidation']) assert.ok(!(k in c), `${k} is a trade-level field`);
  // size stays in the DATA: the book's net exposure, concentration and scenarios are computed from it. Its display on a market card is its own switch (panel.asset.size).
  assert.equal(c.size, 0.9); assert.equal(c.sizeBeforeCap, 1.2); assert.deepEqual(c.cappedBy, ['usd']);
  assert.ok(c.levels.up.p50, 'forecast ranges stay: information');
  assert.deepEqual(v.head.book.risks, ['NFP surprise could flip USD.'], 'a risk sentence with a stop level is cut, the other stays');
  assert.deepEqual(v.head.book.exposure, { after: { USD: 1 } }, 'net currency exposure stays');
  assert.deepEqual(v.head.book.currencies.USD, { bias: 1, why: 'Rates support it.', conviction: 'high' });
  assert.deepEqual(v.debate.currency.view.currencies.USD, { bias: 1, conviction: 'high', why: 'Rates.', flip: 'a hot print' });
  assert.deepEqual(v.debate.risk, { secret: 1 }, "the risk desk's view stays (its sizes and vetoes are separate keys)");
  assert.ok(!('mode' in v) && !('tokens' in v) && !('roles' in v), 'job internals are dropped');
  assert.ok(!('plan' in v.debate.assets.fx_majors.view.instruments.EURUSD));
  assert.equal(v.debate.assets.fx_majors.view.instruments.EURUSD.rating, 'SHORT');
  assert.equal(v.analysts.rates_cb.report.points.length, 1, 'a point that is only a take-profit instruction is dropped, not left blank'); assert.equal(v.analysts.rates_cb.report.points[0].claim, 'Dots hawkish.');
  assert.ok(!('cost' in v.analysts.rates_cb));
  assert.equal(v.economist.view.briefs[0].bookAtRisk, 'our EURUSD short', 'what is at risk is analysis');
  const all = JSON.stringify(v);
  assert.ok(!all.includes('1.0840') && !all.includes('1.0900') && !all.includes('Entry') && !all.includes('Take profit'), 'no entry, stop or take-profit level survives');
});

test('sanitizeRun: the owner can switch the plan lines back on', () => {
  const w = sanitizeRun(RUN, id => id === 'panel.asset.plan');
  assert.equal(w.head.book.instruments.EURUSD.plan.zone, '1.0840'); assert.equal(w.head.book.instruments.EURUSD.invalidation, '1.0900');
  assert.ok('plan' in w.debate.assets.fx_majors.view.instruments.EURUSD);
  const off = sanitizeRun(RUN, id => id === 'panel.asset.size'); assert.ok(!('plan' in off.head.book.instruments.EURUSD));
});

test('sanitizeRun: the regime lists have the same currencies for a viewer as for the owner (the owner\'s bug: "no longs, no shorts")', () => {
  const run = { ok: true, head: { ok: true, book: { instruments: { EURUSD: { rating: 'SHORT', conviction: 'high', size: 0.9, why: 'Rates.', plan: { zone: '1' } }, NAS100: { rating: 'LONG', conviction: 'medium', size: 0.6, why: 'Earnings.', invalidation: '1' } } } } };
  const v = sanitizeRun(run, () => false), cards = v.head.book.instruments;
  // the page lists a card when it has a direction and a size above zero
  const live = o => Object.entries(o).filter(([, c]) => /LONG|SHORT/.test(c.rating) && c.size > 0).map(([n]) => n).sort();
  assert.deepEqual(live(cards), live(run.head.book.instruments)); assert.deepEqual(live(cards), ['EURUSD', 'NAS100']);
});

test('sanitizeRun: a failed run stays a failure and carries no internals', () => {
  assert.deepEqual(sanitizeRun({ ok: false, error: 'no run', stack: 'x' }, () => false), { ok: false, error: 'no run', running: undefined });
});

test('trade-level sentences are cut; analytic sentences that use the same words are not', () => {
  for (const t of ['Buy the dip at 1.0850.', 'Entry 1.0840-1.0860, stop 1.0800.', 'Take profit at 1.0950', 'Target 4,100 for the move', 'Invalidation below 1.0780', 'Stop-loss under the low', 'Risk reward is 3:1']) assert.ok(isTradeLevelText(t), t);
  for (const t of ['The desk leans bullish on the dollar.', 'Go long the dollar on rates.', 'We recommend watching payrolls.', 'The 2% inflation target is far off.', 'Inflation target of 2% anchors expectations.', 'Central-bank buying supports gold.', 'Short-term yields rose 6bp.',
    'Dealers sell into rallies when gamma is positive.', 'The pair is near the p75 forecast line of 1.0912.', 'What would flip it: a hot payrolls print.', "Position sizing is the desk's job."]) assert.ok(!isTradeLevelText(t), t);
  assert.equal(scrubLevels('The dollar is firm on rates. Buy the dip at 1.0850. Credit is calm.'), 'The dollar is firm on rates. Credit is calm.');
  assert.equal(scrubLevels('Go long the dollar on rates. It leans bullish.'), 'Go long the dollar on rates. It leans bullish.');
});

test('stripTrade removes the trade keys wherever they are, and leaves the rest alone', () => {
  const v = stripTrade({ a: { entry: 1, stop: 2, target: 3, tp: 4, rr: 5, riskReward: 6, ideas: [1], adjustments: [{ size: 1, veto: true }], keep: 'yes', size: 0.5 }, list: [{ plan: { zone: 'x' }, bias: 1 }] }, () => false);
  assert.deepEqual(v, { a: { keep: 'yes', size: 0.5 }, list: [{ bias: 1 }] });
});

test('index, update, weekly, history, news', () => {
  assert.deepEqual(sanitizeRunIndex({ ok: true, days: [{ date: 'd', headOk: true, cost: 9 }] }), { ok: true, days: [{ date: 'd', headOk: true }] });
  const u = sanitizeUpdate({ ok: true, date: 'd', job: { x: 1 }, slots: { london: { at: 'a', view: { headline: 'Held.', changes: [{ instrument: 'EURUSD', to: 'LONG', size: 1, why: 'Fed' }], watch: ['CPI'] } } },
    live: { instruments: { EURUSD: { rating: 'LONG', size: 1, why: 'Fed', from: 'london', was: 'SHORT' } } } }, () => false);
  assert.ok(!('job' in u)); assert.equal(u.slots.london.view.changes[0].to, 'LONG', 'what changed, and to what lean, stays'); assert.equal(u.live.instruments.EURUSD.rating, 'LONG');
  const w = sanitizeWeekly({ ok: true, week: 'W', label: 'l', job: 1, view: { headline: 'h', ranking: ['USD'], currencies: { USD: { bias: 1, why: 'w' } }, themes: [{ title: 't', body: 'Buy USD at 100.' }, { title: 'ok', body: 'fine' }], week: [{ when: 'Mon', event: 'e', why: 'y' }], scenarios: [{ if: 'a', then: 'b' }], lastWeek: 'x', ideas: [{ level: 1 }] } }, () => false);
  assert.ok(!('job' in w) && !('ideas' in w.view), "the desk edition's trade ideas are dropped"); assert.equal(w.view.themes[w.view.themes.length - 1].body, 'fine');
  assert.deepEqual(w.view.currencies, { USD: { bias: 1, why: 'w' } }); assert.deepEqual(w.view.ranking, ['USD']);
  const h = sanitizeHistory({ ok: true, rows: [{ date: 'd', tone: 't', ranking: [], biases: {}, score: { S: 1 } }] }, () => false); assert.ok(!('score' in h.rows[0]), "the desk's score for a day is its record");
  const h2 = sanitizeHistory({ ok: true, rows: [{ date: 'd', tone: 't', ranking: [], biases: {}, score: { S: 1 } }] }, id => id === 'panel.ana.track'); assert.deepEqual(h2.rows[0].score, { S: 1 }, 'a record surface switched on brings it back');
  const n = sanitizeNews({ ok: true, items: [{ title: 't', read: { tier: 1, why: 'because', book: 'our EURUSD card leans bearish', impact: { USD: 1 } }, pairs: [{ inst: 'EURUSD', dir: -1, stance: 'supports', card: 'SHORT' }] }] }, () => false);
  assert.equal(n.items[0].read.book, 'our EURUSD card leans bearish', 'the line on the book is analysis'); assert.deepEqual(n.items[0].pairs[0], { inst: 'EURUSD', dir: -1, stance: 'supports', card: 'SHORT' });
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
test('sanitizerFor maps the routes whose copy has trade fields removed, and only those', () => {
  assert.ok(sanitizerFor('/api/desk-run')); assert.ok(sanitizerFor('/api/desk-run?date=x')); assert.ok(sanitizerFor('/api/desk-run/index/')); assert.equal(sanitizerFor('/api/desk-run/roles'), null); assert.equal(sanitizerFor('/api/rates'), null);
});
