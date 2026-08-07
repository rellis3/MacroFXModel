// Synthetic test for ecbFetch.js's pure helper. No network — the fetch*()
// I/O functions aren't exercised here (this sandbox can't reach
// ecb.europa.eu); js/cbIndexFetch.test.mjs covers the link-matching logic
// they depend on.
//   node js/ecbFetch.test.mjs
import { yymmdd, STATEMENT_INDEX_URL, ACCOUNTS_INDEX_URL, FETCHERS, fetchStatement } from './ecbFetch.js';

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

console.log('[fetchStatement — the "index fetched fine but pattern not found" case]');
{
  // Regression test for the exact bug reported live: the index page fetching
  // fine (200 OK) but the expected URL pattern not being in it must NOT be
  // silently treated the same as "not yet published" (that made a genuinely
  // weeks-old statement show as "due — awaiting fetch" forever with no
  // visible error). Mocks global fetch — no real network.
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '<html><body>no matching links here</body></html>' });
  try {
    const r = await fetchStatement('2026-06-11');
    ok('reports ok:false', r.ok === false);
    ok('notYetPublished is FALSE (this is a real problem, not "check later")', r.notYetPublished === false, r.notYetPublished);
    ok('carries a diagnostic error message', typeof r.error === 'string' && r.error.length > 0, r.error);
  } finally {
    global.fetch = realFetch;
  }
}
{
  // Genuine 404 on the index page itself IS still a "not yet published"-shaped miss.
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404 });
  try {
    const r = await fetchStatement('2026-06-11');
    ok('a real 404 on the index page itself stays notYetPublished:true', r.notYetPublished === true, r.notYetPublished);
  } finally {
    global.fetch = realFetch;
  }
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll ecbFetch tests passed.');
