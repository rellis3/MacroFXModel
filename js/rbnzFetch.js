// js/rbnzFetch.js — network fetchers for RBNZ source documents.
//
// VERIFIED LIVE 2026-10-24 (from a desktop connection, not the deployed
// server):
//   - Each OCR decision is ONE news page carrying both the media release and
//     the Monetary Policy Committee's "Summary record of meeting", e.g.
//       https://www.rbnz.govt.nz/news-and-events/news/2026/09/ocr-increased-by-25-basis-points-to-2-75
//     The slug is free text ("ocr-held-at-2-25-percent", "ocr-on-hold-at-
//     2-25"), so — like the ECB — the URL is NOT constructible from the date
//     and has to be discovered.
//   - Discovery: the RBNZ news RSS feed, https://www.rbnz.govt.nz/feeds/news
//     (RSS 2.0, ~50 items, about seven months deep). Each OCR item's pubDate
//     carries the NZ-local announcement day ("Wed, 02 Sep 2026 00:00:00
//     +1200") and its title names the OCR ("OCR increased by 25 basis points
//     to 2.75%", "OCR held at 2.25%", "OCR on hold at 2.25%").
//   - Fallback for dates older than the feed: the "Past monetary policy
//     decisions" table, https://www.rbnz.govt.nz/monetary-policy/monetary-policy-decisions
//     — one <tr> per decision: "<td>2 September 2026</td>" then a
//     "Media release" link.
//   - Page structure: content starts at <h1 id="main-heading">, the record
//     ends at the "Media contact" <h2> (then </main>).
//
// ACCESS CAVEAT (the big one): the RBNZ site sits behind a firewall that
// returned 403 "Your access to the Reserve Bank website has been
// restricted" to every request from Node's fetch() during verification, for
// the news pages, the decisions table and the PDFs — with this repo's honest
// MacroFX User-Agent and otherwise. ONLY the RSS feed answered Node (200).
// This module does not try to get around that block. A 403 carrying that
// wording is reported as a hard, logged failure (notYetPublished:false) so
// it shows in /api/rbnz/fetch-status instead of looking like "not out yet".
// Whether Railway's egress is blocked the same way is UNVERIFIED — run
// /api/rbnz/debug-fetch?date=2026-09-02 after deploy. If it is blocked, the
// fix is to ask the RBNZ to allowlist the client (the block page says to
// email Servicedesk@rbnz.govt.nz), not to disguise the client.
import { parseRssItems } from './cbIndexFetch.js';
import { fetchHtml, pageText, findAnchors, dmyLong, MONTHS } from './cbPageText.js';

const ORIGIN = 'https://www.rbnz.govt.nz';
export const NEWS_RSS_URL = `${ORIGIN}/feeds/news`;
export const DECISIONS_URL = `${ORIGIN}/monetary-policy/monetary-policy-decisions`;
export const BLOCKED_RE = /access to the Reserve Bank website has been restricted/i;

const MON3 = MONTHS.map(m => m.slice(0, 3));

// RSS pubDate "Wed, 02 Sep 2026 00:00:00 +1200" -> '2026-09-02' — the date as
// written (NZ local), never converted through UTC (that would shift it back
// a day: midnight +1200 is the previous day in UTC).
export function rssLocalDate(pubDate) {
  const m = String(pubDate || '').match(/(\d{1,2})\s+([A-Z][a-z]{2})[a-z]*\s+(\d{4})/);
  if (!m) return null;
  const mi = MON3.indexOf(m[2]);
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// An OCR decision item: a title naming the OCR (or the Official Cash Rate,
// the pre-2024 wording) published on the decision day. Matching the day as
// well as the title is what keeps a mid-cycle OCR-themed speech or the
// "Updates to the October MPR" logistics notice from being picked.
export const OCR_TITLE_RE = /\bOCR\b|Official Cash Rate/i;
export function findDecisionInRss(items, dateStr) {
  const hit = items.find(it => it.link && OCR_TITLE_RE.test(it.title || '') && rssLocalDate(it.pubDate) === dateStr
    && /\/news-and-events\/news\//.test(it.link));
  return hit ? hit.link : null;
}

// Fallback: the decisions table row whose first cell is the date in prose.
export function findDecisionInTable(html, dateStr) {
  const want = dmyLong(dateStr);
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const firstCell = (row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i) || [])[1];
    if (!firstCell) continue;
    const cellText = firstCell.replace(/<[^>]+>/g, ' ').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ').trim();
    if (cellText !== want) continue;
    const a = findAnchors(row[1], /Media release/i)[0];
    if (a) return a.href;
  }
  return null;
}

