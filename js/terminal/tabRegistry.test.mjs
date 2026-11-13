// The Desk Terminal surface registry: every tab, link, widget, ticker segment and panel the terminal can show is listed in
// js/terminal/tabRegistry.js (so the admin panel can switch it for the desk login), and the registry lists nothing that has no markup.
//   node --test js/terminal/tabRegistry.test.mjs
// If this fails: you added (or removed) a surface. Add the row to SURFACES in js/terminal/tabRegistry.js (id, kind, label, group, defaultVisible,
// ownerData) and put data-surface="<id>" on the markup (or wrap generated HTML in <div class="sfc" data-surface="<id>">). Default it OFF and
// ownerData:true unless it is market data you are happy to show anyone with the desk login. See "Desk Terminal: every surface is registered" in CLAUDE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURFACES, KINDS, SURFACE_IDS, DEFAULT_VISIBLE_IDS, ALWAYS_OWNER_IDS, surfaceById, visibleFor, cleanSwitches } from './tabRegistry.js';
import { hideCss, resolveSession } from './access.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('desk-terminal.html');
const tabsJs = read('js/terminal/terminalTabs.js');
const moduleSources = fs.readdirSync(path.join(ROOT, 'js', 'terminal')).filter(f => f.endsWith('.js')).map(f => `js/terminal/${f}`);

