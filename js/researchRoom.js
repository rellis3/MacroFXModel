/**
 * Research rooms (owner, 2026-11-12): one research case shown as a conversation at a table. Each idea gets a room. The
 * owner's words go to the brief translator, the Evidence Book check says what is already on file (code, free), the
 * librarian's papers are posted, and the three core researchers (quant, macro, flow) discuss, taking turns. Guests
 * (vol and options, rates and curves, a skeptic, the theory desk) join when the owner accepts them, at most two per room.
 * The Head of Research joins only when the owner calls. Nothing runs on its own: every model call starts with a button.
 *
 * A room IS a research case (js/researchCase.js, KV research_cases) with a `room` block:
 *   room: { v:1, brief, dataCheck, ownerText, shape, onFile[], library{ ids, papers[] }, suggested[], guests[], benched[], talk[] }
 * The rounds, the Head's reviews, the proposals and the jobs are the case's own, so the Desk Office research tab keeps working.
 *
 * Short remarks ("talk"): a guest's remark, or "Let them discuss" (each seat at the table gives one short reaction or
 * passes). Each is ONE small model call (task 'research-room') over the conversation only, not the whole Evidence Book,
 * so about a tenth of a researcher's answer. Hard cap in KV research_room_talk_v1, reserved before the call, fail closed.
 * The researchers and the Head read the remarks in their next prompt (roomText).
 *
 * Proposals and remarks, not results. Pure (the counter takes an injected kv). Tested in js/researchRoom.test.mjs.
 */
import { RESEARCHERS } from './researchPod.js';
import { newCase, latestReview, pickRelevant, clip, caseText } from './researchCase.js';

export const CORE = ['quant', 'macro', 'flow'];
export const MAX_GUESTS = 2;
export const MAX_TALK = 80;                       // remarks kept per room
export const TALK_CAP = 300;                      // model calls, ever (proposed default; the owner sets the number)
export const TALK_KV_KEY = 'research_room_talk_v1';
export const TALK_PER_PRESS = 5;
export const SHAPES = {
  'lead-lag': 'Does A lead B?',
  'after-event': 'After X, what happens next?',
  regime: 'When does it work (which regime)?',
  'fade-follow': 'Fade or follow at a level?',
  'read-something': 'Something I read or watched',
};

/** Every seat the page can draw: who they are and their initials. Core lenses come from the research pod. */
export const SEATS = {
  owner: { label: 'You', short: 'You' },
  translator: { label: 'Translator', short: 'Tr' },
  onfile: { label: 'Already on file', short: 'EB' },
  librarian: { label: 'Librarian', short: 'Li' },
  quant: { label: RESEARCHERS.quant.label, short: 'Q' },
  macro: { label: RESEARCHERS.macro.label, short: 'M' },
  flow: { label: RESEARCHERS.flow.label, short: 'F' },
  head: { label: 'Head of Research', short: 'H' },
  system: { label: 'Room', short: '·' },
};

/**
 * The guests: a fixed list, picked to fit each room. Each is a short voice (a remark, not a full proposal round), with a
 * plain lens. `topics` decides when code suggests it. Adding a guest is one entry here.
 */
export const GUESTS = {
  volopt: { label: 'Vol & options', short: 'VO', topics: /\b(vol|volatility|implied|iv|options?|gamma|gex|vix|skew|straddle|jump|jumps|variance|expir\w*|dealer|vanna|charm|strike|open interest)\b/i,
    lens: 'volatility and options: implied vs realised volatility, the vol surface and skew, dealer gamma and open interest, expiries, jumps and jump intensity. You know where options flows move spot and where they do not.' },
  rates: { label: 'Rates & curves', short: 'RC', topics: /\b(yield|yields|curve|curves|2s10s|slope|rate|rates|bond|bonds|treasur\w*|bund|gilt|jgb|swap|term premium|real yield|breakeven|central bank|fed|ecb|boe|boj|policy)\b/i,
    lens: 'rates and curves: yield levels and slopes, term premia, real yields and breakevens, policy expectations and how curves lead or follow currencies and equities.' },
  skeptic: { label: 'Skeptic', short: 'Sk', topics: /\b(edge|always|works|profit\w*|sure|proven|reverse.engineer\w*|layers?|system)\b/i,
    lens: 'the skeptic: you look for what is wrong with the idea before anyone tests it: look-ahead, data snooping, too many variants, a sample too small to tell, a cost that eats the effect, an Evidence Book null it repeats. You are fair: say what would convince you.' },
  theory: { label: 'Theory desk', short: 'Th', topics: /\b(theory|paper|papers|literature|model|merton|black.litterman|meta.label\w*|hmm|regime.switch\w*|garch|har)\b/i,
    lens: 'theory: what the established models and papers say about the mechanism, which assumptions they need, and which earlier questions in the register it repeats.' },
};
export const GUEST_IDS = Object.keys(GUESTS);
const seatOf = who => SEATS[who] ?? (GUESTS[who] ? { label: GUESTS[who].label, short: GUESTS[who].short } : { label: String(who), short: '?' });
export const seatLabel = who => seatOf(who).label;

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const RESULT_WORDS = /\b(has an edge|is profitable|proven|guarantee[sd]?|always works|risk[- ]free|we found|the test shows|confirmed that)\b/i;
const BAD = /[<>]|https?:|www\./i;

