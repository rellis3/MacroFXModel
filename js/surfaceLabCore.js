// Surface Lab — pure maths (no I/O). The nightly job is js/surfaceLabRoutes.js; the page is surface-lab.html.
//
// Four live surfaces, each built on the principles of COG's yield-curve explorer: look at a whole system at once,
// make time an axis, smooth to see the regime, and slice by date or by member.
//   absorption  — PCA across FX pairs (Kritzman, Li, Page & Rigobon 2011): how much of all FX movement is one trade.
//   persistence — variance ratio by horizon (Lo & MacKinlay 1988): do moves extend or give back, horizon by horizon.
//   volTime     — share of the day's movement made in each 15-minute slot (London time), week by week.
//   rates       — the US Treasury curve, weekly, with level / slope / curvature and a steepener/flattener label.
// Research behind the "what it means for your systems" notes: analysis/surfaces/*.md (descriptive, not pre-registered).

const r = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

// Jacobi eigen-decomposition of a symmetric matrix. Returns eigenvalues (descending) and matching column vectors.
export function eigenSym(A, maxSweeps = 60) {
  const n = A.length, a = A.map(row => row.slice()), v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = [...Array(n).keys()].sort((i, j) => a[j][j] - a[i][i]);
  return { values: idx.map(i => a[i][i]), vectors: idx.map(i => v.map(row => row[i])) };
}

function corrMatrix(cols) {
  const n = cols.length, z = cols.map(c => { const m = mean(c), sd = Math.sqrt(c.reduce((s, x) => s + (x - m) ** 2, 0) / (c.length - 1)) || 1; return c.map(x => (x - m) / sd); });
  const T = z[0].length, C = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { let s = 0; for (let t = 0; t < T; t++) s += z[i][t] * z[j][t]; C[i][j] = C[j][i] = s / (T - 1); }
  return C;
}

// ── absorption ─────────────────────────────────────────────────────────────────────────────────────
// closes: { name: Map(date → close) } on a shared calendar. USD pairs define the dollar factor (+ = dollar up).
// anchor (optional): the member whose loading is made positive, e.g. the Nasdaq so PC1 > 0 reads "risk-on";
// without it PC1 is signed so it rises with the dollar.
export function absorption(closes, { window = 60, keep = 260, comps = 8, anchor = null } = {}) {
  const pairs = Object.keys(closes).sort();
  const dates = [...new Set(pairs.flatMap(p => [...closes[p].keys()]))].sort()
    .filter(d => pairs.filter(p => closes[p].has(d)).length >= pairs.length * 0.9);
  const ret = {};
  for (const p of pairs) { let prev = null; ret[p] = dates.map(d => { const c = closes[p].get(d) ?? prev; const x = prev && c ? Math.log(c / prev) : 0; prev = c ?? prev; return x; }); }
  const usd = pairs.filter(p => /^[A-Z]{6}$/.test(p) && /USD/.test(p)).map(p => [p, p.startsWith('USD') ? 1 : -1]);
  const dollar = dates.map((_, t) => usd.length ? mean(usd.map(([p, s]) => s * ret[p][t])) : 0);
  const ai = anchor ? pairs.indexOf(anchor) : -1;
  const out = { pairs, anchor: ai >= 0 ? anchor : null, dates: [], share: [], loadings: [], dollarCorr: [], dollarRet: [] };
  for (let t = Math.max(window, dates.length - keep); t < dates.length; t++) {
    const cols = pairs.map(p => ret[p].slice(t - window + 1, t + 1));
    const { values, vectors } = eigenSym(corrMatrix(cols));
    const tot = values.reduce((s, x) => s + x, 0);
    let pc1 = vectors[0];
    const f = Array.from({ length: window }, (_, k) => pairs.reduce((s, p, i) => s + pc1[i] * cols[i][k], 0));
    const dw = dollar.slice(t - window + 1, t + 1), mf = mean(f), md = mean(dw);
    let cv = 0, vf = 0, vd = 0; for (let k = 0; k < window; k++) { cv += (f[k] - mf) * (dw[k] - md); vf += (f[k] - mf) ** 2; vd += (dw[k] - md) ** 2; }
    let corr = cv / Math.sqrt(vf * vd || 1);
    const flip = ai >= 0 ? pc1[ai] < 0 : corr < 0;              // anchor positive, else: positive = moves with the dollar
    if (flip) { pc1 = pc1.map(x => -x); corr = -corr; }
    out.dates.push(dates[t]);
    out.share.push(values.slice(0, comps).map(x => r(x / tot)));
    out.loadings.push(pc1.map(x => r(x, 3)));
    out.dollarCorr.push(r(corr, 3));
    out.dollarRet.push(r(dollar[t], 6));
  }
  return out;
}

