// The Options → Path chart's zoom maths (pathZoom.js) and the zoomed drawing (optionsView.js renderWalk / walkTip).
//   node js/terminal/pathZoom.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as PZ from './pathZoom.js';
import * as OPV from './optionsView.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const B = () => PZ.baseScale({ t0: 100, tNow: 130, tEnd: 330, L: 40, xNow: 100, R: 400 });

test('base scale: piecewise, history left of now, the future right; inverse round-trips', () => {
  const b = B();
  near(b.f(100), 40); near(b.f(130), 100); near(b.f(330), 400); near(b.f(230), 250);
  for (const t of [100, 117, 130, 131, 250, 330]) near(b.inv(b.f(t)), t);
  near(b.futPxPerDay, 1.5); near(b.histPxPerDay, 2);
});

test('zoom transform: identity, windows, clamps and limits', () => {
  const b = B(), lim = { kMin: 1, kMax: PZ.maxZoom(b, 5) };
  near(lim.kMax, 360 / 7.5);   // 5 days fill the plot
  const [a0, b0] = PZ.visibleWindow(b, PZ.IDENTITY); near(a0, 100); near(b0, 330);
  // a window round-trips through its transform
  const tr = PZ.windowTransform(b, 140, 170, lim), [a, c] = PZ.visibleWindow(b, tr); near(a, 140, 1e-6); near(c, 170, 1e-6);
  // never zoom out past the full view, never in past ~5 days, never pan past either end
  assert.deepEqual(PZ.clampTransform({ k: 0.3, x: 50 }, b, lim), { k: 1, x: 0 });
  assert.equal(PZ.clampTransform({ k: 1e4, x: 0 }, b, lim).k, lim.kMax);
  const right = PZ.clampTransform({ k: 4, x: -1e6 }, b, lim), [, r1] = PZ.visibleWindow(b, right); near(r1, 330);
  const left = PZ.clampTransform({ k: 4, x: 1e6 }, b, lim), [l0] = PZ.visibleWindow(b, left); near(l0, 100);
  // a 2-day window is widened to the 5-day limit
  const tiny = PZ.windowTransform(b, 200, 202, lim), [ta, tb] = PZ.visibleWindow(b, tiny); near(tb - ta, 5, 1e-6);
});

test('presets: 2W / 1M / 3M put now a fifth of the way in; All is the full view; chips are recognised; centring', () => {
  const b = B(), lim = { kMin: 1, kMax: PZ.maxZoom(b, 5) };
  for (const [p, n] of [['2W', 14], ['1M', 31], ['3M', 92]]) {
    const tr = PZ.presetTransform(b, p, lim), z = PZ.zoomScale(b, tr), [, end] = PZ.visibleWindow(b, tr);
    near(end, 130 + n, 1e-6); near((z.f(130) - b.L) / (b.R - b.L), 0.2, 1e-9);
    assert.equal(PZ.presetOf(b, tr, lim), p);
  }
  assert.deepEqual(PZ.presetTransform(b, 'All', lim), { k: 1, x: 0 }); assert.equal(PZ.presetOf(b, PZ.IDENTITY, lim), 'All');
  assert.equal(PZ.presetOf(b, { k: 2.345, x: -300 }, lim), null);
  const c = PZ.centreOn(b, PZ.presetTransform(b, '1M', lim), 250, lim), [a, e] = PZ.visibleWindow(b, c); near((a + e) / 2, 250, 1e-6);
});

test('y domain: follows the data; the shading widens it but the data keeps at least 70% of the height', () => {
  const [lo, hi] = PZ.yDomain([100, 110]); assert.ok(lo < 100 && hi > 110 && hi - lo < 13);
  const [lo2, hi2] = PZ.yDomain([100, 110], [102, 108]); near(lo2, lo); near(hi2, hi);   // shading inside the data changes nothing
  const [lo3, hi3] = PZ.yDomain([100, 110], [90, 120]); assert.ok(lo3 < 100 && hi3 > 110);
  const [lo4, hi4] = PZ.yDomain([100, 110], [0, 1000]), inner = (hi4 - lo4) / 1.2;   // a very wide cone is capped
  near(10 / inner, 0.7, 1e-9); assert.ok(lo4 > 90 && hi4 < 120);
  const [lo5, hi5] = PZ.yDomain([4000]); assert.ok(hi5 > lo5, 'a single price still gets a span');
  assert.equal(PZ.yDomain([null, NaN]), null);
  assert.deepEqual(PZ.niceTicks(3812, 4189, 4), [3900, 4000, 4100]);
  assert.deepEqual(PZ.niceTicks(1.1, 1.2, 5), [1.1, 1.12, 1.14, 1.16, 1.18, 1.2]);
});

