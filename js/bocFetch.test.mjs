// Synthetic test for bocFetch.js's pure helpers. No network — fixtures copy
// the structure of the real bankofcanada.ca pages fetched 2026-10-24.
//   node js/bocFetch.test.mjs
import { statementUrl, mprUrl, mprLandingUrl, deliberationsGuessUrl, findDeliberationsLink, extractPostText } from './bocFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[URL builders — real confirmed examples]');
{
  ok('statement (Sep 2 2026, live 200)', statementUrl('2026-09-02') === 'https://www.bankofcanada.ca/2026/09/fad-press-release-2026-09-02/');
  ok('statement (Jan 28 2026, linked from the key-interest-rate page)', statementUrl('2026-01-28') === 'https://www.bankofcanada.ca/2026/01/fad-press-release-2026-01-28/');
  ok('MPR overview (Jul 2026, live 200)', mprUrl('2026-07-15') === 'https://www.bankofcanada.ca/publications/mpr/mpr-2026-07-15/overview/');
  ok('MPR landing fallback', mprLandingUrl('2026-07-15') === 'https://www.bankofcanada.ca/publications/mpr/mpr-2026-07-15/');
  // Real: /2026/09/summary-of-governing-council-deliberations-fixed-announcement-date-of-september-2-2026/
  ok('deliberations guess matches the real Sep 2026 URL', deliberationsGuessUrl('2026-09-02') === 'https://www.bankofcanada.ca/2026/09/summary-of-governing-council-deliberations-fixed-announcement-date-of-september-2-2026/', deliberationsGuessUrl('2026-09-02'));
  // Real: /2026/05/... for the Apr 29 meeting (publication month, not meeting month).
  ok('deliberations guess rolls into the publication month', deliberationsGuessUrl('2026-04-29').startsWith('https://www.bankofcanada.ca/2026/05/'));
}

console.log('[deliberations index discovery]');
{
  const idx = `<a href="https://www.bankofcanada.ca/2026/09/summary-of-governing-council-deliberations-fixed-announcement-date-of-september-2-2026/">Summary of Governing Council deliberations: Fixed announcement date of September&nbsp;2, 2026</a>
<a href="https://www.bankofcanada.ca/2026/04/summary-governing-council-deliberations-fixed-announcement-date-of-march-18-2026/">Summary of Governing Council deliberations: Fixed announcement date of March&nbsp;18, 2026</a>
<a href="https://www.bankofcanada.ca/2025/11/summary-governing-council-deliberations-fixed-announcement-date-of-october-29-2025/">Summary of Governing Council deliberations: Fixed announcement date of October&nbsp;29,&nbsp;2025</a>`;
  ok('found by link text with &nbsp;', /september-2-2026\/$/.test(findDeliberationsLink(idx, '2026-09-02') || ''));
  ok('older slug spelling found too', /march-18-2026\/$/.test(findDeliberationsLink(idx, '2026-03-18') || ''));
  ok('&nbsp; after the comma handled', /october-29-2025\/$/.test(findDeliberationsLink(idx, '2025-10-29') || ''));
  ok('"September 2" does not match a "September 22" entry', findDeliberationsLink(idx.replace('September&nbsp;2,', 'September&nbsp;22,'), '2026-09-02') === null);
}

console.log('[post text]');
{
  const page = `<nav>Core functions Markets</nav><main id="main-content" role="main"><div class="post" id='post-255314'>
<h1 class="post-heading">Bank of Canada maintains the policy rate at 2¼%</h1><p>FOR IMMEDIATE RELEASE</p><p>September 2, 2026</p>
<p>Share this page on Facebook</p><p>The Bank of Canada today held its target for the overnight rate at 2.25%.</p>
<h3>Information note</h3><p>The next scheduled date for announcing the overnight rate target is October 28, 2026.</p>
<span class='tax-name'>Content Type(s)</span>: Press</div><div>Press Conference: Policy Rate Announcement</div></main><footer>f</footer>`;
  const t = extractPostText(page);
  ok('starts at the headline', t.startsWith('Bank of Canada maintains the policy rate at 2¼%'), t.slice(0, 50));
  ok('body + information note kept', /held its target for the overnight rate at 2\.25%/.test(t) && /October 28, 2026/.test(t));
  ok('share widgets, taxonomy and related callouts dropped', !/Share this page/.test(t) && !/Content Type/.test(t) && !/Press Conference/.test(t) && !/Core functions/.test(t));
  const mpr = `<main id="main-content"><h1 class="post-heading">Overview</h1><p>After a year of weakness, Canada’s economy is showing signs of improvement.</p></main><footer>We use cookies</footer>`;
  const m = extractPostText(mpr);
  ok('MPR page (no taxonomy line) stops at </main>', /signs of improvement/.test(m) && !/cookies/.test(m), m);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll bocFetch tests passed.');
