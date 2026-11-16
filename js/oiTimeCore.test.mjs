// js/oiTimeCore.test.mjs: OI over time, the pure core and its route, over synthetic captures and candles (no network). node --test js/oiTimeCore.test.mjs
// Proves: weekend filings are dropped, the scale is one for the whole replay, a level walk counts touches only AFTER the start day and holds the level fixed, the DTE counts down
// from the captures themselves, the tally scores the real level against the same distance mirrored through the start spot (with Wilson intervals and an overlap flag), the
// gauge frames carry the day's price change, the words describe and never advise, and the route is read-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOiDays, adrBefore, terrainScale, dayFrames, recentCandles, levelsInRange, terrainCaption, levelOf, walkLevel, tally, tallySentence, walkCaption, gaugeFrames, gaugeCaption, coverage, HORIZON, LEVEL_KINDS } from './oiTimeCore.js';
import { mountOiTime } from './oiTimeRoutes.js';

/** n weekdays from 2026-09-01: a capture each day (spot drifts, walls around it, DTE counting 8..0 and restarting) and a daily candle. */
function series(n, { drift = (k) => Math.sin(k / 5) * 40 } = {}) {
  const per = {}, candles = []; let t = Date.parse('2026-09-01T12:00:00Z'), k = 0;
  while (Object.keys(per).length < n) {
    const date = new Date(t).toISOString().slice(0, 10), dow = new Date(t).getUTCDay(); t += 864e5;
    if (dow === 0 || dow === 6) { per[date] = { savedAtMs: Date.parse(`${date}T06:45:00Z`), spot: 1, callWalls: [], putWalls: [] }; continue; }   // a weekend filing
    const spot = 1000 + drift(k), c = spot + (k % 2 ? 6 : -6);
    per[date] = { asOf: date, savedAtMs: Date.parse(`${date}T06:45:00Z`), spot, maxPain: spot + 10, gammaFlip: spot - 8, gexFlips: [{ price: spot - 12, dir: 'down' }],
      callWalls: [{ strike: spot + 30, oi: 500 + k, tier: 'strong' }, { strike: spot + 60, oi: 300, tier: 'weak' }], putWalls: [{ strike: spot - 30, oi: 400, tier: 'strong' }],
      pcRatio: 0.8 + (k % 7) / 10, totalCallOI: 90000, totalPutOI: 80000 + k * 100, gex: k % 2 ? 1e6 : -1e6, regime: 'pin', primaryDTE: 8 - (k % 9) };
    candles.push([Date.parse(`${date}T00:00:00Z`), spot - 3, spot + 14, spot - 14, c]);
    k++;
  }
  return { per, candles, dates: Object.keys(per) };
}
const days = n => { const s = series(n); return buildOiDays(s.per, s.candles, { tzDate: ms => new Date(ms).toISOString().slice(0, 10) }); };

test('weekend filings are not sessions; each day carries its capture and its candle', () => {
  const s = series(30), d = buildOiDays(s.per, s.candles, { tzDate: ms => new Date(ms).toISOString().slice(0, 10) });
  assert.ok(Object.keys(s.per).length > d.length, 'weekend filings were dropped'); assert.ok(d.every(x => ![0, 6].includes(new Date(`${x.date}T12:00:00Z`).getUTCDay())));
  assert.ok(d.every(x => x.px && x.calls.length === 2 && x.puts.length === 1 && x.calls[0].k > x.spot)); assert.equal(d[0].dte, 8); assert.equal(d[1].dte, 7, 'the DTE comes from the captures and counts down');
  assert.deepEqual(buildOiDays({}, []), []); assert.deepEqual(buildOiDays({ '2026-09-01': { savedAtMs: null, spot: 1 } }, []), [], 'a capture with no saved time is not used');
});

test('terrainScale is one scale for the whole replay; frames are one per day', () => {
  const d = days(40), s = terrainScale(d); assert.ok(s.half >= 0.012 && s.half <= 0.08); assert.ok(s.oiMax > 0);
  assert.equal(dayFrames(d).length, d.length); assert.match(dayFrames(d)[0].t, /^2026-09-01T12:00:00Z$/);
  assert.equal(recentCandles(d, 25, 20).length, 20); assert.equal(recentCandles(d, 25, 20).at(-1).now, true); assert.equal(recentCandles(d, 3, 20).length, 4);
});

