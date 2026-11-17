// js/terminal/overviewSections.test.mjs: the Overview pill row over the stand-in DOM (js/terminal/feelFakeDom.fixtures.mjs). It proves the wiring: the map is pinned above the
// pills for every section (with a fold control remembered per browser), only the open section's blocks are on screen, grids that hold only hidden blocks go too, a lone
// visible block takes the row, the choice is remembered, hash links and the hook work, a block off for the session never gets a section, and with the preview not mounted
// nothing changes. The Today-only placement of the glance block and the flag card is css (overview-sections.css, asserted in overviewSubtabs.test.mjs); here the page's attribute
// that css reads is checked. It does NOT prove the look (themes, phone width) or the feel in a real browser: scripts/overview-sections-check.mjs is for that.
// node --test js/terminal/overviewSections.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin, memStore } from './feelFakeDom.fixtures.mjs';
import { mountOverviewSections } from './overviewSections.js';
import { LS_KEY, HERO_LS } from './overviewSubtabs.js';

const BLOCK = (id, body = '<div class="card">x</div>') => `<div class="sfc" data-surface="${id}">${body}</div>`;
// the real Overview's shape: the glance wrapper and the flag card (drawn by their own modules, at the top), the map, the headline, a two-column grid (regime | a column of
// four blocks), a heading and a wire/releases grid, and #xo with the injected blocks
const OVERVIEW = `<div class="rfs-compact" data-rfs-compact data-surface="panel.risk.strip">flags</div><div class="fl-host" data-surface="panel.ov.glance"><div class="fl-glance">glance</div></div>
${BLOCK('panel.ov.hero', '<div class="card hero"><div class="hhead"><span class="lbl">The desk\'s world · 2026-11-16</span><h2>USD strongest, NZD weakest</h2></div></div>')}${BLOCK('panel.ov.book')}${BLOCK('panel.ov.bookintel', '<div id="bkintel">book intel</div>')}
<div class="grid g2" id="g-top">${BLOCK('panel.ov.regime')}<div class="grid" id="g-col">${BLOCK('panel.ov.strength')}${BLOCK('panel.ov.engine')}${BLOCK('panel.ov.exposure')}${BLOCK('panel.ov.record')}</div></div>
${BLOCK('panel.ov.week')}${BLOCK('panel.ov.bestpairs')}<div id="xo">${BLOCK('panel.ov.riskstate')}${BLOCK('panel.ov.em')}${BLOCK('panel.ov.alerts')}${BLOCK('panel.ov.ccystrength')}${BLOCK('panel.ov.priceread')}</div>${BLOCK('panel.ov.dayshape')}
${BLOCK('panel.ov.tradewatch')}${BLOCK('panel.ov.playbooks')}
<div class="sec" id="h-news"><h2>News, releases and risks</h2></div>
<div class="grid g2" id="g-news">${BLOCK('panel.ov.wire')}<div class="grid" id="g-col2">${BLOCK('panel.ov.releases')}${BLOCK('panel.ov.riskwarn')}</div></div>`;

function setup({ isOn = () => true, hash = '', saved = null, hero = null, phone = false } = {}) {
  const doc = makePage();
  doc.getElementById('overview').innerHTML = OVERVIEW;
  const store = memStore(); if (saved) store.setItem(LS_KEY, saved); if (hero) store.setItem(HERO_LS, JSON.stringify(hero));
  const win = makeWin(doc, { deskSurfaceOn: isOn, localStorage: store, location: { hash }, matchMedia: q => ({ matches: phone && /max-width: 700px/.test(q) }), history: { replaceState: (a, b, h) => { win.location.hash = h; } }, redrawn: 0 });
  win.redrawHero = () => { win.redrawn++; };
  const m = mountOverviewSections({ doc, win });
  const sec = doc.getElementById('overview');
  const cls = id => (sec.querySelector(`[data-surface="${id}"]`)?.attrs.class ?? '');
  const shown = id => !cls(id).split(/\s+/).includes('ovs-off');
  const open = () => [...sec.querySelectorAll('.sfc')].filter(e => shown(e.attrs['data-surface'])).map(e => e.attrs['data-surface']);
  return { doc, win, sec, m, store, shown, open, cls };
}
const pressed = (sec, id) => sec.querySelector(`[data-ovsub="${id}"]`)?.attrs['aria-pressed'];
const kids = sec => sec.kids.filter(k => k.tag !== '#text');
const folded = sec => (sec.querySelector('[data-surface="panel.ov.hero"]').attrs.class ?? '').includes('ovs-folded');

