// Synthetic test for ecbFetch.js's pure helper. No network — the fetch*()
// I/O functions aren't exercised here (this sandbox can't reach
// ecb.europa.eu); js/cbIndexFetch.test.mjs covers the link-matching logic
// they depend on.
//   node js/ecbFetch.test.mjs
import { yymmdd, STATEMENT_INDEX_URL, ACCOUNTS_INDEX_URL, FETCHERS } from './ecbFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[yymmdd]');
{
  ok('2026-06-11 -> 260611', yymmdd('2026-06-11') === '260611', yymmdd('2026-06-11'));
  ok('matches the real confirmed URL fragment (ecb.is260611~...)', yymmdd('2026-06-11') === '260611');
}

console.log('[index URLs / FETCHERS]');
{
  ok('statement index URL is the confirmed ECB path', STATEMENT_INDEX_URL === 'https://www.ecb.europa.eu/press/press_conference/monetary-policy-statement/html/index.en.html');
  ok('accounts index URL is the confirmed ECB path', ACCOUNTS_INDEX_URL === 'https://www.ecb.europa.eu/press/accounts/html/index.en.html');
  ok('FETCHERS has statement + accounts only (ECB combines statement+Q&A into one doc)', Object.keys(FETCHERS).sort().join(',') === 'accounts,statement');
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll ecbFetch tests passed.');
