/**
 * The shapes every desk-pipeline skill must answer in, and the code that checks and repairs them.
 *
 * WHY. A model's reply is read by code (the Head of Desk reads the analysts; the pages read the Head), so a reply
 * in the wrong shape breaks something far from its cause. Every reply is validated here. A small fault (a score
 * of 3 where the scale stops at 2, a rating written "Long" for "LONG") is repaired and NOTED. A reply that can't
 * be used fails, the run retries once, and after that the skill is recorded as failed. Nothing is ever silently
 * turned into a neutral reading: an instrument whose rating can't be read is REVIEW, never FLAT
 * (TradingAgents' rating.py rule, #1170 there).
 *
 * Pure. Tested in js/deskSchemas.test.mjs. Design: plans/DESK_ANALYST_PIPELINE.md §5.
 */
import { DESK_CCYS, allInstruments } from './deskPack.js';

/** The five-step instrument scale (owner, 2026-11-03), most bullish first, plus REVIEW for "unreadable". */
export const RATINGS = ['STRONG_LONG', 'LONG', 'FLAT', 'SHORT', 'STRONG_SHORT'];
export const RATING_REVIEW = 'REVIEW';
export const CONFIDENCE = ['low', 'medium', 'high'];
export const TONES = ['risk_on', 'risk_off', 'mixed'];

const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clampScore = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(-2, Math.min(2, n)) : null; };

/** A rating as written by a model → one of RATINGS, or REVIEW. Tolerates case, spaces, hyphens and common synonyms. */
export function normalizeRating(v) {
  const s = String(v ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (RATINGS.includes(s)) return s;
  const syn = { BUY: 'LONG', BULLISH: 'LONG', STRONG_BUY: 'STRONG_LONG', SELL: 'SHORT', BEARISH: 'SHORT', STRONG_SELL: 'STRONG_SHORT',
    NEUTRAL: 'FLAT', HOLD: 'FLAT', OVERWEIGHT: 'LONG', UNDERWEIGHT: 'SHORT' };
  return syn[s] ?? RATING_REVIEW;
}

/** Keys an impact may name: one of the eight currencies, an instrument, or RISK (global risk appetite). */
const IMPACT_KEYS = new Set([...DESK_CCYS, ...allInstruments(), 'RISK']);

/**
 * An analyst's report: { headline, points[{claim, evidence, impact{KEY: -2..2}}], gaps[], confidence }.
 * Returns { ok, value, notes } (value is the repaired report) or { ok: false, errors }.
 */
export function validateAnalystReport(obj, skillId) {
  const errors = [], notes = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 400);
  if (!headline) errors.push('headline missing');
  const rawPoints = Array.isArray(obj.points) ? obj.points : [];
  if (!rawPoints.length) errors.push('points missing or empty');
  const points = [];
  for (const [i, p] of rawPoints.slice(0, 10).entries()) {
    const claim = str(p?.claim, 500);
    if (!claim) { notes.push(`point ${i + 1} dropped: no claim`); continue; }
    const impact = {};
    for (const [k, v] of Object.entries(p?.impact && typeof p.impact === 'object' ? p.impact : {})) {
      const key = String(k).toUpperCase().replace('/', '');
      if (!IMPACT_KEYS.has(key)) { notes.push(`point ${i + 1}: impact key ${k} dropped`); continue; }
      const sc = clampScore(v);
      if (sc == null) { notes.push(`point ${i + 1}: impact ${k} not a number`); continue; }
      if (sc !== Number(v)) notes.push(`point ${i + 1}: impact ${k} ${v} clamped to ${sc}`);
      impact[key] = sc;
    }
    points.push({ claim, evidence: str(p?.evidence, 300), impact });
  }
  if (rawPoints.length > 10) notes.push(`${rawPoints.length - 10} points beyond 10 dropped`);
  if (rawPoints.length && !points.length) errors.push('no usable point');
  let confidence = String(obj.confidence ?? '').toLowerCase();
  if (!CONFIDENCE.includes(confidence)) { notes.push(`confidence "${obj.confidence}" read as low`); confidence = 'low'; }
  const gaps = (Array.isArray(obj.gaps) ? obj.gaps : []).map(g => str(g, 300)).filter(Boolean).slice(0, 20);
  if (errors.length) return { ok: false, errors };
  return { ok: true, notes, value: { skill: skillId, headline, points, gaps, confidence } };
}

