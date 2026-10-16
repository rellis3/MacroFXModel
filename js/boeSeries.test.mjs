import assert from 'node:assert/strict';
import { parseIadbCsv, monthlyMean, isBoeSeries } from './boeSeries.js';

const csv = 'DATE,IUDBEDR\n30 Sep 2026,4.00\n01 Oct 2026,3.75\n15 Oct 2026,3.75\n02 Sep 2026,4.00\nbad line\n';
const pts = parseIadbCsv(csv);
assert.equal(pts.length, 4);
assert.equal(pts[0].date, '2026-09-02');                     // sorted ascending
assert.deepEqual(monthlyMean(pts), [{ date: '2026-09-01', value: 4 }, { date: '2026-10-01', value: 3.75 }]);   // FRED monthly convention
assert.ok(isBoeSeries('BOE_IUDBEDR_M') && isBoeSeries('BOE_IUDBEDR') && !isBoeSeries('IR3TIB01GBM156N'));
console.log('boeSeries: all passed');
