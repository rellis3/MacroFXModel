import test from 'node:test';
import assert from 'node:assert/strict';
import { stem, tokenize, buildIndex, search, matchEvidence } from './paperRank.js';

const LIB = [
  { id: 'a', title: 'Volatility clustering in equity indices', abstract: 'Realised volatility persists after large moves.', year: 2010, tags: ['vol'] },
  { id: 'b', title: 'Yield curve inversion and recessions', abstract: 'Inverted curves precede downturns.', year: 2005 },
  { id: 'c', title: 'Gold and real rates', abstract: 'Gold responds to real yields.', year: 2018, notes: { claim: 'real rate coupling' } },
  { id: '', title: 'no id' },
];
test('stem and tokenize', () => {
  assert.equal(stem('rates'), 'rat'); assert.equal(stem('class'), 'class'); assert.equal(stem('go'), 'go');
  assert.deepEqual(tokenize('The Volatility of the markets, and yields!'), ['volatility', 'yield']);
});
test('index skips invalid, caps docs', () => {
  assert.equal(buildIndex(LIB).n, 3); assert.equal(buildIndex(LIB, { maxDocs: 1 }).n, 1);
});
test('search ranks relevant paper first, reports matched terms, empty query is empty', () => {
  const ix = buildIndex(LIB), r = search(ix, 'volatility moves', 5);
  assert.equal(r[0].id, 'a'); assert.ok(r[0].why.includes('volatility')); assert.ok(r[0].score > 0);
  assert.deepEqual(search(ix, 'the and of'), []); assert.deepEqual(search(ix, 'zzzz'), []);
  assert.equal(search(ix, 'gold real yields')[0].id, 'c');
});
test('matchEvidence keeps verdict verbatim', () => {
  const ev = [{ id: 'vix-inversion', claim: 'VIX above VIX3M is followed by a wider week', verdict: 'validated', doc: 'x.md', domain: 'volatility', instruments: ['NQ'] },
    { id: 'o', claim: 'unrelated thing', verdict: 'null' }];
  const m = matchEvidence(ev, 'vix inversion wider');
  assert.equal(m.length, 1); assert.equal(m[0].verdict, 'validated'); assert.equal(m[0].source, 'x.md');
  assert.deepEqual(matchEvidence(ev, ''), []);
});
