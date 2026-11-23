/**
 * Hedge for today: the maths behind the Desk Terminal Hedges tab's "Today" card (a hedge opened at the London morning and
 * closed in the New York afternoon, 08:00-17:00 London). Pure: no fetch, no DOM. Used by server.js (/api/hedge-today builds
 * the panel) and js/terminal/hedgeView.js (ranks and sizes). Tested by js/hedgeTodayCore.test.mjs.
 *
 * Evidence (forge/HEDGE_TODAY_PREREG.md, analysis/output/hedge-today/RESULTS.md, 2026-11-23):
 *   hedge-today          sizing from in-session hourly returns (EWMA, 120 sessions, decay 0.95) removed +5.0pp more session
 *                        variance than the daily 60-day ratio [+3.3, +6.7], 12 of 12 test sets; UNDERPOWERED as registered (the
 *                        placebo clause fails every method, the benchmark included). So the card shows BOTH ratios.
 *   hedge-today-pick     ranking partners by in-session co-movement beat the daily ranking by +2.2pp [+1.1, +3.5], 7 of 8: VALIDATED.
 *   hedge-today-daytype  sizing from past release days only did not help (-0.7pp): no event-day switch.
 *
 *   londonOffsetSec(t)               Europe/London offset (BST rule) for a UTC epoch second
 *   sessionsFromH1(candles, nowSec)  [{ t: ms|ISO, c }] OANDA H1 (start times, mid closes) -> Map(London date -> [P8..P17])
 *   buildTodayPanel(bySym, opts)     { generated, sessions, syms, px: {sym: [[P8..P17] | null per session]} } (completed sessions)
 *   hourlyOf(panel, sym)             Float64Array(nSessions * 9) in-session hourly log returns (NaN missing)
 *   sessionRetOf(panel, sym)         Float64Array(nSessions) 08:00 -> 17:00 log return (NaN missing)
 *   betaEwma / corrWindow / heldUp   the session ratio, the session correlation and its out-of-sample check
 *   rankToday(panel, target, opts)   candidates ranked by |session corr| x how often its sign held, with both ratios
 */

export const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
export const NH = 9;
export const CFG = Object.freeze({ corrSessions: 20, shareLookback: 120, shareStep: 5, ewmaSessions: 120, ewmaDecay: 0.95, minAbs: 0.10, heldUpSessions: 60, minHistory: 40, keepSessions: 200 });
const fin = v => typeof v === 'number' && Number.isFinite(v);

const lastSun = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay(), 1) / 1000; };
const _bst = {};
/** Europe/London offset in seconds (3600 in BST, last Sunday of March 01:00 UTC to last Sunday of October 01:00 UTC). */
export function londonOffsetSec(t) { const y = new Date(t * 1000).getUTCFullYear(), [a, b] = (_bst[y] ??= [lastSun(y, 2), lastSun(y, 9)]); return t >= a && t < b ? 3600 : 0; }
const londonParts = t => { const tl = t + londonOffsetSec(t); return { date: new Date(tl * 1000).toISOString().slice(0, 10), min: Math.floor((tl % 86400) / 60) }; };

/** OANDA H1 candles (start time, mid close) -> Map(London date -> [P8..P17]). The price at h:00 London is the close of the H1
 *  bar that ENDS at h:00 (starts at h-1:00). Only sessions whose 17:00 London is at or before nowSec, on weekdays. */
