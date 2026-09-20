import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBoeCsv, parseMofCsv, parseBubaCsv } from './intlYields.js';

test('BoE IADB rows parse to ISO dates, ascending, blanks dropped', () => {
  const rows = parseBoeCsv('DATE,IUDMNZC\n16 Sep 2026,5.2876\n02 Jan 2008,4.4603\n03 Jan 2008,\n');
  assert.deepEqual(rows, [{ date: '2008-01-02', value: 4.4603 }, { date: '2026-09-16', value: 5.2876 }]);
});

test('MoF rows: the 10Y column by header, note rows skipped, single-digit months padded', () => {
  const txt = 'Interest Rate (September 2026),,,,(Unit : %)\nDate,1Y,2Y,10Y,30Y\n2026/9/1,1.5,1.8,2.987,4.1\n2026/9/2,1.56,1.85,3.006,4.12\n,,,,\n"  If you cannot download the latest csv data, please clear the cache"\n';
  assert.deepEqual(parseMofCsv(txt), [{ date: '2026-09-01', value: 2.987 }, { date: '2026-09-02', value: 3.006 }]);
  assert.deepEqual(parseMofCsv(txt, '30Y').map(r => r.value), [4.1, 4.12]);
});

test('Bundesbank rows: header metadata ignored, "." missing values dropped', () => {
  const txt = '"",BBSIS.D.I.ZAR\n"","Yields, derived"\nDecimals,2,\nlast update,2026-09-18 12:10:18,\n1997-08-01,.,No value available\n2026-09-17,3.55,\n2026-09-18,3.52,\n';
  assert.deepEqual(parseBubaCsv(txt), [{ date: '2026-09-17', value: 3.55 }, { date: '2026-09-18', value: 3.52 }]);
});
