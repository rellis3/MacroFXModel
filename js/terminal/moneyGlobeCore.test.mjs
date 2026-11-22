// Tests for js/terminal/moneyGlobeCore.js (the MONEY GLOBE's pure part). Run: node js/terminal/moneyGlobeCore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldRates } from '../worldRates.js';
import * as M from './moneyGlobeCore.js';

// a small world-rates answer built by the real builder, like the server does
const months = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.UTC(2025, 8 + i, 1)); return d.toISOString().slice(0, 7); });   // 2025-09 .. 2026-10
const path = (r12, r3, r0) => months.map((p, i) => ({ period: p, rate: i < 10 ? r12 : i < 13 ? r3 : r0 }));
const wr = worldRates({ US: path(4.25, 4.0, 3.5), JP: path(0.5, 0.5, 0.75), CH: path(0, 0, 0), XM: path(2, 2, 2), TR: path(40.5, 39.5, 35), BR: path(15, 15, 14.25), MX: path(7.5, 7.25, 6.75), GB: path(4, 3.75, 3.75), ZZ: path(1, 1, 1) });
const RATES = { ok: true, ...wr };
const CREDIT = {
  ok: true, latest: '2026-Q2', firstSeen: '2026-10-28', headline: { usdG: 5.3, usdGPrev: 5.0, usdStockBn: 15000, regime: 'normal' },
  parents: [{ code: 'US', name: 'United States', usdBn: 3504, usdBn5yAgo: 2872 }, { code: 'CN', name: 'China', usdBn: 774, usdBn5yAgo: 856 }, { code: 'XX', name: 'Nowhere', usdBn: 5 }],
  usdBorrowers: [{ code: 'US', name: 'United States', stockBn: 7505, flow4qBn: 513.1, flowQBn: 140, g: 7.3, gPrev: 7.0 }, { code: 'CN', name: 'China', stockBn: 316, flow4qBn: -21.7, g: -6.4 },
    { code: 'KY', name: 'Cayman Islands', stockBn: 2734, flow4qBn: null, g: 12.6 }],
};

