// Synthetic tests for js/scorecardHistory.js. No network, no clock.
//   node js/scorecardHistory.test.mjs
import { rowFromScorecard, upsertRow, sameRow, parseStore, seriesFor, MAX_ROWS, dayOf } from './scorecardHistory.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const T = Date.parse('2026-09-11T14:00:00Z');
const sc = (over = {}) => ({
  ranked: [
    { ccy: 'CAD', composite: 0.38, factorsScored: 4, factors: { rates: { score: 0.06 }, external: { score: 0.76 } } },
    { ccy: 'AUD', composite: -0.28, factorsScored: 5, factors: { rates: { score: -0.1 }, demand: { score: -0.75 } } },
  ],
  uncovered: [], staleCount: 1,
  driver: { key: 'external', spread: 1.58, high: 'CAD', low: 'JPY' },
  pair: { long: 'CAD', short: 'AUD', gap: 0.66 },
  ...over,
});

console.log('[rowFromScorecard — compact, and null stays null]');
{
  const r = rowFromScorecard(sc(), T);
  ok('dated by UTC day', r.d === '2026-09-11', r.d);
  ok('carries composite per currency', r.ranked[0].c === 0.38);
  ok('carries all six factor slots', Object.keys(r.ranked[0].f).length === 6);
  ok('an unscored factor is null, NOT zero', r.ranked[0].f.inflation === null);
  ok('a scored factor keeps its value', r.ranked[0].f.external === 0.76);
  ok('driver and pair are kept, compactly', r.driver.k === 'external' && r.pair.l === 'CAD');
  ok('a day that ranked nobody is a row with an empty ranking, not a missing row',
     rowFromScorecard({ ranked: [], uncovered: ['USD'] }, T).ranked.length === 0);
  ok('row is small — well under 1KB for two currencies', JSON.stringify(r).length < 600, String(JSON.stringify(r).length));
}

console.log('[upsertRow — one row per day, last write wins, nothing rewritten when unchanged]');
{
  const r1 = rowFromScorecard(sc(), T);
  let { rows, changed, action } = upsertRow([], r1);
  ok('first row appends', changed && action === 'appended' && rows.length === 1);
  ({ rows, changed, action } = upsertRow(rows, r1));
  ok('the same row again changes nothing — so the caller can skip the KV write', !changed && action === 'unchanged');
  ok('and does not duplicate the day', rows.length === 1);
  // The scorecard moves during the day as engines refresh. End-of-day state wins.
  const r1b = rowFromScorecard(sc({ pair: { long: 'CAD', short: 'JPY', gap: 0.7 } }), T + 3600_000);
  ({ rows, changed, action } = upsertRow(rows, r1b));
  ok('a changed row on the same day REPLACES', changed && action === 'replaced' && rows.length === 1);
  ok('with the later state', rows[0].pair.s === 'JPY');
  const r2 = rowFromScorecard(sc(), T + 864e5);
  ({ rows } = upsertRow(rows, r2));
  ok('the next day appends', rows.length === 2 && rows[1].d === '2026-09-12');
  // Out-of-order insert lands in date order.
  const r0 = rowFromScorecard(sc(), T - 864e5);
  ({ rows } = upsertRow(rows, r0));
  ok('rows stay sorted by day regardless of insertion order', rows.map(r => r.d).join() === '2026-09-10,2026-09-11,2026-09-12');
}
{
  // Cap trims from the OLD end.
  let rows = [];
  for (let i = 0; i < MAX_ROWS + 3; i++) ({ rows } = upsertRow(rows, rowFromScorecard(sc(), T + i * 864e5)));
  ok(`capped at MAX_ROWS (${MAX_ROWS})`, rows.length === MAX_ROWS);
  ok('and the newest day survives', rows.at(-1).d === dayOf(T + (MAX_ROWS + 2) * 864e5));
}

console.log('[parseStore — corrupt is NOT empty]');
{
  ok('null/empty -> [] (a fresh store)', parseStore(null).length === 0 && parseStore('').length === 0);
  ok('a valid store parses', parseStore(JSON.stringify({ rows: [{ d: '2026-01-01' }] })).length === 1);
  ok('a bare array is accepted too', parseStore('[{"d":"x"}]').length === 1);
  // THE case that wiped oi_history once: a read that came back garbage was treated
  // as "nothing stored" and the next write replaced 25 days of history with nothing.
  ok('unparseable -> null, so the caller REFUSES to write', parseStore('{not json') === null);
  ok('wrong shape -> null too', parseStore('{"rows": 42}') === null);
}

console.log('[seriesFor — what a study would consume]');
{
  let rows = [];
  for (let i = 0; i < 3; i++) ({ rows } = upsertRow(rows, rowFromScorecard(sc(), T + i * 864e5)));
  const s = seriesFor(rows, 'CAD');
  ok('one point per day for the currency', s.length === 3 && s[0].v === 0.38);
  ok('a factor series can be pulled the same way', seriesFor(rows, 'CAD', 'external')[0].v === 0.76);
  ok('a currency with no data yields an empty series, not nulls', seriesFor(rows, 'CHF').length === 0);
  ok('an unscored factor is dropped from the series rather than read as 0', seriesFor(rows, 'CAD', 'inflation').length === 0);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll scorecardHistory tests passed.');
