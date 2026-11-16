// js/terminal/spreadsWave2.test.mjs: wave 2 of the Spreads & ratios board: the derived series, the divergence maths, the stories strip and the story filter.
// node --test js/terminal/spreadsWave2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { alignTo, augmentBundle, realisedVol, rollingMoveCorr, zgapSeries, seriesMeta, DERIVED, DERIVED_BY_KEY, Z_WINDOW } from './spreadsDerived.js';
import { rankPairs, storiesNow, fmtValue, changeOf, caption, buildSeries, describe, slice, ghosts, unitOf } from './spreadsCore.js';
import { PAIRS, STORIES } from './spreadsLibrary.js';
import { ladderHtml, storiesStripHtml, heroHtml, divergenceSvg, mountSpreads } from './spreadsView.js';

const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const walk = (n, start, vol) => { let p = start; return Array.from({ length: n }, () => (p *= 1 + (rnd() - 0.5) * 2 * vol)); };
const N = 1400;
const rates = ['us2y', 'us5y', 'us10y', 'us30y', 'tips', 'bei', 'hy', 'ig', 'ccc'];
const prices = ['rsp', 'spy', 'smh', 'nvda', 'r2k', 'spx', 'nq', 'xly', 'xlp', 'xle', 'xli', 'xlu', 'xlk', 'xlf', 'oil', 'brent', 'copper', 'gold', 'silver', 'platinum', 'dxy', 'btc', 'audjpy', 'audusd', 'usdjpy', 'usdchf', 'usdcad', 'nzdusd', 'vix', 'vix3m', 'vix9d', 'vvix', 'move', 'skew', 'vxn', 'rvx', 'cor3m'];
const bundle = () => {
  const series = Object.fromEntries(prices.map(k => [k, walk(N, 50 + rnd() * 100, 0.01)]));
  for (const k of rates) series[k] = walk(N, 1 + rnd() * 3, 0.004);
  return { ok: true, dates: days(N), series };
};
const extras = (b, n = N) => {
  const dates = b.dates.slice(0, n), vals = base => Array.from({ length: n }, (_, i) => +(base + i * 0.001).toFixed(4));
  const S = k => ({ dates, values: vals(k) });
  return { ok: true, series: { dtb3: S(3), dff: S(3.2), tp10: S(0.5), sofr: S(3.3), iorb: S(3.25), rrp: S(100), walcl: S(7000), tga: S(700) }, missing: [] };
};

