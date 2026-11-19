import test from 'node:test';
import assert from 'node:assert/strict';
import { isDate, normDays, windowDates, daysAgo, newsCoverage, cacheKey, pickWindowNews, pickWindowEvents, cleanChain, deskHeadline, buildPrompt, stripTradeWording, hasTradeWording, validateExplain, clipWords } from './explainCore.js';
import { chainSummary } from '../terminal/jarvisModExplain.js';

const ld = ms => new Date(ms).toISOString().slice(0, 10);

test('date validation and window maths', () => {
  assert.ok(isDate('2026-11-19')); assert.ok(!isDate('2026-02-30')); assert.ok(!isDate('19/11/2026')); assert.ok(!isDate(null));
  assert.equal(normDays(3), 3); assert.equal(normDays('5'), 5); assert.equal(normDays(7), 1);
  assert.deepEqual(windowDates('2026-03-02', 3), ['2026-02-28', '2026-03-01', '2026-03-02']);
  assert.deepEqual(windowDates('2026-11-19', 1), ['2026-11-19']);
  assert.equal(daysAgo('2026-11-17', '2026-11-19'), 2);
});
test('news coverage follows the 72 h wire', () => {
  assert.equal(newsCoverage('2026-11-19', 1, '2026-11-19'), 'full');
  assert.equal(newsCoverage('2026-11-17', 3, '2026-11-19'), 'partial');
  assert.equal(newsCoverage('2026-10-01', 1, '2026-11-19'), 'none');
});
test('cache key is stable per date, window and market', () => {
  assert.equal(cacheKey('2026-11-19', 3, 'eurusd'), '2026-11-19|3|EURUSD');
  assert.equal(cacheKey('2026-11-19', 9, null), '2026-11-19|1|*');
  assert.notEqual(cacheKey('2026-11-19', 1, 'GOLD'), cacheKey('2026-11-19', 3, 'GOLD'));
});
test('headline and event picking by London date', () => {
  const t = Date.parse('2026-11-18T10:00:00Z');
  const wire = [{ ms: t, title: 'A', tier: 1 }, { ms: t + 1000, title: 'B', read: { tier: 3 } }, { ms: Date.parse('2026-11-10T10:00:00Z'), title: 'old', tier: 1 }];
  const got = pickWindowNews(wire, ['2026-11-18'], ld);
  assert.deepEqual(got.map(h => h.title), ['A']);
  const ev = [{ t: '2026-11-18T13:30:00Z', family: 'CPI' }, { t: '2026-11-20T13:30:00Z', family: 'NFP' }, { t: 'bad' }];
  assert.equal(pickWindowEvents(ev, ['2026-11-18'], ld).length, 1);
});
test('chain summary is cleaned and clipped', () => {
  assert.equal(cleanChain(null), null);
  const big = { moved: Array.from({ length: 60 }, (_, i) => ({ node: 'n'.repeat(120), text: `t${i}` })), links: [] };
  assert.ok(JSON.stringify(cleanChain(big)).length <= 4096);
  assert.deepEqual(cleanChain({ moved: [{ node: 'DXY', text: '+0.4%', x: 1 }], links: [{ link: 'a-b', verdict: 'broken' }] }), { moved: [{ node: 'DXY', text: '+0.4%' }], links: [{ link: 'a-b', verdict: 'broken' }] });
  assert.deepEqual(chainSummary({ nodes: [{ key: 'dxy', end: { text: '+0.4%', delta: 0.4 } }, { key: 'x', end: { text: '0', delta: 0 } }], edges: [{ from: 'a', to: 'b', verdict: 'quiet' }, { from: 'a', to: 'c', verdict: 'broken', short: 'a-c' }] }, { dxy: 'Dollar' }),
    { moved: [{ node: 'Dollar', text: '+0.4%' }], links: [{ link: 'a-c', verdict: 'broken' }] });
});
test('desk headline', () => {
  assert.equal(deskHeadline(null), null);
  assert.equal(deskHeadline({ head: { book: { headline: 'Risk on', global: { tone: 'risk-on' } } } }).tone, 'risk-on');
});
test('prompt states coverage and says nothing stored when empty', () => {
  const { system, prompt } = buildPrompt({ date: '2026-11-10', days: 3, market: 'GOLD', today: '2026-11-19', coverage: { news: 'none' } });
  assert.match(prompt, /2026-11-08 to 2026-11-10/); assert.match(prompt, /none stored/); assert.match(prompt, /Market in focus: GOLD/);
  assert.match(system, /DESCRIPTION ONLY/);
});
test('trade wording is stripped by sentence', () => {
  assert.ok(hasTradeWording('Consider a long entry')); assert.ok(!hasTradeWording('Yields rose alongside payrolls.'));
  const r = stripTradeWording('Yields rose after CPI. Traders should buy dips. Gold held.');
  assert.equal(r.stripped, 1); assert.equal(r.text, 'Yields rose after CPI. Gold held.');
  assert.equal(stripTradeWording('The dollar will rally. Stop at 1.05.').text, '');
});
test('validateExplain cleans, clips and rejects', () => {
  const v = validateExplain({ answer: 'CPI came in hot. Buy the dollar.', drivers: [{ claim: 'Hot CPI', evidence: 'CPI line' }, { claim: 'Sell gold', evidence: 'x' }, { claim: '', evidence: 'y' }], notExplained: 'Positioning.', sources: ['news', 5] });
  assert.ok(v.ok); assert.equal(v.value.answer, 'CPI came in hot.'); assert.equal(v.value.drivers.length, 1); assert.ok(v.stripped >= 2);
  assert.ok(!validateExplain({ answer: 'Buy now.' }).ok); assert.ok(!validateExplain(null).ok);
  assert.ok(validateExplain({ answer: 'word '.repeat(300) }).value.answer.split(' ').length <= 151);
  assert.equal(clipWords('a b c', 2), 'a b...');
});
