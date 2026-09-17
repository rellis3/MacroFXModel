// js/eventResponseCore.test.mjs — synthetic bars, synthetic yields, no network.
//
// The fixture that matters most here is the off-by-one guard. `buildEventStudy`
// was once caught associating a release with the day AFTER it (a synthetic 2%
// event-day jump read as a 0.88x multiple — quieter than a normal day, which is
// the signature of the bug). The equivalent trap on M1 windows is putting the
// jump in `r1` instead of `r0`, so the test below plants a jump at the release
// minute and asserts it lands in `r0` and NOT in `pre5`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bisectAtOrBefore, closeAt, rollSessions, eventWindows, indexYields, leadUpFor,
  deadZoneBp, classifyLead, outcomeBucket, summarize, buildEventResponseBook, median,
} from './eventResponseCore.js';

const MIN = 60, DAY = 86_400;

/**
 * Minute bars for `days` weekdays (weekends skipped, so the roll logic is
 * exercised), 00:00–23:59 UTC each, flat at `px` unless `jumpAt` names a minute
 * epoch — from which every later bar is shifted by `jumpBp`.
 */
function bars({ startDay = '2024-01-01', days = 40, px = 1.1, jumpAt = null, jumpBp = 0, drift = 0, wiggleBp = 0 } = {}) {
  const times = [], closes = [];
  let t0 = Math.floor(Date.parse(startDay + 'T00:00:00Z') / 1000);
  let level = px;
  for (let d = 0; d < days; d++) {
    const dow = new Date(t0 * 1000).getUTCDay();
    if (dow === 0 || dow === 6) { t0 += DAY; d--; continue; }
    for (let m = 0; m < 1440; m++) {
      const t = t0 + m * MIN;
      times.push(t);
      const jumped = jumpAt != null && t >= jumpAt;
      // Deterministic intraday wiggle so a "normal day" baseline is non-zero —
      // a flat tape makes every event look infinitely significant.
      const w = wiggleBp ? Math.sin((d * 1440 + m) / 37) * wiggleBp / 1e4 : 0;
      closes.push(level * Math.exp(w) * (jumped ? Math.exp(jumpBp / 1e4) : 1));
    }
    level *= Math.exp(drift / 1e4);
    t0 += DAY;
  }
  return { times: Int32Array.from(times), closes: Float64Array.from(closes) };
}

const dayList = (from, n, step = 1) => {
  const out = [];
  let t = Date.parse(from + 'T00:00:00Z');
  for (let i = 0; i < n; i++) { out.push(new Date(t).toISOString().slice(0, 10)); t += step * DAY * 1000; }
  return out;
};

