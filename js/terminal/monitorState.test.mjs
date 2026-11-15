// node --test js/terminal/monitorState.test.mjs: the Monitor controller (open, add, remove, move, save, delete, memory, offline).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitorState, LOCAL_KEY } from './monitorState.js';
import { STARTERS, MAX_ITEMS } from './monitorCore.js';

const store = () => { const m = new Map(); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const api = (lists = []) => { const o = { lists, posts: [], list: async () => ({ ok: true, lists: o.lists }), post: async b => { o.posts.push(b); if (b.action === 'save') o.lists = [...o.lists.filter(l => l.name !== b.name), { name: b.name, items: b.items }]; else o.lists = o.lists.filter(l => l.name !== b.name); return { ok: true, lists: o.lists }; } }; return o; };

test('starts on the first starter; add / remove / move change the open monitor and mark it unsaved', async () => {
  const st = createMonitorState({ api: api(), store: store() }); await st.init();
  assert.equal(st.current.name, STARTERS[0].name); assert.equal(st.dirty, false);
  assert.equal(st.add('gold').ok, true); assert.equal(st.current.items.at(-1), 'GOLD'); assert.equal(st.dirty, true);
  assert.equal(st.add('gold').ok, false, 'no repeat'); assert.match(st.add('zzz').error, /not a market/);
  st.move('GOLD', -1); assert.equal(st.current.items.at(-2), 'GOLD');
  st.move('EURUSD', -1); assert.equal(st.current.items[0], 'EURUSD', 'moving the first one up does nothing');
  st.removeItem('GOLD'); assert.ok(!st.current.items.includes('GOLD'));
});
test('the cap on markets is enforced', async () => {
  const st = createMonitorState({ api: api(), store: store(), known: () => true }); await st.init();
  for (let i = 0; i < MAX_ITEMS; i++) st.add(`M${i}`);
  assert.equal(st.current.items.length, MAX_ITEMS); assert.match(st.add('ONEMORE').error, /At most/);
});
test('save needs a name of your own, then shares it; delete keeps the open markets', async () => {
  const a = api(), st = createMonitorState({ api: a, store: store() }); await st.init();
  assert.equal((await st.save()).needName, true); assert.equal((await st.save('FX majors')).needName, true);
  st.add('NQ'); assert.equal((await st.save('Mine')).ok, true);
  assert.equal(st.current.source, 'saved'); assert.equal(st.dirty, false); assert.equal(a.posts[0].items.at(-1), 'NQ');
  assert.equal((await st.remove()).ok, true); assert.equal(st.current.source, 'new'); assert.ok(st.current.items.includes('NQ'));
  assert.match((await st.remove()).error, /starter|saved/);
});
test('this browser remembers the open monitor; markets that no longer exist are dropped with a note', async () => {
  const s = store(), st = createMonitorState({ api: api(), store: s }); await st.init(); st.add('GOLD');
  const st2 = createMonitorState({ api: api(), store: s }); await st2.init();
  assert.ok(st2.current.items.includes('GOLD')); assert.equal(st2.dirty, true);
  s.m.set(LOCAL_KEY, JSON.stringify({ name: 'X', source: 'new', items: ['NQ', 'GONE'] }));
  const st3 = createMonitorState({ api: api(), store: s }); await st3.init();
  assert.deepEqual(st3.current.items, ['NQ']); assert.match(st3.note, /left out/);
});
test('offline or a corrupt store: the starters still work', async () => {
  const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const st = createMonitorState({ api: { list: async () => { throw new Error('down'); }, post: async () => { throw new Error('down'); } }, store: bad });
  await st.init(); assert.equal(st.current.name, STARTERS[0].name); assert.match(st.note, /could not be reached/);
  assert.equal((await st.save('Mine')).ok, false);
  assert.equal(st.load('indices').ok, true); assert.equal(st.current.name, STARTERS[1].name);
  assert.equal(st.load('zzz').ok, false);
});
