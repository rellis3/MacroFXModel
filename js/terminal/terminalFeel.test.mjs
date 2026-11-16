// js/terminal/terminalFeel.test.mjs: the OWNER-ONLY SWITCH for the new terminal features. The point of this file: a desk login with the switch off sees
// NO TRACE (no button, no key handler, no code loaded), the owner always has the features, and the owner can flip them for everyone from the Info map.
// node --test js/terminal/terminalFeel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURFACES, surfaceById, visibleFor, cleanSwitches, HIDDEN_REASONS } from './tabRegistry.js';
import { hideCss, resolveSession } from './access.js';
import { previewRows, deskSees, panelHtml, mountSwitches } from './previewSwitches.js';
import { El, makePage, makeWin, memStore } from './feelFakeDom.fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
globalThis.__terminalFeelNoAutoStart = true;
globalThis.localStorage = memStore();
const { start } = await import('./terminalFeel.js');
const PREVIEW = ['widget.cmdline', 'panel.cal.drills', 'widget.export', 'panel.news.saved', 'tab.monitor', 'tab.workspace', 'tab.kchart', 'tab.insight', 'widget.replayviz', 'widget.alerts', 'widget.linked'];   // registry order

test('the preview features are registry surfaces, hidden from the desk login by default, with a reason and a note', () => {
  assert.ok(HIDDEN_REASONS.includes('preview'));
  assert.deepEqual(previewRows().map(r => r.id), PREVIEW);
  for (const id of PREVIEW) { const s = surfaceById(id); assert.equal(s.hidden, 'preview'); assert.equal(s.defaultVisible, false); assert.ok(s.note.length > 30); }
  const viewer = visibleFor('viewer', null), owner = visibleFor('owner', {});
  for (const id of PREVIEW) { assert.ok(!viewer.includes(id), `${id} must not be visible to a desk login by default`); assert.ok(owner.includes(id), `${id}: the owner always sees it`); }
});

test('the owner can flip one on for the desk login, and off again; only known ids and booleans are accepted', () => {
  assert.ok(visibleFor('viewer', { 'widget.cmdline': true }).includes('widget.cmdline'));
  assert.ok(!visibleFor('viewer', { 'widget.cmdline': true }).includes('widget.linked'), 'the two switches are independent');
  assert.ok(!visibleFor('viewer', { 'widget.cmdline': true, 'widget.cmdline ': false }).includes('widget.linked'));
  assert.deepEqual(cleanSwitches({ 'widget.linked': true }), { ok: true, clean: { 'widget.linked': true } });
  assert.equal(cleanSwitches({ 'widget.linked': 'yes' }).ok, false); assert.equal(cleanSwitches({ 'widget.nope': true }).ok, false);
});

