/**
 * Bias engine v1 (plans/BIAS_ENGINE_SPEC.md): an explainable, rule-based macro bias for every market.
 *
 * Inputs -> one record: the eight currencies, the global risk score R, all 28 crosses as (s_base - s_quote) / 2, and
 * the asset models (gold, silver, WTI, copper, NQ, SPX500, US30, US2000, DE30, UK100). Every driver reading is turned
 * into d in {-2, -1, 0, +1, +2} by the fixed thresholds below; a market's score is the weighted mean of the d's it has
 * (missing drivers dropped, weights renormalised, `coverage` = the share of weight present). Weights 'theory-v1',
 * revised only from the forward record (forecaster `bias-engine` on the bias scoreboard).
 *
 * NOT a validated trade signal. Pure and deterministic: no fetch, no KV, no clock (the issue time is `inputs.asOf`).
 * A driver whose input was published after the issue time, or is older than its age budget, is dropped and listed in
 * `missing` with the reason. Tested in js/biasEngine.test.mjs.
 *
 * Input shape (every block optional; the server's gatherer fills it, server.js _beGather):
 *   asOf          ISO issue time
 *   policy        { CCY: { weekBp, horizon, asOf, source } }      priced policy change over ~5 sessions (rate up = hawkish)
 *                 (or, when the futures are missing or stale, the 2y yield proxy: { weekBp, asOf, source, proxy: true, futuresWhy };
 *                 see fillPolicyFallback)
 *   policyWhy     { CCY: reason }                                 why a currency has no policy input (both paths unusable)
 *   stance        { CCY: { score (-1..1 hawkish), meetingDate, asOf, source } }
 *   rates         { CCY: { level (%), z (vs own history), asOf, source } }
 *   data          { CCY: { score (-1..1), asOf, source } }      growth / inflation / labour / demand, rates excluded
 *   realYield     { CCY: { level (%), z, asOf, source } }
 *   usReal        { chg20bp, level, asOf, source }               US 10y real yield (TIPS), 20-day change
 *   cot           { CCY|ASSET: { pct, share, asOf, source } }   currencies in "long the currency" terms, assets in own terms
 *   risk          { vix: { level, pct1y, asOf, source }, vixTerm: { ratio, asOf, source }, hy: { chg20bp, level, asOf, source } }
 *   prices        { d1: { NAME: [{ t (bar open ms), c, complete }] }, h4: { ... } }  NAME = EURUSD..USDCHF (USD majors), GOLD, ...
 */
import { legsOf } from './terminal/pairView.js';

