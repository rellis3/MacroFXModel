/**
 * The brief translator (plans/KNOWLEDGE_AND_MONITORS.md, owner direction 2026-11-11): the owner types a research idea in loose words; ONE small model call turns it
 * into a clear brief in researchers' words (owner 2026-11-12: a generic translator, wide not one fixed structure; no forced lags or regimes) that the researchers can work from, and plain code checks every series it names against what the repo holds.
 *
 *   translate(text) -> { ok, id, brief, dataCheck, callsUsed, callsCap }   brief: kind, restated, hypothesis, mechanism, lenses, target?, variables?, missing, assumptions, one question
 *   status()        -> { ok, callsUsed, callsCap, callsLeft }                 free
 *
 * Rules: the model may only pick series ids from the catalogue it is shown (an id it makes up is moved to "unknown" and shown as missing); have / missing and
 * "ready for the quick test" are decided by CODE, never by the model; it states assumptions instead of asking, and asks at most ONE question; it never states a
 * result. The call is capped (KV research_brief_v1, reserved BEFORE the call, fail closed). Briefs are kept privately in R2 research/briefs/<id>.json.
 * No network, model or storage at import: everything is injected. Tested in js/researchBrief.test.mjs.
 */
import { createHash } from 'node:crypto';

export const BRIEF_KV_KEY = 'research_brief_v1';
export const BRIEF_CAP = 100;        // model calls, ever (proposed default; the owner sets the number)
export const BRIEF_TEXT_MAX = 4000;
export const BRIEF_R2_PREFIX = 'research/briefs/';
const BAD_TEXT = /[<>]|https?:|www\.|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i;
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const plain = (s, n) => { const t = clip(s, n); return BAD_TEXT.test(t) ? '' : t; };
const list = (a, n, len) => (Array.isArray(a) ? a : []).map(x => plain(x, len)).filter(Boolean).slice(0, n);

export const BRIEF_SYSTEM = `You help an owner who is not a quant put a research idea into clear words for a room of researchers with different lenses (quant, macro, volatility, flow, a sceptic, a librarian). The room decides how to study it. Your job is translation, not research design.
Do this:
- Restate the idea faithfully, in plain and precise words a researcher would use. Fix spelling and vague terms; keep the owner's meaning.
- Keep the kind of idea the owner wrote. A question or "how does this work" stays a question; a proposed test stays a test; "how do I build a system" stays a system-design question. Never narrow a broad idea down to one test.
- Keep the owner's own judgements, doubts and conclusions explicitly (for example "I don't think this is possible").
- Add no method the owner did not ask for. If structure the owner gave matters (horizons, lags, splits by regime, a condition, which markets), write it into the restated text where it belongs.
- Offer 2 to 5 lenses: different ways the room could look at the problem (for example a practitioner view, a mechanism, what the literature says, what the desk's own past tests found, something to measure). They are options for the room, not a plan.
- Name variables only where the idea points at something measurable; use catalogue ids where one fits, otherwise leave components empty and describe it in words.
- Besides the catalogue (daily series the quick test can read), the desk holds 1-minute and daily open-high-low-close bars for about 40 FX, index, metal and energy markets, the owner's daily range and volatility levels for them, options implied volatility, and a record of past tests. Never list those as missing. List as missing only data the desk plainly lacks, with the name of a free source.
- Choose series ids ONLY from the catalogue you are given; never invent an id.
- State the assumptions you made. Ask at most ONE question, only if you truly cannot go on; otherwise leave it empty.
- Never say or imply that the idea works, is profitable or has an edge. No trading advice. Plain text only: no markup and no links.
Reply with ONE JSON object and nothing else.`;

/** The catalogue as compact lines "id: label" so the model can only pick real ids. */
export const catalogueText = catalogue => Object.entries(catalogue ?? {}).map(([id, c]) => `${id}: ${c.label}`).join('\n');