test('the pill row follows the map in the page, offers all five sections, and Today is open showing only its blocks; the map is in no section', () => {
  const { sec, shown, open } = setup();
  const order = kids(sec).map(k => k.attrs.class ?? '');
  const iHero = kids(sec).findIndex(k => k.attrs['data-surface'] === 'panel.ov.hero');
  assert.ok(order[iHero - 1].includes('ovs-herobar'), 'the fold bar sits right above the map');
  assert.ok(order[iHero + 1].includes('ovs-pills'), 'the pills come right after the map');
  assert.equal(sec.querySelectorAll('[data-ovsub]').length, 5);
  assert.deepEqual(open().filter(id => id !== 'panel.ov.hero').sort(), ['panel.ov.book', 'panel.ov.regime', 'panel.ov.riskwarn', 'panel.ov.week'].sort());
  assert.equal(shown('panel.ov.hero'), true);
  assert.equal(shown('panel.ov.wire'), false);
  assert.equal(shown('panel.ov.strength'), false);
});

test('with sections on the Overview is a flex column and says which section is open (the css hides the glance and the flag card outside Today from that)', () => {
  const { sec, doc } = setup();
  assert.ok((sec.attrs.class ?? '').split(/\s+/).includes('ovs-on'));
  assert.equal(sec.attrs['data-ovs-sub'], 'today');
  doc.fire('click', sec.querySelector('[data-ovsub="news"]'));
  assert.equal(sec.attrs['data-ovs-sub'], 'news');
  // the glance wrapper and the flag card are not touched by script: they are still in the page (css places and hides them)
  assert.ok(sec.querySelector('.fl-host') && sec.querySelector('.rfs-compact'));
  assert.ok(!(sec.querySelector('.fl-host').attrs.class ?? '').includes('ovs-'), 'no class is put on the glance wrapper by script');
});

test('the map is pinned for every section: never hidden by a section, on every pill', () => {
  const { sec, shown, doc } = setup();
  for (const id of ['today', 'currencies', 'risk', 'news', 'desk']) {
    doc.fire('click', sec.querySelector(`[data-ovsub="${id}"]`));
    assert.equal(shown('panel.ov.hero'), true, `the map is on screen on ${id}`);
    assert.ok(sec.querySelector('.ovs-herobar'), 'the fold bar is there');
  }
});

test('the fold control: a laptop starts open everywhere; Fold shrinks the map to a slim strip with its title; Show brings it back and redraws it; one choice for Today and one for the other four', () => {
  const { sec, doc, store, win } = setup();
  assert.equal(folded(sec), false);
  doc.fire('click', sec.querySelector('[data-ovsub="currencies"]'));
  assert.equal(folded(sec), false);
  doc.fire('click', sec.querySelector('[data-ovs-hero]'));
  assert.equal(folded(sec), true, 'folded on the other four');
  assert.deepEqual(JSON.parse(store.getItem(HERO_LS)), { other: 'folded' });
  const bar = sec.querySelector('.ovs-herobar');
  assert.match(bar.textContent, /USD strongest, NZD weakest/, 'the strip carries the map title');
  assert.match(bar.textContent, /Show map/);
  doc.fire('click', sec.querySelector('[data-ovsub="desk"]'));
  assert.equal(folded(sec), true, 'the same choice on every one of the other four');
  doc.fire('click', sec.querySelector('[data-ovsub="today"]'));
  assert.equal(folded(sec), false, 'Today keeps its own choice (open)');
  doc.fire('click', sec.querySelector('[data-ovsub="news"]'));
  doc.fire('click', sec.querySelector('[data-ovs-hero]'));
  assert.equal(folded(sec), false, 'Show map expands it again');
  win.flush();
  assert.ok(win.redrawn >= 1, 'it was hidden, so the map is drawn again at its real width');
  assert.deepEqual(JSON.parse(store.getItem(HERO_LS)), { other: 'open' });
});

