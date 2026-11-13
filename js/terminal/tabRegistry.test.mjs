// The Desk Terminal surface registry: every tab, link, widget, ticker segment and panel the terminal can show is listed in
// js/terminal/tabRegistry.js (so the admin panel can switch it for the desk login), and the registry lists nothing that has no markup.
//   node --test js/terminal/tabRegistry.test.mjs
// If this fails: you added (or removed) a surface. Add the row to SURFACES in js/terminal/tabRegistry.js (mk(id, kind, label, group, hidden, note)) and put
// data-surface="<id>" on the markup (or wrap generated HTML in <div class="sfc" data-surface="<id>">). `hidden` is null (shown) unless the surface is one
// of the owner's FOUR hide reasons. See "Desk Terminal: every surface is registered" in CLAUDE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURFACES, KINDS, HIDDEN_REASONS, SCHEMA, SURFACE_IDS, DEFAULT_VISIBLE_IDS, LOCKED_HIDDEN_IDS, ALWAYS_VISIBLE_IDS, surfaceById, visibleFor, savedFor, cleanSwitches } from './tabRegistry.js';
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
const RULES = 'THE OWNER\'S THREE RULES: the desk login is an education tool and a macro dashboard. Hide ONLY (1) what reads as a TRADE instruction (trade watch, playbooks, best pairs, entry/stop/target/size lines, the Trader\'s read, the hedge finder), (2) what COSTS money (Research, Ask the desk, paid model buttons), (3) the owner\'s own tooling (Info map, Desk Office, Desk Run, Access, alerts, the data-quality chip) and real P&L / the desk\'s record. EVERYTHING ELSE IS SHOWN, including the directional analysis, the book\'s exposure and risk, scenarios, ratings and drivers.';
const HOW = id => `Add mk('${id}', kind, label, group, HIDDEN, note) to SURFACES in js/terminal/tabRegistry.js, HIDDEN being null (shown) or one of ${HIDDEN_REASONS.map(r => `'${r}'`).join(' | ')}. ${RULES} (CLAUDE.md: "Desk Terminal: every surface is registered")`;

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
    assert.equal(typeof s.defaultVisible, 'boolean', s.id);
  }
});

test('the rule: a surface with a hide reason is OFF by default, a surface without one is ON by default', () => {
  for (const s of SURFACES) {
    if (s.hidden != null) {
      assert.ok(HIDDEN_REASONS.includes(s.hidden), `${s.id}: hidden must be null or one of ${HIDDEN_REASONS.join(' | ')}, not '${s.hidden}'. ${RULES}`);
      assert.equal(s.defaultVisible, false, `${s.id} is hidden because it is '${s.hidden}', so it must be off by default. ${RULES}`);
    } else {
      assert.equal(s.defaultVisible, true, `${s.id} has no hide reason, so it must be shown by default. If it IS a trade instruction, a cost, the owner's tooling or P&L, give it that reason. ${RULES}`);
    }
  }
  assert.deepEqual(DEFAULT_VISIBLE_IDS, SURFACES.filter(s => s.hidden == null).map(s => s.id));
});

test('the owner\'s list: exactly these are hidden, each for its reason', () => {
  const want = {
    trade: ['tab.read', 'strip.zone', 'panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.bestpairs', 'panel.ccy.expressions', 'panel.asset.plan', 'panel.asset.size', 'panel.corr.hedges'],
    cost: ['widget.ask', 'nav.research', 'nav.research-tab'],
    internal: ['tab.infomap', 'nav.deskoffice', 'nav.deskrun', 'nav.access', 'widget.dqchip', 'panel.ov.alerts'],
    pnl: ['panel.ov.record', 'panel.ana.track', 'panel.ana.fall', 'panel.ana.days', 'panel.charts.ranking', 'panel.changed.thesis', 'panel.changed.paper'],
  };
  for (const [reason, ids] of Object.entries(want)) for (const id of ids) assert.equal(surfaceById(id)?.hidden, reason, `${id} is hidden as '${reason}'`);
  const listed = Object.values(want).flat();
  assert.deepEqual(SURFACES.filter(s => s.hidden).map(s => s.id).sort(), [...listed].sort(), 'a surface is hidden that is not on the owner\'s list (or the other way round)');
});

