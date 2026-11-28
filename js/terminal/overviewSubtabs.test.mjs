// js/terminal/overviewSubtabs.test.mjs: the Overview sections' rules (pure) and the guard that every Overview block sits in exactly one section.
// node --test js/terminal/overviewSubtabs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES, surfaceById } from './tabRegistry.js';
import { OV_SUBS, OV_NOT_BLOCKS, OV_PINNED, HERO_LS, heroFolded, heroGroup, TODAY_ONLY_EXTRAS, ALL_BLOCKS, BLOCK_SUB, SUB_IDS, SURFACE, visibleSubs, parseHash, hashFor, pickSub, pillsHtml, stepSub, edgeSub, subOfBlock } from './overviewSubtabs.js';

test('every Overview surface is in exactly one section, or is one of the named non-blocks', () => {
  const ov = SURFACES.filter(s => s.id.startsWith('panel.ov.') || s.id === 'tab.overview').map(s => s.id);
  for (const id of ov) {
    const inSubs = OV_SUBS.filter(s => s.blocks.includes(id)).length;
    if (OV_NOT_BLOCKS.includes(id) || OV_PINNED.includes(id)) assert.equal(inSubs, 0, `${id} is not a section block (named non-block, or pinned above the pills), so it is in no section`);
    else assert.equal(inSubs, 1, `${id} must be in exactly one section (overviewSubtabs.js); it is in ${inSubs}`);
  }
});
test('a section names only registered Overview surfaces, and none twice', () => {
  const seen = new Set();
  for (const b of ALL_BLOCKS) {
    assert.ok(surfaceById(b), `${b} is a registered surface`);
    assert.ok(b.startsWith('panel.ov.'), `${b} is an Overview block`);
    assert.ok(!seen.has(b), `${b} is in one section only`); seen.add(b);
  }
  assert.equal(ALL_BLOCKS.length, new Set(ALL_BLOCKS).size);
});
test('the switch is a preview surface hidden from the desk login by default, and the section ids, aliases and labels are unique', () => {
  assert.equal(surfaceById(SURFACE)?.hidden, 'preview');
  assert.equal(surfaceById(SURFACE)?.defaultVisible, false);
  assert.equal(new Set(SUB_IDS).size, SUB_IDS.length);
  assert.equal(new Set(OV_SUBS.map(s => s.alias)).size, OV_SUBS.length);
  assert.deepEqual(SUB_IDS, ['today', 'currencies', 'risk', 'news', 'desk']);
});
test('trade, P&L and internal blocks are only ever shown by a section when the registry already allows them: a section never un-hides anything', () => {
  // the blocks a desk login must not see stay hidden by the registry stylesheet (display:none !important on [data-surface]); a section only adds a class that HIDES
  const css = new URL('./overview-sections.css', import.meta.url);
  const text = (globalThis.process ? import('node:fs').then(m => m.readFileSync(css, 'utf8')) : Promise.resolve(''));
  return text.then(t => {
    const rest = t.replace(/\.ovs-pills[^}]*\}/g, '').replace(/\.ovs-herobar \{[^}]*\}/g, '').replace(/#overview\.ovs-on:not\(\[hidden\]\) \{[^}]*\}/g, '').replace(/\.rfs-[^{]*\{[^}]*\}/g, '');
    assert.ok(!/display\s*:\s*(block|flex|grid)/.test(rest), 'the section css never sets display to a visible value on a block (only the flex column of #overview itself, not while it is hidden, and the pills and the fold bar)');
    assert.ok(/#overview\.ovs-on:not\(\[hidden\]\)/.test(t), 'the flex column never overrides the hidden attribute that switches tabs');
    assert.ok(/#overview \.sfc\.ovs-off/.test(t), 'the hiding class is scoped to #overview');
  });
});
test('visibleSubs: a section with every block off is not offered', () => {
  const off = new Set(['panel.ov.wire', 'panel.ov.releases']);
  assert.ok(!visibleSubs(id => !off.has(id)).includes('news'));
  assert.deepEqual(visibleSubs(() => true), SUB_IDS);
  assert.deepEqual(visibleSubs(() => false), []);
  // a desk login: the trade/pnl/internal blocks are off, so The desk keeps only book intelligence
  const desk = visibleSubs(id => !['panel.ov.record', 'panel.ov.bestpairs', 'panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.alerts'].includes(id));
  assert.ok(desk.includes('desk'));
  // narrowing to blocks that are on the page
  assert.ok(!visibleSubs(() => true, id => id !== 'panel.ov.wire' && id !== 'panel.ov.releases').includes('news'));
});
test('parseHash and hashFor', () => {
  assert.deepEqual(parseHash('#overview/currencies'), { sub: 'currencies', block: null });
  assert.deepEqual(parseHash('#overview/priceread'), { sub: 'currencies', block: 'panel.ov.priceread' });
  assert.deepEqual(parseHash('#overview'), { sub: null, block: null });
  assert.deepEqual(parseHash('#OVERVIEW/Risk'), { sub: 'risk', block: null });
  assert.equal(parseHash('#overview/nonsense').sub, null);
  assert.equal(parseHash('#macro/rates'), null);
  assert.equal(parseHash('#pair=GOLD'), null);
  assert.equal(hashFor('news'), '#overview/news');
  assert.equal(hashFor('x'), '#overview/today');
});
test('pickSub: the hash wins, then the saved one, then the first visible; always a visible section', () => {
  assert.equal(pickSub({ hash: '#overview/risk', saved: 'news' }), 'risk');
  assert.equal(pickSub({ hash: '', saved: 'news' }), 'news');
  assert.equal(pickSub({ hash: '', saved: 'zzz' }), 'today');
  assert.equal(pickSub({ hash: '#overview/risk', saved: 'news', visible: ['today', 'desk'] }), 'today');
  assert.equal(pickSub({ hash: '', saved: '', visible: [] }), null);
});
test('pillsHtml: one pill per visible section, the open one pressed; fewer than two sections means no row; labels escaped', () => {
  const h = pillsHtml('currencies');
  for (const id of SUB_IDS) assert.ok(h.includes(`data-ovsub="${id}"`), id);
  assert.ok(/data-ovsub="currencies"[^>]*aria-pressed="true"/.test(h) || /aria-pressed="true"[^>]*>Currencies/.test(h));
  assert.equal(pillsHtml('today', ['today']), '');
  assert.ok(h.includes('role="tablist"') && h.includes(`data-surface="${SURFACE}"`));
});
test('stepSub and edgeSub wrap and jump', () => {
  assert.equal(stepSub('today', -1), 'desk');
  assert.equal(stepSub('desk', 1), 'today');
  assert.equal(stepSub('today', 1, ['today', 'news']), 'news');
  assert.equal(stepSub('x', 1, []), null);
  assert.equal(edgeSub(false), 'today');
  assert.equal(edgeSub(true), 'desk');
});
test('subOfBlock accepts the full id or the short one', () => {
  assert.equal(subOfBlock('panel.ov.wire'), 'news');
  assert.equal(subOfBlock('wire'), 'news');
  assert.equal(subOfBlock('nope'), null);
  assert.equal(BLOCK_SUB['panel.ov.hero'], undefined, 'the map is pinned, not in a section'); assert.equal(BLOCK_SUB['panel.ov.book'], 'today');
});