/**
 * The Head of Desk's book: { headline, global{tone, summary}, currencies{CCY{bias, why}}, instruments{NAME{rating,
 * conviction, why, invalidation}}, risks[], gaps[] }. Every instrument in `instruments` gets a card: one the model
 * left out, or rated with something unreadable, is REVIEW and listed in notes.
 */
export function validateHeadBook(obj, instruments = allInstruments()) {
  const errors = [], notes = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 400);
  if (!headline) errors.push('headline missing');
  let tone = String(obj.global?.tone ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (!TONES.includes(tone)) { notes.push(`global tone "${obj.global?.tone}" read as mixed`); tone = 'mixed'; }
  const global = { tone, summary: str(obj.global?.summary, 1200) };
  const currencies = {};
  for (const c of DESK_CCYS) {
    const v = obj.currencies?.[c];
    const bias = clampScore(v?.bias);
    if (bias == null) notes.push(`currency ${c}: no bias`);
    currencies[c] = { bias, why: str(v?.why, 500) };
  }
  const src = obj.instruments && typeof obj.instruments === 'object' ? obj.instruments : {};
  if (!Object.keys(src).length) errors.push('instruments missing');
  const cards = {};
  let review = 0;
  for (const name of instruments) {
    const v = src[name] ?? src[name.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2')];
    if (!v) { cards[name] = { rating: RATING_REVIEW, conviction: 'low', why: '', invalidation: '', missing: true }; review++; continue; }
    const rating = normalizeRating(v.rating);
    if (rating === RATING_REVIEW) { review++; notes.push(`${name}: rating "${v.rating}" unreadable -> REVIEW`); }
    let conviction = String(v.conviction ?? '').toLowerCase();
    if (!CONFIDENCE.includes(conviction)) conviction = 'low';
    const card = { rating, conviction, why: str(v.why, 600), invalidation: str(v.invalidation, 300) };
    if (v.size != null) { const sz = Number(v.size); if (Number.isFinite(sz)) card.size = Math.max(0, Math.min(1.5, Math.round(sz * 100) / 100)); }
    if (v.plan && typeof v.plan === 'object') card.plan = { zone: str(v.plan.zone, 200), invalidation: str(v.plan.invalidation, 200), timing: str(v.plan.timing, 200) };
    cards[name] = card;
  }
  if (review) notes.push(`${review} of ${instruments.length} instruments are REVIEW`);
  if (review > instruments.length / 2) errors.push(`more than half the instruments have no readable rating (${review})`);
  const risks = (Array.isArray(obj.risks) ? obj.risks : []).map(r => str(r, 300)).filter(Boolean).slice(0, 10);
  const gaps = (Array.isArray(obj.gaps) ? obj.gaps : []).map(g => str(g, 300)).filter(Boolean).slice(0, 20);
  if (errors.length) return { ok: false, errors };
  // Phase 7: the Head's answer to each red-team challenge (optional; only when there were challenges)
  const redTeamAnswers = (Array.isArray(obj.redTeamAnswers) ? obj.redTeamAnswers : []).slice(0, 12)
    .map(a => ({ id: Number.isFinite(Number(a?.id)) ? Number(a.id) : null, answer: str(a?.answer, 400), changed: a?.changed === true })).filter(a => a.answer);
  return { ok: true, notes, value: { headline, global, currencies, instruments: cards, risks, gaps, ...(redTeamAnswers.length ? { redTeamAnswers } : {}) } };
}

// ── Phase 2: the debate layers (plans/DESK_ANALYST_PIPELINE.md §4, Layers 2 and 3) ─────────────────────────────

const strList = (v, n = 8, max = 300) => (Array.isArray(v) ? v : []).map(x => str(x, max)).filter(Boolean).slice(0, n);
const conf = v => { const c = String(v ?? '').toLowerCase(); return CONFIDENCE.includes(c) ? c : 'low'; };

/**
 * One advocate's case: { headline, cases{SUBJECT{argument, evidence[], strength}}, rebuttal }. Subjects are GLOBAL
 * for the global debate or the eight currencies for the currency debate. Every subject should be argued; more than
 * half missing fails the reply.
 */
export function validateDebateCase(obj, subjects) {
  const errors = [], notes = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 400);
  if (!headline) errors.push('headline missing');
  const src = obj.cases && typeof obj.cases === 'object' ? obj.cases : {};
  const cases = {}; let missing = 0;
  for (const subj of subjects) {
    const c = src[subj];
    const argument = str(c?.argument, 900);
    if (!argument) { missing++; notes.push(`${subj}: no argument`); continue; }
    cases[subj] = { argument, evidence: strList(c.evidence, 6, 200), strength: conf(c.strength) };
  }
  if (missing > subjects.length / 2) errors.push(`${missing} of ${subjects.length} subjects have no argument`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, notes, value: { headline, cases, rebuttal: str(obj.rebuttal, 1200) } };
}

