/**
 * Yield-Coupling Core — the price↔yield-spread coupling compute (measure-first).
 *
 * Purpose (this stage): a pure, offline-testable engine that takes an FX price
 * series and one or more bond-CFD "yield-spread" series on the same time grid and
 * emits the four primitives the whole idea reduces to:
 *
 *   • coupling  — rolling Pearson correlation of the two standardized series
 *                 (are price and the yield spread in sync *right now*?)
 *   • gap       — standardized price minus standardized spread (the error-
 *                 correction residual: how far price has detached from what the
 *                 yield spread implies)
 *   • lead-lag  — the bar offset that maximises |correlation| (does the yield
 *                 spread lead price, and by how much?)
 *   • direction — the sign the spread is pulling price toward (from the recent
 *                 slope of the standardized spread, gated by coupling)
 *
 * This is the nascent shared brick for the five planned consumers (daily brief,
 * z-score strategy, directional hook, regime filter, divergence alert). It is
 * deliberately horizon/-resolution-agnostic — the caller resamples to M1/M5/M15
 * and passes bars in; nothing here hard-codes a granularity.
 *
 * Lego notes:
 *   • Pure & dependency-light. No network, no asset knowledge, no DOM — data is
 *     passed in. Reuses `statsCore` moments; `pearson` / `rollingCorr` live here
 *     for now and are flagged candidates to promote into `statsCore` once a
 *     second consumer wants them (see LEGO_MODULES.md §2).
 *   • Bond price is the INVERSE of yield. Spread construction takes a signed
 *     coefficient per leg (on bond PRICE) so the caller encodes the yield sign
 *     once, explicitly — never a hidden default that drifts.
 */

import { mean, stdev } from './statsCore.js';
import { summarizeTrades } from './metricsCore.js';

// ── Standardize (population z over the whole window) ──────────────────────────
// Returns { z:number[], mean, std }. Non-finite inputs pass through as NaN.
// std===0 → all-zero z (a flat series has no shape to compare).
export function standardize(values) {
  const finite = values.filter(Number.isFinite);
  const m = mean(finite);
  const s = stdev(finite, 0);
  const z = values.map(v => (Number.isFinite(v) && s > 0 ? (v - m) / s : (Number.isFinite(v) ? 0 : NaN)));
  return { z, mean: m, std: s };
}

// ── Align a set of {t, v} series on their common timestamps (inner join) ──────
// Each series is [{ t:string, v:number }] (t is a sortable time key). Returns
// { times:string[], columns:number[][] } where columns[k][i] is series k at
// times[i]. Missing bars in any series drop that timestamp from the join.
export function alignByTime(seriesList) {
  if (!seriesList.length) return { times: [], columns: [] };
  const maps = seriesList.map(s => {
    const m = new Map();
    for (const { t, v } of s) m.set(t, v);
    return m;
  });
  // Common timestamps = present in every series, sorted ascending.
  const times = [...maps[0].keys()]
    .filter(t => maps.every(m => m.has(t) && Number.isFinite(m.get(t))))
    .sort();
  const columns = maps.map(m => times.map(t => m.get(t)));
  return { times, columns };
}

// ── Build a yield-spread series from signed bond-price legs ───────────────────
// legs: [{ price:number[], k:number }]  — k is the coefficient on bond PRICE.
// Because yield ≈ −price, encode the FX-bullish orientation via k (e.g. for
// EUR/USD 10Y: +USB10Y − DE10YB ∝ yield_DE − yield_US, bullish EUR when > 0).
// All leg arrays must be the same length (align first). Returns number[].
export function buildSpread(legs) {
  if (!legs.length) return [];
  const n = legs[0].price.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let acc = 0, ok = true;
    for (const { price, k } of legs) {
      if (!Number.isFinite(price[i])) { ok = false; break; }
      acc += k * price[i];
    }
    out[i] = ok ? acc : NaN;
  }
  return out;
}

// ── Pearson correlation of two equal-length arrays (finite pairs only) ────────
export function pearson(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < a.length; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) { xs.push(a[i]); ys.push(b[i]); }
  }
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = mean(xs), my = mean(ys);
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  if (vx <= 0 || vy <= 0) return NaN;
  return cov / Math.sqrt(vx * vy);
}

