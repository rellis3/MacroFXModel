// js/fomcFetch.js — network fetchers for FOMC source documents.
//
// Sources are the Fed's own site (federalreserve.gov) — unlike CME's OI feed
// (oi_recon/fetch_oi.py), these are plain government press-release pages with
// no anti-scripted-client fingerprinting, so a normal fetch() is enough; no
// browser automation needed.
//
// Pure-core split (same shape as econCalendar.js): `htmlToText`/`stripBoilerplate`
// are pure and unit-tested on saved fixtures; only the `fetch*` functions do I/O.
//
// CAVEAT: the exact <body> structure of federalreserve.gov pages was NOT
// verified against a live fetch while building this — this sandbox's egress
// policy blocks federalreserve.gov outright. `htmlToText` is deliberately
// generic (strip tags, keep everything) rather than targeting a specific DOM
// container, so it degrades to "correct but includes some nav/footer text"
// rather than "silently empty" if the real markup differs from what's assumed
// here. Re-check against a real fetch (from the deployed server, not this
// sandbox) before trusting the extraction is tight.

const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
const FETCH_TIMEOUT_MS = 20_000;

const pad = n => String(n).padStart(2, '0');
export const yyyymmdd = dateStr => dateStr.replaceAll('-', '');

export function statementUrl(dateStr) {
  return `https://www.federalreserve.gov/newsevents/pressreleases/monetary${yyyymmdd(dateStr)}a.htm`;
}
export function implementationNoteUrl(dateStr) {
  return `https://www.federalreserve.gov/newsevents/pressreleases/monetary${yyyymmdd(dateStr)}a1.htm`;
}
export function minutesUrl(dateStr) {
  return `https://www.federalreserve.gov/monetarypolicy/fomcminutes${yyyymmdd(dateStr)}.htm`;
}
export function transcriptPdfUrl(dateStr) {
  return `https://www.federalreserve.gov/mediacenter/files/FOMCpresconf${yyyymmdd(dateStr)}.pdf`;
}
export function sepPdfUrl(dateStr) {
  return `https://www.federalreserve.gov/monetarypolicy/files/fomcprojtabl${yyyymmdd(dateStr)}.pdf`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–' };
function decodeEntities(s) {
  return s.replace(/&(#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') return String.fromCharCode(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

// Generic HTML → plain text: drop script/style, drop tags, decode entities,
// collapse whitespace. Keeps everything in reading order — boilerplate
// trimming happens separately (stripBoilerplate) so this stays a dumb,
// reliable fallback even if the boilerplate markers below drift.
export function htmlToText(html) {
  const noScripts = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const withBreaks = noScripts.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripped).replace(/[ \t]+/g, ' ').replace(/\n[ \t]*\n[\s]*/g, '\n\n').trim();
}

// Fed press-release/minutes pages carry a shared header ("Federal Reserve
// Board -", nav links, "Share", print/accessibility widgets) and footer
// (related-materials links, "Last update"). Trims from the first recognizable
// content marker to the last, best-effort — falls back to the full text
// untouched if neither marker is found (better a noisy transcript than a
// silently empty one).
export function stripBoilerplate(text) {
  const startMarkers = [/For (?:immediate|release)[^\n]*\n/i, /^\s*For release/im];
  const endMarkers = [/\bLast [Uu]pdate[d]?:.*/s, /\bBack to (?:Press Releases|Home)\b.*/is];
  let out = text;
  for (const m of startMarkers) { const idx = out.search(m); if (idx > 0) { out = out.slice(idx); break; } }
  for (const m of endMarkers) { const match = out.match(m); if (match && match.index > 200) { out = out.slice(0, match.index); break; } }
  return out.trim();
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

// { ok, notYetPublished, text, url } — text is null unless ok:true.
export async function fetchStatement(dateStr) {
  const url = statementUrl(dateStr);
  const r = await fetchText(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(r.raw)) };
}

export async function fetchImplementationNote(dateStr) {
  const url = implementationNoteUrl(dateStr);
  const r = await fetchText(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(r.raw)) };
}

export async function fetchMinutes(dateStr) {
  const url = minutesUrl(dateStr);
  const r = await fetchText(url);
  if (!r.ok) return { ...r, url, text: null };
  return { ok: true, url, text: stripBoilerplate(htmlToText(r.raw)) };
}

// PDF text extraction. pdf-parse's top-level index.js runs a debug branch
// that tries to read a bundled test fixture whenever `module.parent` is
// unset — which ESM dynamic import triggers even when this is NOT the
// entrypoint, crashing on a missing file. Importing the inner module
// directly skips that branch entirely.
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

export async function fetchSep(dateStr) {
  const url = sepPdfUrl(dateStr);
  const r = await fetchBuffer(url);
  if (!r.ok) return { ...r, url, text: null };
  const parsed = await pdfParse(r.buffer);
  return { ok: true, url, text: parsed.text.trim(), pages: parsed.numpages };
}

// kind → fetcher, so callers (server.js scheduler) can dispatch generically
// off js/fomcCalendar.js's `pendingAsOf()` output.
export const FETCHERS = {
  statement: fetchStatement,
  transcript: fetchTranscript,
  minutes: fetchMinutes,
  sep: fetchSep,
};

// Vote/dissent line extraction — the statement's final paragraph reads like
// "The vote for this action was 9 to 3. Voting against ... were X, Y, Z, who
// preferred ...". This is a distinct, high-signal input the sentiment prompt
// gets as structured data rather than asking the model to re-find it in prose.
export function extractVote(statementText) {
  const voteMatch = statementText.match(/vote[^.]*?was\s+(\d+)\s*(?:to|-)\s*(\d+)/i);
  if (!voteMatch) return null;
  // Dissenter names routinely contain periods of their own (middle initials —
  // "Beth M. Hammack"), so the name list can't be captured with a
  // stop-at-first-period pattern; anchor on the Fed's stable template phrase
  // "who preferred ..." instead, which always follows the name list.
  const dissentMatch = statementText.match(/[Vv]oting against[^.]*?(?:were|was)\s+([\s\S]+?)\s*,?\s*who preferred\s+([\s\S]+?)\./);
  const dissenters = dissentMatch
    ? dissentMatch[1].replace(/\band\b/gi, ',').split(',').map(s => s.trim()).filter(Boolean)
    : [];
  return {
    for: parseInt(voteMatch[1], 10),
    against: parseInt(voteMatch[2], 10),
    dissenters,
    dissentReason: dissentMatch ? `preferred ${dissentMatch[2].trim()}.` : null,
  };
}
