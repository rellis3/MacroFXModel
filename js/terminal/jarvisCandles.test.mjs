import test from 'node:test';
import assert from 'node:assert/strict';
import { candleRows, candleLayout, candleBox, boardSummary, topMovers, ROWS, CAP } from './jarvisCandles.js';
import { buildScenes, spoken, readSeconds } from './showCore.js';
import { MARKET_KEYS } from './jarvisMarkets.js';

const vol = { NQ: { oc: 1.2, oh: 1.3, ol: 0.4, forecast: { oc_median: 0.6 } }, GOLD: { oc: -0.5, oh: 0.1, ol: 0.9, forecast: { oc_median: 1 } }, EURUSD: { oc: 0.02, oh: 0.1, ol: 0.1, forecast: { oc_median: 0.3 } }, BAD: { oc: 1 } };
const bias = { NQ: { dir: 'BEARISH', strength: 3 }, GOLD: { dir: 'BULLISH', strength: 1 } };

test('candleRows: size is in the market\'s own usual move; green up, red down, quiet when small; wicks clip; no noise = left out', () => {
  const r = candleRows(vol, bias), by = Object.fromEntries(r.map(x => [x.key, x]));
  assert.equal(r.length, 3); assert.equal(by.NQ.tone, 'up'); assert.equal(by.GOLD.tone, 'dn'); assert.equal(by.EURUSD.tone, 'quiet');
  assert.equal(by.NQ.body, 2); assert.ok(by.NQ.hi <= CAP && by.GOLD.lo >= -CAP);
  assert.equal(candleRows({ NQ: { oc: 9, oh: 9, ol: 0, forecast: { oc_median: 0.5 } } })[0].body, CAP);   // a huge move is clipped at three usual moves
  assert.equal(by.NQ.lean, -1); assert.equal(by.GOLD.lean, 1); assert.equal(by.EURUSD.lean, null);
  assert.deepEqual(candleRows({ X: { oc: 1, oh: 1, ol: 1, forecast: { oc_median: 0 } } }, {}), []);
});
test('candleLayout: every market of every row gets a place, rows are centred and ordered front to back, nothing overlaps', () => {
  const l = candleLayout(MARKET_KEYS), keys = Object.keys(l);
  assert.equal(keys.length, MARKET_KEYS.length); assert.equal(ROWS.flatMap(r => r[1]).length, MARKET_KEYS.length);
  const pts = Object.values(l); for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) > 0.15, 'two candles stand on the same spot');
  assert.ok(l.EURUSD.z < l.NQ.z && l.NQ.z < l.WTI.z);
});
test('candleBox: green rises from the floor, red hangs below it, the wick spans low to high', () => {
  const up = candleBox({ body: 2, hi: 2.5, lo: -0.2 }, { x: 0, z: 0 }), dn = candleBox({ body: -1, hi: 0.1, lo: -1.4 }, { x: 0, z: 0 });
  assert.ok(Math.min(...up.pts.map(p => p[1])) >= 0 && Math.max(...up.pts.map(p => p[1])) > 0.5);
  assert.ok(Math.max(...dn.pts.map(p => p[1])) <= 0 && Math.min(...dn.pts.map(p => p[1])) < -0.2);
  assert.ok(up.wick[1][1] > up.wick[0][1]); assert.equal(up.pts.length, 8);
});
test('boardSummary and topMovers: tallies and ordering', () => {
  const r = candleRows(vol, bias), s = boardSummary(r);
  assert.deepEqual([s.up, s.dn, s.quiet, s.bull, s.bear, s.flat], [1, 1, 1, 1, 1, 0]);
  assert.equal(topMovers(r, 2)[0].key, 'NQ'); assert.ok(topMovers(r).every(m => m.tone !== 'quiet'));
});
test('buildScenes: a full morning has the wake, movers, candles, lean, chain, ahead and close scenes; the lean always carries its caveat; thin data still builds', () => {
  const r = candleRows(vol, bias), full = buildScenes({ now: new Date('2026-11-19T07:30:00Z'), movers: topMovers(r), board: boardSummary(r), chain: { holding: 1, broken: 2, quiet: 30, headline: '2 of 3 testable links broken.' }, events: ['US CPI at 1:30', 'Fed speakers'] });
  assert.deepEqual(full.map(s => s.id), ['wake', 'movers', 'candles', 'lean', 'chain', 'ahead', 'close']);
  assert.ok(/no proven skill/.test(full.find(s => s.id === 'lean').text)); assert.ok(full[0].text.startsWith('Good morning'));
  assert.ok(full.every(s => s.text.length > 10 && s.view));
  const thin = buildScenes({}); assert.deepEqual(thin.map(s => s.id), ['wake', 'close']);
});
test('spoken and readSeconds: plain words for markets; reading time scales with length', () => {
  assert.equal(spoken('NQ'), 'Nasdaq'); assert.equal(spoken('EURUSD'), 'Euro Dollar');
  assert.ok(readSeconds('one two three four five six seven eight nine ten') > readSeconds('hi')); assert.ok(readSeconds('') >= 2);
});
