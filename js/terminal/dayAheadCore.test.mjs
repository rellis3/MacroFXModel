// node js/terminal/dayAheadCore.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { outlookScript, sayFig, reactionWords, londonParts, angleOf, polar, SESSIONS, ccyOfCountry, regionOf, shortName, mergeDay, assignLanes, laneOffset, pylonHeight, nextBig, countdown, hourProfile, ridgeAt, placeLabels, dayScript, sweepMins } from './dayAheadCore.js';

const D = '2026-11-20', at = hm => Date.parse(`${D}T${hm}:00Z`);          // November: London = UTC
const NOW = at('10:47');
const feed = {
  ok: true,
  ahead: [{ date: D, events: [
    { ms: at('13:30'), ccy: 'CAD', rank: 3, event: 'Retail Sales m/m', forecast: '0.3%', previous: '-0.1%' },
    { ms: at('14:45'), ccy: 'USD', rank: 3, event: 'Flash Manufacturing PMI', forecast: '52.4', previous: '52.5' },
    { ms: at('14:45'), ccy: 'USD', rank: 3, event: 'Flash Services PMI', forecast: '', previous: '54.8' },
    { ms: Date.parse('2026-11-23T13:30:00Z'), ccy: 'USD', rank: 3, event: 'Next week thing' },
    { ms: 'bad', ccy: 'USD', rank: 3, event: 'broken row' },
  ] }, { date: '2026-11-21', events: null }],
  printed: { rows: [
    { ms: at('07:00'), country: 'United Kingdom', event: 'Retail Sales (MoM)', actual: -0.6, consensus: -0.3, previous: 0.5, raw: { actual: '-0.6%', consensus: '-0.3%', previous: '0.5%' }, released: true },
    { ms: at('06:00'), country: 'Japan', event: 'Machine Tool Orders', actual: 3.1, raw: { actual: '3.1%' }, released: true },
    { ms: at('09:00'), country: 'Euro Zone', event: 'Flash Services PMI', actual: 50.1, raw: { actual: '50.1', consensus: '&nbsp;' }, released: true },
    { ms: at('09:00'), country: 'Narnia', event: 'GDP', actual: 1 },
  ] },
};
const cal = { events: [{ ms: at('09:00'), ccy: 'EUR', rank: 2, event: 'Flash Services PMI' }, { ms: at('15:00'), ccy: 'USD', rank: 2, event: 'Revised UoM Consumer Sentiment' }, { ms: at('16:00'), ccy: 'USD', rank: 0, event: 'Holiday' }] };

test('London clock and the ring geometry', () => {
  assert.deepEqual(londonParts(at('10:47')), { date: D, mins: 647, hm: '10:47', dow: 'Fri' });
  assert.equal(londonParts(Date.parse('2026-07-01T23:30:00Z')).date, '2026-07-02');                 // BST: an hour ahead
  assert.equal(londonParts(Date.parse('2026-07-01T23:30:00Z')).mins, 30);
  assert.equal(angleOf(0), 0); assert.ok(Math.abs(angleOf(360) - Math.PI / 2) < 1e-12); assert.equal(angleOf(1440), 0); assert.equal(angleOf(-360), angleOf(1080));
  const p6 = polar(360, 2); assert.ok(Math.abs(p6[0] - 2) < 1e-9 && Math.abs(p6[2]) < 1e-9);         // 06:00 to the right
  const p0 = polar(0, 2); assert.ok(Math.abs(p0[2] + 2) < 1e-9);                                    // midnight on the far side
  assert.deepEqual(SESSIONS.map(s => [s.key, s.from, s.to]), [['asia', 0, 360], ['london', 480, 780], ['ny', 780, 1260]]);
});