/** The Global Manager's ruling: { tone, conviction, summary, drivers[], flip[] }. */
export function validateGlobalView(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const notes = [];
  let tone = String(obj.tone ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (!TONES.includes(tone)) { notes.push(`tone "${obj.tone}" read as mixed`); tone = 'mixed'; }
  const summary = str(obj.summary, 1500);
  if (!summary) return { ok: false, errors: ['summary missing'] };
  return { ok: true, notes, value: { tone, conviction: conf(obj.conviction), summary, drivers: strList(obj.drivers), flip: strList(obj.flip) } };
}

/** The Currency Manager's ruling: { currencies{CCY{bias, conviction, why, flip}}, ranking[] }. At least 6 of 8 need a bias. */
export function validateCurrencyViews(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const notes = [], currencies = {};
  let have = 0;
  for (const c of DESK_CCYS) {
    const v = obj.currencies?.[c];
    const bias = clampScore(v?.bias);
    if (bias == null) notes.push(`${c}: no bias`); else have++;
    currencies[c] = { bias, conviction: conf(v?.conviction), why: str(v?.why, 600), flip: str(v?.flip, 300) };
  }
  if (have < 6) return { ok: false, errors: [`only ${have} of 8 currencies have a bias`] };
  let ranking = (Array.isArray(obj.ranking) ? obj.ranking : []).map(x => String(x).toUpperCase()).filter(x => DESK_CCYS.includes(x));
  ranking = [...new Set(ranking)];
  if (ranking.length !== 8) {
    notes.push('ranking incomplete: rebuilt from the biases');
    ranking = [...DESK_CCYS].sort((a, b) => (currencies[b].bias ?? 0) - (currencies[a].bias ?? 0));
  }
  return { ok: true, notes, value: { currencies, ranking } };
}

/**
 * One asset desk's views for its group: { summary, instruments{NAME{rating, conviction, why, plan{zone, invalidation,
 * timing}}} }. Same REVIEW rule as the Head's cards.
 */
export function validateAssetViews(obj, instruments) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const notes = [], out = {};
  const src = obj.instruments && typeof obj.instruments === 'object' ? obj.instruments : {};
  let review = 0;
  for (const name of instruments) {
    const v = src[name] ?? src[name.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2')];
    if (!v) { out[name] = { rating: RATING_REVIEW, conviction: 'low', why: '', plan: null, missing: true }; review++; continue; }
    const rating = normalizeRating(v.rating);
    if (rating === RATING_REVIEW) { review++; notes.push(`${name}: rating "${v.rating}" unreadable -> REVIEW`); }
    const plan = v.plan && typeof v.plan === 'object' ? { zone: str(v.plan.zone, 200), invalidation: str(v.plan.invalidation, 200), timing: str(v.plan.timing, 200) } : null;
    out[name] = { rating, conviction: conf(v.conviction), why: str(v.why, 600), plan };
  }
  if (review > instruments.length / 2) return { ok: false, errors: [`more than half the group has no readable rating (${review} of ${instruments.length})`] };
  if (review) notes.push(`${review} of ${instruments.length} are REVIEW`);
  return { ok: true, notes, value: { summary: str(obj.summary, 800), instruments: out } };
}

/** One risk-desk voice: { headline, adjustments[{target, size 0..1.5, veto, reason}], warnings[] }. */
export function validateRiskCase(obj, targets) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 400);
  if (!headline) return { ok: false, errors: ['headline missing'] };
  const notes = [], ok = new Set(['ALL', ...targets]);
  const adjustments = [];
  for (const a of (Array.isArray(obj.adjustments) ? obj.adjustments : []).slice(0, 50)) {
    const target = String(a?.target ?? '').toUpperCase().replace('/', '');
    if (!ok.has(target)) { notes.push(`adjustment target ${a?.target} dropped`); continue; }
    const size = Number(a?.size);
    adjustments.push({ target, size: Number.isFinite(size) ? Math.max(0, Math.min(1.5, size)) : 1, veto: a?.veto === true, reason: str(a?.reason, 300) });
  }
  return { ok: true, notes, value: { headline, adjustments, warnings: strList(obj.warnings) } };
}

