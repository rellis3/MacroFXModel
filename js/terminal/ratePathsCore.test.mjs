// Tests for js/terminal/ratePathsCore.js (RATE PATHS hologram): parsing the real API shapes (/api/cb-expectations, /api/fed-path, /api/cb-path/boe),
// the strip solvers, sorting, the scale cap, label placement and the spoken line. Run: node js/terminal/ratePathsCore.test.mjs
import assert from 'node:assert/strict';
import { buildLanes, stripSteps3m, stripSteps1m, stepWords, heightOf, scaleOf, windowDates, monthTicks, placeLabels, ratePathsScript, dateLabel, depthOf } from './ratePathsCore.js';

const DAY = 864e5, NOW = Date.parse('2026-11-20T12:00:00Z');
let n = 0; const t = (name, fn) => { fn(); n++; };
const ms = s => Date.parse(s + 'T00:00:00Z');
const cal = {
  fomc: [{ date: '2026-10-28' }, { date: '2026-12-09' }, { date: '2027-01-27' }, { date: '2027-03-17' }, { date: '2027-04-28' }],
  ecb: ['2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-10'],
  boe: [{ date: '2026-12-17' }, { date: '2027-02-04' }],
  boj: [{ date: '2026-12-18' }, { date: '2027-01-22' }, { date: '2027-03-18' }, { date: '2027-04-28' }],
  snb: [{ date: '2026-12-10' }, { date: '2027-03-18' }, { date: '2027-06-24' }],
  boc: [{ date: '2026-12-09' }, { date: '2027-01-27' }, { date: '2027-03-03' }],
  rba: [{ date: '2026-12-08' }, { date: '2027-02-09' }, { date: '2027-03-23' }],
  rbnz: [{ date: '2026-12-09' }],
};
// a quarterly compounded strip built from a known per-meeting path (so the solver must recover its direction and size)
const lvl = (L0, path, tm) => path.reduce((v, [d, s]) => (ms(d) <= tm ? v + s / 100 : v), L0);
function strip3m(L0, path, path4w) {
  const q = ['20261216', '20270317', '20270616', '20270915'], ymd = e => Date.UTC(+e.slice(0, 4), +e.slice(4, 6) - 1, +e.slice(6, 8));
  return q.map((e, i) => { const end = ymd(e), st = i ? ymd(q[i - 1]) : end - 91 * DAY, T = Math.floor(NOW / DAY) * DAY, avg = p => { let s = 0, k = 0; for (let x = st; x < end; x += DAY) { s += x < T ? L0 : lvl(L0, p, x); k++; } return s / k; };
    return { local: 'S' + e, expiry: e, month: e.slice(0, 6), rate: +avg(path).toFixed(4), rate4wAgo: path4w ? +avg(path4w).toFixed(4) : null }; });
}
function strip1m(L0, path, path4w) {
  const out = []; for (let k = 0; k < 8; k++) { const y = 2026 + Math.floor((10 + k) / 12), m = (10 + k) % 12, a = Date.UTC(y, m, 1), b = Date.UTC(y, m + 1, 1), f = p => { let s = 0, c = 0; for (let x = a; x < b; x += DAY) { s += lvl(L0, p, x - DAY); c++; } return s / c; };
    out.push({ month: `${y}${String(m + 1).padStart(2, '0')}`, rate: +f(path).toFixed(4), rate4wAgo: path4w ? +f(path4w).toFixed(4) : undefined }); }
  return out;
}

t('windowDates keeps only upcoming meetings inside the window, sorted, deduplicated, accepts {date} or strings', () => {
  assert.deepEqual(windowDates([{ date: '2027-01-27' }, '2026-12-09', { date: '2026-10-28' }, '2026-12-09', { date: 'junk' }], NOW), ['2026-12-09', '2027-01-27']);
  assert.deepEqual(windowDates(null, NOW), []);
  assert.deepEqual(windowDates(['2026-11-20', '2028-06-01'], NOW), []);   // today and past the horizon excluded
});

t('stripSteps3m recovers a cutting path from a quarterly strip (direction and size)', () => {
  const rungs = strip3m(2.25, [['2026-12-09', -10], ['2027-01-27', -10], ['2027-03-03', -5]]);
  const s = stripSteps3m(rungs, ['2026-12-09', '2027-01-27', '2027-03-03'], 2.25, { now: NOW });
  assert.ok(s && s.length === 3);
  assert.ok(s.at(-1).cumBp < -18 && s.at(-1).cumBp > -32, `cum ${s.at(-1).cumBp}`);
  assert.ok(s.every(x => x.stepBp <= 0.5));
});
t('stripSteps3m: no policy, no rungs, NaN rates or no meeting inside the strip -> null, never throws', () => {
  assert.equal(stripSteps3m(strip3m(1, []), ['2026-12-09'], NaN, { now: NOW }), null);
  assert.equal(stripSteps3m([], ['2026-12-09'], 1, { now: NOW }), null);
  assert.equal(stripSteps3m([{ expiry: '20261216', rate: 'x' }], ['2026-12-09'], 1, { now: NOW }), null);
  assert.equal(stripSteps3m(strip3m(1, []), ['2029-01-01'], 1, { now: NOW }), null);
});
t('stripSteps1m (fed funds style) prices the meeting month from the next clean month', () => {
  const s = stripSteps1m(strip1m(3.6, [['2026-12-08', 10], ['2027-02-09', 10]]), ['2026-12-08', '2027-02-09']);
  assert.ok(s && Math.abs(s[0].stepBp - 10) < 1.5 && Math.abs(s[1].cumBp - 20) < 2, JSON.stringify(s));
  assert.equal(stripSteps1m([], ['2026-12-08']), null);
});

