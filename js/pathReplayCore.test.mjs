// js/pathReplayCore.test.mjs: the Path replay's pure core, the route and the picture, over synthetic nightly records and 15-minute bars (no network). node --test js/pathReplayCore.test.mjs
// Proves: a record is in force only from its capture session (never before), the expiries count down night by night and an expired one's FINAL level moves into the past, the
// closest approach counts only price from the moment the level existed (and is in sigma and expected-move units), the mirror is scored on the same bars, the tally has Wilson
// intervals and a small-sample warning, the words describe and never advise, the picture uses tokens only, and the route is read-only. It does NOT prove the look (see the screenshots).
import test from 'node:test';
import assert from 'node:assert/strict';
import { inForce, recAt, closest, units, stateAt, tally, tallySentence, makeFrames, priceRange, captionFor, coverage, ANCHORS, STEP, DAYMS } from './pathReplayCore.js';
import { pathStage } from './terminal/pathReplayDraw.js';
import { mountPathReplay } from './pathReplayRoutes.js';

const D0 = Date.parse('2026-11-09T00:00:00Z');
const dayStr = n => new Date(D0 + n * DAYMS).toISOString().slice(0, 10);
/** 6 nightly records (days 0..5): expiries at day 1, 3, 5, 9, 20 with a level that drifts a little each night; close 1000, vol 1% per session. */
function records() {
  const exp = [1, 3, 5, 9, 20], out = [];
  for (let n = 0; n < 6; n++) out.push({ captureDate: dayStr(n), closeDate: dayStr(n - 1), close: 1000, vol: 0.01, walks: { gammaCentre: exp.filter(e => e >= n).map(e => [dayStr(e), e - n, 1000 + e * 2 + n, 0.7]) } });
  return out;
}
/** 15-minute bars across days 0..6 whose price oscillates around 1000 within +-5. */
function bars(f = i => 1000 + Math.sin(i / 20) * 5) { const b = []; for (let i = 0; i < 96 * 7; i++) { const c = f(i); b.push([D0 + i * STEP, c, c + 0.4, c - 0.4, c]); } return b; }

test('a record is in force from its capture session, never before', () => {
  const r = records(); assert.equal(inForce(r[2]), Date.parse(`${dayStr(2)}T08:00:00Z`));
  assert.equal(recAt(r, Date.parse(`${dayStr(2)}T07:59:00Z`)), 1); assert.equal(recAt(r, Date.parse(`${dayStr(2)}T08:00:00Z`)), 2); assert.equal(recAt(r, D0 - 1), -1);
});

test('closest approach counts only bars from the moment the level existed, and a touch is distance zero', () => {
  const b = bars(i => 1000 + (i === 10 ? 20 : 0)), level = 1020;
  assert.equal(closest(b, level, D0 + 11 * STEP, D0 + 50 * STEP).touched, false, 'the spike at bar 10 is before the level existed: not counted');
  assert.ok(closest(b, level, D0 + 11 * STEP, D0 + 50 * STEP).dist > 15);
  const t = closest(b, level, D0, D0 + 50 * STEP); assert.equal(t.touched, true); assert.equal(t.dist, 0); assert.equal(closest(b, level, D0 + 1e12, D0 + 2e12), null);
});

test('units: distance in session sigma and in expected moves to the expiry', () => {
  const u = units(10, { close: 1000, vol: 0.01 }, 7); assert.equal(u.sigma, 1);
  assert.ok(Math.abs(u.em - 1 / Math.sqrt(5)) < 1e-9, 'seven days is five sessions: sqrt(5) sigma'); assert.equal(units(10, { close: 1000, vol: 0 }, 7).sigma, null);
});

test('stateAt: expiries count down night by night; an expired one moves into the past with its FINAL level; ghosts are earlier nights', () => {
  const r = records(), b = bars();
  const s1 = stateAt(r, b, 'gammaCentre', Date.parse(`${dayStr(1)}T12:00:00Z`));
  assert.deepEqual(s1.live.map(l => l.dte), [0, 2, 4, 8, 19]); assert.equal(s1.past.length, 0);
  const s2 = stateAt(r, b, 'gammaCentre', Date.parse(`${dayStr(2)}T12:00:00Z`));
  assert.deepEqual(s2.live.map(l => l.dte), [1, 3, 7, 18]); assert.equal(s2.past.length, 1); assert.equal(s2.past[0].ago, 1); assert.equal(s2.past[0].px, 1000 + 1 * 2 + 1, 'the final level is the last night it was on a record (day 1)');
  const e3 = s2.live.find(l => l.dte === 3); assert.equal(e3.px, 1000 + 5 * 2 + 2); assert.equal(e3.ghosts.length, 2); assert.deepEqual(e3.ghosts, [1000 + 10 + 1, 1000 + 10 + 0], 'newest ghost first');
  const s5 = stateAt(r, b, 'gammaCentre', Date.parse(`${dayStr(5)}T12:00:00Z`)); assert.ok(s5.past.length >= 2); assert.ok(s5.past.every((p, i, a) => !i || a[i - 1].ago <= p.ago), 'newest expired first');
});

test('the past shows an expiry for seven days only, and the mirror is scored on the same bars', () => {
  const r = records(), b = bars(i => 1000), s = stateAt(r, b, 'gammaCentre', Date.parse(`${dayStr(5)}T12:00:00Z`)), p1 = s.past.find(x => x.expiry === dayStr(1));
  assert.equal(p1.ago, 4); assert.ok(p1.closest && p1.mirror); assert.equal(p1.closest.touched, false, 'price sat at 1000 and the level was 1003'); assert.ok(p1.closest.dist > 2);
  const far = stateAt(r, b, 'gammaCentre', Date.parse(`${dayStr(6)}T20:00:00Z`)); assert.ok(far.past.every(x => x.ago <= 7));
});