test('pillar height is linear on one shared scale, capped and marked above RATE_CAP', () => {
  assert.equal(M.pillarHeight(10).h, M.PILLAR_MAX / 2);
  assert.ok(Math.abs(M.pillarHeight(5).h * 2 - M.pillarHeight(10).h) < 1e-12);
  const tr = M.pillarHeight(35); assert.equal(tr.h, M.PILLAR_MAX); assert.equal(tr.capped, true);
  assert.equal(M.pillarHeight(20).capped, false);
  assert.equal(M.pillarHeight(0).h, M.PILLAR_STUB); assert.equal(M.pillarHeight(-0.5).below, true);
  assert.equal(M.pillarHeight(NaN).missing, true); assert.equal(M.pillarHeight(null).h, 0);
});
test('ring AREA is proportional to the 12-month change, capped at RING_CAP', () => {
  const a = M.ringRadius(1).r, b = M.ringRadius(-4).r;
  assert.ok(Math.abs((b * b) / (a * a) - 4) < 1e-9);
  assert.equal(M.ringRadius(-4).sign, -1); assert.equal(M.ringRadius(9).capped, true); assert.equal(M.ringRadius(9).r, M.RING_MAX);
  assert.equal(M.ringRadius(0.01).r, 0); assert.equal(M.ringRadius(undefined).r, 0);
});
test('tone follows the worldRates +-0.2 pp rule', () => {
  assert.equal(M.toneOf(0.25), 'up'); assert.equal(M.toneOf(-0.2), 'dn'); assert.equal(M.toneOf(0.1), 'flat'); assert.equal(M.toneOf(null), 'none');
});
test('ratesModel parses the real /api/world-rates shape', () => {
  const m = M.ratesModel(RATES);
  assert.equal(m.ok, true); assert.equal(m.asOf, '2026-10');
  assert.ok(!m.by.ZZ, 'an area with no place is skipped');
  assert.equal(m.by.US.tone, 'dn'); assert.equal(m.by.JP.tone, 'up'); assert.equal(m.by.CH.tone, 'flat');
  assert.equal(m.by.TR.capped, true); assert.deepEqual(m.capped, ['TR']);
  assert.deepEqual(m.by.US.move, { period: '2026-10', by: -0.5 });
  assert.equal(m.by.XM.place, 'Frankfurt');
  assert.equal(m.summary.hiking, 1); assert.equal(m.summary.cutting, 4); assert.equal(m.summary.n, 8);
});
test('ratesModel fails soft', () => {
  for (const j of [null, {}, { ok: false, error: 'BIS HTTP 502' }, { ok: true, banks: {} }, { ok: true, banks: { US: { area: 'US', rate: 'x' } } }]) { const m = M.ratesModel(j); assert.equal(m.ok, false); assert.equal(typeof m.why, 'string'); assert.deepEqual(m.banks, []); }
  assert.match(M.ratesModel({ ok: false, error: 'BIS HTTP 502' }).why, /502/);
});
test('stale banks are drawn but left out of the counts and labels', () => {
  const j = structuredClone(RATES); j.banks.MX.stale = true; const m = M.ratesModel(j);
  assert.equal(m.by.MX.tone, 'stale'); assert.equal(m.summary.n, 7); assert.equal(m.summary.stale, 1);
  assert.ok(!M.rateLabels(m).includes('MX'));
});
test('labels: G10 first, then the biggest non-G10 movers, selection on top', () => {
  const m = M.ratesModel(RATES), l = M.rateLabels(m, { sel: 'BR' });
  assert.equal(l[0], 'BR'); assert.ok(l.includes('US') && l.includes('TR'));
  assert.ok(M.rateLabels(m, { compact: true }).length <= 8);
});
test('placeLabels never overlaps', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: i, x: 100, y: 100, w: 80, h: 24, pri: i }));
  const out = M.placeLabels(items, { W: 400, H: 400 });
  for (const a of out) for (const b of out) if (a !== b) assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y));
  assert.ok(out.length >= 5);
  assert.deepEqual(M.placeLabels([{ id: 1, x: NaN, y: 0, w: 1, h: 1 }]), []);
});
test('creditModel: lenders and borrowers are separate totals, flow sets direction', () => {
  const c = M.creditModel(CREDIT);
  assert.equal(c.ok, true); assert.equal(c.quarter, '2026-Q2'); assert.equal(c.regime, 'normal'); assert.equal(c.denom, 'USD');
  assert.deepEqual(c.lenders.map(l => l.code), ['US', 'CN']);
  assert.equal(c.lenders[1].dir, 'back'); assert.ok(c.lenders[0].g5 > 4 && c.lenders[0].g5 < 4.1);
  assert.equal(c.lenders[0].w, 7);
  const by = Object.fromEntries(c.borrowers.map(b => [b.code, b]));
  assert.equal(by.US.dir, 'in'); assert.equal(by.CN.dir, 'out'); assert.equal(by.KY.dir, 'in', 'no flow: the growth sign decides');
  assert.equal(c.biggestIn.code, 'US'); assert.equal(c.biggestOut.code, 'CN');
  assert.ok(by.US.w > by.CN.w); assert.equal(by.KY.w, 1.2);
});
test('creditModel: regime from bankCredit.regimeOf, fallbacks and failures', () => {
  assert.equal(M.creditModel({ ...CREDIT, headline: { usdG: 9 } }).regime, 'fast');
  assert.equal(M.creditModel({ ...CREDIT, headline: { usdG: -1 } }).regime, 'contracting');
  const allCcy = M.creditModel({ ...CREDIT, usdBorrowers: [], borrowers: CREDIT.usdBorrowers }); assert.equal(allCcy.denom, 'all currencies'); assert.equal(allCcy.borrowers.length, 3);
  for (const j of [null, { ok: false, error: 'bank credit not built yet' }, { ok: true }, { ok: true, headline: {}, parents: [], usdBorrowers: [] }]) assert.equal(M.creditModel(j).ok, false);
});
test('gapsModel: lowest-rate funders to the highest-rate targets, gap in pp, capped and marked', () => {
  const g = M.gapsModel(M.ratesModel(RATES));
  assert.equal(g.ok, true);
  assert.deepEqual(g.funders.map(f => f.area), ['CH', 'JP']);
  assert.equal(g.targets[0].area, 'TR'); assert.ok(!g.targets.some(t => t.area === 'CH'));
  const w = g.arcs[0]; assert.equal(w.id, 'CH>TR'); assert.equal(w.gap, 35); assert.equal(w.capped, true);
  const br = g.arcs.find(a => a.id === 'CH>BR'), mx = g.arcs.find(a => a.id === 'CH>MX');
  assert.ok(Math.abs((br.w - 1) / (mx.w - 1) - 14.25 / 6.75) < 1e-9, 'width linear in the gap');
  assert.equal(M.gapsModel({ ok: false }).ok, false);
});
test('geometry: pool arcs start on the globe and end on the pool ring; gap arcs lift off the sphere', () => {
  const { a, b } = M.poolArc(51.5, -0.1); assert.ok(Math.abs(Math.hypot(...a) - 1.005) < 1e-9); assert.equal(b[1], M.POOL_Y); assert.ok(Math.abs(Math.hypot(b[0], b[2]) - M.POOL_R) < 1e-9);
  const arc = M.gapArc(35.7, 139.7, -15.8, -47.9, 20); assert.equal(arc.length, 21); assert.ok(Math.hypot(...arc[10]) > 1.2); assert.ok(Math.abs(Math.hypot(...arc[0]) - 1.006) < 1e-9);
  assert.deepEqual(M.bez([0, 0, 0].map(x => x), [1, 1, 1].map(x => x), [2, 0, 0].map(x => x), 0.5), [1, 0.5, 0.5]);
  assert.ok(Math.abs(M.angDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9);
});
test('cards carry the numbers and say what is not published', () => {
  const rm = M.ratesModel(RATES), cm = M.creditModel(CREDIT);
  const b = M.cardFor('bank', 'TR', { rates: rm }); assert.match(b.lines[0][1], /capped/); assert.match(b.lines[3][1], /October 2026/);
  assert.match(M.cardFor('lender', 'US', { credit: cm }).foot, /not published/);
  assert.match(M.cardFor('borrower', 'CN', { credit: cm }).lines[1][1], /−\$22bn/);
  assert.equal(M.cardFor('bank', 'QQ', { rates: rm }), null); assert.equal(M.cardFor('x', 'US', {}), null);
});
test('SHOW script: counts, notable moves, BIS pace, inflow and outflow; no forecast words', () => {
  const rm = M.ratesModel(RATES), cm = M.creditModel(CREDIT), t = M.moneyScript(rm, cm);
  assert.match(t, /over three months 4 of 8 central banks have cut and 1 has hiked/); assert.match(t, /Turkey's, 4.5 points to 35 percent/); assert.match(t, /Japan hiked 0.25 points/);
  assert.match(t, /second quarter of 2026/); assert.match(t, /5.3 percent a year, a normal pace/); assert.match(t, /United States, 513 billion dollars/); assert.match(t, /from China, 22 billion/);
  assert.doesNotMatch(t, /\b(will|expect|target)\b/i);
  assert.equal(M.moneyScript(null, null), null);
  assert.match(M.moneyScript(null, cm), /^BIS bank data/);
  assert.deepEqual(M.moneyFigure(rm, cm), { value: '4', label: 'of 8 central banks cut over 3 months' });
  assert.equal(M.moneyFigure({ ok: false }, cm).value, '+5.3%');
  const s = M.showStops(rm, cm); assert.deepEqual(s.map(x => `${x.layer}:${x.code}`), ['rates:TR', 'rates:JP', 'rates:US', 'credit:US', 'credit:CN']);
  assert.equal(M.stopAt(5, 0), 0); assert.equal(M.stopAt(5, 1), 4); assert.equal(M.stopAt(0, 0.5), -1);
});