test('names, currencies and regions', () => {
  assert.equal(ccyOfCountry('United Kingdom'), 'GBP'); assert.equal(ccyOfCountry('Germany'), 'EUR'); assert.equal(ccyOfCountry('Narnia'), ''); assert.equal(ccyOfCountry(null), '');
  assert.equal(regionOf('USD'), 'americas'); assert.equal(regionOf('chf'), 'europe'); assert.equal(regionOf('NZD'), 'asia'); assert.equal(regionOf('XYZ'), 'other');
  assert.equal(shortName('CPI m/m', 'USD'), 'US CPI'); assert.equal(shortName('Core CPI y/y', 'USD'), 'US core CPI'); assert.equal(shortName('Non-Farm Employment Change', 'USD'), 'US payrolls');
  assert.equal(shortName('Official Bank Rate', 'GBP'), 'UK rate decision'); assert.equal(shortName('Flash Manufacturing PMI', 'EUR'), 'EZ mfg PMI');
  assert.equal(shortName('BOE Gov Bailey Speaks', 'GBP'), 'UK Bailey speaks'); assert.equal(shortName('FOMC Member Waller Speaks', 'USD'), 'US Waller speaks'); assert.equal(shortName('', 'JPY'), 'JP'); assert.equal(shortName('German Flash Manufacturing PMI', 'EUR'), 'DE mfg PMI');
  assert.ok(shortName('A very long and unknown release name indeed', 'NZD').length <= 26);
});

test('merge keeps today only, de-duplicates, attaches actuals, infers rank from type', () => {
  const d = mergeDay({ feed, cal, now: NOW });
  assert.equal(d.date, D); assert.equal(d.nowMins, 647);
  const names = d.events.map(e => `${e.hm} ${e.ccy} ${e.name}`);
  assert.ok(!names.some(n => /Next week|broken|Holiday|Narnia|Machine Tool/.test(n)), names.join('|'));   // other days, bad rows, rank 0, unknown country, low-impact printed type
  const uk = d.events.find(e => e.ccy === 'GBP'); assert.equal(uk.rank, 3); assert.equal(uk.rankFrom, 'type'); assert.equal(uk.actual, '-0.6%'); assert.equal(uk.forecast, '-0.3%'); assert.equal(uk.released, true);
  const ez = d.events.filter(e => e.ccy === 'EUR'); assert.equal(ez.length, 1); assert.equal(ez[0].actual, '50.1'); assert.equal(ez[0].forecast, null); assert.equal(ez[0].rank, 2);  // the vendor's rank stands
  const usd = d.events.filter(e => e.ccy === 'USD' && e.rank === 3); assert.equal(usd.length, 2); assert.equal(usd[1].forecast, null);                          // '' forecast -> null
  assert.ok(d.events.every((e, i, a) => !i || a[i - 1].ms <= e.ms)); assert.equal(new Set(d.events.map(e => e.id)).size, d.events.length);
  assert.equal(d.ahead, 3); assert.equal(d.high, 4);
});

test('event-day rows merge with the vendor row of the same decision and carry the history line', () => {
  const f2 = { ahead: [{ date: D, events: [{ ms: at('12:00'), ccy: 'GBP', rank: 3, event: 'Official Bank Rate', forecast: '3.75%', previous: '4.00%' }] }] };
  const ev = { events: [{ family: 'BOE', name: 'BoE rate decision', t: `${D}T12:00:00Z`, line: 'history line' }, { family: 'FOMC', name: 'FOMC decision', t: '2026-12-09T19:00:00Z' }] };
  const d = mergeDay({ feed: f2, evday: ev, now: NOW });
  assert.equal(d.events.length, 1); const e = d.events[0];
  assert.equal(e.decision, true); assert.equal(e.line, 'history line'); assert.equal(e.forecast, '3.75%'); assert.match(e.src, /ForexFactory \+ event-day/);
});

test('every feed missing or malformed is an empty day, never a throw', () => {
  for (const x of [{}, { feed: null, cal: null, evday: null }, { feed: { ahead: 'x', printed: { rows: [null, 5] } }, cal: { events: [null, { ms: NaN }] }, evday: { events: [{}] } }]) {
    const d = mergeDay({ ...x, now: NOW }); assert.deepEqual(d.events, []); assert.equal(d.high, 0);
  }
  assert.equal(nextBig(null, NOW), null); assert.equal(dayScript(null, NOW), null);
});

