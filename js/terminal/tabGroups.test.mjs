// node --test js/terminal/tabGroups.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GROUPS, groupOf, pillsFor, visibleGroups } from './tabGroupsCore.js';

const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
const nav = html.slice(html.indexOf('id="tabs"'), html.indexOf('</nav>', html.indexOf('id="tabs"')));
const tabs = [...nav.matchAll(/<button[^>]*data-t="([\w-]+)"/g)].map(m => m[1]);

test('every tab button in the page is under exactly one nav group, and every grouped id is a real tab (nothing lost, nothing invented)', () => {
  assert.ok(tabs.length >= 20, 'found the tab buttons');
  const seen = GROUPS.flatMap(g => g.tabs);
  assert.equal(new Set(seen).size, seen.length, 'a tab is in two groups');
  for (const t of tabs) assert.ok(seen.includes(t), `tab "${t}" is in no nav group, so it would vanish from the navigation`);
  for (const t of seen) assert.ok(tabs.includes(t), `group lists "${t}", which is not a tab button`);
});
test('group lookups and visibility under access rules', () => {
  assert.equal(groupOf('pair'), 'markets');
  assert.equal(groupOf('today'), 'chain');       // the tab called today is the Chain
  assert.equal(groupOf('nope'), null);
  assert.deepEqual(pillsFor('markets', new Set(['deep', 'kchart'])), ['assets', 'pair', 'monitor']);
  assert.ok(!visibleGroups(new Set(['bprocess', 'workspace', 'infomap', 'media'])).some(g => g.id === 'tools'));
  assert.ok(visibleGroups().length === GROUPS.length);
});
