// Tests for js/deskUpdate.js (synthetic bars only).   node js/deskUpdate.test.mjs
import assert from 'node:assert/strict';
import { slotMs, marketSince, marketText, liveView, scoreUpdates } from './deskUpdate.js';
import { londonMs } from './deskScore.js';
import { validateSessionUpdate } from './deskSchemas.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const L = { open: 100, up: { p50: 101, p75: 102, p90: 103 }, down: { p50: 99, p75: 98, p90: 97 } };
const D = '2026-11-04';
// one bar a minute from 00:00 London, price a straight line a -> b over `mins` minutes
const path = (a, b, mins = 1260) => { const s = londonMs(D, 0) / 1000; return Array.from({ length: mins }, (_, i) => { const p = a + (b - a) * i / (mins - 1); return { time: s + i * 60, open: p, high: p + 0.05, low: p - 0.05, close: p }; }); };
const book = { instruments: { EURUSD: { rating: 'SHORT', size: 1, levels: L }, GOLD: { rating: 'LONG', size: 0.5, levels: L }, NQ: { rating: 'FLAT', size: 0, levels: L } } };

t('slots sit at 08:05 and 14:35 London', () => {
  assert.equal(new Date(slotMs(D, 'london')).toISOString(), '2026-11-04T08:05:00.000Z');
  assert.equal(new Date(slotMs(D, 'ny')).toISOString(), '2026-11-04T14:35:00.000Z');
});

t('market since the open: now, since 08:00, range and the lines touched, in u', () => {
  const m = marketSince(book.instruments, { EURUSD: path(100, 97.5), GOLD: path(100, 100.4) }, D, londonMs(D, 14, 35));
  assert.deepEqual(m.EURUSD, { nowU: -1.74, since8U: -0.78, highU: 0.05, lowU: -1.79, touched: ['down p50'] });   // 98.26 at 14:35: past p50 (99), short of p75 (98)
  assert.deepEqual(m.GOLD.touched, []);
  assert.equal(m.NQ, undefined, 'no bars, no row');
  assert.match(marketText(m, liveView(book, null)), /EURUSD: book SHORT size 1 · now -1\.\d+ u from the open/);
});

t('an update keeps only real, reasoned changes; the live view applies them, later slots winning; the book is untouched', () => {
  const view0 = liveView(book, null);
  const v = validateSessionUpdate({ headline: 'Short EUR done', changes: [{ instrument: 'EURUSD', to: 'SHORT', size: 0.4, why: 'p75 reached' }, { instrument: 'GOLD', to: 'LONG', why: 'same' }, { instrument: 'NQ', to: 'SHORT', why: '' }, { instrument: 'XYZ', to: 'LONG', why: 'x' }] }, view0);
  assert.deepEqual(v.value.changes, [{ instrument: 'EURUSD', to: 'SHORT', size: 0.4, why: 'p75 reached' }]);
  assert.equal(v.notes.length, 3);
  const ups = { slots: { london: { changes: v.value.changes }, ny: { changes: [{ instrument: 'EURUSD', to: 'FLAT', size: 0, why: 'gate cleared' }] } } };
  const live = liveView(book, ups);
  assert.deepEqual([live.EURUSD.rating, live.EURUSD.size, live.EURUSD.from, live.EURUSD.was], ['FLAT', 0, 'ny', 'SHORT']);
  assert.equal(book.instruments.EURUSD.rating, 'SHORT'); assert.equal(book.instruments.EURUSD.size, 1);
});

t('evening: each change scored from its update to 21:00, size-weighted, new view minus old', () => {
  const run = { head: { book } };
  // EURUSD falls 2 u from 14:35 to 21:00 London; a NY flip SHORT -> FLAT gives up that move
  const bars = { EURUSD: path(100, 98) };
  const s = scoreUpdates(run, { slots: { ny: { at: new Date(londonMs(D, 14, 35)).toISOString(), changes: [{ instrument: 'EURUSD', to: 'FLAT', size: 0, why: 'x' }] } } }, bars, D);
  const r = s.slots.ny.changes[0];
  assert.ok(r.Rold > 0.5 && r.Rnew === 0 && r.delta < 0);
  assert.equal(s.slots.ny.hurt, 1); assert.match(s.label, /descriptive/);
  const s2 = scoreUpdates(run, { slots: { london: { changes: [{ instrument: 'GOLD', to: 'SHORT', why: 'x' }] } } }, {}, D);
  assert.equal(s2.slots.london.changes[0].missing, 'no bars');
});

console.log(`deskUpdate: ${n} tests passed`);
