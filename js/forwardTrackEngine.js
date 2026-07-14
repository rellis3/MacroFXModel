/**
 * Forward-Track — the honest next step after the Pooled VuManChu Fade cleared the
 * bar OOS. A backtest, however clean, is still in-sample to the researcher. This
 * accumulates a LIVE, post-research track record: every day, on the just-COMPLETED
 * sessions, it re-detects the exact confirmed-fade signals (same brick the
 * validated backtest uses — `detectSessionSignals`, never a copy) and logs each
 * with its realised outcome. Over weeks the forward expectancy either tracks the
 * backtest's (edge real) or decays toward zero (edge was overfit). That decay, or
 * its absence, is the only thing a backtest cannot fake.
 *
 * Pure functions — no I/O. The server loads bars + persists the log to KV; this
 * module only turns bars→signals and log→stats.
 *
 * Reuses detectSessionSignals/(_manageExit/_wtAgree inside it) from pooledFadeEngine
 * (the SINGLE definition of the trade), volSigmaSeries (forecastCore), sessionsAt
 * (fillRealismEngine), summarizeTrades (metricsCore), DEFAULT_COST_PCT.
 */
import { detectSessionSignals } from './pooledFadeEngine.js';
import { volSigmaSeries } from './forecastCore.js';
import { sessionsAt } from './fillRealismEngine.js';
import { summarizeTrades } from './metricsCore.js';
import { DEFAULT_COST_PCT } from './perLineStrategy.js';

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);
const _key = t => `${t.date}|${t.pair}|${t.line}`;   // one signal per (session, instrument, line)

/**
 * Scan completed sessions and return the CONFIRMED fade signals with their realised
 * outcome. The most recent loaded session is skipped (it may be mid-formation) so
 * every logged signal is on a fully-closed day. `sinceDate` (exclusive) lets the
 * caller append only new days on a re-scan.
 * @returns { pair, assetClass, cost, lastDate, signals:[{date,pair,assetClass,line,dir,entry,gross,cost}] }
 */
export function scanConfirmedSignals(bars1, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', boundaryHour = 22, warmup = 40, sinceDate = null,
    minBars = 35, stopPips = 5, volK = 0.09, trailR = 2.0, requireVwap = true,
  } = opts;
  const cost = opts.costPct ?? (DEFAULT_COST_PCT[assetClass] ?? 0.012);
  const sess = sessionsAt(bars1, boundaryHour);
  if (sess.length < warmup + 6) return { insufficient: true, nSessions: sess.length, signals: [] };
  const d1 = sess.map(s => ({ open: s.open, high: s.high, low: s.low, close: s.close }));
  const sig = volSigmaSeries(d1, assetClass);
  const sigOpts = { pair, assetClass, minBars, stopPips, volK, trailR, requireVwap };

  const signals = [];
  // stop at sess.length - 1: never trust the most recent (possibly partial) session
  for (let i = warmup; i < sess.length - 1; i++) {
    const s = sess[i];
    if (sinceDate && !(s.date > sinceDate)) continue;
    const sigma = sig[i];
    if (!(sigma > 0)) continue;
    for (const sg of detectSessionSignals(s, sigma, sigOpts)) {
      if (!sg.confirmed) continue;
      signals.push({ date: s.date, pair, assetClass, line: sg.line, dir: sg.up ? 'sell' : 'buy', entry: r3(sg.entry, 6), gross: sg.gross, cost: r3(cost, 5) });
    }
  }
  return { pair, assetClass, cost, nSessions: sess.length, lastDate: sess[sess.length - 2]?.date || null, signals };
}

// Merge new signals into an existing log, de-duplicated by (date,pair,line) and
// kept in date order. Existing rows win (never rewrite a logged outcome).
export function mergeLog(existing = [], incoming = []) {
  const seen = new Map();
  for (const t of existing) seen.set(_key(t), t);
  for (const t of incoming) if (!seen.has(_key(t))) seen.set(_key(t), t);
  return [...seen.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.pair < b.pair ? -1 : a.pair > b.pair ? 1 : 0));
}

// Pool a forward log into one net-return stream at a cost multiple, with the same
// stats vocabulary as poolPortfolio (Sharpe / win / maxDD / per-year / curve).
function _pool(log, costMult) {
  const all = log.map(t => ({ date: t.date, pnl: t.gross - t.cost * costMult })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!all.length) return { n: 0 };
  const pnls = all.map(t => t.pnl), s = summarizeTrades(pnls, all.map(t => t.date));
  let cum = 0, peak = 0, mdd = 0; const curve = []; const byYear = {};
  for (const t of all) { cum += t.pnl; if (cum > peak) peak = cum; if (cum - peak < mdd) mdd = cum - peak; curve.push({ date: t.date, cum: r3(cum, 3) }); (byYear[t.date.slice(0, 4)] ||= []).push(t.pnl); }
  const perYear = {};
  for (const [y, a] of Object.entries(byYear)) perYear[y] = { n: a.length, ret: r3(a.reduce((x, v) => x + v, 0), 2) };
  return { n: all.length, sharpe: s.sharpe, win: r3(pnls.filter(x => x > 0).length / pnls.length * 100, 1), exp: r3(_mean(pnls), 4), totalReturn: r3(cum, 2), maxDD: r3(mdd, 2), perYear, curve };
}

/**
 * Forward stats from a merged log, split at `trackingStart` into the pre-tracking
 * BACKTEST baseline and the true FORWARD period, so the two expectancies sit side
 * by side. Includes ×1/×2/×3 cost sensitivity on the forward stream and a
 * per-instrument forward-vs-backtest expectancy table (the overfit tell).
 */
export function forwardStats(log = [], opts = {}) {
  const { trackingStart = null } = opts;
  const fwd = trackingStart ? log.filter(t => t.date >= trackingStart) : log;
  const base = trackingStart ? log.filter(t => t.date < trackingStart) : [];
  const expOf = arr => arr.length ? r3(_mean(arr.map(t => t.gross - t.cost)), 4) : null;

  // per-instrument forward vs backtest expectancy (net ×1)
  const insts = [...new Set(log.map(t => t.pair))].sort();
  const byInst = {};
  for (const p of insts) {
    const f = fwd.filter(t => t.pair === p), b = base.filter(t => t.pair === p);
    byInst[p] = { fwdN: f.length, fwdExp: expOf(f), baseN: b.length, baseExp: expOf(b) };
  }
  return {
    trackingStart,
    forward: { n: fwd.length, ...(_pool(fwd, 1)), x2: _pool(fwd, 2), x3: _pool(fwd, 3) },
    baseline: { n: base.length, exp: expOf(base), ...(base.length ? _pool(base, 1) : {}) },
    byInst,
    lastDate: log.length ? log[log.length - 1].date : null,
  };
}
