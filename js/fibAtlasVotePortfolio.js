/**
 * Fib Atlas vote-portfolio combiner (2026-08-28) — the multi-pair "collective"
 * counterpart to the single-pair vote-margin backtest (`js/asiaFibAtlasVoteReview.js`),
 * shared by BOTH the Asia and Monday ladders (`js/asiaFibAtlasRoutes.js` and
 * `js/mondayFibAtlasRoutes.js`'s own `/vote-portfolio` routes) since the two
 * engines' trade objects share Level Atlas's own field shape by design (see
 * asiaFibAtlasVoteReview.js's header) and the combination math has nothing
 * engine-specific in it.
 *
 * This is a deliberate, from-scratch extraction of `js/levelAtlasRoutes.js`'s
 * own `/api/level-atlas/vote-portfolio` route body — same computation, same
 * query-param contract, same response shape — NOT an in-place refactor of
 * that route. Level Atlas's own route is large, working, and carries its own
 * OOS-validated correlated-risk warnings (level-atlas-vote-portfolio.html);
 * migrating it to call this shared function too is a real future unification
 * (flagged in LEGO_MODULES.md as a known, intentional duplication candidate)
 * but was judged riskier than helpful to do in the same change that adds a
 * NEW consumer — better to prove this extraction against Asia+Monday first.
 *
 * Deliberately NOT included here: `applyFadeStopTightening` — a Level-Atlas-
 * specific, separately OOS-validated feature (its own stop-tightening
 * percentile study, `scripts/oos_validate_fade_stop.mjs`) with no equivalent
 * study run for the fib-ladder engines yet. Adding it here would mean
 * silently assuming it transfers, which hasn't been checked.
 *
 * `loadPairVoteTrades(pair)` is the one thing callers must supply — an async
 * function returning the stored `{instrument, trades, cost, ...}` blob for
 * one pair (or null), so this module has no opinion on WHERE that blob lives
 * (Asia's `asia-fib-atlas/{pair}-votetrades.json` vs Monday's
 * `monday-fib-atlas/{pair}-votetrades.json` — same R2 shape, different prefix).
 */