// ── Rolling Pearson correlation over a trailing window ────────────────────────
// out[i] = corr(a[i-window+1 .. i], b[same]); NaN until the window is full.
export function rollingCorr(a, b, window) {
  const out = new Array(a.length).fill(NaN);
  for (let i = window - 1; i < a.length; i++) {
    out[i] = pearson(a.slice(i - window + 1, i + 1), b.slice(i - window + 1, i + 1));
  }
  return out;
}

// ── Gap (error-correction residual) between two standardized series ───────────
// Both inputs should already be standardized (unitless). gap = a − b in σ-units.
export function gapSeries(aZ, bZ) {
  return aZ.map((v, i) => (Number.isFinite(v) && Number.isFinite(bZ[i]) ? v - bZ[i] : NaN));
}

// ── Lead-lag: the shift of `b` that best matches `a` ──────────────────────────
// Scans lag ∈ [−maxLag, +maxLag]; a positive lag means `b` LEADS `a` (shifting b
// forward in time aligns it onto a). Returns { lag, corr } maximising |corr|,
// plus the full profile for plotting. lag=0 corr is the coincident correlation.
export function bestLag(a, b, maxLag) {
  const profile = [];
  let best = { lag: 0, corr: NaN };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    // Compare a[i] with b[i-lag]: positive lag → b's earlier value predicts a.
    const xs = [], ys = [];
    for (let i = 0; i < a.length; i++) {
      const j = i - lag;
      if (j < 0 || j >= b.length) continue;
      if (Number.isFinite(a[i]) && Number.isFinite(b[j])) { xs.push(a[i]); ys.push(b[j]); }
    }
    const c = pearson(xs, ys);
    profile.push({ lag, corr: c });
    if (Number.isFinite(c) && (!Number.isFinite(best.corr) || Math.abs(c) > Math.abs(best.corr))) {
      best = { lag, corr: c };
    }
  }
  return { ...best, profile };
}

// ── Direction: recent slope of the standardized spread, gated by coupling ─────
// Returns { sign:-1|0|1, slope, coupling } — the spread's pull on price over the
// last `look` bars, only asserted (non-zero) when |coupling| ≥ minCoupling.
// `couplingSign` is the sign of the coincident correlation, so a negative
// (inverse) coupling still yields the correct price direction.
export function directionSignal(spreadZ, coupling, { look = 12, minCoupling = 0.4 } = {}) {
  const tail = spreadZ.slice(-look).filter(Number.isFinite);
  if (tail.length < 2) return { sign: 0, slope: 0, coupling };
  const slope = tail[tail.length - 1] - tail[0];
  const couplingSign = Number.isFinite(coupling) && coupling < 0 ? -1 : 1;
  const strong = Number.isFinite(coupling) && Math.abs(coupling) >= minCoupling;
  const raw = slope > 0 ? 1 : slope < 0 ? -1 : 0;
  return { sign: strong ? raw * couplingSign : 0, slope, coupling };
}

// ── Top-level convenience: everything from aligned raw price + spread ─────────
// price, spread: equal-length raw number[] on the SAME time grid (align first).
// Returns the standardized overlay series + the four primitives.
export function computeCoupling(price, spread, { corrWindow = 60, maxLag = 24, dirLook = 12, minCoupling = 0.4 } = {}) {
  const priceZ  = standardize(price).z;
  const spreadZ = standardize(spread).z;
  const corr    = rollingCorr(priceZ, spreadZ, corrWindow);
  const gap     = gapSeries(priceZ, spreadZ);
  const lag     = bestLag(priceZ, spreadZ, maxLag);
  const coincident = pearson(priceZ, spreadZ);
  const lastCorr = [...corr].reverse().find(Number.isFinite);
  const direction = directionSignal(spreadZ, lastCorr ?? coincident, { look: dirLook, minCoupling });
  return { priceZ, spreadZ, corr, gap, lag, coincident, direction };
}

