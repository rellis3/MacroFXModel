/**
 * The Desk Terminal's central-bank statement board: the shaping, kept pure so the server route (/api/cb-board) and the
 * tests share one definition. No fetch, no KV, no DOM.
 *
 * Source: the eight sentiment engines (Fed, ECB, BoE, BoJ, RBA, RBNZ, BoC, SNB) and the Beige Book. Each meeting's
 * statement is read once into KV as `<bank>_analysis_<kind>_<date>` ({ analysis, vote, ... }); this reads the last few
 * of them per bank and answers: what did the latest statement say, how did its tone change against the one before,
 * how did the committee vote, when is the next meeting.
 *
 * What it will NOT do: invent a read. A bank whose newest meeting has no analysis says so ('no_read', with the meeting's
 * date and the last read it does have, marked as older). The RBNZ is a known case: its statement pages are blocked
 * by the RBNZ firewall (403), so only the OCR decision headline from the news feed arrives ('headline_only').
 *
 * Tone scores are DESCRIPTIVE. Evidence Book entry `cb-tone-direction` (NULL, N=82 meetings): the statement's tone is
 * priced inside 30 minutes and does not predict the next-day dollar.
 */

/**
 * The stance WORD for a tone score (-1 dovish .. +1 hawkish): one threshold rule for every bank and every panel. The statement reader's own word
 * (`aiRegime`) is kept beside it but no longer drawn, because it did not follow the score (2026-11-27: SNB "HAWKISH" at +0.30 while the Fed was
 * "MIXED" at +0.35). The threshold is the bias engine's (js/biasEngine.js TH.stance = 0.5; cbBoard.test.mjs checks they match), so the chip and the
 * engine's "stance hawkish / neutral / dovish" always agree.
 */
export const STANCE_TH = 0.5;
export function stanceOf(score) {
  if (!fin(score)) return null;
  return score >= STANCE_TH ? 'HAWKISH' : score <= -STANCE_TH ? 'DOVISH' : 'NEUTRAL';
}

/** The nine tiles, in display order. `prefix` is the KV key stem of the statement analysis (key = prefix + meeting date). */
export const CB_BANKS = [
  { id: 'fomc', ccy: 'USD', bank: 'Fed', name: 'Federal Reserve', prefix: 'fomc_analysis_statement_', page: 'fomc-sentiment.html', doc: 'FOMC statement' },
  { id: 'ecb', ccy: 'EUR', bank: 'ECB', name: 'European Central Bank', prefix: 'ecb_analysis_statement_', page: 'ecb-sentiment.html', doc: 'monetary policy statement' },
  { id: 'boe', ccy: 'GBP', bank: 'BoE', name: 'Bank of England', prefix: 'boe_analysis_summary_', page: 'boe-sentiment.html', doc: 'MPC summary' },
  { id: 'boj', ccy: 'JPY', bank: 'BoJ', name: 'Bank of Japan', prefix: 'boj_analysis_statement_', page: 'boj-sentiment.html', doc: 'policy statement' },
  { id: 'rba', ccy: 'AUD', bank: 'RBA', name: 'Reserve Bank of Australia', prefix: 'rba_analysis_statement_', page: 'rba-sentiment.html', doc: 'Board decision statement' },
  { id: 'rbnz', ccy: 'NZD', bank: 'RBNZ', name: 'Reserve Bank of New Zealand', prefix: 'rbnz_analysis_statement_', page: 'rbnz-sentiment.html', doc: 'OCR decision and record of meeting' },
  { id: 'boc', ccy: 'CAD', bank: 'BoC', name: 'Bank of Canada', prefix: 'boc_analysis_statement_', page: 'boc-sentiment.html', doc: 'rate announcement' },
  { id: 'snb', ccy: 'CHF', bank: 'SNB', name: 'Swiss National Bank', prefix: 'snb_analysis_statement_', page: 'snb-sentiment.html', doc: 'policy assessment' },
  { id: 'beige', ccy: 'USD', bank: 'Beige Book', name: 'Fed Beige Book', prefix: 'beigebook_analysis_', page: 'beige-book.html', doc: 'Beige Book', beige: true },
];

