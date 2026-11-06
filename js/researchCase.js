/**
 * Research cases (owner, 2026-11-05): everything about one question to the research pod kept together, in a loop.
 *
 *   question → the three researchers (round 1) → the Head of Research's review (only when the owner asks) → the
 *   owner's reply → all three answer again (round 2), each seeing the others and the Head → the Head again → …
 *
 * Before this, one question broke into about nine loose proposal cards: the quant, macro and flow researchers answered
 * without seeing each other, their proposals went into one shared library with no link back to the question, and the
 * question itself lived only in a "latest session" box the next session replaced. A case holds the question, its
 * rounds (each researcher's answer and the ids of its proposals, and the owner's message that started the round) and
 * the Head's reviews. The proposals themselves stay in the pod's library (research_pod_library), so the build list,
 * the scorecard and the lifecycle keep working; each now carries its caseId.
 *
 * Store (KV research_cases): { v: 1, migrated: [session ids], cases: [case] }. The old sessions
 * (research_pod_sessions) are turned into cases on first read, once (`migrate`).
 *
 * A literature dossier (Research an idea, Review this paper) can be opened as a case too (`caseFromDossier`, one per
 * dossier): the dossier is its context, every prompt in the case reads it (`dossierText`), and nothing runs until the
 * owner replies.
 *
 * Proposals and reviews, not results: nothing here runs a test or banks a verdict.
 *
 * Pure. Tested in js/researchCase.test.mjs.
 */
import { RESEARCHERS, validateProposals, validateReply, applyRevision, slug } from './researchPod.js';
import { normaliseSpec } from './quickTest.js';
import { picturesText } from './researchImages.js';

export const LABEL = 'proposals and reviews, not results';
export const LENSES = Object.keys(RESEARCHERS);
export const STATUSES = ['open', 'parked', 'closed'];
export const NEXT_STEPS = ['quick-test', 'architect', 'preregister', 'park', 'drop'];
export const MAX_CASES = 100;
const RESULT_WORDS = /\b(has an edge|is profitable|proven|guarantee[sd]?|always works|risk[- ]free|we found|the test shows|confirmed that)\b/i;

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const arr = (v, n, f) => (Array.isArray(v) ? v.slice(0, n).map(f).filter(Boolean) : []);
const uniq = a => [...new Set(a.filter(Boolean))];
const label = lens => RESEARCHERS[lens]?.label ?? lens;
export const emptyStore = () => ({ v: 1, migrated: [], cases: [] });
export const readStore = raw => (raw && typeof raw === 'object' && Array.isArray(raw.cases) ? { v: 1, migrated: raw.migrated ?? [], cases: raw.cases } : emptyStore());

/** A case's title: the question's first line, or "Weekly session <date>" for a weekly run with no question. */
export const caseTitle = (question, date) => { const q = String(question ?? '').trim().split(/\n/)[0]; return q ? (q.length > 140 ? `${q.slice(0, 137)}…` : q) : `Weekly session ${date}`; };

/** A new, empty case. */
export function newCase({ id, question = '', date, at = new Date().toISOString(), origin = question ? 'owner' : 'weekly', sessionId = null, images = [] }) {
  const q = String(question ?? '').trim().slice(0, 1500);
  // `images`: the pictures attached to the question (js/researchImages.js attachment(): id, url, the reading and its text)
  return { id, title: caseTitle(q, date), question: q, origin, date, createdAt: at, updatedAt: at, status: 'open', sessionId, rounds: [], reviews: [], ...(images?.length ? { images } : {}) };
}

/**
 * One researcher's answer in a round: { headline, reply (round 2 on), questions, proposals: ids, revised: ids, model }.
 * From a round-1 session reply ({ headline, proposals[], questionsForOwner }) or a round-n reply (validateRoundAnswer).
 */
export function answerOf(r, { revised = [], newIds = null } = {}) {
  return { headline: r?.headline ?? '', reply: r?.reply ?? null, questions: r?.questionsForOwner ?? r?.questions ?? [],
    proposals: newIds ?? (r?.proposals ?? []).map(p => p.id), revised, model: r?.model ?? null, notes: r?.notes?.length ? r.notes : undefined };
}

/** Append a round: { owner: the message that started it (round 1: the question), answers: { lens: answer }, errors }. */
export function appendRound(c, { owner = null, answers = {}, errors = {}, at = new Date().toISOString(), web = undefined, images = [] }) {
  const round = { n: c.rounds.length + 1, at, owner: owner ? String(owner).slice(0, 3000) : null, answers, errors: Object.keys(errors).length ? errors : undefined, ...(web ? { web } : {}), ...(images?.length ? { images } : {}) };
  return { ...c, rounds: [...c.rounds, round], updatedAt: at };
}