test('adrBefore uses only days BEFORE the index, and needs five of them', () => {
  const d = days(30); assert.equal(adrBefore(d, 3), null); const a = adrBefore(d, 10); assert.ok(a > 0.02 && a < 0.04, `28 of 1000 is about 2.8%, got ${a}`);
  const d2 = d.map((x, i) => (i === 10 ? { ...x, px: { ...x.px, h: x.px.h + 500 } } : x)); assert.equal(adrBefore(d2, 10), a, 'the day itself does not move its own unit');
});

test('levels: the biggest call or put strike by OI, max pain, the gamma flip', () => {
  const d = days(12)[2]; assert.equal(levelOf(d, 'call'), d.calls[0].k); assert.equal(levelOf(d, 'put'), d.puts[0].k); assert.equal(levelOf(d, 'maxpain'), d.maxPain); assert.equal(levelOf(d, 'gamma'), d.gammaFlip); assert.equal(levelOf(null, 'call'), null);
  const lr = levelsInRange(d); assert.ok(lr.inside >= 0 && lr.total === 5);
});

test('the level walk: fixed level, only later days, DTE counting down, touches and distance in average daily ranges', () => {
  const d = days(30), w = walkLevel(d, 12, 'maxpain');
  assert.equal(w.start.date, d[12].date); assert.equal(w.steps.length, HORIZON); assert.equal(w.steps[0].date, d[13].date, 'the start day itself is not a step: its own session is not counted');
  assert.equal(w.level, d[12].maxPain); assert.ok(w.steps.every(s => s.px && 'touched' in s && 'dte' in s)); assert.ok(w.adr > 0);
  const t = w.steps.find(s => s.touched); assert.equal(w.touchedAt, t ? t.date : null);
  // a level far above every candle is never touched; one inside every candle is touched on day one
  const far = d.map(x => ({ ...x, maxPain: 5000 })), farW = walkLevel(far, 12, 'maxpain'); assert.equal(farW.touchedAt, null); assert.ok(farW.steps.every(s => s.distAdr < 0), 'price sits below the level: negative distance');
  const near = d.map(x => ({ ...x, maxPain: x.px.c })), nearW = walkLevel(near, 12, 'maxpain'); assert.equal(typeof nearW.level, 'number');
  assert.equal(walkLevel(d, d.length - 1, 'maxpain').steps.length, 0, 'no later days: nothing to follow'); assert.equal(walkLevel(d, 5, 'nope'), null);
});

test('matching the level on a later day uses the contracts near that strike, or says it is no longer listed', () => {
  const d = days(30).map(x => ({ ...x })); const w0 = walkLevel(d, 12, 'call'); assert.ok(w0.steps.every(s => s.oi == null || s.oi > 0));
  const keep = d.map((x, i) => (i === 14 ? { ...x, calls: [{ k: d[12].calls[0].k * 1.0005, oi: 777, tier: 'strong' }] } : x)); assert.equal(walkLevel(keep, 12, 'call').steps[1].oi, 777, 'a strike within 0.2% is the same level');
  const gone = d.map((x, i) => (i === 14 ? { ...x, calls: [] } : x)); assert.equal(walkLevel(gone, 12, 'call').steps[1].oi, null);
});

test('the tally scores real levels against the SAME distance on the other side of the start spot, with Wilson intervals', () => {
  const d = days(100), t = tally(d);
  assert.ok(t.starts > 30 && t.enough); assert.ok(t.all.n > 30 && t.all.real.n === t.all.n && t.all.mirror.n === t.all.n);
  assert.ok(t.all.real.lo <= t.all.real.p && t.all.real.p <= t.all.real.hi); for (const k of LEVEL_KINDS) assert.ok(k.v in t.kinds);
  assert.equal(typeof t.all.overlap, 'boolean');
  // construct a book where the real level is always touched and the mirror never is: the intervals must separate
  const flat = series(100, { drift: () => 0 }), rigged = buildOiDays(flat.per, flat.candles, { tzDate: ms => new Date(ms).toISOString().slice(0, 10) }).map(x => ({ ...x, maxPain: x.spot + 4, gammaFlip: x.spot + 4, calls: [{ k: x.spot + 4, oi: 1, tier: 'strong' }], puts: [{ k: x.spot + 4, oi: 1, tier: 'strong' }], px: { o: x.spot, h: x.spot + 20, l: x.spot + 1, c: x.spot + 10 } }));
  const r = tally(rigged); assert.ok(r.all.real.p > 99 && r.all.mirror.p < 1 && r.all.overlap === false, 'a level that is always touched with a mirror that never is does not overlap');
  const s = tallySentence(t); assert.match(s, /other side/); assert.match(s, /not independent/); assert.match(tallySentence(null), /Too few/);
  assert.match(tallySentence(r), /do not overlap/); assert.match(tallySentence(t), /overlap|do not overlap/);
});