export const KINDS = ['question', 'test', 'system', 'explanation'];
export function buildPrompt(text, catalogue) {
  return `OWNER'S IDEA, in their own words:\n"""\n${clip(text, BRIEF_TEXT_MAX)}\n"""\n\nCATALOGUE (the only series ids you may use):\n${catalogueText(catalogue)}\n\n`
    + `Reply with this JSON:\n{\n  "title": "under 70 characters",\n  "kind": "question | test | system | explanation (what the owner is asking for)",\n`
    + `  "restated": "the idea in clear, precise words, 2 to 6 sentences, keeping the owner's doubts and any structure they gave",\n`
    + `  "hypothesis": "the core of it in one line: the claim, or the question",\n  "mechanism": "what might be going on underneath, one or two sentences, or empty",\n`
    + `  "lenses": [ { "name": "a few words", "angle": "one or two sentences: a way the room could look at it" } ],\n`
    + `  "target": { "series": "a catalogue id, or empty", "label": "plain name, or empty", "note": "" },\n`
    + `  "variables": [ { "name": "plain name", "construction": "how it is measured", "components": ["catalogue ids it is built from, or none"], "transform": "", "role": "leader | follower | condition | control" } ],\n`
    + `  "missing": [ { "what": "data the desk plainly lacks", "suggestedSource": "a named free source" } ],\n`
    + `  "assumptions": ["each assumption you made, at most 6"],\n  "question": "",\n  "searchTerms": ["at most 8 words or phrases to search the papers and lessons with"]\n}\n`
    + `variables and target may be empty when the idea is not about specific series.`;
}

const ROLES = ['leader', 'follower', 'condition', 'control'];
/** Model reply -> { ok, brief } or { ok:false, error }. Strict: bad ids are moved out, long text clipped, markup or links dropped. */
export function parseBrief(modelJson, catalogue) {
  let o = modelJson;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return { ok: false, error: 'the reply was not JSON' }; } }
  if (!isPlain(o)) return { ok: false, error: 'the reply was not an object' };
  const has = id => typeof id === 'string' && Object.hasOwn(catalogue ?? {}, id);
  const title = plain(o.title, 70), hypothesis = plain(o.hypothesis, 400);
  if (!title || !hypothesis) return { ok: false, error: 'the reply has no title or hypothesis' };
  const tSeries = typeof o.target?.series === 'string' ? o.target.series.trim() : '';
  const variables = (Array.isArray(o.variables) ? o.variables : []).slice(0, 6).map(v => {
    if (!isPlain(v)) return null;
    const comps = (Array.isArray(v.components) ? v.components : []).map(c => String(c ?? '').trim()).filter(Boolean).slice(0, 8);
    const name = plain(v.name, 80), construction = plain(v.construction, 300);
    if (!name || !construction) return null;
    return { name, construction, components: comps.filter(has), unknownComponents: comps.filter(c => !has(c)), transform: plain(v.transform, 160), role: ROLES.includes(v.role) ? v.role : 'leader' };
  }).filter(Boolean);
  return { ok: true, brief: {
    title, kind: KINDS.includes(o.kind) ? o.kind : 'question', restated: plain(o.restated, 1200) || hypothesis, hypothesis, mechanism: plain(o.mechanism, 400),
    lenses: (Array.isArray(o.lenses) ? o.lenses : []).slice(0, 5).map(x => ({ name: plain(x?.name, 60), angle: plain(x?.angle, 300) })).filter(x => x.name && x.angle),
    target: { series: has(tSeries) ? tSeries : '', unknownSeries: tSeries && !has(tSeries) ? tSeries.slice(0, 60) : '', label: plain(o.target?.label, 80), note: plain(o.target?.note, 200) },
    variables,
    missing: (Array.isArray(o.missing) ? o.missing : []).slice(0, 6).map(x => ({ what: plain(x?.what, 160), suggestedSource: plain(x?.suggestedSource, 120) })).filter(x => x.what),
    assumptions: list(o.assumptions, 6, 240), question: plain(o.question, 240), searchTerms: list(o.searchTerms, 8, 60),
  } };
}

