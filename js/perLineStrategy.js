/**
 * Per-line confidence engine — trade EACH forecast line on its own measured edge.
 *
 * Architecture (the design we agreed): price crosses each of the 8 lines (4 names
 * × 2 sides); at every touch we score that line independently from the live
 * intraday state (approach velocity, range-budget) and decide FADE / FOLLOW /
 * SKIP. Not a single-line rule — a policy over (line × condition) cells.
 *
 * Discipline (no fooling ourselves):
 *   • The policy is LEARNED on in-sample touches only and APPLIED out-of-sample
 *     (López de Prado's split). A cell is traded only if its IS edge is
 *     significant (binomial z) on a min sample — otherwise SKIP.
 *   • The policy is POOLED across all pairs (one universal map), so sparse
 *     per-pair cells borrow strength and we test whether the edge is universal
 *     (Grinold breadth needs a common signal), not 26 overfit per-pair tables.
 *   • Exit is the triple-barrier the analyser already resolved: TP = the inner
 *     line (toward open), SL = the outer line (away), time = session close. The
 *     touch's `outcome` says which hit first; `innerLvl`/`outerLvl` price it.
 *
 * Pure: takes analyser records, returns policy + IS/OOS performance + equity
 * curve. No network. Reuses metricsCore for the performance summary.
 */

import { summarizeTrades } from './metricsCore.js';
import { backtestStats, portfolioStats } from './backtestStats.js';
import { intradayMtmDrawdown, tradeTimingStats } from './intradayDrawdown.js';

export const DEFAULT_COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };
export const DEFAULT_SLIP_PCT = { fx: 0.006, index: 0.008, commodity: 0.012 };  // extra on FOLLOW (stop) entries

// Realistic per-pair ROUND-TRIP cost (% of price): typical retail spread +
// commission. Majors are tight; crosses wider; exotic crosses much wider — the
// flat 0.012% flattered the exotics. Estimates (broker/venue-dependent) — the
// Rigor cost-stress (×1/×2/×3) shows the buffer; tune per your execution venue.
export const PAIR_COST_PCT = {
  // majors
  eurusd: 0.008, gbpusd: 0.010, usdjpy: 0.009, usdchf: 0.011, usdcad: 0.011, audusd: 0.011, nzdusd: 0.013,
  // EUR / GBP crosses
  eurgbp: 0.013, eurjpy: 0.014, eurchf: 0.015, euraud: 0.018, eurcad: 0.018, eurnzd: 0.038,
  gbpjpy: 0.018, gbpchf: 0.022, gbpaud: 0.030, gbpcad: 0.032, gbpnzd: 0.045,
  // other crosses
  audjpy: 0.016, cadjpy: 0.018, chfjpy: 0.018, nzdjpy: 0.020, audnzd: 0.030, audcad: 0.028, audchf: 0.030,
  // indices
  nq: 0.008, spx500: 0.008, spx: 0.008, us30: 0.010, dow: 0.010, us2000: 0.015, de30: 0.012, uk100: 0.015,
  // commodity
  gold: 0.020,
};
export function costForPair(key, assetClass = 'fx') {
  return PAIR_COST_PCT[String(key).toLowerCase()] ?? DEFAULT_COST_PCT[assetClass] ?? DEFAULT_COST_PCT.fx;
}

// ── 1) Flatten window records → decided touches with conditions + barrier geom ─
// Each touch: { date, open, line, reverted, level, innerLvl, outerLvl, cell }.
// `conditions` = the per-line condition fields keyed into the cell (default the
// OOS-proven approach velocity; add 'budgetBucket' etc. to refine).
//
// Day-type gate (no lookahead): each WINDOW carries `signedT` — the EX-ANTE
// trend-day forecast (classifyDayType's estimators loop closes[idx-win … idx-1],
// strictly BEFORE session i, so it forecasts day i's trend-ness from prior days).
// We bucket it SIGNED into { tU | rng | tD } (up-trend / range / down-trend) so
// the policy can learn "fade an UP line on a tU day" as its own cell (skip/flip),
// separate from a range day. When the condition name is 'dayType' the touch's
// bucket is used instead of a line-level field. NEVER condition on realizedDir /
// dirAction / outcome / close — those resolve during/after the session.
export function extractTouches(records, { conditions = ['approachVel'], dtThresh = 0.33 } = {}) {
  const touches = [];
  const dtBucketOf = (signedT) => {
    if (signedT == null || !Number.isFinite(signedT)) return 'na';   // dropped by the na-guard, like any missing condition
    return signedT >= dtThresh ? 'tU' : signedT <= -dtThresh ? 'tD' : 'rng';
  };
  for (const w of records || []) {
    const dayType = dtBucketOf(w.signedT);
    for (const ln of w.lines || []) {
      if (ln.outcome !== 'reverted' && ln.outcome !== 'continued') continue;   // decided only
      if (ln.innerLvl == null || ln.outerLvl == null || !(w.open > 0)) continue;
      // A condition named 'dayType' reads the WINDOW-level ex-ante bucket; every
      // other condition reads the per-line field ln[c] exactly as before.
      const condKey = conditions.map(c => (c === 'dayType' ? dayType : (ln[c] ?? 'na'))).join('|');
      if (condKey.includes('na')) continue;   // missing a gating condition → not tradeable
      touches.push({
        date: w.date, open: w.open, line: `${ln.name}_${ln.side}`, name: ln.name, side: ln.side,
        dayType, signedT: w.signedT ?? null, dtLabel: w.dtLabel ?? null,
        reverted: ln.outcome === 'reverted', fillTime: ln.firstTouchTime ?? null,
        level: ln.level, innerLvl: ln.innerLvl, outerLvl: ln.outerLvl,
        decidedBy: ln.decidedBy ?? 'barrier',           // 'barrier' (TP/SL hit) or 'close' (mark-to-close)
        closePx: w.realized?.close ?? w.open,            // for honest mark-to-close of undecided outcomes
        cell: `${ln.name}_${ln.side}|${condKey}`,
        // Intraday mark-to-market inputs: adverse excursion magnitudes (% of price)
        // for fade (continuation = extPct) / follow (reversion = retracePct/mfePct)
        // + the timing of the adverse extreme and the exit.
        extPct: ln.extPct, retracePct: ln.retracePct ?? ln.mfePct, extTime: ln.extTime, exitTime: ln.exitTime,
        // Optional MFE/MAE excursion (range-line analyser supplies these; forecast
        // records don't — harmless undefined). Used by the E-ratio exit study.
        excMid: ln.excMid, excAway: ln.excAway,
        // Optional trail PnLs (gross %): follow-direction (away) + fade-direction
        // (toward mid), so the chandelier/structural trail can price either entry.
        fStruct: ln.fStruct, fChand: ln.fChand,
        fStructFade: ln.fStructFade, fChandFade: ln.fChandFade,
        // Exit-study gross PnLs (%-of-price, no cost) — six {fade,follow}×{fixed,
        // chand,walk} combos simulated along the real M1 path by simulateExitVariants.
        // Undefined on records refreshed before the exit study shipped (runExitStudy
        // counts and skips those).
        exFadeFixed: ln.exFadeFixed, exFadeChand: ln.exFadeChand, exFadeWalk: ln.exFadeWalk,
        exFollowFixed: ln.exFollowFixed, exFollowChand: ln.exFollowChand, exFollowWalk: ln.exFollowWalk,
      });
    }
  }
  return touches;
}

