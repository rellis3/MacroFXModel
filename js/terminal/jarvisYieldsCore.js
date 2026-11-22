// js/terminal/jarvisYieldsCore.js: the pure half of Jarvis's YIELDS view: the US Treasury curve as a grid (sessions x maturities), the slope colour mix, the readout numbers and the spoken script.
// DESCRIPTION ONLY: the shape of the curve through time is described, never read as a prediction.
export const TENORS = [
  { key: 'm3', label: '3M', years: 0.25 }, { key: 'y1', label: '1Y', years: 1 }, { key: 'y2', label: '2Y', years: 2 }, { key: 'y3', label: '3Y', years: 3 },
  { key: 'y5', label: '5Y', years: 5 }, { key: 'y7', label: '7Y', years: 7 }, { key: 'y10', label: '10Y', years: 10 }, { key: 'y20', label: '20Y', years: 20 }, { key: 'y30', label: '30Y', years: 30 },
];
export const T2 = 2, T10 = 6, T30 = 8;          // indexes of the 2Y, 10Y and 30Y columns
export const ROWS = 120;

/** Maturity to a 0..1 position along the x axis, on a log scale so the short end is not squeezed. */
export const xOfYears = y => (Math.log(y) - Math.log(0.25)) / (Math.log(30) - Math.log(0.25));

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const byDate = rows => { const m = new Map(); if (Array.isArray(rows)) for (const r of rows) if (r && typeof r.date === 'string' && num(r.value) != null) m.set(r.date, r.value); return m; };

/**
 * Build the grid from the /api/chapters payload ({ series: { m3: [{date,value}], ... } }). Only sessions where every tenor printed are kept; the last `n` of them.
 * Returns { dates: [n], v: Float32Array(n * 9) (percent, oldest row first), n, T } or null when the curve is not there.
 */
export function buildGrid(payload, n = ROWS) {
  const S = payload?.series; if (!S) return null;
  const maps = TENORS.map(t => byDate(S[t.key])); if (maps.some(m => m.size < 10)) return null;
  const dates = [...maps[T10].keys()].filter(d => maps.every(m => m.has(d))).sort(); if (dates.length < 25) return null;
  const use = dates.slice(-n), N = use.length, v = new Float32Array(N * TENORS.length);
  use.forEach((d, j) => maps.forEach((m, i) => { v[j * TENORS.length + i] = m.get(d); }));
  return { dates: use, v, n: N, T: TENORS.length };
}
/** The 2s10s slope in basis points for row j. */
export const slopeBp = (G, j) => Math.round((G.v[j * G.T + T10] - G.v[j * G.T + T2]) * 1000) / 10;

/** The colour mix for a slope: cool (a normal curve), gold (flat) and red (inverted), each 0..1. Normal 40bp and up is all cool; 0 is gold; -40bp and below is all red. */
export function slopeMix(bp) {
  const cool = Math.max(0, Math.min(1, bp / 40)), red = Math.max(0, Math.min(1, -bp / 40));
  const gold = bp >= 0 ? 1 - cool : 1 - red;
  return { cool, gold, red };
}

/** A ribbon series (a country's 10 year, or the real 10 year) sampled on the grid's dates, carrying the last known value forward (at most 5 days). Null where none exists. */
export function ribbonOn(G, rows) {
  const m = byDate(rows); if (!m.size) return null; const ds = [...m.keys()].sort(), out = new Float32Array(G.n); let k = -1, got = 0;
  for (let j = 0; j < G.n; j++) {
    while (k + 1 < ds.length && ds[k + 1] <= G.dates[j]) k++;
    const ok = k >= 0 && (Date.parse(G.dates[j]) - Date.parse(ds[k])) / 864e5 <= 5; out[j] = ok ? m.get(ds[k]) : NaN; if (ok) got++;
  }
  return got >= G.n * 0.5 ? out : null;
}

