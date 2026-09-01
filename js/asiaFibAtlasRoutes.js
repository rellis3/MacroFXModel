/**
 * Asia Fib Atlas — Express routes.
 *
 * Same async-job + R2-persist + fast-live-cache pattern as
 * `js/levelAtlasRoutes.js` (that file's own header applies almost verbatim —
 * a run is expensive (full M1 history), so `POST /run` kicks it off and
 * returns a `jobId`; `GET /status/:jobId` polls; the finished book is ALSO
 * persisted to R2 so a later page load reads it instantly). Reused, not
 * duplicated: `getFastLive`'s bounded-window warm cache, `boundPacked`,
 * `matchLiveContext` (generalized 2026-08-27 with a `keyField` option
 * specifically so this file could reuse it instead of writing a second
 * confidence-matching implementation for a `level`-keyed book).
 *
 * `GET /live/:instrument` and `GET /fastlive/:instrument` serve the FULL
 * TODAY ladder (`asiaFibAtlasLiveLadder` — every fib rung, touched or not,
 * not just today's actual touches) each matched against the stored book's
 * OOS-confirmed dimensions — this is genuinely different from Level Atlas's
 * own `/live`, which only reports rungs already touched. The Asia Fib Atlas
 * ladder is dense (20 rungs per side, 40 total) and mostly untouched on any
 * given day, and the whole point of the live confidence page is "what would
 * happen if price reaches the NEXT rung out", which needs the untouched ones
 * scored too.
 */
import { loadM1ForPair } from './volBacktestM1Engine.js';
import { asiaFibAtlasWalk, asiaFibAtlasLiveLadder, asiaRungBarrierPips } from './asiaFibAtlasEngine.js';
import { buildAsiaFibAtlasBook, renderAsiaFibBookText, DIMENSIONS } from './asiaFibAtlasReport.js';
import { matchLiveContext } from './levelAtlasReport.js';
import { runBarrierWalkForward, voteDecision } from './asiaFibAtlasVoteReview.js';
import { applyFadeStopFraction, applyCostEfficiencyFilter, applyTrailingContinuation, applyStoredContinuationExit } from './levelAtlasVoteReview.js';
import { buildFibAtlasVotePortfolio } from './fibAtlasVotePortfolio.js';
import { cvolSeries, CVOL_PRODUCTS } from './cvolLoader.js';
import { majorEventEpochs } from './calendarLoader.js';
import { putJSON, getJSON } from './r2Store.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { oandaSymbol } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { fetchM1Range } from './volBacktestEngine.js';
import { costForPair } from './perLineStrategy.js';

const ASIA_DIM_LABEL = new Map(DIMENSIONS);

// `matchLiveContext` returns the match/confidence fields (base, lean,
// supports, challenges, context, sameSignOOS) but NOT the original rung's
// own fields (price, distance, touchedToday, ...) at the top level — those
// stay nested under its `liveTouch`. The chart page needs both flattened
// into one row per rung, including rungs the book has no cell for at all
// (a `null` match — new/rare rung, or the book hasn't caught up yet), so
// those still render with a price and a neutral read rather than vanishing.
function scoreLadder(book, ladder) {
  return ladder.map(r => {
    const m = book ? matchLiveContext(book, r, { keyField: 'level', dimLabels: ASIA_DIM_LABEL }) : null;
    if (!m) return { ...r, lean: 'neutral', sameSignOOS: null, base: null, supports: [], challenges: [], context: [] };
    const { liveTouch, ...rest } = m;
    return { ...r, ...rest };
  });
}
const CVOL_PRODUCT_OVERRIDE = { gold: 'XAUUSD' };
const PREFIX = 'asia-fib-atlas';
const DEFAULT_REARM = 0.3;
// Chandelier (ATR-trailed) continuation exit's frozen choice for THIS
// ladder (analysis/fib_atlas_chandelier_exit_backtest.mjs, pre-stated rule:
// maximize IS Sharpe, must beat baseline; see LEGO_MODULES.md) — Monday's
// own mult differs (1.5, see mondayFibAtlasRoutes.js), CHANDELIER_PERIOD
// (M1 bars for the rolling ATR) is shared, not yet independently swept.
const ASIA_CHANDELIER_MULT = 3;
const CHANDELIER_PERIOD = 60;
const LIVE_WINDOW_DAYS = 180;   // same margin Level Atlas uses — comfortably over this engine's own widest lookback (hurstBucket's 80 trailing daily closes)

async function loadIvByDate(pair) {
  const product = CVOL_PRODUCT_OVERRIDE[pair] ?? pair.toUpperCase();
  return CVOL_PRODUCTS.includes(product) ? await cvolSeries(product) : null;
}

// "Let-ride" extended-resolution toggle (2026-08-31) -- shared by
// /vote-portfolio and /vote-portfolio-combined. Swaps in the extTrades
// superset (baseline PLUS previously-'neither'-dropped touches that
// resolved given more time, concurrency-capped at 6am the next day) in
// place of `trades` before handing the blob to buildFibAtlasVotePortfolio,
// which always just reads `.trades` -- zero changes needed there. Falls
// back to `trades` when extTrades is absent (older stored data, a failed
// extended build, or a ladder -- e.g. Monday -- that doesn't produce one
// yet), so a caller can request letRide=true safely regardless.
export async function loadVoteTrades(path, letRide) {
  const stored = await getJSON(path);
  if (!stored) return null;
  if (!letRide) return stored;
  return { ...stored, trades: stored.extTrades ?? stored.trades };
}