// ── Returns (first differences) ───────────────────────────────────────────────
// out[0] = NaN; out[i] = arr[i] − arr[i-1]. The right transform for the TRADING
// question — do price CHANGES track spread CHANGES — vs the level correlation,
// which is spurious for two drifting series (two random walks can level-correlate
// by accident yet have uncorrelated returns).
export function toReturns(arr) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 1; i < arr.length; i++) {
    out[i] = (Number.isFinite(arr[i]) && Number.isFinite(arr[i - 1])) ? arr[i] - arr[i - 1] : NaN;
  }
  return out;
}

// ── FX session buckets by UTC hour ────────────────────────────────────────────
// Rates-lead-FX operates in the active hours (London, and the London+NY overlap
// where US data lands), not the Asia lull — so a REAL coupling should concentrate
// by session. `times` here are ISO-8601 UTC strings (OANDA candle times).
export const SESSIONS = ['Asia', 'London', 'Overlap', 'NY'];
export function sessionOfUTCHour(h) {
  if (h >= 7  && h < 12) return 'London';
  if (h >= 12 && h < 16) return 'Overlap';   // London+NY; US data (12:30/13:30/14:00 UTC) lands here
  if (h >= 16 && h < 21) return 'NY';
  return 'Asia';                             // 21:00–07:00 UTC
}

// ── Per-session coincident correlation of two aligned return series ───────────
// Returns { [session]: { corr, n } } — the decisive readout: does the coupling
// light up in London/Overlap and vanish in Asia?
export function sessionBreakdown(aRet, bRet, times) {
  const buckets = {}; for (const s of SESSIONS) buckets[s] = { a: [], b: [] };
  for (let i = 0; i < times.length; i++) {
    if (!Number.isFinite(aRet[i]) || !Number.isFinite(bRet[i])) continue;
    const s = sessionOfUTCHour(new Date(times[i]).getUTCHours());
    buckets[s].a.push(aRet[i]); buckets[s].b.push(bRet[i]);
  }
  const out = {};
  for (const s of SESSIONS) out[s] = { corr: pearson(buckets[s].a, buckets[s].b), n: buckets[s].a.length };
  return out;
}

// ── Returns-based coupling (the trading-relevant measurement) ─────────────────
// Correlates price CHANGES vs spread CHANGES, overall + rolling + lead-lag, and
// breaks the coincident correlation down by session. No "gap" — returns have no
// level to revert to.
export function computeReturnsCoupling(price, spread, times, { corrWindow = 60, maxLag = 24 } = {}) {
  const priceRet  = toReturns(price);
  const spreadRet = toReturns(spread);
  return {
    coincident: pearson(priceRet, spreadRet),
    corr: rollingCorr(priceRet, spreadRet, corrWindow),
    lag: bestLag(priceRet, spreadRet, maxLag),
    bySession: sessionBreakdown(priceRet, spreadRet, times),
  };
}

// ── Live coupling state — the daily-brief "rates confirmation" reading ───────
// Honest scope: a CONTEXT / CONVICTION flag, NOT a directional forecast (the
// aggregate directional test came back weak). It answers two live questions:
// is the yield currently a useful lens (coupled + which session), and is the
// latest price move corroborated by rates? Returns the newest-bar reading.
export function couplingState(price, spread, times, { corrWindow = 60, minCoupling = 0.35, look = 12 } = {}) {
  const n = price.length;
  const priceRet  = toReturns(price);
  const spreadRet = toReturns(spread);
  const coup = rollingCorr(priceRet, spreadRet, corrWindow);
  const regimeCorr = [...coup].reverse().find(Number.isFinite) ?? NaN;
  const session = n ? sessionOfUTCHour(new Date(times[n - 1]).getUTCHours()) : null;
  const coupled = Number.isFinite(regimeCorr) && Math.abs(regimeCorr) >= minCoupling;
  const sign = Number.isFinite(regimeCorr) && regimeCorr < 0 ? -1 : 1;   // inverse coupling still corroborates by leg sign
  const pMove = (n > look) ? price[n - 1]  - price[n - 1 - look]  : NaN;
  const sMove = (n > look) ? spread[n - 1] - spread[n - 1 - look] : NaN;
  const corroborated = Number.isFinite(pMove) && Number.isFinite(sMove)
    && Math.sign(pMove) === Math.sign(sMove * sign);
  let state, note;
  if (!coupled) { state = 'decoupled'; note = 'rates not driving price right now — yield uninformative'; }
  else if (corroborated) { state = 'confirmed'; note = 'move is rates-backed — the yield corroborates it (higher conviction)'; }
  else { state = 'divergent'; note = 'price running against rates — move is unconfirmed (lower conviction; direction not predicted)'; }
  return { regimeCorr, coupled, session, priceMove: pMove, spreadMove: sMove, corroborated, state, note };
}

