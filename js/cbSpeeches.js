/**
 * Central-bank speech scoring (owner, 2026-11-04, build list item 4): every new speech by a Fed, ECB, BoE, BoJ, BoC,
 * RBA or SNB official, read once by the model on the same hawkish-dovish scale as the bank's statements (-1 dovish,
 * +1 hawkish, js/server.js cb engines), set against the bank's last statement score, and rolled into a per-bank
 * "speaker drift": are the bank's people now sounding more hawkish or more dovish than its last statement?
 *
 * SOURCES (checked keylessly 2026-11-04 from the sandbox):
 *   Fed   federalreserve.gov/feeds/speeches.xml           RSS 2.0, "Surname, Title"
 *   ECB   ecb.europa.eu/rss/press.html                    RSS 2.0, all releases; speeches/interviews are /press/key/
 *   BoE   bankofengland.co.uk/rss/speeches                RSS 2.0, "Title − speech by Name"
 *   BoJ   boj.or.jp/en/rss/whatsnew.xml                   RSS 2.0, all releases; speeches are /about/press/koen_
 *   BoC   bankofcanada.ca/content_type/speeches/feed/     RSS 1.0 (RDF) with cb:nameAsWritten
 *   RBA   rba.gov.au/rss/rss-cb-speeches.xml              RSS 1.0 (RDF); the link says the rank (sp-gov, sp-dg, sp-ag)
 *   SNB   snb.ch/public/rss/en/speeches                   RSS 2.0, "YYYY-MM-DD - Name / Name: Title"
 * RBNZ is left out: its speeches feed answers 403 to a non-browser client (the same firewall the RBNZ statement
 * engine documents), and its news feed carries no speeches.
 *
 * DRIFT. For each bank: the speeches since its last statement (and inside `days`), each weighted by the speaker's
 * rank (head 1, voter 0.7, non-voter 0.4, staff 0.2), the model's policy relevance and an exponential recency decay,
 * averaged as (speech score - statement score). |drift| >= 0.25 with at least one weighted speech = "big".
 * A description of tone, never a signal: hawkish-score momentum against price is a banked null in this repo
 * (CB_SENTIMENT_PRICE_TEST.md), and every payload says so.
 *
 * Pure: no fetch, no KV, no clock (pass `now`). Tested in js/cbSpeeches.test.mjs.
 */

export const SPEECH_SOURCES = [
  { bank: 'Fed', ccy: 'USD', url: 'https://www.federalreserve.gov/feeds/speeches.xml', keep: () => true },
  { bank: 'ECB', ccy: 'EUR', url: 'https://www.ecb.europa.eu/rss/press.html', keep: it => /\/press\/key\//.test(it.url) && !/press_conference/.test(it.url) },
  { bank: 'BoE', ccy: 'GBP', url: 'https://www.bankofengland.co.uk/rss/speeches', keep: () => true },
  { bank: 'BoJ', ccy: 'JPY', url: 'https://www.boj.or.jp/en/rss/whatsnew.xml', keep: it => /\/about\/press\/koen_/.test(it.url) },
  { bank: 'BoC', ccy: 'CAD', url: 'https://www.bankofcanada.ca/content_type/speeches/feed/', keep: it => !/media-availability/.test(it.url) },
  { bank: 'RBA', ccy: 'AUD', url: 'https://www.rba.gov.au/rss/rss-cb-speeches.xml', keep: () => true },
  { bank: 'SNB', ccy: 'CHF', url: 'https://www.snb.ch/public/rss/en/speeches', keep: it => !/speeches-restricted/.test(it.url) },
];
export const BANK_CCY = Object.fromEntries(SPEECH_SOURCES.map(s => [s.bank, s.ccy]));
export const CCY_BANK = Object.fromEntries(SPEECH_SOURCES.map(s => [s.ccy, s.bank]));

export const TIER_WEIGHT = { head: 1, voter: 0.7, nonvoter: 0.4, staff: 0.2 };
export const TOPICS = ['inflation', 'labour', 'growth', 'fx', 'balance_sheet', 'financial_stability', 'other'];
export const DRIFT_BIG = 0.25, DRIFT_LEAN = 0.1;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', uuml: 'ü', ouml: 'ö', auml: 'ä', eacute: 'é', egrave: 'è', ccedil: 'ç', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };
export function decode(s) {
  return String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&([a-z]+);/gi, (m, k) => ENT[k.toLowerCase()] ?? m).trim();
}
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]) : null; };

