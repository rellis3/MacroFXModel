// Tests for js/library/summary.js (synthetic data only).   node js/library/summary.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as S from './summary.js';

const notes = (o = {}) => ({ claim: 'Invented claim holds.', mechanism: 'm', data: { market: 'FX', period: '2000-2020', frequency: 'daily' }, method: 'Sort into quintiles', effect: '3% a year.', outOfSample: 'yes', costs: 'no', relevance: 'Relevant to our carry book.', stance: 'supports', caveats: ['Small sample.', 'Second'], testHere: 'Test the quintile sort on G10.', ...o });
const P = (o = {}) => ({ id: 'a', title: 'T', abstract: '', notes: notes(), desk: [], tags: [], ...o });

test('trimAt keeps short text', () => assert.equal(S.trimAt('  Short   text. ', 50), 'Short text.'));
test('trimAt cuts a long input at a sentence boundary', () => {
  const long = 'First sentence is here. ' + 'Second sentence is a bit longer than the first one. ' + 'Third sentence goes far past any sensible limit '.repeat(20) + '.';
  const r = S.trimAt(long, 90); assert.ok(r.length <= 90); assert.ok(r.endsWith('.')); assert.ok(!r.includes('Third'));
});
test('trimAt falls back to a word boundary with an ellipsis', () => {
  const r = S.trimAt('word '.repeat(100), 40); assert.ok(r.length <= 40); assert.ok(r.endsWith('…'));
});
test('trimAt does not split on abbreviations', () => {
  assert.equal(S.firstSentence('Smith et al. found a result in the U.S. market. Next one.', 200), 'Smith et al. found a result in the U.S. market.');
  assert.equal(S.firstSentence('We use e.g. Daily data. More.', 200), 'We use e.g. Daily data.');
});
test('firstSentence handles empty and no-period input', () => { assert.equal(S.firstSentence(''), ''); assert.equal(S.firstSentence(null), ''); assert.equal(S.firstSentence('No full stop here'), 'No full stop here'); });

test('inShort builds claim, effect, setup, caveat and evidence', () => {
  const s = S.inShort(P());
  assert.equal(s.state, 'notes'); assert.deepEqual(s.items.map(i => i.kind), ['claim', 'effect', 'setup', 'caveat']);
  assert.match(s.items[2].text, /Data: FX, 2000-2020, daily\. Method: Sort into quintiles/);
  assert.equal(s.items[3].text, 'Caveat: Small sample.');
  assert.equal(s.evidence.tone, 'warn'); assert.match(s.evidence.text, /holds out of sample.*not shown to survive costs.*desk stance: supports/);
});
test('inShort never exceeds 4 items and trims long fields', () => {
  const s = S.inShort(P({ notes: notes({ claim: 'A claim sentence. '.repeat(100), effect: 'x '.repeat(500), method: 'y '.repeat(500) }) }));
  assert.ok(s.items.length <= 4); for (const i of s.items) assert.ok(i.text.length <= 300);
});
test('inShort evidence variants', () => {
  assert.equal(S.inShort(P({ notes: notes({ outOfSample: 'no', costs: 'yes' }) })).evidence.tone, 'bad');
  assert.match(S.inShort(P({ notes: notes({ outOfSample: 'no' }) })).evidence.text, /in-sample/);
  assert.equal(S.inShort(P({ notes: notes({ outOfSample: 'yes', costs: 'yes' }) })).evidence.tone, 'good');
  assert.match(S.inShort(P({ notes: notes({ outOfSample: 'unclear' }) })).evidence.text, /unclear/);
  assert.match(S.inShort(P({ notes: notes({ outOfSample: 'Not tested.' }) })).evidence.text, /not shown out of sample/);
});
test('missing fields are left out, not invented', () => {
  const s = S.inShort(P({ notes: { claim: 'Only a claim.' } }));
  assert.deepEqual(s.items.map(i => i.kind), ['claim']);
  assert.ok(!/undefined|null/.test(JSON.stringify(s)));
  const s2 = S.inShort(P({ notes: notes({ data: null, method: '', effect: '', caveats: [] }) }));
  assert.deepEqual(s2.items.map(i => i.kind), ['claim']);
});
test('string data and string caveats are accepted', () => {
  const s = S.inShort(P({ notes: notes({ data: 'Synthetic.', caveats: 'Entirely made up.' }) }));
  assert.match(s.items.find(i => i.kind === 'setup').text, /Data: Synthetic\./); assert.equal(s.items.at(-1).text, 'Caveat: Entirely made up.');
});
test('no notes: abstract fallback is honest', () => {
  const s = S.inShort(P({ notes: null, abstract: 'We study X in the U.S. market. It is long.' }));
  assert.equal(s.state, 'abstract'); assert.equal(s.items[0].text, 'We study X in the U.S. market.'); assert.match(s.note, /Not read by the desk yet/);
  const z = S.inShort(P({ notes: null }));
  assert.equal(z.state, 'none'); assert.equal(z.items.length, 0); assert.match(z.note, /nothing is claimed/);
});
test('empty notes object counts as unread', () => assert.equal(S.inShort(P({ notes: { claim: '', mechanism: null, method: '' } })).state, 'none'));

