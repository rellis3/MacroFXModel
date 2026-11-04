// The Desk Office quick-test views (js/quickTestView.js): pure builders on a real engine result.   node js/quickTestView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { formHtml, resultHtml, listHtml, linkedChips, leadLagSvg, verdictChip } from './quickTestView.js';
import { runQuickTest, normaliseSpec, storeResult, listOf, CATALOGUE, X_TRANSFORMS, HORIZONS, LABEL } from './quickTest.js';
import { mulberry32 } from './statsCore.js';

const cat = Object.entries(CATALOGUE).map(([id, c]) => ({ id, label: c.label, kind: c.kind }));
const meta = { ok: true, label: LABEL, catalogue: cat, transforms: X_TRANSFORMS, horizons: HORIZONS, running: null };
const rng = mulberry32(7), g = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const D = []; for (let d = Date.parse('2010-01-04'); D.length < 3000; d += 864e5) { const w = new Date(d).getUTCDay(); if (w > 0 && w < 6) D.push(new Date(d).toISOString().slice(0, 10)); }
let p = 1.1; const Y = D.map(date => ({ date, value: (p *= Math.exp(0.006 * g())) })), X = D.map(date => ({ date, value: 2 + g() }));
const spec = normaliseSpec({ x: 'fred:DGS2', y: 'oanda:EURUSD', horizons: [1, 5], xTransform: 'chg5', condition: { series: 'fred:VIXCLS', op: 'above', pct: 50 } });
const R = runQuickTest({ spec, x: X, y: Y, cData: X, kinds: { x: 'rate', y: 'price', c: 'price' } });

test('form: every catalogue series selectable, prefill honoured, proposal carried', () => {
  const h = formHtml(meta, { x: 'fred:VIXCLS', y: 'oanda:USDJPY', horizons: [5, 10], proposalId: 'p-1', proposalTitle: 'VIX leads yen' });
  assert.equal((h.match(/<option value="oanda:EURUSD"/g) ?? []).length, 3, 'the x, y and condition lists each have it once');
  assert.match(h, /value="fred:VIXCLS" selected/); assert.match(h, /value="oanda:USDJPY" selected/);
  assert.match(h, /value="10" checked/); assert.doesNotMatch(h, /value="1" checked/);
  assert.match(h, /id="qt-prop" value="p-1"/); assert.match(h, /VIX leads yen/);
});
test('result: verdict chip says exploratory, quality, lead/lag svg and the horizon table', () => {
  const h = resultHtml(R, cat);
  assert.match(h, /· exploratory/); assert.match(h, /Never written to the Evidence Book/);
  assert.match(h, /US 2-year Treasury yield/); assert.match(h, /only when VIX/); assert.match(h, /<svg/);
  assert.equal((h.match(/<tr><td class="n">\d+d<\/td>/g) ?? []).length, 2, 'one row per horizon');
  assert.match(resultHtml({ ok: false, error: 'boom' }), /boom/); assert.equal(resultHtml(null), '');
});
test('list and the proposal chips link to the stored test', () => {
  const st = storeResult({}, 'qt-a', R, { proposalId: 'p-1' }), L = listOf(st);
  assert.match(listHtml(L, cat), /data-qtopen="qt-a"/); assert.match(listHtml([], cat), /No quick tests/);
  assert.match(linkedChips(L, 'p-1'), /data-qtopen="qt-a"/); assert.equal(linkedChips(L, 'p-2'), '');
});
test('lead/lag svg degrades and chips escape', () => {
  assert.equal(leadLagSvg(null), ''); assert.match(leadLagSvg(R.leadLag), /<rect/);
  assert.match(verdictChip('<x>'), /&lt;x&gt;/);
});

test('own past: the Y list offers it, the result says so', () => {
  const meta = { catalogue: [{ id: 'oanda:EURSEK', label: 'EUR/SEK' }], transforms: { chg5: '5-day change' }, horizons: [1, 5] };
  assert.match(formHtml(meta), /value="__own__"[^>]*>X's own later move/);
  assert.match(formHtml(meta, { x: 'oanda:EURSEK', y: 'oanda:EURSEK' }), /value="__own__" selected/);
  const t = { spec: { x: 'oanda:EURSEK', y: 'oanda:EURSEK', xTransform: 'chg5' }, ownPast: true, verdict: 'NULL', why: 'Own past ...', leadLag: { lags: [{ k: 1, r: -0.05 }], band: 0.03, peak: { k: 1, r: -0.05 }, sameDay: { r: 1 } }, horizons: [] };
  const h = resultHtml(t, meta.catalogue);
  assert.match(h, /its own later move/); assert.match(h, /read k ≥ 1 only/);
});