// ── 2) Price one touch for a GIVEN decision (% of price, net of cost) ─────────
// Triple-barrier when a barrier was actually hit: FADE wins to the inner line,
// loses to the outer; FOLLOW the reverse. When the outcome was decided by the
// CLOSE (no barrier reached), mark to the actual close — so a 2-pip drift that
// never tagged the target is scored as a 2-pip outcome, NOT a full win.
export function pnlFor(t, decision, { costPct = 0.012, slipPct = 0.006 } = {}) {
  let gross;
  if (t.decidedBy === 'close') {
    // BUY when fading a down-line or following an up-line; else SELL.
    const isBuy = (decision === 'fade' && t.side === 'dn') || (decision === 'follow' && t.side === 'up');
    gross = (isBuy ? (t.closePx - t.level) : (t.level - t.closePx)) / t.open * 100;
  } else {
    const distIn  = Math.abs(t.level - t.innerLvl) / t.open * 100;   // to TP (fade) / SL (follow)
    const distOut = Math.abs(t.outerLvl - t.level) / t.open * 100;   // to SL (fade) / TP (follow)
    gross = decision === 'fade' ? (t.reverted ?  distIn : -distOut)
                                : (t.reverted ? -distIn :  distOut);  // follow
  }
  const cost = costPct + (decision === 'follow' ? slipPct : 0);       // stop entries slip
  return +(gross - cost).toFixed(5);
}

// ── 3) Learn the fade/follow/skip policy from IS touches ─────────────────────
// Keep a cell ONLY if its in-sample AFTER-COST expectancy (with the real TP/SL +
// honest mark-to-close) clears a positive margin — being right > 50% is NOT
// enough if the wins are smaller than the losses or thinner than the spread.
// Picks whichever of fade/follow is the more profitable side. Per-touch cost is
// taken from t.cost/t.slip (stamped by runPerLine) with a fallback default.
export function buildPolicy(touches, { minN = 50, marginPct = 0, costPct = 0.012, slipPct = 0.006 } = {}) {
  const cells = {};
  for (const t of touches) (cells[t.cell] ??= []).push(t);
  const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const policy = {};
  for (const [cell, ts] of Object.entries(cells)) {
    const n = ts.length;
    if (n < minN) { policy[cell] = { decision: 'skip', n, reason: 'lowN' }; continue; }
    const cost = t => ({ costPct: t.cost ?? costPct, slipPct: t.slip ?? slipPct });
    const fadeExp   = mean(ts.map(t => pnlFor(t, 'fade',   cost(t))));
    const followExp = mean(ts.map(t => pnlFor(t, 'follow', cost(t))));
    const revRate   = ts.filter(t => t.reverted).length / n;
    const best = fadeExp >= followExp ? 'fade' : 'follow';
    const bestExp = Math.max(fadeExp, followExp);
    const decision = bestExp > marginPct ? best : 'skip';   // must PAY after costs, not just be directional
    policy[cell] = {
      decision, n, revRate: +(revRate * 100).toFixed(1),
      z: +((revRate - 0.5) / Math.sqrt(0.25 / n)).toFixed(2),
      fadeExp: +fadeExp.toFixed(4), followExp: +followExp.toFixed(4), expectancy: +bestExp.toFixed(4),
      ...(decision === 'skip' ? { reason: 'belowMargin' } : {}),   // edge < cost (vs 'lowN' above)
    };
  }
  return policy;
}

// Back-compat helper: price a touch under a full policy (null when skipped).
export function tradePnl(t, policy, opts = {}) {
  const p = policy[t.cell];
  if (!p || p.decision === 'skip') return null;
  return pnlFor(t, p.decision, { costPct: t.cost ?? opts.costPct, slipPct: t.slip ?? opts.slipPct });
}

