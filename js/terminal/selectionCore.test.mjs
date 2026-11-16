// js/terminal/selectionCore.test.mjs: the shared selection (state, validation, persistence). node --test js/terminal/selectionCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelection, cleanSel, ccyLegs, describeSel, SEL_KEY, LINK_KEY } from './selectionCore.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('cleanSel keeps only valid parts and upper-cases the market', () => {
  assert.deepEqual(cleanSel({ inst: ' nq ', tf: '15m', date: '2026-11-12', ts: 1763000000000.4 }), { inst: 'NQ', tf: '15m', date: '2026-11-12', ts: 1763000000000 });
  assert.deepEqual(cleanSel({ inst: 'bad market!', tf: '2m', date: '12/11/2026', ts: -5, extra: 1 }), {});
  assert.deepEqual(cleanSel({ date: '2026-13-45' }), {});
  assert.deepEqual(cleanSel(null), {}); assert.deepEqual(cleanSel('NQ'), {});
});

test('set merges, reports exactly what changed, and tells subscribers once', () => {
  const sel = createSelection({ store: mem() }), seen = [];
  sel.subscribe(e => seen.push(e));
  assert.deepEqual(sel.set({ inst: 'eurusd' }, 'ui'), ['inst']);
  assert.deepEqual(sel.set({ inst: 'EURUSD' }, 'ui'), []);          // same value: nobody is told
  assert.deepEqual(sel.set({ tf: '4h', inst: 'GOLD' }, 'cmd').sort(), ['inst', 'tf']);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].source, 'cmd'); assert.deepEqual(seen[1].sel, { inst: 'GOLD', tf: '4h' });
  assert.deepEqual(sel.get(), { inst: 'GOLD', tf: '4h' });
});

test('a new market keeps the moment; a new date drops the old moment; a date with its own moment keeps it', () => {
  const sel = createSelection({ store: mem() });
  sel.set({ inst: 'NQ', date: '2026-11-12', ts: 1000 });
  sel.set({ inst: 'GOLD' });
  assert.deepEqual(sel.get(), { inst: 'GOLD', date: '2026-11-12', ts: 1000 });
  const ch = sel.set({ date: '2026-11-11' });
  assert.deepEqual(sel.get(), { inst: 'GOLD', date: '2026-11-11' }); assert.ok(ch.includes('ts'));
  sel.set({ date: '2026-11-10', ts: 2000 });
  assert.deepEqual(sel.get(), { inst: 'GOLD', date: '2026-11-10', ts: 2000 });
});

test('the selection and the link state are remembered, and bad stored data is ignored', () => {
  const s = mem();
  const a = createSelection({ store: s });
  a.set({ inst: 'NQ', tf: '5m' }); a.setLinked(false);
  const b = createSelection({ store: s });
  assert.deepEqual(b.get(), { inst: 'NQ', tf: '5m' }); assert.equal(b.linked(), false);
  s.setItem(SEL_KEY, '{not json'); assert.deepEqual(createSelection({ store: s }).get(), {});
  s.setItem(SEL_KEY, JSON.stringify({ inst: 'x y', tf: 'no' })); assert.deepEqual(createSelection({ store: s }).get(), {});
  s.setItem(LINK_KEY, 'on'); assert.equal(createSelection({ store: s }).linked(), true);
});

test('a blocked store never throws and the selection still works for the page', () => {
  const sel = createSelection({ store: blocked });
  assert.doesNotThrow(() => sel.set({ inst: 'NQ' }));
  assert.equal(sel.get().inst, 'NQ');
  assert.doesNotThrow(() => sel.setLinked(false)); assert.equal(sel.linked(), false);
  assert.equal(createSelection({ store: null }).linked(), true);
});

test('setLinked tells subscribers only on a real change; one failing listener does not stop the others', () => {
  const sel = createSelection({ store: mem() }); let n = 0, m = 0;
  sel.subscribe(() => { throw new Error('boom'); }); sel.subscribe(e => { if (e.changed.includes('linked')) n++; m++; });
  sel.setLinked(true); assert.equal(n, 0);
  sel.setLinked(false); assert.equal(n, 1); assert.equal(m, 1);
  const off = sel.subscribe(() => { m += 100; }); off(); sel.setLinked(true); assert.equal(m, 2);
});

test('ccyLegs and describeSel', () => {
  assert.deepEqual(ccyLegs('EURUSD'), ['EUR', 'USD']); assert.deepEqual(ccyLegs('USDNOK'), ['USD', 'NOK']);
  assert.deepEqual(ccyLegs('NQ'), []); assert.deepEqual(ccyLegs('GOLD'), []); assert.deepEqual(ccyLegs(null), []);
  assert.equal(describeSel({}), 'nothing picked yet');
  assert.equal(describeSel({ inst: 'NQ', tf: '1h' }), 'NQ · 1h');
  assert.equal(describeSel({ inst: 'NQ', date: '2026-11-12', ts: 1, tf: '15m' }, { londonHM: () => '14:30' }), 'NQ · 12 Nov 14:30 · 15m');
});
