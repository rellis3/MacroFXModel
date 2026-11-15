// The Macro tab's six sections (js/terminal/macroSubtabs.js): every Macro surface sits in exactly one section, the page draws it in THAT section,
// the pure helpers (hash, pills, which section opens, which feeds a section still needs) behave, and no feed that another tab reads became lazy.
//   node --test js/terminal/macroSubtabs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MACRO_SUBS, MACRO_CHILD_SURFACES, SUB_IDS, ALL_BLOCKS, BLOCK_SUB, SUB_FEEDS, visibleSubs, parseHash, hashFor, pickSub, pillsHtml, stepSub, missingFeeds, subOfBlock } from './macroSubtabs.js';
import { SURFACE_IDS, surfaceById } from './tabRegistry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'desk-terminal.html'), 'utf8');

test('every panel.macro.* surface is a block in exactly one section (or a child of one)', () => {
  const registered = SURFACE_IDS.filter(id => id.startsWith('panel.macro.'));
  for (const id of registered) {
    if (MACRO_CHILD_SURFACES.includes(id)) continue;
    assert.ok(ALL_BLOCKS.includes(id), `${id} is registered but sits in no Macro section: add it to MACRO_SUBS in js/terminal/macroSubtabs.js`);
  }
  for (const b of ALL_BLOCKS) assert.ok(surfaceById(b), `${b} is in a Macro section but not in the registry (js/terminal/tabRegistry.js)`);
  assert.equal(new Set(ALL_BLOCKS).size, ALL_BLOCKS.length, 'a block is listed in two sections');
  assert.equal(ALL_BLOCKS.length, registered.length - MACRO_CHILD_SURFACES.length);
});

