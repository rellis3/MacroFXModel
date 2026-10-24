// Synthetic test for rbaFetch.js's pure helpers. No network — fixtures copy
// the structure of the real rba.gov.au pages fetched 2026-10-24.
//   node js/rbaFetch.test.mjs
import { decisionsIndexUrl, smpUrl, minutesUrl, findStatementLink, decisionCandidates, releaseDate, extractStatementText, extractPageText, extractVote } from './rbaFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[URL builders — real confirmed examples]');
{
  ok('decisions index', decisionsIndexUrl('2026-09-29') === 'https://www.rba.gov.au/monetary-policy/int-rate-decisions/2026/');
  ok('SMP overview (Aug 2026, live 200)', smpUrl('2026-08-11') === 'https://www.rba.gov.au/publications/smp/2026/aug/overview.html', smpUrl('2026-08-11'));
  ok('minutes (29 Sep 2026, live 200)', minutesUrl('2026-09-29') === 'https://www.rba.gov.au/monetary-policy/rba-board-minutes/2026/2026-09-29.html');
}

console.log('[statement discovery]');
{
  const idx = `<ul><li><a href="/monetary-policy/expert-advisory-group/meetings/2026-06-03.html">3 June 2026</a></li>
<li><a href="/media-releases/2026/mr-26-27.html">29 September 2026</a></li><li><a href="/media-releases/2026/mr-26-19.html">11&nbsp;August 2026</a></li></ul>`;
  ok('index link by exact prose date', findStatementLink(idx, '2026-09-29') === 'https://www.rba.gov.au/media-releases/2026/mr-26-27.html');
  ok('&nbsp; in link text handled', findStatementLink(idx, '2026-08-11') === 'https://www.rba.gov.au/media-releases/2026/mr-26-19.html');
  ok('non-media-release link with a date is ignored', findStatementLink(idx, '2026-06-03') === null);
  const list = `<a href="/media-releases/2026/mr-26-28.html">Release of Financial Stability Review &ndash; October 2026</a>
<a href="/media-releases/2026/mr-26-27.html">Statement by the Monetary Policy Board: Monetary Policy Decision</a>`;
  ok('listing fallback picks decision releases only', JSON.stringify(decisionCandidates(list)) === JSON.stringify(['https://www.rba.gov.au/media-releases/2026/mr-26-27.html']));
}

const RELEASE = `<nav>Monetary Policy Market Operations Payments</nav>
<div class="column-content content-style" id="content" role="main" tabindex="-1">
<span class="rss-mr-title" itemprop="headline">Statement by the Monetary Policy Board: Monetary Policy Decision</span>
<span class="value rss-mr-number" itemprop="issueNumber">2026-27</span>
<span class="value"><time class="rss-mr-date" datetime="2026-09-29T14:30+10:00" itemprop="datePublished">29&nbsp;September 2026</time></span>
<div class="rss-mr-content" itemprop="text">
<p>At its meeting today, the Board decided to increase the cash rate target by 25 basis points to 4.60 per cent.</p>
<p>To date, however, growth in Australia&#146;s major trading partners has been stronger than expected.</p>
<p>Today&#146;s policy decision was unanimous.</p>
</div><div>More on the September 2026 monetary policy decision...</div><div>Enquiries Communications Department</div></div><footer class="global-footer">x</footer>`;

console.log('[statement text]');
{
  ok('release date read from <time datetime>', releaseDate(RELEASE) === '2026-09-29');
  const t = extractStatementText(RELEASE);
  ok('title + date header', t.startsWith('Statement by the Monetary Policy Board: Monetary Policy Decision — 2026-09-29'), t.slice(0, 90));
  ok('body kept', /increase the cash rate target by 25 basis points/.test(t));
  ok('cp1252 apostrophe repaired', /Australia’s major/.test(t) && !/Australias/.test(t));
  ok('nav + related links + enquiries dropped', !/Market Operations/.test(t) && !/More on the/.test(t) && !/Enquiries/.test(t));
  ok('unanimous vote read', extractVote(t)?.unanimous === true);
}

console.log('[minutes / SMP text]');
{
  const mins = `<nav>Menu</nav><div id="content"><h1 class="page-title">Minutes of the Monetary Policy Board Meeting</h1>
<p>Hybrid &ndash; 28 and 29 September 2026</p><h2>The decision</h2><p>The Board decided unanimously to raise the cash rate target.</p></div>
<div id="mp-related-links">More on the September 2026 monetary policy decision...</div><footer class="global-footer">f</footer>`;
  const t = extractPageText(mins);
  ok('minutes start at the page title', t.startsWith('Minutes of the Monetary Policy Board Meeting'), t.slice(0, 50));
  ok('minutes body kept, related links dropped', /decided unanimously/.test(t) && !/More on the/.test(t));
}

console.log('[extractVote — every live 2025-2026 phrasing]');
{
  ok('"was unanimous"', extractVote('Today’s policy decision was unanimous.')?.unanimous === true);
  const a = extractVote('Today’s policy decision was made by majority: 6 in favour, 3 against.');
  ok('2025 "6 in favour, 3 against"', a && a.majority === 6 && a.minority === 3, JSON.stringify(a));
  const b = extractVote('Today’s policy decision was made by majority: eight members voted to increase the cash rate target by 25 basis points to 4.35 per cent; one member voted to leave the cash rate target unchanged at 4.10 per cent.');
  ok('May 2026 word-count split 8-1', b && b.majority === 8 && b.minority === 1, JSON.stringify(b));
  ok('views captured past the decimal point', /4\.35 per cent/.test(b?.majorityView || '') && /4\.10 per cent/.test(b?.minorityView || ''), JSON.stringify(b));
  const c = extractVote('Today’s policy decision was made by majority: five members voted to increase the cash rate target by 25 basis points to 4.10 per cent; four members voted to leave the cash rate target unchanged at 3.85 per cent.');
  ok('Mar 2026 split 5-4', c && c.majority === 5 && c.minority === 4);
  ok('no vote sentence -> null', extractVote('Inflation remains elevated.') === null);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll rbaFetch tests passed.');