// ── persistence ────────────────────────────────────────────────────────────────────────────────────
// bars: ascending [{ t (epoch s), close }], 15-min. VR(q) over the last `days` London days, for q blocks of 15 min.
export const PERSIST_Q = [2, 4, 8, 16, 32];               // 30m, 1h, 2h, 4h, 8h
// London offset is constant within a UTC hour, so cache it per hour: Intl formatting per bar was ~90% of build time.
const _ldFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false });
const _offCache = new Map();
function londonOffsetSec(tSec) {
  const hk = Math.floor(tSec / 3600); let off = _offCache.get(hk);
  if (off == null) {
    const p = Object.fromEntries(_ldFmt.formatToParts(new Date(hk * 3600e3)).map(x => [x.type, x.value]));
    off = (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24) / 1000) - hk * 3600;
    if (_offCache.size > 200000) _offCache.clear(); _offCache.set(hk, off);
  }
  return off;
}
export function londonDay(tSec) { return new Date((tSec + londonOffsetSec(tSec)) * 1000).toISOString().slice(0, 10); }
export function londonSlot(tSec) { const s = ((tSec + londonOffsetSec(tSec)) % 86400 + 86400) % 86400; return Math.floor(s / 900); }
function dailyReturns(bars) {
  const byDay = new Map();
  for (let i = 1; i < bars.length; i++) {
    const x = Math.log(bars[i].close / bars[i - 1].close); if (!Number.isFinite(x) || bars[i].t - bars[i - 1].t > 3 * 3600) continue;
    const d = londonDay(bars[i].t); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push({ x, slot: londonSlot(bars[i].t) });
  }
  return [...byDay.entries()].filter(([, a]) => a.length >= 40).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
export function persistence(bars, { days = 20, keep = 260, qs = PERSIST_Q } = {}) {
  const D = dailyReturns(bars).map(([d, a]) => {
    const xs = a.map(o => o.x), r2 = xs.reduce((s, x) => s + x * x, 0), b = {};
    for (const q of qs) { let s = 0; for (let i = 0; i + q <= xs.length; i += q) { let blk = 0; for (let k = i; k < i + q; k++) blk += xs[k]; s += blk * blk; } b[q] = s; }
    return { d, r2, b };
  });
  const out = { dates: [], vr: [] };
  for (let t = Math.max(days - 1, D.length - keep); t < D.length; t++) {
    const w = D.slice(t - days + 1, t + 1), r2 = w.reduce((s, o) => s + o.r2, 0);
    out.dates.push(D[t].d); out.vr.push(qs.map(q => r(w.reduce((s, o) => s + o.b[q], 0) / r2, 3)));
  }
  return out;
}

// ── vol time ───────────────────────────────────────────────────────────────────────────────────────
// Weekly mean share of each London day's absolute movement made in each 15-minute slot (96 slots).
export function volTime(bars, { keepWeeks = 52 } = {}) {
  const weeks = new Map();
  for (const [d, a] of dailyReturns(bars)) {
    const tot = a.reduce((s, o) => s + Math.abs(o.x), 0); if (!(tot > 0)) continue;
    const prof = new Array(96).fill(0); for (const o of a) prof[o.slot] += Math.abs(o.x) / tot;
    const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    const wk = dt.toISOString().slice(0, 10);
    if (!weeks.has(wk)) weeks.set(wk, []); weeks.get(wk).push(prof);
  }
  const keys = [...weeks.keys()].sort().slice(-keepWeeks);
  return { weeks: keys, share: keys.map(k => { const ps = weeks.get(k); return Array.from({ length: 96 }, (_, s) => r(mean(ps.map(p => p[s])), 5)); }) };
}
// Share of the day's movement inside [fromSlot, toSlot) — e.g. the rich-vol rule's 00:00–10:00 window = [0, 40).
export const windowShare = (profile, from, to) => r(profile.slice(from, to).reduce((s, x) => s + (x ?? 0), 0), 3);

// ── rates ──────────────────────────────────────────────────────────────────────────────────────────
export const TENORS = [['DGS1MO', '1M', 1 / 12], ['DGS3MO', '3M', 0.25], ['DGS6MO', '6M', 0.5], ['DGS1', '1Y', 1], ['DGS2', '2Y', 2], ['DGS3', '3Y', 3],
  ['DGS5', '5Y', 5], ['DGS7', '7Y', 7], ['DGS10', '10Y', 10], ['DGS20', '20Y', 20], ['DGS30', '30Y', 30]];

// Classic curve-move vocabulary from the change in 2Y and 10Y over `lag` weeks (bp threshold for "flat").
export function curveRegime(d2, d10, flatBp = 5) {
  if (d2 == null || d10 == null) return null;
  const slope = d10 - d2;
  if (Math.abs(slope) < flatBp / 100) return d10 > 0 ? 'parallel up' : 'parallel down';
  const bull = d2 <= 0 && d10 <= 0, bear = d2 >= 0 && d10 >= 0;   // bull = yields falling (bond prices up)
  if (slope > 0) return bull ? 'bull steepener' : bear ? 'bear steepener' : 'steepening twist';
  return bull ? 'bull flattener' : bear ? 'bear flattener' : 'flattening twist';
}

// series: { DGS2: Map(date → %) ... }. Weekly (last obs of each week, Friday-keyed), smoothed by a 5-week mean like COG's.
export function rates(series, { lag = 4, smooth = 5 } = {}) {
  const all = [...new Set(Object.values(series).flatMap(m => [...m.keys()]))].sort();
  const wk = new Map();
  for (const d of all) { const dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + ((5 - dt.getUTCDay() + 7) % 7)); wk.set(dt.toISOString().slice(0, 10), d); }
  const weeks = [...wk.keys()].sort(), last = {};
  const raw = weeks.map(w => TENORS.map(([id]) => { const v = series[id]?.get(wk.get(w)); if (Number.isFinite(v)) last[id] = v; return last[id] ?? null; }));
  const curve = raw.map((_, i) => TENORS.map((_, j) => { const xs = raw.slice(Math.max(0, i - smooth + 1), i + 1).map(row => row[j]).filter(Number.isFinite); return xs.length ? r(mean(xs), 3) : null; }));
  const col = id => TENORS.findIndex(t => t[0] === id);
  const i2 = col('DGS2'), i10 = col('DGS10'), i3m = col('DGS3MO'), i5 = col('DGS5');
  const factors = raw.map(row => ({ level: r(mean(row.filter(Number.isFinite)), 3), slope: r(row[i10] - row[i3m], 3), curvature: r(2 * row[i5] - row[i2] - row[i10], 3) }));
  const regime = raw.map((row, i) => i < lag ? null : curveRegime(row[i2] - raw[i - lag][i2], row[i10] - raw[i - lag][i10]));
  return { weeks, tenors: TENORS.map(t => t[1]), years: TENORS.map(t => t[2]), curve, raw, factors, regime };
}

