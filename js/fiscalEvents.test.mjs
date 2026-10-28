import assert from 'node:assert/strict';
import { FISCAL_EVENTS, previousEvent, htmlToText, fromSummary, govukAttachment, govukRedBookFromCollection, obrPageMeta, treasuryRefundingLinks, treasuryPressText,
  extractRedBook, extractObr, extractRefunding, numberRows, buildFiscalPrompt, readiness, shouldPoll } from './fiscalEvents.js';

let n = 0; const t = (name, fn) => { fn(); n++; };
const ev = id => FISCAL_EVENTS.find(e => e.id === id);

t('the calendar: ids unique, in time order per country, previous event is the last one before', () => {
  assert.equal(new Set(FISCAL_EVENTS.map(e => e.id)).size, FISCAL_EVENTS.length);
  assert.equal(previousEvent('gb-budget-2026-10-28').id, 'gb-spring-2026-03-03');
  assert.equal(previousEvent('gb-spring-2026-03-03').id, 'gb-budget-2025-11-26');
  assert.equal(previousEvent('us-refunding-2026-11-04').id, 'us-refunding-2026-08-05');
  assert.equal(previousEvent('gb-budget-2025-11-26'), null);
  // 08:30 ET: EDT in August (12:30 UTC), EST after 1 November (13:30 UTC)
  assert.equal(new Date(ev('us-refunding-2026-08-05').ms).toISOString(), '2026-08-05T12:30:00.000Z');
  assert.equal(new Date(ev('us-refunding-2026-11-04').ms).toISOString(), '2026-11-04T13:30:00.000Z');
});

t('text: tags, entities and non-breaking hyphens', () => {
  assert.equal(htmlToText('<p>£314.7&nbsp;billion in 2025&#8209;26</p><script>x</script><p>next&amp;</p>'), '£314.7 billion in 2025-26\nnext&');
  const book = 'Contents Executive summary Chapter 1 ' + 'x'.repeat(200) + ' Executive summary The real summary starts here.' + 'y'.repeat(2000);
  assert.match(fromSummary(book, 60), /^Executive summary The real summary/);
  assert.match(fromSummary(book, 60), /\[\.\.\.clipped\.\.\.\]$/);
});

t('discovery: gov.uk HTML attachment, Red Book in a collection, OBR meta, Treasury links (unquoted hrefs)', () => {
  assert.deepEqual(govukAttachment({ details: { attachments: [{ content_type: null, url: '/government/publications/budget-2025-document/budget-2025-html' }, { content_type: 'application/pdf', url: 'https://assets/x.pdf' }] } }),
    { type: 'html', path: '/government/publications/budget-2025-document/budget-2025-html' });
  assert.deepEqual(govukAttachment({ details: { attachments: [{ content_type: 'application/pdf', url: 'https://assets/x.pdf' }] } }), { type: 'pdf', url: 'https://assets/x.pdf' });
  assert.equal(govukRedBookFromCollection({ links: { documents: [{ title: 'Monetary policy remit: Budget 2026', base_path: '/a' }, { title: 'Budget 2026 document', base_path: '/b' }] } }, '2026'), '/b');
  assert.deepEqual(obrPageMeta('<link rel="canonical" href="https://obr.uk/efo/economic-and-fiscal-outlook-march-2026/" />..."datePublished":"2026-03-03T13:16:08+00:00"'),
    { slug: 'economic-and-fiscal-outlook-march-2026', published: '2026-03-03' });
  const page = '<h3>DOCUMENTS RELEASED at 3:00 PM Monday, august 3, 2026</h3><p><a href=/news/press-releases/sb0584>Financing Estimates: 2026 - 3rd Quarter</a></p><p><a href=/news/press-releases/sb0585>Economic Policy Statements to TBAC: 2026 - 3rd Quarter​</a></p><p><a href=/news/press-releases/sb0590>Policy Statement: 2026 - 3rd Quarter</a>';
  assert.deepEqual(treasuryRefundingLinks(page, '2026 - 3rd Quarter'), { estimates: 'https://home.treasury.gov/news/press-releases/sb0584', policy: 'https://home.treasury.gov/news/press-releases/sb0590' });
  assert.deepEqual(treasuryRefundingLinks(page, '2026 - 4th Quarter'), {});
  assert.match(treasuryPressText('<nav>About Treasury</nav><div class="field--name-field-news-body x"><p>WASHINGTON — The U.S. Department</p></div></article>'), /^WASHINGTON — The U\.S\. Department$/);
});