/** The numbers shown in the readout. */
export function curveStats(G) {
  if (!G || G.n < 21) return null;
  const j = G.n - 1, k = Math.max(0, j - 20), at = (r, i) => G.v[r * G.T + i], s = slopeBp(G, j), s0 = slopeBp(G, k);
  let inv = 0, lo = 0, hi = 0; for (let r = 0; r < G.n; r++) { const b = slopeBp(G, r); if (b < 0) inv++; if (b < slopeBp(G, lo)) lo = r; if (b > slopeBp(G, hi)) hi = r; }
  const bp = x => Math.round(x * 1000) / 10;
  return { asOf: G.dates[j], back: G.dates[k], sessions: j - k, y2: at(j, T2), y10: at(j, T10), y30: at(j, T30), s, s0, ds: Math.round((s - s0) * 10) / 10, d2: bp(at(j, T2) - at(k, T2)), d10: bp(at(j, T10) - at(k, T10)), d30: bp(at(j, T30) - at(k, T30)),
    inverted: s < 0, flat: Math.abs(s) < 10, invDays: inv, n: G.n, sLo: slopeBp(G, lo), sHi: slopeBp(G, hi), loDate: G.dates[lo], hiDate: G.dates[hi] };
}
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayWord = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d)); return m ? `${+m[3]} ${MON[+m[2] - 1]}` : String(d ?? ''); };
export const bpText = v => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(Math.round(v))}bp`;

/** The spoken script: the 2s10s slope and whether it is inverted, how it moved over the last 20 sessions, the 10 year level. */
export function yieldsScript(st) {
  if (!st) return null; const abs = Math.abs(Math.round(st.s));
  const shape = st.flat ? `about flat, ${abs} basis points` : st.inverted ? `inverted, ${abs} basis points below zero` : `normal, ${abs} basis points above zero`;
  const move = Math.abs(st.ds) < 2 ? 'barely changed' : st.ds > 0 ? `steepened by ${Math.round(st.ds)} basis points` : `flattened by ${Math.round(-st.ds)} basis points`;
  const ten = Math.abs(st.d10) < 2 ? 'little changed' : `${st.d10 > 0 ? 'up' : 'down'} ${Math.round(Math.abs(st.d10))} basis points`;
  const hist = st.invDays > 0 ? ` In this window the curve was inverted on ${st.invDays} of ${st.n} sessions, and those stretches are the red and gold ridge.` : ' It was not inverted on any session in this window.';
  return `Here is the Treasury yield curve through time, as of ${dayWord(st.asOf)}. Maturity runs left to right, the last ${st.n} sessions flow toward you, and height is the yield. The two to ten year slope is ${shape}. Over the last ${st.sessions} sessions it has ${move}. The ten year yield is ${st.y10.toFixed(2)} percent, ${ten} over that stretch.${hist} This describes the shape of the curve, not a forecast.`;
}

/**
 * A monotone cubic (Fritsch-Carlson) through points sorted by x, sampled `sub` times per gap, so a drawn curve never overshoots between two printed maturities (no invented humps).
 * xs, ys: numbers (same length, xs increasing). Writes [x, y] pairs into `out` (a Float32Array of at least ((n - 1) * sub + 1) * 2) when given; returns the number of points written (or an array of pairs without `out`).
 */
export function monoCurve(xs, ys, sub = 6, out = null) {
  const n = Math.min(xs?.length ?? 0, ys?.length ?? 0); if (n < 2) return out ? 0 : [];
  const d = new Array(n - 1), m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2]; for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  const res = out ? null : []; let k = 0;
  const put = (x, y) => { if (out) { out[k * 2] = x; out[k * 2 + 1] = y; } else res.push([x, y]); k++; };
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i];
    for (let s = 0; s < sub; s++) { const t = s / sub, t2 = t * t, t3 = t2 * t; put(xs[i] + t * h, (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]); }
  }
  put(xs[n - 1], ys[n - 1]);
  return out ? k : res;
}

/**
 * The SHOW camera's act at progress p (0..1): 'over' (a high establishing look), 'front' (down LOW along the front edge, today's curve, short end to long end),
 * 'rewind' (back through time: the terrain peels away session by session so each older curve becomes the front edge; slice = the row index shown), 'return' (time runs forward again as the camera rises).
 * Returns { act, k (0..1 within the act, eased), slice (row index, newest = n - 1) }.
 */
export function yieldsShowAct(p, n) {
  const x = Math.max(0, Math.min(1, Number(p) || 0)), last = Math.max(0, (n | 0) - 1), e = q => { const c = Math.max(0, Math.min(1, q)); return c * c * (3 - 2 * c); };
  if (x < 0.12) return { act: 'over', k: e(x / 0.12), slice: last };
  if (x < 0.38) return { act: 'front', k: e((x - 0.12) / 0.26), slice: last };
  if (x < 0.86) { const k = e((x - 0.38) / 0.48); return { act: 'rewind', k, slice: Math.round(last * (1 - k)) }; }
  const k = e((x - 0.86) / 0.14); return { act: 'return', k, slice: Math.round(last * k) };
}
