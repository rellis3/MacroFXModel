// bandFade/bandFade.js — "price at a band → back to fair value", tested as a DAILY,
// diversified, vol-targeted book. Pure: no I/O. Pre-registration:
// MD files/BAND_FADE_DAILY.md (read §0 first — the intraday versions of this
// idea are already null on cost; this is the daily test that was never run).
//
// Pipeline (every piece is a function so the tests can drive it on synthetic data):
//   dailyBarsFromPacked  M1 → UTC-day OHLC (barUtils.resamplePacked), weekend
//                        buckets folded into the next weekday
//   bandFeatures         EMA20 fair value, ex-ante EWMA σ, three stretches:
//                          z  = (C − EMA20) / (σ·C·κ)   primary (vol band)
//                          kz = (C − EMA20) / ATR20      Keltner
//                          bz = (C − SMA20) / sd20       Bollinger
//                        κ = the stationary sd of a random walk's distance from
//                        its own EMA, so |z| = 2 means "a 2-sd stretch for a
//                        random walk" on every instrument and in every regime.
//   bucketTest           stage 1: does the stretch predict the next h days, in σ
//                        units, per-date pooled (correlated pairs ≠ independent)
//   shuffledNull         stage 1's null: the identical procedure on shuffled returns
//   fadeSchedule         stage 2's one fixed rule → trades
//   runSizedBook         any trade schedule → vol-targeted daily book, costs, P&L,
//                        per-trade attribution (the real rule and the random
//                        control both go through here)
//
// No lookahead: every feature at index t uses bars ≤ t; a book decided at close
// t earns the return t → t+1 (truncation-tested in bandFade.test.mjs).

import { resamplePacked } from '../barUtils.js';
import { ema, atrWilder, adxWilder } from '../indicatorCore.js';
import { ewma, rollingZScore, mulberry32 } from '../statsCore.js';
import { pairToCurrency, CCYS } from '../mve/bookFactor.js';

export const BAND_FADE_DEFAULTS = {
  emaSpan: 20, ewmaLambda: 0.94, atrN: 20, bollN: 20, adxN: 14, adxThreshold: 25,
  band: 2,                 // "outside the band" for every stretch definition
  warmup: 60,              // bars per instrument before any feature is used
  horizons: [1, 5, 10], primaryH: 5,
  buckets: [0, 1, 1.5, 2, 2.5, 3, Infinity],
  entryZ: 2, rearmZ: 1.5, maxHold: 10,
  targetVol: 0.10, maxGross: 5, covWindow: 60,
  splitFrac: 0.6, nullDraws: 200, controlDraws: 100, seed: 0x5eed,
};

export const kappa = span => { const k = 2 / (span + 1); return Math.sqrt((1 - k) / (k * (2 - k))); };
const isoDay = t => new Date(t * 1000).toISOString().slice(0, 10);

// ── daily bars ──────────────────────────────────────────────────────────────
// UTC-day buckets; a Saturday/Sunday bucket (the ~2h Sunday open) is merged into
// the next weekday bar (its open becomes that bar's open), never a bar of its own.
export function foldWeekends(dayBars) {
  const out = [];
  let pend = null;
  for (const b of dayBars) {
    const dow = new Date(b.time * 1000).getUTCDay();
    if (dow === 0 || dow === 6) {
      pend = pend ? { ...pend, high: Math.max(pend.high, b.high), low: Math.min(pend.low, b.low), close: b.close } : { ...b };
      continue;
    }
    const bar = { date: isoDay(b.time), open: b.open, high: b.high, low: b.low, close: b.close };
    if (pend) { bar.open = pend.open; bar.high = Math.max(bar.high, pend.high); bar.low = Math.min(bar.low, pend.low); pend = null; }
    out.push(bar);
  }
  return out;
}

export function dailyBarsFromPacked(packed) {
  return foldWeekends(resamplePacked(packed, 1440).filter(b => Number.isFinite(b.close) && b.close > 0));
}

