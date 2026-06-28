// Headless unit test for the render brick. Pure style helpers are checked
// directly; the chart factory is exercised against a MOCK LightweightCharts
// (injected via opts) so the wiring is verified with no browser.
//   node js/levelChart.test.mjs

import {
  styleForKind, levelToPriceLineOptions, zoneToPriceLineOptions,
  createLevelChart, KIND_STYLE, LINE_STYLE,
} from './levelChart.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

console.log('[style helpers]');
ok('known kind → its style', styleForKind('poc').color === KIND_STYLE.poc.color);
ok('unknown kind → _default', styleForKind('nope').color === KIND_STYLE._default.color);
const opt = levelToPriceLineOptions({ price: 1.2345, kind: 'vwap', label: 'VWAP', weight: 1.8 });
ok('levelToPriceLineOptions maps price/title/color', opt.price === 1.2345 && opt.title === 'VWAP' && opt.color === KIND_STYLE.vwap.color);
ok('lineStyle is a LINE_STYLE enum value', Object.values(LINE_STYLE).includes(opt.lineStyle));
ok('showTitle:false hides axis label', levelToPriceLineOptions({ price: 1, kind: 'fib' }, { showTitle: false }).axisLabelVisible === false);
ok('weightToWidth scales width by weight', levelToPriceLineOptions({ price: 1, kind: 'fib', weight: 3 }, { weightToWidth: true }).lineWidth === 3);
const zopt = zoneToPriceLineOptions({ price: 1.23, score: 4.2, sources: ['pivots', 'vwap'] });
ok('zone width grows with score (capped 4)', zopt.lineWidth === 4 && zopt.title.includes('pivots+vwap'));

console.log('[factory against mock LightweightCharts]');
// Minimal mock recording the calls the brick makes.
let removed = 0;
const mkSeries = () => ({
  _data: null, _lines: [],
  setData(d) { this._data = d; },
  createPriceLine(o) { const pl = { ...o }; this._lines.push(pl); return pl; },
  removePriceLine(pl) { removed++; const i = this._lines.indexOf(pl); if (i >= 0) this._lines.splice(i, 1); },
});
const mockLWC = {
  CrosshairMode: { Normal: 0 },
  createChart() {
    const series = mkSeries();
    return { _series: series, addCandlestickSeries() { return series; }, timeScale() { return { fitContent() {} }; }, remove() {} };
  },
};

const view = createLevelChart({}, { LightweightCharts: mockLWC, height: 300 });
view.setCandles([
  { time: 30, open: 1, high: 2, low: 0.5, close: 1.5 },
  { time: 10, open: 1, high: 2, low: 0.5, close: 1.2 },   // out of order on purpose
  { time: 20, open: 1, high: 2, low: 0.5, close: 1.1 },
]);
ok('setCandles sorts ascending by time', view.series._data.map(b => b.time).join(',') === '10,20,30');

view.setLevels([
  { price: 1.10, kind: 'poc', label: 'POC' },
  { price: NaN, kind: 'fib', label: 'bad' },              // must be skipped
  { price: 1.20, kind: 'vwap', label: 'VWAP' },
]);
ok('setLevels draws finite levels, skips NaN', view.series._lines.length === 2);

const before = removed;
view.setLevels([{ price: 1.30, kind: 'support', label: 'S' }]);
ok('setLevels clears previous lines first', removed - before === 2 && view.series._lines.length === 1);

view.setZones([{ price: 1.25, score: 3, sources: ['pivots'] }]);
ok('setZones appends a zone line', view.series._lines.length === 2);

ok('missing LightweightCharts throws clearly', (() => {
  try { createLevelChart({}, {}); return false; } catch (e) { return /LightweightCharts/.test(e.message); }
})());

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