/** Append a Head of Research review, after the latest round. */
export function appendReview(c, review, { at = new Date().toISOString(), model = null, notes = [] } = {}) {
  const r = { n: c.reviews.length + 1, at, afterRound: c.rounds.length, model, ...(notes.length ? { notes } : {}), ...review };
  return { ...c, reviews: [...c.reviews, r], updatedAt: at };
}

export const latestReview = c => c?.reviews?.at(-1) ?? null;
/** Every proposal id the case has produced, in order, once (a dossier case starts with the dossier's proposals). */
export const proposalIds = c => uniq([...(c?.dossier?.proposals ?? []).map(p => p.id), ...(c?.rounds ?? []).flatMap(r => Object.values(r.answers ?? {}).flatMap(a => [...(a.proposals ?? []), ...(a.revised ?? [])]))]);
/** One lens's proposal ids in the case (a dossier's proposal belongs to the researcher of its lens, who may revise it). */
export const lensIds = (c, lens) => uniq([...(c?.dossier?.proposals ?? []).filter(p => p.lens === lens).map(p => p.id), ...(c?.rounds ?? []).flatMap(r => [...(r.answers?.[lens]?.proposals ?? []), ...(r.answers?.[lens]?.revised ?? [])])]);

/** The case list row. */
export function summary(c, job = null) {
  const rv = latestReview(c);
  return { id: c.id, title: c.title, question: c.question, origin: c.origin, dossierId: c.dossierId ?? null, verdict: c.dossier?.verdict ?? null, date: c.date, createdAt: c.createdAt, updatedAt: c.updatedAt, status: c.status,
    rounds: c.rounds.length, reviews: c.reviews.length, reviewed: !!rv, reviewCurrent: !!rv && rv.afterRound === c.rounds.length && c.rounds.length > 0,
    nextStep: rv?.nextStep ?? null, proposals: proposalIds(c).length, job: job ? { status: job.status, kind: job.kind, stage: job.stage ?? null, error: job.error ?? null, ...(job.resumedAfterRestart ? { resumedAfterRestart: true, attempts: job.attempts ?? null } : {}) } : null,
    // the newest round or review was written by a job restarted after a server restart; or the last job was lost to one
    resumedAfterRestart: !!(job?.resumedAfterRestart || [c.rounds?.at(-1), rv].some(x => x?.resumedAfterRestart)), lostToRestart: !!c.lastError?.lostToRestart };
}

/** Put a case into the store (replace by id), newest first, capped. */
export function putCase(store, c) {
  const s = readStore(store);
  const cases = [c, ...s.cases.filter(x => x.id !== c.id)].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_CASES);
  return { ...s, cases };
}

export function setStatus(c, status, at = new Date().toISOString()) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  return { ...c, status, updatedAt: at };
}

/** Tag library proposals with the case: caseId = the latest case, caseIds = every case that touched it. */
export function tagLibrary(lib, ids, caseId) {
  const want = new Set(ids);
  return (lib ?? []).map(p => (want.has(p.id) ? { ...p, caseId, caseIds: uniq([...(p.caseIds ?? (p.caseId ? [p.caseId] : [])), caseId]) } : p));
}

/**
 * New proposals from a later round get ids that do not collide with a proposal from another case (the same title in a
 * different case is a different proposal); a collision with this case's own proposal is that proposal, so it is kept.
 */
export function uniqueIds(proposals, lib, caseId) {
  const taken = new Map((lib ?? []).map(p => [p.id, p])), out = [];
  for (const p of proposals) {
    let id = p.id, k = 2;
    while ((taken.has(id) && !(taken.get(id).caseIds ?? [taken.get(id).caseId]).includes(caseId)) || out.some(o => o.id === id)) id = `${p.id}-${k++}`;
    out.push({ ...p, id });
  }
  return out;
}

// ── a case from a literature dossier ────────────────────────────────────────────────────────────────────────────
//
// "Research an idea" and "Review this paper" (the literature desk, js/literature.js) end in a dossier: a verdict, cited
// evidence for and against, what no paper settles, how to test it here, and up to three proposals. A dossier was
// read-only; now it can be opened as a case (one per dossier), so the owner can reply to the three researchers and send
// it to the Head of Research like any other case. The dossier is the case's context, not a round: nothing runs until
// the owner writes, so nothing is spent. Every prompt in the case reads the dossier block (`dossierText`).

/** The case id for a dossier (deterministic, so opening a dossier twice opens the same case). */
export const dossierCaseId = dossierId => `case-dossier-${String(dossierId ?? '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 120)}`;
/** The case already opened for this dossier, or null. */
export const caseForDossier = (store, dossierId) => readStore(store).cases.find(c => c.dossierId === dossierId) ?? null;

/**
 * The dossier block a case keeps: { id, kind, at, asked, ref, paper, hypothesis, verdict, verdictWhy, summary,
 * evidenceFor/Against [{ point, papers }], unknowns, testHere { design, data, alreadyHere }, proposals (short form),
 * questionsForOwner, papers { id: 'title (year)' } for the ids it cites }. `rec` is the stored record (GET
 * /api/research-pod/dossier): { id, kind, at, hypothesis, ref, paperNotes, dossier }. Throws when no dossier was written.
 */