// ── Autocorrelation of a series at a forward lag (finite pairs only) ──────────
export function laggedAutocorr(series, lag) {
  const a = [], b = [];
  for (let i = 0; i + lag < series.length; i++) {
    if (Number.isFinite(series[i]) && Number.isFinite(series[i + lag])) { a.push(series[i]); b.push(series[i + lag]); }
  }
  return pearson(a, b);
}

// ── Coupling-regime persistence & forward forecast (the "predict WHEN" test) ──
// The coupling is intermittent; this measures whether the REGIME is predictable:
//   • autocorr   — is the rolling (returns) coupling sticky? coupled-now → coupled-later?
//   • forwardCoupling — mean coupling `fwdBars` ahead, given coupled-now vs decoupled-now
//   • directional — during coupled regimes only, does the trailing yield-vs-price
//     divergence predict the FORWARD price direction? (hit rate vs 0.5) — with the
//     decoupled bucket as the control. Diagnostic (in-sample, no costs): tells us
//     if the edge EXISTS; a tradeable version still needs the honest harness.
// No-lookahead in the directional test: trailing-window moves only; the forward
// price move is the thing predicted.
export function computeCouplingPersistence(price, spread, times, {
  corrWindow = 60, fwdBars = 48, coupledThresh = 0.5, decoupledThresh = 0.15,
  autocorrLags = [12, 48, 96],
} = {}) {
  const priceRet  = toReturns(price);
  const spreadRet = toReturns(spread);
  const coup = rollingCorr(priceRet, spreadRet, corrWindow);      // returns-based rolling coupling

  const autocorr = autocorrLags.map(lag => ({ lag, corr: laggedAutocorr(coup, lag) }));

  // conditional forward coupling
  const cF = [], dF = [];
  for (let i = 0; i + fwdBars < coup.length; i++) {
    const c = coup[i], f = coup[i + fwdBars];
    if (!Number.isFinite(c) || !Number.isFinite(f)) continue;
    if (c >= coupledThresh) cF.push(f);
    else if (Math.abs(c) <= decoupledThresh) dF.push(f);
  }
  const forwardCoupling = {
    coupled:   { mean: cF.length ? mean(cF) : NaN, n: cF.length },
    decoupled: { mean: dF.length ? mean(dF) : NaN, n: dF.length },
  };

  // directional payoff: trailing divergence → forward price direction, by regime
  let cHit = 0, cN = 0, dHit = 0, dN = 0;
  for (let i = corrWindow; i + fwdBars < price.length; i++) {
    const c = coup[i];
    if (!Number.isFinite(c)) continue;
    const pWin = priceRet.slice(i - corrWindow + 1, i + 1).filter(Number.isFinite);
    const sWin = spreadRet.slice(i - corrWindow + 1, i + 1).filter(Number.isFinite);
    const pSd = stdev(pWin, 0), sSd = stdev(sWin, 0);
    if (pSd <= 0 || sSd <= 0) continue;
    // trailing moves scaled by their own volatility → comparable units
    const pMove = (price[i]  - price[i  - corrWindow]) / (pSd * Math.sqrt(corrWindow));
    const sMove = (spread[i] - spread[i - corrWindow]) / (sSd * Math.sqrt(corrWindow));
    const gap = sMove - pMove;                    // yield outran price ⇒ price should catch up (rise)
    const pf  = price[i + fwdBars] - price[i];
    if (!Number.isFinite(gap) || !Number.isFinite(pf) || gap === 0 || pf === 0) continue;
    const hit = (gap > 0) === (pf > 0) ? 1 : 0;
    if (c >= coupledThresh) { cHit += hit; cN++; }
    else if (Math.abs(c) <= decoupledThresh) { dHit += hit; dN++; }
  }
  const directional = {
    coupled:   { hit: cN ? cHit / cN : NaN, n: cN },
    decoupled: { hit: dN ? dHit / dN : NaN, n: dN },
  };

  return { autocorr, forwardCoupling, directional, corrWindow, fwdBars, coupledThresh, decoupledThresh };
}

