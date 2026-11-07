// Tests for js/researchCase.js.   node js/researchCase.test.mjs
import assert from 'node:assert/strict';
import { citedPapers, citedPapersText, LABEL, NEXT_STEPS, caseTitle, newCase, answerOf, appendRound, appendReview, latestReview, proposalIds, lensIds, summary, putCase, setStatus, tagLibrary, uniqueIds,
  validateRoundAnswer, applyRevisions, pickRelevant, clip, fitSections, caseText, roundSections, headSections, validateHeadReview, planProposal, migrate, migrateLibrary, readStore, emptyStore, MAX_CASES, ROUND_RULES,
  dossierCaseId, caseForDossier, dossierContext, caseFromDossier, dossierText, jobMarker, staleJobs, resumedMarker, finishJob, failJob, LOST_TWICE, RESUME_MAX_ATTEMPTS, RESUME_MAX_AGE_MS } from './researchCase.js';
import { validateProposals, mergeLibrary } from './researchPod.js';
import { suggestSpec } from './quickTest.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const prop = (title, extra = {}) => ({ title, family: 'FX Fair Value', thesis: `${title}: gaps close`, mechanism: 'hedgers rebalance', sources: [{ title: 'Rogoff 1996', url: 'https://x' }],
  inputs: [{ what: 'CPI levels', status: 'missing', how: 'FRED' }], rules: { universe: 'EURUSD', signal: 'z of the 2y rate gap', horizon: '5d' }, test: { variable: 'rate gap z', benchmark: 'carry', placebo: 'shuffled gaps', horizons: '1, 5, 20 days' }, ...extra });
const r1 = lens => ({ headline: `${lens} says`, questionsForOwner: ['which pairs?'], model: 'deepseek-chat', proposals: validateProposals({ proposals: [prop(`${lens} idea`)] }, lens).value.proposals });

t('a new case: title from the question, or "Weekly session <date>"', () => {
  assert.equal(LABEL, 'proposals and reviews, not results');
  const c = newCase({ id: 'case-1', question: 'What would an FX fair-value system need?\nmore', date: '2026-11-05', at: '2026-11-05T10:00:00Z' });
  assert.equal(c.title, 'What would an FX fair-value system need?'); assert.equal(c.origin, 'owner'); assert.equal(c.status, 'open'); assert.deepEqual(c.rounds, []);
  const w = newCase({ id: 'case-2', date: '2026-11-01' }); assert.equal(w.title, 'Weekly session 2026-11-01'); assert.equal(w.origin, 'weekly');
  assert.equal(caseTitle('x'.repeat(300), 'd').length, 138);
});

t('rounds, reviews, proposal ids and the summary', () => {
  let c = newCase({ id: 'case-1', question: 'Q?', date: '2026-11-05', at: '2026-11-05T10:00:00Z' });
  c = appendRound(c, { owner: 'Q?', answers: { quant: answerOf(r1('quant')), macro: answerOf(r1('macro')) }, errors: { flow: 'timeout' }, at: '2026-11-05T10:10:00Z' });
  assert.equal(c.rounds[0].n, 1); assert.deepEqual(c.rounds[0].answers.quant.proposals, ['quant-quant-idea']); assert.equal(c.rounds[0].errors.flow, 'timeout');
  let s = summary(c); assert.equal(s.rounds, 1); assert.equal(s.reviewed, false); assert.equal(s.proposals, 2);
  c = appendReview(c, { headline: 'h', nextStep: 'quick-test', plan: { variable: 'v', benchmark: 'b' } }, { at: '2026-11-05T11:00:00Z', model: 'claude' });
  assert.equal(latestReview(c).afterRound, 1); assert.equal(latestReview(c).n, 1);
  s = summary(c, { status: 'running', kind: 'review', stage: 'head' }); assert.equal(s.reviewed, true); assert.equal(s.reviewCurrent, true); assert.equal(s.nextStep, 'quick-test'); assert.equal(s.job.status, 'running');
  c = appendRound(c, { owner: 'go deeper on carry', answers: { quant: answerOf({ headline: 'h2', reply: 'r', questionsForOwner: [] }, { newIds: ['quant-new'], revised: ['quant-quant-idea'] }) } });
  assert.equal(summary(c).reviewCurrent, false, 'a round after the review makes it stale');
  assert.deepEqual(proposalIds(c), ['quant-quant-idea', 'macro-macro-idea', 'quant-new']); assert.deepEqual(lensIds(c, 'quant'), ['quant-quant-idea', 'quant-new']);
  assert.throws(() => setStatus(c, 'maybe')); assert.equal(setStatus(c, 'parked').status, 'parked');
});

