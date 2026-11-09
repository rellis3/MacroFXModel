// Concept cards (plans/KNOWLEDGE_AND_MONITORS.md section 4, the knowledge layer): the owner's knowledge (the paper library digests, the C.OG
// education text, the Theory Lab lessons) turned into structured, reviewable cards, one SLICE at a time. First slice: 'candles-sessions'.
//
// A card: { id, title, domain:[tags], principle, mechanism, measure (the variable one would construct), lookFor, caveats, sources:[{kind,id}] }.
//
// Storage: R2 research/concepts/cards.json  { v:1, cards:{ [id]:card }, at }   (private; never committed to git)
//          KV library_concepts_v1  { v:1, used, items:{ [hash]:{ at } }, at }    (the HARD CAP of 400 model calls lives here, reserved BEFORE each call;
//          an item whose content hash is in `items` is never sent again).
// Pure module: no network or model call at import; the model, storage and text readers are injected (deps.conceptsModel, deps.kv, deps.r2, deps.readText, deps.listFiles).
// Same shape as js/libraryFigs.js (service with a job, a per-press limit, a KV counter) and js/libraryLibrarian.js (createBudget pattern).
import { createHash } from 'node:crypto';

export const CONCEPTS_KV_KEY = 'library_concepts_v1';
export const CONCEPTS_CARDS_KEY = 'research/concepts/cards.json';
export const CONCEPTS_CAP = 400;          // model calls, ever
export const CONCEPTS_PRESS_MAX = 12;     // model calls per press
export const CONCEPTS_PROMPT_MAX = 20000; // characters of item JSON per call; more goes to another call
export const CONCEPTS_BATCH_MAX = 8;      // items per call
export const ITEM_MAX = 5000;             // characters of one item's text
export const CARDS_MAX = 3000;            // cards kept in the store
export const SOURCE_KINDS = ['paper', 'cog', 'theory-lab'];
export const SYSTEM_TOKENS = 400;         // rough size of the system prompt, for the estimate

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

// ── 1. slices ───────────────────────────────────────────────────────────────────────────────────────────────────
/** A slice is a topic: `keywords` are case-insensitive phrases; an item belongs when enough DISTINCT keywords occur in its title and text. */
export const SLICES = {
  'candles-sessions': {
    label: 'Candles, trends, ranges, sessions, momentum and mean reversion, jumps and diffusion',
    // strong words name the topic (1 point each); generic words (0.5) turn up everywhere, so they only help
    keywords: ['candle', 'candlestick', 'ohlc', 'wick', 'higher high', 'lower low', 'swing high', 'swing low', 'breakout', 'opening range', 'intraday', 'london session',
      'asian session', 'trading session', 'momentum', 'mean reversion', 'mean-reversion', 'mean revert', 'jump', 'diffusion', 'brownian', 'time series momentum', 'trend following', 'daily range'],
    generic: ['trend', 'range', 'session', 'london', 'asian', 'new york', 'overnight', 'support', 'resistance', 'reversal', 'volatility'],
    minHits: 2, minHitsLong: 4,   // points needed (text of 2000+ characters needs the second number)
  },
};
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const kwRe = new Map();
const reOf = k => { if (!kwRe.has(k)) kwRe.set(k, new RegExp(`\\b${escRe(k)}`, 'i')); return kwRe.get(k); };
/** Points for the distinct slice keywords found in `text` (strong 1, generic 0.5). */
export function hitsOf(text, slice) { const s = SLICES[slice]; if (!s) return 0; let n = 0; for (const k of s.keywords) if (reOf(k).test(text)) n++; for (const k of s.generic ?? []) if (reOf(k).test(text)) n += 0.5; return n; }
export const inSlice = (title, text, slice) => {
  const s = SLICES[slice]; if (!s) return false;
  const body = `${title ?? ''}\n${text ?? ''}`;
  return hitsOf(body, slice) >= (body.length >= 2000 ? s.minHitsLong : s.minHits);
};