test('the map is pinned: in no section, named once; the section lists do not carry it', () => {
  assert.deepEqual(OV_PINNED, ['panel.ov.hero']);
  assert.ok(!ALL_BLOCKS.includes('panel.ov.hero'));
  assert.equal(surfaceById('panel.ov.hero')?.hidden ?? null, null, 'it keeps its own surface id and Access switch, shown by default');
  assert.deepEqual(OV_SUBS.find(s => s.id === 'today').blocks, ['panel.ov.booktape', 'panel.ov.book', 'panel.ov.regime', 'panel.ov.week', 'panel.ov.riskwarn']);
});
test('the glance block and the flag-history card are Today-only: named, and hidden on the other four sections by css', async () => {
  assert.deepEqual(TODAY_ONLY_EXTRAS, ['.fl-host', '.rfs-compact']);
  const fs = await import('node:fs'), css = fs.readFileSync(new URL('./overview-sections.css', import.meta.url), 'utf8');
  for (const sel of TODAY_ONLY_EXTRAS) assert.ok(css.includes(`> ${sel}`), `${sel} is placed by the flex order rules`);
  assert.match(css, /:not\(\[data-ovs-sub="today"\]\) > \.fl-host/); assert.match(css, /:not\(\[data-ovs-sub="today"\]\) > \.rfs-compact/);
  assert.match(css, /order: 1; \}\s*\n#overview\.ovs-on > \.ovs-pills \{ order: 2/, 'the map is above the pills');
  assert.match(css, /\.fl-host \{ order: 3/); assert.match(css, /\.rfs-compact \{ order: 4/); assert.match(css, /#overview\.ovs-on > \*, #overview\.ovs-on > \.sfc > \* \{ order: 5/, "the registry wrappers are display: contents, so the order is set on their children");
});
test('heroFolded: folded by default on every section and device; the owner\'s own open or fold choice is kept, one for Today and one for the other four', () => {
  assert.equal(heroFolded('today', {}, false), true); assert.equal(heroFolded('today', {}, true), true);
  assert.equal(heroFolded('currencies', {}, false), true); assert.equal(heroFolded('desk', {}, true), true);
  assert.equal(heroFolded('risk', { other: 'open' }, true), false, 'unless the owner expanded it');
  assert.equal(heroFolded('news', { other: 'folded' }, false), true, 'or folded it themselves');
  assert.equal(heroFolded('today', { other: 'open' }, true), true, 'the other four do not change Today'); assert.equal(heroFolded('today', { today: 'open' }, false), false);
  assert.equal(heroFolded('today', null, false), true, 'a missing choice object is safe');
});
