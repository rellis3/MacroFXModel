/**
 * QLIKE level alerts (owner, 2026-11-28, desk layers): a note when price reaches one of the day's QLIKE per-line levels on the
 * CFD board (ladder-qlike-per-line-cfd, /api/vol-forecast/ladder-v2/qlike-today?track=cfd, the lines the KLineChart draws).
 * The levels are % of the 00:00 London open (js/ladderV2Qlike.js qlikeDayLevels); this module turns them into prices, finds
 * the ones price reached since the last check, and gates the notes. It reads the board and never changes it.
 *
 * Rules:
 *   - a level is REACHED when the last check and this one sit on either side of it, or this check is on it (touched or
 *     crossed). The first check of a session is a silent baseline: a level price is already beyond is marked done unsent;
 *   - once per level per session (key session|market|line); the key set is reset each session, so it stays small;
 *   - quiet hours 22:00-07:00 London (js/jarvis/jarvisLogic.js QUIET): a level reached then is logged, not sent;
 *   - a daily cap on notes (dailyCap); past it the level is logged as held, never re-sent later.
 *
 * WORDING: a description of where price is against the forecast's range, never a trade. What the Evidence Book supports:
 *   level-touch (null): drawn levels give no usable bounce or break after costs, so nothing here says what comes next;
 *   line-touch-reach (validated, on the Live Range lines): reaching a line does not stop the day; the next line is often reached;
 *   each QLIKE line's own hit rate 2020-26 (hits_2020_26 in the params) is quoted as the share of sessions that reached it.
 *
 * Pure: no fetch, no KV; the clock comes in as `now`. Tested in js/qlikeLevelAlerts.test.mjs.
 */
import { londonParts, inQuiet, QUIET } from './jarvis/jarvisLogic.js';

/** The lines that can alert: [board key, side (+1 above the open, -1 below), percentile]. */
export const QLA_LINES = {
  oh_p50: [1, 50], oh_p75: [1, 75], oh_p90: [1, 90],
  ol_p50: [-1, 50], ol_p75: [-1, 75], ol_p90: [-1, 90],
};
/** Defaults: the p75 and p90 range edges (the p50 lines are reached on about half of all sessions, too often to be news) on the desk's core markets. */
export const QLA_DEFAULTS = {
  lines: ['oh_p75', 'oh_p90', 'ol_p75', 'ol_p90'],
  markets: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY', 'GOLD', 'SILVER', 'NQ', 'SPX500', 'US30', 'DE30', 'UK100', 'WTI'],
  dailyCap: 20,
  keepLog: 200,
  quiet: QUIET,
};
export const QLA_EVIDENCE = ['level-touch', 'line-touch-reach'];
export const QLA_NOTE = 'A description of where price is against the forecast\'s range, not a signal. Drawn levels showed no usable bounce or break after costs (Evidence Book: level-touch); reaching a line does not stop the day, and the next line is often reached too (line-touch-reach, measured on the Live Range lines).';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const TAU_WORD = { 50: 'median', 75: '75th-percentile', 90: '90th-percentile' };

// one formatter for the module (never one per call: the Railway memory history)
const OFF_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** 00:00 London on a YYYY-MM-DD date, as epoch ms (London is UTC or UTC+1). */
export function londonMidnightMs(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? '')); if (!m) return null;
  const g = Date.UTC(+m[1], +m[2] - 1, +m[3]), p = OFF_FMT.formatToParts(new Date(g));
  const h = +p.find(x => x.type === 'hour').value, mm = +p.find(x => x.type === 'minute').value;
  return g - (h * 60 + mm) * 60_000;
}

/** A price to the decimals its size needs. */
export const fmtPrice = v => (!fin(v) ? '–' : v.toFixed(Math.abs(v) < 10 ? 5 : Math.abs(v) < 1000 ? 3 : 1));

/** q = one market's board entry (% of open), open = the 00:00 London open. -> [{ line, side, tau, pct, price }] for the chosen lines. */
export function levelPrices(q, open, lines = QLA_DEFAULTS.lines) {
  if (!q || !fin(open) || open <= 0) return [];
  const out = [];
  for (const line of lines) {
    const spec = QLA_LINES[line], pct = q[line]; if (!spec || !fin(pct)) continue;
    out.push({ line, side: spec[0], tau: spec[1], pct, price: open * (1 + spec[0] * pct / 100) });
  }
  return out;
}

/**
 * One check for one market. st = { prev: last price or null, done: { line: true } } (kept by the caller for the session).
 * -> { st, hits: [{ line, side, tau, pct, level, price, kind: 'crossed' | 'touched' }], baseline: [line] }. Never mutates st.
 */
