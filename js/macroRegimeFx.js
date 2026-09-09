/**
 * Macro-Regime-Conditional FX Core — what FX has actually done, historically, in the
 * macro conditions holding right now.
 *
 * Why this exists. today.html can tell you the state of the world — real yields rising,
 * credit tightening, curve inverted — and it can tell you where price is. It cannot
 * tell you what usually HAPPENS NEXT when the world looks like this, so every macro
 * read on the page is an assertion with no precedent behind it. That is the gap between
 * a dashboard and something that teaches.
 *
 * `macro-regime-conditional/README.md` already frames this idea for equities ("most
 * drawdowns cluster around specific macro conditions: liquidity tightening, credit
 * stress, inverted yield curves, rising real yields"). This is the FX version of the
 * same question, built to the same standard: classify each historical day into a
 * regime from observable-at-the-time data, then measure the forward return.
 *
 * ── The three axes ──────────────────────────────────────────────────────────────
 * Chosen because each is a DIFFERENT economic mechanism, not three views of one:
 *   • real     — 20d change in the 10y TIPS yield. The discount rate. Rising real
 *                yields are the textbook headwind for gold and long-duration risk.
 *   • credit   — 20d change in HY OAS. Risk appetite / financing conditions.
 *   • curve    — the LEVEL of 10y minus 2y. Where the market thinks policy goes.
 * Three binary axes = 8 regimes. On ~5 years of daily data that is a few hundred
 * observations each, which is enough for a base rate and nowhere near enough for a
 * confident one — hence every honesty guard below.
 *
 * ── Honesty guards, because a base rate is easy to fake ─────────────────────────
 *   1. NO P-VALUES. Forward windows overlap (a 20-day return on consecutive days
 *      shares 19 of 20 days), so ordinary standard errors are badly wrong and any
 *      t-stat computed here would be a lie with decimal places. `nEffective` reports
 *      the non-overlapping sample size instead, and it is always shown.
 *   2. OOS SPLIT BY TIME. The first `isFrac` of history fits nothing — there is no
 *      fitting here — but it does provide a place to check whether a regime's edge
 *      survives into a period it was not discovered in. `oos` is reported separately
 *      and a regime whose sign flips between halves is flagged `unstable`.
 *   3. MINIMUM SAMPLE. A regime below `minObs` returns its counts and a null read,
 *      never a mean computed from a handful of days.
 *   4. NO FORWARD LEAK. Features use data through day t; the return is measured from
 *      t to t+h. A day without a full forward window is dropped, not truncated.
 *
 * Pure — no fetch, no KV, no globals. Tested on synthetic series in
 * js/macroRegimeFx.test.mjs (no network).
 */

export const DEFAULTS = {
  lookback: 20,       // trading days for the "is it rising/falling" features
  horizons: [5, 20],  // forward return horizons, in trading days
  minObs: 40,         // below this a regime reports counts only
  isFrac: 0.6,        // first 60% of history is the in-sample period
  curveInvertedAt: 0, // 10y-2y below this counts as inverted
};

const round3 = v => (v == null || !Number.isFinite(v) ? null : +v.toFixed(3));
const round1 = v => (v == null || !Number.isFinite(v) ? null : +v.toFixed(1));

/** Align dated series onto one ascending date axis; drops dates missing any input. */
export function alignSeries(byKey = {}) {
  const keys = Object.keys(byKey).filter(k => Array.isArray(byKey[k]) && byKey[k].length);
  if (!keys.length) return { dates: [], cols: {} };
  const maps = {};
  for (const k of keys) {
    const m = new Map();
    for (const p of byKey[k]) if (p?.date != null && Number.isFinite(p.value)) m.set(p.date, p.value);
    maps[k] = m;
  }
  const dates = [...maps[keys[0]].keys()]
    .filter(d => keys.every(k => maps[k].has(d)))
    .sort();
  const cols = {};
  for (const k of keys) cols[k] = dates.map(d => maps[k].get(d));
  return { dates, cols };
}

/**
 * Per-day regime label from data available THAT DAY.
 * Returns { dates, labels, features } with nulls for days lacking a full lookback.
 */