t('stepWords: probability of one 25bp move, counts moves above it, flat under 2bp', () => {
  assert.equal(stepWords(-18, 0.72), '-18bp, 72% of a cut priced');
  assert.equal(stepWords(8), '+8bp, 32% of a hike priced');
  assert.equal(stepWords(-40), '-40bp, 1.6 cuts priced');
  assert.match(stepWords(1), /no move priced/);
  assert.equal(stepWords(NaN), 'no reading');
});

t('heightOf is linear in bp, clamps past the scale and says so; scale floored at 25bp and capped at 200bp', () => {
  assert.equal(heightOf(50, 100, 2).y, 1); assert.equal(heightOf(-25, 100, 2).y, -0.5);
  assert.deepEqual(heightOf(300, 200, 1), { y: 1, capped: true }); assert.equal(heightOf(NaN, 100).y, 0);
  assert.equal(scaleOf([{ meetings: [{ cumBp: 4 }] }]).scaleBp, 25);
  assert.deepEqual(scaleOf([{ meetings: [{ cumBp: -350 }], ghost: [10] }]), { scaleBp: 200, capped: true });
  assert.equal(scaleOf([]).scaleBp, 25);
});

// the real shapes, all three feeds
const fed = { ok: true, asOf: '2026-11-19', zq: { asOf: '2026-11-19',
  meetings: [{ meeting: '2026-10-28', rBefore: 3.9, rAfter: 3.63, moveBp: -27, probPct: -108 }, { meeting: '2026-12-09', rBefore: 3.63, rAfter: 3.45, moveBp: -18, probPct: -72 }, { meeting: '2027-01-27', rBefore: 3.45, rAfter: 3.36, moveBp: -9, probPct: -36 }],
  weekAgo: { meetings: [{ meeting: '2026-12-09', rAfter: 3.55 }] }, ago: { 28: { meetings: [{ meeting: '2026-12-09', rAfter: 3.54 }, { meeting: '2027-01-27', rAfter: 3.46 }] } } } };
const boe = { ok: true, asOf: '2026-11-19', bankRate: { pct: 4 }, meetings: [{ date: '2026-12-17', stepBp: 8, cumBp: 8, pMove: 0.32, ticks: { m1: 3.72 } }, { date: '2027-02-04', stepBp: 7, cumBp: 15, pMove: 0.28, ticks: { m1: null } }] };
const cbx = { ok: true, asOf: '2026-11-19T21:00:00Z', policy: { USD: { rate: 3.625 }, EUR: { rate: 2 }, GBP: { rate: 4 }, JPY: { rate: 0.75 }, CHF: { rate: 0 }, CAD: { rate: 2.25 }, AUD: { rate: 3.6 } },
  banks: {
    USD: { kind: '1m', source: 'ZQ', rungs: strip1m(3.63, [['2026-12-09', -25]]) },
    JPY: { kind: '3m', source: 'TONA', rungs: strip3m(0.73, [['2026-12-18', 12], ['2027-01-22', 8], ['2027-03-18', 6]], [['2026-12-18', 5]]) },
    CAD: { kind: '3m', source: 'CORRA', rungs: strip3m(2.25, [['2026-12-09', -10], ['2027-01-27', -10]]) },
    AUD: { kind: 'bill', source: 'bank bill', rungs: [{ month: '202612', rate: 3.9 }] },
    CHF: { kind: '3m', source: 'SARON', rungs: [] },
  } };

