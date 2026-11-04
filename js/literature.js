/**
 * The research pod's literature desk (plans/DESK_ANALYST_PIPELINE.md §9ah). The researchers go to the scholarly web
 * themselves: they search arXiv, OpenAlex, Semantic Scholar and Crossref (all keyless), read the open-access papers
 * (arXiv HTML first, else the PDF), write structured notes on each one, keep a paper library, and write a dossier on
 * a hypothesis: the evidence for and against with citations, what is unknown, how it could be tested on this repo's
 * data, a verdict, and testable proposals in the research pod's proposal shape.
 *
 * This module is pure: URL builders, response parsers, id normalisation and dedupe, ranking, text extraction from
 * arXiv HTML and pdf-parse output, reference identification, the paper library, and the validators for the model's
 * replies (search queries, paper notes, dossiers). The server does the fetching (with timeouts) and the model calls.
 *
 * Tested in js/literature.test.mjs against saved API responses (tests/fixtures/literature/).
 */
import { validateProposals, slug } from './researchPod.js';

export const LIT_API = {
  arxiv: 'https://export.arxiv.org/api/query',
  openalex: 'https://api.openalex.org/works',
  s2: 'https://api.semanticscholar.org/graph/v1/paper/search',
  crossref: 'https://api.crossref.org/works',
};
export const LIT_SOURCES = [
  { id: 'arxiv', label: 'arXiv', note: 'preprints; full text as HTML or PDF' },
  { id: 'openalex', label: 'OpenAlex', note: 'journals, working papers, citations, open-access links' },
  { id: 's2', label: 'Semantic Scholar', note: 'citations and open-access PDFs; keyless calls are rate limited' },
  { id: 'crossref', label: 'Crossref', note: 'DOI metadata, often with abstracts (SSRN, NBER)' },
];
export const LIT_HOSTS = ['export.arxiv.org', 'arxiv.org', 'api.openalex.org', 'api.semanticscholar.org', 'api.crossref.org', 'doi.org', 'papers.ssrn.com'];

/**
 * What each researcher reads about when nobody has asked a question (the weekly scan). One topic per lens is
 * searched each week, rotating, so the library grows across the lens's whole field over a few months.
 */
export const LENS_INTERESTS = {
  quant: ['currency carry trade crash risk', 'FX time-series momentum', 'cross-sectional currency momentum', 'volatility risk premium FX options',
    'currency value real exchange rate factor', 'intraday seasonality foreign exchange returns', 'regime switching volatility forecasting', 'statistical arbitrage cointegration currencies',
    'machine learning return predictability out-of-sample', 'realized volatility forecasting HAR'],
  macro: ['monetary policy surprises exchange rates', 'uncovered interest parity forward premium puzzle', 'central bank communication market reaction', 'yield curve slope currency returns',
    'terms of trade commodity currencies', 'dollar funding cross-currency basis', 'macroeconomic announcements high-frequency FX', 'global financial cycle risk appetite currencies',
    'purchasing power parity half-life', 'term premium bond returns predictability'],
  flow: ['retail traders foreign exchange performance', 'order flow exchange rates', 'CFTC positioning currency futures returns', 'dealer gamma options hedging price dynamics',
    'stop-loss clustering round numbers', 'investor attention trading behaviour', 'crowded trades unwinding', 'fixing price manipulation London 4pm',
    'option expiry pinning', 'disposition effect retail investors'],
};