test('on a phone the map starts folded on the other four sections (open on Today) unless the owner expanded it; the choice is remembered on the next visit', () => {
  const a = setup({ phone: true });
  assert.equal(folded(a.sec), false, 'Today is expanded on a phone');
  a.doc.fire('click', a.sec.querySelector('[data-ovsub="risk"]'));
  assert.equal(folded(a.sec), true, 'a phone folds it on Risk and markets');
  assert.match(a.sec.querySelector('.ovs-herobar').textContent, /Show map/);
  a.doc.fire('click', a.sec.querySelector('[data-ovs-hero]'));   // the owner expands it
  assert.equal(folded(a.sec), false);
  const b = setup({ phone: true, saved: 'news', hero: { other: 'open' } });   // the next visit
  assert.equal(folded(b.sec), false, 'the owner expanded it: it stays open');
  const c = setup({ phone: true, saved: 'news', hero: {} });
  assert.equal(folded(c.sec), true);
  const d = setup({ phone: false, saved: 'news', hero: { today: 'folded' } });
  assert.equal(folded(d.sec), false, 'a Today choice does not change the other four');
});

test('choosing a section shows its blocks only, remembers it, and puts it in the address', () => {
  const { sec, win, store, open, doc } = setup();
  doc.fire('click', sec.querySelector('[data-ovsub="currencies"]'));
  assert.deepEqual(open().filter(id => id !== 'panel.ov.hero').sort(), ['panel.ov.ccystrength', 'panel.ov.engine', 'panel.ov.exposure', 'panel.ov.priceread', 'panel.ov.strength'].sort());
  assert.equal(store.getItem(LS_KEY), 'currencies');
  assert.equal(win.location.hash, '#overview/currencies');
  assert.equal(pressed(sec, 'currencies'), 'true');
  assert.equal(pressed(sec, 'today'), 'false');
});

test('a grid that holds only hidden blocks is hidden; a grid left with one visible child takes the whole row', () => {
  const { sec, doc } = setup();
  assert.ok(sec.querySelector('#g-col').attrs.class.includes('ovs-off'));
  assert.ok(sec.querySelector('#g-top').attrs.class.includes('ovs-solo'));
  assert.ok(!sec.querySelector('#g-col2').attrs.class.includes('ovs-off'));
  assert.ok(sec.querySelector('#g-news').attrs.class.includes('ovs-solo'));
  doc.fire('click', sec.querySelector('[data-ovsub="news"]'));
  assert.ok(!sec.querySelector('#g-news').attrs.class.includes('ovs-solo'), 'wire beside releases: two columns again');
  assert.ok(!sec.querySelector('#g-news').attrs.class.includes('ovs-off'));
  doc.fire('click', sec.querySelector('[data-ovsub="risk"]'));
  assert.ok(sec.querySelector('#g-news').attrs.class.includes('ovs-off'), 'nothing of the news grid belongs to Risk and markets');
  assert.ok(sec.querySelector('#g-top').attrs.class.includes('ovs-off'));
});

test('the heading Overview draws between blocks is hidden while sections are on', () => {
  const { sec } = setup();
  assert.ok(sec.querySelector('#h-news').attrs.class.includes('ovs-off'));
});

test('the remembered section opens on the next visit; a #overview/ address wins over it', () => {
  assert.equal(pressed(setup({ saved: 'risk' }).sec, 'risk'), 'true');
  const b = setup({ saved: 'risk', hash: '#overview/desk' });
  assert.equal(pressed(b.sec, 'desk'), 'true');
  assert.ok(b.shown('panel.ov.playbooks') && !b.shown('panel.ov.book'));
});

test('a section whose blocks are all off for the session is not offered; with one section left there is no pill row, no fold bar and nothing is hidden', () => {
  const deskOff = new Set(['panel.ov.record', 'panel.ov.bestpairs', 'panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.alerts']);   // what a desk login does not get
  const a = setup({ isOn: id => !deskOff.has(id) });
  assert.equal(a.sec.querySelectorAll('[data-ovsub]').length, 5, 'The desk keeps book intelligence, so it is still offered');
  const keep = new Set(['panel.ov.book', 'panel.ov.regime', 'panel.ov.week', 'panel.ov.riskwarn', 'panel.ov.hero']);
  const b = setup({ isOn: id => keep.has(id) });
  assert.equal(b.sec.querySelectorAll('.ovs-pills').length, 0, 'one section: no row');
  assert.equal(b.sec.querySelectorAll('.ovs-herobar').length, 0, 'one section: no fold bar');
  assert.ok([...b.sec.querySelectorAll('.sfc, .grid, .sec')].every(e => !(e.attrs.class ?? '').includes('ovs-')), 'one section: nothing carries a hiding class');
  assert.ok(!(b.sec.attrs.class ?? '').includes('ovs-on'), 'and the Overview is not turned into the flex column');
  const c = setup({ isOn: id => !['panel.ov.wire', 'panel.ov.releases'].includes(id) });
  assert.equal(c.sec.querySelector('[data-ovsub="news"]'), null, 'News and events is not offered when both its blocks are off');
});