test('NO TRACE for a desk login: the markup of both is hidden by the registry stylesheet and by the hidden attribute until a feature mounts', () => {
  const html = read('desk-terminal.html');
  for (const [id, el] of [['widget.cmdline', 'cmdbtn'], ['widget.linked', 'linkchip']]) {
    const tag = new RegExp(`<(?:button|input)[^>]*id="${el}"[^>]*>`).exec(html)?.[0];
    assert.ok(tag, `${el} is in the top bar`); assert.ok(tag.includes(`data-surface="${id}"`), `${el} carries data-surface="${id}"`); assert.ok(/\shidden[\s>]/.test(tag), `${el} starts hidden`);
  }
  const css = hideCss(visibleFor('viewer', null));
  for (const id of PREVIEW) assert.ok(css.includes(`[data-surface="${id}"]{display:none!important}`), `${id} is hidden by access.js for a desk login`);
  assert.ok(!hideCss(visibleFor('viewer', { 'widget.cmdline': true })).includes('"widget.cmdline"'), 'switched on: no longer hidden');
  // a failed access check is a desk login with the defaults: still hidden (fails closed)
  const failed = resolveSession(null, null); assert.equal(failed.role, 'viewer'); for (const id of PREVIEW) assert.ok(!failed.visible.includes(id));
  // no static import: a desk login never downloads the code
  const loader = read('js/terminal/terminalFeel.js');
  assert.ok(!/^\s*import\s[^(]*from\s+['"]\.\/(commandLine|linkedSelection|commandCore|selectionCore)\.js['"]/m.test(loader), 'terminalFeel.js must only import the features dynamically, after the surface check');
  assert.match(loader, /import\('\.\/commandLine\.js'\)/); assert.match(loader, /import\('\.\/linkedSelection\.js'\)/);
  const page = read('desk-terminal.html');
  assert.ok(!/js\/terminal\/(commandLine|linkedSelection|command-line)/.test(page), 'the page itself does not load the feature files');
});

test('start(): a desk login with the switches off loads nothing and adds nothing; no access answer fails closed', async () => {
  const doc = makePage(); doc.head = new El('head'); doc.root.appendChild(doc.head);
  const win = makeWin(doc); globalThis.document = doc; globalThis.window = win;
  try {
    globalThis.deskSurfaceOn = () => false;
    assert.deepEqual(await start(), { linked: false, cmdline: false, workspace: false, alerts: false, chart: false, monitor: false, insight: false, newsSearches: false, exporter: false, calendarDrills: false, replayViz: false });
    assert.equal(doc.getElementById('feelCss'), null); assert.equal(doc.getElementById('cmdk-back'), null); assert.equal(doc.getElementById('cmdbtn').hidden, true); assert.equal(doc.getElementById('linkchip').hidden, true);
    assert.equal(win.deskSelection, undefined);
    delete globalThis.deskSurfaceOn;
    assert.deepEqual(await start(), { linked: false, cmdline: false, workspace: false, alerts: false, chart: false, monitor: false, insight: false, newsSearches: false, exporter: false, calendarDrills: false, replayViz: false }, 'deskSurfaceOn missing = not allowed');
    globalThis.deskSurfaceOn = id => id !== 'widget.linked' && id !== 'widget.cmdline';
    assert.deepEqual(await start(), { linked: false, cmdline: false, workspace: false, alerts: false, chart: false, monitor: false, insight: false, newsSearches: false, exporter: false, calendarDrills: false, replayViz: true });   // the replay buttons mount on any page: that one is on here
  } finally { delete globalThis.deskSurfaceOn; delete globalThis.document; delete globalThis.window; }
});

test('start(): the owner gets both (button, chip, stylesheet, key handler); one switched on gives only that one', async () => {
  // workspace is false below: this stand-in page has no #workspace section to mount into (workspaceState/Core tests cover the feature)
  for (const [on, want] of [[() => true, { linked: true, cmdline: true, workspace: false, alerts: false, chart: false, monitor: false, insight: false, newsSearches: false, exporter: false, calendarDrills: false, replayViz: true }], [id => id === 'widget.cmdline', { linked: false, cmdline: true, workspace: false, alerts: false, chart: false, monitor: false, insight: false, newsSearches: false, exporter: false, calendarDrills: false, replayViz: false }], [id => id === 'widget.linked', { linked: true, cmdline: false, workspace: false, alerts: false, chart: false, monitor: false, insight: false, newsSearches: false, exporter: false, calendarDrills: false, replayViz: false }]]) {
    const doc = makePage(); doc.head = new El('head'); doc.root.appendChild(doc.head);
    const win = makeWin(doc); globalThis.document = doc; globalThis.window = win; globalThis.deskSurfaceOn = on;
    globalThis.openPairPage = win.openPairPage; globalThis.openReplay = win.openReplay;   // the hooks terminalTabs.js sets (the loader waits for them)
    try {
      assert.deepEqual(await start(), want);
      assert.equal(!!doc.getElementById('cmdk-back'), want.cmdline); assert.equal(doc.getElementById('cmdbtn').hidden, !want.cmdline);
      assert.equal(doc.getElementById('linkchip').hidden, !want.linked); assert.equal(!!win.deskSelection, want.linked);
      assert.ok(doc.getElementById('feelCss'));
      doc.fire('keydown', doc.body, { key: '/' }); assert.equal(doc.getElementById('cmdk-back')?.hidden ?? true, !want.cmdline, 'the key works only where the feature is on');
    } finally { delete globalThis.deskSurfaceOn; delete globalThis.document; delete globalThis.window; delete globalThis.openPairPage; delete globalThis.openReplay; }
  }
});

test('the Info map panel: one row per preview feature, desk-login state in words, a button to flip it', () => {
  const h = panelHtml({});
  for (const r of previewRows()) { assert.ok(h.includes(r.label.replace(/`/g, '`')), r.label); assert.ok(h.includes(`data-pv="${r.id}"`)); }
  assert.equal((h.match(/desk login: off/g) ?? []).length, PREVIEW.length); assert.match(h, /Show to the desk login/);
  const h2 = panelHtml({ 'widget.cmdline': true });
  assert.equal((h2.match(/desk login: on/g) ?? []).length, 1); assert.match(h2, /Hide from the desk login/);
  assert.equal(deskSees(SURFACES.find(s => s.id === 'widget.linked'), { 'widget.linked': true }), true); assert.equal(deskSees(SURFACES.find(s => s.id === 'widget.linked'), null), false);
});

test('mountSwitches: draws for the owner, flips with the same call the Access page makes, says what happened; a desk login gets nothing', async () => {
  const calls = [], saved = {};
  const fetchJson = async (u, init) => {
    calls.push([u, init?.method ?? 'GET', init?.body]);
    if (!init?.method) return { ok: true, role: 'owner', saved: { ...saved } };
    const b = JSON.parse(init.body); Object.assign(saved, b); return { ok: true, saved: { ...saved } };
  };
  const host = new El('div'); await mountSwitches(host, { fetchJson });
  assert.match(host.innerHTML, /Preview features/); assert.match(host.innerHTML, /desk login: off/);
  const btn = new El('button', { 'data-pv': 'widget.linked', 'data-to': 'on' }); btn.parent = host;
  host.listeners.click[0].fn({ target: btn }); await new Promise(r => setImmediate(r));
  assert.deepEqual(calls.at(-1), ['/api/desk-access', 'POST', JSON.stringify({ 'widget.linked': true })]);
  assert.equal((host.innerHTML.match(/desk login: on/g) ?? []).length, 1); assert.match(host.querySelector('#pv-msg').textContent, /now sees that feature/);
  // a failed save is reported, not hidden
  const bad = new El('div'); let first = true;
  await mountSwitches(bad, { fetchJson: async (u, i) => (first ? (first = false, { ok: true, role: 'owner', saved: {} }) : { ok: false, error: 'owner only' }) });
  const b2 = new El('button', { 'data-pv': 'widget.cmdline', 'data-to': 'on' }); b2.parent = bad;
  bad.listeners.click[0].fn({ target: b2 }); await new Promise(r => setImmediate(r));
  assert.match(bad.querySelector('#pv-msg').textContent, /Not saved: owner only/); assert.match(bad.innerHTML, /desk login: off/);
  // a desk login, or a failed read, draws nothing and never calls the save
  globalThis.deskIsViewer = () => true; const v = new El('div'); let n = 0;
  await mountSwitches(v, { fetchJson: async () => { n++; return { ok: true, role: 'owner', saved: {} }; } });
  assert.equal(n, 0); assert.equal(v.innerHTML, ''); delete globalThis.deskIsViewer;
  const v2 = new El('div'); await mountSwitches(v2, { fetchJson: async () => ({ ok: true, role: 'viewer', visible: [] }) }); assert.equal(v2.innerHTML, '');
  const v3 = new El('div'); await mountSwitches(v3, { fetchJson: async () => { throw new Error('offline'); } }); assert.equal(v3.innerHTML, '');
});

test('the vol clock tiles and rows carry data-lk-inst (an inert attribute the page\'s own click handlers ignore), so they can be linked', () => {
  const v = read('js/terminal/volClockView.js');
  assert.match(v, /vc-tile" data-tag="\$\{esc\(t\.tag \?\? ''\)\}" data-lk-inst="\$\{esc\(t\.sym\)\}"/); assert.match(v, /data-lk-inst="\$\{esc\(r\.name\)\}"/);
  assert.ok(!/data-inst=/.test(v), 'data-inst would make the page open an asset card on click: the vol clock uses data-lk-inst');
});

test('the Info map tab hosts the panel and the admin page knows the preview reason', () => {
  assert.match(read('js/terminal/infoMapView.js'), /id="im-sw"/); assert.match(read('js/terminal/infoMapView.js'), /previewSwitches\.js/);
  const admin = read('desk-admin.html');
  assert.match(admin, /preview: 'up'/); assert.match(admin, /Terminal features \(preview\)/);
});
