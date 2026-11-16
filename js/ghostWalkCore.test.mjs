// js/ghostWalkCore.test.mjs: the ghost walk's pure core and its route, over synthetic days (no network). node --test js/ghostWalkCore.test.mjs
// Proves: the unit and the path maths, point-in-time levels (a level exists only from its capture's saved time, touches count only from then, the mirrored placebo is scored on
// the same bars), the forecast-by-the-open rule, ghosts being earlier days only, frames that use nothing later than their own step, the day counts from the first OI capture,
// the interval maths and the words. It does NOT prove the look (see ghostWalkDraw.test.mjs) or the live feeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toUnits, fromUnits, wilson, buildDay, buildGhostPayload, groupByLondonDate, selectGhosts, yAt, bandAt, makeFrames, touchTimes, levelLines, touchSummary, coverageOf, touchSentence,
  captionFor, hmOf, fmtU, ghostCsv, STEP_MS, MIN_GHOSTS, MIN_BAND, GHOST_MARKETS } from './ghostWalkCore.js';
import { sessionWindow } from './replayCore.js';
import { mountGhostWalk } from './ghostWalkRoutes.js';

const Q = STEP_MS, HOUR = 3600e3;
/** 96 fifteen-minute bars for one London day: open 100, closes from f(i), high/low a little either side; hit = { i, price } forces a bar to reach a price. */
function dayBars(date, f = i => 100, { hit = [] } = {}) {
  const w = sessionWindow(date).start, rows = [];
  for (let i = 0; i < 96; i++) {
    const o = i === 0 ? 100 : f(i - 1), c = f(i); let h = Math.max(o, c) + 0.05, l = Math.min(o, c) - 0.05;
    for (const x of hit) if (x.i === i) { h = Math.max(h, x.price); l = Math.min(l, x.price); }
    rows.push([w + i * Q, o, h, l, c]);
  }
  return rows;
}
const entry = (date, savedH, extra = {}) => ({ date, asOf: date, savedAtMs: sessionWindow(date).start + savedH * HOUR, spot: 100, maxPain: 100.6, gammaFlip: 99.4, regime: 'pin',
  callWalls: [{ strike: 101, oi: 500, tier: 'strong' }, { strike: 102, oi: 300, tier: 'moderate' }], putWalls: [{ strike: 99, oi: 400, tier: 'strong' }], gexFlips: [], ...extra });
const fc = (date, hlm = 2, knownH = -2) => ({ hl_median: hlm, knownFrom: sessionWindow(date).start + knownH * HOUR });

test('units: a price is its distance from the open in forecast median ranges, and back', () => {
  assert.equal(toUnits(101, 100, 2), 0.5); assert.equal(toUnits(98, 100, 2), -1); assert.equal(fromUnits(0.5, 100, 2), 101);
  assert.equal(toUnits(101, 100, null), null); assert.equal(toUnits(101, 0, 2), null); assert.equal(toUnits(NaN, 100, 2), null);
  assert.equal(fmtU(0.456), '+0.46'); assert.equal(fmtU(-1), '−1.00'); assert.equal(fmtU(null), '–');
});

test('a London day lines up by its wall clock: the first bar is x = 0 on a winter day and on a summer day', () => {
  for (const date of ['2026-11-12', '2026-10-12']) {
    const d = buildDay(date, dayBars(date), { entries: [], fc: fc(date) });
    assert.equal(d.path[0][0], 0, `${date}: the path starts at the London midnight clock`); assert.equal(d.path.at(-1)[0], 96 * Q); assert.equal(hmOf(d.path[1][0]), '00:15');
  }
});

test('buildDay: path, unit, range in units and the open', () => {
  const date = '2026-11-12', d = buildDay(date, dayBars(date, i => 100 + (i < 48 ? i * 0.02 : (96 - i) * 0.02)), { entries: [], fc: fc(date, 2) });
  assert.equal(d.open, 100); assert.equal(d.unitPct, 2); assert.equal(d.path.length, 97);
  assert.ok(d.hiU > 0.4 && d.hiU < 0.6, `high about +0.5 units, got ${d.hiU}`); assert.ok(d.loU < 0); assert.equal(d.partial, false); assert.deepEqual(d.levels, []);
});

