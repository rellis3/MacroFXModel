// js/rbaFetch.js — network fetchers for RBA source documents.
//
// VERIFIED LIVE 2026-10-24 with Node fetch() and this repo's MacroFX
// User-Agent (all 200, server-rendered HTML, no JavaScript needed):
//   statement: the decision media release. Numbered sequentially through the
//              year (/media-releases/2026/mr-26-27.html for 29 Sep 2026), so
//              NOT constructible from the date. Discovered from the year's
//              decisions index, https://www.rba.gov.au/monetary-policy/int-rate-decisions/{YYYY}/,
//              whose links read "29 September 2026" -> /media-releases/2026/mr-26-27.html.
//              Fallback: the media-releases listing (https://www.rba.gov.au/media-releases/),
//              candidates titled "...Monetary Policy Decision", confirmed by
//              the page's own <time datetime="YYYY-MM-DD...">.
//   smp:       Statement on Monetary Policy overview,
//              /publications/smp/{YYYY}/{feb|may|aug|nov}/overview.html
//              (e.g. /publications/smp/2026/aug/overview.html) — constructible.
//   minutes:   /monetary-policy/rba-board-minutes/{YYYY}/{YYYY-MM-DD}.html,
//              decision day (e.g. .../2026/2026-09-29.html, published
//              2026-10-13) — constructible; 404 until published.
// Content regions: media releases inside class="rss-mr-content" (ending at
// "More on the ... monetary policy decision"); minutes/SMP from
// <h1 class="page-title"> to the footer.
import { fetchHtml, pageText, findAnchors, dmyLong, numberish } from './cbPageText.js';

const ORIGIN = 'https://www.rba.gov.au';
export const MEDIA_RELEASES_URL = `${ORIGIN}/media-releases/`;
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function decisionsIndexUrl(dateStr) {
  return `${ORIGIN}/monetary-policy/int-rate-decisions/${dateStr.slice(0, 4)}/`;
}
export function smpUrl(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${ORIGIN}/publications/smp/${y}/${MON3[m - 1]}/overview.html`;
}
export function minutesUrl(dateStr) {
  return `${ORIGIN}/monetary-policy/rba-board-minutes/${dateStr.slice(0, 4)}/${dateStr}.html`;
}
const abs = href => (href.startsWith('http') ? href : ORIGIN + (href.startsWith('/') ? href : '/' + href));

// Index link whose visible text is exactly the decision date in prose.
export function findStatementLink(indexHtml, dateStr) {
  const want = dmyLong(dateStr).replace(/ /g, '\\s+');
  const hit = findAnchors(indexHtml, new RegExp(`^${want}$`, 'i')).find(a => /\/media-releases\/\d{4}\/mr-/.test(a.href));
  return hit ? abs(hit.href) : null;
}
// Media-releases listing -> candidate decision releases (newest first, as listed).
export function decisionCandidates(listHtml) {
  return findAnchors(listHtml, /Monetary Policy Decision/i).filter(a => /\/media-releases\/\d{4}\/mr-/.test(a.href)).map(a => abs(a.href));
}
// The release's own machine-readable date.
export function releaseDate(html) {
  const m = html.match(/class="rss-mr-date"[^>]*datetime="(\d{4}-\d{2}-\d{2})/i) || html.match(/datetime="(\d{4}-\d{2}-\d{2})[^"]*"[^>]*class="rss-mr-date"/i);
  return m ? m[1] : null;
}

export function extractStatementText(html) {
  const title = (html.match(/class="rss-mr-title"[^>]*>([^<]+)</i) || [])[1]?.trim();
  const date = releaseDate(html);
  const body = pageText(html, /<div[^>]*class="rss-mr-content"/i, /More on the [A-Za-z]+ \d{4} monetary policy decision|Enquiries|<footer/i);
  return [title, date].filter(Boolean).join(' — ') + (title || date ? '\n\n' : '') + body;
}
export function extractPageText(html) {
  return pageText(html, /<h1[^>]*class="page-title"/i, /More on the [A-Za-z]+ \d{4} monetary policy decision|<div[^>]*id="mp-related-links"|<footer/i);
}

export async function fetchStatement(dateStr) {
  const idxUrl = decisionsIndexUrl(dateStr);
  const idx = await fetchHtml(idxUrl);
  let url = idx.ok ? findStatementLink(idx.raw, dateStr) : null;
  let docRaw = null;
  if (!url) {
    // Index not updated yet on decision day, or failed — try the listing.
    const list = await fetchHtml(MEDIA_RELEASES_URL);
    if (!list.ok && !idx.ok) return { ok: false, notYetPublished: false, error: `index ${idx.error || idx.status}; listing ${list.error || list.status}`, url: idxUrl, text: null };
    for (const cand of list.ok ? decisionCandidates(list.raw).slice(0, 3) : []) {
      const d = await fetchHtml(cand);
      if (d.ok && releaseDate(d.raw) === dateStr) { url = cand; docRaw = d.raw; break; }
    }
    if (!url) return { ok: false, notYetPublished: true, url: idxUrl, text: null };
  }
  if (!docRaw) {
    const d = await fetchHtml(url);
    if (!d.ok) return { ...d, notYetPublished: false, url, text: null };
    docRaw = d.raw;
  }
  // Guard against a mis-matched link: the release must carry this date.
  const got = releaseDate(docRaw);
  if (got && got !== dateStr) return { ok: false, notYetPublished: false, error: `linked release is dated ${got}, not ${dateStr}`, url, text: null };
  return { ok: true, url, text: extractStatementText(docRaw) };
}

async function fetchDirect(url) {
  const r = await fetchHtml(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: extractPageText(r.raw) };
}
export async function fetchSmp(dateStr) { return fetchDirect(smpUrl(dateStr)); }
export async function fetchMinutes(dateStr) { return fetchDirect(minutesUrl(dateStr)); }

export const FETCHERS = {
  statement: fetchStatement,
  smp: fetchSmp,
  minutes: fetchMinutes,
};

// Vote — the Monetary Policy Board has published its vote since 2025.
// Verified live phrasing across every 2025-2026 decision release:
//   "Today's policy decision was unanimous."
//   "Today's policy decision was made by majority: 6 in favour, 3 against." (2025)
//   "Today's policy decision was made by majority: eight members voted to
//    increase the cash rate target ...; one member voted to leave the cash
//    rate target unchanged ..." (May 2026; Mar 2026 was five-four)
// Members are not named, so there are no dissenter names to extract.
export function extractVote(text) {
  const t = text.replace(/\s+/g, ' ');
  if (/policy decision was unanimous|decided unanimously/i.test(t)) return { unanimous: true, majority: null, minority: null };
  let m = t.match(/made by majority:?\s*(\d+|[a-z]+)\s+in favour,\s*(\d+|[a-z]+)\s+against/i);
  if (m && numberish(m[1]) != null && numberish(m[2]) != null) return { unanimous: false, majority: numberish(m[1]), minority: numberish(m[2]) };
  m = t.match(/made by majority:?\s*(\d+|[a-z]+)\s+members?\s+voted\s+to\s+([^;]+);\s*(\d+|[a-z]+)\s+members?\s+voted\s+to\s+(.+?)\.(?:\s|$)/i);
  if (m && numberish(m[1]) != null && numberish(m[3]) != null) {
    return { unanimous: false, majority: numberish(m[1]), minority: numberish(m[3]), majorityView: m[2].trim(), minorityView: m[4].trim() };
  }
  return null;
}
