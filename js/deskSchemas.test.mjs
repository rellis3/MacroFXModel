import assert from 'node:assert/strict';
import { normalizeRating, validateAnalystReport, validateHeadBook, RATINGS, RATING_REVIEW } from './deskSchemas.js';
import { allInstruments, DESK_CCYS } from './deskPack.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('normalizeRating: the five steps in any spelling; synonyms; anything else is REVIEW, never FLAT', () => {
  assert.equal(normalizeRating('strong long'), 'STRONG_LONG');
  assert.equal(normalizeRating('Strong-Short'), 'STRONG_SHORT');
  assert.equal(normalizeRating('LONG'), 'LONG');
  assert.equal(normalizeRating('Buy'), 'LONG');
  assert.equal(normalizeRating('neutral'), 'FLAT');
  for (const bad of ['', null, 'maybe', 'Rating: Long', 3]) assert.equal(normalizeRating(bad), RATING_REVIEW, String(bad));
  assert.equal(RATINGS.length, 5);
});

const goodReport = { headline: 'Credit is widening while equities hold', confidence: 'medium', gaps: ['bank-credit: 3 months old'],
  points: [{ claim: 'HY +34bp over 20d', evidence: 'credit-stress', impact: { RISK: -1, USD: 1 } }] };

t('analyst report: a good one passes unchanged in substance', () => {
  const v = validateAnalystReport(goodReport, 'credit_funding');
  assert.ok(v.ok); assert.equal(v.value.skill, 'credit_funding'); assert.deepEqual(v.value.points[0].impact, { RISK: -1, USD: 1 }); assert.deepEqual(v.notes, []);
});

t('analyst report: small faults are repaired and noted', () => {
  const v = validateAnalystReport({ ...goodReport, confidence: 'very', points: [{ claim: 'x', impact: { usd: 5, XYZ: 1, 'EUR/USD': -1, JPY: 'up' } }, { evidence: 'no claim' }] }, 's');
  assert.ok(v.ok);
  assert.equal(v.value.confidence, 'low');
  assert.deepEqual(v.value.points[0].impact, { USD: 2, EURUSD: -1 });
  assert.equal(v.value.points.length, 1);
  assert.ok(v.notes.some(x => /clamped/.test(x)) && v.notes.some(x => /XYZ dropped/.test(x)) && v.notes.some(x => /no claim/.test(x)));
});

t('analyst report: unusable replies fail with reasons', () => {
  assert.equal(validateAnalystReport(null, 's').ok, false);
  assert.equal(validateAnalystReport([], 's').ok, false);
  assert.deepEqual(validateAnalystReport({ points: goodReport.points }, 's').errors, ['headline missing']);
  assert.ok(validateAnalystReport({ headline: 'h', points: [] }, 's').errors.includes('points missing or empty'));
  assert.ok(validateAnalystReport({ headline: 'h', points: [{ evidence: 'x' }] }, 's').errors.includes('no usable point'));
});

const book = () => ({
  headline: 'Risk-off into US data', global: { tone: 'risk-off', summary: 's' },
  currencies: Object.fromEntries(DESK_CCYS.map(c => [c, { bias: c === 'JPY' ? 2 : 0, why: 'w' }])),
  instruments: Object.fromEntries(allInstruments().map(i => [i, { rating: 'flat', conviction: 'low', why: 'w', invalidation: 'i' }])),
  risks: ['NFP'], gaps: [],
});

t('head book: every instrument gets a card; tone and ratings normalised', () => {
  const v = validateHeadBook(book());
  assert.ok(v.ok);
  assert.equal(v.value.global.tone, 'risk_off');
  assert.equal(Object.keys(v.value.instruments).length, allInstruments().length);
  assert.equal(v.value.instruments.EURUSD.rating, 'FLAT');
  assert.equal(v.value.currencies.JPY.bias, 2);
});

t('head book: a missing or unreadable instrument is REVIEW and noted, a slash pair is accepted', () => {
  const b = book(); delete b.instruments.GOLD; b.instruments.NQ.rating = 'up a bit'; b.instruments['EUR/USD'] = b.instruments.EURUSD; delete b.instruments.EURUSD;
  const v = validateHeadBook(b);
  assert.ok(v.ok);
  assert.equal(v.value.instruments.GOLD.rating, RATING_REVIEW); assert.ok(v.value.instruments.GOLD.missing);
  assert.equal(v.value.instruments.NQ.rating, RATING_REVIEW);
  assert.equal(v.value.instruments.EURUSD.rating, 'FLAT');
  assert.ok(v.notes.some(x => new RegExp(`2 of ${allInstruments().length} instruments are REVIEW`).test(x)));
});

t('head book: fails when most instruments are unreadable, or there are none', () => {
  const b = book(); for (const k of Object.keys(b.instruments)) b.instruments[k].rating = '?';
  assert.equal(validateHeadBook(b).ok, false);
  assert.equal(validateHeadBook({ headline: 'h', instruments: {} }).ok, false);
});

console.log(`deskSchemas: ${n} tests passed`);