test('the unit is used only when the forecast was computed by the open', () => {
  const date = '2026-11-12';
  assert.equal(buildDay(date, dayBars(date), { fc: fc(date, 2, -1) }).unitPct, 2, 'computed an hour before the open: used');
  assert.equal(buildDay(date, dayBars(date), { fc: fc(date, 2, 0.75) }).unitPct, 2, 'computed 45 minutes into the London day (it is made around midnight): still used');
  assert.equal(buildDay(date, dayBars(date), { fc: fc(date, 2, 1.5) }).dropped, 'no-forecast', 'computed an hour and a half in: the day is dropped, not given a unit');
  assert.equal(buildDay(date, dayBars(date), { fc: fc(date, 2, 3) }).dropped, 'no-forecast', 'computed three hours after the open: dropped');
  assert.equal(buildDay(date, dayBars(date), { fc: null }).dropped, 'no-forecast');
  assert.equal(buildDay(date, dayBars(date).slice(0, 10), { fc: fc(date) }).dropped, 'few-bars');
  assert.equal(buildDay(date, dayBars(date).slice(0, 5), { fc: fc(date), today: date }).dropped, undefined, 'today so far may be short');
});

test('POINT IN TIME: a level exists only from its capture saved time; a touch before it does not count, a touch after it does, and the mirror is scored on the same bars', () => {
  const date = '2026-11-12', e = entry(date, 6.5);   // saved 06:30
  // price reaches 101 at 03:00 (bar 12) only, and 99 (the mirror of 101) at 10:00 (bar 40)
  const early = buildDay(date, dayBars(date, () => 100, { hit: [{ i: 12, price: 101 }, { i: 40, price: 99 }] }), { entries: [e], fc: fc(date) });
  const call = early.touches.find(t => t.type === 'call' && t.y === 0.5);
  assert.ok(call, 'the 101 call wall is within one range of the open and scored');
  assert.equal(call.hit, false, 'the touch at 03:00 was before the capture was saved: not counted'); assert.equal(call.mHit, true, 'the mirrored level (99) was reached at 10:00, after the save');
  const late = buildDay(date, dayBars(date, () => 100, { hit: [{ i: 50, price: 101 }] }), { entries: [e], fc: fc(date) });
  assert.equal(late.touches.find(t => t.type === 'call' && t.y === 0.5).hit, true, 'a touch after the save counts');
  assert.equal(late.oi.savedX, 6.5 * HOUR); assert.equal(levelLines(late)[0].x, 6.5 * HOUR, 'the level line starts at the saved time');
});

test('a capture saved before the day counts from the open; an old one is flagged; no capture, no levels', () => {
  const date = '2026-11-12', prev = entry('2026-11-11', 6.5);
  const d = buildDay(date, dayBars(date), { entries: [prev], fc: fc(date) });
  assert.equal(d.oi.stale, false); assert.equal(levelLines(d)[0].x, 0, 'in force from the open');
  const old = buildDay(date, dayBars(date), { entries: [entry('2026-11-05', 6.5)], fc: fc(date) });
  assert.equal(old.oi, null, 'a capture older than four days is not used at all');
  assert.deepEqual(buildDay(date, dayBars(date), { entries: [], fc: fc(date) }).levels, []);
});

test('levels more than one range from the open are drawn but not scored for touches', () => {
  const date = '2026-11-12', d = buildDay(date, dayBars(date), { entries: [entry(date, 1, { callWalls: [{ strike: 103, oi: 900, tier: 'strong' }] })], fc: fc(date, 2) });
  assert.ok(d.levels.some(l => l.type === 'call' && l.y === 1.5)); assert.ok(!d.touches.some(t => t.y === 1.5));
});