test('labels: biggest first, no two overlap, the rest dropped; obstacles and bounds respected', () => {
  const c = [{ id: 'a', x: 50, y: 50, r: 4, w: 40, h: 12, pri: 0.1 }, { id: 'b', x: 52, y: 50, r: 4, w: 40, h: 12, pri: 0.9 }, { id: 'c', x: 54, y: 51, r: 4, w: 40, h: 12, pri: 0.5 },
    { id: 'd', x: 55, y: 50, r: 4, w: 40, h: 12, pri: 0.3 }, { id: 'e', x: 53, y: 49, r: 4, w: 40, h: 12, pri: 0.2 }, { id: 'f', x: 51, y: 52, r: 4, w: 40, h: 12, pri: 0.05 },
    { id: 'g', x: 52, y: 51, r: 4, w: 40, h: 12, pri: 0.01 }];
  const out = PZ.placeLabels(c, { bounds: { x0: 0, x1: 300, y0: 0, y1: 300 } });
  assert.ok(out.has('b'), 'the biggest book is always labelled'); assert.ok(out.size < c.length, 'a crowd drops some labels');
  const boxes = [...out.values()].map(v => v.box);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], z = boxes[j]; assert.ok(!(a.x0 < z.x1 && z.x0 < a.x1 && a.y0 < z.y1 && z.y0 < a.y1), 'no overlap');
  }
  // an obstacle on the right pushes the label to the left; out of bounds is never used
  const o = PZ.placeLabels([{ id: 'x', x: 100, y: 100, r: 5, w: 30, h: 12, pri: 1 }], { obstacles: [{ x0: 100, x1: 160, y0: 60, y1: 140 }] });
  assert.equal(o.get('x').anchor, 'end');
  assert.equal(PZ.placeLabels([{ id: 'y', x: 5, y: 5, r: 3, w: 80, h: 12 }], { bounds: { x0: 0, x1: 40, y0: 0, y1: 40 } }).size, 0);
});

test('ticks: thinned by priority, calendar steps follow the zoom', () => {
  const kept = PZ.thinTicks([{ x: 10, w: 20, pri: 1 }, { x: 25, w: 20, pri: 5 }, { x: 60, w: 20, pri: 0 }], { gap: 4 });
  assert.deepEqual(kept.map(k => k.x), [25, 60]);
  const t0 = PZ.dayNum('2026-11-06');
  const wk = PZ.timeTicks(t0, t0 + 200, 360, { minPx: 60 });   // 200 days on 360 px: months
  assert.ok(wk.length >= 3 && wk.length <= 7, String(wk.length)); assert.ok(wk.every(t => PZ.isoOfDay(t).endsWith('-01')), 'on the 1st');
  const days = PZ.timeTicks(t0, t0 + 6, 360, { minPx: 50 }); assert.ok(days.length >= 5 && days.every((t, i) => !i || t - days[i - 1] === 1));
  const weeks = PZ.timeTicks(t0, t0 + 40, 360, { minPx: 60 }); assert.ok(weeks.every(t => new Date(t * 864e5).getUTCDay() === 1), 'weeks start on Mondays');
});

test('nearest point: within the expiry line\'s reach, the closest wins', () => {
  const pts = [{ x: 100, y: 50, id: 1 }, { x: 110, y: 200, id: 2 }, { x: 300, y: 50, id: 3 }];
  assert.equal(PZ.nearestPoint(pts, 104, 190).id, 2); assert.equal(PZ.nearestPoint(pts, 104, 60).id, 1);
  assert.equal(PZ.nearestPoint(pts, 200, 50), null);
});