// ── ids and small helpers ──────────────────────────────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', minus: '−' };
export const decode = s => String(s ?? '').replace(/&([#a-z0-9]+);/gi, (m, e) => {
  const k = e.toLowerCase(); if (ENT[k] != null) return ENT[k];
  if (k[0] === '#') { const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
  return m; });
const squash = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const cleanTags = s => squash(decode(String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')));
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const num = v => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);

const ARXIV_NEW = /(\d{4}\.\d{4,5})(?:v\d+)?/;
const ARXIV_OLD = /([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/;
/** A bare arXiv id from an id, abs/pdf/html URL or a 10.48550 DOI; version stripped. null if none. */
export function arxivIdOf(s) {
  const t = String(s ?? '').trim();
  const d = t.match(/10\.48550\/arxiv\.([^\s?#]+)/i); if (d) return arxivIdOf(d[1]);
  const u = t.match(/arxiv\.org\/(?:abs|pdf|html)\/([^\s?#]+?)(?:\.pdf)?(?:[?#]|$)/i); const x = u ? u[1] : t.replace(/^arxiv:\s*/i, '');
  const m = x.match(new RegExp(`^${ARXIV_NEW.source}$`)) ?? x.match(new RegExp(`^${ARXIV_OLD.source}$`));
  return m ? m[1] : null;
}
/** A DOI (lowercased, no prefix) from a DOI, doi: string or doi.org URL. null if none. */
export function doiOf(s) {
  const m = String(s ?? '').trim().match(/(?:doi\.org\/|doi:\s*|^)(10\.\d{4,9}\/[^\s"<>]+)/i);
  return m ? decodeURIComponent(m[1]).replace(/[.,;)\]]+$/, '').toLowerCase() : null;
}
/** A short stable hash (FNV-1a, hex) so pasted text and bare URLs get an id without crypto. */
export function hash(s) { let h = 0x811c9dc5; for (const c of String(s ?? '')) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
const titleKey = t => `t:${slug(t).slice(0, 80)}`;

/** Every key a record can be matched on: arxiv:, doi:, and its title. */
export function keysOf(r) {
  const k = [];
  if (r.arxiv) k.push(`arxiv:${r.arxiv}`);
  if (r.doi) { k.push(`doi:${r.doi}`); const a = arxivIdOf(r.doi); if (a) k.push(`arxiv:${a}`); }
  if (r.title && slug(r.title).length > 12) k.push(titleKey(r.title));
  if (r.ssrn) k.push(`ssrn:${r.ssrn}`);
  return [...new Set(k)];
}
/** The record's id: the arXiv id if it has one, else the DOI, else the SSRN id, else its title, else its URL. */
export function idOf(r) {
  const a = r.arxiv ?? arxivIdOf(r.doi ?? '');
  if (a) return `arxiv:${a}`;
  if (r.doi) return `doi:${r.doi}`;
  if (r.ssrn) return `ssrn:${r.ssrn}`;
  if (r.title && slug(r.title).length > 12) return titleKey(r.title);
  return `url:${hash(r.url ?? r.title ?? '')}`;
}

/** One normalised record. Every parser goes through this. */
export function record(o) {
  const r = {
    title: squash(o.title).slice(0, 300), authors: (o.authors ?? []).map(squash).filter(Boolean).slice(0, 12), year: num(o.year), venue: squash(o.venue).slice(0, 160) || null,
    abstract: squash(o.abstract).replace(/^abstract\b[\s:.\-–—]*/i, '').slice(0, 4000) || null, url: o.url || null, pdfUrl: o.pdfUrl || null, htmlUrl: o.htmlUrl || null, oaUrl: o.oaUrl || null,
    citations: num(o.citations), source: o.source, sources: [o.source], doi: o.doi ? doiOf(o.doi) : null, arxiv: o.arxiv ?? null, ssrn: o.ssrn ?? null, oa: !!(o.oa || o.pdfUrl || o.arxiv),
  };
  if (!r.arxiv && r.doi) r.arxiv = arxivIdOf(r.doi);
  if (!r.ssrn && r.doi) { const m = r.doi.match(/^10\.2139\/ssrn\.(\d+)$/); if (m) r.ssrn = m[1]; }
  if (r.arxiv) { r.pdfUrl ??= `https://arxiv.org/pdf/${r.arxiv}`; r.htmlUrl ??= `https://arxiv.org/html/${r.arxiv}`; r.url ??= `https://arxiv.org/abs/${r.arxiv}`; r.oa = true; }
  if (!r.url && r.doi) r.url = `https://doi.org/${r.doi}`;
  r.id = idOf(r); r.keys = keysOf(r);
  return r;
}

// ── search URLs ─────────────────────────────────────────────────────────────────────────────────────────────────────
const STOP = new Set('a an the of in on for and or to with by from at as is are be into its their this that these those using via under over vs versus do does what how why when which than more less new evidence test whether can will would'.split(' '));
export const terms = q => [...new Set(String(q ?? '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))];

/**
 * arXiv search_query: the first three content words, each anywhere (all:), q-fin / econ / stat.AP only when `finance`
 * is set. arXiv ANDs every term, so a long query finds almost nothing; three words and the ranking afterwards work.
 */
export function arxivQuery(q, { finance = true } = {}) {
  const t = terms(q).slice(0, 3); if (!t.length) return null;
  const body = t.map(w => `all:${w}`).join(' AND ');
  return finance ? `(${body}) AND (cat:q-fin.* OR cat:econ.* OR cat:stat.AP)` : body;
}
/** The search URL for each source. opts: { max, mailto, openalexKey }. */
export function searchUrls(q, { max = 10, mailto = '', openalexKey = '' } = {}) {
  const e = encodeURIComponent, aq = arxivQuery(q);
  return {
    arxiv: aq ? `${LIT_API.arxiv}?search_query=${e(aq)}&start=0&max_results=${max}&sortBy=relevance` : null,
    openalex: `${LIT_API.openalex}?search=${e(q)}&per-page=${max}&filter=type:article|preprint|report|book-chapter${mailto ? `&mailto=${e(mailto)}` : ''}${openalexKey ? `&api_key=${e(openalexKey)}` : ''}`,
    s2: `${LIT_API.s2}?query=${e(q)}&limit=${max}&fields=title,abstract,year,citationCount,externalIds,openAccessPdf,url,authors,venue`,
    crossref: `${LIT_API.crossref}?query.bibliographic=${e(q)}&rows=${max}&select=DOI,title,author,issued,container-title,abstract,is-referenced-by-count,link,URL,type${mailto ? `&mailto=${e(mailto)}` : ''}`,
  };
}
/** Lookup URLs for one known paper. */
export const lookupUrls = {
  arxiv: id => `${LIT_API.arxiv}?id_list=${encodeURIComponent(id)}`,
  openalexDoi: (doi, { mailto = '', openalexKey = '' } = {}) => `${LIT_API.openalex}/doi:${doi}${mailto || openalexKey ? '?' : ''}${mailto ? `mailto=${encodeURIComponent(mailto)}` : ''}${mailto && openalexKey ? '&' : ''}${openalexKey ? `api_key=${encodeURIComponent(openalexKey)}` : ''}`,
  crossrefDoi: doi => `${LIT_API.crossref}/${doi}`,
  ssrn: id => `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${id}`,
};

/** A one-line reason for a failed API call: rate limits and blocks named, so the job's errors read plainly. */
export function apiError(source, status, body = '') {
  const b = String(body ?? '');
  if (status === 429 || /rate limit|too many requests/i.test(b)) return `${source}: rate limited (HTTP ${status ?? 429}); keyless budget used up, try later${source === 'openalex' ? ' or set OPENALEX_API_KEY' : source === 's2' ? ' or set S2_API_KEY' : ''}`;
  if (status === 403 || isBlockedPage(b)) return `${source}: blocked (HTTP ${status ?? 403})`;
  return `${source}: HTTP ${status}`;
}

// ── parsers: one per source, all to record() ──────────────────────────────────────────────────────────────────────
/** arXiv Atom → records. The feed's own <entry> blocks; the query echo at the top is not an entry. */
export function parseArxiv(xml) {
  const out = [];
  for (const b of String(xml ?? '').match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []) {
    const id = arxivIdOf(cleanTags(tag(b, 'id'))); const title = cleanTags(tag(b, 'title'));
    if (!id || !title || /^error$/i.test(title)) continue;
    const authors = [...b.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)].map(m => cleanTags(m[1]));
    const doi = cleanTags(tag(b, 'arxiv:doi')) || null, jref = cleanTags(tag(b, 'arxiv:journal_ref')) || null;
    out.push(record({ source: 'arxiv', arxiv: id, title, authors, year: (cleanTags(tag(b, 'published')).match(/^(\d{4})/) ?? [])[1], venue: jref ?? 'arXiv',
      abstract: cleanTags(tag(b, 'summary')), doi: doi && !arxivIdOf(doi) ? doi : null }));
  }
  return out;
}
/** OpenAlex abstract_inverted_index → the abstract text. */
export function rebuildAbstract(inv) {
  if (!inv || typeof inv !== 'object') return null;
  const words = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of Array.isArray(pos) ? pos : []) if (Number.isInteger(p) && p >= 0 && p < 20000) words[p] = w;
  const s = words.filter(x => x != null).join(' ');
  return s ? squash(s) : null;
}
/** OpenAlex: a search page ({ results }) or one work → records. */
export function parseOpenAlex(json) {
  const list = Array.isArray(json?.results) ? json.results : json?.id && json?.title ? [json] : [];
  return list.filter(w => w?.title || w?.display_name).map(w => {
    const best = w.best_oa_location ?? null, prim = w.primary_location ?? {};
    const arxivLoc = [...(w.locations ?? []), best, prim].filter(Boolean).map(l => arxivIdOf(l.landing_page_url ?? l.pdf_url ?? '')).find(Boolean);
    return record({ source: 'openalex', title: w.display_name ?? w.title, authors: (w.authorships ?? []).map(a => a?.author?.display_name),
      year: w.publication_year, venue: prim.source?.display_name ?? best?.source?.display_name ?? null, abstract: rebuildAbstract(w.abstract_inverted_index),
      doi: w.doi ?? w.ids?.doi ?? null, arxiv: arxivLoc ?? null, url: w.doi ?? prim.landing_page_url ?? w.id, pdfUrl: best?.pdf_url ?? null,
      oaUrl: w.open_access?.oa_url ?? null, oa: !!w.open_access?.is_oa, citations: w.cited_by_count });
  });
}
/** Semantic Scholar graph search ({ data }) or one paper → records. */
export function parseS2(json) {
  const list = Array.isArray(json?.data) ? json.data : json?.paperId ? [json] : [];
  return list.filter(p => p?.title).map(p => record({ source: 's2', title: p.title, authors: (p.authors ?? []).map(a => a?.name), year: p.year, venue: p.venue || null,
    abstract: p.abstract, doi: p.externalIds?.DOI ?? null, arxiv: p.externalIds?.ArXiv ? arxivIdOf(p.externalIds.ArXiv) : null, url: p.url,
    pdfUrl: p.openAccessPdf?.url || null, citations: p.citationCount }));
}
/** Crossref: a works query ({ message: { items } }) or one work ({ message }) → records. JATS tags stripped. */
export function parseCrossref(json) {
  const m = json?.message, list = Array.isArray(m?.items) ? m.items : m?.DOI ? [m] : [];
  return list.filter(w => w?.title?.[0]).map(w => {
    const pdf = (w.link ?? []).find(l => /pdf/i.test(l['content-type'] ?? '') && /^https?:/.test(l.URL ?? ''))?.URL ?? null;
    return record({ source: 'crossref', title: cleanTags(w.title[0]), authors: (w.author ?? []).map(a => [a.given, a.family].filter(Boolean).join(' ') || a.name),
      year: w.issued?.['date-parts']?.[0]?.[0] ?? w.published?.['date-parts']?.[0]?.[0], venue: w['container-title']?.[0] ?? (w.DOI?.startsWith('10.2139/ssrn') ? 'SSRN' : null),
      abstract: cleanTags(String(w.abstract ?? '').replace(/<jats:title>[\s\S]*?<\/jats:title>/gi, ' ')).replace(/\\%/g, '%'), doi: w.DOI, url: w.URL, pdfUrl: pdf, citations: w['is-referenced-by-count'] });
  });
}
export const PARSERS = { arxiv: parseArxiv, openalex: parseOpenAlex, s2: parseS2, crossref: parseCrossref };

// ── dedupe and rank ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Fold b into a: the longer abstract, the higher citation count, any PDF link, every source and key. */
export function mergeRecords(a, b) {
  const pick = (x, y) => x ?? y;
  const m = { ...a, authors: a.authors?.length ? a.authors : b.authors, year: pick(a.year, b.year), venue: a.venue && a.venue !== 'arXiv' ? a.venue : pick(b.venue, a.venue),
    abstract: (b.abstract?.length ?? 0) > (a.abstract?.length ?? 0) ? b.abstract : a.abstract, pdfUrl: pick(a.pdfUrl, b.pdfUrl), htmlUrl: pick(a.htmlUrl, b.htmlUrl), oaUrl: pick(a.oaUrl, b.oaUrl),
    citations: Math.max(a.citations ?? -1, b.citations ?? -1) >= 0 ? Math.max(a.citations ?? 0, b.citations ?? 0) : null, doi: pick(a.doi, b.doi), arxiv: pick(a.arxiv, b.arxiv), ssrn: pick(a.ssrn, b.ssrn),
    oa: a.oa || b.oa, sources: [...new Set([...(a.sources ?? []), ...(b.sources ?? [])])], hits: (a.hits ?? 1) + (b.hits ?? 1), queries: [...new Set([...(a.queries ?? []), ...(b.queries ?? [])])] };
  if (m.arxiv) { m.htmlUrl ??= `https://arxiv.org/html/${m.arxiv}`; m.pdfUrl ??= `https://arxiv.org/pdf/${m.arxiv}`; }
  m.keys = [...new Set([...(a.keys ?? []), ...(b.keys ?? []), ...keysOf(m)])];
  m.id = a.id.startsWith('t:') || a.id.startsWith('url:') ? idOf(m) : a.id;
  return m;
}
/** One record per paper across every source and query, matched on any shared key (arXiv id, DOI, title). */
export function dedupe(records) {
  const out = [];
  for (const r of records ?? []) {
    if (!r?.title) continue;
    const i = out.findIndex(x => x.keys.some(k => r.keys.includes(k)));
    if (i < 0) out.push({ ...r, hits: r.hits ?? 1, queries: r.queries ?? [] }); else out[i] = mergeRecords(out[i], r);
  }
  return out;
}
/** How well a record matches a query, 0..1: the share of the query's terms in the title (double weight) and abstract. */
export function relevance(r, q) {
  const t = terms(q); if (!t.length) return 0;
  const title = ` ${String(r.title ?? '').toLowerCase()} `, abs = ` ${String(r.abstract ?? '').toLowerCase()} `;
  let s = 0; for (const w of t) { const stem = w.length > 5 ? w.slice(0, -2) : w; s += (title.includes(stem) ? 2 : 0) + (abs.includes(stem) ? 1 : 0); }
  return +(s / (3 * t.length)).toFixed(3);
}
/**
 * Rank: relevance to the best-matching query (0.6), citations on a log scale (0.2, 1000 cites = full), recency over
 * 30 years (0.1), found by more than one query or source (0.05), readable in full (0.05).
 */
export function rankPapers(records, queries, { year = new Date().getUTCFullYear() } = {}) {
  const qs = (Array.isArray(queries) ? queries : [queries]).filter(Boolean);
  return (records ?? []).map(r => {
    const rel = Math.max(0, ...qs.map(q => relevance(r, q)));
    const cit = r.citations != null ? Math.min(1, Math.log10(1 + r.citations) / 3) : 0;
    const rec = r.year ? Math.max(0, 1 - (year - r.year) / 30) : 0.3;
    const multi = ((r.hits ?? 1) > 1 || (r.sources?.length ?? 1) > 1) ? 1 : 0;
    const score = +(0.6 * rel + 0.2 * cit + 0.1 * rec + 0.05 * multi + 0.05 * (r.oa ? 1 : 0)).toFixed(4);
    return { ...r, relevance: rel, score };
  }).sort((a, b) => b.score - a.score);
}
/** Title similarity 0..1 (shared terms over the larger set), to match a pasted title to a search hit. */
export function titleMatch(a, b) {
  const x = new Set(terms(a)), y = new Set(terms(b)); if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / Math.max(x.size, y.size);
}

// ── full text ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** HTML → plain text: scripts, styles, navigation and MathML annotations dropped (math kept as its alttext). */
export function htmlToText(html) {
  let s = String(html ?? '');
  s = s.replace(/<math\b[^>]*\balttext="([^"]*)"[^>]*>[\s\S]*?<\/math>/gi, (m, a) => ` ${decode(a)} `).replace(/<math\b[\s\S]*?<\/math>/gi, ' ');
  s = s.replace(/<(script|style|noscript|svg|nav|header|footer|button|form|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, h, t) => `\n\n${cleanTags(t)}\n`);
  s = s.replace(/<(br|\/p|\/div|\/li|\/tr|\/section|\/figcaption|\/table|\/blockquote|\/h[1-6])\b[^>]*>/gi, '\n').replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/t[dh]>/gi, '\t');
  s = decode(s.replace(/<[^>]+>/g, ''));
  return s.split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** Pages that are a block, a captcha or a login wall rather than the paper. */
export function isBlockedPage(html) {
  const s = String(html ?? '');
  return /<title>\s*(Content Blocked|Access Denied|Just a moment|Attention Required|Are you a robot|Security Check)/i.test(s) || /cf-browser-verification|captcha-container|::CLOUDFLARE_ERROR/i.test(s);
}
/** An arXiv HTML (LaTeXML) page → { title, abstract, text }: the article only, the bibliography and footer cut. */
export function arxivHtml(html) {
  const s = String(html ?? '');
  const title = cleanTags((s.match(/<h1[^>]*class="[^"]*ltx_title_document[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ?? [])[1] ?? (s.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '');
  const abstract = cleanTags((s.match(/<div[^>]*class="[^"]*ltx_abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ?? [])[1] ?? '').replace(/^Abstract\s*/i, '');
  let body = s; const a = body.search(/<article\b/i); if (a >= 0) body = body.slice(a);
  const cut = body.search(/<section[^>]*class="[^"]*ltx_bibliography|<h2[^>]*ltx_title_bibliography|Instructions for reporting errors/i); if (cut > 0) body = body.slice(0, cut);
  body = body.replace(/<figure\b[\s\S]*?<\/figure>/gi, m => (/<figcaption/i.test(m) ? `\n${cleanTags((m.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i) ?? [])[1] ?? '')}\n` : ' '));
  return { title, abstract: abstract || null, text: htmlToText(body) };
}
/** pdf-parse output → readable text: hyphenated line breaks joined, page numbers and spaced-out runs collapsed. */
export function cleanPdfText(text) {
  return String(text ?? '').replace(/\r/g, '').replace(/([a-z])-\n([a-z])/g, '$1$2').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim())
    .filter(l => l && !/^\d{1,3}$/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
const HEAD_RE = String.raw`^[ \t]*(?:\d+(?:\.\d+)*\.?|[IVX]+\.|[A-Z]\.)?[ \t]*`;
/** Where the conclusion section starts (the last heading line that names it; else a closing Discussion / Summary), or -1. */
export function findConclusion(text) {
  const last = names => { let i = -1; for (const m of String(text ?? '').matchAll(new RegExp(`${HEAD_RE}(${names})[ \t:.]*$`, 'gm'))) i = m.index; return i; };
  const c = last('Conclusions?|Concluding [Rr]emarks|Concluding [Cc]omments|Summary and [Cc]onclusions?|Discussion and [Cc]onclusions?|CONCLUSIONS?');
  return c >= 0 ? c : last('Discussion|DISCUSSION|Summary|SUMMARY|Final [Rr]emarks');
}
/** Where the references start (after `from`), or -1. */
export function findReferences(text, from = 0) {
  const re = new RegExp(`${HEAD_RE}(References|REFERENCES|Bibliography|BIBLIOGRAPHY|Works [Cc]ited)[ \t:.]*$`, 'gm');
  for (const m of String(text ?? '').matchAll(re)) if (m.index >= from) return m.index;
  return -1;
}
/**
 * What the reader is given: the first `head` characters (title, abstract, introduction, method, results), and the
 * conclusion section (up to `tail` characters) if it starts after the cut. References are never included.
 */
export function excerpt(text, { head = 25_000, tail = 6_000 } = {}) {
  let s = String(text ?? '');
  const c = findConclusion(s), r = findReferences(s, c >= 0 ? c : Math.floor(s.length * 0.5));
  if (r > 0) s = s.slice(0, r);
  if (s.length <= head) return { text: s, cut: false, conclusion: c >= 0 };
  const conc = c >= head ? s.slice(c, c + tail) : '';
  return { text: `${s.slice(0, head)}\n\n[… cut …]${conc ? `\n\n${conc}` : ''}`, cut: true, conclusion: c >= 0 };
}
/** <meta> tags on a landing page (Highwire citation_*, Dublin Core, Open Graph) → what a record needs. */
export function pageMeta(html) {
  const s = String(html ?? ''), metas = [];
  for (const m of s.matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0], name = (t.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i) ?? [])[1], content = (t.match(/\bcontent\s*=\s*["']([^"']*)["']/i) ?? [])[1];
    if (name && content != null) metas.push([name.toLowerCase(), decode(content).trim()]);
  }
  const get = (...k) => metas.find(([n, v]) => k.includes(n) && v)?.[1] ?? null;
  const date = get('citation_publication_date', 'citation_date', 'citation_online_date', 'dc.date', 'article:published_time');
  return { title: get('citation_title', 'dc.title', 'og:title') ?? (cleanTags((s.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '') || null),
    authors: metas.filter(([n]) => n === 'citation_author' || n === 'dc.creator').map(([, v]) => v).slice(0, 12),
    year: num((String(date ?? '').match(/(19|20)\d{2}/) ?? [])[0]), doi: doiOf(get('citation_doi', 'dc.identifier', 'prism.doi') ?? ''),
    pdfUrl: get('citation_pdf_url'), abstract: get('citation_abstract', 'dc.description', 'description', 'og:description'), venue: get('citation_journal_title', 'citation_publisher', 'og:site_name') };
}

/**
 * What the owner pasted → how to find it: { kind: arxiv | doi | ssrn | pdf | url | text | title, ... }.
 * SSRN ids carry their DOI (10.2139/ssrn.N), so a blocked SSRN page still resolves through OpenAlex or Crossref.
 */
export function identifyRef(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const isUrl = /^https?:\/\//i.test(s);
  if (s.length > 600 && !isUrl) return { kind: 'text', text: s.slice(0, 120_000) };
  const ss = s.match(/ssrn\.com\/[^\s]*?(?:abstract_id|abstract|abstractid)=?(\d{4,9})/i) ?? s.match(/ssrn\.com\/abstract=(\d{4,9})/i) ?? s.match(/10\.2139\/ssrn\.(\d+)/i);
  if (ss) return { kind: 'ssrn', id: ss[1], doi: `10.2139/ssrn.${ss[1]}`, url: lookupUrls.ssrn(ss[1]) };
  const ax = arxivIdOf(s); if (ax && (isUrl || /^(arxiv:)?\s*[\w./-]+$/i.test(s))) return { kind: 'arxiv', id: ax };
  const d = doiOf(s); if (d && (!isUrl || /doi\.org\//i.test(s))) return { kind: 'doi', doi: d };
  if (isUrl) return /\.pdf(?:$|[?#])|\/pdf\//i.test(s) ? { kind: 'pdf', url: s } : { kind: 'url', url: s };
  return s.length > 300 ? { kind: 'text', text: s } : { kind: 'title', title: s };
}
/** Pasted text → a record (title from its first line). */
export function textRecord(text) {
  const t = String(text ?? '').trim(), first = t.split('\n').map(x => x.trim()).find(x => x.length > 8) ?? 'Pasted text';
  const r = record({ source: 'pasted', title: first.slice(0, 200), abstract: t.slice(0, 1500) });
  r.id = `text:${hash(t)}`; r.keys = [r.id, ...r.keys];
  return r;
}
/** A PDF or page fetched by URL with no metadata → a record (title from the text's first long line). */
export function urlRecord(url, text, meta = {}) {
  const BOILER = /working paper|paper series|discussion paper|electronic copy|available at|arxiv:|ssrn|issn|doi\b|https?:|©|copyright|preprint|draft|this version|university|department|^\d/i;
  const first = String(text ?? '').split('\n').map(x => x.trim()).slice(0, 60).find(x => x.length > 12 && x.length < 220 && x.split(/\s+/).length >= 3 && !BOILER.test(x));
  const r = record({ source: 'url', title: meta.title ?? first ?? url, authors: meta.authors ?? [], year: meta.year, venue: meta.venue, abstract: meta.abstract ?? String(text ?? '').slice(0, 1500),
    doi: meta.doi, url, pdfUrl: meta.pdfUrl ?? (/\.pdf(?:$|[?#])/i.test(url) ? url : null) });
  if (!r.doi && !r.arxiv) { r.id = `url:${hash(url)}`; r.keys = [r.id, ...r.keys]; }
  return r;
}

// ── the model's replies ─────────────────────────────────────────────────────────────────────────────────────────────
const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const arr = (v, n, f) => (Array.isArray(v) ? v.slice(0, n).map(f).filter(Boolean) : []);
const one = (v, ok, d) => (ok.includes(v) ? v : d);
const asSet = x => (x instanceof Set ? x : new Set(x ?? []));

/** The librarian's reply: { restated, queries: [{ q, why }], names: [known papers or authors] }. 1..8 queries kept. */
export function validateQueries(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const seen = new Set();
  const queries = arr(obj.queries, 10, x => { const q = str(typeof x === 'string' ? x : x?.q ?? x?.query, 200); if (!q || seen.has(q.toLowerCase()) || terms(q).length < 2) return null; seen.add(q.toLowerCase()); return { q, why: str(x?.why, 200) ?? '' }; }).slice(0, 8);
  const names = arr(obj.names ?? obj.knownLiterature, 8, x => str(typeof x === 'string' ? x : x?.title, 200));
  if (!queries.length) return { ok: false, errors: ['no usable search query (each needs two or more content words)'] };
  return { ok: true, value: { restated: str(obj.restated, 600) ?? '', queries, names } };
}

export const STANCES = ['supports', 'contradicts', 'mixed', 'neutral'];
export const RELATIONS = ['confirms', 'contradicts', 'extends', 'replicates', 'uses-same-data'];
const YN = ['yes', 'no', 'partly', 'unclear'];
/**
 * The reader's reply: { notes: [ { paperId, claim, mechanism, data: { market, period, frequency }, method, effect,
 * outOfSample, costs, relevance, stance, caveats[], testHere, crossRefs: [{ paperId, relation, note }] } ] }, or one
 * note object for a single paper. A note needs a claim; paperId must be one of `ids` (a lone note takes the only id).
 * crossRefs must name a paper in `library` (ids already held) and not the paper itself.
 */
export function validatePaperNotes(obj, { ids = [], library = [] } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const want = asSet(ids), lib = asSet(library), errors = [];
  const raw = Array.isArray(obj.notes) ? obj.notes : obj.claim ? [{ paperId: [...want][0], ...obj }] : [];
  const out = [];
  for (const n of raw.slice(0, 20)) {
    const pid = str(n?.paperId, 160) ?? (want.size === 1 ? [...want][0] : null);
    if (!pid || (want.size && !want.has(pid))) { errors.push(`note for unknown paper ${pid ?? '(none)'}`); continue; }
    const claim = str(n?.claim, 700); if (!claim) { errors.push(`${pid}: no claim`); continue; }
    const d = n?.data;
    out.push({ paperId: pid, claim, mechanism: str(n?.mechanism, 600) ?? '',
      data: typeof d === 'string' ? { market: str(d, 300) ?? '', period: '', frequency: '' } : { market: str(d?.market, 300) ?? '', period: str(d?.period, 120) ?? '', frequency: str(d?.frequency, 80) ?? '' },
      method: str(n?.method, 500) ?? '', effect: str(n?.effect, 500) ?? '', outOfSample: one(n?.outOfSample, YN, 'unclear'), costs: one(n?.costs, YN, 'unclear'),
      relevance: str(n?.relevance, 600) ?? '', stance: one(n?.stance, STANCES, 'neutral'), caveats: arr(n?.caveats, 6, c => str(c, 300)), testHere: str(n?.testHere, 600) ?? '',
      crossRefs: arr(n?.crossRefs, 6, c => { const id = str(c?.paperId, 160); return id && id !== pid && lib.has(id) ? { paperId: id, relation: one(c?.relation, RELATIONS, 'extends'), note: str(c?.note, 300) ?? '' } : null; }) });
  }
  if (!out.length) return { ok: false, errors: errors.length ? errors : ['no notes'] };
  return { ok: true, value: out, errors };
}

export const VERDICTS = ['worth-testing', 'weak', 'already-tested'];
/**
 * The synthesis: { hypothesis, summary, evidenceFor: [{ point, papers }], evidenceAgainst, unknowns[], testHere:
 * { design, data[], alreadyHere[] }, verdict, verdictWhy, proposals[] (the research pod's proposal shape, each with
 * a lens and citations), questionsForOwner[] }. Citations must be papers the dossier read (`paperIds`); an evidence
 * point with no valid paper is dropped. Proposals go through validateProposals, so they enter the pod's library as is.
 */
export function validateDossier(obj, { paperIds = [], lenses = ['quant', 'macro', 'flow'] } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const ids = asSet(paperIds), notes = [];
  const pts = v => arr(v, 10, e => { const point = str(e?.point ?? e, 700); const papers = arr(e?.papers, 6, p => (ids.has(p) ? p : null)); if (!point) return null; if (!papers.length) { notes.push(`dropped an evidence point with no paper read: ${point.slice(0, 60)}`); return null; } return { point, papers }; });
  const v = { hypothesis: str(obj.hypothesis, 800), summary: str(obj.summary, 1200) ?? '', evidenceFor: pts(obj.evidenceFor), evidenceAgainst: pts(obj.evidenceAgainst),
    unknowns: arr(obj.unknowns, 8, u => str(u, 400)),
    testHere: { design: str(obj.testHere?.design ?? obj.testHere, 1200) ?? '', data: arr(obj.testHere?.data, 10, d => str(d, 160)), alreadyHere: arr(obj.testHere?.alreadyHere, 8, d => str(d, 200)) },
    verdict: VERDICTS.includes(obj.verdict) ? obj.verdict : null, verdictWhy: str(obj.verdictWhy, 800) ?? '', proposals: [], questionsForOwner: arr(obj.questionsForOwner, 4, q => str(q, 300)) };
  const miss = [];
  if (!v.hypothesis) miss.push('hypothesis');
  if (!v.verdict) miss.push(`verdict (${VERDICTS.join(' | ')})`);
  if (!v.evidenceFor.length && !v.evidenceAgainst.length) miss.push('evidence for or against that cites a paper read');
  if (miss.length) return { ok: false, errors: [`missing: ${miss.join(', ')}`, ...notes] };
  for (const p of Array.isArray(obj.proposals) ? obj.proposals.slice(0, 3) : []) {
    const lens = lenses.includes(p?.lens) ? p.lens : lenses[0];
    const r = validateProposals({ proposals: [p] }, lens, { paperIds: ids });
    if (r.ok) { v.proposals.push(...r.value.proposals); notes.push(...r.notes); } else notes.push(`proposal "${String(p?.title ?? '').slice(0, 60)}" dropped: ${r.errors.join('; ')}`);
  }
  return { ok: true, value: v, notes };
}

// ── the paper library ───────────────────────────────────────────────────────────────────────────────────────────────
/** The library entry that is this paper (any shared key), or null. */
export const findPaper = (lib, r) => (lib ?? []).find(p => p.id === r.id || (p.keys ?? []).some(k => (r.keys ?? [r.id]).includes(k))) ?? null;

/**
 * Merge records (and their notes) into the library. A paper already held keeps its id and first-seen date; new
 * metadata fills gaps; new notes replace old ones (the previous claim is kept in history). citedBy is unioned.
 * Each item: a record, optionally with { notes, readFrom, forHypothesis, lens }. Capped at `max`, newest first.
 */
export function mergePapers(lib, items, { at = new Date().toISOString(), max = 300 } = {}) {
  const out = [...(lib ?? [])];
  for (const it of items ?? []) {
    if (!it?.id) continue;
    const i = out.findIndex(p => p.id === it.id || (p.keys ?? []).some(k => (it.keys ?? []).includes(k)));
    const { notes, readFrom, forHypothesis, lens, text, relevance, score, hits, queries, ...meta } = it;
    const base = i >= 0 ? out[i] : { id: it.id, keys: [], firstSeen: at, citedBy: { dossiers: [], proposals: [] }, lenses: [], history: [] };
    const merged = i >= 0 ? mergeRecords({ ...base, sources: base.sources ?? [] }, { ...meta, sources: meta.sources ?? [] }) : { ...base, ...meta };
    const e = { ...base, ...merged, id: base.id, firstSeen: base.firstSeen, lastSeen: at, keys: [...new Set([...(base.keys ?? []), ...(meta.keys ?? [])])], citedBy: base.citedBy ?? { dossiers: [], proposals: [] }, lenses: [...new Set([...(base.lenses ?? []), ...(lens ? [lens] : [])])], history: base.history ?? [] };
    delete e.hits; delete e.queries; delete e.relevance; delete e.score;
    if (e.abstract) e.abstract = e.abstract.slice(0, 1500);
    if (notes) {
      if (base.notes?.claim && base.notes.claim !== notes.claim) e.history = [{ at: base.notesAt, claim: base.notes.claim, stance: base.notes.stance, forHypothesis: base.forHypothesis ?? null }, ...e.history].slice(0, 4);
      e.notes = notes; e.notesAt = at; e.readFrom = readFrom ?? e.readFrom ?? 'abstract'; e.forHypothesis = forHypothesis ?? null;
    }
    if (i >= 0) out[i] = e; else out.unshift(e);
  }
  return out.sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, max);
}
/** Record that a dossier and/or proposals cite these papers. */
export function addCitations(lib, paperIds, { dossier = null, proposals = [] } = {}) {
  const want = asSet(paperIds);
  return (lib ?? []).map(p => {
    if (!want.has(p.id)) return p;
    const c = p.citedBy ?? { dossiers: [], proposals: [] };
    return { ...p, citedBy: { dossiers: [...new Set([...(c.dossiers ?? []), ...(dossier ? [dossier] : [])])].slice(-20), proposals: [...new Set([...(c.proposals ?? []), ...proposals])].slice(-30) } };
  });
}
/** The papers to read now: the top `total` by rank, those already read (notes held) reused, the first `fullText` with an open copy read in full. */
export function readingPlan(ranked, lib, { total = 16, fullText = 7 } = {}) {
  const plan = { full: [], abstract: [], reuse: [] };
  for (const r of (ranked ?? []).slice(0, total)) {
    const held = findPaper(lib, r);
    if (held?.notes) { plan.reuse.push({ ...r, id: held.id, notes: held.notes, readFrom: held.readFrom }); continue; }
    if (plan.full.length < fullText && (r.arxiv || r.pdfUrl || r.oaUrl)) plan.full.push(r); else if (r.abstract) plan.abstract.push(r);
  }
  return plan;
}
/** One paper's notes as a prompt line block. */
export function noteLine(p) {
  const n = p.notes ?? {};
  const head = `- [${p.id}] ${p.title}${p.authors?.length ? ` (${p.authors.slice(0, 3).join(', ')}${p.authors.length > 3 ? ' et al.' : ''}` : ' ('}${p.year ? `, ${p.year}` : ''}${p.venue ? `, ${p.venue}` : ''}${p.citations != null ? `, ${p.citations} cites` : ''}) read from ${p.readFrom ?? 'abstract'}`;
  if (!n.claim) return `${head}\n  abstract: ${String(p.abstract ?? '').slice(0, 400)}`;
  const xr = (n.crossRefs ?? []).map(c => `${c.relation} ${c.paperId}`).join(', ');
  return `${head}\n  claim: ${n.claim}${n.mechanism ? `\n  mechanism: ${n.mechanism}` : ''}\n  data: ${[n.data?.market, n.data?.period, n.data?.frequency].filter(Boolean).join('; ') || '?'} · method: ${n.method || '?'}\n  effect: ${n.effect || '?'} · out of sample: ${n.outOfSample} · costs: ${n.costs}${n.stance && n.stance !== 'neutral' ? ` · ${n.stance}${p.forHypothesis ? ` "${String(p.forHypothesis).slice(0, 80)}"` : ''}` : ''}${n.caveats?.length ? `\n  caveats: ${n.caveats.join('; ')}` : ''}${xr ? `\n  cross-refs: ${xr}` : ''}`;
}
/** The library as prompt text: papers with notes first, those touching `lens` and `query` ranked up, at most `max`. */
export function libraryText(lib, { lens = null, query = '', max = 25 } = {}) {
  const L = (lib ?? []).filter(p => p.notes?.claim || p.abstract);
  if (!L.length) return '(the paper library is empty)';
  const sc = p => (p.notes?.claim ? 2 : 0) + (lens && p.lenses?.includes(lens) ? 1 : 0) + (query ? 3 * relevance(p, query) : 0) + (p.citedBy?.proposals?.length ? 0.5 : 0);
  return [...L].sort((a, b) => sc(b) - sc(a) || String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, max).map(noteLine).join('\n');
}
/** A short id + title + claim list, for the reader's cross-referencing. */
export const libraryIndex = (lib, { max = 40, query = '' } = {}) => {
  const L = (lib ?? []).filter(p => p.notes?.claim);
  return L.sort((a, b) => (query ? relevance(b, query) - relevance(a, query) : 0)).slice(0, max).map(p => `- [${p.id}] ${p.title} (${p.year ?? '?'}): ${p.notes.claim.slice(0, 220)}`).join('\n') || '(none yet)';
};
/** The paper as the reader sees it: metadata, then the full-text excerpt or the abstract. */
export function paperForReader(r, text = null) {
  return `### [${r.id}] ${r.title}\n${[r.authors?.slice(0, 6).join(', '), r.year, r.venue, r.citations != null ? `${r.citations} citations` : null].filter(Boolean).join(' · ')}\n${r.url ?? ''}\n${text ? `FULL TEXT (excerpt):\n${text}` : `ABSTRACT ONLY:\n${r.abstract ?? '(no abstract)'}`}`;
}
/** The rotating weekly topic for a lens (ISO week number mod the list). */
export function weeklyTopic(lens, date = new Date()) {
  const list = LENS_INTERESTS[lens] ?? []; if (!list.length) return null;
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const week = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  return list[week % list.length];
}
/** arXiv RSS/Atom items (from js/researchPod.js parseFeed) → records, so the weekly arXiv read can be ranked and read. */
export const feedRecords = items => (items ?? []).map(i => { const id = arxivIdOf(i.link); return id ? record({ source: 'arxiv', arxiv: id, title: i.title, abstract: i.summary, year: (String(i.date).match(/(19|20)\d{2}/) ?? [])[0] }) : null; }).filter(Boolean);

/** The dossier list row (what GET /api/research-pod/dossiers returns per dossier). */
export const dossierSummary = d => ({ id: d.id, kind: d.kind, at: d.at, hypothesis: d.hypothesis, ref: d.ref ?? null, verdict: d.dossier?.verdict ?? null, headline: d.dossier?.summary?.slice(0, 240) ?? null,
  papers: d.papers?.length ?? 0, read: d.read ?? null, proposals: d.dossier?.proposals?.length ?? 0, errors: (d.errors ?? []).length, ok: !!d.dossier });