t('the store: put replaces by id, newest first, capped; a bad value reads as empty', () => {
  let st = emptyStore();
  for (let i = 0; i < MAX_CASES + 5; i++) st = putCase(st, { ...newCase({ id: `c${i}`, date: 'd', at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` }), updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() });
  assert.equal(st.cases.length, MAX_CASES); assert.equal(st.cases[0].id, `c${MAX_CASES + 4}`);
  st = putCase(st, { ...st.cases[5], title: 'changed', updatedAt: '2027-01-01' }); assert.equal(st.cases[0].title, 'changed'); assert.equal(st.cases.length, MAX_CASES);
  assert.deepEqual(readStore(null), emptyStore()); assert.deepEqual(readStore([1, 2]), emptyStore());
});

t('library tags: caseId is the latest case, caseIds every case; they survive a re-proposal (mergeLibrary)', () => {
  let lib = mergeLibrary([], r1('quant').proposals, '2026-11-01');
  lib = tagLibrary(lib, ['quant-quant-idea'], 'case-a'); lib = tagLibrary(lib, ['quant-quant-idea'], 'case-b');
  assert.equal(lib[0].caseId, 'case-b'); assert.deepEqual(lib[0].caseIds, ['case-a', 'case-b']);
  lib = mergeLibrary(lib, r1('quant').proposals, '2026-11-08'); assert.deepEqual(lib[0].caseIds, ['case-a', 'case-b'], 'kept through a merge');
  lib = tagLibrary(lib, ['quant-quant-idea'], 'case-c'); assert.deepEqual(lib[0].caseIds, ['case-a', 'case-b', 'case-c']);
  // a new proposal in another case with the same title gets its own id; in its own case it is the same proposal
  const np = validateProposals({ proposals: [prop('quant idea')] }, 'quant').value.proposals;
  assert.equal(uniqueIds(np, lib, 'case-z')[0].id, 'quant-quant-idea-2');
  assert.equal(uniqueIds(np, lib, 'case-b')[0].id, 'quant-quant-idea');
  assert.deepEqual(uniqueIds([...np, ...np], [], 'x').map(p => p.id), ['quant-quant-idea', 'quant-quant-idea-2']);
});

t('round answers: reply required, revisions only of own proposals, new proposals checked, result wording noted', () => {
  assert.equal(validateRoundAnswer('x', 'quant').ok, false); assert.equal(validateRoundAnswer({ headline: 'h' }, 'quant').ok, false);
  const v = validateRoundAnswer({ headline: 'h', reply: 'Agree with macro on the gap; I fix the benchmark.', questionsForOwner: ['a', 'b', 'c', 'd'],
    revise: [{ id: 'quant-a', test: { benchmark: 'carry and momentum' }, thesis: 'new thesis' }, { id: 'macro-b', thesis: 'not mine' }, { id: 'quant-a', thesis: 'dup' }, { id: 'quant-c' }],
    proposals: [prop('second idea'), { title: 'no mechanism' }, prop('third'), prop('fourth')] }, 'quant', { ownIds: ['quant-a', 'quant-c'] });
  assert.ok(v.ok); assert.equal(v.value.revise.length, 1); assert.equal(v.value.revise[0].id, 'quant-a'); assert.equal(v.value.revise[0].test.benchmark, 'carry and momentum');
  assert.deepEqual(v.value.proposals.map(p => p.id), ['quant-second-idea'], 'at most two new, each must pass');
  assert.equal(v.value.questionsForOwner.length, 3);
  assert.equal(validateRoundAnswer({ reply: 'r', proposals: [] }, 'flow').value.proposals.length, 0);
  assert.equal(validateRoundAnswer({ reply: 'We found it is profitable.' }, 'flow').notes.length, 1);
  const lib = applyRevisions([{ id: 'quant-a', thesis: 'old', rules: { signal: 's' }, test: { benchmark: 'carry' } }, { id: 'x', thesis: 't' }], v.value.revise, '2026-11-06');
  assert.equal(lib[0].thesis, 'new thesis'); assert.equal(lib[0].version, 2); assert.equal(lib[0].test.benchmark, 'carry and momentum'); assert.equal(lib[0].rules.signal, 's'); assert.equal(lib[1].thesis, 't');
});

t('pickRelevant keeps the most related items in their order; clip says it cut', () => {
  const ev = [{ c: 'gold and real yields' }, { c: 'EURUSD carry rate gap' }, { c: 'COT crowding' }, { c: 'rate gap momentum EURUSD carry' }];
  assert.deepEqual(pickRelevant(ev, 'carry on EURUSD rate gap', e => e.c, { max: 2 }).map(e => e.c), ['EURUSD carry rate gap', 'rate gap momentum EURUSD carry']);
  assert.equal(pickRelevant(ev, '', e => e.c, { max: 3 }).length, 3);
  assert.equal(pickRelevant(ev, 'zzz', e => e.c).length, 0);
  assert.match(clip('x'.repeat(50), 10), /cut: 40 more characters/); assert.equal(clip('abc', 10), 'abc');
});

const built = () => {
  const lib = [...r1('quant').proposals, ...r1('macro').proposals, ...r1('flow').proposals];
  let c = newCase({ id: 'case-1', question: 'Can rate gaps time EURUSD?', date: '2026-11-05', at: '2026-11-05T10:00:00Z' });
  c = appendRound(c, { owner: c.question, answers: Object.fromEntries(['quant', 'macro', 'flow'].map(l => [l, answerOf(r1(l))])) });
  return { c, lib };
};
t('what a researcher reads in round 2: the question, the case, the others, the Head, its own proposals in full, the owner last', () => {
  let { c, lib } = built();
  let s = roundSections(c, 'quant', { lib, ownerMessage: 'Why not use the 10y?' });
  const by = Object.fromEntries(s);
  assert.equal(s.at(-1)[0], "The owner's message that starts round 2 (answer it)"); assert.equal(s.at(-1)[1], 'Why not use the 10y?');
  assert.match(by["The other researchers' latest answers"], /Macro researcher \(round 1\): macro says/); assert.match(by["The other researchers' latest answers"], /flow-flow-idea/);
  assert.doesNotMatch(by["The other researchers' latest answers"], /quant says/);
  assert.match(s[3][1], /no review yet/);
  assert.match(by['Your proposals in this case (current versions; revise them by id)'], /"id":"quant-quant-idea"/);
  c = appendReview(c, { headline: 'All three circle the rate gap', nextStep: 'quick-test', plan: { variable: '2y gap', benchmark: 'carry' }, peerReview: { quant: { errors: ['the sample is 2004 on, not 1990'] } } });
  s = roundSections(c, 'quant', { lib, ownerMessage: 'm' });
  assert.match(s[3][1], /the sample is 2004 on/); assert.match(s[1][1], /Head of Research review 1 \(after round 1\)/);
  assert.match(ROUND_RULES, /250 words/);
  const h = Object.fromEntries(headSections(c, { lib, fb: { 'quant-quant-idea': { status: 'build', note: 'go' } }, quickTests: [{ id: 'qt-1', x: 'fred:DGS2', y: 'oanda:EURUSD', verdict: 'NULL' }], catalogue: ['oanda:EURUSD', 'fred:DGS2'] }));
  assert.match(h['The whole case, oldest first, with every proposal in full (current versions)'], /"mechanism":"hedgers rebalance"/);
  assert.match(h["The owner's marks on these proposals"], /quant-quant-idea: build \(go\)/);
  assert.match(caseText(c, []), /no longer in the library|Proposals: quant-quant-idea/);
});

const review = { headline: 'Converging on the 2y gap', agree: ['the rate gap matters'], disagree: [{ issue: 'horizon', positions: { quant: '5d', macro: '20d', zz: 'x' }, side: 'macro', why: 'policy moves slowly' }],
  peerReview: { quant: { summary: 's', errors: ['wrong sample start'], overclaims: [], contradictions: ['carry-gap is a null in the Evidence Book'] }, macro: { summary: 'ok' }, nobody: { summary: 'x' } },
  plan: { title: 'Rate-gap timing', variable: 'z of the US-DE 2y gap', condition: 'gap z beyond 1.5', universe: ['EURUSD'], horizons: [1, 5, 20], benchmark: 'carry', placebo: 'shuffled gap dates', feeds: ['fred-dgs2'], builds: ['quant-quant-idea', 'nope'] },
  alreadyKnown: [{ ref: 'carry-gap', says: 'null' }, { says: 'no ref' }], questionsForOwner: ['which horizon?'], nextStep: 'quick-test', nextStepWhy: 'cheap first look',
  quickTest: { x: 'fred:DGS2', y: 'oanda:EURUSD', horizons: [1, 5, 20], xTransform: 'chg5', why: 'does the 2y lead' } };
t('the Head review: needs a next step and a plan; lenses, ids and the quick test checked', () => {
  assert.equal(validateHeadReview(null).ok, false);
  assert.match(validateHeadReview({ ...review, nextStep: 'run it' }).errors.join(), /nextStep/);
  assert.match(validateHeadReview({ ...review, plan: { variable: 'v' } }).errors.join(), /benchmark/);
  const v = validateHeadReview(review, { proposalIds: ['quant-quant-idea'] }); assert.ok(v.ok, v.errors?.join());
  assert.deepEqual(Object.keys(v.value.peerReview), ['quant', 'macro']); assert.deepEqual(v.value.peerReview.macro.errors, []);
  assert.deepEqual(v.value.disagree[0].positions, { quant: '5d', macro: '20d' }); assert.equal(v.value.disagree[0].side, 'macro');
  assert.deepEqual(v.value.plan.builds, ['quant-quant-idea']); assert.equal(v.value.plan.universe, 'EURUSD'); assert.equal(v.value.plan.horizons, '1, 5, 20');
  assert.equal(v.value.alreadyKnown.length, 1); assert.equal(v.value.quickTest.x, 'fred:DGS2'); assert.equal(v.value.quickTest.why, 'does the 2y lead');
  assert.ok(NEXT_STEPS.includes(v.value.nextStep));
  assert.equal(validateHeadReview({ ...review, quickTest: { x: 'made:up', y: 'oanda:EURUSD' } }).value.quickTest, null, 'an invalid quick test is dropped, the review stands');
  assert.equal(validateHeadReview({ ...review, headline: 'This is proven' }).notes.length, 1);
});

t('the quick test on the case: the Head plan as a proposal, linked by the case id', () => {
  let { c } = built(); assert.equal(planProposal(c), null);
  c = appendReview(c, validateHeadReview(review).value);
  const p = planProposal(c); assert.equal(p.id, 'case-1'); assert.equal(p.title, 'Rate-gap timing'); assert.equal(p.quickTest.y, 'oanda:EURUSD');
  const g = suggestSpec(p); assert.equal(g.y, 'oanda:EURUSD'); assert.deepEqual(g.horizons, [1, 5, 20]);
  const c2 = appendReview(built().c, { ...validateHeadReview(review).value, quickTest: null }); assert.equal('quickTest' in planProposal(c2), false);
});

const sessions = [
  { id: '2026-11-05-b', date: '2026-11-05', at: '2026-11-05T12:00:00Z', brief: 'Can rate gaps time EURUSD?', researchers: { quant: r1('quant'), macro: r1('macro') }, errors: { flow: 'cut' }, web: { arxiv: '40 items' } },
  { id: '2026-11-01-a', date: '2026-11-01', at: '2026-11-01T09:00:00Z', brief: '', researchers: { quant: r1('quant'), flow: r1('flow') }, errors: {} },
  { id: '2026-11-06-c', caseId: 'case-x', date: '2026-11-06', researchers: {} },
];
t('migration: every session becomes a case once, weekly ones titled, proposals tagged with the later case, none lost', () => {
  const lib = mergeLibrary([], [...r1('quant').proposals, ...r1('macro').proposals], '2026-11-05');   // the flow proposal has fallen out of the library
  const m = migrate(null, sessions, lib);
  assert.ok(m.changed); assert.equal(m.store.cases.length, 2, 'the session written by the case flow is skipped');
  const [a, b] = m.store.cases; assert.equal(a.id, 'case-2026-11-05-b'); assert.equal(a.title, 'Can rate gaps time EURUSD?'); assert.equal(a.rounds[0].owner, 'Can rate gaps time EURUSD?');
  assert.deepEqual(a.rounds[0].answers.quant.proposals, ['quant-quant-idea']); assert.equal(a.rounds[0].answers.quant.model, 'deepseek-chat'); assert.equal(a.rounds[0].errors.flow, 'cut');
  assert.equal(b.title, 'Weekly session 2026-11-01'); assert.equal(b.origin, 'weekly'); assert.equal(b.rounds[0].owner, null); assert.equal(b.createdAt, '2026-11-01T09:00:00Z');
  assert.deepEqual(m.restore.map(p => p.id), ['flow-flow-idea']);
  const lib2 = migrateLibrary(lib, m);
  const q = lib2.find(p => p.id === 'quant-quant-idea'); assert.equal(q.caseId, 'case-2026-11-05-b'); assert.deepEqual(q.caseIds, ['case-2026-11-01-a', 'case-2026-11-05-b']);
  assert.equal(lib2.find(p => p.id === 'flow-flow-idea').caseId, 'case-2026-11-01-a'); assert.equal(lib2.length, 3);
  // idempotent: a second read changes nothing, even after a case is edited
  const again = migrate(putCase(m.store, { ...a, title: 'edited', updatedAt: '2027' }), sessions, lib2); assert.equal(again.changed, false); assert.equal(again.tags.length, 0); assert.equal(again.store.cases[0].title, 'edited');
  assert.equal(migrate(m.store, [], lib2).changed, false);
  // a new session later is migrated on the next read
  const more = migrate(m.store, [{ id: 'n1', date: '2026-11-08', at: '2026-11-08T09:00:00Z', researchers: { macro: r1('macro') } }, ...sessions], lib2);
  assert.ok(more.changed); assert.equal(more.store.cases.length, 3); assert.deepEqual(more.store.migrated.sort(), ['2026-11-01-a', '2026-11-05-b', 'n1'].sort());
});

t('fitSections: the longest section is cut first, the short ones never', () => {
  const s = fitSections([['Q', 'short question'], ['Book', 'e'.repeat(50_000)], ['Register', 'r'.repeat(20_000)], ['Owner', { msg: 'hi' }]], 30_000);
  const total = s.reduce((a, [k, v]) => a + k.length + v.length, 0); assert.ok(total <= 30_000, String(total));
  assert.equal(s[0][1], 'short question'); assert.equal(s[3][1], '{"msg":"hi"}'); assert.match(s[1][1], /cut:/); assert.equal(s[2][1].length, 20_000);
  assert.deepEqual(fitSections([['a', 'b']], 10), [['a', 'b']]);
  const tight = fitSections([['a', 'x'.repeat(5000)], ['b', 'y'.repeat(5000)]], 100); assert.ok(tight.every(([, v]) => v.length >= 2000), 'never below the floor');
});

// ── a case from a literature dossier ──
const dossierRec = (extra = {}) => ({ id: 'idea-2026-11-04-abc', kind: 'idea', at: '2026-11-04T09:00:00Z', hypothesis: 'gold vol exhaustion <b>marks</b> a turn',
  paperNotes: { 'arxiv:1': { title: 'Vol spikes and reversals', year: 2019 }, 'doi:2': { title: 'Gold options', year: 2021 } },
  dossier: { hypothesis: 'After a gold implied-vol spike exhausts, gold mean-reverts over 5-20 days', summary: 'Mixed.', verdict: 'already-tested', verdictWhy: 'REG-GOLD-VOL covered it: NULL.',
    evidenceFor: [{ point: 'Vol spikes precede reversals in equities', papers: ['arxiv:1'] }], evidenceAgainst: [{ point: 'Not in gold', papers: ['doi:2'] }],
    unknowns: ['whether GVZ leads'], testHere: { design: 'GVZ z > 2 then gold 5/10/20d returns vs unconditional', data: ['cboe:GVZ', 'oanda:XAUUSD'], alreadyHere: ['REG-GOLD-VOL'] },
    proposals: validateProposals({ proposals: [prop('Gold vol fade', { citations: ['arxiv:1'] })] }, 'flow').value.proposals, questionsForOwner: ['which horizon?'] }, ...extra });
t('a dossier becomes a case: the hypothesis is the question, the dossier its context, no round, one case per dossier', () => {
  const rec = dossierRec(), c = caseFromDossier(rec, { date: '2026-11-05', at: '2026-11-05T10:00:00Z' });
  assert.equal(c.id, dossierCaseId(rec.id)); assert.equal(c.id, 'case-dossier-idea-2026-11-04-abc');
  assert.equal(c.question, rec.dossier.hypothesis); assert.equal(c.dossierId, rec.id); assert.equal(c.origin, 'dossier'); assert.deepEqual(c.rounds, []);
  assert.equal(c.dossier.verdict, 'already-tested'); assert.equal(c.dossier.asked, rec.hypothesis); assert.equal(c.dossier.papers['arxiv:1'], 'Vol spikes and reversals (2019)');
  assert.deepEqual(proposalIds(c), ['flow-gold-vol-fade']); assert.deepEqual(lensIds(c, 'flow'), ['flow-gold-vol-fade']); assert.deepEqual(lensIds(c, 'quant'), []);
  const s = summary(c); assert.equal(s.dossierId, rec.id); assert.equal(s.verdict, 'already-tested'); assert.equal(s.proposals, 1); assert.equal(s.rounds, 0);
  const store = putCase(emptyStore(), c); assert.equal(caseForDossier(store, rec.id).id, c.id); assert.equal(caseForDossier(store, 'other'), null);
  assert.equal(putCase(store, caseFromDossier(rec)).cases.length, 1, 'the same id: still one case');
  assert.throws(() => dossierContext({ id: 'x', dossier: null }), /no dossier/);
  assert.equal(dossierCaseId('a b/c'), 'case-dossier-a-b-c');
});
t('a paper review dossier: the question names the paper', () => {
  const rec = dossierRec({ id: 'paper-2026-11-04-x', kind: 'paper', ref: 'arxiv 1', hypothesis: 'the claim' });
  const c = caseFromDossier(rec, { date: '2026-11-05' });
  assert.equal(c.dossier.kind, 'paper'); assert.equal(c.dossier.paper.title, 'Vol spikes and reversals'); assert.match(c.question, /^Vol spikes and reversals: After a gold/);
  assert.match(dossierText(c.dossier), /a paper review/); assert.match(dossierText(c.dossier), /the owner gave: arxiv 1/);
});
t('every prompt in a dossier case reads the dossier block', () => {
  const rec = dossierRec(), c = caseFromDossier(rec, { date: '2026-11-05' }), lib = rec.dossier.proposals.map(p => ({ ...p, caseId: c.id }));
  const txt = dossierText(c.dossier);
  for (const re of [/Hypothesis: After a gold/, /Verdict: already-tested\. Why: REG-GOLD-VOL covered it/, /Vol spikes precede reversals in equities \[papers: arxiv:1 "Vol spikes and reversals \(2019\)"\]/,
    /Evidence against:\n- Not in gold \[papers: doi:2/, /whether GVZ leads/, /How to test it here: GVZ z > 2/, /Data: cboe:GVZ, oanda:XAUUSD/, /flow-gold-vol-fade \(Flow researcher\): Gold vol fade/, /The owner asked: gold vol exhaustion/])
    assert.match(txt, re);
  const rs = roundSections(c, 'flow', { lib, ownerMessage: 'It says already tested: what would be new?' });
  assert.equal(rs[1][0].startsWith('The literature dossier'), true); assert.equal(rs[1][1], txt);
  assert.match(Object.fromEntries(rs)['Your proposals in this case (current versions; revise them by id)'], /"id":"flow-gold-vol-fade"/);
  assert.equal(rs.at(-1)[0], "The owner's message that starts round 1 (answer it)");
  const hs = headSections(c, { lib }); assert.equal(hs[1][1], txt); assert.match(hs[2][1], /Before round 1: the literature dossier idea-2026-11-04-abc[\s\S]*"id":"flow-gold-vol-fade"/);
  assert.match(caseText(c, lib), /Proposals: flow-gold-vol-fade/);
  // an ordinary case has no dossier section
  assert.equal(roundSections(newCase({ id: 'k', question: 'q', date: 'd' }), 'quant').some(([k]) => /dossier/.test(k)), false);
});

t('jobs that survive a restart: the marker, which markers are stale, attempt counting, finishing and giving up', () => {
  const at = '2026-11-06T09:00:00.000Z', now = Date.parse(at);
  const m = jobMarker({ kind: 'round', owner: 'Test it on 2026 only', images: [{ id: 'img-2026-11-06-a', text: 'long reading' }, 'img-2026-11-06-b'], at });
  assert.deepEqual(m, { kind: 'round', startedAt: at, firstStartedAt: at, attempts: 1, owner: 'Test it on 2026 only', images: ['img-2026-11-06-a', 'img-2026-11-06-b'] }, 'small: picture ids only, no readings');
  assert.throws(() => jobMarker({ kind: 'lit' }));
  const base = newCase({ id: 'case-a', question: 'q', date: '2026-11-06', at });
  const store = { cases: [{ ...base, inProgress: m }, { ...base, id: 'case-b' }, { ...base, id: 'case-c', inProgress: jobMarker({ kind: 'review', at: '2026-11-06T02:00:00.000Z' }) }, { ...base, id: 'case-d', inProgress: resumedMarker(jobMarker({ kind: 'pod', brief: 'q', at }), '2026-11-06T09:30:00.000Z') }] };
  const st = staleJobs(store, { nowMs: now + 30 * 60_000 });
  assert.deepEqual(st.map(x => [x.id, x.action, x.attempts]), [['case-c', 'expire', 1], ['case-a', 'resume', 2], ['case-d', 'give-up', 2]], 'older than six hours expires; a second loss gives up; a first loss resumes as attempt 2; no marker, no entry');
  assert.equal(staleJobs(store, { nowMs: now, running: { 'case-a': { status: 'running' } } }).some(x => x.id === 'case-a'), false, 'a job running here is left alone (the per-case lock)');
  assert.equal(staleJobs(store, { nowMs: now, running: { 'case-a': { status: 'done' } } }).some(x => x.id === 'case-a'), true);
  // the six hours run from the first start, not the restart
  const old = resumedMarker(jobMarker({ kind: 'round', owner: 'x', at: '2026-11-06T01:00:00.000Z' }), at);
  assert.equal(old.attempts, 2); assert.equal(old.resumedAfterRestart, true); assert.equal(old.firstStartedAt, '2026-11-06T01:00:00.000Z'); assert.equal(old.startedAt, at);
  assert.equal(staleJobs({ cases: [{ ...base, inProgress: { ...old, attempts: 1 } }] }, { nowMs: Date.parse('2026-11-06T07:30:00.000Z') })[0].action, 'expire');
  // finishing: the marker comes off; a resumed job tags what it wrote
  const plain = finishJob(appendRound({ ...base, inProgress: m }, { owner: 'Test it on 2026 only', answers: {} }));
  assert.equal(plain.inProgress, undefined); assert.equal(plain.rounds.at(-1).resumedAfterRestart, undefined);
  const res = finishJob(appendRound({ ...base, inProgress: resumedMarker(m) }, { owner: 'Test it on 2026 only', answers: {} }));
  assert.equal(res.inProgress, undefined); assert.equal(res.rounds.at(-1).resumedAfterRestart, true); assert.equal(res.rounds.at(-1).attempts, 2);
  assert.equal(summary(res).resumedAfterRestart, true); assert.equal(summary(plain).resumedAfterRestart, false);
  const rv = finishJob(appendReview({ ...res, inProgress: resumedMarker(jobMarker({ kind: 'review', at })) }, { verdict: 'x' }));
  assert.equal(rv.reviews.at(-1).resumedAfterRestart, true); assert.equal(rv.rounds.at(-1).attempts, 2);
  assert.equal(finishJob(base), base, 'no marker, unchanged');
  // giving up: the marker comes off and the page shows why
  const gu = failJob({ ...base, inProgress: resumedMarker(m) }, LOST_TWICE, { at, lostToRestart: true });
  assert.equal(gu.inProgress, undefined); assert.deepEqual(gu.lastError, { at, error: 'lost to a restart twice; press resend', lostToRestart: true, kind: 'round', attempts: 2 });
  assert.equal(summary(gu).lostToRestart, true);
  assert.equal(failJob({ ...base, inProgress: m }, 'round: boom', { at }).lastError.lostToRestart, undefined);
  assert.equal(RESUME_MAX_ATTEMPTS, 2); assert.equal(RESUME_MAX_AGE_MS, 6 * 3600_000);
  assert.equal(summary(base, { status: 'running', kind: 'round', resumedAfterRestart: true, attempts: 2 }).job.resumedAfterRestart, true);
});
t('the Head sees the library papers the case cites (2026-11-06: three real papers were called "not in the reading list")', () => {
  const papers = [{ id: 'arxiv:2611.04223', arxiv: '2611.04223', title: 'Stress-state undercoverage', notes: { claim: 'intervals undercover in stress', stance: 'for' } },
    { id: 'doi:10.1002/fut.22208', doi: '10.1002/fut.22208', title: 'Who leads in gold price discovery' }, { id: 'arxiv:9999.00001', arxiv: '9999.00001', title: 'not cited' }];
  const got = citedPapers('quant cites arxiv:2611.04223 and macro doi:10.1002/fut.22208', papers).map(p => p.id);
  assert.deepEqual(got, ['arxiv:2611.04223', 'doi:10.1002/fut.22208']);
  const txt = citedPapersText(citedPapers('arxiv:2611.04223 10.1002/fut.22208', papers));
  assert.match(txt, /intervals undercover in stress/); assert.match(txt, /not read yet/);
  assert.match(citedPapersText([]), /none of the ids/);
});
console.log(`researchCase: ${n} tests passed`);
