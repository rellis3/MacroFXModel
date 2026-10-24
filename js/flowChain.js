// Capital-flow chain — catalogue + lead/lag maths (pure, browser + node).
//
// The course's "capital flow hierarchy" (education/QUANT_MACRO_LESSONS_1-6.md §2.1):
// central banks → government bonds → G10 FX → equities → credit, each level said to
// lag the one above (hours … quarters). This module only DESCRIBES co-movement at a
// chosen lag, for flow-chain.html to chart. It is not a test: the tested verdicts on
// these links live in js/deskEvidence.js (shown beside every chart on the page).
//
// No I/O. Sources: js/flowChainSources.js. Tests: node js/flowChain.test.mjs

export const FLOW_LEVELS = [
  { level: 1, name: 'Central banks', lag: 'the source' },
  { level: 2, name: 'Government bonds', lag: 'hours to days' },
  { level: 3, name: 'G10 FX', lag: 'days to weeks' },
  { level: 4, name: 'Equities', lag: 'weeks to months' },
  { level: 5, name: 'Credit', lag: 'months to quarters' },
];

// kind: 'rate' (a yield or policy rate in %, changes in bp) | 'price' (log-return changes, %).
// ohlc: true → drawn as candles. src says where the server gets it (flowChainSources.js).
export const FLOW_SERIES = {
  us_ff:   { label: 'Fed funds (effective)', level: 1, kind: 'rate', src: 'FRED DFF' },
  ecb_dfr: { label: 'ECB deposit rate', level: 1, kind: 'rate', src: 'ECB FM.D.U2.EUR.4F.KR.DFR.LEV' },
  boe_bank:{ label: 'BoE Bank Rate', level: 1, kind: 'rate', src: 'BoE IADB IUDBEDR' },
  us_2y:   { label: 'US 2Y', level: 2, kind: 'rate', src: 'FRED DGS2' },
  us_10y:  { label: 'US 10Y', level: 2, kind: 'rate', src: 'FRED DGS10' },
  de_2y:   { label: 'Germany 2Y', level: 2, kind: 'rate', src: 'Bundesbank BBSIS R02XX' },
  de_10y:  { label: 'Germany 10Y', level: 2, kind: 'rate', src: 'Bundesbank BBSIS R10XX' },
  jp_2y:   { label: 'Japan 2Y', level: 2, kind: 'rate', src: 'MoF Japan jgbcme 2Y' },
  jp_10y:  { label: 'Japan 10Y', level: 2, kind: 'rate', src: 'MoF Japan jgbcme 10Y' },
  uk_10y:  { label: 'Gilt 10Y', level: 2, kind: 'rate', src: 'BoE IADB IUDMNZC' },
  eurusd:  { label: 'EUR/USD', level: 3, kind: 'price', ohlc: true, oanda: 'EUR_USD', yahoo: 'EURUSD=X' },
  usdjpy:  { label: 'USD/JPY', level: 3, kind: 'price', ohlc: true, oanda: 'USD_JPY', yahoo: 'JPY=X' },
  gbpusd:  { label: 'GBP/USD', level: 3, kind: 'price', ohlc: true, oanda: 'GBP_USD', yahoo: 'GBPUSD=X' },
  xauusd:  { label: 'Gold', level: 3, kind: 'price', ohlc: true, oanda: 'XAU_USD', yahoo: 'GC=F' },
  nas100:  { label: 'Nasdaq 100', level: 4, kind: 'price', ohlc: true, oanda: 'NAS100_USD', yahoo: '^NDX' },
  spx500:  { label: 'S&P 500', level: 4, kind: 'price', ohlc: true, oanda: 'SPX500_USD', yahoo: '^GSPC' },
  baa10y:  { label: "Moody's Baa − 10Y", level: 5, kind: 'rate', src: 'FRED BAA10Y' },
  hy_oas:  { label: 'High-yield OAS', level: 5, kind: 'rate', src: 'FRED BAMLH0A0HYM2 (recent years only)' },
};

// Derived spreads (leader candidates the course names): a − b, in % (changes in bp).
export const FLOW_SPREADS = {
  us_de_2y:  { label: 'US − Germany 2Y', level: 2, a: 'us_2y', b: 'de_2y' },
  us_jp_2y:  { label: 'US − Japan 2Y', level: 2, a: 'us_2y', b: 'jp_2y' },
  us_de_10y: { label: 'US − Germany 10Y', level: 2, a: 'us_10y', b: 'de_10y' },
  us_uk_10y: { label: 'US − UK 10Y', level: 2, a: 'us_10y', b: 'uk_10y' },
  us_2s10s:  { label: 'US 2s10s curve', level: 2, a: 'us_10y', b: 'us_2y' },
};

export const kindOf = id => (FLOW_SERIES[id]?.kind) ?? (FLOW_SPREADS[id] ? 'rate' : 'price');
export const labelOf = id => FLOW_SERIES[id]?.label ?? FLOW_SPREADS[id]?.label ?? id;
export const levelOf = id => FLOW_SERIES[id]?.level ?? FLOW_SPREADS[id]?.level ?? null;

const fin = v => typeof v === 'number' && Number.isFinite(v);