/** RSS 2.0 or RSS 1.0 (RDF) → [{ title, url, date (ISO or null), description, person }]. */
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml ?? '').matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const url = (tag(b, 'link') ?? b.match(/rdf:about="([^"]+)"/)?.[1] ?? '').replace(/([^:])\/\/+/g, '$1/').replace(/^http:\/\//, 'https://');
    const rawDate = tag(b, 'pubDate') ?? tag(b, 'dc:date') ?? tag(b, 'cb:occurrenceDate');
    const ms = rawDate ? Date.parse(rawDate.replace(/\s+Z$/, ' GMT')) : NaN;
    out.push({ title: tag(b, 'title') ?? '', url, date: Number.isFinite(ms) ? new Date(ms).toISOString() : null, description: tag(b, 'description') ?? '', person: tag(b, 'cb:nameAsWritten') });
  }
  return out.filter(x => x.url);
}

const RBA_RANK = { gov: 'Governor', dg: 'Deputy Governor', ag: 'Assistant Governor', so: 'Senior official' };
/** Who gave it, from the feed alone (the model confirms or fills it from the text). */
export function speakerFrom(item, bank) {
  const t = item.title ?? '';
  if (item.person) return item.person;
  if (bank === 'Fed') { const m = t.match(/^([A-Z][A-Za-z'’.\- ]{1,30}),\s/); return m ? m[1].trim() : null; }
  if (bank === 'ECB') { const m = t.match(/^([^:]{3,60}):/); return m ? m[1].trim() : null; }
  if (bank === 'BoE') { const m = t.match(/(?:speech|remarks|lecture|panel remarks|address|opening remarks) by ([^,(]+?)\s*$/i); return m ? m[1].trim() : null; }
  if (bank === 'SNB') { const m = t.match(/^\d{4}-\d{2}-\d{2}\s*-\s*([^:]+):/); return m ? m[1].trim() : null; }
  if (bank === 'RBA') { const m = item.url.match(/\/sp-(gov|dg|ag|so)-/); return m ? RBA_RANK[m[1]] : null; }
  if (bank === 'BoJ') { const m = t.match(/(?:Governor|Deputy Governor|Member of the Policy Board)\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)/); return m ? m[0] : null; }
  return null;
}

/**
 * A first guess at rank from the speech's header (title, speaker line): head of the bank, a policy voter, a
 * non-voting official or staff. Only used to order the day's budget; the model's own `tier` is what is stored.
 */
export function tierFrom(text, bank) {
  const s = String(text ?? '').slice(0, 600);
  const deputy = /\b(Vice[- ]Chair|Vice[- ]President|Deputy Governor|Senior Deputy Governor|Assistant Governor|Vice[- ]Chairman)\b/i.test(s);
  if (bank === 'Fed') {
    if (/\bChair\b/.test(s) && !/\bVice[- ]Chair\b/.test(s)) return 'head';
    if (/\b(Governor|Vice[- ]Chair)\b/.test(s)) return 'voter';
    if (/\bPresident\b/.test(s)) return 'nonvoter';
    return 'staff';
  }
  if (bank === 'ECB') return /\bPresident\b/.test(s) && !/\bVice[- ]President\b/.test(s) ? 'head' : /\b(Vice[- ]President|Executive Board|Lagarde|Lane|Schnabel|Cipollone|Elderson|Vujčić)\b/.test(s) ? 'voter' : 'staff';
  if (bank === 'SNB') return /\bChairman\b/.test(s) && !/Vice[- ]Chairman/.test(s) ? 'head' : /\b(Vice[- ]Chairman|Governing Board)\b/.test(s) ? 'voter' : 'staff';
  if (bank === 'RBA' && /\bAssistant Governor\b/.test(s)) return 'nonvoter';
  if (/\bGovernor\b/.test(s) && !deputy) return 'head';
  if (deputy || /\b(Member of the Policy Board|External MPC member|Monetary Policy Committee|Chief Economist)\b/i.test(s)) return 'voter';
  return 'staff';
}

const POLICY_WORDS = /\b(inflation|interest rates?|policy rate|monetary policy|labou?r market|unemployment|wages?|neutral rate|rate cuts?|rate hikes?|tightening|easing|price stability|exchange rate|balance sheet|quantitative)\b/gi;
/** How much monetary-policy language the text carries: a cheap filter so a speech on payments or supervision is not sent to the model. */
export function policyWords(text) { return (String(text ?? '').match(POLICY_WORDS) ?? []).length; }

/** Strip the page down to readable text, cap its length (keeps the start, where the argument is, and the end, where the conclusion is). */
export function clipText(text, max = 24_000) {
  const t = String(text ?? '').replace(/(\s*\/\s*){3,}/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= max) return t;
  const head = Math.round(max * 0.8);
  return `${t.slice(0, head)}\n\n[… ${t.length - max} characters cut …]\n\n${t.slice(-(max - head))}`;
}

export const speechId = (bank, url) => `${bank}:${String(url).replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/$/, '')}`;

/** New speeches from one bank's parsed feed, as log candidates (newest first), skipping ids already in `seen`. */
export function candidates(bank, items, seen = new Set(), { now, maxAgeDays = 21 } = {}) {
  const src = SPEECH_SOURCES.find(s => s.bank === bank);
  return (items ?? []).filter(it => src.keep(it))
    .map(it => ({ id: speechId(bank, it.url), bank, ccy: src.ccy, title: it.title.replace(/^\d{4}-\d{2}-\d{2}\s*-\s*/, ''), url: it.url, date: it.date, speaker: speakerFrom(it, bank), description: it.description?.slice(0, 300) ?? '' }))
    .filter(c => !seen.has(c.id) && (!c.date || !now || now - Date.parse(c.date) <= maxAgeDays * 864e5))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Which candidates to score now: within the daily budget, heads of bank first, then newest. */
export function pickToScore(cands, { used = 0, maxPerDay = 12, maxPerRun = 4 } = {}) {
  const room = Math.max(0, Math.min(maxPerRun, maxPerDay - used));
  const rank = c => TIER_WEIGHT[c.tierGuess ?? 'staff'] ?? 0.2;
  return [...cands].sort((a, b) => rank(b) - rank(a) || String(b.date).localeCompare(String(a.date))).slice(0, room);
}

/** The model's prompt for one speech. `statement` = { score, regime, date, headline } of the bank's last statement, or null. */
export function speechPrompt(sp, text, statement) {
  const system = `You read central-bank speeches for an FX desk. You score tone on the SAME scale the desk uses for ${sp.bank} policy statements: hawkishScore from -1.0 (very dovish) to +1.0 (very hawkish), 0 neutral. You are careful, literal and brief, and you quote only words that appear in the text. Reply with one JSON object and nothing else.`;
  const st = statement && Number.isFinite(statement.score) ? `The ${sp.bank}'s last policy statement (${statement.date}) scored ${statement.score} (${statement.regime ?? '?'})${statement.headline ? `: "${String(statement.headline).slice(0, 240)}"` : ''}.` : `No scored ${sp.bank} statement is available to compare with.`;
  const prompt = `Speech: ${sp.title}
Bank: ${sp.bank} (${sp.ccy}). Given ${sp.date ? sp.date.slice(0, 10) : 'recently'}. Speaker from the feed: ${sp.speaker ?? 'unknown'}.
${st}

Read it for monetary-policy signal. If the speech is about supervision, payments, climate, data or other non-policy topics, say so with a low relevance and a score near 0.

Return JSON:
{"speaker":"full name","role":"their title, e.g. Governor, Vice Chair, Member of the Executive Board, President of the Federal Reserve Bank of X, Chief Economist","tier":"head|voter|nonvoter|staff (head = the head of the bank; voter = votes on policy; nonvoter = a policy official without a vote this year; staff = everyone else)","relevance":0.0-1.0 (how much of it is about monetary policy),"hawkishScore":-1.0 to 1.0,"vsStatement":"one sentence: more hawkish, more dovish or in line with the last statement, and why","topics":{"inflation":0-1,"labour":0-1,"growth":0-1,"fx":0-1,"balance_sheet":0-1,"financial_stability":0-1},"keyQuotes":[{"quote":"verbatim, under 30 words","why":"one line"}] (max 3, most market-moving first),"currency":"one sentence: what this means for ${sp.ccy}","headline":"one plain-English sentence, the so-what first"}

The text:
${text}`;
  return { system, prompt };
}

const num = (x, lo, hi) => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi);
/** Validate the model's reply; returns { ok, value } with numbers clamped to their ranges, or { ok:false, errors }. */
export function validateSpeech(o) {
  const errors = [];
  if (!o || typeof o !== 'object') return { ok: false, errors: ['not an object'] };
  const score = typeof o.hawkishScore === 'string' ? Number(o.hawkishScore) : o.hawkishScore;
  if (!num(score, -1.0001, 1.0001)) errors.push('hawkishScore must be a number from -1 to 1');
  const rel = typeof o.relevance === 'string' ? Number(o.relevance) : o.relevance;
  if (!num(rel, -0.0001, 1.0001)) errors.push('relevance must be a number from 0 to 1');
  if (!['head', 'voter', 'nonvoter', 'staff'].includes(o.tier)) errors.push('tier must be head, voter, nonvoter or staff');
  if (errors.length) return { ok: false, errors };
  const topics = Object.fromEntries(TOPICS.filter(t => t !== 'other').map(t => [t, num(+o.topics?.[t], 0, 1) ? +(+o.topics[t]).toFixed(2) : 0]));
  return { ok: true, value: {
    speaker: o.speaker ? String(o.speaker).slice(0, 80) : null, role: o.role ? String(o.role).slice(0, 120) : null, tier: o.tier,
    relevance: +Math.max(0, Math.min(1, rel)).toFixed(2), score: +Math.max(-1, Math.min(1, score)).toFixed(2),
    vsStatement: String(o.vsStatement ?? '').slice(0, 300), topics,
    keyQuotes: (Array.isArray(o.keyQuotes) ? o.keyQuotes : []).slice(0, 3).map(q => ({ quote: String(q?.quote ?? '').slice(0, 240), why: String(q?.why ?? '').slice(0, 200) })).filter(q => q.quote),
    currency: String(o.currency ?? '').slice(0, 300), headline: String(o.headline ?? '').slice(0, 300) } };
}

/** One log entry from a candidate + its score (or a reason it was not scored) + the statement it was read against. */
export function logEntry(c, { score = null, statement = null, skipped = null, error = null, chars = null, from = null, model = null, at }) {
  const e = { id: c.id, bank: c.bank, ccy: c.ccy, title: c.title, url: c.url, date: c.date, speaker: score?.speaker ?? c.speaker ?? null, at, chars, from };
  if (score) {
    Object.assign(e, { role: score.role, tier: score.tier, weight: TIER_WEIGHT[score.tier], relevance: score.relevance, score: score.score,
      statement: statement && Number.isFinite(statement.score) ? { score: statement.score, date: statement.date, regime: statement.regime ?? null } : null,
      delta: statement && Number.isFinite(statement.score) ? +(score.score - statement.score).toFixed(2) : null,
      vsStatement: score.vsStatement, topics: score.topics, keyQuotes: score.keyQuotes, currency: score.currency, headline: score.headline, model });
  }
  if (skipped) e.skipped = skipped;
  if (error) e.error = String(error).slice(0, 300);
  return e;
}

/** Merge new entries into the log (newest first, one per id, a later entry wins), capped. */
export function mergeLog(log = [], entries = [], { keep = 400 } = {}) {
  const by = new Map((log ?? []).map(e => [e.id, e]));
  for (const e of entries) by.set(e.id, e);
  return [...by.values()].sort((a, b) => String(b.date ?? b.at).localeCompare(String(a.date ?? a.at))).slice(0, keep);
}

const label = d => (d == null ? 'no speeches' : d >= DRIFT_BIG ? 'much more hawkish' : d >= DRIFT_LEAN ? 'leaning hawkish' : d <= -DRIFT_BIG ? 'much more dovish' : d <= -DRIFT_LEAN ? 'leaning dovish' : 'in line');
/**
 * Per-bank speaker drift. statements: { CCY: { score, meetingDate, regime } } (server _loadCbSentiment shape).
 * Speeches before the last statement are left out (the statement already supersedes them).
 */
export function speakerDrift(log = [], statements = {}, now, { days = 30, halfLifeDays = 10, minRelevance = 0.3 } = {}) {
  const banks = {};
  for (const s of SPEECH_SOURCES) {
    const st = statements?.[s.ccy] ?? null, since = Math.max(now - days * 864e5, st?.meetingDate ? Date.parse(st.meetingDate) : 0);
    const rows = (log ?? []).filter(e => e.bank === s.bank && Number.isFinite(e.score) && (e.relevance ?? 0) >= minRelevance && e.date && Date.parse(e.date) >= since && Date.parse(e.date) <= now);
    let wsum = 0, acc = 0, sacc = 0;
    for (const e of rows) {
      const w = (TIER_WEIGHT[e.tier] ?? 0.2) * (e.relevance ?? 0) * Math.pow(0.5, (now - Date.parse(e.date)) / (halfLifeDays * 864e5));
      wsum += w; sacc += w * e.score; if (Number.isFinite(st?.score)) acc += w * (e.score - st.score);
    }
    const avg = wsum > 0 ? +(sacc / wsum).toFixed(2) : null, drift = wsum > 0 && Number.isFinite(st?.score) ? +(acc / wsum).toFixed(2) : null;
    banks[s.bank] = { bank: s.bank, ccy: s.ccy, statement: st ? { score: st.score ?? null, date: st.meetingDate ?? null, regime: st.regime ?? null } : null,
      speeches: rows.length, weight: +wsum.toFixed(2), speechAvg: avg, drift, label: label(drift), big: drift != null && Math.abs(drift) >= DRIFT_BIG,
      latest: rows.slice(0, 4).map(e => ({ date: e.date?.slice(0, 10), speaker: e.speaker, tier: e.tier, score: e.score, delta: e.delta, headline: e.headline, url: e.url })) };
  }
  return { banks, params: { days, halfLifeDays, minRelevance, big: DRIFT_BIG, lean: DRIFT_LEAN },
    label: 'speaker drift = the weighted average of (speech score - the last statement score) for the speeches since that statement; weight = rank (head 1, voter 0.7, non-voter 0.4, staff 0.2) x policy relevance x a 10-day half-life. Positive = the speakers sound more hawkish than the statement. A description of tone, not a signal: hawkish-score momentum against price is a banked null here.' };
}

/** Match a calendar speaker event ({ ms, event, country }) to a scored speech the same day whose speaker's surname is in the event text. */
export function matchEvent(ev, log = [], { bankOf } = {}) {
  const bank = bankOf ? bankOf(ev) : null, day = new Date(ev.ms).toISOString().slice(0, 10), txt = String(ev.event ?? ev.title ?? '').toLowerCase();
  return (log ?? []).find(e => Number.isFinite(e.score) && (!bank || e.bank === bank) && e.date && Math.abs(Date.parse(e.date) - ev.ms) < 36 * 3600e3 && e.date.slice(0, 10) <= day
    && String(e.speaker ?? '').split(/\s+/).filter(w => w.length > 2).some(w => txt.includes(w.toLowerCase()))) ?? null;
}
