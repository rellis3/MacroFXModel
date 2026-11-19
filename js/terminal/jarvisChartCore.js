// js/terminal/jarvisChartCore.js: the pure half of Jarvis's CANDLES chart: moving averages, the stack of day planes, price-axis and time-axis tick maths, and the crosshair hit-tests.
// DESCRIPTION ONLY: every number here is something that has happened. An EMA is a weighted average of PAST closes, nothing more; it is drawn and labelled as that.
export const TFS = ['5m', '15m', '1h', '1d'];
export const TF_SECS = { '5m': 300, '15m': 900, '1h': 3600 };
/** How many bars to ask the intraday route for per timeframe (about a week or more of planes). */
export const TF_COUNT = { '5m': 1500, '15m': 1500, '1h': 600 };
export const DAY = 86400, MAX_PLANES = 8, MAX_BARS_PLANE = 150, DAILY_CHUNK = 22;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = n => String(n).padStart(2, '0');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Exponential moving average of `values` with period n, seeded with the simple average of the first n (the usual charting convention). null until n values exist. Same length out. */
export function ema(values, n) {
  const out = new Array(values.length).fill(null); if (!(n >= 1) || values.length < n) return out;
  let s = 0; for (let i = 0; i < n; i++) s += values[i];
  let e = s / n; out[n - 1] = e; const k = 2 / (n + 1);
  for (let i = n; i < values.length; i++) { e = values[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

/** Merge consecutive raw bars that share a slot key into one OHLC bar (first open, highest high, lowest low, last close). `gi` = the global index of the last raw bar merged, for looking up an EMA. */
function mergeBy(rows, keyOf) {
  const out = []; let cur = null, ck = null;
  for (const r of rows) {
    const k = keyOf(r);
    if (cur && k === ck) { cur.h = Math.max(cur.h, r.h); cur.l = Math.min(cur.l, r.l); cur.c = r.c; cur.gi = r.gi; } else { cur = { t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, gi: r.gi, s: k }; out.push(cur); ck = k; }
  }
  return out;
}
export const dayOf = t => Math.floor(t / DAY);
export const dateLabel = t => { const d = new Date(t * 1000); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const shortDate = t => { const d = new Date(t * 1000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const clockLabel = t => { const d = new Date(t * 1000); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
/** "Thu 19 Nov 12:45 UTC" for intraday, "Thu 19 Nov" for daily. */
export const fullTime = (t, tf) => (tf === '1d' ? dateLabel(t) : `${dateLabel(t)} ${clockLabel(t)} UTC`);

/**
 * Stack the bars into planes, newest first. Intraday: one plane per UTC day (the forecaster's own session anchor), slots by clock time so yesterday's 14:30 sits directly behind today's 14:30; a day with more than maxBars bars
 * is merged slot-wise (5 minute bars -> 10 minute). Daily: blocks of 22 trading days counted back from the latest. Each bar carries { t, o, h, l, c, gi, s } with gi the index into the original array.
 * Returns [{ k, tf, label, date, bars, slots, step, partial }]; null for no usable bars.
 */
export function groupPlanes(rawBars, tf, { maxPlanes = MAX_PLANES, maxBars = MAX_BARS_PLANE } = {}) {
  const rows = []; (rawBars ?? []).forEach((b, gi) => { if (b && [b.t, b.o, b.h, b.l, b.c].every(x => Number.isFinite(+x))) rows.push({ t: +b.t, o: +b.o, h: +b.h, l: +b.l, c: +b.c, gi }); });
  if (!rows.length) return null;
  const planes = [];
  if (tf === '1d') {
    for (let end = rows.length; end > 0 && planes.length < maxPlanes; end -= DAILY_CHUNK) {
      const part = rows.slice(Math.max(0, end - DAILY_CHUNK), end), off = DAILY_CHUNK - part.length;   // the oldest block may be short; the newest is always full width
      const bars = part.map((r, i) => ({ ...r, s: i + (planes.length === 0 ? 0 : off) }));
      planes.push({ k: planes.length, tf, label: `${shortDate(part[0].t)} to ${shortDate(part[part.length - 1].t)}`, date: part[part.length - 1].t, bars, slots: DAILY_CHUNK, step: 1, partial: false });
    }
    return planes;
  }
  const secs = TF_SECS[tf]; if (!secs) return null;
  const perDay = Math.round(DAY / secs), f = Math.max(1, Math.ceil(perDay / maxBars)), slots = Math.ceil(perDay / f);
  const byDay = new Map(); for (const r of rows) { const d = dayOf(r.t); (byDay.get(d) ?? byDay.set(d, []).get(d)).push(r); }
  const days = [...byDay.keys()].sort((a, b) => b - a).slice(0, maxPlanes);
  for (const d of days) {
    const bars = mergeBy(byDay.get(d), r => Math.floor(((r.t % DAY) / secs) / f));
    planes.push({ k: planes.length, tf, label: dateLabel(d * DAY), date: d * DAY, bars, slots, step: f, partial: planes.length === 0 && bars.length < 8 });
  }
  return planes;
}

/** The nicest tick step at or above the raw one (1, 2, 5 times a power of ten). */
export function niceStep(raw) { if (!(raw > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; }
/** Price-axis ticks inside [lo, hi]: about `target` of them, on round numbers. */
export function priceTicks(lo, hi, target = 6) {
  if (!(hi > lo)) return [];
  const step = niceStep((hi - lo) / Math.max(2, target)), out = [], dp = Math.max(0, 8 - Math.floor(Math.log10(Math.abs(hi) + 1e-9)));
  for (let p = Math.ceil(lo / step - 1e-9) * step; p <= hi + step * 1e-9; p += step) out.push(+p.toFixed(Math.min(10, dp)));
  return out;
}
/** Axis decimals that suit the size of a price and its tick step: 3 for FX, 0 for indices. */
export function priceDecimals(price, step = 0) { const a = Math.abs(price); const base = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : 4; if (step > 0) { const need = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)); return Math.max(base, Math.min(6, need)); } return base; }
export const fmtAxis = (p, dp) => p.toFixed(dp);

/** The shared vertical scale: lo / hi over the first `near` planes (and any extra prices, such as the usual-range band), padded 6%. Older planes simply draw on the same scale. */
export function chartScale(planes, near = 3, extra = []) {
  let lo = Infinity, hi = -Infinity;
  for (const p of planes.slice(0, near)) for (const b of p.bars) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
  for (const v of extra) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) { hi = (Number.isFinite(lo) ? lo : 1) * 1.001 + 1e-9; if (!Number.isFinite(lo)) lo = 0; }
  const pad = (hi - lo) * 0.06; return { lo: lo - pad, hi: hi + pad };
}

/** Time-axis labels for one plane: intraday every 3 hours on the hour (every hour on a 1h chart that is too wide), daily every 5th bar. [{ s (slot), label }]. */
export function timeTicks(plane, maxTicks = 8) {
  const out = []; if (!plane?.bars?.length) return out;
  if (plane.tf === '1d') { for (const b of plane.bars) if ((b.s % 5) === 0) out.push({ s: b.s, label: shortDate(b.t) }); return out; }
  const secs = TF_SECS[plane.tf] * plane.step, hoursPerTick = Math.max(1, Math.ceil(24 / maxTicks));
  for (let h = 0; h < 24; h += hoursPerTick) out.push({ s: Math.floor(h * 3600 / secs), label: `${p2(h)}:00` });
  return out;
}

/** Which bar is under the pointer: the index of the screen x in `xs[0..n)` nearest to px, or -1 when none is within maxDist px. */
export function nearestIndex(xs, n, px, maxDist = 40) {
  let best = -1, bd = maxDist; for (let i = 0; i < n; i++) { const d = Math.abs(xs[i] - px); if (d <= bd) { bd = d; best = i; } }
  return best;
}
/** The price at screen y, given the screen y of the scale's bottom (lo) and top (hi). */
export const priceAtY = (y, yBot, yTop, lo, hi) => (yBot === yTop ? lo : lo + ((yBot - y) / (yBot - yTop)) * (hi - lo));
/** Percent change of a bar, close against open. */
export const barChange = b => (b.o ? (b.c / b.o - 1) * 100 : 0);

/** How visible plane k is when the camera has dollied to `dolly` (plane units): planes behind fade with age; planes the camera has passed fade out. 0..1. */
export function planeAlpha(k, dolly) {
  const d = k - dolly; if (d < 0) return clamp(1 + d / 0.9, 0, 1);
  return clamp(1 - 0.12 * d, 0.2, 1);
}
/** Auto-dolly: a slow ping-pong through the planes (plane units) as a function of seconds. */
export const autoDolly = (t, n, period = 40) => (n <= 1 ? 0 : (n - 1) * (0.5 - 0.5 * Math.cos((t / period) * 2 * Math.PI)));
/** Step the market through a list (wraps); unknown current starts at the first. */
export const stepKey = (list, cur, dir) => { if (!list.length) return null; const i = list.indexOf(cur); return list[(((i < 0 ? 0 : i + dir) % list.length) + list.length) % list.length]; };
