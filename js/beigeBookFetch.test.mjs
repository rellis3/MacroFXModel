// Synthetic test for beigeBookFetch.js's pure helper. No network — the
// fetchBeigeBook() I/O function isn't exercised here (this sandbox can't
// reach federalreserve.gov).
//   node js/beigeBookFetch.test.mjs
import { beigeBookPdfUrl } from './beigeBookFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[beigeBookPdfUrl — matched against real confirmed examples]');
{
  // Corrected 2026-08-08: the HTML "reader" page (beigebook{suffix}.htm)
  // turned out to be an AngularJS SPA whose real content never reaches a
  // plain fetch() — a live debug-fetch check confirmed it, see
  // beigeBookFetch.js's header for the full story. The PDF uses the Beige
  // Book's own release date directly, not the urlSuffix.
  ok('matches the real Jan 14 2026 example', beigeBookPdfUrl('2026-01-14') === 'https://www.federalreserve.gov/monetarypolicy/files/BeigeBook_20260114.pdf', beigeBookPdfUrl('2026-01-14'));
  ok('matches the real Jul 15 2026 example', beigeBookPdfUrl('2026-07-15') === 'https://www.federalreserve.gov/monetarypolicy/files/BeigeBook_20260715.pdf');
  ok('matches the real Mar 4 2026 example', beigeBookPdfUrl('2026-03-04') === 'https://www.federalreserve.gov/monetarypolicy/files/BeigeBook_20260304.pdf');
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll beigeBookFetch tests passed.');
