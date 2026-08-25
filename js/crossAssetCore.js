// js/crossAssetCore.js — pure maths for two visual panels:
//
//   1. Realised-vs-implied volatility (per pair, drawer "Vol & Path" tab)
//   2. The cross-asset driver board (board-level, today.html sidebar)
//
// Both are CONTEXT. Neither is a signal: the RV/IV gap is a well-known risk
// premium, not a direction, and driver alignment is arithmetic agreement across
// four instruments — it says the tape is one-way today, not that it will
// continue. Nothing here is backtested.
//
// Pure: numbers in, numbers out. No DOM, no network, no globals.

/** Close-to-close log returns, skipping non-finite and non-positive prices. */
export function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const a = Number(closes[i - 1]), b = Number(closes[i]);
    if (!(a > 0) || !(b > 0)) { out.push(null); continue; }
    out.push(Math.log(b / a));
  }
  return out;
}

/**
 * Rolling annualised realised volatility, in PERCENT, aligned to `closes`.
 *
 * out[i] is the vol of the `win` returns ENDING at closes[i], so it uses only
 * data up to and including i — no lookahead. Entries before enough history, or
 * spanning a gap, are null rather than a partial-window number that would look
 * like a real reading.
 */
export function realisedVolSeries(closes, win = 20, periodsPerYear = 252) {
  const r = logReturns(closes);
  const out = new Array(closes.length).fill(null);
  for (let i = win; i < closes.length; i++) {
    const slice = r.slice(i - win, i);
    if (slice.some(v => v == null)) continue;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    // Sample variance (n-1): these are estimates from a sample, not a population.
    const varr = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
    out[i] = Math.sqrt(varr * periodsPerYear) * 100;
  }
  return out;
}

/** Percentile rank (0–100) of `v` within `arr`, ignoring nulls. null if no data. */
export function percentileOf(v, arr) {
  if (v == null || !Number.isFinite(v)) return null;
  const xs = arr.filter(x => x != null && Number.isFinite(x));
  if (!xs.length) return null;
  const below = xs.filter(x => x < v).length;
  return Math.round((below / xs.length) * 100);
}

/**
 * Is realised vol rising or falling? Compares the mean of the last `recent`
 * readings against the `prior` before them, with a dead-band so noise doesn't
 * read as a trend.
 */
export function volDirection(series, recent = 5, prior = 15, deadPct = 3) {
  const xs = series.filter(x => x != null && Number.isFinite(x));
  if (xs.length < recent + prior) return null;
  const tail = xs.slice(-recent);
  const head = xs.slice(-(recent + prior), -recent);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const t = mean(tail), h = mean(head);
  if (!(h > 0)) return null;
  const chg = ((t - h) / h) * 100;
  return { changePct: +chg.toFixed(1), label: chg > deadPct ? 'Expanding' : chg < -deadPct ? 'Contracting' : 'Stable' };
}

/** Coarse vol regime from the realised-vol percentile — the same tiering the rest of the page uses. */
export function volRegimeLabel(pct) {
  if (pct == null) return null;
  return pct >= 80 ? 'Elevated' : pct <= 20 ? 'Compressed' : 'Normal';
}

/**
 * Percent change from the first finite value — the shape the driver board plots,
 * so four instruments on different scales share one axis.
 */
export function normaliseFromStart(values) {
  const first = values.find(v => v != null && Number.isFinite(v) && v !== 0);
  if (first == null) return values.map(() => null);
  return values.map(v => (v != null && Number.isFinite(v) ? ((v - first) / first) * 100 : null));
}

