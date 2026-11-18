// js/earningsReported.js: which big companies have ALREADY reported, and how the result compared with the consensus. Pure: no fetch, no clock but `now`.
//
// WHY. /api/earnings-ahead is a schedule (who reports when). Equities move on the RESULT, so the terminal also needs "what printed since the close and
// was it above or below what was expected", for the companies that carry the indices. The schedule rows come from js/marketCalendars.js parseEarnings
// (Nasdaq calendar, companies above $150bn plus the nine the Nasdaq leans on); the result comes from the Nasdaq earnings-surprise table per company
// (eps, consensusForecast, percentageSurprise, dateReported). Both are free public pages, no key.
//
// WHAT IT DOES NOT SAY. A beat or a miss is EPS against the consensus only: it is not the guidance, the revenue or the reaction, and it carries no
// direction call for the index. "In line" is within +/-1% of the consensus.
import { etToMs } from './marketCalendars.js';

export const IN_LINE_PCT = 1;
export const WINDOW_H = 40;

const fin = v => v != null && Number.isFinite(+v);

/** The release time of a schedule row in ms (New York time): 09:00 before the open, 16:05 after the close, 20:00 when the time is not given. */
export function reportAtMs(row) {
  if (!row?.date) return null;
  return row.when === 'before the open' ? etToMs(row.date, 9, 0) : row.when === 'after the close' ? etToMs(row.date, 16, 5) : etToMs(row.date, 20, 0);
}

/** The schedule rows that should have reported by now, in the last WINDOW_H hours (ten minutes' grace after the release time), biggest first. */
export function dueRows(rows, now) {
  return (rows ?? []).map(r => ({ ...r, at: reportAtMs(r) })).filter(r => r.at != null && now >= r.at + 10 * 60e3 && now - r.at <= WINDOW_H * 3600e3).sort((a, b) => (b.capB ?? 0) - (a.capB ?? 0));
}

const mdY = date => { const [y, m, d] = String(date).split('-').map(Number); return `${m}/${d}/${y}`; };

/** The row of the earnings-surprise table that reported on `date` (YYYY-MM-DD). null when the table has none yet. Numbers kept as numbers. */
export function parseSurprise(json, date) {
  const rows = json?.data?.earningsSurpriseTable?.rows ?? [];
  const r = rows.find(x => String(x.dateReported).trim() === mdY(date));
  if (!r) return null;
  const eps = Number(r.eps), cons = Number(r.consensusForecast), pct = r.percentageSurprise === '' || r.percentageSurprise == null ? NaN : Number(r.percentageSurprise);
  if (!fin(eps) || !fin(cons)) return null;
  return { fiscalQtrEnd: r.fiscalQtrEnd ?? null, eps, consensus: cons, pct: fin(pct) ? pct : (cons !== 0 ? +((eps - cons) / Math.abs(cons) * 100).toFixed(2) : null) };
}

export const verdictOf = pct => (!fin(pct) ? null : pct > IN_LINE_PCT ? 'beat' : pct < -IN_LINE_PCT ? 'miss' : 'in line');

