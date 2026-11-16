// js/terminal/replayRange.test.mjs: range used through a London session, played back (the vol clock replay): the frames from one-minute bars and the archived
// forecast (point in time: only finished bars, the forecast only from when it was computed), the drawing, the choices, and the button on the vol clock bar.
// Stand-in DOM: proves wiring and honesty text, not the look. node --test js/terminal/replayRange.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin } from './feelFakeDom.fixtures.mjs';
import { openPlayer } from './replayPlayer.js';
import { mountReplayViz, defFor } from './replayViz.js';
import { rangeStage } from './replayRangeDraw.js';
import { rangeFrames, rangeScale, rangeCaption, RANGE_MARKETS } from '../replayVizCore.js';

const DAY0 = Date.parse('2026-11-13T00:00:00Z'), MIN = 60e3;
const win = { date: '2026-11-13', start: DAY0, end: DAY0 + 24 * 3600e3 };
// 6 hours of minute bars: drifts up 0.4% by 03:00 then back down to -0.3% below the open by 06:00
function dayDoc(over = {}) {
  const bars = Array.from({ length: 360 }, (_, k) => { const p = 100 * (1 + (k < 180 ? k / 180 * 0.004 : 0.004 - (k - 180) / 180 * 0.007)); return [DAY0 + k * MIN, p, p + 0.01, p - 0.01, p]; });
  return { ok: true, inst: 'NQ', label: 'Nasdaq 100', dp: 1, date: '2026-11-13', win, bars, forecast: { hl_median: 0.3, hl_75: 0.5, knownFrom: DAY0 + 2 * 3600e3 }, ...over };
}

test('rangeFrames: 15-minute steps from the first finished bar, high and low so far as a percent of the open, only finished bars, forecast only once it was computed', () => {
  const r = rangeFrames(dayDoc()); assert.equal(r.ok, true); assert.equal(r.open.price, 100); assert.ok(r.frames.length >= 23 && r.frames.length <= 24);
  assert.equal(r.frames[0].t, DAY0 + 15 * MIN, 'the first step is 15 minutes in'); assert.ok(r.frames.every((f, i, a) => i === 0 || f.t - a[i - 1].t === 15 * MIN));
  const at = h => r.frames.find(f => f.t === DAY0 + h * 3600e3).data;
  assert.equal(at(1).known, false, 'the forecast was computed at 02:00'); assert.equal(at(2).known, true, 'known from the step at its own time');
  assert.ok(at(3).up > 0.38 && at(3).up < 0.41, 'the high so far at 03:00 is about +0.4%'); assert.ok(at(3).dn < 0.05);
  assert.ok(at(6).dn > 0.28 && at(6).dn < 0.33, 'the low so far at 06:00 is about -0.3%');
  // no lookahead: truncating the day at 03:00 leaves every earlier frame unchanged
  const cut = rangeFrames(dayDoc({ bars: dayDoc().bars.slice(0, 180) })); const same = r.frames.filter(f => f.t <= cut.frames.at(-1).t);
  assert.deepEqual(cut.frames, same, 'a frame never depends on later bars');
  assert.ok(r.path.length > 50 && r.path[0][0] === DAY0 && r.path.every((p, i, a) => i === 0 || p[0] > a[i - 1][0]));
});

test('rangeFrames answers honestly: no bars, no usable open, no forecast archived', () => {
  assert.match(rangeFrames({ bars: [], win }).error, /no price bars/); assert.equal(rangeFrames(null).ok, false);
  assert.match(rangeFrames(dayDoc({ bars: [[DAY0, 0, 0, 0, 0]] })).error, /no usable open/);
  const nf = rangeFrames(dayDoc({ forecast: null })); assert.equal(nf.ok, true); assert.equal(nf.fc, null); assert.ok(nf.frames.every(f => f.data.known === false));
});