// ── Phase 4: the end-of-day reflection ──────────────────────────────────────────────────────────────────────────

const SCOPES = ['global', 'currency', 'asset', 'risk', 'process'];
/**
 * The reflection: what the morning book got right and wrong once the day is scored, and at most five lessons. Each
 * lesson is one day's anecdote and is labelled so wherever it is shown; nothing here is evidence until a prereg tests
 * it (forge/DESK_ANALYST_PIPELINE_PREREG.md; plans/DESK_ANALYST_PIPELINE.md §9k).
 */
export function validateReflection(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 300);
  if (!headline) return { ok: false, errors: ['headline missing'] };
  const notes = [], lessons = [];
  for (const l of (Array.isArray(obj.lessons) ? obj.lessons : []).slice(0, 5)) {
    const lesson = str(l?.lesson, 400); if (!lesson) { notes.push('a lesson with no text was dropped'); continue; }
    const scope = SCOPES.includes(String(l?.scope)) ? String(l.scope) : 'process';
    lessons.push({ lesson, scope, about: str(l?.about, 60) ?? '', evidence: str(l?.evidence, 400) ?? '' });
  }
  if (!lessons.length) return { ok: false, errors: ['at least one lesson is required'] };
  return { ok: true, notes, value: { headline, worked: strList(obj.worked).slice(0, 6), failed: strList(obj.failed).slice(0, 6), lessons, watch: strList(obj.watch).slice(0, 5) } };
}

// ── Phase 5: session updates ────────────────────────────────────────────────────────────────────────────────────

/**
 * A session update: what changed since the book and the few cards that must change. current: { INST: { rating, size } }
 * (the live view before this update). A "change" that changes nothing is dropped; at most 12 are kept.
 */
export function validateSessionUpdate(obj, current) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 300);
  if (!headline) return { ok: false, errors: ['headline missing'] };
  const notes = [], changes = [];
  for (const c of (Array.isArray(obj.changes) ? obj.changes : []).slice(0, 20)) {
    const instrument = String(c?.instrument ?? '').toUpperCase().replace('/', '');
    if (!current[instrument]) { notes.push(`change on unknown instrument ${c?.instrument} dropped`); continue; }
    const to = normalizeRating(c?.to);
    if (to === RATING_REVIEW) { notes.push(`${instrument}: rating "${c?.to}" unreadable, dropped`); continue; }
    const sz = Number(c?.size), size = Number.isFinite(sz) ? Math.max(0, Math.min(1.5, sz)) : null;
    if (to === current[instrument].rating && (size == null || size === current[instrument].size)) { notes.push(`${instrument}: no change, dropped`); continue; }
    const why = str(c?.why, 400); if (!why) { notes.push(`${instrument}: a change with no reason, dropped`); continue; }
    if (changes.length < 12) changes.push({ instrument, to, size, why });
  }
  return { ok: true, notes, value: { headline, globalStillHolds: obj.globalStillHolds !== false, changes, watch: strList(obj.watch).slice(0, 5) } };
}

