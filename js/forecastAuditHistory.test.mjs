/**
 * Tests for the Forecast Auditor's history mode (js/forecastAuditHistory.js): London 00-22 sessions from hourly bars
 * (BST-safe), trading-day labels for NY-close bars, point-in-time σ and implied vol, calendar tags with unknown
 * outside coverage, the lockbox clamp, and that the plain row equals the production ladder scored by the scorecard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampWindow, londonSessions, nyDailyFromH1, parseCalendar, rowTag, eventTagger, ivBefore, ivSourceFor, historyRows,
  summariseHistory, HISTORY_DEFAULT,
} from './forecastAuditHistory.js';
import { LOCKBOX_END } from './forecastAudit.js';
import { forecastSigma } from './forecastSigma.js';
import { buildLadder, paramsFor } from './forecastLadder.js';
import { scoreLadder } from './forecastScorecard.js';
import { mulberry32 } from './statsCore.js';

// hourly bars of a random walk, every hour (weekends included, as a simple feed)
function walk(fromIso, hours, seed = 1, vol = 0.002) {
  const rng = mulberry32(seed), out = [];
  let c = 1.1, t = Date.parse(fromIso) / 1000;
  for (let i = 0; i < hours; i++, t += 3600) {
    const o = c; c = o * (1 + vol * (rng() - 0.5));
    out.push({ t, open: o, high: Math.max(o, c) * (1 + vol * rng() * 0.3), low: Math.min(o, c) * (1 - vol * rng() * 0.3), close: c });
  }
  return out;
}

test('clampWindow never passes the lockbox date', () => {
  assert.deepEqual(clampWindow({}), { ...HISTORY_DEFAULT, clamped: false });
  const w = clampWindow({ from: '2025-01-01', to: '2026-10-30' });
  assert.equal(w.to, LOCKBOX_END); assert.equal(w.clamped, true);
  assert.equal(clampWindow({ from: '2027-01-01', to: '2026-01-01' }).from, '2026-01-01');
});

test('londonSessions: 00:00-22:00 London, BST-safe, weekdays and complete sessions only', () => {
  // summer (BST): London 00:00 = 23:00 UTC the day before
  const bars = walk('2026-06-14T00:00:00Z', 24 * 3 + 12);
  const s = londonSessions(bars);
  assert.deepEqual([...s.keys()].sort(), ['2026-06-15', '2026-06-16']);   // Sunday dropped; Wednesday 06-17 incomplete
  const d = s.get('2026-06-15');
  const inWin = bars.filter(b => b.t >= Date.parse('2026-06-14T23:00:00Z') / 1000 && b.t < Date.parse('2026-06-15T21:00:00Z') / 1000);
  assert.equal(d.open, inWin[0].open);
  assert.equal(d.high, Math.max(...inWin.map(b => b.high)));
  assert.ok(Math.abs(d.hl - (d.high - d.low) / d.open * 100) < 1e-12);
});

test('nyDailyFromH1 labels by trading day (Sunday 17:00 NY opens Monday)', () => {
  const bars = walk('2026-01-11T22:00:00Z', 48);              // Sunday 17:00 New York (EST)
  const d = nyDailyFromH1(bars);
  assert.equal(d[0].date, '2026-01-12');
  assert.equal(d[0].open, bars[0].open);
  assert.equal(d[1].date, '2026-01-13');
  assert.equal(d[1].open, bars[24].open);
});

test('calendar tags: US majors by name, other majors high, holidays, unknown outside coverage', () => {
  const csv = 'date,datetime_raw,country,ccy,impact,event\n'
    + '2025-01-10,2025-01-10 13:30:00,United States,USD,Major,Non Farm Payrolls\n'
    + '2025-01-10,2025-01-10 13:30:00,United States,USD,Major,Private Nonfarm Payrolls\n'
    + '2025-01-15,2025-01-15 13:30:00,United States,USD,Major,Inflation Rate YoY\n'
    + '2025-01-16,2025-01-16 00:30:00,Australia,AUD,Major,Employment Change\n'
    + '2025-01-20,2025-01-20,United States,USD,Standard,Martin Luther King Jr. Day Holiday\n'
    + '2025-01-29,2025-01-29 19:00:00,United States,USD,Major,Fed Interest Rate Decision\n'
    + '2025-01-31,2025-01-31 23:30:00,Japan,JPY,Major,Tokyo CPI\n';
  const cal = parseCalendar(csv);
  assert.deepEqual(cal.span, ['2025-01-10', '2025-01-31']);
  assert.equal(cal.rows.at(-1).date, '2025-01-31');           // 23:30 UTC in winter is still the 31st in London
  const tag = eventTagger([cal]);
  assert.equal(tag('EURUSD', '2025-01-10'), 'NFP');
  assert.equal(tag('EURUSD', '2025-01-15'), 'CPI');
  assert.equal(tag('AUDUSD', '2025-01-16'), 'high');
  assert.equal(tag('EURUSD', '2025-01-16'), 'none');           // an AUD release is not EURUSD's
  assert.equal(tag('NQ', '2025-01-20'), 'holiday');
  assert.equal(tag('GOLD', '2025-01-29'), 'FOMC');
  assert.equal(tag('USDJPY', '2025-01-31'), 'high');           // Tokyo CPI is not US CPI
  assert.equal(tag('EURUSD', '2025-02-03'), null);             // past the calendar's end: unknown, not quiet
  assert.equal(rowTag({ ccy: 'USD', impact: 'Moderate', event: 'CPI' }), 'none');
});

test('ivBefore: the last close dated BEFORE the session, at most 4 days old', () => {
  const s = [['2025-01-09', 15], ['2025-01-10', 16], ['2025-01-13', 18]];
  assert.equal(ivBefore(s, '2025-01-13'), 16);                 // Monday reads Friday's close, not its own
  assert.equal(ivBefore(s, '2025-01-14'), 18);
  assert.equal(ivBefore(s, '2025-01-20'), null);               // stale
  assert.equal(ivBefore(s, '2025-01-09'), null);
  assert.equal(ivSourceFor('persist', 'GOLD'), 'GVZ');
  assert.equal(ivSourceFor('ivadj', 'SPX500'), 'VIX');
  assert.equal(ivSourceFor('persist', 'EURUSD'), 'CME_ATM30');
});

test('historyRows replays the production ladder point in time, scores it like the scorecard, stops at the lockbox', () => {
  const h1 = walk('2022-01-03T00:00:00Z', 24 * 365 * 4.8, 5);
  const ny = nyDailyFromH1(h1);
  const sess = londonSessions(h1);
  const { rows, counts, forms, window } = historyRows({ instrument: 'GOLD', assetClass: 'commodity', nyBars: ny, sessions: sess,
    from: '2026-08-10', to: '2026-09-30', iv: { GVZ: ny.map(b => [b.date, 15]) }, tagFor: () => 'none' });
  assert.equal(window.to, LOCKBOX_END);
  assert.ok(rows.length > 5 && rows.every(r => r.date <= LOCKBOX_END));
  assert.ok(counts.plain && counts.persist && counts.ivadj && counts.har800);
  assert.ok(forms['persist+iv'] > 0);
  // the plain row is the production ladder on bars that closed before the session, scored by scoreLadder
  const r = rows[0];
  const before = ny.filter(b => b.date < r.date).slice(-800);
  const L = buildLadder(forecastSigma(before, paramsFor('GOLD', 'commodity').estimator), { instrument: 'GOLD', assetClass: 'commodity', eventTag: 'none' });
  assert.deepEqual(r.s.plain, scoreLadder(L, sess.get(r.date)));
  assert.ok(['calm', 'normal', 'stressed'].includes(r.regime));
  // EURUSD has no implied-vol history server-side: the chosen forecast runs its persistence form, no IV-adjusted rows
  const e = historyRows({ instrument: 'EURUSD', nyBars: ny, sessions: sess, from: '2026-08-10', to: '2026-08-21' });
  assert.ok(e.counts.persist > 0 && e.counts.ivadj === 0 && !e.forms['persist+iv']);
});

test('summariseHistory: pooled table with bootstrap intervals, ratio vs plain, splits', () => {
  const h1 = walk('2022-01-03T00:00:00Z', 24 * 365 * 4.7, 8);
  const ny = nyDailyFromH1(h1), sess = londonSessions(h1);
  const { rows } = historyRows({ instrument: 'EURUSD', nyBars: ny, sessions: sess, from: '2026-01-01', to: '2026-08-21', tagFor: () => 'none' });
  const S = summariseHistory(rows, ['plain', 'persist', 'ivadj'], { nBoot: 200 });
  assert.ok(S.plain.pooled.hl[1].ci.length === 2);
  assert.ok(S.persist.pooled.ratio > 0 && S.persist.pooled.ratioCi.length === 2);
  assert.equal(S.ivadj.empty, true);
  assert.ok(S.plain.byYear['2026'] && S.plain.event.quiet && S.plain.byInst.EURUSD);
});
