// Tests for js/eveningDay.js: the day shape, the session heat strip, morning against day, and tomorrow.   node js/eveningDay.test.mjs
import assert from 'node:assert/strict';
import { dayPaths, bookPath, dayShapeSvg, sessionHeatSvg, morningVsDay, tomorrowBlock, nextTradingDate, buildEveningDay } from './eveningDay.js';
import { buildTimeline } from './eveningTimeline.js';
import { londonMs, windowFor, scoreDay } from './deskScore.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const D = '2026-11-16', { entryMs, exitMs } = windowFor(D);
const L = (open, u) => ({ open, up: { p50: open + u }, down: { p50: open - u } });
// a market's M1 bars: price(t in 0..1 of the window) -> a bar per minute
const mk = (open, f) => { const out = [], N = Math.round((exitMs - entryMs) / 60000); for (let i = 0; i < N; i++) { const p0 = open + f(i / N), p1 = open + f((i + 1) / N); out.push({ time: entryMs / 1000 + i * 60, open: p0, high: Math.max(p0, p1), low: Math.min(p0, p1), close: p1 }); } return out; };
const bars = { SPX500: mk(7000, x => (x < 0.55 ? 0 : -(x - 0.55) / 0.45 * 100)), NQ: mk(25000, x => -x * 360), EURUSD: mk(1.1, x => -x * 0.0021), GOLD: mk(3900, x => 6 * Math.sin(x * 6)), USDJPY: mk(159, x => (x > 0.8 ? 0.2 : 0)) };
const cards = { SPX500: { rating: 'SHORT', size: 0.4, levels: L(7000, 50) }, NQ: { rating: 'SHORT', size: 0.4, levels: L(25000, 200) }, EURUSD: { rating: 'SHORT', size: 0.45, levels: L(1.1, 0.0023) }, GOLD: { rating: 'FLAT', levels: L(3900, 20) }, USDJPY: { rating: 'FLAT', levels: L(159, 0.5) } };

t('day paths: cumulative move in u at 15-minute steps from the 08:00 open to 21:00, only for markets with levels', () => {
  const p = dayPaths(bars, cards, D); assert.deepEqual(Object.keys(p).sort(), ['EURUSD', 'GOLD', 'NQ', 'SPX500', 'USDJPY']);
  assert.equal(p.NQ.pts.length, 53); assert.equal(p.NQ.pts[0].v, 0); assert.equal(p.NQ.pts[0].t, entryMs); assert.equal(p.NQ.pts.at(-1).t, exitMs);
  assert.ok(Math.abs(p.NQ.final - -1.8) < 0.05, `NQ -360 / 200 = -1.8, got ${p.NQ.final}`); assert.ok(Math.abs(p.SPX500.final - -2) < 0.05);
  assert.equal(dayPaths({ X: bars.NQ }, {}, D).X, undefined, 'no card, no levels, no path');
});

t('the book path ends on the day score (size-weighted mean of the clipped, signed moves)', () => {
  const p = dayPaths(bars, cards, D), bk = bookPath(p, cards), last = bk.at(-1).v;
  const W = 0.4 + 0.4 + 0.45, expect = (0.4 * 2 + 0.4 * 1.8 + 0.45 * (0.0021 / 0.0023)) / W;
  assert.ok(Math.abs(last - expect) < 0.03, `book ${last} vs ${expect}`);
  const run = { head: { ok: true }, date: D, mode: 'full', finishedAt: `${D}T07:50:00Z` }; // scoreDay needs a run: here only checking the formula by hand
  assert.equal(bookPath(p, { GOLD: cards.GOLD }), null, 'no live sized card, no book line');
});

const tl = buildTimeline({ date: D, wire: [], events: [{ ms: londonMs(D, 13, 30), country: 'CA', event: 'CPI m/m', impact: 'high', actual: '0.2%', estimate: '0.3%' }, { ms: londonMs(D, 17, 0), country: 'US', event: 'Fed Chairman Warsh Speaks', impact: 'high' }], scorecards: [],
  bursts: [{ inst: 'SPX500', u: -2, fromMs: londonMs(D, 14, 40), toMs: londonMs(D, 15, 10), from: '14:40', to: '15:10', share: 80 }, { inst: 'NQ', u: -1.8, fromMs: londonMs(D, 14, 45), toMs: londonMs(D, 15, 15), from: '14:45', to: '15:15', share: 70 }], now: exitMs + 300e3 });

