// js/terminal/spreadsView.test.mjs: the Spreads & ratios board: the markup, the escaping, the evidence chips, the picker, the replay definition and the mount.
// It proves wiring and text, NOT the look (themes, phone width): scripts/insight-overflow.mjs is the real measurement. node --test js/terminal/spreadsView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ladderHtml, heroHtml, wallHtml, trackHtml, pickerHtml, scatterDef, heroSvg, ghostSvg, sparkSvg, scatterSvg, chipHtml, mountSpreads, WINDOWS } from './spreadsView.js';
import { rankPairs, ghosts, slice } from './spreadsCore.js';
import { PAIRS, WALL_IDS } from './spreadsLibrary.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { buildCommands } from './commandCore.js';

const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const walk = (n, start, vol) => { let p = start; return Array.from({ length: n }, () => (p *= 1 + (rnd() - 0.5) * 2 * vol)); };
const N = 1300;
const KEYS = ['rsp', 'spy', 'smh', 'nvda', 'r2k', 'spx', 'nq', 'xly', 'xlp', 'xle', 'oil', 'copper', 'gold', 'silver', 'dxy', 'btc', 'audjpy', 'vix', 'vix3m', 'vix9d', 'vvix', 'move'];
const bundle = () => {
  const series = Object.fromEntries(KEYS.map(k => [k, walk(N, 50 + rnd() * 100, 0.01)]));
  for (const k of ['us2y', 'us5y', 'us10y', 'us30y', 'tips', 'bei', 'hy', 'ig', 'ccc']) series[k] = walk(N, 1 + rnd() * 3, 0.004);
  return { ok: true, dates: days(N), series };
};
const rank = () => rankPairs(bundle());
const st = (over = {}) => ({ view: 'ladder', group: 'all', sort: 'stretch', open: null, hw: '3y', px: 'rsp', py: 'spy', pop: 'ratio', pw: '3y', ...over });

