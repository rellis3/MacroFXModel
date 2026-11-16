// js/terminal/favourites.test.mjs: Pair favourites: the list, its storage, copy/paste, the filter, the controls' markup and wiring, the commands,
// and the Monitor default. Stand-in storage and a tiny fake root: it proves the logic and the markup, not how it looks in a browser.
// node --test js/terminal/favourites.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFavourites, cleanList, parsePaste, KEY, FILTER_KEY, MAX, getFavourites } from './favourites.js';
import { starHtml, pillHtml, toolsHtml, wireFavourites } from './favouritesView.js';
import { createMonitorState, FAV_MONITOR } from './monitorState.js';
import { buildCommands } from './commandCore.js';
import { perform } from './commandLine.js';

const mem = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('cleanList keeps known markets only, upper-cased, no repeats; unknown names are reported', () => {
  const r = cleanList(['eurusd', 'EURUSD', 'gold', 'nope', '', null, 'nq']);
  assert.deepEqual(r.items, ['EURUSD', 'GOLD', 'NQ']); assert.deepEqual(r.dropped, ['NOPE']);
});

test('star, unstar, toggle: order is the order starred; unknown markets are refused in words', () => {
  const f = createFavourites({ store: mem() });
  assert.equal(f.add('gold').ok, true); assert.equal(f.add('eurusd').ok, true);
  assert.deepEqual(f.list(), ['GOLD', 'EURUSD']); assert.equal(f.has('gold'), true);
  assert.equal(f.add('GOLD').already, true); assert.equal(f.list().length, 2);
  assert.match(f.add('zzz').error, /not a market/);
  f.toggle('gold'); assert.deepEqual(f.list(), ['EURUSD']); f.toggle('nq'); assert.deepEqual(f.list(), ['EURUSD', 'NQ']);
  assert.equal(f.remove('gold').already, true);
});

test('the list is remembered in this browser and a corrupt or blocked store never throws', () => {
  const store = mem(); const a = createFavourites({ store }); a.add('gold'); a.add('nq'); a.setOnly(true);
  assert.deepEqual(JSON.parse(store._m[KEY]), ['GOLD', 'NQ']); assert.equal(store._m[FILTER_KEY], '1');
  const b = createFavourites({ store }); assert.deepEqual(b.list(), ['GOLD', 'NQ']); assert.equal(b.only, true);
  assert.deepEqual(createFavourites({ store: mem({ [KEY]: '{not json' }) }).list(), []);
  assert.deepEqual(createFavourites({ store: mem({ [KEY]: JSON.stringify(['gold', 'bogus']) }) }).list(), ['GOLD']);
  const t = createFavourites({ store: throwing }); assert.equal(t.add('gold').ok, true); assert.deepEqual(t.list(), ['GOLD']);
  assert.deepEqual(createFavourites({ store: null }).list(), []);
});

test('the filter on an empty list is treated as off (it would show nothing); clear switches it off', () => {
  const f = createFavourites({ store: mem() });
  f.setOnly(true); assert.equal(f.only, false);
  f.add('gold'); assert.equal(f.only, true);
  f.clear(); assert.equal(f.count, 0); assert.equal(f.only, false);
});

test('at most MAX favourites', () => {
  const f = createFavourites({ store: mem(), known: () => true });
  for (let i = 0; i < MAX + 5; i++) f.add(`X${i}`);
  assert.equal(f.count, MAX); assert.match(f.add('ONEMORE').error, /At most/);
});

test('copy then paste on another browser gives the same list; messy paste is tolerated; nothing valid leaves the list alone', () => {
  const a = createFavourites({ store: mem() }); ['gold', 'eurusd', 'nq'].forEach(w => a.add(w));
  const text = a.copyText(); assert.equal(text, 'FAVOURITES: GOLD,EURUSD,NQ');
  const b = createFavourites({ store: mem() }); const r = b.paste(text); assert.equal(r.ok, true); assert.deepEqual(b.list(), a.list());
  assert.deepEqual(parsePaste('gold nq; eurusd\nbogus').items, ['GOLD', 'NQ', 'EURUSD']);
  const c = createFavourites({ store: mem() }); c.add('nq');
  const bad = c.paste('hello world'); assert.equal(bad.ok, false); assert.deepEqual(c.list(), ['NQ']);
  const some = c.paste('gold, bogus'); assert.match(some.message, /1 market loaded; 1 not on this terminal/);
});

test('markup: the star is a real button with aria-pressed and a label that says what it does; the pill carries the count', () => {
  const off = starHtml('GOLD', false, 'Gold'), on = starHtml('GOLD', true, 'Gold');
  assert.match(off, /<button type="button"[^>]*aria-pressed="false"[^>]*aria-label="Add Gold to favourites"/);
  assert.match(on, /aria-pressed="true"[^>]*aria-label="Remove Gold from favourites"/);
  assert.match(off, /data-surface="panel\.pair\.favourites"/);
  assert.match(pillHtml(3, true), /aria-pressed="true"[\s\S]*Favourites <b>3<\/b>/);
  assert.match(pillHtml(0, false), /aria-disabled="true"/);
  assert.match(toolsHtml({ count: 0 }), /none yet[\s\S]*data-fav-act="copy" disabled/);
  assert.ok(!starHtml('A"<b>', false).includes('"<b>'), 'a market name is escaped');
});

