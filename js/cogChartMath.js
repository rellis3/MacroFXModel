// js/cogChartMath.js: the transform chain of C.OG's TradingView indicator ("C.OG - Euribor vs SOFR Rate Spread", pine/C.OG - Euribor vs SOFR Rate Spread.txt), as pure functions.
// Used by cog-chart.html and tested by js/cogChartMath.test.mjs. Every step is a separate function, so "the raw rate calculation" and "the visual scaling / plot offset" are never mixed:
//   price bars -> source pick -> (fixnan) -> rate (100 - price) -> spread (EUR - USD) -> invert -> bp -> EMA smoothing      = the RAW series (what a statistic would use)
//   RAW -> manual (x scale + offset) or auto-fit -> shift in bars                                                         = DISPLAY only (never an input to anything)
// Default settings are the ones C.OG said he used ("raw indicator with no smoothing or adjustment"): the identified line is the USD minus EUR rate in bp x 0.1 + 1.445.

export const TF_SEC = { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400 };
export const DEFAULTS = {
  eur: 'IH7', usd: 'SR3U6',            // the pasted indicator's inputs: EUR leg = I2! (Mar27, IH7 in the video week), USD leg = the pinned SOFR Sep26 contract
  dataTf: 'chart',                     // Pine "Data timeframe" (chart = same as the chart)
  src: 'close',                        // Pine "Price source"
  asRate: true, invert: true, inBps: true, smooth: 1, carry: true,
  mapMode: 'manual', scale: 0.1, offset: 1.445, fitLen: 250,
  shift: 0,                            // visual shift in chart bars (Pine "Projection (t + days)" is this, in days)
};

/** One price from an OHLC bar by the indicator's "Price source" choice. */
export function pickSource(o, h, l, c, src = 'close') {
  switch (src) {
    case 'open': return o;
    case 'high': return h;
    case 'low': return l;
    case 'hl2': return (h + l) / 2;
    case 'ohlc4': return (o + h + l + c) / 4;
    default: return c;
  }
}

/** {t,o,h,l,c} columns -> array of bar objects (null prices kept as null). */
export function barsFromColumns(cols) {
  const out = [];
  for (let i = 0; i < cols.t.length; i++) out.push({ t: cols.t[i], o: cols.o[i], h: cols.h[i], l: cols.l[i], c: cols.c[i] });
  return out;
}

/** Aggregate OHLC bars into fixed UTC-aligned buckets of stepSec (open = first, high = max, low = min, close = last). */
export function aggregateBars(bars, stepSec) {
  const m = new Map();
  for (const b of bars) {
    if (b.c == null) continue;
    const k = Math.floor(b.t / stepSec) * stepSec;
    const a = m.get(k);
    if (!a) m.set(k, { t: k, o: b.o, h: b.h, l: b.l, c: b.c });
    else { a.h = Math.max(a.h, b.h); a.l = Math.min(a.l, b.l); a.c = b.c; }
  }
  return [...m.values()].sort((x, y) => x.t - y.t);
}

/**
 * The leg's source price on each chart bar.
 *  data step == chart step: the data bar with the same open time.
 *  data step <  chart step: the data bars inside the chart bar are aggregated and the source is picked from that (the value as the chart bar ends).
 *  data step >  chart step: the last data bar that had ALREADY CLOSED at the chart bar's open (no look-ahead; Pine lookahead_off).
 * legBars: bars at the finest step available (5m or 15m). Returns an array of numbers/null aligned with chartTimes.
 */
export function legOnChart(legBars, chartTimes, chartStep, src = 'close', dataStep = null, legStep = 900) {
  const dStep = dataStep ?? chartStep;
  const out = new Array(chartTimes.length).fill(null);
  if (!legBars.length) return out;
  if (dStep === chartStep && legStep === chartStep) {
    const m = new Map(legBars.map(b => [b.t, b]));
    chartTimes.forEach((t, i) => { const b = m.get(t); if (b && b.c != null) out[i] = pickSource(b.o, b.h, b.l, b.c, src); });
    return out;
  }
  if (dStep <= chartStep) {
    // chart bars are not necessarily aligned to the UTC grid (OANDA H4), so aggregate the leg bars inside [t, t + chartStep) directly
    let k = 0;
    chartTimes.forEach((t, i) => {
      while (k < legBars.length && legBars[k].t < t) k++;
      let o = null, h = -Infinity, l = Infinity, c = null, n = 0;
      for (let q = k; q < legBars.length && legBars[q].t < t + chartStep; q++) {
        const b = legBars[q];
        if (b.c == null) continue;
        if (o == null) o = b.o;
        h = Math.max(h, b.h); l = Math.min(l, b.l); c = b.c; n++;
      }
      if (n) out[i] = pickSource(o, h, l, c, src);
    });
    return out;
  }
  const agg = aggregateBars(legBars, dStep);
  let j = 0;
  chartTimes.forEach((t, i) => {
    while (j + 1 < agg.length && agg[j + 1].t + dStep <= t) j++;
    const b = agg[j];
    if (b && b.t + dStep <= t) out[i] = pickSource(b.o, b.h, b.l, b.c, src);
  });
  return out;
}