test('rangeScale is one scale for the whole replay; rangeCaption states the excursions against the forecast and never forecasts', () => {
  const r = rangeFrames(dayDoc()), sc = rangeScale(r.frames, r.fc); assert.ok(sc.max >= 1.6); assert.ok(Math.abs(sc.p75 - 5 / 3) < 1e-9); assert.equal(rangeScale([], null).p75, null);
  const extra = { fc: r.fc, label: 'Nasdaq 100' };
  const c = rangeCaption(r.frames, r.frames.findIndex(f => f.t === DAY0 + 3 * 3600e3), extra);
  assert.match(c, /Nasdaq 100 has travelled 0\.4\d% above its London open and 0\.0\d% below it/); assert.match(c, /median for a day's extreme from the open is 0\.30% and the 75th percentile 0\.50%/); assert.match(c, /upside has used 13\d%/);
  assert.match(rangeCaption(r.frames, 0, extra), /had not been computed yet/); assert.match(rangeCaption(r.frames, 0, { fc: null, label: 'X' }), /No forecast was archived/);
  assert.doesNotMatch(c, /will |forecast to|buy|sell/i); assert.equal(rangeCaption([], 0, extra), '');
});

test('range drawing: price path only up to this step, open and forecast lines, two gauges on one scale, theme tokens only, plain under reduced motion', () => {
  const r = rangeFrames(dayDoc()), extra = { open: r.open, path: r.path, fc: r.fc, win: r.win, label: 'Nasdaq 100' }, i = r.frames.findIndex(f => f.t === DAY0 + 4 * 3600e3);
  const svg = rangeStage(r.frames, i, extra); assert.match(svg, /^<svg/); assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  assert.match(svg, /p50 up/); assert.match(svg, /p75 dn/); assert.match(svg, /up from open/); assert.match(svg, /down from open/); assert.match(svg, /% of p50/);
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}["']/); assert.match(svg, /filter="url/); assert.doesNotMatch(rangeStage(r.frames, i, extra, { reduced: true }), /filter="url/);
  const early = rangeStage(r.frames, 0, extra); assert.match(early, /forecast not computed yet/); assert.doesNotMatch(early, /p50 up/, 'no forecast lines before the forecast existed');
  const pathLen = s => (s.match(/<path d="M([^"]*)"/)?.[1].split('L').length ?? 0);
  assert.ok(pathLen(svg) > pathLen(early), 'the path grows with the replay and the rest of the day is not drawn');
  assert.match(rangeStage([], 0, null), /Nothing to draw/); assert.match(rangeStage(r.frames, 0, { ...extra, fc: null }), /no forecast archived/);
});

const flush = () => new Promise(r => setTimeout(r, 5));
test('the range replay offers market and session, reloads for either, says what it holds, and its button sits on the Vol clock bar', async () => {
  const asked = [], fetchJson = async u => { asked.push(u); return dayDoc({ inst: u.includes('GOLD') ? 'GOLD' : 'NQ', label: u.includes('GOLD') ? 'Gold' : 'Nasdaq 100' }); };
  const def = defFor('range', { fetchJson, now: () => Date.parse('2026-11-16T10:00:00Z') });
  assert.deepEqual(def.picks[0].values.map(v => v.v), RANGE_MARKETS); assert.equal(def.picks[1].values[0].v, '2026-11-13');
  const doc = makePage(), w = makeWin(doc, { matchMedia: () => ({ matches: false }), requestAnimationFrame: undefined });
  openPlayer(def, { doc, win: w, raf: () => 1, caf: () => {}, now: () => 0 }); await flush();
  const back = doc.getElementById('rpv-back');
  assert.deepEqual(asked, ['/api/replay/day?inst=NQ&date=2026-11-13']); assert.match(doc.getElementById('rpv-cov').textContent, /steps of 15 minutes, Fri 13 Nov 00:15 London/);
  doc.fire('click', back.querySelector('[data-pick="inst"][data-val="GOLD"]')); await flush();
  assert.equal(asked.at(-1), '/api/replay/day?inst=GOLD&date=2026-11-13'); assert.match(doc.getElementById('rpv-cap').textContent, /Gold has travelled/);
  assert.match(def.note, /only the one-minute bars that had finished by then/); assert.doesNotMatch(def.note, /will |buy|sell/i);
  const d2 = makePage(), host = d2.createElement('div');
  host.innerHTML = '<div data-surface="panel.asset.volclock"><div class="vc-bar"><span class="lbl">Vol clock</span></div><div class="card"><div class="ch"><span class="lbl">Every market the vol intelligence covers</span></div></div></div>';
  d2.body.appendChild(host);
  const m = mountReplayViz({ doc: d2, win: makeWin(d2, { matchMedia: () => ({ matches: false }), requestAnimationFrame: undefined }), fetchJson });
  assert.equal(d2.querySelectorAll('[data-rpviz="range"]').length, 1, 'one button, on the Vol clock label only'); m.destroy();
});