function series(n, { startDate = '2026-09-01', regime = 'pin', gamma = 'above' } = {}) {
  const days = [], bars = [], entries = [], forecasts = {};
  let t = Date.parse(`${startDate}T12:00:00Z`);
  for (let k = 0; k < n; k++) {
    const date = new Date(t).toISOString().slice(0, 10); t += 864e5;
    if (['Sat', 'Sun'].includes(new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }))) { k--; continue; }
    bars.push(...dayBars(date, i => 100 + Math.sin((i + k) / 9) * 0.6));
    entries.push(entry(date, 6.5, { regime: k % 2 ? regime : 'breakout', spot: gamma === 'above' ? 100 : 99, gammaFlip: 99.4 }));
    forecasts[date] = fc(date, 2);
    days.push(date);
  }
  return { days, bars, entries, forecasts };
}

test('weekend dates (the Sunday-evening stub) are skipped, not counted as thin days', () => {
  const sat = '2026-11-14', sun = '2026-11-15', s = series(6), rows = [...s.bars, ...dayBars(sat).slice(0, 4), ...dayBars(sun).slice(88)];
  const p = buildGhostPayload({ bars: rows, entries: s.entries, forecasts: s.forecasts, focus: sun, n: 90 });
  assert.equal(p.dropped['few-bars'], 0); assert.ok(!p.days.some(d => d.date === sat || d.date === sun));
});

test('buildGhostPayload: only from the first OI capture, forecast-less days dropped and counted, focus carries its bars', () => {
  const s = series(30), focus = s.days.at(-1); delete s.forecasts[s.days[10]];
  const p = buildGhostPayload({ bars: s.bars, entries: s.entries.slice(5), forecasts: s.forecasts, focus, today: null, n: 90 });
  assert.equal(p.firstOi, s.days[5], 'the walk starts at the first capture held'); assert.ok(p.days.every(d => d.date >= s.days[5])); assert.equal(p.dropped['no-forecast'], 1);
  assert.equal(p.days.length, 30 - 5 - 1); assert.equal(p.focusFound, true); assert.ok(p.days.at(-1).bars.length === 96 && !p.days[0].bars, 'only the focus day carries its bars');
  assert.equal(coverageOf(p).from, s.days[5]); assert.equal(coverageOf(p).oiDays, 25);
});

test('ghosts are EARLIER days only; the regime and gamma filters narrow them; too few means no ghosts', () => {
  const s = series(30), p = buildGhostPayload({ bars: s.bars, entries: s.entries, forecasts: s.forecasts, focus: s.days.at(-1), n: 90 });
  const focus = p.days.find(d => d.date === s.days[20]);
  const all = selectGhosts(p.days, focus, 'all');
  assert.ok(all.ghosts.every(g => g.date < focus.date), 'no later day is ever a ghost'); assert.ok(!all.ghosts.some(g => g.date === focus.date)); assert.equal(all.n, 20);
  const reg = selectGhosts(p.days, focus, 'regime'); assert.ok(reg.n < all.n && reg.ghosts.every(g => g.oi.regime === focus.oi.regime));
  const early = selectGhosts(p.days, p.days[3], 'all'); assert.equal(early.n, 3); assert.equal(early.enough, false, `fewer than ${MIN_GHOSTS} earlier days: no ghosts`);
  const partial = { ...p.days[5], partial: true }; assert.equal(selectGhosts([partial, p.days[6]], p.days[6], 'all').n, 0, 'a partial day is never a ghost');
});

