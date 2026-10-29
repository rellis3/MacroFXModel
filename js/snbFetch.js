// js/snbFetch.js — network fetchers for Swiss National Bank source documents.
//
// VERIFIED LIVE 2026-10-26 with this repo's MacroFX User-Agent (all 200,
// server-rendered HTML, no JavaScript needed; unpublished pages are 404):
//   statement: the monetary policy assessment press release,
//              /en/publications/communication/press-releases-restricted/pre_{YYYYMMDD}
//              (e.g. .../pre_20260924). USUALLY constructible, but not always:
//              June 2025 is .../pre_20250619_2 and the plain pre_20250619 is a
//              404. So it is discovered from the decisions page by its link
//              text "Monetary policy assessment of 24 September 2026", with the
//              constructed URL as the fallback (decision morning, before the
//              decisions page is updated).
//   remarks:   "Introductory remarks, news conference",
//              /en/publications/communication/speeches-restricted/ref_{YYYYMMDD}_{speakers}
//              (e.g. ref_20260924_mslanmargpe) — the speaker suffix changes
//              with Board membership, so NOT constructible. Discovered by href
//              prefix on the decisions page, then on the press release page
//              (which links to it).
//   summary:   "Monetary policy assessment of September 2026: Summary of
//              discussion", /en/publications/communication/summaries/zus_{publication YYYYMMDD}
//              (e.g. zus_20261022 for the 24 Sep 2026 decision). Discovered by
//              link text on the decisions page, then the summaries listing,
//              then constructed from the calendar's `summaryOn`.
// Content region on every page: <main> ... </main>, minus the "Download file
// now" button labels and the chart/author trailer.
//
// No vote: the Governing Board (three members) publishes no split.
import { fetchHtml, pageText, findAnchors, dmyLong, MONTHS } from './cbPageText.js';
import { SNB_MEETINGS } from './snbCalendar.js';

const ORIGIN = 'https://www.snb.ch';
export const MIN_REMARKS_CHARS = 1500;
export const DECISIONS_URL = `${ORIGIN}/en/the-snb/mandates-goals/monetary-policy/decisions`;
export const SUMMARIES_URL = `${ORIGIN}/en/news-publications/economy/summaries`;

const ymd8 = dateStr => dateStr.replace(/-/g, '');
export function statementUrl(dateStr) {
  return `${ORIGIN}/en/publications/communication/press-releases-restricted/pre_${ymd8(dateStr)}`;
}
export function summaryUrl(publishedOn) {
  return `${ORIGIN}/en/publications/communication/summaries/zus_${ymd8(publishedOn)}`;
}
const abs = href => (href.startsWith('http') ? href : ORIGIN + (href.startsWith('/') ? href : '/' + href));
const monthYear = dateStr => { const [y, m] = dateStr.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

// Decisions page -> the press release for one announcement day.
export function findStatementLink(html, dateStr) {
  const want = dmyLong(dateStr).replace(/ /g, '\\s+');
  const hit = findAnchors(html, new RegExp(`^Monetary policy assessment of ${want}$`, 'i'))
    .find(a => /\/pre_\d{8}/.test(a.href));
  return hit ? abs(hit.href) : null;
}
// Any page -> the introductory remarks for one announcement day (href prefix).
export function findRemarksLink(html, dateStr) {
  const re = new RegExp(`href="([^"]*/ref_${ymd8(dateStr)}_[a-z0-9]+)"`, 'i');
  const m = html.match(re);
  return m ? abs(m[1]) : null;
}
// Decisions page / summaries listing -> the summary of discussion for one meeting.
export function findSummaryLink(html, dateStr) {
  const want = monthYear(dateStr).replace(/ /g, '\\s+');
  const hit = findAnchors(html, new RegExp(`Monetary policy assessment of ${want}:\\s*Summary of discussion`, 'i'))
    .find(a => /\/zus_\d{8}/.test(a.href));
  return hit ? abs(hit.href) : null;
}

// Page title + date + body; drops button labels and the chart/author trailer.
export function extractPageText(html) {
  return pageText(html, /<main\b/i, /<\/main>/i)
    .split('\n').filter(l => !/^\s*(Download file now|Share)\s*$/i.test(l)).join('\n')
    .replace(/\bDownload file now\b/g, '')
    .replace(/\n\s*Author\(s\)[\s\S]*$/i, '')
    .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchDoc(url, mustContain) {
  const r = await fetchHtml(url);
  if (!r.ok) return { ...r, url, text: null };
  const text = extractPageText(r.raw);
  // Guard against a mis-matched link: the page must name this assessment.
  if (mustContain && !mustContain.test(text.replace(/\s+/g, ' '))) {
    return { ok: false, notYetPublished: false, error: `page does not mention ${mustContain.source}`, url, text: null, raw: r.raw };
  }
  return { ok: true, url, text, raw: r.raw };
}
const strip = r => { const { raw, ...rest } = r; return rest; };

export async function fetchStatement(dateStr) {
  const dec = await fetchHtml(DECISIONS_URL);
  const url = (dec.ok && findStatementLink(dec.raw, dateStr)) || statementUrl(dateStr);
  const must = new RegExp(`Monetary policy assessment of ${dmyLong(dateStr)}`, 'i');
  const r = await fetchDoc(url, must);
  if (!r.ok && r.notYetPublished && !dec.ok) return { ok: false, notYetPublished: false, error: `decisions page ${dec.error || dec.status}; constructed URL 404`, url, text: null };
  return strip(r);
}

export async function fetchRemarks(dateStr) {
  const dec = await fetchHtml(DECISIONS_URL);
  let url = dec.ok ? findRemarksLink(dec.raw, dateStr) : null;
  if (!url) {
    // Decision morning: the decisions page lags; the press release links to the remarks.
    const pre = await fetchStatement(dateStr);
    if (pre.ok) {
      const p = await fetchHtml(pre.url);
      url = p.ok ? findRemarksLink(p.raw, dateStr) : null;
    }
    if (!url) {
      if (!dec.ok) return { ok: false, notYetPublished: false, error: `decisions page ${dec.error || dec.status}`, url: DECISIONS_URL, text: null };
      return { ok: false, notYetPublished: true, url: DECISIONS_URL, text: null };
    }
  }
  const r = strip(await fetchDoc(url, /Introductory remarks/i));
  // Some older remarks pages carry only the title block and a PDF link (live:
  // ref_20250619 = 301 chars). Header-only is not the document: say so.
  if (r.ok && r.text.length < MIN_REMARKS_CHARS) return { ok: false, notYetPublished: false, error: `remarks page has only ${r.text.length} chars (title block, text in the PDF only) — not stored`, url, text: null };
  return r;
}

export async function fetchSummary(dateStr) {
  const must = new RegExp(`Monetary policy assessment of ${monthYear(dateStr)}`, 'i');
  const dec = await fetchHtml(DECISIONS_URL);
  let url = dec.ok ? findSummaryLink(dec.raw, dateStr) : null;
  if (!url) {
    const list = await fetchHtml(SUMMARIES_URL);
    url = list.ok ? findSummaryLink(list.raw, dateStr) : null;
  }
  if (!url) {
    const on = SNB_MEETINGS.find(m => m.date === dateStr)?.summaryOn;
    if (!on) return { ok: false, notYetPublished: true, url: DECISIONS_URL, text: null };
    url = summaryUrl(on);
  }
  return strip(await fetchDoc(url, must));
}

export const FETCHERS = {
  statement: fetchStatement,
  remarks: fetchRemarks,
  summary: fetchSummary,
};
