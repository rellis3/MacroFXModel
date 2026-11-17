// js/terminal/spreadsExplain.test.mjs: the explanation layer of the Spreads & ratios board, for EVERY pair in the library: a template with a kind and its reference
// lines, a plain meaning sentence, window and period labels, graded chips, the two legs and what moved, the episodes list (as-of safe), compare and the board's markup.
// It fails on a pair with no template, a blank sentence or the word "undefined". node --test js/terminal/spreadsExplain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PAIRS } from './spreadsLibrary.js';
import { TEMPLATES, KINDS, kindOf, refLines, meaningOf, legsOf, trendState, zoneFor } from './spreadsTemplates.js';
import { gradeChips, gradeLabel, GRADE_HELP, winShort, periodChange, sma, componentSeries, decompose, episodes, compareSeries, laneOf, soWhat } from './spreadsExplain.js';
import { rankPairs } from './spreadsCore.js';
import { augmentBundle } from './spreadsDerived.js';
import { ladderHtml, heroHtml, heroSvg, compareHtml, gradeChipsHtml, trackHtml, wallHtml, mountSpreads } from './spreadsView.js';
import { slice } from './spreadsCore.js';

const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
let seed = 29; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const walk = (n, start, vol) => { let p = start; return Array.from({ length: n }, () => (p *= 1 + (rnd() - 0.5) * 2 * vol)); };
const N = 1400;
const rates = ['us2y', 'us5y', 'us10y', 'us30y', 'tips', 'bei', 'hy', 'ig', 'ccc'];
const prices = ['rsp', 'spy', 'smh', 'nvda', 'r2k', 'spx', 'nq', 'xly', 'xlp', 'xle', 'xli', 'xlu', 'xlk', 'xlf', 'oil', 'brent', 'copper', 'gold', 'silver', 'platinum', 'dxy', 'btc', 'audjpy', 'audusd', 'usdjpy', 'usdchf', 'usdcad', 'nzdusd', 'vix', 'vix3m', 'vix9d', 'vvix', 'move', 'skew', 'vxn', 'rvx', 'cor3m'];
const full = () => {
  const series = Object.fromEntries(prices.map(k => [k, walk(N, 50 + rnd() * 100, 0.01)]));
  for (const k of rates) series[k] = walk(N, 1 + rnd() * 3, 0.004);
  const b = { ok: true, dates: days(N), series };
  const S = base => ({ dates: b.dates, values: Array.from({ length: N }, (_, i) => +(base + i * 0.001).toFixed(4)) });
  return augmentBundle(b, { ok: true, series: { dtb3: S(3), dff: S(3.2), tp10: S(0.5), sofr: S(3.3), iorb: S(3.25), rrp: S(100), walcl: S(7000), tga: S(700) }, missing: [] });
};
const RANK = rankPairs(full());
const clean = (s, what) => { assert.ok(typeof s === 'string' && s.trim().length > 0, `${what} is blank`); assert.ok(!/undefined|NaN|\[object|null\b/.test(s), `${what} has a stray value: ${s}`); };

test('every pair in the library has a template with a known kind and the reference lines its kind needs (adding a pair forces a kind)', () => {
  assert.equal(PAIRS.length, 55);
  for (const p of PAIRS) {
    const t = TEMPLATES[p.id]; assert.ok(t, `${p.id}: no template`); assert.ok(KINDS[t.kind], `${p.id}: unknown kind ${t.kind}`); assert.equal(kindOf(p.id), t.kind);
    const r = t.ref ?? {};
    if (t.kind === 'relstrength' || t.kind === 'riskccy') assert.ok(r.trend, `${p.id}: a relative-strength pair carries its trend averages`);
    if (t.kind === 'volratio') assert.ok(r.one || r.band, `${p.id}: a vol ratio carries the 1.0 line or its bands`);
    if (t.kind === 'divergence') assert.ok(r.zero && r.sigma?.length === 2 && t.zones?.length === 3, `${p.id}: a divergence is measured from zero in sigma`);
    if (t.kind === 'correlation') assert.ok(r.zero || r.band, `${p.id}: a correlation carries its zero line or its usual range`);
    if (t.kind === 'spread') assert.ok(r.zero || r.band, `${p.id}: a spread carries its zero line (with zones) or its bands`);
    if (t.zones) { assert.ok(t.zones.length >= 2); for (const z of t.zones) { assert.ok(z.label && z.says); assert.ok(typeof z.below === 'number'); } assert.equal(t.zones.at(-1).below, Infinity); }
    assert.equal(refLines(p.id).zero, !!r.zero);
  }
  assert.deepEqual(new Set(Object.keys(TEMPLATES)), new Set(PAIRS.map(p => p.id)), 'no template for a pair that is not in the library, and none missing');
  for (const [k, v] of Object.entries(KINDS)) { assert.ok(v.label && v.ref && v.blurb, k); clean(v.blurb, `kind ${k}`); }
  assert.deepEqual(Object.keys(KINDS).sort(), ['correlation', 'divergence', 'level', 'relstrength', 'riskccy', 'spread', 'volratio']);
});

test('all 55 pairs rank on a full bundle, and each has a meaning sentence, a window label and a kind (no blanks, no "undefined")', () => {
  assert.equal(RANK.rows.length, 55, `missing: ${RANK.missing.map(m => m.pair.id).join(', ')}`);
  for (const r of RANK.rows) {
    const m = meaningOf(r); clean(m, `${r.id} meaning`); assert.ok(m.length >= 20 && m.length <= 280, `${r.id}: ${m.length} characters`); assert.match(m, /[.)]$/, `${r.id}: ends as a sentence`);
    assert.ok(r.kind && r.tpl, r.id); clean(winShort(r.n), `${r.id} window`); assert.match(winShort(r.n), /^\d+(\.\d)?[yd]$/);
    assert.ok(!/\b(will rise|will fall|go long|go short|buy|sell)\b/i.test(m), `${r.id}: no trade or forecast wording`);
  }
  const kinds = new Set(RANK.rows.map(r => r.kind)); for (const k of Object.keys(KINDS)) assert.ok(kinds.has(k), `no pair of kind ${k}`);
});

