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
// The Fed publishes an "accessible version" of the SEP alongside the PDF —
// built for screen readers, which in practice means real semantic <table>
// markup instead of PDF layout text. The dot plot and the GDP/unemployment/
// inflation projections ARE tables; extracting them from this page (see
// extractTables/tablesToMarkdown below) is far more reliable than pulling
// numbers back out of PDF text where column alignment is lost.
export function sepAccessibleUrl(dateStr) {
  return `https://www.federalreserve.gov/monetarypolicy/fomcprojtabl${yyyymmdd(dateStr)}.htm`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–' };
export function decodeEntities(s) {
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

// Generic HTML <table> extractor — deliberately does NOT assume anything
// about row/column semantics (which SEP row is "median" vs "range", which
// column is which year). Those labels live IN the cells the Fed's own
// accessible markup already provides, and hardcoding a guess at the exact
// real structure (unverifiable from this sandbox — see the fetch-module
// header note) risks silently misreporting a number, which for a policy-rate
// table is a much worse failure than a slightly noisy transcript excerpt.
// Faithfully preserving the grid and handing it to the model with its own
// labels intact is the honest tradeoff.
export function extractTables(html) {
  const tables = [];
  for (const tMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [];
    for (const rMatch of tMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const cMatch of rMatch[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)) {
        cells.push(decodeEntities(cMatch[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

// Tables → a clean, LLM-readable text block (markdown-style pipes). Ragged
// rows are padded to the widest row in that table so columns still line up
// for a reader even when a table has occasional merged/short rows.
export function tablesToMarkdown(tables) {
  return tables.map((rows, i) => {
    const width = Math.max(...rows.map(r => r.length));
    const lines = rows.map(r => '| ' + Array.from({ length: width }, (_, c) => r[c] ?? '').join(' | ') + ' |');
    if (rows.length) lines.splice(1, 0, '|' + ' --- |'.repeat(width));
    return `Table ${i + 1}:\n${lines.join('\n')}`;
  }).join('\n\n');
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

// Accessible HTML table version first (real <table> markup, numbers stay
// aligned with their row/column labels) — falls back to the PDF only if the
// accessible page isn't there, on the theory that garbled-but-present beats
// nothing if the Fed ever drops the accessible version for a given meeting.
export async function fetchSep(dateStr) {
  const htmlUrl = sepAccessibleUrl(dateStr);
  const htmlRes = await fetchText(htmlUrl);
  if (htmlRes.ok) {
    const tables = extractTables(htmlRes.raw);
    if (tables.length) {
      return { ok: true, url: htmlUrl, text: tablesToMarkdown(tables), tableCount: tables.length, format: 'table' };
    }
    // Page loaded but had no <table> elements — treat it as text, not tables.
    return { ok: true, url: htmlUrl, text: stripBoilerplate(htmlToText(htmlRes.raw)), format: 'text' };
  }
  // Accessible HTML wasn't there (404) or errored — fall back to the PDF
  // rather than reporting the whole SEP as unavailable.
  const pdfUrl = sepPdfUrl(dateStr);
  const r = await fetchBuffer(pdfUrl);
  if (!r.ok) return { ...r, url: pdfUrl, text: null };
  const parsed = await pdfParse(r.buffer);
  return { ok: true, url: pdfUrl, text: parsed.text.trim(), pages: parsed.numpages, format: 'pdf' };
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
