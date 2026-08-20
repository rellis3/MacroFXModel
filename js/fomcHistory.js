// js/fomcHistory.js — historical scheduled FOMC decision days, 2016 → 2025.
//
// Companion to js/fomcCalendar.js (which deliberately carries only the live
// forward calendar). This list exists for the CB_SENTIMENT_PRICE_TEST backfill
// (Stage 2) and for diffing a meeting against its true predecessor — it is
// NOT merged into FOMC_MEETINGS so the live poller (`pendingAsOf`, 120-day
// lookback), the calendar route, and the dashboard history strip keep their
// existing behavior untouched.
//
// Provenance: every date below passed the Stage-1 join proof in
// `analysis/fomc_event_study/` — a ≥2× 14:00 ET five-minute volatility spike
// on EUR/USD M1 vs the same-clock 20-day baseline (82/82 including the 2026
// dates, median ratio 11.9×). That validates them against the market itself;
// cross-check against federalreserve.gov/monetarypolicy/fomccalendars.htm
// remains the documented pre-Stage-2 step. Intermeeting emergency actions
// (2020-03-03, 2020-03-15) are excluded by design — different release times,
// no statement-vs-previous comparability.
//
// `date` is the decision day (statement 2:00pm ET), same convention as
// FOMC_MEETINGS. `sep` marks Summary of Economic Projections meetings.
import { FOMC_MEETINGS } from './fomcCalendar.js';

export const FOMC_MEETINGS_HISTORICAL = [
  { date: '2016-01-27', sep: false }, { date: '2016-03-16', sep: true },
  { date: '2016-04-27', sep: false }, { date: '2016-06-15', sep: true },
  { date: '2016-07-27', sep: false }, { date: '2016-09-21', sep: true },
  { date: '2016-11-02', sep: false }, { date: '2016-12-14', sep: true },
  { date: '2017-02-01', sep: false }, { date: '2017-03-15', sep: true },
  { date: '2017-05-03', sep: false }, { date: '2017-06-14', sep: true },
  { date: '2017-07-26', sep: false }, { date: '2017-09-20', sep: true },
  { date: '2017-11-01', sep: false }, { date: '2017-12-13', sep: true },
  { date: '2018-01-31', sep: false }, { date: '2018-03-21', sep: true },
  { date: '2018-05-02', sep: false }, { date: '2018-06-13', sep: true },
  { date: '2018-08-01', sep: false }, { date: '2018-09-26', sep: true },
  { date: '2018-11-08', sep: false }, { date: '2018-12-19', sep: true },
  { date: '2019-01-30', sep: false }, { date: '2019-03-20', sep: true },
  { date: '2019-05-01', sep: false }, { date: '2019-06-19', sep: true },
  { date: '2019-07-31', sep: false }, { date: '2019-09-18', sep: true },
  { date: '2019-10-30', sep: false }, { date: '2019-12-11', sep: true },
  { date: '2020-01-29', sep: false }, { date: '2020-04-29', sep: false },
  { date: '2020-06-10', sep: true }, { date: '2020-07-29', sep: false },
  { date: '2020-09-16', sep: true }, { date: '2020-11-05', sep: false },
  { date: '2020-12-16', sep: true },
  { date: '2021-01-27', sep: false }, { date: '2021-03-17', sep: true },
  { date: '2021-04-28', sep: false }, { date: '2021-06-16', sep: true },
  { date: '2021-07-28', sep: false }, { date: '2021-09-22', sep: true },
  { date: '2021-11-03', sep: false }, { date: '2021-12-15', sep: true },
  { date: '2022-01-26', sep: false }, { date: '2022-03-16', sep: true },
  { date: '2022-05-04', sep: false }, { date: '2022-06-15', sep: true },
  { date: '2022-07-27', sep: false }, { date: '2022-09-21', sep: true },
  { date: '2022-11-02', sep: false }, { date: '2022-12-14', sep: true },
  { date: '2023-02-01', sep: false }, { date: '2023-03-22', sep: true },
  { date: '2023-05-03', sep: false }, { date: '2023-06-14', sep: true },
  { date: '2023-07-26', sep: false }, { date: '2023-09-20', sep: true },
  { date: '2023-11-01', sep: false }, { date: '2023-12-13', sep: true },
  { date: '2024-01-31', sep: false }, { date: '2024-03-20', sep: true },
  { date: '2024-05-01', sep: false }, { date: '2024-06-12', sep: true },
  { date: '2024-07-31', sep: false }, { date: '2024-09-18', sep: true },
  { date: '2024-11-07', sep: false }, { date: '2024-12-18', sep: true },
  { date: '2025-01-29', sep: false }, { date: '2025-03-19', sep: true },
  { date: '2025-05-07', sep: false }, { date: '2025-06-18', sep: true },
  { date: '2025-07-30', sep: false }, { date: '2025-09-17', sep: true },
  { date: '2025-10-29', sep: false }, { date: '2025-12-10', sep: true },
];

// Historical + live calendars merged, de-duped, date-ascending. The one list
// to iterate for a full-history statement backfill or to find a meeting's
// true predecessor across the historical/live boundary.
export function allMeetings() {
  const seen = new Set();
  return [...FOMC_MEETINGS_HISTORICAL, ...FOMC_MEETINGS]
    .filter(m => (seen.has(m.date) ? false : seen.add(m.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Decision day strictly before `dateStr`, or null at the start of history.
export function previousMeetingDate(dateStr) {
  const all = allMeetings();
  let prev = null;
  for (const m of all) {
    if (m.date >= dateStr) break;
    prev = m.date;
  }
  return prev;
}
