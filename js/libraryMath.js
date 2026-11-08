// The Paper Library's equations as maths (plans/PAPER_LIBRARY.md "Equations as maths"): the layers that fill a paper's math file and the capped
// model job. Layer 1 (rule-based, js/mathLatex.js) is computed on the fly, layer 2 (arXiv's own LaTeX, js/arxivMath.js) is fetched once per paper,
// layer 3 asks DeepSeek (task 'library-math') to tidy the equations the other two could not read. Trust order: arXiv > model > rules.
//
// Storage: R2 research/papers/<id>.math.json  { v:1, eq:{ [blockIndex]:{ latex, source:'arxiv'|'model'|'rule', conf, at } }, arxiv?:{ id, status, from, eqs, matched, at },
//   model?:{ tried:{ [blockIndex]:n } , calls }, at }.   KV library_math_v1  { v:1, used, papers:{ [id]:{ done, at, eq, model } }, at } (the hard cap lives here).
//
// No network or model call is made at import; everything external is injected (deps.mathModel, deps.fetchArxiv, deps.validateLatex).
import { toLatex, linearize, CONF_OK } from './mathLatex.js';
import { arxivIdOf, matchToBlocks, fetchArxivMath } from './arxivMath.js';

export const MATH_KV_KEY = 'library_math_v1';
export const MATH_CAP = 1500;        // model calls, ever (owner 2026-11-08)
export const MATH_PRESS_MAX = 12;    // model calls per press of the button
export const MATH_BATCH = 25;        // equations per call
export const SHOW_CONF = CONF_OK;    // below this the reader shows the crop
const ARXIV_RETRY_MS = 30 * 86_400_000;
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export const mathFileKey = (uploadKey, id) => uploadKey(id, 'math.json');
export const emptyMathFile = () => ({ v: 1, eq: {}, at: null });
export function readMathFile(buf) {
  try { const j = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)); if (j?.v === 1 && isPlain(j.eq)) return j; } catch { /* empty */ }
  return emptyMathFile();
}

// ── LaTeX validation (KaTeX; a structural check when KaTeX cannot be loaded) ───────────────────────────────────
let katexP = null;
export function loadKatex() { katexP ??= import('katex').then(m => m.default ?? m).catch(() => null); return katexP; }
function structurallyOk(s) {
  let d = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '\\') { i++; continue; } if (c === '{') d++; else if (c === '}' && --d < 0) return false; }
  return d === 0 && !/\\(?:input|include|write|def|newcommand|href|url|includegraphics)\b/.test(s);
}
/** (latex) -> boolean. KaTeX parse with throwOnError; commands that read files or run macros are always refused. */
export async function validateLatex(latex) {
  const s = String(latex ?? '');
  if (!s.trim() || s.length > 4000 || !structurallyOk(s)) return false;
  const k = await loadKatex();
  if (!k) return true;
  try { k.renderToString(s, { throwOnError: true, displayMode: true, trust: false, strict: 'ignore', maxSize: 50, maxExpand: 500 }); return true; } catch { return false; }
}

// ── the rule-based layer, merged with the stored layers ────────────────────────────────────────────────────────
const SOURCE_TRUST = { arxiv: 3, model: 2, rule: 1 };
/** The best LaTeX for each eq block: arXiv > model > rule (only what is >= SHOW_CONF is shown). Returns Map(blockIndex -> { latex, source, conf }). */
export async function resolveLatex(blocks, math, { validate = validateLatex } = {}) {
  const out = new Map();
  for (const b of blocks ?? []) {
    if (!b || b.type !== 'eq') continue;
    const cands = [];
    const st = math?.eq?.[b.i];
    if (st?.latex && (st.conf ?? 0) >= SHOW_CONF) cands.push({ latex: st.latex, source: st.source === 'arxiv' ? 'arxiv' : 'model', conf: st.conf });
    if (b.src) { const r = toLatex(b.src, { label: b.label }); if (r.latex && r.conf >= SHOW_CONF) cands.push({ latex: r.latex, source: 'rule', conf: r.conf }); }
    cands.sort((a, c) => SOURCE_TRUST[c.source] - SOURCE_TRUST[a.source]);
    for (const c of cands) { if (await validate(c.latex)) { out.set(b.i, c); break; } }
  }
  return out;
}
/** Blocks for the client: eq blocks get latex, latexSource, latexConf when available; the raw geometry (src) never leaves the server. */
export function mergeLatexIntoBlocks(blocks, resolved) {
  return (blocks ?? []).map(b => {
    if (!b || b.type !== 'eq') return b;
    const { src, ...rest } = b; void src;
    const r = resolved.get(b.i);
    return r ? { ...rest, latex: r.latex, latexSource: r.source, latexConf: r.conf } : rest;
  });
}