// ── Daily lead-lag: at what lag (in days) does the spread LEAD price? ─────────
// The macro thesis (Cole/"Transatlantic spread"): the yield spread leads EUR/USD
// by hours→weeks because institutional flows are slow — so at DAILY resolution
// the optimal lead lag should be POSITIVE (spread moves first). Intraday it's
// ~coincident (which matches the ±2h finding); the edge is at the daily horizon.
// Also tests whether spread MOMENTUM (change over `lookback` days) predicts the
// FORWARD price return (over `horizon` days) — the "spread momentum" signal.
// fx/spread are daily LEVEL series (spread oriented FX-bullish-when-positive).
export function computeDailyLeadLag(fx, spread, { maxLagDays = 30, lookback = 5, horizon = 5 } = {}) {
  const fxRet = toReturns(fx);
  const spRet = toReturns(spread);
  // lag profile: corr(fxRet[t], spRet[t-lag]); lag>0 ⇒ spread LEADS price by `lag` days
  const profile = [];
  let best = { lag: 0, corr: NaN };
  for (let lag = 0; lag <= maxLagDays; lag++) {
    const a = [], b = [];
    for (let t = 0; t < fxRet.length; t++) {
      const j = t - lag;
      if (j < 0) continue;
      if (Number.isFinite(fxRet[t]) && Number.isFinite(spRet[j])) { a.push(fxRet[t]); b.push(spRet[j]); }
    }
    const c = pearson(a, b);
    profile.push({ lag, corr: c });
    if (Number.isFinite(c) && (!Number.isFinite(best.corr) || Math.abs(c) > Math.abs(best.corr))) best = { lag, corr: c };
  }
  // momentum → forward return: past `lookback`-day spread change vs next `horizon`-day fx return
  const mS = [], mF = []; let hit = 0, n = 0;
  for (let t = lookback; t + horizon < fx.length; t++) {
    const sMom = spread[t] - spread[t - lookback];
    const fFwd = fx[t + horizon] - fx[t];
    if (!Number.isFinite(sMom) || !Number.isFinite(fFwd) || sMom === 0 || fFwd === 0) continue;
    mS.push(sMom); mF.push(fFwd);
    if ((sMom > 0) === (fFwd > 0)) hit++;
    n++;
  }
  return {
    coincident: profile[0]?.corr ?? NaN,
    bestLag: best.lag, bestCorr: best.corr, profile,
    momentum: { corr: pearson(mS, mF), hitRate: n ? hit / n : NaN, n, lookback, horizon },
  };
}

// ── Divergence events: the CONDITIONAL edge an average correlation can't see ──
// The trader's setup is not "every day" — it's a LARGE divergence (spread moved,
// FX hasn't), then FX converges. An unconditional correlation averages the ~5%
// signal days into 95% noise → looks coincident. This buckets days by divergence
// SIZE and measures whether FX then moves to close the gap. The signature of a
// real edge: hit-rate RISING with divergence magnitude. gap>0 ⇒ spread has
// outrun FX upward ⇒ expect FX to rise. No lookahead (gap from a trailing window;
// the forward move is what's predicted).
export function computeDivergenceEvents(fx, spread, { window = 10, horizons = [1, 3, 5, 10], buckets = 4 } = {}) {
  const fxRet = toReturns(fx), spRet = toReturns(spread);
  const gaps = new Array(fx.length).fill(NaN);
  for (let t = window; t < fx.length; t++) {
    const fWin = fxRet.slice(t - window + 1, t + 1).filter(Number.isFinite);
    const sWin = spRet.slice(t - window + 1, t + 1).filter(Number.isFinite);
    const fSd = stdev(fWin, 0), sSd = stdev(sWin, 0);
    if (fSd <= 0 || sSd <= 0) continue;
    const fMove = (fx[t]     - fx[t - window])     / (fSd * Math.sqrt(window));
    const sMove = (spread[t] - spread[t - window]) / (sSd * Math.sqrt(window));
    gaps[t] = sMove - fMove;                       // spread ahead of FX (both vol-scaled)
  }
  const idx = gaps.map((g, i) => ({ i, g })).filter(x => Number.isFinite(x.g));
  const sorted = [...idx].sort((a, b) => Math.abs(a.g) - Math.abs(b.g));
  const per = Math.floor(sorted.length / buckets) || 1;
  const bucketStats = [];
  for (let b = 0; b < buckets; b++) {
    const slice = sorted.slice(b * per, b === buckets - 1 ? sorted.length : (b + 1) * per);
    const hz = {};
    for (const h of horizons) {
      let hit = 0, n = 0;
      for (const { i, g } of slice) {
        if (i + h >= fx.length) continue;
        const fwd = fx[i + h] - fx[i];
        if (!Number.isFinite(fwd) || fwd === 0 || g === 0) continue;
        if ((g > 0) === (fwd > 0)) hit++;
        n++;
      }
      hz[h] = { hit: n ? hit / n : NaN, n };
    }
    bucketStats.push({
      bucket: b,
      minAbs: slice.length ? Math.abs(slice[0].g) : NaN,
      maxAbs: slice.length ? Math.abs(slice[slice.length - 1].g) : NaN,
      horizons: hz,
    });
  }
  return { window, horizons, buckets: bucketStats };
}

