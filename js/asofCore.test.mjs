// js/asofCore.test.mjs: the pure rules of the as-of clock. node --test js/asofCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from './asofCore.js';

const T = s => Date.parse(s);

test('the address: ?asof= and #asof= read the same way; a date alone is 12:00 UTC; rubbish is null', () => {
  const t = T('2026-11-12T14:30:00Z');
  assert.equal(C.parseAsof('?asof=2026-11-12T14:30Z', ''), t);
  assert.equal(C.parseAsof('', '#asof=2026-11-12T14:30Z'), t);
  assert.equal(C.parseAsof('?x=1&asof=2026-11-12T14:30Z', '#pair=GOLD'), t);
  assert.equal(C.parseAsof('?asof=2026-11-12', ''), T('2026-11-12T12:00:00Z'));
  assert.equal(C.parseAsof('?asof=2026-11-12 14:30', ''), t);
  assert.equal(C.parseAsof('?asof=' + t, ''), t);
  for (const bad of ['?asof=', '?asof=yesterday', '?asof=1999-01-01', '?asof=2026-13-45', '']) assert.equal(C.parseAsof(bad, ''), null, bad);
  assert.equal(C.formatAsofParam(t), '2026-11-12T14:30Z');
  assert.equal(C.parseAsofValue(C.formatAsofParam(t)), t, 'round trip');
  assert.equal(C.formatLocalInput(t), '2026-11-12T14:30');
});

test('the banner says when, and that it is not live', () => {
  assert.equal(C.bannerText(T('2026-11-12T14:30Z')), 'Viewing Thu 12 Nov 14:30 UTC, not live');
  assert.equal(C.dayLabel('2026-11-14'), '14 Nov 2026');
});

test('London date and the morning book: before 08:00 London reads the previous day, after reads that day (winter and summer)', () => {
  assert.equal(C.londonDate(T('2026-11-12T23:30Z')), '2026-11-12');
  assert.equal(C.londonDate(T('2026-07-01T23:30Z')), '2026-07-02', 'BST: 23:30 UTC is already the next London day');
  assert.equal(C.deskRunDate(T('2026-11-12T07:59Z')), '2026-11-11');
  assert.equal(C.deskRunDate(T('2026-11-12T08:00Z')), '2026-11-12');
  assert.equal(C.deskRunDate(T('2026-07-01T06:59Z')), '2026-06-30', '06:59 UTC is 07:59 BST, still before 08:00 London');
  assert.equal(C.deskRunDate(T('2026-07-01T07:00Z')), '2026-07-01');
  assert.equal(C.deskRunUrl('/api/desk-run?summary=1', T('2026-11-12T10:00Z')), '/api/desk-run?summary=1&date=2026-11-12');
});

test('a point is never later than the as-of time', () => {
  const pts = [{ ts: 10 }, { ts: 20 }, { ts: 30 }];
  assert.equal(C.pointAtOrBefore(pts, 25).ts, 20);
  assert.equal(C.pointAtOrBefore(pts, 30).ts, 30);
  assert.equal(C.pointAtOrBefore(pts, 9), null, 'nothing before the first point: no record, not the first point');
  assert.equal(C.pointAtOrBefore([], 5), null);
  assert.equal(C.pointAtOrBefore(pts, 1e15).ts, 30);
});

test('the daily record: candidates are London dates up to the as-of date; the chosen one was taken at or before the time', () => {
  assert.deepEqual(C.fullCandidates(['2026-11-14', '2026-11-16', '2026-11-15'], T('2026-11-15T20:00Z')), ['2026-11-15', '2026-11-14']);
  assert.deepEqual(C.fullCandidates(['2026-11-14'], T('2026-11-13T20:00Z')), []);
  const snaps = [{ ld: '2026-11-15', ts: T('2026-11-15T10:03Z') }, { ld: '2026-11-16', ts: T('2026-11-16T10:03Z') }];
  assert.equal(C.chooseFull(snaps, T('2026-11-16T09:00Z')).ld, '2026-11-15', 'the 16th record was taken at 10:03, after 09:00');
  assert.equal(C.chooseFull(snaps, T('2026-11-16T10:03Z')).ld, '2026-11-16');
  assert.equal(C.chooseFull(snaps, T('2026-11-15T09:00Z')), null);
});

test('classify: market data is answered or refused; settings and dated history pass; writes pass', () => {
  assert.equal(C.classify('/api/ccy-strength').kind, 'snapshot');
  assert.equal(C.classify('/api/funding-read?spark=0').key, 'funding-read?spark=0');
  assert.equal(C.classify('/api/desk-bars?inst=GOLD&tf=5m').kind, 'bars');
  assert.equal(C.classify('/api/desk-run').kind, 'deskrun');
  for (const u of ['/api/desk-alert-rules', '/api/desk-monitors', '/api/desk-news-searches', '/api/desk-access', '/api/desk-session', '/api/desk-snapshots/index', '/api/replay/day?inst=NQ&date=2026-11-12']) assert.equal(C.classify(u).kind, 'pass', u);
  assert.equal(C.classify('/api/ccy-strength', 'POST').kind, 'pass');
  assert.equal(C.classify('/js/terminal/x.js').kind, 'pass');
  assert.equal(C.classify('/api/live-layer').kind, 'snapshot', 'a live route is not exempt: it will be refused unless the record holds it');
});

