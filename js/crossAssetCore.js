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

/**
 * Equities vs credit over the last `days` observations — Lesson 6's lead
 * divergence ("equities rallying + credit widening: credit is often right at
 * turning points").
 *
 * `spx` = ascending [{date, value}] index closes; `hy` = ascending
 * [{date, value}] HY OAS in percent points (FRED BAMLH0A0HYM2). Each series is
 * measured over its OWN last `days` observations, so a lagging FRED print does
 * not shift the equity window.
 *
 * Returns { spxPct, hyBp, state } where state is:
 *   'divergent'  — equities up ≥ minEqPct while HY widened ≥ minHyBp
 *   'confirming' — both point the same way (risk-on or risk-off)
 *   'quiet'      — either leg inside its threshold
 * or null when either series is too short. Thresholds are descriptive cut-offs,
 * not fitted or tested here.
 */
export function equityCreditDivergence(spx, hy, { days = 20, minEqPct = 2, minHyBp = 25 } = {}) {
  const chg = (pts, pct) => {
    const v = (pts ?? []).map(p => Number(p?.value)).filter(Number.isFinite);
    if (v.length < days + 1) return null;
    const a = v[v.length - 1 - days], b = v[v.length - 1];
    return pct ? (a > 0 ? (b / a - 1) * 100 : null) : (b - a) * 100;   // OAS % → bp
  };
  const spxPct = chg(spx, true), hyBp = chg(hy, false);
  if (spxPct == null || hyBp == null) return null;
  const eqUp = spxPct >= minEqPct, eqDn = spxPct <= -minEqPct;
  const crWide = hyBp >= minHyBp, crTight = hyBp <= -minHyBp;
  const state = eqUp && crWide ? 'divergent'
    : (eqUp && crTight) || (eqDn && crWide) ? 'confirming'
    : 'quiet';
  return { spxPct: +spxPct.toFixed(2), hyBp: Math.round(hyBp), state };
}

/**
 * Change over the last `n` observations of an ascending [{date, value}] series.
 * mode 'pct' → percent change; 'bp' → (b − a) × 100 (a % series into basis
 * points); 'abs' → b − a. Null when the series is too short.
 */
export function seriesChange(pts, n = 20, mode = 'abs') {
  const v = (pts ?? []).map(p => Number(p?.value)).filter(Number.isFinite);
  if (v.length < n + 1) return null;
  const a = v[v.length - 1 - n], b = v[v.length - 1];
  if (mode === 'pct') return a > 0 ? (b / a - 1) * 100 : null;
  return mode === 'bp' ? (b - a) * 100 : b - a;
}

/**
 * Cross-asset coherence — Lesson 6: "are the markets telling one story?"
 *
 * `legs` = [{ name, change, riskOnWhen: 'up' | 'down', dead }]. Each leg votes
 * risk-on (+1) or risk-off (−1) when its change is beyond ±dead in the stated
 * direction, and abstains inside the dead band or when it has no data.
 *
 * score = |on − off| / voting × 100 — 100 means every market that moved told
 * the same story, 0 means they split evenly. Fewer than 3 voting legs → no
 * score (two markets agreeing is not a board). The cut-offs are descriptive,
 * untested here: high coherence is the lesson's "trends tend to persist"
 * state, low is its "someone is wrong, or a transition — size down".
 */
export function coherenceScore(legs = []) {
  const votes = [];
  for (const l of legs) {
    const c = l?.change;
    if (c == null || !Number.isFinite(c)) continue;
    const dead = l.dead ?? 0;
    if (Math.abs(c) <= dead) { votes.push({ name: l.name, vote: 0 }); continue; }
    const up = c > 0;
    votes.push({ name: l.name, vote: (up === (l.riskOnWhen === 'up')) ? 1 : -1 });
  }
  const on = votes.filter(v => v.vote > 0), off = votes.filter(v => v.vote < 0);
  const voting = on.length + off.length;
  if (voting < 3) return { score: null, story: 'not enough movement', on: on.length, off: off.length, quiet: votes.length - voting, dissent: [], votes };
  const net = on.length - off.length;
  const score = Math.round(Math.abs(net) / voting * 100);
  const story = net > 0 ? 'risk-on' : net < 0 ? 'risk-off' : 'split';
  const dissent = (net > 0 ? off : net < 0 ? on : []).map(v => v.name);
  const state = score >= 70 ? 'high' : score >= 40 ? 'moderate' : 'low';
  return { score, story, state, on: on.length, off: off.length, quiet: votes.length - voting, dissent, votes };
}

