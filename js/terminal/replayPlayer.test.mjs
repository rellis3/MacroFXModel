// js/terminal/replayPlayer.test.mjs: the shared replay player, the Replay button wiring and the yield-curve drawing, over the stand-in DOM
// (js/terminal/feelFakeDom.fixtures.mjs). It proves wiring, controls, honesty text and that the drawing is well formed; it does NOT prove the look,
// the animation, phone width or any theme in a real browser.
// node --test js/terminal/replayPlayer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, makeWin } from './feelFakeDom.fixtures.mjs';
import { openPlayer } from './replayPlayer.js';
import { mountReplayViz, defFor } from './replayViz.js';
import { curveStage } from './replayCurveDraw.js';
import { curveFrames, curveBounds, strengthFrames } from '../replayVizCore.js';
import { strengthStage } from './replayStrengthDraw.js';
import { fedStage } from './replayFedDraw.js';
import { fedFrames, corrFrames } from '../replayVizCore.js';
import { corrStage } from './replayCorrDraw.js';

const mkSeries = (n, f) => Array.from({ length: n }, (_, k) => ({ date: new Date(Date.parse('2026-06-01T00:00:00Z') + k * 864e5).toISOString().slice(0, 10), value: f(k) }));
const S = { effr: mkSeries(200, () => 3.6), us2y: mkSeries(200, k => 3.8 + k * 0.001), us5y: mkSeries(200, k => 3.9 + k * 0.001), us10y: mkSeries(200, k => 4.1 + k * 0.002), us30y: mkSeries(200, k => 4.6 + k * 0.001) };
const curve = curveFrames(S, { days: 90, now: Date.parse('2026-12-20T00:00:00Z') });

function setup(def, { reducedMotion = false } = {}) {
  const doc = makePage(), win = makeWin(doc, { matchMedia: () => ({ matches: reducedMotion }), requestAnimationFrame: undefined });
  let clock = 0; const q = []; let id = 0;
  const raf = fn => { q.push(fn); return ++id; };
  const tick = ms => { clock += ms; const run = q.splice(0); run.forEach(f => f()); };
  const p = openPlayer(def, { doc, win, raf, caf: () => {}, now: () => clock });
  return { doc, win, p, tick, back: doc.getElementById('rpv-back') };
}
const flush = () => new Promise(r => setTimeout(r, 5));
const frames5 = Array.from({ length: 5 }, (_, i) => ({ t: `2026-11-0${i + 1}`, data: { v: i } }));
const defOf = (over = {}) => ({ id: 't', title: 'Test replay', note: 'A note.', load: async () => ({ frames: frames5, wanted: { from: '2026-11-01' } }), draw: (fr, i, o) => `<svg data-i="${i}" data-reduced="${o.reduced}"></svg>`, caption: (fr, i) => `caption ${i}`, ...over });

test('opens a labelled dialog that says it is history, loads, shows the coverage line and the first frame', async () => {
  const { doc, back } = setup(defOf()); await flush();
  assert.equal(back.getAttribute('role'), 'dialog'); assert.equal(back.getAttribute('aria-modal'), 'true'); assert.match(back.getAttribute('aria-label'), /Replay: Test replay/);
  assert.match(back.textContent, /Replaying history, not live/);
  assert.match(doc.getElementById('rpv-cov').textContent, /5 frames, .*1 Nov 2026 to .*5 Nov 2026/);
  assert.match(doc.getElementById('rpv-date').textContent, /1 Nov 2026 · frame 1 of 5/);
  assert.match(doc.getElementById('rpv-stage').innerHTML, /data-i="0"/); assert.equal(doc.getElementById('rpv-cap').textContent, 'caption 0');
  assert.equal(doc.getElementById('rpv-scrub').disabled, false); assert.equal(doc.getElementById('rpv-scrub').max, '4');
});