// every surface id the markup or the code mentions
const used = new Set();
// access.js and tabRegistry.js describe the mechanism (their comments quote the attribute), so they are not markup
const sources = ['desk-terminal.html', ...moduleSources.filter(f => !/\/(access|tabRegistry)\.js$/.test(f))];
for (const f of sources) {
  const t = f === 'desk-terminal.html' ? html : read(f);
  for (const m of t.matchAll(/data-surface=\\?"([a-z][\w.-]*)\\?"/g)) used.add(m[1]);
  for (const m of t.matchAll(/\bsf\('([a-z][\w.-]*)'/g)) used.add(m[1]);
}
const HOW = id => `Add { id: '${id}', kind, label, group, defaultVisible: false, ownerData: true } to SURFACES in js/terminal/tabRegistry.js (CLAUDE.md: "Desk Terminal: every surface is registered").`;

test('every id used in the markup is registered', () => {
  for (const id of used) assert.ok(surfaceById(id), `data-surface="${id}" is not in the registry. ${HOW(id)}`);
});

test('every registered id has markup (no dead switches in the admin panel)', () => {
  for (const id of SURFACE_IDS) assert.ok(used.has(id), `registry id "${id}" appears in no data-surface attribute or sf() call: remove the row, or put the attribute on the markup.`);
});

test('registry rows are well formed and ids are unique', () => {
  assert.equal(new Set(SURFACE_IDS).size, SURFACE_IDS.length, 'duplicate surface id');
  for (const s of SURFACES) {
    assert.match(s.id, /^[a-z]+\.[\w.-]+$/, s.id);
    assert.ok(KINDS.includes(s.kind), `${s.id}: kind ${s.kind}`);
    assert.equal(s.id.split('.')[0], s.kind === 'nav' ? 'nav' : s.kind, `${s.id}: the id prefix must be its kind`);
    for (const f of ['label', 'group', 'note']) assert.ok(typeof s[f] === 'string' && s[f].length > 2, `${s.id}: ${f}`);
    assert.equal(typeof s.defaultVisible, 'boolean', s.id); assert.equal(typeof s.ownerData, 'boolean', s.id);
    assert.ok(!(s.defaultVisible && s.ownerData), `${s.id}: a surface that shows the owner's data cannot be visible by default`);
  }
});

test('every nav tab is a registered tab with a registered section; every RENDER hook is a tab', () => {
  const tabs = [...html.matchAll(/<button role="tab"[^>]*data-t="(\w+)"[^>]*>/g)].map(m => ({ t: m[1], tag: m[0] }));
  assert.ok(tabs.length >= 14, 'found the nav tabs');
  for (const { t, tag } of tabs) {
    assert.ok(surfaceById(`tab.${t}`), `nav tab data-t="${t}" has no registry row tab.${t}. ${HOW(`tab.${t}`)}`);
    assert.ok(tag.includes(`data-surface="tab.${t}"`), `the nav button for "${t}" needs data-surface="tab.${t}"`);
    const sec = html.match(new RegExp(`<section id="${t}"[^>]*>`));
    assert.ok(sec && sec[0].includes(`data-surface="tab.${t}"`), `<section id="${t}"> needs data-surface="tab.${t}"`);
  }
  assert.deepEqual(SURFACES.filter(s => s.kind === 'tab').map(s => s.id.slice(4)).sort(), tabs.map(x => x.t).sort(), 'registry tabs and nav tabs differ');
  // RENDER hooks: each is a nav tab, or the one legacy section that has no button (kept reachable only through the owner's Research link)
  const block = tabsJs.slice(tabsJs.indexOf('const RENDER = {') + 'const RENDER = {'.length).split('globalThis.onTerminalTab')[0];
  const [first, ...more] = block.split(/\r?\n/);
  const keys = [...first.matchAll(/(\w+):\s*(?:render\w+|assetsNews)/g), ...more.join('\n').matchAll(/^ {2}(\w+):/gm)].map(m => m[1]);
  assert.ok(keys.length >= 8, 'found the RENDER keys');
  const LEGACY = new Set(['research']);
  for (const k of keys) assert.ok(LEGACY.has(k) || surfaceById(`tab.${k}`), `RENDER hook "${k}" is not a registered tab. ${HOW(`tab.${k}`)}`);
});

test('the safe defaults: owner-only data is off, market data is on', () => {
  for (const id of ['tab.read', 'tab.infomap', 'nav.research', 'nav.research-tab', 'nav.deskoffice', 'nav.deskrun', 'widget.ask', 'widget.bookchip', 'strip.zone',
    'panel.ov.book', 'panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.strength', 'panel.ov.exposure', 'panel.ov.record', 'tab.ana', 'tab.corr', 'tab.ccy']) {
    const s = surfaceById(id); assert.ok(s, id); assert.equal(s.defaultVisible, false, id); assert.equal(s.ownerData, true, id);
  }
  for (const id of ['tab.overview', 'tab.macro', 'tab.pos', 'tab.cal', 'tab.today', 'tab.pair', 'tab.news', 'panel.ov.riskstate', 'panel.ov.em', 'panel.ov.dayshape', 'widget.worldstress', 'strip.events']) {
    assert.equal(surfaceById(id)?.defaultVisible, true, id);
  }
});

test('visibleFor: owner sees all; a viewer sees the defaults plus what the owner switched on, never the admin link', () => {
  assert.deepEqual(visibleFor('owner', {}), SURFACE_IDS);
  assert.deepEqual(visibleFor('viewer', null), DEFAULT_VISIBLE_IDS);
  const v = visibleFor('viewer', { 'tab.read': true, 'tab.macro': false, 'nav.access': true, 'bogus.id': true });
  assert.ok(v.includes('tab.read')); assert.ok(!v.includes('tab.macro')); assert.ok(!v.includes('bogus.id'));
  for (const id of ALWAYS_OWNER_IDS) assert.ok(!v.includes(id), `${id} is never visible to a viewer`);
});

test('cleanSwitches accepts known ids with booleans and nothing else', () => {
  assert.deepEqual(cleanSwitches({ 'tab.read': true, 'tab.macro': false, updatedAt: 'x' }), { ok: true, clean: { 'tab.read': true, 'tab.macro': false } });
  assert.equal(cleanSwitches({ 'tab.nope': true }).ok, false);
  assert.equal(cleanSwitches({ 'tab.read': 'yes' }).ok, false);
  assert.equal(cleanSwitches([]).ok, false); assert.equal(cleanSwitches(null).ok, false);
  assert.deepEqual(cleanSwitches({ 'nav.access': true }), { ok: true, clean: {} });
});

test('access.js: fails closed, hides exactly the surfaces that are off', () => {
  const failed = resolveSession(null, null);
  assert.equal(failed.role, 'viewer'); assert.equal(failed.failed, true); assert.deepEqual(failed.visible, DEFAULT_VISIBLE_IDS);
  const half = resolveSession({ ok: true, role: 'owner' }, null);
  assert.equal(half.role, 'viewer', 'an owner answer without the access answer is still treated as a viewer');
  const owner = resolveSession({ ok: true, role: 'owner' }, { ok: true, role: 'owner', visible: SURFACE_IDS });
  assert.equal(owner.role, 'owner'); assert.equal(hideCss(owner.visible), '');
  const viewer = resolveSession({ ok: true, role: 'viewer' }, { ok: true, role: 'viewer', visible: ['tab.macro', 'nav.access', 'bogus'] });
  assert.deepEqual(viewer.visible, ['tab.macro'], 'unknown ids and the admin link are dropped');
  const css = hideCss(viewer.visible);
  assert.ok(css.includes('[data-surface="tab.read"]{display:none!important}')); assert.ok(!css.includes('"tab.macro"'));
});

test('the admin page and the terminal use the same registry', () => {
  const admin = read('desk-admin.html');
  assert.match(admin, /terminal\/tabRegistry\.js/, 'desk-admin.html imports the registry');
  assert.match(html, /js\/terminal\/access\.js/, 'desk-terminal.html loads access.js');
});
