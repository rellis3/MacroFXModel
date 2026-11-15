// js/terminal/kchartCore.js: the PURE half of the Chart tab (KLineChart: an open-source candle chart with built-in indicators and drawing tools). No DOM, no fetch.
//
//   KLINE       the pinned library file we load (version, URL, Subresource Integrity hash, licence). Checked 2026-11-15: klinecharts 10.1.0 (published 2026-10-14), Apache-2.0
//               (LICENSE in the package, NOTICE names TradingView Lightweight Charts, whose Apache-2.0 licence ships beside it), 240 KB, no dependencies. The desk page sends no
//               Content-Security-Policy, so a pinned jsDelivr script loads; the integrity hash means a changed file would not run. KLineChart Pro (the ready-made toolbar) was
//               NOT used: its last release is 2023 (0.1.1) and it targets KLineChart 9, so the toolbar here is our own and only calls the core library.
//   toKline     our /api/desk-bars bars -> the library's candles
//   levelsFromDay   today's lines for a market from the /api/replay/day payload, by the Replay's own functions (js/replayCore.js): forecast lines, option walls within 3% of
//               price, the session's high and low so far, and the dawn read as a chip. Described as where price has been drawn to, never as which way it goes.
//   styleFor    the library's style object from the terminal's theme tokens, so every theme paints it and a theme change repaints it.
import { INSTRUMENTS as REPLAY_INSTRUMENTS, sessionOpen, levelsAt, londonHM } from '../replayCore.js';

export const KLINE = {
  version: '10.1.0',
  url: 'https://cdn.jsdelivr.net/npm/klinecharts@10.1.0/dist/umd/klinecharts.min.js',
  integrity: 'sha384-PdxmZHfTETfZiWcY/lOW/FdSPI3RTThvwFZDXUCvqNbLhWIL6z0bmLCSd7BorO6s',
  license: 'Apache-2.0',
};
export const NEAR = 0.03;   // option walls are drawn only within 3% of price

const PERIODS = { '5m': { type: 'minute', span: 5 }, '15m': { type: 'minute', span: 15 }, '30m': { type: 'minute', span: 30 }, '1h': { type: 'hour', span: 1 }, '4h': { type: 'hour', span: 4 } };
export const periodFor = tf => PERIODS[String(tf ?? '').toLowerCase()] ?? PERIODS['1h'];

/** Indicators the toolbar offers. `main` ones draw on the candles, the rest get their own pane under them. The bars carry no volume, so there is no volume indicator. */
export const INDICATORS = [
  { id: 'MA', label: 'Moving average', short: 'MA', main: true, note: 'Simple moving averages (5, 10, 30, 60 bars).' },
  { id: 'EMA', label: 'Exponential moving average', short: 'EMA', main: true, note: 'Exponential moving averages (6, 12, 20 bars).' },
  { id: 'BOLL', label: 'Bollinger bands', short: 'BOLL', main: true, note: '20-bar average with bands 2 standard deviations either side.' },
  { id: 'RSI', label: 'Relative strength index', short: 'RSI', main: false, note: '6, 12 and 24-bar RSI, 0 to 100.' },
  { id: 'MACD', label: 'MACD', short: 'MACD', main: false, note: 'MACD line, signal and histogram (12, 26, 9).' },
];
/** Drawing tools (the library's own overlay names). */
export const DRAWINGS = [
  { id: 'horizontalStraightLine', label: 'Horizontal line' }, { id: 'straightLine', label: 'Line' }, { id: 'rayLine', label: 'Ray' }, { id: 'segment', label: 'Segment' },
  { id: 'parallelStraightLine', label: 'Parallel lines' }, { id: 'priceChannelLine', label: 'Channel' }, { id: 'fibonacciLine', label: 'Fibonacci' },
];
export const indicatorById = id => INDICATORS.find(i => i.id === id) ?? null;
export const drawingById = id => DRAWINGS.find(d => d.id === id) ?? null;

const fin = v => v != null && v !== '' && Number.isFinite(+v);