export function sessionsFromH1(candles, nowSec = Date.now() / 1000) {
  const out = new Map();
  for (const c of candles ?? []) {
    const t0 = typeof c.t === 'number' ? c.t / 1000 : Date.parse(String(c.t).length <= 16 ? c.t + ':00Z' : c.t) / 1000;
    const close = +c.c; if (!fin(t0) || !(close > 0)) continue;
    const end = t0 + 3600; if (end > nowSec) continue;                       // the bar must have closed
    const { date, min } = londonParts(end);
    if (min % 60) continue;
    const j = HOURS.indexOf(min / 60); if (j < 0) continue;
    const wd = new Date(date + 'T12:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue;
    let row = out.get(date); if (!row) { row = new Array(HOURS.length).fill(null); out.set(date, row); }
    row[j] = close;
  }
  // a session counts only once its 17:00 London has passed
  for (const [d, row] of out) { const p = londonParts(nowSec); if (d > p.date || (d === p.date && p.min < 17 * 60)) out.delete(d); else if (row.every(v => v == null)) out.delete(d); }
  return out;
}

/** The London date of the latest weekday session whose 17:00 London has passed (what a fresh panel should end on). */
export function lastCompletedSession(nowSec = Date.now() / 1000) {
  for (let back = 0; back < 8; back++) {
    const t = nowSec - back * 86400, { date } = londonParts(t), wd = new Date(date + 'T12:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (back === 0 && londonParts(nowSec).min < 17 * 60) continue;
    return date;
  }
  return null;
}

/** bySym: { SYM: candles[] }. Keeps the last `keep` completed London sessions that at least half the symbols printed. */
export function buildTodayPanel(bySym, { nowSec = Date.now() / 1000, keep = CFG.keepSessions } = {}) {
  const maps = Object.fromEntries(Object.entries(bySym).map(([s, c]) => [s, sessionsFromH1(c, nowSec)]).filter(([, m]) => m.size));
  const syms = Object.keys(maps); if (!syms.length) return null;
  const count = new Map(); for (const m of Object.values(maps)) for (const d of m.keys()) count.set(d, (count.get(d) ?? 0) + 1);
  const sessions = [...count.entries()].filter(([, n]) => n >= syms.length / 2).map(([d]) => d).sort().slice(-keep);
  const px = Object.fromEntries(syms.map(s => [s, sessions.map(d => { const r = maps[s].get(d); return r ? r.map(v => (v == null ? null : +(+v).toPrecision(7))) : null; })]));
  return { generated: new Date(nowSec * 1000).toISOString(), window: '08:00-17:00 London', sessions, syms, px };
}

export function hourlyOf(panel, sym) {
  const n = panel.sessions.length, o = new Float64Array(n * NH).fill(NaN), g = panel.px[sym]; if (!g) return null;
  for (let s = 0; s < n; s++) { const r = g[s]; if (!r) continue; for (let j = 0; j < NH; j++) if (r[j] > 0 && r[j + 1] > 0) o[s * NH + j] = Math.log(r[j + 1] / r[j]); }
  return o;
}
export function sessionRetOf(panel, sym) {
  const n = panel.sessions.length, o = new Float64Array(n).fill(NaN), g = panel.px[sym]; if (!g) return null;
  for (let s = 0; s < n; s++) { const r = g[s]; if (r && r[0] > 0 && r[9] > 0) o[s] = Math.log(r[9] / r[0]); }
  return o;
}

/** Weighted moments of paired hourly returns over sessions [a, b) (weights by session, w(s) = decay^(b-1-s)). */
function moments(x, y, a, b, decay = 1) {
  let sw = 0, mx = 0, my = 0, n = 0;
  for (let s = a; s < b; s++) { const w = decay === 1 ? 1 : Math.pow(decay, b - 1 - s); for (let j = 0; j < NH; j++) { const i = s * NH + j, u = x[i], v = y[i]; if (!fin(u) || !fin(v)) continue; sw += w; mx += w * u; my += w * v; n++; } }
  if (n < 10 || sw <= 0) return null;
  mx /= sw; my /= sw; let vx = 0, vy = 0, cv = 0;
  for (let s = a; s < b; s++) { const w = decay === 1 ? 1 : Math.pow(decay, b - 1 - s); for (let j = 0; j < NH; j++) { const i = s * NH + j, u = x[i], v = y[i]; if (!fin(u) || !fin(v)) continue; vx += w * (u - mx) ** 2; vy += w * (v - my) ** 2; cv += w * (u - mx) * (v - my); } }
  return vx > 0 && vy > 0 ? { n, rho: cv / Math.sqrt(vx * vy), beta: cv / vy } : null;
}
/** Correlation of in-session hourly returns over the `w` sessions before index `end` (exclusive). */
export const corrWindow = (x, y, end, w = CFG.corrSessions) => moments(x, y, Math.max(0, end - w), end)?.rho ?? null;
/** Session hedge ratio (target on hedge): EWMA least squares on in-session hourly returns over the sessions before `end`. */
export function betaEwma(x, y, end, { sessions = CFG.ewmaSessions, decay = CFG.ewmaDecay, min = CFG.minHistory } = {}) {
  const a = Math.max(0, end - sessions); if (end - a < Math.min(min, sessions)) return null;
  return moments(x, y, a, end, decay)?.beta ?? null;
}
/** Out of sample: over the last `k` sessions, each hedged with the ratio from the sessions before it; share of the target's
 *  session variance removed (1 - var(hedged) / var(target)). */
export function heldUp(x, y, rx, ry, end, { k = CFG.heldUpSessions } = {}) {
  const h = [], a = [];
  for (let s = Math.max(CFG.minHistory, end - k); s < end; s++) {
    if (!fin(rx[s]) || !fin(ry[s])) continue; const b = betaEwma(x, y, s); if (!fin(b)) continue;
    h.push(rx[s] - b * ry[s]); a.push(rx[s]);
  }
  if (h.length < 20) return null;
  const v = z => { const m = z.reduce((p, q) => p + q, 0) / z.length; return z.reduce((p, q) => p + (q - m) ** 2, 0) / z.length; };
  return { cut: 1 - v(h) / v(a), n: h.length };
}

/** The currencies an FX symbol or DXY carries (for "does this partner cut the position rather than hedge it"). */
export function ccysOf(sym) {
  const s = String(sym).replace(/_/g, '').toUpperCase();
  if (s === 'DXY') return ['USD', 'EUR', 'JPY', 'GBP', 'CAD', 'CHF'];
  return /^[A-Z]{6}$/.test(s) && !/^(XAU|XAG|XPT|XCU)/.test(s) ? [s.slice(0, 3), s.slice(3)] : [];
}

/**
 * Candidates for hedging `target` held for one session, ranked by |session corr| x share of the last `shareLookback`
 * sessions' correlations (every `shareStep`) with today's sign. Each row: { sym, rho, share, score, side, ratio (session,
 * EWMA hourly), held (out-of-sample cut over the last 60 sessions), shares: the currencies it shares with the target }.
 * side: 'short' = moves with the target (hold it short against a long), 'long' = moves against it.
 */
export function rankToday(panel, target, { cands = panel.syms, view = null } = {}) {
  const n = panel.sessions.length, x = hourlyOf(panel, target), rx = sessionRetOf(panel, target); if (!x) return [];
  const tC = ccysOf(target), rows = [];
  for (const c of cands) {
    if (c === target) continue;
    const y = hourlyOf(panel, c), ry = sessionRetOf(panel, c); if (!y) continue;
    const rho = corrWindow(x, y, n); if (!fin(rho) || Math.abs(rho) < CFG.minAbs) continue;
    const vals = []; for (let e = n; e >= Math.max(CFG.corrSessions, n - CFG.shareLookback); e -= CFG.shareStep) { const r = corrWindow(x, y, e); if (fin(r)) vals.push(r); }
    const share = vals.length >= 5 ? vals.filter(v => Math.sign(v) === Math.sign(rho)).length / vals.length : null;
    const ratio = betaEwma(x, y, n), held = heldUp(x, y, rx, ry, n);
    const shares = ccysOf(c).filter(k => tC.includes(k));
    rows.push({ sym: c, rho, share, score: share == null ? 0 : Math.abs(rho) * share, side: rho > 0 ? 'short' : 'long', ratio: fin(ratio) ? Math.abs(ratio) : null, held, shares, cutsView: !!view && shares.includes(view) });
  }
  return rows.sort((a, b) => b.score - a.score || Math.abs(b.rho) - Math.abs(a.rho));
}
