// mve/validateInstrument.js — (b) the honest gate. Answers the only question that
// matters before wiring the MVE into any decision: DOES THE MISPRICING PREDICT
// FORWARD RETURNS, out-of-sample? Walk-forward, strictly no-lookahead: at each bar
// the fair value is fit on data BEFORE that bar, the mispricing z is computed, and
// paired with the SUBSEQUENT return. Reports the information coefficient (IC) per
// horizon, a directional hit rate, and a deflated-Sharpe of a simple z-fade rule.
//
// A cheap read (z<0) should predict a POSITIVE forward return, so a working model
// has NEGATIVE corr(z, fwdRet) — reported as `icPredictive = −IC` (positive = good).
//
// Pure — feed it the same {price, factors} a runMVE ctx carries. No network.

import { olsFit, olsPredict, predictSigma } from './ols.js';
import { deflatedSharpe } from './validation.js';

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx <= 0 || syy <= 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const std = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : 0; };

// Walk-forward OOS mispricing series. Returns { idx[], z[], zBench[] } where at each
// bar idx[k] (params fit strictly on < idx[k]):
//   z      — the FACTOR fair-value mispricing (price − OLS(factors)).
//   zBench — a NAIVE trailing-mean-anchor mispricing (price − rolling mean), built the
//            SAME way. This is the benchmark: on a random walk BOTH show spurious
//            "reversion" IC, so only z's EDGE over zBench is real signal.
export function oosMispricingSeries(price, factors, { window = 150, minTrain = 180 } = {}) {
  const N = price.length;
  const k = factors.length;
  const idx = [], z = [], zBench = [];
  const start = Math.max(window, minTrain);
  for (let i = start; i < N; i++) {
    const s = i - window;
    const y = price.slice(s, i);                                   // strictly before i
    if (y.length < k + 5) continue;
    const xi = factors.map(f => f.series[i]);
    if (xi.some(v => !Number.isFinite(v))) continue;

    // Factor fair value (OLS on factors)
    const F = [];
    for (let j = s; j < i; j++) F.push(factors.map(f => f.series[j]));
    const fit = olsFit(F, y);
    if (!fit) continue;
    const fv = olsPredict(fit, xi);
    const ps = predictSigma(fit, xi);
    if (!(ps > 0)) continue;

    // Benchmark fair value (trailing mean of the same window)
    const bmMean = y.reduce((a, b) => a + b, 0) / y.length;
    const bmVar = y.reduce((a, b) => a + (b - bmMean) ** 2, 0) / Math.max(1, y.length - 1);
    const bmSd = Math.sqrt(bmVar);
    if (!(bmSd > 0)) continue;

    idx.push(i);
    z.push((price[i] - fv) / ps);
    zBench.push((price[i] - bmMean) / bmSd);
  }
  return { idx, z, zBench };
}