const jobs = new Map();
function purgeStale() {
  const cutoff = Date.now() - 2 * 60 * 60_000;
  for (const [id, job] of jobs) if (job.startedAt < cutoff) jobs.delete(id);
}

// Exported (2026-08-27) for scripts/backfill_fib_atlas_vote_trades.mjs — a
// standalone backfill runner that calls this directly instead of going
// through the Express server, so a multi-pair backfill isn't competing with
// server.js's own startup background jobs (forecast auto-warm, volatility
// bot, etc.) for the single Node thread.
export async function runOne(instrument, { onLog = () => {} } = {}) {
  const pair = String(instrument).toLowerCase();
  const sym = String(instrument).toUpperCase();
  onLog(`${sym}: loading M1…`);
  let packed = await loadM1ForPair(pair);
  if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
  // Top up to "now" from OANDA — same brick Level Atlas's own runOne uses —
  // so the live ladder reflects today's actual session, not whenever the
  // parquet snapshot was last synced.
  if (process.env.OANDA_KEY) {
    try {
      const before = packed.n;
      packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), onLog });
      if (packed.n > before) onLog(`${sym}: gap-filled +${(packed.n - before).toLocaleString()} bars to now`);
    } catch (e) { onLog(`${sym}: gap-fill failed (${e.message}) — using stored M1`); }
  }
  const assetClass = assetClassFor(pair);
  const ivByDate = await loadIvByDate(pair);
  const macroEvents = majorEventEpochs();
  onLog(`${sym}: ${packed.n.toLocaleString()} M1 bars, assetClass ${assetClass} — walking the ladder…`);
  const { touches, coverage } = asiaFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM], ivByDate, macroEvents });
  onLog(`${sym}: ${touches.length.toLocaleString()} touch-records, ${coverage?.sessions ?? 0} sessions (${coverage?.from}→${coverage?.to})`);

  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) throw new Error(`${sym}: too few touches to build a book`);

  // "Let-ride" extended-resolution walk (2026-08-31) — direct owner request
  // after asking what happens to touches unresolved by midnight (currently
  // DROPPED entirely, never counted win or loss — js/asiaFibAtlasVoteReview.js's
  // buildBarrierTrades). analysis/fib_atlas_neither_extend_test.mjs (16-pair
  // sweep, LEGO_MODULES.md 2026-08-31) found: given 14 days, 99.8% of these
  // eventually resolve, with a win rate close to the already-counted trades'
  // own; drawdown moves only modestly (-9.00%->-9.48% on the test pipeline).
  // A SECOND full walk (same already-loaded `packed`, no new M1 fetch) with
  // EXTEND_RESOLUTION_DAYS set — stored ALONGSIDE the baseline trades
  // (extTrades/extSummaryByMargin below), not a replacement, same dual-store
  // precedent as chandelier's own trailed fields. NEXT_SESSION_BUILD_HRS
  // caps concurrency occupancy at 6am the following day (matches asiaHrs)
  // regardless of real resolution time, so an extended-but-still-open trade
  // never blocks a fresh touch on the next day's freshly-built Asia range —
  // see asiaFibAtlasWalk's own doc for the full mechanism.
  const EXTEND_RESOLUTION_DAYS = 14, NEXT_SESSION_BUILD_HRS = 6;
  const { touches: extTouches } = asiaFibAtlasWalk(packed, {
    instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM], ivByDate, macroEvents,
    extendResolutionDays: EXTEND_RESOLUTION_DAYS, nextSessionBuildHrs: NEXT_SESSION_BUILD_HRS,
  });
  const extBook = buildAsiaFibAtlasBook(extTouches, { rearmFrac: DEFAULT_REARM });

  // Vote-margin trade list (2026-08-27) — the fade/follow-decided,
  // barrier-priced backtest for the trade-review page (asia-fib-atlas-vote-
  // backtest.html), same persist-separately-from-the-main-book pattern
  // Level Atlas's own runOne uses (one row per OOS-decided touch, kept apart
  // so the page can fetch just this without the full book). Margin can only
  // be 1 or 2 here (js/asiaFibAtlasVoteReview.js's VOTE_DIMS has exactly 2
  // members) — both persisted, the page's own minMargin query picks which.
  let voteSummaryByMargin = null;
  try {
    const cost = costForPair(pair, assetClass);
    const wf1 = runBarrierWalkForward(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1 });
    const summaryByMargin = { 1: wf1?.overall ?? null, 2: runBarrierWalkForward(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 2 })?.overall ?? null };
    voteSummaryByMargin = summaryByMargin;
    // Trailing/continuation exit (2026-08-30, validated for follow, then
    // extended to fade the same day — see LEGO_MODULES.md's
    // fib_atlas_trailing_continuation_backtest.mjs entry, DECISION=fade/all
    // runs) — adds trailedPnlPct/trailedPnlPips/trailedResolveTime to
    // WINNING rows on BOTH decisions, off the SAME gap-filled `packed` M1
    // bars already loaded above for the walk (no second M1 fetch).
    // Read-time routes toggle base vs. trailed cheaply via
    // `applyStoredContinuationExit` — see that function's own doc for why
    // this must be generation-time, not request-time (M1 access is too
    // slow to do live).
    const trailed = applyTrailingContinuation(wf1?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'] });
    // Chandelier (ATR-trailed) exit (2026-08-31) — analysis/fib_atlas_chandelier_
    // exit_backtest.mjs found a REAL OOS drawdown improvement over the
    // giveback trail above (Asia OOS Sharpe 15.33->19.47, maxDD -4.51%->
    // -2.43%; see LEGO_MODULES.md), so it's stored ALONGSIDE the giveback
    // fields (chandTrailed*, not a replacement) — same reasoning as
    // `applyStoredContinuationExit`'s own doc: a second stored variant, one
    // extra `applyTrailingContinuation` call over the SAME `wf1.trades`
    // (order-aligned, safe to zip by index) and the SAME already-loaded
    // `packed` M1, no new M1 fetch. ASIA_CHANDELIER_MULT/PERIOD are this
    // ladder's own frozen choice — Monday's differs, see mondayFibAtlasRoutes.js.
    const chand = applyTrailingContinuation(wf1?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: ASIA_CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD });
    const trailedTrades = trailed.map((t, i) => ({
      ...t,
      chandTrailedPnlPct: chand[i].trailedPnlPct ?? null,
      chandTrailedPnlPips: chand[i].trailedPnlPips ?? null,
      chandTrailedResolveTime: chand[i].trailedResolveTime ?? null,
    }));

    // Extended-resolution ("let-ride") trade list — SAME build/trail steps
    // as the baseline above, just off extTouches/extBook. Kept as its own
    // full pipeline (not a reprice of the baseline trades) since extension
    // changes WHICH touches exist, not just how an existing one exits.
    let extSummaryByMargin = null, extTradesOut = null;
    try {
      const extWf1 = runBarrierWalkForward(extTouches, extBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1 });
      extSummaryByMargin = { 1: extWf1?.overall ?? null, 2: runBarrierWalkForward(extTouches, extBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 2 })?.overall ?? null };
      const extTrailed = applyTrailingContinuation(extWf1?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'] });
      const extChand = applyTrailingContinuation(extWf1?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: ASIA_CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD });
      extTradesOut = extTrailed.map((t, i) => ({
        ...t,
        chandTrailedPnlPct: extChand[i].trailedPnlPct ?? null,
        chandTrailedPnlPips: extChand[i].trailedPnlPips ?? null,
        chandTrailedResolveTime: extChand[i].trailedResolveTime ?? null,
      }));
    } catch (e) { onLog(`${sym}: extended (let-ride) vote-trades build failed (${e.message}) — non-fatal, baseline still saved`); }

    await putJSON(`${PREFIX}/${pair}-votetrades.json`, {
      instrument: sym, generatedAt: new Date().toISOString(), cost, splitDate: book.splitDate,
      trades: trailedTrades,   // margin>=1 superset — the page filters down to margin=2 client-side
      summaryByMargin,
      // "Let-ride" extended-resolution variant (2026-08-31, see the walk
      // call above) — null when the extended build failed, so a read-time
      // consumer must fall back to `trades` rather than assume presence.
      extTrades: extTradesOut, extSummaryByMargin,
      extendResolutionDays: EXTEND_RESOLUTION_DAYS, nextSessionBuildHrs: NEXT_SESSION_BUILD_HRS,
    });
  } catch (e) { onLog(`${sym}: vote-trades build/persist failed (${e.message}) — non-fatal, main book still saved`); }

  // Live ladder off the SAME gap-filled packed data (no second M1 load),
  // scored against the book just built.
  const { date: liveDate, currentPrice, sessionHandoff, boundary, ladder } =
    asiaFibAtlasLiveLadder(packed, { instrument: sym, assetClass, rearmFrac: DEFAULT_REARM, ivByDate, macroEvents });
  const scoredLadder = scoreLadder(book, ladder);

  const result = {
    instrument: sym, assetClass, coverage, generatedAt: new Date().toISOString(),
    rearmFrac: DEFAULT_REARM, book,
    // Surfaced (2026-08-27) so a caller (scripts/backfill_fib_atlas_vote_trades.mjs)
    // can report real vote-trade counts/Sharpe without a second R2 round-trip —
    // this is the SAME object already persisted to `${pair}-votetrades.json` above,
    // just also attached to runOne's own return value.
    voteSummaryByMargin,
    live: { date: liveDate, currentPrice, sessionHandoff, boundary, ladder: scoredLadder },
    // Raw touches NOT persisted — same reasoning as Level Atlas's own runOne:
    // the aggregated book is the product, re-run to regenerate them.
  };
  await putJSON(`${PREFIX}/${pair}.json`, result);
  return result;
}

