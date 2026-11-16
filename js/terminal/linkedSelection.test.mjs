// js/terminal/linkedSelection.test.mjs: linked selection over a stand-in DOM (js/terminal/feelFakeDom.fixtures.mjs). This proves the wiring (what is
// written, who follows, what the chip says, that unlinking stops it); it does NOT prove how it looks or feels in a real browser.
// node --test js/terminal/linkedSelection.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin, memStore } from './feelFakeDom.fixtures.mjs';
import { createSelection } from './selectionCore.js';

globalThis.localStorage = memStore();
const { mountLinked } = await import('./linkedSelection.js');

function setup({ tab = 'overview' } = {}) {
  const doc = makePage(), win = makeWin(doc);
  for (const b of doc.querySelectorAll('#tabs [data-t]')) b.attrs['aria-selected'] = String(b.dataset.t === tab);
  const sel = createSelection({ store: memStore() });
  const m = mountLinked({ doc, win, sel });
  return { doc, win, sel, m, chip: doc.getElementById('linkchip') };
}
const click = (doc, el) => doc.fire('click', el);

test('the chip appears, says "linked", and shows what is picked', () => {
  const { chip, sel } = setup();
  assert.equal(chip.hidden, false); assert.equal(chip.dataset.linked, 'on'); assert.match(chip.textContent, /Linked · nothing picked yet/);
  sel.set({ inst: 'NQ', tf: '15m' }, 'command');
  assert.match(chip.textContent, /Linked: NQ · 15m/);
});

test('picking a market on a card, a vol tile, the pair selector or a pair row is written; the pick rings that market\'s cards', () => {
  const { doc, sel } = setup({ tab: 'assets' });
  click(doc, doc.getElementById('card-gold'));
  assert.equal(sel.get().inst, 'GOLD');
  assert.ok(doc.getElementById('card-gold').hasAttribute('data-lk-hit')); assert.ok(!doc.getElementById('card-nq').hasAttribute('data-lk-hit'));
  click(doc, doc.getElementById('vc-nq'));
  assert.equal(sel.get().inst, 'NQ');
  assert.ok(doc.getElementById('card-nq').hasAttribute('data-lk-hit') && doc.getElementById('vc-nq').hasAttribute('data-lk-hit'), 'the card AND the vol tile of NQ');
  assert.ok(!doc.getElementById('card-gold').hasAttribute('data-lk-hit'));
  click(doc, doc.getElementById('pq-gbp')); assert.equal(sel.get().inst, 'GBPUSD');
  click(doc, doc.getElementById('pair-row')); assert.equal(sel.get().inst, 'NQ');
  const s = doc.getElementById('tt-sel'); s.value = 'EURUSD'; doc.fire('change', s); assert.equal(sel.get().inst, 'EURUSD');
  const r = doc.getElementById('rp-inst'); r.value = 'SPX500'; doc.fire('change', r); assert.equal(sel.get().inst, 'SPX500');
  const d = doc.getElementById('rp-date'); d.value = '2026-11-10'; doc.fire('change', d); assert.equal(sel.get().date, '2026-11-10');
});

test('an unknown market (not one the desk covers) is never written', () => {
  const { doc, sel } = setup();
  const s = doc.getElementById('tt-sel'); s.value = 'FOOBAR'; doc.fire('change', s);
  assert.equal(sel.get().inst, undefined);
});

test('the strength board rings the two currencies of an FX market, and none for a non-FX market', () => {
  const { doc, sel } = setup();
  sel.set({ inst: 'EURUSD' }, 'command');
  const on = doc.querySelectorAll('.cs-row').filter(e => e.hasAttribute('data-lk-leg')).map(e => e.dataset.ccy).sort();
  assert.deepEqual(on, ['EUR', 'USD']);
  sel.set({ inst: 'NQ' }, 'command');
  assert.equal(doc.querySelectorAll('.cs-row').filter(e => e.hasAttribute('data-lk-leg')).length, 0);
});

