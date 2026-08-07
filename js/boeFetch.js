// js/boeFetch.js — network fetchers for BoE source documents.
//
// Unlike the ECB (js/ecbFetch.js — unpredictable hashed URLs, needed an RSS
// feed to discover them), the BoE's URLs are DIRECTLY constructible from the
// meeting date, much closer to the Fed's pattern:
//   /monetary-policy-summary-and-minutes/{year}/{month}-{year}
//   /monetary-policy-report/{year}/{month}-{year}
//   /-/media/boe/files/monetary-policy-report/{year}/{month}/mpr-press-conference-transcript-{month}-{year}.pdf
// Verified against multiple real examples spanning 2021-2026 (a stable,
// long-lived convention) via web search — no index-page/RSS lookup needed.
//
// CAVEAT (same as fomcFetch.js/ecbFetch.js): this sandbox's egress policy
// blocks bankofengland.co.uk, so none of this was verified against a live
// fetch. Worth remembering the ECB build's lesson here specifically: an
// index/list page turned out to be JavaScript-rendered and silently
// unscrapable. These are direct DOCUMENT pages, not list/index pages, so
// much less likely to have that problem — but "less likely" isn't "proven,"
// and this should be re-checked once deployed.
import { htmlToText, stripBoilerplate } from './fomcFetch.js';

const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
const FETCH_TIMEOUT_MS = 20_000;
const ORIGIN = 'https://www.bankofengland.co.uk';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function monthSlug(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1]}-${y}`;
}

export function summaryUrl(dateStr) {
  const [y] = dateStr.split('-');
  return `${ORIGIN}/monetary-policy-summary-and-minutes/${y}/${monthSlug(dateStr)}`;
}
export function reportUrl(dateStr) {
  const [y] = dateStr.split('-');
  return `${ORIGIN}/monetary-policy-report/${y}/${monthSlug(dateStr)}`;
}
export function transcriptPdfUrl(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${ORIGIN}/-/media/boe/files/monetary-policy-report/${y}/${MONTHS[m - 1]}/mpr-press-conference-transcript-${monthSlug(dateStr)}.pdf`;
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (r.status === 404) return { ok: false, notYetPublished: true, status: 404 };
  if (!r.ok) return { ok: false, notYetPublished: false, status: r.status, error: `HTTP ${r.status}` };
  return { ok: true, raw: await r.text() };
}
async function fetchBuffer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (r.status === 404) return { ok: false, notYetPublished: true, status: 404 };
  if (!r.ok) return { ok: false, notYetPublished: false, status: r.status, error: `HTTP ${r.status}` };
  return { ok: true, buffer: Buffer.from(await r.arrayBuffer()) };
}

// The combined "Monetary Policy Summary and Minutes" — every meeting, same
// day, no delayed-minutes release exists separately.
export async function fetchSummary(dateStr) {
  const url = summaryUrl(dateStr);
  const r = await fetchText(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(r.raw)) };
}

// The quarterly Monetary Policy Report — Feb/Apr/Jul/Nov meetings only.
export async function fetchReport(dateStr) {
  const url = reportUrl(dateStr);
  const r = await fetchText(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(r.raw)) };
}

// PDF text extraction — same debug-mode workaround as fomcFetch.js's
// pdfParse (importing the inner module skips a top-level branch that
// crashes when there's no module.parent, which ESM dynamic import triggers).
let _pdfParsePromise = null;
async function pdfParse(buffer) {
  if (!_pdfParsePromise) _pdfParsePromise = import('pdf-parse/lib/pdf-parse.js').then(m => m.default);
  const parse = await _pdfParsePromise;
  return parse(buffer);
}
export async function fetchTranscript(dateStr) {
  const url = transcriptPdfUrl(dateStr);
  const r = await fetchBuffer(url);
  if (!r.ok) return { ...r, url, text: null };
  const parsed = await pdfParse(r.buffer);
  return { ok: true, url, text: parsed.text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim(), pages: parsed.numpages };
}

export const FETCHERS = {
  summary: fetchSummary,
  report: fetchReport,
  transcript: fetchTranscript,
};

// Vote extraction — confirmed real BoE phrasing (verified via web search
// against actual 2026 releases): "voted unanimously to maintain Bank Rate"
// or "voted by a majority of 5–4 to maintain Bank Rate" (note: EN-DASH
// between the numbers, not a hyphen — BoE's house style). Unlike the Fed's
// phrasing, BoE names the MAJORITY side explicitly, not the dissenting
// minority, in this sentence — no confirmed stable phrasing was found for
// the dissent side specifically, so this deliberately does NOT attempt to
// extract dissenter names (a regex built on an unverified guess is worse
// than no regex — the LLM prompt gets the full text and can name them in
// its own summary if the text does).
export function extractVote(summaryText) {
  if (/voted unanimously/i.test(summaryText)) return { unanimous: true, majority: null, minority: null };
  const m = summaryText.match(/voted by a majority of\s*(\d+)\s*[-–—]\s*(\d+)/i);
  if (!m) return null;
  return { unanimous: false, majority: parseInt(m[1], 10), minority: parseInt(m[2], 10) };
}
