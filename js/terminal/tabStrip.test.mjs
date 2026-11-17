// js/terminal/tabStrip.test.mjs: flow review item 6 (2026-11-16): the terminal's tab strip is grouped and reordered; nothing is lost or renamed under the hood.
// Reads the page source; the look (wrapping, the phone row) is an owner click-through. node --test js/terminal/tabStrip.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
const nav = html.slice(html.indexOf('<nav class="tabs"'), html.indexOf('</nav>', html.indexOf('<nav class="tabs"')));
const groups = [...nav.matchAll(/<div class="tabgrp"[^>]*data-grp="(\w+)">([\s\S]*?)\n    <\/div>/g)].map(m => ({ name: m[1], tabs: [...m[2].matchAll(/data-t="(\w+)"/g)].map(x => x[1]), link: /class="tablink"/.test(m[2]) }));
const order = groups.flatMap(g => g.tabs);

test('six groups, every tab button in exactly one of them, none lost', () => {
  assert.deepEqual(groups.map(g => g.name), ['today', 'markets', 'macro', 'analysis', 'charts', 'tools']);
  const all = [...nav.matchAll(/<button role="tab"[^>]*data-t="(\w+)"/g)].map(m => m[1]);
  assert.equal(order.length, all.length); assert.equal(new Set(order).size, order.length);
  assert.deepEqual([...order].sort(), [...all].sort());
  for (const t of all) assert.match(html, new RegExp(`<section id="${t}"[^>]* data-surface="tab\\.`), `section for ${t}`);
});
test('the review\'s moves: Changed beside Overview, Monitor beside Assets, Replay beside Chart, the owner tools at the end', () => {
  const at = t => order.indexOf(t);
  assert.equal(at('changed'), at('overview') + 1);
  assert.equal(at('monitor'), at('assets') + 1);
  assert.equal(at('replay'), at('kchart') + 1);
  assert.ok(at('read') > at('replay') && at('workspace') > at('read') && at('infomap') > at('workspace'));
  assert.deepEqual(groups.at(-1).tabs, ['read', 'workspace', 'infomap']); assert.ok(groups.at(-1).link, 'the Research link stays in the Tools group');
  assert.ok(at('deep') === at('pair') + 1, 'the Deep dive sits right after Pair');
});
test('every tab keeps its id and surface id (Access switches and saved state are unchanged)', () => {
  for (const [t, s] of [['overview', 'tab.overview'], ['ccy', 'tab.ccy'], ['assets', 'tab.assets'], ['macro', 'tab.macro'], ['pos', 'tab.pos'], ['cal', 'tab.cal'], ['ana', 'tab.ana'], ['charts', 'tab.charts'], ['today', 'tab.today'], ['read', 'tab.read'], ['pair', 'tab.pair'], ['changed', 'tab.changed'], ['replay', 'tab.replay'], ['monitor', 'tab.monitor'], ['workspace', 'tab.workspace'], ['kchart', 'tab.kchart'], ['insight', 'tab.insight'], ['bprocess', 'tab.bprocess'], ['options', 'tab.options'], ['news', 'tab.news'], ['corr', 'tab.corr'], ['infomap', 'tab.infomap']])
    assert.match(nav, new RegExp(`data-t="${t}" data-surface="${s.replace('.', '\\.')}"`));
});
test('a group with every tab switched off disappears, and the phone gets one scrolling row, not three', () => {
  assert.match(html, /function tabGroups\(\)/); assert.match(html, /addEventListener\('deskaccess', tabGroups\)/);
  assert.match(html, /@media \(max-width:820px\)\{\.tabs\{flex-wrap:nowrap;overflow-x:auto;width:100%/);
  assert.match(html, /\.tabs \.tabgrp:not\(\[data-first\]\)\{border-left:1px solid var\(--line\)/);
  assert.match(nav, /role="presentation"/, 'the groups do not break the tablist semantics');
});