// What followed each regime label: mean forward return over `fwd` weeks for each asset, split into the older and
// newer half of the window so a reader sees whether it held. assets: { name: Map(weekKey → close) }.
export function regimeOutcomes(ratesOut, assets, { fwd = 4 } = {}) {
  const { weeks, regime } = ratesOut, half = weeks[Math.floor(weeks.length / 2)], out = {};
  for (const [name, m] of Object.entries(assets)) {
    const acc = {};
    for (let i = 0; i + fwd < weeks.length; i++) {
      const lab = regime[i], a = m.get(weeks[i]), b = m.get(weeks[i + fwd]);
      if (!lab || !(a > 0) || !(b > 0)) continue;
      const k = weeks[i] < half ? 'older' : 'newer', x = Math.log(b / a);
      const s = ((acc[lab] ??= {})[k] ??= { n: 0, sum: 0, up: 0 }); s.n++; s.sum += x; s.up += x > 0;
    }
    out[name] = Object.fromEntries(Object.entries(acc).map(([lab, h]) => [lab, Object.fromEntries(Object.entries(h).map(([k, s]) => [k, { n: s.n, meanPct: r(s.sum / s.n * 100, 2), upRate: r(s.up / s.n, 2) }]))]));
  }
  return { fwdWeeks: fwd, split: half, byAsset: out };
}

