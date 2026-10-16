import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWS, viewOf, validView, shows, ALL_VIEW } from './viewNav.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'today.html'), 'utf8');

t('every panel id in a view exists in today.html', () => {
  const missing = VIEWS.flatMap(v => v.ids).filter(id => !new RegExp(`id="${id}"`).test(html));
  assert.deepEqual(missing, []);
});
t('a panel belongs to exactly one view', () => {
  const ids = VIEWS.flatMap(v => v.ids);
  assert.equal(new Set(ids).size, ids.length);
});
t('every top-level main-col panel is assigned, so none is stranded in or out of every view', () => {
  const col = html.slice(html.indexOf('<div class="main-col">'), html.indexOf('<div class="sidebar"'));
  const top = [...col.matchAll(/\n {6}<(?:div|section)[^>]*\bid="([A-Za-z]+)"/g)].map(m => m[1]).filter(id => id !== 'vtabs');
  const loose = top.filter(id => viewOf(id) == null);
  assert.deepEqual(loose, []);
});
t('lookups', () => {
  assert.equal(viewOf('dayRead'), 'now'); assert.equal(viewOf('grid'), 'pairs'); assert.equal(viewOf('nope'), null);
  assert.equal(validView('macro'), 'macro'); assert.equal(validView('all'), ALL_VIEW); assert.equal(validView('x'), 'now'); assert.equal(validView(null), 'now');
  assert.ok(shows('macro', 'macro')); assert.ok(!shows('macro', 'now')); assert.ok(shows(null, 'now')); assert.ok(shows('macro', 'all'));
});
console.log(`viewNav: ${n} tests passed`);