// ── 4) Full run: pooled IS policy → per-pair OOS trades → book equity ─────────
// touchesByPair: { pair: touches[] }.  costByPair/slipByPair optional per-pair.
// Returns { splitDate, policy, book, perPair, equity, nTrades, coverage }.
export function runPerLine(touchesByPair, { splitFrac = 0.6, minN = 50, marginPct = 0,
                                            costByPair = {}, slipByPair = {}, mcRuns = 1000, bootRuns = 1000,
                                            survivorMargin = 0.5, minSurvivorTrades = 30 } = {}) {
  // Stamp each touch with its pair's costs so the pooled policy prices trades
  // with the right (asset-class) friction.
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    const cost = costByPair[pair] ?? DEFAULT_COST_PCT.fx;
    const slip = slipByPair[pair] ?? DEFAULT_SLIP_PCT.fx;
    for (const t of touches) { t.cost = cost; t.slip = slip; }
  }
  const all = Object.values(touchesByPair).flat().sort(byDate);
  if (!all.length) return null;
  const splitDate = all[Math.floor(all.length * splitFrac)]?.date ?? null;
  // Policy learned on IS, gated on after-cost expectancy (not just direction).
  const policy = buildPolicy(all.filter(t => t.date < splitDate), { minN, marginPct });

  const bookTrades = [], perPair = {}, tradesByPair = {}, pnlByPair = {};
  // Missed/skipped OOS touches + WHY the engine said no (the Phase-C "missed
  // trades" view): a cell unseen in IS, too rare in IS (lowN), or whose IS edge
  // didn't clear cost (belowMargin). We also stash the IS fade/follow estimate so
  // you can see whether the skip was correct (negative est = good skip).
  const missedCells = {};
  let missedTotal = 0;
  const noteMissed = (t, reason, p) => {
    missedTotal++;
    const c = (missedCells[t.cell] ??= { cell: t.cell, line: t.line, n: 0, reason,
      fadeExp: p?.fadeExp ?? null, followExp: p?.followExp ?? null });
    c.n++;
  };
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    const trades = [], log = [];
    for (const t of touches) {
      if (t.date < splitDate) continue;                     // OOS only
      const p = policy[t.cell];
      if (!p)                       { noteMissed(t, 'unseen-in-IS'); continue; }
      if (p.decision === 'skip')    { noteMissed(t, p.reason === 'lowN' ? 'low-N in IS' : 'edge below cost', p); continue; }
      const pnl = pnlFor(t, p.decision, { costPct: t.cost, slipPct: t.slip });
      // Adverse excursion (intratrade MAE, % of price) for the chosen decision:
      // a fade is hurt by CONTINUATION (extPct toward its stop); a follow by REVERSION.
      const maePct = Math.abs((p.decision === 'fade' ? t.extPct : t.retracePct) ?? 0);
      trades.push({ date: t.date, pnl,
        entryTime: t.fillTime, exitTime: t.exitTime ?? t.fillTime,
        maeTime: p.decision === 'fade' ? (t.extTime ?? t.fillTime) : t.fillTime, maePct });
      // Full trade geometry for the log + the (Phase 2) M1 chart drill-down.
      const tp = p.decision === 'fade' ? t.innerLvl : t.outerLvl;
      const sl = p.decision === 'fade' ? t.outerLvl : t.innerLvl;
      log.push({ date: t.date, line: t.line, name: t.name, side: t.side, decision: p.decision,
        outcome: t.reverted ? 'reverted' : 'continued', decidedBy: t.decidedBy, open: t.open,
        entry: +t.level.toFixed(6), tp: +tp.toFixed(6), sl: +sl.toFixed(6),
        fillTime: t.fillTime, pnl });
    }
    perPair[pair] = { ...summarizeTrades(trades.map(x => x.pnl), trades.map(x => x.date)), trades: trades.length,
                      costPct: costByPair[pair] ?? DEFAULT_COST_PCT.fx };
    tradesByPair[pair] = log;
    pnlByPair[pair] = trades;                                // {date,pnl}[] for the survivor re-aggregation
    bookTrades.push(...trades);
  }
  bookTrades.sort(byDate);
  // Daily-aggregated equity curve (compact: one point per day, not per trade) —
  // sum the book's PnL per date, then cumulate. % of capital per unit, no compounding.
  const byDay = new Map();
  for (const t of bookTrades) byDay.set(t.date, (byDay.get(t.date) || 0) + t.pnl);
  let cum = 0;
  const equity = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, pnl]) => ({ date, pnl: +pnl.toFixed(4), cum: +(cum += pnl).toFixed(4) }));
  // ── Live universe (survivors) ──────────────────────────────────────────────
  // Costs are the binding constraint, so a pair is only "live" if its OOS net
  // expectancy clears its OWN round-trip spread by a margin (and has enough
  // trades to mean it). The survivor portfolio is RE-AGGREGATED from just those
  // pairs' daily PnL — so its Sharpe still honours same-day concurrency and
  // cross-pair correlation, not a naive average of per-pair Sharpes.
  const survivors = buildSurvivors(perPair, pnlByPair, costByPair, { survivorMargin, minSurvivorTrades });
  // Missed-trades summary: counts by reason + the most-skipped cells (with their
  // IS estimate, so a skip with negative est reads as correctly avoided).
  const byReason = {};
  for (const c of Object.values(missedCells)) byReason[c.reason] = (byReason[c.reason] || 0) + c.n;
  const missed = {
    total: missedTotal, taken: bookTrades.length,
    takenRate: (missedTotal + bookTrades.length) ? +(bookTrades.length / (missedTotal + bookTrades.length) * 100).toFixed(1) : 0,
    byReason,
    topCells: Object.values(missedCells).sort((a, b) => b.n - a.n).slice(0, 40),
  };
  return {
    splitDate, policy, perPair, equity, nTrades: bookTrades.length, tradesByPair, missed,
    book: backtestStats(bookTrades.map(x => x.pnl), bookTrades.map(x => x.date), { mcRuns, bootRuns }),
    // HONEST headline: Sharpe/CAGR/DD on the daily portfolio series (captures
    // same-day concurrency + cross-pair correlation), not per-trade ×√(trades/yr).
    portfolio: { ...portfolioStats(equity.map(e => e.pnl), { mc: true }), avgTradesPerDay: equity.length ? +(bookTrades.length / equity.length).toFixed(1) : 0 },
    intradayDD: intradayDDBlock(bookTrades, equity),
    survivors,
    coverage: { fadeCells: countDec(policy, 'fade'), followCells: countDec(policy, 'follow'), skipCells: countDec(policy, 'skip') },
  };
}

// Pick the "live universe" (pairs that clear their own cost by a margin) and
// re-aggregate ONLY their daily PnL into an honest portfolio. perPair holds the
// OOS stats; pnlByPair holds each pair's {date,pnl}[]; costByPair the spreads.
export function buildSurvivors(perPair, pnlByPair, costByPair = {}, { survivorMargin = 0.5, minSurvivorTrades = 30 } = {}) {
  const all = Object.keys(perPair);
  const keep = [], excluded = [];
  for (const p of all) {
    const s = perPair[p], cost = costByPair[p] ?? DEFAULT_COST_PCT.fx;
    const need = cost * survivorMargin;                       // net edge must clear this
    if (s.trades >= minSurvivorTrades && s.expectancy >= need) keep.push(p);
    else excluded.push({ pair: p, expectancy: s.expectancy, costPct: +cost.toFixed(4), need: +need.toFixed(4),
      trades: s.trades, reason: s.trades < minSurvivorTrades ? 'too few trades' : 'expectancy below cost margin' });
  }
  const survTrades = keep.flatMap(p => pnlByPair[p] || []).sort(byDate);
  const byDay = new Map();
  for (const t of survTrades) byDay.set(t.date, (byDay.get(t.date) || 0) + t.pnl);
  let cum = 0;
  const equity = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, pnl]) => ({ date, pnl: +pnl.toFixed(4), cum: +(cum += pnl).toFixed(4) }));
  return {
    margin: survivorMargin, minTrades: minSurvivorTrades,
    pairs: keep, count: keep.length, total: all.length,
    excluded: excluded.sort((a, b) => a.expectancy - b.expectancy),
    nTrades: survTrades.length, equity,
    portfolio: { ...portfolioStats(equity.map(e => e.pnl), { mc: true }), avgTradesPerDay: equity.length ? +(survTrades.length / equity.length).toFixed(1) : 0 },
    intradayDD: intradayDDBlock(survTrades, equity),
  };
}

