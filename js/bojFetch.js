// js/bojFetch.js — network fetchers for BoJ source documents.
//
// Like the Fed and BoE (direct date-templated URLs), NOT like the ECB
// (RSS discovery needed for an unpredictable hashed URL) — BoJ's English-site
// URLs are directly constructible from the meeting's decision date:
//   statement: /en/mopo/mpmdeci/mpr_{YYYY}/k{YYMMDD}a.pdf
//   outlook:   /en/mopo/outlook/highlight/ten{YYYYMM}.htm  (short HTML
//              "Highlights" summary — the full Outlook Report is PDF-only
//              AND its filename suffix (gor{YYMM}a.pdf vs gor{YYMM}b.pdf)
//              was NOT consistently derivable from the date in the verified
//              examples, so this uses the Highlights page instead, which has
//              a clean, unambiguous, date-only naming pattern)
//   opinions:  /en/mopo/mpmsche_minu/opinion_{YYYY}/opi{YYMMDD}.pdf
//   minutes:   /en/mopo/mpmsche_minu/minu_{YYYY}/g{YYMMDD}.pdf
// In every pattern, the directory YEAR is the MEETING year (not the
// publication year) and the filename date is the meeting's decision day.
//
// CORRECTION (2026-08-07, live diagnostic): the first version of this file
// pointed `statement` at an HTML page under state_{YYYY}/k{YYMMDD}a.htm and
// `opinions` at opinion_{YYYY}/opi{YYMMDD}.htm, based on web-search snippets
// that turned out to be stale/wrong for the 2026 site — a live
// /api/boj/debug-fetch check against boj.or.jp returned real 404s for both
// (confirmed by their actual site, not a JS-rendering issue like the ECB's).
// A follow-up search confirmed the ACTUAL live 2026 documents are PDFs at
// mpr_{YYYY}/k{YYMMDD}a.pdf (statement) and opinion_{YYYY}/opi{YYMMDD}.pdf
// (opinions) — e.g. https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2026/k260731a.pdf
// and https://www.boj.or.jp/en/mopo/mpmsche_minu/opinion_2026/opi260123.pdf,
// both indexed and real. `outlook` and `minutes` were separately confirmed
// correct at the same time (ten202601.htm/ten202604.htm; g260428.pdf) — no
// change needed there.
//
// No press-conference fetcher: research found no confirmed official English
// transcript — BoJ's press-conference PDF lives at a Japanese-only
// /about/press/ path (no /en/ counterpart found in repeated searches).
// Deliberately left out rather than guess at an unverified URL.
//
// CAVEAT (same as every other bank's fetch module): this sandbox's egress
// policy blocks boj.or.jp, so none of this was verified against a live
// fetch from THIS environment — only via web-search result snippets
// referencing real URLs/dates, cross-checked against a live diagnostic run
// from the actual deployed server. Re-check again if anything else here
// turns out wrong, same discipline that caught the two bugs above.
import { htmlToText, stripBoilerplate } from './fomcFetch.js';

const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
const FETCH_TIMEOUT_MS = 20_000;
const ORIGIN = 'https://www.boj.or.jp';

// YYMMDD (2-digit year) — matches k260123a, opi260123, g250919 etc.
function yymmdd(dateStr) { return dateStr.replaceAll('-', '').slice(2); }
// YYYYMM (4-digit year, no day) — matches ten202507.
function yyyymm(dateStr) { const [y, m] = dateStr.split('-'); return `${y}${m}`; }
function meetingYear(dateStr) { return dateStr.slice(0, 4); }

export function statementUrl(dateStr) {
  return `${ORIGIN}/en/mopo/mpmdeci/mpr_${meetingYear(dateStr)}/k${yymmdd(dateStr)}a.pdf`;
}
export function outlookHighlightUrl(dateStr) {
  return `${ORIGIN}/en/mopo/outlook/highlight/ten${yyyymm(dateStr)}.htm`;
}
export function opinionsUrl(dateStr) {
  return `${ORIGIN}/en/mopo/mpmsche_minu/opinion_${meetingYear(dateStr)}/opi${yymmdd(dateStr)}.pdf`;
}
export function minutesPdfUrl(dateStr) {
  return `${ORIGIN}/en/mopo/mpmsche_minu/minu_${meetingYear(dateStr)}/g${yymmdd(dateStr)}.pdf`;
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

// PDF text extraction — same debug-mode workaround as fomcFetch.js's
// pdfParse (importing the inner module skips a top-level branch that
// crashes when there's no module.parent, which ESM dynamic import triggers).
let _pdfParsePromise = null;
async function pdfParse(buffer) {
  if (!_pdfParsePromise) _pdfParsePromise = import('pdf-parse/lib/pdf-parse.js').then(m => m.default);
  const parse = await _pdfParsePromise;
  return parse(buffer);
}
async function fetchPdfText(url) {
  const r = await fetchBuffer(url);
  if (!r.ok) return { ...r, url, text: null };
  const parsed = await pdfParse(r.buffer);
  return { ok: true, url, text: parsed.text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim(), pages: parsed.numpages };
}

// PDF, not HTML — see the header comment's 2026-08-07 correction.
export async function fetchStatement(dateStr) {
  return fetchPdfText(statementUrl(dateStr));
}
export async function fetchOutlook(dateStr) {
  const url = outlookHighlightUrl(dateStr);
  const r = await fetchText(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(r.raw)) };
}
// PDF, not HTML — see the header comment's 2026-08-07 correction.
export async function fetchOpinions(dateStr) {
  return fetchPdfText(opinionsUrl(dateStr));
}
export async function fetchMinutes(dateStr) {
  return fetchPdfText(minutesPdfUrl(dateStr));
}

export const FETCHERS = {
  statement: fetchStatement,
  outlook: fetchOutlook,
  opinions: fetchOpinions,
  minutes: fetchMinutes,
};

// Vote extraction — confirmed real BoJ phrasing (verified via web search
// against actual statements): "by a unanimous vote", or "by an 8-1
// majority vote" / "by a vote of 8-1", followed (on a split vote) by a
// named-dissenter clause: "[Name] voted against the action, dissenting
// because [reason]." Unlike BoE (which names only the majority side, with
// no confirmed dissent-side phrasing), BoJ statements DO reliably name and
// explain the dissenter — same shape as the Fed's extractVote, so this
// extracts dissenters too rather than leaving it to the LLM alone.
export function extractVote(statementText) {
  if (/\bby a unanimous vote\b/i.test(statementText)) return { unanimous: true, majority: null, minority: null, dissenters: [] };
  const m = statementText.match(/\bby an? (\d+)[-–—](\d+)\s*(?:majority\s*)?vote\b/i) || statementText.match(/\bby a vote of\s*(\d+)[-–—](\d+)\b/i);
  if (!m) return null;
  const dissenters = [];
  const dRe = /([A-Z][A-Za-z.'\- ]{2,40}?) voted against the action,\s*dissenting because\s+([^.]+(?:\.[^.]+){0,2})\./g;
  let d;
  while ((d = dRe.exec(statementText))) dissenters.push({ name: d[1].trim(), reason: d[2].trim() });
  return { unanimous: false, majority: parseInt(m[1], 10), minority: parseInt(m[2], 10), dissenters };
}