/** Plain code, not the model: which named series we hold, what must be built, and whether the existing quick test can take it as it stands. */
export function dataCheck(brief, catalogue) {
  const row = id => ({ id, have: Object.hasOwn(catalogue ?? {}, id), label: catalogue?.[id]?.label ?? null });
  const vars = (brief?.variables ?? []).map(v => ({ name: v.name, role: v.role, components: v.components.map(row), unknown: v.unknownComponents ?? [], derived: v.components.length > 1 }));
  const target = brief?.target?.series ? row(brief.target.series) : null;
  const unknown = [...vars.flatMap(v => v.unknown), ...(brief?.target?.unknownSeries ? [brief.target.unknownSeries] : [])];
  const missingList = brief?.missing ?? [];
  const leaders = vars.filter(v => v.role === 'leader');
  const allHave = !!target && unknown.length === 0 && missingList.length === 0;
  const derived = leaders.filter(v => v.derived).map(v => v.name);
  const applicable = !!target || vars.length > 0;   // a question or system idea names no series: no data check to show
  const quickTestReady = allHave && leaders.length === 1 && leaders[0].components.length === 1;
  const notes = [];
  if (applicable && !target) notes.push('no target series from the catalogue: the thing to be predicted needs choosing');
  if (unknown.length) notes.push(`series not in the catalogue: ${unknown.join(', ')}`);
  if (derived.length) notes.push(`${derived.join('; ')} must be built from its parts first: the quick test takes one catalogue series as the leader`);
  if (missingList.length) notes.push(`missing data: ${missingList.map(x => x.what).join('; ')}`);
  return { applicable, allHave, quickTestReady, target, variables: vars, unknown, derivedLeaders: derived, notes };
}

const hash = s => createHash('sha256').update(String(s)).digest('hex').slice(0, 8);

/**
 * deps: { kv:{ getStrict, put }, r2:{ ok, putBuffer }, model({system,prompt,maxTokens}) -> reply, modelReady?(), catalogue, now?() }
 */
export function createBriefService(deps) {
  const { kv, r2, catalogue } = deps, now = deps.now ?? (() => Date.now());
  let chain = Promise.resolve();
  const locked = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  async function readUsed() {
    const raw = await kv.getStrict(BRIEF_KV_KEY); let s = null; try { s = raw ? JSON.parse(raw) : null; } catch { s = null; }
    return Number.isFinite(s?.used) ? s.used : 0;
  }
  const reserve = () => locked(async () => { const used = await readUsed(); if (used >= BRIEF_CAP) return false; await kv.put(BRIEF_KV_KEY, JSON.stringify({ v: 1, used: used + 1, at: now() })); return true; });

  async function status() {
    try { const used = await readUsed(); return { ok: true, callsUsed: used, callsCap: BRIEF_CAP, callsLeft: Math.max(0, BRIEF_CAP - used), model: !!deps.model && deps.modelReady?.() !== false }; }
    catch { return { ok: true, callsUsed: null, callsCap: BRIEF_CAP, callsLeft: null, model: false }; }
  }

  async function translate(text) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (t.length < 12) return { ok: false, status: 400, error: 'write a sentence or two about the idea first' };
    if (t.length > BRIEF_TEXT_MAX) return { ok: false, status: 400, error: `keep it under ${BRIEF_TEXT_MAX} characters` };
    if (!deps.model || deps.modelReady?.() === false) return { ok: false, status: 503, error: 'no model key is configured, so the idea cannot be translated' };
    let ok; try { ok = await reserve(); } catch (e) { return { ok: false, status: 503, error: `the call counter cannot be read, so nothing was sent: ${String(e.message).slice(0, 100)}` }; }   // fail closed
    if (!ok) return { ok: false, status: 409, error: `the ${BRIEF_CAP}-call cap for the brief translator is used up`, callsCap: BRIEF_CAP };
    let reply;
    try { reply = await deps.model({ system: BRIEF_SYSTEM, prompt: buildPrompt(t, catalogue), maxTokens: 2500 }); }
    catch (e) { return { ok: false, status: 502, error: `the model call failed: ${String(e.message ?? e).slice(0, 160)}` }; }
    const p = parseBrief(reply, catalogue);
    if (!p.ok) return { ok: false, status: 502, error: `the reply could not be used (${p.error}); it still counted against the cap` };
    const id = `b-${now().toString(36)}-${hash(t)}`, check = dataCheck(p.brief, catalogue);
    if (r2?.ok?.()) { try { await r2.putBuffer(`${BRIEF_R2_PREFIX}${id}.json`, Buffer.from(JSON.stringify({ v: 1, id, at: now(), ownerText: t, brief: p.brief, dataCheck: check })), 'application/json'); } catch { /* the brief is still returned */ } }
    const used = await readUsed().catch(() => null);
    return { ok: true, status: 200, id, brief: p.brief, dataCheck: check, callsUsed: used, callsCap: BRIEF_CAP };
  }
  return { translate, status };
}
