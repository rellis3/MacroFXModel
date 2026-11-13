// The Fed path -> yields join: the shaping (fedPathYieldsCore.js) and the board HTML (terminal/fedPathYieldsView.js).
//   node js/fedPathYieldsCore.test.mjs
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as C from './fedPathYieldsCore.js';
import { boardHtml } from './terminal/fedPathYieldsView.js';
import { chainSnapshot } from './terminal/chainBoard.js';

const NOW = Date.parse('2026-11-13T12:00:00Z');
// a strip: decisions at the given dates, rates after each; rBefore chains from the first
function strip(asOf, start, steps, { thinFrom = null } = {}) {
  const dates = ['2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16'];
  let r = start;
  return { asOf, meetings: dates.map((d, i) => { const before = r; r = +(r + (steps[i] ?? 0) / 100).toFixed(4); return { meeting: d, rBefore: before, rAfter: r, moveBp: steps[i] ?? 0, probPct: 50, direction: 'hike', thin: thinFrom != null && i >= thinFrom }; }) };
}
const zqNow = strip('2026-11-13T21:00:00Z', 3.75, [20, 5, 0, 0, 0]);
const FP = (extra = {}) => ({ ok: true, asOf: '2026-11-12', ageDays: 1, currentRange: '3.50-3.75',
  windows: [{ ref: '2026-12', hike: 80, cut: 1, mean: 3.9, hikeAgo: { d1: 78, w1: 70, m1: 50 } }, { ref: '2027-01', hike: 85, cut: 1, mean: 3.95, hikeAgo: { d1: 85, w1: 75, m1: null } }],
  zq: { ...zqNow, weekAgo: strip('2026-11-06T21:00:00Z', 3.75, [10, 0, 0, 0, 0]), ...extra } });
const BOARD = (y2 = 9) => ({ ok: true, policy: { hikesEquivalent: 1.4, gapBp: 35, direction: 'hikes', twoYear: 4.1, effr: 3.75, twoYearAsOf: '2026-11-12' },
  tenors: [{ k: '2y', chg1d: 2, chg7d: y2, chg28d: 18 }, { k: '10y', chg1d: 1, chg7d: 5, chg28d: 12 }], slopes: [{ k: '2s10s', chg1d: -1, chg7d: -4, chg28d: -6 }] });

test('the 5D window pairs the 7-day strip with the 7-day yield changes, and the sentence says "priced"', () => {
  const r = C.fedPathYields({ fp: FP(), board: BOARD(20), now: NOW });
  assert.equal(r.ok, true);
  const w = r.windows.find(x => x.win === 5);
  assert.equal(w.available, true);
  assert.equal(w.y2, 20); assert.equal(w.y10, 5); assert.equal(w.s2s10, -4);
  assert.ok(w.path > 0 && w.path <= 15, `path ${w.path}`);       // 10-15bp more priced at December/June, held flat: the 2-year average moved ~14bp
  assert.equal(+(w.path + w.remainder).toFixed(1), 20);            // the split always sums to the 2Y move
  assert.match(w.sentence, /^2Y \+20bp on the week; the futures path accounts for \+\d+bp, the rest \(\+\d+bp\) is term premium \/ inflation compensation\.$/);
  assert.doesNotMatch(w.sentence, /forecast|will|expect/i);
  // the path can be worth MORE than the 2Y moved: said plainly, not as a negative "rest"
  const over = C.fedPathYields({ fp: FP(), board: BOARD(9), now: NOW }).windows.find(x => x.win === 5);
  assert.match(over.sentence, /the futures path alone is worth \+14bp, more than the 2Y moved, so term premium \/ inflation compensation offset −5bp/);
});

