import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, COMPANION, ENGINE_TOOLS, labelOf, sectionOf, itemsFor, activeSection } from './jarvisNav.js';

test('sections: six, unique ids, every item belongs to exactly one section, every section has a home that is one of its items', () => {
  assert.equal(SECTIONS.length, 6); assert.equal(new Set(SECTIONS.map(s => s.id)).size, 6);
  const seen = new Set();
  for (const s of SECTIONS) {
    assert.ok(s.label && s.hint && s.items.length >= 2, s.id);
    assert.ok(s.items.some(i => i[0] === s.home[0] && i[1] === s.home[1]), `${s.id}: home must be one of its items`);
    for (const [k, id, label] of s.items) { const key = `${k}:${id}`; assert.ok(!seen.has(key), `${key} appears in two sections`); seen.add(key); assert.ok(label && label === label.toUpperCase(), key); }
  }
});
test('every picture and panel the HUD ships is reachable from some section', () => {
  const views = ['globe', 'candles', 'bubbles', 'skyline', 'orbit', 'session', 'wx', 'net', 'chainfly', 'yields', 'ccy', 'vol', 'gamma', 'book'];
  const tools = ['broadcast', 'news', 'film', 'media', 'markets', 'radar', 'brief', 'precedent', 'ask', 'explain', 'papers', 'alerts', 'system'];
  for (const v of views) assert.ok(sectionOf('view', v), `view ${v} has no section`);
  for (const t of tools) assert.ok(sectionOf('tool', t), `tool ${t} has no section`);
});
test('WATCH holds ONE morning programme: the broadcast; SHOW is an engine with no button that still lands in WATCH', () => {
  const w = SECTIONS.find(s => s.id === 'watch');
  assert.deepEqual(w.home, ['tool', 'broadcast']); assert.equal(labelOf('tool', 'broadcast'), 'MORNING SHOW');
  assert.equal(sectionOf('tool', 'show'), null, 'no second morning-show button');
  assert.equal(w.items.filter(i => /MORNING/.test(i[2])).length, 1);
  assert.equal(ENGINE_TOOLS.show, 'watch'); assert.equal(activeSection('show', 'candles').id, 'watch', 'the NEWSLETTER playing through SHOW keeps WATCH lit');
});
test('companions point at real panels; labelOf and sectionOf agree; itemsFor leaves out what is not registered', () => {
  for (const [v, t] of Object.entries(COMPANION)) { assert.ok(sectionOf('view', v), v); if (t) assert.ok(sectionOf('tool', t), `${v} companion ${t}`); }
  assert.equal(labelOf('view', 'candles'), 'MARKET BOARD'); assert.equal(sectionOf('view', 'candles').id, 'markets'); assert.equal(labelOf('view', 'nope'), null);
  const mk = SECTIONS.find(s => s.id === 'markets'), only = itemsFor(mk, (k, id) => id === 'candles' || id === 'markets');
  assert.deepEqual(only.map(x => x.id), ['candles', 'markets']);
});
test('activeSection: an open panel wins, otherwise the picture decides; unknown falls back to Markets', () => {
  assert.equal(activeSection('ask', 'candles').id, 'ask'); assert.equal(activeSection('chain', 'yields').id, 'macro'); assert.equal(activeSection(null, 'gamma').id, 'pos'); assert.equal(activeSection('chain', 'zzz').id, 'markets');
  assert.equal(activeSection('markets', 'yields').id, 'markets');
});
