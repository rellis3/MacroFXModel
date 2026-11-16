// js/terrainLive.test.mjs: the terrain chart's live price line (js/terrainLive.js) and the geometry js/terrainChart.js hands it.
// Pure rules first (age, open / stale / shut, the nearest levels and their sigma, clamping), then the painter and the controller over stand-in canvases.
// It does NOT prove the look in a real browser (colours, the tag against the real terrain, phone width): those need an owner click-through.
// node --test js/terrainLive.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { devicePixelRatio: 1 };
const L = await import('./terrainLive.js');
const { drawTerrain } = await import('./terrainChart.js');
const { DESK_OF_SYM, distFor, ageText, liveFromBars, withAge, tagText, levelDistances, distanceText, nameShort, plausible, yFor, liveNote, paintLive, mountTerrainLive, barsUrl, LIVE_COLOUR } = L;

const TUE = Date.parse('2026-11-17T10:00:00Z'), SAT = Date.parse('2026-11-14T10:00:00Z');
const OPEN = { open: true }, SHUT = { open: false };
const px = v => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? v.toFixed(1) : Math.abs(v) >= 100 ? v.toFixed(2) : v.toFixed(5)) : '-');
const bars = (lastOpenSec, forming, extra = {}) => ({ ok: true, sec: 300, asOf: TUE - 20_000, bars: [{ time: lastOpenSec - 300, open: 1, high: 1, low: 1, close: 4999 }, { time: lastOpenSec, open: 1, high: 1, low: 1, close: 5000.5, ...(forming ? { forming: true } : {}) }], ...extra });