// ── opening a room ──────────────────────────────────────────────────────────────────────────────────────────────

/** The brief as the case's question (what every prompt reads first). At most 1500 characters. */
export function briefQuestion(brief, { shape = null, ownerText = '' } = {}) {
  if (!brief?.hypothesis) return str(ownerText, 1500);
  const v = (brief.variables ?? []).map(x => `- ${x.name} (${x.role}): ${x.construction}${x.transform ? `; ${x.transform}` : ''}`);
  const m = brief.method ?? {};
  return [
    `${brief.title}${shape && SHAPES[shape] ? ` [${SHAPES[shape]}]` : ''}`,
    `Hypothesis: ${brief.hypothesis}`,
    brief.mechanism ? `Why it might hold: ${brief.mechanism}` : '',
    brief.target?.label || brief.target?.series ? `Predicted: ${brief.target.label || brief.target.series}` : '',
    v.length ? `Variables:\n${v.join('\n')}` : '',
    m.lags ? `Lags: ${m.lags}` : '',
    m.regimes?.length ? `Regimes: ${m.regimes.join('; ')}` : '',
    brief.assumptions?.length ? `Assumptions: ${brief.assumptions.join('; ')}` : '',
  ].filter(Boolean).join('\n').slice(0, 1500);
}

/** Guests code suggests for this text: the best topic matches, at most MAX_GUESTS; the skeptic when nothing matches. */
export function suggestGuests(text, { exclude = [] } = {}) {
  const t = String(text ?? '');
  const scored = GUEST_IDS.filter(g => !exclude.includes(g)).map((g, i) => ({ g, i, k: (t.match(new RegExp(GUESTS[g].topics.source, 'gi')) ?? []).length })).filter(x => x.k > 0);
  const out = scored.sort((a, b) => b.k - a.k || a.i - b.i).slice(0, MAX_GUESTS).map(x => x.g);
  return out.length ? out : (exclude.includes('skeptic') ? [] : ['skeptic']);
}

/** The Evidence Book entries most related to the room (code, free): [{ id, verdict, claim, use }]. */
export function onFileEntries(ledger, query, max = 4) {
  if (!String(query ?? '').trim()) return [];
  const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  return pickRelevant(ledger ?? [], query, e => `${e.id} ${e.claim} ${e.use ?? ''} ${e.domain ?? ''}`, { max })
    .map(e => ({ id: e.id, verdict: e.verdict ?? null, claim: cut(e.claim, 220), use: cut(e.use, 220) }));
}

/** A new room: a case with the room block. Nothing runs until the owner starts the discussion. */
export function newRoom({ id, date, at = new Date().toISOString(), brief = null, dataCheck = null, ownerText = '', shape = null, onFile = [], library = null }) {
  const question = briefQuestion(brief, { shape, ownerText });
  if (!question) throw new Error('a room needs an idea or a brief');
  const c = newCase({ id, question, date, at, origin: 'owner' });
  if (brief?.title) c.title = brief.title;
  return { ...c, room: { v: 1, brief: brief ?? null, dataCheck: dataCheck ?? null, ownerText: str(ownerText, 4000), shape: SHAPES[shape] ? shape : null,
    onFile, library, suggested: suggestGuests(`${question} ${(library?.papers ?? []).map(p => p.title).join(' ')}`), guests: [], benched: [], talk: [] } };
}

