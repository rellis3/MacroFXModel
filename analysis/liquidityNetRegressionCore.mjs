/*
 * liquidityNetRegressionCore.mjs — pure computation shared by the CLI script
 * (analysis/liquidity_net_regression.mjs) and the Railway server endpoint
 * (server.js /api/liquidity-analysis/net-liquidity-nq/run), so the two can
 * never disagree — same pattern as GlobalLiquidity/backtestCore.mjs.
 *
 * ⚠️ RESEARCH DIAGNOSTIC ONLY — see the CLI script's header for the full
 * rationale (Stage A of the liquidity regression-testing roadmap: replicate
 * the well-documented Net-Liquidity-vs-Nasdaq relationship as a control case,
 * honestly, with an in-sample/out-of-sample split). Not a trading signal.
 *
 * Takes data already fetched by the caller (fredMaps: {walcl,tga,rrp} each a
 * Map<'YYYY-MM-DD',number>, nqRets: Map<'YYYY-MM-DD',weekly log return>) and
 * returns a plain, JSON-friendly result object. No I/O in this file.
 */
import { weeklyReturns, alignFxToGrid } from '../GlobalLiquidity/backtestCore.mjs';
import { neweyWestOLS } from '../js/metricsCore.js';
import { rollingZScore } from '../js/statsCore.js';
import { forwardFillToDates } from '../js/fredFetch.js';

const WEEK_MS = 7 * 864e5;
export const IMPULSE_SMOOTH = 4, IMPULSE_LOOKBACK = 13, Z_WINDOW = 156; // weeks — matches js/globalLiquidityEngine.js CFG

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
function ffillArr(a) { const out = a.slice(); let last = NaN; for (let i = 0; i < out.length; i++) { if (!isNum(out[i])) out[i] = last; else last = out[i]; } return out; }
function lagArr(a, k) { if (k <= 0) return a.slice(); const out = new Array(a.length).fill(NaN); for (let i = k; i < a.length; i++) out[i] = a[i - k]; return out; }
function smaArr(a, win) { const out = new Array(a.length).fill(NaN); for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - win + 1); j <= i; j++) if (isNum(a[j])) { s += a[j]; n++; } if (n) out[i] = s / n; } return out; }
function rocArr(a, k) { const out = new Array(a.length).fill(NaN); for (let i = k; i < a.length; i++) if (isNum(a[i]) && isNum(a[i - k])) out[i] = a[i] - a[i - k]; return out; }

