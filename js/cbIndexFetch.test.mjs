// Synthetic test for the generic central-bank index-page link finders. No
// network — this sandbox cannot fetch a live ECB index page to verify
// against, so these test the matching LOGIC against representative fixtures
// built from real URL/text patterns confirmed via web search during the
// ECB build (ecb.is260611~372040d313.en.html style URLs; "Meeting of
// 17-18 December 2025" style accounts index link text).
//   node js/cbIndexFetch.test.mjs
import { findLinkByUrlDatePattern, findLinkByDateText, resolveUrl } from './cbIndexFetch.js';

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

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll cbIndexFetch tests passed.');
