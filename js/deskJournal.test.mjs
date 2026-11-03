// Tests for js/deskJournal.js on synthetic trades.   node js/deskJournal.test.mjs
import assert from 'node:assert/strict';
import { deskName, tradeRows, stanceOf, entryU, coach, execution, londonParts } from './deskJournal.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const sec = iso => Date.parse(iso) / 1000;

t('desk names from bot keys and broker symbols', () => {
  assert.equal(deskName('eurusd'), 'EURUSD'); assert.equal(deskName('EUR_USD'), 'EURUSD'); assert.equal(deskName('XAUUSD.r'), 'GOLD');
  assert.equal(deskName('nq'), 'NQ'); assert.equal(deskName('spx'), 'SPX500'); assert.equal(deskName('dax'), 'DE30');
});

t('broker clock restored to UTC; London date and hour (BST)', () => {
  // 09:30 UTC on 2026-07-01 is 10:30 London; the broker stamps UTC+3
  const rows = tradeRows({ oi: [{ position_id: 1, key: 'eurusd', direction: 'BUY', open_price: 1.1, close_price: 1.102, sl_at_entry: 1.098, tp_at_entry: 1.106, time_open: sec('2026-07-01T09:30:00Z') + 3 * 3600, time_close: sec('2026-07-01T11:00:00Z') + 3 * 3600, tz_offset_sec: 3 * 3600, profit: 20 }] });
  assert.equal(rows.length, 1); assert.equal(rows[0].date, '2026-07-01'); assert.equal(rows[0].hour, 10);
  assert.ok(Math.abs(rows[0].R - 1) < 1e-9); assert.ok(Math.abs(rows[0].reward / rows[0].risk - 3) < 1e-9);
  assert.deepEqual(londonParts(Date.parse('2026-01-15T07:59:00Z')), { date: '2026-01-15', hour: 7 });
});

const L = { open: 1.1, up: { p50: 1.105 }, down: { p50: 1.095 } };   // u = 0.005
const books = { '2026-07-01': { at: Date.parse('2026-07-01T06:00:00Z'), cards: { EURUSD: { rating: 'LONG', size: 1, levels: L }, GBPUSD: { rating: 'NEUTRAL', size: 0 } } } };
const mk = (id, inst, dir, R, profit, date = '2026-07-01', entry = 1.1) => ({ position_id: id, key: inst, direction: dir, open_price: entry, close_price: entry, r: R, profit, time_open: sec(`${date}T09:00:00Z`), time_close: sec(`${date}T12:00:00Z`), tz_offset_sec: 0 });

t('stance: with, against, no view, off book', () => {
  const rows = tradeRows({ rl: [mk(1, 'eurusd', 'BUY', 1, 10), mk(2, 'eurusd', 'SELL', -1, -10), mk(3, 'gbpusd', 'BUY', 0.5, 5), mk(4, 'usdjpy', 'BUY', 0.2, 2), mk(5, 'eurusd', 'BUY', 1, 10, '2026-07-02')] });
  assert.deepEqual(rows.map(r => stanceOf(r, books).stance), ['with', 'against', 'no view', 'off book', 'off book']);
  const early = tradeRows({ rl: [{ ...mk(9, 'eurusd', 'BUY', 1, 1), time_open: sec('2026-07-01T05:00:00Z') }] })[0];
  assert.equal(stanceOf(early, books).why, 'opened before the book was written');
  const c = coach(rows, books);
  assert.equal(c.byStance.with.n, 1); assert.equal(c.byStance.against.meanR, -1); assert.equal(c.byStance['off book'].n, 2);
  assert.ok(c.notes.length >= 2 && /too few/.test(c.notes[0]));
});

t('entry location: buying a unit above the open is +1u (chasing); a sell there is -1u', () => {
  assert.ok(Math.abs(entryU({ dir: 1, entry: 1.105 }, { levels: L }) - 1) < 1e-9);
  assert.ok(Math.abs(entryU({ dir: -1, entry: 1.105 }, { levels: L }) + 1) < 1e-9);
  assert.equal(entryU({ dir: 1, entry: 1.1 }, {}), null);
});

t('execution: planned R, kept share of the best move, green-then-red, exit reasons', () => {
  const base = { key: 'eurusd', open_price: 1.1, sl_at_entry: 1.099, tp_at_entry: 1.102, time_open: sec('2026-07-01T09:00:00Z'), time_close: sec('2026-07-01T10:00:00Z'), tz_offset_sec: 0, pip: 0.0001 };
  const rows = tradeRows({ oi: [
    { ...base, position_id: 1, direction: 'BUY', close_price: 1.1005, mfe_pips: 10, reason: 'TP', profit: 5 },   // best +1R, kept 0.5R
    { ...base, position_id: 2, direction: 'BUY', close_price: 1.099, mfe_pips: 8, reason: 'SL', profit: -10 },   // +0.8R then -1R
  ] });
  const x = execution(rows).bots.oi;
  assert.equal(x.n, 2); assert.equal(x.plannedR, 2); assert.equal(x.greenThenRed, 1); assert.equal(x.holdMin, 60);
  assert.equal(x.reasons.length, 2); assert.ok(Math.abs(x.mfeR - 0.9) < 1e-9);
});

console.log(`deskJournal: ${n} tests passed`);
