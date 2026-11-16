// js/asofCore.js: the pure rules of the whole-terminal as-of clock (Desk Terminal, preview feature widget.asof). No DOM, no network: what the clock may
// answer from, in which order, and what it must refuse. The browser parts are js/terminal/asofBoot.js (the fetch gate) and js/terminal/asofClock.js (the control).
//
// THE RULE THAT MATTERS: a past view must never show a live number. Every /api GET the page makes while an as-of time is set is either
//   answered from a saved record AT OR BEFORE that time (never after),
//   answered from history that carries its own date (the replay routes, the morning book by date, candles cut at the as-of time),
//   passed through because it is the user's own saved setting, not market data (alerts, monitors, saved searches, workspaces, favourites), or
//   REFUSED with a plain "no record at that time" body that the board shows in its own empty state.
// There is no fourth path. Descriptive only: nothing here is a signal.

export const PARAM = 'asof';
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const pad = n => String(n).padStart(2, '0');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The as-of time in the URL: ?asof=2026-11-12T14:30Z (or #asof=...). A bare date means 12:00 UTC that day. null when absent or not a date. */
export function parseAsof(search = '', hash = '') {
  let raw = null;
  try { raw = new URLSearchParams(String(search).replace(/^\?/, '')).get(PARAM); } catch { raw = null; }
  if (!raw) { const m = /^#asof=([^&]+)/.exec(String(hash)); raw = m ? decodeURIComponent(m[1]) : null; }
  return parseAsofValue(raw);
}
export function parseAsofValue(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T12:00Z';
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?Z$/.test(s)) s = s.replace(' ', 'T');
  else if (!/^\d{13}$/.test(s)) return null;
  const t = /^\d{13}$/.test(s) ? Number(s) : Date.parse(s);
  return Number.isFinite(t) && t > Date.parse('2000-01-01') && t < Date.parse('2100-01-01') ? t : null;
}
/** ms -> the value kept in the URL: 2026-11-12T14:30Z */
export const formatAsofParam = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`; };
/** ms -> the value for an <input type="datetime-local"> (UTC): 2026-11-12T14:30 */
export const formatLocalInput = ms => formatAsofParam(ms).slice(0, 16);
/** Thu 12 Nov 14:30 UTC */
export function formatClock(ms) { const d = new Date(ms); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; }
export const bannerText = ms => `Viewing ${formatClock(ms)}, not live`;
/** 2026-11-14 -> 14 Nov 2026 */
export function dayLabel(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '')); return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : String(iso ?? ''); }

/** The London calendar date and wall-clock minutes of an instant (Europe/London, summer time handled by Intl). */
export function londonParts(ms) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  const h = Number(o.hour) % 24;
  return { date: `${o.year}-${o.month}-${o.day}`, minutes: h * 60 + Number(o.minute) };
}
export const londonDate = ms => londonParts(ms).date;

// ── what the clock may answer from ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Routes that are the person's own settings, not market data: they pass through live and say so (a saved list is not a past reading). */
const USER_STORE = [/^\/api\/desk-access/, /^\/api\/desk-session/, /^\/api\/nav-layout/, /^\/api\/desk-alert-rules/, /^\/api\/desk-alerts\b/, /^\/api\/desk-monitors/, /^\/api\/desk-news-searches/,
  /^\/api\/desk-workspaces/, /^\/api\/desk-shared-reads/, /^\/api\/desk-snapshots/];
/** Routes whose answer is history that carries its own date (a day or a time is in the request), so they cannot leak live numbers. */
const DATED = [/^\/api\/replay\//, /^\/api\/desk-run\/index/];

const pathOf = url => { try { const u = new URL(url, 'http://x.invalid'); return { path: u.pathname, search: u.search, params: u.searchParams }; } catch { return { path: String(url), search: '', params: new URLSearchParams() }; } };

/** What to do with one request while an as-of time is set. Returns { kind, ... }. Non-API and non-GET requests are the caller's business (pass). */
export function classify(url, method = 'GET') {
  const { path, search } = pathOf(url);
  if (String(method).toUpperCase() !== 'GET') return { kind: 'pass', why: 'not a read' };
  if (!path.startsWith('/api/')) return { kind: 'pass', why: 'not an API read' };
  if (USER_STORE.some(r => r.test(path))) return { kind: 'pass', why: 'your own saved settings, not market data' };
  if (DATED.some(r => r.test(path))) return { kind: 'pass', why: 'history that carries its own date' };
  if (path === '/api/desk-bars') return { kind: 'bars', path, search };
  if (path === '/api/desk-run' || path === '/api/desk-run/') return { kind: 'deskrun', path, search };
  return { kind: 'snapshot', path, search, key: path.replace(/^\/api\//, '') + search };
}

/** The saved FULL record of a feed for a route request: exact route+query first, then the route alone (flagged approximate when the request had a query). */
export function matchFeed(feeds, key) {
  if (!feeds || typeof feeds !== 'object') return null;
  if (feeds[key]) return { feed: feeds[key], approx: false, key };
  const bare = key.replace(/\?.*$/, '');
  if (bare !== key && feeds[bare]) return { feed: feeds[bare], approx: true, key: bare };
  const withQ = Object.keys(feeds).find(k => k.replace(/\?.*$/, '') === bare && k !== bare);
  if (withQ && bare === key) return { feed: feeds[withQ], approx: true, key: withQ };
  return null;
}

/** The latest sorted point with ts <= asOfMs (never a later one). points: [{ ts }] ascending. */
export function pointAtOrBefore(points, asOfMs) {
  if (!Array.isArray(points) || !points.length) return null;
  let lo = 0, hi = points.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (points[mid].ts <= asOfMs) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans < 0 ? null : points[ans];
}
/** FULL days to try, newest first: London dates up to the as-of London date (a FULL taken at 10:00 London on that date may still be later than the as-of time: the caller then tries the previous day). */
export function fullCandidates(fullDays, asOfMs) {
  const ld = londonDate(asOfMs);
  return [...(fullDays ?? [])].filter(d => d <= ld).sort().reverse();
}
/** Of the loaded FULL snapshots ([{ ld, ts }]), the latest one taken at or before the as-of time. */
export function chooseFull(snaps, asOfMs) {
  return (snaps ?? []).filter(s => s && Number.isFinite(s.ts) && s.ts <= asOfMs).sort((a, b) => b.ts - a.ts)[0] ?? null;
}

// ── shaping ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Candles up to the as-of time: only bars that had FINISHED then (a bar's open + its length <= as-of), never the forming one. */
export function truncateBars(json, asOfMs) {
  if (!json || !Array.isArray(json.bars)) return json;
  const sec = Number(json.sec) > 0 ? Number(json.sec) : 300;
  const bars = json.bars.filter(b => (Number(b.time) + sec) * 1000 <= asOfMs).map(b => { const { forming, ...rest } = b; return rest; });
  return { ...json, bars, forming: false, asOf: asOfMs, asofCut: true };
}
/**
 * The saved daily record of the currency strength route, with the scores replaced by the nearest five-minute point at or before the as-of time (the CORE
 * point keeps the scores, the leader, the laggard and the spread; the route's other fields stay from the daily record, so the shape is the route's own).
 */
export function overlayStrength(base, core) {
  const d = core?.d?.strength;
  if (!base?.horizons || !d?.h) return base;
  const out = { ...base, horizons: { ...base.horizons }, asOf: d.dataAsOf ?? base.asOf, asofOverlay: { from: 'core', ts: core.ts } };
  for (const [h, c] of Object.entries(d.h)) {
    const cur = out.horizons[h]; if (!cur || !Array.isArray(cur.scores) || !c?.s) continue;
    const scores = cur.scores.map(x => (Number.isFinite(c.s[x.ccy]) ? { ...x, score: c.s[x.ccy] } : x)).sort((a, b) => b.score - a.score).map((x, i) => ({ ...x, rank: i + 1 }));
    out.horizons[h] = { ...cur, scores, leader: c.lead ?? cur.leader, laggard: c.lag ?? cur.laggard, spread: c.spread ?? cur.spread, flat: c.flat ?? cur.flat };
  }
  return out;
}

/** The morning book the as-of time may see: London dates before 08:00 London read the previous day's book (the dawn run finishes around 07:00 London). */
export function deskRunDate(asOfMs) {
  const { date, minutes } = londonParts(asOfMs);
  if (minutes >= 8 * 60) return date;
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function deskRunUrl(url, asOfMs) {
  const { path, params } = pathOf(url);
  const p = new URLSearchParams(params); p.set('date', deskRunDate(asOfMs));
  return `${path}?${p.toString()}`;
}

/** The body a refused route gets: a normal not-ok answer, with the reason in the board's own words. */
export function refusal(asOfMs, firstTs, key = '') {
  const first = firstTs ? `snapshots start ${dayLabel(new Date(firstTs).toISOString().slice(0, 10))}` : 'no snapshots are held';
  return { ok: false, noRecord: true, asof: formatAsofParam(asOfMs), route: key, error: `No record of this at ${formatClock(asOfMs)} (${first}). Nothing live is shown in a past view.` };
}

// ── coverage and stepping ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the saved records cover: first and last five-minute point, how many, gaps over 50 minutes (the shut-market cadence is 30), the FULL days. */
export function coverage(index, pts) {
  const ts = (pts ?? []).map(p => p.ts).filter(Number.isFinite).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 50 * MIN) gaps.push({ from: ts[i - 1], to: ts[i], minutes: Math.round((ts[i] - ts[i - 1]) / MIN) });
  return { firstCore: ts[0] ?? null, lastCore: ts[ts.length - 1] ?? null, nCore: ts.length, gaps, fullDays: [...(index?.fullDays ?? [])].sort(), coreDays: [...(index?.coreDays ?? [])].sort() };
}
export function coverageText(cv) {
  if (!cv || !cv.nCore) return 'No snapshots are held yet, so there is nothing to go back to.';
  const g = cv.gaps.length ? ` ${cv.gaps.length} gap${cv.gaps.length === 1 ? '' : 's'} over 50 minutes (longest ${Math.max(...cv.gaps.map(x => x.minutes))} minutes).` : ' No gap over 50 minutes.';
  return `Snapshots run from ${formatClock(cv.firstCore)} to ${formatClock(cv.lastCore)}: ${cv.nCore} points every 5 minutes while the FX week is open (30 when shut), and a full record of the feeds on ${cv.fullDays.length} day${cv.fullDays.length === 1 ? '' : 's'} (${cv.fullDays.map(dayLabel).join(', ')}).${g} Capture began on ${dayLabel(new Date(cv.firstCore).toISOString().slice(0, 10))}, so earlier dates have nothing.`;
}
/** Where an as-of time sits against the coverage: before it, inside it, after the last point. */
export function position(cv, asOfMs) {
  if (!cv?.nCore) return 'empty';
  if (asOfMs < cv.firstCore) return 'before';
  if (asOfMs > cv.lastCore + 60 * MIN) return 'after';
  return 'inside';
}
/** "+1h", "-30m", "+2d" -> ms offset, or null. */
export function parseOffset(s) {
  const m = /^([+-])\s*(\d+(?:\.\d+)?)\s*(m|min|h|d)$/i.exec(String(s ?? '').trim());
  if (!m) return null;
  const n = Number(m[2]) * (/^m/i.test(m[3]) ? MIN : /^h/i.test(m[3]) ? HOUR : DAY);
  return m[1] === '-' ? -n : n;
}
/** Play: the clock moves by speed x the real time that passed, clamped to the last point. */
export function advance(clockMs, realDtMs, speed, lastMs) {
  const t = clockMs + Math.max(0, realDtMs) * Math.max(0, speed);
  return Number.isFinite(lastMs) ? Math.min(t, lastMs) : t;
}
export const SPEEDS = [2, 10, 60, 300];

/** What the popover lists as "what you are seeing": the log of how each route was answered. log: [{ key, how, ts?, approx? }] */
export function describeLog(log) {
  const by = { snapshot: [], overlay: [], cut: [], deskrun: [], pass: [], refused: [] };
  for (const l of log ?? []) (by[l.how] ?? (by[l.how] = [])).push(l);
  return by;
}
export const HOW_LABEL = { snapshot: 'from the daily record', overlay: 'daily record with the five-minute scores', cut: 'candles cut at the as-of time', deskrun: "that morning's book", pass: 'your own settings (live)', refused: 'no record at that time' };
