/**
 * London session clock — the pure, browser-safe half of the session vocabulary.
 *
 * ## Why this is its own file
 *
 * `_londonParts` and `SESSIONS` used to live in `js/sessionStats.js`, which also
 * fetches from Oanda, reads `process.env` and writes JSON with `fs`. That was fine
 * while every consumer ran in Node — but `js/volEstimatorAB.js` imports ONLY
 * `_londonParts` from it, and `volEstimatorAB` is the base of `buildLondonDaily`,
 * which ~14 engines compose. The moment one of those engines was imported by a
 * browser page (`forecast-reversion.html` -> `exhaustionLadderEngine` ->
 * `volEstimatorAB` -> `sessionStats`), the static `import fs from 'fs'` at the top
 * of sessionStats.js failed to resolve and took the ENTIRE page module down:
 *
 *     Failed to resolve module specifier "fs".
 *
 * That failure mode is nasty because it is silent in every test: node resolves `fs`
 * happily, so the whole suite stayed green while the page was dead on load. Nothing
 * about the importing code looked wrong — the break was three hops away, in a file
 * the page never knowingly touched.
 *
 * So the rule this file encodes: **a pure helper must not live behind an I/O
 * import.** Anything a browser-reachable brick needs belongs somewhere that imports
 * nothing environmental. `sessionStats.js` re-exports both names, so its existing
 * importers are unaffected.
 *
 * Pure: no fs, no network, no `process`, no module-level clock read.
 */

// Session windows in LONDON wall-clock hours, [start, end) — the definition the
// forecast page's session block, the session-stats job and the intraday research
// engines all share. Changing these changes every one of them, deliberately.
export const SESSIONS = {
  asia:   [0,  6],   // 00:00–06:00
  london: [8,  13],  // 08:00–13:00
  ny:     [13, 21],  // 13:00–21:00  (US open → NY close)
};

// One formatter, built once. `Intl.DateTimeFormat` construction is the expensive
// part; these are called per bar over millions of bars.
const _londonFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year:     'numeric', month:  '2-digit', day:  '2-digit',
  hour:     '2-digit', hour12: false,
});

/**
 * London calendar date + hour for an instant. DST-correct by construction — the
 * offset comes from the tz database via Intl, never from a hardcoded ±1.
 * @param {Date|number|string} date
 * @returns {{date: string, hour: number}} `date` as YYYY-MM-DD, `hour` 0–23
 */
export function _londonParts(date) {
  const parts = _londonFmt.formatToParts(date);
  const get = t => parts.find(p => p.type === t).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10),
  };
}