// ── Fast live-context poll ────────────────────────────────────────────────
// Mirrors levelAtlasRoutes.js's getFastLive/coldStartLiveCache/boundPacked
// exactly (see that file's own comment for the full reasoning: M1 only
// advances once a minute, so this only recomputes when a genuinely new bar
// has closed; the book itself is re-read from R2 fresh every call so a
// finished /run reaches a poll immediately without restarting anything).
const liveCache = new Map();   // pair -> { packed, lastBarTime, ivByDate, macroEvents }
const liveWarming = new Set();

function boundPacked(packed, days) {
  if (!packed?.n) return packed;
  const cutSec = packed.times[packed.n - 1] - days * 86400;
  let cutIdx = 0;
  for (let i = 0; i < packed.n; i++) { if (packed.times[i] >= cutSec) { cutIdx = i; break; } }
  if (cutIdx <= 0) return packed;
  return {
    n: packed.n - cutIdx,
    times: packed.times.slice(cutIdx), opens: packed.opens.slice(cutIdx),
    highs: packed.highs.slice(cutIdx), lows: packed.lows.slice(cutIdx),
    closes: packed.closes.slice(cutIdx), volumes: packed.volumes.slice(cutIdx),
  };
}

async function coldStartLiveCache(pair) {
  const sym = pair.toUpperCase();
  liveWarming.add(pair);
  try {
    let packed = await loadM1ForPair(pair);
    if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
    if (process.env.OANDA_KEY) {
      try { packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 }); }
      catch (e) { console.warn(`[asia-fib-atlas-live] ${sym}: gap-fill failed on cold start (${e.message})`); }
    }
    const bounded = boundPacked(packed, LIVE_WINDOW_DAYS);
    const ivByDate = await loadIvByDate(pair);
    const macroEvents = majorEventEpochs();
    liveCache.set(pair, { packed: bounded, lastBarTime: bounded.times[bounded.n - 1], ivByDate, macroEvents });
    console.log(`[asia-fib-atlas-live] ${sym}: warm (${bounded.n.toLocaleString()} bars, ${LIVE_WINDOW_DAYS}d window)`);
  } catch (e) {
    console.error(`[asia-fib-atlas-live] ${sym}: cold start failed — ${e.message}`);
  } finally {
    liveWarming.delete(pair);
  }
}