/** How many past meetings a tile reads back: the latest, the one before it for the change, and the tone timeline (the last ten meetings;
 *  a meeting with no stored read is drawn as a gap, never filled in). */
export const CB_HISTORY = 10;

const fin = v => v != null && v !== '' && Number.isFinite(+v);
const r2 = v => (fin(v) ? Math.round(+v * 100) / 100 : null);
const DAY = 864e5;
const ymd = ms => new Date(ms).toISOString().slice(0, 10);

/** The meeting dates on or before `now`, oldest first, last `n` of them. A meeting date counts from its own midnight UTC. */
export function pastDates(meetings, now, n = CB_HISTORY) {
  return (meetings ?? []).map(m => m?.date).filter(d => typeof d === 'string' && Date.parse(d) <= now).sort().slice(-n);
}

/** The first meeting after `now`: { date, days } (days counted in calendar days from today, 0 = today), or null. */
export function nextMeeting(meetings, now) {
  const today = ymd(now);
  const d = (meetings ?? []).map(m => m?.date).filter(x => typeof x === 'string' && x >= today).sort()[0];
  if (!d) return null;
  return { date: d, days: Math.round((Date.parse(d) - Date.parse(today)) / DAY) };
}

/**
 * The committee's vote as one short phrase, from whichever shape the bank's parser stored:
 *   Fed  { for, against, dissenters[] }            BoE/BoJ/RBA { unanimous, majority, minority, consensus? }
 * null when the bank published no vote (BoC and SNB decide by consensus and publish none; the ECB publishes none).
 */
export function voteText(v) {
  if (!v || typeof v !== 'object') return null;
  if (v.consensus) return 'consensus, no formal vote';
  if (v.unanimous) return 'unanimous';
  if (fin(v.for) && fin(v.against)) {
    const d = Array.isArray(v.dissenters) && v.dissenters.length ? ` · against: ${v.dissenters.join(', ')}` : '';
    return +v.against === 0 ? 'unanimous' : `${v.for}–${v.against}${d}`;
  }
  if (fin(v.majority) && fin(v.minority)) return `${v.majority}–${v.minority}`;
  return null;
}

/** The dimension scores a tile draws (0..1, how much the text dwells on each), in drawing order. */
export function dimsOf(analysis) {
  const d = analysis?.dimensions;
  if (!d || typeof d !== 'object') return null;
  const out = [
    { k: 'inflation', label: 'Inflation', v: r2(d.inflationConcern) },
    { k: 'labour', label: 'Labour', v: r2(d.laborConcern) },
    { k: 'growth', label: 'Growth', v: r2(d.growthConcern) },
    { k: 'stability', label: 'Fin. stability', v: r2(d.financialStabilityConcern) },
  ].filter(x => x.v != null);
  return out.length ? out : null;
}

const DIM_LABEL = {
  inflationConcern: 'Prices', laborConcern: 'Labour', growthConcern: 'Growth', financialStabilityConcern: 'Stability',
  fragmentationConcern: 'Fragmentation', committeeConfidence: 'Committee confidence', regionalBreadth: 'Breadth',
};

/** Every dimension the statement was scored on, by its stored key (0..1: how much the text dwells on it), or null. */
export function dimsRaw(analysis) {
  const d = analysis?.dimensions;
  if (!d || typeof d !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(d)) if (DIM_LABEL[k] && fin(v)) out[k] = r2(Math.min(1, Math.max(0, +v)));
  return Object.keys(out).length ? out : null;
}

/** The themes whose weight moved most against the previous read: [{ k, label, delta }], at most three, only moves of 0.10 or more.
 *  This is how much the text dwells on a theme (concern), never a direction. */
export function themeShift(cur, prev, { min = 0.1, n = 3 } = {}) {
  if (!cur || !prev) return [];
  return Object.keys(cur).filter(k => fin(prev[k]) && DIM_LABEL[k]).map(k => ({ k, label: DIM_LABEL[k], delta: r2(cur[k] - prev[k]) }))
    .filter(x => Math.abs(x.delta) >= min - 1e-9).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, n);
}

