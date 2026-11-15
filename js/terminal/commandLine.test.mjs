// js/terminal/commandLine.test.mjs: the command line box over a stand-in DOM (js/terminal/feelFakeDom.fixtures.mjs): opening, keys, matching, running,
// the "?" list, history. It does NOT prove the look (themes, phone width) or the feel in a real browser.
// node --test js/terminal/commandLine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin, memStore } from './feelFakeDom.fixtures.mjs';
import { buildCommands } from './commandCore.js';

globalThis.localStorage = memStore();
const { mountCommandLine, perform, loadRecent, saveRecent } = await import('./commandLine.js');

function setup(opts = {}) {
  const doc = makePage(), win = makeWin(doc);
  const m = mountCommandLine({ doc, win, isOn: opts.isOn ?? (() => true), now: () => Date.parse('2026-11-15T12:00:00Z') });
  return { doc, win, m, back: doc.getElementById('cmdk-back'), input: doc.getElementById('cmdk-input') };
}
const press = (doc, key, target, extra = {}) => doc.fire('keydown', target ?? doc.body, { key, ...extra });
const type = (doc, input, text) => { input.value = text; doc.fire('input', input); };

test('mounting reveals the launcher button; / opens the box, focuses the input and shows suggestions', () => {
  const { doc, back, input } = setup();
  assert.equal(doc.getElementById('cmdbtn').hidden, false); assert.equal(back.hidden, true);
  const e = press(doc, '/');
  assert.equal(e.defaultPrevented, true); assert.equal(back.hidden, false); assert.equal(input.focused, true);
  assert.ok(doc.querySelectorAll('.cmdk-opt').length >= 4, 'suggestions on an empty line');
  assert.match(doc.getElementById('cmdk-main').textContent, /EURUSD|FED/);
});

test('the backtick and Ctrl+K open it too; the keys are ignored while typing in a box and with other modifiers', () => {
  const { doc, back } = setup();
  press(doc, '`'); assert.equal(back.hidden, false); press(doc, 'Escape', doc.getElementById('cmdk-input')); assert.equal(back.hidden, true);
  press(doc, 'k', doc.body, { ctrlKey: true }); assert.equal(back.hidden, false); back.hidden = true;
  const box = doc.getElementById('rp-date'); doc.activeElement = box;
  const e = press(doc, '/', box); assert.equal(e.defaultPrevented, false); assert.equal(back.hidden, true, 'typing a / in a field does not open it');
  doc.activeElement = doc.body; press(doc, '/', doc.body, { ctrlKey: true }); assert.equal(back.hidden, true);
  press(doc, 'a'); assert.equal(back.hidden, true);
});

test('typing shows matches with their help, an example and where it opens', () => {
  const { doc, input } = setup(); press(doc, '/');
  type(doc, input, 'fed');
  const main = doc.getElementById('cmdk-main').textContent;
  assert.match(main, /FED/); assert.match(main, /Fed path/i); assert.match(main, /Opens/); assert.match(main, /Example/); assert.match(main, /Macro ›/);
  assert.equal(doc.querySelector('.cmdk-opt').getAttribute('aria-selected'), 'true');
  assert.equal(input.getAttribute('aria-activedescendant'), 'cmdk-o0');
});

test('Enter does the chosen command and closes: FED opens the board, REPLAY NQ 12 NOV opens the Replay, a market opens its Pair page', () => {
  const { doc, win, back, input } = setup();
  press(doc, '/'); type(doc, input, 'fed'); press(doc, 'Enter', input);
  assert.deepEqual(win.calls.macro, ['panel.macro.fedyields']); assert.equal(back.hidden, true);
  press(doc, '/'); type(doc, input, 'replay nq 12 nov'); assert.match(doc.getElementById('cmdk-main').textContent, /Will do/); press(doc, 'Enter', input);
  assert.equal(win.calls.replay.length, 1); assert.equal(win.calls.replay[0][0], 'NQ');
  press(doc, '/'); type(doc, input, 'gold'); press(doc, 'Enter', input);
  assert.deepEqual(win.calls.pair, ['GOLD']);
  press(doc, '/'); type(doc, input, 'cpi us'); press(doc, 'Enter', input);
  assert.deepEqual(win.calls.macro.at(-1), 'panel.macro.engines'); win.flush(); assert.deepEqual(win.calls.modal, ['USD']);
});

test('a tab command clicks the tab; a section command sets the Macro hash', () => {
  const { doc, win, input } = setup();
  press(doc, '/'); type(doc, input, 'assets'); press(doc, 'Enter', input);
  assert.equal(doc.querySelector('#tabs [data-t="assets"]').getAttribute('aria-selected'), 'true');
  press(doc, '/'); type(doc, input, 'macro rates'); press(doc, 'Enter', input);
  assert.equal(win.location.hash, '#macro/rates'); assert.equal(doc.querySelector('#tabs [data-t="macro"]').getAttribute('aria-selected'), 'true');
});

test('arrows move the choice and wrap; Escape closes and nothing runs; a click on an option runs it', () => {
  const { doc, win, back, input } = setup();
  press(doc, '/'); type(doc, input, 'eur');
  const n = doc.querySelectorAll('.cmdk-opt').length; assert.ok(n >= 3);
  press(doc, 'ArrowDown', input); assert.equal(doc.querySelector('#cmdk-o1').getAttribute('aria-selected'), 'true');
  press(doc, 'ArrowUp', input); press(doc, 'ArrowUp', input); assert.equal(doc.querySelector(`#cmdk-o${n - 1}`).getAttribute('aria-selected'), 'true', 'wraps to the last');
  press(doc, 'Escape', input); assert.equal(back.hidden, true); assert.equal(win.calls.pair.length, 0);
  press(doc, '/'); type(doc, input, 'eur'); doc.fire('click', doc.querySelector('#cmdk-o1')); assert.equal(win.calls.pair.length, 1);
});

