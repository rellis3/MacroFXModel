import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionsFromHtml, speechClean, blurb, viewForHeading, issueScenes, newestPerKind, KIND_LABEL } from './newsShowCore.js';

const HTML = `<html><head><style>h2{color:red}</style><script>var x = '<h2>not a heading</h2>';</script></head><body>
<h1>Dollar at 19-month high, but the book is one carry bet</h1>
<h2>The global backdrop</h2><p>Real yields fell 26&nbsp;bp over 20 days &mdash; gold fell anyway. Credit spreads widened 27 bp &amp; the VIX rose to 24.6 (a high reading).</p><ul><li>The 2s10s curve is 27bp, steeper than 5% of the last year.</li></ul>
<h2>Every market, one glance</h2><table><tr><td>NQ</td><td>+1.2</td></tr></table>
<h2>Where the desk leans</h2><p>The desk has a view on 21 markets. Long Nasdaq, short the yen. Conviction is medium. This is the desk's own call.</p><p>short</p>
<h3>The currencies</h3><p>The dollar is the strongest currency this morning, the yen the weakest by a wide margin today.</p></body></html>`;

test('sectionsFromHtml: headings in order, prose blocks only, scripts and styles ignored, entities decoded, tables skipped', () => {
  const s = sectionsFromHtml(HTML);
  assert.deepEqual(s.map(x => x.title), ['Dollar at 19-month high, but the book is one carry bet', 'The global backdrop', 'Every market, one glance', 'Where the desk leans', 'The currencies']);
  assert.equal(s[1].blocks.length, 2); assert.ok(s[1].blocks[0].includes('26 bp') && s[1].blocks[0].includes('& the VIX'));
  assert.equal(s[2].blocks.length, 0, 'a table has no prose'); assert.equal(s[3].blocks.length, 1, 'a 5-character stub is not a block');
});
test('speechClean: symbols become words, arrows and brackets are quietened', () => {
  assert.equal(speechClean('Up 3% & 26bp → higher (a bracket) — fine'), 'Up 3 percent and 26 basis points to higher, fine');
});
test('blurb: whole sentences up to about the word limit', () => {
  const b = blurb(['One two three four five. Six seven eight nine ten. Eleven twelve thirteen fourteen fifteen.'], 10);
  assert.equal(b, 'One two three four five. Six seven eight nine ten.'); assert.equal(blurb([], 50), '');
});
test('viewForHeading: topic words choose a view, only from the views that exist', () => {
  const have = new Set(['globe', 'ccy', 'yields', 'book', 'candles']);
  assert.equal(viewForHeading('The currencies', have), 'ccy'); assert.equal(viewForHeading('USD strongest, NZD weakest', have), 'ccy'); assert.equal(viewForHeading('What is driving rates', have), 'yields');
  assert.equal(viewForHeading('Where the desk leans', have), 'book'); assert.equal(viewForHeading('Every market, one glance', have), 'candles');
  assert.equal(viewForHeading('The options walls', have), 'globe', 'gamma is not available here so it falls back'); assert.equal(viewForHeading('Something else entirely', have), 'globe');
});
test('issueScenes: an intro, a scene per section with prose, a close; a table-only issue gives no show; the length is capped', () => {
  const have = new Set(['globe', 'ccy', 'book', 'candles']), sc = issueScenes({ kind: 'desk', date: '2026-11-20', subject: 'Dollar at 19-month high' }, sectionsFromHtml(HTML), have);
  assert.equal(sc[0].id, 'news-intro'); assert.ok(sc[0].text.startsWith('Desk morning note for Friday 20 November')); assert.equal(sc.at(-1).id, 'news-close'); assert.ok(/not advice/.test(sc.at(-1).text));
  assert.ok(sc.slice(1, -1).every(s => s.text.split(/\s+/).length <= 70 && s.view && s.title)); assert.ok(sc.length >= 4);
  assert.deepEqual(issueScenes({ kind: 'desk', date: '2026-11-20' }, [{ level: 2, title: 'Only a table', blocks: [] }], have), []);
  const many = Array.from({ length: 12 }, (_, i) => ({ level: 2, title: `Section ${i}`, blocks: ['A long enough sentence about markets and the desk today. Another sentence follows here.'] }));
  assert.equal(issueScenes({ kind: 'daily', date: '2026-11-20' }, many, have).length, 1 + 6 + 1);
});
test('newestPerKind: one issue per kind, in the picker order, unknown kinds left out', () => {
  const l = newestPerKind([{ kind: 'daily', date: '2026-11-19', id: 'd1' }, { kind: 'desk', date: '2026-11-20', id: 'k1' }, { kind: 'daily', date: '2026-11-18', id: 'd0' }, { kind: 'desk-picto', date: '2026-11-19', id: 'p1' }, { kind: 'desk-terminal', date: '2026-11-19', id: 't1' }]);
  assert.deepEqual(l.map(x => x.id), ['t1', 'k1', 'd1']); assert.ok(KIND_LABEL['desk-terminal']);
});
