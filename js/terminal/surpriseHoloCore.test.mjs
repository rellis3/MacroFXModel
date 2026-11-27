// Tests for surpriseHoloCore.js (the DATA SURPRISES block: shaping, scaling, extremes, replay, script). Run: node js/terminal/surpriseHoloCore.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { sliceH, sliceSpec, plateSpec, shapeBoard, extremes, tilts, leaders, monthGrid, gridAt, surpriseScript, surpriseFigure, placeLabels, zText, assumedPolarity, CAP, H_MAX, H_MIN, FAMS } from './surpriseHoloCore.js';
import { buildMacroBoard } from './macroEnginesCore.js';

const D = 864e5, NOW = Date.parse('2026-11-20T09:00:00Z');
// cells in the real /api/macro-engines-board shape (copied from a board built on the backfill, dates shifted)
const AUD_RETAIL = { family: 'retail', status: 'surprise', event: 'Retail Sales m/m', cadence: 'monthly', ms: 1794603600000, ageDays: 6, stale: false, actual: '0.2%', estimate: '0.3%', prev: '0.3%', z: null, strength: -1, basis: 'consensus',
  prints: [{ ms: 1794603600000, actual: '0.2%', estimate: '0.3%', prev: '0.3%', z: null, value: 0.2 }, { ms: 1792173600000, actual: '0.3%', estimate: '0.3%', prev: '-0.1%', z: null, value: 0.3 }, { ms: 1789682400000, actual: '-0.1%', estimate: '-0.7%', prev: '0.7%', z: 2.36, value: -0.1 },
    { ms: 1787522400000, actual: '0.8%', estimate: '1.0%', prev: '0.5%', z: -0.34, value: 0.8 }, { ms: 1784239200000, actual: '0.6%', estimate: '0.4%', prev: '0.1%', z: 1.01, value: 0.6 }, { ms: 1781474400000, actual: '0.1%', estimate: '0.3%', prev: '0.7%', z: -0.34, value: 0.1 }],
  engine: { score: -0.41, asOf: null, ageDays: null, stale: false, discontinued: null } };
const USD_LAB = { family: 'labour', status: 'surprise', event: 'Non-Farm Employment Change', stale: false, ageDays: 3,
  prints: [{ ms: NOW - 3 * D, actual: '228K', estimate: '137K', prev: '117K', z: 0.6 }, { ms: NOW - 31 * D, actual: '151K', estimate: '159K', z: -0.52 }, { ms: NOW - 60 * D, actual: '143K', estimate: '169K', z: -0.72 }] };
const CAD_CPI = { family: 'cpi', status: 'surprise', event: 'CPI m/m', prints: [{ ms: NOW - 5 * D, actual: '0.9%', estimate: '0.4%', z: 3.37 }, { ms: NOW - 36 * D, actual: '0.2%', estimate: '0.3%', z: -0.67 }] };
const GBP_RET = { family: 'retail', status: 'surprise', event: 'Retail Sales m/m', prints: [{ ms: NOW - 9 * D, actual: '-1.2%', estimate: '0.3%', z: -2.1 }, { ms: NOW - 20 * D, actual: '-0.3%', estimate: '0.1%', z: -0.8 }] };
const BOARD = { ok: true, generatedAt: new Date(NOW).toISOString(), cells: { USD: { labour: USD_LAB }, AUD: { retail: AUD_RETAIL }, CAD: { cpi: CAD_CPI }, GBP: { retail: GBP_RET } }, composite: { USD: { composite: -0.08, factorsScored: 6, factorsTotal: 6 }, GBP: { composite: 1.24 } } };

