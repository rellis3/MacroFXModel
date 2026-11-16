// scripts/roc-stall/lib.mjs: features, flags, outcomes, pooled effect, block bootstrap and shift placebo for roc-stall-50d.
// Everything at session i uses closes <= i; outcome windows start at the close of i. Definitions are fixed in forge/ROC_STALL_50D_PREREG.md.
import fs from 'node:fs';

export const START = '2000-01-03', END = '2026-08-21';           // the study window; END is the lockbox edge
export const DISC_END = '2012-12-31', HOLD_START = '2013-01-01', HALF_SPLIT = '2020-01-01';
export const MIN_HIST = 750;                                      // sessions of ROC history before any percentile is used
export const H = [5, 10, 20, 60];
export const DECLUSTER = 20, NEIGH = 20;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function loadDaily(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')), out = {};
  for (const [k, rows] of Object.entries(raw)) out[k] = rows.filter(r => r[0] <= END);   // nothing after the lockbox edge is read
  return out;
}

/** expanding history: mid-rank percentile of v among values strictly before the current session, and their sd */
class Expanding {
  constructor() { this.a = []; this.s = 0; this.s2 = 0; }
  lower(v) { const a = this.a; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; }
  upper(v) { const a = this.a; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= v) lo = m + 1; else hi = m; } return lo; }
  pct(v) { const lo = this.lower(v), up = this.upper(v); return (lo + 0.5 * (up - lo)) / this.a.length; }
  sd() { const n = this.a.length, mu = this.s / n; return Math.sqrt(Math.max(0, this.s2 / n - mu * mu)); }
  add(v) { this.a.splice(this.lower(v), 0, v); this.s += v; this.s2 += v * v; }
}

export function features(rows, opts = {}) {
  const NL = opts.n ?? 50, PHI = opts.pHi ?? 0.80, PLO = opts.pLo ?? 0.20, BAND = opts.band ?? 0.25;
  const N = rows.length, date = rows.map(r => r[0]), c = rows.map(r => r[1]);
  const lr = new Float64Array(N).fill(NaN);
  for (let i = 1; i < N; i++) lr[i] = Math.log(c[i] / c[i - 1]);
  const roc = n => { const r = new Float64Array(N).fill(NaN); for (let i = n; i < N; i++) r[i] = Math.log(c[i] / c[i - n]); return r; };
  const roc20 = roc(20), roc50 = roc(NL), roc100 = roc(100);
  const accel = new Float64Array(N).fill(NaN);
  for (let i = NL + 20; i < N; i++) accel[i] = roc50[i] - roc50[i - 20];
  const pct50 = new Float64Array(N).fill(NaN), sd50 = new Float64Array(N).fill(NaN), pacc = new Float64Array(N).fill(NaN);
  const E = new Expanding(), A = new Expanding();
  for (let i = 0; i < N; i++) {
    if (Number.isFinite(roc50[i])) { if (E.a.length >= MIN_HIST) { pct50[i] = E.pct(roc50[i]); sd50[i] = E.sd(); } E.add(roc50[i]); }
    if (Number.isFinite(accel[i])) { if (A.a.length >= MIN_HIST) pacc[i] = A.pct(accel[i]); A.add(accel[i]); }
  }
  const sig250 = new Float64Array(N).fill(NaN);
  for (let i = 250; i < N; i++) {
    let s = 0, s2 = 0;
    for (let j = i - 249; j <= i; j++) { s += lr[j]; s2 += lr[j] * lr[j]; }
    const mu = s / 250; sig250[i] = Math.sqrt(Math.max(0, s2 / 250 - mu * mu));
  }
  // flags (data <= i only; the prior percentile is the one known 50 sessions earlier)
  const flags = { TOP: new Uint8Array(N), BOT: new Uint8Array(N), ACC_DN: new Uint8Array(N), ACC_UP: new Uint8Array(N) };
  for (let i = 0; i < N; i++) {
    if (date[i] < START) continue;
    const pp = i >= NL ? pct50[i - NL] : NaN, flat = Number.isFinite(sd50[i]) && Math.abs(roc50[i]) <= BAND * sd50[i];
    if (Number.isFinite(pp) && flat) { if (pp >= PHI) flags.TOP[i] = 1; if (pp <= PLO) flags.BOT[i] = 1; }
    if (Number.isFinite(pacc[i])) { if (pacc[i] <= 0.10) flags.ACC_DN[i] = 1; if (pacc[i] >= 0.90) flags.ACC_UP[i] = 1; }
  }
  // outcomes: Z_h = h-session log return in units of trailing-250 daily sd x sqrt(h); LV_h = ln(realised sd next h / realised sd last 60)
  const cs = new Float64Array(N + 1), cs2 = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) { const v = Number.isFinite(lr[i]) ? lr[i] : 0; cs[i + 1] = cs[i] + v; cs2[i + 1] = cs2[i] + v * v; }
  const sdw = (a, b) => { const n = b - a + 1, s = cs[b + 1] - cs[a], s2 = cs2[b + 1] - cs2[a], mu = s / n; return Math.sqrt(Math.max(0, s2 / n - mu * mu)); };
  const Z = {}, LV = {};
  for (const h of H) {
    const z = new Float64Array(N).fill(NaN), lv = new Float64Array(N).fill(NaN);
    for (let i = 0; i + h < N; i++) {
      if (Number.isFinite(sig250[i]) && sig250[i] > 0) z[i] = Math.log(c[i + h] / c[i]) / (sig250[i] * Math.sqrt(h));
      if (h >= 10 && i >= 60) { const a = sdw(i + 1, i + h), b = sdw(i - 59, i); if (a > 0 && b > 0) lv[i] = Math.log(a / b); }
    }
    Z[h] = z; LV[h] = lv;
  }
  const mon = new Int32Array(N); for (let i = 0; i < N; i++) mon[i] = monthIdx(date[i]);
  return { N, date, c, roc20, roc50, roc100, accel, pct50, pacc, sd50, sig250, flags, Z, LV, mon };
}

