import test from 'node:test'; import assert from 'node:assert/strict';
import { toPts, asOfJoin, innerJoin, pctRank, changeZ, buildG10Rates, G10_KEYS, buildFundingBoard, FUNDING_KEYS, calendarNote, auctionStats } from './helixData.js';

const day = i => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const weekdays = n => { const out = []; for (let i = 0; out.length < n; i++) { const d = day(i), w = new Date(d).getUTCDay(); if (w && w !== 6) out.push(d); } return out; };
const series = (dates, f) => ({ points: dates.map((d, i) => [d, f(i)]) });
const NOW = Date.parse('2026-02-10T12:00:00Z');

test('toPts reads archive triples and {date,value}, sorts, drops junk', () => {
  assert.deepEqual(toPts({ points: [['2026-01-02', 2], ['2026-01-01', 1, 0.9], ['bad', 3], ['2026-01-03', 'x']] }), [{ date: '2026-01-01', value: 1 }, { date: '2026-01-02', value: 2 }]);
  assert.deepEqual(toPts([{ date: '2026-01-01', value: '4.5' }]), [{ date: '2026-01-01', value: 4.5 }]);
  assert.deepEqual(toPts(null), []);
});
test('joins: step (as-of) and exact; pctRank; changeZ is point in time', () => {
  const a = [{ date: '2026-01-05', value: 1 }, { date: '2026-01-06', value: 2 }, { date: '2026-02-20', value: 3 }], b = [{ date: '2026-01-01', value: 10 }, { date: '2026-01-06', value: 20 }];
  assert.deepEqual(asOfJoin(a, b), [{ date: '2026-01-05', a: 1, b: 10 }, { date: '2026-01-06', a: 2, b: 20 }], 'a pairing over 10 days old is dropped');
  assert.deepEqual(innerJoin(a, b), [{ date: '2026-01-06', a: 2, b: 20 }]);
  assert.equal(pctRank(5, [1, 2, 3, 4]), 100); assert.equal(pctRank(2, [1, 2, 3, 4]), 38); assert.equal(pctRank(1, []), null);
  const vals = Array.from({ length: 300 }, (_, i) => Math.sin(i / 3)); vals.push(vals[vals.length - 1] + 5);
  const cz = changeZ(vals); assert.ok(cz.z > 3, 'a jump at the end is a big z'); assert.equal(cz.n, 250);
  assert.equal(changeZ([1, 2, 3]).chg, null); assert.equal(changeZ(Array.from({ length: 40 }, (_, i) => i)).z, null, 'under 60 past changes: no z');
});
test('G10 board: rows for every currency, gaps to the US, missing curves named, description-only label', () => {
  const d = weekdays(320), S = {};
  for (const k of G10_KEYS) S[k] = series(d, i => 3 + (k.includes('10') ? 0.5 : 0) + i * 0.001);
  S['fred/DGS2'] = series(d, () => 4); S['g10_yields/CA_2Y'] = series(d, i => 3 + (i >= 300 ? 0.4 : 0));
  delete S['g10_yields/SE_2Y']; delete S['g10_yields/SE_10Y'];
  const B = buildG10Rates(S, { nowMs: Date.parse(`${d[d.length - 1]}T20:00:00Z`) });
  assert.equal(B.rows.length, 10); assert.ok(B.ok);
  const ca = B.rows.find(x => x.ccy === 'CAD'); assert.equal(ca.gapShort.vs, '2y vs US 2y'); assert.equal(ca.gapShort.bp, -60); assert.equal(ca.gapShort.chg20bp, 40); assert.ok(ca.gapShort.z20 > 3);
  assert.ok(B.rows.find(x => x.ccy === 'CHF').missing); assert.ok(B.rows.find(x => x.ccy === 'SEK').missing); assert.ok(B.degraded.includes('SEK'));
  assert.equal(B.rows.find(x => x.ccy === 'NOK').gapShort.vs, '3y vs US 2y');
  assert.equal(B.rows.find(x => x.ccy === 'USD').gapShort, undefined);
  assert.match(B.label, /not a signal/); assert.deepEqual(B.evidence.map(e => e.verdict), ['context', 'null', 'null']);
});
test('G10 board with no archive is not ok and says why per row', () => {
  const B = buildG10Rates({}, { nowMs: NOW }); assert.equal(B.ok, false); assert.equal(B.have, 0); assert.ok(B.rows.every(x => x.missing));
});
test('calendar note: month-end, quarter-end, mid-month with tax, quiet days', () => {
  assert.deepEqual(calendarNote('2026-11-27').tags, ['month-end']); assert.match(calendarNote('2026-11-27').text, /1 business day to the month-end \(2026-11-30\)/);
  assert.deepEqual(calendarNote('2026-12-30').tags, ['year-end']); assert.deepEqual(calendarNote('2026-09-29').tags, ['quarter-end']);
  const mid = calendarNote('2026-06-15'); assert.deepEqual(mid.tags, ['mid-month']); assert.match(mid.text, /corporate tax/);
  assert.match(calendarNote('2026-04-14').text, /individual tax/); assert.deepEqual(calendarNote('2026-12-02').tags, ['after month-end']);
  assert.deepEqual(calendarNote('2026-11-09').tags, []); assert.match(calendarNote('2026-11-09').text, /No month-end/);
});
test('auction stats: bid-to-cover and high-minus-median percentile vs the previous n', () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({ date: day(i * 30), highYield: 4 + i * 0.01, medianYield: 4 + i * 0.01 - 0.01, bidToCover: 2.5 + i * 0.01, indirectShare: 0.6 }));
  rows.push({ date: day(500), highYield: 4.5, medianYield: 4.45, bidToCover: 2.2, indirectShare: 0.55, reopening: true });
  const a = auctionStats(rows, '10y', 12);
  assert.equal(a.ok, true); assert.equal(a.btcPct, 0); assert.equal(a.highVsMedianBp, 5); assert.equal(a.highVsMedianPct, 100); assert.equal(a.vsN, 12); assert.match(a.note, /when-issued/);
  assert.equal(auctionStats([], '2y').ok, false);
});
test('funding board: spreads in bp, units to $bn, fallbacks, calendar always attached, null label', () => {
  const d = weekdays(300), last = d[d.length - 1], nowMs = Date.parse(`${last}T22:00:00Z`);
  const S = {
    'nyfed/SOFR': series(d, () => 4.33), 'nyfed/SOFR_P99': series(d, i => (i === 299 ? 4.55 : 4.42)), 'nyfed/TGCR': series(d, () => 4.30),
    'fred/IORB': { points: [['2024-12-19', 4.40]] }, 'fred/RRPONTSYD': series(d, i => 200 - i * 0.1),
    'fred/WRESBAL': { points: [[d[280], 3_200_000], [d[285], 3_250_000], [d[290], 3_300_000], [d[295], 3_310_000], [last, 3_320_000]] },
    'treasury/TGA_DTS': series(d, () => 800), 'ofr/MMF_REPO_FED': { points: [[d[200], 2.1e11]] },
  };
  S['fred/IORB'] = series(d, () => 4.40);
  const B = buildFundingBoard(S, { 'Note_2-Year': [{ date: d[100], highYield: 4.1, medianYield: 4.05, bidToCover: 2.6 }] }, { nowMs });
  const it = Object.fromEntries(B.items.map(x => [x.id, x]));
  assert.equal(it.sofr_p99_iorb.value, 15); assert.equal(it.sofr_p99_iorb.pct250, 100); assert.equal(it.sofr_iorb.value, -7); assert.equal(it.sofr_tgcr.value, 3);
  assert.equal(it.rrp.source, 'fred/RRPONTSYD'); assert.equal(it.reserves.value, 3320); assert.equal(it.tga.value, 800); assert.equal(it.mmf_repo_fed.value, 210); assert.equal(it.mmf_repo_fed.stale, true);
  assert.ok(B.calendar.text.length > 20); assert.equal(B.auctions.length, 3); assert.ok(B.auctions[0].ok); assert.ok(B.degraded.includes('Bond_30-Year'));
  assert.match(B.label, /NULL/); assert.equal(B.evidence[0].id, 'funding-stress');
  assert.ok(FUNDING_KEYS.includes('nyfed/SOFR_P99'));
});
