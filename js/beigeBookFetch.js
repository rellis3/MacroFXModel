// js/beigeBookFetch.js — network fetcher for the Beige Book.
//
// CORRECTION (2026-08-08, live diagnostic): the original version of this
// file fetched the HTML "reader" page (federalreserve.gov/monetarypolicy/
// beigebook{urlSuffix}.htm), reasoning it was plain server-rendered HTML —
// that turned out to be wrong. A live /api/beigebook/debug-fetch check
// showed the page's <html> tag carries data-ng-app="pubwebApp": it's an
// AngularJS single-page app, and the actual Beige Book prose (National
// Summary + 12 District reports) is rendered CLIENT-SIDE, never present in
// the server-delivered HTML at all. A regex content-marker check on that
// raw HTML gave a false positive — it matched "National Summary" as a
// substring of "International Summary Statistics", an unrelated link in
// the Fed's global site-wide navigation menu, not the Beige Book's actual
// section heading. The ~12KB of "content" that page extraction produced
// was entirely nav/footer chrome. Same root failure mode as the ECB HTML
// index scraper (js/ecbFetch.js's header) and the BoJ Outlook "Highlights"
// page (js/bojFetch.js's header) — a third and now-familiar instance of
// "an HTML reader page for a .gov/central-bank site turns out to be
// JS-rendered" in this project.
//
// Fix: the Fed ALSO publishes a full-text PDF at a clean, date-only URL —
// federalreserve.gov/monetarypolicy/files/BeigeBook_{YYYYMMDD}.pdf, using
// the Beige Book's OWN release date (not the FOMC meeting date, not the
// "urlSuffix" slot computed in js/beigeBookCalendar.js — that field is now
// unused for fetching, kept only as calendar metadata). Confirmed real via
// search: BeigeBook_20260715.pdf for the July 15 2026 release, alongside
// several other 2026 dates. Fetched the same PDF-buffer-then-parse way as
// every other bank's PDF documents in this codebase.
const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
const FETCH_TIMEOUT_MS = 20_000;
const ORIGIN = 'https://www.federalreserve.gov';

export function beigeBookPdfUrl(dateStr) {
  return `${ORIGIN}/monetarypolicy/files/BeigeBook_${dateStr.replaceAll('-', '')}.pdf`;
}

async function fetchBuffer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (r.status === 404) return { ok: false, notYetPublished: true, status: 404 };
  if (!r.ok) return { ok: false, notYetPublished: false, status: r.status, error: `HTTP ${r.status}` };
  return { ok: true, buffer: Buffer.from(await r.arrayBuffer()) };
}

// Same debug-mode workaround as fomcFetch.js's pdfParse (importing the
// inner module skips a top-level branch that crashes when there's no
// module.parent, which ESM dynamic import triggers).
let _pdfParsePromise = null;
async function pdfParse(buffer) {
  if (!_pdfParsePromise) _pdfParsePromise = import('pdf-parse/lib/pdf-parse.js').then(m => m.default);
  const parse = await _pdfParsePromise;
  return parse(buffer);
}

// Takes the Beige Book's own release date (YYYY-MM-DD), NOT the urlSuffix —
// see the header comment above.
export async function fetchBeigeBook(dateStr) {
  const url = beigeBookPdfUrl(dateStr);
  const r = await fetchBuffer(url);
  if (!r.ok) return { ...r, url, text: null };
  const parsed = await pdfParse(r.buffer);
  return { ok: true, url, text: parsed.text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim(), pages: parsed.numpages };
}
