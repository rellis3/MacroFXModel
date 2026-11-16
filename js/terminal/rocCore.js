// js/terminal/rocCore.js: rate of change and its second derivative, pure functions for the Insight "Momentum & rate of change" board.
//
// The definitions are the ones pre-registered in forge/ROC_STALL_50D_PREREG.md (and run by scripts/roc-stall/), so what the board draws is what the test tested:
//   ROC_n(i)   = the n-session change at session i (a log change in percent for prices, a difference in the series' own units for rates);
//   percentile = mid-rank of a value among the series' OWN earlier values (expanding window, strictly before i), used once 750 earlier values exist;
//   TOP stall  = ROC_50 sat in its own top fifth 50 sessions ago AND is now within a quarter of an sd of zero (a strong run, then nowhere for 50 sessions);
//   BOTTOM stall = the mirror (a fall, then nowhere);
//   ACCEL(i)   = ROC_50(i) - ROC_50(i - 20), the change in the rate of change; "decelerating hard" = its percentile <= 0.10, "accelerating hard" >= 0.90.
// Everything at session i uses closes up to i, so a past date can be asked for (the as-of clock) without lookahead.
// This describes where a series stands in its own range. The test of what follows a stall is in the Evidence Book (roc-stall-50d-*): context, not a signal.

export const N_LOOK = 50, ACCEL_LAG = 20, MIN_HIST = 750, P_HI = 0.80, P_LO = 0.20, BAND_SD = 0.25, P_ACC = 0.10;
export const fin = v => typeof v === 'number' && Number.isFinite(v);

/** ROC_n at every index: 'ratio' = 100 x ln(c_i / c_{i-n}); 'rate' = c_i - c_{i-n}. NaN where it cannot be formed. */
export function rocArray(vals, n, kind = 'ratio') {
  const out = new Array(vals.length).fill(NaN);
  for (let i = n; i < vals.length; i++) {
    const a = vals[i], b = vals[i - n];
    if (!fin(a) || !fin(b)) continue;
    if (kind === 'rate') out[i] = a - b; else if (a > 0 && b > 0) out[i] = 100 * Math.log(a / b);
  }
  return out;
}

/** An expanding sorted history: percentile (mid-rank) and sd of the values added so far. */
class Expanding {
  constructor() { this.a = []; this.s = 0; this.s2 = 0; }
  lower(v) { const a = this.a; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; }
  upper(v) { const a = this.a; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= v) lo = m + 1; else hi = m; } return lo; }
  pct(v) { const lo = this.lower(v), up = this.upper(v); return (lo + 0.5 * (up - lo)) / this.a.length; }
  sd() { const n = this.a.length, mu = this.s / n; return Math.sqrt(Math.max(0, this.s2 / n - mu * mu)); }
  quantile(q) { return this.a[Math.min(this.a.length - 1, Math.max(0, Math.floor(q * (this.a.length - 1))))]; }
  add(v) { this.a.splice(this.lower(v), 0, v); this.s += v; this.s2 += v * v; }
}

/**
 * Walk a series once and return, per session, the ROC_50, its expanding percentile, the flat test, the stall flags and the acceleration percentile,
 * all point-in-time. `asOf` (an index) stops the walk early, which is how a past date is read without lookahead.
 */
export function walk(vals, kind = 'ratio', asOf = vals.length - 1) {
  const n = Math.min(vals.length - 1, asOf) + 1, roc50 = rocArray(vals, N_LOOK, kind).slice(0, n);
  const pct = new Array(n).fill(NaN), sd = new Array(n).fill(NaN), accel = new Array(n).fill(NaN), pacc = new Array(n).fill(NaN);
  const E = new Expanding(), A = new Expanding();
  for (let i = 0; i < n; i++) {
    if (fin(roc50[i])) { if (E.a.length >= MIN_HIST) { pct[i] = E.pct(roc50[i]); sd[i] = E.sd(); } E.add(roc50[i]); }
    if (i >= N_LOOK + ACCEL_LAG && fin(roc50[i]) && fin(roc50[i - ACCEL_LAG])) {
      accel[i] = roc50[i] - roc50[i - ACCEL_LAG];
      if (A.a.length >= MIN_HIST) pacc[i] = A.pct(accel[i]); A.add(accel[i]);
    }
  }
  const top = new Array(n).fill(false), bottom = new Array(n).fill(false), accDown = new Array(n).fill(false), accUp = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const prior = i >= N_LOOK ? pct[i - N_LOOK] : NaN, flat = fin(sd[i]) && Math.abs(roc50[i]) <= BAND_SD * sd[i];
    if (fin(prior) && flat) { if (prior >= P_HI) top[i] = true; if (prior <= P_LO) bottom[i] = true; }
    if (fin(pacc[i])) { if (pacc[i] <= P_ACC) accDown[i] = true; if (pacc[i] >= 1 - P_ACC) accUp[i] = true; }
  }
  return { n, roc50, pct, sd, accel, pacc, top, bottom, accDown, accUp, hist: E };
}

/** Runs of true in a flag array as [from, to] index pairs (for shading). */
export function runs(flags) {
  const out = []; let s = -1;
  flags.forEach((f, i) => { if (f && s < 0) s = i; if (!f && s >= 0) { out.push([s, i - 1]); s = -1; } });
  if (s >= 0) out.push([s, flags.length - 1]);
  return out;
}

