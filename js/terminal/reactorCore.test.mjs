// Tests for reactorCore.js (the CHAIN REACTOR's layout, scaling and selection). Run: node js/terminal/reactorCore.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { evaluateChain, summariseChain, CHAIN_NODES } from '../macroChain.js';
import { buildGraph, THEME_ORDER } from './jarvisCore.js';
import { ringLayout, barSpec, barHeight, bars, pickLabels, placeLabels, linkStyles, arcPoints, storyStops, storyAt, pulseRate, readout, reactorScript, spokenLink, yawFacing, angDiff, midAngle, plainName, BAR_MAX, BAR_MIN, CAP } from './reactorCore.js';

// a realistic chain: the real judge over hand-made 20-day moves (crack missing)
const D = { oil: 7.4, bei: 3, us2y: 11, us30y: 21, us10y: 16, real: 14, dxy: -0.9, gold: 5.1, copper: 4.2, audusd: 1.7, usdcad: -1.2, usdjpy: -1.6, vix: 4.6, hy: 31, nq: -4.6, spx: -1.1, funding: 2, smh: -16.5, xle: 5.8, xlre: -4.1, move: 14, ccc: 95, emdollar: -0.4, emoas: 6, giltgap: 4, bundgap: 13, jgbgap: 9, gbpusd: 0.4, eurusd: 1.3, btc: -13.2 };
const links = evaluateChain(Object.fromEntries(Object.entries(D).map(([k, d]) => [k, { delta: d }])));
const G = buildGraph(links), SUM = summariseChain(links), LAY = ringLayout(G.nodes.map(n => n.key));
const names = Object.fromEntries(Object.entries(CHAIN_NODES).map(([k, n]) => [k, plainName(n.label)]));