// ── Backtest: fade a big divergence back toward the yield (the real trade) ────
// The diagnostics measured DIRECTION hit-rate; a mean-reversion trade's edge is
// in R:R (target = the gap, stop = further divergence), which a hit-rate can't
// see. This runs the actual trade honestly: enter when |gap| ≥ an IS-learned
// threshold, fade toward the yield (gap>0 ⇒ long FX), hold `horizon` days,
// mark-to-close (no intrabar path assumption), net of round-trip cost.
// Threshold is learned on the IS window only (no OOS lookahead); trades are
// non-overlapping. Reuses `summarizeTrades` (metricsCore) for honest metrics.
export function backtestDivergenceFade(fx, spread, times, {
  window = 10, gapQuantile = 0.75, horizon = 5, costPct = 0.0002, isFrac = 0.7,
} = {}) {
  const fxRet = toReturns(fx), spRet = toReturns(spread);
  const gaps = new Array(fx.length).fill(NaN);
  for (let t = window; t < fx.length; t++) {
    const fWin = fxRet.slice(t - window + 1, t + 1).filter(Number.isFinite);
    const sWin = spRet.slice(t - window + 1, t + 1).filter(Number.isFinite);
    const fSd = stdev(fWin, 0), sSd = stdev(sWin, 0);
    if (fSd <= 0 || sSd <= 0) continue;
    const fMove = (fx[t]     - fx[t - window])     / (fSd * Math.sqrt(window));
    const sMove = (spread[t] - spread[t - window]) / (sSd * Math.sqrt(window));
    gaps[t] = sMove - fMove;
  }
  // threshold learned on the IS window only (no OOS lookahead)
  const boundary = Math.floor(fx.length * isFrac);
  const absIS = [];
  for (let i = window; i < boundary; i++) if (Number.isFinite(gaps[i])) absIS.push(Math.abs(gaps[i]));
  absIS.sort((a, b) => a - b);
  const thresh = absIS.length ? absIS[Math.min(absIS.length - 1, Math.floor(gapQuantile * absIS.length))] : Infinity;

  const trades = [];
  let t = window;
  while (t + horizon < fx.length) {
    const g = gaps[t];
    if (Number.isFinite(g) && Math.abs(g) >= thresh) {
      const dir = g > 0 ? 1 : -1;                    // gap>0: spread outran FX up → fade = long FX to close it
      const entry = fx[t], exit = fx[t + horizon];
      if (Number.isFinite(entry) && Number.isFinite(exit) && entry !== 0) {
        const gross = dir * (exit - entry) / entry;
        trades.push({ i: t, date: times[t], gross, ret: gross - costPct, oos: t >= boundary });
        t += horizon;                                // non-overlapping
        continue;
      }
    }
    t++;
  }
  const isT = trades.filter(x => !x.oos), oosT = trades.filter(x => x.oos);
  const summ = arr => {
    const s = summarizeTrades(arr.map(x => x.ret), arr.map(x => x.date));
    const wins = arr.map(x => x.ret).filter(r => r > 0), losses = arr.map(x => x.ret).filter(r => r < 0);
    s.avgWin  = wins.length   ? +mean(wins).toFixed(5)   : 0;
    s.avgLoss = losses.length ? +mean(losses).toFixed(5) : 0;
    s.rr = s.avgLoss < 0 ? +(s.avgWin / -s.avgLoss).toFixed(2) : 0;
    return s;
  };
  // OOS cost sensitivity — re-net gross at 1×/2×/3× the base cost
  const costStress = [1, 2, 3].map(mult => ({
    mult, sharpe: summarizeTrades(oosT.map(x => x.gross - mult * costPct), oosT.map(x => x.date)).sharpe,
    expectancy: +mean(oosT.map(x => x.gross - mult * costPct)).toFixed(5),
  }));
  return {
    params: { window, gapQuantile, horizon, costPct: +costPct.toFixed(5) },
    thresh: +thresh.toFixed(3), nTrades: trades.length,
    is: summ(isT), oos: summ(oosT), costStress,
  };
}

