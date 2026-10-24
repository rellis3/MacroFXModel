// js/bocFetch.js — network fetchers for Bank of Canada source documents.
//
// VERIFIED LIVE 2026-10-24 with Node fetch() and this repo's MacroFX
// User-Agent (all 200, server-rendered WordPress pages):
//   statement:     /{YYYY}/{MM}/fad-press-release-{YYYY-MM-DD}/ — the rate
//                  announcement press release, constructible from the date
//                  (e.g. https://www.bankofcanada.ca/2026/09/fad-press-release-2026-09-02/).
//   mpr:           /publications/mpr/mpr-{YYYY-MM-DD}/overview/ — the Monetary
//                  Policy Report's Overview section, e.g.
//                  https://www.bankofcanada.ca/publications/mpr/mpr-2026-07-15/overview/
//                  (falls back to the report's landing page on a 404).
//   deliberations: "Summary of Governing Council deliberations: Fixed
//                  announcement date of September 2, 2026". NOT safely
//                  constructible: the directory month is the PUBLICATION
//                  month (Apr 29 -> /2026/05/) and the slug has two live
//                  spellings ("summary-of-governing-council-..." since
//                  mid-2026, "summary-governing-council-..." before). So it is
//                  discovered from the index,
//                  https://www.bankofcanada.ca/publications/summary-governing-council-deliberations/,
//                  by its link text, with one constructed-URL fallback.
// Content region on every page: <h1 class="post-heading"> to the
// "Content Type(s)" taxonomy line that closes the post.
//
// No vote: the Governing Council decides by consensus and publishes no vote
// count; the deliberations summary describes the range of views in prose.
import { fetchHtml, pageText, findAnchors, mdyLong, MONTHS } from './cbPageText.js';

const ORIGIN = 'https://www.bankofcanada.ca';
export const DELIBERATIONS_INDEX_URL = `${ORIGIN}/publications/summary-governing-council-deliberations/`;

export function statementUrl(dateStr) {
  const [y, m] = dateStr.split('-');
  return `${ORIGIN}/${y}/${m}/fad-press-release-${dateStr}/`;
}
// The MPR's Overview section page carries the full overview prose (~4K
// chars, verified for July 2026); the landing page above it only has
// one-line section teasers, so it is the fallback, not the first choice.
export function mprUrl(dateStr) {
  return `${ORIGIN}/publications/mpr/mpr-${dateStr}/overview/`;
}
export function mprLandingUrl(dateStr) {
  return `${ORIGIN}/publications/mpr/mpr-${dateStr}/`;
}
// Fallback guess only (current slug spelling, publication month = 14 days on).
export function deliberationsGuessUrl(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const pub = new Date(Date.UTC(y, m - 1, d + 14));
  const py = pub.getUTCFullYear(), pm = String(pub.getUTCMonth() + 1).padStart(2, '0');
  return `${ORIGIN}/${py}/${pm}/summary-of-governing-council-deliberations-fixed-announcement-date-of-${MONTHS[m - 1].toLowerCase()}-${d}-${y}/`;
}
const abs = href => (href.startsWith('http') ? href : ORIGIN + (href.startsWith('/') ? href : '/' + href));

export function findDeliberationsLink(indexHtml, dateStr) {
  const phrase = mdyLong(dateStr).replace(/[ ,]+/g, m => (m.includes(',') ? ',\\s*' : '\\s+'));
  const hit = findAnchors(indexHtml, new RegExp(`Fixed announcement date of ${phrase}\\b`, 'i'))[0];
  return hit ? abs(hit.href) : null;
}

// The MPR pages have no taxonomy line, so </main> is the second stop.
const END_RE = /<span[^>]*class=['"]tax-name['"][^>]*>\s*Content Type|<\/main>/i;
export function extractPostText(html) {
  return pageText(html, /<h1[^>]*class="post-heading"/i, END_RE)
    .split('\n').filter(l => !/^\s*Share this page (?:on|by)\b/i.test(l)).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchDirect(url) {
  const r = await fetchHtml(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: extractPostText(r.raw) };
}
export async function fetchStatement(dateStr) { return fetchDirect(statementUrl(dateStr)); }
export async function fetchMpr(dateStr) {
  const ov = await fetchDirect(mprUrl(dateStr));
  if (ov.ok || !ov.notYetPublished) return ov;
  const landing = await fetchDirect(mprLandingUrl(dateStr));
  return landing.ok ? landing : ov;
}

export async function fetchDeliberations(dateStr) {
  const idx = await fetchHtml(DELIBERATIONS_INDEX_URL);
  const link = idx.ok ? findDeliberationsLink(idx.raw, dateStr) : null;
  if (link) return fetchDirect(link);
  const guess = await fetchDirect(deliberationsGuessUrl(dateStr));
  if (guess.ok) return guess;
  // Index loaded and the guess 404'd: genuinely not out yet (silent).
  if (idx.ok && guess.notYetPublished) return { ok: false, notYetPublished: true, url: DELIBERATIONS_INDEX_URL, text: null };
  return { ok: false, notYetPublished: false, error: `index ${idx.ok ? 'no link' : (idx.error || idx.status)}; guess ${guess.error || guess.status}`, url: DELIBERATIONS_INDEX_URL, text: null };
}

export const FETCHERS = {
  statement: fetchStatement,
  mpr: fetchMpr,
  deliberations: fetchDeliberations,
};