export function dossierContext(rec) {
  const k = rec?.dossier; if (!rec?.id || !k) throw new Error('this record has no dossier (the job failed before writing one)');
  const ev = xs => (xs ?? []).slice(0, 10).map(e => ({ point: String(e.point ?? '').slice(0, 700), papers: (e.papers ?? []).slice(0, 6) }));
  const cited = uniq([...(k.evidenceFor ?? []), ...(k.evidenceAgainst ?? [])].flatMap(e => e.papers ?? []).concat((k.proposals ?? []).flatMap(p => p.citations ?? [])));
  const notes = rec.paperNotes ?? {}, first = rec.kind === 'paper' ? Object.entries(notes)[0] : null;
  return {
    id: rec.id, kind: rec.kind === 'paper' ? 'paper' : 'idea', at: rec.at ?? null,
    asked: rec.kind === 'paper' ? null : str(rec.hypothesis, 2000), ref: rec.kind === 'paper' ? str(rec.ref, 500) : null,
    paper: first ? { id: first[0], title: str(first[1]?.title, 300) ?? first[0], year: first[1]?.year ?? null } : null,
    hypothesis: str(k.hypothesis, 800) ?? str(rec.hypothesis, 800) ?? '', verdict: k.verdict ?? null, verdictWhy: str(k.verdictWhy, 800) ?? '', summary: str(k.summary, 1200) ?? '',
    evidenceFor: ev(k.evidenceFor), evidenceAgainst: ev(k.evidenceAgainst), unknowns: (k.unknowns ?? []).slice(0, 8).map(u => String(u).slice(0, 400)),
    testHere: { design: str(k.testHere?.design, 1200) ?? '', data: (k.testHere?.data ?? []).slice(0, 10), alreadyHere: (k.testHere?.alreadyHere ?? []).slice(0, 8) },
    proposals: (k.proposals ?? []).slice(0, 3).map(p => ({ id: p.id, title: p.title, lens: p.lens, thesis: String(p.thesis ?? '').slice(0, 400),
      test: { variable: p.test?.variable ?? '', benchmark: p.test?.benchmark ?? '', placebo: p.test?.placebo ?? '' }, citations: (p.citations ?? []).slice(0, 6) })),
    questionsForOwner: (k.questionsForOwner ?? []).slice(0, 4),
    papers: Object.fromEntries(cited.map(id => [id, notes[id] ? `${String(notes[id].title ?? id).slice(0, 140)}${notes[id].year ? ` (${notes[id].year})` : ''}` : id])),
  };
}

/** A new case from a dossier: the question is the dossier's hypothesis, the dossier its context. No round yet. */
export function caseFromDossier(rec, { date, at = new Date().toISOString() } = {}) {
  const d = dossierContext(rec);
  const question = d.kind === 'paper' && d.paper ? `${d.paper.title}: ${d.hypothesis}` : d.hypothesis;
  return { ...newCase({ id: dossierCaseId(d.id), question, date: date ?? String(at).slice(0, 10), at, origin: 'dossier' }), dossierId: d.id, dossier: d };
}

/** The dossier block as prompt text: hypothesis, verdict and why, evidence with paper ids, unknowns, testHere, proposals. */
export function dossierText(d) {
  if (!d) return '';
  const paper = id => (d.papers?.[id] && d.papers[id] !== id ? `${id} "${d.papers[id]}"` : id);
  const ev = xs => (xs?.length ? xs.map(e => `- ${e.point} [papers: ${e.papers.map(paper).join('; ')}]`).join('\n') : '- (none)');
  return [
    `Dossier ${d.id} (${d.kind === 'paper' ? 'a paper review' : 'research on an idea'}, ${String(d.at ?? '').slice(0, 10)})`,
    d.paper ? `The paper: ${d.paper.title}${d.paper.year ? ` (${d.paper.year})` : ''} [${d.paper.id}]${d.ref ? `; the owner gave: ${d.ref}` : ''}` : null,
    d.asked && d.asked !== d.hypothesis ? `The owner asked: ${d.asked}` : null,
    `Hypothesis: ${d.hypothesis}`,
    `Verdict: ${d.verdict ?? '–'}. Why: ${d.verdictWhy || '–'}`,
    d.summary ? `Summary: ${d.summary}` : null,
    `Evidence for:\n${ev(d.evidenceFor)}`,
    `Evidence against:\n${ev(d.evidenceAgainst)}`,
    `What no paper settles:\n${d.unknowns?.length ? d.unknowns.map(u => `- ${u}`).join('\n') : '- (none listed)'}`,
    `How to test it here: ${d.testHere?.design || '–'}${d.testHere?.data?.length ? `\n  Data: ${d.testHere.data.join(', ')}` : ''}${d.testHere?.alreadyHere?.length ? `\n  Already here: ${d.testHere.alreadyHere.join('; ')}` : ''}`,
    `The dossier's proposals (in the library, tagged to this case):\n${d.proposals?.length ? d.proposals.map(p => `- ${p.id} (${label(p.lens)}): ${p.title}. ${p.thesis} Test: ${p.test.variable}; must beat ${p.test.benchmark}${p.test.placebo ? `; placebo ${p.test.placebo}` : ''}.${p.citations?.length ? ` Cites ${p.citations.join(', ')}.` : ''}`).join('\n') : '- (none)'}`,
    d.questionsForOwner?.length ? `The dossier asked the owner: ${d.questionsForOwner.join(' | ')}` : null,
  ].filter(Boolean).join('\n');
}
const DOSSIER_SECTION = 'The literature dossier this case started from (the desk read the papers; build on it, challenge it, do not repeat it)';

