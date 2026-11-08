/**
 * Paper Library index (owner request 2026-11-08): a high-level index of every held paper, so the research agents can scan it
 * quickly and find what they need, and retrieval that puts the best few papers' notes in front of the researchers, with citations.
 *
 * PURE and rule-based: no model call, no network, no clock (pass `now`). Two tiers.
 *   Tier 1  buildIndex(papers, opts)  -> { v, sig, n, rows:[Row], vec, df, N }       one compact row per paper (~60-90 tokens)
 *           search(index, query, opts) -> [{ ...row, score, why }]                     TF-IDF-like ranking, deterministic
 *           indexStats(index)         -> totals (rows, read, tokens per row, by source / evidence / market)
 *   Tier 2  digest(paper, { maxChars, figNotes })      -> one paper's notes as a compact text block (<= ~900 chars)
 *           buildContext(query, index, papers, opts)   -> { text, ids, rows }            numbered '[P1] ...' list for a prompt
 *
 * Row = { id, t (title <=110), y, src (source key), tg (topic keys), c (claim <=180), ev ('oos'|'in-sample'|'partly'|'survey'|'unknown'),
 *         co (1 when the study nets costs), m (fx|rates|equity|commodity|vol|options|crypto|multi|unknown), me (method <=60),
 *         ef (effect <=80), tx (what to test here <=140), cs (desk entries + proposals that cite it), vd (our own verdicts) }.
 * Long rows are trimmed to ROW_BUDGET characters (about 90 tokens). `vec` (term -> weight, top terms per paper) and `df` are built once
 * per build and stay out of the rows the API returns. Nothing here stores paper text: only the desk's own notes are used.
 */
import { tokens, stem, autoTags, TOPICS } from './paperCatalog.js';

export const INDEX_VERSION = 1;
export const LIMITS = { t: 110, c: 180, me: 60, ef: 80, tx: 140 };
export const ROW_BUDGET = 400;          // characters of JSON per row (~100 tokens at 4 chars per token); long rows are trimmed to it
export const MAX_TERMS = 48;            // weighted terms kept per paper
const FIELD_W = { title: 3, claim: 2, topics: 2, testHere: 1.2, mechanism: 1, relevance: 1, method: 0.8, data: 0.8, effect: 0.6 };
export const EVIDENCE = ['oos', 'in-sample', 'partly', 'survey', 'unknown'];
export const MARKETS = ['fx', 'rates', 'equity', 'commodity', 'vol', 'options', 'crypto', 'multi', 'unknown'];

const str = v => (v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.map(str).join(' ') : typeof v === 'object' ? Object.values(v).map(str).join(' ') : String(v));
const clean = v => str(v).replace(/\s+/g, ' ').trim();
/** Cut at a word boundary with an ellipsis; text that fits is returned as is. */
export function cut(s, n) {
  s = clean(s); if (s.length <= n) return s;
  const k = s.lastIndexOf(' ', n - 1); return `${s.slice(0, k > n * 0.6 ? k : n - 1).replace(/[\s,;:.\-–]+$/, '')}…`;
}

// ── evidence and market hints ─────────────────────────────────────────────────────────────────────────────────

const SURVEY = /\b(survey|literature review|review of the literature|overview|a review\b|handbook|primer)\b/i;
/** 'oos' | 'in-sample' | 'partly' | 'survey' | 'unknown' from the desk's note (outOfSample: yes|no|partly|unclear) and the title. */
export function evidenceOf(paper) {
  const n = paper?.notes && typeof paper.notes === 'object' ? paper.notes : null, o = String(n?.outOfSample ?? '').toLowerCase();
  if (o === 'yes') return 'oos';
  if (SURVEY.test(String(paper?.title ?? '')) || paper?.kind === 'survey') return 'survey';
  if (o === 'partly') return 'partly';
  if (o === 'no') return 'in-sample';
  return 'unknown';
}
const costsOf = paper => (String(paper?.notes?.costs ?? '').toLowerCase() === 'yes' ? 1 : 0);

