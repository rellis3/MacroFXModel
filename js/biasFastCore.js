// The Bias Engine's fast layer: today's dollar and US 2-year move since 07:00 London, mapped onto each market through its own
// hourly sensitivity over the previous 120 sessions. Prereg: forge/BIAS_FAST_LAYER_PREREG.md. One module for the study
// (scripts/bias-fast-layer/run.mjs) and the live shadow (server.js, the hourly re-runs), so both compute the call the same way.
//
// Panel shape: { sessions: ['YYYY-MM-DD', ...] ascending, px: { KEY: [ [P07, P08, ..., P21] per session, null = missing ] } }
// where P_h = the close of the H1 bar that closes at h:00 London.

export const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
export const NH = HOURS.length;
export const SLOTS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
/** USD-up sign of each dollar leg. */
export const DOLLAR_LEGS = { EURUSD: -1, GBPUSD: -1, AUDUSD: -1, USDJPY: 1, USDCAD: 1, USDCHF: 1 };
/** The US 2-year Treasury CFD: a falling price = a rising yield = more tightening priced. */
export const RATES = { key: 'US02Y', sign: -1 };
export const TARGETS = ['GOLD', 'NQ', 'SPX500', 'US30', 'DE30', 'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF'];
export const CFG = { lookback: 120, minSessions: 60, callZ: 0.5, horizon: 3 };

const fin = Number.isFinite;
const lr = (a, b) => (a > 0 && b > 0 ? Math.log(b / a) : null);
const legsFor = target => Object.keys(DOLLAR_LEGS).filter(k => k !== target);

/** Log change of one instrument between two hour indexes of a session (null if either end is missing). */
export function chg(panel, key, si, i0, i1) {
  const r = panel.px[key]?.[si]; if (!r) return null;
  return lr(r[i0], r[i1]);
}
/** Dollar move (USD up = +) between two hour indexes, mean of the legs; every leg needed. The target's own leg is left out. */
export function dollar(panel, si, i0, i1, target) {
  let s = 0, n = 0;
  for (const k of legsFor(target)) { const c = chg(panel, k, si, i0, i1); if (c == null) return null; s += DOLLAR_LEGS[k] * c; n++; }
  return n ? s / n : null;
}
/** US 2-year move (yield up = +) between two hour indexes. */
export function rates(panel, si, i0, i1) {
  const c = chg(panel, RATES.key, si, i0, i1);
  return c == null ? null : RATES.sign * c;
}

/** Sensitivity of `target` to the hourly dollar and 2-year moves over the `lookback` sessions before `si` (OLS, no intercept). */
export function fitBeta(panel, si, target, { lookback = CFG.lookback, minSessions = CFG.minSessions } = {}) {
  let sxx = 0, sxy = 0, syy = 0, sxr = 0, syr = 0, srr = 0, n = 0, used = 0;
  for (let j = Math.max(0, si - lookback); j < si; j++) {
    let any = false;
    for (let h = 0; h < NH - 1; h++) {
      const r = chg(panel, target, j, h, h + 1); if (r == null) continue;
      const u = dollar(panel, j, h, h + 1, target); if (u == null) continue;
      const y = rates(panel, j, h, h + 1); if (y == null) continue;
      sxx += u * u; sxy += u * y; syy += y * y; sxr += u * r; syr += y * r; srr += r * r; n++; any = true;
    }
    if (any) used++;
  }
  if (used < minSessions || n < 10) return { ok: false, sessions: used, why: `${used} usable sessions (needs ${minSessions})` };
  const det = sxx * syy - sxy * sxy;
  if (!(Math.abs(det) > 1e-30)) return { ok: false, sessions: used, why: 'singular' };
  const bU = (syy * sxr - sxy * syr) / det, bY = (sxx * syr - sxy * sxr) / det;
  return { ok: true, bU, bY, sigma: Math.sqrt(srr / n), sessions: used, n };
}

/** The fast call for `target` at London hour `slot` of session `si`, given its fit. */
export function callAt(panel, si, target, slot, fit, { callZ = CFG.callZ } = {}) {
  const i = HOURS.indexOf(slot); if (i < 1 || !fit?.ok) return null;
  const U = dollar(panel, si, 0, i, target), Y = rates(panel, si, 0, i), own = chg(panel, target, si, 0, i);
  if (U == null || Y == null) return null;
  const scale = fit.sigma * Math.sqrt(i), I = fit.bU * U + fit.bY * Y, z = I / scale;
  const ownZ = own == null ? null : own / scale;
  return {
    slot, U, Y, I, z, dir: Math.abs(z) >= callZ ? Math.sign(I) : 0,
    partU: fit.bU * U / scale, partY: fit.bY * Y / scale,
    own, ownZ, momDir: ownZ != null && Math.abs(ownZ) >= callZ ? Math.sign(own) : 0,
  };
}

