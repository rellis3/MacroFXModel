// js/terminal/overviewSections.test.mjs: the Overview pill row over the stand-in DOM (js/terminal/feelFakeDom.fixtures.mjs). It proves the wiring: the pills sit
// under the glance, only the open section's blocks are on screen, grids that hold only hidden blocks go too, a lone visible block takes the row, the choice is
// remembered, hash links and the hook work, a block off for the session never gets a section, and with the preview not mounted nothing changes. It does NOT prove the
// look (themes, phone width) or the feel in a real browser: the headless run (scripts/overview-sections-check.mjs) is for that.
// node --test js/terminal/overviewSections.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin, memStore } from './feelFakeDom.fixtures.mjs';
import { mountOverviewSections } from './overviewSections.js';
import { LS_KEY } from './overviewSubtabs.js';

const BLOCK = (id, body = '<div class="card">x</div>') => `<div class="sfc" data-surface="${id}">${body}</div>`;
// the real Overview's shape: glance, map, headline, then a two-column grid (regime | a column of four blocks), a heading and a wire/releases grid, #xo with the injected blocks
const OVERVIEW = `<div class="fl-glance" data-surface="panel.ov.glance">glance</div>
${BLOCK('panel.ov.hero')}${BLOCK('panel.ov.book')}${BLOCK('panel.ov.bookintel', '<div id="bkintel">book intel</div>')}
<div class="grid g2" id="g-top">${BLOCK('panel.ov.regime')}<div class="grid" id="g-col">${BLOCK('panel.ov.strength')}${BLOCK('panel.ov.engine')}${BLOCK('panel.ov.exposure')}${BLOCK('panel.ov.record')}</div></div>
${BLOCK('panel.ov.week')}${BLOCK('panel.ov.bestpairs')}<div id="xo">${BLOCK('panel.ov.riskstate')}${BLOCK('panel.ov.em')}${BLOCK('panel.ov.alerts')}${BLOCK('panel.ov.ccystrength')}${BLOCK('panel.ov.priceread')}</div>${BLOCK('panel.ov.dayshape')}
${BLOCK('panel.ov.tradewatch')}${BLOCK('panel.ov.playbooks')}
<div class="sec" id="h-news"><h2>News, releases and risks</h2></div>
<div class="grid g2" id="g-news">${BLOCK('panel.ov.wire')}<div class="grid" id="g-col2">${BLOCK('panel.ov.releases')}${BLOCK('panel.ov.riskwarn')}</div></div>`;

function setup({ isOn = () => true, hash = '', saved = null } = {}) {
  const doc = makePage();
  doc.getElementById('overview').innerHTML = OVERVIEW;
  const store = memStore(); if (saved) store.setItem(LS_KEY, saved);
  const win = makeWin(doc, { deskSurfaceOn: isOn, localStorage: store, location: { hash }, history: { replaceState: (a, b, h) => { win.location.hash = h; } } });
  const m = mountOverviewSections({ doc, win });
  const sec = doc.getElementById('overview');
  const cls = id => (sec.querySelector(`[data-surface="${id}"]`)?.attrs.class ?? '');
  const shown = id => !cls(id).split(/\s+/).includes('ovs-off');
  const open = () => [...sec.querySelectorAll('.sfc')].filter(e => shown(e.attrs['data-surface'])).map(e => e.attrs['data-surface']);
  return { doc, win, sec, m, store, shown, open, cls };
}
const pressed = (sec, id) => sec.querySelector(`[data-ovsub="${id}"]`)?.attrs['aria-pressed'];

test('the pill row sits right under the glance block and offers all five sections; Today is open and shows only its blocks', () => {
  const { sec, shown, open } = setup();
  const kids = sec.kids.filter(k => k.tag !== '#text');
  assert.equal(kids[0].attrs['data-surface'], 'panel.ov.glance');
  assert.ok(kids[1].attrs.class.includes('ovs-pills'), 'pills come second, directly after the glance');
  assert.equal(sec.querySelectorAll('[data-ovsub]').length, 5);
  assert.deepEqual(open().sort(), ['panel.ov.book', 'panel.ov.hero', 'panel.ov.regime', 'panel.ov.riskwarn', 'panel.ov.week'].sort());
  assert.equal(shown('panel.ov.wire'), false);
  assert.equal(shown('panel.ov.strength'), false);
});

