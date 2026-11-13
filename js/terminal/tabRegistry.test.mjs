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
import { SURFACES, KINDS, CLASSES, SURFACE_IDS, DEFAULT_VISIBLE_IDS, ALWAYS_OWNER_IDS, surfaceById, visibleFor, cleanSwitches } from './tabRegistry.js';
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
  for (const m of t.matchAll(/deskSurfaceOn\??\.?\('([a-z][\w.-]*)'/g)) used.add(m[1]);   // a panel the code draws (or skips) by asking the registry
}
const LENS = 'THE LENS: the desk login is an education tool and a macro dashboard, not a signal service. Analysis is shown; a trade signal (entries, stops, targets, size, best expressions, hedge picks) or the owner\'s private area is not.';
const HOW = id => `Add mk('${id}', kind, label, group, CLASS, note) to SURFACES in js/terminal/tabRegistry.js, CLASS being A (analysis), S (signal) or P (private). ${LENS} (CLAUDE.md: "Desk Terminal: every surface is registered").`;

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
    assert.ok(CLASSES.includes(s.class), `${s.id}: class must be one of ${CLASSES.join(' | ')}. ${LENS}`);
    assert.equal(s.defaultVisible, s.class === 'analytic', `${s.id} is class '${s.class}' so defaultVisible must be ${s.class === 'analytic'}. ${LENS}`);
    assert.equal(s.ownerData, s.class !== 'analytic', `${s.id}: ownerData must be ${s.class !== 'analytic'} for class '${s.class}'`);
  }
});

test('the lens: nothing that reads as a trade signal is classed as analysis', () => {
  const TRADEY = /\b(entry|entries|stop|target|invalid|playbooks?|trade watch|best pairs?|expressions?|hedge|size|flips)\b/i;
  for (const s of SURFACES) if (TRADEY.test(s.label)) assert.notEqual(s.class, 'analytic', `"${s.label}" (${s.id}) names trade-level content but is classed analytic. ${LENS}`);
  const PRIVATE = /\b(book intelligence|exposure|the desk's record|desk alerts|track record|analyst scorecard|paper trades|ask the desk|data-quality)\b/i;
  for (const s of SURFACES) if (PRIVATE.test(s.label)) assert.equal(s.class, 'private', `"${s.label}" (${s.id}) is the owner's own area: class it private. ${LENS}`);
});

test('the lens: signal and private surfaces are never visible by default; the market analysis is', () => {
  for (const s of SURFACES) assert.equal(DEFAULT_VISIBLE_IDS.includes(s.id), s.class === 'analytic', `${s.id}`);
  for (const id of ['tab.ccy', 'tab.ana', 'tab.changed', 'tab.corr', 'strip.regime', 'strip.update', 'strip.risk', 'panel.ov.strength', 'panel.ov.regime', 'panel.ov.week', 'panel.ov.releases', 'panel.ov.riskwarn', 'panel.ov.book', 'panel.ana.strength', 'panel.charts.ranking', 'widget.disclaimer', 'widget.bookchip']) {
    assert.equal(surfaceById(id)?.class, 'analytic', `${id} is analysis (the owner: show analysis, hide signals)`);
  }
  for (const id of ['panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.bestpairs', 'panel.ov.regime-lists', 'panel.asset.plan', 'panel.asset.size', 'panel.ccy.expressions', 'panel.corr.hedges', 'strip.zone', 'panel.charts.bookflow', 'panel.changed.cards']) {
    assert.equal(surfaceById(id)?.class, 'signal', `${id} reads as a trade signal`);
  }
  for (const id of ['tab.read', 'tab.infomap', 'nav.research', 'nav.deskoffice', 'nav.deskrun', 'widget.ask', 'widget.dqchip', 'panel.ov.exposure', 'panel.ov.record', 'panel.ov.alerts', 'panel.ana.risk', 'panel.ana.analysts', 'panel.changed.paper']) {
    assert.equal(surfaceById(id)?.class, 'private', `${id} is the owner's own area`);
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
  for (const id of ['tab.read', 'tab.infomap', 'nav.research', 'nav.research-tab', 'nav.deskoffice', 'nav.deskrun', 'widget.ask', 'widget.dqchip', 'strip.zone',
    'panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.exposure', 'panel.ov.record', 'panel.ana.risk', 'panel.corr.hedges']) {
    const s = surfaceById(id); assert.ok(s, id); assert.equal(s.defaultVisible, false, id); assert.equal(s.ownerData, true, id);
  }
  for (const id of ['tab.overview', 'tab.macro', 'tab.pos', 'tab.cal', 'tab.today', 'tab.pair', 'tab.news', 'tab.ccy', 'tab.ana', 'tab.corr', 'panel.ov.riskstate', 'panel.ov.em', 'panel.ov.dayshape', 'panel.ov.strength', 'widget.worldstress', 'strip.events', 'strip.regime']) {
    assert.equal(surfaceById(id)?.defaultVisible, true, id);
  }
});

test('visibleFor: owner sees all; a viewer sees the defaults plus what the owner switched on, never the admin link', () => {
  assert.deepEqual(visibleFor('owner', {}), SURFACE_IDS);
  assert.deepEqual(visibleFor('viewer', null), DEFAULT_VISIBLE_IDS);
  // a SIGNAL surface can be switched on by the owner; a PRIVATE one or a link out to another page can not (its data is withheld / it would bounce)
  const v = visibleFor('viewer', { 'panel.asset.plan': true, 'tab.macro': false, 'nav.access': true, 'tab.read': true, 'panel.ov.bookintel': true, 'nav.research': true, 'bogus.id': true });
  assert.ok(v.includes('panel.asset.plan')); assert.ok(!v.includes('tab.macro')); assert.ok(!v.includes('bogus.id'));
  for (const id of ['tab.read', 'panel.ov.bookintel', 'nav.research', 'nav.access']) assert.ok(!v.includes(id), `${id} is never visible to a viewer`);
  for (const id of ALWAYS_OWNER_IDS) assert.ok(!v.includes(id), `${id} is never visible to a viewer`);
});

test('ALWAYS_OWNER_IDS is every link out to another page and every private surface, and nothing else', () => {
  const want = SURFACES.filter(s => s.kind === 'nav' || s.class === 'private').map(s => s.id);
  assert.deepEqual([...ALWAYS_OWNER_IDS], want);
  for (const s of SURFACES) if (s.class === 'private' || s.kind === 'nav') assert.ok(ALWAYS_OWNER_IDS.includes(s.id), s.id);
  // switching everything on still never shows the owner's area to a viewer
  const all = Object.fromEntries(SURFACE_IDS.map(id => [id, true]));
  const v = visibleFor('viewer', all);
  for (const s of SURFACES) if (s.class === 'private' || s.kind === 'nav') assert.ok(!v.includes(s.id), `${s.id} stays hidden even when switched on`);
});

test('cleanSwitches accepts known ids with booleans and nothing else', () => {
  assert.deepEqual(cleanSwitches({ 'panel.asset.plan': true, 'tab.macro': false, updatedAt: 'x' }), { ok: true, clean: { 'panel.asset.plan': true, 'tab.macro': false } });
  assert.deepEqual(cleanSwitches({ 'tab.read': true, 'nav.research': true }), { ok: true, clean: {} });   // private and link surfaces are never switchable
  assert.equal(cleanSwitches({ 'tab.nope': true }).ok, false);
  assert.equal(cleanSwitches({ 'panel.asset.plan': 'yes' }).ok, false);
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