/** The room block of any case (an older case without one gets the defaults, so every case can be shown as a room). */
export const roomOf = c => ({ v: 1, brief: null, dataCheck: null, ownerText: '', shape: null, onFile: [], library: null, suggested: [], guests: [], benched: [], talk: [], ...(c?.room ?? {}) });

// ── seats: guests and the bench ─────────────────────────────────────────────────────────────────────────────────

/** Accept / remove a guest, bench / unbench a core researcher. Returns { ok, case } or { ok:false, error }. Free. */
export function setSeat(c, action, who, at = new Date().toISOString()) {
  const r = roomOf(c);
  if (action === 'accept') {
    if (!GUESTS[who]) return { ok: false, error: 'not a guest' };
    if (r.guests.includes(who)) return { ok: true, case: c };
    if (r.guests.length >= MAX_GUESTS) return { ok: false, error: `at most ${MAX_GUESTS} guests in a room: remove one first` };
    r.guests = [...r.guests, who]; r.suggested = r.suggested.filter(g => g !== who);
  } else if (action === 'remove') {
    if (!r.guests.includes(who)) return { ok: false, error: 'that guest is not at the table' };
    r.guests = r.guests.filter(g => g !== who);
  } else if (action === 'dismiss') {
    r.suggested = r.suggested.filter(g => g !== who);
  } else if (action === 'bench') {
    if (!CORE.includes(who)) return { ok: false, error: 'only Quant, Macro or Flow can be benched' };
    const benched = [...new Set([...r.benched, who])];
    if (benched.length >= CORE.length) return { ok: false, error: 'at least one researcher must stay at the table' };
    r.benched = benched;
  } else if (action === 'unbench') {
    r.benched = r.benched.filter(l => l !== who);
  } else return { ok: false, error: 'unknown action' };
  return { ok: true, case: { ...c, room: r, updatedAt: at } };
}

/** The core researchers who answer in a round (not benched), in speaking order. */
export const activeLenses = c => CORE.filter(l => !roomOf(c).benched.includes(l));

/** Who speaks on a talk press: one guest, or "discuss" (every active researcher and every guest, at most TALK_PER_PRESS). */
export function talkTargets(c, who) {
  const r = roomOf(c);
  if (who === 'discuss') return [...activeLenses(c), ...r.guests].slice(0, TALK_PER_PRESS);
  if (GUESTS[who]) return r.guests.includes(who) ? [who] : [];
  if (CORE.includes(who)) return activeLenses(c).includes(who) ? [who] : [];
  return [];
}

// ── short remarks ───────────────────────────────────────────────────────────────────────────────────────────────

export const TALK_RULES = [
  'You are one voice at a research table: the owner, three researchers (quant, macro, flow), sometimes guests, and a Head of Research who decides later.',
  'Read the conversation and add ONE short remark: at most three sentences. React to a specific message by name when you can (agree, disagree, add the piece it misses, or swap one part for a better one).',
  'If you have nothing useful to add, pass. Passing is fine and better than repeating someone.',
  'Never claim a result: nothing has been tested here. No trading advice. Plain text only: no markup and no links.',
  'Reply with ONE JSON object and nothing else: {"pass": false, "replyTo": "who you answer (quant, macro, flow, a guest, owner) or empty", "text": "your remark"}',
].map(s => `- ${s}`).join('\n');

/** The system prompt for one voice. */
export function talkSystem(who) {
  const lens = CORE.includes(who) ? `the desk's ${RESEARCHERS[who].label.toLowerCase()}: your lens is ${RESEARCHERS[who].lens}` : GUESTS[who] ? `a guest at the table, ${GUESTS[who].label}. Your lens is ${GUESTS[who].lens}` : 'a researcher';
  return `You are ${lens}\n\nRules:\n${TALK_RULES}`;
}

