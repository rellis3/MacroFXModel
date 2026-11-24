import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sparkSvg, assetHtml, tiltHtml, ccyHtml, stripHtml } from './liveLayer.js';

const m = { last: 208.64, open: 208.12, hi: 208.66, lo: 208.08, chgPct: 0.25, nowU: 0.9, highU: 0.93, lowU: -0.07, pos: 0.97, touched: ['up p50'], path: [208.1, 208.3, 208.64] };

test('sparkSvg: needs two points; coloured by the move', () => {
  assert.equal(sparkSvg([1]), '');
  assert.match(sparkSvg([1, 2], 1), /var\(--up\)/);
  assert.match(sparkSvg([2, 1], 2), /var\(--dn\)/);
});

test('assetHtml: the move in u, the range position, the lines hit', () => {
  const h = assetHtml(m, '2026-11-23T14:05:00Z');
  assert.match(h, /▲ \+0\.90u/);
  assert.match(h, /97% of the day's range/);
  assert.match(h, /lines hit: up p50/);
  assert.equal(assetHtml(null), '');
  assert.match(assetHtml({ ...m, nowU: null }), /\+0\.25%/);   // no unit: the % move leads
});

test('tiltHtml: now against the issue, with the turn', () => {
  const bei = { issueAt: '2026-11-23T05:40:00Z', markets: [{ market: 'GBPJPY', calls: { v1r: [['issue', 'NEUTRAL', -0.21, 1], ['11:00', 'BEARISH', -0.55, 3]] }, shifts: { v1r: [{ at: '11:00', from: 'NEUTRAL', to: 'BEARISH' }] } },
    { market: 'GOLD', calls: { v1r: [['issue', 'BULLISH', 0.6, 4]] }, shifts: { v1r: [] } }] };
  const h = tiltHtml(bei, 'GBPJPY');
  assert.match(h, /now \(11:00\)/);
  assert.match(h, /Bearish −0\.55/);
  assert.match(h, /turned bearish at 11:00/);
  assert.match(tiltHtml(bei, 'XAUUSD'), /Bullish \+0\.60/);   // the engine calls gold GOLD
  assert.equal(tiltHtml(bei, 'EURUSD'), '');
});

test('ccyHtml and stripHtml', () => {
  assert.match(ccyHtml({ ccy: 'GBP', score: 0.42, rank: 1, pairs: 5 }), /strongest/);
  assert.match(ccyHtml({ ccy: 'JPY', score: -0.4, rank: 8, pairs: 6 }), /weakest/);
  const s = stripHtml([{ ccy: 'GBP', score: 0.4, rank: 1, pairs: 5 }, { ccy: 'JPY', score: -0.6, rank: 2, pairs: 6 }]);
  assert.equal((s.match(/class="lv-bar"/g) ?? []).length, 2);
  assert.equal(stripHtml([]), '');
});
