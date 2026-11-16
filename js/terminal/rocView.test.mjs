// js/terminal/rocView.test.mjs: the Momentum & rate of change board's markup, command and registry wiring (js/terminal/rocView.js), over a synthetic bundle.
// It proves wiring and text, not the look: scripts/insight-overflow.mjs is the real measurement (headless Chromium).
// node --test js/terminal/rocView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ladderHtml, listsHtml, heroHtml, foundHtml, trackHtml, stateChip, DEFS } from './rocView.js';
import { rankAll, MIN_HIST } from './rocCore.js';
import { buildCommands } from './commandCore.js';
import { surfaceById } from './tabRegistry.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function walkSeries(seed, n, tail = []) { const r = rng(seed), g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; let p = 100; const v = []; for (let i = 0; i < n; i++) { p *= Math.exp(0.01 * g()); v.push(p); } for (const m of tail) { p *= Math.exp(m); v.push(p); } return v; }
const run = Array.from({ length: 50 }, () => 0.0075), flat = Array.from({ length: 50 }, (_, i) => (i % 2 ? 0.0004 : -0.0004));
const a = walkSeries(7, MIN_HIST + 300, [...run, ...flat]), n = a.length;
const dates = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2015, 0, 1) + i * 86400000).toISOString().slice(0, 10));
const bundle = { ok: true, dates, series: { spx: a, nq: walkSeries(9, n), gold: walkSeries(4, n) } };
const rank = rankAll(bundle, DEFS);

test('the board draws only price series (a yield or a vol index is read by level elsewhere)', () => {
  assert.ok(DEFS.length > 20 && DEFS.every(d => d.level === false));
  assert.ok(!DEFS.some(d => ['us10y', 'vix', 'hy'].includes(d.key)));
});

test('ladder: one row per ranked series, the track has a marker and a ghost tick, the stalled series carries its chip, no NaN or undefined', () => {
  const html = ladderHtml(rank, { group: 'all', sort: 'move', open: null, hw: '3y' }, bundle);
  assert.equal((html.match(/class="in-row rc-row"/g) ?? []).length, 3);
  assert.match(html, /rc-now/); assert.match(html, /rc-prior/); assert.match(html, /stalled run/);
  assert.doesNotMatch(html, /NaN|undefined|null/);
  const sorted = ladderHtml(rank, { group: 'all', sort: 'stall', open: null, hw: '3y' }, bundle);
  assert.ok(sorted.indexOf('data-key="spx"') < sorted.indexOf('data-key="nq"'), 'stalled first');
});

test('hero: opens under its row with the caption, an SVG with the price, the rate of change, the stall shading, and the window pills', () => {
  const row = rank.rows.find(r => r.def.key === 'spx'), html = heroHtml(row, bundle, '3y');
  assert.match(html, /<svg class="rc-chart"/); assert.match(html, /rc-ep-top/); assert.match(html, /rc-zero/); assert.match(html, /a strong run that has stalled/);
  assert.equal((html.match(/data-win=/g) ?? []).length, 3); assert.doesNotMatch(html, /NaN|undefined/);
  assert.match(ladderHtml(rank, { group: 'all', sort: 'move', open: 'spx', hw: '3y' }, bundle), /class="rc-hero"/);
});

test('lists: stalled leaders carry the series that stalled; empty lists say so', () => {
  const html = listsHtml(rank); assert.match(html, /Stalled leaders <b>1<\/b>/); assert.match(html, /data-open="spx"/); assert.match(html, /None right now/);
});

test('what we found: six verdict chips from the Evidence Book, and an honest line when the test is not banked yet', () => {
  const html = foundHtml(DESK_EVIDENCE); assert.equal((html.match(/rc-found-row/g) ?? []).length, 6); assert.match(html, /rc-v-(null|underpowered|validated|context)/);
  assert.match(foundHtml([]), /running and is not in the Evidence Book yet/);
});

test('a short record shows a dashed track and no percentile', () => {
  const short = rankAll({ dates: dates.slice(0, 200), series: { spx: a.slice(0, 200) } }, DEFS.filter(d => d.key === 'spx'));
  assert.match(trackHtml(short.rows[0]), /rc-short/); assert.match(ladderHtml(short, { group: 'all', sort: 'move', open: null, hw: '3y' }, bundle), /short record/);
  assert.equal(stateChip({ stall: null, accDown: false, accUp: false }), '');
});

test('ROC command: opens the board, opens a series by key or plain words, says why when it cannot', () => {
  const cmds = buildCommands({ isOn: () => true }), c = cmds.find(x => x.surface === 'panel.insight.roc');
  assert.equal(c.name, 'ROC'); assert.ok(c.help.length > 40 && c.example === 'roc spx' && c.args === '[market]');
  assert.deepEqual(c.run('').action, { kind: 'roc', key: null }); assert.equal(c.run('spx').action.key, 'spx'); assert.equal(c.run('S&P 500').action.key, 'spx');
  assert.match(c.run('zzzz').error, /No price series called "zzzz"/); assert.equal(cmds.filter(x => x.surface === 'panel.insight.roc').length, 1);
});

test('registry: a preview surface, hidden from a desk login by default, with a note', () => {
  const s = surfaceById('panel.insight.roc'); assert.equal(s.hidden, 'preview'); assert.ok(String(s.note).length > 60); assert.equal(s.defaultVisible, false);
});