test('keys: arrows move along the pills, Home and End jump, and the arrow keys are consumed', () => {
  const { sec, doc, open } = setup();
  const pill = id => sec.querySelector(`[data-ovsub="${id}"]`);
  doc.fire('keydown', pill('today'), { key: 'ArrowRight' });
  assert.equal(pressed(sec, 'currencies'), 'true');
  doc.fire('keydown', pill('currencies'), { key: 'End' });
  assert.equal(pressed(sec, 'desk'), 'true');
  doc.fire('keydown', pill('desk'), { key: 'ArrowRight' });
  assert.equal(pressed(sec, 'today'), 'true', 'wraps');
  doc.fire('keydown', pill('today'), { key: 'Home' });
  assert.equal(pressed(sec, 'today'), 'true');
  const e = doc.fire('keydown', pill('today'), { key: 'ArrowLeft' });
  assert.equal(e.defaultPrevented, true);
  assert.equal(pressed(sec, 'desk'), 'true');
  assert.ok(open().includes('panel.ov.playbooks'));
});

test('the hook: openOverviewSection takes a section id or a block id, and opens the Overview tab first', () => {
  const { win, sec, doc, open } = setup();
  const tab = doc.querySelector('#tabs [data-t="overview"]'); tab.attrs['aria-selected'] = 'false';
  assert.equal(win.openOverviewSection('news'), true);
  assert.equal(tab.attrs['aria-selected'], 'true', 'the tab was opened');
  assert.ok(open().includes('panel.ov.wire'));
  assert.equal(win.openOverviewSection('priceread'), true);
  assert.ok(open().includes('panel.ov.priceread') && !open().includes('panel.ov.wire'));
  assert.equal(win.openOverviewSection('panel.ov.dayshape'), true);
  assert.ok(open().includes('panel.ov.dayshape'));
  assert.equal(win.openOverviewSection('nonsense'), false);
  assert.ok(sec.querySelector('.ovs-pills'));
});

test('applying twice changes nothing (so the mutation observer settles); destroy puts everything back', () => {
  const { sec, win, m } = setup();
  const classes = () => JSON.stringify([...sec.querySelectorAll('.sfc, .grid, .sec, .ovs-pills, .ovs-herobar')].map(e => e.attrs.class)) + sec.attrs.class + sec.attrs['data-ovs-sub'];
  const snapshot = classes();
  win.deskOverviewSections.show('today'); win.deskOverviewSections.show('today');
  assert.equal(classes(), snapshot);
  m.destroy();
  assert.equal(sec.querySelectorAll('.ovs-pills').length, 0);
  assert.equal(sec.querySelectorAll('.ovs-herobar').length, 0);
  assert.ok([...sec.querySelectorAll('.sfc, .grid, .sec')].every(e => !(e.attrs.class ?? '').includes('ovs-')));
  assert.ok(!(sec.attrs.class ?? '').includes('ovs-on'));
  assert.equal(sec.attrs['data-ovs-sub'], undefined);
});

test('with the preview not mounted the Overview is untouched: no pills, no fold bar, no classes', () => {
  const doc = makePage(); doc.getElementById('overview').innerHTML = OVERVIEW;
  const sec = doc.getElementById('overview');
  assert.equal(sec.querySelectorAll('.ovs-pills').length, 0);
  assert.equal(sec.querySelectorAll('.ovs-herobar').length, 0);
  assert.ok([...sec.querySelectorAll('.sfc')].every(e => !(e.attrs.class ?? '').includes('ovs-')));
});

test('a block the Workspace has moved into a tile is no longer inside #overview, so a section never hides it there', () => {
  const { sec, doc, win } = setup();
  const wire = sec.querySelector('[data-surface="panel.ov.wire"]');
  const tile = doc.createElement('div'); doc.body.appendChild(tile);
  wire.remove(); tile.appendChild(wire);   // the stand-in appendChild does not detach from the old parent, so detach first
  win.deskOverviewSections.show('today');
  assert.equal(sec.querySelector('[data-surface="panel.ov.wire"]'), null, 'it is outside #overview, so apply never touches it again');
});