// ── features ────────────────────────────────────────────────────────────────
// bars = [{date, open, high, low, close}]. Arrays aligned to bars; NaN in warm-up.
export function bandFeatures(bars, o = BAND_FADE_DEFAULTS) {
  const n = bars.length;
  const close = bars.map(b => b.close);
  const lr = new Array(n).fill(0);
  for (let t = 1; t < n; t++) lr[t] = Math.log(close[t] / close[t - 1]);
  const fair = ema(close, o.emaSpan);
  // EWMA variance of r², seeded at the first return (the warm-up absorbs the seed)
  const v = n > 1 ? ewma(lr.slice(1).map(r => r * r), o.ewmaLambda) : [];
  const sigma = new Array(n).fill(NaN);
  for (let t = 1; t < n; t++) sigma[t] = Math.sqrt(v[t - 1]);
  const kap = kappa(o.emaSpan);
  const atr = atrWilder(bars, o.atrN);
  const bz = rollingZScore(close, o.bollN);
  const adx = adxWilder(bars, o.adxN);
  const z = new Array(n).fill(NaN), kz = new Array(n).fill(NaN), bzz = new Array(n).fill(NaN), adxOut = new Array(n).fill(NaN);
  for (let t = o.warmup; t < n; t++) {
    const dev = close[t] - fair[t];
    if (sigma[t] > 0) z[t] = dev / (sigma[t] * close[t] * kap);
    if (atr[t] > 0) kz[t] = dev / atr[t];
    bzz[t] = bz[t];
    adxOut[t] = adx[t] > 0 ? adx[t] : NaN;
  }
  return { dates: bars.map(b => b.date), close, high: bars.map(b => b.high), low: bars.map(b => b.low), lr, fair, sigma, z, kz, bz: bzz, adx: adxOut };
}

// ── stage 1: the bucket test ────────────────────────────────────────────────
const meanOf = a => a.reduce((s, x) => s + x, 0) / a.length;
function tStat(xs) {
  const n = xs.length;
  if (n < 3) return { n, mean: n ? meanOf(xs) : null, t: null };
  const m = meanOf(xs);
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
  return { n, mean: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : null };
}

// The union calendar every instrument samples on (same dates for all → the
// per-date pooling below is well defined).
export function unionCalendar(insts) {
  return [...new Set(insts.flatMap(x => x.f.dates))].sort();
}

// One observation per (instrument, sampled date): fade return in σ units.
//   select(inst, t) → { key, stretch, side } | null — which bucket/cell it lands in
// Sampled every h-th calendar date so h-day forward windows don't overlap.
export function collectObs(insts, { h, cal, select, sampleOffset = 0 }) {
  const calIdx = new Map(cal.map((d, i) => [d, i]));
  const obs = [];
  for (const inst of insts) {
    const f = inst.f;
    for (let t = 0; t + h < f.dates.length; t++) {
      const ci = calIdx.get(f.dates[t]);
      if ((ci - sampleOffset) % h !== 0) continue;
      const sel = select(inst, t);
      if (!sel) continue;
      const sig = f.sigma[t];
      if (!(sig > 0)) continue;
      const fwd = Math.log(f.close[t + h] / f.close[t]);
      obs.push({
        date: f.dates[t], inst: inst.key, key: sel.key,
        fade: -sel.side * fwd / (sig * Math.sqrt(h)),
        costSig: (inst.costRtPct / 100) / (sig * Math.sqrt(h)),
      });
    }
  }
  return obs;
}