test('play runs frames with the clock, pause stops, step and keys move one frame, Home and End jump, Esc closes and returns focus', async () => {
  const opener = { focused: false, focus() { this.focused = true; } };
  const doc = makePage(), win = makeWin(doc, { matchMedia: () => ({ matches: false }), requestAnimationFrame: undefined });
  let clock = 0; const q = [];
  const p = openPlayer(defOf(), { doc, win, raf: fn => (q.push(fn), q.length), caf: () => {}, now: () => clock, opener });
  await flush();
  const back = doc.getElementById('rpv-back'), play = doc.getElementById('rpv-play');
  doc.fire('click', play); assert.equal(p.state().playing, true); assert.match(play.textContent, /Pause/);
  for (let k = 0; k < 3; k++) { clock += 250; q.splice(0).forEach(f => f()); }   // the player caps one step of real time at 250 ms
  assert.ok(p.state().i >= 1, 'two frames or so in 750 ms at x1');
  doc.fire('click', play); assert.equal(p.state().playing, false); assert.match(play.textContent, /Play/);
  const at = p.state().i;
  doc.fire('keydown', back, { key: 'ArrowRight' }); assert.equal(p.state().i, Math.min(4, at + 1));
  doc.fire('keydown', back, { key: 'Home' }); assert.equal(p.state().i, 0);
  doc.fire('keydown', back, { key: 'End' }); assert.equal(p.state().i, 4);
  doc.fire('keydown', back, { key: '+' }); assert.equal(p.state().speed, 4);
  doc.fire('click', back.querySelector('[data-speed="16"]')); assert.equal(p.state().speed, 16); assert.equal(back.querySelector('[data-speed="16"]').getAttribute('aria-pressed'), 'true');
  doc.fire('keydown', back, { key: 'l' }); assert.equal(p.state().loop, true);
  const e = doc.fire('keydown', back, { key: ' ' }); assert.equal(e.defaultPrevented, true, 'space is handled, not scrolled');
  doc.fire('keydown', back, { key: 'Escape' }); assert.equal(doc.getElementById('rpv-back'), null); assert.equal(opener.focused, true);
});

test('the scrubber seeks and pauses; a click on the dim backdrop closes', async () => {
  const { doc, p, back } = setup(defOf()); await flush();
  const sc = doc.getElementById('rpv-scrub'); sc.value = '3'; doc.fire('input', sc);
  assert.equal(p.state().i, 3); assert.equal(p.state().playing, false); assert.match(doc.getElementById('rpv-date').textContent, /frame 4 of 5/);
  doc.fire('click', back); assert.equal(doc.getElementById('rpv-back'), null);
});

test('honest when there is no history: none, one day, a load error, or less than was asked for', async () => {
  let s = setup(defOf({ load: async () => ({ frames: [] }) })); await flush();
  assert.match(s.doc.getElementById('rpv-stage').innerHTML, /nothing to replay/); assert.notEqual(s.doc.getElementById('rpv-scrub').attrs.disabled, undefined, 'the scrubber stays disabled');
  s.p.close();
  s = setup(defOf({ load: async () => ({ frames: frames5.slice(0, 1) }) })); await flush();
  assert.match(s.doc.getElementById('rpv-stage').innerHTML, /Only one frame is held/); s.p.close();
  s = setup(defOf({ load: async () => { throw new Error('HTTP 502'); } })); await flush();
  assert.match(s.doc.getElementById('rpv-stage').innerHTML, /could not load: HTTP 502/); s.p.close();
  s = setup(defOf({ load: async () => ({ frames: frames5, wanted: { from: '2026-08-01' } }) })); await flush();
  assert.match(s.doc.getElementById('rpv-cov').textContent, /No history before .*1 Nov 2026.*asked for back to .*1 Aug 2026/);
});

test('reduced motion: the dialog says so and the drawing is told, with the same controls', async () => {
  const { doc, back } = setup(defOf(), { reducedMotion: true }); await flush();
  assert.match(back.getAttribute('class'), /rpv-reduced/); assert.match(doc.getElementById('rpv-stage').innerHTML, /data-reduced="true"/);
  doc.fire('keydown', back, { key: 'ArrowRight' }); assert.match(doc.getElementById('rpv-date').textContent, /frame 2 of 5/);
});

test('a theme change redraws the frame', async () => {
  const doc = makePage(), listeners = {}, win = makeWin(doc, { matchMedia: () => ({ matches: false }), requestAnimationFrame: undefined, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: t => { delete listeners[t]; } });
  let draws = 0; const p = openPlayer(defOf({ draw: () => { draws++; return '<svg></svg>'; } }), { doc, win, raf: () => 1, caf: () => {}, now: () => 0 });
  await flush(); const n = draws; assert.equal(typeof listeners.themechange, 'function'); listeners.themechange(); assert.equal(draws, n + 1);
  p.close(); assert.equal(listeners.themechange, undefined, 'the listener goes with the dialog');
});