test('eventResponseCore', async t => {
  await t.test('bisectAtOrBefore finds the last bar at or before a time', () => {
    const b = bars({ days: 2 });
    const t = b.times[500];
    assert.equal(bisectAtOrBefore(b.times, t), 500);
    assert.equal(bisectAtOrBefore(b.times, t + 30), 500);      // mid-minute → still that bar
    assert.equal(bisectAtOrBefore(b.times, b.times[0] - 1), -1);
  });

  await t.test('closeAt refuses a bar outside the tolerance rather than stretching', () => {
    const b = bars({ days: 2 });
    const past = (b.times.at(-1) + 6 * 3600) * 1000;           // 6h after the last bar
    assert.equal(closeAt(b, past, 90), null);
    assert.ok(closeAt(b, past, 8 * 60));                        // generous tolerance reaches it
  });

  await t.test('rollSessions skips the weekend and counts trading days', () => {
    const b = bars({ startDay: '2024-01-04', days: 10 });       // Thu
    const thu = Date.parse('2024-01-04T12:00:00Z');
    const one = rollSessions(b, thu, 1);
    assert.equal(new Date(one).toISOString().slice(0, 10), '2024-01-05');   // Fri
    const two = rollSessions(b, thu, 2);
    assert.equal(new Date(two).toISOString().slice(0, 10), '2024-01-08');   // Mon, not Sat
    const back = rollSessions(b, Date.parse('2024-01-08T12:00:00Z'), -1);
    assert.equal(new Date(back).toISOString().slice(0, 10), '2024-01-05');
  });

  await t.test('rollSessions gives up instead of returning a stale price', () => {
    const b = bars({ days: 5 });
    assert.equal(rollSessions(b, (b.times.at(-1)) * 1000, 3), null);
  });

  await t.test('OFF-BY-ONE GUARD: an event-minute jump lands in r0, not pre5 or r1', () => {
    const ev = Date.parse('2024-01-10T13:30:00Z');
    const b = bars({ startDay: '2024-01-01', days: 25, jumpAt: Math.floor(ev / 1000), jumpBp: 200 });
    const w = eventWindows(b, ev);
    assert.ok(Math.abs(w.r0 - 200) < 1, `r0 should carry the jump, got ${w.r0}`);
    assert.ok(Math.abs(w.pre5) < 1e-6, `pre5 must be flat, got ${w.pre5}`);
    assert.ok(Math.abs(w.r1) < 1e-6, `r1 must not double-count the jump, got ${w.r1}`);
  });

  await t.test('eventWindows returns nulls, not guesses, past the data', () => {
    const b = bars({ startDay: '2024-01-01', days: 8 });
    const late = (b.times.at(-1) - 3600) * 1000;
    const w = eventWindows(b, late);
    assert.equal(w.r5, null);
    assert.equal(w.r1, null);
  });

  await t.test('leadUpFor measures the move BEFORE the event day and excludes it', () => {
    const dates = dayList('2024-01-01', 20);
    // y2 rises 1bp/day up to the 10th, then jumps 50bp ON the event day.
    const rows = dates.map((date, i) => ({ date, y2: 4 + i * 0.01 + (i >= 9 ? 0.5 : 0), y10: 4.5, y30: 5 }));
    const idx = indexYields(rows);
    const lead = leadUpFor(idx, Date.parse(dates[9] + 'T14:00:00Z'), { leadSessions: 5 });
    assert.equal(lead.asOf, dates[8]);                   // last close strictly before the event day
    assert.ok(Math.abs(lead.d2y5 - 5) < 1e-6, `expected +5bp of pre-event drift, got ${lead.d2y5}`);
  });

  await t.test('the dead-zone comes from the yield series alone and classifies around it', () => {
    const dates = dayList('2024-01-01', 60);
    const rows = dates.map((date, i) => ({ date, y2: 4 + (i % 2) * 0.1, y10: 4.5, y30: 5 }));
    const dz = deadZoneBp(indexYields(rows), 'y2', { leadSessions: 5 });
    assert.ok(dz > 0);
    assert.equal(classifyLead(dz + 1, dz), 'priced-hawkish');
    assert.equal(classifyLead(-dz - 1, dz), 'priced-dovish');
    assert.equal(classifyLead(0, dz), 'flat');
    assert.equal(classifyLead(null, dz), null);
  });

  await t.test('outcome buckets respect the in-line dead band', () => {
    assert.equal(outcomeBucket(1.2), 'beat');
    assert.equal(outcomeBucket(-1.2), 'miss');
    assert.equal(outcomeBucket(0.1), 'inline');
    assert.equal(outcomeBucket(null), null);
  });

  await t.test('summarize reports n, median, mean and up-rate — and no p-value', () => {
    const s = summarize([10, -5, 20, null, NaN, 30]);
    assert.equal(s.n, 4);
    assert.equal(s.upPct, 75);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.ok(!('p' in s) && !('pValue' in s) && !('tStat' in s));
  });

  await t.test('a cell below minCellObs is omitted entirely, and the omission is counted', () => {
    const b = bars({ startDay: '2024-01-01', days: 120 });
    const dates = dayList('2024-01-01', 170);
    const yields = dates.map((date, i) => ({ date, y2: 4 + i * 0.02, y10: 4.5 + i * 0.02, y30: 5 }));
    // 6 events, all in the same state/outcome cell — below the 12 bar. Weekdays
    // only: a Sunday "event" has no bars at all and would drop out for the wrong
    // reason, hiding whether the cell bar is what omitted it.
    const weekdays = dates.filter(d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; });
    const events = [];
    for (let i = 10; i < 70; i += 10) events.push({ ms: Date.parse(weekdays[i] + 'T13:30:00Z'), z: 1.5 });
    const book = buildEventResponseBook({
      instruments: { eurusd: { bars: b, legs: ['EUR', 'USD'] } },
      families: [{ key: 'cpi', label: 'US CPI', ccy: 'USD', events }],
      yields,
    });
    const row = book.families.cpi.instruments.eurusd;
    assert.equal(Object.keys(row.cells).length, 0);
    assert.equal(row.cellsOmitted, 9);
    assert.ok(row.all.n >= 5, 'the unconditional row still reports what it saw');
  });

  await t.test('a populated cell carries n, the halves and an unstable flag', () => {
    const dates = dayList('2024-01-01', 200);
    const yields = dates.map((date, i) => ({ date, y2: 4 + i * 0.02, y10: 4.5, y30: 5 }));   // always rising → priced-hawkish
    const evDates = [];
    for (let i = 10; i < 150; i += 4) evDates.push(dates[i]);
    const b = bars({ startDay: '2024-01-01', days: 200 });
    const events = evDates.map(d => ({ ms: Date.parse(d + 'T13:30:00Z'), z: 1.5 }));
    const book = buildEventResponseBook({
      instruments: { eurusd: { bars: b, legs: ['EUR', 'USD'] } },
      families: [{ key: 'cpi', label: 'US CPI', ccy: 'USD', events }],
      yields,
    });
    const cell = book.families.cpi.instruments.eurusd.cells['priced-hawkish|beat'];
    assert.ok(cell, 'the hawkish/beat cell should be populated');
    assert.ok(cell.n >= 12);
    assert.equal(cell.halves.earlyN + cell.halves.lateN, cell.n);
    assert.ok('unstable' in cell && 'r1' in cell.unstable);
    assert.ok(book.meta.deadZoneBp > 0);
  });

  await t.test('the join proof separates a real release minute from a mistimed one', () => {
    const dates = dayList('2024-01-01', 200);
    const yields = dates.map((date, i) => ({ date, y2: 4 + i * 0.02, y10: 4.5, y30: 5 }));
    const weekdays = dates.filter(d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; });
    const evDays = weekdays.filter((_, i) => i >= 30 && i % 5 === 0).slice(0, 20);
    // Bars that jump by 60bp at 13:30 on each event day and wiggle gently otherwise.
    const b = bars({ startDay: '2024-01-01', days: 200, wiggleBp: 12 });
    for (const d of evDays) {
      const at = Math.floor(Date.parse(d + 'T13:30:00Z') / 1000);
      const i0 = bisectAtOrBefore(b.times, at);
      for (let i = i0 + 1; i <= i0 + 30 && i < b.times.length; i++) b.closes[i] *= Math.exp(60 / 1e4);
      for (let i = i0 + 31; i < b.times.length; i++) b.closes[i] *= Math.exp(60 / 1e4);
    }
    const book = buildEventResponseBook({
      instruments: { eurusd: { bars: b, legs: ['EUR', 'USD'] } },
      families: [
        { key: 'onTime', label: 'on the minute', ccy: 'USD', events: evDays.map(d => ({ ms: Date.parse(d + 'T13:30:00Z'), z: 1 })) },
        { key: 'mistimed', label: 'four hours early', ccy: 'USD', events: evDays.map(d => ({ ms: Date.parse(d + 'T09:30:00Z'), z: 1 })) },
      ],
      yields,
    });
    const onTime = book.families.onTime.instruments.eurusd.all.joinProof;
    const wrong = book.families.mistimed.instruments.eurusd.all.joinProof;
    assert.equal(onTime.pass, true, `a correctly-timed release should spike: ${JSON.stringify(onTime)}`);
    assert.equal(wrong.pass, false, `a mistimed one should not: ${JSON.stringify(wrong)}`);
  });

  await t.test('an instrument the release cannot touch is skipped, not scored', () => {
    const b = bars({ startDay: '2024-01-01', days: 60 });
    const dates = dayList('2024-01-01', 80);
    const yields = dates.map((date, i) => ({ date, y2: 4 + i * 0.01, y10: 4.5, y30: 5 }));
    const events = [{ ms: Date.parse(dates[20] + 'T13:30:00Z'), z: 1 }];
    const book = buildEventResponseBook({
      instruments: { eurgbp: { bars: b, legs: ['EUR', 'GBP'] } },
      families: [{ key: 'nfp', label: 'US NFP', ccy: 'USD', events }],
      yields,
    });
    assert.equal(book.families.nfp.instruments.eurgbp, undefined);
  });
});