// Pool: average across instruments per date, then t over dates.
export function poolCell(obs, splitDate) {
  if (!obs.length) return { n: 0, nDates: 0, mean: null, t: null, isMean: null, oosMean: null, costHurdle: null };
  const byDate = new Map();
  for (const o of obs) { if (!byDate.has(o.date)) byDate.set(o.date, []); byDate.get(o.date).push(o.fade); }
  const dates = [...byDate.keys()].sort();
  const per = dates.map(d => meanOf(byDate.get(d)));
  const st = tStat(per);
  const isV = per.filter((_, i) => dates[i] < splitDate), oosV = per.filter((_, i) => dates[i] >= splitDate);
  const isS = tStat(isV), oosS = tStat(oosV);
  return {
    n: obs.length, nDates: dates.length,
    mean: +st.mean.toFixed(4), t: st.t != null ? +st.t.toFixed(2) : null,
    isMean: isS.mean != null ? +isS.mean.toFixed(4) : null, isT: isS.t != null ? +isS.t.toFixed(2) : null,
    oosMean: oosS.mean != null ? +oosS.mean.toFixed(4) : null, oosT: oosS.t != null ? +oosS.t.toFixed(2) : null,
    costHurdle: +meanOf(obs.map(o => o.costSig)).toFixed(4),
  };
}

const bucketLabel = (lo, hi) => (hi === Infinity ? `≥${lo}` : `${lo}–${hi}`);
const signOf = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

// Buckets of |stretch| for one stretch key ('z' | 'kz' | 'bz').
export function bucketTest(insts, { h, cal, splitDate, stretchKey = 'z', buckets = BAND_FADE_DEFAULTS.buckets }) {
  const select = (inst, t) => {
    const s = inst.f[stretchKey][t];
    if (!Number.isFinite(s)) return null;
    const a = Math.abs(s);
    for (let b = 0; b < buckets.length - 1; b++) if (a >= buckets[b] && a < buckets[b + 1]) return { key: bucketLabel(buckets[b], buckets[b + 1]), side: signOf(s) };
    return null;
  };
  const obs = collectObs(insts, { h, cal, select });
  const out = [];
  for (let b = 0; b < buckets.length - 1; b++) {
    const key = bucketLabel(buckets[b], buckets[b + 1]);
    out.push({ bucket: key, ...poolCell(obs.filter(o => o.key === key), splitDate) });
  }
  return out;
}

// The primary cell: |stretch| ≥ band, one pooled number.
export function outsideCell(insts, { h, cal, splitDate, stretchKey = 'z', band = 2, filter = null }) {
  const select = (inst, t) => {
    const s = inst.f[stretchKey][t];
    if (!Number.isFinite(s) || Math.abs(s) < band) return null;
    if (filter && !filter(inst, t)) return null;
    return { key: 'out', side: signOf(s) };
  };
  return poolCell(collectObs(insts, { h, cal, select }), splitDate);
}

// Stacked bands: how many of {vol, Keltner, Bollinger} closed outside on the
// side of the EMA the price is on (0–3). Tests the "stacked bands = stronger" claim.
export function stackTest(insts, { h, cal, splitDate, band = 2 }) {
  const select = (inst, t) => {
    const f = inst.f;
    const side = signOf(f.close[t] - f.fair[t]);
    if (!side || ![f.z[t], f.kz[t], f.bz[t]].every(Number.isFinite)) return null;
    const count = [f.z[t], f.kz[t], f.bz[t]].filter(s => s * side >= band).length;
    return { key: String(count), side };
  };
  const obs = collectObs(insts, { h, cal, select });
  return ['0', '1', '2', '3'].map(k => ({ stack: +k, ...poolCell(obs.filter(o => o.key === k), splitDate) }));
}

// ── stage 1 null: shuffled returns through the identical procedure ──────────
// Each instrument's daily log returns are permuted (iid) and the close rebuilt
// from its first price; OHLC is irrelevant to the primary stretch. Any real
// autocorrelation is destroyed, so the t of the primary cell on these draws is
// what the procedure produces with no reversion at all.
export function shuffleCloses(close, rng) {
  const r = [];
  for (let t = 1; t < close.length; t++) r.push(Math.log(close[t] / close[t - 1]));
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  const out = [close[0]];
  for (let t = 0; t < r.length; t++) out.push(out[t] * Math.exp(r[t]));
  return out;
}