test('the owner\'s complaint: the analysis is shown, including book intelligence, exposure, the lean lists and the risk panels', () => {
  for (const id of ['panel.ov.bookintel', 'panel.ov.exposure', 'panel.ov.regime', 'panel.ov.regime-lists', 'panel.ov.strength', 'panel.ana.risk', 'panel.ana.scenmap', 'panel.ana.web', 'panel.ana.analysts',
    'panel.ana.strength', 'panel.ana.volfc', 'panel.ana.fans', 'panel.charts.bookflow', 'panel.changed.cards', 'panel.macro.carryside', 'tab.ccy', 'tab.ana', 'tab.changed', 'tab.corr', 'tab.charts', 'tab.pair',
    'strip.regime', 'strip.update', 'strip.risk', 'widget.ovl.bias']) {
    assert.equal(surfaceById(id)?.hidden, null, `${id} is analysis and must be shown. ${RULES}`);
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

test('visibleFor: owner sees all; a viewer sees the defaults plus what the owner switched on; links out are locked off', () => {
  assert.deepEqual(visibleFor('owner', {}), SURFACE_IDS);
  assert.deepEqual(visibleFor('viewer', null), DEFAULT_VISIBLE_IDS);
  // ANY surface except a link out can be switched on (a trade, cost, internal or P&L surface included): the owner decides
  const v = visibleFor('viewer', { 'panel.asset.plan': true, 'tab.macro': false, 'nav.access': true, 'tab.read': true, 'panel.ov.record': true, 'tab.infomap': true, 'nav.research': true, 'bogus.id': true });
  assert.ok(v.includes('panel.asset.plan')); assert.ok(v.includes('tab.read')); assert.ok(v.includes('panel.ov.record')); assert.ok(v.includes('tab.infomap'));
  assert.ok(!v.includes('tab.macro')); assert.ok(!v.includes('bogus.id'));
  for (const id of ['nav.access', 'nav.research']) assert.ok(!v.includes(id), `${id} is a link to another page: never visible to a viewer`);
  for (const id of LOCKED_HIDDEN_IDS) assert.ok(!v.includes(id), `${id} is locked off`);
  // switching everything on still never shows a link out
  const all = Object.fromEntries(SURFACE_IDS.map(id => [id, true]));
  const everything = visibleFor('viewer', all);
  for (const s of SURFACES) assert.equal(everything.includes(s.id), s.kind !== 'nav', s.id);
});

test('LOCKED_HIDDEN_IDS is every link out to another page and nothing else', () => {
  assert.deepEqual([...LOCKED_HIDDEN_IDS], SURFACES.filter(s => s.kind === 'nav').map(s => s.id));
  assert.deepEqual([...ALWAYS_VISIBLE_IDS], ['widget.signout']);
});

test('schema: switches saved under another schema are ignored whole, and the owner is told', () => {
  assert.ok(Number.isInteger(SCHEMA) && SCHEMA >= 2);
  assert.deepEqual(savedFor({ 'panel.ov.bestpairs': true, updatedAt: 'x' }), { saved: {}, reset: true }, 'an old object (no schema) is ignored and flagged');
  assert.deepEqual(savedFor({ schema: SCHEMA - 1, 'tab.macro': false }), { saved: {}, reset: true });
  const cur = { schema: SCHEMA, 'tab.macro': false };
  assert.deepEqual(savedFor(cur), { saved: cur, reset: false });
  assert.deepEqual(savedFor({}), { saved: {}, reset: false }, 'nothing stored: nothing to reset');
  assert.deepEqual(savedFor(null), { saved: {}, reset: false });
  // an old override that put a trade surface on does NOT survive: the viewer falls to the new defaults
  const old = savedFor({ 'panel.ov.bestpairs': true, 'panel.ov.regime-lists': false }).saved;
  const v = visibleFor('viewer', old);
  assert.ok(!v.includes('panel.ov.bestpairs')); assert.ok(v.includes('panel.ov.regime-lists'));
});

test('cleanSwitches accepts known ids with booleans and nothing else', () => {
  assert.deepEqual(cleanSwitches({ 'panel.asset.plan': true, 'tab.macro': false, updatedAt: 'x', schema: 2 }), { ok: true, clean: { 'panel.asset.plan': true, 'tab.macro': false } });
  assert.deepEqual(cleanSwitches({ 'tab.read': true, 'panel.ov.record': false }), { ok: true, clean: { 'tab.read': true, 'panel.ov.record': false } }, 'a hidden-by-reason surface is switchable');
  assert.deepEqual(cleanSwitches({ 'nav.research': true, 'nav.access': true, 'widget.signout': false }), { ok: true, clean: {} }, 'links out and Sign out are never switchable');
  assert.equal(cleanSwitches({ 'tab.nope': true }).ok, false);
  assert.equal(cleanSwitches({ 'panel.asset.plan': 'yes' }).ok, false);
  assert.equal(cleanSwitches([]).ok, false); assert.equal(cleanSwitches(null).ok, false);
});

test('access.js: fails closed, hides exactly the surfaces that are off', () => {
  const failed = resolveSession(null, null);
  assert.equal(failed.role, 'viewer'); assert.equal(failed.failed, true); assert.deepEqual(failed.visible, visibleFor('viewer', null));
  const half = resolveSession({ ok: true, role: 'owner' }, null);
  assert.equal(half.role, 'viewer', 'an owner answer without the access answer is still treated as a viewer');
  const owner = resolveSession({ ok: true, role: 'owner' }, { ok: true, role: 'owner', visible: SURFACE_IDS });
  assert.equal(owner.role, 'owner'); assert.equal(hideCss(owner.visible), '');
  const viewer = resolveSession({ ok: true, role: 'viewer' }, { ok: true, role: 'viewer', visible: ['tab.macro', 'nav.access', 'bogus'] });
  assert.deepEqual(viewer.visible, ['tab.macro'], 'unknown ids and links out are dropped');
  const css = hideCss(viewer.visible);
  assert.ok(css.includes('[data-surface="tab.read"]{display:none!important}')); assert.ok(!css.includes('"tab.macro"'));
});

test('the admin page and the terminal use the same registry, and the admin page lists every surface', () => {
  const admin = read('desk-admin.html');
  assert.match(admin, /terminal\/tabRegistry\.js/, 'desk-admin.html imports the registry');
  assert.match(admin, /SURFACES\.filter\(s => s\.group === g\)/, 'the admin page draws every surface of every group (nothing is filtered out)');
  assert.doesNotMatch(admin, /ALWAYS_OWNER_IDS/, 'the old "never listed" rule is gone');
  assert.match(admin, /Reset the changed ones/); assert.match(admin, /differs/);
  assert.match(html, /js\/terminal\/access\.js/, 'desk-terminal.html loads access.js');
});
