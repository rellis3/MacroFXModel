/**
 * Exit-study — replay each backtestSystem trade's real M1 path under ALTERNATIVE
 * exit rules, holding the entry fixed. Answers the exit-side questions the entry
 * analysis raised: the bot's fixed ~2R (often >3R) target is hit 1-in-7 and
 * round-trips (analysis/backtest_entry_quality.py) — so would a CLOSER target, a
 * trailing stop, a breakeven move, or a time-stop have kept more?
 *
 * Everything is in R (risk = |entry - SL|), so the actual SL is exactly -1R.
 * Barrier ordering is CONSERVATIVE: within a bar the adverse level is checked
 * before the favourable one (never assume the good side filled first — CLAUDE.md).
 * All rules are GROSS R; cost is ~constant per trade so it shifts every rule
 * equally — the RELATIVE ranking is the honest read. Pure: M1 bars injected.
 *
 * EXPLORATORY: same 279 trades, one ~2-month window. A rule that wins here is a
 * hypothesis to validate OOS, not a setting to ship.
 */

// bars: [{time,open,high,low,close}] from entry onward. sign +1 long / -1 short.

export function mfeMae(bars, entry, sl, sign, exitTs) {
  const risk = Math.abs(entry - sl);
  let mfe = 0, mae = 0;
  for (const b of bars) {
    if (exitTs && b.time > exitTs) break;
    const fav = sign > 0 ? (b.high - entry) : (entry - b.low);
    const adv = sign > 0 ? (entry - b.low) : (b.high - entry);
    if (fav / risk > mfe) mfe = fav / risk;
    if (adv / risk > mae) mae = adv / risk;
  }
  return { mfeR: mfe, maeR: mae };
}

function markToClose(bars, entry, sign, risk) {
  const lc = bars.length ? bars[bars.length - 1].close : entry;
  return sign * (lc - entry) / risk;
}

// Fixed TP at k·R, original SL. Conservative adverse-first.
export function replayFixedTP(bars, entry, sl, sign, k) {
  const risk = Math.abs(entry - sl);
  const tp = entry + sign * k * risk;
  for (const b of bars) {
    if (sign > 0) { if (b.low <= sl) return -1; if (b.high >= tp) return k; }
    else          { if (b.high >= sl) return -1; if (b.low <= tp) return k; }
  }
  return markToClose(bars, entry, sign, risk);
}

// Chandelier trail: arm after +activateR, trail trailR behind the peak.
export function replayTrail(bars, entry, sl, sign, activateR, trailR) {
  const risk = Math.abs(entry - sl);
  let stop = sl, peak = entry, armed = false;
  for (const b of bars) {
    if (sign > 0) {
      if (b.low <= stop) return (stop - entry) / risk;
      if (b.high > peak) {
        peak = b.high;
        if ((peak - entry) / risk >= activateR) armed = true;
        if (armed) stop = Math.max(stop, peak - trailR * risk);
      }
    } else {
      if (b.high >= stop) return (entry - stop) / risk;
      if (b.low < peak) {
        peak = b.low;
        if ((entry - peak) / risk >= activateR) armed = true;
        if (armed) stop = Math.min(stop, peak + trailR * risk);
      }
    }
  }
  return markToClose(bars, entry, sign, risk);
}

// Breakeven move: after +atR, jump SL to entry; keep the original TP.
export function replayBreakeven(bars, entry, sl, tp, sign, atR) {
  const risk = Math.abs(entry - sl);
  let stop = sl, moved = false;
  for (const b of bars) {
    if (sign > 0) {
      if (b.low <= stop) return (stop - entry) / risk;
      if (b.high >= tp) return (tp - entry) / risk;
      if (!moved && (b.high - entry) / risk >= atR) { stop = entry; moved = true; }
    } else {
      if (b.high >= stop) return (entry - stop) / risk;
      if (b.low <= tp) return (entry - tp) / risk;
      if (!moved && (entry - b.low) / risk >= atR) { stop = entry; moved = true; }
    }
  }
  return markToClose(bars, entry, sign, risk);
}

// Original SL/TP, but force-exit at close once `hours` elapse unresolved.
export function replayTimeStop(bars, entry, sl, tp, sign, entryTs, hours) {
  const risk = Math.abs(entry - sl);
  const limit = entryTs + hours * 3600;
  for (const b of bars) {
    if (sign > 0) { if (b.low <= sl) return -1; if (b.high >= tp) return (tp - entry) / risk; }
    else          { if (b.high >= sl) return -1; if (b.low <= tp) return (entry - tp) / risk; }
    if (b.time >= limit) return sign * (b.close - entry) / risk;
  }
  return markToClose(bars, entry, sign, risk);
}

// Default rule menu. Keep small + interpretable.
export const TP_GRID = [1, 1.5, 2, 3];
export const TRAILS = [{ a: 0.5, t: 0.5 }, { a: 1, t: 1 }];
export const BE_ATS = [1];
export const TIME_STOPS = [4, 8];

// Run every rule for one trade. `bars` should span entry → a horizon past exit.
export function studyTrade(bars, t) {
  const sign = (t.direction === 'LONG' || t.direction === 'BUY') ? 1 : -1;
  const { entry, sl, tp } = t;
  const { mfeR, maeR } = mfeMae(bars, entry, sl, sign, t.exit_ts);
  const rules = { actual: t.pnl_r };
  for (const k of TP_GRID) rules[`tp${k}R`] = replayFixedTP(bars, entry, sl, sign, k);
  for (const { a, t: tr } of TRAILS) rules[`trail${a}/${tr}`] = replayTrail(bars, entry, sl, sign, a, tr);
  for (const at of BE_ATS) rules[`be@${at}R`] = replayBreakeven(bars, entry, sl, tp, sign, at);
  for (const h of TIME_STOPS) rules[`time${h}h`] = replayTimeStop(bars, entry, sl, tp, sign, t.entry_ts, h);
  return { mfeR, maeR, rules };
}

function agg(vals) {
  if (!vals.length) return { n: 0 };
  const n = vals.length, tot = vals.reduce((s, v) => s + v, 0);
  const w = vals.filter(v => v > 0).length;
  return { n, totR: +tot.toFixed(1), expR: +(tot / n).toFixed(3), winPct: +(w / n * 100).toFixed(0) };
}

// Aggregate studied trades → per-rule totals + MFE/MAE percentiles.
export function summarizeExitStudy(studies) {
  const ruleNames = studies.length ? Object.keys(studies[0].rules) : [];
  const byRule = {};
  for (const r of ruleNames) byRule[r] = agg(studies.map(s => s.rules[r]).filter(Number.isFinite));
  const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.round(p / 100 * (s.length - 1)))].toFixed(2); };
  const mfes = studies.map(s => s.mfeR), maes = studies.map(s => s.maeR);
  return {
    nTrades: studies.length,
    byRule,
    mfe: { p25: pct(mfes, 25), p50: pct(mfes, 50), p75: pct(mfes, 75), p90: pct(mfes, 90) },
    mae: { p25: pct(maes, 25), p50: pct(maes, 50), p75: pct(maes, 75), p90: pct(maes, 90) },
    // headline: of winners, how far did they run past the actual exit (give-back)
    winnersMedianMfe: pct(studies.filter(s => s.rules.actual > 0).map(s => s.mfeR), 50),
  };
}