const noOverlap = boxes => { for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; assert.ok(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1, `labels overlap: ${a.id} / ${b.id}`); } };

t('the day shape draws the biggest movers and the book, shades the bursts, ticks the prints, and no label overlaps another', () => {
  const p = dayPaths(bars, cards, D), bk = bookPath(p, cards), r = dayShapeSvg(p, { book: bk, clusters: tl.bursts, beats: tl.sessions.flatMap(s => s.beats), date: D });
  assert.equal((r.svg.match(/<polyline/g) ?? []).length, 6, 'five movers plus the book');
  assert.match(r.svg, /stroke-dasharray="5 3"/); assert.match(r.svg, /Book \+/); assert.match(r.svg, />A</); assert.match(r.svg, /13:30 CA/); assert.match(r.svg, /17:00 US/);
  assert.deepEqual(r.legend.map(l => l.ch), ['A']); noOverlap(r.boxes);
  assert.ok(!/(#fff|white)"[^>]*fill="(#fff)"[^>]*>.*Book/.test('') && r.svg.includes('aria-label'), 'it has an accessible name');
  assert.equal(dayShapeSvg({}, { date: D }).svg, '');
});

t('the session heat strip has a cell per market and hour, London and New York bands, and no overlapping labels', () => {
  const p = dayPaths(bars, cards, D), h = sessionHeatSvg(p, { date: D });
  assert.equal(h.cells.length, 5 * 13); assert.match(h.svg, /LONDON/); assert.match(h.svg, /NEW YORK \(FROM 13:30\)/); noOverlap(h.boxes);
  const spx = h.cells.filter(c => c.inst === 'SPX500'); assert.ok(spx.filter(c => c.hour <= 14).every(c => Math.abs(c.d) < 0.05), 'flat until 15:00'); assert.ok(spx.filter(c => c.hour >= 16).every(c => c.d < 0), 'fell every hour from 16:00');
  assert.ok(Math.abs(spx.reduce((s, c) => s + c.d, 0) - p.SPX500.final) < 0.1, 'the hours add up to the day');
});

const tr = { dayScore: 1.1251, morning: { headline: 'Risk-off at medium conviction: credit stress and a blocked gate. The book is signed small.' }, regime: { tone: 'risk_off', conviction: 'medium', realised: -1.4815, basket: 14, verdict: 'right' },
  currencies: { ranking: ['USD', 'CAD', 'GBP', 'JPY', 'CHF', 'EUR', 'AUD', 'NZD'], realisedRanking: ['USD', 'JPY', 'EUR', 'CHF', 'CAD', 'GBP', 'AUD', 'NZD'], strongest: { ccy: 'USD', realisedRank: 1, of: 8, verdict: 'right' }, weakest: { ccy: 'NZD', realisedRank: 8, of: 8, verdict: 'right' },
    perCcy: [{ ccy: 'USD', bias: 1, realised: 0.96, verdict: 'right' }, { ccy: 'EUR', bias: -1, realised: 0.2, verdict: 'wrong' }, { ccy: 'GBP', bias: 0, realised: -0.05, verdict: 'no call' }, { ccy: 'JPY', bias: 0, realised: 0.94, verdict: 'no call' }, { ccy: 'AUD', bias: -1, realised: -0.74, verdict: 'right' }, { ccy: 'NZD', bias: -1, realised: -0.98, verdict: 'right' }, { ccy: 'CAD', bias: 1, realised: 0.05, verdict: 'push' }, { ccy: 'CHF', bias: 0, realised: 0.14, verdict: 'no call' }] },
  cards: [{ inst: 'AUDJPY', verdict: 'right', p50: { reached: true }, first: 'p50' }, { inst: 'BTCUSD', verdict: 'wrong', p50: { reached: false }, first: null }, { inst: 'NQ', verdict: 'right', p50: { reached: true }, first: 'p50' }] };

t('morning against day: the ruling, the currency calls right or wrong, the book, and the "not proof of an edge" label', () => {
  const html = morningVsDay(tr, { S: 1.1251, placebo: { p95: 0.81 } });
  assert.match(html, /This morning the desk said/); assert.match(html, /What the day did/); assert.match(html, /<b>The ruling\.<\/b> Risk-off at medium conviction: credit stress and a blocked gate\./); assert.equal(html.split(/risk-off at medium conviction/i).length - 1, 1, 'the ruling is not said twice'); assert.match(html, /the 14-market risk basket moved −1\.48 u, so the call was <b>right<\/b>/);
  assert.match(html, /3 of 5 leaning calls were right; wrong: EUR weaker but \+0\.2 u/); assert.match(html, /USD was ranked strongest and finished 1 of 8; NZD was ranked weakest and finished 8 of 8/);
  assert.match(html, /2 of 3 cards finished on the right side; 2 reached their first forecast line; 2 reached it before the other side/); assert.match(html, /above the range random books score \(95th percentile \+0\.81 u\)/);
  assert.match(html, /Historical review, not proof of an edge/); assert.equal(morningVsDay(null, null), '');
});

t('tomorrow: only the next London day, high impact, in time order; a stretched currency gets one rule-built sentence; none is said when it is not stretched', () => {
  const nd = '2026-11-17', ev = [{ ms: londonMs(nd, 13, 30), country: 'US', event: 'Retail Sales m/m', impact: 'high', estimate: '0.2%', prev: '0.8%' }, { ms: londonMs(nd, 7, 0), country: 'GB', event: 'Average Earnings Index 3m/y', impact: 'high', estimate: '3.5%', prev: '3.7%' },
    { ms: londonMs(nd, 9, 0), country: 'EU', event: 'Minor', impact: 'low' }, { ms: londonMs(D, 17, 0), country: 'US', event: 'Today', impact: 'high' }, { ms: londonMs('2026-11-18', 1, 0), country: 'AU', event: 'Later', impact: 'high' }];
  const r = tomorrowBlock({ events: ev, realised: tr.currencies.perCcy.reduce((o, c) => ({ ...o, [c.ccy]: c.realised }), {}), date: D, noteFn: e => (e.country === 'US' ? { range: 'USDJPY range +0.12' } : null) });
  assert.deepEqual(r.rows.map(x => `${x.hm} ${x.country}`), ['07:00 GB', '13:30 US']); assert.equal(r.date, nd);
  const us = r.rows[1]; assert.match(us.tie, /USD was today's strongest currency \(\+1\.0 u\), so this lands on a move that is already stretched\./); assert.match(us.hist, /usual range effect: USDJPY range \+0\.12/);
  assert.equal(r.rows[0].tie, '', 'GBP finished mid-table'); assert.match(r.html, /Retail Sales m\/m/); assert.match(r.html, /No measured effect on file for this release\./);
  assert.match(tomorrowBlock({ events: [], date: D }).html, /No high-impact release on tomorrow/);
});

t('a Friday evening looks to Monday', () => {
  assert.equal(nextTradingDate('2026-11-13'), '2026-11-16'); assert.equal(nextTradingDate('2026-11-16'), '2026-11-17');
  const r = tomorrowBlock({ events: [{ ms: londonMs('2026-11-16', 13, 30), country: 'US', event: 'CPI', impact: 'high' }], date: '2026-11-13' }); assert.equal(r.date, '2026-11-16'); assert.equal(r.rows.length, 1);
});

t('two releases at the same minute from one country are one row', () => {
  const nd = '2026-11-17', r = tomorrowBlock({ events: [{ ms: londonMs(nd, 13, 30), country: 'US', event: 'Core Retail Sales m/m', impact: 'high', estimate: '0.4%', prev: '0.9%' }, { ms: londonMs(nd, 13, 30), country: 'US', event: 'Retail Sales m/m', impact: 'high', estimate: '0.2%', prev: '0.8%' }], date: D });
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].event, 'Core Retail Sales m/m and Retail Sales m/m'); assert.match(r.rows[0].detail, /Core Retail Sales m\/m: forecast 0\.4%, previous 0\.9%; Retail Sales m\/m: forecast 0\.2%, previous 0\.8%/);
});

console.log(`eveningDay: ${n} tests passed`);
