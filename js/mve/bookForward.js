// mve/bookForward.js — the forward paper tracker for the MVE book layer. Pure: no
// I/O. Pre-registration: MD files/MVE_BOOK_FORWARD_TRACKER.md.
//
// What it tracks: the factor-neutral COMBINED spread-sleeve book (2Y + 10Y at ½
// each), the candidate system from MVE_BOOK_FACTOR_AUDIT.md §8, next to the raw
// combined book for comparison. Every day it records the book it would hold
// after that close and marks the PREVIOUS record's book to this close. Records
// are append-only and never edited: this is the point-in-time, out-of-sample log
// the backtest can never be.
//
// Accounting (paper, at the close):
//   - Rebalance at the close of day D to the new target; cost of that rebalance
//     = Σ|target_D − target_prev| × one-way cost, booked on D.
//   - P&L booked on D = Σ target_prev × (close_D / close_prev − 1), using the
//     closes STORED in the previous record (not re-read), so a later data
//     revision can't rewrite history.
//   - Missed days (redeploy, outage): the previous book is simply held through
//     the gap — what a paper book that couldn't rebalance would have done.
//
// Parity: each tick also REPLAYS the previous record's day with today's data and
// code. It must reproduce the logged book; a mismatch means a code change, a
// data revision or a bug, and pauses the reading until explained.

export const FORWARD_RULES = {
  killDdMult: 1.5,     // kill if forward max DD is worse than 1.5× the backtest's full-sample max DD
  killSeMult: 2,       // kill if forward Sharpe < backtest OOS Sharpe − 2 SE ...
  killMinDays: 126,    // ... once at least ~6 months of trading days are logged
  reviewDays: 252,     // formal review after ~12 months of trading days
  parityTol: 1e-6,     // max |Δ position| between the logged and replayed book
};

export const sumAbs = o => Object.values(o || {}).reduce((s, v) => s + Math.abs(v), 0);

function turnoverCost(a, b, costOneWay) {
  let s = 0;
  for (const p of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) s += Math.abs((a?.[p] || 0) - (b?.[p] || 0)) * (costOneWay[p] ?? 0);
  return s;
}

function markToMarket(pos, prevCloses, closes) {
  let s = 0;
  for (const [p, v] of Object.entries(pos || {})) {
    if (!v) continue;
    const c0 = prevCloses?.[p], c1 = closes?.[p];
    if (!(c0 > 0) || !(c1 > 0)) throw new Error(`markToMarket: missing close for ${p}`);
    s += v * (c1 / c0 - 1);
  }
  return s;
}

export function maxAbsDiff(a, b) {
  let m = 0;
  for (const p of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) m = Math.max(m, Math.abs((a?.[p] || 0) - (b?.[p] || 0)));
  return m;
}

// snap = { date, closes: {pair: close}, raw: {pair: pos}, book: neutralBook(...) result,
//          replayPrev: { date, neutral } | null }
// Returns { appended, record?, reason }. Never mutates `log`.
export function forwardStep(log, manifest, snap) {
  const prev = log.length ? log[log.length - 1] : null;
  if (prev && snap.date <= prev.date) return { appended: false, reason: `already logged through ${prev.date}` };
  if (manifest?.startDate && snap.date < manifest.startDate) return { appended: false, reason: `before start date ${manifest.startDate}` };
  const c = manifest.costOneWay;
  const neutral = snap.book.neutral, raw = snap.raw;
  const rec = {
    date: snap.date, closes: snap.closes, raw, neutral, K: manifest.K,
    exposurePre: snap.book.exposurePre, exposurePost: snap.book.exposurePost, factorVarShare: snap.book.factorVarShare,
    loggedAt: snap.loggedAt || null,
  };
  if (!prev) {
    rec.gross = 0; rec.rawGross = 0;
    rec.cost = turnoverCost(neutral, {}, c); rec.rawCost = turnoverCost(raw, {}, c);
    rec.gapDays = 0; rec.parity = null;
  } else {
    rec.gross = markToMarket(prev.neutral, prev.closes, snap.closes);
    rec.rawGross = markToMarket(prev.raw, prev.closes, snap.closes);
    rec.cost = turnoverCost(neutral, prev.neutral, c);
    rec.rawCost = turnoverCost(raw, prev.raw, c);
    rec.gapDays = Math.round((Date.parse(snap.date) - Date.parse(prev.date)) / 86_400_000);
    rec.parity = snap.replayPrev && snap.replayPrev.date === prev.date
      ? { date: prev.date, maxAbsDiff: maxAbsDiff(snap.replayPrev.neutral, prev.neutral), rawMaxAbsDiff: maxAbsDiff(snap.replayPrev.raw, prev.raw) }
      : { date: prev.date, maxAbsDiff: null, note: 'previous day not replayable from current data' };
  }
  rec.net = rec.gross - rec.cost;
  rec.rawNet = rec.rawGross - rec.rawCost;
  rec.equity = (prev?.equity ?? 1) * (1 + rec.net);
  rec.rawEquity = (prev?.rawEquity ?? 1) * (1 + rec.rawNet);
  return { appended: true, record: rec };
}