test('yAt reads a path by the clock; bandAt needs enough ghosts and gives ordered quantiles', () => {
  const s = series(30), p = buildGhostPayload({ bars: s.bars, entries: s.entries, forecasts: s.forecasts, focus: s.days.at(-1), n: 90 }), g = p.days.slice(0, 20);
  assert.equal(yAt(g[0], -1), null, 'before the day starts'); assert.equal(yAt(g[0], 100 * HOUR), null, 'after it ends'); assert.ok(Math.abs(yAt(g[0], 0)) < 1e-9);
  const b = bandAt(g, 12 * HOUR); assert.equal(b.n, 20); assert.ok(b.p10 <= b.med && b.med <= b.p90);
  assert.equal(bandAt(g.slice(0, MIN_BAND - 1), 12 * HOUR).med, null, 'too few ghosts at that time: no band');
});

test('frames use nothing later than their own step, and a level is touched only from then on', () => {
  const date = '2026-11-12', e = entry(date, 6.5);
  const bars = dayBars(date, i => 100 + (i === 60 ? 0.2 : 0), { hit: [{ i: 12, price: 101 }, { i: 60, price: 101 }] });
  const d = buildDay(date, bars, { entries: [e], fc: fc(date), withBars: true });
  const frames = makeFrames(d, []);
  assert.equal(frames.length, 96); assert.equal(frames[0].t, sessionWindow(date).start + Q);
  const at = h => frames.find(f => f.data.x === h * HOUR).data;
  assert.deepEqual(at(5).touched, [], 'at 05:00 nothing is touched (the 03:00 spike was before the levels existed)');
  assert.deepEqual(at(14).touched, [], 'still nothing at 14:00');
  assert.ok(at(15.5).touched.length >= 1, 'after the 15:00 bar reached 101 the call wall is marked touched');
  const tt = touchTimes(d); assert.ok(Object.values(tt).every(x => x >= 6.5 * HOUR), 'no touch time is before the level existed');
  // one frame's price is the close at its own time, never a later one
  assert.equal(at(15).price, d.path.find(p => p[0] === 15 * HOUR)[1]);
  assert.ok(frames.every(f => f.data.hi >= f.data.y - 1e-9 && f.data.lo <= f.data.y + 1e-9), 'the range so far contains the price now');
});

test('touch summary: real against mirrored placebo, Wilson intervals, overlap flag, and a small-sample warning', () => {
  const days = Array.from({ length: 20 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, partial: false, touches: [{ type: 'call', y: 0.4, hit: i % 2 === 0, mHit: i % 2 === 0 }, { type: 'put', y: -0.4, hit: i % 3 === 0, mHit: i % 3 !== 0 }] }));
  const s = touchSummary(days); assert.equal(s.n, 40); assert.equal(s.nDays, 20); assert.equal(s.enough, false);
  assert.ok(s.real.lo < s.real.p && s.real.p < s.real.hi); assert.ok(s.overlap);
  const w = wilson(50, 100); assert.ok(Math.abs(w.lo - 40.4) < 0.2 && Math.abs(w.hi - 59.6) < 0.2, `Wilson 50/100 is about 40.4 to 59.6, got ${w.lo.toFixed(1)} to ${w.hi.toFixed(1)}`);
  assert.equal(wilson(0, 0).p, null); assert.equal(touchSummary(days, { upTo: '2026-10-05' }).nDays, 4, 'upTo keeps only earlier days');
  const t = touchSentence(s); assert.match(t, /mirrored/); assert.match(t, /overlap/); assert.match(t, /small sample/); assert.match(t, /not independent/);
  assert.match(touchSentence(touchSummary([])), /No scored levels/);
});

