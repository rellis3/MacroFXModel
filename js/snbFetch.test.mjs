// Synthetic test for snbFetch.js's pure helpers. No network — fixtures copy
// the structure of the real snb.ch pages fetched 2026-10-26.
//   node js/snbFetch.test.mjs
import { statementUrl, summaryUrl, findStatementLink, findRemarksLink, findSummaryLink, extractPageText } from './snbFetch.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const item = (href, text) => `<a class="m-mixed-list-item h-typo-body" href="${href}" >
	<div class="h-s4"></div><div class="m-mixed-list-item__content"><div class="m-mixed-list-item__info"></div>
		<span class="m-mixed-list-item__text">${text}</span>
		<span class="m-mixed-list-item__icon-right"><svg class="a-icon" aria-hidden="true"><use xlink:href="/x.svg#arrow-right"></use></svg></span>
	</div></a>`;
const DECISIONS = `<h4 class="h-typo-t4">September 2026</h4>
${item('/en/publications/communication/press-releases-restricted/pre_20260924', 'Monetary policy assessment of 24 September 2026')}
${item('/en/publications/communication/speeches-restricted/ref_20260924_mslanmargpe', 'Introductory remarks, news conference')}
${item('/en/publications/communication/summaries/zus_20261022', 'Monetary policy assessment of September 2026: Summary of discussion')}
<h4 class="h-typo-t4">June 2025</h4>
${item('/en/publications/communication/press-releases-restricted/pre_20250619_2', 'Monetary policy assessment of 19 June 2025')}
${item('/en/publications/communication/speeches-restricted/ref_20250619_mslanmargpe', 'Introductory remarks, news conference')}`;

console.log('[URL builders — real confirmed examples]');
{
  ok('statement (24 Sep 2026, live 200)', statementUrl('2026-09-24') === 'https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20260924');
  ok('summary by publication date (22 Oct 2026, live 200)', summaryUrl('2026-10-22') === 'https://www.snb.ch/en/publications/communication/summaries/zus_20261022');
}

console.log('[decisions-page discovery]');
{
  ok('statement link by exact text', findStatementLink(DECISIONS, '2026-09-24') === 'https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20260924');
  ok('June 2025 "_2" suffix found (constructed URL would 404)', !!findStatementLink(DECISIONS, '2025-06-19')?.endsWith('/pre_20250619_2'));
  ok('"4 September" does not match "24 September"', findStatementLink(DECISIONS, '2026-09-04') === null);
  ok('remarks by href prefix', findRemarksLink(DECISIONS, '2026-09-24') === 'https://www.snb.ch/en/publications/communication/speeches-restricted/ref_20260924_mslanmargpe');
  ok('remarks for an unlisted date -> null', findRemarksLink(DECISIONS, '2026-12-10') === null);
  ok('summary by month text', findSummaryLink(DECISIONS, '2026-09-24') === 'https://www.snb.ch/en/publications/communication/summaries/zus_20261022');
  ok('no summary for June 2025 (none published)', findSummaryLink(DECISIONS, '2025-06-19') === null);
}

console.log('[page text]');
{
  const page = `<header><nav>Menu The SNB Monetary policy</nav></header><main id="a11y-main">
<span>Press release</span><h1 class="h-typo-t1">Monetary policy assessment of 24 September 2026</h1><p>24 September 2026</p>
<h2>Swiss National Bank leaves SNB policy rate unchanged at 0%</h2><p>The Swiss National Bank is leaving the SNB policy rate unchanged at 0%.</p>
<a class="btn">Download file now</a>
<p>Author(s)</p><p>Chairman of the Governing Board</p></main><footer>Cookies Accept all categories</footer>`;
  const t = extractPageText(page);
  ok('starts at the main region', t.startsWith('Press release'), t.slice(0, 40));
  ok('body kept', /leaving the SNB policy rate unchanged at 0%/.test(t));
  ok('nav, footer, cookie banner dropped', !/Menu/.test(t) && !/Cookies/.test(t));
  ok('"Download file now" and author trailer dropped', !/Download file now/.test(t) && !/Author\(s\)/.test(t) && !/Chairman/.test(t));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll snbFetch tests passed.');