// ── the researchers' answer in round 2 on ───────────────────────────────────────────────────────────────────────

/**
 * A researcher's answer in round 2 on: { headline, reply, revise: [{ id, ...changed fields }], proposals: [new], questionsForOwner }.
 * A revision is kept only for this researcher's own proposals in the case (`ownIds`); new proposals pass the same
 * check as round 1 (validateProposals). Returns { ok, value, notes }.
 */
export function validateRoundAnswer(obj, lens, { ownIds = [], paperIds = null, maxNew = 2 } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const reply = str(obj.reply, 3000); if (!reply) return { ok: false, errors: ['reply missing'] };
  const own = new Set(ownIds), revise = [];
  for (const r of Array.isArray(obj.revise) ? obj.revise.slice(0, 6) : []) {
    const id = str(r?.id, 160); if (!id || !own.has(id) || revise.some(x => x.id === id)) continue;
    const v = validateReply({ reply: 'x', revise: r }).value?.revise; if (v) revise.push({ id, ...v });
  }
  const np = Array.isArray(obj.proposals) && obj.proposals.length ? validateProposals({ proposals: obj.proposals.slice(0, maxNew) }, lens, { paperIds }) : null;
  const proposals = np?.ok ? np.value.proposals : [];
  const notes = [...(np?.notes ?? []), ...(RESULT_WORDS.test(reply) ? [`${lens}: result wording in the reply; a researcher must not claim a result`] : [])];
  return { ok: true, notes, value: { headline: str(obj.headline, 300) ?? '', reply, revise, proposals, questionsForOwner: arr(obj.questionsForOwner ?? obj.questions, 3, q => str(q, 300)) } };
}

/** Apply a round's revisions to the library (applyRevision per proposal). */
export function applyRevisions(lib, revise, at = new Date().toISOString()) {
  const by = Object.fromEntries((revise ?? []).map(({ id, ...r }) => [id, r]));
  return (lib ?? []).map(p => (by[p.id] ? applyRevision(p, by[p.id], at) : p));
}

// ── what each side reads ────────────────────────────────────────────────────────────────────────────────────────

const STOP = new Set('the a an of to in on and or for with by is are be at as from vs does do it its this that than when after before into over per same what which how why would could should we our you your can there their they them not but if then so any all more most less only also just'.split(' '));
const words = s => new Set(String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
/**
 * The `max` items most related to a query (shared words), in their original order; ties keep the first. For prompts
 * on a smaller model (DeepSeek: 64k context, 8k output), where the whole Evidence Book (~42k tokens) will not fit.
 */
export function pickRelevant(items, query, textOf, { max = 40 } = {}) {
  const q = words(query); if (!q.size) return (items ?? []).slice(0, max);
  const scored = (items ?? []).map((x, i) => { const w = words(textOf(x)); let k = 0; for (const t of q) if (w.has(t)) k++; return { x, i, k }; });
  const keep = new Set(scored.filter(s => s.k > 0).sort((a, b) => b.k - a.k || a.i - b.i).slice(0, max).map(s => s.i));
  return scored.filter(s => keep.has(s.i)).map(s => s.x);
}
/** Cut text to n characters, saying so. */
export const clip = (s, n) => { const t = typeof s === 'string' ? s : JSON.stringify(s ?? ''); return t.length > n ? `${t.slice(0, n)}\n… (cut: ${t.length - n} more characters)` : t; };

/**
 * Keep a prompt's sections under `maxChars` in all: the longest section is cut first (never below `floor`), so the
 * question and the owner's message, which are short, are never cut. DeepSeek reads 64k tokens; ~4 characters a token.
 */
export function fitSections(sections, maxChars, { floor = 2000 } = {}) {
  const out = sections.map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v ?? '')]);
  for (let guard = 0; guard < 50; guard++) {
    const total = out.reduce((a, [k, v]) => a + k.length + v.length, 0); if (total <= maxChars) break;
    const i = out.reduce((b, x, j) => (x[1].length > out[b][1].length ? j : b), 0), len = out[i][1].length;
    if (len <= floor) break;
    out[i] = [out[i][0], clip(out[i][1], Math.max(floor, len - (total - maxChars) - 80))];
  }
  return out;
}