// ── currency level ─────────────────────────────────────────────────────────────────────────────────
// Equal-weight currency indices from every pair containing the currency (signed toward it). For each non-USD
// currency c, its USD pair's move is (index_c − index_USD) up to scale, so its variance splits exactly into a dollar
// part (var_USD − cov) and a c part (var_c − cov). dollarShare = the dollar's part over the window: "of the EURUSD
// move over the last 60 days, how much was the dollar". move20Pct = each index's own 20-day move vs the basket.
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
export function currencyFactors(closes, { window = 60, recent = 20 } = {}) {
  const pairs = Object.keys(closes).filter(p => /^[A-Z]{6}$/.test(p)).sort();
  const dates = [...new Set(pairs.flatMap(p => [...closes[p].keys()]))].sort()
    .filter(d => pairs.filter(p => closes[p].has(d)).length >= pairs.length * 0.9);
  const ret = {};
  for (const p of pairs) { let prev = null; ret[p] = dates.map(d => { const c = closes[p].get(d) ?? prev; const x = prev && c ? Math.log(c / prev) : 0; prev = c ?? prev; return x; }); }
  const idx = {};
  for (const c of CCYS) {
    const legs = pairs.filter(p => p.startsWith(c) || p.endsWith(c)).map(p => [p, p.startsWith(c) ? 1 : -1]);
    if (legs.length) idx[c] = dates.map((_, t) => mean(legs.map(([p, s]) => s * ret[p][t])));
  }
  const w0 = Math.max(0, dates.length - window), out = { asOf: dates.at(-1), window, byCcy: {} };
  const sum20 = c => r(idx[c].slice(-recent).reduce((s, v) => s + v, 0) * 100, 2);
  if (!idx.USD) return out;
  const u = idx.USD.slice(w0), mu = mean(u);
  for (const c of CCYS) {
    if (!idx[c]) continue;
    if (c === 'USD') { out.byCcy[c] = { move20Pct: sum20(c) }; continue; }
    const x = idx[c].slice(w0), mx = mean(x);
    let vx = 0, vu = 0, cv = 0; for (let k = 0; k < x.length; k++) { vx += (x[k] - mx) ** 2; vu += (u[k] - mu) ** 2; cv += (x[k] - mx) * (u[k] - mu); }
    const tot = vx + vu - 2 * cv;
    out.byCcy[c] = { pair: ['EUR', 'GBP', 'AUD', 'NZD'].includes(c) ? c + 'USD' : 'USD' + c,
      dollarShare: tot > 0 ? r((vu - cv) / tot, 3) : null, ownShare: tot > 0 ? r((vx - cv) / tot, 3) : null, move20Pct: sum20(c) };
  }
  return out;
}