// ── Walk-forward: the RAW relationship per time-fold (no trade bias) ─────────
// Neutral by design — reports what price DID after a big divergence, per fold, so
// you judge it yourself. The signed forward return uses sign(gap): POSITIVE means
// price REVERTED toward the yield (mean-reversion), NEGATIVE means it CONTINUED
// away (momentum). That sign is the DATA, not an assumed trade. Per-fold |gap|
// threshold (each period judged on its own extremes), non-overlapping events,
// gross AND net-of-cost. No verdict — just numbers.
export function walkForwardDivergence(fx, spread, times, {
  window = 10, gapQuantile = 0.9, horizon = 3, folds = 6, costPct = 0.00015,
} = {}) {
  const fxRet = toReturns(fx), spRet = toReturns(spread);
  const gaps = new Array(fx.length).fill(NaN);
  for (let t = window; t < fx.length; t++) {
    const fWin = fxRet.slice(t - window + 1, t + 1).filter(Number.isFinite);
    const sWin = spRet.slice(t - window + 1, t + 1).filter(Number.isFinite);
    const fSd = stdev(fWin, 0), sSd = stdev(sWin, 0);
    if (fSd <= 0 || sSd <= 0) continue;
    gaps[t] = (spread[t] - spread[t - window]) / (sSd * Math.sqrt(window))
            - (fx[t]     - fx[t - window])     / (fSd * Math.sqrt(window));
  }
  const N = fx.length, foldSize = Math.floor(N / folds), out = [];
  for (let f = 0; f < folds; f++) {
    const lo = f * foldSize, hi = f === folds - 1 ? N : (f + 1) * foldSize;
    const absF = [];
    for (let i = Math.max(lo, window); i < hi; i++) if (Number.isFinite(gaps[i])) absF.push(Math.abs(gaps[i]));
    absF.sort((a, b) => a - b);
    const thr = absF.length ? absF[Math.min(absF.length - 1, Math.floor(gapQuantile * absF.length))] : Infinity;
    const rets = [], dates = [];
    let t = Math.max(lo, window);
    while (t + horizon < hi) {
      const g = gaps[t];
      if (Number.isFinite(g) && Math.abs(g) >= thr) {
        const dir = g > 0 ? 1 : -1, entry = fx[t], exit = fx[t + horizon];
        if (Number.isFinite(entry) && Number.isFinite(exit) && entry !== 0) {
          rets.push(dir * (exit - entry) / entry); dates.push(times[t]); t += horizon; continue;
        }
      }
      t++;
    }
    const n = rets.length;
    const meanGross = n ? mean(rets) : NaN;
    const meanNet   = n ? meanGross - costPct : NaN;
    const sd = n > 1 ? stdev(rets, 0) : 0;
    const yrs = n > 1 ? Math.max((Date.parse(dates[n - 1]) - Date.parse(dates[0])) / (365.25 * 864e5), 0.25) : 0.25;
    const sharpeNet = sd > 1e-9 ? (meanNet / sd) * Math.sqrt(n / yrs) : 0;
    out.push({
      fold: f + 1, from: times[lo]?.slice(0, 10) ?? null, to: times[hi - 1]?.slice(0, 10) ?? null,
      n, reverted: n ? rets.filter(r => r > 0).length / n : NaN,
      meanGrossPct: n ? +(meanGross * 100).toFixed(4) : NaN,
      meanNetPct:   n ? +(meanNet   * 100).toFixed(4) : NaN,
      sharpeNet: +sharpeNet.toFixed(3),
    });
  }
  const valid = out.filter(o => o.n >= 10);
  const revs = valid.map(o => o.reverted).sort((a, b) => a - b);
  return {
    params: { window, gapQuantile, horizon, folds, costPct: +costPct.toFixed(5) },
    folds: out,
    summary: {
      foldsWithData: valid.length,
      foldsRevertGt50: valid.filter(o => o.reverted > 0.5).length,
      foldsNetPositive: valid.filter(o => o.meanNetPct > 0).length,
      medianReverted: revs.length ? +revs[Math.floor(revs.length / 2)].toFixed(3) : NaN,
    },
  };
}

