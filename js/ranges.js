import { S } from './state.js';
import { FIB_LEVELS } from './config.js';
import { barLondonHour, barLondonDay, getPipSize, getDigits, getConfluenceThreshold } from './utils.js';

export function calculateAsiaRanges(symbol) {
  const bars = S.ohlc5m[symbol]?.values;
  if (!bars?.length) {
    S.asiaRangeData[symbol] = { today: null, yesterday: null, todayLevels: [], yesterdayLevels: [], confluences: [] };
    return;
  }

  const sessionsByDate = {};
  bars.forEach(bar => {
    const hour = barLondonHour(bar);
    if (hour >= 0 && hour < 6) {
      const dateKey = bar.datetime.split(' ')[0];
      const dow = new Date(dateKey + 'T12:00:00Z').getUTCDay(); // 0=Sun,6=Sat
      if (dow === 0 || dow === 6) return;
      if (!sessionsByDate[dateKey]) sessionsByDate[dateKey] = [];
      sessionsByDate[dateKey].push(bar);
    }
  });

  // A session is usable if it has enough bars to produce a meaningful range.
  // 36 bars = 3 hours of 5m data — enough for a body range, handles holidays
  // where data may end early. No hour-ceiling check so truncated sessions pass.
  function isCompleteSession(sessionBars) {
    return !!(sessionBars && sessionBars.length >= 36);
  }

  const sortedDates = Object.keys(sessionsByDate).sort().reverse()
    .filter(d => isCompleteSession(sessionsByDate[d]));
  if (sortedDates.length < 1) {
    S.asiaRangeData[symbol] = { today: null, yesterday: null, todayLevels: [], yesterdayLevels: [], confluences: [] };
    return;
  }

  const today     = computeBodyRange(sessionsByDate[sortedDates[0]]);
  const yesterday = sortedDates.length >= 2 ? computeBodyRange(sessionsByDate[sortedDates[1]]) : null;
  if (today)     today.date     = sortedDates[0];
  if (yesterday) yesterday.date = sortedDates[1];

  const todayLevels     = projectFibLevels(today);
  const yesterdayLevels = projectFibLevels(yesterday);
  const confluences = today && yesterday
    ? detectConfluences(todayLevels, yesterdayLevels, symbol, 'asia', today.range)
    : [];

  S.asiaRangeData[symbol] = { today, yesterday, todayLevels, yesterdayLevels, confluences };
}

export function computeBodyRange(bars) {
  if (!bars?.length) return null;
  let bodyHigh = -Infinity, bodyLow = Infinity;
  bars.forEach(bar => {
    const o = parseFloat(bar.open), c = parseFloat(bar.close);
    bodyHigh = Math.max(bodyHigh, Math.max(o, c));
    bodyLow = Math.min(bodyLow, Math.min(o, c));
  });
  return { high: bodyHigh, low: bodyLow, range: bodyHigh - bodyLow, barCount: bars.length };
}

export function calculateMondayRanges(symbol) {
  const bars = S.ohlc30m[symbol]?.values;
  if (!bars?.length) {
    S.mondayRangeData[symbol] = { current: null, previous: null, currentLevels: [], previousLevels: [], confluences: [] };
    return;
  }

  const weekData = {};
  bars.forEach(bar => {
    if (barLondonDay(bar) === 1) {
      const dateKey = bar.datetime.split(' ')[0];
      if (!weekData[dateKey]) weekData[dateKey] = [];
      weekData[dateKey].push(bar);
    }
  });

  // A Monday is usable if it has enough bars to produce a meaningful range.
  // 60 bars = 2 hours of 30m data (full Mon needs ~44 bars). Handles thin holidays.
  function isCompleteMonday(sessionBars) {
    return !!(sessionBars && sessionBars.length >= 20);
  }

  const sortedMondays = Object.keys(weekData).sort().reverse()
    .filter(d => isCompleteMonday(weekData[d]));
  if (sortedMondays.length < 1) {
    S.mondayRangeData[symbol] = { current: null, previous: null, currentLevels: [], previousLevels: [], confluences: [] };
    return;
  }

  const today = new Date();
  const isMonday = today.getDay() === 1;
  const effIdx  = (isMonday && sortedMondays.length >= 2) ? 1 : 0;
  const prevIdx = effIdx + 1;

  const current  = computeBodyRange(weekData[sortedMondays[effIdx]]);
  const previous = prevIdx < sortedMondays.length ? computeBodyRange(weekData[sortedMondays[prevIdx]]) : null;
  if (current) current.date = sortedMondays[effIdx];
  if (previous) previous.date = sortedMondays[prevIdx];

  const currentLevels = current ? projectFibLevels(current) : [];
  const previousLevels = previous ? projectFibLevels(previous) : [];
  const confluences = current && previous
    ? detectConfluences(currentLevels, previousLevels, symbol, 'monday', current.range)
    : [];

  S.mondayRangeData[symbol] = { current, previous, currentLevels, previousLevels, confluences };
}