/**
 * Which regime transition the daily tells are leaning toward — Lesson 6's
 * "regime transition signals" table, read from 20-session changes.
 *
 * Input (all optional, basis points except vix in points and commodity in %):
 *   { d2y, d10y, dBei, dHy, dVix, dCommodity }
 * Curve: steepening if 10Y − 2Y widened > `curveDead`bp, flattening if it
 * narrowed; bull if the average of the two yields fell > `levelDead`bp, bear
 * if it rose.
 *
 * Each candidate has three tells; a lean needs ≥ 2 of 3 and a unique best.
 * This is a description of where the tells point, not a forecast; the
 * monthly regime label stays the regime.
 */
export function transitionLean(d = {}, { curveDead = 5, levelDead = 5, beiDead = 10, hyDead = 15, vixDead = 3, cmdDead = 3 } = {}) {
  const fin = x => x != null && Number.isFinite(x);
  const curve = fin(d.d2y) && fin(d.d10y) ? d.d10y - d.d2y : null;
  const level = fin(d.d2y) && fin(d.d10y) ? (d.d2y + d.d10y) / 2 : null;
  const steep = curve != null && curve > curveDead, flat = curve != null && curve < -curveDead;
  const bull = level != null && level < -levelDead, bear = level != null && level > levelDead;
  const shape = curve == null ? null : `${bull ? 'bull ' : bear ? 'bear ' : ''}${steep ? 'steepening' : flat ? 'flattening' : 'curve unchanged'}`;
  const beiUp = fin(d.dBei) && d.dBei > beiDead, beiStable = fin(d.dBei) && Math.abs(d.dBei) <= beiDead;
  const beiNotFalling = fin(d.dBei) && d.dBei >= -beiDead / 2;
  const hyTight = fin(d.dHy) && d.dHy < -hyDead / 3, hyWide = fin(d.dHy) && d.dHy > hyDead;
  const vixSpike = fin(d.dVix) && d.dVix > vixDead;
  const cmdUp = fin(d.dCommodity) && d.dCommodity > cmdDead;
  const C = {
    goldilocks: [[bull && steep, 'bull steepening'], [hyTight, 'credit tightening'], [beiStable, 'breakevens stable']],
    reflation: [[beiUp, 'breakevens rising'], [cmdUp, 'commodities breaking out'], [bear && steep, 'bear steepening']],
    // "Curve flattening from the short end" = BEAR flattening: the 2Y rising and
    // rising faster than the 10Y. A bull flattener (both falling) is deflation's tell.
    stagflation: [[beiNotFalling, 'breakevens holding up'], [flat && fin(d.d2y) && fin(d.d10y) && d.d2y > 0 && d.d2y > d.d10y, 'flattening from the short end'], [hyWide, 'credit widening']],
    deflation: [[bull && flat, 'bull flattening'], [hyWide, 'credit widening'], [vixSpike, 'vol spiking']],
  };
  const scored = Object.entries(C).map(([k, tells]) => ({ k, hit: tells.filter(t => t[0]).map(t => t[1]) }))
    .sort((a, b) => b.hit.length - a.hit.length);
  const best = scored[0], next = scored[1];
  const lean = best.hit.length >= 2 && best.hit.length > next.hit.length ? best.k : null;
  return { lean, tells: lean ? best.hit : [], shape, curveBp: curve == null ? null : Math.round(curve), scores: Object.fromEntries(scored.map(s => [s.k, s.hit.length])) };
}
