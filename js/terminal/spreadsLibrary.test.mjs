// js/terminal/spreadsLibrary.test.mjs: the X-versus-Y library keeps its promises. node --test js/terminal/spreadsLibrary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAIRS, BY_ID, GENERAL_EV, NOT_HELD, WALL_IDS, EDUCATORS } from './spreadsLibrary.js';
import { BY_KEY } from './insightSeries.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

test('ids are unique and every pair says what it is, what up and down mean, and which group it belongs to', () => {
  assert.equal(new Set(PAIRS.map(p => p.id)).size, PAIRS.length);
  for (const p of PAIRS) { for (const k of ['label', 'short', 'group', 'what', 'up', 'down']) assert.ok(String(p[k] ?? '').length > 3, `${p.id}.${k}`); assert.ok(['ratio', 'diff', 'level'].includes(p.op), p.id); }
});
test('every leg is a series the Insight bundle table knows, and a diff is only ever between two rate-kind series', () => {
  for (const p of PAIRS) {
    assert.ok(BY_KEY[p.x], `${p.id}: x ${p.x} is not in insightSeries`);
    if (p.op === 'level') assert.equal(p.y, null, p.id); else assert.ok(BY_KEY[p.y], `${p.id}: y ${p.y} is not in insightSeries`);
    if (p.op === 'diff') { assert.equal(BY_KEY[p.x].kind, 'rate', p.id); assert.equal(BY_KEY[p.y].kind, 'rate', p.id); }
  }
});
test('every Evidence Book id the library names exists in the book (a renamed id would silently drop a chip)', () => {
  const ids = new Set(DESK_EVIDENCE.map(e => e.id));
  for (const p of PAIRS) for (const r of p.ev) { assert.ok(ids.has(r.id), `${p.id}: ${r.id} is not in the Evidence Book`); assert.ok(r.about.length > 10, `${p.id}/${r.id} needs an "about"`); }
  for (const r of GENERAL_EV) assert.ok(ids.has(r.id), r.id);
  for (const h of NOT_HELD) for (const id of h.ev) assert.ok(ids.has(id), `${h.id}: ${id}`);
});
test('the verdict word is never stored in the library: it is read from the book', () => {
  for (const p of PAIRS) for (const r of p.ev) assert.deepEqual(Object.keys(r).sort(), ['about', 'id']);
});
test('every quote is attributed, and carries its source', () => {
  for (const p of PAIRS) for (const s of p.say) { assert.ok(s.who && s.text.length > 12 && s.src.length > 8, `${p.id}: ${JSON.stringify(s).slice(0, 80)}`); assert.equal(typeof s.verbatim, 'boolean'); }
  assert.ok(Object.values(EDUCATORS).length >= 6);
});
test('the wall holds 12 distinct rows and never ranks a shared or mostly-something-else count', () => {
  assert.equal(WALL_IDS.length, 12); assert.equal(new Set(WALL_IDS).size, 12);
  for (const id of WALL_IDS) { assert.ok(BY_ID[id], id); assert.ok(!BY_ID[id].mentions.shared && !BY_ID[id].mentions.note, `${id} should not be on the wall by a shared or noisy count`); }
});
test('what we cannot draw is listed with the reason and never invented', () => {
  assert.ok(NOT_HELD.length >= 4);
  for (const h of NOT_HELD) { assert.ok(h.label && h.said && h.why.length > 30, h.id); assert.ok(!PAIRS.some(p => p.id === h.id), `${h.id} is both held and not held`); }
});
test('no pair is worded as a trade or a prediction', () => {
  const text = JSON.stringify(PAIRS.map(p => [p.what, p.up, p.down]));
  assert.ok(!/\b(buy|sell|go long|go short|will rise|will fall|signal)\b/i.test(text));
});