// ── Phase 7: the red team ──────────────────────────────────────────────────────────────────────────────────────

const RT_KINDS = ['crowding', 'contradiction', 'tested-null', 'event', 'data', 'stretched', 'other'];
/** The red team's challenges to the draft book: at most 8, each aimed at a market, a currency or the whole book. */
export function validateRedTeam(obj, instruments) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 300);
  if (!headline) return { ok: false, errors: ['headline missing'] };
  const notes = [], ok = new Set(['ALL', ...instruments, 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']), challenges = [];
  for (const c of (Array.isArray(obj.challenges) ? obj.challenges : []).slice(0, 12)) {
    const target = String(c?.target ?? '').toUpperCase().replace('/', '');
    if (!ok.has(target)) { notes.push(`challenge on unknown target ${c?.target} dropped`); continue; }
    const challenge = str(c?.challenge, 500); if (!challenge) continue;
    const severity = ['high', 'medium', 'low'].includes(c?.severity) ? c.severity : 'medium';
    if (challenges.length < 8) challenges.push({ id: challenges.length + 1, target, kind: RT_KINDS.includes(c?.kind) ? c.kind : 'other', severity, challenge, ask: str(c?.ask, 300) ?? '' });
  }
  return { ok: true, notes, value: { headline, challenges } };
}

// ── Phases 6 and 15: the economist's release briefs ─────────────────────────────────────────────────────────────

/** One brief per upcoming release, in the order given; at most as many as were given. */
export function validateEconomist(obj, releases) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 300);
  if (!headline) return { ok: false, errors: ['headline missing'] };
  const briefs = (Array.isArray(obj.briefs) ? obj.briefs : []).slice(0, releases.length).map((b, i) => ({
    family: releases[i]?.family ?? null, at: releases[i]?.at ?? null, event: str(b?.event, 160) ?? releases[i]?.event ?? '',
    priced: str(b?.priced, 400) ?? '', sizeAndSpeed: str(b?.sizeAndSpeed, 500) ?? '', ifHot: str(b?.ifHot, 400) ?? '', ifCold: str(b?.ifCold, 400) ?? '', bookAtRisk: str(b?.bookAtRisk, 400) ?? '', watch: str(b?.watch, 300) ?? '',
  })).filter(b => b.sizeAndSpeed);
  if (!briefs.length && releases.length) return { ok: false, errors: ['no usable brief'] };
  const notes = FORECAST_WORDS.test(JSON.stringify(briefs)) ? ['forecasting wording found'] : [];
  return { ok: true, notes, value: { headline, briefs } };
}

// ── Phase 3: the newsletter writer ───────────────────────────────────────────────────────────────────────────────

/** The house labels every newsletter section carries (the regular issue's legend). */
export const NL_LABELS = ['Observed data', 'Model output', 'Tested association', 'Context, not a signal', 'Hypothesis', 'Untested interpretation'];
const FORECAST_WORDS = /\b(will (?:rise|fall|rally|drop|climb|slide|bounce|break)|set to (?:rise|fall|rally)|expect(?:ed)? (?:a )?(?:rally|drop|rise|fall)|bound to)\b/i;

/**
 * The desk edition: { subject, standfirst, sections[{title, label, body}], ideas[{instrument, view, size, level,
 * invalidation, why}] }. A section with an unknown label gets "Untested interpretation" (the safe label) and a note.
 * Forecasting wording in the opening is reported in notes, so the owner can see it on the page.
 */
