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
  return { symbol: row.symbol, name: row.name, capB: row.capB ?? null, date: row.date, when: row.when, at: row.at ?? reportAtMs(row), eps: surprise.eps, consensus: surprise.consensus, pct: surprise.pct, verdict: verdictOf(surprise.pct) };
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