export function checkMarket(levels, st, price) {
  const done = { ...(st?.done ?? {}) }, prev = fin(st?.prev) ? st.prev : null, hits = [], baseline = [];
  if (!fin(price)) return { st: { prev, done }, hits, baseline };
  for (const L of levels ?? []) {
    if (done[L.line]) continue;
    if (prev == null) {   // first sight this session: already beyond = reached before the watch began, recorded silently
      if (L.side * (price - L.price) >= 0) { done[L.line] = true; baseline.push(L.line); }
      continue;
    }
    const lo = Math.min(prev, price), hi = Math.max(prev, price);
    if (L.price >= lo && L.price <= hi) {
      done[L.line] = true;
      hits.push({ line: L.line, side: L.side, tau: L.tau, pct: L.pct, level: L.price, price, kind: L.side * (price - L.price) > 0 ? 'crossed' : 'touched' });
    }
  }
  return { st: { prev: price, done }, hits, baseline };
}

/** The share of 2020-26 sessions that reached this line, from the board's params (lines.oh / lines.ol .hits_2020_26 = [p50, p75, p90]). */
export function hitRate(params, line) {
  const fam = String(line).slice(0, 2), i = { 50: 0, 75: 1, 90: 2 }[QLA_LINES[line]?.[1]];
  const v = params?.lines?.[fam]?.hits_2020_26?.[i];
  return fin(v) ? v : null;
}

/** The one-line description. "EURUSD reached its upper QLIKE level (1.09120), the forecast's 75th-percentile range edge ..." */
export function alertText(sym, hit, params = null) {
  const side = hit.side > 0 ? 'upper' : 'lower', h = hitRate(params, hit.line);
  return `${sym} reached its ${side} QLIKE level (${fmtPrice(hit.level)}), the forecast's ${TAU_WORD[hit.tau] ?? `${hit.tau}th-percentile`} range edge`
    + ` (${hit.side > 0 ? '+' : '−'}${hit.pct.toFixed(2)}% from the 00:00 London open)`
    + (h != null ? `; ${Math.round(h)}% of 2020-26 sessions reached this line` : '');
}

/** An empty gate state for a session. */
export const emptyGate = (session = '', day = '') => ({ session, day, sent: 0, keys: {} });

/**
 * Gate the session's new events. events = [{ key, ... }] (key = session|market|line). state = { session, day, sent, keys }.
 * -> { state, events: [{ ...ev, send, held, at }] }. A key seen before this session is dropped (not even logged again).
 */
export function gate(state, events, now, o = QLA_DEFAULTS) {
  const day = londonParts(now).date;
  let s = state && typeof state === 'object' ? { ...state, keys: { ...(state.keys ?? {}) } } : emptyGate();
  if (s.day !== day) s = { ...s, day, sent: 0 };
  const q = inQuiet(now, o.quiet ?? QUIET), out = [];
  for (const ev of events ?? []) {
    if (!ev?.key || s.keys[ev.key] != null) continue;
    s.keys[ev.key] = now;
    let held = null;
    if (q) held = 'quiet hours (22:00-07:00 London): logged, not sent';
    else if (s.sent >= (o.dailyCap ?? QLA_DEFAULTS.dailyCap)) held = `daily cap: ${o.dailyCap ?? QLA_DEFAULTS.dailyCap} notes sent today`;
    if (!held) s.sent++;
    out.push({ ...ev, send: !held, held, at: new Date(now).toISOString() });
  }
  return { state: s, events: out };
}

/** A new session's gate: the keys of other sessions are dropped (bounded), the day count is kept. */
export function rollSession(state, session) {
  if (state?.session === session) return state;
  return { ...emptyGate(session, state?.day ?? ''), sent: state?.sent ?? 0 };
}

const escHtml = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/** One Telegram message for a check's sendable events (HTML). hm = 'HH:MM' London. */
export function telegramMessage(events, hm) {
  const list = (events ?? []).filter(e => e.send);
  if (!list.length) return null;
  const lines = list.slice(0, 10).map(e => `• ${escHtml(e.text)}`);
  if (list.length > 10) lines.push(`• and ${list.length - 10} more (listed on the desk)`);
  return `📏 <b>QLIKE levels</b> · ${escHtml(hm)} London\n${lines.join('\n')}\n<i>${escHtml(QLA_NOTE)}</i>`;
}

/** Append events to the log, newest first, capped. */
export const appendLog = (log = [], events = [], keep = QLA_DEFAULTS.keepLog) => [...[...events].reverse(), ...(Array.isArray(log) ? log : [])].slice(0, keep);

/** Parse a comma list from the env into the allowed set (unknown names dropped); empty -> the fallback. */
export function parseList(raw, allowed, fallback) {
  const xs = String(raw ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const ok = allowed ? xs.filter(x => allowed.includes(x)) : xs;
  return ok.length ? ok : fallback;
}