/** One series' reading at an index (default: the last close). Returns null when there is not enough history. */
export function read(dates, vals, kind = 'ratio', asOf = vals.length - 1) {
  const i = Math.min(asOf, vals.length - 1);
  if (i < N_LOOK) return null;
  const w = walk(vals, kind, i), r20 = rocArray(vals, 20, kind), r100 = rocArray(vals, 100, kind);
  const pct = w.pct[i], ok = fin(pct);
  const stall = w.top[i] ? 'top' : w.bottom[i] ? 'bottom' : null;
  return {
    date: dates[i], index: i, n: i + 1, kind,
    roc20: r20[i], roc50: w.roc50[i], roc100: r100[i],
    pct50: ok ? pct : null, priorPct: i >= N_LOOK && fin(w.pct[i - N_LOOK]) ? w.pct[i - N_LOOK] : null,
    accel: fin(w.accel[i]) ? w.accel[i] : null, pacc: fin(w.pacc[i]) ? w.pacc[i] : null,
    sd50: fin(w.sd[i]) ? w.sd[i] : null, flat: fin(w.sd[i]) ? Math.abs(w.roc50[i]) <= BAND_SD * w.sd[i] : null,
    stall, accDown: !!w.accDown[i], accUp: !!w.accUp[i],
    short: !ok, histN: w.hist.a.length,
    p10: w.hist.a.length >= MIN_HIST ? w.hist.quantile(0.10) : null, p90: w.hist.a.length >= MIN_HIST ? w.hist.quantile(0.90) : null,
    last: vals[i],
  };
}

/** Rank every series the board is asked to show. `defs` = [{ key, label, group, kind, ... }]; `bundle` = { dates, series: { key: [num|null] } }. */
export function rankAll(bundle, defs, asOf = null) {
  const rows = [];
  for (const d of defs) {
    const v = bundle.series?.[d.key]; if (!Array.isArray(v)) continue;
    const dates = [], vals = [];
    bundle.dates.forEach((dt, i) => { if (fin(v[i]) && (asOf == null || dt <= asOf)) { dates.push(dt); vals.push(v[i]); } });
    const r = read(dates, vals, d.kind === 'rate' ? 'rate' : 'ratio'); if (!r) continue;
    rows.push({ def: d, ...r, from: dates[0] });
  }
  const refDate = rows.reduce((m, r) => (r.date > m ? r.date : m), '');
  return { rows, refDate, stalledLeaders: rows.filter(r => r.stall === 'top'), stalledLaggards: rows.filter(r => r.stall === 'bottom'),
    deceleratingHardest: rows.filter(r => r.accDown).sort((a, b) => a.pacc - b.pacc), acceleratingHardest: rows.filter(r => r.accUp).sort((a, b) => b.pacc - a.pacc) };
}

export const nth = p => { const n = Math.round(p * 100), t = n % 100; return `${n}${t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`; };
export const fmtChange = (v, kind, unit = '') => {
  if (!fin(v)) return 'n/a';
  const s = kind === 'rate' ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)}${unit ? ' ' + unit : ''}` : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
  return s;
};

/** What the board says about one series, in plain words, from the numbers. */
export function caption(row) {
  const nm = row.def.label, k = row.kind, u = row.def.unit ?? '';
  const mv = fmtChange(row.roc50, k, u);
  if (row.pct50 == null) return `${nm} has moved ${mv} over the last 50 sessions. This record is too short to rank that against its own history (it needs about ${MIN_HIST + N_LOOK} sessions), so read it with care.`;
  let s = `${nm} has moved ${mv} over the last 50 sessions, the ${nth(row.pct50)} percentile of its own history.`;
  if (row.stall === 'top') s += ` Fifty sessions ago the same 50-session move stood at the ${nth(row.priorPct)} percentile, and it has since gone back to about zero: a strong run that has stalled.`;
  else if (row.stall === 'bottom') s += ` Fifty sessions ago the same 50-session move stood at the ${nth(row.priorPct)} percentile, and it has since gone back to about zero: a fall that has stopped.`;
  if (row.accDown) s += ` Its rate of change has fallen hard over the last 20 sessions (${nth(row.pacc)} percentile of its own 20-session changes): it is decelerating.`;
  else if (row.accUp) s += ` Its rate of change has risen hard over the last 20 sessions (${nth(row.pacc)} percentile): it is accelerating.`;
  return s;
}

/** The Evidence Book entries this board leans on, by id, in the order shown. Missing ids are simply absent (the entry may not be banked yet). */
export const EVIDENCE_IDS = ['roc-stall-50d-top20', 'roc-stall-50d-top60', 'roc-stall-50d-topvol', 'roc-stall-50d-bottom20', 'roc-accel-down-20', 'roc-accel-down-vol'];
export const RELATED_IDS = ['live-range-features', 'vix-second-derivative'];
export function evidenceFor(book, ids = EVIDENCE_IDS) {
  const by = new Map((book ?? []).map(e => [e.id, e]));
  return ids.map(id => by.get(id)).filter(Boolean);
}