/** A proposal in a few lines (what the other researchers and earlier rounds need, not the whole card). */
export const proposalLine = p => (p ? `- ${p.id} (${label(p.lens)}${p.version > 1 ? `, version ${p.version}` : ''}): ${p.title}. ${String(p.thesis ?? '').slice(0, 300)} Test: ${String(p.test?.variable ?? '').slice(0, 160)}; must beat ${String(p.test?.benchmark ?? '').slice(0, 120)}; placebo ${String(p.test?.placebo ?? '').slice(0, 100)}.` : '');
/** A proposal in full, without its history, for the researcher who owns it and for the Head. */
export const proposalFull = p => { if (!p) return ''; const { history, feedback, lifecycle, threadJob, card, near, ...rest } = p; return JSON.stringify(rest); };

const reviewText = (rv, { full = false } = {}) => {
  if (!rv) return '(none)';
  if (full) { const { model, notes, ...x } = rv; return JSON.stringify(x); }
  return `Head of Research review ${rv.n} (after round ${rv.afterRound}): ${rv.headline ?? ''} Next step: ${rv.nextStep ?? '–'}${rv.nextStepWhy ? ` (${rv.nextStepWhy})` : ''}.${rv.plan?.variable ? ` Plan: ${rv.plan.variable}; benchmark ${rv.plan.benchmark ?? '–'}.` : ''}`;
};

/** The case so far as text, oldest first: the question, each round (owner's message, each researcher's answer), the reviews in between. */
export function caseText(c, lib = [], { proposals = 'line', replyChars = 1500 } = {}) {
  const byId = Object.fromEntries((lib ?? []).map(p => [p.id, p])), out = [`Question (${c.date}): ${c.question || c.title}`];
  if (c.images?.length) out.push(picturesText(c.images));
  const dp = (c.dossier?.proposals ?? []).map(p => p.id);
  if (dp.length) out.push(`\n### Before round 1: the literature dossier ${c.dossier.id} (verdict ${c.dossier.verdict ?? '–'})\n${proposals === 'full' ? dp.map(id => byId[id] ? `  ${proposalFull(byId[id])}` : `  - ${id} (no longer in the library)`).join('\n') : `  Proposals: ${dp.join(', ')}`}`);
  for (const r of c.rounds) {
    out.push(`\n### Round ${r.n} (${String(r.at).slice(0, 16)})${r.n > 1 && r.owner ? `\nThe owner: ${r.owner}` : ''}${r.n > 1 && r.images?.length ? `\n${picturesText(r.images)}` : ''}`);
    for (const [lens, a] of Object.entries(r.answers ?? {})) {
      out.push(`${label(lens)}: ${a.headline}${a.reply ? `\n  Reply: ${String(a.reply).slice(0, replyChars)}` : ''}${a.questions?.length ? `\n  Asked the owner: ${a.questions.join(' | ')}` : ''}`);
      const ids = uniq([...(a.proposals ?? []), ...(a.revised ?? [])]);
      if (ids.length) out.push(proposals === 'full' ? ids.map(id => byId[id] ? `  ${proposalFull(byId[id])}` : `  - ${id} (no longer in the library)`).join('\n') : `  Proposals: ${ids.join(', ')}${a.revised?.length ? ` (revised: ${a.revised.join(', ')})` : ''}`);
    }
    for (const [lens, e] of Object.entries(r.errors ?? {})) out.push(`${label(lens)}: did not answer (${String(e).slice(0, 120)})`);
    for (const rv of c.reviews.filter(x => x.afterRound === r.n)) out.push(`\n${reviewText(rv)}`);
  }
  return out.join('\n');
}

/**
 * The sections one researcher reads in round 2 on (prompt order: the question, the case so far, the others' latest
 * answers, the Head's latest review, its own proposals in full, the owner's message last). Context the server adds
 * (the data inventory, a slice of the Evidence Book and register) goes after these.
 */
