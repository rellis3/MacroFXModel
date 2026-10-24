// js/cbPageText.js — shared HTML-page helpers for the RBNZ / RBA / BoC
// sentiment engines (js/rbnzFetch.js, js/rbaFetch.js, js/bocFetch.js).
//
// The Fed/BoE fetchers lean on fomcFetch.js's stripBoilerplate(), whose
// start/end markers are Fed-specific ("For release", "Last update"). The
// three newer banks' pages carry 2-6KB of nav menus around the document, so
// each fetcher instead slices the page down to its own content region with
// bank-specific start/end markers (verified live 2026-10-24 against the real
// pages — see each fetch module's header) BEFORE converting to text.
import { htmlToText } from './fomcFetch.js';

export const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
export const FETCH_TIMEOUT_MS = 20_000;

// The RBA's pages emit Windows-1252 numeric entities (&#146; for a right
// single quote, seen live in "Today&#146;s policy decision was unanimous").
// decodeEntities() maps &#146; to the C1 control char U+0092, which then
// vanishes from the text ("Todays"). Map the cp1252 0x80-0x9F block to the
// characters it actually means, and decode hex entities (&#x2019;) which
// decodeEntities() does not handle at all.
const CP1252 = {
  128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ',
  142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›',
  156: 'œ', 158: 'ž', 159: 'Ÿ',
};
export function fixNumericEntities(html) {
  return html
    .replace(/&#(1[2-5]\d);/g, (m, n) => CP1252[+n] ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { const cp = parseInt(h, 16); return Number.isFinite(cp) ? String.fromCodePoint(cp) : m; });
}

// Slice html from the first match of startRe (inclusive) to the first match
// of endRe AFTER it (exclusive). Either marker missing -> that side is left
// untrimmed (a noisy capture beats a silently empty one — same fallback
// stance as stripBoilerplate()).
export function sliceHtml(html, startRe, endRe) {
  let out = html;
  if (startRe) { const i = out.search(startRe); if (i >= 0) out = out.slice(i); }
  if (endRe) { const j = out.search(endRe); if (j > 0) out = out.slice(0, j); }
  return out;
}

// Full page -> clean document text: slice to the content region, fix
// entities, strip tags, and collapse the blank-line runs left by nav markup.
export function pageText(html, startRe, endRe) {
  const sliced = fixNumericEntities(sliceHtml(html, startRe, endRe));
  return htmlToText(sliced).replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// GET returning { ok, raw } / { ok:false, notYetPublished, status, error }.
// 404 = not yet published (same convention as every other bank's fetcher).
// `blockedRe`, when given, is tested against a 403 body so a WAF block is
// reported loudly as a hard failure (notYetPublished:false) rather than read
// as "not out yet" — the RBNZ site does exactly this to non-browser clients.
export async function fetchHtml(url, { blockedRe = null } = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (r.status === 404) return { ok: false, notYetPublished: true, status: 404 };
  if (!r.ok) {
    let error = `HTTP ${r.status}`;
    if (r.status === 403 && blockedRe) {
      const body = await r.text().catch(() => '');
      if (blockedRe.test(body)) error = 'HTTP 403 — blocked by the site\'s firewall (access restricted for this client), not a missing document';
    }
    return { ok: false, notYetPublished: false, status: r.status, error };
  }
  return { ok: true, raw: await r.text() };
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// '2026-09-02' -> '2 September 2026' (RBNZ/RBA prose style).
export function dmyLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
// '2026-09-02' -> 'September 2, 2026' (BoC prose style).
export function mdyLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// Anchors on a page whose visible text (tags stripped, &nbsp; folded to a
// space, whitespace collapsed) satisfies `textRe`. Returns [{href, text}] in
// page order. Stricter than cbIndexFetch.findLinkByDateText: that one ANDs
// loose terms, so a day number like "2" matches inside "2026"; a full-phrase
// regex here cannot.
export function findAnchors(html, textRe) {
  const out = [];
  for (const m of html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ').trim();
    if (textRe.test(text)) out.push({ href: m[1], text });
  }
  return out;
}

// Number words up to 12 — RBA writes split votes out in words ("eight
// members voted to increase ...; one member voted to leave ...").
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
export function numberish(s) {
  if (s == null) return null;
  const t = String(s).toLowerCase().trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return WORDS[t] ?? null;
}
