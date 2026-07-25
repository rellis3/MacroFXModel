/**
 * Hurst Bench — the A/B that turns "the incumbent estimator looks saturated"
 * into measured data (`LEGO_MODULES.md` §3 drift #11).
 *
 * Three questions, in escalating order, per the backtest-build discipline in
 * `CLAUDE.md` (prove the plumbing before the verdict):
 *
 *   1. DISTRIBUTION  — what does each estimator actually read on real data?
 *      A saturated estimator has a tight distribution pinned high.
 *   2. DECISION      — `rangeBiasCore.featureHurst` votes at fixed thresholds
 *      (<0.45 mean-reverting → with the entry; >0.55 trending → against it).
 *      How often does each estimator produce each vote? A feature that emits
 *      one vote ~always is a CONSTANT, not a signal — that is the claim under
 *      test, and this counts it rather than asserting it.
 *   3. PREDICTIVENESS — the question that actually matters, and the one a
 *      calibrated-but-useless metric still fails. Does the reading at day i
 *      rank the FORWARD character of days i+1..i+K? Scored as Spearman rank
 *      IC (`statsCore.rankIC`) against the forward efficiency ratio, with a
 *      true IS/OOS split. Benchmark is IC = 0 — no monotonic relationship.
 *      Being better calibrated does NOT entitle DFA to win here; if both ICs
 *      are ~0 the honest read is that neither estimator carries information
 *      about forward trendiness, and the live feature should be dropped
 *      rather than swapped.
 *
 * Measurement brick: it grades two estimators. It makes no claim that either
 * produces edge, and swapping the live path stays gated on this evidence.
 *
 * No lookahead: the reading at index i uses bars ≤ i; the forward outcome uses
 * i+1..i+K and is never visible to the estimator.
 */

import { computeHurst } from './rangeBiasCore.js';
import { hurstDFA, rankIC } from './statsCore.js';

// The live thresholds, imported in spirit from rangeBiasCore.featureHurst
// (<0.45 mean-reverting, >0.55 trending, else neutral). Stated here so the
// decision counts below are unambiguous.
export const LIVE_THRESHOLDS = { revert: 0.45, trend: 0.55 };

export function voteFor(h, { revert, trend } = LIVE_THRESHOLDS) {
  if (h == null || !Number.isFinite(h)) return 'none';
  if (h < revert) return 'mean-reverting';
  if (h > trend) return 'trending';
  return 'neutral';
}

// Efficiency ratio over a window: |net move| / summed absolute moves.
// 1 = a perfectly straight trend, →0 = pure chop. This is the forward
// "character" a Hurst reading claims to anticipate, and it is estimator-free
// (no shared machinery with either candidate, so it cannot flatter one).
export function efficiencyRatio(closes, from, to) {
  if (to <= from || to >= closes.length) return null;
  let path = 0;
  for (let i = from + 1; i <= to; i++) path += Math.abs(closes[i] - closes[i - 1]);
  if (!(path > 0)) return null;
  return Math.abs(closes[to] - closes[from]) / path;
}

function quantiles(xs) {
  const v = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  const n = v.length;
  if (!n) return null;
  const q = (p) => {
    const pos = p * (n - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
    return v[lo] + (pos - lo) * (v[hi] - v[lo]);
  };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1));
  return { n, min: v[0], p10: q(0.10), p25: q(0.25), median: q(0.50), p75: q(0.75), p90: q(0.90), max: v[n - 1], mean, sd };
}

function voteCounts(votes) {
  const c = { 'mean-reverting': 0, neutral: 0, trending: 0, none: 0 };
  for (const v of votes) c[v]++;
  const n = votes.length || 1;
  return {
    counts: c,
    share: {
      'mean-reverting': c['mean-reverting'] / n,
      neutral: c.neutral / n,
      trending: c.trending / n,
      none: c.none / n,
    },
    // Share of the single most common vote — 1.0 means the feature is a constant.
    dominantShare: Math.max(c['mean-reverting'], c.neutral, c.trending, c.none) / n,
    n: votes.length,
  };
}