/** Forward move from `slot` to `slot + h` (or to the `to` hour) in units of a typical move over that span. */
export function forward(panel, si, target, slot, fit, { h = CFG.horizon, to = null } = {}) {
  const i0 = HOURS.indexOf(slot), i1 = to != null ? HOURS.indexOf(to) : i0 + h;
  if (i0 < 0 || i1 <= i0 || i1 >= NH || !fit?.ok) return null;
  const c = chg(panel, target, si, i0, i1);
  return c == null ? null : c / (fit.sigma * Math.sqrt(i1 - i0));
}

/** Plain words for one call (the live view). */
export function callWords(c, target) {
  if (!c) return '';
  const pct = x => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(2)}%`, bp = x => `${x >= 0 ? '+' : '−'}${Math.abs(x * 1e4).toFixed(0)}bp of price`;
  return `since 07:00: dollar ${pct(c.U)}, US 2y price ${bp(-c.Y)}; implies ${target} ${c.z >= 0 ? '+' : '−'}${Math.abs(c.z).toFixed(2)}σ (dollar ${c.partU >= 0 ? '+' : '−'}${Math.abs(c.partU).toFixed(2)}, 2y ${c.partY >= 0 ? '+' : '−'}${Math.abs(c.partY).toFixed(2)}); ${target} itself ${c.ownZ == null ? 'n/a' : `${c.ownZ >= 0 ? '+' : '−'}${Math.abs(c.ownZ).toFixed(2)}σ`}`;
}

/** Live: every target's fit (on sessions before the last) and its call at `slot` on the last session of the panel. */
export function liveCalls(panel, slot, { targets = TARGETS } = {}) {
  const si = panel.sessions.length - 1, out = {};
  for (const t of targets) {
    if (!panel.px[t]) { out[t] = { ok: false, why: 'no prices' }; continue; }
    const fit = fitBeta(panel, si, t);
    if (!fit.ok) { out[t] = { ok: false, why: fit.why }; continue; }
    const c = callAt(panel, si, t, slot, fit);
    out[t] = c ? { ok: true, ...c, bU: fit.bU, bY: fit.bY, sigma: fit.sigma, lagging: c.dir !== 0 && c.momDir !== 0 && c.dir !== c.momDir } : { ok: false, why: 'missing prices since 07:00' };
  }
  return { date: panel.sessions[si], slot, calls: out };
}

// ── live ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** OANDA instrument for each panel key (the local H1 history came from the same instruments). */
export const OANDA = { GOLD: 'XAU_USD', NQ: 'NAS100_USD', SPX500: 'SPX500_USD', US30: 'US30_USD', DE30: 'DE30_EUR', EURUSD: 'EUR_USD', GBPUSD: 'GBP_USD',
  AUDUSD: 'AUD_USD', NZDUSD: 'NZD_USD', USDJPY: 'USD_JPY', USDCAD: 'USD_CAD', USDCHF: 'USD_CHF', US02Y: 'USB02Y_USD' };
/** The markets where the lag flag was tested (bias-fast-lag; reopened by the 2026-11-28 code audit, unconfirmed): the dollar pairs. Gold and indices get no flag. */
export const LAG_FLAG = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF']);
const _bst = {}, lastSun = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay(), 1) / 1000; };
const offset = t => { const y = new Date(t * 1000).getUTCFullYear(), [a, b] = (_bst[y] ??= [lastSun(y, 2), lastSun(y, 9)]); return t >= a && t < b ? 3600 : 0; };

/** OANDA H1 candles per key ({t: 'YYYY-MM-DDTHH:MM' start, c}) -> panel; only bars closed by nowSec; weekdays; today's partial session kept. */
export function panelFromH1(barsByKey, nowSec = Date.now() / 1000) {
  const rows = {}, dates = new Set();
  for (const [k, bars] of Object.entries(barsByKey)) {
    const m = new Map();
    for (const c of bars ?? []) {
      const t0 = typeof c.t === 'number' ? c.t / 1000 : Date.parse(String(c.t).length <= 16 ? c.t + ':00Z' : c.t) / 1000;
      const close = +c.c, end = t0 + 3600; if (!fin(t0) || !(close > 0) || end > nowSec) continue;
      const tl = end + offset(end), date = new Date(tl * 1000).toISOString().slice(0, 10), min = Math.floor((tl % 86400) / 60);
      if (min % 60) continue; const j = HOURS.indexOf(min / 60); if (j < 0) continue;
      const wd = new Date(date + 'T12:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue;
      let r = m.get(date); if (!r) { r = new Array(NH).fill(null); m.set(date, r); } r[j] = close; dates.add(date);
    }
    rows[k] = m;
  }
  const sessions = [...dates].sort(), px = {};
  for (const [k, m] of Object.entries(rows)) px[k] = sessions.map(d => m.get(d) ?? null);
  return { sessions, px };
}
