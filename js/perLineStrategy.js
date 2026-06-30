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
        // Optional MFE/MAE excursion (range-line analyser supplies these; forecast
        // records don't — harmless undefined). Used by the E-ratio exit study.
        excMid: ln.excMid, excAway: ln.excAway,
        // Optional trail PnLs (gross %): follow-direction (away) + fade-direction
        // (toward mid), so the chandelier/structural trail can price either entry.
        fStruct: ln.fStruct, fChand: ln.fChand,
        fStructFade: ln.fStructFade, fChandFade: ln.fChandFade,
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
      trades.push({ date: t.date, pnl });
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
    portfolio: { ...portfolioStats(equity.map(e => e.pnl)), avgTradesPerDay: equity.length ? +(bookTrades.length / equity.length).toFixed(1) : 0 },
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
    portfolio: { ...portfolioStats(equity.map(e => e.pnl)), avgTradesPerDay: equity.length ? +(survTrades.length / equity.length).toFixed(1) : 0 },
  };
}

function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
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