test('slice length: linear in |z|, continuous, capped at 3 and flagged, NaN safe', () => {
  assert.equal(sliceH(0), H_MIN); assert.ok(Math.abs(sliceH(CAP) - H_MAX) < 1e-12); assert.equal(sliceH(9), H_MAX); assert.equal(sliceH(-9), H_MAX);
  assert.ok(Math.abs((sliceH(2) - sliceH(1)) - (sliceH(1) - sliceH(0))) < 1e-12, 'linear');
  assert.ok(Math.abs(sliceH(CAP - 1e-9) - sliceH(CAP + 1e-9)) < 1e-6, 'no jump at the cap');
  for (let z = 0; z < 4; z += 0.05) assert.ok(sliceH(z + 0.05) >= sliceH(z));
  assert.equal(sliceH(null), H_MIN); assert.equal(sliceH(NaN), H_MIN); assert.equal(sliceH('2'), H_MIN);
  assert.deepEqual(sliceSpec(3.37).capped, true); assert.equal(sliceSpec(-1).dir, -1); assert.equal(sliceSpec(0).dir, 0); assert.equal(sliceSpec(undefined).z, null);
});
test('plate: signed fraction, capped at 1 and flagged', () => {
  assert.deepEqual(plateSpec(-0.5), { score: -0.5, f: 0.5, dir: -1, capped: false });
  assert.equal(plateSpec(1.24).f, 1); assert.equal(plateSpec(1.24).capped, true); assert.equal(plateSpec(null).score, null); assert.equal(plateSpec(NaN).f, 0);
});
test('shapeBoard: real shape -> 64 cells, slices oldest -> newest, missing cells empty, plates', () => {
  const B = shapeBoard(BOARD);
  assert.equal(B.ok, true); assert.equal(Object.keys(B.cells).length, 64); assert.equal(B.asOf, NOW);
  const c = B.cells['AUD|retail']; assert.equal(c.slices.length, 6); assert.equal(c.slices[5].ms, 1794603600000, 'newest last'); assert.equal(c.slices[3].z, 2.36);
  assert.equal(c.slices[5].z, null); assert.equal(c.slices[5].dir, 0); assert.equal(c.engine.score, -0.41); assert.equal(c.row, 4); assert.equal(c.col, 5);
  assert.equal(B.cells['JPY|gdp'].slices.length, 0); assert.equal(B.cells['JPY|gdp'].status, 'none');
  assert.equal(B.cells['CAD|cpi'].slices[1].capped, true);
  assert.equal(B.plates.GBP.capped, true); assert.equal(B.plates.USD.score, -0.08); assert.equal(B.plates.JPY.score, null);
});
test('shapeBoard: error, empty and junk fail soft with a reason', () => {
  for (const b of [null, undefined, { ok: false, error: 'kv' }, {}, { ok: true, cells: 'x' }]) { const B = shapeBoard(b); assert.equal(B.ok, false); assert.ok(B.reason.length > 10); }
  const B = shapeBoard({ ok: true, cells: { USD: { cpi: { prints: [null, { ms: 'x' }] } } } }); assert.equal(B.ok, false); assert.match(B.reason, /no printed/);
});
test('shapeBoard on a board built by buildMacroBoard (end to end)', () => {
  const rows = []; for (let i = 0; i < 20; i++) rows.push({ country: 'US', event: 'CPI y/y', impact: 'high', ms: NOW - (20 - i) * 30 * D, estimate: '3.0%', actual: `${(3 + ((i * 7) % 5 - 2) / 10).toFixed(1)}%`, prev: '3.0%' });
  const B = shapeBoard({ ok: true, ...buildMacroBoard({ rows, now: NOW }), generatedAt: new Date(NOW).toISOString() });
  assert.equal(B.ok, true); assert.equal(B.cells['USD|cpi'].slices.length, 6); assert.ok(B.cells['USD|cpi'].slices.some(s => s.z != null));
  assert.equal(B.cells['USD|cpi'].assumed, true, 'CPI sign is assumed');
});
test('polarity: inverted / claimant known, others assumed', () => {
  assert.equal(assumedPolarity('Unemployment Rate'), false); assert.equal(assumedPolarity('Claimant Count Change'), false); assert.equal(assumedPolarity('CPI y/y'), true); assert.equal(assumedPolarity(null), false);
});
test('extremes: biggest beat and miss in the last 2 weeks; widens when empty', () => {
  const B = shapeBoard(BOARD), X = extremes(B);
  assert.equal(X.days, 14); assert.equal(X.beat.key, 'CAD|cpi'); assert.equal(X.beat.capped, true); assert.equal(X.miss.key, 'GBP|retail'); assert.equal(X.miss.z, -2.1);
  const Y = extremes(B, { now: NOW + 25 * D }); assert.equal(Y.days, 30); assert.equal(Y.beat.key, 'CAD|cpi');
  const Z = extremes(shapeBoard(null)); assert.equal(Z.beat, null); assert.equal(Z.miss, null);
});
test('tilts and leaders', () => {
  const T = tilts(shapeBoard(BOARD)); assert.equal(T.GBP.n, 2); assert.equal(T.GBP.mean, -1.45); assert.equal(T.USD.mean, null, 'one print is not a tilt');
  const L = leaders(T); assert.deepEqual(L.dn, ['GBP']); assert.deepEqual(L.up, []);
});
test('monthGrid: real history shape, family + ccy mapping, claimant flip, contradictory z dropped, gridAt blends', () => {
  const m = ms => ms;
  const hist = { ok: true, generatedAt: new Date(NOW).toISOString(), byCcy: { USD: { assumedPolarity: 0.82 } }, series: {
    'US|cpi y/y': [{ ms: m(NOW - 28 * D), actual: '2.8%', estimate: '2.9%', beat: 'below', z: -0.67 }, { ms: m(NOW - 58 * D), actual: '3.0%', estimate: '2.9%', z: 0.67 }],
    'US|unemployment rate': [{ ms: NOW - 2 * D, actual: '4.2%', estimate: '4.1%', z: -1.35 }],
    'US|non-farm employment change': [{ ms: NOW - 2 * D, actual: '228K', estimate: '137K', z: 0.6 }, { ms: NOW - 3 * D, actual: '100K', estimate: '137K', z: 0.9 } /* contradicts: dropped */],
    'GB|claimant count change': [{ ms: NOW - 5 * D, actual: '44.2K', estimate: '7.9K', z: 1.33 }],
    'DE|german ifo business climate': [{ ms: NOW - 5 * D, actual: '90', estimate: '89', z: 1 }],
    'CN|cpi y/y': [{ ms: NOW - 5 * D, actual: '1', estimate: '0', z: 1 }],
    'US|cpi y/y junk': 'x',
  } };
  const G = monthGrid(hist, { now: NOW });
  assert.equal(G.months.length, 12); assert.equal(G.months[11], '2026-11');
  const nov = G.grid[11]; assert.equal(nov['USD|labour'].n, 2); assert.ok(Math.abs(nov['USD|labour'].z - (-0.375)) < 0.011);
  assert.equal(nov['GBP|labour'].z, -1.33, 'claimant count flipped'); assert.equal(nov['EUR|pmi'], undefined, 'regional release not mapped');
  assert.equal(G.assumed.USD, 0.82); assert.equal(G.assumed.JPY, null);
  assert.ok(G.ccyMean[11].USD != null); assert.equal(G.ccyMean[11].JPY, null);
  const a = gridAt(G, 'USD|cpi', 9), b = gridAt(G, 'USD|cpi', 10), mid = gridAt(G, 'USD|cpi', 9.5);
  assert.equal(a.z, 0.67); assert.equal(b.z, -0.67); assert.ok(Math.abs(mid.z) < 1e-9, 'smooth blend');
  assert.equal(gridAt(G, 'JPY|cpi', 11).h, 0); assert.equal(gridAt(null, 'x', 1).h, 0);
  assert.equal(monthGrid({ series: {} }), null); assert.equal(monthGrid(null), null); assert.equal(monthGrid({ ok: false }), null);
});
test('script: plain words, numbers rounded, description phrase, no forecast words; figure = biggest |z|', () => {
  const B = shapeBoard(BOARD), s = surpriseScript(B);
  assert.match(s, /no economy has had 4 or more prints leaning one way/, 'two UK prints are not a tilt any more'); assert.doesNotMatch(s, /mostly/); assert.match(s, /Canadian inflation, hotter than expected, more than 3 times/); assert.match(s, /UK retail sales, about 2\.1 times/); assert.match(s, /not a forecast/);
  assert.doesNotMatch(s, /\bwill\b|\bexpect(s|ed)? to\b|target/i); assert.ok(s.split(/[.;]\s/).length <= 7);
  assert.deepEqual(surpriseFigure(B), { value: '+>3×', label: 'CAD inflation vs usual surprise' });
  assert.equal(surpriseScript(shapeBoard(null)), null); assert.equal(surpriseFigure(shapeBoard(null)), null);
});
test('labels never overlap and stay in bounds', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: i, x: 600 + (i % 3) * 5, y: 300 + (i % 4) * 3, w: 120, h: 28, pri: i }));
  const P = placeLabels(items, { W: 1280, H: 720, obstacles: [{ x: 580, y: 280, w: 50, h: 50 }] });
  assert.ok(P.length > 3);
  for (const a of P) { assert.ok(a.x >= 0 && a.x + a.w <= 1280 && a.y >= 0 && a.y + a.h <= 720); for (const b of P) if (a !== b) assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)); }
});
test('zText and FAMS', () => {
  assert.equal(zText(1.234), '+1.2'); assert.equal(zText(-0.66), '−0.7'); assert.equal(zText(4, true), '+>3'); assert.equal(zText(null), '—');
  assert.equal(FAMS.length, 8); assert.ok(FAMS.every(f => f.short.length <= 6));
});