test('the sentence reads the live state by kind: zones for spreads, the 1.0 line for vol ratios, trend for relative strength, sigma for divergences', () => {
  const by = Object.fromEntries(RANK.rows.map(r => [r.id, r]));
  assert.match(meaningOf(by['curve-2s10s']), /^At [+−]?\d+bp it is (inverted|flat|steep): /);
  assert.match(meaningOf(by['vix-vix3m']), /^At [\d.]+, (above|below) 1: /);
  assert.match(meaningOf(by['rsp-spy']), /^(Above its 50-day and 200-day average|Below its 50-day and 200-day average|Between its 50-day and 200-day average)/);
  assert.match(meaningOf(by['audjpy']), /Today [+−]\d/);
  assert.match(meaningOf(by['dx-dxy-tips']), /σ (higher|lower) than US real yields would suggest: (in line|stretched|far out of line)/i);
  assert.match(meaningOf(by['real-bei']), /inflation-led|real-yield-led/);
  assert.match(meaningOf(by['hy-ig']), /own range|usual range/);
  assert.match(meaningOf(by['sbcorr']), /At [+−]?[\d.]+, /);
});

test('the zone finder and the trend state', () => {
  const z = TEMPLATES['curve-2s10s'].zones;
  assert.equal(zoneFor(z, -20).label, 'inverted'); assert.equal(zoneFor(z, 20).label, 'flat'); assert.equal(zoneFor(z, 80).label, 'steep'); assert.equal(zoneFor(z, 50).label, 'steep', 'a zone is "below" its limit');
  const up = Array.from({ length: 260 }, (_, i) => 100 + i), dn = up.slice().reverse(), mix = [...Array.from({ length: 230 }, (_, i) => 100 + i), ...Array.from({ length: 30 }, (_, i) => 330 - i)];
  assert.equal(trendState(up).state, 'above'); assert.equal(trendState(dn).state, 'below'); assert.equal(trendState(mix).state, 'mixed'); assert.equal(trendState([1, 2, 3]).state, 'none');
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
});