/** The remarks and the on-file list as text, for every prompt in the room (researchers, guests and the Head). */
export function roomText(c) {
  const r = roomOf(c), out = [];
  if (r.onFile.length) out.push(`Already on file in the Evidence Book (checked by code):\n${r.onFile.map(e => `- ${e.id} [${e.verdict ?? '?'}]: ${e.claim}`).join('\n')}`);
  if (r.guests.length) out.push(`Guests at the table: ${r.guests.map(g => GUESTS[g]?.label ?? g).join(', ')}`);
  if (r.benched.length) out.push(`Benched by the owner for this room: ${r.benched.map(seatLabel).join(', ')}`);
  if (r.talk.length) out.push(`Short remarks made at the table (oldest first):\n${r.talk.map(t => `- ${seatLabel(t.who)}${t.replyTo ? ` (to ${seatLabel(t.replyTo)})` : ''}: ${t.pass ? '(passed)' : t.text}`).join('\n')}`);
  return out.join('\n\n');
}

/** The prompt for one short remark: the conversation (clipped) and the remarks so far. */
export function talkPrompt(c, who, { lib = [], earlier = [] } = {}) {
  const now = [...roomOf(c).talk, ...earlier];
  const remarks = now.length ? now.slice(-12).map(t => `- ${seatLabel(t.who)}${t.replyTo ? ` (to ${seatLabel(t.replyTo)})` : ''}: ${t.pass ? '(passed)' : t.text}`).join('\n') : '(none yet)';
  return [
    `THE CONVERSATION SO FAR (oldest first):\n${clip(caseText(c, lib, { replyChars: 700 }), 9000)}`,
    roomOf(c).onFile.length ? `ALREADY ON FILE (Evidence Book):\n${roomOf(c).onFile.map(e => `- ${e.id} [${e.verdict ?? '?'}]: ${e.claim}`).join('\n')}` : '',
    `SHORT REMARKS SO FAR:\n${remarks}`,
    `You are ${seatLabel(who)}. Add your one short remark now, or pass.`,
  ].filter(Boolean).join('\n\n');
}

/** A model reply -> { ok, value: { pass, replyTo, text }, notes } or { ok:false, errors }. */
export function validateTalk(o, { who } = {}) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, errors: ['the reply is not a JSON object'] };
  const pass = o.pass === true, text = str(o.text, 700);
  if (!pass && !text) return { ok: false, errors: ['no remark and no pass'] };
  if (text && BAD.test(text)) return { ok: false, errors: ['markup or a link in the remark'] };
  const rt = str(o.replyTo, 30).toLowerCase(), replyTo = (CORE.includes(rt) || GUESTS[rt] || rt === 'owner') && rt !== who ? rt : '';
  return { ok: true, value: { pass: pass && !text ? true : pass, replyTo, text: pass && !text ? '' : text }, notes: RESULT_WORDS.test(text) ? [`${who}: result wording in a remark`] : [] };
}

/** Add remarks to the room (newest kept, MAX_TALK). Each: { who, at, pass, replyTo, text, model? }. */
export function appendTalk(c, items, at = new Date().toISOString()) {
  const r = roomOf(c);
  const add = items.map((t, i) => ({ id: `t${r.talk.length + i + 1}-${Date.parse(t.at ?? at) || 0}`, who: t.who, at: t.at ?? at, pass: !!t.pass, replyTo: t.replyTo || '', text: t.text ?? '', ...(t.model ? { model: t.model } : {}), ...(t.error ? { error: String(t.error).slice(0, 200) } : {}) }));
  return { ...c, room: { ...r, talk: [...r.talk, ...add].slice(-MAX_TALK) }, updatedAt: at };
}

/** The talk counter: reserve() before each call (fail closed), status() free. kv: { getStrict(key), put(key, text) }. */
export function createTalkCounter(kv, { cap = TALK_CAP, now = () => Date.now() } = {}) {
  let chain = Promise.resolve();
  const locked = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const readUsed = async () => { const raw = await kv.getStrict(TALK_KV_KEY); let s = null; try { s = raw ? JSON.parse(raw) : null; } catch { s = null; } return Number.isFinite(s?.used) ? s.used : 0; };
  const reserve = () => locked(async () => { const used = await readUsed(); if (used >= cap) return false; await kv.put(TALK_KV_KEY, JSON.stringify({ v: 1, used: used + 1, at: now() })); return true; });
  const status = async () => { try { const used = await readUsed(); return { callsUsed: used, callsCap: cap, callsLeft: Math.max(0, cap - used) }; } catch { return { callsUsed: null, callsCap: cap, callsLeft: null }; } };
  return { reserve, status };
}

// ── what the page shows ─────────────────────────────────────────────────────────────────────────────────────────

