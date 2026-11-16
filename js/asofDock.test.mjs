// js/asofDock.test.mjs: the pure rules of the docked time bar. node --test js/asofDock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from './asofDock.js';
import { coverage } from './asofCore.js';

const T = s => Date.parse(s), M = 60_000, H = 3_600_000;

test('the track covers first record to now; with nothing recorded it shows the last day and says it is empty', () => {
  const cv = coverage({ fullDays: ['2026-11-14'] }, [{ ts: T('2026-11-14T17:49Z') }, { ts: T('2026-11-16T12:00Z') }]);
  const now = T('2026-11-16T12:30Z');
  assert.deepEqual(D.trackRange(cv, now), { from: T('2026-11-14T17:49Z'), to: now, empty: false });
  assert.equal(D.trackRange(cv, T('2026-11-16T11:00Z')).to, T('2026-11-16T12:00Z'), 'never ends before the last record');
  const e = D.trackRange(coverage({}, []), now); assert.equal(e.empty, true); assert.equal(e.to - e.from, 24 * H);
});

test('handle position and back: a fraction maps to a time on the 5-minute cadence, inside the range', () => {
  const from = T('2026-11-14T17:49Z'), to = T('2026-11-16T12:30Z');
  assert.equal(D.fracOf(from, from, to), 0); assert.equal(D.fracOf(to, from, to), 1); assert.equal(D.fracOf(from - H, from, to), 0, 'clamped'); assert.equal(D.fracOf(to + H, from, to), 1);
  const t = D.timeAtFrac(0.5, from, to); assert.equal(t % (5 * M), 0); assert.ok(t > from && t < to);
  assert.equal(D.timeAtFrac(-3, from, to), from, 'clamped to the first record'); assert.equal(D.timeAtFrac(9, from, to), to, 'clamped to now');
});

test('the heat strip: before capture is -1, a gap is 0, the shut-market cadence is sparse, a busy hour is dense; a gap in the middle is visible', () => {
  const from = T('2026-11-14T17:00Z'), to = T('2026-11-14T23:00Z');
  const pts = [];
  for (let t = T('2026-11-14T17:49Z'); t < T('2026-11-14T19:00Z'); t += 5 * M) pts.push({ ts: t });          // dense from 17:49 to 19:00
  pts.push({ ts: T('2026-11-14T19:30Z') }, { ts: T('2026-11-14T20:00Z') }, { ts: T('2026-11-14T20:30Z') }); // sparse
  for (let t = T('2026-11-14T22:00Z'); t < T('2026-11-14T23:00Z'); t += 5 * M) pts.push({ ts: t });          // dense again after a gap at 21:00
  const bins = D.heatBins(pts, from, to);
  const at = h => bins.find(b => b.t === T(`2026-11-14T${h}:00Z`));
  assert.equal(bins.length, 6);
  assert.equal(at('17').level, 2, 'three points in the 17:00 hour (capture began at 17:49) is partial'); assert.equal(at('18').level, 3); assert.equal(at('19').level, 1, 'two points an hour is sparse'); assert.equal(at('21').level, 0, 'a gap inside the coverage');
  assert.equal(at('22').level, 3);
  const early = D.heatBins(pts, T('2026-11-14T15:00Z'), to); assert.equal(early[0].level, -1, 'before capture began');
  assert.ok(bins.every(b => b.left >= 0 && b.right <= 1 && b.right >= b.left));
  assert.deepEqual(D.heatBins([], from, to).map(b => b.level), [-1, -1, -1, -1, -1, -1]);
});

test('date labels: one at each UTC midnight inside the range, thinned so they do not collide', () => {
  const ticks = D.dayTicks(T('2026-11-14T17:49Z'), T('2026-11-16T12:30Z'));
  assert.deepEqual(ticks.map(t => t.label), ['Sun 15', 'Mon 16']); assert.ok(ticks.every(t => t.frac > 0 && t.frac < 1));
  const many = D.dayTicks(T('2026-10-20T00:00Z'), T('2026-11-16T00:00Z'), 8); assert.ok(many.length <= 8 && many.length >= 4);
});

test('the daily record marks: about 10:00 London on each full day, inside the range only', () => {
  assert.equal(D.fullMarkTs('2026-11-15'), T('2026-11-15T10:00Z')); assert.equal(D.fullMarkTs('2026-07-01'), T('2026-07-01T09:00Z'), 'BST');
  assert.equal(D.fullMarkTs('nope'), null);
  const m = D.fullMarks(['2026-11-14', '2026-11-15', '2026-11-16'], T('2026-11-14T17:49Z'), T('2026-11-16T12:30Z'));
  assert.deepEqual(m.map(x => x.t), [T('2026-11-15T10:00Z'), T('2026-11-16T10:00Z')], 'the 14th 10:00 is before the first record');
});

test('keys: arrows step 15 minutes (shift an hour), PageUp/PageDown a day, Home is the first record, End and Escape are back to live, Space is play; modifiers are left alone', () => {
  assert.deepEqual(D.keyAction('ArrowLeft'), { op: 'step', ms: -15 * M }); assert.deepEqual(D.keyAction('ArrowRight'), { op: 'step', ms: 15 * M });
  assert.deepEqual(D.keyAction('ArrowRight', { shift: true }), { op: 'step', ms: H }); assert.deepEqual(D.keyAction('PageUp'), { op: 'step', ms: -86_400_000 });
  assert.deepEqual(D.keyAction('Home'), { op: 'first' }); assert.deepEqual(D.keyAction('End'), { op: 'live' }); assert.deepEqual(D.keyAction('Escape'), { op: 'live' }); assert.deepEqual(D.keyAction(' '), { op: 'play' });
  assert.equal(D.keyAction('ArrowLeft', { ctrl: true }), null); assert.equal(D.keyAction('a'), null);
});

test('the words: live says Now, a past view the time, a drag says it is a preview, loading says loading; the first-record line is honest', () => {
  assert.equal(D.readout({ active: false }), 'Now');
  assert.equal(D.readout({ active: true, t: T('2026-11-15T12:00Z') }), 'Sun 15 Nov 12:00 UTC');
  assert.match(D.readout({ active: true, t: 1, preview: T('2026-11-15T12:00Z') }), /Sun 15 Nov 12:00 UTC .*let go/);
  assert.match(D.readout({ active: true, t: T('2026-11-15T12:00Z'), loading: true }), /^Loading Sun 15 Nov 12:00 UTC…$/);
  const cv = coverage({ fullDays: ['2026-11-14', '2026-11-15'] }, [{ ts: T('2026-11-14T17:49Z') }, { ts: T('2026-11-14T17:54Z') }]);
  assert.match(D.firstRecordText(cv), /First record Sat 14 Nov 17:49 UTC · 2 points · 2 daily records \(14 Nov 2026, 15 Nov 2026\)/);
  assert.equal(D.firstRecordText(coverage({}, [])), 'No records yet');
  assert.deepEqual(D.STEP_BUTTONS.map(b => b[0]), ['-1d', '-1h', '-15m', '+15m', '+1h', '+1d']); assert.deepEqual(D.SPEEDS, [2, 10, 60, 300]);
});