test('window and period labels, and the grade labels and counts', () => {
  assert.equal(winShort(1500), '6y'); assert.equal(winShort(756), '3.0y'); assert.equal(winShort(300), '300d'); assert.equal(periodChange({ text: '+5.5%' }), '1m +5.5%'); assert.equal(periodChange(null), '');
  assert.equal(gradeLabel('null'), 'Tested: no forward edge found'); assert.equal(gradeLabel('underpowered'), 'Tested: underpowered'); assert.equal(gradeLabel('context'), 'Described only');
  assert.equal(gradeLabel('validated', ['the range of the next week']), 'Range validated'); assert.equal(gradeLabel('validated', ['direction of the next day']), 'Validated');
  const ev = [{ id: 'a', verdict: 'null', word: 'NULL', about: 'x' }, { id: 'b', verdict: 'null', word: 'NULL', about: 'y' }, { id: 'c', verdict: 'underpowered', word: 'UNDERPOWERED', about: 'z' }, { id: 'd', verdict: 'validated', word: 'VALIDATED', about: 'range of the day' }];
  const g = gradeChips(ev); assert.deepEqual(g.map(x => [x.verdict, x.count]), [['validated', 1], ['underpowered', 1], ['null', 2]], 'strongest grade first, duplicates collapsed to a count');
  const html = gradeChipsHtml({ ev }); assert.equal((html.match(/class="chip sp-v/g) ?? []).length, 3); assert.match(html, /2 tests/); assert.ok(!/TESTED ·/.test(html), 'the jargon is gone');
  assert.match(gradeChipsHtml({ ev: [] }), /Not tested here/); assert.ok(GRADE_HELP.length >= 5); for (const [k, v] of GRADE_HELP) { clean(k, 'help key'); assert.ok(v.length > 30, k); }
});

// a row stand-in with real legs for the arithmetic of "what moved it"
const mkRow = (pairOver, xs, ys, op = 'div') => ({ pair: { op: 'ratio', id: 'x', short: 'X / Y', label: 'X over Y', what: 'x over y', up: 'x up', down: 'x down', ...pairOver }, legs: { op, xKey: 'rsp', yKey: 'spy', x: xs, y: ys }, series: { dates: xs.map((_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`), vals: xs.map((v, i) => v / ys[i]) } });
test('what moved it: the legs and the sentence agree with the arithmetic (ratio, spread in bp, and a product)', () => {
  const n = 40, xs = Array.from({ length: n }, (_, i) => (i < n - 22 ? 100 : 100 * (1 + (0.041 * (i - (n - 22))) / 21))), ys = Array.from({ length: n }, (_, i) => (i < n - 22 ? 50 : 50 * (1 - (0.01 * (i - (n - 22))) / 21)));
  const row = mkRow({}, xs, ys), d = decompose(row, 21);
  assert.ok(Math.abs(d.parts.x - 4.1) < 0.05 && Math.abs(d.parts.y + 1.0) < 0.05, JSON.stringify(d.parts));
  assert.ok(Math.abs((1 + d.parts.x / 100) / (1 + d.parts.y / 100) - 1 - (xs.at(-1) / ys.at(-1)) / (xs.at(-22) / ys.at(-22)) + 1) < 1e-9, 'the ratio change is the quotient of the legs');
  assert.match(d.text, /\+4\.1%/); assert.match(d.text, /−1\.0%/); assert.match(d.text, /ratio rose because .* rose while .* fell/); assert.ok(d.text.length < 220, 'the sentence names the legs, it does not print their values'); assert.match(d.text, /Equal-weight|RSP|SPY/i);
  const yx = Array.from({ length: n }, (_, i) => 4 + (i >= n - 22 ? 0.12 * ((i - (n - 22)) / 21) : 0)), yy = Array.from({ length: n }, (_, i) => 3.9 + (i >= n - 22 ? 0.24 * ((i - (n - 22)) / 21) : 0));
  const sp = mkRow({ op: 'diff', unit: 'bp' }, yx, yy, 'sub'), s = decompose(sp, 21);
  assert.ok(Math.abs(s.parts.x - 12) < 0.5 && Math.abs(s.parts.y - 24) < 0.5 && Math.abs(s.parts.gap + 12) < 0.5, JSON.stringify(s.parts)); assert.match(s.text, /\+12bp/); assert.match(s.text, /\+24bp/); assert.match(s.text, /narrowed by 12bp/); assert.match(s.text, /moved more \(both rose\)/);
  const pr = mkRow({}, xs, ys, 'mul'), m = decompose(pr, 21); assert.match(m.text, /cross (rose|fell)/);
  assert.equal(decompose({ pair: { op: 'level', short: 'z' }, legs: null, series: { vals: [1] } }), null, 'a single series has no legs to split');
  const c = componentSeries({ ...row }, 30); assert.equal(c.kind, 'rebased'); assert.equal(Math.round(c.x[0]), 100); assert.equal(Math.round(c.y[0]), 100);
  const cb = componentSeries(sp, 30); assert.equal(cb.kind, 'change'); assert.equal(cb.unit, 'bp'); assert.equal(Math.round(cb.x[0]), 0);
});

test('what moved it for every library pair: a divergence or a pair with two legs says which leg did the work; a single series says so', () => {
  let split = 0, single = 0;
  for (const r of RANK.rows) {
    const h = heroHtml(r, '3y'); clean(h.replace(/<[^>]+>/g, ' '), `${r.id} hero`);
    for (const m of h.matchAll(/class="lbl">([^<]*)</g)) assert.ok(m[1].length < 90, `${r.id}: a card label ${m[1].length} characters long (a leg name that is not a key?)`);
    for (const m of h.matchAll(/<text class="sp-endv[^>]*>([^<]*)</g)) assert.ok(m[1].length < 60, `${r.id}: a chart label ${m[1].length} characters long`); assert.match(h, /What this is/); assert.match(h, /class="sp-sowhat"/); assert.match(h, /sp-kindline/);
    const d = decompose(r, 21);
    if (r.pair.op === 'zgap') { assert.ok(d, r.id); assert.match(d.text, /^Over the last month .* moved [+−]\d\.\dσ/); assert.match(h, /Why it moved/); split++; }
    else if (r.legs) { assert.ok(d, `${r.id}: legs but no sentence`); clean(d.text, `${r.id} decomposition`); assert.match(h, /What moved it:/); split++; }
    else { assert.equal(d, null, r.id); assert.match(h, /single series|no two legs/); single++; }
  }
  assert.ok(split >= 40 && single >= 4, `${split} split, ${single} single`);
});

test('where it has been before: earlier stretches in the same zone, the current one excluded, merged runs, as-of safe', () => {
  const n = 1200, vals = Array.from({ length: n }, (_, i) => Math.sin(i / 20) * 10), series = { dates: days(n), vals };
  const sorted = Float64Array.from(vals).sort(), pct = sorted.findIndex(v => v >= vals[n - 1]) / n;
  const e = episodes(series, pct); assert.ok(e && e.n >= 5, JSON.stringify(e)); assert.ok(e.current && e.current.len >= 1); assert.ok(e.past.length <= 6);
  for (const p of e.past) { assert.ok(p.from <= p.to && p.len >= 1); assert.ok(p.to < e.current.from, 'every earlier stretch ends before the current one starts'); }
  for (let i = 1; i < e.past.length; i++) assert.ok(e.past[i].to < e.past[i - 1].from, 'most recent first');
  const cut = 700, e2 = episodes({ dates: series.dates.slice(0, cut), vals: vals.slice(0, cut) }, 0.5);
  for (const p of e2.past) assert.ok(p.to <= series.dates[cut - 1], 'a series cut at a date has no stretch that reaches past it'); if (e2.current) assert.ok(e2.current.from <= series.dates[cut - 1]);
  assert.equal(episodes({ dates: ['a'], vals: [1] }, 0.5), null, 'too short to say anything');
  const flat = episodes({ dates: days(100), vals: Array.from({ length: 100 }, (_, i) => (i < 60 ? 0 : 5)) }, 0.97); assert.equal(flat.n, 0, 'a zone it has never been in before has no past stretch');
});

test('compare: ratios rebase to 100 at the window start; anything else is shown as a standard score; the card states which and says what to do with one row picked', () => {
  const a = RANK.rows.find(r => r.id === 'rsp-spy'), b = RANK.rows.find(r => r.id === 'smh-spy'), c = RANK.rows.find(r => r.id === 'curve-2s10s');
  const ab = compareSeries(a, b, 252); assert.equal(ab.mode, 'rebased'); assert.equal(Math.round(ab.a[0]), 100); assert.equal(Math.round(ab.b[0]), 100); assert.equal(ab.a.length, ab.dates.length);
  const ac = compareSeries(a, c, 252); assert.equal(ac.mode, 'zscore'); const mean = v => v.reduce((s, x) => s + x, 0) / v.length; assert.ok(Math.abs(mean(ac.a)) < 1e-9 && Math.abs(mean(ac.b)) < 1e-9);
  assert.equal(compareSeries({ ...a, series: { dates: ['2026-01-01'], vals: [1] } }, b), null);
  assert.equal(compareHtml(RANK, { cmp: [] }), ''); assert.match(compareHtml(RANK, { cmp: ['rsp-spy'] }), /Press the .* button on a second row/);
  const two = compareHtml(RANK, { cmp: ['rsp-spy', 'smh-spy'], cw: '1y' }); assert.match(two, /<svg class="sp-chart sp-two"/); assert.match(two, /start at 100/); assert.match(two, /data-cmp-clear="1"/);
  assert.match(compareHtml(RANK, { cmp: ['rsp-spy', 'curve-2s10s'] }), /standard score/);
});

test('the ladder: the legend and kinds, one sentence under each title, window and period labels, graded chips, no jumping rank column, a compare button on every row', () => {
  const h = ladderHtml(RANK, { view: 'ladder', group: 'all', story: 'all', sort: 'stretch', open: null, hw: '3y', cmp: [] });
  assert.match(h, /How to read a row/); for (const k of Object.values(KINDS)) assert.ok(h.includes(k.label), k.label); assert.match(h, /What do the evidence chips mean\?/); assert.match(h, /shaded ends: the extreme tenths/);
  assert.equal((h.match(/class="in-row sp-row"/g) ?? []).length, 55); assert.equal((h.match(/class="sp-mean"/g) ?? []).length, 55); assert.equal((h.match(/class="sp-cmp"/g) ?? []).length, 55);
  assert.ok(!/class="in-rk"/.test(h)); assert.equal((h.match(/<i>1m<\/i>/g) ?? []).length >= 50, true); assert.equal((h.match(/<i>of \d/g) ?? []).length, 55);
  assert.match(ladderHtml(RANK, { view: 'ladder', group: 'all', story: 'all', sort: 'mentioned', open: null, hw: '3y', cmp: [] }), /mentions: \d+/);
  assert.ok(!/undefined|NaN|\[object/.test(h));
  const t = trackHtml({ pct: 0.9, pct1w: 0.8, pct1m: 0.7, refPct: 0.4, tpl: { ref: { one: {} } } }); assert.match(t, /class="sp-ref"/); assert.match(t, /<em>1\.0<\/em>/); assert.match(t, /sp-ext l/); assert.match(t, /sp-medtick/);
  assert.ok(!/sp-ref/.test(trackHtml({ pct: 0.5, pct1w: null, pct1m: null })));
  assert.match(wallHtml(RANK), /class="sp-mean"/);
});

test('the hero chart draws the pair\'s natural level: named zones and a zero line for a curve, 1.0 for a vol ratio, trend averages for relative strength, sigma lines for a divergence', () => {
  const nn = 700, d = days(nn), us10y = Array.from({ length: nn }, (_, i) => 3 + (2 * i) / nn), us2y = Array.from({ length: nn }, () => 4);
  const r = rankPairs({ ok: true, dates: d, series: { us10y, us2y } }, PAIRS.filter(p => p.id === 'curve-2s10s')).rows[0];
  const svg = heroSvg(r, slice(r.series, 0)); for (const w of ['inverted', 'flat', 'steep']) assert.match(svg, new RegExp(`>${w}<`)); assert.match(svg, /class="sp-zero"/);
  const vix = Array.from({ length: nn }, (_, i) => 20 + 6 * Math.sin(i / 30)), vix3m = Array.from({ length: nn }, () => 20);
  const v = rankPairs({ ok: true, dates: d, series: { vix, vix3m } }, PAIRS.filter(p => p.id === 'vix-vix3m')).rows[0]; const vs = heroSvg(v, slice(v.series, 0)); assert.match(vs, /1\.0: the two are priced alike/); assert.match(trackHtml(v), /<em>1\.0<\/em>/);
  const rsp = Array.from({ length: nn }, (_, i) => 100 + i * 0.1 + 5 * Math.sin(i / 25)), spy = Array.from({ length: nn }, () => 100);
  const rr = rankPairs({ ok: true, dates: d, series: { rsp, spy } }, PAIRS.filter(p => p.id === 'rsp-spy')).rows[0]; const rs = heroSvg(rr, slice(rr.series, 252)); assert.match(rs, /sp-ma50/); assert.match(rs, /sp-ma200/);
  const dv = RANK.rows.find(x => x.id === 'dx-dxy-tips'); assert.match(heroSvg(dv, slice(dv.series, 0)), /σ (stretched|far out)|zero: in line/);
  assert.ok(!/NaN|undefined/.test(svg + vs + rs));
});

test('quotes show the educator and the lane; the so-what line states how educators read it, what our tests found and that it is a description of state', () => {
  assert.equal(laneOf('Nicholas Crown'), 'informational lane'); assert.equal(laneOf('C.OG course text'), 'C.OG lane'); assert.equal(laneOf('Quant Guild'), 'technical lane'); assert.equal(laneOf('someone'), 'stored notes');
  const r = RANK.rows.find(x => x.id === 'rsp-spy'), h = heroHtml(r); assert.match(h, /class="sp-lane">informational lane</); assert.match(soWhat(r), /^Educators read a rise as ".+" and a fall as ".+"\. In our own tests of what follows: .+ Use it as a description of state\.$/);
  assert.match(soWhat(RANK.rows.find(x => x.id === 'xly-xlp')), /we have not tested what follows this reading yet/);
  for (const row of RANK.rows) { const s = soWhat(row); clean(s, `${row.id} so-what`); assert.ok(!/\b(buy|sell|signal to|will rise|will fall)\b/i.test(s), row.id); }
});

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const tick = () => new Promise(r => setTimeout(r, 5));
test('mount: the onboarding line shows once and stays dismissed; two compare presses open the card, a third replaces the first, Clear empties it', async () => {
  const host = { _h: '', l: {}, addEventListener(t, f) { (this.l[t] ??= []).push(f); }, removeEventListener() {}, contains: () => true, querySelector: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } };
  const win = { localStorage: mem() }, doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
  mountSpreads(host, { win, doc, getBundle: async () => full() }); await tick();
  const fire = ds => (host.l.click ?? []).forEach(f => f({ target: { closest: () => ({ dataset: ds }) } }));
  assert.match(host._h, /class="sp-onboard"/); assert.match(host._h, /describe state, not direction/);
  fire({ dismiss: 'onboard' }); assert.ok(!/class="sp-onboard"/.test(host._h)); assert.match(win.localStorage.getItem('deskSpreads:v1'), /"seen":true/);
  fire({ cmp: 'rsp-spy' }); assert.match(host._h, /Press the .* button on a second row/); fire({ cmp: 'smh-spy' }); assert.match(host._h, /class="sp-chart sp-two"/);
  fire({ cmp: 'nq-spx' }); assert.match(host._h, /class="sp-chart sp-two"/, 'a third pick replaces the first'); assert.ok(/aria-pressed="true"/.test(host._h));
  fire({ cmpClear: '1' }); assert.ok(!/class="sp-compare"/.test(host._h));
});

test('the stylesheet carries the new pieces on tokens only, and nothing nowrap', () => {
  const css = fs.readFileSync(new URL('./spreads.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const c of ['.sp-mean', '.sp-ext', '.sp-medtick', '.sp-ref', '.sp-kind', '.sp-how', '.sp-help', '.sp-onboard', '.sp-eplist', '.sp-compare', '.sp-zone', '.sp-ma50', '.sp-cmp']) assert.ok(css.includes(c), c);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css)); assert.ok(!/white-space:\s*nowrap/.test(css)); assert.match(css, /grid-template-areas: "nm nm nm" "tr tr tr" "pc va ch" "cp cp cp"/);
});
