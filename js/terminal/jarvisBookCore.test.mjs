import test from 'node:test';
import assert from 'node:assert/strict';
import { bookRows, bookSummary, bookScript, towerBox, moveBar, PLINTH } from './jarvisBookCore.js';

const why = 'x'.repeat(40);
const run = { date: '2026-11-19', head: { book: { instruments: {
  USDJPY: { rating: 'LONG', conviction: 'low', size: 0.5, why }, NQ: { rating: 'SHORT', conviction: 'medium', size: 0.5, why }, GOLD: { rating: 'STRONG_SHORT', conviction: 'high', size: 0.35, why },
  EURUSD: { rating: 'FLAT', conviction: 'low', size: 0, why }, BTCUSD: { rating: 'FLAT', conviction: 'low', size: 0, why: 'no' }, WTI: null } } } };

test('bookRows: calls get conviction heights, flat cards follow reviewState (neutral vs not reviewed)', () => {
  const { rows, partial } = bookRows(run, { NQ: 1.5 }), by = Object.fromEntries(rows.map(r => [r.key, r]));
  assert.equal(partial, false);
  assert.deepEqual([by.USDJPY.state, by.USDJPY.h], ['long', 1]); assert.deepEqual([by.NQ.state, by.NQ.h], ['short', 2]); assert.deepEqual([by.GOLD.state, by.GOLD.h, by.GOLD.strong], ['short', 3, true]);
  assert.equal(by.EURUSD.state, 'neutral'); assert.equal(by.BTCUSD.state, 'unreviewed'); assert.equal(by.WTI.state, 'unreviewed'); assert.equal(by.EURUSD.h, PLINTH);
  assert.equal(by.NQ.move, 1.5); assert.equal(by.GOLD.move, null);
});
test('bookRows: no head = empty; summary-only run is partial and a flat card is unknown, never "neutral"', () => {
  assert.deepEqual(bookRows(null).rows, []); assert.deepEqual(bookRows({ date: 'd', head: { ok: false } }).rows, []);
  const p = bookRows({ head: { ratings: { NQ: 'SHORT', EURUSD: 'FLAT' } } }); assert.equal(p.partial, true);
  assert.deepEqual(p.rows.map(r => r.state), ['short', 'unknown']);
});
test('towerBox: long rises, short hangs, flat is a low plinth; moveBar clips and is absent without a move', () => {
  const [l, s, f] = [{ call: 1, h: 2, size: 0.5 }, { call: -1, h: 2, size: 0.5 }, { call: 0, h: PLINTH, size: 0 }].map(r => towerBox(r, { x: 0, z: 0 })), ys = b => b.pts.map(p => p[1]);
  assert.ok(Math.min(...ys(l)) === 0 && Math.max(...ys(l)) > 0.3); assert.ok(Math.max(...ys(s)) === 0 && Math.min(...ys(s)) < -0.3); assert.ok(Math.max(...ys(f)) < Math.max(...ys(l)) / 2 && Math.max(...ys(f)) > 0);
  assert.equal(moveBar({ move: null }, { x: 0, z: 0 }), null); assert.equal(moveBar({ move: 9 }, { x: 0, z: 0 }).v, 3);
});
test('bookSummary and bookScript: counts, the top conviction, the not-a-forecast line; no book = null', () => {
  const b = bookRows(run), s = bookSummary(b.rows);
  assert.deepEqual([s.calls, s.long, s.short, s.neutral, s.unreviewed], [3, 1, 2, 1, 2]); assert.deepEqual(s.top, ['GOLD']);
  const t = bookScript(b); assert.match(t, /view on 3 markets: 1 long and 2 short/); assert.match(t, /biggest conviction is high, on gold/); assert.match(t, /not reviewed, which is not a neutral call/); assert.match(t, /not a forecast/);
  assert.equal(bookScript({ rows: [] }), null); assert.equal(bookScript(null), null);
});

test('callShape: one fixed height for every call (height never encodes conviction); conviction is width, glow and rings; flat plinths dashed unless reviewed-neutral', async () => {
  const { callShape, CALL_H, FLAT_H } = await import('./jarvisBookCore.js');
  const lo = callShape({ call: 1, conv: 'low', state: 'long' }), hi = callShape({ call: 1, conv: 'high', state: 'long' }), sh = callShape({ call: -1, conv: 'medium', state: 'short' });
  assert.equal(lo.y1, CALL_H); assert.equal(hi.y1, CALL_H); assert.equal(sh.y1, -CALL_H);
  assert.ok(hi.w > sh.w && sh.w > lo.w); assert.ok(hi.glow > lo.glow); assert.deepEqual([lo.rings, sh.rings, hi.rings], [1, 2, 3]);
  const unk = callShape({ call: 1, conv: null, state: 'long' }); assert.equal(unk.hollow, true); assert.equal(unk.rings, 0);
  assert.equal(callShape({ call: 0, state: 'neutral' }).dashed, false); assert.equal(callShape({ call: 0, state: 'unreviewed' }).dashed, true); assert.equal(callShape({ call: 0, state: 'unknown' }).y1, FLAT_H);
});
test('moveHeight: linear in usual moves, capped at 3 and flagged, ticks at each whole usual move; null without a move', async () => {
  const { moveHeight, MOVE_K } = await import('./jarvisBookCore.js');
  assert.equal(moveHeight({ move: null }), null); assert.equal(moveHeight({}), null);
  const a = moveHeight({ move: 1.5 }); assert.equal(a.y, 1.5 * MOVE_K); assert.equal(a.ticks.length, 1); assert.equal(a.capped, false);
  const b = moveHeight({ move: -7 }); assert.equal(b.v, -3); assert.equal(b.capped, true); assert.deepEqual(b.ticks, [-1, -2, -3].map(k => k * MOVE_K));
});
test('bookShowCam: starts high, dives low near the focus mid-flight, ends risen; deterministic', async () => {
  const { bookShowCam } = await import('./jarvisBookCore.js');
  const f = { x: 0.4, z: -0.3 }, s = bookShowCam(0, f), m = bookShowCam(0.5, f), e = bookShowCam(1, f);
  assert.ok(m.elev < s.elev && m.elev < e.elev); assert.ok(m.dist < s.dist); assert.ok(Math.abs(m.target[0] - 0.4) < 1e-9); assert.equal(e.target[0], 0);
  assert.deepEqual(bookShowCam(0.5, f), m); assert.ok(Number.isFinite(bookShowCam(0.5, null).yaw));
});
