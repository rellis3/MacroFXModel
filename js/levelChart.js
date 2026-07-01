/**
 * Level Chart — the reusable RENDER brick. A thin wrapper over TradingView
 * Lightweight-Charts that takes candles + a `Level[]` (from levelSources.js) or
 * scored zones (from clusterLevels) and draws them as price lines. Lifted out of
 * gold-zones.html so ANY strategy page can render its levels the same way:
 *
 *   import { createLevelChart } from './levelChart.js';
 *   const view = createLevelChart(document.getElementById('chart'), { height: 460 });
 *   view.setCandles(dailyBars);            // [{time,open,high,low,close}] (epoch seconds)
 *   view.setLevels(collectLevels(ctx));    // Level[] → coloured price lines by kind
 *   view.setZones(clusterLevels(levels, 8, 'EUR/USD'));  // optional scored bands
 *
 * Design
 *   • Pure style helpers (`styleForKind`, `levelToPriceLineOptions`) are exported
 *     and unit-tested in Node — they don't touch the DOM or the chart lib, so the
 *     colour/line-style contract is verifiable headless (js/levelChart.test.mjs).
 *   • The chart factory references `window.LightweightCharts` (or an injected
 *     `opts.LightweightCharts`) LAZILY, at call time — so importing this module in
 *     Node never needs a browser. It throws a clear error if the lib is absent.
 *   • Colour is keyed by the Level.kind that levelSources emits, so every page
 *     renders POC/VWAP/pivots/etc. in the same colour. One legend, everywhere.
 */

// LightweightCharts.LineStyle enum values (stable across v3/v4):
//   0 Solid · 1 Dotted · 2 Dashed · 3 LargeDashed · 4 SparseDotted
export const LINE_STYLE = { Solid: 0, Dotted: 1, Dashed: 2, LargeDashed: 3, SparseDotted: 4 };