test('ring: seven sectors in theme order, every market a slot, slots inside their sector, increasing angle', () => {
  assert.deepEqual(LAY.sectors.map(s => s.name), THEME_ORDER);
  assert.equal(Object.keys(LAY.slots).length, G.nodes.length);
  for (const s of LAY.sectors) for (const k of s.keys) { const a = LAY.slots[k].angle; assert.ok(a > s.a0 && a < s.a1, k); }
  const angs = Object.values(LAY.slots).sort((a, b) => a.i - b.i).map(s => s.angle); for (let i = 1; i < angs.length; i++) assert.ok(angs[i] > angs[i - 1]);
  assert.ok(angs[angs.length - 1] - angs[0] < Math.PI * 2);
  assert.equal(LAY.slots.oil.sector, 'Energy'); assert.equal(LAY.slots.gold.sector, 'Metals and crypto');
});
test('ring: unknown keys go to Other, junk and duplicates ignored, empty is empty', () => {
  const r = ringLayout(['oil', 'zzz', 'oil', null, 7]); assert.deepEqual(r.sectors.map(s => s.name), ['Energy', 'Other']); assert.equal(Object.keys(r.slots).length, 2);
  const e = ringLayout([]); assert.deepEqual(e.sectors, []); assert.deepEqual(e.slots, {}); assert.deepEqual(ringLayout(undefined).sectors, []);
});
test('bar height: linear in the ratio, continuous, capped at 3x and flagged', () => {
  assert.equal(barHeight(0), BAR_MIN); assert.ok(Math.abs(barHeight(CAP) - BAR_MAX) < 1e-12); assert.equal(barHeight(9), BAR_MAX);
  assert.ok(Math.abs((barHeight(2) - barHeight(1)) - (barHeight(1) - barHeight(0))) < 1e-12, 'linear');
  assert.ok(Math.abs(barHeight(3 - 1e-9) - barHeight(3 + 1e-9)) < 1e-6, 'no jump at the cap');
  for (let r = 0; r < 3.5; r += 0.05) assert.ok(barHeight(r + 0.05) >= barHeight(r));
  const smh = barSpec(G.nodes.find(n => n.key === 'smh')); assert.ok(smh.capped); assert.equal(smh.h, BAR_MAX); assert.equal(smh.dir, 'down');
  const gold = barSpec(G.nodes.find(n => n.key === 'gold')); assert.ok(!gold.capped); assert.ok(Math.abs(gold.ratio - 5.1 / 2) < 1e-9); assert.equal(gold.tone, 'wrong');
});
test('bar: missing, NaN, zero floor and empty nodes fail soft', () => {
  const crack = barSpec(G.nodes.find(n => n.key === 'crack')); assert.ok(crack.missing); assert.equal(crack.h, 0); assert.equal(crack.tone, 'none');
  assert.ok(barSpec({ key: 'x', end: { delta: NaN, floor: 1 } }).missing); assert.ok(barSpec({ key: 'x', end: { delta: 1, floor: 0 } }).missing); assert.ok(barSpec(null).missing);
  assert.equal(barSpec({ key: 'x', end: { delta: 0, floor: 1 } }).dir, null); assert.deepEqual(bars(null), {});
});
test('labels: top n by ratio among moved markets, then the selection and its partners', () => {
  const B = bars(G), L = pickLabels(B, { n: 4 }); assert.equal(L.length, 4); assert.equal(L[0], 'smh');
  for (let i = 1; i < L.length; i++) assert.ok(B[L[i - 1]].ratio >= B[L[i]].ratio);
  assert.ok(L.every(k => B[k].moved || B[k].tone === 'wrong'));
  const S = pickLabels(B, { n: 2, sel: 'spx', partners: ['real', 'hy'] }); assert.deepEqual(S.slice(2), ['spx', 'real', 'hy']);
  assert.deepEqual(pickLabels({}, { n: 5 }), []); assert.deepEqual(pickLabels(B, { n: 0, sel: 'nope' }), []);
});
test('label placement: nothing overlaps, everything inside the screen, obstacles respected, lower priority dropped when full', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: 'k' + i, x: 600, y: 300, w: 90, h: 28, pri: 12 - i, side: 1 }));
  const P = placeLabels(items, { W: 1280, H: 720, obstacles: [{ x: 590, y: 300, w: 40, h: 20 }] });
  assert.ok(P.length >= 4, String(P.length));
  const all = [...P, { x: 590, y: 300, w: 40, h: 20 }];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const a = all[i], b = all[j]; assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), `${a.id} vs ${b.id}`); }
  for (const r of P) assert.ok(r.x >= 0 && r.x + r.w <= 1280 && r.y >= 0 && r.y + r.h <= 720);
  assert.equal(P[0].id, 'k0'); assert.equal(placeLabels(items, { W: 100, H: 20 }).length, 0);
  assert.equal(placeLabels([{ id: 'n', x: NaN, y: 1, w: 1, h: 1 }]).length, 0);
});
test('links: quiet hidden by default, shown faintly with ALL LINKS; a selection lights its own and dims the rest', () => {
  const D0 = linkStyles(G.edges), by = id => D0.find(x => x.id === id);
  assert.equal(by('real-gold').kind, 'broken'); assert.ok(by('real-gold').show); assert.equal(by('real-gold').a, 1);
  assert.ok(by('us10y-real').show); assert.ok(by('us10y-real').a < 1);
  assert.equal(by('oil-bei').show, false); assert.equal(by('crack-bei').kind, 'quiet'); assert.equal(by('crack-bei').show, false);
  const A = linkStyles(G.edges, { showAll: true }); assert.ok(A.every(x => x.show)); assert.ok(A.find(x => x.id === 'oil-bei').a < 0.3);
  const S = linkStyles(G.edges, { sel: 'gold' }); for (const s of S) { const e = G.edges.find(x => x.id === s.id); if (e.from === 'gold' || e.to === 'gold') assert.ok(s.mine && s.a >= 0.45 && s.show); else assert.ok(s.a <= 0.12); }
  assert.deepEqual(linkStyles(null), []);
});
test('arc: starts and ends on the ring, rises over the middle, longer chords rise higher', () => {
  const a = arcPoints(0, Math.PI, { n: 21 }), b = arcPoints(0, 0.3, { n: 21 });
  assert.equal(a.pts.length, 21); assert.ok(Math.abs(a.pts[0][1]) < 1e-12 && Math.abs(a.pts[20][1]) < 1e-12);
  assert.ok(a.pts[10][1] > b.pts[10][1]); assert.ok(Math.hypot(a.pts[10][0], a.pts[10][2]) < 0.2);
  assert.ok(Math.abs(Math.hypot(a.pts[0][0], a.pts[0][2]) - Math.hypot(a.pts[20][0], a.pts[20][2])) < 1e-9);
});
test('angles: facing yaw, shortest difference, middle of two angles', () => {
  const yaw = yawFacing(0.4); assert.ok(Math.abs(Math.sin(yaw) - Math.cos(0.4)) < 1e-12 && Math.abs(Math.cos(yaw) - Math.sin(0.4)) < 1e-12);
  assert.ok(Math.abs(angDiff(0.1, Math.PI * 2 - 0.1) + 0.2) < 1e-12); assert.ok(Math.abs(angDiff(3, -3) - (Math.PI * 2 - 6)) < 1e-12);
  assert.ok(Math.abs(midAngle(0.2, 0.6) - 0.4) < 1e-12); assert.ok(Number.isFinite(midAngle(0, Math.PI)));
});
test('story: the broken links, biggest combined move first, each with its words; progress maps to stops', () => {
  const S = storyStops(G, LAY, names); assert.deepEqual(S.map(s => s.id).sort(), [...SUM.brokenIds].sort());
  for (let i = 1; i < S.length; i++) assert.ok(S[i - 1].weight >= S[i].weight);
  assert.ok(S.every(s => s.textbook && s.fromText && s.toText && Number.isFinite(s.yaw)));
  assert.deepEqual(storyStops({ edges: [] }, LAY), []); assert.deepEqual(storyStops(null, null), []);
  assert.equal(storyAt(3, 0).i, -1); assert.equal(storyAt(3, 0.5).i, 1); assert.equal(storyAt(3, 1).i, 2); assert.equal(storyAt(0, 0.7).i, -1); assert.equal(storyAt(3, NaN).i, -1);
  let last = -2; for (let p = 0; p <= 1; p += 0.01) { const s = storyAt(3, p); assert.ok(s.i >= last); last = s.i; assert.ok(s.f >= 0 && s.f <= 1); }
});
test('core pulse and readout', () => {
  assert.ok(pulseRate(0) > 0); assert.ok(pulseRate(3) > pulseRate(1)); assert.equal(pulseRate(50), pulseRate(6)); assert.equal(pulseRate(undefined), pulseRate(0));
  const B = bars(G), m = Object.values(B).filter(b => b.moved).length; assert.equal(readout(SUM, B), `3 links broken · ${m} markets beyond their noise`);
  assert.equal(readout({ broken: 1 }, { a: { moved: true } }), '1 link broken · 1 market beyond its noise'); assert.equal(readout(null, null), '0 links broken · 0 markets beyond their noise');
});
test('script: names the broken links in plain words, 2-4 sentences, says description, never a forecast word', () => {
  const B = bars(G), t = reactorScript(SUM, storyStops(G, LAY, names), B, names);
  assert.match(t, /Three of 22 testable links are broken/); assert.match(t, /real yields to gold/); assert.match(t, /dollar to bitcoin/); assert.match(t, /not a forecast/);
  assert.match(t, /Semiconductors at 3\.3 times/); assert.doesNotMatch(t, /→|\bwill\b|expect|target/i);
  const n = t.split(/(?<=\.)\s+/).length; assert.ok(n >= 2 && n <= 4, t);
  assert.match(reactorScript({ broken: 0, holding: 5, judged: 5 }, [], {}), /All 5 testable links are holding/);
  assert.equal(reactorScript(null, [], {}), null);
  assert.equal(spokenLink('funding → $'), 'funding to the dollar'); assert.equal(spokenLink('dollar → USD/JPY'), 'dollar to dollar yen'); assert.equal(spokenLink('10Y yield → property stocks'), 'ten-year yield to property stocks');
  assert.equal(plainName('Fear gauge (VIX)'), 'the fear gauge'); assert.equal(plainName('Gold'), 'Gold');
});

