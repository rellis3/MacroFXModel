// node js/biasIntraday.test.mjs — the Bias Engine's through-the-day timeline (js/biasIntraday.js).
import assert from 'node:assert/strict';
import { SLOTS, dueSlot, compact, timeline, schedule, detail, whatMoved, fbRow } from './biasIntraday.js';

let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };
// a GMT day: London wall time = UTC
const londonMs = (date, h, m = 0) => Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
const D = '2026-11-24';

t('dueSlot: inside the 30-minute window of a slot, null between slots and outside the day', () => {
  assert.equal(dueSlot(londonMs(D, 9, 0), D, londonMs), '09:00');
  assert.equal(dueSlot(londonMs(D, 9, 29), D, londonMs), '09:00');
  assert.equal(dueSlot(londonMs(D, 9, 31), D, londonMs), null);
  assert.equal(dueSlot(londonMs(D, 6, 10), D, londonMs), null);
  assert.equal(dueSlot(londonMs(D, 21, 5), D, londonMs), '21:00');
  assert.equal(SLOTS.length, 15);
});
t('compact keeps direction, score and strength per market for both engines', () => {
  const rec = { variants: { v2: { markets: { EURUSD: { dir: 'BEARISH', score: -0.51234, strength: 3, drivers: [1, 2] } } }, v1r: { markets: { EURUSD: { dir: 'NEUTRAL', score: -0.3, strength: 0 } } } } };
  assert.deepEqual(compact(rec), { v1r: { EURUSD: ['NEUTRAL', -0.3, 0] }, v2: { EURUSD: ['BEARISH', -0.512, 3] } });
});
t('timeline: shifts carry the slot time, from and to; shifted markets first; a missing slot is skipped', () => {
  const day = {
    issue: { at: 'x', v2: { EURUSD: ['NEUTRAL', -0.4, 0], GBPUSD: ['BULLISH', 0.7, 4] }, v1r: { EURUSD: ['NEUTRAL', -0.3, 0], GBPUSD: ['NEUTRAL', 0.3, 0] } },
    slots: {
      '07:00': { v2: { EURUSD: ['NEUTRAL', -0.45, 0], GBPUSD: ['BULLISH', 0.7, 4] }, v1r: { EURUSD: ['NEUTRAL', -0.3, 0], GBPUSD: ['NEUTRAL', 0.3, 0] } },
      '09:00': { v2: { EURUSD: ['BEARISH', -0.55, 3], GBPUSD: ['BULLISH', 0.7, 4] }, v1r: { EURUSD: ['NEUTRAL', -0.35, 0], GBPUSD: ['NEUTRAL', 0.3, 0] } },
      '13:00': { v2: { EURUSD: ['NEUTRAL', -0.48, 0], GBPUSD: ['BULLISH', 0.7, 4] }, v1r: { EURUSD: ['NEUTRAL', -0.3, 0], GBPUSD: ['NEUTRAL', 0.3, 0] } },
    },
  };
  const tl = timeline(day);
  assert.deepEqual(tl.points, ['issue', '07:00', '09:00', '13:00']);
  assert.equal(tl.markets[0].market, 'EURUSD');
  assert.deepEqual(tl.markets[0].shifts.v2, [{ at: '09:00', from: 'NEUTRAL', to: 'BEARISH' }, { at: '13:00', from: 'BEARISH', to: 'NEUTRAL' }]);
  assert.deepEqual(tl.markets[0].shifts.v1r, []);
  assert.equal(tl.markets[1].shifted, false);
});
t('schedule marks done, missed, due and later', () => {
  const day = { slots: { '07:00': {} } }, s = schedule(day, londonMs(D, 9, 10), D, londonMs);
  assert.equal(s[0].state, 'done'); assert.equal(s[1].state, 'missed'); assert.equal(s[2].state, 'due'); assert.equal(s[3].state, 'later');
});
t('detail and whatMoved: drivers keyed with their leg; the biggest change first; tiny changes dropped', () => {
  const rec = { variants: { v2: { markets: { GOLD: { drivers: [{ key: 'trend', contrib: -0.3333, reading: 'D1 down' }, { key: 'rates', leg: 'USD', contrib: 0.1, reading: 'x' }] } } }, v1r: { markets: {} } } };
  assert.deepEqual(detail(rec).v2.GOLD, [['trend', -0.333, 'D1 down'], ['USD rates', 0.1, 'x']]);
  const mv = whatMoved([['trend', -0.333, 'D1 down'], ['usd', -0.25, 'a'], ['risk', 0.1, 'r']], [['trend', 0.1, 'H4 up'], ['usd', -0.252, 'a'], ['risk', 0.2, 'r2']]);
  assert.deepEqual(mv.map(x => x.driver), ['trend', 'risk']); assert.equal(mv[0].now, 'H4 up');
});
t('fbRow validates the FundaBias reading and maps aliases', () => {
  const M = { XAUUSD: 'GOLD', GOLD: 'GOLD' };
  assert.deepEqual(fbRow({ market: 'xauusd', dir: 'bullish', score10: 7, at: '16:06' }, M).row, { market: 'GOLD', dir: 'BULLISH', score10: 7, at: '16:06', note: null });
  assert.match(fbRow({ market: 'XAUUSD', dir: 'UP', score10: 7, at: '16:06' }, M).error, /dir/);
  assert.match(fbRow({ market: 'XAUUSD', dir: 'BEARISH', score10: 11, at: '07:38' }, M).error, /score10/);
  assert.match(fbRow({ market: 'XAUUSD', dir: 'BEARISH', score10: 8, at: '7:38' }, M).error, /HH:MM/);
  assert.match(fbRow({ market: 'FOO', dir: 'BEARISH', score10: 8, at: '07:38' }, M).error, /unknown/);
});
console.log(`\n${pass} passed`);