/** Who the room waits on: { on: 'you' | 'team' | 'closed', why }. */
export function waitingOn(c, job = null) {
  if (c.status === 'parked' || c.status === 'closed') return { on: 'closed', why: c.status === 'parked' ? 'parked' : 'closed' };
  if (job?.status === 'running') return { on: 'team', why: job.stage ? `working: ${job.stage}` : 'working' };
  if (c.pending?.owner) return { on: 'team', why: 'your message is waiting for the researchers' };
  if (c.lastError) return { on: 'you', why: 'the last run failed: read it and try again' };
  if (!c.rounds.length) return { on: 'you', why: 'start the discussion' };
  const rv = latestReview(c);
  if (rv && rv.afterRound === c.rounds.length) return { on: 'you', why: rv.nextStep ? `the Head says: ${rv.nextStep}` : 'read the Head\'s review' };
  return { on: 'you', why: `round ${c.rounds.length} done: reply, let them discuss, or ask the Head` };
}

/** The stage line across the top: it follows what happened, the owner never moves anything. */
export function stages(c, job = null) {
  const r = roomOf(c), rv = latestReview(c), closed = c.status === 'closed';
  const test = rv && ['quick-test', 'architect', 'preregister'].includes(rv.nextStep);
  const list = [
    { id: 'brief', label: 'Brief', done: !!(r.brief || c.question) },
    { id: 'papers', label: 'Papers', done: !!(r.library?.papers?.length) },
    { id: 'discussion', label: c.rounds.length ? `Discussion · round ${c.rounds.length}` : 'Discussion', done: c.rounds.length > 0 },
    { id: 'head', label: 'Head', done: !!rv },
    { id: 'test', label: rv?.nextStep ? `Test · ${rv.nextStep}` : 'Test', done: !!test },
    { id: 'verdict', label: 'Verdict', done: closed },
  ];
  const nowIdx = job?.status === 'running' ? (job.kind === 'review' ? 3 : 2) : list.findIndex(s => !s.done && s.id !== 'papers');
  return list.map((s, i) => ({ ...s, state: s.done ? 'done' : i === nowIdx ? 'now' : 'todo' }));
}

/** The seats at the table and their state: spoke | waiting | benched | suggested | idle. */
export function seats(c, job = null) {
  const r = roomOf(c), spoke = new Set(c.rounds.flatMap(x => Object.keys(x.answers ?? {})));
  for (const t of r.talk) if (!t.pass) spoke.add(t.who);
  const working = job?.status === 'running';
  const core = CORE.map(l => ({ who: l, ...seatOf(l), kind: 'core', state: r.benched.includes(l) ? 'benched' : working && job.kind !== 'review' && job.kind !== 'talk' ? 'thinking' : spoke.has(l) ? 'spoke' : 'waiting' }));
  return [
    { who: 'translator', ...seatOf('translator'), kind: 'fixed', state: r.brief ? 'spoke' : 'idle' },
    { who: 'librarian', ...seatOf('librarian'), kind: 'fixed', state: r.library?.papers?.length ? 'spoke' : 'idle', note: r.library?.papers?.length ? `${r.library.papers.length} papers` : '' },
    ...core,
    { who: 'head', ...seatOf('head'), kind: 'fixed', state: working && job.kind === 'review' ? 'thinking' : c.reviews.length ? 'spoke' : 'idle', note: c.reviews.length ? '' : 'when you call' },
    ...r.guests.map(g => ({ who: g, ...seatOf(g), kind: 'guest', state: working && job.kind === 'talk' ? 'thinking' : spoke.has(g) ? 'spoke' : 'waiting' })),
    ...r.suggested.filter(g => !r.guests.includes(g)).slice(0, Math.max(0, MAX_GUESTS - r.guests.length)).map(g => ({ who: g, ...seatOf(g), kind: 'guest', state: 'suggested' })),
  ];
}

/**
 * The conversation, oldest first: [{ key, at, who, kind, ... }]. kinds: owner | brief | onfile | library | answer |
 * error | head | talk | pending | system. Built from the case, so an older case shows as a room too.
 */