function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }

// Raw (un-vol-targeted) peak-to-trough of the closed-trade daily-cumulated curve —
// SAME % units as intradayMtmDrawdown, so the two can form an honest multiple.
function rawClosedDD(equity) {
  let peak = 0, maxDD = 0;
  for (const e of equity) { if (e.cum > peak) peak = e.cum; const dd = e.cum - peak; if (dd < maxDD) maxDD = dd; }
  return +maxDD.toFixed(4);
}

// Intraday MARK-TO-MARKET drawdown block for a trade list + its closed equity curve.
// `trades` must carry {entryTime,exitTime,maeTime,maePct}. Returns the raw intraday
// MTM DD, the raw closed-trade DD (same units), and their multiple — so a tearsheet
// can scale the vol-targeted headline DD up by `multipleVsClosed` to show the honest
// number that includes intratrade MAE + concurrency.
function intradayDDBlock(trades, equity) {
  const id = intradayMtmDrawdown(trades);
  const closedRawDD = rawClosedDD(equity);
  const mult = closedRawDD < -1e-9 ? +(id.maxDD / closedRawDD).toFixed(2) : null;
  return { maxDD: id.maxDD, closedRawDD, multipleVsClosed: mult, breakpoints: id.breakpoints,
           tradeStats: tradeTimingStats(trades) };
}
function countDec(policy, d) { return Object.values(policy).filter(p => p.decision === d).length; }

// Daily-summed PnL series from a {date,pnl}[] list (for portfolioStats).
function dailySeries(trades) {
  const m = new Map();
  for (const t of trades) m.set(t.date, (m.get(t.date) || 0) + t.pnl);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, p]) => p);
}
// Price every non-skip touch under a policy (optionally scaling cost by `mult`).
function priceTrades(touches, policy, mult = 1) {
  const out = [];
  for (const t of touches) {
    const p = policy[t.cell];
    if (!p || p.decision === 'skip') continue;
    out.push({ date: t.date, pnl: pnlFor(t, p.decision, { costPct: (t.cost ?? 0.012) * mult, slipPct: (t.slip ?? 0.006) * mult }) });
  }
  return out;
}

// ── 5) Rigor battery — walk-forward, per-year, cost-sensitivity, IS-vs-OOS ─────
// A "serious backtest" beyond one split. All from the same touches (cheap).
//   • walkForward — anchored folds: train on everything before each test chunk,
//     test on the chunk, march forward; aggregate every fold's OOS trades.
//   • isVsOos     — the single-split policy applied to its own IS vs the OOS
//     (degradation ratio = OOS Sharpe ÷ IS Sharpe).
//   • costSensitivity — re-price the OOS book at cost ×{1,2,3} (edge survival).
//   • perYear     — OOS book stats per calendar year (sub-period stability).
export function runRigor(touchesByPair, { splitFrac = 0.6, minN = 50, marginPct = 0,
                                          folds = 5, initialFrac = 0.4, costMults = [1, 2, 3],
                                          costByPair = {}, slipByPair = {} } = {}) {
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    const cost = costByPair[pair] ?? DEFAULT_COST_PCT.fx, slip = slipByPair[pair] ?? DEFAULT_SLIP_PCT.fx;
    for (const t of touches) { t.cost = cost; t.slip = slip; }
  }
  const all = Object.values(touchesByPair).flat().sort(byDate);
  if (all.length < 100) return null;
  const dates = all.map(t => t.date);
  const ps = (trades) => portfolioStats(dailySeries(trades));

  // IS vs OOS on the single split.
  const splitDate = dates[Math.floor(dates.length * splitFrac)];
  const isPol  = buildPolicy(all.filter(t => t.date < splitDate), { minN, marginPct });
  const isStats  = ps(priceTrades(all.filter(t => t.date < splitDate), isPol));
  const oosTrades = priceTrades(all.filter(t => t.date >= splitDate), isPol);
  const oosStats = ps(oosTrades);
  const isVsOos = { splitDate, is: isStats, oos: oosStats,
                    degradation: isStats.sharpe ? +(oosStats.sharpe / isStats.sharpe).toFixed(2) : null };

  // Walk-forward: initial IS = first `initialFrac`, then `folds` equal-count test chunks.
  const startIdx = Math.floor(dates.length * initialFrac);
  const tailDates = dates.slice(startIdx);
  const wfTrades = [], foldStats = [];
  for (let f = 0; f < folds; f++) {
    const a = tailDates[Math.floor(f * tailDates.length / folds)];
    const b = tailDates[Math.floor((f + 1) * tailDates.length / folds)] ?? null;   // null = to the end
    const train = all.filter(t => t.date < a);
    if (train.length < minN) continue;
    const pol = buildPolicy(train, { minN, marginPct });
    const test = all.filter(t => t.date >= a && (b == null || t.date < b));
    const tr = priceTrades(test, pol);
    wfTrades.push(...tr);
    foldStats.push({ from: a, to: b ?? dates[dates.length - 1], trades: tr.length, ...ps(tr) });
  }
  const walkForward = { folds: foldStats, overall: ps(wfTrades), trades: wfTrades.length };

  // Cost sensitivity on the OOS book (same policy, friction × mult).
  const oosTouches = all.filter(t => t.date >= splitDate);
  const costSensitivity = costMults.map(mult => ({ mult, ...ps(priceTrades(oosTouches, isPol, mult)) }));

  // Per-year (OOS).
  const byYear = {};
  for (const t of oosTrades) (byYear[t.date.slice(0, 4)] ??= []).push(t);
  const perYear = Object.entries(byYear).sort().map(([year, tr]) => ({ year, trades: tr.length, ...ps(tr) }));

  return { isVsOos, walkForward, costSensitivity, perYear };
}

