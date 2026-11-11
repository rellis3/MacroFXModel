import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCards, cardHtml, domainsOf, summaryText, statusOf } from './concepts.js';

const A = { id: 'trend-follow', title: 'Trend <b>following</b>', principle: 'Prices trend.', mechanism: 'Slow information.', measure: 'N-day breakout', lookFor: 'Range expansion', caveats: 'Costs', domain: ['trend', 'momentum'], sources: [{ kind: 'paper', id: 'doi:10.1/x y' }, { kind: 'cog', id: 'education/notes.md#2' }] };
const B = { id: 'gap-fill', title: 'Gap fills', principle: 'Gaps close.', mechanism: 'm', measure: 'gap size', lookFor: 'l', caveats: '', domain: ['session'], sources: [{ kind: 'theory-lab', id: 'theory-lab/lessons/a.html' }], review: { status: 'wrong', note: 'too vague' } };

test('filters by words, status, area and source kind', () => {
  assert.deepEqual(filterCards([A, B], { q: 'breakout' }).map(c => c.id), ['trend-follow']);
  assert.deepEqual(filterCards([A, B], { status: 'wrong' }).map(c => c.id), ['gap-fill']);
  assert.deepEqual(filterCards([A, B], { status: 'new' }).map(c => c.id), ['trend-follow']);
  assert.deepEqual(filterCards([A, B], { domain: 'session' }).map(c => c.id), ['gap-fill']);
  assert.deepEqual(filterCards([A, B], { kind: 'cog' }).map(c => c.id), ['trend-follow']);
  assert.deepEqual(filterCards([A, B], { q: 'trend gap' }), []);
  assert.deepEqual(domainsOf([A, B]), ['momentum', 'session', 'trend']);
});

test('a card escapes its text, links papers to the reader, shows the mark and the note', () => {
  const h = cardHtml(A);
  assert.ok(!h.includes('<b>'), 'escaped');
  assert.match(h, /href="#\/paper\/doi%3A10\.1%2Fx%20y"/);
  assert.match(h, /education\/notes\.md/);
  assert.ok(!/#2/.test(h), 'the section marker is not shown');
  assert.match(cardHtml(B), /data-status="wrong"[\s\S]*value="too vague"/);
  assert.match(cardHtml(B), /data-act="wrong" aria-pressed="true"/);
  assert.equal(statusOf(A), 'new');
});

test('the summary counts every state', () => {
  assert.equal(summaryText([A, B], 1), '1 of 2 cards shown · 0 good · 1 wrong · 0 unclear · 1 not reviewed');
});

test('on another page the paper links point at the library and open in a new tab', () => {
  const h = cardHtml(A, { paperBase: 'library.html' });
  assert.match(h, /href="library\.html#\/paper\/doi%3A10\.1%2Fx%20y" target="_blank"/);
});