// tradeFactors (2026-09-26 addition to this file's own usage, not to
// levelAtlasVoteReview.js itself): verified its internal betDirection
// ALREADY handles Fib Atlas's 'above'/'below' vocabulary correctly
// (`isUp = side==='up' || side==='above'`), matching this file's own
// tradeDirection() on all 4 side/decision combinations -- confirmed by hand
// before reusing it, given this exact "reused a Level-Atlas direction
// helper that silently mismapped Fib Atlas's vocabulary" is the precise bug
// this session already found and fixed once (fibAtlasZonePricer.js).
import {
  applyConcurrencyCap, buildPortfolioDailySeries, inverseVolWeights,
  riskAdjustTrades, applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopFraction,
  applyCostEfficiencyFilter, applyGapFilter, applyStoredContinuationExit, tradeFactors,
} from './levelAtlasVoteReview.js';
// applyClearanceFilter is Fib-Atlas-owned (asiaFibAtlasVoteReview.js), NOT
// the shared levelAtlasVoteReview.js above — see that function's own doc
// for why (a pure, generic gate duplicated here rather than added to the
// Vote-Atlas-shared file, which this workstream never edits).
import { applyClearanceFilter } from './asiaFibAtlasVoteReview.js';
import { maxDrawdownFromPnls, neweyWestSharpe, summarizeTrades } from './metricsCore.js';
import { portfolioStats, deflatedSharpe } from './backtestStats.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Real $-per-pip-per-standard-lot table (pylego/point_values.json -- the
// SAME data the live Python bots' own position sizing reads, "Canonical
// set = regime_bot == RegimeV2"), read directly rather than duplicated, so
// this can never silently drift from what live sizing actually uses.
const _POINT_VALUES = (() => {
  try {
    const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pylego', 'point_values.json');
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch { return { default: 10, values: {} }; }
})();
function pipValuePerLot(pair) {
  const key = String(pair || '').toLowerCase().replace(/\s*\(.*\)$/, ''); // strip " (Asia)"/" (Monday)" groupKey suffix
  return _POINT_VALUES.values[key] ?? _POINT_VALUES.default;
}

// portfolioStats' own maxDD/cagr/calmar assume reinvestment (compounding).
// riskAdjustTrades never actually compounds — every trade risks a CONSTANT
// riskPct of the ORIGINAL notional — so the honest complement is an ADDITIVE
// (non-reinvested) drawdown/return on the same series. Same reasoning and
// same two Tier-1 bricks (`maxDrawdownFromPnls`, arithmetic-mean annualising)
// levelAtlasRoutes.js's own `/vote-portfolio` route already uses.
export function withNonCompoundedDD(statsObj, dailyReturns) {
  const maxDDNonCompounded = +maxDrawdownFromPnls(dailyReturns).toFixed(2);
  const years = dailyReturns.length / 252;
  const cagrNonCompounded = years > 0 ? +(dailyReturns.reduce((s, r) => s + r, 0) / years).toFixed(2) : 0;
  const calmarNonCompounded = maxDDNonCompounded < 0 ? +(cagrNonCompounded / Math.abs(maxDDNonCompounded)).toFixed(2) : 0;
  return { ...statsObj, maxDDNonCompounded, cagrNonCompounded, calmarNonCompounded };
}

// Real vote atlas convention: fade flips direction relative to which side
// of the range the rung sits on, follow keeps it -- same logic as
// js/fibAtlasDriftAudit.js's fibBetDirection, re-derived here (not imported)
// because that file pulls in R2/KV-touching modules this one must stay free
// of (buildFibAtlasVotePortfolio is called from a route, but the trade rows
// it receives are already plain data by that point).
function tradeDirection(t) {
  const contSign = t.side === 'above' ? 1 : -1;
  const dirSign = t.decision === 'fade' ? -contSign : contSign;
  return dirSign > 0 ? 'long' : 'short';
}

/**
 * simulateSharedAccount(trades, opts) — ONE real account, chronologically
 * simulated, instead of the fictional "every pair gets its own pre-split
 * capital slice" (NAV split) or "every trade risks a % of a NEVER-updated
 * original balance regardless of what else is open" (fixed-risk, this
 * file's own default mode) assumptions every other stat on this page makes.
 * Built 2026-09-26, direct owner ask: the live bot trades ALL these pairs
 * out of ONE MT5 account balance, subject to real concurrency limits
 * (max_open, and a hedge-only cap of 1 position per (pair,ladder,direction)
 * — see fib_atlas_bot/engine.py's occupied_directions) — a portfolio
 * "backtest" that never enforces either of those isn't simulating the same
 * thing the live bot actually does, so it can't be used to sanity-check it.
 *
 * Event-driven: every trade contributes an OPEN event (checks real
 * concurrency, reserves a slot, sizes its risk off the CURRENT balance at
 * that instant) and a RESOLVE event (releases the slot, applies that
 * reserved dollar risk × rMultiple to the balance) processed in true
 * chronological order — not a daily-pooled approximation. A signal that
 * arrives while the account is already at its concurrency limit is
 * genuinely SKIPPED, exactly like the live bot would reject it, not
 * silently given its own fictional capital anyway.
 *
 * `trades` must carry: time, resolveTime, pair, ladder, side, decision,
 * rMultiple (risk-invariant — see riskAdjustTrades) — i.e. the SAME rows
 * buildFibAtlasVotePortfolio already builds before any sizing scheme is
 * applied.
 *
 * `compounding` (default false): position size is a fixed % of the STARTING
 * capital, never the ever-growing current balance — the SAME "fixed-risk,
 * non-reinvested" convention this page's own existing cards already settled
 * on as the trustworthy one ("This matches how the engine actually sizes
 * trades... the honest, decision-relevant numbers"). Confirmed live
 * 2026-09-26 this matters here too, not just for the daily-pooled CAGR:
 * compounding 0.5% of a GROWING balance across ~12,000 trades over 5 years
 * turned $100k into $42 BILLION — the exact "mechanically explodes, not
 * evidence of anything" trap this page already warns about elsewhere,
 * reproduced by this simulation's first draft. `finalBalance`/`equityCurve`
 * still track the REAL evolving balance either way (concurrency/hedge
 * rejection always uses real, current state) — only whether NEW risk is
 * sized off that growing number or held fixed is what this toggles.
 *
 *   simulateSharedAccount(trades, { startingCapital=100000, riskPct=0.5,
 *     maxOpen=20, maxOpenRiskPct=0, compounding=false }) ->
 *     { finalBalance, totalReturnPct, maxDDPct, trades: n, skippedForConcurrency,
 *       equityCurve: [{time, balance}], sharpe, profitFactor, winRate, ... }
 */
export function simulateSharedAccount(trades, {
  startingCapital = 100000, riskPct = 0.5, maxOpen = 20,
  // Real risk-budget cap (mirrors fib_atlas_bot's own max_open_risk_pct) --
  // 0 = off, matching that bot's own default. When set, an open ALSO gets
  // rejected if the SUM of every currently-open position's reserved risk %
  // would exceed this, regardless of position COUNT — the actual thing
  // "out of a total combined pot" cares about, not just a headcount.
  maxOpenRiskPct = 0,
  compounding = false,
  // Real margin capacity (2026-09-26, direct owner ask -- confirmed live
  // that maxOpenRiskPct barely binds: risk-at-stop is small per trade even
  // with several open, but MARGIN is about NOTIONAL exposure, not risk, and
  // a tight-stop trade can need a large position size -- hence large margin
  // -- to hit even a small dollar risk. This is the constraint that was
  // actually missing. `leverage` (default 30, the UK/EU retail cap for
  // major FX -- indices/gold often get LESS in practice, so this is a
  // generous, not conservative, assumption) and `maxMarginUsePct` (default
  // 50% of the sizing basis, leaving headroom before a real margin call)
  // together cap total notional exposure across every open position.
  // pip-value-per-lot comes straight from pylego/point_values.json -- the
  // SAME table the live Python bots' own sizing reads.
  leverage = 30, maxMarginUsePct = 50,
  // Real currency-correlation cap (2026-09-26) -- the page's own text has
  // always warned that EURUSD/EURGBP/EURJPY aren't independent bets (they
  // all carry EUR), but nothing in this simulation enforced it: the hedge
  // cap only stops the SAME pair+direction stacking, margin only caps total
  // notional regardless of WHICH currencies it's in. Five different EUR-long
  // crosses open at once pass every check so far but are one real EUR move
  // away from behaving like a single, much bigger position. Reuses
  // levelAtlasVoteReview.js's own tradeFactors (FX -> signed base/quote
  // legs, gold -> XAU, the 6 indices -> one shared EQUITY_RISK factor) for
  // the factor decomposition, but weights each leg by REAL notional (this
  // function's own `marginFor` math), not tradeFactors' own riskPctUsed-based
  // weight, to stay on the same $ basis as the margin/risk checks above.
  maxNetExposurePct = 30,
} = {}) {
  if (!trades?.length) return null;
  const withDir = trades
    .filter(t => t.time != null && t.resolveTime != null && Number.isFinite(t.rMultiple))
    .map(t => ({ ...t, direction: tradeDirection(t) }));
  if (!withDir.length) return null;

  // Event queue: 'open' before 'resolve' on an exact time tie (a trade
  // can't free its own slot before it's even reserved it).
  const events = [];
  for (const t of withDir) {
    events.push({ type: 'open', time: t.time, t });
    events.push({ type: 'resolve', time: t.resolveTime, t });
  }
  events.sort((a, b) => a.time - b.time || (a.type === 'open' ? -1 : 1));

  let balance = startingCapital;
  const open = new Map();      // trade -> { dirKey, dollarRisk }
  const openDirKeys = new Set(); // "pair|ladder|direction" currently occupied (hedge-only, 1 each)
  const closedPnls = [];       // realized $ pnl, in event order
  const equityCurve = [{ time: events[0]?.time ?? 0, balance }];
  let peak = balance, maxDD = 0, maxConcurrentOpen = 0;
  let skippedConcurrency = 0, skippedHedge = 0, taken = 0;

  // Sizing reference: the ever-growing real `balance` only when `compounding`
  // is explicitly requested; otherwise the fixed starting capital, same
  // basis for BOTH the per-trade risk size and the risk-budget check below
  // (mixing a fixed numerator with a moving denominator would make
  // `maxOpenRiskPct` mean something different tick to tick).
  const sizingBasis = () => compounding ? balance : startingCapital;
  const openRiskPct = () => {
    let sum = 0;
    for (const { dollarRisk } of open.values()) sum += dollarRisk;
    const basis = sizingBasis();
    return basis > 0 ? (sum / basis) * 100 : 0;
  };
  let openMarginTotal = 0;
  let skippedMargin = 0, maxMarginUsedSeen = 0, skippedExposure = 0;

  // Real position size in lots, from the SAME dollar risk every other check
  // here uses -- a tighter stop needs MORE lots to hit the same dollar risk,
  // which is exactly why a risk-% cap alone (openRiskPct above) can pass
  // while the real margin required cannot: risk-at-stop and notional
  // exposure are different things, and only the second one is what a
  // broker's margin call actually watches.
  function notionalFor(t, dollarRisk) {
    const stopPipsForSizing = t.sizingStopPips ?? t.stopPips;
    const pip = t.pip, entry = t.entry;
    if (!(stopPipsForSizing > 0) || !(pip > 0) || !(entry > 0)) return 0;
    const pipVal = pipValuePerLot(t.pair);
    const lots = dollarRisk / (stopPipsForSizing * pipVal);
    const lotSize = pipVal / pip; // recovers ~100,000 base-currency units/lot for a typical FX pair
    return lots * lotSize * entry;
  }

  const netExposure = new Map(); // factor (e.g. 'EUR', 'XAU', 'EQUITY_RISK') -> signed $ notional from OPEN positions
  // tradeFactors needs `pair` unsuffixed/uppercased (it does its own
  // .toUpperCase(), but the " (Asia)"/" (Monday)" combined-mode groupKey
  // suffix would become part of the "pair" string and never match
  // CCY_LEGS/EQUITY_RISK_SET, silently falling through to a useless
  // synthetic per-(pair+ladder) factor instead of the real currency) --
  // stripped the same way pipValuePerLot already does.
  function factorsFor(t) {
    const cleanPair = String(t.pair || '').replace(/\s*\(.*\)$/, '');
    return tradeFactors({ ...t, pair: cleanPair });
  }

  for (const ev of events) {
    if (ev.type === 'open') {
      const dirKey = `${ev.t.pair}|${ev.t.ladder ?? ''}|${ev.t.direction}`;
      // Hedge-only cap: fib_atlas_bot's own occupied_directions() rule --
      // max ONE open position per (pair, ladder, direction) at a time.
      if (openDirKeys.has(dirKey)) { skippedHedge++; continue; }
      if (open.size >= maxOpen) { skippedConcurrency++; continue; }
      const basis = sizingBasis();
      const dollarRisk = basis * (riskPct / 100);
      if (maxOpenRiskPct > 0 && openRiskPct() + (basis > 0 ? (dollarRisk / basis) * 100 : 0) > maxOpenRiskPct + 1e-9) {
        skippedConcurrency++; continue;
      }
      const notional = notionalFor(ev.t, dollarRisk);
      const margin = notional / leverage;
      if (maxMarginUsePct > 0 && basis > 0 && ((openMarginTotal + margin) / basis) * 100 > maxMarginUsePct + 1e-9) {
        skippedMargin++; continue;
      }
      // Currency-correlation cap: reject only if THIS trade's own factor(s)
      // would breach the limit -- an offsetting trade (opposite sign on that
      // factor, e.g. long EURUSD after already being short EURGBP) is free
      // to add even while the account is heavily exposed elsewhere; a
      // same-sign stack (5 different EUR-long crosses) is what this targets.
      // Tracked in MARGIN-equivalent terms (notional/leverage), the SAME
      // units as maxMarginUsePct above -- raw notional is always several
      // multiples of equity under any real leverage, so comparing it
      // directly against a 30%-of-equity cap would reject nearly every
      // single trade outright (confirmed live: first draft did exactly
      // this, 11,685 of 12,488 trades rejected on their very first check).
      const factors = factorsFor(ev.t);
      if (maxNetExposurePct > 0 && basis > 0 && factors.some(f => {
        const sign = f.weight >= 0 ? 1 : -1;
        const current = netExposure.get(f.factor) ?? 0;
        return Math.abs(current + sign * margin) / basis * 100 > maxNetExposurePct + 1e-9;
      })) {
        skippedExposure++; continue;
      }
      open.set(ev.t, { dirKey, dollarRisk, margin, notional, factors });
      openDirKeys.add(dirKey);
      openMarginTotal += margin;
      if (openMarginTotal > maxMarginUsedSeen) maxMarginUsedSeen = openMarginTotal;
      for (const f of factors) netExposure.set(f.factor, (netExposure.get(f.factor) ?? 0) + (f.weight >= 0 ? 1 : -1) * margin);
      taken++;
      if (open.size > maxConcurrentOpen) maxConcurrentOpen = open.size;
    } else {
      const reserved = open.get(ev.t);
      if (!reserved) continue; // never actually opened (rejected above)
      open.delete(ev.t);
      openDirKeys.delete(reserved.dirKey);
      openMarginTotal -= reserved.margin;
      for (const f of reserved.factors) netExposure.set(f.factor, (netExposure.get(f.factor) ?? 0) - (f.weight >= 0 ? 1 : -1) * reserved.margin);
      const pnl = reserved.dollarRisk * ev.t.rMultiple;
      balance += pnl;
      closedPnls.push({ time: ev.time, pnl, pnlPct: (pnl / (balance - pnl)) * 100 });
      equityCurve.push({ time: ev.time, balance: +balance.toFixed(2) });
      if (balance > peak) peak = balance;
      const dd = ((balance - peak) / peak) * 100;
      if (dd < maxDD) maxDD = dd;
    }
  }

  const wins = closedPnls.filter(c => c.pnl > 0), losses = closedPnls.filter(c => c.pnl <= 0);
  const grossWin = wins.reduce((s, c) => s + c.pnl, 0), grossLoss = Math.abs(losses.reduce((s, c) => s + c.pnl, 0));
  const pnlPcts = closedPnls.map(c => c.pnlPct);
  const mean = pnlPcts.length ? pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length : 0;
  const sd = pnlPcts.length > 1 ? Math.sqrt(pnlPcts.reduce((a, b) => a + (b - mean) ** 2, 0) / pnlPcts.length) : 0;
  const years = closedPnls.length ? (closedPnls.at(-1).time - closedPnls[0].time) / (365.25 * 86400) : 0;
  const perTradeSharpe = sd > 1e-9 ? mean / sd : 0;
  const tradesPerYr = years > 0 ? closedPnls.length / years : 0;

  return {
    startingCapital, finalBalance: +balance.toFixed(2),
    totalReturnPct: +(((balance - startingCapital) / startingCapital) * 100).toFixed(2),
    maxDDPct: +maxDD.toFixed(2),
    tradesOffered: withDir.length, tradesTaken: taken,
    skippedConcurrency, skippedHedge, skippedMargin, skippedExposure,
    winRate: closedPnls.length ? +((wins.length / closedPnls.length) * 100).toFixed(1) : 0,
    profitFactor: grossLoss > 1e-9 ? +(grossWin / grossLoss).toFixed(3) : (grossWin > 0 ? Infinity : 0),
    // Real, annualized off actual trade FREQUENCY (not calendar days) --
    // honest for a concurrency-capped, event-driven series where "days" and
    // "trades" no longer line up the way a daily-pooled series assumes.
    sharpe: +(perTradeSharpe * Math.sqrt(tradesPerYr)).toFixed(2),
    tradesPerYr: +tradesPerYr.toFixed(1),
    equityCurve,
    maxConcurrentOpenSeen: maxConcurrentOpen,
    leverage, maxMarginUsePct,
    maxMarginUsedPctSeen: startingCapital > 0 ? +((maxMarginUsedSeen / startingCapital) * 100).toFixed(1) : 0,
    maxNetExposurePct,
  };
}

/**
 * buildFibAtlasVotePortfolio(opts) -> the full /vote-portfolio response body,
 * or { error } if no pair had data.
 *
 * opts: { pairs, minMargin=2, maxConcurrent=1, perDirection=false,
 *   weighting='equal'|'inverse-vol', sizing='fixed-risk'|'nav', riskPct=1,
 *   maxHeatPct=null, targetVol=10, throttleOn=false, triggerDD=-5,
 *   restoreDD=0, throttleMult=0.5, stopTightenFrac=null, minClearancePips=null,
 *   loadPairVoteTrades }
 *
 * `minClearancePips` (2026-09-15): a pure SELECTION gate (drops trades
 * outright, resizes nothing) — drops any touch whose own triggering bar
 * cleared the rung by less than this many pips (`clearancePips`, set at
 * walk time by asiaFibAtlasWalk/mondayFibAtlasWalk). Direct owner ask after
 * a live-vs-backtest reconciliation traced two "phantom" backtest trades to
 * touches that cleared their rung by 0.2-0.3 pips — thinner than live tick
 * polling OR a resting limit order could realistically be expected to
 * catch. Measured separately (analysis/fib_atlas_limit_order_clearance_
 * test.mjs) across the full live universe: median clearance under 1 pip,
 * and Sharpe/PF/CAGR collapse sharply as the threshold tightens even though
 * win rate barely moves — a large share of the unfiltered book's headline
 * numbers rides on touches unlikely to be reliably achievable by ANY
 * execution method. Applied at the same selection-gate stage as
 * minCostRatio/maxGapMin (before the concurrency cap). `null` (default) is
 * a no-op passthrough, so every existing caller is unaffected until it
 * opts in.
 *
 * `stopTightenFrac` (2026-08-29): validated by analysis/
 * fib_atlas_sl_tightening_backtest.mjs (see LEGO_MODULES.md) — tightens FADE
 * decisions' stop to this fraction of their native distance (e.g. 0.9),
 * leaving follow trades untouched. Applied AFTER each constituent's own
 * concurrency cap (same order the validating backtest used), BEFORE risk-
 * adjustment/heat-cap/throttle — a no-op when null/1, so every existing
 * caller is unaffected.
 *
 * `minCostRatio` (2026-08-30): validated by analysis/
 * fib_atlas_cost_efficiency_filter.mjs (see LEGO_MODULES.md) — a pure
 * SELECTION gate (drops trades outright, resizes nothing), so applied
 * BEFORE the concurrency cap (a filtered-out trade should never occupy a
 * concurrency slot either — matches the order the validating backtest
 * used). `null`/`<=1` is a no-op passthrough.
 *
 * `continuationExit` (2026-08-30, generalized 2026-08-31 for the chandelier
 * exit): `'giveback'`/`true` swaps in the PRE-COMPUTED `trailedPnlPct`/
 * `trailedResolveTime` fields (the original givebackFrac=0.02 trail,
 * analysis/fib_atlas_trailing_continuation_backtest.mjs); `'chandelier'`
 * swaps in `chandTrailedPnlPct`/`chandTrailedResolveTime` instead (the
 * ATR-trailed variant, each ladder's own frozen `chandelierMult` —
 * analysis/fib_atlas_chandelier_exit_backtest.mjs, a real OOS drawdown
 * win on both ladders, see LEGO_MODULES.md). Both are baked into the
 * stored trade JSON at generation time (this lever needs real M1 access —
 * see `applyTrailingContinuation`'s own doc), for `win===true` rows on
 * both fade and follow. Applied via `applyStoredContinuationExit` (which
 * does the string/boolean interpreting — this function just passes the
 * value straight through), BEFORE the concurrency cap — the trailed
 * (possibly longer) `resolveTime` must be in place before that function
 * decides which trades survive the per-pair cap, or a trade the corrected
 * occupancy window would block could slip through on its original, shorter
 * window. `false`/omitted (default) is a no-op passthrough.
 */
export async function buildFibAtlasVotePortfolio({
  pairs, minMargin = 2, maxConcurrent = 1, perDirection = false,
  weighting = 'equal', sizing = 'fixed-risk', riskPct = 1,
  maxHeatPct = null, targetVol = 10,
  throttleOn = false, triggerDD = -5, restoreDD = 0, throttleMult = 0.5,
  stopTightenFrac = null, minCostRatio = null, maxGapMin = null, continuationExit = false,
  minClearancePips = null,
  // Real shared-account simulation (2026-09-26) -- see simulateSharedAccount's
  // own doc. Independent of every OTHER sizing/weighting toggle above (those
  // stay exactly as they were, for anyone still comparing against prior
  // numbers) -- this is an ADDITIONAL, separately-reported view answering
  // "what would ONE real account, with real concurrency limits, actually
  // have done," not a replacement for the existing stats.
  startingCapital = 100000, realAccountRiskPct = 0.5, maxOpen = 20, maxOpenRiskPct = 0,
  leverage = 30, maxMarginUsePct = 50, maxNetExposurePct = 30,
  loadPairVoteTrades,
}) {
  // Each iteration is one "constituent" of the combined portfolio — normally
  // one pair (groupKey defaults to the R2 blob's own `instrument`), but a
  // caller combining Asia+Monday on the SAME pair can have `loadPairVoteTrades`
  // return a distinct `groupKey` (e.g. "EURUSD (Asia)"/"EURUSD (Monday)") and
  // a `ladder` tag per stored blob — everything below (concurrency cap, heat
  // cap, weighting, stats) already treats "constituent" generically, so two
  // ladders on one pair combine exactly like two different pairs do, with
  // zero new math. `groupKey` is optional and unused by the existing
  // single-ladder routes, so this is fully backward compatible.
  const perPairTradesRaw = {}, perPair = {}, missing = [];
  for (const pair of pairs) {
    const stored = await loadPairVoteTrades(pair);
    if (!stored) { missing.push(pair.toUpperCase()); continue; }
    // Continuation-exit swap MUST happen before applyConcurrencyCap -- that
    // function decides survivors off `resolveTime`, and the trailed
    // (possibly longer) occupancy window has to be in place before that
    // decision, not applied after. See applyStoredContinuationExit's own doc.
    const swapped = applyStoredContinuationExit(stored.trades, continuationExit);
    const marginFiltered = swapped.filter(t => t.margin >= minMargin);
    const costFiltered = applyCostEfficiencyFilter(marginFiltered, stored.cost, minCostRatio);
    // Whiplash gap filter (2026-09-04) — a pure selection gate exactly like
    // applyCostEfficiencyFilter above, so applied at the same stage (before
    // the concurrency cap — a gap-filtered-out trade should never occupy a
    // concurrency slot either).
    const gapFiltered = applyGapFilter(costFiltered, maxGapMin);
    // Minimum-clearance filter (2026-09-15) — same selection-gate stage as
    // cost-efficiency/gap above, same reasoning (a filtered-out trade should
    // never occupy a concurrency slot). See applyClearanceFilter's own doc
    // for why this exists: a large share of this book's trade volume rides
    // on touches that cleared their rung by well under a pip, thin enough
    // that no real execution method was likely to catch them reliably.
    const filtered = applyClearanceFilter(gapFiltered, minClearancePips);
    const capped = applyConcurrencyCap(filtered, { maxConcurrent, perDirection });
    const tightened = applyFadeStopFraction(capped?.kept ?? [], stopTightenFrac, 0, { preserveSizing: true });
    const sym = stored.groupKey ?? stored.instrument;
    perPairTradesRaw[sym] = tightened.map(t => ({ ...t, instrument: stored.instrument, ladder: stored.ladder ?? null }));
    perPair[sym] = {
      totalDecided: marginFiltered.length,
      // Now reflects BOTH the cost-efficiency and gap filters combined
      // (2026-09-04) — the two run back-to-back as independent selection
      // gates, so there's no meaningful way to attribute a dropped trade to
      // one or the other individually here.
      costFilteredOut: marginFiltered.length - filtered.length,
      kept: capped?.kept?.length ?? 0,
      skipped: capped?.skippedCount ?? 0,
      ownWinRate: capped?.keptSummary?.winRate ?? null,
    };
  }
  if (!Object.keys(perPairTradesRaw).length) return { error: `no vote-backtest data for any of: ${pairs.join(',')}`, missing };

  // rMultiple is invariant to sizing scheme; pnlPct only gets REPLACED by the
  // risk-scaled figure in fixed-risk mode — same reasoning as
  // levelAtlasRoutes.js's own route.
  const perPairTradesForStats = {};
  for (const sym of Object.keys(perPairTradesRaw)) {
    const adjusted = riskAdjustTrades(perPairTradesRaw[sym], riskPct);
    const withPair = (sizing === 'fixed-risk' ? adjusted : perPairTradesRaw[sym].map((t, i) => ({ ...t, rMultiple: adjusted[i].rMultiple })))
      .map(t => ({ ...t, pair: sym }));
    perPairTradesForStats[sym] = withPair;
  }

  // ownSharpe uses the SAME daily-return-series Sharpe as the combined
  // portfolio (portfolioStats), not a per-trade-annualized one — see
  // levelAtlasRoutes.js's own comment for why mixing the two methods would
  // make part of the apparent diversification benefit a methodology switch.
  for (const sym of Object.keys(perPairTradesForStats)) {
    const solo = buildPortfolioDailySeries({ [sym]: perPairTradesForStats[sym] });
    perPair[sym].ownSharpe = solo ? portfolioStats(solo.dailyReturns, { mc: false, targetVol }).sharpe : null;
  }

  // Cross-pair portfolio heat cap — applied AFTER each pair's own cap, on the
  // merged, globally-chronological trade list. Fixed-risk mode only (NAV
  // mode's weight fractions already cap total exposure at 100% by construction).
  let perPairTradesFinal = perPairTradesForStats;
  let heatCap = null;
  if (maxHeatPct) {
    const heatResult = applyPortfolioHeatCap(perPairTradesForStats, { maxHeatPct });
    if (heatResult) {
      const byPair = {};
      for (const t of heatResult.kept) (byPair[t.pair] ??= []).push(t);
      perPairTradesFinal = byPair;
      heatCap = { maxHeatPct, skippedCount: heatResult.skippedCount, totalCount: heatResult.totalCount };
      for (const sym of Object.keys(perPair)) perPair[sym].keptAfterHeat = byPair[sym]?.length ?? 0;
    }
  }

  const buildWeights = perPairTrades => sizing === 'fixed-risk'
    ? Object.fromEntries(Object.keys(perPairTrades).map(p => [p, 1]))
    : (weighting === 'inverse-vol' ? inverseVolWeights(perPairTrades) : null);

  const weights = buildWeights(perPairTradesFinal);
  const combined = buildPortfolioDailySeries(perPairTradesFinal, weights ? { weights } : {});
  const statsBeforeThrottle = portfolioStats(combined.dailyReturns, { mc: false, targetVol });

  let throttle = null, dailyReturnsFinal = combined.dailyReturns, datesFinal = combined.dates;
  let stats = withNonCompoundedDD(statsBeforeThrottle, combined.dailyReturns), statsNoThrottle = null;
  if (throttleOn) {
    const tr = applyDrawdownThrottle(combined.dailyReturns, combined.dates, { triggerDD, restoreDD, throttleMult });
    if (tr) {
      dailyReturnsFinal = tr.dailyReturns;
      stats = withNonCompoundedDD(portfolioStats(dailyReturnsFinal, { mc: false, targetVol }), dailyReturnsFinal);
      statsNoThrottle = withNonCompoundedDD(statsBeforeThrottle, combined.dailyReturns);
      throttle = { triggerDD, restoreDD, throttleMult, daysThrottled: tr.state.filter(s => s.throttled).length, totalDays: tr.state.length };
    }
  }

  // sharpeHAC (2026-08-30) — the owner spotted this page showing Sharpe >10
  // in production and correctly didn't trust it. That naive daily Sharpe
  // assumes independent daily returns; real Fib Atlas data shows real
  // positive autocorrelation (confirmed: naive daily Sharpe collapses from
  // ~8.6-10.7 to ~4.9-8 once corrected, and keeps declining at even wider
  // correction windows without a clear plateau — see LEGO_MODULES.md for
  // the full investigation). Uses Newey-West's OWN rule-of-thumb bandwidth
  // (not hand-picked to match any particular finding) — this is ONE
  // reasonable, defensible correction, not the final word: the
  // investigation found the "true" number is sensitive to how much serial
  // dependence you correct for, and even the most aggressive correction
  // tested still left an elevated, unexplained residual. Report both
  // numbers; never treat the naive one alone as trustworthy.
  stats = { ...stats, sharpeHAC: neweyWestSharpe(dailyReturnsFinal, 252) };

  let statsUncapped = null;
  if (heatCap) {
    const weightsUncapped = buildWeights(perPairTradesForStats);
    const combinedUncapped = buildPortfolioDailySeries(perPairTradesForStats, weightsUncapped ? { weights: weightsUncapped } : {});
    let uncappedReturns = combinedUncapped.dailyReturns;
    if (throttleOn) {
      const trU = applyDrawdownThrottle(uncappedReturns, combinedUncapped.dates, { triggerDD, restoreDD, throttleMult });
      if (trU) uncappedReturns = trU.dailyReturns;
    }
    statsUncapped = withNonCompoundedDD(portfolioStats(uncappedReturns, { mc: false, targetVol }), uncappedReturns);
  }

  const naiveAvgSharpe = (() => {
    const ss = Object.values(perPair).map(p => p.ownSharpe).filter(v => v != null);
    return ss.length ? +(ss.reduce((a, b) => a + b, 0) / ss.length).toFixed(3) : null;
  })();

  const totalKept = Object.values(perPair).reduce((a, p) => a + p.kept, 0);
  for (const sym of Object.keys(perPair)) {
    perPair[sym].weight = combined.byPair[sym]?.weight ?? 0;
    perPair[sym].tradeShare = totalKept > 0 ? +(perPair[sym].kept / totalKept).toFixed(4) : 0;
  }

  const trades = Object.entries(perPairTradesFinal).flatMap(([sym, list]) =>
    list.map(t => ({ ...t, weight: perPair[sym].weight }))
  ).sort((a, b) => a.time - b.time);

  // Walk-forward OOS view (2026-08-31) -- the 3 non-overlapping expanding-
  // window folds validated this session (analysis/fib_atlas_*_pooled_oos.mjs;
  // LEGO_MODULES.md's 2026-08-31 follow-ups) each test on the slice
  // immediately AFTER their own fit window; those 3 test windows are
  // contiguous and non-overlapping, so their union is simply "the most
  // recent 60% of history by date" -- mathematically identical to pooling
  // all 3 folds' own held-out test performance, without re-running the
  // fold/fit machinery here (the shipped params are already fixed by the
  // request; this only re-slices the SAME computed trades/daily series to
  // the honest evaluation window, it doesn't re-derive anything). Reports
  // BOTH bases -- day-pooled portfolio Sharpe AND per-trade Sharpe/PF/win
  // rate via the same summarizeTrades brick as the dashboard's per-trade
  // card -- since this session's own investigation found they can disagree
  // for a trade-count-changing lever; showing only one would repeat that
  // exact mistake on the very card meant to fix it.
  let walkForwardOOS = null;
  if (datesFinal.length >= 10) {
    const cutoffIdx = Math.floor(datesFinal.length * 0.4);
    const cutoffDate = datesFinal[cutoffIdx];
    const oosReturns = dailyReturnsFinal.slice(cutoffIdx);
    const oosDayStats = withNonCompoundedDD(portfolioStats(oosReturns, { mc: false, targetVol }), oosReturns);
    const oosTrades = trades.filter(t => t.date >= cutoffDate);
    let perTrade = null;
    if (oosTrades.length) {
      const sorted = oosTrades.slice().sort((a, b) => a.resolveTime - b.resolveTime);
      const base = summarizeTrades(sorted.map(t => t.pnlPct), sorted.map(t => t.date));
      const rawTradeSharpe = base.tradesPerYr > 0 ? base.sharpe / Math.sqrt(base.tradesPerYr) : base.sharpe;
      perTrade = {
        trades: oosTrades.length, winRate: base.winRate, profitFactor: base.profitFactor,
        rawTradeSharpe: +rawTradeSharpe.toFixed(3), annualizedSharpe: base.sharpe, sharpeSE: base.sharpeSE,
        tradesPerYr: base.tradesPerYr,
      };
    }
    walkForwardOOS = { cutoffDate, days: oosReturns.length, dayPooled: oosDayStats, perTrade };
  }

  return {
    pairs: Object.keys(perPairTradesForStats), missing, minMargin, maxConcurrent, perDirection, weighting,
    sizing, riskPct, heatCap, targetVol, throttle,
    stats, statsUncapped, statsNoThrottle, naiveAvgSharpe, days: datesFinal.length,
    equityCurve: datesFinal.map((d, i) => ({ date: d, dailyReturn: dailyReturnsFinal[i] })),
    perPair, trades, walkForwardOOS,
    // Real shared-account simulation -- uses the SAME final trade list every
    // other stat on this page is built from (post margin/cost/gap/clearance/
    // concurrency-cap/stop-tightening filters), so it's an honest alternate
    // view of the identical population, not a different backtest.
    realAccountSim: simulateSharedAccount(trades, { startingCapital, riskPct: realAccountRiskPct, maxOpen, maxOpenRiskPct, leverage, maxMarginUsePct, maxNetExposurePct }),
  };
}

/**
 * Deflated Sharpe Ratio for a Fib Atlas vote-portfolio call (2026-09-06) —
 * López de Prado's multiple-testing correction, applied to the ACTUAL
 * levers this page lets a caller toggle. Owner's own concern after seeing a
 * day-pooled Sharpe of 16+: is this just the best of everything we tried?
 *
 * `trialSRs` here is a real, principled LOCAL sensitivity sweep, not a
 * fabricated trial count: for each of the six levers this page exposes
 * (stopTightenFrac, minCostRatio, maxGapMin, maxConcurrent, perDirection,
 * continuationExit), one trial with THAT lever alone flipped to its natural
 * alternate value, everything else held at the chosen config. This is
 * deliberately NOT the full combinatorial search space (2^6 = 64+ combos —
 * intractable to run on every button click, and most of that space was
 * never actually explored during validation either) — it answers "how much
 * does the chosen Sharpe wobble under the nearby choices this exact page
 * makes available," which is the honest, tractable version of the question
 * for an interactive tool. `altValues` supplies each ladder's own frozen
 * "on" value (FIB_ATLAS_STOP_TIGHTEN_FRAC/MIN_COST_RATIO/MAX_GAP_MIN or
 * their Monday equivalents) so a trial that flips a currently-off lever ON
 * lands on a real, previously-validated setting, not an arbitrary guess.
 *
 * Every trial reuses the SAME `loadPairVoteTrades` the caller passes —
 * pass one backed by an already-populated in-memory cache (see both
 * routes' own `/vote-portfolio` handlers) so this never re-fetches R2 per
 * trial, only re-runs the cheap in-memory filter/aggregation pipeline.
 *
 *   computeFibAtlasDeflatedSharpe(baseOpts, chosenTrades, loadPairVoteTrades, altValues)
 *     -> { dsr, sr, sr0, nTrials, trialSharpeStd } | null
 */
export async function computeFibAtlasDeflatedSharpe(baseOpts, chosenTrades, loadPairVoteTrades, altValues = {}) {
  const chosenPnls = (chosenTrades ?? []).map(t => t.pnlPct * (t.weight ?? 1));
  if (chosenPnls.length < 5) return null;

  const { stopTightenFrac: altStop = 0.9, minCostRatio: altCost = 3, maxGapMin: altGap = 30 } = altValues;
  const flip = (val, alt) => (val == null ? alt : null);

  const trialConfigs = [
    { ...baseOpts, stopTightenFrac: flip(baseOpts.stopTightenFrac, altStop) },
    { ...baseOpts, minCostRatio: flip(baseOpts.minCostRatio, altCost) },
    { ...baseOpts, maxGapMin: flip(baseOpts.maxGapMin, altGap) },
    { ...baseOpts, maxConcurrent: baseOpts.maxConcurrent === 1 ? 2 : 1 },
    { ...baseOpts, perDirection: !baseOpts.perDirection },
    { ...baseOpts, continuationExit: (!baseOpts.continuationExit || baseOpts.continuationExit === 'off') ? 'chandelier' : 'off' },
  ];

  const trialSRs = [];
  for (const cfg of trialConfigs) {
    let r;
    try { r = await buildFibAtlasVotePortfolio({ ...cfg, loadPairVoteTrades }); } catch { continue; }
    if (!r || r.error || !r.trades?.length) continue;
    const pnls = r.trades.map(t => t.pnlPct * (t.weight ?? 1));
    if (pnls.length < 2) continue;
    const m = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const sd = Math.sqrt(pnls.reduce((a, b) => a + (b - m) ** 2, 0) / pnls.length);
    if (sd > 1e-9) trialSRs.push(m / sd);
  }
  if (trialSRs.length < 2) return null;
  return deflatedSharpe(chosenPnls, trialSRs);
}
