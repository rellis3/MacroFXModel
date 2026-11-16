/**
 * js/newsletterTermV2Prose.js: the WRITTEN part of the terminal newsletter, version 2. Everything here turns what the desk run and the terminal
 * already hold into readable paragraphs; it never calls a model and never invents a view. The sources:
 *   - the desk writer's issue (run.newsletter.issue: standfirst and five sections), the currency debate (the strengthen and weaken cases per
 *     currency), the analysts' headlines and points (what each analyst argues, with its push on a market), the desk ruling, the evening review;
 *   - the terminal's own rule-built sentences (js/terminal/humanDrivers.js: tailwind / headwind, summary lines).
 * Hard rules, enforced here and tested: no entry, target, stop, size, zone or trade wording reaches the page (safeProse drops any sentence that has
 * it); no internal ids or route tags (clean); no sentence is printed twice in one issue (Dedupe); nothing is cut with "..." (fit ends on a
 * sentence, clause or word). Direction words are the analysts' arguments, labelled as explaining their thinking, never as a tested signal.
 */
import { analystLabel, stance, summaryLine, takeaway } from './terminal/humanDrivers.js';
import { cardDrivers } from './terminal/cardExplain.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);

/** Sentences that carry trade vocabulary: dropped, never edited. (A viewer rule: analysis, not trades, cost or private tooling.) */
const TRADE_WORDS = /\b(sizes?|sized|sizing|zones?|invalidat\w*|entry|entries|targets?|stop(?:-loss| loss)?|take[- ]profit|cards?|exposure cap|trimmed|signed small|ideas list|effective bets|book σ|expected shortfall|var95|stake|carry positions?|pays on this book)\b|\bR multiple/i;
// the verb forms are case-sensitive on the symbol part ("long run" is fine, "long AUDJPY" and "short the dollar" are not)
const TRADE_VERBS = /\b(?:SHORT|LONG)\b|\b(?:go|going|stay|stays|staying)\s+(?:long|short)\b|\b(?:long|short|Long|Short)\s+(?:the\s+)?(?:[A-Z]{3,6}\b|dollar\b|index\b|gold\b|yen\b|euro\b|crude\b)/;
export const TRADE_RE = { test: t => TRADE_WORDS.test(t) || TRADE_VERBS.test(t) };
/** The first trade-vocabulary match in a text, or null (the tests and safeProse use it). */
export const tradeHit = t => (String(t).match(TRADE_WORDS) ?? String(t).match(TRADE_VERBS))?.[0] ?? null;
/** Mojibake and internal tags removed; spacing tidied. Mirrors js/newsletterTermV2.js clean(): kept here so this file stands alone. */
export function clean(t) {
  return String(t ?? '').replace(/â€™/g, '’').replace(/â€“|â€”|â\u0080\u0094|â\u0080\u0093|â\u0088\u0092|âˆ’/g, '-').replace(/â€œ|â€\u009d|â€/g, '"').replace(/Â/g, '')
    .replace(/\s*\((?:[^()]*\b[a-z]+_[a-z_]+\b[^()]*)\)/g, '').replace(/\s*\((?:[a-z0-9]+[-/][a-z0-9/-]+(?:,\s*)?)+\)/gi, '')
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, m => ({ risk_on: 'risk-on', risk_off: 'risk-off' }[m] ?? m.replace(/_/g, ' ')))
    .replace(/\b(?:credit|liquidity|rates|events|yields|macro|options)[-/](?:board|gate|live|news|cb|curve|economy|oi|stress|quality)(?:\/[a-z]+)?\b/gi, '')
    .replace(/\s+([,.;:])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}