test('an error is shown in words and nothing runs', () => {
  const { doc, win, back, input } = setup();
  press(doc, '/'); type(doc, input, 'replay xyz');
  assert.match(doc.getElementById('cmdk-main').textContent, /not a market I know/);
  press(doc, 'Enter', input); assert.equal(win.calls.replay.length, 0); assert.equal(back.hidden, false, 'the box stays open so you can fix it');
  type(doc, input, 'qqqqqqqq'); assert.match(doc.getElementById('cmdk-main').textContent, /Nothing matches/);
});

test('? lists EVERY command with its help and an example; clicking an example types it', () => {
  const { doc, input } = setup(); press(doc, '/'); type(doc, input, '?');
  const all = buildCommands({ now: () => Date.parse('2026-11-15T12:00:00Z') });
  const fills = doc.querySelectorAll('[data-fill]'); assert.equal(fills.length, all.length);
  const main = doc.getElementById('cmdk-main').textContent;
  for (const c of all.slice(0, 40)) { assert.ok(main.includes(c.name), `${c.name} is listed`); }
  doc.fire('click', fills.find(f => f.attrs['data-fill'] === 'replay nq 12 nov') ?? fills[0]);
  assert.notEqual(input.value, '?'); assert.ok(doc.querySelectorAll('.cmdk-opt').length >= 1);
});

test('a session that cannot see a surface is not offered its command', () => {
  const { doc, input } = setup({ isOn: id => id !== 'tab.pair' && id !== 'tab.macro' });
  press(doc, '/'); type(doc, input, 'eurusd'); assert.match(doc.getElementById('cmdk-main').textContent, /Nothing matches/);
  type(doc, input, 'fed'); assert.doesNotMatch(doc.getElementById('cmdk-main').textContent, /Fed path against/);
});

test('history: the last commands are suggested first, deduplicated, capped, and a blocked store is fine', () => {
  const s = memStore();
  for (const l of ['a', 'b', 'a', 'c', 'd', 'e', 'f', 'g']) saveRecent(l, s);
  assert.deepEqual(loadRecent(s), ['g', 'f', 'e', 'd', 'c', 'a']);
  assert.doesNotThrow(() => saveRecent('x', { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } }));
  assert.deepEqual(loadRecent({ getItem() { throw new Error('no'); } }), []);
  s.setItem('deskCmdRecent', '{"not":"an array"}'); assert.deepEqual(loadRecent(s), []);
  const { doc, input } = setup(); localStorage.setItem('deskCmdRecent', JSON.stringify(['gold'])); press(doc, '/');
  assert.match(doc.querySelector('.cmdk-opt .nm').textContent, /gold/i); void input;
});

test('perform(): the page\'s own hooks are used; a missing hook or a hidden tab does nothing and says so', () => {
  const doc = makePage(), win = makeWin(doc);
  assert.equal(perform({ kind: 'pair', inst: 'NQ' }, doc, win), true); assert.deepEqual(win.calls.pair, ['NQ']);
  assert.equal(perform({ kind: 'replay', inst: 'NQ', ts: 5 }, doc, win), true); assert.deepEqual(win.calls.replay, [['NQ', 5]]);
  assert.equal(perform({ kind: 'macro', block: 'panel.macro.curve' }, doc, win), true);
  assert.equal(perform({ kind: 'tab', t: 'nonexistent' }, doc, win), false);
  doc.querySelector('#tabs [data-t="replay"]').hidden = true; assert.equal(perform({ kind: 'tab', t: 'replay' }, doc, win), false, 'a hidden tab is not opened');
  assert.equal(perform({ kind: 'tf', tf: '5m' }, doc, win), false, 'no linked selection mounted: nothing to set');
  win.deskSelection = { set(p) { this.p = p; }, setLinked(v) { this.v = v; } };
  assert.equal(perform({ kind: 'tf', tf: '5m' }, doc, win), true); assert.deepEqual(win.deskSelection.p, { tf: '5m' });
  assert.equal(perform({ kind: 'link', on: false }, doc, win), true); assert.equal(win.deskSelection.v, false);
  assert.equal(perform(null, doc, win), false); assert.equal(perform({ kind: 'bogus' }, doc, win), false);
  const bare = makeWin(doc, { openPairPage: undefined, openReplay: undefined, openMacroBoard: undefined });
  assert.equal(perform({ kind: 'pair', inst: 'NQ' }, doc, bare), false); assert.equal(perform({ kind: 'replay', inst: 'NQ', ts: null }, doc, bare), false);
});

test('mounting twice does not double the box; destroy removes the box, the key handler and the button', () => {
  const { doc, win, m, back } = setup();
  assert.equal(mountCommandLine({ doc, win }), null);
  m.destroy(); assert.equal(doc.getElementById('cmdk-back'), null); assert.equal(doc.getElementById('cmdbtn').hidden, true);
  press(doc, '/'); assert.equal(doc.getElementById('cmdk-back'), null, 'no handler left'); void back;
});
