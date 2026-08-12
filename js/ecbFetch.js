// js/ecbFetch.js — network fetchers for ECB source documents.
//
// Unlike the Fed (js/fomcFetch.js — direct date-templated URLs), the ECB's
// document URLs carry an unpredictable hash suffix (ecb.is260611~372040d313.
// en.html) — the actual URL for a given meeting has to be discovered first,
// then fetched. Two-step fetch instead of one-step construct-and-fetch.
//
// Discovery mechanism: RSS, not HTML-index scraping. The first version of
// this file scraped the ECB's HTML statement-index page — that turned out to
// be JavaScript-rendered (confirmed LIVE 2026-08-07 via a debug endpoint
// hitting the real page from the deployed server: 100KB fetched, the target
// date not present ANYWHERE in the raw HTML, because a plain fetch() never
// executes the page's JS and only ever sees the <head> shell). RSS feeds are
// server-rendered XML by construction — ecb.europa.eu/rss/press.xml, real
// and confirmed reachable — so this uses that instead. See
// js/cbIndexFetch.js's RSS section for the parsing.
import { htmlToText, stripBoilerplate } from './fomcFetch.js';
import { parseRssItems, findRssLinkByUrlPattern, findRssLinkByTitleText } from './cbIndexFetch.js';

const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
const FETCH_TIMEOUT_MS = 20_000;
const ORIGIN = 'https://www.ecb.europa.eu';

export const PRESS_RSS_URL = `${ORIGIN}/rss/press.xml`;
export const yymmdd = dateStr => dateStr.replaceAll('-', '').slice(2);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (r.status === 404) return { ok: false, notYetPublished: true, status: 404 };
  if (!r.ok) return { ok: false, notYetPublished: false, status: r.status, error: `HTTP ${r.status}` };
  return { ok: true, raw: await r.text() };
}

// The introductory statement (with Q&A) — ECB's single combined document
// covering both the scripted remarks AND the full press-conference
// transcript (the Fed splits these into two separate releases; the ECB
// doesn't). URL date fragment IS the meeting date itself (verified: Jun 11
// 2026 meeting -> ecb.is260611~...), so the RSS lookup only needs to match
// that one predictable fragment against each item's <link>, not fuzzy title
// text.
export async function fetchStatement(dateStr) {
  const feed = await fetchText(PRESS_RSS_URL);
  if (!feed.ok) return { ...feed, url: PRESS_RSS_URL, text: null };
  const items = parseRssItems(feed.raw);
  const pattern = new RegExp(`is${yymmdd(dateStr)}~`, 'i');
  const link = findRssLinkByUrlPattern(items, pattern);
  if (!link) {
    // The feed fetched fine — this is NOT the same as "not yet published"
    // and must not be treated as one (that's the exact bug that made a
    // weeks-old statement show as permanently "due" with the HTML-scraping
    // approach). Two real possibilities remain: genuinely not published
    // yet (if checked same-day, before the feed picks it up), or the item
    // has aged out of the feed's rolling window (RSS feeds only keep the
    // most recent N items — a real risk for catching up several
    // months-old dates on a cold start, not for ongoing same-week polling).
    // notYetPublished:false surfaces this in the log either way rather than
    // going silent.
    return { ok: false, notYetPublished: false, error: `date pattern "is${yymmdd(dateStr)}" not found among ${items.length} RSS items (fetched ${feed.raw.length} bytes) — either not yet published, or aged out of the feed's rolling window if this is an older date`, url: PRESS_RSS_URL, text: null };
  }
  const doc = await fetchText(link);
  if (!doc.ok) return { ...doc, url: link, text: null };
  return { ok: true, url: link, text: stripBoilerplate(htmlToText(doc.raw)) };
}

// Accounts of the monetary policy meeting — the ECB's minutes equivalent,
// published 5+ weeks after the meeting on a date NOT derivable from the
// meeting date (unlike the Fed's fixed +21 days). Matched by RSS item TITLE
// text naming the meeting date in prose ("Meeting of 17-18 December 2025"),
// not a URL pattern — lower-confidence match, see js/cbIndexFetch.js's
// header. Tries the decision day number; that number appears in the title
// whichever side of a 2-day range it falls on (confirmed in
// cbIndexFetch.test.mjs), so one term set covers both cases. Kept
// notYetPublished:true (silent) on a miss, unlike statement above — Accounts
// have a genuinely wide 4-7 week legitimate "not out yet" window, so a miss
// early in that window is expected, not a diagnostic problem the way a
// same-day-expected statement missing is.
export async function fetchAccounts(dateStr) {
  const feed = await fetchText(PRESS_RSS_URL);
  if (!feed.ok) return { ...feed, url: PRESS_RSS_URL, text: null };
  const items = parseRssItems(feed.raw);
  const [y, m, d] = dateStr.split('-').map(Number);
  const link = findRssLinkByTitleText(items, [String(d), MONTHS[m - 1], String(y)]);
  if (!link) return { ok: false, notYetPublished: true, url: PRESS_RSS_URL, text: null };
  const doc = await fetchText(link);
  if (!doc.ok) return { ...doc, url: link, text: null };
  return { ok: true, url: link, text: stripBoilerplate(htmlToText(doc.raw)) };
}

export const FETCHERS = {
  statement: fetchStatement,
  accounts: fetchAccounts,
};