// ── The words that changed since the previous statement ──
// The stored diff is word level and noisy (dates, vote counts, page furniture), so a change is kept only when a removed run is
// immediately followed by an added run, both are plain words, and neither is a date, a number or a run of dots. Those that touch the
// subjects a statement turns on (rates, inflation, labour, risks, guidance) come first. Up to three, each side cut at a word boundary.
const JUNK = /^[\W\d_]*$|\.{4,}|\b(19|20)\d\d\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b|https?:|©/i;
const SALIENT = /\b(hike\w*|rais\w+|cut\w*|eas\w+|tighten\w*|restrictive|accommodat\w*|inflation\w*|labou?r|employment|growth|risks?|upside|downside|patient|persistent|elevated|energy|further|gradual\w*|guidance|vigilan\w*|uncertain\w*|data|broadly|moderat\w*|strong\w*|soft\w*|weak\w*|slow\w*)\b/i;
const POLICY = /\b(hike\w*|rais\w+|cut\w*|eas\w+|maintain\w*|keep|kept|hold|held|unchanged|tighten\w*|restrictive|accommodat\w*)\b/i;
const tidy = t => String(t ?? '').replace(/\s+/g, ' ').replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, '').trim();
const cutWords = (t, n = 52) => { if (t.length <= n) return t; const c = t.slice(0, n - 1), i = c.lastIndexOf(' '); return `${(i > n * 0.5 ? c.slice(0, i) : c).replace(/[\s,;:.\-–—]+$/, '')}…`; };

/** diffSegments ([{ type: 'same'|'add'|'del', text }]) → [{ from, to }] up to n. [] when nothing readable changed. */
export function phrasesOf(segs, n = 3) {
  if (!Array.isArray(segs)) return [];
  const cand = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i], b = segs[i + 1];
    if (a?.type !== 'del' || b?.type !== 'add') continue;
    const from = tidy(a.text), to = tidy(b.text);
    if (from.length < 3 || to.length < 3 || from.toLowerCase() === to.toLowerCase()) continue;
    if (JUNK.test(from) || JUNK.test(to) || !/[A-Za-z]{3}/.test(from) || !/[A-Za-z]{3}/.test(to)) continue;
    const wf = from.split(' ').length, wt = to.split(' ').length;
    if (Math.abs(wf - wt) > Math.max(1, Math.floor(0.4 * Math.max(wf, wt)))) continue;   // a swap replaces like with like: a word for a word, a clause for a clause
    if (Math.max(from.length, to.length) > 20 && Math.max(from.length, to.length) / Math.min(from.length, to.length) > 4) continue;   // a short word against a clause is a mismatch, not a swap
    if (/^[A-Z][a-z]+[.,]?$/.test(from) || /^[A-Z][a-z]+[.,]?$/.test(to)) continue;   // a lone capitalised word is a name (East, Prices), not a wording change
    if (/[.!?]\s+[A-Z]/.test(from) || /[.!?]\s+[A-Z]/.test(to)) continue;   // a cut across a sentence boundary reads as a fragment
    const sal = (SALIENT.test(from) ? 1 : 0) + (SALIENT.test(to) ? 1 : 0) + (POLICY.test(from) ? 2 : 0) + (POLICY.test(to) ? 2 : 0);
    cand.push({ from, to, sal, len: from.length + to.length });
  }
  const seen = new Set(), out = [];
  for (const c of cand.sort((x, y) => y.sal - x.sal || x.len - y.len)) {
    const key = c.from.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push({ from: cutWords(c.from), to: cutWords(c.to) });
    if (out.length >= n) break;
  }
  return out;
}

/** One stored payload ({ analysis, vote, ... }) → the fields a tile shows, or null if it carries no score. */
export function readOf(date, payload, now) {
  const a = payload?.analysis;
  if (!a || !fin(a.hawkishScore)) return null;
  const clip = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : (typeof s === 'string' ? s : null));
  return {
    date, kind: payload.kind ?? null,
    score: r2(a.hawkishScore), regime: stanceOf(a.hawkishScore), aiRegime: a.regime ?? null, confidence: a.confidence ?? null,
    headline: clip(a.headline, 220), whatChanged: clip(a.whatChanged, 260), voteNote: clip(a.voteNote, 200),
    vote: voteText(payload.vote ?? a.vote),
    dims: dimsOf(a), dimsRaw: dimsRaw(a),
    phrases: phrasesOf(payload.diffSegments),
    ageDays: Number.isFinite(now) ? Math.max(0, Math.floor((now - Date.parse(date)) / DAY)) : null,
  };
}