// Full validation report.
export function validateInstrument(ctx, { window = 150, minTrain = 180,
                                          horizons = [1, 5, 10, 20, 60],
                                          thresholds = [0.5, 1.0, 1.5, 2.0],
                                          actionableZ = 1.0,
                                          periodsPerYear = 252 } = {}) {
  const price = ctx.price, factors = ctx.factors;
  if (!price || price.length < minTrain + Math.max(...horizons) + 10 || !factors?.length) {
    return { ok: false, error: `need ≥ ${minTrain + Math.max(...horizons) + 10} bars, got ${price?.length ?? 0}` };
  }
  const { idx, z, zBench } = oosMispricingSeries(price, factors, { window, minTrain });
  if (idx.length < 30) return { ok: false, error: `only ${idx.length} OOS points` };

  // ── IC + hit rate per horizon, vs the trailing-mean benchmark ──────────────
  // icPredictive = −corr(z, fwdRet)  (>0 ⇒ cheap→up / rich→down held OOS).
  // BUT any trailing anchor shows spurious reversion IC on a random walk, so the
  // real signal is icEdge = model icPredictive − benchmark icPredictive.
  const perHorizon = {};
  for (const H of horizons) {
    const zs = [], zb = [], rets = [];
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (i + H >= price.length) break;
      const ret = (price[i + H] - price[i]) / price[i];
      zs.push(z[k]); zb.push(zBench[k]); rets.push(ret);
    }
    if (zs.length < 20) { perHorizon[H] = { n: zs.length, insufficient: true }; continue; }
    const icModel = pearson(zs, rets);
    const icBench = pearson(zb, rets);
    let hit = 0, act = 0, cheapRets = [], richRets = [];
    for (let k = 0; k < zs.length; k++) {
      if (zs[k] <= -0.001) cheapRets.push(rets[k]);
      else if (zs[k] >= 0.001) richRets.push(rets[k]);
      if (Math.abs(zs[k]) >= actionableZ) { act++; if (Math.sign(-zs[k]) === Math.sign(rets[k])) hit++; }
    }
    const icPred = icModel == null ? null : +(-icModel).toFixed(4);
    const icBenchPred = icBench == null ? null : +(-icBench).toFixed(4);
    perHorizon[H] = {
      n: zs.length,
      icPredictive: icPred,                 // >0 = mispricing predicts reversion (RAW, spurious-inflated)
      icBenchmark: icBenchPred,             // trailing-mean anchor's spurious IC
      icEdge: (icPred != null && icBenchPred != null) ? +(icPred - icBenchPred).toFixed(4) : null,  // the REAL number
      hitRate: act ? +(hit / act).toFixed(3) : null,
      nActionable: act,
      meanFwdRet_cheap: cheapRets.length ? +(mean(cheapRets) * 1e4).toFixed(1) : null,  // bps
      meanFwdRet_rich:  richRets.length ? +(mean(richRets) * 1e4).toFixed(1) : null,     // bps
    };
  }

  // ── z-fade strategy, HORIZON-MATCHED holding + deflated Sharpe ──────────────
  // The IC shows the edge lives at multi-bar horizons, so a 1-bar hold can't
  // harvest it. Here each (hold, threshold) config enters when |z| ≥ threshold and
  // holds `hold` bars, taking NON-OVERLAPPING entries (spaced ≥ hold bars) so the
  // trade returns are independent — no autocorrelation-inflated Sharpe. Deflated
  // Sharpe is computed across ALL configs tried (holds × thresholds) so searching
  // for the best holding period is paid for.
  const fwdRetH = (i, H) => (i + H < price.length ? (price[i + H] - price[i]) / price[i] : null);
  const configs = [];
  for (const hold of horizons) {
    for (const thr of thresholds) {
      const trPnls = [];
      let lastEntry = -Infinity, wins = 0;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        if (Math.abs(z[k]) < thr) continue;
        if (i - lastEntry < hold) continue;                 // non-overlapping
        const r = fwdRetH(i, hold);
        if (r == null) continue;
        const pnl = -Math.sign(z[k]) * r;                    // fade the mispricing
        trPnls.push(pnl); if (pnl > 0) wins++; lastEntry = i;
      }
      const m = mean(trPnls), sd = std(trPnls);
      const perTradeSR = sd > 0 ? m / sd : 0;
      const tradesPerYear = periodsPerYear / hold;            // non-overlapping H-bar holds
      const annSharpe = sd > 0 ? perTradeSR * Math.sqrt(tradesPerYear) : 0;
      configs.push({ hold, threshold: thr, trades: trPnls.length, hitRate: trPnls.length ? +(wins / trPnls.length).toFixed(3) : null,
                     annualizedSharpe: +annSharpe.toFixed(2), perTradeSR, trPnls });
    }
  }
  // Best config by annualized Sharpe (require enough trades to be meaningful).
  const eligible = configs.filter(c => c.trades >= 15);
  const best = (eligible.length ? eligible : configs).slice().sort((a, b) => b.annualizedSharpe - a.annualizedSharpe)[0];
  const dsr = best ? deflatedSharpe(best.trPnls, configs.map(c => c.perTradeSR)) : null;
  const strategy = {
    bestHold: best?.hold, bestThreshold: best?.threshold, trades: best?.trades, hitRate: best?.hitRate,
    annualizedSharpe: best?.annualizedSharpe,
    deflatedSharpe: dsr ? dsr.dsr : null,   // P(true Sharpe>0) after trials adjustment (holds × thresholds)
    nConfigsTried: configs.length,
    perConfig: configs.map(({ trPnls, perTradeSR, ...c }) => c),
  };

  // ── Honest verdict — keyed off icEDGE (beating the spurious trailing anchor) ──
  const edges = Object.entries(perHorizon).filter(([, r]) => r.icEdge != null);
  const bestH = edges.sort((a, b) => b[1].icEdge - a[1].icEdge)[0];
  const bestEdge = bestH ? bestH[1].icEdge : 0;
  const holdStr = best ? `${best.hold}-bar hold @ z≥${best.threshold}` : 'n/a';
  let verdict;
  if (bestEdge > 0.03 && dsr && dsr.dsr >= 0.95)
    verdict = `SURVIVES: the FACTOR fair value beats a naive trailing-mean anchor OOS (best icEdge ${bestEdge} at ${bestH[0]}-bar) and the horizon-matched z-fade (${holdStr}) clears deflated-Sharpe ${dsr.dsr}. Candidate for wiring in — confirm on more history / other instruments first.`;
  else if (bestEdge > 0.03)
    verdict = `WEAK/INCONCLUSIVE: the factor fair value shows real edge over the benchmark (icEdge ${bestEdge} at ${bestH[0]}-bar, the right slow-macro shape), but the best horizon-matched z-fade (${holdStr}) only reaches deflated Sharpe ${dsr?.dsr ?? 'n/a'} — short of the 0.95 bar. Promising, NOT proven. Do NOT wire in yet.`;
  else
    verdict = `NULL: the factor fair value does NOT beat a naive trailing-mean anchor OOS (best icEdge ${bestEdge}). Any apparent "reversion" is the spurious mean-reversion any anchor shows — there is no macro-factor edge here. Do NOT wire in. This is the expected, honest outcome for a slow macro anchor at daily horizons.`;

  return {
    ok: true,
    instrument: ctx.instrument,
    oosPoints: idx.length,
    window, horizons,
    perHorizon,
    strategy,
    verdict,
    note: 'icEdge = model icPredictive − trailing-mean-benchmark icPredictive; it is the REAL signal (raw icPredictive is inflated by the spurious detrending reversion any anchor shows). The z-fade now HOLDS for the horizon where the edge lives (non-overlapping entries, so trade returns are independent), and its deflated Sharpe is discounted for every hold×threshold config tried. Slow macro fair values show edge — if at all — at 20–60+ bar horizons.',
  };
}