test('lanes split releases at the same minute; centre lane goes to the most important', () => {
  const ev = [{ mins: 870, rank: 2, ms: 1 }, { mins: 870, rank: 3, ms: 2 }, { mins: 880, rank: 3, ms: 3 }, { mins: 1000, rank: 1, ms: 4 }];
  assignLanes(ev);
  assert.deepEqual(ev.map(e => [e.lane, e.lanes]), [[2, 3], [0, 3], [1, 3], [0, 1]]);
  assert.equal(laneOffset(0), 0); assert.ok(laneOffset(1) > 0 && laneOffset(2) < 0 && Math.abs(laneOffset(3)) > Math.abs(laneOffset(1)));
});

test('pylon height is proportional to rank and caps visibly', () => {
  assert.equal(pylonHeight(3, 1.5).h, 1.5); assert.ok(Math.abs(pylonHeight(1, 1.5).h - 0.5) < 1e-12); assert.equal(pylonHeight(2).capped, false);
  assert.deepEqual(pylonHeight(7, 1.5), { h: 1.5, capped: true }); assert.equal(pylonHeight(NaN).h, 0);
});

test('next big release and the countdown', () => {
  const d = mergeDay({ feed, cal, now: NOW }), n = nextBig(d, NOW);
  assert.equal(n.ccy, 'CAD'); assert.equal(countdown(n.ms - NOW), '2h 43m');
  assert.equal(countdown(45 * 60e3 + 5), '45m'); assert.equal(countdown(20e3), 'under a minute'); assert.equal(countdown(-1), null); assert.equal(countdown(NaN), null);
  assert.equal(nextBig(d, at('15:00')), null);
});

test('hourly profile: FX pairs averaged, busiest hour = 1, gaps filled, junk refused', () => {
  const mk = f => Array.from({ length: 24 }, (_, hour) => ({ hour, mean: f(hour), n: 1000 }));
  const j = { computed_at: 'x', instruments: { EURUSD: mk(h => (h === 14 ? 20 : 5)), GBPUSD: mk(h => (h === 14 ? 10 : 5)), NQ: mk(() => 99) } };
  const p = hourProfile(j); assert.deepEqual(p.pairs, ['EURUSD', 'GBPUSD']); assert.equal(p.peak, 14); assert.equal(p.vals[14], 1); assert.ok(Math.abs(p.vals[3] - 5 / 15) < 1e-12); assert.equal(p.mean[14], 15);
  assert.equal(p.n, 1000);
  const gap = { instruments: { EURUSD: mk(h => (h === 5 ? null : 4)) } }; const g = hourProfile(gap); assert.equal(g.vals[5], 1); assert.ok(g.vals.every(v => Number.isFinite(v)));
  assert.equal(hourProfile(null), null); assert.equal(hourProfile({ instruments: {} }), null); assert.equal(hourProfile({ instruments: { EURUSD: mk(() => 0) } }), null);
  assert.equal(hourProfile({ instruments: { NQ: mk(() => 3) } }).pairs[0], 'NQ');                  // no FX pair: fall back to what is there
  // the ridge is smooth and passes through the hour centres
  assert.ok(Math.abs(ridgeAt(p, 14 * 60 + 30) - 1) < 1e-12); assert.ok(Math.abs(ridgeAt(p, 23 * 60 + 59) - ridgeAt(p, 0)) < 0.01); assert.equal(ridgeAt(null, 100), 0);
  let prev = ridgeAt(p, 13 * 60 + 30); for (let m = 13 * 60 + 31; m <= 14 * 60 + 30; m++) { const v = ridgeAt(p, m); assert.ok(v >= prev - 1e-12); prev = v; }
});