// ── 6) Parameter-sensitivity grid (Phase C) ──────────────────────────────────
// One-at-a-time (OAT) sweep around the base params: vary each knob across a small
// grid holding the others at base, and report the OOS portfolio Sharpe + trade
// count + survivor count/Sharpe. Cheap (no bootstrap/MC). Also returns the flat
// list of per-observation daily Sharpes across all DISTINCT combos — the "trials"
// a deflated-Sharpe correction needs. Note: approach-velocity thresholds are baked
// into the stored touch cells at refresh time, so they CANNOT be swept here without
// re-running the analyser — only post-hoc knobs are grid-able.
export function runSensitivity(touchesByPair, { base = {}, grids = {}, costByPair = {}, slipByPair = {}, minSurvivorTrades = 30 } = {}) {
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    const cost = costByPair[pair] ?? DEFAULT_COST_PCT.fx, slip = slipByPair[pair] ?? DEFAULT_SLIP_PCT.fx;
    for (const t of touches) { t.cost = cost; t.slip = slip; }
  }
  const pairs   = Object.entries(touchesByPair);
  const allFlat = Object.values(touchesByPair).flat().sort(byDate);
  if (allFlat.length < 100) return null;
  const dates = allFlat.map(t => t.date);
  const B = { splitFrac: base.splitFrac ?? 0.6, minN: base.minN ?? 50,
              marginPct: base.marginPct ?? 0, survivorMargin: base.survivorMargin ?? 0.5 };

  const evalCombo = ({ splitFrac, minN, marginPct, survivorMargin }) => {
    const splitDate = dates[Math.floor(dates.length * splitFrac)];
    const pol = buildPolicy(allFlat.filter(t => t.date < splitDate), { minN, marginPct });
    const pnlByPair = {}, perPair = {}, pooled = [];
    for (const [pair, touches] of pairs) {
      const tr = priceTrades(touches.filter(t => t.date >= splitDate), pol);
      pnlByPair[pair] = tr;
      const exp = tr.length ? tr.reduce((s, x) => s + x.pnl, 0) / tr.length : 0;
      perPair[pair] = { expectancy: +exp.toFixed(4), trades: tr.length };
      pooled.push(...tr);
    }
    const daily = dailySeries(pooled);
    const m = daily.length ? daily.reduce((s, x) => s + x, 0) / daily.length : 0;
    const sd = daily.length > 1 ? Math.sqrt(daily.reduce((s, x) => s + (x - m) ** 2, 0) / daily.length) : 0;
    const port = portfolioStats(daily);
    const surv = buildSurvivors(perPair, pnlByPair, costByPair, { survivorMargin, minSurvivorTrades });
    return { splitFrac, minN, marginPct, survivorMargin, days: daily.length, nTrades: pooled.length,
      sharpe: port.sharpe, sharpeRaw: sd > 1e-9 ? +(m / sd).toFixed(4) : 0,
      survCount: surv.count, survSharpe: surv.portfolio?.sharpe ?? 0 };
  };

  const G = {
    splitFrac:      grids.splitFrac      ?? [0.5, 0.6, 0.7],
    minN:           grids.minN           ?? [30, 50, 75, 100],
    marginPct:      grids.marginPct      ?? [0, 0.005, 0.01, 0.02],
    survivorMargin: grids.survivorMargin ?? [0.25, 0.5, 0.75, 1.0],
  };
  const seen = new Set(), trials = [], sweeps = {};
  const remember = r => { const k = `${r.splitFrac}|${r.minN}|${r.marginPct}|${r.survivorMargin}`;
    if (!seen.has(k)) { seen.add(k); trials.push(r); } };
  for (const [param, vals] of Object.entries(G))
    sweeps[param] = vals.map(v => { const r = evalCombo({ ...B, [param]: v }); remember(r); return r; });
  const baseRow = evalCombo(B); remember(baseRow);
  return { base: B, baseRow, sweeps, nTrials: trials.length, trialSharpesRaw: trials.map(t => t.sharpeRaw) };
}

// ── 7) Exit study — fixed vs chandelier vs walk-forward (breakeven) stop ───────
// Holds the ENTRY policy (same buildPolicy learned on IS) fixed and only swaps the
// EXIT rule, so any Sharpe difference is the stop behaviour, not the entry edge.
// For each non-skip OOS touch the study prices all three rules from the analyser's
// pre-simulated gross PnLs (t.exFadeFixed / …Chand / …Walk etc. — computed along
// the real M1 path by simulateExitVariants), then nets cost + follow-slip.
// Aggregates each rule THREE ways (overall / fade-only / follow-only) via the
// daily portfolio series (Sharpe/CAGR/DD) + summarizeTrades (expectancy/winRate).
//   splitFrac — IS/OOS split (IS = date < splitDate, learns the policy).
//   minN/marginPct — passed to buildPolicy (a cell trades only if its IS edge pays).
//   costByPair/slipByPair — per-pair friction stamped onto each touch (mirrors runRigor).
const _cap = s => s.charAt(0).toUpperCase() + s.slice(1);   // 'fade' → 'Fade'
export function runExitStudy(touchesByPair, { splitFrac = 0.6, minN = 50, marginPct = 0.01,
                                              trailFrac = 0.5, beTrigger = 0.5,
                                              costByPair = {}, slipByPair = {} } = {}) {
  // Stamp per-pair costs so buildPolicy + the OOS netting use the SAME friction and
  // margin as the deployed book — otherwise the study learns a looser policy (trading
  // marginal cells the book skips) and mis-prices per pair, making the absolute level
  // incomparable to the book. Default marginPct 0.01 = the book's after-cost gate;
  // default cost = the per-pair PAIR_COST_PCT table (not a flat fx default).
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    const cost = costByPair[pair] ?? costForPair(pair), slip = slipByPair[pair] ?? DEFAULT_SLIP_PCT.fx;
    for (const t of touches) { t.cost = cost; t.slip = slip; }
  }
  const all = Object.values(touchesByPair).flat().sort(byDate);
  if (!all.length) return null;
  const splitDate = all[Math.floor(all.length * splitFrac)]?.date ?? null;
  // Entry policy learned on IS (same as the book), held fixed across all three exits.
  const policy = buildPolicy(all.filter(t => t.date < splitDate), { minN, marginPct });

  const RULES = ['fixed', 'chand', 'walk'];
  // trades[rule][group] = {date,pnl}[]  where group ∈ overall|fade|follow.
  const trades = Object.fromEntries(RULES.map(r => [r, { overall: [], fade: [], follow: [] }]));
  let missing = 0;
  for (const t of all) {
    if (t.date < splitDate) continue;                       // OOS only
    const p = policy[t.cell];
    if (!p || p.decision === 'skip') continue;              // entry policy says don't trade this cell
    const d = p.decision;                                   // 'fade' | 'follow'
    const cost = (t.cost ?? DEFAULT_COST_PCT.fx) + (d === 'follow' ? (t.slip ?? DEFAULT_SLIP_PCT.fx) : 0);
    for (const rule of RULES) {
      const gross = t['ex' + _cap(d) + _cap(rule)];
      if (gross == null) { missing++; continue; }           // older record without the ex* field
      const pnl = +(gross - cost).toFixed(5);
      const row = { date: t.date, pnl };
      trades[rule].overall.push(row);
      trades[rule][d].push(row);
    }
  }

  const summarize = (rows) => {
    const daily = dailySeries(rows);
    const port  = portfolioStats(daily);                    // honest Sharpe/CAGR/maxDD (daily series)
    const trd   = summarizeTrades(rows.map(r => r.pnl), rows.map(r => r.date));   // expectancy/winRate
    // portfolio Sharpe/CAGR/maxDD are the headline (daily, concurrency-aware); take
    // expectancy + winRate from summarizeTrades. trades = OOS trade count.
    return { sharpe: port.sharpe, cagr: port.cagr, maxDD: port.maxDD, calmar: port.calmar,
             annVol: port.annVol, psr: port.psr, days: port.days,
             expectancy: trd.expectancy, winRate: trd.winRate, profitFactor: trd.profitFactor,
             totalPnl: trd.totalPnl, trades: rows.length };
  };
  const rules = {};
  for (const rule of RULES) rules[rule] = {
    overall: summarize(trades[rule].overall),
    fade:    summarize(trades[rule].fade),
    follow:  summarize(trades[rule].follow),
  };

  // Winner per group = highest OOS Sharpe with n ≥ 30 (else null).
  const bestByGroup = {};
  for (const group of ['overall', 'fade', 'follow']) {
    let best = null, bestSh = -Infinity;
    for (const rule of RULES) {
      const s = rules[rule][group];
      if ((s.trades ?? 0) >= 30 && (s.sharpe ?? -Infinity) > bestSh) { bestSh = s.sharpe; best = rule; }
    }
    bestByGroup[group] = best;
  }

  return { splitDate, trailFrac, beTrigger, missing, rules, bestByGroup };
}