// ── Cross-instrument consistency (the pooled evidence view) ──────────────────
// A slow macro signal can't be proven on one instrument's Sharpe (too few
// independent 20–60 bar windows), so we look for the SAME edge across partly-
// independent instruments. But this must not overcall: a tiny positive icEdge with
// a sub-50% hit rate and a ~0 deflated Sharpe is noise, and "3 of 5 positive" at a
// low threshold is a coin-flip outcome. So an instrument counts as REAL evidence
// only if it clears magnitude AND directional AND (soft) tradeability corroboration,
// and the verdict states the chance baseline explicitly.
//
// rows: [{ instrument, slowIcEdge, slowHitRate, deflatedSharpe }]
export function poolConsistency(rows, {
  minEdge = 0.03,      // icEdge magnitude
  minHit = 0.50,       // must beat a coin flip on direction
  minDsr = 0.60,       // some tradeability life (soft — not the 0.95 wiring bar)
} = {}) {
  const scored = rows.filter(r => r && r.slowIcEdge != null);
  const n = scored.length;
  // "real" = positive edge AND directional corroboration (hit rate > coin flip).
  const real = scored.filter(r => r.slowIcEdge > minEdge && (r.slowHitRate ?? 0) > minHit);
  const tradeable = real.filter(r => (r.deflatedSharpe ?? 0) >= minDsr);
  const positiveSign = scored.filter(r => r.slowIcEdge > minEdge).length;   // sign-only (what NOT to trust)
  const meanEdge = n ? +(scored.reduce((s, r) => s + r.slowIcEdge, 0) / n).toFixed(4) : null;
  const meanHit = n ? +(scored.reduce((s, r) => s + (r.slowHitRate ?? 0), 0) / n).toFixed(3) : null;

  // Chance baseline: sign-only "positive at threshold" is ~a coin flip per instrument,
  // so getting positiveSign/n by luck is common. Only corroborated hits are evidence.
  const consistent = real.length >= Math.max(3, Math.ceil(n * 0.6)) && tradeable.length >= 2;
  const read = consistent
    ? `CONSISTENT: ${real.length}/${n} instruments show a positive slow-horizon icEdge WITH an above-coin-flip hit rate (${tradeable.length} also show tradeability life) — cross-sectional evidence of a small but real macro edge. Worth pursuing at portfolio scale.`
    : `NULL / INCONSISTENT: only ${real.length}/${n} instruments clear both a positive icEdge AND a >50% hit rate (mean hit ${meanHit}). ${positiveSign}/${n} are positive on SIGN alone, but that is a coin-flip outcome at this magnitude (mean icEdge ${meanEdge}) and the hit rates/deflated Sharpes do not corroborate. No tradeable macro edge — do NOT wire in.`;
  return { instruments: n, realEvidence: real.length, tradeable: tradeable.length, positiveSignOnly: positiveSign, meanSlowIcEdge: meanEdge, meanSlowHitRate: meanHit, consistent, read };
}
