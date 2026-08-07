// js/ecbFetch.js — network fetchers for ECB source documents.
//
// Unlike the Fed (js/fomcFetch.js — direct date-templated URLs), the ECB's
// document URLs carry an unpredictable hash suffix (ecb.is260611~372040d313.
// en.html) — the actual URL for a given meeting has to be discovered on an
// index page first (js/cbIndexFetch.js), then fetched. Two-step fetch
// instead of one-step construct-and-fetch.
//
// CAVEAT (same as fomcFetch.js): this sandbox's egress policy blocks
// ecb.europa.eu, so none of this was verified against a live fetch — the
// index-page URLs and matching patterns below are built from real URLs
// surfaced via web search during this build (see js/ecbCalendar.js and
// js/cbIndexFetch.test.mjs for the exact examples used), not guessed
// wholesale, but the live page structure should be re-checked once deployed.
import { htmlToText, stripBoilerplate } from './fomcFetch.js';
import { findLinkByUrlDatePattern, findLinkByDateText, resolveUrl } from './cbIndexFetch.js';

const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
const FETCH_TIMEOUT_MS = 20_000;
const ORIGIN = 'https://www.ecb.europa.eu';

export const STATEMENT_INDEX_URL = `${ORIGIN}/press/press_conference/monetary-policy-statement/html/index.en.html`;
export const ACCOUNTS_INDEX_URL = `${ORIGIN}/press/accounts/html/index.en.html`;
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
// 2026 meeting -> ecb.is260611~...), so the index-page lookup only needs to
// match that one predictable fragment, not fuzzy date text.
export async function fetchStatement(dateStr) {
  const idx = await fetchText(STATEMENT_INDEX_URL);
  if (!idx.ok) return { ...idx, url: STATEMENT_INDEX_URL, text: null };
  const href = findLinkByUrlDatePattern(idx.raw, 'is', yymmdd(dateStr));
  if (!href) {
    // The index page itself fetched fine (200 OK) — this is NOT the same as
    // "not yet published" and must not be treated as one. A statement that's
    // actually weeks old failing to match here means the URL pattern is
    // wrong, the page paginates the target date out of the fetched HTML, or
    // the list renders client-side (this fetch never executes JS) — all
    // real problems that silently masquerade as "still waiting" forever if
    // this returns notYetPublished:true like a genuine 404 does.
    // notYetPublished:false makes _ecbAutoCheck log it instead of staying
    // quiet, so the failure is visible rather than indistinguishable from
    // "check again next week."
    return { ok: false, notYetPublished: false, error: `date pattern "is${yymmdd(dateStr)}" not found on index page (fetched ${idx.raw.length} bytes) — see js/ecbFetch.js's fetchStatement comment`, url: STATEMENT_INDEX_URL, text: null };
  }
  const url = resolveUrl(href, ORIGIN);
  const doc = await fetchText(url);
  if (!doc.ok) return { ...doc, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(doc.raw)) };
}

// Accounts of the monetary policy meeting — the ECB's minutes equivalent,
// published 5+ weeks after the meeting on a date NOT derivable from the
// meeting date (unlike the Fed's fixed +21 days). Matched by the index
// page's own link TEXT naming the meeting date in prose ("Meeting of
// 17-18 December 2025"), not a URL pattern — lower-confidence match, see
// js/cbIndexFetch.js's header. Tries the decision day number; that number
// appears in the link text whichever side of a 2-day range it falls on
// (confirmed in cbIndexFetch.test.mjs), so one term set covers both cases.
export async function fetchAccounts(dateStr) {
  const idx = await fetchText(ACCOUNTS_INDEX_URL);
  if (!idx.ok) return { ...idx, url: ACCOUNTS_INDEX_URL, text: null };
  const [y, m, d] = dateStr.split('-').map(Number);
  const href = findLinkByDateText(idx.raw, [String(d), MONTHS[m - 1], String(y)]);
  if (!href) return { ok: false, notYetPublished: true, url: ACCOUNTS_INDEX_URL, text: null };
  const url = resolveUrl(href, ORIGIN);
  const doc = await fetchText(url);
  if (!doc.ok) return { ...doc, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(doc.raw)) };
}

export const FETCHERS = {
  statement: fetchStatement,
  accounts: fetchAccounts,
};