test('labels never overlap and stay on screen', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ x: 300 + (i % 3) * 4, y: 300, w: 90, h: 12, prio: i }));
  const r = placeLabels(items, 800, 600, [{ x: 0, y: 0, w: 800, h: 40 }]);
  const boxes = r.map((p, i) => p && { x: p.x - 45, y: p.y - 12, w: 90, h: 12 }).filter(Boolean);
  assert.ok(boxes.length >= 6);
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) { const A = boxes[a], B = boxes[b]; assert.ok(!(A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y)); }
  assert.ok(boxes.every(b => b.x >= 0 && b.y >= 40 && b.x + b.w <= 800));
  assert.equal(r[11] && r[11].y, 300);                                                                     // the most important keeps its first choice
  assert.deepEqual(placeLabels([{ x: NaN, y: 1, w: 1, h: 1 }], 100, 100), [null]);
});

test('the SHOW line: plain words, London times, never a forecast', () => {
  const d = mergeDay({ feed, cal, now: NOW }), t = dayScript(d, NOW);
  assert.match(t, /13:30/); assert.match(t, /14:45/); assert.match(t, /Canadian retail sales/); assert.match(t, /not a forecast/);
  assert.doesNotMatch(t, /\bwill\b|expect|target/i); assert.ok(t.split(/\s+/).length <= 60, t);
  const q = dayScript(d, at('20:00')); assert.match(q, /quiet calendar/); assert.match(q, /after 4 earlier/);
  assert.match(dayScript({ events: [] }, NOW), /quiet calendar/);
});

test('SHOW sweep: from now round to the last release, at least a quarter turn', () => {
  assert.equal(sweepMins(600, 1200, 0), 600); assert.equal(sweepMins(600, 1200, 1), 1200); assert.equal(sweepMins(600, 660, 1), 960); assert.equal(sweepMins(1300, 100, 1), 1300 + 360);
  assert.equal(sweepMins(600, null, 1), 960);
});

test('outlookScript: each release still to come with the consensus and the last print, then the typical first half hour on that kind of day', () => {
  assert.equal(sayFig('0.30%'), '0.3 percent'); assert.equal(sayFig('-0.1%'), 'minus 0.1 percent'); assert.equal(sayFig('245K'), '245 thousand'); assert.equal(sayFig('4.50%'), '4.5 percent'); assert.equal(sayFig(''), null);
  const line = 'US CPI (due 13:30 London today): over the 24 previous CPI events in the Release Reaction record (from 2024-01), the typical first-30-minute move, either way, was Nasdaq 0.41%, EUR/USD 0.18%, 10y yield 4.2bp. Descriptive history, not a forecast.';
  assert.deepEqual(reactionWords(line), { n: 24, sizes: ['Nasdaq 0.41 percent', 'euro dollar 0.18 percent', '10y yield 4.2 basis points'] });
  const now = Date.UTC(2026, 10, 20, 7, 15);
  const day = { events: [{ rank: 3, ms: now + 6 * 3600e3, hm: '13:30', short: 'US CPI m/m', forecast: '0.3%', previous: '0.2%', line }, { rank: 3, ms: now + 2 * 3600e3, hm: '09:30', short: 'UK Retail Sales', forecast: null, previous: '-0.4%' }, { rank: 3, ms: now - 3600e3, hm: '06:15', short: 'CH GDP', actual: '0.1%' }].sort((a, b) => a.ms - b.ms) };
  assert.equal(outlookScript(day, now), 'On the calendar today, London time. At 09:30, UK Retail Sales, last time minus 0.4 percent. At 13:30, US CPI m/m: expected 0.3 percent, after 0.2 percent last time. On past US CPI m/m days, 24 of them, the first half hour typically moved Nasdaq 0.41 percent, euro dollar 0.18 percent and 10y yield 4.2 basis points, either way.');
  assert.match(outlookScript({ events: [] }, now), /quiet calendar/);
});