// ── layer 3: the model prompt and its reply ────────────────────────────────────────────────────────────────────
export const MATH_SYSTEM = [
  'You convert equations extracted from a PDF into KaTeX-compatible LaTeX. Text only; you cannot see the page.',
  'Each item has an id, "t" (the equation as positioned text: _{...} is a subscript, ^{...} a superscript, {a}/{b} a stacked fraction, sqrt[...] a square root, overline[...] a bar, cases{...} piecewise rows, ; separates lines of a system, <hex> an unreadable glyph), an optional "tag" (equation number), and "pre"/"post" (the sentence before and after the equation, for what the symbols mean).',
  'Reply with ONE JSON object and nothing else: {"results":[{"id":<id>,"latex":"...","confident":true|false}]}. One result per item, same ids.',
  'The LaTeX must parse in KaTeX with no custom macros, no \\tag, no \\label, no text outside the maths, and no $ delimiters; use \\begin{aligned}...\\end{aligned} with & before the relation sign for a system. Use \\mathbb{E}, \\mathcal{N}, \\mathbf for what the context shows is meant.',
  'An item may carry "candidate": an automatic reading of the same equation, unchecked and sometimes wrong. Correct or confirm it against "t" and the context; do not trust it.',
  'Do not invent terms. If the text is too garbled to give the equation, set "confident": false and give your best reading anyway (or an empty string).',
].join('\n');
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const lastSentence = s => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); const parts = t.match(/[^.!?]+[.!?]?/g) ?? [t]; return clip(parts[parts.length - 1] ?? '', 220); };
const firstSentence = s => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); const m = t.match(/^[^.!?]+[.!?]?/); return clip(m ? m[0] : t, 220); };

/** One equation as a prompt item (or null when there is nothing to send). Neighbours: the sentence before and the sentence after. */
export function promptItem(blocks, k) {
  const b = blocks[k]; if (!b || b.type !== 'eq') return null;
  const t = b.src ? linearize(b.src) : '';
  const text = t && t.length >= 2 ? t : clip(b.text, 400);
  if (!text) return null;
  let pre = '', post = '';
  for (let j = k - 1; j >= 0 && j >= k - 3; j--) if (blocks[j].type === 'p') { pre = lastSentence(blocks[j].text); break; }
  for (let j = k + 1; j < blocks.length && j <= k + 3; j++) if (blocks[j].type === 'p') { post = firstSentence(blocks[j].text); break; }
  const o = { id: b.i, t: clip(text, 600) };
  if (b.label) o.tag = String(b.label);
  if (b.src) { const r = toLatex(b.src, { label: b.label }); const c = r.latex.replace(/\\tag\{[^}]*\}/g, ''); if (c && r.conf >= 0.5 && c.length <= 600) o.candidate = c; }
  if (pre) o.pre = pre; if (post) o.post = post;
  return o;
}
export const buildPrompt = items => `Equations to convert (${items.length}):\n${JSON.stringify(items)}`;

/** Model reply (the parsed JSON) -> [{ id, latex, confident }] for the ids that were asked; malformed entries are dropped. */
export function readReply(obj, askedIds) {
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.results) ? obj.results : [];
  const ask = new Set(askedIds), seen = new Set(), out = [];
  for (const r of arr) {
    const id = Number(r?.id); if (!ask.has(id) || seen.has(id) || typeof r?.latex !== 'string') continue;
    seen.add(id);
    out.push({ id, latex: r.latex.trim().replace(/^\$+|\$+$/g, '').replace(/^\\\[|\\\]$/g, '').replace(/\\tag\*?\{[^}]*\}/g, '').trim(), confident: r.confident === true });
  }
  return out;
}

// ── the service ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * deps: { kv:{get,getStrict,put}, r2:{ok,getBuffer,putBuffer}, uploadKey, now(), log,
 *         papers() -> [{ id, hasPdf, hasText, read:boolean, arxivRec:{...} }], getBlocks(id) -> { blocks }|null,
 *         mathModel({ system, prompt, maxTokens }) -> results[] (throws on failure)   (absent = no model: the job says so),
 *         fetchArxiv(id) -> { ok, eqs, from, status }  (default: js/arxivMath.js fetchArxivMath), validate(latex) -> Promise<boolean> }
 */
