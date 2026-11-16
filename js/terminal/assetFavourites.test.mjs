// js/terminal/assetFavourites.test.mjs: favourites on the ASSETS tab: the star on a card, the Favourites filter, the shared list with the Pair tab,
// the remembered filter, the wiring that keeps a star click from opening the card, and the page source that places it all.
// Stand-in storage and a tiny fake root: it proves the logic, the markup and the wiring, not how it looks in a browser.
// node --test js/terminal/assetFavourites.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFavourites, ASSETS_FILTER_KEY, FILTER_KEY, KEY } from './favourites.js';
import { cardStarHtml, pillHtml, countShown, filterOn, applyFilter, emptyHtml, toolsRowHtml, wireAssets, mountAssetFavourites, SURFACE, TEXT_ID } from './assetFavourites.js';

const mem = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
const read = f => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const CARDS = { EURUSD: {}, GOLD: {}, NQ: {}, GBPUSD: {} };
const entries = Object.entries(CARDS);

test('one list for both tabs: a star made through the Assets handler is the Pair tab\'s star, and the two filters are separate switches', () => {
  const f = createFavourites({ store: mem() });
  f.add('gold'); assert.equal(f.has('GOLD'), true);
  f.setAssetsOnly(true); assert.equal(f.assetsOnly, true); assert.equal(f.only, false, 'the Assets filter does not turn the Pair filter on');
  f.setOnly(true); f.setAssetsOnly(false); assert.equal(f.only, true); assert.equal(f.assetsOnly, false, 'and the Pair filter does not turn the Assets one on');
});

test('the Assets filter is remembered in this browser, treated as off while there is nothing starred, and Clear all switches it off', () => {
  const store = mem(); const a = createFavourites({ store }); a.add('gold'); a.add('nq'); a.setAssetsOnly(true);
  assert.equal(store._m[ASSETS_FILTER_KEY], '1'); assert.deepEqual(JSON.parse(store._m[KEY]), ['GOLD', 'NQ']);
  const b = createFavourites({ store }); assert.equal(b.assetsOnly, true); assert.deepEqual(b.list(), ['GOLD', 'NQ']);
  assert.equal(createFavourites({ store: mem({ [ASSETS_FILTER_KEY]: '1' }) }).assetsOnly, false, 'filter stored on but no list: off');
  b.clear(); assert.equal(b.assetsOnly, false); assert.equal(store._m[ASSETS_FILTER_KEY], '0');
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const t = createFavourites({ store: throwing }); t.add('gold'); assert.equal(t.setAssetsOnly(true), true, 'a blocked store still works for the visit');
  assert.ok(FILTER_KEY !== ASSETS_FILTER_KEY);
});

test('card star markup: a real button, pressed state and a label that says what it does, no data-inst (so the card\'s own open handler never claims it)', () => {
  const off = cardStarHtml('GOLD', false, 'Gold'), on = cardStarHtml('GOLD', true, 'Gold');
  for (const h of [off, on]) { assert.match(h, /^<button type="button"/); assert.ok(h.includes(`data-surface="${SURFACE}"`)); assert.ok(h.includes('data-fav-star="GOLD"')); assert.ok(!/data-inst/.test(h)); }
  assert.ok(off.includes('aria-pressed="false"') && off.includes('aria-label="Add Gold to favourites"') && off.includes('☆'));
  assert.ok(on.includes('aria-pressed="true"') && on.includes('aria-label="Remove Gold from favourites"') && on.includes('★'));
  assert.ok(cardStarHtml('A"B', false).includes('A&quot;B'), 'escaped');
});

test('the filter pill shows the count of starred markets that have a card here and says why it does nothing when there are none', () => {
  assert.match(pillHtml(3, true), /aria-pressed="true"/); assert.match(pillHtml(3, true), /<b>3<\/b>/); assert.ok(!/aria-disabled/.test(pillHtml(3, false)));
  assert.match(pillHtml(0, false), /aria-disabled="true"/); assert.match(pillHtml(0, false), /Star a market first/);
  assert.ok(pillHtml(1, false).includes('data-fav-assets-filter') && !pillHtml(1, false).includes('data-fav-filter'), 'its own attribute: the Pair tab pill is never toggled by it');
});

test('filtering: only starred cards, in their order; a favourite without a card is not counted; the filter on nothing is off', () => {
  const f = createFavourites({ store: mem() }); f.add('nq'); f.add('gold'); f.add('usdjpy');
  assert.equal(countShown(f, CARDS), 2, 'USDJPY has no card here');
  assert.deepEqual(applyFilter(entries, f, CARDS).map(e => e[0]), ['EURUSD', 'GOLD', 'NQ', 'GBPUSD'], 'filter off: untouched');
  f.setAssetsOnly(true); assert.equal(filterOn(f, CARDS), true);
  assert.deepEqual(applyFilter(entries, f, CARDS).map(e => e[0]), ['GOLD', 'NQ']);
  const g = createFavourites({ store: mem() }); g.add('usdjpy'); g.setAssetsOnly(true);
  assert.equal(filterOn(g, CARDS), false, 'the only favourite has no card here: show the cards, not a blank tab');
  assert.deepEqual(applyFilter(entries, g, CARDS).length, 4);
  assert.match(emptyHtml('FX majors'), /None of your favourites are in FX majors/); assert.match(emptyHtml(''), /this group/);
});

