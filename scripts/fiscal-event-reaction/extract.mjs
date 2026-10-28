// fiscal-event-reaction step 2: the numbers from the documents only (no prices; prereg §3).
// UK: the in-year gilt-sales revision (£bn, + = more supply), plus the remit-year gilt sales total where stated.
// US: the nominal coupon auction size change at the refunding (+1 / 0 / -1), with the sentence that decided it.
// Writes data/fiscal_history/numbers.json and prints every coded row for a hand check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRedBook } from '../../js/fiscalEvents.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data', 'fiscal_history');
const norm = t => t.replace(/ /g, ' ').replace(/[‐-–]/g, '-').replace(/\s+/g, ' ');
const SIGN = w => /^(increas|rais|rise|ris|addition|up)/i.test(w) ? 1 : -1;

// In-year gilt revision wordings, 2010 -> 2026. Each returns [signed £bn, the matched text].
const UK_PATTERNS = [
  /(?:planned|total) gilt sales in \d{4}-\d{2} (?:will be|are now forecast to|are forecast to) (?:be )?(reduced|increased|increase|decrease|rise|fall)(?: slightly)? by £\s?([\d.]+) ?billion/i,
  /(increase|decrease|reduction|rise|fall) in (?:gross )?gilt (?:issuance|sales) (?:this year|in \d{4}-\d{2})? ?(?:of )?\(?£\s?([\d.]+) ?billion/i,
  /gross gilt (?:issuance|sales) (?:is|are) (?:now )?(?:projected|forecast|expected) to (rise|fall|increase|decrease) by £\s?([\d.]+) ?billion/i,
  /(additional) gilt sales of £\s?([\d.]+) ?billion/i,
  /gross gilt (?:issuance|sales) of £\s?[\d.]+ ?billion[^()]{0,60}\(an? (decline|increase|reduction|rise|decrease) of £\s?([\d.]+) ?billion/i,
  /gilt (?:issuance|sales) \(an? (decline|increase|reduction|rise|decrease) of £\s?([\d.]+) ?billion/i,
];
export function ukRevision(text) {
  const t = norm(text);
  for (const re of UK_PATTERNS) {
    const m = t.match(re);
    if (m) return { change: +(SIGN(m[1]) * +m[2]).toFixed(1), quote: t.slice(Math.max(0, m.index - 80), m.index + m[0].length + 20) };
  }
  const rb = extractRedBook(t);
  if (rb.giltSalesChange != null) return { change: rb.giltSalesChange, quote: 'extractRedBook' };
  return null;
}
export function ukGiltTotal(text) {
  const t = norm(text);
  const m = t.match(/NFR for (\d{4}-\d{2}) will (?:primarily )?be met (?:by|through) (?:gross )?gilt (?:sales|issuance) of £\s?([\d.]+) ?billion/i)
    || t.match(/(\d{4}-\d{2})[^.]{0,120}?£\s?([\d.]+) ?billion of gilt sales/i);
  return m ? { year: m[1], giltSales: +m[2] } : null;
}

// US: hand-coded from each statement's own sentences (prereg A1), before any price was joined. +1 / -1 = the statement
// announces larger / smaller nominal coupon auctions (or a new coupon tenor) for the coming quarter. 0 = maintain,
// stabilise, guidance only ("may", "over the medium term"), or a description of past changes.
export const US_COUPON_CODES = {
  '2008-04-30': [1, 'We anticipate continued increases in bill and nominal coupon issuance over the remainder of fiscal year 2008'],
  '2008-11-05': [1, 'A new monthly 3-year note, with the first auction occurring as part of the November 2008 Refunding auctions'],
  '2009-02-04': [1, 'A new monthly 7-year note, with the first auction occurring in February 2009'],
  '2010-05-05': [-1, 'Treasury expects to gradually decrease coupon auction sizes'],
  '2010-08-04': [-1, 'Treasury expects to continue to decrease coupon auction sizes at a gradual pace'],
  '2011-08-03': [-1, 'Treasury expects to modestly decrease nominal coupon issuance in the coming months'],
  '2013-07-31': [-1, 'Treasury expects to gradually decrease coupon auction sizes over the coming quarter'],
  '2014-04-30': [-1, 'Treasury expects to gradually decrease coupon auction sizes over the next quarter'],
  '2014-11-05': [-1, 'The reductions in auction sizes will occur in shorter-dated coupons, specifically in 2- and 3-year securities'],
  '2018-01-31': [1, 'Treasury is announcing modest increases to nominal coupon and 2-year FRN auction sizes beginning in February'],
  '2018-05-02': [1, 'Treasury is announcing additional modest increases to nominal coupon and FRN auction sizes over the upcoming quarter'],
  '2018-08-01': [1, 'Treasury anticipates increasing the sizes of the 2-, 3-, and 5-year note auctions by $1 billion per month'],
  '2018-10-31': [1, 'Treasury is announcing additional modest increases to nominal coupon auction sizes and FRNs over the upcoming quarter'],
  '2020-05-06': [1, 'Treasury intends to increase auction sizes across all nominal coupon tenors over the May-to-July quarter'],
  '2020-08-05': [1, 'Treasury intends to increase auction sizes across all nominal coupon tenors over the August-October quarter'],
  '2020-11-04': [1, 'Treasury intends to increase auction sizes of nominal coupons, FRNs, and TIPS this quarter'],
  '2021-11-03': [-1, 'Treasury intends to reduce auction sizes across all nominal coupon securities'],
  '2022-02-02': [-1, 'Treasury intends to continue reducing auction sizes across all nominal coupon securities'],
  '2022-05-04': [-1, 'Treasury intends to continue reducing auction sizes of nominal coupon securities'],
  '2022-08-03': [-1, 'Treasury intends to continue reducing auction sizes of nominal coupon securities'],
  '2023-08-02': [1, 'Treasury intends to gradually increase coupon auction sizes beginning with the August to October 2023 quarter'],
  '2023-11-01': [1, 'Treasury intends to continue gradually increasing coupon auction sizes in the upcoming November 2023 to January 2024 quarter'],
  '2024-01-31': [1, 'Treasury intends to continue gradually increasing coupon auction sizes in the February to April 2024 quarter'],
};
export function usCouponChange(date) {
  const c = US_COUPON_CODES[date];
  return c ? { sign: c[0], quote: c[1] } : { sign: 0, quote: null };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const out = { uk: {}, us: {} };
  for (const [id, m] of Object.entries(manifest.uk)) {
    if (m.status !== 'ok') { out.uk[id] = { status: m.status }; continue; }
    const text = fs.readFileSync(path.join(DIR, 'docs', id + '.txt'), 'utf8');
    const rev = ukRevision(text), tot = ukGiltTotal(text);
    out.uk[id] = { status: 'ok', src: m.src, giltRevision: rev?.change ?? null, revisionQuote: rev?.quote ?? null, ...tot };
    console.log('UK', id, String(rev?.change ?? '-').padStart(6), tot ? `${tot.year} £${tot.giltSales}bn` : '', '|', (rev?.quote ?? '').slice(0, 230));
  }
  for (const m of Object.values(manifest.us)) {
    if (m.status !== 'ok') continue;
    const text = fs.readFileSync(path.join(DIR, 'docs', m.id + '.txt'), 'utf8').replace(/’/g, "'");
    const c = usCouponChange(m.date);
    if (c.sign && !text.replace(/\s+/g, ' ').includes(c.quote)) throw new Error(`coded quote not in the ${m.date} statement`);
    out.us[m.id] = { status: 'ok', src: m.href, couponChange: c.sign, couponQuote: c.quote };
  }
  const n = Object.values(out.us).filter(r => r.couponChange).length;
  console.log(`UK rows with a revision: ${Object.values(out.uk).filter(r => r.giltRevision != null).length}/${Object.keys(out.uk).length} · US non-zero coupon changes: ${n}/${Object.keys(out.us).length}`);
  fs.writeFileSync(path.join(DIR, 'numbers.json'), JSON.stringify(out, null, 1));
}
