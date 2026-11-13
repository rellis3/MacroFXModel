// The Macro tab's Rates & policy board: the shaping (ratesBoardCore.js) and the HTML (ratesBoardView.js) on synthetic
// series.   node js/terminal/ratesBoard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from './ratesBoardCore.js';
import { boardHtml, curveSvg } from './ratesBoardView.js';
import { meetingProbabilities } from '../fedPathZq.js';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const iso = t => new Date(t).toISOString().slice(0, 10);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
// weekday prints from 2014-01-01 to 2026-11-12: a seeded random walk around a base, in percent
function walk(base, vol, seed) {
  const r = rng(seed), out = []; let v = base;
  for (let t = Date.parse('2014-01-01T00:00:00Z'); t <= Date.parse('2026-11-12T00:00:00Z'); t += 864e5) {
    const d = new Date(t).getUTCDay(); if (d === 0 || d === 6) continue;
    v = Math.max(0.05, v + (r() - 0.5) * vol); out.push({ date: iso(t), value: +v.toFixed(2) });
  }
  return out;
}
const S = { us2y: walk(3.6, 0.08, 1), us5y: walk(3.8, 0.07, 2), us10y: walk(4.1, 0.06, 3), us30y: walk(4.6, 0.05, 4), effr: walk(3.9, 0.002, 5) };

test('changeBp: calendar-day lookback on the last print, null when the series cannot answer', () => {
  const a = [{ date: '2026-11-04', value: 4.0 }, { date: '2026-11-05', value: 4.1 }, { date: '2026-11-06', value: 4.2 }, { date: '2026-11-09', value: 4.3 }];
  assert.equal(C.changeBp(a, 1), 10);               // Monday against Friday, not against a Sunday that never printed
  assert.equal(C.changeBp(a, 5), 30);               // the 4th is the last print on or before the 4th
  assert.equal(C.changeBp([{ date: '2026-11-09', value: 4.3 }], 1), null);
  assert.equal(C.changeBp([{ date: '2026-01-02', value: 4.0 }, { date: '2026-11-09', value: 4.3 }], 5), null);   // reference far older than the window: say nothing
  assert.equal(C.changeBp([], 5), null);
});

test('spreadSeries is the longer minus the shorter in bp, on the dates both print', () => {
  const l = [{ date: 'd1', value: 4.5 }, { date: 'd2', value: 4.4 }, { date: 'd3', value: 4.0 }], s = [{ date: 'd1', value: 4.0 }, { date: 'd3', value: 4.1 }];
  assert.deepEqual(C.spreadSeries(l, s), [{ date: 'd1', value: 50 }, { date: 'd3', value: -10 }]);
});

test('pctile: share of the trailing window at or below the last value; null under the minimum', () => {
  const up = Array.from({ length: 400 }, (_, i) => ({ date: iso(Date.parse('2026-01-01T00:00:00Z') - (400 - i) * 864e5 + 400 * 864e5), value: i }));
  assert.equal(C.pctile(up, 1).pct, 100);
  const down = up.map((p, i) => ({ date: p.date, value: 400 - i }));
  assert.ok(C.pctile(down, 1).pct <= 1);
  assert.equal(C.pctile(up.slice(-20), 1).pct, null);
  assert.equal(C.pctile([], 1).n, 0);
});

test('buildRatesBoard: tenors, slopes, curve snapshots and the 2Y proxy', () => {
  const b = C.buildRatesBoard(S, NOW);
  assert.equal(b.ok, true);
  assert.deepEqual(b.tenors.map(t => t.k), ['2y', '5y', '10y', '30y']);
  const l = k => S[k].at(-1).value;
  const s210 = b.slopes.find(s => s.k === '2s10s');
  assert.equal(s210.bp, Math.round((l('us10y') - l('us2y')) * 100));
  assert.equal(b.slopes.find(s => s.k === '2s30s').bp, Math.round((l('us30y') - l('us2y')) * 100));
  assert.equal(b.slopes.find(s => s.k === '10s30s').bp, Math.round((l('us30y') - l('us10y')) * 100));
  assert.equal(s210.inverted, s210.bp < 0);
  for (const s of b.slopes) { assert.ok(s.pct1y >= 0 && s.pct1y <= 100); assert.ok(s.pct5y >= 0 && s.pct5y <= 100); assert.ok(s.n1y > 200 && s.n5y > 1000); assert.equal(s.spark.length, 60); }
  assert.ok(b.curve.now.pts.length === 4 && b.curve.w1.date < b.curve.now.date && b.curve.m1.date < b.curve.w1.date);
  assert.equal(b.policy.gapBp, Math.round((l('us2y') - l('effr')) * 100));
  assert.equal(b.policy.hikesEquivalent, +(b.policy.gapBp / 25).toFixed(1));
  assert.ok(['cuts', 'hikes', 'roughly on hold'].includes(b.policy.direction));
  assert.equal(b.tenors[0].ageDays, C.ageDays(b.tenors[0].asOf, NOW));
});

test('buildRatesBoard: a missing 5Y still draws the curve; a missing 10Y is not ok', () => {
  const { us5y, ...no5 } = S;
  const b = C.buildRatesBoard(no5, NOW);
  assert.equal(b.ok, true); assert.deepEqual(b.tenors.map(t => t.k), ['2y', '10y', '30y']);
  assert.equal(C.buildRatesBoard({ ...S, us10y: [] }, NOW).ok, false);
  assert.equal(C.buildRatesBoard(null, NOW).ok, false);
});