test('tools row: Copy / Paste / Clear with this tab\'s own ids, so the Pair tab\'s copy of the row never clashes', () => {
  const f = createFavourites({ store: mem() }); f.add('gold');
  const h = toolsRowHtml(f);
  assert.ok(h.includes(`data-surface="${SURFACE}"`) && h.includes(`id="${TEXT_ID}"`) && h.includes(`for="${TEXT_ID}"`));
  assert.ok(!h.includes('id="fav-text"'));
  for (const a of ['copy', 'paste', 'clear', 'load']) assert.ok(h.includes(`data-fav-act="${a}"`), a);
  assert.match(h, /1 starred/);
});

// a tiny fake section: the star and pill buttons the wiring looks for, with the handlers it sets
function fakeRoot(f) {
  const star = { dataset: { favStar: 'GOLD' }, onclick: null, onkeydown: null };
  const pill = { onclick: null };
  const tools = { opened: false, setAttribute(k) { if (k === 'open') this.opened = true; } };
  const msg = { textContent: '' };
  const listeners = {};
  const root = {
    dataset: {}, addEventListener: (t, fn) => { listeners[t] = fn; },
    querySelectorAll: s => (s === '[data-fav-star]' ? [star] : []),
    querySelector: s => (s === '[data-fav-assets-filter]' ? pill : s === '.fav-tools' ? tools : s === '.fav-msg' ? msg : null),
  };
  return { root, star, pill, tools, msg };
}
const ev = () => { const e = { stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } }; return e; };

test('a star click toggles the shared list and STOPS before the card\'s own click; Enter on the star never reaches the card\'s Enter-to-open', () => {
  const f = createFavourites({ store: mem() }); const { root, star } = fakeRoot(f);
  wireAssets(root, f, { win: {} });
  const e = ev(); star.onclick(e); assert.equal(e.stopped, true); assert.equal(e.prevented, true); assert.equal(f.has('GOLD'), true);
  star.onclick(ev()); assert.equal(f.has('GOLD'), false, 'second click removes it');
  const k = ev(); star.onkeydown(k); assert.equal(k.stopped, true);
});

test('the pill turns the Assets filter on and off; with nothing starred it opens the tools row and says what to do instead', () => {
  const f = createFavourites({ store: mem() }); const { root, pill, tools, msg } = fakeRoot(f);
  wireAssets(root, f, { win: {} });
  pill.onclick(); assert.equal(f.assetsOnly, false); assert.equal(tools.opened, true); assert.match(msg.textContent, /Star a market first/);
  f.add('gold'); pill.onclick(); assert.equal(f.assetsOnly, true); pill.onclick(); assert.equal(f.assetsOnly, false);
  assert.equal(f.only, false, 'never the Pair filter');
});

test('mount: any change to the list (a star on the Pair tab, a command, a paste) asks the page to redraw the Assets tab; a switched-off surface renders nothing and filters nothing', () => {
  let redraws = 0;
  const win = { localStorage: mem(), assetFavRefresh: () => { redraws++; }, deskSurfaceOn: () => true };
  const { api, destroy } = mountAssetFavourites({ win });
  assert.equal(win.assetFav, api); assert.equal(api.fav, win.deskFavourites, 'the shared page list');
  api.fav.add('gold'); api.fav.setAssetsOnly(true); api.fav.remove('gold'); assert.equal(redraws, 3);
  assert.match(api.starHtml('GOLD', 'Gold'), /data-fav-star="GOLD"/);
  destroy(); assert.equal(win.assetFav, null); api.fav.add('nq'); assert.equal(redraws, 3, 'unsubscribed');
  const off = { localStorage: mem(), deskSurfaceOn: id => id !== SURFACE };
  const m2 = mountAssetFavourites({ win: off }).api; m2.fav.add('gold'); m2.fav.setAssetsOnly(true);
  assert.equal(m2.starHtml('GOLD'), ''); assert.equal(m2.pillHtml(CARDS), ''); assert.equal(m2.toolsHtml(), ''); assert.equal(m2.on(CARDS), false);
  assert.equal(m2.filter(entries, CARDS).length, 4, 'surface off: every card, favourites ignored');
});

test('the page: the star is in the card header, the filter row carries the pill and tools, and the render wires them', () => {
  const html = read('desk-terminal.html');
  assert.ok(html.includes("globalThis.assetFav?.starHtml(n, nice(n))"), 'star in assetCard header');
  const header = /<span class="r">\$\{full \? '' : \(globalThis\.assetFav\?\.starHtml/.test(html); assert.ok(header, 'only on the grid card, not the full modal card');
  const i = html.indexOf('function assets() {'); const body = html.slice(i, html.indexOf('// ── MACRO ──', i));
  for (const part of ['AF.filter(inGroup, D.cards)', 'AF?.pillHtml(D.cards)', 'AF?.toolsHtml()', 'AF?.wire($(\'assets\'))', 'AF.emptyHtml(GROUPS[assetFilter])']) assert.ok(body.includes(part), part);
  assert.ok(html.includes('globalThis.assetFavRefresh'), 'the list can ask the tab to redraw');
  assert.ok(html.includes('js/terminal/favourites.css'), 'styled by the same sheet as the Pair tab');
  const tabs = read('js/terminal/terminalTabs.js'); assert.ok(tabs.includes('mountAssetFavourites()'));
  const reg = read('js/terminal/tabRegistry.js'); assert.ok(reg.includes("mk('panel.asset.favourites'"), 'registry row');
});