export const ENGINE_VERSION = 'bias-engine-v1';
export const WEIGHTS_VERSION = 'theory-v1';
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
/** Market convention for which currency is the base (earlier = base). */
export const CCY_PRIORITY = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
/** The seven USD majors the currency basket is built from. */
export const USD_PAIRS = { EUR: 'EURUSD', GBP: 'GBPUSD', AUD: 'AUDUSD', NZD: 'NZDUSD', JPY: 'USDJPY', CAD: 'USDCAD', CHF: 'USDCHF' };
export const ASSETS = ['GOLD', 'SILVER', 'WTI', 'COPPER', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'];

// ── theory-v1 weights ───────────────────────────────────────────────────────────────────────────────────────────
export const CCY_WEIGHTS = { policy: 0.25, rates: 0.20, data: 0.20, realYield: 0.10, risk: 0.10, commodity: 0.05, positioning: 0.05, trend: 0.05 };
export const GOLD_WEIGHTS = { realYield: 0.25, usd: 0.25, fedPath: 0.15, risk: 0.10, positioning: 0.10, trend: 0.15 };
export const INDEX_WEIGHTS = { rates: 0.20, fedPath: 0.15, risk: 0.25, data: 0.15, positioning: 0.10, trend: 0.15 };
export const EU_INDEX_WEIGHTS = { ratesPath: 0.20, ccy: 0.15, risk: 0.25, data: 0.15, trend: 0.15, positioning: 0.10 };
export const CMDTY_WEIGHTS = { usd: 0.20, globalData: 0.25, risk: 0.20, inventories: 0.15, trend: 0.20 };
export const RISK_WEIGHTS = { vixLevel: 0.25, vixTerm: 0.25, credit: 0.25, spxTrend: 0.25 };
/** How each market leans on global risk (R > 0 = risk-on). Silver is gold's model with +0.5 (industrial). */
export const RISK_ROLE = { USD: -0.5, JPY: -1, CHF: -1, EUR: 0, GBP: 0.25, CAD: 0.5, AUD: 1, NZD: 1, GOLD: -0.5, SILVER: 0.5,
  NQ: 1, SPX500: 1, US30: 1, US2000: 1, DE30: 1, UK100: 1, WTI: 1, COPPER: 1 };
/** Commodity link: which price feed each currency exports. NZD's dairy has no feed (missing, not n/a). */
export const COMMODITY_OF = { AUD: 'COPPER', CAD: 'WTI', NZD: null };

// ── thresholds: reading -> d. band(x, [t1, t2]): |x| >= t2 -> ±2, |x| >= t1 -> ±1, else 0 ──────────────────────────
export const TH = {
  policyWeekBp: [5, 15],          // priced change over ~5 sessions, bp (hawkish +)
  stance: 0.5,                    // |hawkishScore| >= 0.5 adds ±1 to the policy d (clamped to ±2)
  ratesZ: [0.5, 1.5],             // short rate z vs its own last 24 prints
  ratesGapPp: 1.5,                // short rate vs the 8-currency average: ±1 at >= 1.5 pp
  data: [0.15, 0.5],              // data momentum score (-1..1)
  realGapPp: 1.0,                 // 10y real yield vs the peers' average: ±1 at >= 1 pp
  realZ: 1.0,                     // real yield z vs own history: ±1 at >= 1
  roleR: [0.3, 1.0],              // role × R
  commodityPct: [2, 6],           // 20-day % change of the export commodity
  cotPct: { crowded: 90, leaning: 75 },   // positioning percentile (contrarian): >= 90 & net long -> -2, >= 75 -> -1 (mirror below)
  trendZ: [0.15, 0.6],            // EMA20 5-bar slope in σ·√5 units, per timeframe
  usRealChg20bp: [8, 25],         // US 10y real yield 20-day change, bp (falling -> + for gold and indices)
  usdScore: [0.3, 1.0],           // s_USD -> d (inverted for gold, metals, oil)
  vixPct: { low: [20, 40], high: [60, 80] },   // VIX vs its own 1-year percentile: < 20 -> +2, < 40 -> +1, > 60 -> -1, > 80 -> -2
  vixTerm: { inverted: 1.0, flat: 0.95, steep: 0.85 },   // VIX/VIX3M >= 1 -> -2, >= 0.95 -> -1, <= 0.85 -> +1
  hyChg20bp: [20, 50],            // HY OAS 20-day change, bp (widening -> risk-off)
  spxRet20Pct: [1, 3],            // S&P 500 20-day % return
  globalDataMin: 4,               // currencies needed for a global data momentum read
};
/** Age budget per input, days (older -> dropped as stale). Monthly series (rates, real yield, data) get 120. */
export const MAX_AGE_DAYS = { policy: 10, stance: 120, rates: 120, data: 120, realYield: 120, usReal: 7, cot: 14, risk: 7, prices: 7 };
export const NEUTRAL_MAX_STRENGTH = 2, MIN_COVERAGE = 0.5, CONFLICT_GAP = 0.1;
/** What the desk's data universe holds at all. A driver outside it is NOT APPLICABLE (out of the weight base), not missing:
 *  coverage measures temporary data failure, never a series we have never had (owner 2026-11-16: everything came out Neutral). */
export const REAL_YIELD_UNIVERSE = ['USD', 'EUR', 'CHF'];
export const COT_UNIVERSE_MISSING = ['USD', 'SILVER', 'WTI', 'COPPER', 'DE30', 'UK100'];
export const FOOTNOTE = 'Rule-based macro checklist, weights theory-v1, scored forward on the bias scoreboard; not a trade signal. Back-test 2010-2026 (bias-engine-backtest): no direction skill at 1, 5 or 20 days.';

const DAY = 864e5, H4 = 4 * 3600e3;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/** Sign-symmetric rounding, so a pair and its inverse round to exact negatives. */
export const rnd = (x, k = 3) => (Number.isFinite(x) ? Math.sign(x) * Math.round(Math.abs(x) * 10 ** k) / 10 ** k + 0 : null);
const fin = x => typeof x === 'number' && Number.isFinite(x);
const sgn = (x, k = 2) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(k);
const pctS = x => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}%`;

export function band(x, [t1, t2]) {
  if (!fin(x)) return null;
  const a = Math.abs(x), s = Math.sign(x);
  return a >= t2 ? 2 * s : a >= t1 ? s : 0;
}

/** null if usable, else the reason: published after the issue, or past its age budget. */
export function unusable(asOf, issueMs, maxAgeDays) {
  const t = Date.parse(asOf ?? '');
  if (!Number.isFinite(t)) return 'no date';
  if (t > issueMs) return 'published after the issue time';
  if (maxAgeDays != null && issueMs - t > maxAgeDays * DAY) return `stale (${Math.floor((issueMs - t) / DAY)} days old)`;
  return null;
}

// ── policy path: futures first, the 2y government yield as the fallback ────────────────────────────────────────
/**
 * Per currency: the futures-based priced change when it is usable (dated, not after the issue, within
 * MAX_AGE_DAYS.policy, with a week change); otherwise the 2y government yield's change over the last 5 business days
 * (js/yield2y.js), marked proxy: true; otherwise nothing, with both reasons in `why`.
 *   futures  { CCY: { weekBp, horizon, asOf, source } }
 *   proxy    { CCY: { weekBp, asOf, source, level? } }      (or { why } when the 2y series could not give a change)
 * Returns { policy, why, used: { CCY: 'futures' | 'proxy' } }. Pure.
 */
export function fillPolicyFallback(futures, proxy, issueMs, ccys = CCYS) {
  const policy = {}, why = {}, used = {};
  const reason = (x, what) => (!x ? 'no data' : x.why && !fin(x.weekBp) ? x.why : unusable(x.asOf, issueMs, MAX_AGE_DAYS.policy) ?? (fin(x.weekBp) ? null : `no week change in the ${what}`));
  for (const c of ccys) {
    const f = futures?.[c], fWhy = reason(f, 'futures pull');
    if (!fWhy) { policy[c] = f; used[c] = 'futures'; continue; }
    const p = proxy?.[c], pWhy = reason(p, '2y series');
    if (!pWhy) { policy[c] = { ...p, proxy: true, futuresWhy: f ? fWhy : 'no futures' }; used[c] = 'proxy'; continue; }
    why[c] = `no policy expectations (futures: ${f ? fWhy : 'none'}; 2y proxy: ${pWhy})`;
  }
  return { policy, why, used };
}

// ── trend from candles ──────────────────────────────────────────────────────────────────────────────────────────
const ema = (xs, n) => { const k = 2 / (n + 1), out = []; let e = null; for (const x of xs) { e = e == null ? x : e + k * (x - e); out.push(e); } return out; };
/** Closed bars only: complete and closed at or before the issue time. Oldest first. */
export function closedBars(bars, issueMs, durMs) {
  return (bars ?? []).filter(b => b && fin(b.c) && b.c > 0 && fin(b.t) && b.complete !== false && b.t + durMs <= issueMs).sort((a, b) => a.t - b.t);
}
/** EMA20 slope over the last 5 bars of a log series, in σ·√5 units (σ = SD of the last 60 one-bar changes). */
export function slopeZ(logs) {
  if (!logs || logs.length < 30) return null;
  const e = ema(logs, 20), r = logs.slice(1).map((x, i) => x - logs[i]).slice(-60);
  const m = r.reduce((s, x) => s + x, 0) / r.length, sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, r.length - 1));
  if (!(sd > 0)) return 0;
  return (e.at(-1) - e.at(-6)) / (sd * Math.sqrt(5));
}
/**
 * D1 + H4 trend -> d. Both agree: ±1, or ±2 when both are strong. They conflict (or either is flat): 0, the gold
 * method's "Daily BULL, 4H BEAR = NEUTRAL". H4 missing: D1 alone, capped at ±1.
 */
export function trendD(zD1, zH4) {
  const a = band(zD1, TH.trendZ), b = band(zH4, TH.trendZ);
  if (a == null) return null;
  if (b == null) return clamp(a, -1, 1);
  if (!a || !b || Math.sign(a) !== Math.sign(b)) return 0;
  return Math.abs(a) === 2 && Math.abs(b) === 2 ? 2 * Math.sign(a) : Math.sign(a);
}
const trendWord = z => (z == null ? 'n/a' : z >= TH.trendZ[0] ? `up (${z.toFixed(2)})` : z <= -TH.trendZ[0] ? `down (${z.toFixed(2)})` : `flat (${z.toFixed(2)})`);

/** Each currency's log index against the equal-weight 8-currency basket, from the USD majors, aligned on bar time. */
export function basketIndex(byPair, issueMs, durMs) {
  const series = {};
  for (const [c, p] of Object.entries(USD_PAIRS)) series[c] = new Map(closedBars(byPair?.[p], issueMs, durMs).map(b => [b.t, b.c]));
  if (Object.values(series).some(m => !m.size)) return null;
  const ts = [...series.EUR.keys()].filter(t => Object.values(series).every(m => m.has(t))).sort((a, b) => a - b);
  const out = Object.fromEntries(CCYS.map(c => [c, []]));
  for (const t of ts) {
    const x = { USD: 0 };
    for (const [c, p] of Object.entries(USD_PAIRS)) x[c] = p.startsWith('USD') ? -Math.log(series[c].get(t)) : Math.log(series[c].get(t));
    const m = CCYS.reduce((s, c) => s + x[c], 0) / CCYS.length;
    for (const c of CCYS) out[c].push(x[c] - m);
  }
  return { index: out, lastT: ts.at(-1) ?? null };
}

// ── combining drivers ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * drivers: [{ key, label, w, d|null, reading, source, asOf, why? }]; d null = missing (dropped). `na: true` = not
 * applicable to this market (out of the weight base entirely). Returns score, coverage, the used drivers with wNorm and
 * contrib (contributions sum to the score), and the missing list.
 */
export function combine(drivers) {
  const app = drivers.filter(x => !x.na), used = app.filter(x => fin(x.d)), wAll = app.reduce((s, x) => s + x.w, 0), wUsed = used.reduce((s, x) => s + x.w, 0);
  const out = used.map(x => { const wNorm = x.w / wUsed; return { key: x.key, label: x.label, reading: x.reading, d: x.d, w: x.w, wNorm: rnd(wNorm, 4), contrib: rnd(wNorm * x.d, 4), source: x.source, asOf: x.asOf ?? null, ...(x.proxy ? { proxy: true } : {}) }; });
  const score = wUsed > 0 ? used.reduce((s, x) => s + (x.w / wUsed) * x.d, 0) : null;
  return { score: score == null ? null : rnd(score, 4), coverage: wAll > 0 ? rnd(wUsed / wAll, 3) : 0, drivers: out,
    missing: app.filter(x => !fin(x.d)).map(x => ({ key: x.key, label: x.label, w: x.w, why: x.why ?? 'no data' })) };
}

/**
 * The label: strength = clamp(round(|s| × 5), 0, 10), direction = sign(s), Neutral when strength <= 2, coverage < 0.5,
 * or the two largest contributions have opposite signs and differ (in size) by < 0.1.
 */
export function labelOf(score, coverage, contribs) {
  if (!fin(score)) return { dir: 'NEUTRAL', strength: 0, neutral: 'no drivers' };
  const strength = clamp(Math.round(Math.abs(score) * 5), 0, 10);
  const top = [...contribs].filter(fin).sort((a, b) => Math.abs(b) - Math.abs(a));
  // ties for second place count as opposed if any of them is (so a pair and its inverse always agree)
  const m2 = top.length >= 2 ? Math.abs(top[1]) : null;
  const opposed = m2 != null && top.slice(1).some(x => Math.abs(Math.abs(x) - m2) < 1e-12 && Math.sign(x) * Math.sign(top[0]) < 0);
  let neutral = null;
  if (coverage < MIN_COVERAGE) neutral = `coverage ${coverage.toFixed(2)} < ${MIN_COVERAGE}`;
  else if (strength <= NEUTRAL_MAX_STRENGTH) neutral = `strength ${strength} ≤ ${NEUTRAL_MAX_STRENGTH}`;
  else if (opposed && Math.abs(top[0]) - m2 < CONFLICT_GAP - 1e-9) neutral = 'the two largest drivers pull opposite ways';
  return { dir: neutral ? 'NEUTRAL' : score > 0 ? 'BULLISH' : 'BEARISH', strength, neutral };
}
const dirWord = d => ({ BULLISH: 'Bullish', BEARISH: 'Bearish', NEUTRAL: 'Neutral' }[d]);

/** One-line "why": the label, then the drivers for and against, largest first. */
export function whyLine(name, m) {
  const ds = [...m.drivers].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)).filter(x => x.contrib !== 0);
  const s = m.score ?? 0, pro = ds.filter(x => Math.sign(x.contrib) === Math.sign(s)).slice(0, 3), con = ds.filter(x => Math.sign(x.contrib) === -Math.sign(s)).slice(0, 2);
  const f = x => `${x.leg ? `${x.leg} ` : ''}${x.label} ${sgn(x.contrib)} (${x.reading})`;
  const head = m.dir === 'NEUTRAL' ? `${name} Neutral (score ${sgn(s)}, would be ${m.strength}/10, coverage ${Math.round(m.coverage * 100)}%)`
    : `${name} ${dirWord(m.dir)} ${m.strength}/10 (score ${sgn(s)}, coverage ${Math.round(m.coverage * 100)}%)`;
  if (!ds.length) return `${head}: no driver is pushing either way.`;
  return `${head}${m.neutral ? `, neutral because ${m.neutral}` : ''}: ${pro.length ? pro.map(f).join('; ') : 'nothing for'}${con.length ? `; against: ${con.map(f).join('; ')}` : ''}.`;
}
/** What would change the label: how far the score is from the ±0.5 neutral line, and the largest support. */
export function flipLine(m) {
  const s = m.score ?? 0, line = 0.5;
  if (m.coverage < MIN_COVERAGE) return `Neutral for lack of data (coverage ${Math.round(m.coverage * 100)}%): needs drivers worth ${Math.round(MIN_COVERAGE * 100)}% of the weight before it can call a side.`;
  const ds = [...m.drivers].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  if (m.dir === 'NEUTRAL') {
    const top = ds[0];
    return `Takes a side above +${line.toFixed(2)} (Bullish) or below −${line.toFixed(2)} (Bearish); now ${sgn(s)}.${top ? ` The largest pull is ${top.leg ? `${top.leg} ` : ''}${top.label} (${sgn(top.contrib)}).` : ''}`;
  }
  const sup = ds.find(x => Math.sign(x.contrib) === Math.sign(s)), side = s > 0 ? 'Bearish' : 'Bullish';
  const rest = sup ? s - sup.contrib : s;
  return `Turns Neutral if the score moves inside ±${line.toFixed(2)} (now ${sgn(s)}) and ${side} beyond ${s > 0 ? '−' : '+'}${line.toFixed(2)}.${sup ? ` The largest support is ${sup.leg ? `${sup.leg} ` : ''}${sup.label} (${sgn(sup.contrib)}, ${sup.reading}); if it went to zero the score would be ${sgn(rest)}.` : ''}`;
}
function finish(name, c, extra = {}) {
  const lab = labelOf(c.score, c.coverage, c.drivers.map(x => x.contrib));
  const m = { score: c.score, dir: lab.dir, strength: lab.strength, coverage: c.coverage, ...(lab.neutral ? { neutral: lab.neutral } : {}), ...extra, drivers: c.drivers, missing: c.missing };
  m.why = whyLine(name, m); m.flip = flipLine(m);
  return m;
}

// ── the risk score ──────────────────────────────────────────────────────────────────────────────────────────────
function pctD(p) {
  const { low, high } = TH.vixPct;
  return !fin(p) ? null : p < low[0] ? 2 : p < low[1] ? 1 : p > high[1] ? -2 : p > high[0] ? -1 : 0;
}
function termD(r) { const t = TH.vixTerm; return !fin(r) ? null : r >= t.inverted ? -2 : r >= t.flat ? -1 : r <= t.steep ? 1 : 0; }
export function riskScore(inputs, issueMs, spx) {
  const r = inputs?.risk ?? {}, dr = [];
  const ok = (x, k = 'risk') => x && !unusable(x.asOf, issueMs, MAX_AGE_DAYS[k]);
  const why = (x, k = 'risk') => (x ? unusable(x.asOf, issueMs, MAX_AGE_DAYS[k]) : 'no data');
  dr.push({ key: 'vixLevel', label: 'VIX vs its 1-year range', w: RISK_WEIGHTS.vixLevel, d: ok(r.vix) ? pctD(r.vix.pct1y) : null, why: why(r.vix),
    reading: r.vix ? `VIX ${fin(r.vix.level) ? r.vix.level.toFixed(1) : '?'}, ${fin(r.vix.pct1y) ? Math.round(r.vix.pct1y) : '?'}th percentile of the year` : null, source: r.vix?.source ?? 'CBOE VIX', asOf: r.vix?.asOf });
  dr.push({ key: 'vixTerm', label: 'VIX / VIX3M', w: RISK_WEIGHTS.vixTerm, d: ok(r.vixTerm) ? termD(r.vixTerm.ratio) : null, why: why(r.vixTerm),
    reading: r.vixTerm && fin(r.vixTerm.ratio) ? `${r.vixTerm.ratio.toFixed(2)} (${r.vixTerm.ratio >= 1 ? 'inverted: near-term fear' : 'contango'})` : null, source: r.vixTerm?.source ?? 'CBOE VIX, VIX3M', asOf: r.vixTerm?.asOf });
  dr.push({ key: 'credit', label: 'HY credit spread, 20-day change', w: RISK_WEIGHTS.credit, d: ok(r.hy) ? (fin(r.hy.chg20bp) ? -band(r.hy.chg20bp, TH.hyChg20bp) || 0 : null) : null, why: why(r.hy),
    reading: r.hy && fin(r.hy.chg20bp) ? `HY OAS ${fin(r.hy.level) ? `${r.hy.level.toFixed(2)}%` : ''} ${sgn(r.hy.chg20bp, 0)}bp in 20 days` : null, source: r.hy?.source ?? 'FRED BAMLH0A0HYM2', asOf: r.hy?.asOf });
  dr.push({ key: 'spxTrend', label: 'S&P 500, 20-day return', w: RISK_WEIGHTS.spxTrend, d: spx ? band(spx.ret20, TH.spxRet20Pct) : null, why: spx ? null : 'no SPX500 daily closes',
    reading: spx ? `${pctS(spx.ret20)} in 20 sessions` : null, source: 'OANDA SPX500_USD daily', asOf: spx?.asOf });
  const c = combine(dr);
  return { score: c.score, coverage: c.coverage, drivers: c.drivers, missing: c.missing };
}

// ── building blocks per driver ──────────────────────────────────────────────────────────────────────────────────
function policyDriver(c, inputs, issueMs) {
  const p = inputs?.policy?.[c], st = inputs?.stance?.[c], base = { key: 'policy', label: 'Policy path', w: CCY_WEIGHTS.policy, source: '/api/cb-expectations + /api/macro-scorecard cbSentiment' };
  const bad = p ? unusable(p.asOf, issueMs, MAX_AGE_DAYS.policy) : (inputs?.policyWhy?.[c] ?? 'no policy expectations');
  if (bad || !fin(p.weekBp)) return { ...base, d: null, why: bad ?? `no week change in the ${p.proxy ? '2y series' : 'futures pull'}` };
  const stOk = st && fin(st.score) && !unusable(st.asOf ?? st.meetingDate, issueMs, MAX_AGE_DAYS.stance);
  const dSt = stOk ? (st.score >= TH.stance ? 1 : st.score <= -TH.stance ? -1 : 0) : 0;
  const d = clamp(band(p.weekBp, TH.policyWeekBp) + dSt, -2, 2);
  const what = p.proxy ? `2y yield ${sgn(p.weekBp, 0)}bp over the week (proxy, futures ${/stale/.test(p.futuresWhy ?? '') ? 'stale' : 'missing'})` : `${p.horizon ?? '6m'} priced ${sgn(p.weekBp, 0)}bp over the week`;
  return { ...base, ...(p.proxy ? { source: `${p.source ?? '2y government yield'} + /api/macro-scorecard cbSentiment`, proxy: true } : {}), d, asOf: p.asOf, reading: `${what}${stOk ? `; stance ${st.score >= TH.stance ? 'hawkish' : st.score <= -TH.stance ? 'dovish' : 'neutral'} (${sgn(st.score)}, ${st.meetingDate ?? ''})` : ''}`, policyD: d };
}
function ratesDriver(c, inputs, issueMs, avg) {
  const r = inputs?.rates?.[c], base = { key: 'rates', label: 'Rate differential trend', w: CCY_WEIGHTS.rates, source: '/api/rate-diff' };
  const bad = r ? unusable(r.asOf, issueMs, MAX_AGE_DAYS.rates) : 'no short rate';
  if (bad || !fin(r.z)) return { ...base, d: null, why: bad ?? 'no z (too little history)' };
  const gap = fin(r.level) && fin(avg) ? r.level - avg : null;
  const d = clamp(band(r.z, TH.ratesZ) + (gap == null ? 0 : gap >= TH.ratesGapPp ? 1 : gap <= -TH.ratesGapPp ? -1 : 0), -2, 2);
  return { ...base, d, asOf: r.asOf, reading: `short rate ${fin(r.level) ? `${r.level.toFixed(2)}%` : '?'}${gap == null ? '' : ` (${sgn(gap)}pp vs the 8 average)`}, z ${sgn(r.z)} vs its own history` };
}
function dataDriver(c, inputs, issueMs, w = CCY_WEIGHTS.data, key = 'data', label = 'Data momentum') {
  const x = inputs?.data?.[c], base = { key, label, w, source: '/api/macro-scorecard' };
  const bad = x ? unusable(x.asOf, issueMs, MAX_AGE_DAYS.data) : 'no scorecard factors';
  if (bad || !fin(x.score)) return { ...base, d: null, why: bad ?? 'no score' };
  return { ...base, d: band(x.score, TH.data), asOf: x.asOf, reading: `${c} growth/inflation/labour/demand ${sgn(x.score)}` };
}
function realYieldDriver(c, inputs, issueMs, avg) {
  const x = inputs?.realYield?.[c], base = { key: 'realYield', label: 'Real yield', w: CCY_WEIGHTS.realYield, source: '/api/real-yield' };
  if (!x && !REAL_YIELD_UNIVERSE.includes(c)) return { ...base, d: null, na: true, why: 'no real-yield series for this currency (not held)' };
  const bad = x ? unusable(x.asOf, issueMs, MAX_AGE_DAYS.realYield) : 'no real yield';
  if (bad || !fin(x.level)) return { ...base, d: null, why: bad ?? 'no level' };
  const gap = fin(avg) ? x.level - avg : null;
  const dl = gap == null ? 0 : gap >= TH.realGapPp ? 1 : gap <= -TH.realGapPp ? -1 : 0, dz = fin(x.z) ? (x.z >= TH.realZ ? 1 : x.z <= -TH.realZ ? -1 : 0) : 0;
  return { ...base, d: clamp(dl + dz, -2, 2), asOf: x.asOf, reading: `10y real ${x.level.toFixed(2)}%${gap == null ? '' : ` (${sgn(gap)}pp vs peers)`}${fin(x.z) ? `, z ${sgn(x.z)}` : ''}` };
}
function roleDriver(name, R, w, label = 'Risk role × R') {
  const role = RISK_ROLE[name] ?? 0, base = { key: 'risk', label, w, source: 'bias-engine risk score' };
  if (!R || !fin(R.score) || R.coverage < MIN_COVERAGE) return { ...base, d: null, why: 'risk score unavailable' };
  const x = role * R.score;
  return { ...base, d: band(x, TH.roleR) + 0, asOf: R.asOf, reading: `role ${sgn(role)} × R ${sgn(R.score)} = ${sgn(x)}` };
}
function cotDriver(name, inputs, issueMs, w) {
  const x = inputs?.cot?.[name], base = { key: 'positioning', label: 'Positioning (COT, contrarian)', w, source: '/api/cot-state' };
  if (!x && COT_UNIVERSE_MISSING.includes(name)) return { ...base, d: null, na: true, why: 'no COT contract tracked for this market (not held)' };
  const bad = x ? unusable(x.asOf, issueMs, MAX_AGE_DAYS.cot) : 'no COT row';
  if (bad || !fin(x.pct)) return { ...base, d: null, why: bad ?? 'no percentile' };
  const { crowded, leaning } = TH.cotPct, p = x.pct, long = !fin(x.share) || x.share > 0, short = !fin(x.share) || x.share < 0;
  const d = p >= crowded && long ? -2 : p >= leaning ? -1 : p <= 100 - crowded && short ? 2 : p <= 100 - leaning ? 1 : 0;
  return { ...base, d, asOf: x.asOf, reading: `speculators at the ${Math.round(p)}th percentile${fin(x.share) ? `, net ${x.share > 0 ? 'long' : 'short'} ${Math.abs(x.share).toFixed(1)}% of OI` : ''}` };
}
function trendDriver(name, zD1, zH4, w, asOf, src) {
  const base = { key: 'trend', label: 'Trend (D1/H4 EMA20)', w, source: src };
  const d = trendD(zD1, zH4);
  if (d == null) return { ...base, d: null, why: 'too few closed daily bars' };
  return { ...base, d, asOf, reading: `D1 ${trendWord(zD1)}, H4 ${trendWord(zH4)}${zH4 != null && d === 0 && band(zD1, TH.trendZ) && band(zH4, TH.trendZ) && Math.sign(zD1) !== Math.sign(zH4) ? ': timeframes conflict' : ''}` };
}
const lastAsOf = (bars, durMs) => (bars?.length ? new Date(bars.at(-1).t + durMs).toISOString() : null);
function priceTrend(name, inputs, issueMs) {
  const d1 = closedBars(inputs?.prices?.d1?.[name], issueMs, DAY), h4 = closedBars(inputs?.prices?.h4?.[name], issueMs, H4);
  const fresh = d1.length && !unusable(lastAsOf(d1, DAY), issueMs, MAX_AGE_DAYS.prices);
  return { d1: fresh ? d1 : [], zD1: fresh ? slopeZ(d1.map(b => Math.log(b.c))) : null, zH4: fresh && h4.length ? slopeZ(h4.map(b => Math.log(b.c))) : null, asOf: lastAsOf(d1, DAY) };
}
const ret20 = bars => (bars.length > 20 ? (bars.at(-1).c / bars.at(-21).c - 1) * 100 : null);
function usRealDriver(inputs, issueMs, w, key, label) {
  const x = inputs?.usReal, base = { key, label, w, source: 'FRED DFII10 (US 10y TIPS yield)' };
  const bad = x ? unusable(x.asOf, issueMs, MAX_AGE_DAYS.usReal) : 'no US real yield series';
  if (bad || !fin(x.chg20bp)) return { ...base, d: null, why: bad ?? 'no 20-day change' };
  return { ...base, d: -band(x.chg20bp, TH.usRealChg20bp) || 0, asOf: x.asOf, reading: `US 10y real ${fin(x.level) ? `${x.level.toFixed(2)}% ` : ''}${sgn(x.chg20bp, 0)}bp in 20 days (falling = supportive)` };
}
function usdDriver(usd, w, label = 'USD (inverted)') {
  const base = { key: 'usd', label, w, source: 'bias-engine USD score' };
  if (!usd || !fin(usd.score) || usd.coverage < MIN_COVERAGE) return { ...base, d: null, why: 'USD score unavailable' };
  // the USD SCORE drives this, never its Neutral-gated label (a Neutral USD with score +0.67 still pushes gold down)
  return { ...base, d: -band(usd.score, TH.usdScore) || 0, asOf: usd.asOf, reading: `USD score ${sgn(usd.score)} (${usd.dir === 'NEUTRAL' ? `below its own call threshold, ${usd.strength}/10` : `${dirWord(usd.dir)} ${usd.strength}/10`})` };
}
function pathDriver(ccy, ccyRec, w, label) {
  const p = ccyRec?._policyD, base = { key: ccy === 'USD' ? 'fedPath' : 'ratesPath', label, w, source: '/api/cb-expectations' };
  if (!fin(p)) return { ...base, d: null, why: `no ${ccy} policy expectations` };
  return { ...base, ...(ccyRec._policyProxy ? { source: ccyRec._policySource, proxy: true } : {}), d: -p || 0, asOf: ccyRec._policyAsOf, reading: `${ccy} policy ${sgn(p, 0)}: ${ccyRec._policyReading}` };
}

// ── the record ──────────────────────────────────────────────────────────────────────────────────────────────────
/** The 28 crosses of the eight, in market convention (EURUSD, not USDEUR). */
export function allPairs() {
  const out = [];
  for (let i = 0; i < CCY_PRIORITY.length; i++) for (let j = i + 1; j < CCY_PRIORITY.length; j++) out.push(CCY_PRIORITY[i] + CCY_PRIORITY[j]);
  return out;
}

/** A pair from two currency views: s = (s_base − s_quote) / 2, both legs' drivers listed (contributions halved, the quote's negated). */
export function pairFrom(base, quote, ccys) {
  const b = ccys?.[base], q = ccys?.[quote];
  if (!b || !q) return null;
  const score = fin(b.score) && fin(q.score) ? rnd((b.score - q.score) / 2, 4) : null, coverage = rnd(Math.min(b.coverage ?? 0, q.coverage ?? 0), 3);
  const drivers = [...b.drivers.map(x => ({ ...x, leg: base, contrib: rnd(x.contrib / 2, 4) })), ...q.drivers.map(x => ({ ...x, leg: quote, contrib: rnd(-x.contrib / 2, 4) }))];
  const missing = [...b.missing.map(x => ({ ...x, leg: base })), ...q.missing.map(x => ({ ...x, leg: quote }))];
  return finish(`${base}/${quote}`, { score, coverage, drivers, missing }, { legs: [base, quote], legScores: { [base]: b.score, [quote]: q.score } });
}

/** The whole issue. Deterministic in `inputs`. */
export function buildBiasRecord(inputs) {
  const asOf = inputs?.asOf, issueMs = Date.parse(asOf ?? '');
  if (!Number.isFinite(issueMs)) throw new Error('inputs.asOf (the issue time) is required');
  const gaps = [];

  // risk
  const spxBars = priceTrend('SPX500', inputs, issueMs).d1, spx = spxBars.length > 20 ? { ret20: ret20(spxBars), asOf: lastAsOf(spxBars, DAY) } : null;
  const risk = { ...riskScore(inputs, issueMs, spx), asOf };
  const R = risk;

  // currency basket trend
  const bD1 = basketIndex(inputs?.prices?.d1, issueMs, DAY), bH4 = basketIndex(inputs?.prices?.h4, issueMs, H4);
  const bFresh = bD1?.lastT != null && !unusable(new Date(bD1.lastT + DAY).toISOString(), issueMs, MAX_AGE_DAYS.prices);
  const avgOf = (blk, k, ok) => { const v = CCYS.map(c => blk?.[c]).filter(x => x && fin(x[k]) && ok(x)).map(x => x[k]); return v.length >= 4 ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const rateAvg = avgOf(inputs?.rates, 'level', x => !unusable(x.asOf, issueMs, MAX_AGE_DAYS.rates));
  const realAvg = avgOf(inputs?.realYield, 'level', x => !unusable(x.asOf, issueMs, MAX_AGE_DAYS.realYield));

  const currencies = {};
  for (const c of CCYS) {
    const pol = policyDriver(c, inputs, issueMs);
    const dr = [pol, ratesDriver(c, inputs, issueMs, rateAvg), dataDriver(c, inputs, issueMs), realYieldDriver(c, inputs, issueMs, realAvg), roleDriver(c, R, CCY_WEIGHTS.risk)];
    if (c in COMMODITY_OF) {
      const name = COMMODITY_OF[c], base = { key: 'commodity', label: `Commodity link${name ? ` (${name === 'WTI' ? 'oil' : 'copper'})` : ' (dairy)'}`, w: CCY_WEIGHTS.commodity, source: name ? `OANDA ${name} daily` : 'none' };
      if (!name) dr.push({ ...base, d: null, why: 'no dairy price feed' });
      else { const bars = priceTrend(name, inputs, issueMs).d1, x = ret20(bars); dr.push(x == null ? { ...base, d: null, why: `no ${name} daily closes` } : { ...base, d: band(x, TH.commodityPct), asOf: lastAsOf(bars, DAY), reading: `${name === 'WTI' ? 'WTI' : 'copper'} ${pctS(x)} in 20 sessions` }); }
    } else dr.push({ key: 'commodity', label: 'Commodity link', w: CCY_WEIGHTS.commodity, na: true });
    dr.push(cotDriver(c, inputs, issueMs, CCY_WEIGHTS.positioning));
    dr.push(bFresh ? trendDriver(c, slopeZ(bD1.index[c]), bH4 ? slopeZ(bH4.index[c]) : null, CCY_WEIGHTS.trend, new Date(bD1.lastT + DAY).toISOString(), 'OANDA D1/H4, 7 USD majors → 8-currency basket')
      : { key: 'trend', label: 'Trend (D1/H4 EMA20)', w: CCY_WEIGHTS.trend, d: null, why: 'no basket candles' });
    const m = finish(c, combine(dr), { riskRole: RISK_ROLE[c] });
    Object.defineProperties(m, { _policyD: { value: pol.policyD ?? null }, _policyAsOf: { value: pol.asOf ?? null }, _policyReading: { value: pol.reading ?? null }, _policyProxy: { value: !!pol.proxy }, _policySource: { value: pol.source } });
    m.asOf = asOf;
    currencies[c] = m;
  }

  const markets = {};
  for (const p of allPairs()) markets[p] = pairFrom(p.slice(0, 3), p.slice(3), currencies);

  // assets
  const usd = currencies.USD;
  const goldLike = (name, extraNote) => {
    const t = priceTrend(name, inputs, issueMs);
    const dr = [usRealDriver(inputs, issueMs, GOLD_WEIGHTS.realYield, 'realYield', 'US real yield (falling = +)'), usdDriver(usd, GOLD_WEIGHTS.usd),
      pathDriver('USD', usd, GOLD_WEIGHTS.fedPath, 'Fed path (dovish = +)'), roleDriver(name, R, GOLD_WEIGHTS.risk, name === 'GOLD' ? 'Risk / fear (−R)' : 'Risk (industrial, +0.5 R)'),
      cotDriver(name, inputs, issueMs, GOLD_WEIGHTS.positioning), trendDriver(name, t.zD1, t.zH4, GOLD_WEIGHTS.trend, t.asOf, `OANDA ${name} D1/H4`)];
    return finish(name, combine(dr), { model: name === 'GOLD' ? 'gold' : 'silver (gold model, R +0.5)', ...(extraNote ? { note: extraNote } : {}), asOf });
  };
  markets.GOLD = goldLike('GOLD');
  markets.SILVER = goldLike('SILVER', 'Gold model with the risk role at +0.5 (industrial demand).');

  for (const name of ['NQ', 'SPX500', 'US30', 'US2000']) {
    const t = priceTrend(name, inputs, issueMs);
    const dr = [usRealDriver(inputs, issueMs, INDEX_WEIGHTS.rates, 'rates', 'Rates and real yields (falling = +)'), pathDriver('USD', usd, INDEX_WEIGHTS.fedPath, 'Fed path (dovish = +)'),
      roleDriver(name, R, INDEX_WEIGHTS.risk, 'Risk and credit (R)'), dataDriver('USD', inputs, issueMs, INDEX_WEIGHTS.data, 'data', 'US data momentum'),
      cotDriver(name, inputs, issueMs, INDEX_WEIGHTS.positioning), trendDriver(name, t.zD1, t.zH4, INDEX_WEIGHTS.trend, t.asOf, `OANDA ${name} D1/H4`)];
    markets[name] = finish(name, combine(dr), { model: 'us-index', asOf });
  }
  for (const [name, ccy] of [['DE30', 'EUR'], ['UK100', 'GBP']]) {
    const t = priceTrend(name, inputs, issueMs), own = currencies[ccy];
    const ccyD = own && fin(own.score) && own.coverage >= MIN_COVERAGE
      ? { key: 'ccy', label: `${ccy} (weaker = +)`, w: EU_INDEX_WEIGHTS.ccy, d: -band(own.score, TH.usdScore) || 0, asOf, source: `bias-engine ${ccy} score`, reading: `${ccy} score ${sgn(own.score)}` }
      : { key: 'ccy', label: `${ccy} (weaker = +)`, w: EU_INDEX_WEIGHTS.ccy, d: null, why: `${ccy} score unavailable` };
    const dr = [pathDriver(ccy, own, EU_INDEX_WEIGHTS.ratesPath, `${ccy === 'EUR' ? 'ECB' : 'BoE'} path (dovish = +)`), ccyD, roleDriver(name, R, EU_INDEX_WEIGHTS.risk, 'Risk (R)'),
      dataDriver(ccy, inputs, issueMs, EU_INDEX_WEIGHTS.data, 'data', `${ccy} data momentum`), trendDriver(name, t.zD1, t.zH4, EU_INDEX_WEIGHTS.trend, t.asOf, `OANDA ${name} D1/H4`),
      cotDriver(name, inputs, issueMs, EU_INDEX_WEIGHTS.positioning)];
    markets[name] = finish(name, combine(dr), { model: 'eu-index', asOf });
  }
  const gData = (() => {
    const v = CCYS.map(c => inputs?.data?.[c]).filter(x => x && fin(x.score) && !unusable(x.asOf, issueMs, MAX_AGE_DAYS.data));
    if (v.length < TH.globalDataMin) return null;
    return { score: v.reduce((s, x) => s + x.score, 0) / v.length, n: v.length, asOf: v.map(x => x.asOf).sort().at(-1) };
  })();
  for (const name of ['WTI', 'COPPER']) {
    const t = priceTrend(name, inputs, issueMs);
    const dr = [usdDriver(usd, CMDTY_WEIGHTS.usd),
      gData ? { key: 'globalData', label: 'Global data momentum', w: CMDTY_WEIGHTS.globalData, d: band(gData.score, TH.data), asOf: gData.asOf, source: '/api/macro-scorecard', reading: `mean of ${gData.n} economies ${sgn(gData.score)}` }
        : { key: 'globalData', label: 'Global data momentum', w: CMDTY_WEIGHTS.globalData, d: null, why: `fewer than ${TH.globalDataMin} economies scored` },
      roleDriver(name, R, CMDTY_WEIGHTS.risk, 'Risk (R)'),
      name === 'WTI' ? { key: 'inventories', label: 'Inventories (EIA)', w: CMDTY_WEIGHTS.inventories, d: null, why: 'no EIA inventory feed held' } : { key: 'inventories', label: 'Inventories', w: CMDTY_WEIGHTS.inventories, na: true },
      trendDriver(name, t.zD1, t.zH4, CMDTY_WEIGHTS.trend, t.asOf, `OANDA ${name} D1/H4`)];
    markets[name] = finish(name, combine(dr), { model: 'commodity', asOf });
  }

  // gaps: every missing driver, grouped by reason
  const byWhy = new Map();
  const note = (who, x) => { const k = `${x.label}: ${x.why}`; if (!byWhy.has(k)) byWhy.set(k, []); byWhy.get(k).push(who); };
  for (const c of CCYS) for (const x of currencies[c].missing) note(c, x);
  for (const a of ASSETS) for (const x of markets[a].missing) note(a, x);
  for (const x of risk.missing) note('risk', x);
  for (const [k, who] of byWhy) gaps.push(`${who.join(', ')}: ${k}`);

  return { version: ENGINE_VERSION, weights: WEIGHTS_VERSION, asOf, footnote: FOOTNOTE,
    risk, currencies, markets, ranking: CCYS.filter(c => fin(currencies[c].score)).sort((a, b) => currencies[b].score - currencies[a].score || a.localeCompare(b)), gaps };
}

/** Any market from a record: a stored market, or any cross of the eight computed from the currency scores. */
export function marketView(rec, market) {
  const m = String(market ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!rec || !m) return null;
  if (rec.markets?.[m]) return { market: m, ...rec.markets[m] };
  if (rec.currencies?.[m]) return { market: m, ...rec.currencies[m] };
  const l = legsOf(m);
  if (l?.[0] && rec.currencies?.[l[0]] && rec.currencies?.[l[1]] && l[0] !== l[1]) return { market: m, ...pairFrom(l[0], l[1], rec.currencies) };
  return null;
}