// ── live vol clock ─────────────────────────────────────────────────────────────────────────────────
// profile: 96 slot shares (sum 1) of a typical day's movement in London time. Elapsed vol time τ = share of the typical
// day's movement already behind us at `slot`. A Brownian range grows with √time, so the range expected by now is
// medianRange × √τ, and pace = range so far ÷ that. Closed-form reference, not a backtested claim.
export function volClock(profile, slot, rangeSoFarPct, medianRangePct) {
  if (!Array.isArray(profile) || !(slot >= 0)) return null;
  const tau = Math.min(1, profile.slice(0, slot + 1).reduce((s, x) => s + (x ?? 0), 0));
  const expected = medianRangePct > 0 ? medianRangePct * Math.sqrt(tau) : null;
  const pace = expected > 0 && Number.isFinite(rangeSoFarPct) ? rangeSoFarPct / expected : null;
  return { tau: r(tau, 3), expectedSoFarPct: r(expected, 3), rangeSoFarPct: r(rangeSoFarPct, 3), pace: r(pace, 2),
    read: pace == null ? null : pace >= 1.25 ? 'running ahead' : pace <= 0.8 ? 'running behind' : 'on schedule' };
}

// ── vol term structure (S&P, CBOE) ─────────────────────────────────────────────────────────────────
// The S&P implied-vol curve from 1 day to 6 months (VIX1D, VIX9D, VIX, VIX3M, VIX6M), plus two shape ratios:
//   front = VIX9D / VIX  (> 1: the next 9 days priced dearer than the next 30, a near-term event or stress)
//   back  = VIX / VIX3M  (> 1: backwardation, the classic stress signal)
// analysis/surfaces/VOL_TERM_CHECK.md (descriptive, not pre-registered): NQ+SPX days past their p75 range line, unseen
// 2021-26, by front tercile 20.7% / 28.7% / 35.2% (design 25%); within the middle vol-level tercile 15% -> 48%.
export const TERM_TENORS = [['VIX1D', '1D', 1], ['VIX9D', '9D', 9], ['VIX', '30D', 30], ['VIX3M', '3M', 91], ['VIX6M', '6M', 182]];
export const TERM_EDGES = { front: [0.8858, 0.9669], back: [0.8376, 0.9157] };      // terciles fitted 2016-2020
// front: share of days past the PRODUCTION NQ/SPX hl p75, 2021-26, by calm / normal / dear (forge/VOL_CURVE_FRONT_PREREG.md, H5 PASS)
// back: descriptive (VOL_TERM_CHECK.md, plain yz sigma)
export const TERM_P75 = { front: [0.190, 0.265, 0.323], back: [0.236, 0.267, 0.343] };
export function volTerm(series, { keepDays = 780 } = {}) {
  const dates = [...new Set(Object.values(series).flatMap(m => [...m.keys()]))].sort().filter(d => series.VIX?.has(d)).slice(-keepDays);
  const z = TERM_TENORS.map(([id]) => dates.map(d => { const v = series[id]?.get(d); return Number.isFinite(v) ? v : null; }));
  const ratio = (a, b) => dates.map(d => { const x = series[a]?.get(d), y = series[b]?.get(d); return x > 0 && y > 0 ? r(x / y, 4) : null; });
  const front = ratio('VIX9D', 'VIX'), back = ratio('VIX', 'VIX3M');
  const state = (v, e) => v == null ? null : v < e[0] ? 'calm' : v >= e[1] ? 'stressed' : 'normal';
  const t = (v, e) => v == null ? null : v < e[0] ? 0 : v >= e[1] ? 2 : 1;
  const j = dates.length - 1, fn = front[j], bk = back[j];
  return { dates, tenors: TERM_TENORS.map(x => x[1]), days: TERM_TENORS.map(x => x[2]), z, front, back,
    vxn: dates.map(d => series.VXN?.get(d) ?? null),
    now: { date: dates[j], curve: z.map(row => row[j]), front: fn, back: bk, frontState: state(fn, TERM_EDGES.front), backState: state(bk, TERM_EDGES.back),
      p75Front: t(fn, TERM_EDGES.front) == null ? null : TERM_P75.front[t(fn, TERM_EDGES.front)], p75Back: t(bk, TERM_EDGES.back) == null ? null : TERM_P75.back[t(bk, TERM_EDGES.back)] } };
}