export function shuffledNull(insts, { h, cal, splitDate, band = 2, draws = 200, seed = 0x5eed, o = BAND_FADE_DEFAULTS }) {
  const rng = mulberry32(seed);
  const ts = [];
  for (let d = 0; d < draws; d++) {
    const sh = insts.map(inst => {
      const c = shuffleCloses(inst.f.close, rng);
      const bars = inst.f.dates.map((date, t) => ({ date, open: c[t], high: c[t], low: c[t], close: c[t] }));
      return { ...inst, f: bandFeatures(bars, o) };
    });
    const cell = outsideCell(sh, { h, cal, splitDate, band });
    ts.push(cell.t ?? 0);
  }
  ts.sort((a, b) => a - b);
  const q = p => ts[Math.min(ts.length - 1, Math.floor(p * ts.length))];
  return { draws, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +ts[ts.length - 1].toFixed(2) };
}

// Pre-registered stage-1 reading (BAND_FADE_DAILY.md §3).
export function readBucket(cell, nullDist) {
  const checks = {
    tGe2: cell.t != null && cell.t >= 2,
    grossBeatsCost: cell.mean != null && cell.costHurdle != null && cell.mean >= cell.costHurdle,
    isAndOosPositive: cell.isMean > 0 && cell.oosMean > 0,
    beatsShuffledNull: cell.t != null && nullDist && cell.t > nullDist.p95,
  };
  return { verdict: Object.values(checks).every(Boolean) ? 'BUCKET-EDGE' : 'NO-BUCKET-EDGE', checks };
}

// ── aligned panel for the sized book ────────────────────────────────────────
// Every instrument on the union calendar: simple return t−1→t (0 when the
// instrument has no bar), z and σ (NaN when absent), last close carried.
export function alignPanel(insts, cal) {
  const T = cal.length, N = insts.length;
  const ret = Array.from({ length: N }, () => new Float64Array(T));
  const z = Array.from({ length: N }, () => new Array(T).fill(NaN));
  const sigma = Array.from({ length: N }, () => new Array(T).fill(NaN));
  const close = Array.from({ length: N }, () => new Array(T).fill(NaN));
  const high = Array.from({ length: N }, () => new Array(T).fill(NaN));
  const low = Array.from({ length: N }, () => new Array(T).fill(NaN));
  const calIdx = new Map(cal.map((d, i) => [d, i]));
  insts.forEach((inst, i) => {
    const f = inst.f;
    let prevC = null;
    for (let t = 0; t < f.dates.length; t++) {
      const ci = calIdx.get(f.dates[t]);
      if (prevC != null) ret[i][ci] = f.close[t] / prevC - 1;
      prevC = f.close[t];
      z[i][ci] = f.z[t]; sigma[i][ci] = f.sigma[t];
      close[i][ci] = f.close[t]; high[i][ci] = f.high[t]; low[i][ci] = f.low[t];
    }
    for (let t = 1; t < T; t++) if (!Number.isFinite(close[i][t])) close[i][t] = close[i][t - 1];
  });
  return { cal, keys: insts.map(x => x.key), ret, z, sigma, close, high, low };
}

// Trailing covariance of the panel's daily returns, rows t−w+1 … t (data ≤ t).
// Computed once and shared by every book walk (the random control reuses it).
export function covSeries(panel, w) {
  const N = panel.keys.length, T = panel.cal.length;
  const out = new Array(T).fill(null);
  for (let t = w; t < T; t++) {
    const mu = new Float64Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = t - w + 1; k <= t; k++) s += panel.ret[i][k]; mu[i] = s / w; }
    const C = new Float64Array(N * N);
    for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
      let s = 0;
      for (let k = t - w + 1; k <= t; k++) s += (panel.ret[i][k] - mu[i]) * (panel.ret[j][k] - mu[j]);
      C[i * N + j] = C[j * N + i] = s / (w - 1);
    }
    out[t] = C;
  }
  return out;
}