// a strip with meetings Nov, Dec, Jan, Mar and a week-ago strip with less priced
const MTG = ['2026-11-05', '2026-12-10', '2027-01-28', '2027-03-18', '2027-06-17'];
const rungs = (base, bumpPerMonth) => ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'].map((ym, i) => ({ ym, implied: +(base + bumpPerMonth * i).toFixed(4), volumeHint: i < 4 ? 30 : 1 }));
const mk = (asOf, base, bump, mt) => ({ asOf, meetings: meetingProbabilities(rungs(base, bump), mt).rows });
const zq = { ...mk('2026-11-13', 3.88, 0.05, MTG.filter(d => d >= '2026-11')), weekAgo: mk('2026-11-06', 3.88, 0.02, MTG) };

test('fedPathRows: the next meetings with cumulative path, the week-ago comparison, horizons and the thin flag', () => {
  const b = C.buildRatesBoard(S, NOW);
  const p = C.fedPathRows(zq, b);
  assert.ok(p.rows.length >= 1 && p.rows.length <= 3);
  assert.ok(p.rows.every(r => r.meeting >= '2026-11-13'), 'a meeting already held is dropped');
  const dec = p.horizons.find(h => h.label === 'by December');
  assert.ok(dec, 'December horizon present');
  assert.equal(dec.steps, +(p.rows.find(r => r.meeting === '2026-12-10').cumBp / 25).toFixed(2));
  assert.ok(dec.weekAgoSteps != null && Math.abs(dec.dSteps - (dec.steps - dec.weekAgoSteps)) < 0.011);
  assert.ok(dec.dSteps > 0, 'a steeper strip this week than last prices more by December');
  const jun = p.horizons.find(h => h.label === 'by June');
  assert.ok(jun && jun.thin === true, 'the back half of the strip trades thinly and is flagged');
  assert.equal(p.week.y10, b.tenors.find(t => t.k === '10y').chg5d);
  assert.equal(C.fedPathRows({ asOf: '2026-11-13', meetings: [] }, b), null);
  assert.equal(C.fedPathRows(null, b), null);
});

test('reconcile: the proxy against the last meeting that is not thin; difference is proxy minus strip', () => {
  const b = C.buildRatesBoard(S, NOW), p = C.fedPathRows(zq, b), r = C.reconcile(b, p);
  const far = p.horizons.filter(h => !h.thin).at(-1);
  assert.equal(r.proxy, b.policy.hikesEquivalent);
  if (far) { assert.equal(r.strip, far.steps); assert.equal(r.stripLabel, far.label); }
  assert.equal(r.diff, +(r.proxy - r.strip).toFixed(2));
  const none = C.reconcile(b, null);
  assert.equal(none.strip, null); assert.equal(none.diff, null);
});

test('gapStrip: each country\'s 10-year less the US 10-year, with the 20-day change of the gap', () => {
  const rows = [{ ccy: 'USD', short: 'US', y10: 4.1, chg10y20d: 10 }, { ccy: 'EUR', short: 'Germany', y10: 2.6, chg10y20d: 4 }, { ccy: 'JPY', short: 'Japan', y10: 1.9, chg10y20d: null }, { ccy: 'GBP', short: 'UK', y10: null }];
  assert.deepEqual(C.gapStrip(rows).map(g => [g.ccy, g.gapBp, g.chg20d]), [['EUR', -150, -6], ['JPY', -220, null]]);
  assert.deepEqual(C.gapStrip([]), []);
});

test('boardHtml: draws every block from a complete board, dated, with the evidence stamp', () => {
  const b = C.buildRatesBoard(S, NOW);
  const gy = { ok: true, rows: [{ ccy: 'USD', short: 'US', y10: 4.1, chg10y20d: 10 }, { ccy: 'EUR', short: 'Germany', y10: 2.6, chg10y20d: 4 }] };
  const html = boardHtml(b, { ok: true, zq }, gy, {});
  assert.match(html, /Rates &amp; policy/);
  for (const t of ['US Treasury curve', 'Slopes', 'Policy path beside the curve', 'Two measures', '10-year gap to Treasuries', '2s10s', '2s30s', '10s30s']) assert.ok(html.includes(t), t);
  assert.match(html, /stir-wide-scan/); assert.match(html, /Context, not a signal/);
  assert.doesNotMatch(html, /undefined|NaN|\[object/);
});

test('boardHtml: no fed-path strip or no global yields still draws the curve, and says what is missing', () => {
  const b = C.buildRatesBoard(S, NOW);
  const html = boardHtml(b, { ok: false }, null, {});
  assert.match(html, /not loaded/); assert.match(html, /US Treasury curve/); assert.doesNotMatch(html, /10-year gap to Treasuries/);
  assert.doesNotMatch(html, /undefined|NaN/);
  assert.equal(boardHtml({ ok: false }, null, null), '');
  assert.equal(boardHtml(null, null, null), '');
});

test('boardHtml: a stale print is dimmed and carries its age; the curve svg names its three lines', () => {
  const stale = C.buildRatesBoard(S, NOW + 9 * 864e5);
  assert.match(boardHtml(stale, null, null, {}), /\d+d old/);
  const svg = curveSvg(C.buildRatesBoard(S, NOW).curve);
  assert.match(svg, /a week ago/); assert.match(svg, /a month ago/); assert.match(svg, /<svg/);
  assert.equal(curveSvg(null), '');
});