// Budget 2025 Red Book and OBR November 2025, verbatim excerpts
const RB25 = 'Financing The DMO net financing requirement for 2025-26 is forecast to be £314.7 billion. The remit for the DMO has been updated to reflect this, increasing by £5.6 billion. This will be financed through £303.7 billion of gilt sales (an increase of £4.6 billion), as well as £11 billion from the sale of Treasury bills used for debt management purposes (an increase of £1 billion).';
const OBR25 = 'In our central forecast, the Government’s fiscal mandate for the current budget to be in balance in 2029-30 is met by a margin of £22 billion (0.6 per cent of GDP), which is £12 billion (0.3 per cent of GDP) more than in March. Underlying forecast changes reduced headroom';
t('UK numbers: gilt sales, financing requirement, bills, remit change, headroom and its change', () => {
  assert.deepEqual(extractRedBook(RB25), { year: '2025-26', nfr: 314.7, giltSales: 303.7, giltSalesChange: 4.6, bills: 11, remitChange: 5.6 });
  assert.equal(extractRedBook(RB25.replace('an increase of £4.6', 'a reduction of £4.6')).giltSalesChange, -4.6);
  const o = extractObr(OBR25);
  assert.equal(o.headroom, 22); assert.equal(o.headroomPctGdp, 0.6); assert.equal(o.headroomChange, 12); assert.equal(o.headroomVs, 'March');
  assert.match(o.headroomRule, /current budget to be in balance in 2029-30/);
  // the March 2026 forecast carried no rules assessment: nothing is invented
  assert.equal(extractObr('we are not assessing performance against the fiscal rules').headroom, null);
  const rows = numberRows(ev('gb-budget-2025-11-26'), { ...extractRedBook(RB25), ...o });
  assert.deepEqual(rows.map(r => [r.label, r.value, r.change]), [
    ['Headroom against the main fiscal rule', '£22bn', '+£12bn vs March'], ['Gilt sales 2025-26', '£303.7bn', '+£4.6bn'],
    ['DMO net financing requirement', '£314.7bn', '+£5.6bn'], ['Treasury bills (debt management)', '£11bn', null]]);
});

// US Quarterly Refunding, August 2026, verbatim excerpts
const POL = 'WASHINGTON — The U.S. Department of the Treasury is offering $125 billion of Treasury securities to refund approximately $96.3 billion of privately-held Treasury notes and bonds maturing on August 15, 2026. This issuance will raise new cash from private investors of approximately $28.7 billion. ... Based on current projected borrowing needs, Treasury anticipates maintaining nominal coupon and FRN auction sizes for at least the next several quarters.';
const EST = 'During the July–September 2026 quarter, Treasury expects to borrow $739 billion in privately-held net marketable debt, assuming an end-of-September cash balance of $950 billion. The borrowing estimate is $68 billion higher than announced in May 2026, primarily due to lower projected net cash flows. During the October–December 2026 quarter, Treasury expects to borrow $628 billion in privately-held net marketable debt, assuming an end-of-December cash balance of $850 billion.';
t('US numbers: offering, new cash, the coupon guidance, borrowing and its revision', () => {
  const x = extractRefunding(POL, EST);
  assert.equal(x.offering, 125); assert.equal(x.refunding, 96.3); assert.equal(x.newCash, 28.7); assert.equal(x.guidanceKept, true);
  assert.equal(x.borrowing, 739); assert.equal(x.cashBalance, 950); assert.equal(x.borrowingVsPrior, 68);
  assert.equal(x.nextQuarter, 'October–December 2026'); assert.equal(x.nextBorrowing, 628);
  const dropped = extractRefunding(POL.replace('anticipates maintaining nominal coupon and FRN auction sizes for at least the next several quarters', 'anticipates increasing nominal coupon auction sizes'), EST);
  assert.equal(dropped.guidanceKept, false); assert.equal(dropped.guidance, 'coupon sizes to increase');
  assert.equal(numberRows(ev('us-refunding-2026-08-05'), dropped).find(r => r.label === 'Coupon-size guidance').change, 'CHANGED');
});

t('the prompt carries the hard numbers, the previous event and no names rule', () => {
  const e = ev('gb-budget-2026-10-28');
  const p = buildFiscalPrompt(e, { redbook: { text: 'Executive summary ' + RB25, url: 'u1' }, obr: { text: 'Executive summary ' + OBR25, url: 'u2' } },
    { ...extractRedBook(RB25), ...extractObr(OBR25) }, { ev: ev('gb-spring-2026-03-03'), numbers: {}, headline: 'No rules assessment this time.' });
  assert.match(p, /Headroom against the main fiscal rule: £22bn \(\+£12bn vs March\)/);
  assert.match(p, /THE PREVIOUS EVENT: Spring Forecast 2026/); assert.match(p, /NEVER name a specific individual/);
  assert.match(p, /"supply":"MORE\|LESS\|SAME/); assert.match(p, /Gilts\|GBP\|FTSE 100/);
});

t('readiness and polling', () => {
  const b = ev('gb-budget-2026-10-28');
  assert.deepEqual(readiness(b, ['speech'], b.ms + 3600_000), { missing: ['redbook', 'obr'], ready: false });
  assert.equal(readiness(b, ['redbook', 'obr'], b.ms + 3600_000).ready, true);
  assert.equal(readiness(b, ['speech'], b.ms + 7 * 3600_000).ready, true, 'after six hours, read what is there');
  assert.equal(readiness(b, [], b.ms + 7 * 3600_000).ready, false);
  assert.equal(shouldPoll(b, null, b.ms - 3600_000), false);
  assert.equal(shouldPoll(b, null, b.ms + 60_000), true);
  assert.equal(shouldPoll(b, { analysedKinds: ['redbook', 'obr'] }, b.ms + 3600_000), true, 'the speech is still to come');
  assert.equal(shouldPoll(b, { analysedKinds: ['redbook', 'obr', 'speech'] }, b.ms + 3600_000), false);
  assert.equal(shouldPoll(b, { analysedKinds: ['redbook', 'obr'] }, b.ms + 4 * 86400_000), false);
});

console.log(`fiscalEvents: ${n} groups, all passed`);