const MKT = {
  fx: /\b(fx|forex|currenc\w*|exchange rates?|eurusd|usdjpy|gbpusd|audusd|usdcad|dollar|yen|euro|sterling|carry trades?|g10)\b/gi,
  rates: /\b(yields?|treasur\w*|bonds?|fomc|interest rates?|fed funds|swaps?|yield curve|term premium|duration|central bank\w*|monetary policy)\b/gi,
  equity: /\b(equit\w*|stocks?|s&p|spx|nasdaq|index futures|shares|cross-section of returns|dax|nikkei)\b/gi,
  commodity: /\b(commodit\w*|gold|oil|crude|metals?|copper|futures curve|agricultur\w*)\b/gi,
  vol: /\b(volatilit\w*|vix|realized variance|realised variance|garch|har-rv|variance risk)\b/gi,
  options: /\b(options?|gamma|dealer|strikes?|implied vol\w*|black-scholes|straddles?|skew|0dte)\b/gi,
  crypto: /\b(crypto\w*|bitcoin|ethereum|btc)\b/gi,
};
/** A market hint for the paper: the data note counts triple. 'multi' when two families are close, 'unknown' when none fires. */
export function marketOf(paper, tagKeys = []) {
  const n = paper?.notes && typeof paper.notes === 'object' ? paper.notes : {};
  const data = clean(n.data), rest = clean([paper?.title, n.claim, n.method].join(' '));
  const score = {};
  for (const [k, re] of Object.entries(MKT)) { const a = (data.match(re) ?? []).length * 3, b = (rest.match(re) ?? []).length; if (a + b) score[k] = a + b; }
  if (tagKeys.includes('fx')) score.fx = (score.fx ?? 0) + 1;
  if (tagKeys.includes('options')) score.options = (score.options ?? 0) + 1;
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return 'unknown';
  if (ranked.length > 1 && ranked[1][1] >= ranked[0][1] * 0.7) return 'multi';
  return ranked[0][0];
}

// ── rows ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Trim a row to the budget by shortening the long free-text fields in turn (never the id, year, topics or flags). */
function fit(row, budget) {
  const order = [['ef', 48], ['me', 40], ['tx', 100], ['c', 140], ['t', 84], ['tx', 70], ['ef', 30], ['c', 110], ['me', 28], ['tx', 44], ['t', 64], ['c', 80]];
  for (const [k, min] of order) {
    if (JSON.stringify(row).length <= budget) break;
    if (row[k] && row[k].length > min) row[k] = cut(row[k], min);
  }
  return row;
}

/** One compact index row from a catalog Paper (js/paperCatalog.js joinCatalog). Missing notes -> a title-only row. */
export function rowOf(p, { cites = 0, budget = ROW_BUDGET } = {}) {
  const n = p?.notes && typeof p.notes === 'object' ? p.notes : null, tg = (p?.tags ?? []).map(t => (typeof t === 'string' ? t : t?.key)).filter(Boolean);
  const verdicts = [...new Set((p?.desk ?? []).map(d => d?.verdict).filter(Boolean))].slice(0, 3);
  const row = { id: p.id, t: cut(p.title ?? p.id, LIMITS.t), y: Number.isInteger(Number(p.year)) && Number(p.year) > 1000 ? Number(p.year) : null, src: p.source?.key ?? 'other', tg };
  const claim = clean(n?.claim); if (claim) row.c = cut(claim, LIMITS.c);
  row.ev = evidenceOf(p); const co = costsOf(p); if (co) row.co = 1;
  row.m = marketOf(p, tg);
  const me = clean(n?.method); if (me) row.me = cut(me, LIMITS.me);
  const ef = clean(n?.effect); if (ef) row.ef = cut(ef, LIMITS.ef);
  const tx = clean(n?.testHere); if (tx) row.tx = cut(tx, LIMITS.tx);
  row.cs = (p.desk?.length ?? 0) + cites;
  if (verdicts.length) row.vd = verdicts;
  return fit(row, budget);
}

