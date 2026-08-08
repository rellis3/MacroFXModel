// js/beigeBookFetch.js — network fetcher for the Beige Book.
//
// Direct date-templated URL, same pattern family as the Fed/BoE/BoJ (no
// index-page/RSS lookup needed): federalreserve.gov/monetarypolicy/
// beigebook{urlSuffix}.htm, where urlSuffix comes from js/beigeBookCalendar.js
// (NOT derivable from the release date's own month — see that file's header
// comment). Verified against 3 real dated examples spanning 2024-2026 via
// web search: beigebook202401.htm, beigebook202502.htm, beigebook202601.htm.
//
// Confirmed structure: ONE page holds the National Summary plus all 12
// Federal Reserve District sections — no need to fetch per-district pages
// (those also exist as separate URLs but are redundant with the combined
// page). Reasonably confident this is plain server-rendered HTML, not a JS
// SPA (the open-source FedTools Python package scrapes it via plain HTTP,
// which couldn't work if it required JS execution) — but this wasn't
// verified with a byte-for-byte live fetch (this sandbox's egress policy
// blocks federalreserve.gov, same constraint as every other fetch module
// here). Re-check via a live fetch once deployed, same discipline that
// caught the BoJ statement/opinions URL bug.
import { htmlToText, stripBoilerplate } from './fomcFetch.js';

const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
const FETCH_TIMEOUT_MS = 20_000;
const ORIGIN = 'https://www.federalreserve.gov';

export function beigeBookUrl(urlSuffix) {
  return `${ORIGIN}/monetarypolicy/beigebook${urlSuffix}.htm`;
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (r.status === 404) return { ok: false, notYetPublished: true, status: 404 };
  if (!r.ok) return { ok: false, notYetPublished: false, status: r.status, error: `HTTP ${r.status}` };
  return { ok: true, raw: await r.text() };
}

// Only one release kind exists here (unlike the multi-kind FETCHERS-by-kind
// maps in fomcFetch.js/ecbFetch.js/boeFetch.js/bojFetch.js), so no dispatch
// map is needed — the caller (server.js's _beigeBookAutoCheck) invokes this
// directly with the release's urlSuffix (computed from the FOMC-meeting
// position, not derivable from the release date alone — see
// js/beigeBookCalendar.js).
export async function fetchBeigeBook(urlSuffix) {
  const url = beigeBookUrl(urlSuffix);
  const r = await fetchText(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(r.raw)) };
}