// Colour + line style per level kind emitted by levelSources.js. `_default`
// catches anything unmapped so a new kind still renders (just neutrally).
export const KIND_STYLE = {
  daily_open:  { color: '#5b9dff', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  pdh:         { color: '#f87171', lineStyle: LINE_STYLE.Dashed, lineWidth: 1 },
  pdl:         { color: '#34d399', lineStyle: LINE_STYLE.Dashed, lineWidth: 1 },
  pwh:         { color: '#fb923c', lineStyle: LINE_STYLE.Dashed, lineWidth: 1 },
  pwl:         { color: '#fb923c', lineStyle: LINE_STYLE.Dashed, lineWidth: 1 },
  range_high:  { color: '#f59e0b', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  range_low:   { color: '#f59e0b', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  pivot_pp:    { color: '#c084fc', lineStyle: LINE_STYLE.Solid,  lineWidth: 2 },
  pivot_r:     { color: '#c084fc', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  pivot_s:     { color: '#c084fc', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  poc:         { color: '#facc15', lineStyle: LINE_STYLE.Solid,  lineWidth: 2 },
  vah:         { color: '#eab308', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  val:         { color: '#eab308', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  support:     { color: '#34d399', lineStyle: LINE_STYLE.Solid,  lineWidth: 1 },
  resistance:  { color: '#f87171', lineStyle: LINE_STYLE.Solid,  lineWidth: 1 },
  round_big:   { color: '#94a3b8', lineStyle: LINE_STYLE.Dashed, lineWidth: 1 },
  round_half:  { color: '#64748b', lineStyle: LINE_STYLE.SparseDotted, lineWidth: 1 },
  vwap:        { color: '#14b8a6', lineStyle: LINE_STYLE.Solid,  lineWidth: 2 },
  vwap_anchor: { color: '#0d9488', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  fib:         { color: '#22d3ee', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  zone:        { color: '#e0a93b', lineStyle: LINE_STYLE.Solid,  lineWidth: 2 },
  // Volatility-bot live-lines modal (bot-config.html): a forecast line's live
  // trade STATE. Kept generic here so any bot page can render the same key.
  //   vbBuy  — armed & direction = BUY (green)   vbSell — armed & SELL (red)
  //   vbMixed— buckets disagree on direction (amber)
  //   vbActed— already traded this session (grey, dashed)
  //   vbIdle — no armed bucket, not acted (faint neutral, dotted)
  //   vbOpen — the session open   vbPrice — live price
  vbBuy:       { color: '#10b981', lineStyle: LINE_STYLE.Solid,  lineWidth: 2 },
  vbSell:      { color: '#f87171', lineStyle: LINE_STYLE.Solid,  lineWidth: 2 },
  vbMixed:     { color: '#fbbf24', lineStyle: LINE_STYLE.Solid,  lineWidth: 2 },
  vbActed:     { color: '#9ca3af', lineStyle: LINE_STYLE.Dashed, lineWidth: 1 },
  vbIdle:      { color: '#5a6380', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  vbOpen:      { color: '#5b9dff', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
  vbPrice:     { color: '#e0a93b', lineStyle: LINE_STYLE.LargeDashed, lineWidth: 2 },
  _default:    { color: '#9ca3af', lineStyle: LINE_STYLE.Dotted, lineWidth: 1 },
};

// Resolve a kind to its style (falls back to _default).
export function styleForKind(kind) {
  return KIND_STYLE[kind] ?? KIND_STYLE._default;
}

// Map a Level → Lightweight-Charts createPriceLine options. Title defaults to the
// level's label; `showTitle:false` hides axis labels for dense grids. Width can
// be scaled by weight via `weightToWidth`.
export function levelToPriceLineOptions(level, opts = {}) {
  const s = styleForKind(level.kind);
  const width = opts.weightToWidth ? Math.max(1, Math.round((level.weight ?? 1))) : s.lineWidth;
  return {
    price: level.price,
    color: opts.color ?? s.color,
    lineWidth: width,
    lineStyle: s.lineStyle,
    axisLabelVisible: opts.showTitle !== false,
    title: opts.title ?? level.label ?? level.kind ?? '',
  };
}

// A scored zone (from clusterLevels) → a single emphasised price line whose width
// grows with the confluence score. Title shows score + contributing sources.
export function zoneToPriceLineOptions(zone, opts = {}) {
  const width = Math.max(2, Math.min(4, Math.round(1 + (zone.score ?? 1))));
  return {
    price: zone.price,
    color: opts.color ?? KIND_STYLE.zone.color,
    lineWidth: width,
    lineStyle: LINE_STYLE.Solid,
    axisLabelVisible: true,
    title: opts.title ?? `★${(zone.score ?? 0).toFixed(1)} ${(zone.sources ?? []).join('+')}`,
  };
}

// Normalise a bar to the Lightweight-Charts shape ({ time: seconds, o,h,l,c }).
function toLwcBar(b) {
  return { time: b.time, open: +b.open, high: +b.high, low: +b.low, close: +b.close };
}

const DARK = {
  layout: { background: { color: '#0b0e14' }, textColor: '#9ca3af' },
  grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
  rightPriceScale: { borderColor: '#1f2937' },
  timeScale: { borderColor: '#1f2937', timeVisible: true },
};

// Factory. `container` is a DOM element. `opts`: { height, LightweightCharts,
// candleColors, chartOptions }. Returns a small handle with setCandles /
// setLevels / setZones / clearLevels / destroy. Lazily resolves the chart lib so
// importing this module in Node never requires a browser.
export function createLevelChart(container, opts = {}) {
  const LWC = opts.LightweightCharts ?? (typeof window !== 'undefined' ? window.LightweightCharts : null);
  if (!LWC) throw new Error('levelChart: LightweightCharts is not loaded (add the standalone script, or pass opts.LightweightCharts)');

  const chart = LWC.createChart(container, {
    height: opts.height ?? 440,
    autoSize: opts.autoSize !== false,
    crosshair: { mode: LWC.CrosshairMode ? LWC.CrosshairMode.Normal : 0 },
    ...DARK,
    ...(opts.chartOptions ?? {}),
  });
  const series = chart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    ...(opts.candleColors ?? {}),
  });

  let priceLines = [];
  const clearLines = () => { for (const pl of priceLines) { try { series.removePriceLine(pl); } catch { /* ignore */ } } priceLines = []; };

  return {
    chart, series,
    setCandles(bars) {
      series.setData((bars ?? []).map(toLwcBar).sort((a, b) => a.time - b.time));
      return this;
    },
    setLevels(levels, lineOpts = {}) {
      clearLines();
      for (const lv of levels ?? []) {
        if (!Number.isFinite(lv.price)) continue;
        priceLines.push(series.createPriceLine(levelToPriceLineOptions(lv, lineOpts)));
      }
      return this;
    },
    setZones(zones, lineOpts = {}) {
      for (const z of zones ?? []) {
        if (!Number.isFinite(z.price)) continue;
        priceLines.push(series.createPriceLine(zoneToPriceLineOptions(z, lineOpts)));
      }
      return this;
    },
    clearLevels() { clearLines(); return this; },
    fit() { try { chart.timeScale().fitContent(); } catch { /* ignore */ } return this; },
    destroy() { clearLines(); try { chart.remove(); } catch { /* ignore */ } },
  };
}