/**
 * One bank's tile.
 *   meta     one of CB_BANKS
 *   meetings the bank's calendar ([{ date }])
 *   reads    { 'YYYY-MM-DD': payload | null } for (at least) the dates pastDates() returns
 *   opts.headline  RBNZ only: the OCR decision from the news feed { date, title, rate } or null, used when there is no read
 *   opts.blocked   RBNZ only: the statement pages answered 403 (the firewall)
 *   opts.rate      the bank's policy rate now { rate, asOf } or null (from /api/policy-rates)
 *
 * status:
 *   'read'           the newest past meeting has a scored statement
 *   'no_read'        the newest past meeting has none (`unreadMeeting`); `read` is the last one it does have, if any (older)
 *   'headline_only'  no read, but the bank's own news feed gave the decision headline (RBNZ behind its firewall)
 */
export function shapeBank(meta, { meetings, reads, now = Date.now(), headline = null, blocked = false, rate = null } = {}) {
  const dates = pastDates(meetings, now, CB_HISTORY);
  const scored = dates.map(d => ({ d, r: readOf(d, reads?.[d], now) })).filter(x => x.r);
  const newestMeeting = dates.at(-1) ?? null;
  const last = scored.at(-1) ?? null, prior = scored.length > 1 ? scored.at(-2) : null;
  const current = !!last && last.d === newestMeeting;
  const out = {
    id: meta.id, ccy: meta.ccy, bank: meta.bank, name: meta.name, page: meta.page, doc: meta.doc,
    status: current ? 'read' : 'no_read',
    meeting: newestMeeting,
    unreadMeeting: current ? null : newestMeeting,
    read: last ? last.r : null,
    change: last && prior ? { delta: r2(last.r.score - prior.r.score), from: prior.d, fromScore: prior.r.score } : null,
    themes: last && prior ? themeShift(last.r.dimsRaw, prior.r.dimsRaw) : [],
    history: scored.map(x => ({ date: x.d, score: x.r.score })),
    // the tone timeline: every meeting in the window, oldest first; one with no stored read is a gap (unread), never an estimate
    timeline: dates.map(d => { const r = scored.find(x => x.d === d)?.r; return r ? { date: d, score: r.score, regime: r.regime, headline: r.headline && r.headline.length > 150 ? `${r.headline.slice(0, 149).trimEnd()}…` : r.headline } : { date: d, unread: true }; }),
    coverage: { read: scored.length, of: dates.length },
    next: nextMeeting(meetings, now),
    rate: rate && fin(rate.rate) ? { rate: +rate.rate, asOf: rate.asOf ?? null } : null,
  };
  if (!current && headline && headline.title) {
    out.status = 'headline_only';
    out.decision = { date: headline.date ?? null, title: String(headline.title), rate: fin(headline.rate) ? +headline.rate : null };
    out.blocked = !!blocked;
  }
  return out;
}

/** Hawkish → dovish, only banks with a CURRENT read (an older read would rank last meeting's tone as today's). */
export function rankBanks(banks) {
  return (banks ?? []).filter(b => b.status === 'read' && b.read && !b.id?.startsWith('beige'))
    .map(b => ({ ccy: b.ccy, bank: b.bank, score: b.read.score, regime: b.read.regime, delta: b.change?.delta ?? null, date: b.read.date }))
    .sort((a, b) => b.score - a.score);
}

/** The route's payload from the shaped tiles. */
export function boardPayload(banks, { now = Date.now(), cached = false } = {}) {
  const ok = (banks ?? []).some(b => b.status === 'read');
  return {
    ok: true, asOf: new Date(now).toISOString(), cached,
    banks, ranking: rankBanks(banks),
    counts: {
      read: banks.filter(b => b.status === 'read').length,
      noRead: banks.filter(b => b.status === 'no_read').length,
      headlineOnly: banks.filter(b => b.status === 'headline_only').length,
      total: banks.length,
    },
    anyRead: ok,
  };
}