/** Sentences of a paragraph (a full stop followed by a space and a capital, a digit or a quote). Decimals and abbreviations are left alone. */
export function sentences(t) {
  const s = clean(t); if (!s) return [];
  return s.split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])/).map(x => x.trim()).filter(Boolean);
}
/** The trade-free sentences of a text, or '' when fewer than minKeep remain (a paragraph with its heart removed is dropped, not shown mangled). */
export function safeProse(t, { minKeep = 1 } = {}) {
  const keep = sentences(t).filter(x => !TRADE_RE.test(x));
  return keep.length >= minKeep ? keep.join(' ') : '';
}
/** Trim to at most max characters ending on a sentence, a clause or a word. Never "...". */
export function fit(t, max) {
  t = clean(t); if (t.length <= max) return t;
  const cut = t.slice(0, max), s = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  if (s > max * 0.5) return cut.slice(0, s + 1).trim();
  const c = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' - '), cut.lastIndexOf(' and '));
  if (c > max * 0.6) return cut.slice(0, c).replace(/[,;:\s]+$/, '') + '.';
  return cut.replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, '') + '.';
}
/** Whole sentences up to a character budget (never cuts a sentence: stops before the one that would not fit). */
export function sentencesUpTo(t, max) {
  const out = []; let n = 0;
  for (const s of sentences(t)) { if (TRADE_RE.test(s)) continue; if (n + s.length + 1 > max && out.length) break; if (s.length > max && !out.length) return fit(s, max); out.push(s); n += s.length + 1; }
  return out.join(' ');
}
/** A set that refuses a sentence it has already seen (normalised), so the same claim is never printed twice in one issue. */
export class Dedupe {
  constructor() { this.seen = new Set(); }
  key(s) { return String(s).toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().slice(0, 90); }
  /** The paragraph with already-seen sentences removed (and the rest remembered). */
  take(text) { const out = []; for (const s of sentences(text)) { const k = this.key(s); if (k.length < 12) { out.push(s); continue; } if (this.seen.has(k)) continue; this.seen.add(k); out.push(s); } return out.join(' '); }
}

// ── the desk writer's issue ─────────────────────────────────────────────────────────────────────────────────────
/** The desk writer's sections that explain (not the ideas list, which carries trade levels and sizes, and not the sections made of book and size talk). */
export function deskIssue(run) {
  const iss = run?.newsletter?.issue; if (!iss) return null;
  const dd = new Dedupe(), sec = {};
  const std = safeProse(iss.standfirst), title = clean(iss.subject);
  const sections = (iss.sections ?? []).map(s => ({ title: clean(s.title), label: clean(s.label), body: safeProse(s.body, { minKeep: 2 }) })).filter(s => s.body);
  return { subject: title, standfirst: std, sections, byTitle: t => sections.find(s => new RegExp(t, 'i').test(s.title)) ?? null, dd };
}

