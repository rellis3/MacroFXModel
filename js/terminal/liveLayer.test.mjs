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

import { shapeHtml, ccysOf, againstCall, eventHtml, retailHtml, tapeChip, againstHtml, favsHtml } from './liveLayer.js';
test('shapeHtml: day type and session ranges', () => {
  const h = shapeHtml({ dayType: 'trend up', sess: { asia: { loU: -0.1, hiU: 0.2 }, london: { loU: 0.1, hiU: 0.9 } } });
  assert.match(h, /trend up so far/);
  assert.match(h, /Asia −0\.10 to \+0\.20u · London \+0\.10 to \+0\.90u/);
  assert.equal(shapeHtml({}), '');
});
test('ccysOf and againstCall', () => {
  assert.deepEqual(ccysOf('GBPJPY'), ['GBP', 'JPY']);
  assert.deepEqual(ccysOf('DE30'), ['EUR']);
  assert.deepEqual(ccysOf('GOLD'), ['USD']);
  assert.deepEqual(againstCall('SHORT', { nowU: 0.9 }, 'NEUTRAL'), ['the day is +0.90u from the open']);
  assert.equal(againstCall('SHORT', { nowU: 0.5 }, 'BULLISH').length, 1);
  assert.equal(againstCall('LONG', { nowU: 0.9 }, 'BULLISH').length, 0);
  assert.equal(againstCall('FLAT', { nowU: -3 }, 'BEARISH').length, 0);
});
test('eventHtml: the next event and the latest print with its reaction', () => {
  const now = Date.parse('2026-11-23T09:00:00Z');
  const h = eventHtml('GBPJPY', [{ country: 'GBP', event: 'Flash PMI', impact: 'High', ms: now + 42 * 60_000, estimate: '52.4' }, { country: 'USD', event: 'X', impact: 'High', ms: now + 60_000 }],
    [{ ccy: 'JPY', event: 'CPI', ms: now - 3600e3, actual: '2.1', estimate: '2.0', z: 0.8, m15: -0.3, m60: null }], now);
  assert.match(h, /GBP Flash PMI in 42m/);
  assert.match(h, /JPY CPI <b>2\.1<\/b> vs 2\.0/);
  assert.match(h, /−0\.30u<\/b> at 15m/);
  assert.equal(eventHtml('EURUSD', [], [], now), '');
});
test('retailHtml, tapeChip, againstHtml, favsHtml', () => {
  assert.match(retailHtml({ longPct: 79.4, d: -7.2, at: Date.parse('2026-11-23T14:00:00Z') }), /retail long <b>79%<\/b> \(−7\.2pp since 07:00\)/);
  const c = tapeChip({ label: 'risk-on', score: 0.47, since: '2026-11-23T10:40:00Z', legs: { equities: 0.7, havens: -0.4, commodityFx: 0.3, gold: -0.3 } }, { flags: [{ label: 'VIX elevated', on: true }] });
  assert.equal(c.text, 'live tape: risk-on since 10:40');
  assert.equal(c.cls, 'up');
  assert.match(c.title, /VIX elevated/);
  assert.equal(tapeChip(null).text, 'tape –');
  assert.match(againstHtml([{ n: 'GBPJPY', label: 'GBPJPY short', why: ['x'] }], 41), /1 of 41/);
  assert.match(againstHtml([], 41), /not against any of the 41/);
  assert.match(favsHtml([{ n: 'GBPJPY', call: 'SHORT', dir: -1, m: { nowU: 0.9, dayType: 'trend up' }, against: ['x'], next: '' }]), /⚠ against/);
  assert.equal(favsHtml([]), '');
});

import { sigOf, sigDiff, replayAt, replayTimes } from './liveLayer.js';
test('since you last looked: the signature and its differences in words', () => {
  const a = sigOf({ touched: ['up p50'], dayType: 'range', nowU: 0.2 }, { rating: 'SHORT' }, 'NEUTRAL');
  const b = sigOf({ touched: ['up p50', 'up p75'], dayType: 'trend up', nowU: 1.2 }, { rating: 'SHORT' }, 'BULLISH');
  assert.deepEqual(sigDiff(a, b), ['up p75 hit', 'day now against the call', 'tilt turned bullish', 'now trend up']);
  assert.deepEqual(sigDiff(a, a), []);
  assert.deepEqual(sigDiff(null, a), []);
});
test('replayAt: the moves and the currency strength at a time of a stored day', () => {
  const day = { markets: { GBPUSD: { open: 1.3, u: 0.004, path: [1.3, 1.304, 1.302], pathT: [0, 900000, 1800000] }, USDJPY: { open: 150, u: 0.5, path: [150, 149.5], pathT: [0, 900000] } } };
  assert.deepEqual(replayTimes(day), [0, 900000, 1800000]);
  const r = replayAt(day, 900000);
  assert.equal(r.markets.GBPUSD.nowU, 1);
  assert.equal(r.markets.USDJPY.nowU, -1);
  assert.equal(r.ccy[0].ccy, 'GBP');
  assert.equal(replayAt(day, -1).ccy.length, 0);
});

import { tapeOrder, tapeBits } from './liveLayer.js';
test('price tape: indices, gold and majors first; change in % and u', () => {
  assert.deepEqual(tapeOrder(['GBPJPY', 'EURUSD', 'NQ', 'AUDNZD', 'GOLD']), ['NQ', 'GOLD', 'EURUSD', 'AUDNZD', 'GBPJPY']);
  assert.deepEqual(tapeBits({ last: 1.09156, chgPct: 0.07, nowU: 0.21 }), { v: '1.09156', c: '▲0.07%', cls: 'up', u: '+0.21u' });
  assert.equal(tapeBits({ last: 208.6, chgPct: -0.4 }).cls, 'dn');
  assert.equal(tapeBits({}).c, '–');
});