test('outlookScript: a day with no high-impact release reads the medium ones from the full week (flash PMIs), same-minute releases together', () => {
  const now = Date.UTC(2026, 10, 23, 7, 16), t = (h, m) => Date.UTC(2026, 10, 23, h, m);
  const week = [{ country: 'JP', event: 'Bank Holiday', impact: 'holiday', ms: t(0, 0) },
    { country: 'EU', event: 'German Flash Manufacturing PMI', impact: 'medium', ms: t(8, 30), estimate: '54.1', prev: '54.2' },
    { country: 'EU', event: 'German Flash Services PMI', impact: 'medium', ms: t(8, 30), estimate: '52.4', prev: '51.7' },
    { country: 'GB', event: 'MPC Member Pill Speaks', impact: 'low', ms: t(13, 0) },
    { country: 'US', event: 'Flash Manufacturing PMI', impact: 'medium', ms: t(14, 45), estimate: '54.5', prev: '56.0' }];
  const d = mergeDay({ week, now });
  assert.equal(d.events.length, 4, 'the holiday is dropped, low impact kept on the clock');
  assert.equal(outlookScript(d, now), 'No top-tier releases today; the medium-impact ones, London time. At 08:30, German manufacturing PMI: expected 54.1, after 54.2 last time, and German services PMI: expected 52.4, after 51.7 last time. At 14:45, US manufacturing PMI: expected 54.5, after 56.0 last time.');
});

test('dayContext: holiday and half-day tags, the validated pre-release and after-CPI facts, the Monday / month-start profile (Helix review wave 1.7 / 1.10)', async () => {
  const { dayContext, holidayTag, closuresOn } = await import('./dayAheadCore.js');
  const at = s => Date.parse(s);
  // 27 Nov 2026: the day after Thanksgiving (1pm New York close), after Thanksgiving itself
  const h = holidayTag(at('2026-11-27T07:00:00Z'));
  assert.match(h.text, /^Today is the day after Thanksgiving: the US stock market closes at 1pm New York, a half day, so thin trade this afternoon is the holiday, not a calm market\. Yesterday was Thanksgiving: the US stock market was shut, so yesterday's ranges are holiday ranges\.$/);
  assert.equal(closuresOn('2026-11-26')[0].name, 'Thanksgiving'); assert.equal(holidayTag(at('2026-11-18T07:00:00Z')), null);
  // a CPI morning: the pre-release fact before the print only; the session after CPI the next day
  const cpi = { events: [{ ccy: 'USD', rank: 3, name: 'CPI m/m', family: 'CPI', ms: at('2026-11-10T13:30:00Z'), actual: null }] };
  const a = dayContext({ day: cpi, now: at('2026-11-10T07:00:00Z') });
  assert.ok(a.tags.includes('prerelease')); assert.match(a.text, /ten to twelve percent narrower than a normal morning.*not a direction/);
  assert.equal(dayContext({ day: cpi, now: at('2026-11-10T14:00:00Z') }), null, 'after the print the pre-release line is gone');
  const ppi = { events: [{ ccy: 'USD', rank: 3, name: 'PPI m/m', family: 'PPI', ms: at('2026-11-10T13:30:00Z') }] };
  assert.equal(dayContext({ day: ppi, now: at('2026-11-10T07:00:00Z') }), null, 'PPI mornings are near normal in the test');
  const b = dayContext({ day: { events: [] }, yday: { events: [{ ...cpi.events[0], actual: '0.3%' }] }, now: at('2026-11-11T07:00:00Z') });
  assert.deepEqual(b.tags, ['aftercpi']); assert.match(b.text, /session after, on euro-dollar and dollar-Canada, as range, never direction/);
  assert.deepEqual(dayContext({ day: { events: [] }, now: at('2026-11-16T07:00:00Z') }).tags, ['monday']);
  assert.deepEqual(dayContext({ day: { events: [] }, now: at('2026-12-01T07:00:00Z') }).tags, ['monthstart']);
  assert.equal(dayContext({ day: { events: [] }, now: at('2026-11-18T07:00:00Z') }), null);
  for (const x of [a, b]) assert.doesNotMatch(x.text, /\bwill\b|coiled|fenced|buy|sell/i);
});
