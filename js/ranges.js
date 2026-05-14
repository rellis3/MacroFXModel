import { S } from './state.js';
import { FIB_LEVELS, CAP_DEFAULTS } from './config.js';
import { barLondonHour, barLondonDay, getPipSize, getDigits, getConfluenceThreshold, getMergeFactor, filterTradingDays } from './utils.js';
import { detectConfluencesCore } from './confluence-core.js';

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

  // Use London local time — not browser timezone — to detect Monday.
  const _londonParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short'
  }).formatToParts(new Date());
  const _londonWeekday = _londonParts.find(p => p.type === 'weekday')?.value;
  const isMonday = _londonWeekday === 'Mon';
  const effIdx   = (isMonday && sortedMondays.length >= 2) ? 1 : 0;
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
  const pipSize        = getPipSize(symbol);
  const normalDistance = getConfluenceThreshold(symbol) * pipSize;
  const tightDistance  = normalDistance * 0.10;
  const mergeDistance  = normalDistance * getMergeFactor(symbol);
  const caps           = S._caps ?? CAP_DEFAULTS;
  const priceMode      = caps.confluencePriceMode ?? CAP_DEFAULTS.confluencePriceMode;
  const clusterMerge   = caps.clusterMerge        ?? CAP_DEFAULTS.clusterMerge;

  const results = detectConfluencesCore(todayLevels, yesterdayLevels, {
    pipSize, normalDistance, tightDistance, mergeDistance,
    priceMode, clusterMerge, source,
  });

  return results.sort((a, b) => {
    if (a.isTight && !b.isTight) return -1;
    if (!a.isTight && b.isTight) return 1;
    return a.price - b.price;
  });
}

// Point Fib levels for daily range retracement matching.
// GP (0.618-0.65) is handled separately as a zone, not a point.
// Strength: 'silver' = 0.786/0.886, 'bronze' = 0.382/0.5
const _DAILY_FIBS = [
  { level: 0.382, label: '0.382', strength: 'bronze' },
  { level: 0.5,   label: '0.5',   strength: 'bronze' },
  { level: 0.786, label: '0.786', strength: 'silver' },
  { level: 0.886, label: '0.886', strength: 'silver' },
];

// Returns all daily Fib retracement levels from both directions of the most recent daily bar.
// GP is returned as a zone entry { isZone:true, priceMin, priceMax } — the matching logic
// checks whether a confluence price falls INSIDE the zone, not just near a point.
export function getDailyFibLevels(symbol) {
  const bars = filterTradingDays(S.ohlcData[symbol]?.values);
  if (!bars?.length) return [];
  const bar = bars[0];  // newest first from TwelveData
  const high = parseFloat(bar.high);
  const low  = parseFloat(bar.low);
  const range = high - low;
  if (range <= 0) return [];

  const levels = [];

  // Point levels — matched within confluence threshold
  _DAILY_FIBS.forEach(f => {
    levels.push({ price: low + range * f.level,  fibLevel: f.level, label: f.label, direction: 'L→H', strength: f.strength, isZone: false });
    levels.push({ price: high - range * f.level, fibLevel: f.level, label: f.label, direction: 'H→L', strength: f.strength, isZone: false });
  });

  // GP zone — 0.618 to 0.65 from each direction.
  // L→H: zone between (low + 0.618×range) and (low + 0.65×range)
  // H→L: zone between (high - 0.65×range) and (high - 0.618×range)
  const gpDefs = [
    { direction: 'L→H', priceMin: low + range * 0.618, priceMax: low + range * 0.65  },
    { direction: 'H→L', priceMin: high - range * 0.65,  priceMax: high - range * 0.618 },
  ];
  gpDefs.forEach(({ direction, priceMin, priceMax }) => {
    levels.push({
      price:    (priceMin + priceMax) / 2,
      priceMin,
      priceMax,
      fibLevel: 'GP',
      label:    'GP zone',
      direction,
      strength: 'gold',
      isZone:   true,
    });
  });

  return levels;
}
