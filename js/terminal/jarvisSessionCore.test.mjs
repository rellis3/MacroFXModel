import test from 'node:test';
import assert from 'node:assert/strict';
import { pickMarket, splitSessions, dailyBars, usualBand, sessionStats, sessionScript, titleOf, buildScene, bodyCorners, loopState, rise, intradayAsset, dailySymbol, MAX_BARS } from './jarvisSessionCore.js';
import { buildScenes } from './showCore.js';

const D = 86400, mk = (day, n, base = 100) => Array.from({ length: n }, (_, i) => ({ t: day * D + i * 900, o: base + i, h: base + i + 2, l: base + i - 1, c: base + i + 1 }));
test('pickMarket: a desk market selection wins; otherwise the biggest mover against its own usual move', () => {
  const inst = { NQ: { oc: 1, forecast: { oc_median: 1 } }, GOLD: { oc: -2, forecast: { oc_median: 0.5 } }, EURUSD: { oc: 0.1, forecast: { oc_median: 0 } } };
  assert.equal(pickMarket(null, inst), 'GOLD'); assert.equal(pickMarket('NQ', inst), 'NQ'); assert.equal(pickMarket('ZZZ', inst), 'GOLD'); assert.equal(pickMarket(null, {}), null);
});
test('splitSessions: today is the last UTC day, the session before is kept as the ghost, capped', () => {
  const s = splitSessions([...mk(100, 96), ...mk(101, 40)]);
  assert.equal(s.bars.length, 40); assert.equal(s.prev.length, 96); assert.equal(s.partial, false);
  assert.ok(splitSessions(mk(100, 300)).bars.length <= MAX_BARS);
  const early = splitSessions([...mk(100, 96), ...mk(101, 2)]); assert.equal(early.partial, true); assert.equal(early.prev.length, 0);
  assert.equal(splitSessions([]), null); assert.equal(splitSessions([{ t: 1, o: NaN, h: 1, l: 1, c: 1 }]), null);
});
test('dailyBars: oldest first, last n, strings parsed, bad rows dropped', () => {
  const b = dailyBars([{ datetime: '2026-11-17', open: '3', high: '4', low: '2', close: '3.5' }, { datetime: '2026-11-16', open: '1', high: '2', low: '0.5', close: 'x' }, { datetime: '2026-11-15', open: '1', high: '2', low: '0.5', close: '1.5' }], 60);
  assert.equal(b.length, 2); assert.ok(b[0].t < b[1].t); assert.equal(b[1].c, 3.5);
});
test('usualBand: prices from the open and the median high / low reach; null when missing', () => {
  const b = usualBand({ anchor_open: 100, oh_target_med: 1, ol_target_med: 2 });
  assert.ok(Math.abs(b.hi - 101) < 1e-9 && Math.abs(b.lo - 98) < 1e-9); assert.equal(usualBand({ anchor_open: 100 }), null); assert.equal(usualBand(null), null);
});
test('buildScene: every price maps inside 0..H, up/down colour follows close vs open, ticks lie in range, band included', () => {
  const bars = mk(1, 20), sc = buildScene(bars, mk(0, 20), { open: 100, hi: 130, lo: 90 });
  assert.equal(sc.bars.length, 20); for (const b of sc.bars) { assert.ok(b.yL >= 0 && b.yH <= sc.H + 1e-9 && b.yL <= b.yO + 1e-9 && b.yH >= b.yC - 1e-9); assert.equal(b.up, true); }
  assert.ok(sc.band.yHi <= sc.H && sc.band.yLo >= 0); assert.ok(sc.ticks.every(p => p >= sc.lo && p <= sc.hi)); assert.equal(sc.ghost.length, 20);
  assert.ok(Math.abs(sc.priceAt(sc.yOf(110)) - 110) < 1e-9);
  assert.equal(buildScene([{ t: 1, o: 5, h: 5, l: 5, c: 5 }]).n, 1); assert.equal(buildScene([]), null);
  const dn = buildScene([{ t: 1, o: 5, h: 6, l: 4, c: 4.5 }]); assert.equal(dn.bars[0].up, false);
});
test('bodyCorners: grows from the floor, never inverted, minimum thickness', () => {
  const p = Array.from({ length: 8 }, () => new Array(3).fill(0)); bodyCorners(p, 0, 0.4, 0.6, 0.02, 0.02, 0.5);
  assert.ok(p[0][1] < p[4][1]); assert.ok(Math.abs(p[0][1] - 0.2) < 1e-9 && Math.abs(p[4][1] - 0.3) < 1e-9);
  bodyCorners(p, 0, 0.5, 0.5, 0.02, 0.02, 1); assert.ok(p[4][1] > p[0][1]);
});
test('loopState and rise: the draw-in runs 0..n over six seconds, holds, repeats; bars rise in order', () => {
  assert.equal(loopState(0, 96).printed, 0); assert.equal(loopState(3, 96).printed, 48); assert.equal(loopState(7, 96).phase, 'hold'); assert.equal(loopState(10, 96).printed, 0); assert.equal(loopState(7, 96).printed, 96);
  assert.equal(rise(5, 5), 0); assert.equal(rise(5, 20), 1); assert.ok(rise(5, 6) > 0 && rise(5, 6) < 1); assert.ok(rise(4, 6) > rise(5, 6));
});
test('sessionScript: measured facts only, the open / range / now / times usual; null without data; no forecast words', () => {
  const st = sessionStats(mk(1, 10), { forecast: { oc_median: 0.5 } }), t = sessionScript('NQ', st);
  assert.match(t, /Nasdaq's session\. It opened at 100, has traded between 99 and 111, and is now 110/); assert.match(t, /up .* percent from the open, which is more than nine times its usual move/);
  assert.equal(sessionScript('NQ', null), null); assert.doesNotMatch(t, /will|expect|forecast|likely|buy|sell/i);
  assert.match(t, /Here is the chart of Nasdaq/); assert.match(sessionScript('GOLD', st, 'daily'), /last sixty days/); assert.match(titleOf('NQ', 'intraday'), /NQ · today's session, 15 minute candles/); assert.match(titleOf('NQ', 'daily'), /daily/);
});
test('routes: desk keys map to the intraday asset and the daily symbol', () => {
  assert.equal(intradayAsset('NQ'), 'NAS100'); assert.equal(intradayAsset('EURUSD'), 'EURUSD'); assert.equal(intradayAsset('WTI'), null); assert.equal(dailySymbol('EURUSD'), 'EUR_USD'); assert.equal(dailySymbol('GOLD'), 'XAU_USD'); assert.equal(dailySymbol('NQ'), 'NAS100_USD');
});
test('the SHOW scene registers after candles and builds from data, null when missing', async () => {
  await import('./jarvisViewSession.js');
  const base = { now: new Date(), movers: [{ key: 'NQ', ratio: 2, oc: 1 }], board: { up: 1, dn: 0, quiet: 0 } };
  const st = sessionStats(mk(1, 10), { forecast: { oc_median: 0.5 } });
  const sc = buildScenes({ ...base, mode: 'full', extra: { session: { key: 'NQ', mode: 'intraday', st } } }), ids = sc.map(s => s.id);
  assert.equal(ids[ids.indexOf('candles') + 1], 'session'); const s = sc.find(x => x.id === 'session'); assert.equal(s.view, 'session'); assert.equal(typeof s.enter, 'function'); assert.equal(typeof s.motion, 'function');
  assert.ok(!buildScenes({ ...base, extra: {} }).some(x => x.id === 'session'));
});