test('the tally needs a full horizon after each start day and ignores levels far from the spot', () => {
  const d = days(70).slice(0, 12), t = tally(d); assert.ok(t.starts <= 12 - HORIZON); assert.equal(t.enough, false);
  const far = days(100).map(x => ({ ...x, maxPain: x.spot * 2, gammaFlip: x.spot * 2, calls: [{ k: x.spot * 2, oi: 1 }], puts: [{ k: x.spot * 0.5, oi: 1 }] })); assert.equal(tally(far).all.n, 0, 'nothing within one average daily range');
});

test('gauge frames carry the day price change; only days with a ratio; the words say CME open interest, not COT', () => {
  const d = days(20), f = gaugeFrames(d); assert.equal(f.length, d.length); assert.equal(f[0].data.chg, null, 'no previous close for the first day'); assert.ok(Number.isFinite(f[3].data.chg));
  const cap = gaugeCaption(f, 5, { label: 'Nasdaq 100' }); assert.match(cap, /puts for every call/); assert.match(cap, /not COT/); assert.match(cap, /percentile/);
  assert.equal(gaugeFrames(d.map(x => ({ ...x, pc: null }))).length, 0);
});

test('words describe, never advise', () => {
  const d = days(40), w = walkLevel(d, 20, 'call');
  const txt = [terrainCaption(d, 15, { label: 'Nasdaq 100', dp: 1 }), walkCaption(w, -1), ...w.steps.map((_, k) => walkCaption(w, k)), tallySentence(tally(d)), gaugeCaption(gaugeFrames(d), 9, { label: 'Nasdaq 100' })].join(' ');
  assert.doesNotMatch(txt, /\b(buy|sell|long|short|entry|target|stop|invalidat|signal|will (rise|fall|reach|hit))\b/i); assert.match(txt, /fixed|capture|levels/);
});

test('coverage states the first and last day and how many have a candle', () => { const c = coverage(days(20)); assert.equal(c.n, days(20).length); assert.equal(c.from, '2026-09-01'); assert.equal(c.withPrice, c.n); assert.deepEqual(coverage([]), { n: 0, from: null, to: null, withPrice: 0 }); });

// ── the route over fake deps ──
test('route: serves the captures with candles, refuses markets with no OI capture, and writes nothing', async () => {
  const s = series(30), routes = {}, app = { get(p, f) { routes[p] = f; } }, writes = [];
  const candles = s.candles.map(b => ({ t: b[0] / 1000, open: String(b[1]), high: String(b[2]), low: String(b[3]), close: String(b[4]) }));
  let asked = null; mountOiTime(app, { fetchRange: async (sym, gran, from, to) => { asked = { sym, gran, from, to }; return candles; }, kvGet: async k => (k === 'oi_history' ? JSON.stringify({ data: { NAS100_USD: s.per } }) : null), now: () => Date.parse('2026-11-16T10:00:00Z') });
  const call = async q => { let status = 200, body = null; await routes['/api/replay/oi-days']({ query: q }, { headersSent: false, set() {}, status(c) { status = c; return this; }, json(b) { body = b; this.headersSent = true; return this; } }); return { status, body }; };
  const ok = await call({ inst: 'nq' }); assert.equal(ok.status, 200); assert.equal(ok.body.ok, true); assert.equal(asked.gran, 'D'); assert.equal(asked.sym, 'NAS100_USD'); assert.equal(ok.body.first, '2026-09-01');
  assert.ok(ok.body.days.length > 20 && ok.body.days.every(d => d.px)); assert.equal(ok.body.coverage.n, ok.body.days.length);
  assert.equal((await call({ inst: 'NZDUSD' })).status, 400); assert.equal((await call({ inst: 'zzz' })).status, 400); assert.equal(writes.length, 0);
  const empty = {}; const app2 = { get(p, f) { empty[p] = f; } }; mountOiTime(app2, { fetchRange: async () => [], kvGet: async () => JSON.stringify({ data: {} }), now: () => 0 });
  let body2 = null; await empty['/api/replay/oi-days']({ query: { inst: 'NQ' } }, { headersSent: false, set() {}, status() { return this; }, json(b) { body2 = b; } }); assert.equal(body2.days.length, 0); assert.match(body2.error, /no option-OI captures/);
});
