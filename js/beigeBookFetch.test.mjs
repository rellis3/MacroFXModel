// Synthetic test for beigeBookFetch.js's pure helper. No network — the
// fetchBeigeBook() I/O function isn't exercised here (this sandbox can't
// reach federalreserve.gov).
//   node js/beigeBookFetch.test.mjs
import { beigeBookUrl } from './beigeBookFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[beigeBookUrl — matched against real confirmed examples]');
{
  ok('matches the real Jan 2024 example', beigeBookUrl('202401') === 'https://www.federalreserve.gov/monetarypolicy/beigebook202401.htm', beigeBookUrl('202401'));
  ok('matches the real Mar 2025 example (suffix 02, not the release month 03)', beigeBookUrl('202502') === 'https://www.federalreserve.gov/monetarypolicy/beigebook202502.htm');
  ok('matches the real Jan 2026 example', beigeBookUrl('202601') === 'https://www.federalreserve.gov/monetarypolicy/beigebook202601.htm');
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll beigeBookFetch tests passed.');
