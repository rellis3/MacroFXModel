/**
 * CBOE INTRADAY LOG — the same free delayed chain the end-of-day archive reads, kept every 15 minutes
 * through the US session, cut down to the contracts near price so a day stays small.
 *
 * Why: the nightly archive (cboe_raw/) holds one chain per day, so what traded between snapshots is gone.
 * Cboe's `volume` is cumulative for the day and bid/ask/IV/gamma are live, so two snapshots give, per strike,
 * the volume traded in between and how the quoted gamma and IV moved. This module only shapes and diffs rows;
 * the I/O (fetch, R2) lives in server.js. Analysis and display only: no bot reads it.
 *
 * A snapshot keeps contracts within ±windowFrac of spot and expiring within maxDays calendar days. Rows are
 * columns [option, bid, ask, volume, open_interest, iv, gamma] where `option` is Cboe's OCC id
 * (ROOT YYMMDD C/P strike*1000, 8 digits). open_interest is the start-of-day figure and never changes in a day.
 */

export const INTRADAY_FIELDS = ['option', 'bid', 'ask', 'volume', 'open_interest', 'iv', 'gamma'];
export const INTRADAY_SYMS = ['_SPX', '_NDX', 'SPY', 'QQQ'];
const DAY_MS = 864e5;
const OCC = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

/** Cboe's "2026-10-30 17:12:52" (UTC) -> ms, or NaN. */
export function cboeTsMs(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}

/** Parse an OCC option id. Returns { root, exp:'YYYY-MM-DD', expMs, cp, K } or null. */
export function parseOcc(id) {
  const m = String(id || '').match(OCC);
  if (!m) return null;
  const y = 2000 + +m[2], mo = +m[3], da = +m[4];
  return { root: m[1], exp: `${y}-${m[3]}-${m[4]}`, expMs: Date.UTC(y, mo - 1, da), cp: m[5], K: +m[6] / 1000 };
}

/**
 * Raw Cboe JSON -> { tMs, t, day, hhmmss, spot, rows } or null.
 * `day` and `hhmmss` come from Cboe's own timestamp (UTC), so a repeat fetch of an unchanged chain keys to the
 * same object and is skipped by the caller rather than stored twice.
 */
export function slimSnapshot(json, { windowFrac = 0.08, maxDays = 45 } = {}) {
  const d = json && json.data;
  if (!d || !Array.isArray(d.options)) return null;
  const spot = +d.current_price, tMs = cboeTsMs(json.timestamp);
  if (!(spot > 0) || !Number.isFinite(tMs)) return null;
  const lo = spot * (1 - windowFrac), hi = spot * (1 + windowFrac), maxMs = tMs + maxDays * DAY_MS;
  const rows = [];
  for (const o of d.options) {
    const p = parseOcc(o.option);
    if (!p || p.K < lo || p.K > hi || p.expMs > maxMs || p.expMs + DAY_MS <= tMs) continue;
    const vol = +o.volume || 0, oi = +o.open_interest || 0;
    if (vol <= 0 && oi <= 0) continue;
    rows.push([o.option, +o.bid || 0, +o.ask || 0, vol, oi, +o.iv || 0, +o.gamma || 0]);
  }
  if (!rows.length) return null;
  const iso = new Date(tMs).toISOString();
  return { tMs, t: iso, day: iso.slice(0, 10), hhmmss: iso.slice(11, 19).replace(/:/g, ''), spot, rows };
}

/**
 * What traded between two snapshots of one day, per strike: { K, cp, dVol, mid, dIv, gamma } for every contract whose
 * cumulative volume rose. Contracts only in `b` count from zero. Mid is the later quote mid. Sorted by dVol desc.
 * A drop in volume (a new Cboe day or a bad print) is ignored, never turned into negative flow.
 */
export function volumeBetween(a, b) {
  const before = new Map(a.rows.map(r => [r[0], r]));
  const out = [];
  for (const r of b.rows) {
    const prev = before.get(r[0]);
    const dVol = r[3] - (prev ? prev[3] : 0);
    if (!(dVol > 0)) continue;
    const p = parseOcc(r[0]);
    if (!p) continue;
    out.push({ option: r[0], K: p.K, cp: p.cp, exp: p.exp, dVol, mid: (r[1] + r[2]) / 2, dIv: prev ? r[5] - prev[5] : 0, gamma: r[6] });
  }
  return out.sort((x, y) => y.dVol - x.dVol);
}

/**
 * Gamma-weighted volume by strike for a list from volumeBetween: calls and puts separately, in contracts and in
 * dollar gamma (dVol x gamma x spot^2 x 0.01 x 100). This is "where the new trading sits", not who is long.
 */
export function flowByStrike(list, spot) {
  const m = new Map();
  for (const x of list) {
    const e = m.get(x.K) || { K: x.K, callVol: 0, putVol: 0, callGex: 0, putGex: 0 };
    const g = x.dVol * x.gamma * spot * spot * 0.01 * 100;
    if (x.cp === 'C') { e.callVol += x.dVol; e.callGex += g; } else { e.putVol += x.dVol; e.putGex += g; }
    m.set(x.K, e);
  }
  return [...m.values()].sort((a, b) => a.K - b.K);
}
