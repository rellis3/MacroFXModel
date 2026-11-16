// js/terminal/calendarDrillsCore.js: the CALENDAR DRILLS, pure. Four things hung on the Calendar tab from data the repo already holds (no consensus feed is bought):
//   earnings ahead   the big companies reporting this week (/api/earnings-ahead: a schedule, not a forecast)
//   recent releases  the release scorecards of the last prints (/api/release-calls: how big each market's 30-minute move was against a normal half-hour and against what the book said)
//   similar releases what this release has done to each market in the past (js/eventImpactMap.js, the Event Response Book): the SIZE of the 30-minute move, n prints, and the next-day direction shown as the coin flip it is
//   nowcast gap      the Cleveland Fed CPI nowcast or GDPNow against the calendar's consensus estimate for the matching US row
//
// Evidence kept: event-impact-map VALIDATED for size; direction (up %) is shown only to say it is a coin flip; nowcast-gap-cpi NULL and nowcast-gap-gdp CONTEXT, so a gap is shown as
// context with its grade and never as a lean. The owner's private "call" on a release (higher or lower, made before the print) is never shown to the desk login.
import { eventImpactFor } from '../eventImpactMap.js';
import { familyOf, surpriseWord, sizeWord, isAnnouncement } from '../releaseScorecard.js';

const fin = v => v != null && v !== '' && Number.isFinite(+v);
/** '0.3%' -> 0.3, '-1.2' -> -1.2, '2.5K' -> 2500, '' or 'n/a' -> null. */
export function parseNum(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const m = String(s ?? '').replace(/[,\s]/g, '').replace(/−/g, '-').match(/^([+-]?\d+(?:\.\d+)?)([KMBT%]?)$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2].toUpperCase()] ?? 1;
  return +m[1] * mult;
}

// ── nowcast gap ──
export const NOWCAST_EVIDENCE = {
  cpi: { id: 'nowcast-gap-cpi', grade: 'null', say: 'The CPI nowcast gap test found no usable edge, so this is context only.' },
  core: { id: 'nowcast-gap-cpi', grade: 'null', say: 'The CPI nowcast gap test found no usable edge, so this is context only.' },
  gdp: { id: 'nowcast-gap-gdp', grade: 'context', say: 'The GDP nowcast gap is context: it is not tested as a lean.' },
};
/** Which nowcast (if any) matches a US calendar row: { kind:'cpi'|'core'|'gdp', label } or null. */
export function nowcastKind(event) {
  if (String(event?.country ?? '').toUpperCase() !== 'US') return null;
  const t = String(event?.event ?? '');
  if (/core/i.test(t) && /(inflation|cpi)/i.test(t) && /(mom|m\/m|month)/i.test(t)) return { kind: 'core', label: 'Core CPI, month on month' };
  if (/(inflation rate|cpi)/i.test(t) && /(mom|m\/m|month)/i.test(t) && !/core|pce/i.test(t)) return { kind: 'cpi', label: 'CPI, month on month' };
  if (/gdp/i.test(t) && /(qoq|q\/q|quarter)/i.test(t) && !/deflator|price/i.test(t)) return { kind: 'gdp', label: 'GDP, quarter on quarter (annualised)' };
  return null;
}
/** The nowcast against the calendar's estimate. nowcast = /api/nowcast. null when the row has no matching nowcast, no estimate, or the nowcast is for another period. */
export function nowcastGap(event, nowcast) {
  const k = nowcastKind(event); if (!k || !nowcast) return null;
  const est = parseNum(event.estimate);
  let value = null, period = null, asOf = null;
  if (k.kind === 'gdp') { const g = nowcast.gdpnow; value = fin(g?.value) ? +g.value : null; period = g?.quarter ?? null; asOf = g?.quarter ?? null; }   // GDPNow carries one date: its latest estimate
  else { const c = nowcast.cleveland; value = fin(c?.[k.kind]) ? +c[k.kind] : null; period = c?.month ?? null; asOf = c?.asOf ?? null; }
  if (value == null || est == null) return null;
  const gap = Math.round((value - est) * 100) / 100, ev = NOWCAST_EVIDENCE[k.kind];
  return { kind: k.kind, label: k.label, nowcast: Math.round(value * 100) / 100, estimate: est, gap, period, asOf, evidence: ev,
    words: `${k.label}: the nowcast is ${value.toFixed(2)}% against a consensus of ${est}%, ${Math.abs(gap) < 0.05 ? 'about the same' : `${Math.abs(gap).toFixed(2)} points ${gap > 0 ? 'above' : 'below'} it`}. ${ev.say}` };
}

