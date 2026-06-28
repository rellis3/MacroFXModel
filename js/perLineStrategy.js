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
import { backtestStats } from './backtestStats.js';

export const DEFAULT_COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };
export const DEFAULT_SLIP_PCT = { fx: 0.006, index: 0.008, commodity: 0.012 };  // extra on FOLLOW (stop) entries

// ── 1) Flatten window records → decided touches with conditions + barrier geom ─
// Each touch: { date, open, line, reverted, level, innerLvl, outerLvl, cell }.
// `conditions` = the per-line condition fields keyed into the cell (default the
// OOS-proven approach velocity; add 'budgetBucket' etc. to refine).
export function extractTouches(records, { conditions = ['approachVel'] } = {}) {
  const touches = [];
  for (const w of records || []) {
    for (const ln of w.lines || []) {
      if (ln.outcome !== 'reverted' && ln.outcome !== 'continued') continue;   // decided only
      if (ln.innerLvl == null || ln.outerLvl == null || !(w.open > 0)) continue;
      const condKey = conditions.map(c => ln[c] ?? 'na').join('|');
      if (condKey.includes('na')) continue;   // missing a gating condition → not tradeable
      touches.push({
        date: w.date, open: w.open, line: `${ln.name}_${ln.side}`, name: ln.name, side: ln.side,
        reverted: ln.outcome === 'reverted', fillTime: ln.firstTouchTime ?? null,
        level: ln.level, innerLvl: ln.innerLvl, outerLvl: ln.outerLvl,
        decidedBy: ln.decidedBy ?? 'barrier',           // 'barrier' (TP/SL hit) or 'close' (mark-to-close)
        closePx: w.realized?.close ?? w.open,            // for honest mark-to-close of undecided outcomes
        cell: `${ln.name}_${ln.side}|${condKey}`,
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
                                            costByPair = {}, slipByPair = {}, mcRuns = 1000, bootRuns = 1000 } = {}) {
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

  const bookTrades = [], perPair = {}, tradesByPair = {};
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    const trades = [], log = [];
    for (const t of touches) {
      if (t.date < splitDate) continue;                     // OOS only
      const p = policy[t.cell];
      if (!p || p.decision === 'skip') continue;
      const pnl = pnlFor(t, p.decision, { costPct: t.cost, slipPct: t.slip });
      trades.push({ date: t.date, pnl });
      // Full trade geometry for the log + the (Phase 2) M1 chart drill-down.
      const tp = p.decision === 'fade' ? t.innerLvl : t.outerLvl;
      const sl = p.decision === 'fade' ? t.outerLvl : t.innerLvl;
      log.push({ date: t.date, line: t.line, name: t.name, side: t.side, decision: p.decision,
        outcome: t.reverted ? 'reverted' : 'continued', decidedBy: t.decidedBy, open: t.open,
        entry: +t.level.toFixed(6), tp: +tp.toFixed(6), sl: +sl.toFixed(6),
        fillTime: t.fillTime, pnl });
    }
    perPair[pair] = { ...summarizeTrades(trades.map(x => x.pnl), trades.map(x => x.date)), trades: trades.length };
    tradesByPair[pair] = log;
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
  return {
    splitDate, policy, perPair, equity, nTrades: bookTrades.length, tradesByPair,
    book: backtestStats(bookTrades.map(x => x.pnl), bookTrades.map(x => x.date), { mcRuns, bootRuns }),
    coverage: { fadeCells: countDec(policy, 'fade'), followCells: countDec(policy, 'follow'), skipCells: countDec(policy, 'skip') },
  };
}

function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
function countDec(policy, d) { return Object.values(policy).filter(p => p.decision === d).length; }
