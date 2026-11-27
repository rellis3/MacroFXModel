import test from 'node:test'; import assert from 'node:assert/strict';
import { g10Rows, fundingRows, auctionRows, g10Brief, bp, zTxt, arrow, money } from './jarvisG10Core.js';

const board = { rows: [
  { ccy: 'USD', short: { tenor: '2y', value: 4.1 }, long: { tenor: '10y', value: 4.5 } },
  { ccy: 'EUR', short: { tenor: '2y', value: 2.1 }, long: { tenor: '10y', value: 2.7 }, gapShort: { vs: '2y vs US 2y', bp: -200, chg20bp: 12, z20: 2.4 }, gapLong: { bp: -180 } },
  { ccy: 'JPY', short: { tenor: '2y', value: 0.9 }, long: { tenor: '10y', value: 1.6 }, gapShort: { vs: '2y vs US 2y', bp: -320, chg20bp: -3, z20: -0.4 } },
  { ccy: 'CHF', missing: true, note: 'no Swiss yields are captured yet' },
] };
const fb = { items: [{ id: 'sofr_p99_iorb', label: 'SOFR 99th percentile minus IORB', unit: 'bp', value: 9, pct250: 91 }, { id: 'rrp', label: 'RRP', unit: '$bn', value: 120, chg: -30, chgOver: 20 }, { id: 'reserves', label: 'Reserves', unit: '$bn', value: 3210 }],
  auctions: [{ tenor: '10y', ok: true, date: '2026-11-12', highYield: 4.31, bidToCover: 2.41, btcPct: 25, vsN: 12, highVsMedianBp: 4 }, { tenor: '30y', ok: false, why: 'no auctions in the archive yet' }],
  calendar: { text: '1 business day to the month-end.' } };

test('formatting helpers carry the sign and a shape, never colour alone', () => {
  assert.equal(bp(12), '+12bp'); assert.equal(bp(-3.24, 1), '−3.2bp'); assert.equal(bp(null), '—'); assert.equal(zTxt(-2.44), '−2.4σ'); assert.equal(arrow(-1), '▼'); assert.equal(arrow(0), '•');
  assert.equal(money(3210), '$3.21tn'); assert.equal(money(120), '$120bn');
});
test('rows: the US is the base, missing curves keep their row, funding and auctions read in words', () => {
  const r = g10Rows(board); assert.equal(r[0].gap, 'base'); assert.equal(r[1].gap, '−200bp'); assert.equal(r[1].gapArrow, '▲'); assert.equal(r[3].missing, true);
  const f = fundingRows(fb); assert.equal(f[0].value, '+9.0bp'); assert.equal(f[0].ctx, 'percentile 91 of 250 sessions'); assert.equal(f[1].ctx, '▼ $30bn over 20');
  const a = auctionRows(fb); assert.match(a[0].line, /bid-to-cover 2\.41 \(percentile 25 of the last 12\)/); assert.match(a[1].line, /no auctions/);
});
test('brief: description only, no trade words, calendar always attached', () => {
  const t = g10Brief(board, fb);
  assert.match(t, /JPY short end sits furthest from the US, 320bp below it/); assert.match(t, /EUR: \+12bp, \+2\.4σ/); assert.match(t, /not a read on the next session/); assert.match(t, /month-end/);
  assert.doesNotMatch(t, /\b(buy|sell|long|short (?!end)|will|expect)\b/i);
  assert.match(g10Brief({ rows: [board.rows[2]] }, null), /No 2y gap has moved unusually/);
  assert.equal(g10Brief(null, null), '');
});
