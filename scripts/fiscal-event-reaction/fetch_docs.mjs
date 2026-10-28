// fiscal-event-reaction step 1: fetch the documents (no prices). UK: the Red Book (or the statement's written ministerial
// statement / Debt Management Report where there was no Red Book) from the gov.uk content API, HTML attachment first, PDF
// via pdf-parse otherwise. US: every refunding policy statement 2008+ from the Treasury archive.
// Cache: data/fiscal_history/docs/<id>.txt + manifest.json (gitignored). Re-run safe: cached ids are skipped.
//   node scripts/fiscal-event-reaction/fetch_docs.mjs [--us] [--uk] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UK_EVENTS, parseRefundingArchive, usEvent, pressDate } from './events.mjs';
import { htmlToText, govukAttachment, treasuryPressText } from '../../js/fiscalEvents.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data', 'fiscal_history', 'docs');
fs.mkdirSync(DIR, { recursive: true });
const MANIFEST = path.join(DIR, '..', 'manifest.json');
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { uk: {}, us: {} };
const args = new Set(process.argv.slice(2));
const doUS = args.has('--us') || !args.has('--uk'), doUK = args.has('--uk') || !args.has('--us'), force = args.has('--force');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The main document per UK event (gov.uk publication path); null = no document of that kind exists.
const UK_DOC = {
  '2010-06-22': '/government/publications/budget-june-2010',
  '2011-03-23': '/government/publications/budget-2011',
  '2011-11-29': '/government/publications/autumn-statement-2011',
  '2012-03-21': '/government/publications/budget-2012',
  '2012-12-05': '/government/publications/autumn-statement-2012-documents',
  '2013-03-20': '/government/publications/budget-2013-documents',
  '2013-12-05': '/government/publications/autumn-statement-2013-documents',
  '2014-03-19': '/government/publications/budget-2014-documents',
  '2014-12-03': '/government/publications/autumn-statement-documents',
  '2015-03-18': '/government/publications/budget-2015-documents',
  '2015-07-08': '/government/publications/summer-budget-2015',
  '2015-11-25': '/government/publications/spending-review-and-autumn-statement-2015-documents',
  '2016-03-16': '/government/publications/budget-2016-documents',
  '2016-11-23': '/government/publications/autumn-statement-2016-documents',
  '2017-03-08': '/government/publications/spring-budget-2017-documents',
  '2017-11-22': '/government/publications/autumn-budget-2017-documents',
  '2018-03-13': '/government/publications/spring-statement-2018-written-ministerial-statement',
  '2018-10-29': '/government/publications/budget-2018-documents',
  '2019-03-13': '/government/publications/spring-statement-2019-written-ministerial-statement',
  '2020-03-11': '/government/publications/budget-2020-documents',
  '2020-11-25': '/government/publications/spending-review-2020-documents',
  '2021-03-03': '/government/publications/budget-2021-documents',
  '2021-10-27': '/government/publications/autumn-budget-and-spending-review-2021-documents',
  '2022-03-23': '/government/publications/spring-statement-2022-documents',
  '2022-09-23': '/government/publications/the-growth-plan-2022-documents',
  '2022-10-17': null,
  '2022-11-17': '/government/publications/autumn-statement-2022-documents',
  '2023-03-15': '/government/publications/spring-budget-2023',
  '2023-11-22': '/government/publications/autumn-statement-2023',
  '2024-03-06': '/government/publications/spring-budget-2024',
  '2024-10-30': '/government/publications/autumn-budget-2024',
  '2025-03-26': '/government/publications/spring-statement-2025-document',
  '2025-11-26': '/government/publications/budget-2025-document',
  '2026-03-03': '/government/publications/debt-management-report-2026-27',
  '2026-10-28': '/government/publications/budget-2026-document',
};

let _pdf = null;
async function pdfText(buf) {
  _pdf ??= (await import('pdf-parse/lib/pdf-parse.js')).default;
  return (await _pdf(buf)).text;
}
async function get(url, asBuffer = false) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow' });
      if (r.ok) return asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.text();
      if (r.status === 404) return null;
    } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}