// ── 2. the source items ────────────────────────────────────────────────────────────────────────────────────────
/** The content hash of an item: the same kind, id and text always give the same hash, so an unchanged item is never sent twice. */
export const itemHash = it => createHash('sha256').update(`${it.kind}\u0000${it.id}\u0000${it.text}`).digest('hex').slice(0, 16);

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&mdash;': '-', '&ndash;': '-', '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"' };
/** A Theory Lab lesson page as plain text, headings kept as "# " lines. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<(script|style|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<h[1-4][^>]*>/gi, '\n# ').replace(/<\/h[1-4]>/gi, '\n')
    .replace(/<\/(p|li|div|tr|section|article|table|ul|ol|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, m => ENT[m.toLowerCase()] ?? ' ')
    .replace(/[ \t\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const slugOf = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'part';

/** Text -> sections at "#" heading lines (a long section is cut at paragraph breaks), each within `max` characters. [{ heading, text }] */
export function sectionsOf(text, max = ITEM_MAX) {
  const lines = String(text ?? '').split('\n'), secs = []; let cur = { heading: '', lines: [] };
  const flush = () => { const t = cur.lines.join('\n').trim(); if (t) secs.push({ heading: cur.heading, text: t }); };
  for (const ln of lines) { const m = /^#{1,3}\s+(.*)$/.exec(ln); if (m) { flush(); cur = { heading: m[1].trim(), lines: [ln] }; } else cur.lines.push(ln); }
  flush();
  const out = [];
  for (const s of secs) {
    if (s.text.length <= max) { out.push(s); continue; }
    let buf = ''; for (const para of s.text.split(/\n\s*\n|\n/)) {
      if (buf && buf.length + para.length + 1 > max) { out.push({ heading: s.heading, text: buf.trim() }); buf = ''; }
      buf += `${para.slice(0, max)}\n`;
    }
    if (buf.trim()) out.push({ heading: s.heading, text: buf.trim() });
  }
  // merge tiny neighbours so a one-line heading does not become an item of its own
  const merged = [];
  for (const s of out) { const last = merged[merged.length - 1]; if (last && last.text.length < 150 && last.text.length + s.text.length + 1 <= max) { last.text += `\n${s.text}`; last.heading = last.heading || s.heading; } else merged.push({ ...s }); }
  return merged;
}

/**
 * The source items of a slice, in a stable order: [{ kind, id, title, text, hash }].
 *   digests   [{ id, title, text }]  the library index digest of each paper (kind 'paper')
 *   listFiles(dir, { exts, recursive }) -> [relative paths]   readText(path) -> string | null     (repo files: education/*.md, cog/** md/txt, theory-lab/lessons/*.html)
 * Files are cut into heading sections; only sections that match the slice are items. A reader that throws means "no such file".
 */
export async function collectItems({ digests = [], readText = null, listFiles = null, slice = 'candles-sessions' } = {}) {
  if (!SLICES[slice]) return [];
  const items = [];
  const push = (kind, id, title, text) => { const t = clip(text, ITEM_MAX); if (t.length >= (kind === 'paper' ? 1 : 200) && inSlice(title, t, slice)) { const it = { kind, id, title: clip(title, 140), text: t }; it.hash = itemHash(it); items.push(it); } };
  for (const d of Array.isArray(digests) ? digests : []) if (d && d.id != null) push('paper', String(d.id), d.title ?? d.id, d.text ?? d.digest ?? '');
  if (readText && listFiles) {
    const sets = [['education', { exts: ['.md'], recursive: false }, 'cog', false], ['cog', { exts: ['.md', '.txt'], recursive: true }, 'cog', false], ['theory-lab/lessons', { exts: ['.html'], recursive: false }, 'theory-lab', true]];
    for (const [dir, opts, kind, html] of sets) {
      let files = []; try { files = (await listFiles(dir, opts)) ?? []; } catch { files = []; }
      for (const f of [...files].sort()) {
        let raw = null; try { raw = await readText(f); } catch { raw = null; }
        if (!raw) continue;
        const text = html ? htmlToText(raw) : String(raw);
        const secs = sectionsOf(text);
        const one = secs.length === 1;
        secs.forEach((s, i) => { if (/^(table of )?contents?$|^index$/i.test(s.heading)) return; push(kind, one ? f : `${f}#${i + 1}-${slugOf(s.heading)}`, s.heading ? `${f.split('/').pop()}: ${s.heading}` : f, s.text); });
      }
    }
  }
  return items;
}

// ── 3. batching and the dry run ───────────────────────────────────────────────────────────────────────────────
const itemJson = it => JSON.stringify({ id: it.id, kind: it.kind, title: it.title, text: it.text });
/** Items -> model calls: [{ items, chars }], each within `maxChars` of item JSON and `batch` items (an item bigger than the budget goes alone). */
export function batchItems(items, { maxChars = CONCEPTS_PROMPT_MAX, batch = CONCEPTS_BATCH_MAX } = {}) {
  const out = []; let cur = [], size = 0;
  for (const it of items) {
    const n = itemJson(it).length;
    if (cur.length && (cur.length >= batch || size + n > maxChars)) { out.push({ items: cur, chars: size }); cur = []; size = 0; }
    cur.push(it); size += n;
  }
  if (cur.length) out.push({ items: cur, chars: size });
  return out;
}
/** Items the model has not seen (hash not in `sent`). */
export const unsent = (items, sent) => items.filter(it => !(sent && Object.prototype.hasOwnProperty.call(sent, it.hash)));

/**
 * The dry run: what a full run WOULD send, with NO model call. { slice, matched, items (not sent before), skipped (sent before), bySource, estimatedTokens (chars/4), calls }.
 * `sent` is the KV `items` map.
 */
export async function dryRun({ digests, readText, listFiles, slice = 'candles-sessions', sent = {} } = {}) {
  const all = await collectItems({ digests, readText, listFiles, slice }), todo = unsent(all, sent), calls = batchItems(todo);
  const bySource = { paper: 0, cog: 0, 'theory-lab': 0 }; for (const it of todo) bySource[it.kind]++;
  const chars = calls.reduce((a, c) => a + c.chars, 0) + calls.length * SYSTEM_TOKENS * 4;
  return { slice, matched: all.length, items: todo.length, skipped: all.length - todo.length, bySource, estimatedTokens: Math.ceil(chars / 4), calls: calls.length };
}

// ── 4. the prompt ───────────────────────────────────────────────────────────────────────────────────────────────
// A constant here, not a file in desk/roles/: those files are desk roles tied to agents in js/agentRegistry.js (a role must belong to an agent that runs it).
export const CONCEPTS_SYSTEM = [
  'You turn a quantitative FX research desk\'s own reading material into concept cards. You see numbered source items: each has "id", "kind" (paper, cog or theory-lab), "title" and "text".',
  'Use ONLY what the supplied text says. Do not add facts, numbers, results or claims from your own knowledge. Do not invent. If the text of an item holds no usable concept, write no card for it.',
  'Cite the source ids: every card lists the ids of the items it rests on in "sources", copied exactly from the supplied items. A card with no supplied id is discarded.',
  'Do not give trading advice, signals, entry or exit rules, or results. A card describes an idea and how one would MEASURE it; it never says it works or makes money.',
  'Reply with ONE JSON object and nothing else: {"cards":[{"id":"short-kebab-case-id","title":"...","domain":["candles","trend"],"principle":"one or two sentences: the idea","mechanism":"why it would exist, as the text says","measure":"the variable one would construct, precisely","lookFor":"what to watch for when it is measured","caveats":"limits and traps the text names","sources":["<item id>"]}]}',
  'Each text field is plain prose, no markup or links: principle at most 300 characters, the others at most 400. "domain" is 1 to 4 short lower-case tags. Merge items that state the same idea into one card; give ids that say the idea, not the source.',
].join('\n');

/** Batch items -> the user prompt. */
export function buildPrompt(items, slice) {
  const label = SLICES[slice]?.label ?? slice;
  return `Slice: ${slice} (${label})\nSource items (${items.length}):\n[${items.map(itemJson).join(',\n')}]\nReturn the JSON object now.`;
}

// ── 5. the reply ────────────────────────────────────────────────────────────────────────────────────────────────
const LIMITS = { title: 120, principle: 300, mechanism: 400, measure: 400, lookFor: 400, caveats: 400 };
const BAD_TEXT = /[<>]|https?:|www\.|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i;
const idOf = s => String(s ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const textOf = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').join('; ') : typeof v === 'string' ? v : '');

/**
 * Model reply -> { cards:[card], rejected:[{ id, why }] }. Strict: {"cards":[...]} (a bare array is accepted). A card is kept only with an id, a title, principle,
 * mechanism, measure and lookFor of plain text (no markup or links), and at least one source whose id is one of the supplied `items` (kind is set from the item).
 * Long text is clipped, extra fields are dropped, domain tags are slugs (at most 4).
 */
export function parseCards(modelJson, items, slice = null) {
  let obj = modelJson;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { return { cards: [], rejected: [{ id: null, why: 'not JSON' }] }; } }
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.cards) ? obj.cards : null;
  if (!arr) return { cards: [], rejected: [{ id: null, why: 'no cards array' }] };
  const byId = new Map((items ?? []).map(it => [it.id, it])), cards = [], rejected = [], seen = new Set();
  for (const r of arr) {
    if (!isPlain(r)) { rejected.push({ id: null, why: 'not an object' }); continue; }
    const id = idOf(r.id || r.title);
    if (id.length < 3) { rejected.push({ id: id || null, why: 'no id' }); continue; }
    if (seen.has(id)) continue;
    const c = { id };
    let bad = null;
    for (const [k, n] of Object.entries(LIMITS)) {
      const t = textOf(r[k]).replace(/\s+/g, ' ').trim();
      if (!t && k !== 'caveats') { bad = `empty ${k}`; break; }
      if (BAD_TEXT.test(t)) { bad = `markup or link in ${k}`; break; }
      c[k] = clip(t, n);
    }
    if (bad) { rejected.push({ id, why: bad }); continue; }
    const dom = [...new Set((Array.isArray(r.domain) ? r.domain : typeof r.domain === 'string' ? [r.domain] : []).map(d => idOf(d).slice(0, 30)).filter(Boolean))].slice(0, 4);
    c.domain = dom;
    const src = [], have = new Set();
    for (const s of Array.isArray(r.sources) ? r.sources : []) {
      const sid = typeof s === 'string' ? s.trim() : typeof s?.id === 'string' ? s.id.trim() : '';
      const it = byId.get(sid); if (!it || have.has(sid)) continue;
      have.add(sid); src.push({ kind: it.kind, id: it.id });
    }
    if (!src.length) { rejected.push({ id, why: 'no supplied source id' }); continue; }
    c.sources = src.slice(0, 12);
    if (slice) c.slice = slice;
    seen.add(id); cards.push(c);
  }
  return { cards, rejected };
}

