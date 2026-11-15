import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMEFRAMES, TF_KEYS, DEFAULT_TF, tfOf, clampDays, barCount, shapeCandles, describeBars, candlesUrl } from './deskBarsCore.js';

const iso = s => Date.parse(s);
const mid = (t, o, h, l, c, complete = true) => ({ time: t, complete, volume: 10, mid: { o: String(o), h: String(h), l: String(l), c: String(c) } });

test('the five timeframes, each OANDA native, and the 1h default', () => {
  assert.deepEqual(TF_KEYS, ['5m', '15m', '30m', '1h', '4h']);
  assert.deepEqual(TIMEFRAMES.map(t => t.gran), ['M5', 'M15', 'M30', 'H1', 'H4']);
  assert.deepEqual(TIMEFRAMES.map(t => t.sec), [300, 900, 1800, 3600, 14400]);
  assert.equal(DEFAULT_TF, '1h');
  assert.equal(tfOf('15M').key, '15m');                   // case-insensitive
  assert.equal(tfOf('nonsense').key, '1h');               // unknown falls back to the old behaviour
  assert.equal(tfOf(undefined).key, '1h');
  for (const t of TIMEFRAMES) assert.ok(t.ttlMs >= 60_000 && t.defDays <= t.maxDays);
});

test('days are clamped per timeframe and the bar count never passes the 5,000 OANDA allows', () => {
  const m5 = tfOf('5m'), h4 = tfOf('4h');
  assert.equal(clampDays(m5, undefined), 3);
  assert.equal(clampDays(m5, '99'), 10);                  // 5m may not reach back 99 days
  assert.equal(clampDays(m5, '-4'), 3);
  assert.equal(clampDays(h4, '0'), 20);
  assert.equal(clampDays(tfOf('1h'), '5'), 5);
  for (const t of TIMEFRAMES) assert.ok(barCount(t, t.maxDays) <= 5000, `${t.key} at max days`);
  assert.equal(barCount(m5, 10), 2890);                   // 10 days of 288 five-minute bars, +10 spare
  assert.equal(barCount({ sec: 60 }, 20), 5000);          // capped
  assert.match(candlesUrl('https://x', 'EUR_USD', h4, 20), /granularity=H4&count=130&price=M$/);
});

test('candles become bars stamped at their OPEN, ascending, with the forming one flagged not dropped', () => {
  const now = iso('2026-11-12T10:20:00Z');
  const raw = [
    mid('2026-11-12T10:15:00.000000000Z', 1.1, 1.2, 1.0, 1.15, false),   // forming (opened 10:15, closes 10:20 for a 5m: here the wire says incomplete)
    mid('2026-11-12T10:05:00.000000000Z', 1.0, 1.1, 0.9, 1.05),
    mid('2026-11-12T10:10:00.000000000Z', 1.05, 1.2, 1.0, 1.1),
  ];
  const bars = shapeCandles(raw, now, 3);
  assert.deepEqual(bars.map(b => b.time), [iso('2026-11-12T10:05:00Z') / 1000, iso('2026-11-12T10:10:00Z') / 1000, iso('2026-11-12T10:15:00Z') / 1000]);
  assert.equal(bars[0].forming, undefined);
  assert.equal(bars[2].forming, true);
  assert.deepEqual(bars[0], { time: iso('2026-11-12T10:05:00Z') / 1000, open: 1.0, high: 1.1, low: 0.9, close: 1.05 });
});

test('junk is dropped: no mid, bad close, future bars, older than the window; a duplicate open keeps the later', () => {
  const now = iso('2026-11-12T10:00:00Z');
  const raw = [
    { time: '2026-11-12T09:00:00.000000000Z', complete: true },                                 // no mid
    mid('2026-11-12T08:00:00.000000000Z', 1, 2, 0.5, 'x'),                                      // non-numeric close
    mid('2026-11-12T12:00:00.000000000Z', 1, 2, 0.5, 1.5),                                      // opens in the future
    mid('2026-11-08T12:00:00.000000000Z', 1, 2, 0.5, 1.5),                                      // 4 days back, window is 2
    mid('2026-11-11T12:00:00.000000000Z', 1, 2, 0.5, 1.2),
    mid('2026-11-11T12:00:00.000000000Z', 1, 2, 0.5, 1.3),                                      // duplicate open
    null,
  ];
  const bars = shapeCandles(raw, now, 2);
  assert.equal(bars.length, 1);
  assert.equal(bars[0].close, 1.3);
  assert.deepEqual(shapeCandles(undefined, now, 2), []);
});