test('cardLine variants', () => {
  assert.equal(S.cardLine(P()).text, 'Invented claim holds.');
  assert.equal(S.cardLine(P({ notes: notes({ costs: 'yes' }) })).text, 'Invented claim holds. (holds out of sample)');
  assert.equal(S.cardLine(P()).muted, false);
  assert.match(S.cardLine(P({ notes: notes({ outOfSample: 'no' }) })).text, /in-sample only/);
  const a = S.cardLine(P({ notes: null, abstract: 'Abstract sentence one. Two.' })); assert.equal(a.muted, true); assert.equal(a.text, 'Not read yet. Abstract: Abstract sentence one.');
  assert.equal(S.cardLine(P({ notes: null })).text, 'Not read by the desk yet.');
  assert.ok(S.cardLine(P({ notes: notes({ claim: 'w '.repeat(400) }) })).text.length < 200);
});

test('helpUs: relevance, idea, desk, theory slugs', () => {
  const h = S.helpUs(P({ desk: [{ id: 'ev 1', verdict: 'candidate', claim: 'Desk claim' }], theory: ['garch-volatility', '../bad'] }));
  assert.equal(h.relevance, 'Relevant to our carry book.'); assert.equal(h.idea, 'Test the quintile sort on G10.');
  assert.equal(h.desk[0].href, '/evidence.html#ev-ev%201'); assert.deepEqual(h.lessons.map(l => l.slug), ['garch-volatility']);
});
test('helpUs falls back to tag lessons and handles unread papers', () => {
  const h = S.helpUs(P({ tags: [{ key: 'jump', label: 'Jump' }] })); assert.ok(h.lessons.length > 0);
  const u = S.helpUs(P({ notes: null })); assert.equal(u.state, 'unread'); assert.equal(u.relevance, ''); assert.match(u.note, /Not read by the desk yet/);
  assert.match(S.helpUs(P({ notes: notes({ relevance: '', testHere: '' }) })).note, /no direct use/);
});

test('HTML is escaped', () => {
  const evil = '<img src=x onerror=alert(1)> & "q"';
  const p = P({ notes: notes({ claim: evil, effect: evil, relevance: evil, testHere: evil, caveats: [evil] }), desk: [{ id: '"><x', verdict: '<u>', claim: evil }], theory: [] });
  for (const h of [S.inShortHtml(p), S.helpHtml(p)]) { assert.ok(!h.includes('<img'), h); assert.ok(!h.includes('<u>')); assert.ok(!/<x/.test(h)); }
  assert.ok(S.inShortHtml(p).includes('&lt;img'));
});
test('inShortHtml / helpHtml structure', () => {
  const a = S.inShortHtml(P()), b = S.helpHtml(P());
  assert.match(a, />In short</); assert.match(a, /lib-ev warn/); assert.match(b, />How it could help us</); assert.match(b, /id="caseBtn"[^>]*>Test this idea</);
  const u = S.inShortHtml(P({ notes: null })); assert.match(u, /Not read by the desk yet/); assert.ok(!u.includes('<ul>'));
  assert.match(S.helpHtml(P({ notes: null })), /id="caseBtn"/);
});

test('cardLine uses the server-computed card string when the list response carries it', () => {
  assert.deepEqual(S.cardLine({ id: 'a', card: 'A short line.', cardMuted: false }), { text: 'A short line.', muted: false });
  assert.deepEqual(S.cardLine({ id: 'a', card: 'Not read yet. Abstract: x.', cardMuted: true }), { text: 'Not read yet. Abstract: x.', muted: true });
  assert.equal(S.cardLine(P()).text, S.cardLine({ id: 'a', card: S.cardLine(P()).text }).text, 'same text with or without notes');
});