export function timeline(c, lib = []) {
  const r = roomOf(c), byId = Object.fromEntries((lib ?? []).map(p => [p.id, p])), out = [];
  const t0 = c.createdAt ?? c.updatedAt ?? '';
  const pics = list => (list ?? []).filter(a => a?.id && a?.url).map(a => ({ id: a.id, url: a.url }));
  const push = (m, i) => out.push({ ...m, order: i });
  let i = 0;
  push({ key: 'q', at: t0, who: 'owner', kind: 'owner', text: r.ownerText || c.question || c.title, images: pics(c.images) }, i++);
  if (r.brief) push({ key: 'brief', at: t0, who: 'translator', kind: 'brief', brief: r.brief, dataCheck: r.dataCheck }, i++);
  if (r.onFile.length) push({ key: 'onfile', at: t0, who: 'onfile', kind: 'onfile', entries: r.onFile }, i++);
  if (r.library?.papers?.length) push({ key: 'library', at: t0, who: 'librarian', kind: 'library', papers: r.library.papers }, i++);
  if (c.dossier) push({ key: 'dossier', at: t0, who: 'librarian', kind: 'system', text: `Literature dossier ${c.dossier.id}: ${c.dossier.verdict ?? ''} ${c.dossier.summary ?? ''}`.trim() }, i++);
  for (const rd of c.rounds) {
    if (rd.owner && (rd.n > 1 || r.brief || c.room)) push({ key: `r${rd.n}-o`, at: rd.at, who: 'owner', kind: 'owner', text: rd.owner, round: rd.n, images: pics(rd.images) }, i++);
    push({ key: `r${rd.n}-s`, at: rd.at, who: 'system', kind: 'system', text: `Round ${rd.n}` }, i++);
    for (const lens of [...CORE.filter(l => rd.answers?.[l]), ...Object.keys(rd.answers ?? {}).filter(l => !CORE.includes(l))]) {
      const a = rd.answers[lens];
      push({ key: `r${rd.n}-${lens}`, at: rd.at, who: lens, kind: 'answer', round: rd.n, headline: a.headline ?? '', text: a.reply ?? '', questions: a.questions ?? [],
        proposals: [...(a.proposals ?? []), ...(a.revised ?? [])].map(id => ({ id, title: byId[id]?.title ?? id, revised: (a.revised ?? []).includes(id) })) }, i++);
    }
    for (const [lens, e] of Object.entries(rd.errors ?? {})) push({ key: `r${rd.n}-${lens}-e`, at: rd.at, who: lens, kind: 'error', text: `did not answer: ${String(e).slice(0, 200)}` }, i++);
    for (const rv of c.reviews.filter(x => x.afterRound === rd.n)) push({ key: `h${rv.n}`, at: rv.at, who: 'head', kind: 'head', headline: rv.headline ?? '', agree: rv.agree ?? [],
      disagree: (rv.disagree ?? []).map(d => d.issue ?? '').filter(Boolean), nextStep: rv.nextStep ?? null, nextStepWhy: rv.nextStepWhy ?? '', plan: rv.plan ?? null }, i++);
  }
  for (const t of r.talk) push({ key: t.id, at: t.at, who: t.who, kind: 'talk', text: t.pass ? '' : t.text, pass: t.pass, replyTo: t.replyTo || '', error: t.error ?? null }, i++);
  if (c.pending?.owner) push({ key: 'pending', at: c.pending.at, who: 'owner', kind: 'pending', text: c.pending.owner, images: pics(c.pending.images) }, i++);
  if (c.lastError) push({ key: 'err', at: c.lastError.at ?? c.updatedAt, who: 'system', kind: 'error', text: String(c.lastError.error ?? c.lastError.message ?? c.lastError).slice(0, 300) }, i++);
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.order - b.order).map(({ order, ...m }) => m);
}

/** The rooms list row. */
export function roomSummary(c, job = null) {
  const tl = timeline(c), line = m => m.text || m.headline || '', last = [...tl].reverse().find(m => line(m) && m.kind !== 'system');
  return { id: c.id, title: c.title, status: c.status, updatedAt: c.updatedAt, createdAt: c.createdAt, isRoom: !!c.room, origin: c.origin,
    waiting: waitingOn(c, job), stages: stages(c, job), seats: seats(c, job).filter(s => s.state !== 'suggested' && s.state !== 'idle').map(s => ({ who: s.who, short: s.short, state: s.state })),
    last: last ? { who: last.who, label: seatLabel(last.who), text: String(line(last)).slice(0, 200) } : null, rounds: c.rounds.length, reviews: c.reviews.length };
}
