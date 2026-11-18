// node --test js/terminal/myPanelsCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, cssFor, toggled, rowsFor, tabOf, MAX_HIDDEN } from './myPanelsCore.js';

const SURF = [{ id: 'panel.macro.curve', kind: 'panel', label: 'Macro: the curve through time', note: 'n1' }, { id: 'panel.macro.vol', kind: 'panel', label: 'Macro: the fear complex (vol)' },
  { id: 'panel.ov.bookintel', kind: 'panel', label: 'Overview: book intelligence' }, { id: 'tab.macro', kind: 'tab', label: 'Macro' }];
const IDS = SURF.map(s => s.id);

test('sanitize keeps only registered ids, once each, and survives bad input', () => {
  assert.deepEqual(sanitize({ hidden: ['panel.macro.vol', 'panel.macro.vol', 'panel.gone', 7, 'tab.macro'] }, IDS).hidden, ['panel.macro.vol', 'tab.macro']);
  assert.deepEqual(sanitize('{not json', IDS), { v: 1, hidden: [] });
  assert.deepEqual(sanitize(null, IDS).hidden, []);
  assert.ok(sanitize({ hidden: Array.from({ length: 500 }, (_, i) => `x${i}`) }, Array.from({ length: 500 }, (_, i) => `x${i}`)).hidden.length <= MAX_HIDDEN);
});
test('cssFor is one display:none rule per id and refuses anything that is not an id', () => {
  assert.equal(cssFor(['panel.macro.vol']), '[data-surface="panel.macro.vol"]{display:none!important}');
  assert.equal(cssFor(['a"]{x:y}']), '');
  assert.equal(cssFor([]), '');
});
test('toggled hides and shows without duplicating', () => {
  let h = toggled([], 'panel.macro.vol', false); h = toggled(h, 'panel.macro.vol', false); assert.deepEqual(h, ['panel.macro.vol']);
  assert.deepEqual(toggled(h, 'panel.macro.vol', true), []);
});
test('rowsFor lists the panels on that tab in page order, once, labelled without the tab prefix, with their state', () => {
  const r = rowsFor('macro', ['panel.macro.vol', 'panel.ov.bookintel', 'panel.macro.curve', 'panel.macro.vol', 'panel.nope'], SURF, ['panel.macro.curve']);
  assert.deepEqual(r.map(x => [x.id, x.label, x.shown]), [['panel.macro.vol', 'the fear complex (vol)', true], ['panel.macro.curve', 'the curve through time', false]]);
  assert.equal(tabOf('panel.asset.x'), 'assets'); assert.equal(tabOf('widget.x'), null);
});