// Returns { warming: true } while the one-time cold load is in flight.
// Once warm, incrementally tops the cache up and recomputes the ladder ONLY
// when that top-up actually moved the last bar.
async function getFastLive(pair) {
  const sym = pair.toUpperCase();
  let entry = liveCache.get(pair);
  if (!entry) {
    if (!liveWarming.has(pair)) coldStartLiveCache(pair).catch(() => {});
    return { warming: true, date: null, currentPrice: null, sessionHandoff: null, boundary: null, ladder: [] };
  }
  if (process.env.OANDA_KEY) {
    try {
      const before = entry.packed.n;
      entry.packed = await gapFillPacked(entry.packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 });
      if (entry.packed.n > before) entry.packed = boundPacked(entry.packed, LIVE_WINDOW_DAYS);
    } catch (e) { /* stale-but-serving beats erroring a poll */ }
  }
  const newestBar = entry.packed.times[entry.packed.n - 1];
  const assetClass = assetClassFor(pair);
  if (newestBar !== entry.lastBarTime || !entry.result) {
    entry.result = asiaFibAtlasLiveLadder(entry.packed, { instrument: sym, assetClass, rearmFrac: DEFAULT_REARM, ivByDate: entry.ivByDate, macroEvents: entry.macroEvents });
    entry.lastBarTime = newestBar;
  }
  return { warming: false, ...entry.result };
}

// ── Live-plan zones (2026-08-31) — the Fib Atlas live/paper bot's ONLY
// signal source. Mirrors server.js's `_volatilityV2PriceZone`/
// `_volatilityV2InstrumentPreview` pattern exactly (Level Atlas's own live
// bot, `volatility_bot_v2`): price EVERY rung the live ladder already
// tracks against the stored book, using the SAME `voteDecision` +
// `asiaRungBarrierPips` the backtest itself validated with — the bot never
// gets its own copy of the decision math, per the playbook's core
// principle ("the strategy computes, the bot only executes").
//
// `sizingStopPips` ALWAYS carries the full, untightened stop distance —
// position sizing must be computed off this, never off `stopPips` once
// `stopTightenFrac` has shrunk it, or fixed-fractional sizing sizes UP to
// compensate for the smaller stop (implicit leverage — see this repo's
// live-bot playbook §2, and `_volatilityV2PriceZone`'s own identical doc).
//
// A zone's "armed" state (whether a touch RIGHT NOW would count as a new,
// re-armed entry vs. a rung still cooling down from an earlier touch today)
// is DELIBERATELY left to the bot, not computed here: `asiaFibAtlasLiveLadder`
// (which this reads via `getFastLive`) reports every rung's price/decision/
// margin regardless of rearm state — replicating the walk's own rearm state
// machine server-side would mean exposing `asiaFibAtlasLiveToday`'s internal
// per-touch bookkeeping through this route, a materially bigger change for
// something the bot already has to track anyway (it's the SAME "has price
// crossed this rung level" event the bot watches for its entry trigger in
// the first place). `rearmFrac` is published on every zone so the bot's own
// rearm tracking uses the EXACT value (`DEFAULT_REARM` = 0.3) the backtest
// was validated with, never a guessed default.
export const FIB_ATLAS_MIN_MARGIN = 2;                 // best-config frozen value (asia-fib-atlas-vote-portfolio.html's loadBestConfigBtn)
export const FIB_ATLAS_MIN_COST_RATIO = 3;              // Asia's own frozen ratio (fib_atlas_cost_efficiency_filter.mjs)
export const FIB_ATLAS_STOP_TIGHTEN_FRAC = 0.9;         // frozen fraction (fib_atlas_sl_tightening_backtest.mjs)

