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

  function isCompleteSession(sessionBars) {
    if (!sessionBars || sessionBars.length < 60) return false;
    let maxHour = -1;
    for (const b of sessionBars) {
      const h = barLondonHour(b);
      if (h > maxHour) maxHour = h;
    }
    return maxHour >= 5;
  }

  const sortedDates = Object.keys(sessionsByDate).sort().reverse()
    .filter(d => isCompleteSession(sessionsByDate[d]));
  if (sortedDates.length < 2) {
    S.asiaRangeData[symbol] = { today: null, yesterday: null, todayLevels: [], yesterdayLevels: [], confluences: [] };
    return;
  }

  const today = computeBodyRange(sessionsByDate[sortedDates[0]]);
  const yesterday = computeBodyRange(sessionsByDate[sortedDates[1]]);
  if (today) today.date = sortedDates[0];
  if (yesterday) yesterday.date = sortedDates[1];

  const todayLevels = projectFibLevels(today);
  const yesterdayLevels = projectFibLevels(yesterday);
  const confluences = detectConfluences(todayLevels, yesterdayLevels, symbol, 'asia', today.range);

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

  function isCompleteMonday(sessionBars) {
    if (!sessionBars || sessionBars.length < 30) return false;
    let maxHour = -1;
    for (const b of sessionBars) {
      const h = barLondonHour(b);
      if (h > maxHour) maxHour = h;
    }
    return maxHour >= 22;
  }

  const sortedMondays = Object.keys(weekData).sort().reverse()
    .filter(d => isCompleteMonday(weekData[d]));
  if (sortedMondays.length < 2) {
    S.mondayRangeData[symbol] = { current: null, previous: null, currentLevels: [], previousLevels: [], confluences: [] };
    return;
  }

  const today = new Date();
  const isMonday = today.getDay() === 1;
  let effIdx = isMonday ? 1 : 0;
  let prevIdx = effIdx + 1;
  if (prevIdx >= sortedMondays.length) prevIdx = sortedMondays.length - 1;

  const current = computeBodyRange(weekData[sortedMondays[effIdx]]);
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
  const pipSize = getPipSize(symbol);
  const normalPips = getConfluenceThreshold(symbol);
  const calcDistance = normalPips * pipSize;

  const maxAllow = (bodyRange || 0) * 0.25 * 0.5;
  const normalDistance = (bodyRange && bodyRange > 0)
    ? Math.min(calcDistance, maxAllow)
    : calcDistance;
  const tightDistance = calcDistance * 0.10;

  const confluences = [];
  const seen = new Set();

  todayLevels.forEach(today => {
    yesterdayLevels.forEach(yesterday => {
      const diff = Math.abs(today.price - yesterday.price);
      if (diff <= normalDistance) {
        const price = Math.min(today.price, yesterday.price);
        const priceKey = price.toFixed(getDigits(symbol));
        if (!seen.has(priceKey)) {
          seen.add(priceKey);
          confluences.push({
            price,
            todayFib: today.fib,
            yesterdayFib: yesterday.fib,
            pipDiff: diff / pipSize,
            isTight: diff <= tightDistance,
            source
          });
        }
      }
    });
  });

  return confluences.sort((a, b) => {
    if (a.isTight && !b.isTight) return -1;
    if (!a.isTight && b.isTight) return 1;
    return a.price - b.price;
  });
}