// ── stage 2: the one fixed rule ─────────────────────────────────────────────
// Entry at close t: |z| ≥ entryZ while flat and armed → dir = −sign(z).
// Exit at the first close where z has crossed 0 (dir·z ≥ 0: back at fair value)
// or after maxHold bars. Re-arm only once |z| < rearmZ (starts disarmed until
// the first such close, so a stretch already in progress at warm-up is skipped).
export function fadeSchedule(panel, o = BAND_FADE_DEFAULTS) {
  const out = [];
  const T = panel.cal.length;
  panel.keys.forEach((key, i) => {
    let open = null, armed = false;
    for (let t = 0; t < T; t++) {
      const zt = panel.z[i][t];
      if (!Number.isFinite(zt)) continue;
      if (open) {
        const reverted = open.dir * zt >= 0;
        if (reverted || t - open.entryT >= o.maxHold) {
          out.push({ ...open, exitT: t, exitReason: reverted ? 'fair-value' : 'time' });
          open = null;
        }
      }
      if (!armed && Math.abs(zt) < o.rearmZ) armed = true;
      if (!open && armed && Math.abs(zt) >= o.entryZ) {
        open = { i, key, dir: -signOf(zt), entryT: t, entryZ: +zt.toFixed(3) };
        armed = false;
      }
    }
    if (open) out.push({ ...open, exitT: T - 1, exitReason: 'end' });
  });
  return out.sort((a, b) => a.entryT - b.entryT || a.i - b.i);
}