test('December and June are the priced rate AFTER the meeting, with the change against the earlier strip', () => {
  const w = C.fedPathYields({ fp: FP(), board: BOARD(), now: NOW }).windows.find(x => x.win === 5);
  const dec = w.horizons.find(x => x.label === 'by December'), jun = w.horizons.find(x => x.label === 'by June');
  assert.equal(dec.meeting, '2026-12-09'); assert.equal(dec.rateAfter, 3.95); assert.equal(dec.agoRateAfter, 3.85); assert.equal(dec.dBp, 10);
  assert.equal(jun.meeting, '2027-06-16'); assert.equal(jun.rateAfter, 4.0); assert.equal(jun.dBp, 15);
});

test('1D and 20D are unavailable, with a reason, when the pull has not written them: never invented', () => {
  const r = C.fedPathYields({ fp: FP(), board: BOARD(), now: NOW });
  for (const n of [1, 20]) { const w = r.windows.find(x => x.win === n); assert.equal(w.available, false); assert.match(w.reason, /archive does not serve/); assert.equal(w.sentence, undefined); }
  const rr = C.fedPathYields({ fp: FP({ ago: { 1: strip('2026-11-12T21:00:00Z', 3.75, [18, 5, 0, 0, 0]), 28: strip('2026-10-16T21:00:00Z', 3.75, [0, 0, 0, 0, 0]) } }), board: BOARD(), now: NOW });
  assert.equal(rr.windows.find(x => x.win === 1).available, true);
  assert.equal(rr.windows.find(x => x.win === 20).available, true);
});

test('a lookback strip that is the wrong distance back is refused, not relabelled', () => {
  const r = C.fedPathYields({ fp: FP({ ago: { 28: strip('2026-11-06T21:00:00Z', 3.75, [0, 0, 0, 0, 0]) } }), board: BOARD(), now: NOW });
  const w = r.windows.find(x => x.win === 20);
  assert.equal(w.available, false); assert.match(w.reason, /7 days back, not ~28/);
});

test('thin contracts: the path is cut at the first thin meeting and the rate held flat; both strips cut in the same place', () => {
  const thin = strip('2026-11-13T21:00:00Z', 3.75, [20, 5, 0, 0, 0], { thinFrom: 1 });
  assert.equal(C.liquidPrefix(thin.meetings).length, 1);
  const r = C.fedPathYields({ fp: FP({ meetings: thin.meetings }), board: BOARD(), now: NOW });
  const w = r.windows.find(x => x.win === 5);
  const jun = w.horizons.find(x => x.label === 'by June'); assert.equal(jun.thin, true);
  assert.ok(r.notes.some(n => /thin|held flat/.test(n)));
  // with only the first meeting liquid, the path change comes from the December step alone (20 vs 10bp)
  const allLiquid = C.fedPathYields({ fp: FP(), board: BOARD(), now: NOW }).windows.find(x => x.win === 5);
  assert.ok(w.path <= allLiquid.path);
});

test('opposite signs and tiny moves get their own wording; a move under 2bp is never divided', () => {
  const opp = C.fedPathYields({ fp: FP(), board: BOARD(-8), now: NOW }).windows.find(x => x.win === 5);
  assert.match(opp.sentence, /the futures path moved the other way/);
  const flat = C.fedPathYields({ fp: FP(), board: BOARD(1), now: NOW }).windows.find(x => x.win === 5);
  assert.match(flat.sentence, /barely moved/); assert.equal(flat.share, null);
});

test('the laptop pull missing nights is said, and a missing strip or curve gives ok:false with a reason', () => {
  const stale = C.fedPathYields({ fp: FP(), board: BOARD(), now: Date.parse('2026-11-20T12:00:00Z') });
  assert.equal(stale.stale, true); assert.ok(stale.notes.some(n => /last pulled 7 days ago/.test(n)));
  assert.equal(C.fedPathYields({ fp: { ok: true, zq: null }, board: BOARD(), now: NOW }).ok, false);
  assert.equal(C.fedPathYields({ fp: FP(), board: { ok: false }, now: NOW }).ok, false);
  assert.equal(C.fedPathYields({}).ok, false);
});

