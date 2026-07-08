/**
 * Cross-Pair Forecast-Behaviour Research (the "trend spotter") — Phase 1.
 *
 * Reads the ALREADY-OUTPUT per-pair research JSON (vfr_research + optionally
 * intraday_research) and synthesises it ACROSS pairs. It answers the questions
 * the per-pair book can't:
 *
 *   A. Cross-pair CONSISTENCY — is a pattern robust across pairs of different
 *      TYPES, or just pair-specific noise? (sign test vs Binomial(n,½), then
 *      Benjamini–Hochberg across metrics, plus a type-spread requirement).
 *   B. OUTLIER discounting → trust tiers (trade / caution / exclude), via robust
 *      z-scores (median/MAD) so one broken pair doesn't move the bar. This is the
 *      "USDCHF is bad → don't trade it" answer, made rule-based.
 *   C. PAIR-TYPE grouping (major / eur-cross / jpy-cross / other-cross / gold /
 *      index) — does forecast quality cluster by instrument type?
 *   D. A composite forecast-RELIABILITY score (0–100) → the ranking of which
 *      pairs the expectation model is actually good at.
 *
 * It does NOT re-run the heavy engines and does NOT optimise a strategy — it is a
 * research/understanding layer. Pure + synthetic-testable: per-pair JSON in,
 * cross-pair report out. No network, no DOM.
 *
 * Honest boundaries (see CROSS_PAIR_RESEARCH_DESIGN.md §4): works on the persisted
 * AGGREGATES; the correlation / feature-importance / clustering scan needs the
 * per-day rows (a Phase-2 export), and session-contribution accuracy + macro/news
 * conditioning need data the current JSON doesn't carry.
 */

// ── Pair-type classification ──────────────────────────────────────────────────
const MAJORS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF']);
const INDICES = new Set(['NQ', 'SPX500', 'US30', 'DE30', 'UK100', 'NAS100']);
export function pairType(name) {
  const n = String(name || '').toUpperCase();
  if (n === 'GOLD' || n === 'XAUUSD' || n === 'XAU_USD') return 'gold';
  if (INDICES.has(n)) return 'index';
  if (MAJORS.has(n)) return 'major';
  if (n.includes('JPY')) return 'jpy_cross';          // non-USD JPY crosses
  if (n.startsWith('EUR')) return 'eur_cross';
  return 'other_cross';
}
// Round-trip cost in the instrument's OWN pips (spread + typical slippage), by
// type. A DOCUMENTED ASSUMPTION to replace with real per-pair fills — the ×2/×3
// sensitivity below is exactly so a thin edge can't hide behind an optimistic
// cost. The barrier the touch study races is ±20 of these same pips (TH in
// intradayForecastResearch), so cost and payoff share units.
export const COST_PIPS = { major: 1.5, eur_cross: 2.5, jpy_cross: 2.0, other_cross: 3.0, gold: 3.0, index: 1.5 };
const TOUCH_BARRIER_PIPS = 20;   // must match intradayForecastResearch _levelOutcome TH

export const PAIR_TYPE_LABELS = {
  major: 'FX majors', eur_cross: 'EUR crosses', jpy_cross: 'JPY crosses',
  other_cross: 'Other crosses', gold: 'Gold', index: 'Indices',
};

// ── Small pure stats ──────────────────────────────────────────────────────────
const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _mad = a => { const m = _median(a); if (m == null) return null; return _median(a.map(v => Math.abs(v - m))) * 1.4826; };
function _robustZ(v, arr) { const m = _median(arr), s = _mad(arr); if (m == null || !s) return 0; return (v - m) / s; }
// Percentile rank in [0,1]: fraction below + half the ties (so it's a true rank, not min/max scaling).
function _pctRank(v, arr) { if (!arr.length) return 0.5; let lt = 0, eq = 0; for (const x of arr) { if (x < v) lt++; else if (x === v) eq++; } return (lt + 0.5 * eq) / arr.length; }
function _choose(n, k) { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1); return c; }
// Two-sided sign-test p-value: P(#successes ≥ max(k,n−k) or ≤ min) under p=½.
export function signTestP(n, k) {
  if (n === 0) return 1;
  const kk = Math.max(k, n - k);
  let tail = 0; for (let i = kk; i <= n; i++) tail += _choose(n, i);
  return Math.min(1, 2 * tail * Math.pow(0.5, n));
}
// Benjamini–Hochberg: returns a Set of indices significant at FDR q (monotone).
function _bhSignificant(pvals, q = 0.10) {
  const m = pvals.length; if (!m) return new Set();
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let maxRank = -1;
  for (let r = 0; r < m; r++) if (order[r].p <= ((r + 1) / m) * q) maxRank = r;
  const sig = new Set();
  for (let r = 0; r <= maxRank; r++) sig.add(order[r].i);
  return sig;
}