// ── Prior-day projection: does TODAY's price follow YESTERDAY's yield? ────────
// The user's indicator projects yesterday's yield path forward as today's
// expected price path — a ~1-DAY-lagged relationship, far outside the intraday
// (≤2h) lead-lag everything else measured, so it's a genuinely separate test.
// Bars are grouped by UTC date and matched across consecutive days by
// time-of-day (HH:MM). Everything uses change-from-day-open (paths), no lookahead
// beyond "yesterday" (the projection input).
//   • shapeCorr   — pooled corr of today's price path vs yesterday's yield path,
//                   plus the per-day correlation distribution (% of days positive)
//   • dailyDirHit — does yesterday's NET yield direction predict today's NET price
//                   direction? hit rate vs 0.5 — the "calls the day right" number
export function computePriorDayProjection(price, spread, times, { minBarsPerDay = 40 } = {}) {
  const byDate = new Map();
  for (let i = 0; i < times.length; i++) {
    const d = times[i].slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(i);
  }
  const dates = [...byDate.keys()].sort();
  const perDay = dates.map(d => {
    const idx = byDate.get(d);
    const p0 = price[idx[0]], s0 = spread[idx[0]];
    const map = new Map();                       // 'HH:MM' -> { pc, yc } (change from day open)
    for (const i of idx) {
      if (!Number.isFinite(price[i]) || !Number.isFinite(spread[i])) continue;
      map.set(times[i].slice(11, 16), { pc: price[i] - p0, yc: spread[i] - s0 });
    }
    const last = idx[idx.length - 1];
    return { d, n: map.size, map, netP: price[last] - p0, netY: spread[last] - s0 };
  });

  const allP = [], allY = [], perDayCorr = [];
  let dirHit = 0, dirN = 0;
  for (let i = 1; i < perDay.length; i++) {
    const today = perDay[i], yest = perDay[i - 1];
    if (today.n < minBarsPerDay || yest.n < minBarsPerDay) continue;
    // "calls the day": yesterday's net yield direction → today's net price direction
    if (Number.isFinite(yest.netY) && Number.isFinite(today.netP) && yest.netY !== 0 && today.netP !== 0) {
      if ((yest.netY > 0) === (today.netP > 0)) dirHit++;
      dirN++;
    }
    // shape: match today's price path to yesterday's yield path by time-of-day
    const tp = [], yy = [];
    for (const [tod, v] of today.map) {
      const yv = yest.map.get(tod);
      if (yv) { tp.push(v.pc); yy.push(yv.yc); }
    }
    if (tp.length >= minBarsPerDay) { allP.push(...tp); allY.push(...yy); perDayCorr.push(pearson(tp, yy)); }
  }
  const valid = perDayCorr.filter(Number.isFinite).sort((a, b) => a - b);
  const meanC = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
  return {
    shapeCorr: {
      pooled: pearson(allP, allY),
      mean: meanC,
      median: valid.length ? valid[Math.floor(valid.length / 2)] : NaN,
      pctPositive: valid.length ? valid.filter(c => c > 0).length / valid.length : NaN,
      nDays: valid.length,
    },
    dailyDirHit: { hit: dirN ? dirHit / dirN : NaN, n: dirN },
  };
}
