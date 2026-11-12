/**
 * The research hub (owner, 2026-11-12): one front door for research, drawn as a loop. Everything that already exists
 * gets a place on it; nothing is moved or deleted.
 *
 *   ① IN     what comes in: the drop box (videos, links, images, text, PDFs), the paper backlog, the intake ledger
 *   ② ASK    the questions: the Director's agenda cards, the ROE scanner questions, New idea (the translator)
 *   ③ TALK   the research rooms (Quant, Macro, Flow, guests, the Head)
 *   ④ TEST   quick test, build & validate (Desk Office), the research register's live rows
 *   ⑤ KNOWN  the Evidence Book, the Research Log, forward records
 *   ⑥ SHELF  what everyone reads: the Library (its own password, linked only), intake notes, concept cards,
 *            Theory Lab and the C.OG notes, the method lessons
 *
 * Two ways in, one store. On a phone, the research-director skill reads the same things through the shared
 * read route (/api/research-shared/*, a bearer token, read-only except marking a queue item done). At the desk, the
 * rooms read them on the page. This file holds the pure parts: the parsers for the repo files (agendas, register,
 * intake ledger), the drop-box queue and the map's counts. Tested in js/researchHub.test.mjs.
 */
import { pickRelevant } from './researchCase.js';

export const QUEUE_KEY = 'research_intake_queue_v1';
export const MAX_QUEUE = 400;
export const LANES = {
  auto: 'Let the skill decide',
  cog: 'C.OG (highest quality)',
  informational: 'Informational (Crown, Jessinskip, podcasts)',
  technical: 'Technical (Quant Guild, method)',
};
export const AGENDA_DIR = '.claude/skills/research-director/agendas';
export const REGISTER_FILE = 'plans/RESEARCH_REGISTER.md';
export const INTAKE_INDEX = 'education/intake/INDEX.md';
export const METHOD_LESSONS = 'education/RESEARCH_METHOD_LESSONS.md';

const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

// ── the Director's agendas (.claude/skills/research-director/agendas/*.md) ─────────────────────────────────────

/**
 * One agenda file -> { theme, title, cards: [{ key, n, title, score, status, statusText, text }] }.
 * A card is a "### Q<n>. <title> — score <s>/15 <tail>" heading and the first block of quoted text under it.
 * status: run (the tail says RUN), parked, gated, open.
 */
