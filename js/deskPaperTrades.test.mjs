// Tests for js/deskPaperTrades.js.   node js/deskPaperTrades.test.mjs
import assert from 'node:assert/strict';
import { simulateCard, paperDay, watchedCards, cardsAsTheDayWent, summarise, runningTotal, defaultSpread, dayComplete, PAPER_LABEL } from './deskPaperTrades.js';
import { londonMs } from './deskScore.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const date = '2026-11-05';   // GMT: London = UTC
const L = { open: 1.1000, up: { p50: 1.1050, p75: 1.1080, p90: 1.1100 }, down: { p50: 1.0950, p75: 1.0920, p90: 1.0900 } };   // u = 0.0050
const long = { rating: 'LONG', conviction: 'medium', size: 1, levels: L, plan: { zone: 'Buy dips 1.0980-1.0990', invalidation: 'below 1.0960' } };
// bars from London hh:mm on `d`, each [open, high, low, close]
const bars = (d, hh, mm, rows, step = 5) => rows.map(([o, h, l, c], i) => ({ time: Math.floor(londonMs(d, hh, mm) / 1000) + i * step * 60, open: o, high: h, low: l, close: c }));
const sim = (card, b, o = {}) => simulateCard('EURUSD', card, b, { date, spread: 0, ...o });

t('entry in the zone, then the first target', () => {
  const r = sim(long, bars(date, 8, 0, [[1.1000, 1.1005, 1.0995, 1.0998], [1.0998, 1.0999, 1.0985, 1.0987], [1.0987, 1.1020, 1.0986, 1.1018], [1.1018, 1.1055, 1.1015, 1.1050]]));
  assert.equal(r.reason, 'target'); assert.equal(r.entry, 1.099); assert.equal(r.exit, 1.105); assert.equal(r.entryMode, 'zone');
  assert.equal(r.R, 1.2); assert.equal(r.sizeR, 1.2);
  assert.equal(r.entryAt, new Date(londonMs(date, 8, 5)).toISOString());
});

t('entry, then the invalidation', () => {
  const r = sim(long, bars(date, 9, 0, [[1.1000, 1.1001, 1.0985, 1.0988], [1.0988, 1.0990, 1.0955, 1.0958]]));
  assert.equal(r.reason, 'invalid'); assert.equal(r.exit, 1.096); assert.equal(r.R, -0.6);
});

t('target and invalidation in the same bar: the invalidation', () => {
  const r = sim(long, bars(date, 9, 0, [[1.0985, 1.0990, 1.0982, 1.0986], [1.0986, 1.1060, 1.0950, 1.1000]]));
  assert.equal(r.entry, 1.0985); assert.equal(r.reason, 'invalid'); assert.ok(r.R < 0);
});

t('in the bar that entered from outside the zone only the invalidation counts', () => {
  // opens above the zone, trades down into it, the bar's high is above the target: not a target fill
  const r = sim(long, bars(date, 9, 0, [[1.1000, 1.1060, 1.0985, 1.1000], [1.1000, 1.1010, 1.0995, 1.1005]]));
  assert.equal(r.reason, 'close'); assert.equal(r.entry, 1.099); assert.equal(r.exit, 1.1005);
});

t('never reaches the zone: no entry; invalidation first: no entry either', () => {
  assert.equal(sim(long, bars(date, 8, 0, [[1.1000, 1.1010, 1.0995, 1.1005]])).reason, 'no-entry');
  const gapDown = sim({ ...long, plan: { zone: '1.0990-1.0995', invalidation: 'below 1.0970' } }, bars(date, 8, 0, [[1.1000, 1.1002, 1.0999, 1.1000], [1.0965, 1.0968, 1.0960, 1.0962]]));
  assert.equal(gapDown.reason, 'invalid');   // gapped through the zone: entered at the open, already past the invalidation
  const inv = sim({ ...long, plan: { zone: '1.1020-1.1030', invalidation: 'below 1.0960' } }, bars(date, 8, 0, [[1.1000, 1.1002, 1.0950, 1.0960], [1.0960, 1.1030, 1.0960, 1.1025]]));
  assert.equal(inv.reason, 'no-entry'); assert.match(inv.note, /before reaching the zone/);
});

t('no zone: enters at the 08:00 open and says so', () => {
  const r = sim({ ...long, plan: { invalidation: 'below 1.0960' } }, bars(date, 8, 0, [[1.1002, 1.1010, 1.0999, 1.1005], [1.1005, 1.1030, 1.1000, 1.1020]]));
  assert.equal(r.entryMode, 'open-08:00'); assert.equal(r.entry, 1.1002); assert.equal(r.reason, 'close'); assert.equal(r.exit, 1.102);
});

t('FLAT and size-0 cards are not traded', () => {
  const b = bars(date, 8, 0, [[1.1, 1.1, 1.1, 1.1]]);
  assert.equal(sim({ ...long, rating: 'FLAT' }, b), null);
  assert.equal(sim({ ...long, size: 0 }, b), null);
  const day = paperDay({ EURUSD: long, GBPUSD: { ...long, rating: 'FLAT' } }, { EURUSD: b }, { date });
  assert.equal(day.trades.length, 1); assert.equal(day.label, PAPER_LABEL);
});

