// js/terminal/deepDive.test.mjs: the Deep dive's section map, hash and words (pure), plus the registry rows and the page wiring.
// node --test js/terminal/deepDive.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEEP_SECTIONS, PAIR_ORDER, CARD_LABELS, LOADING_WORDS, cardSurface, sectionOf, sectionOfCard, deepHash, parseDeepHash } from './deepDive.js';
import { SURFACES } from './tabRegistry.js';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('every one of the 13 Pair cards lives in exactly one section, and the Pair order covers them all', () => {
  const all = DEEP_SECTIONS.flatMap(s => s.cards);
  assert.equal(all.length, 13); assert.equal(new Set(all).size, 13);
  assert.deepEqual([...all].sort(), [...PAIR_ORDER].sort());
  for (const k of PAIR_ORDER) { assert.ok(CARD_LABELS[k], `label for ${k}`); assert.ok(LOADING_WORDS[k], `loading words for ${k}`); assert.ok(sectionOfCard(k)); }
  assert.deepEqual(DEEP_SECTIONS.map(s => s.label), ['Rates and value', 'Positioning and options', 'How it behaves', 'Context']);
});
test('each card has a registered surface id, shown by default (so a desk login keeps seeing it on the Pair page), and the tab is a preview', () => {
  for (const k of PAIR_ORDER) { const r = SURFACES.find(s => s.id === cardSurface(k)); assert.ok(r, `registered ${cardSurface(k)}`); assert.equal(r.hidden, null, `${k} is visible by default`); assert.equal(r.kind, 'panel'); }
  const tab = SURFACES.find(s => s.id === 'tab.deep'); assert.ok(tab); assert.equal(tab.hidden, 'preview'); assert.equal(tab.label, 'Deep dive');
});
test('section words: the key, a friendly word, any case; nothing else', () => {
  assert.equal(sectionOf('rates').key, 'rates'); assert.equal(sectionOf('NEWS').key, 'context'); assert.equal(sectionOf('options').key, 'positioning'); assert.equal(sectionOf('Hours').key, 'behaviour');
  assert.equal(sectionOf('nonsense'), null); assert.equal(sectionOf(''), null); assert.equal(sectionOf(undefined), null);
});
test('hash: #deep=GOLD, #deep=GOLD/rates, #deep/context, and the writer round-trips', () => {
  assert.deepEqual(parseDeepHash('#deep=gold'), { inst: 'GOLD', section: null });
  assert.deepEqual(parseDeepHash('#deep=GOLD/rates'), { inst: 'GOLD', section: 'rates' });
  assert.deepEqual(parseDeepHash('#deep/context'), { inst: null, section: 'context' });
  assert.deepEqual(parseDeepHash('#deep'), { inst: null, section: null });
  assert.deepEqual(parseDeepHash('#deep=GOLD/junk'), { inst: 'GOLD', section: null });
  assert.equal(parseDeepHash('#pair=GOLD'), null); assert.equal(parseDeepHash('#macro/rates'), null); assert.equal(parseDeepHash(''), null);
  assert.equal(deepHash('gold', 'rates'), '#deep=GOLD/rates'); assert.equal(deepHash(null, 'context'), '#deep/context'); assert.equal(deepHash('EURUSD'), '#deep=EURUSD');
  assert.deepEqual(parseDeepHash(deepHash('NQ', 'behaviour')), { inst: 'NQ', section: 'behaviour' });
});
test('the Pair page keeps all 13 cards for a desk login while the Deep dive is a preview; the switch decides where they render', () => {
  const t = read('./terminalTabs.js');
  assert.match(t, /const deepOn = \(\) => !!globalThis\.deskAccessState && !!globalThis\.deskSurfaceOn\?\.\('tab\.deep'\)/, 'unknown access state shows the full Pair page');
  assert.match(t, /\$\{deep \? deepLinksHtml\(n\) : `<div class="tt-grid2" style="margin-top:14px">\$\{deepCardsHtml\(PAIR_ORDER\)\}<\/div>`\}/);
  assert.match(t, /if \(!deep\) loadCards\(n, c, legs, PAIR_ORDER\);/);
  assert.match(t, /RENDER = \{[^}]*deep: renderDeep/);
  assert.match(t, /globalThis\.openDeepPage = openDeep;/);
  assert.match(t, /if \(!deepOn\(\)\) \{ openPair\(inst \?\? T\.pair\); return; \}/, 'with the tab off, a Deep dive request lands on the Pair page, not on a hidden tab');
});
test('the page has the tab button and section, hidden for a desk login by the registry', () => {
  const h = read('../../desk-terminal.html');
  assert.match(h, /data-t="deep" data-surface="tab\.deep"[^>]*>Deep dive<\/button>/);
  assert.match(h, /<section id="deep" hidden data-surface="tab\.deep"><\/section>/);
});

import { buildCommands } from './commandCore.js';
import { perform } from './commandLine.js';
test('command line: DEEP [market] [section] runs only where the tab is on, parses any order, explains a bad word, and performs through openDeepPage', () => {
  const on = buildCommands({ isOn: () => true }), off = buildCommands({ isOn: id => id !== 'tab.deep' });
  const cmd = on.find(c => c.id === 'tab.deep'); assert.ok(cmd, 'present when the tab is on'); assert.ok(!off.find(c => c.id === 'tab.deep'), 'absent for a login that cannot see the tab');
  assert.ok(cmd.help.length > 20 && cmd.example === 'deep gold rates' && /rates\|positioning\|behaviour\|context/.test(cmd.args));
  assert.deepEqual(cmd.run('').action, { kind: 'tab', t: 'deep' });
  assert.deepEqual(cmd.run('gold rates').action, { kind: 'deep', inst: 'GOLD', section: 'rates' });
  assert.deepEqual(cmd.run('news nq').action, { kind: 'deep', inst: 'NQ', section: 'context' }, 'either order');
  assert.deepEqual(cmd.run('hours').action, { kind: 'deep', inst: null, section: 'behaviour' }, 'a section alone keeps the current market');
  assert.match(cmd.run('gold banana').error, /not a market or a section/);
  const calls = [], win = { openDeepPage: (...a) => calls.push(a) };
  assert.equal(perform({ kind: 'deep', inst: 'GOLD', section: 'rates' }, { querySelector: () => null }, win), true);
  assert.deepEqual(calls, [['GOLD', 'rates']]);
});