test('alignTo: the latest value known at each date, never carried past its own cadence, and a lag holds a weekly value back a day', () => {
  const D = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-20'];
  const ex = { dates: ['2026-01-05', '2026-01-07'], values: [1, 2] };
  assert.deepEqual(alignTo(D, ex, 7), [1, 1, 2, null], 'a gap of more than 7 days is not filled');
  assert.deepEqual(alignTo(D, ex, 7, 1), [null, 1, 1, null], 'a one-day lag: a value dated D counts from D+1');
  assert.deepEqual(alignTo(D, null, 7), [null, null, null, null]);
});
test('augmentBundle: the crosses and the vol premium are computed from the bundle, the extras are laid on its dates, and the input is not touched', () => {
  const b = bundle(), before = JSON.stringify(Object.keys(b.series)), a = augmentBundle(b, extras(b));
  assert.equal(JSON.stringify(Object.keys(b.series)), before, 'the cached bundle is not mutated');
  assert.equal(a.extrasOk, true);
  const i = 700;
  assert.ok(Math.abs(a.series.nzdjpy[i] - b.series.nzdusd[i] * b.series.usdjpy[i]) < 1e-3, 'NZD/JPY = NZD/USD x USD/JPY');
  assert.ok(Math.abs(a.series.chfjpy[i] - b.series.usdjpy[i] / b.series.usdchf[i]) < 1e-3, 'CHF/JPY = USD/JPY / USD/CHF');
  assert.ok(Math.abs(a.series.cadusd[i] - 1 / b.series.usdcad[i]) < 1e-4);
  assert.ok(Math.abs(a.series.vrp[i] - (b.series.vix[i] - a.series.rv21[i])) < 0.02, 'the premium is VIX minus realised vol');
  assert.ok(Math.abs(a.series.netliq[i] - (6200 - i * 0.001)) < 0.2, 'net liquidity = balance sheet (one day late) minus Treasury cash (one day late) minus reverse repo');
  assert.ok(a.series.sbcorr[i] >= -1 && a.series.sbcorr[i] <= 1);
  for (const k of ['dtb3', 'dff', 'tp10', 'sofr', 'iorb', 'rrp']) assert.ok(a.series[k].some(Number.isFinite), k);
});
test('augmentBundle without the extras: the bundle-only series still arrive, the extra-fed ones are simply absent, and the board says why', () => {
  const b = bundle(), a = augmentBundle(b, { ok: false, error: 'down' });
  assert.equal(a.extrasOk, false); assert.ok(a.series.nzdjpy && a.series.vrp && !a.series.dtb3 && !a.series.netliq);
  const r = rankPairs(a, PAIRS), missing = r.missing.find(m => m.pair.id === 'y3m10y');
  assert.match(missing.why, /spread-extras/); assert.ok(r.rows.some(x => x.id === 'xli-xlu'));
  assert.equal(augmentBundle(null, null), null);
});
test('realisedVol and the rolling correlation: a constant price has no vol, and the correlation is a correlation', () => {
  assert.ok(realisedVol(Array(40).fill(100), 21).filter(Number.isFinite).every(v => v === 0));
  const up = Array.from({ length: 80 }, (_, i) => 100 + i + (i % 3)), rate = up.map(v => v / 50);
  const c = rollingMoveCorr(up, rate, 20).filter(Number.isFinite); assert.ok(c.length > 30 && c.every(v => v >= -1 && v <= 1));
  assert.ok(rollingMoveCorr(up, rate, 20).slice(0, 20).every(v => v === null), 'no value before a full window');
});
test('every derived series is described in the table the picker and the library read, and says what it is', () => {
  for (const d of DERIVED) { assert.ok(d.label.length > 5 && ['rate', 'ratio'].includes(d.kind), d.key); assert.equal(DERIVED_BY_KEY[d.key], d); assert.equal(seriesMeta(d.key), d); }
  assert.equal(seriesMeta('rsp').key, 'rsp'); assert.equal(seriesMeta('nope'), null);
});
test('zgapSeries: each leg is measured against its OWN trailing window, so a later close never changes an earlier reading; sign flips the second leg', () => {
  const b = bundle(), def = { x: 'dxy', y: 'tips', sign: 1 }, a = zgapSeries(b, def);
  assert.ok(a && a.vals.length > 500 && a.xz.length === a.vals.length && a.win === Z_WINDOW);
  for (let i = 0; i < a.vals.length; i += 97) assert.ok(Math.abs(a.vals[i] - (a.xz[i] - a.yz[i])) < 2e-3, 'gap = zx - zy when the sign is +1');
  const flipped = zgapSeries(b, { ...def, sign: -1 }); for (let i = 0; i < a.vals.length; i += 97) assert.ok(Math.abs(flipped.vals[i] - (a.xz[i] + a.yz[i])) < 2e-3, 'gap = zx + zy when the sign is -1');
  const b2 = bundle(); b2.series = { ...b.series, dxy: b.series.dxy.map((v, i) => (i > N - 50 ? v * 3 : v)) };
  const c = zgapSeries(b2, def), cut = c.vals.length - 80; for (let i = 0; i < cut; i += 53) assert.equal(c.vals[i], a.vals[i], 'a jump in the last 50 sessions leaves every earlier reading unchanged');
  assert.equal(zgapSeries({ dates: days(300), series: { dxy: walk(300, 100, .01), tips: walk(300, 1, .004) } }, def), null, 'too short a record: nothing is drawn');
  assert.equal(zgapSeries(b, { x: 'dxy', y: 'nope' }), null);
});
test('the new ops read as plain numbers: sigma, dollars, percent, $bn, correlation and vol points; and a change is a difference, not a percent, for them', () => {
  assert.equal(fmtValue({ op: 'zgap' }, -2.04), '−2.0σ'); assert.equal(fmtValue({ op: 'usd' }, 8.678), '+$8.68'); assert.equal(fmtValue({ op: 'level', fmt: 'pct' }, 0.871), '0.87%');
  assert.equal(fmtValue({ op: 'level', fmt: 'bn' }, 5847.2), '$5,847bn'); assert.equal(fmtValue({ op: 'level', fmt: 'corr' }, 0.08), '0.08'); assert.equal(fmtValue({ op: 'level', fmt: 'pts' }, 13.14), '13.1 pts');
  assert.equal(changeOf({ op: 'level', fmt: 'bn' }, 5800, 5823).text, '−$23bn'); assert.equal(changeOf({ op: 'usd' }, 8, 7.5).text, '+$0.50'); assert.equal(changeOf({ op: 'level', fmt: 'pts' }, 10, 20.4).text, '−10.4 pts');
  assert.equal(changeOf({ op: 'zgap' }, 1, -0.5).text, '+1.5σ'); assert.equal(changeOf({ op: 'level' }, 110, 100).text, '+10%', 'an AUD/JPY style level still moves in percent');
  assert.equal(unitOf({ op: 'zgap' }), 'σ'); assert.equal(unitOf({ op: 'level', fmt: 'pct' }), 'pp');
});
test('every new pair draws from a bundle that holds its legs, with a sensible record and a caption that never says NaN or a trade', () => {
  const b = augmentBundle(bundle(), extras(bundle())), r = rankPairs(b, PAIRS);
  const wave2 = PAIRS.filter(p => p.mentions.n === 0);
  assert.ok(wave2.length >= 27);
  for (const p of wave2) {
    const row = r.rows.find(x => x.id === p.id); assert.ok(row, `${p.id} ranked`);
    const cap = caption(row); assert.ok(!/NaN|undefined/.test(cap) && !/\b(buy|sell|go long|go short|will rise|will fall)\b/i.test(cap), p.id);
    assert.ok(row.story && STORIES.some(s => s.id === row.story), p.id);
  }
  const div = r.rows.find(x => x.id === 'dx-dxy-tips'); assert.match(caption(div), /the gap between the dollar and US real yields/); assert.match(caption(div), /each measured against its own last two years/);
  assert.ok(div.series.xz && slice(div.series, 252).xz.length === 252);
  const g = ghosts(div.series, div.pair); assert.equal(g.unit, 'σ');
});
test('storiesNow: at most two from one story, never a stale pair, and it says how many pairs sit in the outer tenth against how many chance would give', () => {
  const rows = []; let n = 0;
  const mk = (story, score, extra = {}) => ({ id: `p${n++}`, story, score, side: score > 0.8 ? 'high' : 'mid', stale: false, pct: 0.5 + score / 2, n: 1500, short: false, pair: { short: `pair ${n}` }, ev: [], ...extra });
  for (const s of ['Risk', 'Risk', 'Risk', 'Rates', 'Rates', 'Rates', 'FX']) rows.push(mk(s, 0.95 - n * 0.01));
  rows.push(mk('Macro', 0.99, { stale: true })); rows.sort((a, b) => b.score - a.score);
  const S = storiesNow({ rows }, 6, 2), by = {}; for (const it of S.items) by[it.story] = (by[it.story] ?? 0) + 1;
  assert.ok(Object.values(by).every(c => c <= 2), JSON.stringify(by)); assert.ok(S.items.every(it => !it.row.stale));
  assert.equal(S.total, 7); assert.equal(S.chance, Math.round(7 * 0.2)); assert.equal(S.outer, 7);
  const calm = storiesNow({ rows: [mk('Risk', 0.1), mk('Rates', 0.05), mk('FX', 0.02), mk('Macro', 0.01)] }, 6, 2); assert.ok(calm.items.length >= 3, 'on a calm day it still shows the three most stretched, and says the outer count is low'); assert.equal(calm.outer, 0);
});
test('the ladder has a story filter (seven stories, a count each), filters by story and by group together, and the strip opens a pair', () => {
  const b = augmentBundle(bundle(), extras(bundle())), r = rankPairs(b, PAIRS);
  const st = (o = {}) => ({ view: 'ladder', group: 'all', story: 'all', sort: 'stretch', open: null, hw: '3y', ...o });
  const all = ladderHtml(r, st()); for (const s of STORIES) if (r.rows.some(x => x.story === s.id)) assert.match(all, new RegExp(`data-story="${s.id}"`));
  const risk = ladderHtml(r, st({ story: 'Risk' })); assert.equal((risk.match(/class="in-row sp-row"/g) ?? []).length, r.rows.filter(x => x.story === 'Risk').length);
  assert.match(risk, /sp-storyblurb/); assert.match(risk, /aria-pressed="true"[^>]*>Risk appetite/);
  const both = ladderHtml(r, st({ story: 'Risk', group: 'Volatility' })); assert.equal((both.match(/class="in-row sp-row"/g) ?? []).length, r.rows.filter(x => x.story === 'Risk' && x.group === 'Volatility').length);
  const strip = storiesStripHtml(r); assert.match(strip, /Stories now/); assert.match(strip, /would by chance alone/); assert.match(strip, /data-open="[a-z0-9-]+"/); assert.ok(!/NaN|undefined/.test(strip));
});
test('a divergence opens with the two-line panel, the gap and the ghosts; the flipped leg says so; the markup is clean', () => {
  const b = augmentBundle(bundle(), extras(bundle())), r = rankPairs(b, PAIRS);
  const gold = r.rows.find(x => x.id === 'dx-gold-tips'), h = heroHtml(gold, '3y');
  assert.match(h, /sp-divcard/); assert.equal((h.match(/<svg class="sp-chart/g) ?? []).length, 3, 'the divergence panel, the gap line and the ghosts');
  assert.match(h, /the second is flipped because they usually move opposite ways/); assert.match(h, /relationship-map|twenty folklore/i);
  const svg = divergenceSvg(gold, slice(gold.series, 252)); assert.match(svg, /class="sp-gap"/); assert.match(svg, /\(flipped\)/); assert.ok(!/NaN|undefined/.test(svg));
  assert.match(divergenceSvg(gold, { dates: ['2020-01-01'], vals: [1], xz: [1], yz: [1] }), /Too few closes/);
  const dxy = r.rows.find(x => x.id === 'dx-dxy-tips'); assert.ok(!/\(flipped\)/.test(divergenceSvg(dxy, slice(dxy.series, 252))));
  const plain = heroHtml(r.rows.find(x => x.id === 'rsp-spy'), '3y'); assert.ok(!/sp-divcard/.test(plain), 'an ordinary pair keeps the two-chart hero');
  const n0 = heroHtml(r.rows.find(x => x.id === 'xli-xlu')); assert.match(n0, /Added from general market knowledge/); assert.match(n0, /general market knowledge, not the stored notes/);
});
test('mount: lays the extras on the bundle when they answer, still draws every other pair when they do not, and keeps the story choice', async () => {
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
  const host = { _h: '', l: {}, addEventListener(t, f) { (this.l[t] ??= []).push(f); }, removeEventListener() {}, contains: () => true, querySelector: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } };
  const win = { localStorage: mem() }, doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
  const b = bundle(), ctx = { win, doc, getBundle: async () => b, getExtras: async () => extras(b) };
  mountSpreads(host, ctx); await new Promise(r => setTimeout(r, 5));
  assert.match(host.innerHTML, /data-id="y3m10y"/); assert.match(host.innerHTML, /Stories now/);
  (host.l.click ?? []).forEach(f => f({ target: { dataset: { story: 'Liquidity' }, closest: () => ({ dataset: { story: 'Liquidity' } }) } }));
  assert.match(win.localStorage.getItem('deskSpreads:v1'), /"story":"Liquidity"/); assert.ok(!/data-id="xli-xlu"/.test(host.innerHTML));
  const host2 = { ...host, l: {}, _h: '', addEventListener(t, f) { (this.l[t] ??= []).push(f); }, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } };
  mountSpreads(host2, { win: { localStorage: mem() }, doc, getBundle: async () => b, getExtras: async () => { throw new Error('FRED down'); } }); await new Promise(r => setTimeout(r, 5));
  assert.ok(!/data-id="y3m10y" aria-expanded/.test(host2.innerHTML) && /data-id="xli-xlu"/.test(host2.innerHTML), 'the pair that needs an extra is dropped, the rest still draw');
});
test('buildSeries on the dollar spread op: Brent minus WTI is a plain difference in dollars', () => {
  const s = buildSeries({ dates: days(3), series: { brent: [90, 91, 92], oil: [85, 85.5, 84] } }, { op: 'usd', x: 'brent', y: 'oil' });
  assert.deepEqual(s.vals, [5, 5.5, 8]); assert.equal(describe({ dates: days(3), vals: [1, 2, 3] }), null, 'under 120 closes says nothing');
});