t('costs reduce R: net = gross - spread / u', () => {
  const b = bars(date, 8, 0, [[1.0985, 1.0990, 1.0982, 1.0986], [1.0986, 1.1055, 1.0985, 1.1050]]);
  const g = sim(long, b), c = sim(long, b, { spread: 0.0002 });
  assert.equal(g.R, g.grossR); assert.equal(c.grossR, g.grossR); assert.equal(c.costR, 0.04); assert.equal(c.R, +(g.R - 0.04).toFixed(4));
  assert.ok(c.pct < c.grossPct);
  assert.equal(defaultSpread('EURUSD', 1.1), 0.0003); assert.equal(defaultSpread('USDJPY', 150), 0.03);
  assert.ok(Math.abs(defaultSpread('NQ', 20000) - 4) < 1e-9);
  // with no spread passed, the default applies
  assert.ok(simulateCard('EURUSD', long, b, { date }).costR > 0);
});

t('bars outside 08:00-21:00 London are ignored, in summer time too', () => {
  const summer = '2026-07-01';   // BST: 08:00 London = 07:00 UTC
  const pre = bars(summer, 7, 30, [[1.0985, 1.0990, 1.0980, 1.0986]], 5);   // in the zone, but 07:30 London
  const inWin = bars(summer, 8, 0, [[1.1000, 1.1010, 1.0999, 1.1005]]);
  const late = bars(summer, 21, 0, [[1.1005, 1.1060, 1.0985, 1.1050]]);
  const r = simulateCard('EURUSD', long, [...pre, ...inWin, ...late], { date: summer, spread: 0 });
  assert.equal(r.reason, 'no-entry');
  // a UTC-08:00 bar is 09:00 London in summer: inside the window
  const utc8 = [{ time: Date.UTC(2026, 6, 1, 8, 0) / 1000, open: 1.0985, high: 1.099, low: 1.098, close: 1.0986 }];
  assert.equal(simulateCard('EURUSD', long, utc8, { date: summer, spread: 0 }).entryAt, '2026-07-01T08:00:00.000Z');
  assert.ok(!dayComplete(summer, londonMs(summer, 20, 59)) && dayComplete(summer, londonMs(summer, 21)));
});

t('the watched cards drop flipped or flattened cards and take updated sizes', () => {
  const book = { instruments: { EURUSD: long, GBPUSD: long, USDJPY: long, AUDUSD: { ...long, rating: 'FLAT' } } };
  const view = { EURUSD: { rating: 'STRONG_LONG', size: 1.5 }, GBPUSD: { rating: 'SHORT', size: 1 }, USDJPY: { rating: 'FLAT', size: 0 }, AUDUSD: { rating: 'LONG', size: 1 } };
  const w = watchedCards(book, view);
  assert.deepEqual(Object.keys(w), ['EURUSD']); assert.equal(w.EURUSD.size, 1.5); assert.equal(w.EURUSD.rating, 'STRONG_LONG');
});

t('summary and running total', () => {
  const tr = [{ reason: 'target', R: 1, grossR: 1.1, sizeR: 2, grossSizeR: 2.2 }, { reason: 'invalid', R: -0.5, grossR: -0.4, sizeR: -0.5, grossSizeR: -0.4 }, { reason: 'no-entry' }];
  const s = summarise(tr);
  assert.equal(s.trades, 2); assert.equal(s.wins, 1); assert.equal(s.hitRate, 0.5); assert.equal(s.meanR, 0.25); assert.equal(s.sumSizeR, 1.5); assert.equal(s.noEntry, 1);
  assert.equal(s.costSizeR, 0.3);
  const rt = runningTotal([{ date: '2026-11-05', summary: s }, { date: '2026-11-04', summary: { ...s, sumSizeR: -1 } }]);
  assert.equal(rt.days, 2); assert.equal(rt.trades, 4); assert.equal(rt.sumSizeR, 0.5); assert.equal(rt.from, '2026-11-04'); assert.deepEqual(rt.curve.map(c => c.cum), [-1, 0.5]);
});
t('a card flipped by a session update is traded until the update, then closed (no look-ahead)', () => {
  const book = { instruments: { EURUSD: long, GBPUSD: { ...long }, USDJPY: { ...long, rating: 'FLAT', size: 0 } } };
  const updates = { slots: { london: { at: new Date(londonMs(date, 8, 5)).toISOString(), changes: [] }, ny: { at: new Date(londonMs(date, 14, 35)).toISOString(), changes: [{ instrument: 'EURUSD', to: 'SHORT' }, { instrument: 'GBPUSD', to: 'STRONG_LONG' }] } } };
  const cards = cardsAsTheDayWent(book, updates, date);
  assert.equal(cards.EURUSD.stopMs, londonMs(date, 14, 35)); assert.equal(cards.GBPUSD.stopMs, null, 'same direction: kept all day'); assert.ok(!cards.USDJPY, 'FLAT is not traded');
  // in the zone at 09:00, still open at the 14:35 flip: closed there with reason update, even though the target trades at 15:00
  const b = [...bars(date, 9, 0, [[1.0995, 1.0996, 1.0985, 1.0988]]), ...bars(date, 14, 30, [[1.1000, 1.1005, 1.0998, 1.1002], [1.1002, 1.1003, 1.1000, 1.1001]]), ...bars(date, 15, 0, [[1.1001, 1.1060, 1.1000, 1.1055]])];
  const r = simulateCard('EURUSD', cards.EURUSD, b, { date, spread: 0 });
  assert.equal(r.reason, 'update'); assert.equal(r.exit, 1.1002, 'the last bar before the update');
  assert.equal(simulateCard('EURUSD', { ...cards.EURUSD, stopMs: null }, b, { date, spread: 0 }).reason, 'target');
});

console.log(`deskPaperTrades: ${n} tests passed`);