/** Pine fixnan: carry the last valid value forward over gaps. */
export function carryForward(vals) {
  let last = null;
  return vals.map(v => { if (v != null && Number.isFinite(v)) last = v; return last; });
}

/** Pine ta.ema: alpha = 2/(n+1), seeded with the first value. n <= 1 returns the input unchanged. */
export function ema(vals, n) {
  if (!(n > 1)) return vals.slice();
  const a = 2 / (n + 1);
  let prev = null;
  return vals.map(v => {
    if (v == null || !Number.isFinite(v)) return prev;
    prev = prev == null ? v : a * v + (1 - a) * prev;
    return prev;
  });
}

/** A single leg as a series: price -> rate -> invert -> bp -> EMA. */
export function legRaw(prices, o) {
  const x = prices.map(p => (p == null ? null : (o.asRate ? 100 - p : p)));
  const y = x.map(v => (v == null ? null : (o.invert ? -v : v)));
  const z = y.map(v => (v == null ? null : (o.inBps ? v * 100 : v)));
  return ema(z, o.smooth);
}

/** The indicator's spread: (EUR leg - USD leg) in rate terms (or price terms if asRate is off), then invert -> bp -> EMA. */
export function spreadRaw(eurPrices, usdPrices, o) {
  const n = Math.min(eurPrices.length, usdPrices.length);
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const e = eurPrices[i], u = usdPrices[i];
    if (e == null || u == null) continue;
    let s = (o.asRate ? 100 - e : e) - (o.asRate ? 100 - u : u);
    if (o.invert) s = -s;
    if (o.inBps) s *= 100;
    out[i] = s;
  }
  return ema(out, o.smooth);
}

function rollingExtreme(vals, n, pick) {
  const out = new Array(vals.length).fill(null);
  for (let i = 0; i < vals.length; i++) {
    let v = null;
    for (let j = Math.max(0, i - n + 1); j <= i; j++) if (vals[j] != null) v = v == null ? vals[j] : pick(v, vals[j]);
    out[i] = v;
  }
  return out;
}

/**
 * RAW -> the number that is DRAWN on the price scale (display only).
 *  manual: raw x scale + offset (the indicator's "Manual").
 *  auto:   rescale raw into the chart's high-low over the last fitLen bars (the indicator's "Auto-fit").
 */
export function mapSeries(raw, o, priceHigh = [], priceLow = []) {
  if (o.mapMode === 'auto') {
    const sHi = rollingExtreme(raw, o.fitLen, Math.max), sLo = rollingExtreme(raw, o.fitLen, Math.min);
    const pHi = rollingExtreme(priceHigh, o.fitLen, Math.max), pLo = rollingExtreme(priceLow, o.fitLen, Math.min);
    return raw.map((v, i) => (v == null || sHi[i] == null || sHi[i] === sLo[i] || pHi[i] == null) ? null : pLo[i] + (v - sLo[i]) / (sHi[i] - sLo[i]) * (pHi[i] - pLo[i]));
  }
  return raw.map(v => (v == null ? null : v * o.scale + o.offset));
}

/** Visual shift by n chart bars (positive = to the right / later; extends past the last bar). Returns [{time, value}] with null values dropped. */
export function shiftPoints(times, vals, n, stepSec) {
  const out = [];
  const L = times.length;
  for (let i = 0; i < L; i++) {
    const k = i + n;
    if (k < 0 || vals[i] == null) continue;
    const t = k < L ? times[k] : times[L - 1] + (k - (L - 1)) * stepSec;
    out.push({ time: t, value: vals[i] });
  }
  return out;
}