export const monthIdx = d => (+d.slice(0, 4)) * 12 + (+d.slice(5, 7)) - 1;

/** de-clustered event indices (greedy, DECLUSTER apart) and the control exclusion mask for one series and flag type; shift = placebo rotation */
export function eventsAndControl(F, flag, shift = 0) {
  const N = F.N, raw = new Uint8Array(N), f = F.flags[flag];
  if (shift === 0) raw.set(f); else for (let i = 0; i < N; i++) if (f[i]) raw[(i + shift) % N] = 1;
  const ev = []; let last = -1e9;
  for (let i = 0; i < N; i++) if (raw[i] && F.date[i] >= START && i - last >= DECLUSTER) { ev.push(i); last = i; }
  // control = every session that is not within NEIGH sessions AFTER a flag. The exclusion looks backwards only: a two-sided exclusion
  // keeps controls that have no flag in their own future, which selects on the future (found on the synthetic null before registering).
  const near = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (raw[i]) for (let j = i; j <= Math.min(N - 1, i + NEIGH); j++) near[j] = 1;
  return { ev, near };
}

/** per-month sums of the outcome over events and over controls for one series */
export function sums(F, flag, outcome, h, shift = 0) {
  const { ev, near } = eventsAndControl(F, flag, shift), out = outcome === 'Z' ? F.Z[h] : F.LV[h], rec = new Map();
  const get = m => { let r = rec.get(m); if (!r) { r = { es: 0, en: 0, cs: 0, cn: 0 }; rec.set(m, r); } return r; };
  const isEv = new Uint8Array(F.N); for (const i of ev) isEv[i] = 1;
  for (let i = 0; i < F.N; i++) {
    if (F.date[i] < START || !Number.isFinite(out[i])) continue;
    if (isEv[i]) { const r = get(F.mon[i]); r.es += out[i]; r.en++; }
    else if (!near[i]) { const r = get(F.mon[i]); r.cs += out[i]; r.cn++; }
  }
  return rec;
}