test('choosing a section shows its blocks only, remembers it, and puts it in the address', () => {
  const { sec, win, store, open, doc } = setup();
  doc.fire('click', sec.querySelector('[data-ovsub="currencies"]'));
  assert.deepEqual(open().sort(), ['panel.ov.ccystrength', 'panel.ov.engine', 'panel.ov.exposure', 'panel.ov.priceread', 'panel.ov.strength'].sort());
  assert.equal(store.getItem(LS_KEY), 'currencies');
  assert.equal(win.location.hash, '#overview/currencies');
  assert.equal(pressed(sec, 'currencies'), 'true');
  assert.equal(pressed(sec, 'today'), 'false');
});

test('a grid that holds only hidden blocks is hidden; a grid left with one visible child takes the whole row', () => {
  const { sec, doc } = setup();
  // Today: the top grid has the regime (shown) and a column of currency blocks (all hidden) -> column hidden, grid solo
  assert.ok(sec.querySelector('#g-col').attrs.class.includes('ovs-off'));
  assert.ok(sec.querySelector('#g-top').attrs.class.includes('ovs-solo'));
  // the news grid: the wire is hidden, the column has riskwarn visible -> the grid stays, solo
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
  assert.ok(b.shown('panel.ov.playbooks') && !b.shown('panel.ov.hero'));
});

test('a section whose blocks are all off for the session is not offered; with one section left there is no pill row and nothing is hidden', () => {
  const deskOff = new Set(['panel.ov.record', 'panel.ov.bestpairs', 'panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.alerts']);   // what a desk login does not get
  const a = setup({ isOn: id => !deskOff.has(id) });
  assert.equal(a.sec.querySelectorAll('[data-ovsub]').length, 5, 'The desk keeps book intelligence, so it is still offered');
  const keep = new Set(['panel.ov.hero', 'panel.ov.book', 'panel.ov.regime', 'panel.ov.week', 'panel.ov.riskwarn']);
  const b = setup({ isOn: id => keep.has(id) });
  assert.equal(b.sec.querySelectorAll('.ovs-pills').length, 0, 'one section: no row');
  assert.ok([...b.sec.querySelectorAll('.sfc, .grid, .sec')].every(e => !(e.attrs.class ?? '').includes('ovs-')), 'one section: nothing carries a hiding class');
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
  const classes = () => JSON.stringify([...sec.querySelectorAll('.sfc, .grid, .sec, .ovs-pills')].map(e => e.attrs.class));
  const snapshot = classes();
  win.deskOverviewSections.show('today'); win.deskOverviewSections.show('today');
  assert.equal(classes(), snapshot);
  m.destroy();
  assert.equal(sec.querySelectorAll('.ovs-pills').length, 0);
  assert.ok([...sec.querySelectorAll('.sfc, .grid, .sec')].every(e => !(e.attrs.class ?? '').includes('ovs-')));
});

test('with the preview not mounted the Overview is untouched: no pills, no classes', () => {
  const doc = makePage(); doc.getElementById('overview').innerHTML = OVERVIEW;
  const sec = doc.getElementById('overview');
  assert.equal(sec.querySelectorAll('.ovs-pills').length, 0);
  assert.ok([...sec.querySelectorAll('.sfc')].every(e => !(e.attrs.class ?? '').includes('ovs-')));
});

test('a block the Workspace has moved into a tile is no longer inside #overview, so a section never hides it there', () => {
  const { sec, doc, win } = setup();
  const wire = sec.querySelector('[data-surface="panel.ov.wire"]');
  const tile = doc.createElement('div'); doc.body.appendChild(tile);
  wire.remove(); tile.appendChild(wire);   // the stand-in appendChild does not detach from the old parent, so detach first
  win.deskOverviewSections.show('today');
  assert.equal(sec.querySelector('[data-surface="panel.ov.wire"]'), null, 'it is outside #overview, so apply never touches it again');
  // the class it already carries only hides it inside #overview: overview-sections.css scopes every .ovs-off rule to #overview (checked in overviewSubtabs.test.mjs)
});