export function classifyRegimes(macro, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { dates, cols } = alignSeries(macro);
  const { real, credit, ten, two } = cols;
  const n = dates.length;
  const labels = new Array(n).fill(null);
  const features = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i < o.lookback) continue;
    const dReal = (real && real[i] != null && real[i - o.lookback] != null) ? real[i] - real[i - o.lookback] : null;
    const dCredit = (credit && credit[i] != null && credit[i - o.lookback] != null) ? credit[i] - credit[i - o.lookback] : null;
    const slope = (ten && two && ten[i] != null && two[i] != null) ? ten[i] - two[i] : null;
    if (dReal == null || dCredit == null || slope == null) continue;
    const a = dReal > 0 ? 'realUp' : 'realDown';
    const b = dCredit > 0 ? 'creditWider' : 'creditTighter';
    const c = slope < o.curveInvertedAt ? 'curveInverted' : 'curveNormal';
    labels[i] = `${a}|${b}|${c}`;
    features[i] = { dReal: round3(dReal), dCredit: round3(dCredit), slope: round3(slope) };
  }
  return { dates, labels, features };
}

/** Human sentence for a regime key — the teaching half. */
export function describeRegime(key) {
  if (!key) return '';
  const [a, b, c] = key.split('|');
  const parts = [
    a === 'realUp' ? 'real yields rising (the discount rate going up)' : 'real yields falling (the discount rate coming down)',
    b === 'creditWider' ? 'credit spreads widening (lenders getting more cautious)' : 'credit spreads tightening (risk appetite improving)',
    c === 'curveInverted' ? 'an inverted yield curve (the market pricing rate cuts ahead)' : 'a normally-sloped curve',
  ];
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}

/** Forward log return over `h` steps, oriented so + means the series went up. */
function forwardReturns(px, h) {
  const out = new Array(px.length).fill(null);
  for (let i = 0; i + h < px.length; i++) {
    const a = px[i], b = px[i + h];
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) out[i] = Math.log(b / a);
  }
  return out;
}

function summarise(vals, h, minObs) {
  const v = vals.filter(Number.isFinite);
  if (!v.length) return { n: 0, nEffective: 0, mean: null, median: null, hitRate: null, enough: false };
  const mean = v.reduce((a, x) => a + x, 0) / v.length;
  const sorted = [...v].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const hit = v.filter(x => x > 0).length / v.length;
  return {
    n: v.length,
    // Overlapping windows: a 20-day return measured on consecutive days reuses 19 of
    // its 20 days. This is the sample size that is actually independent, and it is why
    // no p-value appears anywhere in this file.
    nEffective: Math.max(1, Math.round(v.length / h)),
    mean: round3(mean * 100), median: round3(median * 100), hitRate: round1(hit * 100),
    enough: v.length >= minObs,
  };
}

/**
 * Regime-conditional forward FX returns.
 *
 * `macro` = { real, credit, ten, two } dated series (percent levels).
 * `fx`    = { PAIRNAME: dated series } where a RISING value means the pair went up.
 *           Callers must orient FRED's mixed conventions before calling — DEXJPUS is
 *           JPY per USD, so it is USD/JPY as-is, while DEXUSEU is USD per EUR, i.e.
 *           EUR/USD. Getting this wrong inverts every result, so it is the caller's
 *           explicit job rather than a guess made in here.
 */
export function buildRegimeStudy(macro = {}, fx = {}, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { dates, labels } = classifyRegimes(macro, o);
  if (!dates.length) return { ok: false, reason: 'no aligned macro history', regimes: {}, pairs: [] };

  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const out = {};   // regime -> pair -> horizon -> { all, is, oos }
  const splitAt = Math.floor(dates.length * o.isFrac);
  const pairsDone = [];

  for (const [pair, series] of Object.entries(fx)) {
    if (!Array.isArray(series) || series.length < 100) continue;
    // Project this pair onto the macro date axis (as-of: last known value on/before).
    const m = new Map();
    for (const p of series) if (p?.date != null && Number.isFinite(p.value)) m.set(p.date, p.value);
    const px = dates.map(d => (m.has(d) ? m.get(d) : null));
    if (px.filter(Number.isFinite).length < 100) continue;
    pairsDone.push(pair);
    for (const h of o.horizons) {
      const fwd = forwardReturns(px, h);
      const bucket = {};
      for (let i = 0; i < dates.length; i++) {
        const lab = labels[i];
        if (!lab || fwd[i] == null) continue;
        (bucket[lab] ??= { all: [], is: [], oos: [] });
        bucket[lab].all.push(fwd[i]);
        (i < splitAt ? bucket[lab].is : bucket[lab].oos).push(fwd[i]);
      }
      for (const [lab, b] of Object.entries(bucket)) {
        const all = summarise(b.all, h, o.minObs);
        const is = summarise(b.is, h, Math.round(o.minObs * o.isFrac));
        const oos = summarise(b.oos, h, Math.round(o.minObs * (1 - o.isFrac)));
        // A regime whose direction flips between the two halves has not shown a
        // durable effect, whatever the pooled mean says. Say so on the row.
        const unstable = (is.mean != null && oos.mean != null && Math.sign(is.mean) !== Math.sign(oos.mean));
        ((out[lab] ??= {})[pair] ??= {})[h] = { all, is, oos, unstable };
      }
    }
  }
  const counts = {};
  for (const lab of labels) if (lab) counts[lab] = (counts[lab] ?? 0) + 1;
  return {
    ok: true, regimes: out, counts, pairs: pairsDone,
    dates: { from: dates[0], to: dates[dates.length - 1], n: dates.length },
    splitDate: dates[splitAt] ?? null,
    opts: { lookback: o.lookback, horizons: o.horizons, minObs: o.minObs, isFrac: o.isFrac },
  };
}

