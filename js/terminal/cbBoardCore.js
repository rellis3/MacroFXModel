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

/** How many past meetings a tile reads back: the latest, the one before it for the change, and a short tone history. */
export const CB_HISTORY = 6;

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

/** One stored payload ({ analysis, vote, ... }) → the fields a tile shows, or null if it carries no score. */
export function readOf(date, payload, now) {
  const a = payload?.analysis;
  if (!a || !fin(a.hawkishScore)) return null;
  const clip = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : (typeof s === 'string' ? s : null));
  return {
    date, kind: payload.kind ?? null,
    score: r2(a.hawkishScore), regime: a.regime ?? null, confidence: a.confidence ?? null,
    headline: clip(a.headline, 220), whatChanged: clip(a.whatChanged, 260), voteNote: clip(a.voteNote, 200),
    vote: voteText(payload.vote ?? a.vote),
    dims: dimsOf(a),
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
    history: scored.map(x => ({ date: x.d, score: x.r.score })),
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