// ── 8) Day-type gate A/B study — does conditioning fade/follow on the ex-ante ──
// trend-day forecast beat the velocity-only policy? ("stop fading into a rally").
//
// Discipline / no-lookahead: the ONLY day-type signal used is each touch's
// `dayType` bucket (derived from the WINDOW's `signedT`, which is EX-ANTE — see
// extractTouches). We never touch realizedDir / outcome / close to decide the
// bucket. buildPolicy still learns fade/follow/skip from IS after-cost PnL.
//
// Runs runPerLine TWICE on the SAME data / split / costs:
//   • baseline: cells keyed by approach-velocity only  (t.cell as passed in)
//   • gated:    cells keyed by approach-velocity × dayType (append |bucket)
// so any OOS difference is the day-type gate, not the data or the split.
//
// touchesByPair: { pair: touches[] } — touches from extractTouches with the
// deployed baseline conditions (['approachVel']); each carries .dayType/.signedT.
// Returns the OOS A/B card + the focused "fade-into-trend" diagnostic (the exact
// "selling into a rally" losers the gate is meant to cut).
export function runDayTypeStudy(touchesByPair, { splitFrac = 0.6, minN = 50, marginPct = 0.01,
                                                 dtThresh = 0.33, costByPair = {}, slipByPair = {} } = {}) {
  const pairs = Object.entries(touchesByPair || {});
  if (!pairs.length) return null;
  // Two views of the SAME touches, differing only in the cell key. Cloning keeps
  // the incoming touches untouched (runPerLine stamps t.cost/t.slip in place).
  const cloneWith = (cellFn) => {
    const out = {};
    for (const [pair, ts] of pairs) out[pair] = ts.map(t => ({ ...t, cell: cellFn(t) }));
    return out;
  };
  const baseByPair  = cloneWith(t => t.cell);                         // approachVel-only cell (as extracted)
  const gatedByPair = cloneWith(t => `${t.cell}|${t.dayType ?? 'na'}`); // + ex-ante day-type bucket

  const opts = { splitFrac, minN, marginPct, costByPair, slipByPair, mcRuns: 0, bootRuns: 0 };
  const baseRes  = runPerLine(baseByPair,  opts);
  const gatedRes = runPerLine(gatedByPair, opts);
  if (!baseRes || !gatedRes) return null;
  const splitDate = baseRes.splitDate;

  // OOS portfolio card for one runPerLine result (Sharpe/CAGR/maxDD from the daily
  // portfolio series; expectancy from per-trade summary; cell breadth from policy).
  const cardOf = (res) => {
    const p = res.portfolio || {};
    const exp = summarizeTrades(res.equity.map(e => e.pnl), res.equity.map(e => e.date)).expectancy;
    return {
      sharpe: p.sharpe ?? 0, cagr: p.cagr ?? 0, maxDD: p.maxDD ?? 0,
      expectancy: exp, nTrades: res.nTrades,
      cells: { fade: res.coverage.fadeCells, follow: res.coverage.followCells, skip: res.coverage.skipCells },
    };
  };
  const baseline = cardOf(baseRes);
  const gated    = cardOf(gatedRes);

  // ── Fade-into-trend diagnostic ──────────────────────────────────────────────
  // Over the OOS touches: isolate the ones the BASELINE policy FADES that go
  // AGAINST the ex-ante day-type — i.e. fading an UP line on a tU (trend-up) day,
  // or a DN line on a tD (trend-down) day. Those are the "selling into a rally"
  // losers. Report their count + baseline net PnL, and what the GATED policy does
  // with the SAME touches (skip / flip-to-follow / still-fade) + its net PnL.
  const basePolicy  = baseRes.policy;
  const gatedPolicy = gatedRes.policy;
  const againstTrend = (t) => (t.side === 'up' && t.dayType === 'tU') || (t.side === 'dn' && t.dayType === 'tD');
  let n = 0, baselineNetPnl = 0, gatedNetPnl = 0;
  const gatedAction = { skip: 0, flip: 0, fade: 0 };
  for (const [pair, ts] of pairs) {
    for (const t of ts) {
      if (t.date < splitDate) continue;                              // OOS only
      if (!againstTrend(t)) continue;
      const bp = basePolicy[t.cell];                                 // baseline cell (as extracted)
      if (!bp || bp.decision !== 'fade') continue;                   // only the baseline fades-into-trend
      n++;
      const cost = { costPct: t.cost ?? costByPair[pair] ?? DEFAULT_COST_PCT.fx,
                     slipPct: t.slip ?? slipByPair[pair] ?? DEFAULT_SLIP_PCT.fx };
      baselineNetPnl += pnlFor(t, 'fade', cost);
      const gp = gatedPolicy[`${t.cell}|${t.dayType ?? 'na'}`];      // gated cell decision on the SAME touch
      const gDec = (!gp || gp.decision === 'skip') ? 'skip' : gp.decision;
      if (gDec === 'skip')        gatedAction.skip++;
      else if (gDec === 'follow') { gatedAction.flip++; gatedNetPnl += pnlFor(t, 'follow', cost); }
      else                        { gatedAction.fade++; gatedNetPnl += pnlFor(t, 'fade',   cost); }
    }
  }

  const delta = {
    sharpe: +((gated.sharpe ?? 0) - (baseline.sharpe ?? 0)).toFixed(3),
    expectancy: +((gated.expectancy ?? 0) - (baseline.expectancy ?? 0)).toFixed(4),
    nTrades: (gated.nTrades ?? 0) - (baseline.nTrades ?? 0),
  };
  // Gated "wins OOS" only with adequate breadth: Sharpe ≥ baseline AND n ≥ 30.
  const gatedWinsOos = (gated.sharpe ?? -Infinity) >= (baseline.sharpe ?? Infinity) && (gated.nTrades ?? 0) >= 30;

  return {
    splitDate, dtThresh, baseline, gated, delta, gatedWinsOos,
    fadeIntoTrend: {
      n, baselineNetPnl: +baselineNetPnl.toFixed(4), gatedNetPnl: +gatedNetPnl.toFixed(4), gatedAction,
    },
  };
}