test('yield curve drawing: a well-formed SVG on one fixed scale, theme tokens only, ghosts and the first-day outline, plain under reduced motion', () => {
  const b = curveBounds(curve.frames), last = curve.frames.length - 1;
  const svg = curveStage(curve.frames, last, { bounds: b });
  assert.match(svg, /^<svg/); assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  assert.equal((svg.match(/<circle/g) ?? []).length >= 6, true, 'five tenor points and the slope marker');
  assert.match(svg, /filter="url\(#rcg\d+\)"/, 'the current curve glows');
  assert.ok((svg.match(/stroke-opacity="0\.\d\d"/g) ?? []).length >= 10, 'ghosts of earlier days');
  assert.match(svg, /stroke-dasharray="4 4"/, 'the first day is a dashed outline');
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}["']/, 'no hard-coded colours: theme tokens only');
  const plain = curveStage(curve.frames, last, { bounds: b, reduced: true });
  assert.doesNotMatch(plain, /feGaussianBlur.*<path[^>]*filter=/s); assert.ok((plain.match(/stroke-opacity="0\.\d\d"/g) ?? []).length < 3, 'no ghost fade under reduced motion');
  const first = curveStage(curve.frames, 0, { bounds: b }); assert.doesNotMatch(first, /stroke-dasharray="4 4"/, 'no first-day outline on the first day');
  assert.match(curveStage(null, 0, { bounds: b }), /Nothing to draw/);
});

test('the Replay button is added to the right card only, opens the player with that visual, and goes away cleanly', async () => {
  const doc = makePage();
  const host = doc.createElement('div');
  host.innerHTML = '<div data-surface="panel.macro.curve"><div class="card"><div class="ch"><span class="lbl">The curve through time</span></div></div><div class="card"><div class="ch"><span class="lbl">The curve\'s memory</span></div></div></div>';
  doc.body.appendChild(host);
  const win = makeWin(doc, { matchMedia: () => ({ matches: false }), requestAnimationFrame: undefined });
  const seen = []; const fetchJson = async u => { seen.push(u); return curve; };
  const m = mountReplayViz({ doc, win, fetchJson });
  const btns = doc.querySelectorAll('[data-rpviz]'); assert.equal(btns.length, 1);
  assert.equal(btns[0].getAttribute('aria-label'), 'Replay: Yield curve'); assert.equal(btns[0].getAttribute('data-surface'), 'widget.replayviz');
  m.decorate(); assert.equal(doc.querySelectorAll('[data-rpviz]').length, 1, 'no duplicate button');
  doc.fire('click', btns[0]); await flush();
  assert.deepEqual(seen, ['/api/replay/curve?days=90']); assert.ok(doc.getElementById('rpv-back'));
  assert.match(doc.getElementById('rpv-stage').innerHTML, /<svg/); assert.match(doc.getElementById('rpv-cap').textContent, /the curve is /);
  assert.equal(win.deskReplayViz.open('yields'), true, 'the command line opens it by any of the visual\'s words');
  m.destroy(); assert.equal(doc.querySelectorAll('[data-rpviz]').length, 0); assert.equal(doc.getElementById('rpv-back'), null); assert.equal(win.deskReplayViz, undefined);
});

test('the curve definition asks for 90 days, passes the window it asked for, and never words the replay as a forecast', async () => {
  const def = defFor('curve', { fetchJson: async () => curve });
  const r = await def.load(); assert.equal(r.frames.length, curve.frames.length); assert.ok(r.wanted.from <= curve.frames[0].t);
  assert.match(def.note, /does not say where it goes next/); assert.doesNotMatch(def.note + def.title, /will |forecast |buy|sell/i);
  assert.equal(defFor('nope'), null);
});

const CC = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const strengthSeries = day => ({ ok: true, date: day, ccys: CC, stepMs: 900000, steps: Array.from({ length: 12 }, (_, k) => ({ t: Date.parse(`${day}T07:00:00Z`) + k * 900000, closed: false, h: { '1H': CC.map((_, j) => Math.sin(k / 3 + j) * 1.5), '4H': CC.map((_, j) => (j - 3.5) / 3), '1D': k < 2 ? null : CC.map(() => 0.2) } })) });