/** The attachment that is the main document: an HTML version first, then the PDF whose title is the event / Red Book. */
function pickAttachment(item) {
  const atts = item?.details?.attachments ?? [];
  const main = atts.filter(a => !/(annex|factsheet|data|table|tax information|ootlar|impact|executive summary|easy read|welsh|charts|policy costings|distributional|equality|leaflet|policy decisions|scoring)/i.test(a.title ?? ''));
  const html = main.find(a => a.content_type == null && a.url && !/\.(pdf|xlsx?|csv|ods|docx?)$/i.test(a.url));
  if (html) return { type: 'html', path: html.url, title: html.title };
  const pdfs = main.filter(a => /pdf/i.test(a.content_type ?? '') || /\.pdf$/i.test(a.url ?? ''));
  const pick = pdfs.find(a => /(budget|statement|spending review|growth plan|debt management report)/i.test(a.title ?? '') && !/speech/i.test(a.title ?? ''))
    ?? pdfs.sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
  if (pick) return { type: 'pdf', url: pick.url, title: pick.title };
  return govukAttachment(item);
}

async function fetchUK(e) {
  const p = UK_DOC[e.date];
  if (p === null) return { status: 'no document' };
  if (!p) return { status: 'no path' };
  const raw = await get('https://www.gov.uk/api/content' + p);
  if (!raw) return { status: 'publication not found', path: p };
  const item = JSON.parse(raw);
  const att = pickAttachment(item);
  let text = null, src = null;
  if (att?.type === 'html') {
    const j = await get('https://www.gov.uk/api/content' + att.path);
    if (j) { text = htmlToText(JSON.parse(j).details?.body ?? ''); src = 'https://www.gov.uk' + att.path; }
  } else if (att?.type === 'pdf') {
    const buf = await get(att.url, true);
    if (buf) { try { text = await pdfText(buf); src = att.url; } catch (err) { return { status: 'pdf parse failed: ' + err.message, path: p }; } }
  }
  if (!text && item.details?.body) { text = htmlToText(item.details.body); src = 'https://www.gov.uk' + p; }    // a written statement's own body
  if (!text) return { status: 'no text', path: p, attachment: att };
  fs.writeFileSync(path.join(DIR, e.id + '.txt'), text);
  return { status: 'ok', path: p, src, title: att?.title ?? item.title, chars: text.length };
}

if (doUK) {
  for (const e of UK_EVENTS) {
    if (!force && manifest.uk[e.id]?.status === 'ok') continue;
    const r = await fetchUK(e);
    manifest.uk[e.id] = { date: e.date, name: e.name, ...r };
    console.log('UK', e.date, e.name.padEnd(42), r.status, r.chars ?? '', r.title ?? '');
    await sleep(300);
  }
}

if (doUS) {
  const arch = await get('https://home.treasury.gov/policy-issues/financing-the-government/quarterly-refunding/quarterly-refunding-archives/official-remarks-on-quarterly-refunding-by-calendar-year');
  const rows = parseRefundingArchive(arch ?? '').filter(r => r.year >= 2008);
  console.log('US archive rows 2008+:', rows.length);
  for (const r of rows) {
    const key = `${r.year}Q${r.q}`;
    if (!force && manifest.us[key]?.status === 'ok') continue;
    const html = await get(r.href);
    if (!html) { manifest.us[key] = { ...r, status: 'fetch failed' }; console.log('US', key, 'fetch failed'); continue; }
    const date = pressDate(html);
    let text = treasuryPressText(html);
    if (!text || text.length < 300) text = htmlToText(html.replace(/[\s\S]*?<main/i, '<main').replace(/<footer[\s\S]*/i, ''));
    const e = usEvent(r, date);
    fs.writeFileSync(path.join(DIR, e.id + '.txt'), text);
    manifest.us[key] = { ...r, id: e.id, date, status: date ? 'ok' : 'no date', chars: text.length };
    console.log('US', key, date, text.length);
    await sleep(300);
  }
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
