/**
 * The librarian (owner request 2026-11-08): instead of only pushing the rule-based top-6 digests into the researchers' prompts, work the way
 * a person would. SCAN the index cheaply with a few keyword searches, PICK what matters (ONE small DeepSeek call, task 'library-librarian'),
 * FETCH the detailed digest only for the picked papers.
 *
 * Pure functions plus an injectable model caller; no network, no clock, no model import. Flag: LIBRARY_CONTEXT=1 (js/libraryIndex.js
 * libraryContextOn), off by default. When the flag is on the librarian REPLACES the rule-based selection; when it cannot run (no key, bad
 * JSON, timeout, cap reached) the caller falls back to the rule-based buildContext, so nothing breaks.
 *
 *   buildQueries(text)                       3-6 keyword queries (rule-based: asset names, tickers, topic phrases, noun phrases)
 *   scan(ix, queries, opts)                  search each (n=12), merge by id (best score, union of why), cap 25 candidates
 *   candidateText(cands, opts)               compact numbered list, <= ~3000 tokens
 *   librarianPrompt(question, ...)           { system, prompt }
 *   validatePicks(obj, cands, opts)          { picks, refine, none }: unknown ids dropped, deduped, max 6
 *   pickedContext(picks, ...)                the 'LIBRARY (picked by the librarian)' section: { text, ids, rows, title }
 *   runLibrarian(deps)                       the whole run, at most 2 model calls; never throws
 *   createBudget({ kv })                     the hard cap on model calls in KV library_librarian_v1
 */
import { tokens, stem, autoTags } from './paperCatalog.js';
import * as LIX from './libraryIndex.js';

export const LIBRARIAN_KV_KEY = 'library_librarian_v1';
export const LIBRARIAN_CAP = 400;        // model calls, ever
export const RUN_CALLS_MAX = 2;          // per librarian run
export const SCAN_N = 12;                // rows per query
export const CAND_MAX = 25;              // candidate rows after the merge
export const CAND_TOKENS = 3000;         // the candidate list, estimated at 4 characters per token
export const PICK_MAX = 6;
export const QUERY_MIN = 3, QUERY_MAX = 6;
export const LIBRARIAN_TITLE = 'LIBRARY (picked by the librarian): the held papers chosen for this question (cite by id)';

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();

// ── 1. queries ────────────────────────────────────────────────────────────────────────────────────────────────