test('a command that picks a market moves the Pair page when it is on screen, once, and the Pair opener remembers its market', () => {
  const { doc, win, sel } = setup({ tab: 'pair' });
  doc.getElementById('tt-sel').value = 'EURUSD';
  sel.set({ inst: 'NQ' }, 'command');
  assert.deepEqual(win.calls.pair, ['NQ'], 'followed exactly once');
  assert.equal(doc.getElementById('tt-sel').value, 'NQ');
  win.calls.pair.length = 0;
  win.openPairPage('GOLD');   // any link on the page that opens a pair
  assert.equal(sel.get().inst, 'GOLD'); assert.deepEqual(win.calls.pair, ['GOLD'], 'the wrapper passes through once, no double open');
});

test('opening the Pair tab adopts the shared market', () => {
  const { doc, win, sel } = setup({ tab: 'overview' });
  sel.set({ inst: 'GOLD' }, 'command');
  assert.deepEqual(win.calls.pair, [], 'nothing on screen to move');
  doc.getElementById('tt-sel').value = 'EURUSD';
  click(doc, doc.querySelector('#tabs [data-t="pair"]'));
  win.flush();
  assert.deepEqual(win.calls.pair, ['GOLD']);
});

test('the Replay follows the market and the moment; an unbuilt Replay gets a request left for its build', () => {
  const { doc, win, sel } = setup({ tab: 'replay' });
  const loads = []; doc.getElementById('replay').__rp = { load: (i, t) => loads.push([i, t]) };
  doc.getElementById('rp-inst').value = 'NQ'; doc.getElementById('rp-date').value = '2026-11-12';
  sel.set({ inst: 'GOLD', date: '2026-11-12', ts: Date.parse('2026-11-12T14:30:00Z') }, 'command');
  assert.deepEqual(loads, [['GOLD', Date.parse('2026-11-12T14:30:00Z')]]);
  // not built: opening the tab leaves a request
  const b = setup({ tab: 'overview' });
  b.sel.set({ inst: 'NQ', date: '2026-11-12', ts: 5000 }, 'command');
  click(b.doc, b.doc.querySelector('#tabs [data-t="replay"]'));
  assert.equal(b.win.__replayRequest.inst, 'NQ'); assert.equal(b.win.__replayRequest.ts, 5000);
  // a Replay that is not a market it covers is not asked to load it
  const c = setup({ tab: 'replay' }); const l2 = []; c.doc.getElementById('replay').__rp = { load: (i) => l2.push(i) };
  c.sel.set({ inst: 'GBPJPY' }, 'command'); assert.deepEqual(l2, []);
});

test('openReplay (any board\'s "replay this") is remembered, once, and passed through', () => {
  const { win, sel } = setup();
  win.openReplay('NQ', Date.parse('2026-11-12T09:00:00Z'));
  assert.equal(sel.get().inst, 'NQ'); assert.equal(sel.get().date, '2026-11-12'); assert.equal(win.calls.replay.length, 1);
});

test('a candle size picked on one chart is applied to the others and remembered for the next', () => {
  const { doc, sel } = setup({ tab: 'assets' });
  const pill = t => doc.querySelector(`.tfp-b[data-tf="${t}"]`);
  click(doc, pill('15m'));
  assert.equal(sel.get().tf, '15m');
  sel.set({ tf: '4h' }, 'command');
  assert.equal(pill('4h').clicks, 1, 'the open chart\'s 4h pill was pressed');
  assert.equal(globalThis.localStorage.getItem('deskTf:pair'), '4h'); assert.equal(globalThis.localStorage.getItem('deskTf:asset'), '4h');
});

test('unlinked: the chip says so, picks are not written, rings go, and nothing moves; linking again adopts the shared market', () => {
  const { doc, win, sel, chip } = setup({ tab: 'pair' });
  sel.set({ inst: 'NQ' }, 'command'); doc.getElementById('tt-sel').value = 'NQ'; win.calls.pair.length = 0;
  click(doc, chip);
  assert.equal(sel.linked(), false); assert.equal(chip.dataset.linked, 'off'); assert.match(chip.textContent, /Link off/);
  click(doc, doc.getElementById('pq-gbp')); assert.equal(sel.get().inst, 'NQ', 'an unlinked pick is not shared');
  sel.set({ inst: 'GOLD' }, 'command'); assert.deepEqual(win.calls.pair, [], 'an unlinked Pair page does not follow');
  assert.equal(doc.querySelectorAll('[data-lk-hit]').length, 0);
  click(doc, chip);
  assert.equal(sel.linked(), true); assert.deepEqual(win.calls.pair, ['GOLD'], 'linking again adopts the shared market');
});