/** Last finite entry of a series, or null. */
export function lastFinite(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * A USD-strength series from the majors, as percent change from window start.
 *
 * There is no OANDA dollar index, so this is an equal-weight basket of the
 * majors the page already tracks. USD is the QUOTE currency in EUR/USD,
 * GBP/USD and AUD/USD (so USD strengthening moves them DOWN — the leg is
 * inverted) and the BASE in USD/JPY (moves it UP — taken as is). Legs that are
 * missing are simply dropped; the basket is the mean of whatever is present, so
 * one absent feed degrades the reading rather than skewing it.
 *
 * @param {Record<string, number[]>} legs  normalised %-change series by pair name
 */
export function usdStrengthSeries(legs = {}) {
  const spec = [
    ['EUR/USD', -1], ['GBP/USD', -1], ['AUD/USD', -1],   // USD is the quote → invert
    ['USD/JPY', +1],                                      // USD is the base  → as is
  ].filter(([k]) => Array.isArray(legs[k]) && legs[k].length);
  if (!spec.length) return { series: [], legs: 0 };
  const n = Math.max(...spec.map(([k]) => legs[k].length));
  const out = [];
  for (let i = 0; i < n; i++) {
    const vals = [];
    for (const [k, sign] of spec) {
      const v = legs[k][i];
      if (v != null && Number.isFinite(v)) vals.push(v * sign);
    }
    out.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  }
  return { series: out, legs: spec.length };
}

/**
 * Market-tone score (0–100) from the reads the panel actually displays.
 *
 * The needle used to come from index breadth ALONE, while five rows sat beneath
 * it — credit, equity vol, USD, rates, oil — that fed it nothing. Overnight,
 * when no index has a direction yet, breadth is 0 and the needle parked on a
 * confident-looking 50 while everything under it moved. Worse, 50 meant two
 * different things: "genuinely balanced" and "nothing to say".
 *
 * Now every displayed row votes. Breadth still carries the most weight (it is a
 * direct read of risk appetite rather than a proxy), but it no longer decides
 * alone, and a row that is genuinely two-way ('mix') contributes nothing rather
 * than being counted as balance.
 *
 * @param {number|null} equity   index breadth in [-1,+1], or null if unknown
 * @param {Array<'on'|'off'|'mix'>} rowClasses  the per-row risk reads as shown
 * @returns {{score:number|null, votes:number, up:number, down:number}}
 *          score null = nothing had a read; render that as "no read", never 50.
 */
export function marketToneScore(equity, rowClasses = []) {
  const votes = [];
  if (equity != null && Number.isFinite(equity)) {
    // Breadth is one read but the most direct, so it weighs as much as two rows.
    votes.push({ v: Math.max(-1, Math.min(1, equity)), w: 2 });
  }
  for (const c of rowClasses) {
    if (c === 'on') votes.push({ v: 1, w: 1 });
    else if (c === 'off') votes.push({ v: -1, w: 1 });
    // 'mix' is a genuine two-way read: it should not pull toward the middle,
    // it should simply not vote.
  }
  if (!votes.length) return { score: null, votes: 0, up: 0, down: 0 };
  const wsum = votes.reduce((a, b) => a + b.w, 0);
  const mean = votes.reduce((a, b) => a + b.v * b.w, 0) / wsum;
  return {
    score: Math.round((Math.max(-1, Math.min(1, mean)) + 1) / 2 * 100),
    votes: votes.length,
    up: votes.filter(x => x.v > 0).length,
    down: votes.filter(x => x.v < 0).length,
  };
}

/**
 * Agreement across the driver board's instruments.
 *
 * `changes` = { label: percentChange }. Anything inside ±`dead` counts as
 * neutral rather than being forced to a side. "Aligned" needs every non-neutral
 * driver pointing the same way AND at least two of them — one lone mover is not
 * an alignment.
 */
export function driverAlignment(changes = {}, dead = 0.15) {
  const entries = Object.entries(changes).filter(([, v]) => v != null && Number.isFinite(v));
  let up = 0, down = 0, neutral = 0;
  for (const [, v] of entries) {
    if (v > dead) up++; else if (v < -dead) down++; else neutral++;
  }
  const moving = up + down;
  const label = !entries.length ? 'No data'
    : moving < 2 ? 'Quiet'
    : up && down ? 'Mixed'
    : up ? 'Risk-on tilt' : 'Risk-off tilt';
  return { up, down, neutral, total: entries.length, label };
}
