// The Paper Library's figure and table notes (plans/PAPER_LIBRARY.md): one short plain-English "what this shows" per figure and table, written by
// DeepSeek (task 'library-figs') from the paper's TEXT only: the caption, the paragraphs that mention it, the numeric cells of a table and the
// axis/legend text that sits inside a figure's box. DeepSeek has no vision; a note is never a reading of the picture and is labelled that way.
//
// Storage: R2 research/papers/<id>.figs.json  { v:1, notes:{ 'Figure 5':{ text, confident, at } }, tried:{ key:n }, calls, at }.
//          KV library_figs_v1  { v:1, used, papers:{ [id]:{ done, at, tasks, notes } }, at }  (the HARD CAP of 600 model calls lives here).
// No network or model call is made at import; the model is injected (deps.figsModel).

export const FIGS_KV_KEY = 'library_figs_v1';
export const FIGS_CAP = 600;         // model calls, ever (owner 2026-11-08)
export const FIGS_PRESS_MAX = 12;    // model calls per press of the button
export const FIGS_BATCH = 12;        // figures and tables per call
export const FIGS_PROMPT_MAX = 14000;   // characters of task JSON per call; more is split into another call
export const NOTE_MAX = 320;
export const FIGS_LABEL = "from the paper's text (not a reading of the picture)";
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

export const figsFileKey = (uploadKey, id) => uploadKey(id, 'figs.json');
export const emptyFigsFile = () => ({ v: 1, notes: {}, tried: {}, calls: 0, at: null });
export function readFigsFile(buf) {
  try { const j = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)); if (j?.v === 1 && isPlain(j.notes)) return { ...emptyFigsFile(), ...j, tried: isPlain(j.tried) ? j.tried : {} }; } catch { /* empty */ }
  return emptyFigsFile();
}

// ── 1. the tasks of a paper ─────────────────────────────────────────────────────────────────────────────────────
const LABEL_RE = /^(Figure|Table)\s+(\d+|[IVX]+)$/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function refRegex(kind, n) {
  const w = kind === 'table' ? '(?:Tables?|Tabs?\\.?)' : '(?:Figures?|Figs?\\.?)';
  // "Figure 5", "Fig. 5a", "Figures 3 and 5", "Tables 4, 5 and 6"
  return new RegExp(`\\b${w}\\s*(?:(?:\\d+|[IVX]+)[a-z]?\\s*(?:,|and|&|–|-|to)\\s*)*${esc(n)}[a-z]?(?![\\d.]\\d)\\b`, 'i');
}
const DOT = '\u0001';   // a full stop that does not end a sentence (Fig. 5, et al., e.g.)
function sentencesOf(t) {
  const x = String(t ?? '').replace(/\s+/g, ' ').trim().replace(/\b(Figs?|Tabs?|Eqs?|Sec|No|vs|cf|al|e\.g|i\.e|approx)\.(?=\s)/gi, `$1${DOT}`);
  return (x.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? []).map(s => s.replaceAll(DOT, '.').trim()).filter(Boolean);
}
/** The sentence that holds the reference, plus the one after it, within 400 characters. */
function excerpt(text, re) {
  const ss = sentencesOf(text), k = ss.findIndex(s => re.test(s));
  if (k < 0) return null;
  let out = ss[k];
  if (out.length > 400) { const at = out.search(re); const a = Math.max(0, at - 140); out = (a ? '…' : '') + out.slice(a, a + 399); }
  else if (ss[k + 1] && out.length + 1 + ss[k + 1].length <= 400) out += ` ${ss[k + 1]}`;
  return clip(out, 400);
}

/**
 * blocks -> [{ key:'Figure 5'|'Table 5', kind:'figure'|'table', caption, mentions:[<=4 excerpts], refs, block, cells|inText }].
 * Only labelled figure/table blocks that have something to say about them (a caption, a mention, cells or in-figure text).
 */
