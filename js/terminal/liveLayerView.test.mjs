// The live layer's drawing: the Macro block, the price read, the in-place figures. Strings only (no DOM).
//   node js/terminal/liveLayerView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardHtml, priceReadHtml, curveGlyph, liveEmCell, liveWiderChip, stampHtml, priceReadSlot, _state } from './liveLayerView.js';
import { priceRead, overlayYields, overlayIndices, overlayEm, parsePricing } from '../liveLayerCore.js';

const NOW = Date.parse('2026-11-12T14:37:00Z');
const quote = (instrument, mid) => ({ instrument, time: new Date(NOW).toISOString(), tradeable: true, bids: [{ price: String(mid - 0.001) }], asks: [{ price: String(mid + 0.001) }] });
const mv = (now, ref) => ({ now, ref, deltaBp: (now - ref) * 100, D: 5, asOf: '2026-11-12T14:30:00Z', closed: false });
const yields = overlayYields({ mvs: { Y_US2: mv(4.0, 4.1), Y_US5: mv(4.1, 4.15), Y_US10: mv(4.35, 4.4), Y_US30: mv(4.7, 4.72), Y_DE10: mv(2.7, 2.72) }, official: { Y_US2: { date: '2026-11-11', value: 4.08 } } });
const px = parsePricing({ prices: [quote('NAS100_USD', 101), quote('SPX500_USD', 100.5), quote('US30_USD', 100.2), quote('US2000_USD', 100.1), quote('USD_MXN', 20.4)] });
const indices = overlayIndices({ refs: { NQ: { close: 100 }, SPX: { close: 100 }, DOW: { close: 100 }, RUT: { close: 100 } }, px });
const em = overlayEm({ pairs: { USDMXN: { ok: true, last: 20, date: '2026-11-11', spark: [19, 19.2, 19.4, 19.6, 19.8, 19.9, 20] } } }, px);
const payload = { ok: true, builtAt: new Date(NOW).toISOString(), quoteAt: new Date(NOW).toISOString(), closed: false, em, indices, yields,
  state: { range: { ok: true, market: 'mixed', line: 'A mix: 1 active.', rows: [{ name: 'EURUSD', used: 1.1, pace: 1.5, state: 'active', hl: 0.66, forecast: 0.6, hours: 12 }, { name: 'GBPUSD', used: 0.3, pace: 0.4, state: 'quiet', hl: 0.18, forecast: 0.6, hours: 12 }] },
    corr: { ok: true, state: 'HIGH', value: 0.52, median: 0.38, pctile: 91, windows: 40, pairs: 21, line: 'The majors are moving together more than usual over the last five days.' } } };

test('the Macro block draws every part, wrapped in its own surface, with the daily prints still shown', () => {
  const h = boardHtml(payload);
  assert.match(h, /data-surface="panel\.macro\.livelayer"/);
  assert.match(h, /price-based, live/);
  assert.match(h, /US 2y/); assert.match(h, /4\.08/, 'the official print is shown beside the implied one');
  assert.match(h, /bull steepener/);
  assert.match(h, /Russell 2000/); assert.match(h, /small caps are lagging/);
  assert.match(h, /EUR\/USD/); assert.match(h, /quiet means small moves so far|not a direction/);
  assert.match(h, /HIGH/); assert.match(h, /not the daily regime board/);
  assert.doesNotMatch(h, /\b(buy|sell|go long|go short|entry|stop loss|take profit)\b/i, 'descriptive wording only');
});

test('a closed market says so and shows the last prints', () => {
  assert.match(stampHtml({ ...payload, closed: true }), /closed · showing the (close|last prints)/i);
  assert.doesNotMatch(stampHtml(payload), /closed/i);
});

test('a failed or missing payload draws a plain sentence, never a blank or a throw', () => {
  assert.match(boardHtml({ ok: false, error: 'no data' }), /no data/);
  assert.match(boardHtml(null), /not loaded yet/);
  const partial = boardHtml({ ...payload, yields: { ok: false, error: 'no anchor' }, state: { range: { ok: false, error: 'x' }, corr: { ok: false, error: 'y' } } });
  assert.match(partial, /no anchor/); assert.match(partial, /Russell 2000/);
});

test('the curve glyph needs three tenors and draws both curves', () => {
  assert.match(curveGlyph(yields.rows), /<svg/);
  assert.equal(curveGlyph(yields.rows.slice(0, 1)), '');
  assert.ok(curveGlyph(yields.rows).includes('var(--gold)'), 'theme tokens, not hard-coded colours');
});

test('the price read: dawn bias beside the price read, a disagreement framed in the row', () => {
  const strength = { ok: true, horizons: { '4H': { available: true, scores: [{ ccy: 'EUR', score: 0.9 }, { ccy: 'USD', score: -0.9 }] }, '1D': { available: true, scores: [{ ccy: 'EUR', score: 0.7 }, { ccy: 'USD', score: -0.6 }] } } };
  const h = priceReadHtml(priceRead({ strength, analyst: { USD: { bias: 2 }, EUR: { bias: 1 } } }));
  assert.match(h, /Analyst read vs price read/); assert.match(h, /ll-pr dis/); assert.match(h, /disagree/); assert.match(h, /never changes the desk's book/);
  assert.match(priceReadHtml(null), /loading the price bars/);
  // one window missing: the row shows a dash for it, and a plain note says which window and why
  const one = priceReadHtml(priceRead({ strength: { ok: true, horizons: { '4H': strength.horizons['4H'], '1D': { available: false, reason: 'no start price yet' } } }, analyst: { USD: { bias: 2 } } }));
  assert.match(one, /1D window is missing \(no start price yet\)/); assert.match(one, /1D –/); assert.doesNotMatch(one, /NaN|undefined|null/);
  assert.match(priceReadHtml({ ok: false, error: 'no strength data' }), /no strength data/);
  assert.match(priceReadSlot(), /data-surface="panel\.ov\.priceread"/);
  assert.match(priceReadHtml(priceRead({ strength, analyst: {} }), { closed: true }), /closed/i);
});

test('live figures inside the existing boards are empty until data lands, then escaped text', () => {
  _state.payload = null;
  assert.match(liveEmCell('USDMXN'), /data-lv="em:USDMXN"/); assert.doesNotMatch(liveEmCell('USDMXN'), /live</);
  assert.equal(liveWiderChip('concentration'), '', 'only the tiles that have a live counterpart');
  assert.match(liveWiderChip('nq'), /data-lv="wm:nq"/);
  _state.payload = payload;
  assert.match(liveEmCell('USDMXN'), /\+2\.00% live/);
  assert.match(liveWiderChip('nq'), /\+1\.00% live/);
  assert.match(liveWiderChip('smallVsBig'), /−0\.90pp live/);
  _state.payload = null;
});
