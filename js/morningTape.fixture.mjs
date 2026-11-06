// The 5-6 Nov 2026 morning tape, as Atlas builds its `assets` rows (atlas.html nlInput), for the newsletter tests.
// Closes: Wed 4 Nov and Thu 5 Nov (17:00 New York); live: Fri 6 Nov 07:00Z. Thursday was the Nasdaq's -7.03% day.
// hlMed (the forecast median day range, % of price) and Thursday's highs and lows are illustrative, not the stored values.
import { closeMove } from './closeBasis.js';

export const NOW = Date.UTC(2026, 10, 6, 7, 0);
const M = [
  // key, label, Wed close, Thu close, Fri live (null: no live price), hlMed, Thu high, Thu low, dp
  ['NQ', 'Nasdaq', 28537.8, 26531, 26883.3, 1.71, 28610, 26420, 1],
  ['SPX500', 'S&P 500', 7712.2, 7334.2, null, 1.35, 7720, 7310, 1],
  ['DE30', 'DAX', 26636.8, 26201.4, 26017.8, 1.25, 26700, 26120, 1],
  ['GOLD', 'Gold', 4060.355, 4088.225, 4055.64, 1.6, 4110, 4041, 2],
  ['AUDUSD', 'AUD/USD', 0.7006, 0.693, 0.68772, 0.62, 0.7012, 0.6921, 5],
];
export const ASSETS = M.map(([key, label, wed, thu, live, hlMed, yHigh, yLow, dp]) => {
  const cm = closeMove({ last: thu, prev: wed, lastDate: '2026-11-05', latestDate: '2026-11-05', live, nowMs: NOW });
  return { key, label, groupLabel: '', spark: [wed, thu], d1: cm.d1, d1Basis: cm.basis, d1Label: cm.label, d1AsOf: cm.asOf,
    prevClose: cm.basis === 'live' ? wed : null, lastClose: thu, yHigh, yLow, yDate: '2026-11-05',
    price: live != null ? live.toFixed(dp) : null, hlMed, used: null, d20: null };
});
export const EVENING = [{ date: '2026-11-05', subject: 'Evening: The Nasdaq\'s worst day in years, and the dollar bid' }];