/**
 * Walk one instrument. For each step, compute both estimators on the trailing
 * window and pair them with the forward efficiency ratio.
 *
 * incumbent: computeHurst(closes[i-win..i])  — R/S, lags [2,4,8,16], LEVELS
 * dfa:       hurstDFA(returns[i-win..i])     — DFA on the increment series
 */
export function benchInstrument(bars, {
  window = 250, forward = 20, step = 5, oosFrac = 0.4,
} = {}) {
  const closes = bars.map(b => b.close).filter(Number.isFinite);
  const n = closes.length;
  const rets = [];
  for (let i = 1; i < n; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  if (n < window + forward + 60) return null;

  const rows = [];
  for (let i = window; i + forward < n; i += step) {
    const hOld = computeHurst(closes.slice(i - window, i + 1));       // levels, ≤ i
    const hNew = hurstDFA(rets.slice(Math.max(0, i - window), i));    // returns, < i
    const fwd = efficiencyRatio(closes, i, i + forward);              // strictly future
    if (fwd == null) continue;
    rows.push({ idx: i, date: bars[i]?.date ?? null, hOld, hNew, fwd });
  }
  if (rows.length < 40) return null;

  const cut = Math.floor(rows.length * (1 - oosFrac));
  const isRows = rows.slice(0, cut), oosRows = rows.slice(cut);
  const icOf = (rs, key) => rankIC(rs.map(r => r[key]).map(v => (Number.isFinite(v) ? v : NaN)), rs.map(r => r.fwd));

  const oldVotes = rows.map(r => voteFor(r.hOld));
  const newVotes = rows.map(r => voteFor(r.hNew));

  // How often do the two estimators produce a DIFFERENT vote? This is the
  // "would swapping actually change the bot's behaviour" number.
  let disagree = 0;
  for (let i = 0; i < rows.length; i++) if (oldVotes[i] !== newVotes[i]) disagree++;

  return {
    n: rows.length,
    firstDate: rows[0].date, lastDate: rows[rows.length - 1].date,
    incumbent: {
      dist: quantiles(rows.map(r => r.hOld)),
      votes: voteCounts(oldVotes),
      ic: { full: icOf(rows, 'hOld'), is: icOf(isRows, 'hOld'), oos: icOf(oosRows, 'hOld') },
    },
    dfa: {
      dist: quantiles(rows.map(r => r.hNew)),
      votes: voteCounts(newVotes),
      ic: { full: icOf(rows, 'hNew'), is: icOf(isRows, 'hNew'), oos: icOf(oosRows, 'hNew') },
    },
    disagreeShare: disagree / rows.length,
    opts: { window, forward, step, oosFrac },
  };
}

// Pool per-instrument results into the headline read.
export function poolBench(results) {
  const ok = results.filter(Boolean);
  if (!ok.length) return null;
  const avg = (f) => ok.reduce((s, r) => s + f(r), 0) / ok.length;
  const oosIC = (k) => ok.map(r => r[k].ic.oos.ic).filter(Number.isFinite);
  const median = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
  return {
    instruments: ok.length,
    incumbent: {
      medianReading: median(ok.map(r => r.incumbent.dist.median)),
      meanDominantVoteShare: avg(r => r.incumbent.votes.dominantShare),
      medianOosIC: median(oosIC('incumbent')),
      instrumentsWithOosICabs02: oosIC('incumbent').filter(v => Math.abs(v) >= 0.2).length,
    },
    dfa: {
      medianReading: median(ok.map(r => r.dfa.dist.median)),
      meanDominantVoteShare: avg(r => r.dfa.votes.dominantShare),
      medianOosIC: median(oosIC('dfa')),
      instrumentsWithOosICabs02: oosIC('dfa').filter(v => Math.abs(v) >= 0.2).length,
    },
    meanDisagreeShare: avg(r => r.disagreeShare),
  };
}