test('words describe, never advise: no entry/target/stop wording, and the caption names what has been touched', () => {
  const date = '2026-11-12', e = entry(date, 1);
  const d = buildDay(date, dayBars(date, () => 100, { hit: [{ i: 20, price: 101 }] }), { entries: [e], fc: fc(date), withBars: true }), s = series(25);
  const p = buildGhostPayload({ bars: s.bars, entries: s.entries, forecasts: s.forecasts, focus: s.days.at(-1) }), sel = selectGhosts(p.days, { ...d, date: '2099-01-01' }, 'all');
  const frames = makeFrames(d, sel.ghosts), lines = levelLines(d), touchAt = touchTimes(d);
  const extra = { label: 'Nasdaq 100', dp: 1, unitPct: 2, lines, touchAt, levelsFrom: lines[0].x, ghostsOn: true };
  const all = frames.map((_, i) => captionFor(frames, i, extra)).join(' ');
  assert.match(all, /units (above|below) its open/); assert.match(all, /earlier days were higher/); assert.match(all, /(call wall|max pain)/);
  assert.doesNotMatch(all + touchSentence(touchSummary(p.days)), /\b(buy|sell|long|short|entry|target|stop|invalidat|signal|will (rise|fall|reach))\b/i);
});

test('CSV: the path in price and units, the levels, and what the unit was', () => {
  const date = '2026-11-12', d = buildDay(date, dayBars(date), { entries: [entry(date, 1)], fc: fc(date, 2) }), csv = ghostCsv(d, { label: 'Nasdaq 100' });
  assert.match(csv, /^time_london,price,units_from_open\n00:00,100,0\n/); assert.match(csv, /call wall,101,0\.5,strong/); assert.match(csv, /unit,2% of the open \(forecast median high-low\)/);
});

test('the markets are exactly those with an option-OI capture', () => { assert.ok(GHOST_MARKETS.includes('NQ') && GHOST_MARKETS.includes('GOLD') && GHOST_MARKETS.includes('EURUSD')); assert.ok(!GHOST_MARKETS.includes('NZDUSD')); });

// ── the route, over fake deps ──────────────────────────────────────────────────────────────────────────────────────────────────────

function fakeApp() { const routes = {}; return { routes, get(path, fn) { routes[path] = fn; } }; }
const call = async (app, query) => { let status = 200, body = null; const res = { headersSent: false, set() {}, status(c) { status = c; return this; }, json(b) { body = b; this.headersSent = true; return this; } }; await app.routes['/api/replay/ghosts']({ query }, res); return { status, body }; };
test('route: serves days from the first capture, drops what has no forecast, refuses unknown markets, and writes nothing', async () => {
  const s = series(20), app = fakeApp(), writes = [];
  const candles = s.bars.map(b => ({ t: b[0] / 1000, open: String(b[1]), high: String(b[2]), low: String(b[3]), close: String(b[4]) }));
  const per = {}; for (const e of s.entries) per[e.date] = { ...e };
  const kvGet = async k => (k === 'oi_history' ? JSON.stringify({ data: { NAS100_USD: per } }) : k.startsWith('vol_forecast_') && s.forecasts[k.slice(13)] ? JSON.stringify({ computed_at: new Date(s.forecasts[k.slice(13)].knownFrom).toISOString(), instruments: { NQ: { hl_median: 2, hl_75: 2.6 } } }) : null);
  let asked = null; mountGhostWalk(app, { fetchRange: async (sym, gran, from, to) => { asked = { sym, gran, from, to }; return candles; }, kvGet, now: () => Date.parse(`${s.days.at(-1)}T20:00:00Z`) });
  const ok = await call(app, { inst: 'nq', date: s.days.at(-1) });
  assert.equal(ok.status, 200); assert.equal(ok.body.ok, true); assert.equal(asked.gran, 'M15'); assert.equal(asked.sym, 'NAS100_USD'); assert.equal(ok.body.firstOi, s.days[0]); assert.equal(ok.body.days.length, 20);
  assert.ok(ok.body.days.at(-1).partial === true || ok.body.days.at(-1).bars.length > 0); assert.ok(ok.body.days.every(d => d.unitPct === 2));
  assert.equal((await call(app, { inst: 'NZDUSD' })).status, 400, 'a market with no OI capture is refused'); assert.equal((await call(app, { inst: 'nope' })).status, 400);
  assert.equal((await call(app, { inst: 'NQ', date: '2999-01-01' })).status, 400); assert.equal(writes.length, 0);
});