export function collectFigureTasks(blocks) {
  const list = Array.isArray(blocks) ? blocks.filter(b => b && typeof b === 'object') : [];
  const byKey = new Map();
  for (const b of list) {
    if (b.type !== 'fig' && b.type !== 'table') continue;
    const m = String(b.label ?? '').match(LABEL_RE); if (!m) continue;
    const key = `${m[1]} ${m[2]}`, kind = m[1] === 'Table' ? 'table' : 'figure';
    const had = byKey.get(key); if (had && (had.cells || had.inText || !(b.cells || b.inText))) continue;   // the first block, unless a later one carries more
    byKey.set(key, { key, kind, b, n: m[2] });
  }
  const paras = list.filter(b => b.type === 'p' && !b.foot && typeof b.text === 'string');
  const out = [];
  for (const { key, kind, b, n } of byKey.values()) {
    const re = refRegex(kind, n), mentions = []; let refs = 0;
    for (const p of paras) {
      if (!re.test(p.text)) continue;
      refs++;
      if (mentions.length < 4) { const e = excerpt(p.text, re); if (e) mentions.push(e); }
    }
    const caption = clip(String(b.text ?? '').replace(/^\s*(?:figure|fig\.|table|tab\.)\s*(?:\d+|[IVX]+)\s*[:.—–|-]?\s*/i, ''), 400);
    const t = { key, kind, caption, mentions, refs, block: b.i ?? null };
    if (kind === 'table' && Array.isArray(b.cells) && b.cells.length) t.cells = b.cells.slice(0, 40).map(r => clip(r, 240));
    if (kind === 'figure' && typeof b.inText === 'string' && b.inText.trim()) t.inText = clip(b.inText, 300);
    if (!t.caption && !t.mentions.length && !t.cells && !t.inText) continue;
    out.push(t);
  }
  return out;
}

// ── 2. the prompt ───────────────────────────────────────────────────────────────────────────────────────────────
export const FIGS_SYSTEM = [
  'You write one short plain-English note for each figure and table of a finance research paper, so a reader (or a listener) knows what it shows. You cannot see the picture: work only from the text supplied.',
  'Each item has "key" (e.g. "Figure 5"), "kind", "caption", "mentions" (paragraph excerpts from the paper that refer to it), and either "cells" (a table: one row per string, cells separated by |) or "inText" (a figure: axis titles, legend labels and tick labels found inside its box).',
  'Reply with ONE JSON object and nothing else: {"notes":[{"key":"Figure 5","text":"...","confident":true|false}]}. One note per item, same keys.',
  'Each text is one or two plain sentences, at most 300 characters, saying what is plotted or tabulated and, if the supplied text says so, the main pattern or finding it supports. Say what a reader should look for, not how it looks.',
  'Use ONLY numbers that appear in the supplied caption, mentions, cells or inText. Never compute, estimate or invent a number (no averages, differences or counts of your own); you may round a supplied number to fewer decimals. If you have no number worth quoting, quote none.',
  'Never describe colours, shapes, slopes or positions that the text does not state. If the supplied text is too thin to say anything useful, set "confident": false and give the safest short description from the caption, or an empty text.',
].join('\n');

/** Tasks -> the user prompt (JSON items under a header naming the paper). */
export function buildPrompt(tasks, paperTitle, abstract) {
  const items = (tasks ?? []).map(t => {
    const o = { key: t.key, kind: t.kind, caption: t.caption };
    if (t.mentions?.length) o.mentions = t.mentions;
    if (t.cells?.length) o.cells = t.cells;
    if (t.inText) o.inText = t.inText;
    return o;
  });
  const head = [`Paper: ${clip(paperTitle, 200) || 'untitled'}`];
  const abs = clip(abstract, 600); if (abs) head.push(`Abstract: ${abs}`);
  return `${head.join('\n')}\nFigures and tables to note (${items.length}):\n${JSON.stringify(items)}`;
}