export async function asiaLivePlanZones(pair, { minMargin = FIB_ATLAS_MIN_MARGIN, minCostRatio = FIB_ATLAS_MIN_COST_RATIO, stopTightenFrac = FIB_ATLAS_STOP_TIGHTEN_FRAC } = {}) {
  const live = await getFastLive(pair);
  if (live.warming || !live.date) return { spot: null, date: live.date ?? null, boundary: null, zones: [], zoneCount: 0, warming: !!live.warming };
  const stored = await getJSON(`${PREFIX}/${pair}.json`);
  const book = stored?.book ?? null;
  if (!book) return { spot: live.currentPrice, date: live.date, boundary: live.boundary, zones: [], zoneCount: 0, warming: false, skipped: 'no stored book — POST /api/asia-fib-atlas/run first' };
  const cost = stored.cost ?? 0;

  const zones = [];
  for (const rung of live.ladder) {
    const vd = voteDecision(book, rung);
    if (!vd || vd.margin < minMargin) continue;
    const { innerDistPips, outerDistPips } = asiaRungBarrierPips(rung.side, rung.level, live.boundary, rung.pip);
    const targetPips = vd.decision === 'fade' ? innerDistPips : outerDistPips;
    const sizingStopPips = vd.decision === 'fade' ? outerDistPips : innerDistPips;
    if (targetPips == null || sizingStopPips == null) continue;   // 'follow' at the outermost rung -- no real stop, don't publish it
    if (cost > 0 && minCostRatio > 1) {
      const targetPnlPct = targetPips * rung.pip / rung.price * 100;
      if (targetPnlPct / cost < minCostRatio) continue;
    }
    const stopPips = (vd.decision === 'fade' && stopTightenFrac != null && stopTightenFrac < 1)
      ? +(sizingStopPips * stopTightenFrac).toFixed(1) : sizingStopPips;
    const sgn = rung.side === 'above' ? 1 : -1;
    const sl = rung.price - sgn * stopPips * rung.pip;
    const sizingSl = rung.price - sgn * sizingStopPips * rung.pip;
    const tp = rung.price + sgn * targetPips * rung.pip;
    zones.push({
      side: rung.side, rung: rung.level, decision: vd.decision, margin: vd.margin,
      entry: rung.price, sl: +sl.toFixed(6), sizingSl: +sizingSl.toFixed(6), tp: +tp.toFixed(6),
      targetPips, stopPips, sizingStopPips, pip: rung.pip, rearmFrac: DEFAULT_REARM,
      touchedToday: rung.touchedToday,
      // Short, stable per-(side,level) tag for Mt5Broker.enter's dedupe_tag —
      // "a" prefix disambiguates from Monday's own zones on the SAME pair
      // (asiaLivePlanZones/mondayLivePlanZones share nothing else that would
      // collide, but a live bot trading BOTH ladders on one instrument needs
      // this). Well under MT5's 31-char comment cap.
      dedupeTag: `a_${rung.side[0]}${rung.level}`,
      rationale: `${vd.decision} · margin ${vd.margin} (${vd.outVotes} out / ${vd.backVotes} back)`,
    });
  }
  return { spot: live.currentPrice, date: live.date, boundary: live.boundary, zones, zoneCount: zones.length, warming: false };
}

// Unfiltered per-rung view (2026-09-01) — EVERY rung the live ladder
// currently carries, touched or not, regardless of vote margin. Direct
// owner ask after `asiaLivePlanZones`' margin>=2 filter made it impossible
// to see whether the engine was actually evaluating the full ~40-rung grid
// per pair or silently skipping most of it — mirrors volatility_bot_v2's
// own "All Lines" table (server.js's `/api/level-atlas/vote-preview`)
// exactly, adapted to this engine's rung/ladder shape. Reuses the SAME
// `voteDecision` call `asiaLivePlanZones` makes — never a second scoring
// path, so this can never show a different verdict than the filtered plan
// does for the same rung, only a fuller list of rows.
export async function asiaAllLines(pair) {
  const live = await getFastLive(pair);
  if (live.warming || !live.date) return { date: live.date ?? null, warming: !!live.warming, lines: [] };
  const stored = await getJSON(`${PREFIX}/${pair}.json`);
  const book = stored?.book ?? null;
  const lines = live.ladder.map(rung => {
    const vd = book ? voteDecision(book, rung) : null;
    return {
      pair, side: rung.side, rung: rung.level,
      status: rung.touchedToday ? `touched · ${rung.prevOutcomeSameDay}` : 'pending',
      decision: vd?.decision ?? null, margin: vd?.margin ?? 0,
      tradeableNow: (vd?.margin ?? 0) >= FIB_ATLAS_MIN_MARGIN,
    };
  });
  return { date: live.date, warming: false, lines };
}