// ── similar releases (the Event Response Book) ──
/** What this release has done to each market in the past, in SIZE. null when the book has no line for it (a release that never cleared 1.5x an ordinary half-hour has none: that is an answer). */
export function similarReleases(event) {
  const country = String(event?.country ?? '').toUpperCase(), fam = familyOf(event?.event);
  const r = eventImpactFor(country, event?.event, fam);
  if (!r?.instruments) return null;
  const rows = Object.entries(r.instruments).map(([inst, v]) => ({ inst, spike: v.spike, next: v.next, n: v.n, upPct: v.upPct })).filter(x => fin(x.spike)).sort((a, b) => b.spike - a.spike).slice(0, 6);
  if (!rows.length) return null;
  return { label: r.label, events: r.events, medSpike: r.medSpike, exact: r.exact !== false, rows,
    words: `${r.label}: ${r.events} past prints. The 30-minute move has typically been ${r.medSpike}× an ordinary half-hour; next-day direction has been a coin flip (${rows.map(x => `${x.inst} ${x.upPct}% up`).slice(0, 3).join(', ')}).` };
}

// ── earnings ahead ──
const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
/** rows = /api/earnings-ahead rows. [{ date, label, items:[{ symbol, name, capB, when }] }] by date, today first, at most perDay companies (biggest first) per day. */
export function earningsByDay(rows, { now = Date.now(), perDay = 6, days = 7 } = {}) {
  const today = new Date(now).toISOString().slice(0, 10), last = new Date(now + days * 864e5).toISOString().slice(0, 10), by = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.symbol || !/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '') || r.date < today || r.date > last) continue;
    if (!by.has(r.date)) by.set(r.date, []);
    by.get(r.date).push({ symbol: String(r.symbol).slice(0, 8), name: String(r.name ?? '').slice(0, 40), capB: fin(r.capB) ? +r.capB : null, when: String(r.when ?? ''), tracked: !!r.tracked });
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, items]) => ({ date, label: DAY.format(new Date(`${date}T12:00:00Z`)), total: items.length, items: items.sort((a, b) => (b.capB ?? 0) - (a.capB ?? 0)).slice(0, perDay) }));
}

// ── release scorecards ──
/**
 * One card (from /api/release-calls scorecards) as plain lines, never HTML (the view escapes). owner=false drops the owner's private call.
 * { head, lines:[...], call? }
 */
export function scorecardLines(card, { owner = false } = {}) {
  const prints = (card?.prints ?? []).map(p => `${p.event}: ${p.actual != null ? `${p.actual}, ${surpriseWord(p.actual, p.estimate)}` : isAnnouncement(p) ? 'an announcement, no headline number to score' : 'not on the feed yet'}`);
  const lines = (card?.reactions ?? []).filter(Boolean).map(r => {
    const amt = r.unit === '$' ? `$${Math.abs(r.move)}` : `${Math.abs(r.move)} ${r.unit}`;
    const bk = r.book ? ` (the book: ${r.book.spike}× on ${r.book.n} prints)` : '';
    return `${String(r.name).replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2')} moved ${amt} ${r.dir} in 30 min${r.ratio != null ? `, ${r.ratio}× a normal half-hour${bk}, ${sizeWord(r.ratio, r.book)}` : ''}`;
  });
  const out = { head: `${card?.country ?? ''} · ${prints.join(' · ')}`, lines, ms: card?.ms ?? null, key: card?.key ?? null };
  if (owner && card?.call) out.call = `Your call: ${card.call.call} (${card.call.result === 'hit' ? 'right' : card.call.result === 'miss' ? 'wrong' : card.call.result === 'push' ? 'in line, a push' : 'not scored'})`;
  return out;
}

/** The newest scorecards first, at most n. */
export const recentScorecards = (cards, n = 6) => (Array.isArray(cards) ? cards : []).filter(c => c && Array.isArray(c.prints) && c.prints.length).slice().sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)).slice(0, n);

// ── tying a drawn row back to its event ──
/** The text a row shows, so a row in the DOM can be matched to an event: { time, country, event } (time in the given zone, HH:MM). */
export function rowSignature(e, tz = 'Europe/London') {
  const ms = Number(e?.ms ?? Date.parse(e?.time));
  return { time: Number.isFinite(ms) ? new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) : '', country: String(e?.country ?? ''), event: String(e?.event ?? '').trim() };
}
export const sameRow = (sig, other) => sig.time === other.time && sig.country === other.country && sig.event === other.event;
