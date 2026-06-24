// js/cogTradingDay.js — the event-driven backtest's "Trading day object".
//
// Groups a continuous intraday bar series into one object per calendar day
// and slices each day into the gate-specific evaluation windows
// COG_INTRADAY_SCHEDULE defines (08:00–12:30 Gate1B, 12:30–14:15 Gate2,
// 14:20–14:35 Gate3), so cogEventBacktestEngine.js never re-derives bar
// bucketing/window math itself — it only asks "which bars are in Gate1B's
// window today" / "what's today's entry bar" and gets a flat list back.

import { COG_INTRADAY_SCHEDULE } from './cogConfig.js';

// `dates[i]` = calendar-date string for bar i (repeats across a day's
// bars); `minuteOfDay[i]` = bar i's minutes-since-midnight, session-local.
// Both must already be ascending within each day (generateSyntheticIntraday
// CogDataset and any real intraday loader matching its shape produce this
// directly). Returns one TradingDay object per calendar day, in chronological
// order: { date, bars, gate1bBars, gate2Bars, gate3Bars, entryBar, postEntryBars }.
export function buildTradingDays(dates, minuteOfDay) {
  const days = [];
  let current = null;
  for (let i = 0; i < dates.length; i++) {
    if (!current || current.date !== dates[i]) {
      current = { date: dates[i], bars: [] };
      days.push(current);
    }
    current.bars.push(i);
  }
  return days.map(day => attachWindows(day, minuteOfDay));
}

// A bar belongs to a window when its minuteOfDay falls in
// [startMinute, endMinute] (inclusive both ends — the window boundaries
// themselves are valid evaluation moments). `entryBar` is the first bar
// strictly AFTER Gate3's window closes — the earliest possible fill bar,
// mirroring COG_EXECUTION.fillRule's "next-bar-open, never same bar"
// discipline at intraday resolution. `postEntryBars` is every bar after
// that, the pool the Exit Engine re-evaluates against once a trade is open.
function attachWindows(day, minuteOfDay) {
  const { gate1bWindow, gate2Window, gate3Window } = COG_INTRADAY_SCHEDULE;
  const inWindow = (i, w) => minuteOfDay[i] >= w.startMinute && minuteOfDay[i] <= w.endMinute;
  const gate1bBars = day.bars.filter(i => inWindow(i, gate1bWindow));
  const gate2Bars = day.bars.filter(i => inWindow(i, gate2Window));
  const gate3Bars = day.bars.filter(i => inWindow(i, gate3Window));
  const afterGate3 = day.bars.filter(i => minuteOfDay[i] > gate3Window.endMinute);
  return {
    date: day.date,
    bars: day.bars,
    gate1bBars,
    gate2Bars,
    gate3Bars,
    entryBar: afterGate3.length ? afterGate3[0] : null,
    postEntryBars: afterGate3.slice(1),
  };
}