// ── 9) Stop-loss study — per-pair optimal SL from winners' MAE, out-of-sample ──
// The fade stop is currently the OUTER band line — nobody chose it; it is just
// where the triple-barrier put the far barrier. Each fade touch already stores
// `extPct` (its ADVERSE excursion — how far price continued AGAINST the fade before
// the barrier resolved) and `reverted` (did the fade win), so we can RE-PRICE every
// fade under a TIGHTER candidate stop with NO M1 re-simulation:
//   • candidate SL at distance s (% of price): if extPct > s → the stop triggers
//     → loss −s; else the trade keeps its ORIGINAL barrier/close outcome.
// This finds the stop that cuts losers without stopping the dip-then-revert winners.
//
// CAVEATS baked in (this is a screening study, not a tick replay):
//   • TIGHTENING ONLY. extPct is capped at the ORIGINAL barrier resolution (a fade
//     that continued past the outer line was recorded as decided there), so we can
//     only test candidate SLs ≤ the current outer-band distance. Each candidate s is
//     clamped PER TOUCH to min(s, distOut). Widening would need M1 re-simulation to
//     see past the original stop — noted as a follow-up, NOT attempted here.
//   • CONSERVATIVE ordering. extPct/mfePct are window extremes of unknown ORDER; if
//     extPct > s we assume the stop was hit (conservative on the loss side).
//   • OOS + n≥30. Per-pair tuning overfits, so a pair-specific SL only "wins" if it
//     beats the band SL OOS with ≥30 fade trades for that pair; otherwise it falls
//     back to the band SL. An asset-class-optimal variant (one SL per fx/index/
//     commodity) is offered as the more-robust middle ground.
//   • FADE cells only (the book is ~all fades — that's where the SL pain is). Follow
//     cells (SL = the inner line) are analogous but out of scope for v1.

// Re-price ONE fade touch under a candidate stop at distance `s` (% of price).
// Conservative: if the stored adverse excursion exceeded s we assume the tighter
// stop was hit → loss −s (net of cost). Otherwise the trade survived to its ORIGINAL
// barrier/close resolution → keep the original fade PnL (pnlFor). No slip: a fade
// is a limit entry. pnlAtSL(t, distOut) therefore reconciles with pnlFor's fade
// result (extPct is capped at distOut, so the outer band never "stops" early).
export function pnlAtSL(t, s, { costPct = 0.012 } = {}) {
  const cost = costPct;
  if (t.extPct != null && Number.isFinite(t.extPct) && t.extPct > s)
    return +(-s - cost).toFixed(5);                              // stopped early by the tighter SL
  return pnlFor(t, 'fade', { costPct: cost, slipPct: 0 });       // survived → original fade outcome
}