// ── currencies: reasons strong, reasons weak ────────────────────────────────────────────────────────────────────
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const BANK = { USD: 'Fed', EUR: 'ECB', GBP: 'BoE', JPY: 'BoJ', AUD: 'RBA', NZD: 'RBNZ', CAD: 'BoC', CHF: 'SNB' };
export { CCYS, BANK };
/** Per currency: the strengthen case and the weaken case the desk's two debaters made, plus the manager's reasoning and ranking. All model words already in the run. */
export function currencyCases(run) {
  const deb = run?.debate?.currency?.debate, view = run?.debate?.currency?.view, book = run?.head?.book?.currencies ?? {};
  const out = {};
  for (const c of CCYS) {
    const up = safeProse(deb?.ccy_strengthen?.view?.cases?.[c]?.argument), dn = safeProse(deb?.ccy_weaken?.view?.cases?.[c]?.argument), why = safeProse(book[c]?.why ?? view?.currencies?.[c]?.why);
    out[c] = { up, dn, why, bias: Number(book[c]?.bias ?? view?.currencies?.[c]?.bias ?? 0) };
  }
  return { cases: out, ranking: view?.ranking ?? [], headlineUp: safeProse(deb?.ccy_strengthen?.view?.headline), headlineDn: safeProse(deb?.ccy_weaken?.view?.headline) };
}
/** A short, true line on why a currency reads firm or weak: the analysts whose points push it hardest, from their stored impact on that currency. */
export function ccyPhrase(run, c, mood) {
  const by = [];
  for (const [id, a] of Object.entries(run?.analysts ?? {})) { if (!a?.ok) continue; let net = 0; for (const p of a.report?.points ?? []) { const v = Number(p?.impact?.[c]); if (Number.isFinite(v)) net += v; } if (net) by.push({ id, net }); }
  const sign = mood === 'firm' ? 1 : -1, hit = by.filter(x => Math.sign(x.net) === sign).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 2).map(x => analystLabel(x.id));
  if (!hit.length) return `${c} ${mood}: the analysts' points on it point both ways.`;
  const list = hit.length === 1 ? hit[0] : `${hit[0]} and ${hit[1]}`;
  return `${c} ${mood}: ${list} ${sign > 0 ? 'push it up' : 'weigh on it'}.`;
}
/** "X against Y": the leader and the laggard, strength first, then each side's reason in the desk's own words. Returns paragraphs, not a chart. */
export function headToHead(x, y, { sc1w, sc4h, cases }) {
  const f = v => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}σ` : 'n/a');
  const strength = `${x} is ${f(sc1w?.[x])} over a week and ${f(sc4h?.[x])} over four hours; ${y} is ${f(sc1w?.[y])} and ${f(sc4h?.[y])}.`;
  return { x, y, strength, forX: sentencesUpTo(cases?.[x]?.up || cases?.[x]?.why, 360), againstY: sentencesUpTo(cases?.[y]?.dn || cases?.[y]?.why, 360) };
}

// ── markets: tailwinds and headwinds (what the analysts argue) ───────────────────────────────────────────────────
export const MARKET_ORDER = ['NQ', 'SPX500', 'GOLD', 'SILVER', 'WTI', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'BTCUSD'];
export const MARKET_NAME = { NQ: 'Nasdaq (NQ)', SPX500: 'S&P 500', GOLD: 'Gold', SILVER: 'Silver', WTI: 'WTI crude', EURUSD: 'EURUSD', GBPUSD: 'GBPUSD', USDJPY: 'USDJPY', AUDUSD: 'AUDUSD', USDCAD: 'USDCAD', BTCUSD: 'Bitcoin' };
/** One market: the summary line, then up to `n` points each way, in the analysts' words, the desk's one-line reason last. No rating, size or plan is read. */
export function marketBlock(run, inst, { n = 2, maxChars = 250 } = {}) {
  const d = cardDrivers(run, inst, { cap: 11 }), name = MARKET_NAME[inst] ?? inst;
  const pts = d.analysts.flatMap(a => a.points.map(p => ({ ...p, who: analystLabel(a.id) })));
  const take = sign => pts.filter(p => Math.sign(p.push) === sign).sort((a, b) => Math.abs(b.push) - Math.abs(a.push)).map(p => ({ who: p.who, text: sentencesUpTo(p.claim, maxChars), push: p.push })).filter(p => p.text);
  const rise = take(1).slice(0, n), fall = take(-1).slice(0, n);
  const note = safeProse(run?.head?.book?.instruments?.[inst]?.why);
  const st = stance(d.net);
  return { inst, name, net: d.net, stance: st.word, summary: summaryLine(d.analysts, name), rise, fall, note: note ? sentencesUpTo(note, 260) : '', count: d.analysts.length };
}
/** The markets that have a block worth printing (at least one point either way). */
export function marketBlocks(run, { limit = 10 } = {}) {
  const have = Object.keys(run?.head?.book?.instruments ?? {});
  return MARKET_ORDER.filter(m => have.includes(m)).map(m => marketBlock(run, m)).filter(b => b.rise.length || b.fall.length).slice(0, limit);
}

// ── the analysts' headlines (one plain line each) and the ruling ─────────────────────────────────────────────────
export function analystHeadlines(run, ids = ['rates_cb', 'yields_curve', 'macro_economy', 'credit_funding', 'vol_iv', 'options_oi', 'events_news']) {
  return ids.map(id => ({ id, who: analystLabel(id), text: safeProse(run?.analysts?.[id]?.report?.headline) })).filter(x => x.text);
}
export function ruling(run) {
  const b = run?.head?.book, g = b?.global, gv = run?.debate?.global?.view; if (!b) return null;
  const tone = String(g?.tone ?? gv?.tone ?? '').replace(/_/g, '-'), conv = String(gv?.conviction ?? '').toLowerCase();
  const head = sentencesUpTo(b.headline, 300) || (tone ? `The desk's ruling is ${tone}${conv ? ` at ${conv} conviction` : ''}.` : '');
  return { headline: head, tone, conviction: conv, flips: (gv?.flip ?? []).map(x => sentencesUpTo(x, 200)).filter(Boolean).slice(0, 5), drivers: (gv?.drivers ?? []).map(x => sentencesUpTo(x, 200)).filter(Boolean).slice(0, 5),
    gaps: (b.gaps ?? []).map(x => sentencesUpTo(x, 220)).filter(Boolean).slice(0, 5) };
}
/** The evening review of the last scored day: the headline and what worked or did not, trade-free sentences only. */
export function reviewProse(reflection) {
  if (!reflection) return null;
  const list = a => (Array.isArray(a) ? a.map(x => sentencesUpTo(typeof x === 'string' ? x : x?.lesson, 240)).filter(Boolean).slice(0, 3) : []);
  return { headline: sentencesUpTo(reflection.headline, 300), worked: list(reflection.worked), failed: list(reflection.didntWork ?? reflection.failed ?? reflection.missed), lessons: list(reflection.lessons) };
}
export { takeaway };