/** Merge new cards into the store by id: the newer text wins, sources and domain tags are unioned. Returns the number of cards added or changed. */
export function mergeCards(store, cards, now = Date.now()) {
  let n = 0;
  for (const c of cards) {
    const had = store.cards[c.id];
    const sources = [...(had?.sources ?? [])]; for (const s of c.sources) if (!sources.some(x => x.kind === s.kind && x.id === s.id)) sources.push(s);
    const domain = [...new Set([...(had?.domain ?? []), ...c.domain])].slice(0, 6);
    const next = { ...c, sources: sources.slice(0, 24), domain, at: now };
    if (!had || JSON.stringify({ ...had, at: 0 }) !== JSON.stringify({ ...next, at: 0 })) n++;
    store.cards[c.id] = next;
  }
  const ids = Object.keys(store.cards); if (ids.length > CARDS_MAX) for (const id of ids.sort((a, b) => (store.cards[a].at ?? 0) - (store.cards[b].at ?? 0)).slice(0, ids.length - CARDS_MAX)) delete store.cards[id];
  return n;
}

// ── 6. the service ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * deps: { kv:{ getStrict, put }, r2:{ ok, getBuffer, putBuffer }, now(), log,
 *         digests() -> [{ id, title, text }],  readText(path), listFiles(dir, opts),
 *         conceptsModel({ system, prompt, maxTokens }) -> the parsed reply (throws on failure)   (absent = no model: a run says so),
 *         modelReady() -> boolean }
 * The counter in KV is read STRICTLY: when it cannot be read nothing is sent (fail closed) and nothing is written.
 */
