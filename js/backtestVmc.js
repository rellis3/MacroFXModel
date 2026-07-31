/**
 * Backtest VMC-confirmation test — does VuManChu exhaustion at entry separate the
 * winners from the losers on the backtestSystem bot's fades?
 *
 * The bot is a level-FADE (mean-reversion) system whose confidence vote is
 * dominated by TREND features and turned out mildly ANTI-predictive (higher
 * conviction lost more; see analysis/backtest_entry_quality.py). The hypothesis:
 * a level fade should be confirmed by EXHAUSTION, not trend agreement — fade
 * support (LONG) only when WaveTrend is oversold, fade resistance (SHORT) only
 * when overbought. VMC is exactly that signal, and it never fired in the bot's
 * vote (rsiDivergence = 0/279 trades).
 *
 * Causal, no lookahead: WT is computed on M1 resampled to `tfMin`, and each
 * trade is read at the last TF bar STRICTLY BEFORE its entry timestamp. WT
 * params default to the operator's real TradingView setup (9/12/3), not the
 * library default (10/21/4) — they are not interchangeable.
 *
 * Pure: the caller injects packed M1 (loadM1ForPair) — no network/DOM here.
 * Tested in js/backtestVmc.test.mjs. This MEASURES a hypothesis; it is not a
 * validated filter. One ~2-month forward book, n≈279 — a steer, not proof.
 */
import { bisect, extractBars, resampleTo } from './barUtils.js';
import { computeWaveTrend } from './vumanchuCore.js';

export const OPERATOR_WT = { n1: 9, n2: 12, sp: 3 };

// Causal WT1/WT2 series on a resampled window of packed M1.
// Returns { times[], wt1[], wt2[] } aligned to the resampled bars, or null.
export function wtSeriesForPair(packed, fromTs, toTs, tfMin, wtParams = OPERATOR_WT) {
  if (!packed || !packed.n) return null;
  const bars = extractBars(packed, fromTs, toTs);      // {time,open,high,low,close}[]
  const tf = resampleTo(bars, tfMin);
  if (tf.length < 40) return null;                     // too few bars to warm up WT
  const { wt1, wt2 } = computeWaveTrend(tf, wtParams);
  return { times: tf.map(b => b.time), wt1, wt2 };
}

// Classify one fade's VMC state at entry. `direction` is the FADE direction
// (LONG = fade support, wants oversold). ob = |WT| threshold for exhaustion.
// Returns { cls:'confirm'|'oppose'|'neutral'|'unknown', wt1, signal }.
export function classifyEntry(series, entryTs, direction, ob = 45) {
  if (!series) return { cls: 'unknown', wt1: null, signal: null };
  const j = bisect(series.times, entryTs) - 1;         // last TF bar with time < entryTs
  if (j < 1) return { cls: 'unknown', wt1: null, signal: null };
  const v1 = series.wt1[j], v2 = series.wt2[j];
  if (!Number.isFinite(v1)) return { cls: 'unknown', wt1: null, signal: null };
  const isLong = direction === 'LONG' || direction === 'BUY';
  let signal;
  if (v1 <= -ob) signal = 'OVERSOLD';
  else if (v1 >= ob) signal = 'OVERBOUGHT';
  else signal = (v1 > v2) ? 'BULLISH' : 'BEARISH';
  let cls;
  if (isLong) cls = (v1 <= -ob) ? 'confirm' : (v1 >= ob ? 'oppose' : 'neutral');
  else        cls = (v1 >= ob) ? 'confirm' : (v1 <= -ob ? 'oppose' : 'neutral');
  return { cls, wt1: v1, signal };
}

function bucket(sel) {
  if (!sel.length) return { n: 0, winPct: 0, expR: 0 };
  const wins = sel.filter(t => t.win).length;
  return {
    n: sel.length,
    winPct: +(wins / sel.length * 100).toFixed(1),
    expR: +(sel.reduce((s, t) => s + (t.net_r || 0), 0) / sel.length).toFixed(3),
  };
}

/**
 * Aggregate classified trades (each { vmc, win, net_r, conv }) into the buckets
 * the page shows: by VMC class, and the key cross — does VMC-confirm rescue the
 * high-conviction losers the bot currently over-weights?
 */
export function summarize(trades) {
  const byClass = {};
  for (const c of ['confirm', 'oppose', 'neutral', 'unknown'])
    byClass[c] = bucket(trades.filter(t => t.vmc === c));

  const eligible = trades.filter(t => t.vmc !== 'unknown');
  return {
    all: bucket(trades),
    classified: bucket(eligible),
    byClass,
    // The test's headline: confirmed fades vs everything else (opposed+neutral).
    confirmVsRest: {
      confirm: bucket(trades.filter(t => t.vmc === 'confirm')),
      rest: bucket(trades.filter(t => t.vmc === 'oppose' || t.vmc === 'neutral')),
    },
    // Does VMC-confirm help WITHIN the bot's own high-conviction bucket (the one
    // that currently loses most)? If confirm rescues it, that's the actionable gate.
    highConv: {
      all: bucket(trades.filter(t => t.conv >= 0.4)),
      confirm: bucket(trades.filter(t => t.conv >= 0.4 && t.vmc === 'confirm')),
    },
  };
}