test('adaptive noise floors beside the fixed ones: flagged where the fixed floor is under half the node\'s own usual 20-session move (Helix review wave 1.5)', async () => {
  const { adaptiveFloors, floorLine, reactorScript } = await import('./reactorCore.js');
  const n = 300;
  // us2y swings ~1 percentage point (100 bp) over 20 sessions against a fixed floor of 8 bp; gold barely moves against its 2% floor
  const drill = { dates: [], series: { us2y: Array.from({ length: n }, (_, i) => 4 + (Math.floor(i / 20) % 2 ? 1 : 0)), gold: Array.from({ length: n }, (_, i) => 2000 * (1 + 0.001 * (i % 2))) } };
  const af = adaptiveFloors(drill, { us2y: { unit: 'bp', floor: 8 }, gold: { unit: 'pct', floor: 2 }, oil: { unit: 'pct', floor: 3 } });
  assert.equal(af.us2y.low, true); assert.ok(af.us2y.adaptive > 16, JSON.stringify(af.us2y)); assert.equal(af.gold.low, false); assert.equal(af.oil, undefined, 'no series, no adaptive floor');
  assert.match(floorLine(af, { us2y: 'the two-year yield' }), /^Against each market's own history, the fixed noise floor is under half its usual twenty-day move for the two-year yield, so it reads as moved more easily than its history alone would say\.$/);
  assert.equal(floorLine({ gold: af.gold }), null);
  const s = reactorScript({ broken: 0, judged: 3 }, [], {}, { us2y: 'the two-year yield' }, af);
  assert.match(s, /fixed noise floor is under half.*A description of the window, not a forecast\.$/);
  assert.doesNotMatch(reactorScript({ broken: 0, judged: 3 }, [], {}, {}), /noise floor/, 'without floors the line is as before');
});