/** Today's regime = the label on the most recent classifiable day. */
export function currentRegime(macro, opts = {}) {
  const { dates, labels, features } = classifyRegimes(macro, opts);
  for (let i = dates.length - 1; i >= 0; i--) {
    if (labels[i]) return { key: labels[i], date: dates[i], features: features[i], describe: describeRegime(labels[i]) };
  }
  return null;
}

// ── Calendar effects ─────────────────────────────────────────────────────────
// Month-end rebalancing is a real, documented FX flow: funds hedging foreign equity
// and bond holdings adjust hedges as the month closes, and the flow is mechanical
// rather than informational. It is worth MEASURING rather than assuming, which is
// what this does — same honesty guards as the regime study, and it reports the
// baseline alongside so a "turn of month effect" that merely matches every other day
// is visible as the nothing it is.

/** Business-day position within the month: {fromStart, fromEnd} 1-based over trading days. */
export function businessDayIndex(dates) {
  const months = new Map();
  dates.forEach((d, i) => {
    const k = String(d).slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(i);
  });
  const fromStart = new Array(dates.length).fill(null);
  const fromEnd = new Array(dates.length).fill(null);
  for (const idxs of months.values()) {
    idxs.forEach((gi, j) => { fromStart[gi] = j + 1; fromEnd[gi] = idxs.length - j; });
  }
  return { fromStart, fromEnd };
}

/**
 * Turn-of-month and day-of-week base rates on 1-day forward returns.
 * `window` = how many trading days at each edge of the month count as "the turn".
 */
export function buildCalendarStudy(fx = {}, opts = {}) {
  const o = { ...DEFAULTS, window: 3, ...opts };
  const out = { turnOfMonth: {}, dayOfWeek: {}, pairs: [] };
  for (const [pair, series] of Object.entries(fx)) {
    if (!Array.isArray(series) || series.length < 250) continue;
    const rows = series.filter(p => p?.date != null && Number.isFinite(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const dates = rows.map(r => r.date), px = rows.map(r => r.value);
    const fwd = forwardReturns(px, 1);
    const { fromStart, fromEnd } = businessDayIndex(dates);
    out.pairs.push(pair);

    const turn = [], rest = [];
    const dows = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (let i = 0; i < dates.length; i++) {
      if (fwd[i] == null) continue;
      const isTurn = (fromEnd[i] != null && fromEnd[i] <= o.window) || (fromStart[i] != null && fromStart[i] <= o.window);
      (isTurn ? turn : rest).push(fwd[i]);
      const dow = new Date(dates[i] + 'T00:00:00Z').getUTCDay();
      if (dows[dow]) dows[dow].push(fwd[i]);
    }
    out.turnOfMonth[pair] = {
      turn: summarise(turn, 1, o.minObs), rest: summarise(rest, 1, o.minObs),
      // The comparison IS the result — a turn-of-month mean that matches the baseline
      // is not an effect, however non-zero it looks on its own.
      edgeBp: (turn.length && rest.length)
        ? round1((turn.reduce((a, x) => a + x, 0) / turn.length - rest.reduce((a, x) => a + x, 0) / rest.length) * 10000) : null,
    };
    out.dayOfWeek[pair] = Object.fromEntries(Object.entries(dows).map(([k, v]) => [k, summarise(v, 1, o.minObs)]));
  }
  return out;
}