function fakeRoot(parts) {
  const handlers = [];
  const root = { dataset: {}, addEventListener: (t, fn) => handlers.push(fn), querySelector: s => parts[s] ?? null, querySelectorAll: () => [] };
  const click = attrs => handlers[0]({ target: { closest: sel => (attrs[sel] ? { dataset: attrs[sel] } : null) }, preventDefault() {}, stopPropagation() {} });
  return { root, click, handlers };
}
test('wiring: a star toggles and repaints; the pill filters; Clear all asks first; a second wire reuses the latest repaint', async () => {
  const f = createFavourites({ store: mem() }); const calls = [];
  const msg = { textContent: '' }; const { root, click, handlers } = fakeRoot({ '.fav-msg': msg });
  wireFavourites(root, f, { repaint: () => calls.push('old'), win: { confirm: () => true } });
  wireFavourites(root, f, { repaint: () => calls.push('new'), win: { confirm: () => true } });
  assert.equal(handlers.length, 1, 'wired once');
  await click({ '[data-fav-star]': { favStar: 'GOLD' } }); assert.equal(f.has('gold'), true); assert.deepEqual(calls, ['new']);
  await click({ '[data-fav-filter]': {} }); assert.equal(f.only, true);
  await click({ '[data-fav-star]': { favStar: 'GOLD' } }); assert.equal(f.only, false, 'unstarring the last one switches the filter off');
  await click({ '[data-fav-filter]': {} }); assert.match(msg.textContent, /Star a market first/);
  f.add('nq'); await click({ '[data-fav-act]': { favAct: 'clear' } }); assert.equal(f.count, 0);
});
test('wiring: Clear all does nothing when the person says no', async () => {
  const f = createFavourites({ store: mem() }); f.add('gold');
  const { root, click } = fakeRoot({ '.fav-msg': { textContent: '' } });
  wireFavourites(root, f, { repaint() {}, win: { confirm: () => false } });
  await click({ '[data-fav-act]': { favAct: 'clear' } }); assert.equal(f.count, 1);
});

test('commands: FAV, STAR and UNSTAR have help, an example and a registered surface; they act on the shared list', () => {
  const cmds = buildCommands({}); const by = id => cmds.find(c => c.id === id);
  for (const id of ['fav.show', 'fav.star', 'fav.unstar']) { const c = by(id); assert.ok(c, id); assert.ok(c.help.length > 20 && c.example && c.opens, `${id} has its words`); assert.equal(c.surface, id === 'fav.show' ? 'panel.asset.favourites' : 'panel.pair.favourites'); }
  const star = by('fav.star').run('gold'); assert.deepEqual(star.action, { kind: 'star', inst: 'GOLD' });
  assert.match(by('fav.star').run('').error, /Say which market/); assert.match(by('fav.unstar').run('zzz').error, /not a market/);
  const f = createFavourites({ store: mem() }); let refreshed = 0;
  const win = { deskFavourites: f, deskFavouritesRefresh: () => { refreshed++; }, setTimeout: fn => fn() };
  const doc = { querySelector: () => ({ hidden: false, getAttribute: () => 'true', click() {} }) };
  assert.equal(perform(star.action, doc, win), true); assert.deepEqual(f.list(), ['GOLD']);
  assert.equal(perform({ kind: 'unstar', inst: 'GOLD' }, doc, win), true); assert.deepEqual(f.list(), []);
  f.add('nq'); assert.equal(perform({ kind: 'fav', on: true }, doc, win), true); assert.equal(f.assetsOnly, true, 'FAV turns on the Assets tab filter'); assert.equal(f.only, false, 'and leaves the Pair filter alone'); assert.ok(refreshed >= 2);
  assert.equal(perform({ kind: 'star', inst: 'GOLD' }, doc, {}), false, 'no list on the page: reports it did nothing');
});
test('commands: with the surface switched off the three words are gone (a registry switch hides the whole feature)', () => {
  const cmds = buildCommands({ isOn: id => id !== 'panel.pair.favourites' && id !== 'panel.asset.favourites' });
  assert.ok(!cmds.some(c => c.id.startsWith('fav.')));
});

test('Monitor: a browser with no monitor yet starts from the starred markets; a saved local monitor is left alone; "My favourites" can be picked', async () => {
  const api = { list: async () => ({ ok: true, lists: [] }), post: async () => ({ ok: true }) };
  const fav = ['GOLD', 'NQ', 'bogus'];
  const s1 = await createMonitorState({ api, store: mem(), favourites: () => fav }).init();
  assert.equal(s1.current.name, FAV_MONITOR); assert.deepEqual(s1.current.items, ['GOLD', 'NQ']); assert.equal(s1.current.source, 'new');
  const local = mem({ 'deskMonitor:v1': JSON.stringify({ name: 'FX majors', source: 'starter', items: ['EURUSD'], dirty: false }) });
  const s2 = await createMonitorState({ api, store: local, favourites: () => fav }).init(); assert.deepEqual(s2.current.items, ['EURUSD']);
  const s3 = await createMonitorState({ api, store: mem() }).init(); assert.equal(s3.current.name, 'FX majors', 'no favourites option: unchanged');
  const s4 = await createMonitorState({ api, store: mem(), favourites: () => [] }).init(); assert.equal(s4.current.name, 'FX majors', 'no stars: unchanged');
  assert.equal(s2.load('my fav').ok, true); assert.equal(s2.current.name, FAV_MONITOR);
  assert.deepEqual(s2.favouriteItems(), ['GOLD', 'NQ']);
});

test('getFavourites makes one shared instance on the window object', () => {
  const win = { localStorage: mem() }; const a = getFavourites(win); assert.equal(getFavourites(win), a); assert.equal(win.deskFavourites, a);
});