test('leadersKN: "k of n beat" with n of 4 or more and a winsorised median, in place of "mostly" (Helix review wave 1.8)', async () => {
  const { leadersKN } = await import('./surpriseHoloCore.js');
  const cell = (ccy, zs) => ({ key: `${ccy}|cpi`, ccy, fam: 'cpi', slices: zs.map((z, i) => ({ z, ms: NOW - (i + 1) * D })) });
  const B = { ok: true, asOf: NOW, ccys: ['EUR', 'GBP', 'USD', 'JPY'], cells: { a: cell('EUR', [0.5, 0.8, 1.1, -0.2, 0.6]), b: cell('GBP', [-9, 0.1, 0.2, 0.15]), c: cell('USD', [-1, -0.8, -0.5, -0.9]), d: cell('JPY', [2, 2, 2]) } };
  const L = leadersKN(B, { now: NOW });
  assert.deepEqual(L.up.map(x => [x.ccy, x.k, x.n]), [['EUR', 4, 5]]);
  assert.deepEqual(L.dn.map(x => [x.ccy, x.k, x.n]), [['USD', 4, 4]]);
  assert.ok(!L.up.concat(L.dn).some(x => x.ccy === 'GBP'), 'one huge miss among small beats: the winsorised median is a beat, not a miss, and 3 of 4 beat with a median under the bar');
  assert.ok(!L.up.some(x => x.ccy === 'JPY'), 'three prints is under n = 4');
  const s = surpriseScript({ ...B, cells: { ...B.cells, e: cell('CAD', [3.5]) } }, { now: NOW });
  assert.match(s, /the euro area beat expectations in 4 of 5 prints, while the US missed in 4 of 4 prints\./); assert.doesNotMatch(s, /mostly/);
});