function startRunJob({ instruments }) {
  purgeStale();
  const jobId = `afa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const log = [];
  jobs.set(jobId, { status: 'running', startedAt, log });
  (async () => {
    try {
      const results = {};
      for (const instrument of instruments) {
        try {
          results[instrument] = await runOne(instrument, { onLog: m => { log.push(m); console.log('[asia-fib-atlas]', m); } });
        } catch (e) {
          log.push(`${instrument}: FAILED — ${e.message}`);
          console.error('[asia-fib-atlas]', instrument, e.message);
        }
      }
      jobs.set(jobId, { status: 'done', startedAt, log, result: { instruments: Object.keys(results) } });
    } catch (e) {
      jobs.set(jobId, { status: 'error', startedAt, log, error: e.message });
    }
  })();
  return jobId;
}

// Exported for js/asiaFibAtlasRoutes.test.mjs only — not part of the route API.
export { boundPacked, getFastLive, liveCache, liveWarming, startRunJob };

/** Mount all /api/asia-fib-atlas/* routes. */
export function mountAsiaFibAtlasRoutes(app, express) {
  // POST /api/asia-fib-atlas/run  { instruments: ['EURUSD', ...] }  -> { jobId }
  app.post('/api/asia-fib-atlas/run', express.json({ limit: '8kb' }), (req, res) => {
    const b = req.body ?? {};
    const instruments = Array.isArray(b.instruments) && b.instruments.length
      ? b.instruments.map(s => String(s).toUpperCase())
      : ['EURUSD'];
    res.json({ ok: true, jobId: startRunJob({ instruments }) });
  });

  app.get('/api/asia-fib-atlas/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'unknown jobId' });
    res.json({ ok: true, ...job });
  });

  // GET /api/asia-fib-atlas/live/EURUSD — the last /run's stored ladder,
  // straight from R2. No M1 load, no walk.
  app.get('/api/asia-fib-atlas/live/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no atlas data for ${req.params.instrument} yet — POST /api/asia-fib-atlas/run first` });
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, live: stored.live });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/asia-fib-atlas/fastlive/EURUSD — same shape as /live, computed
  // from a warm, incrementally-updated bounded window instead of served from
  // whatever the last /run happened to store. Meant to be polled every few
  // seconds by the live chart page: most calls cost nothing (no new M1 bar
  // yet); the book is re-read from R2 fresh every call, so a newly-finished
  // /run reaches a poll immediately. { warming: true } on a cold cache — the
  // client should keep polling, the one-time load runs in the background.
  app.get('/api/asia-fib-atlas/fastlive/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const live = await getFastLive(pair);
      if (live.warming) return res.json({ ok: true, instrument: pair.toUpperCase(), warming: true, live: { date: null, currentPrice: null, sessionHandoff: null, boundary: null, ladder: [] } });
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      const book = stored?.book ?? null;
      const scoredLadder = scoreLadder(book, live.ladder);
      res.json({
        ok: true, instrument: pair.toUpperCase(), warming: false, bookGeneratedAt: stored?.generatedAt ?? null,
        live: { date: live.date, currentPrice: live.currentPrice, sessionHandoff: live.sessionHandoff, boundary: live.boundary, ladder: scoredLadder },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/asia-fib-atlas/plan/EURUSD[?minMargin=2&minCostRatio=3&stopTightenFrac=0.9]
  // — the live-plan zones a caller (the Fib Atlas bot's own poll, or
  // bot-config.html's "Today's Levels" table) reads directly for ONE pair.
  // The server-wide plan producer (server.js's `_refreshFibAtlasPlan`) calls
  // `asiaLivePlanZones` the same way for its whole configured universe and
  // persists the result to KV — this route is the same computation, read-
  // time, for ad-hoc inspection of a single pair without waiting on that
  // producer's ~45s cadence.
  app.get('/api/asia-fib-atlas/plan/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const opts = {};
      if (req.query.minMargin) opts.minMargin = Number(req.query.minMargin);
      if (req.query.minCostRatio) opts.minCostRatio = Number(req.query.minCostRatio);
      if (req.query.stopTightenFrac) opts.stopTightenFrac = Number(req.query.stopTightenFrac);
      const plan = await asiaLivePlanZones(pair, opts);
      res.json({ ok: true, instrument: pair.toUpperCase(), ...plan });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/asia-fib-atlas/vote-trades/EURUSD[?minMargin=2&stopTightenFrac=0.9]
  // — the barrier-priced OOS trade list for the trade-review page
  // (asia-fib-atlas-vote-backtest.html). Same contract as
  // `/api/level-atlas/vote-trades/:instrument` (minMargin filters server-
  // side; summary comes pre-computed per margin). `stopTightenFrac`
  // (2026-08-29, validated — see LEGO_MODULES.md's fib_atlas_sl_tightening_
  // backtest.mjs entries) tightens FADE trades' stop to that fraction of
  // their native distance via the shared `applyFadeStopFraction`; omitted
  // (or 1) leaves the response identical to before this was added.
  // `minCostRatio` (2026-08-30, validated — see LEGO_MODULES.md's
  // fib_atlas_cost_efficiency_filter.mjs entry) drops trades whose gross
  // target doesn't clear that multiple of the pair's own round-trip cost,
  // via the shared `applyCostEfficiencyFilter`, applied BEFORE stop-
  // tightening (pure selection gate, order vs. tightening doesn't matter
  // for this filter since it only reads `targetPips`/`entry`, never
  // touched by tightening). The pre-computed `summary` field is
  // deliberately NOT re-derived when tightened/filtered (it's the
  // untouched baseline's own stored summary) — the page's own client-side
  // stats already recompute from `trades`.
  app.get('/api/asia-fib-atlas/vote-trades/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}-votetrades.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no vote-backtest data for ${req.params.instrument} yet` });
      const minMargin = req.query.minMargin ? Number(req.query.minMargin) : 2;
      const stopTightenFrac = req.query.stopTightenFrac ? Number(req.query.stopTightenFrac) : null;
      const minCostRatio = req.query.minCostRatio ? Number(req.query.minCostRatio) : null;
      // 'true'|'giveback'|'chandelier'|undefined -- applyStoredContinuationExit
      // does its own interpreting now (2026-08-31), so no boolean coercion here.
      const continuationExit = req.query.continuationExit;
      // "Let-ride" extended-resolution toggle (2026-08-31, see runOne's own
      // comment) -- swaps in the extTrades superset (baseline trades PLUS
      // previously-'neither'-dropped touches that resolved given more time,
      // concurrency-capped at 6am the next day) in place of the same-day-only
      // baseline. Falls back to `trades` if the extended build is missing
      // (older stored data, or the extended build failed generation-side).
      const letRide = req.query.letRide === 'true';
      const baseTrades = letRide ? (stored.extTrades ?? stored.trades) : stored.trades;
      // Continuation-exit swap first -- see applyStoredContinuationExit's own
      // doc for why it must precede any concurrency-cap-style step (this
      // route has none, but keeping the same order as buildFibAtlasVotePortfolio
      // for consistency).
      const swapped = applyStoredContinuationExit(baseTrades, continuationExit);
      const marginFiltered = swapped.filter(t => t.margin >= minMargin);
      const filtered = applyCostEfficiencyFilter(marginFiltered, stored.cost, minCostRatio);
      const trades = applyFadeStopFraction(filtered, stopTightenFrac, 0, { preserveSizing: true });
      const summaryByMargin = letRide ? (stored.extSummaryByMargin ?? stored.summaryByMargin) : stored.summaryByMargin;
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, cost: stored.cost,
                 splitDate: stored.splitDate, minMargin, stopTightenFrac, minCostRatio, continuationExit, letRide,
                 summary: summaryByMargin?.[minMargin] ?? null, trades });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/asia-fib-atlas/vote-portfolio?pairs=eurusd,gbpusd,gold,...
  //   &minMargin=2&maxConcurrent=1&perDirection=false&weighting=equal|inverse-vol
  //   &sizing=nav|fixed-risk&riskPct=1&maxHeatPct=&targetVol=10
  //   &throttle=true&triggerDD=-5&restoreDD=0&throttleMult=0.5&stopTightenFrac=0.9
  // Combines MULTIPLE pairs' own Asia vote-trades into ONE portfolio — same
  // query contract and response shape as `/api/level-atlas/vote-portfolio`,
  // via the shared `buildFibAtlasVotePortfolio` (see that module's header for
  // why this is a fresh extraction of that route's logic, not an import of
  // the route itself). `stopTightenFrac` (2026-08-29) is now validated for
  // this engine too — see LEGO_MODULES.md's fib_atlas_sl_tightening_
  // backtest.mjs entries — and threaded straight through.
  app.get('/api/asia-fib-atlas/vote-portfolio', async (req, res) => {
    try {
      const pairs = (req.query.pairs ? String(req.query.pairs).split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'gold'])
        .map(p => p.trim().toLowerCase()).filter(Boolean);
      const result = await buildFibAtlasVotePortfolio({
        pairs,
        minMargin: req.query.minMargin ? Number(req.query.minMargin) : 2,
        maxConcurrent: req.query.maxConcurrent ? Number(req.query.maxConcurrent) : 1,
        perDirection: req.query.perDirection === 'true',
        weighting: req.query.weighting === 'inverse-vol' ? 'inverse-vol' : 'equal',
        sizing: req.query.sizing === 'nav' ? 'nav' : 'fixed-risk',
        riskPct: req.query.riskPct ? Number(req.query.riskPct) : 1,
        maxHeatPct: req.query.maxHeatPct ? Number(req.query.maxHeatPct) : null,
        targetVol: req.query.targetVol ? Number(req.query.targetVol) : 10,
        throttleOn: req.query.throttle === 'true',
        triggerDD: req.query.triggerDD ? Number(req.query.triggerDD) : -5,
        restoreDD: req.query.restoreDD ? Number(req.query.restoreDD) : 0,
        throttleMult: req.query.throttleMult ? Number(req.query.throttleMult) : 0.5,
        stopTightenFrac: req.query.stopTightenFrac ? Number(req.query.stopTightenFrac) : null,
        minCostRatio: req.query.minCostRatio ? Number(req.query.minCostRatio) : null,
        continuationExit: req.query.continuationExit, // 'true'|'giveback'|'chandelier'|undefined -- applyStoredContinuationExit interprets it
        loadPairVoteTrades: async pair => loadVoteTrades(`${PREFIX}/${pair}-votetrades.json`, req.query.letRide === 'true'),
      });
      if (result.error) return res.status(404).json({ ok: false, error: result.error, missing: result.missing });
      res.json({ ok: true, letRide: req.query.letRide === 'true', ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/asia-fib-atlas/vote-portfolio-combined?pairs=eurusd,gbpusd&ladders=asia,monday&...
  // Same params as /vote-portfolio, plus `ladders` (comma list, default
  // both) — combines EACH selected pair's Asia AND Monday trades as
  // SEPARATE constituents ("EURUSD (Asia)"/"EURUSD (Monday)"), so the SAME
  // pair can have an Asia position and a Monday position open at once, and
  // the existing `maxHeatPct`/`throttle` machinery (built for cross-PAIR
  // stacking) now also governs cross-LADDER stacking on one pair — no new
  // math, `buildFibAtlasVotePortfolio`'s constituent concept was already
  // generic (see its own header). Answers the owner's own question: what's
  // the impact of letting both ladders trade the same pair simultaneously,
  // and what does constraining that concurrency do to the result.
  app.get('/api/asia-fib-atlas/vote-portfolio-combined', async (req, res) => {
    try {
      const pairs = (req.query.pairs ? String(req.query.pairs).split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'gold'])
        .map(p => p.trim().toLowerCase()).filter(Boolean);
      const ladders = (req.query.ladders ? String(req.query.ladders).split(',') : ['asia', 'monday'])
        .map(l => l.trim().toLowerCase()).filter(l => l === 'asia' || l === 'monday');
      const LADDER_PREFIX = { asia: PREFIX, monday: 'monday-fib-atlas' };
      const LADDER_LABEL = { asia: 'Asia', monday: 'Monday' };
      // One constituent key per (pair, ladder) combination actually requested.
      const constituentKeys = pairs.flatMap(pair => ladders.map(ladder => `${pair}|${ladder}`));
      const result = await buildFibAtlasVotePortfolio({
        pairs: constituentKeys,
        minMargin: req.query.minMargin ? Number(req.query.minMargin) : 2,
        maxConcurrent: req.query.maxConcurrent ? Number(req.query.maxConcurrent) : 1,
        perDirection: req.query.perDirection === 'true',
        weighting: req.query.weighting === 'inverse-vol' ? 'inverse-vol' : 'equal',
        sizing: req.query.sizing === 'nav' ? 'nav' : 'fixed-risk',
        riskPct: req.query.riskPct ? Number(req.query.riskPct) : 1,
        maxHeatPct: req.query.maxHeatPct ? Number(req.query.maxHeatPct) : null,
        targetVol: req.query.targetVol ? Number(req.query.targetVol) : 10,
        throttleOn: req.query.throttle === 'true',
        triggerDD: req.query.triggerDD ? Number(req.query.triggerDD) : -5,
        restoreDD: req.query.restoreDD ? Number(req.query.restoreDD) : 0,
        throttleMult: req.query.throttleMult ? Number(req.query.throttleMult) : 0.5,
        stopTightenFrac: req.query.stopTightenFrac ? Number(req.query.stopTightenFrac) : null,
        minCostRatio: req.query.minCostRatio ? Number(req.query.minCostRatio) : null,
        continuationExit: req.query.continuationExit, // 'true'|'giveback'|'chandelier'|undefined -- applyStoredContinuationExit interprets it
        loadPairVoteTrades: async constituentKey => {
          const [pair, ladder] = constituentKey.split('|');
          const stored = await loadVoteTrades(`${LADDER_PREFIX[ladder]}/${pair}-votetrades.json`, req.query.letRide === 'true');
          if (!stored) return null;
          return { ...stored, groupKey: `${stored.instrument} (${LADDER_LABEL[ladder]})`, ladder };
        },
      });
      if (result.error) return res.status(404).json({ ok: false, error: result.error, missing: result.missing });
      res.json({ ok: true, ladders, letRide: req.query.letRide === 'true', ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/asia-fib-atlas/book/EURUSD — the FULL book (every dimension,
  // all buckets) for a drill-down page.
  app.get('/api/asia-fib-atlas/book/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no atlas data for ${req.params.instrument} yet` });
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, book: stored.book });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/asia-fib-atlas/book/EURUSD/text — the plain-text render.
  app.get('/api/asia-fib-atlas/book/:instrument/text', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).type('text/plain').send(`no atlas data for ${req.params.instrument} yet`);
      res.type('text/plain').send(renderAsiaFibBookText(stored.book));
    } catch (e) {
      res.status(500).type('text/plain').send(`Error: ${e.message}`);
    }
  });
}
