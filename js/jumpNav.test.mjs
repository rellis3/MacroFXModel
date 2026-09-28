import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS, items, activeId, isVisible } from './jumpNav.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

/** A document stand-in: ids in a fixed order, each with a display and an offsetTop. */
function doc(spec) {
  const order = spec.map(s => s.id);
  const make = s => ({
    id: s.id, style: { display: s.display ?? '' }, offsetTop: s.top ?? 0,
    parentElement: s.parentHidden ? { nodeType: 1, style: { display: 'none' }, parentElement: null } : null,
    nodeType: 1,
    compareDocumentPosition(other) {
      const a = order.indexOf(s.id), b = order.indexOf(other.id);
      return a === b ? 0 : (a < b ? 4 : 2);   // 4 = other FOLLOWS this one
    },
  });
  const els = new Map(spec.map(s => [s.id, make(s)]));
  return { getElementById: id => els.get(id) ?? null };
}

// ── The fixed half must not drift from the page ─────────────────────────────
t('every section in the list actually exists in today.html', () => {
  const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'today.html'), 'utf8');
  const missing = SECTIONS.filter(s => !new RegExp(`id="${s.id}"`).test(html)).map(s => s.id);
  assert.deepEqual(missing, [], `the rail lists sections today.html does not have: ${missing.join(', ')}`);
});

t('labels are short enough for a narrow rail, and each has an icon', () => {
  for (const s of SECTIONS) {
    assert.ok(s.label.length <= 14, `"${s.label}" is too long for the rail`);
    assert.ok(s.icon && [...s.icon].length <= 2, `${s.id} needs a single-glyph icon`);
  }
  assert.equal(new Set(SECTIONS.map(s => s.id)).size, SECTIONS.length, 'duplicate id');
});

// ── Order comes from the DOM, never from the list ───────────────────────────
t('items come back in DOM order, not list order', () => {
  // deliberately the reverse of SECTIONS
  const spec = [...SECTIONS].reverse().map((s, i) => ({ id: s.id, top: i * 100 }));
  const got = items(doc(spec)).map(i => i.id);
  assert.deepEqual(got, spec.map(s => s.id), 'the DOM must decide the order');
  assert.notDeepEqual(got, SECTIONS.map(s => s.id), 'the fixture must actually differ from list order');
});

// ── A section that did not render must not be listed ────────────────────────
t('a section that is absent from the page is left out', () => {
  const got = items(doc([{ id: 'mbrief' }, { id: 'mread' }])).map(i => i.id);
  assert.deepEqual(got, ['mbrief', 'mread']);
});

t('a section hidden with display:none is left out', () => {
  // panels hide themselves when their feed is empty; linking there scrolls nowhere
  const got = items(doc([{ id: 'mbrief' }, { id: 'mread', display: 'none' }, { id: 'weekAhead' }])).map(i => i.id);
  assert.deepEqual(got, ['mbrief', 'weekAhead']);
});

t('a visible section inside a hidden parent is also left out', () => {
  const got = items(doc([{ id: 'mbrief' }, { id: 'mread', parentHidden: true }])).map(i => i.id);
  assert.deepEqual(got, ['mbrief'], 'visibility has to be checked up the tree');
});

t('a computed-style hide is caught too, when a getStyle is supplied', () => {
  const d = doc([{ id: 'mbrief' }, { id: 'mread' }]);
  const got = items(d, { getStyle: el => ({ display: el.id === 'mread' ? 'none' : 'block' }) }).map(i => i.id);
  assert.deepEqual(got, ['mbrief']);
});

t('isVisible tolerates a bare element with no parents', () => {
  assert.equal(isVisible({ nodeType: 1, style: {}, parentElement: null }), true);
  assert.equal(isVisible({ nodeType: 1, style: { display: 'none' }, parentElement: null }), false);
});

// ── Scrollspy ───────────────────────────────────────────────────────────────
const list = [{ id: 'a', el: { offsetTop: 0 } }, { id: 'b', el: { offsetTop: 1000 } }, { id: 'c', el: { offsetTop: 2000 } }];

t('the current section is the last one you have scrolled past', () => {
  assert.equal(activeId(list, 0), 'a');
  assert.equal(activeId(list, 900), 'b', 'the 120px reading line means b is current just before its top');
  assert.equal(activeId(list, 1500), 'b', 'b stays current while you are reading it');
  assert.equal(activeId(list, 1900), 'c');
  assert.equal(activeId(list, 99999), 'c');
});

t('it does not flick to the next section the instant a heading clears the top', () => {
  // at the exact top of b, b is current -- not c
  assert.equal(activeId(list, 1000 - 120), 'b');
  assert.equal(activeId(list, 1000), 'b');
});

t('before scrolling, the first item is current', () => {
  assert.equal(activeId(list, -50), 'a', 'overscroll must not blank the rail');
});

t('degenerate input never throws', () => {
  assert.equal(activeId([], 0), null);
  assert.equal(activeId(null, 0), null);
  assert.deepEqual(items(null), []);
  assert.deepEqual(items({}), []);
});

console.log(`jumpNav: ${n} groups, all passed`);