/** Splits tasks into model calls: at most FIGS_BATCH tasks and about FIGS_PROMPT_MAX characters of JSON each. */
export function splitBatches(tasks, { batch = FIGS_BATCH, maxChars = FIGS_PROMPT_MAX } = {}) {
  const out = []; let cur = [], size = 0;
  for (const t of tasks) {
    const n = JSON.stringify(t).length;
    if (cur.length && (cur.length >= batch || size + n > maxChars)) { out.push(cur); cur = []; size = 0; }
    cur.push(t); size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ── 3. the reply, and the guard against invented numbers ───────────────────────────────────────────────────────
const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
const toNum = s => Number(String(s).replace(/,/g, ''));
const decimals = s => { const m = String(s).replace(/,/g, '').match(/\.(\d+)$/); return m ? m[1].length : 0; };
/** Every number printed in `text` as { v, d } (value, decimals shown). */
export function numbersIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(NUM_RE)) { const v = toNum(m[0]); if (Number.isFinite(v)) out.push({ v, d: decimals(m[0]) }); }
  return out;
}
/** Is the number `n` in a note backed by the supplied numbers? Same value, a rounding to fewer decimals, or a fraction/percentage of one (0.59 <-> 59). */
function backed(n, supplied) {
  const tol = 0.5 * 10 ** -n.d + 1e-9;
  for (const s of supplied) {
    if (n.v === s.v) return true;
    if (n.d < s.d && Math.abs(n.v - s.v) <= tol) return true;                       // rounded to fewer decimals: 0.5 for 0.52
    if (s.v <= 1.5 && Math.abs(n.v - s.v * 100) <= tol) return true;                // a fraction said as a percentage: 59 for 0.59
    if (s.v >= 1 && n.v <= 1.5 && n.d >= 1 && Math.abs(n.v - s.v / 100) <= tol) return true;   // a percentage said as a fraction: 0.59 for 59
  }
  return false;
}
/** Numbers of the note that are not found in the material of its task (the label "Figure 5" itself is not a figure of merit). */
export function unbackedNumbers(text, task) {
  const stripped = String(text ?? '').replace(/\b(?:Figures?|Figs?\.?|Tables?|Tabs?\.?)\s*\d+[a-z]?(?:\s*(?:,|and|&|to|–|-)\s*\d+[a-z]?)*/gi, ' ').replace(/\b(?:Panels?|Models?|Columns?|Rows?|Steps?)\s+\d+\b/gi, ' ');
  const src = [task.caption, ...(task.mentions ?? []), ...(task.cells ?? []), task.inText ?? ''].join('\n');
  const supplied = numbersIn(src);
  return numbersIn(stripped).filter(n => !backed(n, supplied));
}

/**
 * Model reply -> { notes:{ [key]:{ text, confident } }, rejected:[{ key, why }] }. Strict: {"notes":[{key,text,confident}]} (a bare array is accepted too).
 * A note is kept only if its key was asked, it is non-empty, fits in NOTE_MAX (cut at a sentence end if a little long), has no markup/links, and
 * introduces no number that is absent from the supplied caption / mentions / cells / inText (see backed()).
 */
export function parseNotes(modelJson, tasks) {
  let obj = modelJson;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { return { notes: {}, rejected: [{ key: null, why: 'not JSON' }] }; } }
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.notes) ? obj.notes : null;
  if (!arr) return { notes: {}, rejected: [{ key: null, why: 'no notes array' }] };
  const byKey = new Map((tasks ?? []).map(t => [t.key, t]));
  const notes = {}, rejected = [];
  for (const r of arr) {
    const key = typeof r?.key === 'string' ? r.key.trim() : '', task = byKey.get(key);
    if (!task) { rejected.push({ key: key || null, why: 'unknown key' }); continue; }
    if (notes[key]) continue;
    let text = typeof r.text === 'string' ? r.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) { rejected.push({ key, why: 'empty' }); continue; }
    if (text.length > NOTE_MAX) {
      const cut = text.slice(0, NOTE_MAX), at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      if (at < 60) { rejected.push({ key, why: 'too long' }); continue; }
      text = cut.slice(0, at + 1);
    }
    if (/[<>]|https?:|www\./i.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) { rejected.push({ key, why: 'markup or link' }); continue; }
    const bad = unbackedNumbers(text, task);
    if (bad.length) { rejected.push({ key, why: `number not in the paper's text: ${bad.slice(0, 3).map(n => n.v).join(', ')}` }); continue; }
    notes[key] = { text, confident: r.confident === true };
  }
  return { notes, rejected };
}