export function createMath(deps) {
  const { kv, r2, uploadKey } = deps;
  const now = deps.now ?? (() => Date.now()), log = deps.log ?? console, validate = deps.validate ?? validateLatex;
  const fetchArxiv = deps.fetchArxiv ?? (id => fetchArxivMath(id, {}));
  let chain = Promise.resolve();
  const locked = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  const memFiles = new Map();   // when R2 is not configured
  let job = null;
  const arxivBusy = new Set();

  async function readState() {
    const raw = await kv.getStrict(MATH_KV_KEY); let s = null; try { s = raw ? JSON.parse(raw) : null; } catch { s = null; }
    return { v: 1, used: 0, papers: {}, ...(isPlain(s) ? s : {}), papers: isPlain(s?.papers) ? s.papers : {} };
  }
  const mutate = fn => locked(async () => { const s = await readState(); const out = await fn(s); s.at = now(); await kv.put(MATH_KV_KEY, JSON.stringify(s)); return out; });

  async function loadFile(id) {
    try { const b = r2.ok() ? await r2.getBuffer(mathFileKey(uploadKey, id)) : memFiles.get(id); if (b) return readMathFile(b); } catch { /* none */ }
    return emptyMathFile();
  }
  async function saveFile(id, f) {
    f.at = now(); const buf = Buffer.from(JSON.stringify(f));
    if (r2.ok()) await r2.putBuffer(mathFileKey(uploadKey, id), buf, 'application/json'); else { memFiles.set(id, buf); if (memFiles.size > 50) memFiles.delete(memFiles.keys().next().value); }
  }

  /** The stored layers of one paper (for GET /paper). */
  const fileOf = id => loadFile(id);

  /** Layer 2 for one paper: fetch arXiv's HTML once, match the equations to the blocks, store what matched. Safe to call twice; never throws. */
  async function syncArxiv(id, rec, blocks) {
    const aid = arxivIdOf(rec); if (!aid || !blocks?.length || arxivBusy.has(id)) return null;
    arxivBusy.add(id);
    try {
      const f = await loadFile(id);
      if (f.arxiv && (f.arxiv.status === 'ok' || now() - (f.arxiv.at ?? 0) < ARXIV_RETRY_MS)) return f.arxiv;
      const r = await fetchArxiv(aid);
      const eqBlocks = blocks.filter(b => b.type === 'eq').map(b => ({ i: b.i, label: b.label, text: b.text }));
      let matched = 0;
      if (r.ok) {
        const m = matchToBlocks(r.eqs, eqBlocks);
        for (const [i, latex] of m) {
          if (!(await validate(latex))) continue;
          const inf = m.info.get(i); f.eq[i] = { latex, source: 'arxiv', conf: inf?.conf ?? 0.95, at: now() }; matched++;
        }
      }
      f.arxiv = { id: aid, status: r.ok ? 'ok' : r.status, from: r.from ?? null, eqs: r.eqs?.length ?? 0, blocks: eqBlocks.length, matched, at: now() };
      await saveFile(id, f);
      return f.arxiv;
    } catch (e) { log.warn?.(`[library] arxiv math ${id}: ${e.message}`); return null; }
    finally { arxivBusy.delete(id); }
  }

  /** Every eq block arXiv has not solved (rule-based ones too: they are unchecked) and the model has not answered, not yet tried twice. */
  function candidates(blocks, f) {
    const out = [];
    for (const b of blocks ?? []) {
      if (b.type !== 'eq') continue;
      const st = f.eq[b.i]; if (st && (st.source === 'arxiv' || st.source === 'model')) continue;
      if ((f.model?.tried?.[b.i] ?? 0) >= 2) continue;
      out.push(b.i);
    }
    return out;
  }

  async function status() {
    const s = await readState(); const list = (await deps.papers()).filter(p => p.hasPdf || p.hasText);
    const done = list.filter(p => s.papers[p.id]?.done).length;
    return { ok: true, papers: { total: list.length, done, todo: list.length - done }, calls: { used: s.used, cap: MATH_CAP, left: Math.max(0, MATH_CAP - s.used), perPress: MATH_PRESS_MAX, batch: MATH_BATCH }, job: job ? { ...job, errors: job.errors.slice(-8) } : null, model: !!deps.mathModel && deps.modelReady?.() !== false };
  }

  /** Reserve one call against the hard cap BEFORE it is made (a crash cannot lose count). */
  const reserve = () => mutate(async s => { if (s.used >= MATH_CAP) return false; s.used++; return true; });

  async function run(calls, j) {
    const list = (await deps.papers()).filter(p => p.hasPdf || p.hasText);
    const st0 = await readState();
    // papers that have notes first, then the ones known to have the most equations, then the rest
    list.sort((a, b) => (b.read ? 1 : 0) - (a.read ? 1 : 0) || (st0.papers[b.id]?.eq ?? -1) - (st0.papers[a.id]?.eq ?? -1));
    for (const p of list) {
      if (j.calls >= calls) break;
      if (st0.papers[p.id]?.done) continue;
      let doc; try { doc = await deps.getBlocks(p.id); } catch (e) { j.errors.push(`${p.id}: ${e.message.slice(0, 80)}`); continue; }
      const blocks = doc?.blocks ?? []; if (!blocks.length) continue;
      const eqN = blocks.filter(b => b.type === 'eq').length;
      j.stage = `reading equations of ${p.id}`;
      await syncArxiv(p.id, p.arxivRec ?? p, blocks);
      const f = await loadFile(p.id);
      let todo = candidates(blocks, f);
      while (todo.length && j.calls < calls) {
        const batch = todo.slice(0, MATH_BATCH), items = batch.map(i => promptItem(blocks, blocks.findIndex(b => b.i === i))).filter(Boolean);
        if (!items.length) { todo = todo.slice(batch.length); for (const i of batch) (f.model ??= { tried: {} }).tried[i] = 9; continue; }
        if (!(await reserve())) { j.errors.push(`the ${MATH_CAP}-call cap is used up`); j.capped = true; break; }
        j.calls++; f.model ??= { tried: {}, calls: 0 }; f.model.tried ??= {}; f.model.calls = (f.model.calls ?? 0) + 1;
        for (const it of items) f.model.tried[it.id] = (f.model.tried[it.id] ?? 0) + 1;
        try {
          const raw = await deps.mathModel({ system: MATH_SYSTEM, prompt: buildPrompt(items), maxTokens: 6000 });
          for (const r of readReply(raw, items.map(i => i.id))) {
            if (!r.latex || !(await validate(r.latex))) { j.rejected++; continue; }
            const b = blocks.find(x => x.i === r.id); const tag = b?.label && /^[\w.]+$/.test(String(b.label)) ? `\\tag{${b.label}}` : '';
            const latex = r.latex + tag;
            if (tag && !(await validate(latex))) { j.rejected++; continue; }
            f.eq[r.id] = { latex, source: 'model', conf: r.confident ? 0.85 : 0.55, at: now() }; j.eqs++;
          }
        } catch (e) { j.errors.push(`${p.id}: ${String(e.message).slice(0, 120)}`); }
        await saveFile(p.id, f);
        todo = candidates(blocks, f);
        if (j.capped) break;
      }
      if (!j.capped && !candidates(blocks, f).length) await mutate(async s => { s.papers[p.id] = { done: true, at: now(), eq: eqN, model: Object.values(f.eq).filter(x => x.source === 'model').length, arxiv: Object.values(f.eq).filter(x => x.source === 'arxiv').length }; });
      else await mutate(async s => { s.papers[p.id] = { ...(s.papers[p.id] ?? {}), eq: eqN }; });
      if (j.capped) break;
    }
  }

  /** POST: process up to `calls` model calls (1..12) across papers. One job at a time. */
  async function start({ calls = 6 } = {}) {
    if (!deps.mathModel || deps.modelReady?.() === false) return { ok: false, status: 503, error: 'no model key is configured' };
    if (job?.status === 'running') return { ok: false, status: 409, error: 'the equations job is already running', job };
    const n = Math.min(MATH_PRESS_MAX, Math.max(1, Math.floor(Number(calls) || 6)));
    const s = await readState(); if (s.used >= MATH_CAP) return { ok: false, status: 409, error: `the ${MATH_CAP}-call cap is used up`, calls: { used: s.used, cap: MATH_CAP } };
    const j = job = { status: 'running', startedAt: now(), finishedAt: null, calls: 0, max: Math.min(n, MATH_CAP - s.used), eqs: 0, rejected: 0, stage: 'starting', errors: [], capped: false, error: null };
    run(j.max, j).then(() => { j.status = 'done'; j.stage = 'done'; }).catch(e => { j.status = 'error'; j.error = String(e?.message ?? e).slice(0, 200); }).finally(() => { j.finishedAt = now(); });
    return { ok: true, status: 202, job: j };
  }

  return { status, start, fileOf, syncArxiv, candidates, readState, _test: { run, reserve, loadFile, saveFile, getJob: () => job } };
}