test('the page draws each block in the section that lists it', () => {
  const src = html.slice(html.indexOf('function mxSection(sub)'), html.indexOf('function paintMacro()'));
  const BOARD_KEY = { 'panel.macro.creditliq': "more('credit-liquidity')", 'panel.macro.curve': "more('curve-board')", 'panel.macro.regime': "more('regime-board')", 'panel.macro.vol': "more('vol-board')", 'panel.macro.livelayer': "more('live-layer')", 'panel.macro.releases': "more('releases-board')", 'panel.macro.fedyields': 'fedYieldsHtml' };
  for (const s of MACRO_SUBS) {
    const line = src.split('\n').find(l => l.includes(`sub === '${s.id}'`));
    assert.ok(line, `mxSection has no branch for '${s.id}'`);
    for (const b of s.blocks) {
      const needle = BOARD_KEY[b] ?? `sf('${b}'`;
      assert.ok(line.includes(needle), `${b} should be drawn in the '${s.id}' section (looked for ${needle})`);
    }
  }
  // and nothing is drawn in a section that does not list it
  for (const m of src.matchAll(/sf\('(panel\.macro\.[a-z]+)'/g)) assert.ok(ALL_BLOCKS.includes(m[1]), `${m[1]} drawn but not in macroSubtabs.js`);
});

test('the lazy feeds are not also page-load feeds, and nothing another tab or map layer reads went lazy', () => {
  const loadAt = html.indexOf('async function loadEnrich()');
  const eager = html.slice(loadAt, html.indexOf('function slot(sec, id)'));
  for (const f of Object.values(SUB_FEEDS).flat()) assert.ok(!eager.includes(`'${f}'`), `${f} is a section feed AND on the page-load list`);
  // the Overview map layers and the other tabs read these: they must stay on the page-load list
  for (const f of ['world-rates', 'fed-path', 'global-yields', 'bank-credit', 'world-stress']) assert.ok(eager.includes(`'${f}'`), `${f} must stay on the page-load list (map layers read it)`);
  for (const f of ['fair-value', 'cb-board', 'macro-engines-board']) assert.ok(eager.includes(`'${f}'`), `${f} must stay loaded on page load (js/terminal/mapLayers.js reads it)`);
  const lazy = Object.values(SUB_FEEDS).flat();
  assert.equal(new Set(lazy).size, lazy.length, 'a feed is listed under two sections');
  for (const sub of SUB_IDS) assert.ok(SUB_FEEDS[sub], `${sub} has no feed list (use [] if it needs none)`);
});

test('hash: #macro/rates, #macro/rates/fedyields, #macro/fedyields, junk', () => {
  assert.deepEqual(parseHash('#macro/rates'), { sub: 'rates', block: null });
  assert.deepEqual(parseHash('#macro/rates/fedyields'), { sub: 'rates', block: 'panel.macro.fedyields' });
  assert.deepEqual(parseHash('#macro/fedyields'), { sub: 'rates', block: 'panel.macro.fedyields' });
  assert.deepEqual(parseHash('#macro'), { sub: null, block: null });
  assert.equal(parseHash('#pair=EURUSD'), null);
  assert.equal(parseHash(''), null);
  assert.deepEqual(parseHash('#macro/nonsense'), { sub: null, block: null });
  assert.equal(hashFor('credit'), '#macro/credit');
  assert.deepEqual(parseHash('#macro/engine'), { sub: 'engine', block: null });
  assert.deepEqual(parseHash('#macro/biasengine'), { sub: 'engine', block: 'panel.macro.biasengine' });
  assert.equal(hashFor('rates', 'panel.macro.fedyields'), '#macro/rates/fedyields');
  for (const s of MACRO_SUBS) assert.equal(parseHash(hashFor(s.id)).sub, s.id);
  for (const b of ALL_BLOCKS) assert.deepEqual(parseHash(hashFor(BLOCK_SUB[b], b)), { sub: BLOCK_SUB[b], block: b });
});

test('which section opens: the hash, else the remembered one, else the first visible; never a hidden one', () => {
  const all = SUB_IDS;
  assert.equal(pickSub({ hash: '#macro/economy', saved: 'credit', visible: all }), 'economy');
  assert.equal(pickSub({ hash: '', saved: 'credit', visible: all }), 'credit');
  assert.equal(pickSub({ hash: '', saved: '', visible: all }), 'policy');
  assert.equal(pickSub({ hash: '#macro/economy', saved: 'credit', visible: ['policy', 'credit'] }), 'credit', 'a hidden section in the hash falls back');
  assert.equal(pickSub({ hash: '', saved: 'nope', visible: ['rates'] }), 'rates');
  assert.equal(pickSub({ hash: '', saved: '', visible: [] }), null);
});

test('a section whose blocks are all switched off is hidden; one on block keeps it', () => {
  const off = new Set(MACRO_SUBS.find(s => s.id === 'economy').blocks);
  assert.ok(!visibleSubs(id => !off.has(id)).includes('economy'));
  assert.deepEqual(visibleSubs(() => true), SUB_IDS);
  const oneOn = id => id === 'panel.macro.gpr';
  assert.deepEqual(visibleSubs(oneOn), ['markets']);
  assert.deepEqual(visibleSubs(() => false), []);
});

test('pills: a tablist with the active one selected and keyboard stepping that wraps', () => {
  const h = pillsHtml('rates');
  assert.match(h, /role="tablist"/);
  assert.equal((h.match(/role="tab"/g) ?? []).length, SUB_IDS.length);
  assert.ok(h.includes('data-msub="engine"'), 'the Bias engine section has a pill');
  assert.match(h, /data-msub="rates"[^>]*>/);
  assert.match(h, /id="msubtab-rates" aria-selected="true"/);
  assert.match(h, /id="msubtab-policy" aria-selected="false"/);
  assert.ok(!pillsHtml('rates', ['policy', 'rates']).includes('data-msub="credit"'));
  assert.equal(stepSub('policy', 1), 'rates');
  assert.equal(stepSub('markets', 1), 'engine');
  assert.equal(stepSub('engine', 1), 'policy');
  assert.equal(stepSub('policy', -1), 'engine');
  assert.equal(stepSub('rates', 1, ['rates']), 'rates');
  assert.equal(stepSub('x', 1, []), null);
  assert.match(pillsHtml('policy'), /Credit &amp; liquidity/, 'labels are escaped');
});

test('feeds a section still needs, and block lookup by short id', () => {
  assert.deepEqual(missingFeeds('rates', {}), SUB_FEEDS.rates);
  assert.deepEqual(missingFeeds('rates', { 'rates-board': {}, 'curve-board': { ok: false } }), ['term-premium', 'rates-extra']);
  assert.deepEqual(missingFeeds('credit', { 'funding-read': null }).includes('funding-read?spark=0'), false, 'a failed feed (null) is landed, not missing');
  assert.equal(subOfBlock('fedyields'), 'rates');
  assert.equal(subOfBlock('panel.macro.gpr'), 'markets');
  assert.equal(subOfBlock('nothing'), null);
});

test('the shell keeps what the Macro tab needs: pills row, tabpanel, hash and remembered section, openMacroBoard, phone-safe pill row', () => {
  for (const needle of ['id="msubs"', 'id="msub" role="tabpanel"', 'globalThis.openMacroBoard', "localStorage.getItem('deskMacroSub')", "localStorage.setItem('deskMacroSub'", "addEventListener('hashchange'", '.msub-pills{flex-wrap:nowrap;overflow-x:auto']) {
    assert.ok(html.includes(needle), `desk-terminal.html lost: ${needle}`);
  }
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(html.slice(html.indexOf('.msub-pills{'), html.indexOf('.msub-pills{') + 400)), 'the pill CSS must use theme tokens only');
});