// ── 4. the notes on the blocks the reader and the listen scripts use ───────────────────────────────────────────
/** Blocks with `note`, `noteConfident` and `noteRefs` (how often the paper refers to it) on each labelled figure/table that has a note. Pure. */
export function mergeNotesIntoBlocks(blocks, file) {
  const notes = file?.notes; if (!Array.isArray(blocks) || !isPlain(notes) || !Object.keys(notes).length) return blocks;
  const refs = new Map(collectFigureTasks(blocks).map(t => [t.key, t.refs]));
  return blocks.map(b => {
    if (!b || (b.type !== 'fig' && b.type !== 'table') || !b.label) return b;
    const n = notes[b.label]; if (!n || typeof n.text !== 'string' || !n.text) return b;
    return { ...b, note: n.text, noteConfident: n.confident === true, noteRefs: refs.get(b.label) ?? 0 };
  });
}

// ── 5. the service ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * deps: { kv:{get,getStrict,put}, r2:{ok,getBuffer,putBuffer}, uploadKey, now(), log,
 *         papers() -> [{ id, hasPdf, hasText, read:boolean, title, abstract }], getBlocks(id) -> { blocks }|null,
 *         figsModel({ system, prompt, maxTokens }) -> the parsed reply (throws on failure)   (absent = no model: the job says so),
 *         modelReady() -> boolean }
 */