t('buildLanes: Fed from the ZQ path (past meetings dropped, ghost = 4 weeks ago), BoE from its OIS curve (ghost from ticks.m1)', () => {
  const m = buildLanes({ cbx, fed, boe, calendars: cal, now: NOW });
  const us = m.lanes.find(l => l.ccy === 'USD'), gb = m.lanes.find(l => l.ccy === 'GBP');
  assert.equal(us.meetings[0].date, '2026-12-09'); assert.equal(us.next.stepBp, -18); assert.equal(us.next.prob, 0.72);
  assert.equal(us.meetings[1].cumBp, -27); assert.equal(us.policy, 3.625); assert.equal(us.ghostLabel, '4 weeks ago');
  assert.deepEqual(us.ghost, [-9, -17]); assert.equal(us.movedBp, -10);
  assert.equal(gb.totalBp, 15); assert.equal(gb.ghost[0], -28); assert.equal(gb.ghost[1], null); assert.equal(gb.next.prob, 0.32);
});
t('buildLanes: strips for the rest, bill strips and empty banks reported missing with a reason, RBNZ missing', () => {
  const m = buildLanes({ cbx, fed, boe, calendars: cal, now: NOW });
  const jp = m.lanes.find(l => l.ccy === 'JPY'), ca = m.lanes.find(l => l.ccy === 'CAD');
  assert.ok(jp.totalBp > 15 && jp.ghost && jp.ghost.at(-1) < jp.totalBp, `jp ${jp.totalBp} ghost ${jp.ghost}`);
  assert.ok(ca.totalBp < -12);
  const why = Object.fromEntries(m.missing.map(x => [x.ccy, x.why]));
  assert.match(why.AUD, /bill/); assert.ok(why.CHF); assert.ok(why.NZD); assert.ok(why.EUR);
  // sorted most easing first, most tightening last
  for (let i = 1; i < m.lanes.length; i++) assert.ok(m.lanes[i - 1].totalBp <= m.lanes[i].totalBp);
  assert.equal(m.lanes[0].ccy, 'USD'); assert.equal(m.lanes.at(-1).ccy, 'JPY');
});
t('buildLanes: the USD futures strip stands in when the ZQ path is missing; everything missing -> no lanes, no throw', () => {
  const m = buildLanes({ cbx, fed: null, boe: null, calendars: cal, now: NOW });
  const us = m.lanes.find(l => l.ccy === 'USD'); assert.ok(us && us.next.stepBp < -18, JSON.stringify(us?.next));
  assert.ok(m.lanes.find(l => l.ccy === 'GBP') == null);
  const e = buildLanes({}); assert.deepEqual(e.lanes, []); assert.equal(e.missing.length, 8);
  const junk = buildLanes({ cbx: { banks: { USD: { kind: '1m', rungs: [{ month: 'x', rate: NaN }] } } }, fed: { zq: { meetings: [{ meeting: '2026-12-09', rAfter: 'n/a' }] } }, boe: { ok: true, meetings: [{}] }, calendars: cal, now: NOW });
  assert.deepEqual(junk.lanes, []);
});

t('placeLabels keeps the higher-priority box, nudges or drops the clashing one, stays inside the screen, honours per-box tries', () => {
  const b = [{ x: 10, y: 50, w: 100, h: 14, pri: 1 }, { x: 20, y: 52, w: 100, h: 14, pri: 5 }, { x: 900, y: 10, w: 200, h: 14, pri: 1 }];
  placeLabels(b, { W: 1000, H: 400 });
  assert.ok(b[1].ok && b[1].y === 52); assert.ok(b[0].ok && Math.abs(b[0].y - 52) >= 16); assert.equal(b[2].ok, false);
  const c = [{ x: 0, y: 0, w: 50, h: 10, pri: 9 }, { x: 0, y: 0, w: 50, h: 10, pri: 1, tries: [0] }];
  placeLabels(c, { W: 100, H: 100 }); assert.equal(c[1].ok, false);
});

t('dates, depth and month ticks', () => {
  assert.equal(dateLabel('2026-12-09', NOW), '9 DEC'); assert.equal(dateLabel('2027-01-27', NOW), '27 JAN 27');
  assert.equal(depthOf('2026-11-20', NOW), 0); assert.ok(depthOf('2027-05-20', NOW) > 0.4 && depthOf('2027-05-20', NOW) < 0.5); assert.equal(depthOf('2030-01-01', NOW), 1);
  const mt = monthTicks(NOW); assert.equal(mt[0].label, 'DEC'); assert.equal(mt[1].label, 'JAN 27'); assert.ok(mt.every((x, i) => i === 0 || x.f > mt[i - 1].f));
});

t('the spoken line: biggest easer and tightener, the next meetings of the biggest movers, one not-a-forecast phrase, no "will"', () => {
  const m = buildLanes({ cbx, fed, boe, calendars: cal, now: NOW }), s = ratePathsScript(m);
  assert.match(s, /most easing is priced for the Fed/); assert.match(s, /most tightening for the Bank of Japan/);
  assert.match(s, /9 December/); assert.match(s, /not a forecast/); assert.doesNotMatch(s, /\bwill\b|\bexpect|\btarget/i);
  assert.ok(s.split(/(?<=\.)\s/).length <= 4, s);
  assert.equal(ratePathsScript({ lanes: [] }), null); assert.equal(ratePathsScript(null), null);
});

console.log(`ratePathsCore: ${n} tests passed`);