test('destroy puts the page back: wrappers, chip, rings, listeners', () => {
  const { doc, win, sel, m } = setup({ tab: 'assets' });
  const wrappedPair = win.openPairPage; sel.set({ inst: 'NQ' }, 'command');
  m.destroy();
  assert.notEqual(win.openPairPage, wrappedPair); assert.equal(doc.getElementById('linkchip').hidden, true);
  assert.equal(doc.querySelectorAll('[data-lk-hit]').length, 0); assert.equal(win.deskSelection, undefined);
  click(doc, doc.getElementById('card-gold')); assert.equal(sel.get().inst, 'NQ', 'no longer listening');
});

test('a ? button sits beside the chip and opens a plain-words popover: what it does, what the chip shows, how to unlink, where it is kept; Esc closes it', () => {
  const { doc, chip } = setup();
  const help = doc.getElementById('linkhelp'), pop = doc.getElementById('lk-pop');
  assert.ok(help && pop, 'the ? and its popover are mounted'); assert.equal(help.nextSibling === null || true, true);
  assert.equal(chip.nextSibling, help, 'the ? sits right after the chip');
  assert.equal(pop.hidden, true); assert.equal(help.getAttribute('aria-expanded'), 'false'); assert.equal(help.getAttribute('aria-controls'), 'lk-pop');
  assert.ok(help.getAttribute('aria-label') && help.title, 'a label and a hover title');
  click(doc, help);
  assert.equal(pop.hidden, false); assert.equal(help.getAttribute('aria-expanded'), 'true');
  const t = pop.textContent;
  for (const w of ['What it does', 'What the chip shows', 'Turning it off', 'Where it is kept', 'LINK OFF', 'LINK ON', 'only in this browser', 'Pair page', 'strength board', 'candle-size', 'vol clock', 'each panel keeps the market']) assert.ok(t.toLowerCase().includes(w.toLowerCase()), `the help says "${w}"`);
  assert.match(t, /Linked, but no market has been picked yet/);
  doc.fire('keydown', doc.body, { key: 'Escape' });
  assert.equal(pop.hidden, true); assert.equal(help.getAttribute('aria-expanded'), 'false'); assert.equal(help.focused, true, 'focus goes back to the ?');
});

test('the popover follows the state, its button turns the link off and on, a click elsewhere closes it, and it is removed on destroy', () => {
  const { doc, sel, m } = setup();
  const help = doc.getElementById('linkhelp'), pop = doc.getElementById('lk-pop');
  sel.set({ inst: 'GOLD' }, 'command'); click(doc, help);
  assert.match(pop.textContent, /Linked, sharing GOLD/);
  click(doc, pop.querySelector('[data-lk-toggle]'));
  assert.equal(sel.linked(), false); assert.match(pop.textContent, /Link off: every panel uses its own market/); assert.match(pop.textContent, /Turn the link on/);
  click(doc, pop.querySelector('[data-lk-toggle]')); assert.equal(sel.linked(), true);
  click(doc, doc.body); assert.equal(pop.hidden, true, 'a click outside closes it');
  m.destroy(); assert.equal(doc.getElementById('linkhelp'), null); assert.equal(doc.getElementById('lk-pop'), null);
});

test('the glow rings say what they are on hover ("Linked to GOLD") and the titles go when the link goes', () => {
  const { doc, sel, chip } = setup({ tab: 'assets' });
  click(doc, doc.getElementById('card-gold'));
  assert.equal(doc.getElementById('card-gold').getAttribute('title'), 'Linked to GOLD');
  sel.set({ inst: 'NQ' }, 'command');
  assert.equal(doc.getElementById('card-gold').getAttribute('title'), null, 'the old ring loses its title');
  assert.equal(doc.getElementById('card-nq').getAttribute('title'), 'Linked to NQ');
  click(doc, chip);
  assert.equal(doc.getElementById('card-nq').getAttribute('title'), null, 'unlinking takes the titles away');
});
