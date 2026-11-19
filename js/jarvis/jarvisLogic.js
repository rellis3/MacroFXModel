// js/jarvis/jarvisLogic.js: the pure helpers behind the server-side Jarvis watcher and the morning digest.
// No I/O here, so every rule (dedupe, the daily cap, London-day logic, the digest text) is unit-tested in jarvisLogic.test.mjs.
// DESCRIPTION ONLY: every sentence says what moved or what the tape did, never what will happen and never a trade.

export const DEDUPE_MS = 6 * 3600_000;     // the same event is sent once per 6 hours
export const DAILY_CAP = 12;               // at most 12 phone alerts per London day
export const LOG_KEEP = 60;                // alerts kept in the KV log
export const SUFFIX = '(description, not a trade)';

const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
/** London calendar parts for an instant (ms): { date: 'YYYY-MM-DD', hm: 'HH:MM', mins, dow: 'Mon'..'Sun', weekday: bool }. Europe/London, so BST/GMT are handled, never a fixed UTC hour. */
export function londonParts(ms) {
  const p = Object.fromEntries(FMT.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const hour = +p.hour % 24, minute = +p.minute;
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${String(hour).padStart(2, '0')}:${p.minute}`, mins: hour * 60 + minute, dow: p.weekday, weekday: !['Sat', 'Sun'].includes(p.weekday) };
}

/** A fresh, empty persisted state. */
export const emptyState = () => ({ v: 1, snapshot: null, snapshotAt: 0, lastCheck: 0, sent: {}, day: '', dayCount: 0, log: [], digestDate: '' });

/** Make whatever came out of KV safe to use (a parse failure or an old shape must never throw). */
export function normaliseState(raw) {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { o = null; } }
  const s = emptyState();
  if (!o || typeof o !== 'object') return s;
  if (o.snapshot && typeof o.snapshot === 'object' && o.snapshot.links && o.snapshot.nodes) { s.snapshot = o.snapshot; s.snapshotAt = +o.snapshotAt || 0; }
  s.lastCheck = +o.lastCheck || 0;
  if (o.sent && typeof o.sent === 'object') for (const [k, v] of Object.entries(o.sent)) if (Number.isFinite(+v)) s.sent[k] = +v;
  s.day = typeof o.day === 'string' ? o.day : ''; s.dayCount = +o.dayCount || 0;
  s.log = Array.isArray(o.log) ? o.log.filter(a => a && typeof a.text === 'string' && Number.isFinite(+a.at)).slice(-LOG_KEEP) : [];
  s.digestDate = typeof o.digestDate === 'string' ? o.digestDate : '';
  return s;
}

/** The dedupe key of an event: kind plus the link or market it is about. */
export const eventKey = ev => `${ev.kind}:${ev.id}`;

/** The wording of a phone alert: the watchDiff sentence, prefixed and suffixed. */
export const alertText = ev => `Jarvis: ${String(ev.text).trim()} ${SUFFIX}`;

/**
 * Decide which events may be sent now. Pure: returns { send, state } and never mutates the input.
 * Rules: the same key is sent at most once per DEDUPE_MS; at most DAILY_CAP per London day (the counter resets when the London date changes);
 * a send is recorded in the log. When in doubt it sends less.
 */
export function planAlerts(state, events, now, { cap = DAILY_CAP, dedupeMs = DEDUPE_MS } = {}) {
  const s = { ...state, sent: { ...state.sent }, log: [...state.log] };
  const today = londonParts(now).date;
  if (s.day !== today) { s.day = today; s.dayCount = 0; }
  for (const [k, t] of Object.entries(s.sent)) if (now - t > dedupeMs * 4) delete s.sent[k];   // housekeeping only; the dedupe test below is the rule
  const send = [];
  for (const ev of events ?? []) {
    if (!ev || !ev.text) continue;
    const key = eventKey(ev);
    if (s.sent[key] != null && now - s.sent[key] < dedupeMs) continue;
    if (s.dayCount >= cap) break;
    s.sent[key] = now; s.dayCount++;
    const rec = { at: now, key, kind: ev.kind, level: ev.level ?? 'info', text: alertText(ev), date: today };
    s.log.push(rec); send.push(rec);
  }
  s.log = s.log.slice(-LOG_KEEP);
  return { send, state: s };
}

/** A memory event when the server crosses the owner's limit (level 'high' or 'critical'), else null. memoryState is jarvisCore's. */
export function memoryEvent(rssMB, limitMB, level) {
  if (!(limitMB > 0) || rssMB == null || level === 'ok') return null;
  return { kind: 'memory', level: 'warn', id: level, text: `Server memory is ${Math.round(rssMB)} MB, ${level} against your ${Math.round(limitMB)} MB limit.` };
}

/** True while the live window is frozen (weekend / markets shut): no alerts then. The route reports `frozen`; no live block at all also means nothing to judge. */
export const liveUsable = live => !!live && live.ok !== false && !live.frozen;

/** Alerts raised in the hours before a morning digest (default the last 14 h), oldest first. */
export const overnightAlerts = (log, now, hours = 14) => (log ?? []).filter(a => a.at >= now - hours * 3600_000 && a.at <= now).sort((a, b) => a.at - b.at);

/** The digest is due once per London weekday, from 06:30 until 11:00 (a missed morning is not sent late in the day), and not twice. */
export function morningDue(now, digestDate) {
  const p = londonParts(now);
  return p.weekday && p.mins >= 6 * 60 + 30 && p.mins < 11 * 60 && digestDate !== p.date;
}

/** High-impact events of the London day from /api/calendar-events rows ({ ms, ccy, rank, event }). */
export function todaysEvents(rows, date) {
  return (Array.isArray(rows) ? rows : []).filter(e => e && Number.isFinite(+e.ms) && londonParts(+e.ms).date === date && (e.rank == null || e.rank >= 3))
    .sort((a, b) => a.ms - b.ms).map(e => ({ time: londonParts(+e.ms).hm, ccy: String(e.ccy ?? ''), event: String(e.event ?? '') }));
}

/**
 * The "While you slept" digest. summary = summariseChain(links, 1); radar = radarRank(graph, names); alerts = overnight log records; events = todaysEvents().
 * Template text, no model call.
 */
export function buildDigest({ date, summary, radar, alerts, events } = {}) {
  const movers = (radar?.items ?? []).slice(0, 5).map(i => ({ key: i.key, label: i.label, text: i.text, ratio: +i.ratio.toFixed(1), why: i.why }));
  const sum = summary ? { headline: String(summary.headline ?? ''), holding: summary.holding ?? 0, broken: summary.broken ?? 0 } : null;
  const al = (alerts ?? []).map(a => ({ at: a.at, text: a.text }));
  const ev = events ?? null;
  const lines = [`Jarvis: while you slept (${date ?? ''}).`];
  if (sum) lines.push(`Chain, 1 day: ${sum.holding} holding, ${sum.broken} broken. ${sum.headline}`.trim());
  else lines.push('Chain, 1 day: not available this morning.');
  if (radar?.broken?.length) lines.push(`Broken links: ${radar.broken.map(b => b.short).join(', ')}.`);
  if (movers.length) { lines.push('Biggest moves against their normal noise:'); for (const m of movers) lines.push(`- ${m.label} ${m.text} (${m.ratio}x)`); }
  else lines.push('No market is beyond its normal noise.');
  lines.push(al.length ? `Alerts overnight: ${al.length}.` : 'No alerts overnight.');
  if (ev) lines.push(ev.length ? `High-impact releases today (London): ${ev.slice(0, 8).map(e => `${e.time} ${e.ccy} ${e.event}`).join('; ')}.` : 'No high-impact releases listed today.');
  lines.push(SUFFIX);
  return { date, summary: sum, movers, overnightAlerts: al, events: ev ?? [], text: lines.join('\n') };
}