export function createFigs(deps) {
  const { kv, r2, uploadKey } = deps;
  const now = deps.now ?? (() => Date.now()), log = deps.log ?? console;
  let chain = Promise.resolve();
  const locked = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  const memFiles = new Map();   // when R2 is not configured
  let job = null;

  async function readState() {
    const raw = await kv.getStrict(FIGS_KV_KEY); let s = null; try { s = raw ? JSON.parse(raw) : null; } catch { s = null; }
    return { v: 1, used: 0, ...(isPlain(s) ? s : {}), papers: isPlain(s?.papers) ? s.papers : {} };
  }
  const mutate = fn => locked(async () => { const s = await readState(); const out = await fn(s); s.at = now(); await kv.put(FIGS_KV_KEY, JSON.stringify(s)); return out; });

  async function loadFile(id) {
    try { const b = r2.ok() ? await r2.getBuffer(figsFileKey(uploadKey, id)) : memFiles.get(id); if (b) return readFigsFile(b); } catch { /* none */ }
    return emptyFigsFile();
  }
  async function saveFile(id, f) {
    f.at = now(); const buf = Buffer.from(JSON.stringify(f));
    if (r2.ok()) await r2.putBuffer(figsFileKey(uploadKey, id), buf, 'application/json'); else { memFiles.set(id, buf); if (memFiles.size > 50) memFiles.delete(memFiles.keys().next().value); }
  }
  /** The stored notes of one paper; never throws (a missing or broken file is "no notes"). */
  const fileOf = id => loadFile(id).catch(() => emptyFigsFile());

  /** Tasks with no note yet and fewer than two failed tries. */
  const candidates = (tasks, f) => tasks.filter(t => !f.notes[t.key] && (f.tried[t.key] ?? 0) < 2);

  async function status() {
    const s = await readState(); const list = (await deps.papers()).filter(p => p.hasPdf || p.hasText);
    const done = list.filter(p => s.papers[p.id]?.done).length;
    return { ok: true, papers: { total: list.length, done, todo: list.length - done }, calls: { used: s.used, cap: FIGS_CAP, left: Math.max(0, FIGS_CAP - s.used), perPress: FIGS_PRESS_MAX, batch: FIGS_BATCH }, job: job ? { ...job, errors: job.errors.slice(-8) } : null, model: !!deps.figsModel && deps.modelReady?.() !== false };
  }

  /** Reserve one call against the hard cap BEFORE it is made (a crash cannot lose count). */
  const reserve = () => mutate(async s => { if (s.used >= FIGS_CAP) return false; s.used++; return true; });

  async function run(calls, j) {
    const list = (await deps.papers()).filter(p => p.hasPdf || p.hasText);
    const st0 = await readState();
    // papers with desk notes first, then the ones known to have the most figures and tables, then the rest
    list.sort((a, b) => (b.read ? 1 : 0) - (a.read ? 1 : 0) || (st0.papers[b.id]?.tasks ?? -1) - (st0.papers[a.id]?.tasks ?? -1));
    for (const p of list) {
      if (j.calls >= calls) break;
      if (st0.papers[p.id]?.done) continue;
      let doc; try { doc = await deps.getBlocks(p.id); } catch (e) { j.errors.push(`${p.id}: ${String(e.message).slice(0, 80)}`); continue; }
      const blocks = doc?.blocks ?? []; if (!blocks.length) continue;
      const tasks = collectFigureTasks(blocks);
      j.stage = `noting figures of ${p.id}`;
      const f = await loadFile(p.id);
      let todo = candidates(tasks, f);
      while (todo.length && j.calls < calls) {
        const batch = splitBatches(todo)[0];
        if (!(await reserve())) { j.errors.push(`the ${FIGS_CAP}-call cap is used up`); j.capped = true; break; }
        j.calls++; f.calls = (f.calls ?? 0) + 1;
        for (const t of batch) f.tried[t.key] = (f.tried[t.key] ?? 0) + 1;
        try {
          const raw = await deps.figsModel({ system: FIGS_SYSTEM, prompt: buildPrompt(batch, p.title, p.abstract), maxTokens: 3000 });
          const r = parseNotes(raw, batch);
          for (const [key, n] of Object.entries(r.notes)) { f.notes[key] = { ...n, at: now() }; j.notes++; }
          j.rejected += r.rejected.length;
        } catch (e) { j.errors.push(`${p.id}: ${String(e.message).slice(0, 120)}`); }
        await saveFile(p.id, f);
        todo = candidates(tasks, f);
        if (j.capped) break;
      }
      if (!j.capped && !candidates(tasks, f).length) await mutate(async s => { s.papers[p.id] = { done: true, at: now(), tasks: tasks.length, notes: Object.keys(f.notes).length }; });
      else await mutate(async s => { s.papers[p.id] = { ...(s.papers[p.id] ?? {}), tasks: tasks.length }; });
      if (j.capped) break;
    }
  }

  /** POST: process up to `calls` model calls (1..12) across papers. One job at a time. */
  async function start({ calls = 6 } = {}) {
    if (!deps.figsModel || deps.modelReady?.() === false) return { ok: false, status: 503, error: 'no model key is configured' };
    if (job?.status === 'running') return { ok: false, status: 409, error: 'the figure-notes job is already running', job };
    const n = Math.min(FIGS_PRESS_MAX, Math.max(1, Math.floor(Number(calls) || 6)));
    const s = await readState(); if (s.used >= FIGS_CAP) return { ok: false, status: 409, error: `the ${FIGS_CAP}-call cap is used up`, calls: { used: s.used, cap: FIGS_CAP } };
    const j = job = { status: 'running', startedAt: now(), finishedAt: null, calls: 0, max: Math.min(n, FIGS_CAP - s.used), notes: 0, rejected: 0, stage: 'starting', errors: [], capped: false, error: null };
    run(j.max, j).then(() => { j.status = 'done'; j.stage = 'done'; }).catch(e => { j.status = 'error'; j.error = String(e?.message ?? e).slice(0, 200); }).finally(() => { j.finishedAt = now(); });
    return { ok: true, status: 202, job: j };
  }

  void log;
  return { status, start, fileOf, candidates, readState, _test: { run, reserve, loadFile, saveFile, getJob: () => job } };
}