test('every terrain market with a desk price has a desk instrument name; markets without one have none', () => {
  const terrain = ['XAU/USD', 'NAS100_USD', 'SPX500_USD', 'US30_USD', 'US2000_USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'XAG/USD', 'XCU/USD', 'WTICO_USD', 'BCO_USD', 'NATGAS_USD'];
  for (const k of terrain) assert.ok(DESK_OF_SYM[k], k);
  assert.equal(Object.keys(DESK_OF_SYM).length, terrain.length);
  for (const k of ['CORN_USD', 'WHEAT_USD', 'SOYBN_USD', 'XPD/USD', 'XPT/USD']) assert.equal(DESK_OF_SYM[k], undefined, `${k} has no desk bars, so no live line`);
  assert.equal(barsUrl('GOLD'), '/api/desk-bars?inst=GOLD&tf=5m&days=1');
});

test('ageText: under a minute, minutes, hours with zero-padded minutes, days; bad input is empty', () => {
  assert.equal(ageText(20_000), '<1m'); assert.equal(ageText(7 * 60_000), '7m'); assert.equal(ageText(65 * 60_000), '1h 05m'); assert.equal(ageText(50 * 3600_000), '2d');
  assert.equal(ageText(-5), ''); assert.equal(ageText(NaN), '');
});

test('liveFromBars: a forming bar in an open week is "now" with the server read as its age', () => {
  const t = Math.floor(TUE / 1000 / 300) * 300;
  const r = liveFromBars(bars(t, true), TUE, OPEN);
  assert.equal(r.kind, 'now'); assert.equal(r.price, 5000.5); assert.equal(r.forming, true); assert.equal(r.ageMs, 20_000); assert.equal(r.label, '<1m');
  assert.equal(tagText(r, px), 'now 5000.5 · <1m');
});

test('liveFromBars: a shut week is "at close" with the bar end time, never "now"', () => {
  const friClose = Date.parse('2026-11-13T21:55:00Z') / 1000;
  const r = liveFromBars(bars(friClose, false), SAT, SHUT);
  assert.equal(r.kind, 'close'); assert.match(r.label, /^Fri 21:55 UTC$|^Fri 22:00 UTC$/);
  assert.match(tagText(r, px), /^at close 5000\.5 · Fri 2[12]:\d\d UTC$/);
});

test('liveFromBars: an open week whose last bar is over 15 minutes old is "stale", labelled "old"', () => {
  const t = Math.floor((TUE - 50 * 60_000) / 1000 / 300) * 300;
  const r = liveFromBars(bars(t, false), TUE, OPEN);
  assert.equal(r.kind, 'stale'); assert.match(tagText(r, px), /^last 5000\.5 · 4\dm old$|^last 5000\.5 · 5\dm old$/);
});

test('liveFromBars: nothing to read is null, not a guess', () => {
  for (const r of [null, {}, { bars: [] }, { bars: [{ time: 1, close: NaN }] }, { bars: [{ time: 1, close: 0 }] }]) assert.equal(liveFromBars(r, TUE, OPEN), null);
  assert.equal(tagText(null, px), '');
});

test('withAge: the same reading turns "at close" when the market shuts, and "stale" when it ages', () => {
  const t = Math.floor(TUE / 1000 / 300) * 300, r = liveFromBars(bars(t, true), TUE, OPEN);
  assert.equal(withAge(r, TUE + 60_000, OPEN).kind, 'now'); assert.equal(withAge(r, TUE + 60_000, OPEN).label, '1m');
  assert.equal(withAge(r, TUE + 20 * 60_000, OPEN).kind, 'stale');
  assert.equal(withAge(r, SAT, SHUT).kind, 'close');
  assert.equal(withAge(null, TUE, OPEN), null);
});

const LV = [{ name: 'GEX FLIP (ZERO CROSSING)', price: 5030, color: '#f0b04a' }, { name: 'MAJOR WALL', price: 5010, color: '#7fb0ff' }, { name: 'MAX PAIN', price: 5000, color: '#c9cdd2' }, { name: 'CALL WALL', price: 5025, color: '#ee6d66' }, { name: 'PUT WALL', price: 4960, color: '#3fc583' }];

test('levelDistances: nearest above and below, points and the snapshot expected-move sigma; a level the price is on counts as neither', () => {
  const d = levelDistances(5000.5, LV, { move: 50, source: 'implied' });
  assert.equal(d.above.name, 'MAJOR WALL'); assert.equal(d.above.pts, 9.5); assert.ok(Math.abs(d.above.sigma - 0.19) < 1e-9);
  assert.equal(d.below.name, 'MAX PAIN'); assert.equal(d.below.pts, 0.5);
  const on = levelDistances(5000, LV, { move: 50 }); assert.equal(on.below.name, 'PUT WALL'); assert.equal(on.above.name, 'MAJOR WALL');
  const none = levelDistances(6000, LV, null); assert.equal(none.above, null); assert.equal(none.below.name, 'GEX FLIP (ZERO CROSSING)'); assert.equal(none.below.sigma, null);
  assert.deepEqual(levelDistances(NaN, LV, null), { above: null, below: null, move: null });
});

test('distanceText: arrow, short lower-case name, signed sigma and points; no sigma when there is no expected move', () => {
  const d = levelDistances(5000.5, LV, { move: 50 });
  assert.equal(nameShort('GEX FLIP (ZERO CROSSING)'), 'gex flip');
  const dist = distFor('NQ');
  assert.equal(distanceText('up', d.above, dist), '▲ major wall +0.2σ · +9.50');
  assert.equal(distanceText('down', d.below, dist), '▼ max pain −0.0σ · −0.500');
  const ns = levelDistances(5000.5, LV, null); assert.equal(distanceText('up', ns.above, dist), '▲ major wall +9.50');
  assert.equal(distanceText('up', null, dist), '');
});

test('distFor: FX pairs in pips (JPY pairs at 0.01), everything else in points to a readable number of places', () => {
  assert.equal(distFor('EURUSD')(0.00312), '31p'); assert.equal(distFor('EURUSD')(0.00041), '4.1p'); assert.equal(distFor('USDJPY')(0.31), '31p'); assert.equal(distFor('USDCHF')(0.0005), '5.0p');
  assert.equal(distFor('GOLD')(12.4), '12.4'); assert.equal(distFor('GOLD')(31), '31.0'); assert.equal(distFor('NQ')(142.6), '143'); assert.equal(distFor('COPPER')(0.052), '0.0520'); assert.equal(distFor('COPPER')(0.52), '0.520'); assert.equal(distFor('NATGAS')(0.0123), '0.0123');
  assert.equal(distFor('GOLD')(NaN), '');
});

test('plausible and yFor: a mapping 25% off is refused; a price outside the window is clamped to the edge and says which', () => {
  const geom = { lo: 4900, hi: 5100, PT: 34, ph: 400, spot: 5000 };
  assert.equal(plausible(5001, geom), true); assert.equal(plausible(7000, geom), false); assert.equal(plausible(NaN, geom), false); assert.equal(plausible(5000, {}), false);
  assert.deepEqual(yFor(5000, geom), { y: 234, off: null });
  assert.deepEqual(yFor(5200, geom), { y: 35, off: 'above' }); assert.deepEqual(yFor(4800, geom), { y: 433, off: 'below' });
});

test('liveNote: says what the line is, defines sigma, and says it is where price is and not where it will go', () => {
  const n = liveNote({ refMove: { move: 50, source: 'implied' } }, { price: 1 });
  assert.match(n, /price now/); assert.match(n, /σ is the snapshot's expected move \(from implied vol\)/); assert.match(n, /not where it will go/);
  assert.match(liveNote({ refMove: null }, null), /not available for this market right now/);
  assert.ok(!/will (rise|fall|reach|hit)|buy|sell|target/i.test(n), 'no direction or trade wording');
});

// ---- stand-in canvas context: records text and strokes ----
function ctx() {
  const calls = [], texts = [];
  const g = new Proxy({}, {
    get(_, k) {
      if (k === 'calls') return calls; if (k === 'texts') return texts;
      if (k === 'measureText') return t => ({ width: String(t).length * 6.5 });
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'fillText' || k === 'strokeText') return (t, x, y) => { if (k === 'fillText') texts.push({ t: String(t), x, y }); calls.push(k); };
      return (...a) => { calls.push(k); return a; };
    },
    set() { return true; },
  });
  return g;
}

test('paintLive draws the line, the tag and both distances; skips an implausible price; marks an out-of-range price', () => {
  const geom = { lo: 4900, hi: 5100, PL: 78, PT: 34, pw: 880, ph: 400, spot: 5000, refMove: { move: 50 }, levels: LV };
  const live = { price: 5000.5, kind: 'now', label: '2m', quoteMs: TUE };
  const g = ctx(), lines = paintLive(g, geom, live, px);
  assert.equal(lines[0], 'now 5000.5 · 2m'); assert.match(lines[1], /^▲ major wall/); assert.match(lines[2], /^▼ max pain/);
  assert.ok(g.calls.includes('stroke') && g.calls.includes('fill'));
  assert.deepEqual(paintLive(ctx(), geom, { ...live, price: 9000 }, px), [], 'wrong-scale price is not drawn');
  assert.deepEqual(paintLive(ctx(), geom, null, px), []); assert.deepEqual(paintLive(null, geom, live, px), []);
  const out = paintLive(ctx(), geom, { ...live, price: 5200 }, px); assert.match(out[0], /^▲ now 5200\.0 · 2m \(above this range\)$/);
  const shut = paintLive(ctx(), geom, { price: 5000.5, kind: 'close', label: 'Fri 21:55 UTC', quoteMs: SAT }, px); assert.equal(shut[0], 'at close 5000.5 · Fri 21:55 UTC');
  assert.match(LIVE_COLOUR, /^#[0-9a-f]{6}$/i);
});

// ---- drawTerrain hands back the geometry and honours the spot label ----
const entry = () => ({ pair: 'NAS100_USD', spot: 100, refMove: { move: 1.2, source: 'implied' }, maxPain: 100.5, gexFlip: 101.2, callWall: 102, putWall: 99,
  gexProfile: Array.from({ length: 13 }, (_, i) => ({ strike: 94 + i, callOI: 100 + i * 10, putOI: 200 - i * 10 })) });
const cvStub = () => { const g = ctx(); return { clientWidth: 1000, clientHeight: 700, width: 0, height: 0, getContext: () => g, g }; };

test('drawTerrain returns the geometry for the overlay: the window, the plot box, and every named level (not the spot)', () => {
  const cv = cvStub(), r = drawTerrain(cv, { e: entry(), sym: 'NAS100_USD', maxDte: 400, px, fmtBig: v => String(v) });
  assert.equal(r.note, null); const gm = r.geom;
  assert.ok(gm.lo < 100 && gm.hi > 100 && gm.PL === 78 && gm.PT === 34 && gm.cssW === 1000 && gm.cssH === 700);
  assert.deepEqual(gm.levels.map(l => l.name).sort(), ['CALL WALL', 'GEX FLIP (ZERO CROSSING)', 'MAJOR WALL', 'MAX PAIN', 'PUT WALL']);
  assert.equal(gm.refMove.move, 1.2);
  assert.ok(cv.g.texts.some(t => /^SPOT PRICE:/.test(t.t)), 'default label unchanged');
  const cv2 = cvStub(); drawTerrain(cv2, { e: entry(), sym: 'NAS100_USD', maxDte: 400, px, fmtBig: v => String(v), spotLabel: 'SNAPSHOT SPOT' });
  assert.ok(cv2.g.texts.some(t => /^SNAPSHOT SPOT:/.test(t.t)) && !cv2.g.texts.some(t => /^SPOT PRICE:/.test(t.t)), 'relabelled when the live line is on');
  const bad = drawTerrain(cvStub(), { e: null, sym: 'X', px, fmtBig: String }); assert.equal(bad.geom, undefined);
});

// ---- the controller ----
function rig(over = {}) {
  const timers = [], overlays = [], g = ctx();
  const parent = { style: {}, appendChild(o) { overlays.push(o); o.isIn = true; } };
  const cv = { parentElement: parent, isConnected: true, offsetLeft: 0, offsetTop: 0, clientWidth: 1000, clientHeight: 700, width: 1000, height: 700 };
  const doc = { createElement: () => { const o = { style: {}, attrs: {}, width: 0, height: 0, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getContext: () => g, remove() { this.isIn = false; } }; return o; }, documentElement: {} };
  const win = { getComputedStyle: () => ({ position: 'relative', getPropertyValue: () => '' }), setInterval: (f, ms) => { timers.push({ f, ms, on: true }); return timers.length; }, clearInterval: id => { if (timers[id - 1]) timers[id - 1].on = false; }, document: { visibilityState: 'visible' } };
  const calls = [], notes = []; let nowMs = over.now ?? TUE, answer = over.answer ?? (() => bars(Math.floor(nowMs / 1000 / 300) * 300, true, { asOf: nowMs - 10_000 }));
  const m = mountTerrainLive(cv, { px, fetchJson: async u => { calls.push(u); const a = answer(u); if (a instanceof Error) throw a; return a; }, now: () => nowMs, doc, win, isOn: over.isOn ?? (() => true), setNote: t => notes.push(t) });
  return { m, cv, g, timers, overlays, calls, notes, win, setNow: v => { nowMs = v; }, setAnswer: f => { answer = f; } };
}
const geomT = { lo: 4900, hi: 5100, PL: 78, PT: 34, pw: 880, ph: 400, spot: 5000, refMove: { move: 50, source: 'implied' }, levels: LV };
const flush = () => new Promise(r => setTimeout(r, 0));

test('controller: update reads the desk bars once, paints the overlay, sets the legend note, starts two timers, and marks the overlay no-export', async () => {
  const t = rig(); t.m.update(geomT, 'GOLD'); await flush();
  assert.deepEqual(t.calls, ['/api/desk-bars?inst=GOLD&tf=5m&days=1']);
  assert.equal(t.overlays.length, 1); assert.equal(t.overlays[0].attrs['data-noexport'], ''); assert.equal(t.overlays[0].attrs['aria-hidden'], 'true'); assert.equal(t.cv._overlayCv, t.overlays[0]);
  assert.match(t.overlays[0].attrs['aria-label'], /Live price on the terrain: now 5000\.5/);
  assert.ok(t.g.texts.some(x => /^now 5000\.5/.test(x.t))); assert.match(t.notes.at(-1), /price now/);
  assert.equal(t.timers.filter(x => x.on).length, 2); assert.deepEqual(t.timers.map(x => x.ms), [30_000, 15_000]);
  t.m.update(geomT, 'GOLD'); await flush(); assert.equal(t.calls.length, 1, 'a redraw of the same market does not refetch');
});

test('controller: a different market refetches; no desk name (no live price for that market) fetches nothing and clears the note', async () => {
  const t = rig(); t.m.update(geomT, 'GOLD'); await flush();
  t.m.update(geomT, 'NQ'); await flush(); assert.equal(t.calls.at(-1), '/api/desk-bars?inst=NQ&tf=5m&days=1');
  const n = t.calls.length; t.m.update(geomT, null); await flush(); assert.equal(t.calls.length, n); assert.equal(t.notes.at(-1), ''); assert.equal(t.m.live(), null);
});

test('controller: the switch off paints nothing and fetches nothing; a failed read is reported without throwing', async () => {
  const off = rig({ isOn: () => false }); off.m.update(geomT, 'GOLD'); await flush(); assert.equal(off.calls.length, 0); assert.equal(off.timers.length, 0);
  const bad = rig({ answer: () => new Error('boom') }); bad.m.update(geomT, 'GOLD'); await flush();
  assert.equal(bad.m.live(), null); assert.equal(bad.m.error(), 'boom'); assert.match(bad.notes.at(-1), /not available for this market right now/);
  const none = rig({ answer: () => ({ ok: false, error: 'unknown instrument X' }) }); none.m.update(geomT, 'GOLD'); await flush(); assert.equal(none.m.error(), 'unknown instrument X');
});

test('controller: the poll re-reads while the week is open, not while it is shut (it keeps the close), and not while the tab is hidden', async () => {
  const t = rig(); t.m.update(geomT, 'GOLD'); await flush();
  t.timers[0].f(); await flush(); assert.equal(t.calls.length, 2, 'open week: re-read');
  t.win.document.visibilityState = 'hidden'; t.timers[0].f(); await flush(); assert.equal(t.calls.length, 2, 'hidden: no read');
  t.win.document.visibilityState = 'visible'; t.setNow(SAT);
  t.setAnswer(() => bars(Date.parse('2026-11-13T21:55:00Z') / 1000, false)); t.timers[0].f(); await flush(); assert.equal(t.calls.length, 2, 'shut with a price in hand: no read');
  t.timers[1].f(); assert.ok(t.g.texts.some(x => /^at close /.test(x.t)), 'the repaint re-ages it to "at close" when the week shuts');
});

test('controller: stop removes the overlay, clears both timers and the export hook; a stopped controller ignores updates', async () => {
  const t = rig(); t.m.update(geomT, 'GOLD'); await flush(); t.m.stop();
  assert.equal(t.overlays[0].isIn, false); assert.equal(t.cv._overlayCv, null); assert.equal(t.timers.filter(x => x.on).length, 0);
  const n = t.calls.length; t.m.update(geomT, 'NQ'); await flush(); assert.equal(t.calls.length, n);
  const gone = rig(); gone.m.update(geomT, 'GOLD'); await flush(); gone.cv.isConnected = false; gone.timers[0].f(); assert.equal(gone.timers.filter(x => x.on).length, 0, 'a canvas that left the page stops its own timers');
});