export function roundSections(c, lens, { lib = [], ownerMessage = '', images = [] } = {}) {
  const byId = Object.fromEntries((lib ?? []).map(p => [p.id, p])), last = c.rounds.at(-1), rv = latestReview(c);
  const others = LENSES.filter(l => l !== lens).map(l => {
    const r = [...c.rounds].reverse().find(x => x.answers?.[l]), a = r?.answers?.[l]; if (!a) return `${label(l)}: (has not answered yet)`;
    return `${label(l)} (round ${r.n}): ${a.headline}${a.reply ? `\n${String(a.reply).slice(0, 1500)}` : ''}\nIts proposals:\n${lensIds(c, l).map(id => proposalLine(byId[id]) || `- ${id} (no longer in the library)`).join('\n') || '(none)'}`;
  }).join('\n\n');
  const own = lensIds(c, lens);
  return [
    ['The question this case is about', c.question || c.title],
    ...(c.dossier ? [[DOSSIER_SECTION, dossierText(c.dossier)]] : []),
    ['The case so far (oldest first)', clip(caseText(c, lib, { replyChars: 600 }), 14_000)],
    ["The other researchers' latest answers", others],
    ['The Head of Research\'s latest review (peer review of all three: take its corrections seriously)', rv ? clip(reviewText(rv, { full: true }), 9000) : '(no review yet: the owner has not sent this case to the Head of Research)'],
    ['Your proposals in this case (current versions; revise them by id)', own.length ? own.map(id => byId[id] ? proposalFull(byId[id]) : `${id} (no longer in the library)`).join('\n') : '(none yet)'],
    [`The owner's message that starts round ${(last?.n ?? 0) + 1} (answer it)`, [ownerMessage || '(no message)', picturesText(images)].filter(Boolean).join('\n\n')],
  ];
}

/** How to answer in round 2 on (appended to the researcher's own role). */
export const ROUND_RULES = [
  'This is a case: one question the owner put to the pod. You are in a loop with the other two researchers and the Head of Research.',
  "Answer the owner's message first, in plain words, in \"reply\". Then say where you agree and disagree with the other researchers and with the Head's review, and why. If the Head found an error in your work, fix it or say why it is not an error.",
  'Revise your own proposals by id in "revise" (only the fields that change). Add a new proposal only when the conversation calls for one: at most two, and none that repeats one already in the case.',
  'Be brief: the reply under 250 words, one or two sentences per field. The whole answer must fit well inside 6,000 tokens.',
  'Never claim a result. A proposal is a test to run, not a finding.',
].map(s => `- ${s}`).join('\n');

/** The Head of Research's sections: the whole case with every proposal in full, the owner's marks, the quick tests run. */
export function headSections(c, { lib = [], fb = {}, quickTests = [], catalogue = [] } = {}) {
  const ids = proposalIds(c);
  return [
    ['The question this case is about', c.question || c.title],
    ...(c.dossier ? [[DOSSIER_SECTION, dossierText(c.dossier)]] : []),
    ['The whole case, oldest first, with every proposal in full (current versions)', caseText(c, lib, { proposals: 'full', replyChars: 3000 })],
    ["The owner's marks on these proposals", ids.filter(id => fb[id]).map(id => `- ${id}: ${fb[id].status}${fb[id].note ? ` (${fb[id].note})` : ''}`).join('\n') || '(none)'],
    ['Quick tests already run for this case or its proposals (exploratory, never banked)', quickTests.length ? quickTests.map(t => `- ${t.id}: ${t.x} → ${t.y}, verdict ${t.verdict ?? '–'}${t.summary ? `: ${t.summary}` : ''}`).join('\n') : '(none)'],
    ['The quick-test catalogue (series ids for "quickTest"; horizons from 1, 2, 5, 10, 20, 60 days)', catalogue.join(', ')],
  ];
}

// ── the Head of Research's review ───────────────────────────────────────────────────────────────────────────────

/**
 * The Head of Research's review: { headline, agree[], disagree[{ issue, positions{lens}, side, why }],
 * peerReview{ lens: { summary, errors[], overclaims[], contradictions[] } }, plan{ title, variable, condition, universe,
 * horizons, benchmark, placebo, feeds[], killIf, builds[] }, alreadyKnown[{ ref, says }], questionsForOwner[],
 * nextStep, nextStepWhy, quickTest|null }. A review with no plan variable and benchmark, or no next step, fails.
 * The quick test is checked against the quick test's own rules (normaliseSpec) and dropped when it does not pass.
 */