test('matchFeed: exact route and query first; the route alone is flagged approximate; nothing else matches', () => {
  const feeds = { 'ccy-strength': { ok: true }, 'funding-read?spark=0': { ok: true } };
  assert.equal(C.matchFeed(feeds, 'ccy-strength').approx, false);
  assert.equal(C.matchFeed(feeds, 'ccy-strength?x=1').approx, true);
  assert.equal(C.matchFeed(feeds, 'funding-read?spark=0').approx, false);
  assert.equal(C.matchFeed(feeds, 'funding-read').approx, true);
  assert.equal(C.matchFeed(feeds, 'live-layer'), null);
  assert.equal(C.matchFeed(null, 'x'), null);
});

test('candles are cut at the as-of time: only finished bars, no forming flag', () => {
  const bars = [0, 300, 600, 900].map((t, i) => ({ time: 1_000_000 + t, open: i, high: i, low: i, close: i, ...(i === 3 ? { forming: true } : {}) }));
  const j = { ok: true, inst: 'X', sec: 300, forming: true, bars };
  const asOf = (1_000_000 + 600) * 1000;   // the third bar opens at +600 and is not finished
  const out = C.truncateBars(j, asOf);
  assert.equal(out.bars.length, 2); assert.equal(out.forming, false); assert.ok(out.bars.every(b => !('forming' in b)));
  assert.ok(out.bars.every(b => (b.time + 300) * 1000 <= asOf), 'no bar finishes after the as-of time');
  assert.equal(j.bars.length, 4, 'the input is not changed');
  assert.deepEqual(C.truncateBars({ ok: false }, asOf), { ok: false });
});

test('strength overlay: the route shape stays, the scores come from the five-minute point, the base is not changed', () => {
  const base = { ok: true, asOf: 'old', horizons: { '4H': { available: true, pairs: 28, scores: [{ ccy: 'USD', score: 1, rank: 1 }, { ccy: 'EUR', score: -1, rank: 2 }], leader: 'USD', laggard: 'EUR', spread: 2, flat: false }, '1D': { available: false } } };
  const core = { ts: 5, d: { strength: { dataAsOf: 'new', h: { '4H': { flat: true, lead: 'EUR', lag: 'USD', spread: 3, s: { USD: -1.5, EUR: 1.5 } }, '1D': { s: { USD: 9 } } } } } };
  const out = C.overlayStrength(base, core);
  assert.equal(out.horizons['4H'].scores[0].ccy, 'EUR'); assert.equal(out.horizons['4H'].scores[0].rank, 1); assert.equal(out.horizons['4H'].pairs, 28);
  assert.equal(out.horizons['4H'].leader, 'EUR'); assert.equal(out.horizons['4H'].flat, true); assert.equal(out.asOf, 'new');
  assert.deepEqual(out.horizons['1D'], { available: false }, 'a window the daily record did not have is not invented');
  assert.equal(base.horizons['4H'].scores[0].ccy, 'USD', 'the base is not changed');
  assert.equal(C.overlayStrength(base, null), base);
});

test('refusal: a normal not-ok body that says nothing live is shown and when snapshots start', () => {
  const r = C.refusal(T('2026-11-10T10:00Z'), T('2026-11-14T17:49Z'), 'live-layer');
  assert.equal(r.ok, false); assert.equal(r.noRecord, true); assert.match(r.error, /No record of this at Tue 10 Nov 10:00 UTC/); assert.match(r.error, /snapshots start 14 Nov 2026/); assert.match(r.error, /Nothing live/);
  assert.match(C.refusal(1, null).error, /no snapshots are held/);
});

test('coverage: first and last point, count, gaps over 50 minutes, the daily days; honest text', () => {
  const m = 60_000, t0 = T('2026-11-14T17:49Z');
  const pts = [0, 30, 60, 200, 205].map(x => ({ ts: t0 + x * m }));
  const cv = C.coverage({ fullDays: ['2026-11-15', '2026-11-14'], coreDays: ['2026-11-14'] }, pts);
  assert.equal(cv.nCore, 5); assert.equal(cv.gaps.length, 1); assert.equal(cv.gaps[0].minutes, 140); assert.deepEqual(cv.fullDays, ['2026-11-14', '2026-11-15']);
  const txt = C.coverageText(cv);
  assert.match(txt, /Sat 14 Nov 17:49 UTC/); assert.match(txt, /1 gap over 50 minutes \(longest 140 minutes\)/); assert.match(txt, /Capture began on 14 Nov 2026, so earlier dates have nothing/);
  assert.match(C.coverageText(C.coverage({}, [])), /nothing to go back to/);
  assert.equal(C.position(cv, t0 - 1), 'before'); assert.equal(C.position(cv, t0 + 10 * m), 'inside'); assert.equal(C.position(cv, t0 + 1000 * m), 'after'); assert.equal(C.position(null, 1), 'empty');
});

test('stepping: offsets read, play advances by speed x real time and stops at the last point', () => {
  assert.equal(C.parseOffset('+1h'), 3_600_000); assert.equal(C.parseOffset('-30m'), -1_800_000); assert.equal(C.parseOffset('+2d'), 172_800_000); assert.equal(C.parseOffset('1h'), null); assert.equal(C.parseOffset('+x'), null);
  assert.equal(C.advance(1000, 1500, 10, 1e12), 1000 + 15000);
  assert.equal(C.advance(1000, 1500, 60, 5000), 5000, 'clamped to the last point');
  assert.equal(C.advance(1000, -5, 60, 1e12), 1000, 'time never runs backwards while playing');
  assert.deepEqual(C.SPEEDS, [2, 10, 60, 300]);
});