test('a weekend is a gap in the data and stays one: no bars are invented across it', () => {
  const now = iso('2026-11-14T15:00:00Z');                                                       // Saturday, market shut
  const raw = [
    mid('2026-11-13T21:50:00.000000000Z', 1, 1, 1, 1), mid('2026-11-13T21:55:00.000000000Z', 1, 1, 1, 1.01),   // the last bars before the Friday close
    mid('2026-11-12T21:55:00.000000000Z', 1, 1, 1, 0.99),
  ];
  const bars = shapeCandles(raw, now, 3), step = tfOf('5m');
  assert.equal(bars.length, 3);
  const d = describeBars(bars, step, now);
  assert.equal(d.forming, false);                                                                // shut market: nothing is forming
  assert.equal(d.lastOpen, iso('2026-11-13T21:55:00Z') / 1000);
  assert.equal(d.lastClose, iso('2026-11-13T22:00:00Z') / 1000);
  assert.equal(d.ageSec, (iso('2026-11-14T15:00:00Z') - iso('2026-11-13T22:00:00Z')) / 1000);
});

test('forming is only true while the flagged last bar has not yet closed', () => {
  const t5 = tfOf('5m'), open = iso('2026-11-12T10:15:00Z') / 1000;
  const bars = [{ time: open - 300, open: 1, high: 1, low: 1, close: 1 }, { time: open, open: 1, high: 1, low: 1, close: 1, forming: true }];
  assert.equal(describeBars(bars, t5, iso('2026-11-12T10:17:00Z')).forming, true);
  assert.equal(describeBars(bars, t5, iso('2026-11-12T10:20:01Z')).forming, false);              // the flag is stale: the bar has closed since
  assert.deepEqual(describeBars([], t5, 0), { n: 0, lastOpen: null, lastClose: null, forming: false, ageSec: null });
  assert.equal(describeBars(bars.slice(0, 1), t5, iso('2026-11-12T10:17:00Z')).forming, false);  // a finished last bar is not forming
});

// Real OANDA EUR_USD H4 candles read on 2026-11-15 (Nov 9 to 13, the week after the US clocks went back on Nov 1): every open is 17, 21, 01, 05, 09 or 13 New York,
// which is OANDA's own daily-roll anchor. Ours to keep: the chart never re-anchors H4.
test('H4 bars keep OANDA\'s New York 17:00 anchor (live sample, winter week)', () => {
  const opens = ['2026-11-09T22:00', '2026-11-10T02:00', '2026-11-10T06:00', '2026-11-10T10:00', '2026-11-10T14:00', '2026-11-10T18:00', '2026-11-10T22:00', '2026-11-13T18:00'];
  const raw = opens.map((o, i) => mid(`${o}:00.000000000Z`, 1 + i / 100, 1.2, 0.9, 1.1));
  const bars = shapeCandles(raw, iso('2026-11-14T12:00:00Z'), 20);
  assert.equal(bars.length, opens.length);
  const nyHour = sec => +new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(sec * 1000));
  assert.deepEqual([...new Set(bars.map(b => nyHour(b.time)))].sort((a, b) => a - b), [1, 5, 9, 13, 17, 21]);
  for (let i = 1; i < bars.length; i++) assert.ok(bars[i].time - bars[i - 1].time >= 14400);     // never closer than one H4 apart
});

test('the clock change week: bars across the US switch (Nov 1) stay strictly ascending in epoch seconds', () => {
  // OANDA anchors on New York, so around the switch a 4h bar opens an hour later in UTC; epoch seconds are unaffected
  const raw = [
    mid('2026-10-30T21:00:00.000000000Z', 1, 1, 1, 1),   // Fri 17:00 EDT
    mid('2026-11-02T22:00:00.000000000Z', 1, 1, 1, 1),   // Mon 17:00 EST (22:00 UTC)
    mid('2026-11-03T02:00:00.000000000Z', 1, 1, 1, 1),
  ];
  const bars = shapeCandles(raw, iso('2026-11-04T00:00:00Z'), 10);
  assert.equal(bars.length, 3);
  assert.ok(bars.every((b, i) => i === 0 || b.time > bars[i - 1].time));
});
