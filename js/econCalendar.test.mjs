// Synthetic, no-network unit tests for the econ-calendar brick. Proves the
// ForexFactory → app-shape normalization: currency→country mapping, UTC time
// string, impact lowercasing, forecast/previous field renames, date sort, and
// bad-row dropping.
//
//   node js/econCalendar.test.mjs

import { normalizeForexFactory, normalizeFinnhub, msToCalTimeUTC, parseFFDate, CCY_TO_COUNTRY } from './econCalendar.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

console.log('econCalendar brick');

// A CPI print at 13:30 US-Eastern (EDT, -04:00) == 17:30:00 UTC.
const ffRows = [
  { title: 'Core CPI m/m', country: 'USD', date: '2026-07-14T13:30:00-04:00', impact: 'High',   forecast: '0.3%', previous: '0.2%' },
  { title: 'CB Leading Index m/m', country: 'GBP', date: '2026-07-14T14:30:00-04:00', impact: 'Low', forecast: '', previous: '-0.1%' },
  { title: 'ECB President Speaks', country: 'EUR', date: '2026-07-15T08:00:00+00:00', impact: 'Medium', forecast: '', previous: '' },
  { title: 'Bank Holiday', country: 'JPY', date: 'not-a-date', impact: 'Holiday' },   // dropped: bad date
];

const norm = normalizeForexFactory(ffRows);

ok('drops unparseable-date rows', norm.length === 3, `got ${norm.length}`);
ok('currency USD → country US', norm[0].country === 'US', norm[0].country);
ok('currency GBP → country GB', norm[1].country === 'GB', norm[1].country);
ok('currency EUR → country EU', norm[2].country === 'EU', norm[2].country);
ok('impact lowercased', norm[0].impact === 'high' && norm[2].impact === 'medium');
ok('title → event', norm[0].event === 'Core CPI m/m');
ok('forecast → estimate', norm[0].estimate === '0.3%');
ok('previous → prev', norm[0].prev === '0.2%');
ok('empty forecast → null estimate', norm[1].estimate === null);
ok('time is UTC "YYYY-MM-DD HH:MM:SS"', norm[0].time === '2026-07-14 17:30:00', norm[0].time);
ok('ms matches the UTC instant', norm[0].ms === Date.parse('2026-07-14T17:30:00Z'), String(norm[0].ms));
ok('sorted ascending by ms', norm[0].ms <= norm[1].ms && norm[1].ms <= norm[2].ms);
ok('today.html can re-derive ms from time', new Date(norm[0].time.replace(' ', 'T') + 'Z').getTime() === norm[0].ms);

// Round-trip helper
ok('msToCalTimeUTC round-trips', msToCalTimeUTC(Date.parse('2026-07-14T17:30:00Z')) === '2026-07-14 17:30:00');
ok('parseFFDate handles Z suffix', parseFFDate('2026-07-15T08:00:00Z') === Date.parse('2026-07-15T08:00:00Z'));
ok('parseFFDate rejects junk', parseFFDate('nope') === null);

// Guards
ok('normalizeForexFactory([]) → []', Array.isArray(normalizeForexFactory([])) && normalizeForexFactory([]).length === 0);
ok('normalizeForexFactory(null) → []', normalizeForexFactory(null).length === 0);
ok('CCY_TO_COUNTRY covers the 8 majors + CNY', Object.keys(CCY_TO_COUNTRY).length === 9);

// Finnhub fallback normalization keeps its native shape (country codes already).
const fh = normalizeFinnhub([
  { country: 'US', event: 'NFP', impact: 'high', time: '2026-07-14 12:30:00', estimate: 150, prev: 140 },
  { country: 'JP', event: 'BoJ Rate', impact: 'high', time: 'bad', estimate: null },   // dropped
]);
ok('finnhub: keeps country code, drops bad time', fh.length === 1 && fh[0].country === 'US');
ok('finnhub: parses "YYYY-MM-DD HH:MM:SS" as UTC', fh[0].ms === Date.parse('2026-07-14T12:30:00Z'), String(fh[0].ms));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll econCalendar tests passed');
process.exit(failures ? 1 : 0);