function stats(rets, ppy = 252) {
  const n = rets.length;
  if (n < 2) return { n, sharpe: null, se: null, annRetPct: null, annVolPct: null, maxDdPct: 0, totalPct: 0 };
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  let eq = 1, peak = 1, mdd = 0;
  for (const r of rets) { eq *= 1 + r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); }
  return {
    n, sharpe: sd > 0 ? +(mean / sd * Math.sqrt(ppy)).toFixed(3) : null, se: +Math.sqrt(ppy / n).toFixed(3),
    annRetPct: +(mean * ppy * 100).toFixed(3), annVolPct: +(sd * Math.sqrt(ppy) * 100).toFixed(3),
    maxDdPct: +(mdd * 100).toFixed(2), totalPct: +((eq - 1) * 100).toFixed(2),
  };
}

// The pre-registered status. Order matters: a parity break pauses the reading
// before any kill/review rule is evaluated (bug before belief).
export function summarizeForward(log, manifest, rules = FORWARD_RULES) {
  const scored = log.slice(1);   // the first record only opens the book
  const neutral = stats(scored.map(r => r.net));
  const raw = stats(scored.map(r => r.rawNet));
  const parityBreaks = log.filter(r => r.parity?.maxAbsDiff != null && r.parity.maxAbsDiff > rules.parityTol)
    .map(r => ({ date: r.parity.date, maxAbsDiff: r.parity.maxAbsDiff }));
  const ref = manifest.reference?.neutralCombined || {};
  const ddLimit = ref.fullMaxDdPct != null ? -rules.killDdMult * Math.abs(ref.fullMaxDdPct) : null;
  const sharpeFloor = (ref.oosSharpe != null && neutral.se != null) ? +(ref.oosSharpe - rules.killSeMult * neutral.se).toFixed(3) : null;
  let status = 'RUNNING', why = `${neutral.n} trading day(s) scored; nothing to decide yet.`;
  if (parityBreaks.length) {
    status = 'PAUSED-PARITY';
    why = `${parityBreaks.length} day(s) where replaying with current code/data did not reproduce the logged book (max Δ ${Math.max(...parityBreaks.map(b => b.maxAbsDiff)).toExponential(2)}). Explain before reading anything.`;
  } else if (ddLimit != null && neutral.maxDdPct < ddLimit) {
    status = 'KILL-DRAWDOWN';
    why = `Forward max DD ${neutral.maxDdPct}% is worse than the pre-registered limit ${ddLimit.toFixed(2)}% (1.5× backtest ${ref.fullMaxDdPct}%).`;
  } else if (neutral.n >= rules.killMinDays && sharpeFloor != null && neutral.sharpe != null && neutral.sharpe < sharpeFloor) {
    status = 'KILL-INCONSISTENT';
    why = `Forward Sharpe ${neutral.sharpe} over ${neutral.n} days is below backtest OOS ${ref.oosSharpe} − 2 SE (${sharpeFloor}): statistically inconsistent with the backtest.`;
  } else if (neutral.n >= rules.reviewDays) {
    status = 'REVIEW-DUE';
    why = `${neutral.n} trading days logged: the pre-registered 12-month review is due (forward Sharpe ${neutral.sharpe} ± ${neutral.se} vs backtest OOS ${ref.oosSharpe}).`;
  }
  const last = log[log.length - 1] || null;
  return {
    status, why, neutral, raw, parityBreaks, ddLimitPct: ddLimit, sharpeFloor,
    volRatio: (neutral.annVolPct && raw.annVolPct) ? +(neutral.annVolPct / raw.annVolPct).toFixed(3) : null,
    firstDate: log[0]?.date || null, lastDate: last?.date || null,
    currentBook: last ? { date: last.date, neutral: last.neutral, raw: last.raw, exposurePre: last.exposurePre, exposurePost: last.exposurePost } : null,
  };
}