export function validateNewsletterIssue(obj, instruments = allInstruments()) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const errors = [], notes = [];
  const subject = str(obj.subject, 120);
  if (!subject) errors.push('subject missing');
  const standfirst = str(obj.standfirst, 1500);
  if (!standfirst) errors.push('standfirst missing');
  if (FORECAST_WORDS.test(standfirst)) notes.push('the opening uses forecasting wording');
  const sections = [];
  for (const [i, x] of (Array.isArray(obj.sections) ? obj.sections : []).slice(0, 8).entries()) {
    const title = str(x?.title, 120), body = str(x?.body, 2500);
    if (!title || !body) { notes.push(`section ${i + 1} dropped: no title or body`); continue; }
    let label = NL_LABELS.find(l => l.toLowerCase() === String(x?.label ?? '').trim().toLowerCase());
    if (!label) { notes.push(`section "${title}": label "${x?.label}" is not a house label, read as Untested interpretation`); label = 'Untested interpretation'; }
    sections.push({ title, label, body });
  }
  if (sections.length < 3) errors.push(`only ${sections.length} usable sections`);
  const ideas = [];
  for (const x of (Array.isArray(obj.ideas) ? obj.ideas : []).slice(0, 8)) {
    const instrument = String(x?.instrument ?? '').toUpperCase().replace('/', '');
    if (!instruments.includes(instrument)) { notes.push(`idea on unknown instrument ${x?.instrument} dropped`); continue; }
    const view = normalizeRating(x?.view);
    if (view === RATING_REVIEW) { notes.push(`idea ${instrument}: view "${x?.view}" unreadable, dropped`); continue; }
    const size = Number(x?.size);
    ideas.push({ instrument, view, size: Number.isFinite(size) ? Math.max(0, Math.min(1.5, size)) : null, level: str(x?.level, 200), invalidation: str(x?.invalidation, 200), why: str(x?.why, 400) });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, notes, value: { subject, standfirst, sections, ideas } };
}