test('the 2Y proxy is reconciled against the futures strip and a gap of a step is flagged', () => {
  const r = C.fedPathYields({ fp: FP(), board: BOARD(), now: NOW });
  assert.equal(r.proxy.proxy, 1.4);
  assert.equal(r.proxy.diverges, false);         // 1.4 steps vs the strip's ~1.0: under a step apart
  const far = BOARD(); far.policy.hikesEquivalent = 3;
  const r2 = C.fedPathYields({ fp: FP(), board: far, now: NOW });
  assert.equal(r2.proxy.diverges, true); assert.match(r2.proxy.note, /prices more policy than the futures strip/);
});

test('Atlanta window odds are windows, with deltas in percentage points', () => {
  const a = C.atlantaWindows(FP());
  assert.equal(a.rows[0].ref, '2026-12'); assert.equal(a.rows[0].hike, 80); assert.equal(a.rows[0].d1, 2); assert.equal(a.rows[0].w1, 10); assert.equal(a.rows[1].m1, null);
  assert.equal(C.atlantaWindows({ ok: false }), null);
});

test('chainLine: the sentence plus the December and June levels, nothing on Live', () => {
  const r = C.fedPathYields({ fp: FP(), board: BOARD(), now: NOW });
  const l = C.chainLine(r, 5);
  assert.match(l, /^2Y \+9bp on the week/);   // BOARD() defaults to a 9bp 2Y move assert.match(l, /Priced fed funds after the December meeting: 3\.95% priced/); assert.match(l, /priced, not a forecast/);
  assert.equal(C.chainLine(r, 'live'), null); assert.equal(C.chainLine(r, 1), null);
  assert.equal(C.chainLine({ ok: false }, 5), null);
});

test('chainSnapshot hands the line to the read inside the policy section', () => {
  const s = chainSnapshot({ links: [], vals: {}, win: 5, policy: null, fedPath: 'LINE', now: NOW });
  assert.match(s.policy, /FED FUTURES PATH, 5-day: LINE/);
  assert.equal(chainSnapshot({ links: [], vals: {}, win: 5, now: NOW }).policy, null);
});

test('the board draws the matrix, the sentence, the Atlanta card and the surface wrapper; n/a cells carry the reason', () => {
  const html = boardHtml(FP(), BOARD(9), { value: 0.6, chg20d: 8 }, {}, NOW);
  assert.match(html, /data-surface="panel\.macro\.fedyields"/);
  assert.match(html, /The Fed path against the yields/);
  assert.match(html, /the futures path (accounts for|alone is worth)/);
  assert.match(html, /Atlanta Fed window odds/);
  assert.match(html, /windows, not FOMC meetings/);
  assert.match(html, /n\/a/);
  assert.match(html, /Kim-Wright/);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b(?![^<]*>)/ , 'no hard-coded colour in text');
  assert.doesNotMatch(html, /forecast to|will (rise|fall)/i);
  const none = boardHtml({ ok: true, zq: null }, BOARD(), null, {}, NOW);
  assert.match(none, /not loaded/);
});

// ── the drawings (js/terminal/fedPathYieldsViz.js) ──
import { pathRibbonSvg, curveSvg, flowSvg, smooth } from './terminal/fedPathYieldsViz.js';
const nums = svg => [...svg.matchAll(/(?:cx|cy|x|y|x1|x2|y1|y2)="(-?[\d.]+)"/g)].map(m => +m[1]);
const withAgo = FP({ ago: { 28: strip('2026-10-16T21:00:00Z', 3.75, [4, 0, 0, 0, 0]) } });
const RES = C.fedPathYields({ fp: withAgo, board: { ...BOARD(21), tenors: [{ k: '2y', level: 4.1, chg1d: 2, chg7d: 21, chg28d: 18 }, { k: '5y', level: 4.05, chg1d: 2, chg7d: 15, chg28d: 15 }, { k: '10y', level: 4.22, chg1d: 1, chg7d: 9, chg28d: 12 }] }, now: NOW });