// ── Metric specs ──────────────────────────────────────────────────────────────
// QUALITY: feed the reliability score + outlier detection. `get(rec)` → value|null.
const _hl = s => s?.perComponent?.daily?.hl || null;
const QUALITY = [
  { key: 'sharpness', label: 'Sharpness (forecast↔realized corr)', betterHigh: true,  get: r => _hl(r.s)?.sharpnessCorr ?? null },
  { key: 'skill',     label: 'Skill vs climatology',              betterHigh: true,  get: r => r.s?.dailyHlSkillVsClimatology ?? null },
  { key: 'calMed',    label: 'Median-calibration error (|exceed−50|)', betterHigh: false, get: r => { const v = _hl(r.s)?.exceedMedianPct; return v == null ? null : Math.abs(v - 50); } },
  { key: 'cal75',     label: '75th-calibration error (|exceed−25|)',   betterHigh: false, get: r => { const v = _hl(r.s)?.exceed75Pct; return v == null ? null : Math.abs(v - 25); } },
  { key: 'absErr',    label: '|median % error|',                  betterHigh: false, get: r => { const v = r.s?.errorDist?.medianPctErr; return v == null ? null : Math.abs(v); } },
];
// Reliability sub-score groups (transparent weights; lead with calibration+skill).
const RELIABILITY_WEIGHTS = { calibration: 0.30, skill: 0.30, sharpness: 0.25, lowError: 0.15 };

// CONSISTENCY: signed per-pair values; a positive majority means the pattern holds.
const CONSISTENCY = [
  { key: 'calib_dir', q: 2,  label: 'Calibration bias (exceed-median − 50)', get: r => { const v = _hl(r.s)?.exceedMedianPct; return v == null ? null : v - 50; }, pos: 'bands too tight (range under-forecast)', neg: 'bands too wide (range over-forecast)', unit: 'pp' },
  { key: 'skill_pos', q: 1,  label: 'Beats climatology (skill > 0)',        get: r => r.s?.dailyHlSkillVsClimatology ?? null, pos: 'model beats naive', neg: 'model worse than naive', unit: '' },
  { key: 'sharp_pos', q: 1,  label: 'Forecast informative (sharpness > 0)', get: r => _hl(r.s)?.sharpnessCorr ?? null, pos: 'forecast tracks realized', neg: 'forecast uninformative', unit: '' },
  { key: 'vol_clust', q: 9,  label: 'Volatility clusters (after >75th day)', get: r => { const p = r.s?.persistence; return (p && p.n) ? p.afterAbove75Pct - p.baseExceedMedianPct : null; }, pos: 'elevated vol persists next day', neg: 'elevated vol mean-reverts', unit: 'pp' },
  { key: 'dir_skill', q: 14, label: 'Forecast skew predicts direction',     get: r => { const v = r.s?.fcSkewDirHitPct; return v == null ? null : v - 50; }, pos: 'skew predicts the day’s direction', neg: 'skew anti-predicts', unit: 'pp' },
  { key: 'overstate', q: 1,  label: 'Realized vs forecast median (median % err)', get: r => r.s?.errorDist?.medianPctErr ?? null, pos: 'realized exceeds forecast (too low)', neg: 'realized below forecast (too high)', unit: '%' },
  // Intraday (optional — only pairs present in intraday_research contribute).
  { key: 'in_continue', q: 6, label: 'Touched median line continues (intraday)', get: r => { const t = r.in?.daily?.touches?.medianExtension; return (t && t.n) ? t.continuePct - t.reversePct : null; }, pos: 'break-and-go dominates', neg: 'fade dominates at the line', unit: 'pp' },
];