test('the tally: real final levels against the same distance mirrored, Wilson intervals, overlap flag, a small-sample warning', () => {
  const r = records(), b = bars(i => 1000), t = tally(r, b, 'gammaCentre');
  assert.ok(t.n >= 3 && t.enough === false); assert.equal(t.real.k, 0); assert.equal(t.mirror.k, 0); assert.ok(t.overlap);
  const off = records().map(x => ({ ...x, walks: { gammaCentre: x.walks.gammaCentre.map(p => [p[0], p[1], 1004, p[3]]) } })), t3 = tally(off, bars(() => 1004), 'gammaCentre');
  assert.equal(t3.real.k, t3.n); assert.equal(t3.mirror.k, 0, 'the mirror, 4 below the close, is never reached'); assert.equal(t3.overlap, true, 'with so few expiries the intervals cannot separate');
  const w = tallySentence(t); assert.match(w, /very small sample/); assert.match(w, /not independent/); assert.match(tallySentence({ n: 0 }), /No expiry has expired/);
});

test('frames start at the first record in force; the picture range is fixed for the replay; coverage says the nights held', () => {
  const r = records(), b = bars(), f = makeFrames(r, b); assert.ok(f.length > 96 * 5); assert.ok(f[0].t >= inForce(r[0])); assert.equal(f.at(-1).t, b.at(-1)[0] + STEP); assert.deepEqual(makeFrames([], b), []);
  const pr = priceRange(r, b, 'gammaCentre'); assert.ok(pr.lo < 996 && pr.hi > 1004, 'the range covers the price path with a margin'); const c = coverage(r, b); assert.equal(c.nights, 6); assert.equal(c.from, dayStr(0));
  assert.equal(ANCHORS[0].v, 'gammaCentre', 'the Path card default first');
});

test('words describe, never advise', () => {
  const r = records(), b = bars(), ts = Date.parse(`${dayStr(4)}T12:00:00Z`), st = stateAt(r, b, 'gammaCentre', ts), cap = captionFor(st, ts, 1001.2, { label: 'Gold', dp: 1, anchorLabel: 'gamma centre' });
  assert.match(cap, /nearest live gamma centre/); assert.match(cap, /ended \d+ days? ago/); assert.match(cap, /not where it will go/); assert.doesNotMatch(cap, /\b(buy|sell|long|short|entry|target|stop|signal|will (rise|fall|reach|hit))\b/i);
  assert.match(captionFor(null, ts, 1, {}), /no nightly record/);
});

test('the picture: tokens only, live markers with days left, past levels with -Nd labels, the table; reduced motion drops the glow', () => {
  const r = records(), b = bars(), frames = makeFrames(r, b), extra = { records: r, bars: b, anchor: 'gammaCentre', anchorLabel: 'gamma centre', verdict: 'UNDERPOWERED', range: priceRange(r, b, 'gammaCentre'), dp: 1, label: 'Gold', tallyText: 'x', evChips: [] };
  const k = frames.findIndex(f => f.t >= Date.parse(`${dayStr(4)}T12:00:00Z`)), svg = pathStage(frames, k, extra, {});
  assert.match(svg, /^<svg class="rpv-svg oit-svg"/); assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(svg.replace(/&#\d+;/g, '')), 'no hex colours'); assert.match(svg, />\d+d<\/text>/); assert.match(svg, />−\d+d<\/text>/); assert.match(svg, />now<\/text>/); assert.match(svg, /<table class="oit-tbl">/);
  assert.match(svg, /Evidence Book/); assert.doesNotMatch(pathStage(frames, k, extra, { reduced: true }), /<(circle|path)[^>]*filter=/);
  assert.notEqual(svg, pathStage(frames, k + 40, extra, {})); assert.ok(!/<script|<img/.test(pathStage(frames, k, { ...extra, label: '<img src=x>', tallyText: '<script>' }, {})));
});

test('route: serves one record per session with the bars, refuses markets the Path card does not cover, writes nothing', async () => {
  const routes = {}, app = { get(p, f) { routes[p] = f; } }, r = records(), raw = [...r, { ...r[5], captureDate: dayStr(6), closeDate: r[5].closeDate }];
  const candles = bars().map(x => ({ t: x[0] / 1000, open: String(x[1]), high: String(x[2]), low: String(x[3]), close: String(x[4]) }));
  let asked = null; mountPathReplay(app, { fetchRange: async (s, g) => { asked = { s, g }; return candles; }, walkHistory: async () => raw, now: () => D0 + 7 * DAYMS });
  const call = async q => { let status = 200, body = null; await routes['/api/replay/path-days']({ query: q }, { headersSent: false, set() {}, status(c) { status = c; return this; }, json(b) { body = b; this.headersSent = true; return this; } }); return { status, body }; };
  const ok = await call({ inst: 'gold' }); assert.equal(ok.status, 200); assert.equal(ok.body.count, 6, 'the same session saved twice counts once'); assert.equal(ok.body.records.at(-1).captureDate, dayStr(6)); assert.equal(asked.g, 'M15'); assert.equal(asked.s, 'XAU_USD'); assert.ok(ok.body.bars.length > 600);
  assert.equal((await call({ inst: 'US30' })).status, 400); assert.equal((await call({ inst: 'zzz' })).status, 400);
  const e = {}; mountPathReplay({ get(p, f) { e[p] = f; } }, { fetchRange: async () => [], walkHistory: async () => [], now: () => 0 }); let b2 = null; await e['/api/replay/path-days']({ query: { inst: 'NQ' } }, { headersSent: false, set() {}, status() { return this; }, json(b) { b2 = b; } }); assert.equal(b2.count, 0); assert.match(b2.error, /no nightly path records/);
});