export function validateHeadReview(obj, { lenses = LENSES, proposalIds: ids = null } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const errors = [], known = ids ? new Set(ids) : null;
  const nextStep = NEXT_STEPS.includes(obj.nextStep) ? obj.nextStep : null; if (!nextStep) errors.push(`nextStep must be one of ${NEXT_STEPS.join(', ')}`);
  const P = obj.plan ?? {}, plan = { title: str(P.title, 160) ?? '', variable: str(P.variable, 500), condition: str(P.condition, 400) ?? '', universe: str(Array.isArray(P.universe) ? P.universe.join(', ') : P.universe, 200) ?? '',
    horizons: str(Array.isArray(P.horizons) ? P.horizons.join(', ') : P.horizons, 160) ?? '', benchmark: str(P.benchmark, 300), placebo: str(P.placebo, 300) ?? '',
    feeds: arr(P.feeds, 10, f => str(f, 120)), killIf: str(P.killIf, 300) ?? '', builds: arr(P.builds, 8, id => { const s = str(id, 160); return s && (!known || known.has(s)) ? s : null; }) };
  if (!plan.variable || !plan.benchmark) errors.push('plan needs a variable and a benchmark');
  if (errors.length) return { ok: false, errors };
  const side = v => (LENSES.includes(v) ? v : 'none');
  const peerReview = {};
  for (const l of lenses) { const r = obj.peerReview?.[l]; if (!r) continue;
    peerReview[l] = { summary: str(r.summary, 600) ?? '', errors: arr(r.errors, 6, s => str(s, 400)), overclaims: arr(r.overclaims, 6, s => str(s, 400)), contradictions: arr(r.contradictions, 6, s => str(s, 400)) }; }
  let quickTest = null;
  if (obj.quickTest && typeof obj.quickTest === 'object') {
    try { const s = normaliseSpec(obj.quickTest); quickTest = { ...s, why: str(obj.quickTest.why, 300) ?? '' }; } catch { quickTest = null; }
  }
  const value = {
    headline: str(obj.headline, 300) ?? '',
    agree: arr(obj.agree, 8, s => str(s, 400)),
    disagree: arr(obj.disagree, 6, d => (str(d?.issue, 300) ? { issue: str(d.issue, 300), positions: Object.fromEntries(LENSES.filter(l => str(d.positions?.[l], 400)).map(l => [l, str(d.positions[l], 400)])), side: side(d.side), why: str(d.why, 600) ?? '' } : null)),
    peerReview, plan,
    alreadyKnown: arr(obj.alreadyKnown, 8, k => (str(k?.ref, 120) ? { ref: str(k.ref, 120), says: str(k.says, 400) ?? '' } : null)),
    questionsForOwner: arr(obj.questionsForOwner, 4, q => str(q, 300)),
    nextStep, nextStepWhy: str(obj.nextStepWhy, 500) ?? '', quickTest,
  };
  const notes = RESULT_WORDS.test(`${value.headline} ${value.nextStepWhy} ${value.agree.join(' ')}`) ? ['result wording: the Head of Research must not claim a result'] : [];
  return { ok: true, value, notes };
}

/**
 * The Head's combined plan as a proposal-shaped object, for the quick test (js/quickTestView.js openFor, which reads
 * rules.universe, rules.signal, rules.horizon, test.variable and test.horizons; quickTest, when the Head gave a valid
 * one, is used as it is). The id is the case's, so the test is linked to the case.
 */
export function planProposal(c) {
  const rv = latestReview(c); if (!rv?.plan) return null;
  const p = rv.plan;
  return { id: c.id, title: p.title || c.title, lens: 'head', thesis: p.condition, rules: { universe: p.universe, signal: p.variable, horizon: p.horizons },
    test: { variable: p.variable, benchmark: p.benchmark, placebo: p.placebo, horizons: p.horizons }, ...(rv.quickTest ? { quickTest: rv.quickTest } : {}) };
}

// ── migration: research_pod_sessions → cases ────────────────────────────────────────────────────────────────────

/**
 * Turn the stored sessions into cases, once each (the store remembers which it migrated; a session written by the
 * case flow carries its caseId and is skipped). A weekly session with no brief becomes "Weekly session <date>".
 * Returns { store, changed, tags: [{ caseId, ids }], restore: [proposals no longer in the library] }, oldest first,
 * so a proposal proposed in two sessions ends up tagged with the later one.
 */
export function migrate(store, sessions, lib = []) {
  let s = readStore(store); const done = new Set(s.migrated), have = new Set(s.cases.map(c => c.id)), inLib = new Set((lib ?? []).map(p => p.id));
  const tags = [], restore = [];
  for (const ses of [...(sessions ?? [])].reverse()) {
    if (!ses?.id || done.has(ses.id) || ses.caseId) continue;
    done.add(ses.id);
    const id = `case-${ses.id}`; if (have.has(id)) continue;
    let c = newCase({ id, question: ses.brief ?? '', date: ses.date ?? String(ses.at ?? '').slice(0, 10), at: ses.at ?? new Date(0).toISOString(), sessionId: ses.id });
    const answers = Object.fromEntries(Object.entries(ses.researchers ?? {}).map(([lens, r]) => [lens, answerOf(r)]));
    c = appendRound(c, { owner: ses.brief || null, answers, errors: ses.errors ?? {}, at: ses.at, web: ses.web });
    c.migrated = true;
    s = putCase(s, c); have.add(id);
    const ids = Object.values(ses.researchers ?? {}).flatMap(r => (r.proposals ?? []).map(p => p.id));
    tags.push({ caseId: id, ids });
    for (const r of Object.values(ses.researchers ?? {})) for (const p of r.proposals ?? []) if (!inLib.has(p.id)) { inLib.add(p.id); restore.push({ ...p, firstSeen: ses.date, lastSeen: ses.date, caseId: id, caseIds: [id] }); }
  }
  const changed = done.size !== s.migrated.length || tags.length > 0;
  return { store: { ...s, migrated: [...done] }, changed, tags, restore };
}