/** The JSON shape each schema asks for, written into the prompt so the model sees the exact contract. */
export const SCHEMA_PROMPTS = {
  analyst_report: `{
  "headline": "one sentence: the single most important thing your data says today",
  "points": [
    { "claim": "what the data shows, with the number", "evidence": "the feed id it came from, or the ledger tag",
      "impact": { "USD": 1, "RISK": -1 } }
  ],
  "gaps": ["feed id: why it could not be used"],
  "confidence": "low | medium | high"
}
impact keys: the eight currencies (USD EUR GBP JPY AUD NZD CAD CHF), an instrument name (e.g. GOLD, NQ, EURJPY), or RISK (global risk appetite).
impact values: integers from -2 (strongly negative for it) to +2 (strongly positive). Leave impact empty when a point has no direction. 1 to 8 points.`,
  head_book: `{
  "headline": "one sentence for the day",
  "global": { "tone": "risk_on | risk_off | mixed", "summary": "2-4 sentences" },
  "currencies": { "USD": { "bias": 1, "why": "one sentence" }, "EUR": { ... }, ... all eight },
  "instruments": { "EURUSD": { "rating": "STRONG_LONG | LONG | FLAT | SHORT | STRONG_SHORT", "conviction": "low | medium | high",
                    "why": "one or two sentences naming the legs and the analysts behind it", "invalidation": "what would prove this wrong today",
                    "size": 1.0, "plan": { "zone": "where, if the asset desk gave one", "invalidation": "level or event", "timing": "session or window" } }, ... every instrument listed },
  "risks": ["the things that could break the day"],
  "gaps": ["what the desk could not see today"]
}
currency bias: integer -2..+2. Every instrument must have a card. size: 0 (stand aside) to 1.5, 1 = normal; include size and plan only when the risk desk and asset desks gave you the material.`,
  debate_case: `{
  "headline": "your case in one sentence",
  "cases": { "SUBJECT": { "argument": "the strongest honest case, with numbers", "evidence": ["analyst id or ledger tag"], "strength": "low | medium | high" }, ... one per subject },
  "rebuttal": "if you were shown the other side's case: where it is weakest, with evidence (empty on an opening)"
}
strength is how strong your own case honestly is for that subject, not how loudly you argue it.`,
  global_view: `{
  "tone": "risk_on | risk_off | mixed", "conviction": "low | medium | high",
  "summary": "3-5 sentences: the ruling and why the winning side won",
  "drivers": ["the facts that decided it"], "flip": ["what would reverse the ruling today"]
}`,
  currency_views: `{
  "currencies": { "USD": { "bias": 1, "conviction": "low | medium | high", "why": "1-2 sentences naming the side that won and why", "flip": "what would change it" }, ... all eight },
  "ranking": ["strongest", "...", "weakest"]   // all eight currencies, once each
}
bias: integer -2..+2.`,
  asset_views: `{
  "summary": "2-3 sentences for the group",
  "instruments": { "NAME": { "rating": "STRONG_LONG | LONG | FLAT | SHORT | STRONG_SHORT", "conviction": "low | medium | high",
                   "why": "the legs and asset evidence behind it", "plan": { "zone": "where it would be taken, from the levels and vol reports", "invalidation": "level or event that proves it wrong", "timing": "session or window" } }, ... every instrument in your group }
}`,
  risk_case: `{
  "headline": "your stance in one sentence",
  "adjustments": [ { "target": "ALL | an instrument name", "size": 1.0, "veto": false, "reason": "one sentence" } ],
  "warnings": ["what could go wrong today"]
}
size: 0 to 1.5 (1 = normal). veto: true only when the trade should not be taken today at all.`,
  economist_briefs: `{
  "headline": "the release that matters most for the book, in one sentence",
  "briefs": [ { "event": "the release", "priced": "consensus vs previous, and what that means", "sizeAndSpeed": "typical move by market at 30 min and 4 h, peak time, how much is kept, with counts",
               "ifHot": "what history shows after hot prints, with counts", "ifCold": "after cold prints, with counts", "bookAtRisk": "the desk's cards exposed, view and size", "watch": "one thing to watch" } ]   // one per release, in the order given
}`,
  theory_ideas: `{
  "headline": "the most promising question this week, in one sentence",
  "theories": [ { "title": "short name", "variable": "the variable to construct, exactly, from data we have", "condition": "the regime or extreme to condition on",
                 "horizons": "the family of horizons to sweep", "outcome": "what is measured", "benchmark": "what it must beat", "placebo": "the shuffle or placebo",
                 "data": "the feeds or files it needs, and the span", "power": "rough count of events and whether that is enough", "source": "the note, paper, ledger entry or scored-history fact it comes from",
                 "whyNew": "why it is not a repeat of a register row or Evidence Book entry", "priority": "high | medium | low" } ]   // 3 to 6
}`,
  red_team: `{
  "headline": "the biggest weakness in the draft book, in one sentence",
  "challenges": [ { "target": "ALL | an instrument | a currency", "kind": "crowding | contradiction | tested-null | event | data | stretched | other", "severity": "high | medium | low", "challenge": "what is wrong, with the numbers", "ask": "what the Head should do or answer" } ]   // at most 8, most serious first; [] if the book is sound
}`,
  session_update: `{
  "headline": "what changed since the book, in one sentence",
  "globalStillHolds": true,
  "changes": [ { "instrument": "EURUSD", "to": "STRONG_LONG | LONG | FLAT | SHORT | STRONG_SHORT", "size": 0.5, "why": "the new fact that forces it" } ],   // only the cards that must change; [] is a good answer
  "watch": ["what to check before the next session"]
}`,
  reflection: `{
  "headline": "the day against the book, in one sentence",
  "worked": ["what the book got right, naming the cards and the move in u"],
  "failed": ["what it got wrong, naming the cards and the move in u"],
  "lessons": [ { "lesson": "one sentence a desk could act on tomorrow", "scope": "global | currency | asset | risk | process", "about": "USD, GOLD, the risk desk...", "evidence": "the cards, scores and data behind it" } ],   // 1 to 5
  "watch": ["what tomorrow's desk should check because of today"]
}
A lesson from one day is an anecdote, not evidence. Never claim an edge or a pattern from a single day.`,
  newsletter_issue: `{
  "subject": "the headline, under 70 characters",
  "standfirst": "the opening paragraph, 3-5 sentences",
  "sections": [ { "title": "The global backdrop", "label": "one of: Observed data | Model output | Tested association | Context, not a signal | Hypothesis | Untested interpretation", "body": "2-5 sentences" }, ... 4 to 6 sections, in the order given ],
  "ideas": [ { "instrument": "EURUSD", "view": "STRONG_LONG | LONG | FLAT | SHORT | STRONG_SHORT", "size": 0.85, "level": "zone or level from the book", "invalidation": "what proves it wrong", "why": "one sentence" } ]   // at most 8
}`,
};
