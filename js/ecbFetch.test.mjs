// Synthetic test for ecbFetch.js. No real network — mocks global fetch where
// I/O is exercised; js/cbIndexFetch.test.mjs covers the RSS-parsing/matching
// logic these fetchers depend on.
//   node js/ecbFetch.test.mjs
import { yymmdd, PRESS_RSS_URL, FETCHERS, fetchStatement, fetchAccounts } from './ecbFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[yymmdd]');
{
  ok('2026-06-11 -> 260611', yymmdd('2026-06-11') === '260611', yymmdd('2026-06-11'));
  ok('matches the real confirmed URL fragment (ecb.is260611~...)', yymmdd('2026-06-11') === '260611');
}

console.log('[RSS URL / FETCHERS]');
{
  ok('press RSS URL is the confirmed live ECB feed', PRESS_RSS_URL === 'https://www.ecb.europa.eu/rss/press.xml');
  ok('FETCHERS has statement + accounts only (ECB combines statement+Q&A into one doc)', Object.keys(FETCHERS).sort().join(',') === 'accounts,statement');
}

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Monetary policy statement (with Q&A), 11 June 2026]]></title>
    <link>https://www.ecb.europa.eu/press/press_conference/monetary-policy-statement/2026/html/ecb.is260611~372040d313.en.html</link>
  </item>
  <item>
    <title>Meeting of 17-18 December 2025</title>
    <link>https://www.ecb.europa.eu/press/accounts/2026/html/ecb.mg260122~5ca84e0f51.en.html</link>
  </item>
</channel></rss>`;

console.log('[fetchStatement — RSS lookup + document fetch]');
{
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async url => {
    calls.push(url);
    if (url === PRESS_RSS_URL) return { ok: true, status: 200, text: async () => SAMPLE_RSS };
    return { ok: true, status: 200, text: async () => '<html><body><p>The Governing Council decided to hold rates steady.</p></body></html>' };
  };
  try {
    const r = await fetchStatement('2026-06-11');
    ok('finds and fetches the real statement URL from RSS', r.ok === true, JSON.stringify(r));
    ok('url is the resolved document link, not the feed URL', r.url.includes('ecb.is260611'), r.url);
    ok('text is extracted', r.text.includes('Governing Council'), r.text);
    ok('fetched the RSS feed then the document (2 calls)', calls.length === 2, calls);
  } finally { global.fetch = realFetch; }
}

console.log('[fetchStatement — regression: RSS fetched fine but date not found]');
{
  // The exact bug reported live, now against the RSS mechanism: a genuine
  // miss (RSS returns real content, item just isn't in it) must surface as
  // notYetPublished:false with a diagnostic, not go silent forever.
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => SAMPLE_RSS });
  try {
    const r = await fetchStatement('2099-01-01');
    ok('reports ok:false', r.ok === false);
    ok('notYetPublished is FALSE — a real miss, not "check later"', r.notYetPublished === false, r.notYetPublished);
    ok('carries a diagnostic error message', typeof r.error === 'string' && r.error.length > 0, r.error);
  } finally { global.fetch = realFetch; }
}
{
  // A genuine 404/network failure on the feed itself IS still "not yet published"-shaped.
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404 });
  try {
    const r = await fetchStatement('2026-06-11');
    ok('a real 404 on the feed itself stays notYetPublished:true', r.notYetPublished === true, r.notYetPublished);
  } finally { global.fetch = realFetch; }
}

console.log('[fetchAccounts — RSS title-text lookup]');
{
  const realFetch = global.fetch;
  global.fetch = async url => {
    if (url === PRESS_RSS_URL) return { ok: true, status: 200, text: async () => SAMPLE_RSS };
    return { ok: true, status: 200, text: async () => '<html><body><p>Participants agreed inflation was moving toward target.</p></body></html>' };
  };
  try {
    const r = await fetchAccounts('2025-12-17');
    ok('finds the accounts by meeting-date title text', r.ok === true, JSON.stringify(r));
    ok('url is the resolved accounts document', r.url.includes('ecb.mg260122'), r.url);
  } finally { global.fetch = realFetch; }
}
{
  // Accounts miss stays SILENT (notYetPublished:true) — unlike statement,
  // since the legitimate "not out yet" window is 4-7 weeks wide.
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => SAMPLE_RSS });
  try {
    const r = await fetchAccounts('2026-07-23');
    ok('a miss on accounts stays notYetPublished:true (wide legitimate window)', r.notYetPublished === true, r.notYetPublished);
  } finally { global.fetch = realFetch; }
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll ecbFetch tests passed.');
