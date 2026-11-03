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
  return { ok: true, notes, value: { headline, global, currencies, instruments: cards, risks, gaps } };
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
};