/** /api/desk-bars bars ({ time (s), open, high, low, close }) -> the library's candles, oldest first, bad rows dropped. */
export function toKline(bars) {
  return (Array.isArray(bars) ? bars : []).filter(b => b && fin(b.time) && fin(b.open) && fin(b.high) && fin(b.low) && fin(b.close))
    .map(b => ({ timestamp: Math.round(+b.time * 1000), open: +b.open, high: +b.high, low: +b.low, close: +b.close, ...(fin(b.volume) ? { volume: +b.volume } : {}) }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
/** Prices to show: the Replay's own decimals where it knows the market, otherwise by size (5 under 10, 3 under 1000, else 2). */
export function precisionFor(inst, lastClose) {
  const dp = REPLAY_INSTRUMENTS[inst]?.dp;
  if (Number.isInteger(dp)) return dp;
  return !fin(lastClose) ? 2 : +lastClose < 10 ? 5 : +lastClose < 1000 ? 3 : 2;
}
/** The newest bars as the library wants them for a refresh: every bar from the last one it holds (that one is re-sent, it may still be forming). */
export function newerThan(data, lastTs) {
  if (!fin(lastTs)) return data;
  return data.filter(b => b.timestamp >= lastTs);
}

/**
 * Today's lines for a market. day = the /api/replay/day payload, now = the moment to read them at.
 * Returns { ok, lines:[{ id, label, price, tone, kind }], dawn: string|null, price, note } or { ok:false, note } when the market has no Replay data.
 * `tone` is a theme token name (pur2 for option walls, gold for forecast lines, tx2 for the session range): colour says WHAT the line is, never a direction.
 */
export function levelsFromDay(day, now) {
  const m1 = Array.isArray(day?.bars) ? day.bars : [], win = day?.win;
  if (!day?.ok || !m1.length || !win) return { ok: false, lines: [], dawn: null, price: null, note: 'No option or forecast lines for this market today.' };
  const open = sessionOpen(m1, win), seen = m1.filter(b => b[0] >= win.start && b[0] <= now);
  const last = seen.at(-1) ?? m1.at(-1), price = last ? last[4] : null;
  const ts = Math.min(now, win.end - 1);
  const lines = [];
  for (const l of levelsAt({ oi: day.oi?.entries ?? [], fc: day.forecast, open }, ts)) {
    if (l.kind === 'open') { lines.push({ id: l.id, label: 'Session open', price: l.price, tone: 'tx3', kind: 'open' }); continue; }
    if (l.kind === 'oi' && fin(price) && Math.abs(l.price / price - 1) > NEAR) continue;
    lines.push({ id: l.id, label: l.label, price: l.price, tone: l.kind === 'oi' ? 'pur2' : 'gold', kind: l.kind, ...(l.stale ? { stale: true } : {}) });
  }
  if (seen.length) {
    const hi = Math.max(...seen.map(b => b[2])), lo = Math.min(...seen.map(b => b[3]));
    lines.push({ id: 'sess:hi', label: 'Session high', price: hi, tone: 'tx2', kind: 'range' }, { id: 'sess:lo', label: 'Session low', price: lo, tone: 'tx2', kind: 'range' });
  }
  const d = day.dawn;
  const dawn = d && (d.tone || d.rating) ? `Dawn read: ${[d.tone, d.rating].filter(Boolean).join(', ')}${fin(d.finishedMs) ? `, written ${londonHM(d.finishedMs)} London` : ''}. A description of the morning's view, not a tested signal.` : null;
  return { ok: true, lines, dawn, price, note: lines.some(l => l.stale) ? 'Option walls are from an older capture (marked).' : '' };
}

/** The library's style object from a token map ({ up, dn, tx, tx2, tx3, line, bg1, pur2, gold }), so a theme change only needs a new map. Unknown keys are ignored by the library. */
export function styleFor(t) {
  const c = k => (t?.[k] && String(t[k]).trim()) || 'gray';   // a token the page could not read paints grey: never a hard-coded palette colour here (themeTokens.test.mjs)
  const up = c('up'), dn = c('dn'), tx2 = c('tx2'), tx3 = c('tx3'), line = c('line'), bg1 = c('bg1');
  const ax = { axisLine: { color: line }, tickLine: { color: line }, tickText: { color: tx3 } };
  const cross = { line: { color: tx3 }, text: { color: bg1, backgroundColor: tx2, borderColor: tx2 } };
  return {
    grid: { horizontal: { color: line }, vertical: { color: line } },
    candle: {
      bar: { upColor: up, downColor: dn, noChangeColor: tx3, upBorderColor: up, downBorderColor: dn, noChangeBorderColor: tx3, upWickColor: up, downWickColor: dn, noChangeWickColor: tx3 },
      priceMark: { high: { color: tx2 }, low: { color: tx2 }, last: { upColor: up, downColor: dn, noChangeColor: tx3, text: { color: bg1 } } },
      tooltip: { title: { color: tx2 }, legend: { color: tx2 } },
    },
    indicator: { lines: [c('pur2'), c('gold'), up, dn, tx2].map(color => ({ color })), tooltip: { title: { color: tx2 }, legend: { color: tx2 } } },
    xAxis: ax, yAxis: ax, separator: { color: line }, crosshair: { horizontal: cross, vertical: cross },
  };
}
export const TOKENS = ['up', 'dn', 'tx', 'tx2', 'tx3', 'line', 'bg1', 'pur2', 'gold'];

/** A symbol typed or linked -> a market the Replay covers is not required: any desk market has bars. */
export const cleanSymbol = (s, known) => { const w = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return known(w) ? w : null; };
