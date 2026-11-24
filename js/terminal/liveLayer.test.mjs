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

import { movedSince, movedHtml, speedsHtml } from './liveLayer.js';
test('movedSince / movedHtml: the drivers that changed between the issue and the latest re-run', () => {
  const pts = [{ point: 'issue', v1r: [['JPY Risk role', -0.12, 'R -1.5'], ['JPY Policy path', 0.15, '6m -6bp']] }, { point: '10:00', v1r: [['JPY Risk role', -0.1, 'x']] },
    { point: '13:00', v1r: [['JPY Risk role', 0.2, 'R +0.4'], ['JPY Policy path', 0.15, '6m -6bp'], ['GBP Trend', 0.06, 'D1 up']] }];
  const m = movedSince(pts);
  assert.equal(m[0].driver, 'JPY Risk role');
  assert.ok(Math.abs(m[0].d - 0.32) < 1e-9);
  assert.equal(m.length, 2);                      // the unchanged policy path is left out
  assert.match(movedHtml(pts), /from the morning issue to 13:00/);
  assert.equal(movedHtml(pts.slice(0, 1)), '');
  assert.match(movedHtml([pts[0], pts[0]]), /no driver of the tilt has moved/);
});
test('speedsHtml: live, hourly, set times and daily, each with its time', () => {
  const h = speedsHtml({ book: '2026-11-23T07:01:00Z', upd: { london: '2026-11-23T08:06:00Z' }, cot: '2026-11-18' }, '2026-11-23T14:05:00Z', '13:00');
  assert.match(h, /every minute · last 14:05/);
  assert.match(h, /HOURLY/);
  assert.match(h, /London update 08:06/);
  assert.match(h, /report of 18 Nov/);
  assert.doesNotMatch(speedsHtml(null, null, null), /HOURLY/);
});