// ── G3: portfolio independence — how many EFFECTIVE bets among correlated pairs ─
// returnsByPair: { PAIR: {date: ret} | Map }. Effective bets = participation ratio
// of the daily-return correlation matrix = n² / ΣᵢⱼCᵢⱼ² (n if independent, 1 if
// all move together). Cheap: ΣC² is the Frobenius norm, no eigensolver needed.
export function portfolioIndependence(returnsByPair, names) {
  const use = (names || Object.keys(returnsByPair || {})).filter(n => returnsByPair[n]);
  const n = use.length; if (n < 2) return null;
  const maps = use.map(nm => returnsByPair[nm] instanceof Map ? returnsByPair[nm] : new Map(Object.entries(returnsByPair[nm])));
  const corr = (a, b) => {
    const xs = [], ys = [];
    for (const [d, v] of a) { const w = b.get(d); if (w != null && Number.isFinite(v) && Number.isFinite(w)) { xs.push(v); ys.push(w); } }
    if (xs.length < 30) return null;
    const mx = _mean(xs), my = _mean(ys); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  let sumSq = 0; const off = [];
  for (let i = 0; i < n; i++) { sumSq += 1; for (let j = i + 1; j < n; j++) { const c = corr(maps[i], maps[j]) ?? 0; sumSq += 2 * c * c; off.push(c); } }
  const effectiveBets = +(n * n / sumSq).toFixed(2);
  return { nPairs: n, effectiveBets, meanCorr: off.length ? +(_mean(off)).toFixed(3) : null,
    note: `${n} pairs behave like ~${Math.round(effectiveBets)} independent bets — a cross-pair "N/N agree" is really ~${Math.round(effectiveBets)} votes, and portfolio risk is concentrated accordingly.` };
}

// ── Touch behaviour (the BOT-relevant layer) ──────────────────────────────────
// Elevates the per-pair intraday touch study into a cross-pair decision view:
// does price REACH the forecast line, and once it does, FADE (revert to open) or
// FOLLOW (break through) — overall and split by regime. This is what a level bot
// trades on, as opposed to whether the forecast is statistically calibrated.
function _touchBehaviour(recs, minPairs) {
  const rows = [];
  for (const r of recs) {
    const tt = r.in?.daily?.touches; const t = tt?.medianExtension; const dir = tt?.direction;
    if (!t || !t.n) continue;
    const bBull = t.byRegime?.BULL, bBear = t.byRegime?.BEAR, bRange = t.byRegime?.RANGE;
    const trendCont = [bBull?.continuePct, bBear?.continuePct].filter(v => v != null);
    const fp = tt.fadePayoff;
    rows.push({
      pair: r.name, type: r.type,
      touchRatePct: t.touchRatePct ?? null,
      continuePct: t.continuePct ?? null, reversePct: t.reversePct ?? null,
      netContinue: (t.continuePct != null && t.reversePct != null) ? +(t.continuePct - t.reversePct).toFixed(1) : null,
      mfePips: t.meanMfePips ?? null, maePips: t.meanMaePips ?? null,
      firstUpperPct: dir?.firstUpperPct ?? null,
      rangeReverse20: bRange?.reverse20Pct ?? null,
      trendContinuePct: trendCont.length ? +_mean(trendCont).toFixed(1) : null,
      // G1 placebo edge (real − placebo reversal rate) · G2 fade payoff shape.
      edgeVsPlaceboPp: tt.placebo?.edgeVsPlaceboPp ?? null,
      fadeSkew: fp?.skew ?? null, fadeWinLoss: fp?.winLossRatio ?? null,
      fadeMeanPips: fp?.meanPips ?? null, fadeWorstPips: fp?.worstPips ?? null, fadeWinRatePct: fp?.winRatePct ?? null,
    });
  }
  if (rows.length < minPairs) return rows.length ? { insufficient: true, nPairs: rows.length } : null;
  const col = f => rows.map(f).filter(v => v != null);
  // Fade-vs-follow: sign test on net-continue across pairs.
  const nz = rows.filter(r => r.netContinue != null && r.netContinue !== 0);
  const up = nz.filter(r => r.netContinue > 0), down = nz.filter(r => r.netContinue < 0);
  const maj = up.length >= down.length ? up : down;
  const fadeVsFollow = {
    nPairs: nz.length, agree: Math.max(up.length, down.length),
    direction: up.length >= down.length ? 'follow (break-and-go dominates)' : 'fade (reversion at the line dominates)',
    medianNetContinue: +(_median(col(r => r.netContinue)) ?? 0).toFixed(1),
    pValue: +signTestP(nz.length, Math.max(up.length, down.length)).toFixed(4),
    typeSpread: new Set(maj.map(r => r.type)).size,
  };
  fadeVsFollow.robust = fadeVsFollow.typeSpread >= 2 && fadeVsFollow.pValue <= 0.10;
  // Regime contrast: do RANGE days fade MORE than trend days continue? (the classic
  // fade-in-range / follow-in-trend split a bot would switch on.)
  const contrastRows = rows.filter(r => r.rangeReverse20 != null && r.trendContinuePct != null);
  const showing = contrastRows.filter(r => r.rangeReverse20 >= 50 && r.trendContinuePct >= 50);

  // G1 — does the forecast level beat its jittered placebo? sign test on edge.
  const pl = rows.filter(r => r.edgeVsPlaceboPp != null);
  let placebo = null;
  if (pl.length >= minPairs) {
    const nz = pl.filter(r => r.edgeVsPlaceboPp !== 0);
    const up = nz.filter(r => r.edgeVsPlaceboPp > 0), maj = up.length >= (nz.length - up.length) ? up : nz.filter(r => r.edgeVsPlaceboPp < 0);
    placebo = { nPairs: pl.length, medianEdgePp: +(_median(pl.map(r => r.edgeVsPlaceboPp)) ?? 0).toFixed(1),
      pairsBeatingPlacebo: up.length, pValue: +signTestP(nz.length, Math.max(up.length, nz.length - up.length)).toFixed(4),
      typeSpread: new Set(maj.map(r => r.type)).size };
    placebo.robust = placebo.pairsBeatingPlacebo > nz.length / 2 && placebo.typeSpread >= 2 && placebo.pValue <= 0.10;
    placebo.verdict = placebo.medianEdgePp <= 1 ? 'forecast level ≈ placebo — the exact placement adds ~no edge (fading any same-distance band would do as well)'
      : placebo.robust ? `forecast beats placebo by ${placebo.medianEdgePp}pp across ${placebo.typeSpread} types — the placement carries information`
      : `forecast edges placebo by ${placebo.medianEdgePp}pp but not robustly (concentrated / weak)`;
  }
  // G2 — payoff shape: is fading short-gamma (negative skew, avg-loss ≫ avg-win)?
  const fp = rows.filter(r => r.fadeSkew != null || r.fadeWinLoss != null);
  let payoffShape = null;
  if (fp.length >= minPairs) {
    const negSkew = fp.filter(r => r.fadeSkew != null && r.fadeSkew < 0).length;
    const wlLt1 = fp.filter(r => r.fadeWinLoss != null && r.fadeWinLoss < 1).length;
    payoffShape = { nPairs: fp.length,
      medianSkew: +(_median(fp.map(r => r.fadeSkew).filter(v => v != null)) ?? 0).toFixed(2),
      medianWinLoss: +(_median(fp.map(r => r.fadeWinLoss).filter(v => v != null)) ?? 0).toFixed(2),
      medianFadeMeanPips: +(_median(fp.map(r => r.fadeMeanPips).filter(v => v != null)) ?? 0).toFixed(1),
      pairsNegSkew: negSkew, pairsAvgLossGtWin: wlLt1 };
    payoffShape.shortGamma = negSkew > fp.length / 2 && wlLt1 > fp.length / 2;
    payoffShape.verdict = payoffShape.shortGamma
      ? `SHORT-GAMMA: ${negSkew}/${fp.length} pairs negatively skewed, ${wlLt1}/${fp.length} lose more per loss than they win — fading is selling insurance; the net edge must pay for the tail`
      : `not clearly short-gamma (median skew ${payoffShape.medianSkew}, win/loss ${payoffShape.medianWinLoss})`;
  }

  // Median recalibration factor applied to the touch levels (from the engine).
  const recalFactors = recs.map(r => r.in?.daily?.touches?.recalFactor).filter(v => v != null);
  return {
    nPairs: rows.length,
    bandsRecalibrated: recs.some(r => r.in?.daily?.touches?.bandsRecalibrated),
    recalFactor: recalFactors.length ? +(_median(recalFactors)).toFixed(2) : null,
    medianTouchRatePct: +(_median(col(r => r.touchRatePct)) ?? 0).toFixed(1),
    medianContinuePct: +(_median(col(r => r.continuePct)) ?? 0).toFixed(1),
    medianReversePct: +(_median(col(r => r.reversePct)) ?? 0).toFixed(1),
    medianMfePips: +(_median(col(r => r.mfePips)) ?? 0).toFixed(1),
    medianMaePips: +(_median(col(r => r.maePips)) ?? 0).toFixed(1),
    fadeVsFollow, placebo, payoffShape,
    regimeContrast: { nPairs: contrastRows.length, pairsFadeRangeFollowTrend: showing.length,
      note: 'pairs where RANGE days reverse ≥50% AND trend days continue ≥50% (fade-in-range / follow-in-trend)' },
    ranked: rows.sort((a, b) => (b.touchRatePct ?? 0) - (a.touchRatePct ?? 0)),
  };
}

// ── Cost survival (Q8 — the make-or-break test) ───────────────────────────────
// Every fade/follow number is GROSS. Turn each touch into the ±20-pip symmetric
// bracket the engine already races and net the round-trip cost. With a 1:1 barrier
// the per-touch expectancy of the dominant side is BARRIER × |reverseFrac −
// continueFrac| − cost (stalls contribute ~0 gross but still cost, so they only
// drag — captured by using the touched-day fractions directly). Reported at cost
// ×1/×2/×3 so a thin edge can't survive on an optimistic spread assumption.
// Honest scope: a SCREEN, not a path-level backtest — it says which pairs are even
// in the running; the clean answer still wants real fills + full-path PnL.
// Per-pair net for ONE touch-stat block (medianExtension | p75Extension | conditionalCalm).
function _costRows(recs, blockKey, costTable) {
  const rows = [];
  for (const r of recs) {
    const t = r.in?.daily?.touches?.[blockKey]; if (!t || !t.n) continue;
    const rev = t.reversePct, cont = t.continuePct; if (rev == null || cont == null) continue;
    const revFrac = rev / 100, contFrac = cont / 100;
    const grossPips = +(TOUCH_BARRIER_PIPS * Math.abs(revFrac - contFrac)).toFixed(2);
    const cost = costTable[r.type] ?? 2.0;
    const net = m => +(grossPips - m * cost).toFixed(2);
    rows.push({ pair: r.name, type: r.type, side: revFrac >= contFrac ? 'fade' : 'follow', touchRatePct: t.touchRatePct ?? null,
      grossPips, costPips: cost, netX1: net(1), netX2: net(2), netX3: net(3),
      survivesX1: net(1) > 0, survivesX2: net(2) > 0, survivesX3: net(3) > 0 });
  }
  return rows;
}
// Summarise a block's rows — FX-aware: indices are discounted (≈1–2 correlated
// bets, worst tails, optimistic index cost), so the honest test is whether FX
// pairs clear ×2, not the raw count.
function _summCost(rows, minPairs) {
  if (rows.length < minPairs) return rows.length ? { insufficient: true, nPairs: rows.length } : null;
  const s1 = rows.filter(r => r.survivesX1), s2 = rows.filter(r => r.survivesX2);
  const fx = rows.filter(r => r.type !== 'index'), fxS2 = fx.filter(r => r.survivesX2), fxS1 = fx.filter(r => r.survivesX1);
  const byType = {};
  for (const t of Object.keys(PAIR_TYPE_LABELS)) { const g = rows.filter(r => r.type === t); if (g.length) byType[t] = { n: g.length, survivesX1: g.filter(r => r.survivesX1).length, medianNetX1: +(_median(g.map(r => r.netX1)) ?? 0).toFixed(2) }; }
  const fxTypes = new Set(fxS2.map(r => r.type)).size;
  return {
    nPairs: rows.length, barrierPips: TOUCH_BARRIER_PIPS,
    survivingX1: s1.length, survivingX2: s2.length, survivingTypesX1: new Set(s1.map(r => r.type)).size,
    fxSurvivingX1: fxS1.length, fxSurvivingX2: fxS2.length, fxSurvivingTypesX2: fxTypes,
    medianGrossPips: +(_median(rows.map(r => r.grossPips)) ?? 0).toFixed(2),
    medianNetX1: +(_median(rows.map(r => r.netX1)) ?? 0).toFixed(2),
    medianFxNetX1: fx.length ? +(_median(fx.map(r => r.netX1)) ?? 0).toFixed(2) : null,
    verdict: fxS2.length >= 3 && fxTypes >= 2 ? `${fxS2.length} FX pairs across ${fxTypes} types clear ×2 — worth a path-level backtest`
      : fxS1.length >= 3 && new Set(fxS1.map(r => r.type)).size >= 2 ? `${fxS1.length} FX pairs clear ×1 but not ×2 — marginal, likely dies on realistic slippage`
      : s2.length && s2.every(r => r.type === 'index') ? 'only indices clear costs — discount them (≈1–2 correlated bets, fattest tails, optimistic index cost) → no FX edge'
      : 'no FX pair clears costs — the touch edge is gross-only',
    byType, ranked: rows.sort((a, b) => b.netX1 - a.netX1),
    note: 'SCREEN only: ±20-pip symmetric bracket, assumed cost table (replace with real fills), stalls ≈ breakeven-gross. Not a path-level backtest.',
  };
}
// Cost survival for the median line + the 75th line + the calm-day (conditional)
// median — so we can see whether the more-extended 75th, or the tail-filtered fade,
// survives where the blind median doesn't.
function _costSurvival(recs, minPairs, costTable = COST_PIPS) {
  const median = _summCost(_costRows(recs, 'medianExtension', costTable), minPairs);
  if (!median || median.insufficient) return median;
  const p75 = _summCost(_costRows(recs, 'p75Extension', costTable), minPairs);
  const calm = _summCost(_costRows(recs, 'conditionalCalm', costTable), minPairs);
  return { ...median, byLine: { median, p75, calm } };
}

// ── Public: build the cross-pair report ───────────────────────────────────────
// vfr = the vfr_research payload ({ perPair, cross, pairs }); intraday = optional
// intraday_research payload. opts.fdrQ (default 0.10), opts.minPairsForConsistency.
export function analyzeCrossPair(vfr, intraday = null, opts = {}) {
  const { fdrQ = 0.10, minPairsForConsistency = 6, weights = RELIABILITY_WEIGHTS } = opts;
  const perPair = vfr?.perPair || {};
  const inPer = intraday?.perPair || {};
  const names = Object.keys(perPair);
  if (!names.length) return { insufficient: true, nPairs: 0 };

  const recs = names.map(name => ({ name, type: pairType(name), s: perPair[name], in: inPer[name] || null }));

  // ── D. Reliability score (percentile-rank each quality metric within the set) ──
  const colOf = m => recs.map(r => m.get(r)).filter(v => v != null);
  const cols = Object.fromEntries(QUALITY.map(m => [m.key, colOf(m)]));
  const _rank = (m, v) => { if (v == null) return null; const p = _pctRank(v, cols[m.key]); return m.betterHigh ? p : 1 - p; };
  const reliability = recs.map(r => {
    const rk = Object.fromEntries(QUALITY.map(m => [m.key, _rank(m, m.get(r))]));
    const calibration = _mean([rk.calMed, rk.cal75].filter(v => v != null));
    const sub = {
      calibration: +(calibration).toFixed(3),
      skill:       rk.skill == null ? null : +rk.skill.toFixed(3),
      sharpness:   rk.sharpness == null ? null : +rk.sharpness.toFixed(3),
      lowError:    rk.absErr == null ? null : +rk.absErr.toFixed(3),
    };
    let wsum = 0, w = 0;
    for (const [k, wk] of Object.entries(weights)) if (sub[k] != null) { wsum += sub[k] * wk; w += wk; }
    const score = w ? +(100 * wsum / w).toFixed(1) : null;
    return { pair: r.name, type: r.type, score, sub };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  // ── B. Trust tiers — RELATIVE ranking within this universe + one real floor ──
  // NOTE: the old absolute gates ("skill < 0" / "|exceed-med − 50| > 20") were
  // wrong here: (a) they fired on the WHOLE universe (every pair has negative
  // skill vs a trailing-mean and wide bands on the un-recalibrated reference
  // forecaster), which makes the tier useless; and (b) beating a trailing mean at
  // POINT-forecasting the range is the wrong bar for a DISTRIBUTION forecast.
  // So tiers are now relative terciles of the composite reliability score, plus a
  // genuine floor: sharpness ≤ 0 means a bigger forecast does NOT precede a bigger
  // day — the forecast is uninformative, the one real "don't trade" signal we can
  // read here. These tiers rank RELATIVE quality; true tradeability needs the
  // touch-behaviour + cost layer (see `touchBehaviour` and the bot-question set).
  const scoreByPair = Object.fromEntries(reliability.map(r => [r.pair, r.score]));
  const scores = reliability.map(r => r.score).filter(v => v != null).sort((a, b) => a - b);
  const q = p => scores.length ? scores[Math.min(scores.length - 1, Math.floor(p * scores.length))] : 0;
  const topT = q(2 / 3), botT = q(1 / 3);   // tercile cut points on score
  const trust = { perPair: {}, trade: [], caution: [], exclude: [], relative: true };
  for (const r of recs) {
    const sharp = _hl(r.s)?.sharpnessCorr; const sc = scoreByPair[r.name]; const reasons = [];
    let tier;
    if (sharp != null && sharp <= 0) { tier = 'exclude'; reasons.push(`forecast uninformative — sharpness ${sharp} ≤ 0 (a bigger forecast doesn't precede a bigger day)`); }
    else if (scores.length < 6 || sc == null) { tier = 'caution'; reasons.push('too few pairs for a relative tier'); }
    else if (sc >= topT) { tier = 'trade'; reasons.push(`top-tercile reliability (${sc})`); }
    else if (sc <= botT) { tier = 'exclude'; reasons.push(`bottom-tercile reliability (${sc}) — relative to this universe`); }
    else { tier = 'caution'; reasons.push(`mid-tercile reliability (${sc})`); }
    trust.perPair[r.name] = { tier, score: sc, reasons };
    trust[tier].push(r.name);
  }

  // ── C. Pair-type profiles ──
  const byType = {};
  for (const t of Object.keys(PAIR_TYPE_LABELS)) {
    const g = recs.filter(r => r.type === t); if (!g.length) continue;
    const sc = g.map(r => scoreByPair[r.name]).filter(v => v != null);
    byType[t] = {
      label: PAIR_TYPE_LABELS[t], n: g.length, pairs: g.map(r => r.name),
      medianReliability: sc.length ? +(_median(sc)).toFixed(1) : null,
      medianSharpness: +( _median(g.map(r => _hl(r.s)?.sharpnessCorr).filter(v => v != null)) ?? 0).toFixed(3),
      medianSkill: +(_median(g.map(r => r.s?.dailyHlSkillVsClimatology).filter(v => v != null)) ?? 0).toFixed(3),
      medianExceedMed: +(_median(g.map(r => _hl(r.s)?.exceedMedianPct).filter(v => v != null)) ?? 0).toFixed(1),
    };
  }

  // ── A. Cross-pair consistency (sign test → BH → type-spread) ──
  const raw = CONSISTENCY.map(m => {
    const vals = recs.map(r => ({ r, v: m.get(r) })).filter(x => x.v != null);
    const nz = vals.filter(x => x.v !== 0);
    const up = nz.filter(x => x.v > 0), down = nz.filter(x => x.v < 0);
    const n = nz.length, k = Math.max(up.length, down.length);
    const majoritySide = up.length >= down.length ? up : down;
    const typeSpread = new Set(majoritySide.map(x => x.r.type)).size;
    const p = n >= 1 ? signTestP(n, k) : 1;
    return {
      key: m.key, question: m.q, label: m.label, unit: m.unit,
      nPairs: n, agree: k, direction: up.length >= down.length ? 'positive' : 'negative',
      meaning: up.length >= down.length ? m.pos : m.neg,
      medianEffect: +(_median(vals.map(x => x.v)) ?? 0).toFixed(2),
      pValue: +p.toFixed(4), typeSpread,
      agreeingPairs: majoritySide.map(x => x.r.name),
    };
  }).filter(x => x.nPairs >= minPairsForConsistency);
  const sig = _bhSignificant(raw.map(x => x.pValue), fdrQ);
  const consistency = raw.map((x, i) => ({ ...x, robust: sig.has(i) && x.typeSpread >= 2 }))
    .sort((a, b) => a.pValue - b.pValue);

  // ── Hidden relationships (Phase 2): cross-pair consistency of each causal
  //    predictor→miss-size correlation, + pooled day-types. Only pairs whose
  //    per-day feature scan ran contribute. ──
  let hidden = null;
  const scans = recs.filter(r => r.s?.featureScan && !r.s.featureScan.insufficient);
  if (scans.length >= minPairsForConsistency) {
    const first = scans[0].s.featureScan.correlations;
    const labelOf = Object.fromEntries(first.map(c => [c.key, c.label]));
    const rawH = first.map(c => c.key).map(key => {
      const vals = scans.map(r => { const c = r.s.featureScan.correlations.find(x => x.key === key); return (c && c.rhoAbsErr != null) ? { r, v: c.rhoAbsErr } : null; }).filter(Boolean);
      const nz = vals.filter(x => x.v !== 0);
      const up = nz.filter(x => x.v > 0), down = nz.filter(x => x.v < 0);
      const n = nz.length, k = Math.max(up.length, down.length);
      const maj = up.length >= down.length ? up : down;
      return { key, label: labelOf[key], nPairs: n, agree: k,
        direction: up.length >= down.length ? 'higher → bigger miss' : 'higher → smaller miss',
        medianRho: +(_median(vals.map(x => x.v)) ?? 0).toFixed(3),
        pValue: +signTestP(n, k).toFixed(4), typeSpread: new Set(maj.map(x => x.r.type)).size };
    }).filter(x => x.nPairs >= minPairsForConsistency);
    const sigH = _bhSignificant(rawH.map(x => x.pValue), fdrQ);
    const relationships = rawH.map((x, i) => ({ ...x, robust: sigH.has(i) && x.typeSpread >= 2 })).sort((a, b) => a.pValue - b.pValue);
    // Pool day-types by label across pairs (track pair identity so nPairs counts
    // DISTINCT pairs, not cluster instances — a pair can yield the same label twice).
    const byLabel = {};
    for (const r of scans) { const dt = r.s.featureScan.dayTypes; if (!dt || dt.insufficient) continue; for (const c of dt.clusters) (byLabel[c.label] = byLabel[c.label] || []).push({ ...c, pair: r.name }); }
    const dayTypes = Object.entries(byLabel).map(([label, arr]) => ({
      label, nPairs: new Set(arr.map(c => c.pair)).size,
      meanSharePct: +(_mean(arr.map(c => c.sharePct))).toFixed(1),
      meanCompletion: +(_mean(arr.map(c => c.meanCompletion))).toFixed(0),
      meanEfficiency: +(_mean(arr.map(c => c.meanEfficiency))).toFixed(2),
      meanAbsErr: +(_mean(arr.map(c => c.meanAbsErr))).toFixed(0),
    })).sort((a, b) => b.meanSharePct - a.meanSharePct);
    // Within-day SESSION relationships (Phase 2b) — cross-pair consistency of each
    // session-share → miss-size correlation. Only pairs whose scan joined session
    // data contribute. Labelled descriptive/within-day, not a pre-open predictor.
    let session = null;
    const sessScans = scans.filter(r => r.s.featureScan.sessionRelationships?.correlations?.length);
    if (sessScans.length >= minPairsForConsistency) {
      const sfirst = sessScans[0].s.featureScan.sessionRelationships.correlations;
      const slabelOf = Object.fromEntries(sfirst.map(c => [c.key, c.label]));
      const rawS = sfirst.map(c => c.key).map(key => {
        const vals = sessScans.map(r => { const c = r.s.featureScan.sessionRelationships.correlations.find(x => x.key === key); return (c && c.rhoAbsErr != null) ? { r, v: c.rhoAbsErr } : null; }).filter(Boolean);
        const nz = vals.filter(x => x.v !== 0);
        const up = nz.filter(x => x.v > 0), down = nz.filter(x => x.v < 0);
        const n = nz.length, k = Math.max(up.length, down.length);
        const maj = up.length >= down.length ? up : down;
        return { key, label: slabelOf[key], nPairs: n, agree: k,
          direction: up.length >= down.length ? 'bigger share → bigger miss' : 'bigger share → smaller miss',
          medianRho: +(_median(vals.map(x => x.v)) ?? 0).toFixed(3),
          pValue: +signTestP(n, k).toFixed(4), typeSpread: new Set(maj.map(x => x.r.type)).size };
      }).filter(x => x.nPairs >= minPairsForConsistency);
      const sigS = _bhSignificant(rawS.map(x => x.pValue), fdrQ);
      session = { nPairs: sessScans.length, note: 'within-day (session shares are end-of-day — descriptive, not pre-open)',
        relationships: rawS.map((x, i) => ({ ...x, robust: sigS.has(i) && x.typeSpread >= 2 })).sort((a, b) => a.pValue - b.pValue) };
    }
    hidden = { nPairs: scans.length, relationships, dayTypes, session };
  }

  // ── Hypotheses (from robust findings + type differences) — candidates, not rules ──
  const hypotheses = [];
  for (const c of consistency.filter(x => x.robust)) {
    hypotheses.push({ text: `${c.label}: robust across ${c.agree}/${c.nPairs} pairs spanning ${c.typeSpread} types — ${c.meaning}.`, evidence: `sign-test p=${c.pValue}, median effect ${c.medianEffect}${c.unit}`, dataNeeded: 'none (testable now)' });
  }
  // Type dispersion in reliability → is a whole type weak?
  const typeScores = Object.entries(byType).map(([t, v]) => ({ t, s: v.medianReliability })).filter(x => x.s != null);
  if (typeScores.length >= 2) {
    typeScores.sort((a, b) => a.s - b.s);
    const lo = typeScores[0], hi = typeScores.at(-1);
    if (hi.s - lo.s >= 20) hypotheses.push({ text: `Forecast reliability clusters by type: ${PAIR_TYPE_LABELS[hi.t]} (median ${hi.s}) rank well above ${PAIR_TYPE_LABELS[lo.t]} (median ${lo.s}).`, evidence: `${hi.s - lo.s} pt reliability gap`, dataNeeded: 'none (testable now)' });
  }
  // Hidden-relationship hypotheses (Phase 2) — now computed from the per-day scan.
  if (hidden) {
    for (const h of hidden.relationships.filter(x => x.robust))
      hypotheses.push({ text: `${h.label}: ${h.direction} — consistent across ${h.agree}/${h.nPairs} pairs (${h.typeSpread} types).`, evidence: `sign-test p=${h.pValue}, median ρ ${h.medianRho}`, dataNeeded: 'none (per-day scan)' });
    if (!hidden.relationships.some(x => x.robust))
      hypotheses.push({ text: 'No causal predictor of forecast-miss size replicates across pair types — misses look conditionally unpredictable from the current feature set.', evidence: `${hidden.nPairs} pairs scanned, none BH-significant + type-diverse`, dataNeeded: 'none (per-day scan)' });
    // Session (2b) — within-day, descriptive.
    if (hidden.session) {
      for (const h of hidden.session.relationships.filter(x => x.robust))
        hypotheses.push({ text: `${h.label}: ${h.direction} — within-day pattern consistent across ${h.agree}/${h.nPairs} pairs (${h.typeSpread} types).`, evidence: `sign-test p=${h.pValue}, median ρ ${h.medianRho} · descriptive, not pre-open`, dataNeeded: 'none (session join)' });
      if (!hidden.session.relationships.some(x => x.robust))
        hypotheses.push({ text: 'No session-share → forecast-miss relationship replicates across pair types (within-day).', evidence: `${hidden.session.nPairs} pairs with session data`, dataNeeded: 'none (session join)' });
    }
  }
  hypotheses.push({ text: 'Session-contribution ACCURACY (forecast Asia/London/NY share vs realized) and macro/news/holiday conditioning of misses.', evidence: 'the forecast emits no session split; no macro/calendar join', dataNeeded: 'forecaster session split + calendar join (Phase 2b-ii / 2c)' });

  // ── The BOT-relevant layer: touch behaviour + the decision-question set ──
  const touchBehaviour = _touchBehaviour(recs, minPairsForConsistency);
  const tb = touchBehaviour && !touchBehaviour.insufficient ? touchBehaviour : null;
  const costSurvival = _costSurvival(recs, minPairsForConsistency);
  const cs = costSurvival && !costSurvival.insufficient ? costSurvival : null;
  const botQuestions = _botQuestions(tb, hidden, cs, vfr?.cross?.portfolio ?? null);
  // Recalibration passthrough — the reference forecaster runs wide; these are the
  // walk-forward factors that bring exceed-median back to ~50% (already in vfr).
  const recal = vfr?.cross?.recalProposal ?? null;

  return {
    nPairs: names.length, pairs: names,
    generatedFrom: { vfrPairs: names.length, intradayPairs: Object.keys(inPer).length, scannedPairs: scans.length },
    fdrQ, weights,
    forecaster: 'reference (un-recalibrated volForecast.computeForecast) — see recal + calibrated export',
    reliability, trust, byType, consistency, hidden, touchBehaviour, costSurvival,
    portfolio: vfr?.cross?.portfolio ?? null, botQuestions, recal, hypotheses,
    notes: [
      'Trust tiers are RELATIVE terciles of reliability within this universe (+ a sharpness≤0 floor) — not absolute tradeability, which needs the touch-behaviour + cost layer.',
      'Calibration/skill metrics are measured on the REFERENCE forecaster (volForecast.js), which is NOT recalibrated — that is why bands read wide. The recal block + the calibrated export show the corrected picture.',
      'Reliability sub-scores are percentile ranks WITHIN this pair set — relative, not absolute.',
      'Correlated pairs are not independent: within-type agreement is down-weighted via the ≥2-type-spread requirement for "robust".',
    ],
  };
}

// The questions a level-trading bot actually needs answered, tagged with whether
// the current data answers them. Not trade rules — the research agenda for a bot.
function _botQuestions(tb, hidden, cs, portfolio) {
  const st = (have, gap) => have ? 'answerable now' : gap;
  const g = [
    { q: 'G1. Is the FORECAST the edge, or just a band? (placebo)', status: tb?.placebo ? 'answerable now' : 'GAP — run intraday', note: tb?.placebo ? tb.placebo.verdict : 'evaluate the forecast line vs a same-distance jittered placebo' },
    { q: 'G2. Payoff SHAPE — is fading selling underpriced vol insurance? (short gamma)', status: tb?.payoffShape ? 'answerable now' : 'GAP — run intraday', note: tb?.payoffShape ? tb.payoffShape.verdict : 'hold-to-close fade PnL skew + avg-win/avg-loss' },
    { q: 'G3. How many INDEPENDENT bets among the correlated pairs?', status: portfolio ? 'answerable now' : 'GAP — needs the return-correlation pass', note: portfolio ? portfolio.note : 'effective bets = participation ratio of the daily-return correlation matrix' },
  ];
  return g.concat([
    { q: '1. Universe — which pairs behave consistently enough to trade at all?', status: st(!!tb, 'run intraday'), note: tb ? `touch data on ${tb.nPairs} pairs; needs IS/OOS consistency of the touch edge` : 'needs the intraday touch study' },
    { q: '2. Setup — how often does price actually REACH the median / 75th line, and on which days?', status: st(!!tb, 'run intraday'), note: tb ? `median touch rate ${tb.medianTouchRatePct}% across pairs` : 'touchRatePct per pair' },
    { q: '3. Direction — at the line, does price FADE (revert) or FOLLOW (break)? overall and by regime?', status: st(!!tb, 'run intraday'), note: tb ? `${tb.fadeVsFollow.direction} (net ${tb.fadeVsFollow.medianNetContinue}pp); ${tb.regimeContrast.pairsFadeRangeFollowTrend}/${tb.regimeContrast.nPairs} pairs fade-in-range/follow-in-trend` : 'continue% vs reverse%, byRegime' },
    { q: '4. Retest — does the edge change on the 1st vs 2nd vs 3rd touch of the same level?', status: 'GAP — engine change', note: 'intraday has single-vs-many-retest only; a clean 1st/2nd/3rd sequence needs an intradayForecastResearch change' },
    { q: '5. Timing — which session is the touch/fade cleanest in?', status: st(!!tb, 'run intraday'), note: 'touches.bySession per pair (not yet folded cross-pair)' },
    { q: '6. Exit — what target/stop does the post-touch MFE/MAE distribution support?', status: st(!!tb, 'run intraday'), note: tb ? `median MFE ${tb.medianMfePips} / MAE ${tb.medianMaePips} pips — means only; full distributions would sharpen R:R` : 'meanMfePips / meanMaePips per pair' },
    { q: '7. Direction skew — is one side of the band hit first systematically?', status: st(!!tb, 'run intraday'), note: 'direction.firstUpperPct per pair' },
    { q: '8. Costs — does the touch-edge survive spread + slippage? (median / 75th / calm-day)', status: cs ? 'answerable now (screen)' : 'GAP — run intraday', note: cs ? `median: ${cs.byLine?.median?.verdict ?? cs.verdict} · 75th: ${cs.byLine?.p75?.verdict ?? 'n/a'} · calm-day: ${cs.byLine?.calm?.verdict ?? 'n/a'}` : 'THE make-or-break test — ±20-pip bracket net of costs; needs the intraday touch data' },
  ]);
}