/** Close (or value) column for an id from the server payload {dates, line, ohlc}; spreads computed. */
export function columnOf(payload, id) {
  if (FLOW_SPREADS[id]) {
    const { a, b } = FLOW_SPREADS[id];
    const A = columnOf(payload, a), B = columnOf(payload, b);
    return A.map((v, i) => (fin(v) && fin(B[i]) ? v - B[i] : null));
  }
  if (payload.ohlc?.[id]) return payload.ohlc[id].c.slice();
  return (payload.line?.[id] ?? []).slice();
}

/** Forward-fill gaps of at most `maxGap` rows (holidays differ by market); longer gaps stay null. */
export function ffill(col, maxGap = 5) {
  const out = col.slice(); let last = null, gap = 0;
  for (let i = 0; i < out.length; i++) {
    if (fin(out[i])) { last = out[i]; gap = 0; }
    else if (last != null && ++gap <= maxGap) out[i] = last;
  }
  return out;
}

/** N-row change ending at each row: bp for rates, log-return % for prices. null if either end missing. */
export function changes(col, n, kind) {
  const out = new Array(col.length).fill(null);
  for (let i = n; i < col.length; i++) {
    const a = col[i - n], b = col[i];
    if (!fin(a) || !fin(b)) continue;
    out[i] = kind === 'rate' ? (b - a) * 100 : (a > 0 && b > 0 ? Math.log(b / a) * 100 : null);
  }
  return out;
}

/** Pearson r of x[t] with y[t+lag] over rows t in [from, to). */
export function corrAtLag(x, y, lag, from = 0, to = x.length) {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let t = Math.max(from, -lag); t < to && t + lag < y.length; t++) {
    const a = x[t], b = y[t + lag];
    if (!fin(a) || !fin(b)) continue;
    n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
  }
  if (n < 30) return { r: null, n };
  const cov = sxy - sx * sy / n, vx = sxx - sx * sx / n, vy = syy - sy * sy / n;
  return { r: vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null, n };
}

/**
 * Lead/lag profile of the leader's N-day change (ending t) against the follower's N-day change
 * ending t + lag, for lag in [-maxLag, maxLag]. lag 0 = the same window. |lag| < n: the two
 * windows overlap, so a non-zero r there is partly the same move, not a lead. lag >= n: the
 * leader's window ends before the follower's starts (a genuine lead); lag <= -n: the follower leads.
 */
export function leadLagProfile(x, y, { n, maxLag, from = 0, to = x.length }) {
  const out = [];
  for (let L = -maxLag; L <= maxLag; L++) out.push({ lag: L, ...corrAtLag(x, y, L, from, to), overlap: Math.abs(L) < n });
  return out;
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Chance levels from the same profile with the leader circularly shifted by a random offset of at
 * least `minShift` rows (the relationship destroyed, each series' own persistence kept). Seeded.
 *   lo / hi       2.5% / 97.5% of r pooled over every lag and shift: the band for ONE lag looked at
 *                 on its own (constant across lags; pooling makes it stable with few shifts)
 *   searchLead    95% of the BEST |r| over the lead lags (lag >= n) in each shift: what the strongest
 *                 lead in the profile reaches with no link at all. Picking the best-looking lag is a
 *                 search, so a picked lag is judged against this, not against lo / hi.
 *   searchFoll    the same for the follower-first lags (lag <= -n)
 */
export function placeboBand(x, y, { n, maxLag, from = 0, to = x.length, shifts = 40, minShift = 250, seed = 20261024 }) {
  const rng = mulberry32(seed), span = to - from, size = 2 * maxLag + 1;
  const empty = { lo: new Array(size).fill(null), hi: new Array(size).fill(null), searchLead: null, searchFoll: null };
  if (span < 2 * minShift) return empty;
  const pool = [], bestLead = [], bestFoll = [];
  for (let s = 0; s < shifts; s++) {
    const k = minShift + Math.floor(rng() * (span - 2 * minShift));
    const xs = x.slice();
    for (let t = from; t < to; t++) xs[t] = x[from + ((t - from + k) % span)];
    let bl = 0, bf = 0;
    for (const p of leadLagProfile(xs, y, { n, maxLag, from, to })) {
      if (p.r == null) continue;
      pool.push(p.r);
      if (p.lag >= n) bl = Math.max(bl, Math.abs(p.r));
      if (p.lag <= -n) bf = Math.max(bf, Math.abs(p.r));
    }
    bestLead.push(bl); bestFoll.push(bf);
  }
  const q = (a, f) => { if (!a.length) return null; const v = a.slice().sort((m, n2) => m - n2); return v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))]; };
  const lo = q(pool, 0.025), hi = q(pool, 0.975);
  return { lo: new Array(size).fill(lo), hi: new Array(size).fill(hi), searchLead: q(bestLead, 0.95), searchFoll: q(bestFoll, 0.95) };
}

/** Rows index range [from, to) for dates in [d0, d1] (inclusive). */
export function rangeIdx(dates, d0, d1) {
  let from = 0, to = dates.length;
  if (d0) { from = dates.findIndex(d => d >= d0); if (from < 0) from = dates.length; }
  if (d1) { const j = dates.findIndex(d => d > d1); to = j < 0 ? dates.length : j; }
  return { from, to };
}

/** Effective count of non-overlapping windows behind a profile point (for the reader, not a test). */
export const independentWindows = (nPairs, n) => Math.floor(nPairs / Math.max(1, n));