// Media release + Summary record of meeting, as plain text.
export function extractDecisionText(html) {
  return pageText(html, /<h1[^>]*id="main-heading"/i, /<h2[^>]*>\s*Media contact|<\/main>/i);
}

const abs = href => (href.startsWith('http') ? href : ORIGIN + (href.startsWith('/') ? href : '/' + href));

export async function findDecisionUrl(dateStr) {
  const tried = [];
  const feed = await fetchHtml(NEWS_RSS_URL, { blockedRe: BLOCKED_RE });
  if (feed.ok) {
    const items = parseRssItems(feed.raw);
    const link = findDecisionInRss(items, dateStr);
    if (link) return { ok: true, url: abs(link), via: 'rss' };
    tried.push(`rss: no OCR item dated ${dateStr} among ${items.length}`);
  } else tried.push(`rss: ${feed.error || feed.status}`);
  const table = await fetchHtml(DECISIONS_URL, { blockedRe: BLOCKED_RE });
  if (table.ok) {
    const href = findDecisionInTable(table.raw, dateStr);
    if (href) return { ok: true, url: abs(href), via: 'decisions-table' };
    tried.push(`decisions table: no row for ${dmyLong(dateStr)}`);
  } else tried.push(`decisions table: ${table.error || table.status}`);
  return { ok: false, tried, blocked: !feed.ok && BLOCKED_RE.test(feed.error || '') };
}

// The decision-day page. A miss on BOTH discovery routes, with both
// sources loading fine, is "not yet published" (silent — normal on the
// morning of the decision). Any HTTP failure, including the firewall 403,
// is a logged hard failure.
export async function fetchStatement(dateStr) {
  const found = await findDecisionUrl(dateStr);
  if (!found.ok) {
    const hardFail = found.tried.some(t => /HTTP/.test(t));
    return { ok: false, notYetPublished: !hardFail, error: found.tried.join(' · '), url: NEWS_RSS_URL, text: null };
  }
  const doc = await fetchHtml(found.url, { blockedRe: BLOCKED_RE });
  if (!doc.ok) return { ...doc, notYetPublished: false, url: found.url, text: null };
  return { ok: true, url: found.url, via: found.via, text: extractDecisionText(doc.raw) };
}

export const FETCHERS = {
  statement: fetchStatement,
};

// Vote / consensus. Verified live phrasing (Jul + Sep 2026 pages): "The
// Monetary Policy Committee today reached consensus to increase the OCR ..."
// and, in the record, "The Committee decided by consensus to ...". The MPC
// has also decided by vote in the past; the split-vote regex below is built
// from the general "voted N to M" / "N–M" shape and was NOT verified against
// a live split-vote page during this build — treat a null on a split
// meeting as "regex missed", and the LLM still sees the full record.
export function extractVote(text) {
  const split = text.match(/\bvoted?\s+(?:by\s+)?(\d+|one|two|three|four|five|six|seven)\s*(?:[-–—]|to)\s*(\d+|one|two|three|four|five|six|seven)\b/i);
  if (split) {
    const w = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
    const n = s => (/^\d+$/.test(s) ? parseInt(s, 10) : w[s.toLowerCase()]);
    return { unanimous: false, consensus: false, majority: n(split[1]), minority: n(split[2]) };
  }
  if (/\b(?:reached|by)\s+consensus\b/i.test(text)) return { unanimous: true, consensus: true, majority: null, minority: null };
  if (/\bunanimous(?:ly)?\b/i.test(text)) return { unanimous: true, consensus: false, majority: null, minority: null };
  return null;
}
