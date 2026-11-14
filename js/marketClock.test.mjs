import test from 'node:test';
import assert from 'node:assert/strict';
import { isFxOpen, fxWeekOpen, lastCloseTs, nextOpenTs, weeklyWindow, holidayNote, clockState } from './marketClock.js';

const t = s => Date.parse(s);

test('the wide capture rule is unchanged', () => {
  assert.equal(isFxOpen(t('2026-11-14T12:00:00Z')), false);
  assert.equal(isFxOpen(t('2026-11-15T20:59:00Z')), false);
  assert.equal(isFxOpen(t('2026-11-15T21:00:00Z')), true);
  assert.equal(isFxOpen(t('2026-11-13T21:59:00Z')), true);
  assert.equal(isFxOpen(t('2026-11-13T22:00:00Z')), false);
});

test('winter (EST): closes Fri 22:00 UTC, reopens Sun 22:00 UTC', () => {
  assert.equal(fxWeekOpen(t('2026-11-13T21:59:00Z')), true);
  assert.equal(fxWeekOpen(t('2026-11-13T22:00:00Z')), false);
  assert.equal(fxWeekOpen(t('2026-11-14T12:00:00Z')), false);
  assert.equal(fxWeekOpen(t('2026-11-15T21:59:00Z')), false);      // the wide rule says open here, the precise one does not
  assert.equal(fxWeekOpen(t('2026-11-15T22:00:00Z')), true);
  assert.equal(lastCloseTs(t('2026-11-14T17:56:00Z')), t('2026-11-13T22:00:00Z'));
  assert.equal(nextOpenTs(t('2026-11-14T17:56:00Z')), t('2026-11-15T22:00:00Z'));
});

test('summer (EDT): closes Fri 21:00 UTC, reopens Sun 21:00 UTC', () => {
  assert.equal(fxWeekOpen(t('2026-07-10T20:59:00Z')), true);
  assert.equal(fxWeekOpen(t('2026-07-10T21:00:00Z')), false);
  assert.equal(fxWeekOpen(t('2026-07-12T20:59:00Z')), false);
  assert.equal(fxWeekOpen(t('2026-07-12T21:00:00Z')), true);
  assert.equal(lastCloseTs(t('2026-07-11T10:00:00Z')), t('2026-07-10T21:00:00Z'));
});

test('the daylight-saving switch weeks', () => {
  // US clocks go forward Sun 2026-03-08 (02:00 local): Friday 6 Mar closes 22:00 UTC (EST), the Sunday reopen is 17:00 EDT = 21:00 UTC
  assert.equal(fxWeekOpen(t('2026-03-06T21:59:00Z')), true);
  assert.equal(fxWeekOpen(t('2026-03-06T22:00:00Z')), false);
  assert.equal(fxWeekOpen(t('2026-03-08T20:59:00Z')), false);
  assert.equal(fxWeekOpen(t('2026-03-08T21:00:00Z')), true);
  // clocks go back Sun 2026-11-01: Friday 30 Oct closes 21:00 UTC (EDT), the Sunday reopen is 17:00 EST = 22:00 UTC
  assert.equal(fxWeekOpen(t('2026-10-30T20:59:00Z')), true);
  assert.equal(fxWeekOpen(t('2026-10-30T21:00:00Z')), false);
  assert.equal(fxWeekOpen(t('2026-11-01T21:59:00Z')), false);
  assert.equal(fxWeekOpen(t('2026-11-01T22:00:00Z')), true);
});

test('mid-week is open, including the Monday small hours and Thursday night', () => {
  for (const s of ['2026-11-16T00:00:00Z', '2026-11-18T12:00:00Z', '2026-11-19T23:30:00Z', '2026-11-20T10:00:00Z']) assert.equal(fxWeekOpen(t(s)), true, s);
});

test('while open, lastCloseTs is last weekend and the label is null', () => {
  const ms = t('2026-11-17T09:00:00Z'), m = clockState(ms);
  assert.equal(m.open, true); assert.equal(m.label, null); assert.equal(m.short, null);
  assert.equal(lastCloseTs(ms), t('2026-11-13T22:00:00Z'));
});

test('the closed label names the close in UTC and London, and the reopen', () => {
  const w = clockState(t('2026-11-14T17:56:00Z'));
  assert.equal(w.open, false);
  assert.equal(w.label, 'Markets closed · showing the close, Fri 22:00 UTC (London 22:00) · reopens Sun 22:00 UTC');
  assert.equal(w.short, 'closed · as at Fri 22:00 UTC');
  const s = clockState(t('2026-07-11T10:00:00Z'));          // summer: 21:00 UTC is 22:00 in London
  assert.equal(s.label, 'Markets closed · showing the close, Fri 21:00 UTC (London 22:00) · reopens Sun 21:00 UTC');
});

test('the label is a statement of last prints: no forecast or direction wording', () => {
  const l = clockState(t('2026-11-14T17:56:00Z')).label;
  assert.doesNotMatch(l, /will|expect|forecast|bull|bear|long|short|buy|sell/i);
});

test('weeklyWindow finds the right Friday across a month boundary', () => {
  const w = weeklyWindow(t('2026-11-02T06:00:00Z'));           // Monday after the clock change
  assert.equal(w.close, t('2026-10-30T21:00:00Z')); assert.equal(w.open, t('2026-11-01T22:00:00Z'));
});

test('holiday notes come from the market calendar and never switch the FX week off', () => {
  const thanksgiving = t('2026-11-26T15:00:00Z');
  assert.ok(holidayNote(thanksgiving).some(x => /US stock market closed today \(Thanksgiving\)/.test(x)), holidayNote(thanksgiving).join('|'));
  assert.equal(fxWeekOpen(thanksgiving), true);
  assert.equal(clockState(thanksgiving).open, true);
  assert.deepEqual(holidayNote(t('2026-11-18T12:00:00Z')), []);
  const christmas = t('2026-12-25T12:00:00Z');
  assert.ok(holidayNote(christmas).length >= 1);
  assert.equal(fxWeekOpen(christmas), true);                   // a Friday before the 17:00 roll
});
