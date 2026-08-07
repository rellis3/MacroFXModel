// Synthetic test for the generic central-bank index-page link finders. No
// network — this sandbox cannot fetch a live ECB index page to verify
// against, so these test the matching LOGIC against representative fixtures
// built from real URL/text patterns confirmed via web search during the
// ECB build (ecb.is260611~372040d313.en.html style URLs; "Meeting of
// 17-18 December 2025" style accounts index link text).
//   node js/cbIndexFetch.test.mjs
import { findLinkByUrlDatePattern, findLinkByDateText, resolveUrl, parseRssItems, findRssLinkByUrlPattern, findRssLinkByTitleText } from './cbIndexFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[findLinkByUrlDatePattern]');
{
  const html = `<ul>
    <li><a href="/press/press_conference/monetary-policy-statement/2026/html/ecb.is260430~f99cb123a8.en.html">30 April 2026</a></li>
    <li><a href="/press/press_conference/monetary-policy-statement/2026/html/ecb.is260611~372040d313.en.html">11 June 2026</a></li>
  </ul>`;
  const url = findLinkByUrlDatePattern(html, 'is', '260611');
  ok('finds the June statement by its date-prefixed URL', url === '/press/press_conference/monetary-policy-statement/2026/html/ecb.is260611~372040d313.en.html', url);
  ok('does not match a different date', findLinkByUrlDatePattern(html, 'is', '260101') === null);
}
{
  ok('no matching prefix -> null, not a crash', findLinkByUrlDatePattern('<a href="/x.html">nothing</a>', 'is', '260611') === null);
}

console.log('[findLinkByDateText]');
{
  const html = `<ul>
    <li><a href="/press/accounts/2025/html/ecb.mg251009~eec3e95eb5.en.html">Meeting of 10-11 September 2025</a></li>
    <li><a href="/press/accounts/2026/html/ecb.mg260122~5ca84e0f51.en.html">Meeting of 17-18 December 2025</a></li>
  </ul>`;
  const url = findLinkByDateText(html, ['17', 'December', '2025']);
  ok('finds the Dec 2025 meeting account by link text', url === '/press/accounts/2026/html/ecb.mg260122~5ca84e0f51.en.html', url);
  const url2 = findLinkByDateText(html, ['18', 'December', '2025']);
  ok('also matches on the OTHER day of a 2-day meeting', url2 === url, url2);
  ok('no match -> null, not a crash', findLinkByDateText(html, ['1', 'January', '2099']) === null);
}
{
  // Terms must ALL co-occur — a partial match (right month/year, wrong day) must not fire.
  const html = `<a href="/wrong.html">Meeting of 3-5 June 2025</a>`;
  ok('partial term match does not fire', findLinkByDateText(html, ['17', 'December', '2025']) === null);
}

console.log('[resolveUrl]');
{
  ok('absolute URL passes through unchanged', resolveUrl('https://x.com/a.html', 'https://x.com') === 'https://x.com/a.html');
  ok('relative URL resolved against origin', resolveUrl('/press/a.html', 'https://www.ecb.europa.eu') === 'https://www.ecb.europa.eu/press/a.html');
  ok('relative URL without leading slash resolved', resolveUrl('a.html', 'https://www.ecb.europa.eu/press') === 'https://www.ecb.europa.eu/press/a.html');
  ok('null href -> null', resolveUrl(null, 'https://x.com') === null);
}

console.log('[parseRssItems / findRssLinkByUrlPattern / findRssLinkByTitleText]');
{
  // Regression fixture: the ECB's statement HTML index page turned out to be
  // JavaScript-rendered (confirmed live, 2026-08-07 — a plain fetch() only
  // saw the <head> shell, never the list). RSS is server-rendered XML, which
  // is what this covers instead.
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel>
    <item>
      <title><![CDATA[Monetary policy statement (with Q&A), 11 June 2026]]></title>
      <link>https://www.ecb.europa.eu/press/press_conference/monetary-policy-statement/2026/html/ecb.is260611~372040d313.en.html</link>
      <pubDate>Thu, 11 Jun 2026 14:45:00 GMT</pubDate>
    </item>
    <item>
      <title>Meeting of 17-18 December 2025</title>
      <link>https://www.ecb.europa.eu/press/accounts/2026/html/ecb.mg260122~5ca84e0f51.en.html</link>
      <pubDate>Thu, 22 Jan 2026 08:00:00 GMT</pubDate>
    </item>
  </channel></rss>`;
  const items = parseRssItems(rss);
  ok('parses both items', items.length === 2, items.length);
  ok('CDATA-wrapped title is unwrapped and trimmed', items[0].title === 'Monetary policy statement (with Q&A), 11 June 2026', JSON.stringify(items[0].title));
  ok('plain (non-CDATA) title also parses', items[1].title === 'Meeting of 17-18 December 2025');
  ok('link is captured', items[0].link.includes('ecb.is260611'));

  const stmtLink = findRssLinkByUrlPattern(items, /is260611~/i);
  ok('finds the statement by URL pattern', stmtLink === items[0].link, stmtLink);
  ok('no match for a different date -> null', findRssLinkByUrlPattern(items, /is260101~/i) === null);

  const acctLink = findRssLinkByTitleText(items, ['17', 'December', '2025']);
  ok('finds the accounts item by title text', acctLink === items[1].link, acctLink);
  ok('also matches the other day of the 2-day meeting', findRssLinkByTitleText(items, ['18', 'December', '2025']) === items[1].link);
  ok('no match -> null', findRssLinkByTitleText(items, ['1', 'January', '2099']) === null);
}
{
  ok('empty/malformed XML -> empty array, not a crash', parseRssItems('<rss><channel></channel></rss>').length === 0);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll cbIndexFetch tests passed.');