/** pooled effect = sum_s n_s (meanEvent_s - meanControl_s) / sum_s n_s over the chosen months (optionally with block-bootstrap multiplicities) */
export function pooled(perSeries, monthFilter, weight = null) {
  let num = 0, den = 0;
  for (const rec of perSeries) {
    let es = 0, en = 0, cs = 0, cn = 0;
    for (const [m, r] of rec) {
      if (!monthFilter(m)) continue;
      const w = weight ? (weight.get(m) ?? 0) : 1; if (!w) continue;
      es += w * r.es; en += w * r.en; cs += w * r.cs; cn += w * r.cn;
    }
    if (en > 0 && cn > 0) { num += en * (es / en - cs / cn); den += en; }
  }
  return den > 0 ? num / den : NaN;
}
export function eventCount(perSeries, monthFilter) {
  let n = 0;
  for (const rec of perSeries) for (const [m, r] of rec) if (monthFilter(m)) n += r.en;
  return n;
}

const ymOf = m => Math.floor(m / 12) + '-' + String(m % 12 + 1).padStart(2, '0');
export const monthFilter = (p, hf = 'all') => m => {
  const d = ymOf(m);
  const inP = p === 'all' ? true : p === 'disc' ? d <= DISC_END.slice(0, 7) : d >= HOLD_START.slice(0, 7);
  if (!inP) return false;
  if (hf === 'all') return true;
  return hf === 'h1' ? m < 2020 * 12 : m >= 2020 * 12;
};

/** date-clustered block bootstrap (fixed blocks of k months, resampled with replacement) of the pooled effect over a month filter */
export function bootstrap(perSeries, filter, k, B, seed) {
  const months = new Set();
  for (const rec of perSeries) for (const m of rec.keys()) if (filter(m)) months.add(m);
  const blocks = new Map();
  for (const m of [...months].sort((a, b) => a - b)) { const b = Math.floor(m / k); (blocks.get(b) ?? blocks.set(b, []).get(b)).push(m); }
  const bl = [...blocks.values()], R = rng(seed), effs = [];
  for (let b = 0; b < B; b++) {
    const w = new Map();
    for (let t = 0; t < bl.length; t++) { const pick = bl[Math.floor(R() * bl.length)]; for (const m of pick) w.set(m, (w.get(m) ?? 0) + 1); }
    const e = pooled(perSeries, () => true, w); if (Number.isFinite(e)) effs.push(e);
  }
  effs.sort((a, b) => a - b);
  const q = p => effs[Math.min(effs.length - 1, Math.max(0, Math.floor(p * effs.length)))];
  const mean = effs.reduce((a, b) => a + b, 0) / effs.length;
  const sd = Math.sqrt(effs.reduce((a, b) => a + (b - mean) ** 2, 0) / (effs.length - 1));
  return { lo: q(0.025), hi: q(0.975), sd, B: effs.length };
}

export const normCdf = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
export const pTwoSided = (est, sd) => sd > 0 ? 2 * (1 - normCdf(Math.abs(est / sd))) : 1;
export function holm(p, alpha = 0.05) {
  const idx = p.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), out = new Array(p.length).fill(false);
  for (let r = 0; r < idx.length; r++) { if (idx[r][0] <= alpha / (idx.length - r)) out[idx[r][1]] = true; else break; }
  return out;
}

/** the six scored cells (fixed in the prereg) */
export const CELLS = [
  { id: 'C1', flag: 'TOP', outcome: 'Z', h: 20, expect: -1, bar: 0.15, k: 1, label: 'top stall -> 20-session return (z)' },
  { id: 'C2', flag: 'TOP', outcome: 'Z', h: 60, expect: -1, bar: 0.15, k: 3, label: 'top stall -> 60-session return (z)' },
  { id: 'C3', flag: 'TOP', outcome: 'LV', h: 20, expect: +1, bar: 0.10, k: 1, label: 'top stall -> next-20 realised vol vs trailing-60 (log ratio)' },
  { id: 'C4', flag: 'BOT', outcome: 'Z', h: 20, expect: +1, bar: 0.15, k: 1, label: 'bottom stall (mirror) -> 20-session return (z)' },
  { id: 'C5', flag: 'ACC_DN', outcome: 'Z', h: 20, expect: -1, bar: 0.15, k: 1, label: 'ROC_50 accel bottom decile -> 20-session return (z)' },
  { id: 'C6', flag: 'ACC_DN', outcome: 'LV', h: 20, expect: +1, bar: 0.10, k: 1, label: 'ROC_50 accel bottom decile -> next-20 realised vol (log ratio)' },
];