export function createConcepts(deps) {
  const { kv, r2 } = deps;
  const now = deps.now ?? (() => Date.now()), log = deps.log ?? console;
  let chain = Promise.resolve();
  const locked = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  let job = null, memCards = null;

  async function readState() {
    const raw = await kv.getStrict(CONCEPTS_KV_KEY); let s = null; try { s = raw ? JSON.parse(raw) : null; } catch { s = null; }
    return { v: 1, ...(isPlain(s) ? s : {}), used: Number.isFinite(s?.used) ? s.used : 0, items: isPlain(s?.items) ? s.items : {} };
  }
  const mutate = fn => locked(async () => { const s = await readState(); const out = await fn(s); s.at = now(); await kv.put(CONCEPTS_KV_KEY, JSON.stringify(s)); return out; });
  /** Reserve one call against the hard cap BEFORE it is made (a crash cannot lose count). */
  const reserve = () => mutate(async s => { if (s.used >= CONCEPTS_CAP) return false; s.used++; return true; });

  async function loadCards() {
    try {
      const b = r2.ok() ? await r2.getBuffer(CONCEPTS_CARDS_KEY) : memCards;
      if (b) { const j = JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b)); if (j?.v === 1 && isPlain(j.cards)) return { v: 1, cards: j.cards, at: j.at ?? null }; }
    } catch { /* none */ }
    return { v: 1, cards: {}, at: null };
  }
  async function saveCards(store) {
    store.at = now(); const buf = Buffer.from(JSON.stringify(store));
    if (r2.ok()) await r2.putBuffer(CONCEPTS_CARDS_KEY, buf, 'application/json'); else memCards = buf;
  }
  const sources = async () => ({ digests: (await deps.digests?.().catch(() => [])) ?? [], readText: deps.readText, listFiles: deps.listFiles });

  /** GET: counts only, no card text. Never calls the model. */
  async function status(slice = 'candles-sessions') {
    if (!SLICES[slice]) return { ok: false, status: 400, error: `unknown slice: ${slice}`, slices: Object.keys(SLICES) };
    let s = null, readable = true; try { s = await readState(); } catch { readable = false; }
    const d = await dryRun({ ...(await sources()), slice, sent: s?.items ?? {} });
    const cards = Object.keys((await loadCards()).cards).length;
    return { ok: true, slice, ...d, callsUsed: readable ? s.used : null, callsCap: CONCEPTS_CAP, callsLeft: readable ? Math.max(0, CONCEPTS_CAP - s.used) : null, perPress: CONCEPTS_PRESS_MAX,
      counterReadable: readable, cards, job: job ? { ...job, errors: job.errors.slice(-8) } : null, model: !!deps.conceptsModel && deps.modelReady?.() !== false };
  }

  async function runJob(slice, max, j) {
    const s0 = await readState();
    const todo = unsent(await collectItems({ ...(await sources()), slice }), s0.items);
    const calls = batchItems(todo).slice(0, max);
    const store = await loadCards();
    for (const call of calls) {
      j.stage = `call ${j.calls + 1} of ${calls.length}`;
      let ok; try { ok = await reserve(); } catch (e) { j.errors.push(`the call counter cannot be read: ${String(e.message).slice(0, 80)}`); j.capped = true; break; }   // fail closed
      if (!ok) { j.errors.push(`the ${CONCEPTS_CAP}-call cap is used up`); j.capped = true; break; }
      j.calls++;
      try {
        const raw = await deps.conceptsModel({ system: CONCEPTS_SYSTEM, prompt: buildPrompt(call.items, slice), maxTokens: 4000 });
        const r = parseCards(raw, call.items, slice);
        j.rejected += r.rejected.length;
        if (r.rejected.length && !r.cards.length && r.rejected.every(x => x.id === null)) { j.errors.push(`call ${j.calls}: the reply was not usable (${r.rejected[0].why})`); continue; }   // not marked as sent: it may be tried again
        j.cards += mergeCards(store, r.cards, now()); j.items += call.items.length;
        await saveCards(store);
        await mutate(async s => { for (const it of call.items) s.items[it.hash] = { at: now() }; });
      } catch (e) { j.errors.push(`call ${j.calls}: ${String(e.message ?? e).slice(0, 120)}`); }
    }
  }

  /** POST: up to `calls` model calls (1..12) on the unsent items of a slice. One job at a time. */
  async function start({ slice = 'candles-sessions', calls = 6 } = {}) {
    if (!SLICES[slice]) return { ok: false, status: 400, error: `unknown slice: ${slice}` };
    if (!deps.conceptsModel || deps.modelReady?.() === false) return { ok: false, status: 503, error: 'no model key is configured' };
    if (!r2.ok()) return { ok: false, status: 503, error: 'private storage (R2) is not configured, so cards cannot be kept' };
    if (job?.status === 'running') return { ok: false, status: 409, error: 'the concepts job is already running', job };
    const n = Math.min(CONCEPTS_PRESS_MAX, Math.max(1, Math.floor(Number(calls) || 6)));
    let s; try { s = await readState(); } catch (e) { return { ok: false, status: 503, error: `the call counter cannot be read, so nothing was sent: ${String(e.message).slice(0, 100)}` }; }   // fail closed
    if (s.used >= CONCEPTS_CAP) return { ok: false, status: 409, error: `the ${CONCEPTS_CAP}-call cap is used up`, callsUsed: s.used, callsCap: CONCEPTS_CAP };
    const j = job = { status: 'running', slice, startedAt: now(), finishedAt: null, calls: 0, max: Math.min(n, CONCEPTS_CAP - s.used), items: 0, cards: 0, rejected: 0, stage: 'starting', errors: [], capped: false, error: null };
    runJob(slice, j.max, j).then(() => { j.status = 'done'; j.stage = 'done'; }).catch(e => { j.status = 'error'; j.error = String(e?.message ?? e).slice(0, 200); }).finally(() => { j.finishedAt = now(); });
    return { ok: true, status: 202, job: j };
  }

  /** The stored cards (private: the route that serves this is login-gated). */
  async function cards() { const st = await loadCards(); return { ok: true, at: st.at, count: Object.keys(st.cards).length, cards: Object.values(st.cards).sort((a, b) => a.id.localeCompare(b.id)) }; }

  void log;
  return { status, start, cards, dryRun: async slice => (await status(slice)), readState, _test: { runJob, reserve, loadCards, saveCards, getJob: () => job } };
}