export function runStopStudy(touchesByPair, { splitFrac = 0.6, minN = 50, marginPct = 0.01,
                                              costByPair = {}, slipByPair = {}, classByPair = {} } = {}) {
  // Stamp per-pair cost so buildPolicy + the OOS re-pricing use the SAME friction as
  // the deployed book (mirrors runExitStudy). Default cost = the per-pair table.
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    const cost = costByPair[pair] ?? costForPair(pair), slip = slipByPair[pair] ?? DEFAULT_SLIP_PCT.fx;
    for (const t of touches) { t.cost = cost; t.slip = slip; }
  }
  const all = Object.values(touchesByPair).flat().sort(byDate);
  if (!all.length) return null;
  const splitDate = all[Math.floor(all.length * splitFrac)]?.date ?? null;
  // Same pooled IS policy the book learns — we only re-price the cells it FADES.
  const policy = buildPolicy(all.filter(t => t.date < splitDate), { minN, marginPct });

  // Collect OOS fade touches (policy decides fade), precomputing the barrier geom.
  const byPair = {};
  const oosFades = [];
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    for (const t of touches) {
      if (t.date < splitDate) continue;                         // OOS only
      const p = policy[t.cell];
      if (!p || p.decision !== 'fade') continue;                // fade cells only (v1)
      t.distIn  = Math.abs(t.level - t.innerLvl) / t.open * 100;   // TP (toward open)
      t.distOut = Math.abs(t.outerLvl - t.level) / t.open * 100;   // current band SL (away)
      (byPair[pair] ??= []).push(t);
      oosFades.push(t);
    }
  }
  if (!oosFades.length) return null;

  // ── helpers ─────────────────────────────────────────────────────────────────
  const sortAsc = a => [...a].sort((x, y) => x - y);
  const pctAt = (arrAsc, q) => arrAsc.length ? arrAsc[Math.min(arrAsc.length - 1, Math.floor(q / 100 * arrAsc.length))] : null;
  const medOf = a => { if (!a.length) return 0; const s = sortAsc(a); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  // Price one fade at candidate s (null = band SL = original outcome; tightening is
  // clamped PER TOUCH to min(s, distOut) so we never test a WIDER stop than the band).
  const priceOne = (t, s) => (s == null)
    ? pnlFor(t, 'fade', { costPct: t.cost ?? DEFAULT_COST_PCT.fx, slipPct: 0 })
    : pnlAtSL(t, Math.min(s, t.distOut), { costPct: t.cost ?? DEFAULT_COST_PCT.fx });
  const rowsFor = (fades, s) => fades.map(t => ({ date: t.date, pnl: priceOne(t, s) }));
  const statOf = (rows) => {
    const port = portfolioStats(dailySeries(rows));
    const trd  = summarizeTrades(rows.map(r => r.pnl), rows.map(r => r.date));
    return { sharpe: port.sharpe, cagr: port.cagr, maxDD: port.maxDD, expectancy: trd.expectancy, trades: rows.length };
  };
  // Argmax-Sharpe (tie-break expectancy) over the tightening grid vs the band baseline.
  // Returns the winning stop distance + its OOS stats + the `s` actually applied (null
  // when the band wins or n<30 → the portfolio then prices that group at the band SL).
  const pickBest = (fades) => {
    const n = fades.length;
    const dists = fades.map(t => t.distOut);
    const bandSL = medOf(dists);                                 // representative current band SL
    const winnersMae = sortAsc(fades.filter(t => t.reverted).map(t => t.extPct).filter(Number.isFinite));
    const rawCands = [pctAt(winnersMae, 75), pctAt(winnersMae, 90), pctAt(winnersMae, 95), 0.5 * bandSL, 0.75 * bandSL];
    const cands = [...new Set(rawCands.filter(s => s != null && s > 0 && s < bandSL).map(s => +s.toFixed(5)))];
    const bandStat = statOf(rowsFor(fades, null));
    let best = { sl: +bandSL.toFixed(5), sUsed: null, ...bandStat };
    if (n >= 30) {
      for (const s of cands) {
        const st = statOf(rowsFor(fades, s));
        if (st.sharpe > best.sharpe + 1e-9 ||
            (Math.abs(st.sharpe - best.sharpe) <= 1e-9 && st.expectancy > best.expectancy))
          best = { sl: s, sUsed: s, ...st };
      }
    }
    return { n, bandSL, bandStat, best, winnersMae };
  };

  // ── per-pair ─────────────────────────────────────────────────────────────────
  const perPair = {}, perPairSUsed = {};
  for (const [pair, fades] of Object.entries(byPair)) {
    const r = pickBest(fades);
    perPairSUsed[pair] = r.best.sUsed;                          // s applied in the per-pair-optimal portfolio
    perPair[pair] = {
      n: r.n,
      winnersMaeP50: r.winnersMae.length ? +pctAt(r.winnersMae, 50).toFixed(5) : null,
      winnersMaeP75: r.winnersMae.length ? +pctAt(r.winnersMae, 75).toFixed(5) : null,
      winnersMaeP90: r.winnersMae.length ? +pctAt(r.winnersMae, 90).toFixed(5) : null,
      winnersMaeP95: r.winnersMae.length ? +pctAt(r.winnersMae, 95).toFixed(5) : null,
      bandSL: +r.bandSL.toFixed(5),
      bestSL: +r.best.sl.toFixed(5),
      expBand: r.bandStat.expectancy, expBest: r.best.expectancy,
      sharpeBand: r.bandStat.sharpe, sharpeBest: r.best.sharpe,
      lowN: r.n < 30,
    };
  }

  // ── asset-class-optimal (one SL per fx/index/commodity — the robust middle) ───
  const byClass = {};
  for (const [pair, fades] of Object.entries(byPair)) (byClass[classByPair[pair] || 'fx'] ??= []).push(...fades);
  const classBestS = {}, classDetail = {};
  for (const [cls, fades] of Object.entries(byClass)) {
    const r = pickBest(fades);
    classBestS[cls] = r.best.sUsed;
    classDetail[cls] = { n: r.n, bandSL: +r.bandSL.toFixed(5), bestSL: +r.best.sl.toFixed(5),
      expBand: r.bandStat.expectancy, expBest: r.best.expectancy,
      sharpeBand: r.bandStat.sharpe, sharpeBest: r.best.sharpe, lowN: r.n < 30 };
  }

  // ── portfolio A/B (all three priced across the SAME OOS fades) ────────────────
  const bandRows = [], perPairRows = [], acRows = [];
  for (const [pair, fades] of Object.entries(byPair)) {
    const cls = classByPair[pair] || 'fx';
    for (const t of fades) {
      bandRows.push({ date: t.date, pnl: priceOne(t, null) });
      perPairRows.push({ date: t.date, pnl: priceOne(t, perPairSUsed[pair]) });
      acRows.push({ date: t.date, pnl: priceOne(t, classBestS[cls] ?? null) });
    }
  }
  const band = statOf(bandRows), perPairOpt = statOf(perPairRows), assetClassOpt = statOf(acRows);
  const deltaOf = (a) => ({ sharpe: +(a.sharpe - band.sharpe).toFixed(3),
                            expectancy: +(a.expectancy - band.expectancy).toFixed(4),
                            trades: a.trades - band.trades });

  return {
    splitDate, minN, marginPct,
    perPair, classDetail,
    portfolio: { band, perPairOpt, assetClassOpt,
      delta: { perPairOpt: deltaOf(perPairOpt), assetClassOpt: deltaOf(assetClassOpt) } },
    note: 'OOS, tightening-only (candidate SL ≤ current outer band; wider stops need M1 re-sim). ' +
          'Screening re-price off stored extPct (adverse excursion) with conservative ordering — not a tick replay. ' +
          'Adopt a per-pair SL only where it beats the band SL OOS with n≥30 fade trades; else fall back to asset-class or the band SL.',
  };
}