export function buildWeeklyGrid(fredMaps) {
  let minT = Infinity, maxT = -Infinity;
  for (const m of Object.values(fredMaps)) {
    if (!m.size) continue;
    const keys = [...m.keys()].sort();
    minT = Math.min(minT, +new Date(keys[0])); maxT = Math.max(maxT, +new Date(keys.at(-1)));
  }
  if (!isFinite(minT)) return [];
  const dates = [];
  for (let t = minT; t <= maxT; t += WEEK_MS) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

// Stress-regime split — credit (HY OAS FRED:BAMLH0A0HYM2) and vol (VIX
// FRED:VIXCLS) z-scores, 1-week publication lag. NOT js/globalLiquidityEngine.js's
// own CFG.RISK_GATE thresholds (creditZ>1.0 OR volZ>1.25) — those are
// deliberately loose because that gate's JOB is to cut gross defensively and
// often; checked against synthetic data, a 1.0/1.25-sigma bar flags roughly
// 15-20% of ALL weeks (one-tailed z>1 is ~16% of a normal by chance alone),
// which is "elevated caution", not "distinct crisis episode". A
// regime-conditioning research split needs the opposite property — isolating
// genuinely rare stress regimes so a handful of real episodes (2008, 2020,
// 2022, …) don't get diluted by ordinary noise — so this uses a stricter,
// round 2-sigma bar on both series instead. Picked once, before looking at
// results, not tuned to produce a particular episode count.
const REGIME_PUB_LAG = 1, REGIME_CREDIT_Z = 2.0, REGIME_VOL_Z = 2.0;

export function computeStressRegime(dates, fredMaps) {
  if (!fredMaps.hy?.size || !fredMaps.vix?.size) return null;
  const hy = ffillArr(forwardFillToDates(dates, fredMaps.hy));
  const vix = ffillArr(forwardFillToDates(dates, fredMaps.vix));
  const creditZ = rollingZScore(lagArr(hy, REGIME_PUB_LAG), Z_WINDOW);
  const volZ = rollingZScore(lagArr(vix, REGIME_PUB_LAG), Z_WINDOW);
  return dates.map((_, i) => (isNum(creditZ[i]) && creditZ[i] > REGIME_CREDIT_Z) || (isNum(volZ[i]) && volZ[i] > REGIME_VOL_Z));
}

// Count maximal runs of `true` in a boolean array — a rough proxy for the
// number of INDEPENDENT stress episodes (2008, 2020, 2022, …) rather than the
// number of stress WEEKS, since weeks inside one episode are highly
// autocorrelated and don't each count as separate evidence.
export function countEpisodes(flags) {
  let n = 0, prev = false;
  for (const f of flags) { if (f && !prev) n++; prev = !!f; }
  return n;
}

export function computeNetLiquidityImpulse(dates, fredMaps, pubLagWeeks) {
  const walcl = ffillArr(forwardFillToDates(dates, fredMaps.walcl));
  const tga = ffillArr(forwardFillToDates(dates, fredMaps.tga));
  const rrp = ffillArr(forwardFillToDates(dates, fredMaps.rrp));
  // WALCL is $millions on FRED; TGA/RRP are $billions — convert WALCL→$B first
  // (same unit trap globalLiquidityEngine.js documents for its own USD block).
  const netLiquidity = dates.map((_, i) => (isNum(walcl[i]) ? walcl[i] / 1000 : NaN) - (isNum(tga[i]) ? tga[i] : 0) - (isNum(rrp[i]) ? rrp[i] : 0));
  const lagged = lagArr(netLiquidity, pubLagWeeks);      // publication lag — can't know this week's release this week
  const smoothed = smaArr(lagged, IMPULSE_SMOOTH);
  const changeK = rocArr(smoothed, IMPULSE_LOOKBACK);
  const impulse = rollingZScore(changeK, Z_WINDOW);
  return { netLiquidity, impulse };
}

export function forwardReturns(weeklyRet, horizonWeeks) {
  const n = weeklyRet.length;
  const out = new Array(n).fill(NaN);
  for (let i = 0; i + horizonWeeks < n; i++) {
    let s = 0, ok = true;
    for (let h = 1; h <= horizonWeeks; h++) { const v = weeklyRet[i + h]; if (!isNum(v)) { ok = false; break; } s += v; }
    if (ok) out[i] = s;
  }
  return out;
}

export function isOosTest(x, y, isFrac = 0.7) {
  const pairs = []; for (let i = 0; i < x.length; i++) if (isNum(x[i]) && isNum(y[i])) pairs.push([x[i], y[i]]);
  const n = pairs.length;
  if (n < 60) return null; // not enough overlapping history for a meaningful split
  const cut = Math.floor(n * isFrac);
  const xIS = pairs.slice(0, cut).map((p) => p[0]), yIS = pairs.slice(0, cut).map((p) => p[1]);
  const xOOS = pairs.slice(cut).map((p) => p[0]), yOOS = pairs.slice(cut).map((p) => p[1]);
  if (xOOS.length < 20) return null;

  const fit = neweyWestOLS(xIS, yIS);
  const yOosMean = yOOS.reduce((a, b) => a + b, 0) / yOOS.length;
  let ssrOos = 0, sstOos = 0, hits = 0;
  for (let i = 0; i < xOOS.length; i++) {
    const yhat = fit.intercept + fit.beta * xOOS[i];
    ssrOos += (yOOS[i] - yhat) ** 2;
    sstOos += (yOOS[i] - yOosMean) ** 2;
    if (Math.sign(fit.beta * xOOS[i]) === Math.sign(yOOS[i])) hits++;
  }
  const r2Oos = sstOos > 1e-12 ? 1 - ssrOos / sstOos : null;
  return {
    n, nIS: xIS.length, nOOS: xOOS.length,
    beta: fit.beta, r2IS: fit.r2, tStatNW: fit.tStatNW,
    r2OOS: r2Oos, hitRateOOS: hits / xOOS.length,
  };
}

// Run isOosTest on only the weeks where `keep[i]` is true — reuses isOosTest
// unmodified by NaN-ing out the excluded weeks (its own isNum filter drops them).
function isOosTestFiltered(x, y, keep) {
  const xf = x.map((v, i) => (keep[i] ? v : NaN));
  const yf = y.map((v, i) => (keep[i] ? v : NaN));
  return isOosTest(xf, yf);
}

export function verdictFor(res) {
  if (!res) return 'insufficient overlapping history for an honest IS/OOS split';
  const robust = Math.abs(res.tStatNW) >= 3;   // Harvey-Liu-Zhu factor-discovery bar (regression-analysis-course-notes.md L4)
  const suggestive = Math.abs(res.tStatNW) >= 2;
  const survivesOos = res.r2OOS != null && res.r2OOS > 0;
  if (robust && survivesOos) return 'ROBUST — |t|≥3 in-sample AND positive out-of-sample R² (survives the honest check)';
  if (suggestive && survivesOos) return 'SUGGESTIVE ONLY — |t| between 2 and 3; per Harvey-Liu-Zhu this is below the factor-discovery bar, treat with caution';
  if (!survivesOos) return 'DOES NOT SURVIVE OUT-OF-SAMPLE — in-sample fit does not carry forward; textbook overfitting signature';
  return 'NO SIGNAL — not distinguishable from noise in-sample';
}

// round() mirrors GlobalLiquidity/backtestCore.mjs's own rounding convention.
const round = (x, d = 4) => (isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/*
 * computeNetLiquidityRegression({ fredMaps, fredSource, nqRets, nqSource, pubLagWeeks, horizons })
 *   fredMaps  : { walcl, tga, rrp } each a Map<'YYYY-MM-DD', number>
 *   nqRets    : Map<'YYYY-MM-DD', weekly log return> for NASDAQ (NQ)
 * Returns a plain, JSON-friendly result object (no Maps/functions).
 */
function summarizeResult(h, res) {
  return {
    horizonWeeks: h,
    n: res?.n ?? 0, nIS: res?.nIS ?? 0, nOOS: res?.nOOS ?? 0,
    beta: res ? round(res.beta, 5) : null,
    r2IS: res ? round(res.r2IS, 4) : null,
    tStatNW: res ? round(res.tStatNW, 2) : null,
    r2OOS: res && res.r2OOS != null ? round(res.r2OOS, 4) : null,
    hitRateOOS: res ? round(res.hitRateOOS, 3) : null,
    verdict: verdictFor(res),
  };
}

export function computeNetLiquidityRegression({ fredMaps, fredSource = 'unknown', nqRets, nqSource = 'unknown', pubLagWeeks = 2, horizons = [4, 8, 13] }) {
  const dates = buildWeeklyGrid(fredMaps);
  if (!dates.length) throw new Error('no Net Liquidity data (empty FRED series)');
  const { impulse } = computeNetLiquidityImpulse(dates, fredMaps, pubLagWeeks);

  const { R } = alignFxToGrid(dates, ['NQ'], { NQ: nqRets || new Map() });
  const nqWeekly = R.map((row) => row[0]);

  const real = !/synthetic/i.test(fredSource) && !/synthetic/i.test(nqSource);
  const results = horizons.map((h) => summarizeResult(h, isOosTest(impulse, forwardReturns(nqWeekly, h))));

  // Regime conditioning (education/macro-deep-dives-notes.md Lesson 3: "regime
  // conditioning is mandatory" — an unconditional multi-decade regression can
  // wash out an effect that only shows up in stress). Only computed when the
  // caller supplied VIX + HY OAS; otherwise omitted rather than guessed at.
  const stress = computeStressRegime(dates, fredMaps);
  let regime = null;
  if (stress) {
    const calm = stress.map((s) => !s);
    const stressWeeks = stress.filter(Boolean).length;
    const stressEpisodes = countEpisodes(stress);
    regime = {
      stressWeeks, calmWeeks: dates.length - stressWeeks,
      stressShare: round(stressWeeks / dates.length, 3),
      stressEpisodes,
      resultsStress: horizons.map((h) => summarizeResult(h, isOosTestFiltered(impulse, forwardReturns(nqWeekly, h), stress))),
      resultsCalm: horizons.map((h) => summarizeResult(h, isOosTestFiltered(impulse, forwardReturns(nqWeekly, h), calm))),
      caveat: `Only ${stressEpisodes} independent stress episode(s) in this sample (not ${stressWeeks} — stress weeks inside one episode are highly autocorrelated, not separate evidence). A regime-conditioned t-stat here is much weaker evidence than the same t-stat computed from many independent episodes — read a "ROBUST" verdict on this split as suggestive at best, not confirmed.`,
    };
  }

  return {
    fredSource, nqSource, real,
    pubLagWeeks, impulseSmoothWeeks: IMPULSE_SMOOTH, impulseLookbackWeeks: IMPULSE_LOOKBACK, zWindowWeeks: Z_WINDOW,
    weeks: dates.length, start: dates[0], asOf: dates.at(-1),
    results, regime,
    caveat: 'RESEARCH DIAGNOSTIC ONLY — not a trading signal, not a system, no position sizing. Answers one question (does Net Liquidity have an honest out-of-sample relationship with forward Nasdaq returns) and reports both sides of that answer, including a negative OOS R² when the in-sample fit does not carry forward.',
  };
}

export { weeklyReturns };
