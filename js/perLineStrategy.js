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
        date: w.date, open: w.open, line: `${ln.name}_${ln.side}`,
        reverted: ln.outcome === 'reverted',
        level: ln.level, innerLvl: ln.innerLvl, outerLvl: ln.outerLvl,
        cell: `${ln.name}_${ln.side}|${condKey}`,
      });
    }
  }
  return touches;
}

// ── 2) Learn the fade/follow/skip policy from IS touches ─────────────────────
// fade   = reversion significantly > 50% (price returns to the inner line)
// follow = reversion significantly < 50% (price breaks to the outer line)
// skip   = coin-flip or thin sample.
export function buildPolicy(touches, { minN = 50, z = 1.96 } = {}) {
  const tally = {};
  for (const t of touches) {
    const c = (tally[t.cell] ??= { rev: 0, cont: 0 });
    t.reverted ? c.rev++ : c.cont++;
  }
  const policy = {};
  for (const [cell, c] of Object.entries(tally)) {
    const n = c.rev + c.cont;
    if (n < minN) { policy[cell] = { decision: 'skip', n, reason: 'lowN' }; continue; }
    const rate  = c.rev / n;
    const zStat = (rate - 0.5) / Math.sqrt(0.25 / n);
    const decision = zStat >= z ? 'fade' : zStat <= -z ? 'follow' : 'skip';
    policy[cell] = { decision, n, revRate: +(rate * 100).toFixed(1), z: +zStat.toFixed(2) };
  }
  return policy;
}

// ── 3) Price one touch under the policy (% of price, net of cost) ─────────────
// Triple-barrier: a FADE wins to the inner line, loses to the outer; FOLLOW the
// reverse. Returns null when the policy skips the cell.
export function tradePnl(t, policy, { costPct = 0.012, slipPct = 0.006 } = {}) {
  const p = policy[t.cell];
  if (!p || p.decision === 'skip') return null;
  const distIn  = Math.abs(t.level - t.innerLvl) / t.open * 100;   // to TP (fade) / SL (follow)
  const distOut = Math.abs(t.outerLvl - t.level) / t.open * 100;   // to SL (fade) / TP (follow)
  const gross = p.decision === 'fade' ? (t.reverted ?  distIn : -distOut)
                                      : (t.reverted ? -distIn :  distOut);   // follow
  const cost  = costPct + (p.decision === 'follow' ? slipPct : 0);           // stop entries slip
  return +(gross - cost).toFixed(5);
}

// ── 4) Full run: pooled IS policy → per-pair OOS trades → book equity ─────────
// touchesByPair: { pair: touches[] }.  costByPair/slipByPair optional per-pair.
// Returns { splitDate, policy, book, perPair, equity, nTrades, coverage }.
export function runPerLine(touchesByPair, { splitFrac = 0.6, minN = 50, z = 1.96,
                                            costByPair = {}, slipByPair = {} } = {}) {
  const all = Object.values(touchesByPair).flat().sort(byDate);
  if (!all.length) return null;
  const splitDate = all[Math.floor(all.length * splitFrac)]?.date ?? null;
  const policy = buildPolicy(all.filter(t => t.date < splitDate), { minN, z });

  const bookTrades = [], perPair = {};
  for (const [pair, touches] of Object.entries(touchesByPair)) {
    const costPct = costByPair[pair] ?? DEFAULT_COST_PCT.fx;
    const slipPct = slipByPair[pair] ?? DEFAULT_SLIP_PCT.fx;
    const trades = [];
    for (const t of touches) {
      if (t.date < splitDate) continue;                     // OOS only
      const pnl = tradePnl(t, policy, { costPct, slipPct });
      if (pnl != null) trades.push({ date: t.date, pnl });
    }
    perPair[pair] = { ...summarizeTrades(trades.map(x => x.pnl), trades.map(x => x.date)), trades: trades.length };
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
    splitDate, policy, perPair, equity, nTrades: bookTrades.length,
    book: summarizeTrades(bookTrades.map(x => x.pnl), bookTrades.map(x => x.date)),
    coverage: { fadeCells: countDec(policy, 'fade'), followCells: countDec(policy, 'follow'), skipCells: countDec(policy, 'skip') },
  };
}

function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
function countDec(policy, d) { return Object.values(policy).filter(p => p.decision === d).length; }