test('currency strength drawing: eight ranked bars on one scale, the leader glows, a dashed tick per row, no hard-coded colours, plain under reduced motion', () => {
  const x = strengthFrames(strengthSeries('2026-11-12')), svg = strengthStage(x.frames, 5, '1H', CC);
  assert.match(svg, /^<svg/); assert.doesNotMatch(svg, /NaN|undefined|Infinity/); assert.equal((svg.match(/<rect /g) ?? []).length, 8);
  assert.match(svg, /filter="url\(#rsg\d+\)"/); assert.equal((svg.match(/stroke-dasharray="2 2"/g) ?? []).length, 8);
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}["']/); assert.doesNotMatch(strengthStage(x.frames, 5, '1H', CC, { reduced: true }), /filter="url/);
  assert.match(strengthStage(x.frames, 0, '1D', CC), /No 1D reading at this step/);
});

test('the strength replay asks for the chosen session, reloads when the session changes, redraws (no reload) when the window changes, and says what it holds', async () => {
  const asked = []; const def = defFor('strength', { fetchJson: async u => { asked.push(u); return strengthSeries(u.split('=')[1]); }, now: () => Date.parse('2026-11-16T10:00:00Z') });
  assert.equal(def.picks[0].values.length, 5); assert.equal(def.picks[0].values[0].v, '2026-11-13'); assert.deepEqual(def.picks[1].values.map(v => v.v), ['1H', '4H', '1D']);
  const { doc, back } = setup(def); await flush();
  assert.deepEqual(asked, ['/api/replay/strength?date=2026-11-13']);
  assert.match(doc.getElementById('rpv-cov').textContent, /12 steps of 15 minutes, Fri 13 Nov 07:00 London to Fri 13 Nov 09:45 London/);
  assert.match(doc.getElementById('rpv-date').textContent, /step 1 of 12 · 1H/); assert.match(doc.getElementById('rpv-stage').innerHTML, /<svg/);
  doc.fire('click', back.querySelector('[data-pick="hz"][data-val="4H"]')); assert.match(doc.getElementById('rpv-date').textContent, /· 4H/); assert.equal(asked.length, 1, 'a window change does not refetch');
  assert.equal(back.querySelector('[data-pick="hz"][data-val="4H"]').getAttribute('aria-pressed'), 'true');
  doc.fire('click', back.querySelector('[data-pick="day"][data-val="2026-11-12"]')); await flush();
  assert.deepEqual(asked, ['/api/replay/strength?date=2026-11-13', '/api/replay/strength?date=2026-11-12']); assert.match(doc.getElementById('rpv-date').textContent, /Thu 12 Nov/);
  assert.match(def.note, /only the bars that had finished by then/); assert.doesNotMatch(def.note, /will |forecast|buy|sell/i);
});

test('the strength Replay button sits on the strength board card whatever window it shows', async () => {
  const doc = makePage(), host = doc.createElement('div');
  host.innerHTML = '<div data-surface="panel.ov.ccystrength"><div class="card" data-csroot><div class="ch"><span class="lbl">4H window</span></div></div></div>';
  doc.body.appendChild(host);
  const win = makeWin(doc, { matchMedia: () => ({ matches: false }), requestAnimationFrame: undefined });
  const m = mountReplayViz({ doc, win, fetchJson: async () => strengthSeries('2026-11-13') });
  assert.equal(doc.querySelectorAll('[data-rpviz="strength"]').length, 1); m.destroy();
});

const fedDoc = { ok: true, asOf: '2026-11-12', series: Object.fromEntries(['2026-12-16', '2027-03-17', '2027-06-16', '2027-09-15'].map((r, c) => [r, Array.from({ length: 30 }, (_, k) => [new Date(Date.parse('2026-10-01T00:00:00Z') + k * 864e5).toISOString().slice(0, 10), 20 + c * 10 + k, 5 + c])])) };

test('Fed path drawing: four windows with a bar up and a bar down, the history under them with the current date marked, theme tokens only, plain under reduced motion', () => {
  const r = fedFrames(fedDoc), svg = fedStage(r.frames, 10);
  assert.match(svg, /^<svg/); assert.doesNotMatch(svg, /NaN|undefined|Infinity/); assert.equal((svg.match(/<rect /g) ?? []).length, 8);
  assert.equal((svg.match(/<path /g) ?? []).length, 4, 'a history line per window'); assert.match(svg, /stroke-dasharray="3 3"/, 'the current date is marked');
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}["']/); assert.match(svg, /filter="url/); assert.doesNotMatch(fedStage(r.frames, 10, { reduced: true }), /filter="url/);
  assert.match(fedStage([], 0), /Nothing to draw/);
});