/** A short keyword phrase per topic family (js/paperCatalog.js TOPICS keys), used as the topic part of a query. */
export const TOPIC_PHRASE = {
  volatility: 'volatility forecast realized variance', jump: 'jump diffusion discontinuity test', brownian: 'brownian motion stochastic process',
  options: 'options dealer gamma hedging', cot: 'speculator net positioning futures', fx: 'currency carry exchange rate',
  trend: 'trend momentum time series', meanrev: 'mean reversion pairs', rates: 'FOMC interest rate announcement',
  commodities: 'gold commodity futures', risk: 'portfolio risk sizing', backtest: 'backtest overfitting out of sample',
  microstructure: 'order flow liquidity microstructure', ml: 'machine learning prediction', regimes: 'regime switching hidden markov',
};
const ASSET_WORDS = /\b(gold|silver|oil|crude|copper|bitcoin|crypto\w*|yen|euro|sterling|dollar|swissie|loonie|aussie|treasur\w*|bonds?|equit\w*|stocks?|nasdaq|vix)\b/gi;
const PAIR = /\b([A-Z]{3})\s?\/?\s?([A-Z]{3})\b/g;
const CCY = new Set(['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'AUD', 'NZD', 'CAD', 'SEK', 'NOK', 'MXN', 'CNH', 'CNY']);
const TICKERS = /\b(SPX|SPY|NDX|QQQ|VIX|DXY|GEX|COT|FOMC|CPI|NFP|WTI|DAX|BTC|ETH|OIS|HAR|GARCH|CTA)\b/g;

/** Asset names and tickers named in the text, lower-cased and deduped: 'eurusd', 'gold', 'vix'... */
export function assetsOf(text) {
  const s = String(text ?? ''), out = [];
  for (const m of s.matchAll(PAIR)) if (CCY.has(m[1]) && CCY.has(m[2]) && m[1] !== m[2]) out.push(`${m[1]}${m[2]}`.toLowerCase());
  for (const m of s.matchAll(TICKERS)) out.push(m[1].toLowerCase());
  for (const m of s.matchAll(ASSET_WORDS)) out.push(m[1].toLowerCase());
  return [...new Set(out)];
}

/** Runs of content words in their original order (noun-phrase-ish): 2 or 3 words. */
function phrasesOf(text) {
  const words = String(text ?? '').split(/[^A-Za-z0-9&+-]+/).filter(Boolean), runs = []; let cur = [];
  const flush = () => { if (cur.length) runs.push(cur); cur = []; };
  for (const w of words) { if (tokens(w).length) cur.push(w); else flush(); }
  flush();
  const out = [];
  for (const r of runs) {
    if (r.length === 1) continue;
    if (r.length <= 3) out.push(r.join(' '));
    else for (let i = 0; i + 2 <= r.length; i += 2) out.push(r.slice(i, i + 3).join(' '));
  }
  return out;
}

/**
 * 3-6 keyword queries from the case question / title / owner message. Rule-based and deterministic: the content words of the question,
 * each topic family it touches (with the asset it names), and its best noun phrases. Fewer than 3 are padded from the words; no usable
 * word at all gives [].
 */
export function buildQueries(text, { min = QUERY_MIN, max = QUERY_MAX } = {}) {
  const src = clean(text).slice(0, 700), words = tokens(src);
  if (!words.length) return [];
  const assets = assetsOf(src), asset = assets.slice(0, 2).join(' '), qs = [];
  const add = q => { q = clean(q); if (q && tokens(q).length) qs.push(q); };
  add(words.slice(0, 8).join(' '));                                                                  // 1. the plain keywords
  const topics = autoTags({ title: src }).map(t => t.key).filter(k => TOPIC_PHRASE[k]).slice(0, 3);
  for (const k of topics) add(`${asset} ${TOPIC_PHRASE[k]}`);                                       // 2. topic + asset
  for (const p of phrasesOf(src).slice(0, 3)) add(asset && !tokens(p).some(w => assets.includes(w)) ? `${p} ${asset}` : p);   // 3. noun phrases
  if (assets.length && !topics.length) add(`${asset} predict returns`);
  // dedupe on the stemmed word set, keep order
  const seen = new Set(), uniq = [];
  for (const q of qs) { const k = [...new Set(tokens(q).map(stem))].sort().join(' '); if (!seen.has(k)) { seen.add(k); uniq.push(q); } }
  // pad from the words if short: halves of the keyword list, then single topic phrases
  for (const q of [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.floor(words.length / 2)).join(' '), ...topics.map(k => TOPIC_PHRASE[k])]) {
    if (uniq.length >= min) break;
    const k = [...new Set(tokens(q).map(stem))].sort().join(' '); if (q && !seen.has(k)) { seen.add(k); uniq.push(q); }
  }
  return uniq.slice(0, max);
}

// ── 2. scan ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Search each query and merge by id: best score, union of why (terms, topics, boosts), `qs` = how many queries found it. Best first, capped. */
export function scan(ix, queries, { n = SCAN_N, cap = CAND_MAX } = {}) {
  const by = new Map();
  for (const q of queries ?? []) {
    for (const h of LIX.search(ix, q, { n })) {
      const had = by.get(h.id);
      if (!had) { by.set(h.id, { ...h, why: { terms: [...h.why.terms], topics: [...h.why.topics], boosts: [...h.why.boosts] }, qs: 1 }); continue; }
      had.qs++;
      if (h.score > had.score) { had.score = h.score; }
      for (const k of ['terms', 'topics', 'boosts']) had.why[k] = [...new Set([...had.why[k], ...h.why[k]])];
    }
  }
  return [...by.values()].sort((a, b) => b.score - a.score || b.qs - a.qs || (b.y ?? 0) - (a.y ?? 0) || String(a.id).localeCompare(String(b.id))).slice(0, cap);
}

const EV = { oos: 'out-of-sample', 'in-sample': 'in-sample', partly: 'partly OOS', survey: 'survey', unknown: 'unrated' };
/** One candidate as a compact numbered line. */
export function candidateLine(r, i) {
  const bits = [`${i + 1}. [${r.id}] ${r.t}${r.y ? ` (${r.y})` : ''}, ${r.src}`];
  bits.push(r.c ? `claim: ${r.c}` : 'not read in full (title only)');
  bits.push(`evidence: ${EV[r.ev] ?? 'unrated'}${r.co ? ', net of costs' : ''}`);
  if (r.m && r.m !== 'unknown') bits.push(`market: ${r.m}`);
  if (r.me) bits.push(`method: ${r.me}`);
  if (r.ef) bits.push(`effect: ${r.ef}`);
  if (r.tx) bits.push(`test here: ${r.tx}`);
  if (r.vd?.length) bits.push(`our verdicts: ${r.vd.join(', ')}`);
  return bits.join(' | ');
}
/** The numbered list within `maxTokens` (4 chars per token); trailing candidates are dropped, never cut. Returns { text, rows }. */
export function candidateText(cands, { maxTokens = CAND_TOKENS } = {}) {
  const lines = [], rows = []; let used = 0;
  for (const r of cands ?? []) {
    const line = candidateLine(r, rows.length);
    if (used + line.length + 1 > maxTokens * 4) break;
    lines.push(line); rows.push(r); used += line.length + 1;
  }
  return { text: lines.join('\n'), rows };
}

// ── 3. pick ───────────────────────────────────────────────────────────────────────────────────────────────────

export const LIBRARIAN_SYSTEM = [
  'You are the desk librarian of a quantitative FX research desk. A researcher is working on a question. You see a numbered list of candidate papers from the desk\'s library: one index row each (title, year, source, the paper\'s claim, evidence, market, method, effect, what to test here, our own verdicts).',
  'Choose the papers the researcher should read in detail for THIS question. Judge by what a paper claims and whether its market and method fit the question, not by shared words. Prefer out-of-sample evidence and the same market. Do not pick a paper because one keyword matched.',
  `Pick at most ${PICK_MAX}, most useful first; fewer is better than padding. Use only ids from the list. If nothing fits, return no picks.`,
  'If the right paper may be in the library under other words, give up to 3 new short keyword queries in "refine" (only when "picks" is empty). If the library clearly holds nothing on this, set "none" to true.',
  'Reply with ONE JSON object and nothing else: {"picks":[{"id":"<id from the list>","why":"<one line, under 140 characters: why this paper matters for this question>"}],"refine":["<query>"],"none":false}',
].join('\n');

/** { system, prompt } for one pick call. `round` 2 says the first scan found nothing fitting and no further refine is allowed. */
export function librarianPrompt(question, queries, candText, { round = 1, total = null } = {}) {
  const n = candText ? candText.split('\n').length : 0;
  const prompt = [
    `QUESTION:\n${clean(question).slice(0, 700)}`,
    `KEYWORD QUERIES RUN: ${(queries ?? []).map(q => `"${q}"`).join('; ')}`,
    round > 1 ? 'This is the SECOND scan: the first one held nothing that fitted, and these candidates come from your refined queries. You cannot refine again: pick what fits, or set "none" to true.' : '',
    `CANDIDATES (${n}${total && total > n ? ` of ${total}, best first` : ''}):\n${candText || '(none)'}`,
    'Return the JSON object now.',
  ].filter(Boolean).join('\n\n');
  return { system: LIBRARIAN_SYSTEM, prompt };
}

/**
 * The model's reply -> { picks:[{id, why}], refine:[query], none:boolean, dropped:n }. Ids must be among the candidates (a '#3' or a bare 3
 * means the third line); others are dropped, duplicates collapse, at most `max` picks keep their order. Never throws.
 */
export function validatePicks(obj, cands, { max = PICK_MAX } = {}) {
  const ids = new Set((cands ?? []).map(r => r.id)), o = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  const list = Array.isArray(o.picks) ? o.picks : Array.isArray(obj) ? obj : [];
  const picks = []; let dropped = 0;
  for (const p of list) {
    let id = typeof p === 'string' ? p : p?.id;
    id = id == null ? '' : String(id).trim();
    if (!ids.has(id) && /^#?\d{1,2}$/.test(id)) id = (cands ?? [])[Number(id.replace('#', '')) - 1]?.id ?? id;   // a list number instead of the id
    if (!ids.has(id) || picks.some(x => x.id === id)) { dropped++; continue; }
    if (picks.length >= max) { dropped++; continue; }
    picks.push({ id, why: clean(typeof p === 'object' ? p.why : '').slice(0, 160) });
  }
  const refine = (Array.isArray(o.refine) ? o.refine : []).map(clean).filter(q => q && tokens(q).length).map(q => q.slice(0, 120)).slice(0, 3);
  return { picks, refine, none: o.none === true, dropped };
}

// ── 4. fetch: the picked papers' digests ──────────────────────────────────────────────────────────────────────

export const NONE_TEXT = 'LIBRARY (the librarian searched the desk\'s paper library for this question): no held paper covers this. Do not cite a library paper for it; say so plainly rather than stretching a weak match.';
const CLOSING = 'These are the desk\'s reading notes, not the full paper: they show what each paper claims, not a result of ours. Say so when you lean on one. If none of them is relevant to the question, say \'no held paper covers this\' rather than stretching a weak match.';
const HEADER = 'LIBRARY (picked by the librarian): the desk librarian scanned the paper index and picked these held papers for this question, most useful first, each with why. Cite a paper by its id (the "id:" line) in "citations" when you rely on it, and only these ids or papers you have read.';

/**
 * The librarian's prompt section: { text, ids, rows, title }. `picks` [{id, why}]; `papers` array / Map / object of catalog Papers (a
 * missing one falls back to its index row); `rowsById` Map of index rows; `figNotes` { [id]: notes }. Each digest <= 900 chars with up to 3
 * figure / table notes; the whole text within `maxChars`.
 */
export function pickedContext(picks, papers, rowsById, { figNotes = null, maxChars = 7000 } = {}) {
  const get = papers instanceof Map ? id => papers.get(id) : Array.isArray(papers) ? (m => id => m.get(id))(new Map(papers.map(p => [p.id, p]))) : id => papers?.[id];
  const blocks = [], ids = [], rows = [];
  for (const pk of picks ?? []) {
    const p = get(pk.id), r = rowsById?.get?.(pk.id) ?? null; if (!p && !r) continue;
    const body = p ? LIX.digest(p, { maxChars: 900, figNotes: figNotes?.[pk.id] ?? null }) : `id: ${r.id} | ${r.t}${r.y ? ` (${r.y})` : ''} | ${r.src}\n${[r.c ? `Claim: ${r.c}` : null, r.tx ? `Test here: ${r.tx}` : null].filter(Boolean).join('\n')}`;
    const block = `[P${blocks.length + 1}] Picked because: ${pk.why || '(no reason given)'}\n${body}\nCite as: ${pk.id}`;
    if (blocks.join('\n').length + block.length + HEADER.length + CLOSING.length + 4 > maxChars) break;
    blocks.push(block); ids.push(pk.id); if (r) rows.push(r);
  }
  if (!blocks.length) return { text: NONE_TEXT, ids: [], rows: [], title: LIBRARIAN_TITLE };
  return { text: `${HEADER}\n${blocks.join('\n')}\n${CLOSING}`, ids, rows, title: LIBRARIAN_TITLE };
}

// ── 5. the budget (hard cap in KV) ────────────────────────────────────────────────────────────────────────────

/**
 * The cap on librarian model calls, kept in KV library_librarian_v1 { v:1, used, at }. deps: { kv:{getStrict,put}, cap?, now? }.
 * take(n) reserves n calls BEFORE they are made (a failed call still counts) and returns false, changing nothing, when the cap would be passed.
 * Reads are strict: a backend failure throws, so the caller falls back instead of writing over the counter.
 */
export function createBudget({ kv, cap = LIBRARIAN_CAP, now = () => Date.now() } = {}) {
  let chain = Promise.resolve();
  const locked = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  const read = async () => { const raw = await kv.getStrict(LIBRARIAN_KV_KEY); let s = null; try { s = raw ? JSON.parse(raw) : null; } catch { s = null; } return s?.v === 1 ? s : { v: 1, used: 0, at: null }; };
  return {
    cap,
    status: () => locked(async () => { const s = await read(); return { used: s.used, cap, left: Math.max(0, cap - s.used) }; }),
    take: (n = 1) => locked(async () => {
      const s = await read(); if (s.used + n > cap) return false;
      s.used += n; s.at = new Date(now()).toISOString(); await kv.put(LIBRARIAN_KV_KEY, JSON.stringify(s)); return true;
    }),
  };
}

// ── 6. the run ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One librarian run on a question. Never throws; the result is { ok:true, ... } or { ok:false, reason, queries, calls } (the caller then
 * uses the rule-based context).
 *   deps: { question, ix (index), papers (catalog Papers), figNotesFor(ids) -> {id: notes} (optional), model({system, prompt}) -> parsed object (throws on failure),
 *           budget (createBudget), modelReady() (false = no key), maxPicks }
 * ok:true -> { ok, queries, candidates:[{id,title,year,score}], picks:[{id, why}], none, calls, rounds, text, ids, rows, title }.
 * At most RUN_CALLS_MAX model calls: the pick, and one more only when the first returned no picks but asked to refine.
 */
export async function runLibrarian({ question, ix, papers, figNotesFor = null, model, budget, modelReady = () => true, maxPicks = PICK_MAX }) {
  const out = { ok: false, reason: '', queries: [], candidates: [], calls: 0 };
  try {
    if (!model || !budget) return { ...out, reason: 'no model' };
    if (!modelReady()) return { ...out, reason: 'no model key' };
    if (!LIX.validIndex(ix)) return { ...out, reason: 'no index' };
    let queries = buildQueries(question); out.queries = queries;
    if (!queries.length) return { ...out, reason: 'no usable words in the question' };
    const allQueries = [...queries], seen = new Map(); let picks = [], none = false, cands = [];
    for (let round = 1; round <= RUN_CALLS_MAX; round++) {
      cands = scan(ix, queries);
      for (const r of cands) if (!seen.has(r.id)) seen.set(r.id, r);
      if (!cands.length) { if (round === 1) return { ...out, queries: allQueries, reason: 'no candidates' }; none = true; break; }
      const list = candidateText(cands), { system, prompt } = librarianPrompt(question, queries, list.text, { round, total: cands.length });
      let ok; try { ok = await budget.take(1); } catch (e) { return { ...out, queries: allQueries, reason: `budget unreadable: ${e.message}` }; }
      if (!ok) return { ...out, queries: allQueries, reason: round === 1 ? 'librarian cap reached' : 'librarian cap reached before the second scan' };
      out.calls++;
      let reply; try { reply = await model({ system, prompt, maxTokens: 700 }); } catch (e) { return { ...out, queries: allQueries, reason: `model failed: ${String(e.message ?? e).slice(0, 160)}` }; }
      const v = validatePicks(reply, list.rows, { max: maxPicks });
      if (v.picks.length) { picks = v.picks; none = false; break; }
      if (round === 1 && v.refine.length && !v.none) { queries = v.refine; allQueries.push(...v.refine); continue; }
      if (v.none || round > 1) { none = true; break; }
      return { ...out, queries: allQueries, reason: 'the librarian returned no usable picks' };
    }
    const candidates = [...seen.values()].slice(0, 40).map(r => ({ id: r.id, title: r.t, year: r.y, score: r.score }));
    if (none || !picks.length) return { ...out, ok: true, queries: allQueries, candidates, picks: [], none: true, rounds: out.calls, text: NONE_TEXT, ids: [], rows: [], title: LIBRARIAN_TITLE };
    const figs = figNotesFor ? await Promise.resolve(figNotesFor(picks.map(p => p.id))).catch(() => ({})) : {};
    const ctx = pickedContext(picks, papers, new Map([...seen].map(([id, r]) => [id, r])), { figNotes: figs });
    if (!ctx.ids.length) return { ...out, queries: allQueries, reason: 'the picked papers could not be read' };
    return { ...out, ok: true, queries: allQueries, candidates, picks: picks.filter(p => ctx.ids.includes(p.id)), none: false, rounds: out.calls, ...ctx };
  } catch (e) { return { ...out, reason: `librarian error: ${String(e.message ?? e).slice(0, 160)}` }; }
}

/** What goes on the round / review record: { queries, picked:[{id, why}], none, calls } (+ `fallback` when the rule-based context was used instead). */
export const librarianRecord = (r, fallback = null) => ({ queries: r.queries ?? [], picked: r.picks ?? [], none: !!r.none, calls: r.calls ?? 0, ...(fallback ? { fallback } : {}) });
