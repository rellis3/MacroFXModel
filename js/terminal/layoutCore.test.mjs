// node --test js/terminal/layoutCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLayout, sanitize, arrange, recordMove, moveStep, moveTo, effective, hideCss, validateShared } from './layoutCore.js';

const A = 'panel.ov.a', B = 'panel.ov.b', C = 'panel.ov.c', D = 'panel.ov.d';
test('arrange puts ranked panels in the wanted order inside the slots they occupy; unranked panels keep their place', () => {
  assert.deepEqual(arrange([A, B, C, D], [[C, A]]), [C, B, A, D]);          // A and C swap slots, B and D stay
  assert.deepEqual(arrange([A, B, C], [[C, B, A]]), [C, B, A]);
  assert.deepEqual(arrange([A, B, C], []), [A, B, C]);
  assert.deepEqual(arrange([A, B], [[C, D]]), [A, B]);                      // a group about another container does nothing
  assert.deepEqual(arrange([A, B, C], [[B]]), [A, B, C]);                   // one shared panel is not an order
});
test('a panel that was never in the layout (new, or switched on later) does not move the others', () => {
  assert.deepEqual(arrange([A, 'panel.ov.new', B, C], [[C, B, A]]), [C, 'panel.ov.new', B, A]);
});
test('recordMove replaces the overlapping group, keeps the other containers', () => {
  const g = recordMove([[A, B], [C, D]], [B, A, 'panel.ov.e']);
  assert.deepEqual(g, [[C, D], [B, A, 'panel.ov.e']]);
  assert.deepEqual(recordMove([], [A]), []);                                // one panel is nothing to record
});
test('moveStep and moveTo', () => {
  assert.deepEqual(moveStep([A, B, C], B, -1), [B, A, C]);
  assert.deepEqual(moveStep([A, B, C], A, -1), [A, B, C]);
  assert.deepEqual(moveStep([A, B, C], C, 1), [A, B, C]);
  assert.deepEqual(moveTo([A, B, C, D], D, B), [A, D, B, C]);
  assert.deepEqual(moveTo([A, B, C, D], A, C, true), [B, C, A, D]);
  assert.deepEqual(moveTo([A, B], A, 'panel.x.y'), [A, B]);
});
test('sanitize drops bad ids, tiny groups, odd tab names and bad json, and only keeps registered ids when told', () => {
  assert.deepEqual(sanitize('{not json'), { v: 1, tabs: {} });
  const s = sanitize({ tabs: { overview: { groups: [[A, B, 'nope', A], [C]], hidden: [D, D, '<x>'] }, 'bad tab!': { groups: [[A, B]] } } });
  assert.deepEqual(s.tabs, { overview: { groups: [[A, B]], hidden: [D] } });
  assert.deepEqual(cleanLayout({ groups: [[A, B, C]] }, [A, C]).groups, [[A, C]]);   // only registered ids stay
});
test('effective: mine beats shared beats the page; hideCss is a plain rule per id', () => {
  const mine = { tabs: { overview: { groups: [[A, B]], hidden: [] } } }, shared = { overview: { groups: [[B, A]], hidden: [C] }, macro: { groups: [[A, B]], hidden: [] } };
  assert.equal(effective(mine, shared, 'overview').source, 'mine');
  assert.equal(effective(mine, shared, 'macro').source, 'shared');
  assert.equal(effective(mine, shared, 'pair').source, 'default');
  assert.equal(hideCss([C]), '[data-surface="panel.ov.c"]{display:none!important}');
  assert.equal(hideCss(['x" onload="']), '');
});
test('validateShared accepts a good layout, a clear, and refuses empty or badly named', () => {
  assert.equal(validateShared({ tab: 'overview', layout: { groups: [[A, B]] } }).ok, true);
  assert.deepEqual(validateShared({ tab: 'overview', clear: true }), { ok: true, tab: 'overview', layout: null });
  assert.equal(validateShared({ tab: 'overview', layout: { groups: [] } }).ok, false);
  assert.equal(validateShared({ tab: '../x', layout: { groups: [[A, B]] } }).ok, false);
});