// ── the sized book (any schedule) ───────────────────────────────────────────
// At close t the open trades' raw weights u_i = dir/σ_i,t are scaled so the
// book's ex-ante vol (trailing covariance) is targetVol, gross capped at
// maxGross. Weights are fractions of equity per instrument. Record t+1 earns
// Σ w_t · ret_{t+1} minus the turnover cost of moving to w_t (charged on the
// record that the new book first earns on). A trade is open on closes
// entryT … exitT−1 and flat from its exit close.
export function runSizedBook({ panel, cov, schedule, costOneWay, o = BAND_FADE_DEFAULTS, withTrades = true }) {
  const N = panel.keys.length, T = panel.cal.length;
  const openAt = Array.from({ length: T }, () => []);   // trade indices held after close t
  schedule.forEach((tr, k) => { for (let t = tr.entryT; t < tr.exitT; t++) openAt[t].push(k); });
  const tgtDaily = o.targetVol / Math.sqrt(252);
  const fxKeys = panel.keys.map(k => /^[a-z]{6}$/.test(k) && CCYS.includes(k.slice(0, 3).toUpperCase()) && CCYS.includes(k.slice(3, 6).toUpperCase()));

  let prevW = new Float64Array(N);
  const dates = [], net = [], gross = [], costs = [], leverage = [], usdShare = [];
  const tradePnl = new Float64Array(schedule.length), tradeCost = new Float64Array(schedule.length), entryW = new Float64Array(schedule.length);
  const ownerOf = new Int32Array(N).fill(-1);   // trade that owns instrument i's weight

  for (let t = 0; t < T - 1; t++) {
    const u = new Float64Array(N);
    const owner = new Int32Array(N).fill(-1);
    for (const k of openAt[t]) {
      const tr = schedule[k], s = panel.sigma[tr.i][t];
      if (!(s > 0)) continue;
      u[tr.i] += tr.dir / s;
      owner[tr.i] = k;
    }
    let g = 0; for (let i = 0; i < N; i++) g += Math.abs(u[i]);
    let scale = 0;
    if (g > 0 && cov[t]) {
      let v = 0; const C = cov[t];
      for (let i = 0; i < N; i++) { if (!u[i]) continue; for (let j = 0; j < N; j++) if (u[j]) v += u[i] * C[i * N + j] * u[j]; }
      const sig = Math.sqrt(Math.max(v, 0));
      if (sig > 0) scale = Math.min(tgtDaily / sig, o.maxGross / g);
    }
    const w = new Float64Array(N);
    for (let i = 0; i < N; i++) w[i] = u[i] * scale;

    let c = 0, pnl = 0, lev = 0;
    for (let i = 0; i < N; i++) {
      const ci = Math.abs(w[i] - prevW[i]) * costOneWay[i];
      c += ci;
      const r = w[i] * panel.ret[i][t + 1];
      pnl += r; lev += Math.abs(w[i]);
      if (withTrades) {
        // cost of closing goes to the trade that held the weight; opening/rescaling to the holder now
        const k = owner[i] >= 0 ? owner[i] : ownerOf[i];
        if (k >= 0) { tradeCost[k] += ci; }
        if (owner[i] >= 0) {
          tradePnl[owner[i]] += r;
          if (schedule[owner[i]].entryT === t) entryW[owner[i]] = w[i];
        }
      }
    }
    for (let i = 0; i < N; i++) ownerOf[i] = owner[i];
    // FX currency view: net USD as a share of the one-sided currency gross
    const fxPos = {};
    for (let i = 0; i < N; i++) if (fxKeys[i] && w[i]) fxPos[panel.keys[i]] = w[i];
    let us = null;
    if (Object.keys(fxPos).length) {
      const cw = pairToCurrency(fxPos);
      const half = cw.reduce((s, x) => s + Math.abs(x), 0) / 2;
      us = half > 0 ? Math.abs(cw[CCYS.indexOf('USD')]) / half : null;
    }
    dates.push(panel.cal[t + 1]); gross.push(pnl); costs.push(c); net.push(pnl - c); leverage.push(lev); usdShare.push(us);
    prevW = w;
  }

  let trades = null;
  if (withTrades) {
    trades = schedule.map((tr, k) => {
      const i = tr.i, e = panel.close[i][tr.entryT];
      let worst = 0;
      for (let t = tr.entryT + 1; t <= tr.exitT; t++) {
        const adverse = tr.dir > 0 ? panel.low[i][t] / e - 1 : -(panel.high[i][t] / e - 1);
        if (Number.isFinite(adverse)) worst = Math.min(worst, adverse);
      }
      const riskPct = Math.abs(entryW[k]) * (panel.sigma[i][tr.entryT] || 0) * Math.sqrt(o.maxHold) * 100;
      const retPct = (tradePnl[k] - tradeCost[k]) * 100;
      return {
        key: tr.key, dir: tr.dir, entryDate: panel.cal[tr.entryT], exitDate: panel.cal[tr.exitT], days: tr.exitT - tr.entryT,
        exitReason: tr.exitReason, entryZ: tr.entryZ, entryWeight: +entryW[k].toFixed(4),
        retPct: +retPct.toFixed(4), costPct: +(tradeCost[k] * 100).toFixed(4),
        maePct: +(Math.abs(entryW[k]) * worst * 100).toFixed(4),
        riskPct: +riskPct.toFixed(4), R: riskPct > 0 ? +(retPct / riskPct).toFixed(3) : null,
      };
    });
  }
  return { dates, net, gross, costs, leverage, usdShare, trades };
}

// Random-entry control: each real trade keeps its instrument and length, gets a
// random entry close (where z exists) and a random direction. Placement avoids
// overlapping another control trade on the same instrument (up to 50 tries).
export function randomSchedule(panel, schedule, rng) {
  const T = panel.cal.length;
  const busy = panel.keys.map(() => new Uint8Array(T));
  const valid = panel.keys.map((_, i) => { const v = []; for (let t = 0; t < T; t++) if (Number.isFinite(panel.z[i][t])) v.push(t); return v; });
  const out = [];
  for (const tr of schedule) {
    const L = Math.max(1, tr.exitT - tr.entryT), cand = valid[tr.i];
    for (let a = 0; a < 50; a++) {
      const s = cand[Math.floor(rng() * cand.length)];
      if (s + L >= T) continue;
      let clash = false;
      for (let t = s; t < s + L; t++) if (busy[tr.i][t]) { clash = true; break; }
      if (clash) continue;
      for (let t = s; t < s + L; t++) busy[tr.i][t] = 1;
      out.push({ i: tr.i, key: tr.key, dir: rng() < 0.5 ? -1 : 1, entryT: s, exitT: s + L, exitReason: 'control' });
      break;
    }
  }
  return out;
}