test('drawings use theme tokens only, stay inside their viewBox and respect reduced motion', () => {
  const board = { ...BOARD(21), tenors: [{ k: '2y', level: 4.1, chg1d: 2, chg7d: 21, chg28d: 18 }, { k: '5y', level: 4.05, chg1d: 2, chg7d: 15, chg28d: 15 }, { k: '10y', level: 4.22, chg1d: 1, chg7d: 9, chg28d: 12 }] };
  for (const [name, svg] of [['ribbon', pathRibbonSvg(RES, withAgo.zq)], ['curve', curveSvg(board)], ['flow', flowSvg(RES)]]) {
    assert.ok(svg.length > 200, name);
    assert.doesNotMatch(svg.replace(/stop-color:var\([^)]*\)/g, ''), /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${name}: a hard-coded colour`);
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg); const [W, H] = [+vb[1], +vb[2]];
    for (const v of nums(svg)) assert.ok(v >= -1 && v <= Math.max(W, H) + 1, `${name}: ${v} outside ${W}x${H}`);
  }
  const css = fs.readFileSync(new URL('./terminal/terminal-tabs.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.fpy-sweep/);
});

test('ribbon: ghosts for every lookback that exists, thin tail dashed, a flat strip still gets a visible scale', () => {
  const svg = pathRibbonSvg(RES, withAgo.zq);
  assert.equal((svg.match(/stroke-dasharray="5 4"/g) ?? []).length, 1);           // the 5D ghost (chosen, dashed)
  assert.match(svg, /the same contracts 20D ago/);
  assert.doesNotMatch(svg, /held flat/);                                          // every contract liquid: no dashed tail
  const thinZq = { ...withAgo.zq, meetings: strip('2026-11-13T21:00:00Z', 3.75, [20, 5, 0, 0, 0], { thinFrom: 2 }).meetings };
  assert.match(pathRibbonSvg(C.fedPathYields({ fp: { ...withAgo, zq: thinZq }, board: BOARD(), now: NOW }), thinZq), /held flat/);
  const flat = strip('2026-11-13T21:00:00Z', 3.75, [0, 0, 0, 0, 0]);
  assert.ok(pathRibbonSvg(C.fedPathYields({ fp: { ...FP(), zq: { ...flat, weekAgo: flat } }, board: BOARD(), now: NOW }), flat).length > 200);
  assert.equal(pathRibbonSvg(null, null), '');
});

test('curve: the pill ghosts are the level minus the change, exactly (1D/5D/20D), and need three tenors', () => {
  const svg = curveSvg({ tenors: [{ k: '2y', level: 4.1, chg1d: 2, chg7d: 21, chg28d: 18 }, { k: '5y', level: 4.05, chg1d: 2, chg7d: 15, chg28d: 15 }, { k: '10y', level: 4.22, chg1d: 1, chg7d: 9, chg28d: 12 }] });
  assert.match(svg, /fpy-gh-1/); assert.match(svg, /fpy-gh-5/); assert.match(svg, /fpy-gh-20/);
  assert.match(svg, />\+21bp</); assert.match(svg, />\+9bp</);
  assert.equal(curveSvg({ tenors: [{ k: '2y', level: 4.1 }] }), '');
});

test('flow: one bp scale for every row; an opposite-signed rest is drawn dashed as an offset', () => {
  const svg = flowSvg(RES);
  const hs = [...svg.matchAll(/<rect x="440" y="[\d.]+" width="12" height="([\d.]+)"/g)].map(m => +m[1]);
  assert.equal(hs.length, 4);                                                       // two rows x (path, rest)
  const [p5, r5, p20, r20] = hs; assert.ok(Math.abs(p20 / p5 - 20 / 14) < 0.06, `${p20}/${p5}`);   // thickness ∝ bp (14 vs 20)
  assert.match(svg, /offset −2bp/); assert.match(svg, /stroke-dasharray="4 3"/);
  assert.ok(r5 > r20);
  assert.equal(flowSvg({ windows: [{ available: false }] }), '');
  assert.match(smooth([[0, 0], [10, 5], [20, 0]]), /^M0,0C/);
});