test('the ladder lists every ranked pair once, most stretched first, each with its track, percentile, value and verdict chips', () => {
  const r = rank(), h = ladderHtml(r, st());
  assert.equal((h.match(/class="in-row sp-row"/g) ?? []).length, r.rows.length);
  assert.ok(r.rows.length >= 20, `${r.rows.length} pairs ranked`);
  for (const row of r.rows) assert.ok(h.includes(`data-id="${row.id}"`), row.id);
  const order = [...h.matchAll(/data-id="([a-z0-9-]+)" aria-expanded/g)].map(m => m[1]); assert.deepEqual(order, r.rows.map(x => x.id));
  assert.match(h, /class="sp-track"/); assert.match(h, /sp-now/); assert.match(h, /Tested: (no forward edge found|underpowered)/); assert.match(h, /Not tested here/); assert.match(h, /class="sp-mean"/); assert.ok(!/class="in-rk"/.test(h), 'the jumping rank numbers are gone'); assert.match(h, /<i>of \d/); assert.match(h, /<i>1m<\/i>/);
  assert.ok(!/undefined|NaN|\[object/.test(h), 'no stray undefined or NaN in the markup');
});
test('group filter, the "most mentioned" order and the open row', () => {
  const r = rank();
  const credit = ladderHtml(r, st({ group: 'Credit' })); assert.equal((credit.match(/class="in-row sp-row"/g) ?? []).length, r.rows.filter(x => x.group === 'Credit').length);
  const m = ladderHtml(r, st({ sort: 'mentioned' })); const first = /data-id="([a-z0-9-]+)" aria-expanded/.exec(m)[1];
  assert.equal(first, [...PAIRS].sort((a, b) => b.mentions.n - a.mentions.n)[0].id);
  const open = ladderHtml(r, st({ open: 'rsp-spy' })); assert.match(open, /aria-expanded="true"[\s\S]*class="sp-hero"/);
});
test('the hero view: the caption, both charts, what they said next to what we found, the trust note, and a window choice', () => {
  const row = rank().rows.find(x => x.id === 'rsp-spy'), h = heroHtml(row, '3y');
  assert.match(h, /class="sp-cap"/); assert.equal((h.match(/<svg class="sp-chart/g) ?? []).length, 3, 'the line, what moved it, the ghosts'); assert.match(h, /What this is/); assert.match(h, /What moved it/); assert.match(h, /Where it has been before|has no earlier stretch/); assert.match(h, /class="sp-sowhat"/);
  assert.match(h, /What they said/); assert.match(h, /What we found/); assert.match(h, /sp-q/); assert.match(h, /breadth-narrowing|textbook rotation/i);
  for (const k of Object.keys(WINDOWS)) assert.match(h, new RegExp(`data-win="${k}" aria-pressed="${k === '3y'}"`));
  assert.match(h, /data-pick-pair="rsp-spy"/);
  assert.ok(!/\b(buy|sell|go long|go short|will rise|will fall)\b/i.test(h.replace(/<[^>]+>/g, ' ')), 'no trade wording');
  const none = rank().rows.find(x => x.id === 'xly-xlp'); assert.match(heroHtml(none), /Not tested here yet/); assert.match(heroHtml(none), /No quote from the stored notes/);
  const lvl = rank().rows.find(x => x.id === 'audjpy'); assert.ok(!/data-pick-pair/.test(heroHtml(lvl)), 'a level has no picker');
});
test('a verbatim quote is shown as the speaker said it; a desk note on a clip says so; everything is escaped', () => {
  const crown = rank().rows.find(x => x.id === 'nvda-smh'), h = heroHtml(crown);
  assert.match(h, /not his exact words/);
  const chip = chipHtml({ id: 'x', verdict: 'null', word: 'NULL', about: '<script>alert(1)</script>', date: '2026-01-01', say: 'a "quoted" say' });
  assert.ok(!chip.includes('<script>') && chip.includes('&lt;script&gt;'));
});
test('the percentile track clamps its markers and names the percentile for a screen reader', () => {
  const t = trackHtml({ pct: 1.4, pct1w: -0.2, pct1m: 0.5 });
  assert.match(t, /--p:1\.000/); assert.match(t, /--p:0\.000/); assert.match(t, /aria-label="[^"]*percentile now/);
  assert.ok(!/NaN/.test(trackHtml({ pct: 0.5, pct1w: null, pct1m: null })));
});
test('the wall holds the twelve most-mentioned pairs', () => {
  const w = wallHtml(rank()); assert.equal((w.match(/class="sp-cell"/g) ?? []).length, 12);
  for (const id of WALL_IDS) assert.ok(w.includes(`data-id="${id}"`), id);
  assert.match(w, /a line count, not a vote/);
});
test('the charts draw from the numbers and never print NaN', () => {
  const row = rank().rows[0];
  for (const svg of [heroSvg(row, slice(row.series, 252)), ghostSvg(ghosts(row.series, row.pair)), sparkSvg(row.series.vals), scatterSvg({ pts: [[1, 2], [2, 3], [3, 3.5]], all: [[1, 1]], bounds: { x0: 0, x1: 4, y0: 0, y1: 4 }, xl: 'X', yl: 'Y', nowLabel: 'today' })]) { assert.match(svg, /<svg/); assert.ok(!/NaN|undefined/.test(svg)); }
  assert.match(heroSvg(row, { dates: ['2020-01-01'], vals: [1] }), /Too few closes/); assert.match(ghostSvg({ unit: '%', paths: [] }), /Too little history/);
});
test('the picker: controls, stats and a scatter for two series; X minus Y of prices is explained, not drawn', () => {
  const b = bundle(), p = pickerHtml(b, st({ px: 'gold', py: 'spx', pop: 'ratio' }));
  assert.ok(p.custom?.ok); assert.match(p.html, /id="sp-x"/); assert.match(p.html, /id="sp-y"/); assert.match(p.html, /id="sp-op"/); assert.match(p.html, /id="sp-pw"/);
  assert.match(p.html, /Daily moves, all/); assert.match(p.html, /data-play="1"/); assert.match(p.html, /not which leads/); assert.match(p.html, /not one we have tested|NULL|UNDERPOWERED|VALIDATED|CONTEXT/);
  const bad = pickerHtml(b, st({ px: 'gold', py: 'spx', pop: 'minus' })); assert.equal(bad.custom, null); assert.match(bad.html, /yields or spreads/);
  const same = pickerHtml(b, st({ px: 'gold', py: 'gold' })); assert.equal(same.custom, null); assert.match(same.html, /two different series/);
  const lib = pickerHtml(b, st({ px: 'rsp', py: 'spy', pop: 'ratio' })); assert.match(lib.html, /textbook rotation|breadth|NULL/i);
  const yields = pickerHtml(b, st({ px: 'us10y', py: 'us2y', pop: 'minus' })); assert.ok(yields.custom?.ok); assert.match(yields.html, /bp/);
});
test('the replay definition: frames only hold points up to their date, the axes widen, and the words describe, not forecast', async () => {
  const b = bundle(), c = pickerHtml(b, st({ px: 'gold', py: 'spx' })).custom, def = scatterDef(c, st({ px: 'gold', py: 'spx' }));
  const { frames } = await def.load(); assert.ok(frames.length > 10);
  const early = def.draw(frames, 1), late = def.draw(frames, frames.length - 1); assert.match(early, /<svg/); assert.match(late, /<svg/);
  assert.match(def.caption(frames, 3), /over the last \d+ closes/); assert.match(def.note, /not a forecast/); assert.match(def.coverage(frames), /frames/);
  assert.match(def.label(frames[0]), /\d{4}/);
});

test('RATIOS command: opens the board, opens a named pair by id or by plain words, says why when it cannot (SPREADS stays the Macro credit-spreads board)', () => {
  const cmds = buildCommands({ isOn: () => true }), c = cmds.find(x => x.surface === 'panel.insight.spreads');
  assert.equal(c.name, 'RATIOS'); assert.ok(c.help.length > 40 && c.example === 'ratios rsp-spy' && c.args === '[pair]');
  assert.deepEqual(c.run('').action, { kind: 'spreads', id: null });
  assert.equal(c.run('rsp-spy').action.id, 'rsp-spy'); assert.equal(c.run('RSP / SPY').action.id, 'rsp-spy'); assert.equal(c.run('copper').action.id, 'copper-gold'); assert.equal(c.run('2s10s').error ? 'err' : c.run('2s10s').action.id, 'curve-2s10s');
  assert.match(c.run('zzzz').error, /No pair called "zzzz"/);
  assert.equal(cmds.find(x => x.name === 'SPREADS' || (x.aliases ?? []).includes('SPREADS'))?.surface, 'panel.macro.creditspreads', 'the old SPREADS word still opens the credit spreads board');
  assert.equal(cmds.filter(x => x.surface === 'panel.insight.spreads').length, 1);
});

// ── the mount, over a minimal stand-in host ──────────────────────────────────────────────────────────────────────────────────────────────────────
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
function harness(b = bundle()) {
  const host = { _h: '', l: {}, addEventListener(t, f) { (this.l[t] ??= []).push(f); }, removeEventListener(t, f) { this.l[t] = (this.l[t] ?? []).filter(x => x !== f); }, contains: () => true, querySelector: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } };
  const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
  const win = { localStorage: mem(), setTimeout: f => f() };
  const ctx = { win, doc, getBundle: async () => b };
  const fire = (type, target) => (host.l[type] ?? []).forEach(f => f({ target }));
  const btn = dataset => ({ dataset, closest: () => ({ dataset }) });
  return { host, win, ctx, fire, btn };
}
const tick = () => new Promise(r => setTimeout(r, 5));
test('mount: reads the bundle, draws the ladder, opens a row, switches views, and remembers the choice', async () => {
  const h = harness(), m = mountSpreads(h.host, h.ctx); await tick();
  assert.match(h.host.innerHTML, /class="in-row sp-row"/); assert.match(h.host.innerHTML, /These describe state, not direction/); assert.match(h.host.innerHTML, /mv-extreme|rare move/i);
  h.fire('click', h.btn({ id: 'rsp-spy' })); assert.match(h.host.innerHTML, /class="sp-hero"/);
  h.fire('click', h.btn({ id: 'rsp-spy' })); assert.ok(!/class="sp-hero"/.test(h.host.innerHTML), 'a second click closes it');
  h.fire('click', h.btn({ view: 'wall' })); assert.match(h.host.innerHTML, /class="sp-wall"/);
  h.fire('click', h.btn({ id: 'smh-spy' })); assert.match(h.host.innerHTML, /aria-expanded="true"/, 'a wall tile opens that pair on the ladder');
  h.fire('click', h.btn({ view: 'pick' })); assert.match(h.host.innerHTML, /id="sp-x"/);
  assert.match(h.win.localStorage.getItem('deskSpreads:v1'), /"view":"pick"/);
  h.fire('click', h.btn({ pickPair: 'rsp-spy' })); assert.match(h.host.innerHTML, /id="sp-x"/);
  m.destroy(); assert.equal(h.win.deskSpreads, undefined);
});
test('mount: the SPREADS command can ask for a pair before the board has loaded, and deskSpreads.open does it after', async () => {
  const h = harness(); h.win.deskSpreadsWant = 'curve-2s10s'; mountSpreads(h.host, h.ctx); await tick();
  assert.match(h.host.innerHTML, /data-id="curve-2s10s" aria-expanded="true"/); assert.equal(h.win.deskSpreadsWant, undefined);
  assert.equal(h.win.deskSpreads.open('copper-gold'), true); assert.match(h.host.innerHTML, /data-id="copper-gold" aria-expanded="true"/); assert.equal(h.win.deskSpreads.open('nope'), false);
});
test('mount: a failed bundle says so in words; a selector change redraws the picker', async () => {
  const h = harness(), bad = harness(); bad.ctx.getBundle = async () => ({ ok: false, error: 'The daily market bundle came back empty.' });
  mountSpreads(bad.host, bad.ctx); await tick(); assert.match(bad.host.innerHTML, /came back empty/);
  mountSpreads(h.host, h.ctx); await tick(); h.fire('click', h.btn({ view: 'pick' }));
  h.fire('change', { id: 'sp-op', value: 'rebased', closest: () => null }); assert.match(h.host.innerHTML, /rebased/i);
});

// ── the files: tokens only, nothing that can widen the page, no vendor ───────────────────────────────────────────────────────────────────────────
const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
test('the stylesheet uses theme tokens only, never wraps text off a card, and collapses to one column on a phone', () => {
  const css = rd('./spreads.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'no hex colours'); assert.ok(!/\brgba?\(\s*\d/.test(css), 'no literal rgb: use the token triple');
  assert.ok(!/white-space:\s*nowrap/.test(css), 'no nowrap on a card or text block');
  for (const m of css.matchAll(/min-width:\s*(\d+)px/g)) assert.ok(+m[1] <= 160, `min-width ${m[1]}px`);
  assert.match(css, /@media \(max-width: 900px\)[^}]*\.sp-hero-grid/); assert.match(css, /@media \(max-width: 720px\)/); assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.sp-hero-grid\s*\{[^}]*minmax\(0/); assert.match(css, /\.sp-cap\s*\{[^}]*overflow-wrap:\s*anywhere/);
});
test('the view fetches nothing itself, imports no vendor, and its colours are CSS variables', () => {
  const src = rd('./spreadsView.js');
  assert.ok(!/\bfetch\(/.test(src), 'the bundle comes from ctx.getBundle'); assert.ok(!/https?:\/\//.test(src.replace(/\/\/.*$/gm, '')), 'no external URL');
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(src.replace(/\/\/.*$/gm, '')), 'no hex colours in the markup');
});