/** Apply a migration's tags and restored proposals to the library. */
export function migrateLibrary(lib, { tags = [], restore = [] } = {}) {
  let out = [...(lib ?? []), ...restore];
  for (const t of tags) out = tagLibrary(out, t.ids, t.caseId);
  return out;
}

export { slug };

// ── Jobs that survive a restart (2026-11-06) ─────────────────────────────────────────────────────────────────────────
// Rounds and reviews run in memory, so a redeploy killed them: twice on 2026-11-06 a round was lost and the case was left
// with no round and no job. While a job runs, the case carries a small marker (`inProgress`): the kind, the owner's
// message, the picture ids, when it started and how many times it has been started. The job clears it when it finishes
// or fails. On boot the server finds the markers a dead process left behind and starts each job again, once: a job lost
// a second time is given up with an error the page shows, and a marker older than six hours is dropped the same way.
export const RESUME_MAX_AGE_MS = 6 * 3600_000;
export const RESUME_MAX_ATTEMPTS = 2;
export const LOST_TWICE = 'lost to a restart twice; press resend';
export const LOST_OLD = 'lost to a server restart more than 6 hours ago; press resend';
export const JOB_KINDS = ['pod', 'round', 'review'];

/** The in-progress marker for a job: kind (pod = round 1, round, review), the owner's message, picture ids, the pod's brief and lenses. */
export function jobMarker({ kind, owner = null, images = [], brief = null, lenses = null, at = new Date().toISOString(), attempts = 1, firstStartedAt = null } = {}) {
  if (!JOB_KINDS.includes(kind)) throw new Error(`unknown job kind ${kind}`);
  const ids = uniq((images ?? []).map(a => (typeof a === 'string' ? a : a?.id)));
  return { kind, startedAt: at, firstStartedAt: firstStartedAt ?? at, attempts, ...(attempts > 1 ? { resumedAfterRestart: true } : {}),
    ...(owner ? { owner: String(owner).slice(0, 3000) } : {}), ...(ids.length ? { images: ids } : {}), ...(brief ? { brief: String(brief).slice(0, 3000) } : {}), ...(lenses?.length ? { lenses } : {}) };
}

/**
 * The markers a dead process left behind: [{ id, marker, action, attempts }]. action: 'resume' (start it again, as attempt
 * `attempts`), 'give-up' (already restarted once and lost again) or 'expire' (started more than six hours ago).
 * A case whose job is running in this process (`running[id].status === 'running'`) is left alone.
 */
export function staleJobs(store, { nowMs = Date.now(), running = {}, maxAgeMs = RESUME_MAX_AGE_MS, maxAttempts = RESUME_MAX_ATTEMPTS } = {}) {
  return readStore(store).cases.filter(c => c?.inProgress && running[c.id]?.status !== 'running').map(c => {
    const m = c.inProgress, age = nowMs - Date.parse(m.firstStartedAt ?? m.startedAt), n = Number.isFinite(m.attempts) ? m.attempts : 1;
    const action = !JOB_KINDS.includes(m.kind) || !Number.isFinite(age) || age >= maxAgeMs ? 'expire' : n >= maxAttempts ? 'give-up' : 'resume';
    return { id: c.id, marker: m, action, attempts: action === 'resume' ? n + 1 : n };
  }).sort((a, b) => String(a.marker.startedAt).localeCompare(String(b.marker.startedAt)));
}

/** The marker for a restarted job: one more attempt, flagged as resumed. */
export const resumedMarker = (m, at = new Date().toISOString()) => jobMarker({ ...m, at, attempts: (m.attempts ?? 1) + 1, firstStartedAt: m.firstStartedAt ?? m.startedAt });

/** A finished job: the marker comes off, and a resumed job tags what it wrote (the newest round, or review) with resumedAfterRestart. */
export function finishJob(c) {
  if (!c?.inProgress) return c;
  const { inProgress: m, ...rest } = c;
  if (!m.resumedAfterRestart) return rest;
  const tag = x => ({ ...x, resumedAfterRestart: true, attempts: m.attempts });
  if (m.kind === 'review' && rest.reviews?.length) return { ...rest, reviews: [...rest.reviews.slice(0, -1), tag(rest.reviews.at(-1))] };
  if (m.kind !== 'review' && rest.rounds?.length) return { ...rest, rounds: [...rest.rounds.slice(0, -1), tag(rest.rounds.at(-1))] };
  return rest;
}

/** A failed or abandoned job: the marker comes off and the error is recorded where the page shows it. */
export function failJob(c, error, { at = new Date().toISOString(), lostToRestart = false } = {}) {
  const { inProgress: m, ...rest } = c ?? {};
  return { ...rest, lastError: { at, error: String(error ?? '').slice(0, 400), ...(lostToRestart ? { lostToRestart: true, kind: m?.kind ?? null, attempts: m?.attempts ?? null } : {}) } };
}
