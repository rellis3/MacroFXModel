// node --test js/terminal/newsSearchCore.test.mjs: saved News searches (cleaning, the stored shape, save and delete, caps, the alert a search can become).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSearch, sanitizeStore, applyAction, describeSearch, alertFor, sameFilter, MAX_SEARCHES, cleanName } from './newsSearchCore.js';

test('a search needs words (2+ letters) or a currency/asset key; keys are checked against the wire list', () => {
  assert.equal(cleanSearch({ q: '', keys: [] }), null); assert.equal(cleanSearch({ q: 'a' }), null); assert.equal(cleanSearch(null), null);
  assert.deepEqual(cleanSearch({ q: '  ECB  Hawkish ', tier: '1', keys: ['eur', 'xxx', 'EUR'], onlyBook: 1 }), { q: 'ecb hawkish', tier: 1, keys: ['EUR'], onlyBook: true });
  assert.deepEqual(cleanSearch({ keys: ['GOLD'], tier: 9 }), { q: '', tier: 2, keys: ['GOLD'], onlyBook: false });
  assert.ok(!/[<>]/.test(cleanSearch({ q: 'x<script>y' }).q), 'angle brackets never survive');
});
test('the stored shape drops bad rows, repeats and the cap', () => {
  const r = sanitizeStore({ searches: [{ name: 'A', q: 'ecb' }, { name: 'a', q: 'boe' }, { name: '', q: 'x1' }, { name: 'Empty', q: '' }, { name: 'B', keys: ['USD'] }] });
  assert.deepEqual(r.searches.map(s => s.name), ['A', 'B']);
  const many = sanitizeStore({ searches: Array.from({ length: 40 }, (_, i) => ({ name: `S${i}`, q: `word${i}` })) });
  assert.equal(many.searches.length, MAX_SEARCHES);
});
test('save adds or replaces (any case), delete removes, bad ones say why', () => {
  const s0 = { v: 1, searches: [] };
  let r = applyAction(s0, { action: 'save', name: 'ECB', search: { q: 'ecb', tier: 1 } });
  assert.ok(r.ok && r.store.searches[0].tier === 1);
  r = applyAction(r.store, { action: 'save', name: 'ecb', search: { q: 'ecb hawkish' } });
  assert.ok(r.ok && r.store.searches.length === 1 && r.store.searches[0].q === 'ecb hawkish');
  assert.match(applyAction(s0, { action: 'save', name: 'X', search: { q: '' } }).error, /empty search/);
  assert.equal(applyAction(s0, { action: 'save', name: ' ', search: { q: 'ecb' } }).status, 400);
  assert.equal(applyAction(r.store, { action: 'delete', name: 'ECB' }).store.searches.length, 0);
  assert.equal(applyAction(r.store, { action: 'delete', name: 'zzz' }).status, 404);
  assert.equal(applyAction(s0, { action: 'wipe', name: 'x' }).status, 400);
  let big = s0; for (let i = 0; i < MAX_SEARCHES; i++) big = applyAction(big, { action: 'save', name: `S${i}`, search: { q: `word${i}` } }).store;
  assert.equal(applyAction(big, { action: 'save', name: 'more', search: { q: 'word' } }).status, 400);
  assert.ok(applyAction(big, { action: 'save', name: 'S3', search: { q: 'other' } }).ok, 'replacing at the cap works');
});
test('a search reads as a phrase and becomes a keyword alert only when it has words', () => {
  const s = cleanSearch({ q: 'ecb hawkish', tier: 2, keys: ['EUR'], onlyBook: true });
  assert.equal(describeSearch(s), 'words "ecb hawkish", tier 1 and 2, EUR, only headlines on today\'s book');
  assert.deepEqual(alertFor(s), { ok: true, kind: 'news_keyword', params: { q: 'ecb hawkish', tier: 2, keys: ['EUR'] } });
  assert.match(alertFor(cleanSearch({ keys: ['USD'] })).error, /needs words/);
  assert.equal(alertFor(null).ok, false);
});
test('sameFilter ignores key order and case, and notices a real change; names lose markup characters', () => {
  assert.ok(sameFilter({ q: 'ECB', keys: ['EUR', 'USD'] }, { q: 'ecb', keys: ['USD', 'EUR'] }));
  assert.ok(!sameFilter({ q: 'ecb', keys: [] }, { q: 'boe', keys: [] }));
  assert.ok(!/[<>"&]/.test(cleanName('  a<b>"c" & d  ')));
});