// ── the zoomed drawing on a synthetic gold book: many expiries in the first weeks ──
const iso = t => PZ.isoOfDay(t);
function book() {
  const now = PZ.dayNum('2026-11-05');
  const series = Array.from({ length: 60 }, (_, i) => [iso(now - 59 + i), 4000 + 3 * Math.sin(i / 3) * 10]);
  const dtes = [1, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 19, 21, 28, 35, 42, 48, 53, 55, 70, 82, 105, 110, 133, 138, 145, 172, 200];
  const expiries = dtes.map((d, i) => ({ expiry: iso(now + d), date: '2026-11-05', dte: d, totalOI: d === 19 ? 50000 : d === 70 ? 30000 : 2000 + i * 10,
    zones: [{ px: 4000 + (i % 5) * 20, oi: 1000, call: 600, put: 400 }], ladder: [[4000 + i * 10, 300, 200], [4300, 50, 10]] }));
  return { ok: true, instruments: ['GOLD'], series, state: { date: iso(now), close: 4000, sigmaDailyPct: 1.5 }, expiries };
}
test('renderWalk: zooming spreads the crowded weeks, the y axis and date ticks follow the view, small books can be hidden, the card reads', () => {
  const sm = book(), walk = OPV.zoneWalk(sm.expiries, OPV.walkOptsFor(sm, 'strike'));
  assert.equal(walk.points.length, 29); assert.ok(walk.points.filter(p => p.thin).length >= 20);
  const m = OPV.walkModel(sm, walk, { w: 404 });
  const all = OPV.renderWalk(m, PZ.IDENTITY), twoW = OPV.renderWalk(m, PZ.presetTransform(m.base, '2W', m.lim));
  assert.equal(all.dots.length, 29); assert.ok(twoW.dots.length < all.dots.length && twoW.dots.length >= 8, String(twoW.dots.length));
  assert.ok(twoW.dots.every(d => d.x >= m.L - 1 && d.x <= m.R + 1), 'visible dots inside the plot');
  // spread: in 2W the first two weeks' dots sit further apart than in the full view
  const gap = r => { const xs = r.dots.filter(d => d.p.dte <= 14).map(d => d.x); return (xs.at(-1) - xs[0]) / (xs.length - 1); };
  assert.ok(gap(twoW) > 4 * gap(all), `${gap(twoW)} vs ${gap(all)}`);
  const hidden = OPV.renderWalk(m, PZ.IDENTITY, { hideSmall: true });
  assert.ok(hidden.dots.every(d => !d.p.thin) && hidden.dots.length === 2); assert.match(hidden.svg, /27 small books hidden here/);
  assert.match(OPV.renderWalk(m, PZ.presetTransform(m.base, '2W', m.lim), { hideSmall: true }).svg, /hidden here: untick/, 'an empty stretch says why');
  assert.match(all.svg, /opt-walk-pt thin/); assert.match(all.svg, /small, faint = small book/);
  // the y axis follows the view: zoomed in, the domain is no wider than the full view's
  assert.ok(twoW.hi - twoW.lo <= all.hi - all.lo + 1e-9);
  // the date axis thins its ticks: no two date labels closer than their width
  const ticks = [...twoW.svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" font-size="9" text-anchor="middle" fill="var\(--tx3\)">([^<]+)</g)].map(x => +x[1]);
  assert.ok(ticks.length >= 2); for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] - ticks[i - 1] >= 40);
  // the card
  const p = walk.points.find(q => q.dte === 19), tip = OPV.walkTip(sm, p, 'strike');
  for (const re of [/24 Nov/, /CME · 19 days/, /strongest strike/, /from now/, /step/, /book/, /C\/P/, /biggest strike/, /1\.67/]) assert.match(tip, re);
  assert.equal(OPV.cpOfExpiry(sm, p.expiry).r.toFixed(2), '1.67');
  // pathHtml carries the toolbar, the zoomable plot and clickable rows
  const ph = OPV.pathHtml(sm, 'GOLD', { walk, anchor: 'strike', width: 404, hideSmall: true });
  for (const re of [/data-wview="2W"/, /data-wview="1M"/, /data-wview="3M"/, /data-wview="All"/, /data-wreset/, /data-wsmall checked/, /class="opt-walk-plot"[^>]*touch-action:pan-y/, /tr class="opt-walk-row[^"]*" data-exp="2026-11-24"/]) assert.match(ph, re);
});
