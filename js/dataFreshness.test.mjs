// Tests for js/dataFreshness.js.   node js/dataFreshness.test.mjs
import { freshness, healthLine, dayOf, lastBusinessDayBefore } from './dataFreshness.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

ok('dates are read from ISO strings and millisecond stamps, and nonsense gives null', dayOf('2026-10-24T19:05:23Z') === '2026-10-24' && dayOf(Date.parse('2026-10-22T10:00:00Z')) === '2026-10-22' && dayOf('soon') === null && dayOf(null) === null);
ok('the last business day before a weekend or Monday issue is Friday', lastBusinessDayBefore('2026-10-24') === '2026-10-23' && lastBusinessDayBefore('2026-10-25') === '2026-10-23' && lastBusinessDayBefore('2026-10-26') === '2026-10-23' && lastBusinessDayBefore('2026-10-27') === '2026-10-26');

const src = [
  { label: 'Market prices', source: 'OANDA, FRED', asOf: '2026-10-23', cadence: 'daily' },
  { label: 'CFTC positioning', source: 'CFTC', asOf: '2026-10-13', cadence: 'cftc' },
  { label: 'Hourly volatility log', source: 'own model', asOf: '2026-10-24T19:05:00Z', cadence: 'hourly' },
  { label: 'Option positions', source: 'CME', asOf: null, cadence: 'daily' },
  { label: 'Central-bank tone', source: 'statements', asOf: '2026-09-01', cadence: 'irregular' },
];
const rows = freshness(src, '2026-10-24');
const by = l => rows.find(r => r.label === l);
ok('daily prices holding Friday are current for a Saturday issue', by('Market prices').status === 'ok');
ok('a CFTC report a week behind is stale and says which one is out', by('CFTC positioning').status === 'stale' && /13 Oct/.test(by('CFTC positioning').note) && /20 Oct/.test(by('CFTC positioning').note));
ok('a feed that did not load is missing', by('Option positions').status === 'missing' && /did not load/.test(by('Option positions').note));
ok('hourly and irregular feeds are shown with their date and never flagged', by('Hourly volatility log').status === 'ok' && by('Central-bank tone').status === 'ok');
const line = healthLine(rows);
ok('the health line names exactly the problem feeds and nothing else', /CFTC positioning/.test(line) && /Option positions/.test(line) && !/Market prices|Hourly|Central-bank/.test(line));
ok('everything current gives no line at all', healthLine(freshness(src.filter(s => ['Market prices', 'Hourly volatility log'].includes(s.label)), '2026-10-24')) === '');
ok('daily prices that stop on Wednesday are stale on a Saturday', freshness([{ label: 'Prices', source: 'x', asOf: '2026-10-21', cadence: 'daily' }], '2026-10-24')[0].status === 'stale');
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