/** One reported item: schedule row + result. */
export function reportedItem(row, surprise) {
  return { symbol: row.symbol, name: row.name, tracked: !!row.tracked, revenue: surprise.revenue ?? null, revenueEst: surprise.revenueEst ?? null, revPct: surprise.revPct ?? null, src: surprise.src ?? 'nasdaq', capB: row.capB ?? null, date: row.date, when: row.when, at: row.at ?? reportAtMs(row), eps: surprise.eps, consensus: surprise.consensus, pct: surprise.pct, verdict: verdictOf(surprise.pct) };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgn = (v, d = 1) => (fin(v) ? `${v > 0 ? '+' : ''}${(+v).toFixed(d)}` : '–');

/** The terminal strip. items = /api/earnings-reported items. Beat gold, miss purple (the terminal's own above/below colours): not good or bad for the index. */
export function reportedHtml(items, { note = '' } = {}) {
  const l = items ?? [];
  if (!l.length) return '<p class="muted" style="font-size:12px;margin:6px 0">No big company has reported with a result in the last 40 hours, or the source has no result for it yet.</p>';
  const chip = x => `<span class="chip mono ${x.verdict === 'beat' ? 'gold' : x.verdict === 'miss' ? 'pur' : ''}" title="${esc(x.name)} (${x.capB ?? '?'}bn): EPS ${x.eps} against ${x.consensus} expected, ${esc(x.when)} on ${esc(x.date)}">${esc(x.symbol)} ${sgn(x.pct)}% <span class="muted" style="font-size:11px">${esc(x.verdict ?? '')}</span></span>`;
  return `<div class="drv" style="margin:6px 0 8px"><span class="muted" style="font-size:12px">Reported, EPS vs consensus:</span> ${l.map(chip).join(' ')}</div>
<p class="muted" style="font-size:12px;margin:0 0 8px">${esc(note || 'EPS against the consensus only, within ±1% is in line. Not guidance, revenue or the share-price reaction, and no call on the index. Biggest companies first.')}</p>`;
}

// ── Finnhub: the faster source ───────────────────────────────────────────────────────────────────────────────────────────────
// Nasdaq's earnings-surprise table posts a result up to a day late (checked 2026-11-18: HD/DIS/NVDA printed, the table had nothing). Finnhub's free
// /calendar/earnings (the desk's existing FINNHUB_KEY) carries epsActual and revenueActual the same day. Finnhub is tried first, Nasdaq is the fallback.
const pctOf = (a, e) => (fin(a) && fin(e) && +e !== 0 ? +(((+a - +e) / Math.abs(+e)) * 100).toFixed(2) : null);

/** The Finnhub row for a schedule row, as a surprise { eps, consensus, pct, revenue, revenueEst, revPct, src }. null when it has no actual yet. */
export function fromFinnhub(fhRows, row) {
  const r = (fhRows ?? []).filter(x => x?.symbol === row?.symbol && fin(x.epsActual) && fin(x.epsEstimate) && Math.abs(Date.parse(x.date) - Date.parse(row.date)) <= 86400e3)
    .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(row.date)) - Math.abs(Date.parse(b.date) - Date.parse(row.date)))[0];
  if (!r) return null;
  const rev = fin(r.revenueActual) && fin(r.revenueEstimate);
  return { eps: +r.epsActual, consensus: +r.epsEstimate, pct: pctOf(r.epsActual, r.epsEstimate), revenue: rev ? +r.revenueActual : null, revenueEst: rev ? +r.revenueEstimate : null, revPct: rev ? pctOf(r.revenueActual, r.revenueEstimate) : null, src: 'finnhub' };
}

export const TIER1_CAP_B = 500;   // the nine the Nasdaq leans on, or any company above this, is tier 1; the rest of the feed (above $150bn) is tier 2
const money = v => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}bn` : `$${(v / 1e6).toFixed(0)}m`);

/**
 * A reported item as a wire headline for the News tab and the shared Telegram channel. No model call: the read is rule-built.
 * Impact on EQUITIES only when the beat or miss is a real one (tier 1: outside +/-1%, a big one +/-5% pushes harder; tier 2: only outside +/-5%).
 * Returns { title, link, ms, source, summary, earn } where earn = { symbol, verdict, pct, tier, read } (the server applies tier and read after the merge).
 */
export function earningsNewsItem(it, now = Date.now()) {
  if (!it?.symbol || !it.verdict) return null;
  const tier = it.tracked || (it.capB ?? 0) >= TIER1_CAP_B ? 1 : 2;
  const big = Math.abs(it.pct ?? 0) >= 5, real = it.verdict !== 'in line' && (tier === 1 || big);
  const sign = it.verdict === 'beat' ? 1 : -1, push = real ? sign * (tier === 1 && big ? 2 : 1) : 0;
  const rev = it.revenue != null && it.revenueEst != null ? `, revenue ${money(it.revenue)} against ${money(it.revenueEst)} expected${it.revPct != null ? ` (${it.revPct > 0 ? '+' : ''}${it.revPct}%)` : ''}` : '';
  const title = `${it.name} ${it.verdict === 'in line' ? 'in line' : it.verdict === 'beat' ? 'beats' : 'misses'}: EPS ${it.eps} against ${it.consensus} expected${it.pct != null ? ` (${it.pct > 0 ? '+' : ''}${it.pct}%)` : ''}`;
  const summary = `${it.symbol} reported ${it.when} on ${it.date}: EPS ${it.eps} against ${it.consensus}${rev}. EPS and revenue against the consensus only, not guidance or the share-price reaction.`;
  const why = `${it.symbol} ${it.verdict === 'in line' ? 'printed in line' : `${it.verdict === 'beat' ? 'beat' : 'missed'} the EPS consensus`}${it.capB ? ` (about ${it.capB >= 1000 ? `$${(it.capB / 1000).toFixed(1)}tn` : `$${it.capB}bn`} company)` : ''}; one company's result is a small part of an index.`;
  return { title, link: null, ms: it.at, source: 'Earnings', summary, earn: { symbol: it.symbol, verdict: it.verdict, pct: it.pct, tier, read: { tier, impact: push ? { EQUITIES: push } : {}, why, by: 'earnings rule', at: now } } };
}
