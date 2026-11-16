// js/replayVizCore.test.mjs: the replay player's state machine, the coverage line and the yield-curve frames. Pure; no DOM.
// node --test js/replayVizCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEEDS, initState, advance, step, seek, toggle, setSpeed, act, keyAction, coverageOf, curveFrames, curveBounds, curveCaption } from './replayVizCore.js';

const mkS = (start, n, f) => Array.from({ length: n }, (_, k) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10), value: f(k) }));

test('initState starts on the last frame, paused; an empty or one-frame replay cannot play', () => {
  const s = initState(10); assert.equal(s.i, 9); assert.equal(s.playing, false); assert.equal(s.speed, 1);
  assert.equal(initState(0).n, 0); assert.equal(initState(1, { playing: true }).playing, false);
  assert.equal(initState(5, { speed: 99 }).speed, 1, 'an unknown speed falls back to x1');
});

test('advance moves by real time at the chosen speed, stops at the end, or loops', () => {
  let s = toggle(initState(10, { i: 0 }));
  assert.equal(s.playing, true);
  s = advance(s, 1000); assert.equal(s.i, SPEEDS[1], 'x1 = 3 frames in one second');
  s = setSpeed(s, 16); const before = s.i; s = advance(s, 100); assert.ok(s.i > before, 'x16 is faster');
  let e = { ...initState(5, { i: 3 }), playing: true }; e = advance(e, 5000);
  assert.equal(e.i, 4); assert.equal(e.playing, false, 'stops on the last frame');
  let l = { ...initState(5, { i: 3, loop: true }), playing: true }; l = advance(l, 1000);
  assert.equal(l.playing, true); assert.ok(l.i >= 0 && l.i < 5, 'loops back inside the frames');
  const p = initState(5); assert.equal(advance(p, 5000), p, 'paused does not move');
});

test('step, seek and the keyboard map; seek and step clamp and pause', () => {
  let s = { ...initState(5, { i: 2 }), playing: true };
  s = step(s, 1); assert.equal(s.i, 3); assert.equal(s.playing, false);
  assert.equal(step(seek(s, 0), -1).i, 0); assert.equal(seek(s, 99).i, 4); assert.equal(seek(s, -3).i, 0);
  assert.equal(keyAction(' '), 'toggle'); assert.equal(keyAction('ArrowLeft'), 'prev'); assert.equal(keyAction('Escape'), 'close'); assert.equal(keyAction('q'), null);
  assert.equal(act(initState(5), 'first').i, 0); assert.equal(act(initState(5, { i: 0 }), 'last').i, 4);
  assert.equal(act(initState(5), 'faster').speed, 4); assert.equal(act(setSpeed(initState(5), 16), 'faster').speed, 16); assert.equal(act(setSpeed(initState(5), 4), 'slower').speed, 1);
  assert.equal(act(initState(5), 'loop').loop, true);
});

test('pressing play on the last frame starts again from the first', () => {
  const s = toggle(initState(5)); assert.equal(s.i, 0); assert.equal(s.playing, true);
});

test('coverageOf says how much history there is and says so when it falls short of what was asked', () => {
  const none = coverageOf([], { from: '2026-08-01' }); assert.equal(none.n, 0); assert.match(none.text, /nothing to replay/);
  const frames = [{ t: '2026-10-01' }, { t: '2026-10-02' }, { t: '2026-10-05' }];
  const c = coverageOf(frames, { from: '2026-08-01' });
  assert.equal(c.n, 3); assert.equal(c.first, '2026-10-01'); assert.equal(c.last, '2026-10-05'); assert.equal(c.short, true);
  assert.match(c.text, /3 frames/); assert.match(c.text, /No history before .*1 Oct 2026/); assert.match(c.text, /asked for back to .*1 Aug 2026/);
  assert.equal(coverageOf(frames, { from: '2026-09-28' }).short, false, 'within a week of what was asked is not short');
  assert.match(coverageOf([{ t: Date.parse('2026-10-01T00:00:00Z') }]).text, /1 frame,/);
});

const S = (k) => ({
  effr: mkS('2026-08-01', 120, () => 3.6), us2y: mkS('2026-08-01', 120, i => 3.8 + i * 0.002), us5y: mkS('2026-08-01', 120, i => 3.9 + i * 0.002),
  us10y: mkS('2026-08-01', 120, i => 4.1 + i * 0.004 + (k ?? 0)), us30y: mkS('2026-08-01', 120, i => 4.6 + i * 0.003),
});

test('curveFrames: one frame per day in the window, only whole curves, slope in bp, dated by the print', () => {
  const r = curveFrames(S(), { days: 30 });
  assert.equal(r.ok, true); assert.ok(r.frames.length >= 30 && r.frames.length <= 32);
  assert.deepEqual(r.frames[0].data.pts.map(p => p.k), ['FF', '2y', '5y', '10y', '30y']);
  const f = r.frames[0]; assert.equal(f.data.s2s10, Math.round((f.data.pts[3].v - f.data.pts[1].v) * 100));
  assert.ok(r.frames.every((x, i, a) => i === 0 || a[i - 1].t < x.t), 'ascending, unique days');
  assert.match(r.note, /not what a screen showed/);
  const asc = r.frames.map(x => x.t); assert.ok(asc.at(-1) <= r.asOf);
});

test('curveFrames drops a day when a tenor has no print within 6 days, and never fills one', () => {
  const s = S(); s.us5y = s.us5y.filter(p => p.date < '2026-09-01' || p.date > '2026-09-20'); // a 19-day hole in the 5y
  const r = curveFrames(s, { days: 120 });
  assert.ok(!r.frames.some(f => f.t > '2026-09-08' && f.t < '2026-09-21'), 'frames inside the hole are dropped');
  assert.ok(r.frames.every(f => f.data.pts.length === 5));
});

test('curveFrames without data answers honestly', () => {
  assert.equal(curveFrames(null).ok, false); assert.equal(curveFrames({ us10y: [] }).frames.length, 0);
});

test('curveBounds covers every frame, curveCaption describes the day in plain words', () => {
  const r = curveFrames(S(), { days: 30 }), b = curveBounds(r.frames);
  assert.ok(b.lo < 3.6 && b.hi > 4.6);
  assert.match(curveCaption(r.frames, 0), /first day of this window/);
  const c = curveCaption(r.frames, r.frames.length - 1); assert.match(c, /upward-sloping|flat|inverted/); assert.match(c, /bp/);
  assert.doesNotMatch(c, /will|forecast|buy|sell/i, 'description only');
  assert.equal(curveCaption([], 0), ''); assert.equal(curveBounds([]), null);
});
