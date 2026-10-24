// Synthetic test for rbnzFetch.js's pure helpers. No network — fixtures are
// trimmed copies of the structure of the real pages fetched 2026-10-24.
//   node js/rbnzFetch.test.mjs
import { parseRssItems } from './cbIndexFetch.js';
import { rssLocalDate, findDecisionInRss, findDecisionInTable, extractDecisionText, extractVote, BLOCKED_RE } from './rbnzFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const RSS = `<rss version="2.0"><channel><title>Reserve Bank of New Zealand News Releases</title>
<item><guid isPermaLink="false">{A}</guid><link>https://www.rbnz.govt.nz/news-and-events/news/2026/10/updates-to-the-october-mpr-and-november-fsr</link><title>Updates to the October Monetary Policy Review and November Financial Stability Report</title><description>x</description><pubDate>Tue, 06 Oct 2026 00:00:00 +1300</pubDate></item>
<item><guid isPermaLink="false">{B}</guid><link>https://www.rbnz.govt.nz/news-and-events/news/2026/09/ocr-increased-by-25-basis-points-to-2-75</link><title>OCR increased by 25 basis points to 2.75%</title><description>x</description><pubDate>Wed, 02 Sep 2026 00:00:00 +1200</pubDate></item>
<item><guid isPermaLink="false">{C}</guid><link>https://www.rbnz.govt.nz/news-and-events/news/2026/05/ocr-held-at-2-25-percent</link><title>OCR held at 2.25%</title><description>x</description><pubDate>Wed, 27 May 2026 00:00:00 +1200</pubDate></item>
</channel></rss>`;

console.log('[RSS discovery]');
{
  ok('pubDate read as the NZ-local day, not shifted through UTC', rssLocalDate('Wed, 02 Sep 2026 00:00:00 +1200') === '2026-09-02');
  const items = parseRssItems(RSS);
  ok('Sep decision found by date + OCR title', findDecisionInRss(items, '2026-09-02') === 'https://www.rbnz.govt.nz/news-and-events/news/2026/09/ocr-increased-by-25-basis-points-to-2-75');
  ok('May decision found', /ocr-held-at-2-25-percent$/.test(findDecisionInRss(items, '2026-05-27') || ''));
  ok('no OCR item that day -> null (the MPR logistics notice is not a decision)', findDecisionInRss(items, '2026-10-06') === null);
  ok('not yet published -> null', findDecisionInRss(items, '2026-10-28') === null);
}

console.log('[decisions-table fallback]');
{
  const table = `<table><tbody><tr><td colspan="5"><strong>2026</strong></td></tr>
<tr><td>2 September 2026&nbsp;</td><td>2.75&nbsp;</td><td><a href="/news-and-events/news/2026/09/ocr-increased-by-25-basis-points-to-2-75">Media release</a> | <a href="/monetary-policy/x">Statement</a></td></tr>
<tr><td>8 April 2026</td><td>2.25</td><td><a href="/news-and-events/news/2026/04/ocr-on-hold-at-2-25">Media release&nbsp;</a></td></tr></tbody></table>`;
  ok('row matched by prose date, media-release link returned', findDecisionInTable(table, '2026-09-02') === '/news-and-events/news/2026/09/ocr-increased-by-25-basis-points-to-2-75');
  ok('second row', findDecisionInTable(table, '2026-04-08') === '/news-and-events/news/2026/04/ocr-on-hold-at-2-25');
  ok('"22 September" never matches "2 September"', findDecisionInTable(table.replace('2 September', '22 September'), '2026-09-02') === null);
}

console.log('[page text — release + summary record, nav and contacts dropped]');
{
  const page = `<header><nav>Search Browser issue Menu</nav></header><main role="main">
<h1 class="hero__heading" id="main-heading" tabIndex="-1">OCR increased by 25 basis points to 2.75%</h1>
<div class="hero__metadata-title">Published:</div><div>02 September 2026</div>
<h2>Media release</h2><p>The Monetary Policy Committee today reached consensus to increase the OCR by 25 basis points to 2.75 percent.</p>
<h2 class="heading--red">Summary record of meeting – September 2026</h2><p>The Committee decided by consensus to increase the OCR by 25 basis points to 2.75 percent.</p>
<h2 class="heading--red">Media contact</h2><p>Engagement Advisor</p></main><footer>Useful links</footer>`;
  const t = extractDecisionText(page);
  ok('starts at the headline', t.startsWith('OCR increased by 25 basis points to 2.75%'), t.slice(0, 60));
  ok('keeps the media release', /reached consensus to increase the OCR/.test(t));
  ok('keeps the summary record of meeting', /Summary record of meeting/.test(t) && /decided by consensus/.test(t));
  ok('drops nav and media contact', !/Browser issue/.test(t) && !/Engagement Advisor/.test(t));
  ok('consensus vote read', JSON.stringify(extractVote(t)) === JSON.stringify({ unanimous: true, consensus: true, majority: null, minority: null }));
}

console.log('[vote — split shape (NOT live-verified, see module header)]');
{
  const v = extractVote('The Committee voted 4–2 to reduce the OCR by 25 basis points.');
  ok('N–M split parsed', v && v.majority === 4 && v.minority === 2 && v.unanimous === false, JSON.stringify(v));
  const w = extractVote('Members voted four to two in favour.');
  ok('word split parsed', w && w.majority === 4 && w.minority === 2, JSON.stringify(w));
  ok('no vote language -> null', extractVote('Inflation is 4.1 percent.') === null);
}

console.log('[firewall page recognised]');
{
  ok('the real block wording matches BLOCKED_RE', BLOCKED_RE.test('Your access to the Reserve Bank website has been restricted. If you think you should be able to access our website please email'));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll rbnzFetch tests passed.');