test('the Fed path replay reads /api/fed-path, says how many days are held and why the meeting strip is not replayed, and its button sits on the Atlanta Fed card', async () => {
  const asked = [], fetchJson = async u => { asked.push(u); return fedDoc; };
  const def = defFor('fedpath', { fetchJson });
  const { doc } = setup(def); await flush();
  assert.deepEqual(asked, ['/api/fed-path']); assert.match(doc.getElementById('rpv-cov').textContent, /30 trading days, .*1 Oct 2026 to .*30 Oct 2026: four windows/);
  assert.match(def.note, /not for a meeting/); assert.match(def.note, /only a few lookback copies/); assert.doesNotMatch(def.note, /will |buy|sell/i);
  const d2 = makePage(), host = d2.createElement('div');
  host.innerHTML = '<div data-surface="panel.macro.fedyields"><div class="card"><div class="ch"><span class="lbl">Atlanta Fed window odds · rate above the current range</span></div></div></div>';
  d2.body.appendChild(host);
  const m = mountReplayViz({ doc: d2, win: makeWin(d2, { matchMedia: () => ({ matches: false }), requestAnimationFrame: undefined }), fetchJson });
  assert.equal(d2.querySelectorAll('[data-rpviz="fedpath"]').length, 1); m.destroy();
});

function corrBundle(n = 260) {
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const dates = Array.from({ length: n }, (_, k) => new Date(Date.parse('2026-01-01T00:00:00Z') + k * 864e5).toISOString().slice(0, 10));
  const walk = f => { let v = 100; return Array.from({ length: n }, (_, k) => (v *= 1 + f(k))); }, common = Array.from({ length: n }, () => rnd() * 0.02);
  return { ok: true, dates, series: { spx: walk(k => common[k]), nq: walk(k => common[k] + rnd() * 0.004), dxy: walk(k => -common[k] + rnd() * 0.004), gold: walk(() => rnd() * 0.02), oil: walk(() => rnd() * 0.02), btc: walk(() => rnd() * 0.02) } };
}

test('correlation drawing: a keyed grid with the diagonal blank, ringed pairs, the count strip with the current session marked, theme tokens only', () => {
  const r = corrFrames(corrBundle(), { sessions: 20, keys: ['spx', 'nq', 'dxy', 'gold', 'oil', 'btc'] }), svg = corrStage(r.frames, 10, r.keys);
  assert.match(svg, /^<svg/); assert.doesNotMatch(svg, /NaN|undefined|Infinity/); assert.equal((svg.match(/<rect /g) ?? []).length, 36);
  assert.match(svg, /var\(--blue\)/); assert.match(svg, /stroke-dasharray="3 3"/); assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}["']/); assert.match(svg, /SPX/);
  assert.match(corrStage([], 0, []), /Nothing to draw/);
});

test('the correlation replay reads the shared daily bundle, says each frame uses only the sessions up to its day, and its button sits under the matrix heading', async () => {
  const { forgetBundle } = await import('./insightData.js'); forgetBundle();
  const asked = [], fetchJson = async u => { asked.push(u); return corrBundle(); };
  const def = defFor('corr', { fetchJson }), { doc } = setup(def); await flush(); await flush();
  assert.deepEqual(asked, ['/api/drill-series']); assert.match(doc.getElementById('rpv-cov').textContent, /90 sessions, .*each frame using only the sessions up to its own day/);
  assert.match(def.note, /uses only the sessions up to that day/); assert.doesNotMatch(def.note, /will |buy|sell/i); assert.match(doc.getElementById('rpv-cap').textContent, /pairs have a 20 session correlation/);
  const d2 = makePage(), host = d2.createElement('div');
  host.innerHTML = '<div class="in-panel" data-surface="panel.insight.matrix"><h3 class="in-h">Moves across markets</h3><h3 class="in-h">How markets have been moving together</h3></div>';
  d2.body.appendChild(host);
  const m = mountReplayViz({ doc: d2, win: makeWin(d2, { matchMedia: () => ({ matches: false }), requestAnimationFrame: undefined }), fetchJson });
  assert.equal(d2.querySelectorAll('[data-rpviz="corr"]').length, 1, 'one button, under the right heading'); m.decorate(); assert.equal(d2.querySelectorAll('[data-rpviz="corr"]').length, 1); m.destroy();
});