export function parseAgenda(md, file = '') {
  const theme = String(file).replace(/^.*[\\/]/, '').replace(/\.md$/i, '');
  const lines = String(md ?? '').split(/\r?\n/);
  const h1 = lines.find(l => /^#\s+/.test(l));
  const title = clean(h1 ? h1.replace(/^#\s+/, '').replace(/^Agenda:\s*/i, '') : theme, 200);
  const cards = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^###\s+Q(\d+)\.\s+(.+)$/.exec(lines[i]); if (!m) continue;
    const parts = m[2].split(/\s+[—–-]\s+score\s+/i);
    const cardTitle = clean(parts[0].replace(/\*\*/g, ''), 200);
    const sm = /^(\d+)\s*\/\s*15(.*)$/.exec(parts[1] ?? ''), tail = clean((sm?.[2] ?? '').replace(/[*`]/g, '').replace(/^[\s,—–-]+/, ''), 200);
    const status = /\bRUN\b/.test(tail) ? 'run' : /park/i.test(tail) ? 'parked' : /gated/i.test(tail) ? 'gated' : 'open';
    const quote = [];
    for (let j = i + 1; j < lines.length && !/^#{1,3}\s/.test(lines[j]); j++) {
      if (/^>\s?/.test(lines[j])) quote.push(lines[j].replace(/^>\s?/, ''));
      else if (quote.length && !lines[j].trim()) break;
    }
    cards.push({ key: `${theme}#Q${m[1]}`, n: Number(m[1]), title: cardTitle, score: sm ? Number(sm[1]) : null, status, statusText: tail, text: clean(quote.join(' '), 1200) });
  }
  return { theme, title, cards };
}

// ── the research register (plans/RESEARCH_REGISTER.md) ─────────────────────────────────────────────────────────

const REG_STATUS = new Set(['CLAIMED', 'REGISTERED', 'RUNNING', 'BANKED', 'EXPLORATORY', 'PARKED', 'DROPPED']);
/** The register's table rows -> [{ id, question, status, updated, next }]. */
export function parseRegister(md) {
  const out = [];
  for (const line of String(md ?? '').split(/\r?\n/)) {
    if (!/^\|/.test(line) || /^\|\s*-/.test(line) || /^\|\s*ID\s*\|/i.test(line)) continue;
    const c = cells(line); if (c.length < 5) continue;
    const status = clean(c[2], 30).toUpperCase().replace(/[^A-Z]/g, '');
    if (!REG_STATUS.has(status)) continue;
    out.push({ id: clean(c[0].replace(/`/g, ''), 80), question: clean(c[1], 300), status, updated: clean(c[4], 10), next: clean(c[c.length - 1], 300) });
  }
  return out;
}

// ── the intake ledger (education/intake/INDEX.md) ───────────────────────────────────────────────────────────────

/** Ledger rows -> [{ processed, lane, source, title, url, note, ideas, lessons }]. */
export function parseIntakeIndex(md) {
  const out = [];
  for (const line of String(md ?? '').split(/\r?\n/)) {
    if (!/^\|/.test(line) || /^\|\s*-/.test(line) || /^\|\s*Processed\s*\|/i.test(line)) continue;
    const c = cells(line); if (c.length < 6 || !/\d{4}-\d{2}-\d{2}/.test(c[0])) continue;
    const link = s => (/\(([^)]+)\)/.exec(s)?.[1] ?? s.replace(/`/g, '')).trim();
    out.push({ processed: c[0].slice(0, 10), lane: clean(c[1], 20).toLowerCase(), source: clean(c[2], 80), title: clean(c[3].replace(/\[|\]\([^)]*\)/g, ''), 200),
      url: link(c[4] ?? ''), note: link(c[5] ?? ''), ideas: clean(c[6] ?? '', 200), lessons: clean(c[7] ?? '', 200) });
  }
  return out;
}

/** Method lessons: how many, and how many are waiting on the owner (PROPOSED). */
export function methodLessonCounts(md) {
  const rows = String(md ?? '').split(/\r?\n/).filter(l => /^\|\s*\d+\s*\|/.test(l));
  return { total: rows.length, proposed: rows.filter(l => /\bPROPOSED\b/.test(l)).length };
}

// ── the drop box queue (KV research_intake_queue_v1) ────────────────────────────────────────────────────────────

const URL_RE = /^https?:\/\/[^\s<>"']{4,2000}$/i;
const VIDEO_RE = /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|vimeo\.com)/i;
const PAPER_RE = /(ssrn\.com|arxiv\.org|doi\.org|\.pdf(\?|$))/i;
export const kindOfUrl = u => VIDEO_RE.test(u) ? 'video' : PAPER_RE.test(u) ? 'paper' : 'link';

/**
 * What the owner dropped -> { ok, item } or { ok:false, error }. One of url, text or image (an id already stored).
 * The item waits in the queue until a Claude session runs learn-intake on it (videos, links, images, text) or the
 * paper backlog takes it (PDF uploads go straight to the library's own upload route, not here).
 */
export function normaliseDrop(body, { now = new Date().toISOString(), id = null } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const lane = LANES[b.lane] ? b.lane : 'auto', note = clean(b.note, 600);
  const url = clean(b.url, 2000), text = String(b.text ?? '').trim().slice(0, 20000), image = b.image && typeof b.image === 'object' ? b.image : null;
  let item;
  if (url) { if (!URL_RE.test(url)) return { ok: false, error: 'that does not look like a web address (it must start with http)' }; item = { kind: kindOfUrl(url), url }; }
  else if (image) { if (!/^[a-z0-9-]{8,80}$/i.test(String(image.id ?? ''))) return { ok: false, error: 'bad picture id' }; item = { kind: 'image', image: { id: image.id, ext: clean(image.ext, 5), name: clean(image.name, 120), bytes: Number(image.bytes) || null } }; }
  else if (text.length >= 20) item = { kind: 'text', text };
  else return { ok: false, error: 'paste a link, drop a picture, or write at least a sentence' };
  return { ok: true, item: { id: id ?? `in-${Date.parse(now).toString(36)}-${Math.random().toString(36).slice(2, 7)}`, at: now, lane, note, status: 'queued', ...item } };
}

/** Add an item (a repeat of a queued or done URL is refused, so a video is not transcribed twice). Newest first. */
export function addDrop(queue, item) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  if (item.url) { const dup = items.find(x => x.url && x.url.replace(/\/+$/, '') === item.url.replace(/\/+$/, '')); if (dup) return { ok: false, error: `already in the queue (${dup.status}, ${String(dup.at).slice(0, 10)})`, queue: { v: 1, items } }; }
  return { ok: true, queue: { v: 1, items: [item, ...items].slice(0, MAX_QUEUE) } };
}

/** Mark an item done (or failed / dropped) with where the note went. */
export function markItem(queue, id, { status = 'done', note = '', path = '', at = new Date().toISOString() } = {}) {
  if (!['done', 'failed', 'dropped', 'queued'].includes(status)) return { ok: false, error: 'status must be done, failed, dropped or queued' };
  const items = Array.isArray(queue?.items) ? queue.items : [], i = items.findIndex(x => x.id === id);
  if (i < 0) return { ok: false, error: 'no such item' };
  const next = [...items]; next[i] = { ...items[i], status, doneAt: status === 'queued' ? null : at, result: { note: clean(note, 600), path: clean(path, 300) } };
  return { ok: true, queue: { v: 1, items: next } };
}

// ── related reading for a room (code, free) ─────────────────────────────────────────────────────────────────────

/** The Director's cards and the intake notes most related to a room's text: { cards: [...], intake: [...] }. */
export function relatedReading(query, { cards = [], intake = [] } = {}, { maxCards = 3, maxIntake = 3 } = {}) {
  const q = String(query ?? ''); if (!q.trim()) return { cards: [], intake: [] };
  const c = pickRelevant(cards.filter(x => x.status !== 'run'), q, x => `${x.title} ${x.text} ${x.agendaTitle ?? ''}`, { max: maxCards });
  const n = pickRelevant(intake, q, x => `${x.title} ${x.source} ${x.ideas} ${x.lessons}`, { max: maxIntake });
  return {
    cards: c.map(x => ({ key: x.key, title: x.title, agenda: x.agendaTitle ?? x.key.split('#')[0], score: x.score, text: clean(x.text, 500) })),
    intake: n.map(x => ({ title: x.title, source: x.source, lane: x.lane, note: x.note, ideas: x.ideas })),
  };
}

/** The related reading as prompt text, for the researchers and the Head. */
export function readingText(r) {
  const out = [];
  if (r?.cards?.length) out.push(`Open questions the research director has already set (agenda cards, ranked out of 15):\n${r.cards.map(c => `- [${c.key}] ${c.title} (${c.score ?? '?'}/15): ${c.text}`).join('\n')}`);
  if (r?.intake?.length) out.push(`Lessons the owner fed in (intake notes: videos, papers, posts):\n${r.intake.map(n => `- ${n.title} (${n.source}, ${n.lane})${n.ideas ? `: ideas ${n.ideas}` : ''}`).join('\n')}`);
  return out.join('\n\n');
}

// ── the map ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The six steps of the loop with their live counts and links. Every input is optional: a source that could not be
 * read is null and its tile says "could not read" (never a silent zero).
 */
export function hubMap({ rooms = null, roe = null, agendas = null, register = null, intake = null, queue = null, lessons = null, evidence = null, papers = null, backlog = null, concepts = null } = {}) {
  const n = v => (v == null ? null : v);
  const cards = agendas ? agendas.flatMap(a => a.cards) : null;
  const openCards = cards ? cards.filter(c => c.status === 'open' || c.status === 'gated') : null;
  const regLive = register ? register.filter(r => ['CLAIMED', 'REGISTERED', 'RUNNING'].includes(r.status)) : null;
  const qd = queue?.items ?? null;
  const evCounts = evidence ? evidence.reduce((o, e) => { const v = String(e.verdict ?? 'other').toLowerCase(); o[v] = (o[v] ?? 0) + 1; return o; }, {}) : null;
  const latest = evidence ? [...evidence].filter(e => e.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6).map(e => ({ id: e.id, verdict: e.verdict, date: e.date, claim: clean(e.claim, 180) })) : null;
  return [
    { id: 'in', n: 1, title: 'In', sub: 'what comes in', tiles: [
      { label: 'Waiting for the intake skill', value: qd ? qd.filter(x => x.status === 'queued').length : null, href: '#in', hint: 'videos, links, pictures and text you dropped' },
      { label: 'Papers waiting to be read', value: n(backlog?.pending ?? null), href: 'desk-office.html#research/ideas', hint: 'the library backlog (Literature desk)' },
      { label: 'Items learned so far', value: intake ? intake.length : null, href: '#shelf', hint: 'the intake ledger, all lanes' },
    ] },
    { id: 'ask', n: 2, title: 'Ask', sub: 'the questions', tiles: [
      { label: "Director's open questions", value: openCards ? openCards.length : null, href: '#ask', hint: agendas ? `${agendas.length} agendas` : '' },
      { label: 'Scanner questions', value: n(roe?.questions ?? null), href: 'roe.html', hint: roe?.status ?? '' },
      { label: 'New idea', value: null, link: true, href: '#new', hint: 'your words become a brief, then a room' },
    ] },
    { id: 'talk', n: 3, title: 'Talk', sub: 'the rooms', tiles: [
      { label: 'Rooms waiting on you', value: rooms ? rooms.filter(r => r.waiting?.on === 'you').length : null, href: '#rooms', hint: 'reply, ask the Head, or park', warn: true },
      { label: 'Rooms working', value: rooms ? rooms.filter(r => r.waiting?.on === 'team').length : null, href: '#rooms', hint: 'the team is answering' },
      { label: 'Open rooms', value: rooms ? rooms.filter(r => r.status === 'open').length : null, href: '#rooms', hint: rooms ? `${rooms.length} in all` : '' },
    ] },
    { id: 'test', n: 4, title: 'Test', sub: 'pre-registered, then run', tiles: [
      { label: 'Studies claimed or running', value: regLive ? regLive.length : null, href: '#test', hint: 'the research register' },
      { label: 'Quick test', value: null, link: true, href: 'desk-office.html#research/ideas', hint: 'a fast check on the data catalogue' },
      { label: 'Build & validate', value: null, link: true, href: 'desk-office.html#research/build', hint: 'the architect, validation desk, system catalogue' },
    ] },
    { id: 'known', n: 5, title: 'Known', sub: 'the verdicts', tiles: [
      { label: 'Evidence Book entries', value: evidence ? evidence.length : null, href: 'evidence.html', hint: evCounts ? Object.entries(evCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v} ${k}`).join(' · ') : '' },
      { label: 'Research Log', value: null, link: true, href: 'research-log.html', hint: 'what each study found, in plain words' },
      { label: 'Banked studies', value: register ? register.filter(r => r.status === 'BANKED').length : null, href: '#test', hint: 'closed rows in the register' },
    ], latest },
    { id: 'shelf', n: 6, title: 'Shelf', sub: 'what everyone reads', tiles: [
      { label: 'Papers in the library', value: n(papers?.count ?? null), href: 'library.html', hint: papers ? `${papers.read ?? 0} with desk notes · password` : 'password', lock: true },
      { label: 'Concept cards', value: n(concepts ?? null), href: 'roe.html#concepts', hint: 'ideas from the papers and courses' },
      { label: 'Method lessons', value: lessons ? lessons.total : null, href: '#shelf', hint: lessons?.proposed ? `${lessons.proposed} proposed edits wait on you` : 'how the teachers run research', warn: !!lessons?.proposed },
    ] },
  ];
}