const termsOf = s => tokens(s).map(stem);
/** term -> weight for one paper: field weight x (1 + ln count) summed over title, claim, topics, testHere, mechanism, relevance, ... */
function vectorOf(p, tagKeys) {
  const n = p?.notes && typeof p.notes === 'object' ? p.notes : {}, w = new Map();
  const add = (text, fw) => { const c = new Map(); for (const t of termsOf(text)) c.set(t, (c.get(t) ?? 0) + 1); for (const [t, k] of c) w.set(t, (w.get(t) ?? 0) + fw * (1 + Math.log(k))); };
  add(p.title, FIELD_W.title); add(n.claim, FIELD_W.claim);
  add(tagKeys.map(k => `${k} ${TOPICS.find(t => t.key === k)?.label ?? ''}`).join(' '), FIELD_W.topics);
  for (const k of ['testHere', 'mechanism', 'relevance', 'method', 'data', 'effect']) add(str(n[k]), FIELD_W[k]);
  return [...w].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_TERMS).map(([t, x]) => [t, Math.round(x * 100) / 100]);
}

/** FNV-1a over the strings that decide the index; the cache is rebuilt when it changes. */
export function catalogSig(papers) {
  let h = 0x811c9dc5;
  const feed = s => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
  for (const p of [...(papers ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) feed(`${p.id}|${p.title}|${p.year}|${p.source?.key}|${(p.tags ?? []).map(t => t.key ?? t).join(',')}|${JSON.stringify(p.notes ?? null)}|${(p.desk ?? []).map(d => `${d.id}:${d.verdict}`).join(',')}|${p.citedBy?.proposals?.length ?? 0}\n`);
  return `${INDEX_VERSION}-${(papers ?? []).length}-${h.toString(36)}`;
}

/**
 * The index. `papers`: catalog Papers (may carry `citedBy:{proposals:[]}` from the raw paper record); `cites`: optional Map/object id -> extra count.
 * Rows sort by id so the output is stable. Deterministic: same input, same JSON.
 */
export function buildIndex(papers = [], { cites = null, budget = ROW_BUDGET, at = null } = {}) {
  const list = [...(papers ?? [])].filter(p => p?.id).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const extra = id => (cites instanceof Map ? cites.get(id) : cites?.[id]) ?? 0;
  const rows = [], vec = {}, df = {};
  for (const p of list) {
    const r = rowOf(p, { cites: extra(p.id) + (p.citedBy?.proposals?.length ?? 0), budget });
    rows.push(r);
    const v = vectorOf(p, r.tg); vec[p.id] = v;
    for (const [t] of v) df[t] = (df[t] ?? 0) + 1;
  }
  return { v: INDEX_VERSION, sig: catalogSig(list), at, n: rows.length, rows, vec, df, N: rows.length };
}

/** A copy for the API: rows and stats only, without the retrieval vectors. */
export const publicIndex = ix => ({ at: ix.at, sig: ix.sig, rows: ix.rows, stats: indexStats(ix) });
/** Quick shape check for an index loaded from the cache. */
export const validIndex = (ix, sig = null) => !!ix && ix.v === INDEX_VERSION && Array.isArray(ix.rows) && ix.vec && ix.df && (sig == null || ix.sig === sig);

const tokensEst = s => Math.ceil(s.length / 4);
/** Totals: rows, read (with a claim), tokens per row (estimate, 4 chars per token), counts by source / evidence / market / topic. */
export function indexStats(ix) {
  const rows = ix?.rows ?? [], by = key => rows.reduce((a, r) => { const k = r[key] ?? 'unknown'; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const sizes = rows.map(r => tokensEst(JSON.stringify(r))), total = sizes.reduce((a, b) => a + b, 0);
  const topics = {}; for (const r of rows) for (const k of r.tg) topics[k] = (topics[k] ?? 0) + 1;
  return { rows: rows.length, read: rows.filter(r => r.c).length, withVerdict: rows.filter(r => r.vd).length, tokens: total, tokensPerRow: rows.length ? Math.round((total / rows.length) * 10) / 10 : 0,
    maxTokensPerRow: Math.max(0, ...sizes), bySource: by('src'), byEvidence: by('ev'), byMarket: by('m'), byTopic: topics };
}

// ── search ────────────────────────────────────────────────────────────────────────────────────────────────────

const MATHS_Q = /\b(model|models|equation|equations|formula|closed[- ]form|derive|derivation|stochastic|sde|process|heston|garch|proof|theorem|calibrat\w*)\b/i;
const MATHS_TOPIC = new Set(['brownian', 'jump']);
/** Years filter: array of '2019' | '2015-2020' | '2015-' | '-2010' | 'unknown' (strings or numbers). */
function yearOk(y, years) {
  if (!years?.length) return true;
  return years.some(s => {
    s = String(s).trim(); if (s === 'unknown') return y == null;
    if (y == null) return false;
    const m = s.match(/^(\d{4})?\s*-\s*(\d{4})?$/); if (m) return (!m[1] || y >= +m[1]) && (!m[2] || y <= +m[2]);
    return /^\d{4}$/.test(s) && y === +s;
  });
}
const idfOf = (ix, t) => { const d = ix.df[t] ?? 0; return Math.log(1 + (ix.N - d + 0.5) / (d + 0.5)); };

/**
 * Ranked rows for a query: sum over query terms of idf x saturated paper weight, + a topic match bonus. Boosts: a held note with
 * out-of-sample evidence x1.15 (x1.05 more when costs are netted), our own verdicts x1.08, rows with no notes x0.7, arXiv / maths-heavy
 * rows x1.1 ONLY when the query talks about a model or equation. Ties: score, then newer year, then id. `why`: matched terms and topics.
 * opts: { n=8, topics, sources, years, requireNotes, minScore=0 }
 */
export function search(ix, query, { n = 8, topics = [], sources = [], years = [], requireNotes = false, minScore = 0 } = {}) {
  if (!validIndex(ix)) return [];
  const q = [...new Set(termsOf(query))]; if (!q.length) return [];
  const qTopics = autoTags({ title: String(query) }).map(t => t.key), qSet = new Set(qTopics), maths = MATHS_Q.test(String(query));
  const topicF = new Set(topics ?? []), srcF = new Set(sources ?? []);
  const out = [];
  for (const r of ix.rows) {
    if (topicF.size && !r.tg.some(k => topicF.has(k))) continue;
    if (srcF.size && !srcF.has(r.src)) continue;
    if (!yearOk(r.y, years)) continue;
    if (requireNotes && !r.c) continue;
    const w = new Map(ix.vec[r.id] ?? []); let s = 0; const hit = [];
    for (const t of q) { const x = w.get(t); if (x) { s += idfOf(ix, t) * (x / (x + 1.5)); hit.push(t); } }
    const tHit = r.tg.filter(k => qSet.has(k));
    if (!hit.length && !tHit.length) continue;
    s += tHit.length * 0.8;
    if (r.ev === 'oos') s *= r.co ? 1.2 : 1.15;
    if (r.vd) s *= 1.08;
    if (!r.c) s *= 0.7;
    if (maths && (r.src === 'arxiv' || r.tg.some(k => MATHS_TOPIC.has(k)))) s *= 1.1;
    s = Math.round(s * 1000) / 1000;
    if (s <= 0 || s < minScore) continue;
    out.push({ ...r, score: s, why: { terms: hit.slice(0, 8), topics: tHit, boosts: [r.ev === 'oos' ? 'out-of-sample' : null, r.vd ? 'our verdict' : null, maths && (r.src === 'arxiv' || r.tg.some(k => MATHS_TOPIC.has(k))) ? 'maths' : null].filter(Boolean) } });
  }
  out.sort((a, b) => b.score - a.score || (b.y ?? 0) - (a.y ?? 0) || String(a.id).localeCompare(String(b.id)));
  return out.slice(0, Math.max(1, Math.min(100, n)));
}

// ── tier 2: digests and prompt context ──────────────────────────────────────────────────────────────────────────

/** Figure / table notes -> up to `max` 'Figure 1: ...' strings. Accepts { 'Figure 1': { text } } or [{ key, text }]. */
export function figLines(figNotes, max = 3) {
  const list = Array.isArray(figNotes) ? figNotes.map(f => [f.key, f]) : Object.entries(figNotes ?? {});
  return list.filter(([, f]) => f && f.text).sort((a, b) => (b[1].confident === true) - (a[1].confident === true) || String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })).slice(0, max).map(([k, f]) => `${k}: ${clean(f.text)}`);
}

const dataLine = d => (d && typeof d === 'object' ? [d.market, d.period, d.frequency].map(clean).filter(Boolean).join(', ') : clean(d));
/**
 * One paper's notes as a compact text block for a prompt, <= maxChars (default 900): id, title, year, claim, mechanism, data, method,
 * effect, out-of-sample, costs, caveats, testHere and up to 3 figure / table notes. Without notes: the abstract (cut) and a note saying so.
 * The longest fields shrink first, so every field keeps a place.
 */
export function digest(p, { maxChars = 900, figNotes = null } = {}) {
  const n = p?.notes && typeof p.notes === 'object' ? p.notes : null;
  const src = p?.source?.label ?? p?.source?.key ?? '';
  const head = `id: ${p.id} | ${cut(p.title ?? p.id, 120)}${p.year ? ` (${p.year})` : ''}${src ? ` | ${src}` : ''}`;
  const f = [];
  if (n) {
    const caveats = Array.isArray(n.caveats) ? n.caveats.map(clean).filter(Boolean).join('; ') : clean(n.caveats);
    const add = (label, text, pri) => { text = clean(text); if (text) f.push({ label, text, pri }); };
    add('Claim', n.claim, 1); add('Mechanism', n.mechanism, 4); add('Data', dataLine(n.data), 3); add('Method', n.method, 3); add('Effect', n.effect, 2);
    const oc = [n.outOfSample ? `out-of-sample ${n.outOfSample}` : '', n.costs ? `costs netted ${n.costs}` : ''].filter(Boolean).join('; '); add('Evidence', oc, 1);
    add('Caveats', caveats, 5); add('Test here', n.testHere, 2);
    figLines(figNotes, 3).forEach((l, i) => add(i ? '' : 'Figures', l, 6));
  } else {
    f.push({ label: 'Note', text: 'abstract only; the desk has not read this paper in full', pri: 1 });
    if (clean(p.abstract)) f.push({ label: 'Abstract', text: clean(p.abstract), pri: 2 });
  }
  // figure lines after the first continue the Figures line
  const lines = []; for (const x of f) { if (!x.label && lines.length && lines.at(-1).label === 'Figures') lines.at(-1).text += ` | ${x.text}`; else lines.push({ ...x }); }
  const lenOf = () => head.length + lines.reduce((a, l) => a + l.label.length + l.text.length + 3, 0);
  let guard = 400;
  while (lenOf() > maxChars && guard-- > 0) {
    // shrink the longest field of the least important group that is still above its floor
    const cand = lines.filter(l => l.text.length > 40).sort((a, b) => b.pri - a.pri || b.text.length - a.text.length)[0];
    if (!cand) break;
    cand.text = cut(cand.text, Math.max(40, Math.floor(cand.text.length * 0.8)));
  }
  let out = [head, ...lines.map(l => `${l.label}: ${l.text}`)].join('\n');
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1)}…`;
  return out;
}

export const NO_PAPER = 'No held paper covers this.';
export const CONTEXT_HEADER = [
  'LIBRARY: the held papers most related to this question, from the desk\'s paper library. Cite a paper by its id (the text after "id:") in "citations" when you rely on it, and only these ids or papers you have read.',
  'These are the desk\'s reading notes, not the full paper: they show what the paper claims, not a result of ours.',
  `If nothing below is relevant, say 'no held paper covers this' rather than stretching a weak match.`,
].join('\n');

const byIdLookup = papers => (papers instanceof Map ? id => papers.get(id) : Array.isArray(papers) ? (m => id => m.get(id))(new Map(papers.map(p => [p.id, p]))) : id => papers?.[id]);
/** A row as a fallback digest when the full paper record is not at hand. */
const rowDigest = r => `id: ${r.id} | ${r.t}${r.y ? ` (${r.y})` : ''} | ${r.src}\n${[r.c ? `Claim: ${r.c}` : null, r.ef ? `Effect: ${r.ef}` : null, r.tx ? `Test here: ${r.tx}` : null].filter(Boolean).join('\n')}`;

/**
 * The context block for a prompt: { text, ids, rows }. A header, then '[P1] <digest>' for each of the best `n` papers (default 6) that
 * the search finds for `query`, all within `maxChars` (default 5500). `papers`: array / Map / object of catalog Papers by id (a missing
 * one falls back to its index row); `figNotes`: { [paperId]: figure notes }. No relevant paper -> the header plus 'No held paper covers this.'
 * opts also: { topics, sources, years, requireNotes, minScore=0.6, rows (use these ranked rows instead of searching) }.
 */
export function buildContext(query, ix, papers, { n = 6, maxChars = 5500, figNotes = null, topics, sources, years, requireNotes, minScore = 0.6, rows = null } = {}) {
  const ranked = rows ?? search(ix, query, { n, topics, sources, years, requireNotes, minScore });
  const take = ranked.slice(0, n);
  if (!take.length) return { text: `${CONTEXT_HEADER}\n${NO_PAPER}`, ids: [], rows: [] };
  const get = byIdLookup(papers), room = Math.max(300, maxChars - CONTEXT_HEADER.length - 20);
  const per = Math.min(900, Math.floor(room / take.length));
  const blocks = [], ids = [], used = [];
  for (const r of take) {
    const p = get(r.id), tag = `[P${blocks.length + 1}] `;
    const body = p ? digest(p, { maxChars: per - tag.length - 1, figNotes: figNotes?.[r.id] ?? null }) : rowDigest(r).slice(0, per - tag.length - 1);
    const next = tag + body;
    if (blocks.join('\n').length + next.length + CONTEXT_HEADER.length + 2 > maxChars) break;
    blocks.push(next); ids.push(r.id); used.push(r);
  }
  return { text: `${CONTEXT_HEADER}\n${blocks.join('\n')}`, ids, rows: used };
}

// ── researcher wiring helpers (pure; server.js calls them) ──────────────────────────────────────────────────────

/** LIBRARY_CONTEXT=1 (or true / on / yes) switches the library context on. Default off. */
export const libraryContextOn = (env = (typeof process !== 'undefined' ? process.env : {})) => /^(1|true|on|yes)$/i.test(String(env?.LIBRARY_CONTEXT ?? '').trim());
/** The prompt section for a context ([title, text]); the title starts with 'LIBRARY:'. */
export const librarySection = ctx => [ctx.title || 'LIBRARY: held papers most related to this question (cite by id)', ctx.text];
/**
 * Add the library section to a section list. With no context (flag off, or nothing built) the SAME array is returned, untouched, so the
 * prompt is byte-identical to before. `beforeLast` keeps a final section (the owner's message) last.
 */
export function withLibrary(sections, ctx, { beforeLast = false } = {}) {
  if (!ctx || !ctx.text) return sections;
  const sec = librarySection(ctx);
  return beforeLast ? [...sections.slice(0, -1), sec, sections.at(-1)] : [...sections, sec];
}
/** The ids a researcher may cite: the existing held-paper ids plus the injected library ids (never fewer than before). */
export const citeableIds = (paperIds, libraryIds = []) => (libraryIds?.length ? new Set([...(paperIds ?? []), ...libraryIds]) : paperIds);
/** The query for a case: its question and title (and the owner's new message in a later round). */
export const caseQuery = (c, extra = '') => [c?.question, c?.title, extra].map(clean).filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).join(' ').slice(0, 600);
