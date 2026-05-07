import { S } from './state.js';
import { getPipSize } from './utils.js';

const STRUCT_FIBS = [0.236, 0.382, 0.5, 0.618, 0.786, 0.886];

function fmtTime(dt) {
  if (!dt) return '—';
  const [date, time] = dt.split(' ');
  if (!date || !time) return dt;
  const [, m, d] = date.split('-');
  return `${time.slice(0, 5)} ${d}/${m}`;
}

function getCaps(symbol) {
  const isGold = symbol.includes('XAU');
  const sect = isGold ? S._caps?.gold : S._caps?.fx;
  return {
    lookbackDays: sect?.structuralLookbackDays ?? 30,
    pivotN:       sect?.structuralPivotN       ?? 5,
  };
}

export function calculateStructuralFibs(symbol) {
  const bars = S.ohlc30m[symbol]?.values;
  const empty = { rangeHigh: null, rangeLow: null, levels: [] };
  if (!bars?.length) { S.structuralFibData[symbol] = empty; return; }

  const { lookbackDays, pivotN } = getCaps(symbol);
  const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  const sorted = bars
    .filter(b => new Date(b.datetime.replace(' ', 'T') + 'Z').getTime() >= cutoffMs)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  if (sorted.length < pivotN * 2 + 1) { S.structuralFibData[symbol] = empty; return; }

  // Absolute high and low of the window (wick-based for structural anchors)
  let rangeHigh = { price: -Infinity, time: null };
  let rangeLow  = { price:  Infinity, time: null };
  sorted.forEach(b => {
    const h = parseFloat(b.high), l = parseFloat(b.low);
    if (h > rangeHigh.price) rangeHigh = { price: h, time: b.datetime };
    if (l < rangeLow.price)  rangeLow  = { price: l, time: b.datetime };
  });

  // N-bar swing pivot detection — strict greater/less than all neighbours
  const rawHighs = [], rawLows = [];
  for (let i = pivotN; i < sorted.length - pivotN; i++) {
    const h = parseFloat(sorted[i].high);
    const l = parseFloat(sorted[i].low);
    let isHigh = true, isLow = true;
    for (let j = i - pivotN; j <= i + pivotN && (isHigh || isLow); j++) {
      if (j === i) continue;
      if (parseFloat(sorted[j].high) >= h) isHigh = false;
      if (parseFloat(sorted[j].low)  <= l) isLow  = false;
    }
    if (isHigh) rawHighs.push({ price: h, time: sorted[i].datetime });
    if (isLow)  rawLows.push({ price: l, time: sorted[i].datetime });
  }

  const pipSize    = getPipSize(symbol);
  const snapThresh = pipSize * 3; // ignore pivots within 3 pips of the absolute extreme

  // Top 5 swing highs (highest to lowest), top 5 swing lows (lowest to highest)
  const filteredHighs = rawHighs
    .filter(sh => rangeHigh.price - sh.price > snapThresh)
    .sort((a, b) => b.price - a.price)
    .slice(0, 5);

  const filteredLows = rawLows
    .filter(sl => sl.price - rangeLow.price > snapThresh)
    .sort((a, b) => a.price - b.price)
    .slice(0, 5);

  const levels = [];

  function addFibs(anchorHigh, anchorLow, passType) {
    const range = anchorHigh.price - anchorLow.price;
    if (range <= 0) return;
    const timeLabel = `${fmtTime(anchorHigh.time)} → ${fmtTime(anchorLow.time)}`;
    STRUCT_FIBS.forEach(fib => {
      const base = {
        fibLevel: fib, label: String(fib), passType, timeLabel,
        anchorHigh: anchorHigh.price, anchorHighTime: anchorHigh.time,
        anchorLow: anchorLow.price,   anchorLowTime:  anchorLow.time,
      };
      levels.push({ ...base, price: anchorHigh.price - range * fib, direction: 'H→L' });
      levels.push({ ...base, price: anchorLow.price  + range * fib, direction: 'L→H' });
    });
  }

  // Pass 1: full lookback range
  addFibs(rangeHigh, rangeLow, 'range');
  // Pass 2: fix rangeLow anchor, walk fib top down through swing highs
  filteredHighs.forEach(sh => addFibs(sh, rangeLow, 'swing-high'));
  // Pass 3: fix rangeHigh anchor, walk fib bottom up through swing lows
  filteredLows.forEach(sl => addFibs(rangeHigh, sl, 'swing-low'));

  S.structuralFibData[symbol] = {
    rangeHigh, rangeLow,
    swingHighs: filteredHighs,
    swingLows:  filteredLows,
    levels,
  };
}