export function projectFibLevels(range) {
  if (!range) return [];
  return FIB_LEVELS.map(fib => ({
    fib,
    price: range.low + (range.range * fib)
  }));
}

// Returns the close of the most recently CLOSED 5-min bar.
// Direction only flips when a candle closes on the other side of a level,
// avoiding live-tick flicker. Falls back to window._latestQuote.
export function getAnchorPrice(symbol) {
  const bars = S.ohlc5m[symbol]?.values;
  if (bars && bars.length) {
    const nowMs = Date.now();
    for (const b of bars) {
      const openMs = new Date(b.datetime.replace(' ', 'T') + 'Z').getTime();
      if (nowMs - openMs >= 5 * 60 * 1000) {
        return parseFloat(b.close);
      }
    }
  }
  const q = window._latestQuote;
  return q ? q.price : null;
}

export function directionFromPrice(levelPrice, anchorPrice, symbol) {
  if (anchorPrice == null || isNaN(anchorPrice)) return null;
  const tick = getPipSize(symbol) * 0.5;
  if (levelPrice > anchorPrice + tick) return 'short';
  if (levelPrice < anchorPrice - tick) return 'long';
  return null;
}

export function detectConfluences(todayLevels, yesterdayLevels, symbol, source, bodyRange) {
  const pipSize   = getPipSize(symbol);
  const calcDistance = getConfluenceThreshold(symbol) * pipSize;

  // With 45 fib levels (-10.5 to +10.5) the combined sorted price list always contains
  // cross-session pairs within a fraction of a pip, making the old fibCap collapse to
  // near-zero and blocking all confluences. The pip-based calcDistance + Layer 3
  // clustering are sufficient guards — no dynamic cap needed.
  const normalDistance = calcDistance;
  const tightDistance  = calcDistance * 0.10;

  // Layer 1: collect ALL qualifying pairs (no dedup yet — we need density counts).
  // Use midpoint as the representative price rather than always picking the lower.
  const rawPairs = [];
  todayLevels.forEach(today => {
    yesterdayLevels.forEach(yesterday => {
      const diff = Math.abs(today.price - yesterday.price);
      if (diff <= normalDistance) {
        rawPairs.push({
          price:         (today.price + yesterday.price) / 2,
          todayFib:      today.fib,
          yesterdayFib:  yesterday.fib,
          pipDiff:       diff / pipSize,
          isTight:       diff <= tightDistance,
          source,
        });
      }
    });
  });

  if (!rawPairs.length) return [];

  // Layer 3: cluster merge — group rawPairs whose midpoints are within tightDistance
  // of the running cluster centre. Each cluster becomes one final confluence level.
  // Density = how many raw pairs collapsed into that level.
  rawPairs.sort((a, b) => a.price - b.price);

  const clusters = [];
  let bucket = [rawPairs[0]];

  for (let i = 1; i < rawPairs.length; i++) {
    const centre = bucket.reduce((s, p) => s + p.price, 0) / bucket.length;
    if (rawPairs[i].price - centre <= tightDistance) {
      bucket.push(rawPairs[i]);
    } else {
      clusters.push(bucket);
      bucket = [rawPairs[i]];
    }
  }
  clusters.push(bucket);

  const confluences = clusters.map(cluster => {
    const price        = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
    const density      = cluster.length;
    const pipDiff      = Math.min(...cluster.map(p => p.pipDiff));
    const isTight      = cluster.some(p => p.isTight);
    const todayFibs    = [...new Set(cluster.map(p => p.todayFib))];
    const yesterdayFibs= [...new Set(cluster.map(p => p.yesterdayFib))];
    return {
      price,
      todayFib:      todayFibs[0],
      yesterdayFib:  yesterdayFibs[0],
      todayFibs,
      yesterdayFibs,
      pipDiff,
      isTight,
      source,
      density,       // # of raw fib-pair overlaps that collapsed into this zone
    };
  });

  return confluences.sort((a, b) => {
    if (a.isTight && !b.isTight) return -1;
    if (!a.isTight && b.isTight) return 1;
    return a.price - b.price;
  });
}
