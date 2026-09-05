/**
 * Monday Fib Atlas — Express routes. Started smaller than `js/asiaFibAtlasRoutes.js`
 * (only fed the vote-margin trade backtest), now also carries a live ladder —
 * `mondayFibAtlasLiveLadder` (2026-08-28, see `js/mondayFibAtlasEngine.js`'s own
 * header) plus this file's `/live` + `/fastlive` routes, mirroring Asia's own
 * warm-cache pattern so `asia-fib-atlas-live.html`'s Asia/Monday toggle has a
 * real second ladder to switch to. Same async-job + R2-persist pattern as every
 * other reference engine here (`/run`, `/status`, `/vote-trades`, `/live`).
 */
import { loadM1ForPair } from './volBacktestM1Engine.js';
import { mondayFibAtlasWalk, mondayFibAtlasLiveLadder, mondayRungBarrierPips } from './mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook, DIMENSIONS } from './asiaFibAtlasReport.js';
import { matchLiveContext } from './levelAtlasReport.js';
import { runBarrierWalkForward, voteDecision } from './asiaFibAtlasVoteReview.js';
import { loadVoteTrades, mergeIntoFibAtlasPlan } from './asiaFibAtlasRoutes.js';
import { applyFadeStopFraction, applyCostEfficiencyFilter, applyGapFilter, applyTrailingContinuation, applyStoredContinuationExit } from './levelAtlasVoteReview.js';
import { buildFibAtlasVotePortfolio } from './fibAtlasVotePortfolio.js';
import { putJSON, getJSON } from './r2Store.js';
import { packToJSON, packFromJSON } from './levelAtlasRoutes.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { oandaSymbol } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { fetchM1Range } from './volBacktestEngine.js';
import { costForPair } from './perLineStrategy.js';

const PREFIX = 'monday-fib-atlas';
const DEFAULT_REARM = 0.3;
// Chandelier (ATR-trailed) continuation exit's frozen choice for THIS
// ladder (analysis/fib_atlas_chandelier_exit_backtest.mjs, LADDER=monday;
// see LEGO_MODULES.md) — Monday's own optimum is a much TIGHTER trail than
// Asia's (mult=3, asiaFibAtlasRoutes.js): Monday's noise character differs.
// CHANDELIER_PERIOD (M1 bars for the rolling ATR) is shared, not yet
// independently swept per ladder.
const MONDAY_CHANDELIER_MULT = 1.5;
const CHANDELIER_PERIOD = 60;
// Same window Asia's own live cache uses (LIVE_WINDOW_DAYS in
// asiaFibAtlasRoutes.js) — generous margin over what mondayFibAtlasWalk's
// default minLookback=5 weeks actually needs, kept equal for one shared
// mental model rather than a second tuned constant.
const LIVE_WINDOW_DAYS = 180;
const DIM_LABEL = new Map(DIMENSIONS);

const jobs = new Map();
function purgeStale() {
  const cutoff = Date.now() - 2 * 60 * 60_000;
  for (const [id, job] of jobs) if (job.startedAt < cutoff) jobs.delete(id);
}

// Flattens matchLiveContext's match object back onto each rung's own price/
// distance/touchedToday fields — the SAME merge asiaFibAtlasRoutes.js's own
// scoreLadder does (kept as its own tiny copy rather than importing that
// module-local function: it's a 4-line generic merge, not a brick).
function scoreLadder(book, ladder) {
  return ladder.map(r => {
    const m = book ? matchLiveContext(book, r, { keyField: 'level', dimLabels: DIM_LABEL }) : null;
    if (!m) return { ...r, lean: 'neutral', sameSignOOS: null, base: null, supports: [], challenges: [], context: [] };
    const { liveTouch, ...rest } = m;
    return { ...r, ...rest };
  });
}

// Exported (2026-08-27) for scripts/backfill_fib_atlas_vote_trades.mjs — see
// js/asiaFibAtlasRoutes.js's own runOne export comment for the reasoning.
export async function runOne(instrument, { onLog = () => {} } = {}) {
  const pair = String(instrument).toLowerCase();
  const sym = String(instrument).toUpperCase();
  onLog(`${sym}: loading M1…`);
  let packed = await loadM1ForPair(pair);
  if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
  if (process.env.OANDA_KEY) {
    try {
      const before = packed.n;
      packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), onLog });
      if (packed.n > before) onLog(`${sym}: gap-filled +${(packed.n - before).toLocaleString()} bars to now`);
    } catch (e) { onLog(`${sym}: gap-fill failed (${e.message}) — using stored M1`); }
  }
  const assetClass = assetClassFor(pair);
  onLog(`${sym}: ${packed.n.toLocaleString()} M1 bars, assetClass ${assetClass} — walking the Monday ladder…`);
  const { touches, coverage } = mondayFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM] });
  onLog(`${sym}: ${touches.length.toLocaleString()} touch-records, ${coverage?.weeks ?? 0} weeks (${coverage?.from}→${coverage?.to})`);

  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) throw new Error(`${sym}: too few touches to build a book`);

  // "Let-ride" extended-resolution walk (2026-08-31) — Monday's own sibling
  // of Asia's (js/asiaFibAtlasRoutes.js's runOne, see its own comment for
  // the full mechanism/reasoning): even Monday's existing ~8-day window
  // drops ~3.3-3.7% of touches as unresolved (analysis/
  // fib_atlas_monday_neither_extend_test.mjs), comparable to Asia's own
  // rate. A second full walk (same already-loaded `packed`, no new M1
  // fetch) with extension enabled — Monday's `concurrencyResolveTime` caps
  // at the EXISTING winEnd (not a hours-based param like Asia's, since that
  // boundary already sits almost exactly at next week's fresh-range start
  // — see mondayFibAtlasWalk's own doc). Stored ALONGSIDE the baseline
  // trades (extTrades/extSummaryByMargin below), not a replacement.
  const EXTEND_RESOLUTION_DAYS = 21;
  const { touches: extTouches } = mondayFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM], extendResolutionDays: EXTEND_RESOLUTION_DAYS });
  const extBook = buildAsiaFibAtlasBook(extTouches, { rearmFrac: DEFAULT_REARM });

  const cost = costForPair(pair, assetClass);
  const wf1 = runBarrierWalkForward(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1 });
  const summaryByMargin = { 1: wf1?.overall ?? null, 2: runBarrierWalkForward(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 2 })?.overall ?? null };

  // Trailing/continuation exit (2026-08-30; genuinely LADDER=monday
  // validated the same day, after an earlier version of this comment
  // claimed "validated for Monday too" when the analysis script actually
  // had no LADDER support yet and had only ever run on Asia — caught and
  // fixed, not left standing. See LEGO_MODULES.md's
  // fib_atlas_trailing_continuation_backtest.mjs entry, LADDER=monday
  // DECISION=all run), same as Asia's own runOne, off the SAME gap-filled
  // `packed` M1 bars already loaded above.
  const trailed = applyTrailingContinuation(wf1?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'] });
  // Chandelier variant (2026-08-31) — stored ALONGSIDE the giveback trail
  // above, not a replacement (see js/levelAtlasVoteReview.js's
  // applyStoredContinuationExit doc); same reasoning/order as Asia's own
  // runOne. Second `applyTrailingContinuation` call over the SAME
  // `wf1.trades` (order-aligned, safe to zip by index) and the SAME
  // already-loaded `packed` M1 -- no new M1 fetch.
  const chand = applyTrailingContinuation(wf1?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: MONDAY_CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD });
  const trailedTrades = trailed.map((t, i) => ({
    ...t,
    chandTrailedPnlPct: chand[i].trailedPnlPct ?? null,
    chandTrailedPnlPips: chand[i].trailedPnlPips ?? null,
    chandTrailedResolveTime: chand[i].trailedResolveTime ?? null,
  }));

  // Extended-resolution ("let-ride") trade list — SAME build/trail steps
  // as the baseline above, off extTouches/extBook. Kept as its own full
  // pipeline (not a reprice of the baseline trades), same reasoning as
  // Asia's own runOne.
  let extSummaryByMargin = null, extTradesOut = null;
  try {
    const extWf1 = runBarrierWalkForward(extTouches, extBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1 });
    extSummaryByMargin = { 1: extWf1?.overall ?? null, 2: runBarrierWalkForward(extTouches, extBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 2 })?.overall ?? null };
    const extTrailed = applyTrailingContinuation(extWf1?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'] });
    const extChand = applyTrailingContinuation(extWf1?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: MONDAY_CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD });
    extTradesOut = extTrailed.map((t, i) => ({
      ...t,
      chandTrailedPnlPct: extChand[i].trailedPnlPct ?? null,
      chandTrailedPnlPips: extChand[i].trailedPnlPips ?? null,
      chandTrailedResolveTime: extChand[i].trailedResolveTime ?? null,
    }));
  } catch (e) { onLog(`${sym}: extended (let-ride) vote-trades build failed (${e.message}) — non-fatal, baseline still saved`); }

  const voteResult = {
    instrument: sym, assetClass, coverage, generatedAt: new Date().toISOString(),
    cost, splitDate: book.splitDate,
    trades: trailedTrades,
    summaryByMargin,
    extTrades: extTradesOut, extSummaryByMargin, extendResolutionDays: EXTEND_RESOLUTION_DAYS,
  };
  await putJSON(`${PREFIX}/${pair}-votetrades.json`, voteResult);

  // Live ladder off the SAME gap-filled packed data (no second M1 load),
  // scored against the book just built — persisted separately so `/live` can
  // serve it without recomputing (same pattern asiaFibAtlasRoutes.js's own
  // runOne uses for `${PREFIX}/${pair}.json`).
  const live = mondayFibAtlasLiveLadder(packed, { instrument: sym, assetClass, rearmFrac: DEFAULT_REARM });
  const scoredLadder = scoreLadder(book, live.ladder);
  const bookResult = {
    instrument: sym, assetClass, coverage, generatedAt: new Date().toISOString(),
    rearmFrac: DEFAULT_REARM, book,
    live: { date: live.date, currentPrice: live.currentPrice, sessionHandoff: live.sessionHandoff, boundary: live.boundary, ladder: scoredLadder },
  };
  await putJSON(`${PREFIX}/${pair}.json`, bookResult);

  // Seed the bot's live plan straight from this freshly-built book+ladder —
  // see asiaFibAtlasRoutes.js's mergeIntoFibAtlasPlan for the full reasoning.
  try {
    const zones = zonesFromLiveAndBook(bookResult.live, book, cost);
    await mergeIntoFibAtlasPlan(`${pair}|monday`, {
      pair, ladder: 'monday', spot: live.currentPrice, date: live.date, zones, zoneCount: zones.length,
      updatedAt: new Date().toISOString(), source: 'nightly-rebuild',
    });
  } catch (e) { onLog(`${sym}: plan seed failed (${e.message}) — non-fatal, book/live still saved`); }

  return { ...voteResult, voteSummaryByMargin: summaryByMargin };
}

// Live-plan zones for Monday — mirrors `asiaLivePlanZones` in
// asiaFibAtlasRoutes.js field-for-field (see that function's own extensive
// doc for the full reasoning: same `voteDecision`/`*RungBarrierPips` reuse,
// same sizingStopPips-vs-stopPips split, same deliberately bot-side "armed"
// state). Monday's own frozen cost-efficiency ratio is 4x (Asia's is 3x —
// analysis/fib_atlas_cost_efficiency_filter.mjs, each ladder chose its own
// under the same pre-stated "maximize IS Sharpe" rule).
export const FIB_ATLAS_MONDAY_MIN_MARGIN = 2;
export const FIB_ATLAS_MONDAY_MIN_COST_RATIO = 4;
export const FIB_ATLAS_MONDAY_STOP_TIGHTEN_FRAC = 0.9;
// Whiplash-gap filter (2026-09-03, owner-validated — see LEGO_MODULES.md's
// fib_atlas_gap_filter_backtest.mjs entry) — same mechanism as Asia's own
// (asiaFibAtlasRoutes.js's FIB_ATLAS_MAX_GAP_MIN), but Monday's optimum is
// MUCH wider: its ladder trades far less densely (a weekly range vs a daily
// session), so "recent" naturally means hours here, not minutes. Pooled
// Sharpe peaks at 180m and only THERE does per-pair agreement reach 26/26 —
// tighter cutoffs (30-150m) leave several pairs worse off, unlike Asia
// where the tightest cutoff tested was already unanimous.
export const FIB_ATLAS_MONDAY_MAX_GAP_MIN = 180;

// Pure core — Monday's own copy of asiaFibAtlasRoutes.js's
// `zonesFromLiveAndBook`, extracted the same day for the same reason: the
// nightly rebuild (runOne below) can seed the bot's plan straight from its
// own freshly-built `live`+`book`, reusing this EXACT scoring/pricing path
// instead of a second implementation.
export function zonesFromLiveAndBook(live, book, cost, { minMargin = FIB_ATLAS_MONDAY_MIN_MARGIN, minCostRatio = FIB_ATLAS_MONDAY_MIN_COST_RATIO, stopTightenFrac = FIB_ATLAS_MONDAY_STOP_TIGHTEN_FRAC, maxGapMin = FIB_ATLAS_MONDAY_MAX_GAP_MIN } = {}) {
  const nowSec = Date.now() / 1000;
  const zones = [];
  for (const rung of live.ladder) {
    const vd = voteDecision(book, rung);
    if (!vd || vd.margin < minMargin) continue;
    // See asiaLivePlanZones' identical doc — lastTouchTime is always real
    // here too, since margin>=2 structurally requires prevOutcomeSameDay.
    if (maxGapMin != null && rung.lastTouchTime != null) {
      const gapMin = (nowSec - rung.lastTouchTime) / 60;
      if (gapMin > maxGapMin) continue;
    }
    const { innerDistPips, outerDistPips } = mondayRungBarrierPips(rung.side, rung.level, live.boundary, rung.pip);
    const targetPips = vd.decision === 'fade' ? innerDistPips : outerDistPips;
    const sizingStopPips = vd.decision === 'fade' ? outerDistPips : innerDistPips;
    if (targetPips == null || sizingStopPips == null) continue;
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
      dedupeTag: `m_${rung.side[0]}${rung.level}`,   // "m" prefix — see asiaLivePlanZones' own dedupeTag doc
      rationale: `${vd.decision} · margin ${vd.margin} (${vd.outVotes} out / ${vd.backVotes} back)`,
    });
  }
  return zones;
}

export async function mondayLivePlanZones(pair, opts = {}) {
  const live = await getFastLive(pair);
  if (live.warming || !live.date) return { spot: null, date: live.date ?? null, boundary: null, zones: [], zoneCount: 0, warming: !!live.warming };
  const stored = await getJSON(`${PREFIX}/${pair}.json`);
  const book = stored?.book ?? null;
  if (!book) return { spot: live.currentPrice, date: live.date, boundary: live.boundary, zones: [], zoneCount: 0, warming: false, skipped: 'no stored book — POST /api/monday-fib-atlas/run first' };
  const zones = zonesFromLiveAndBook(live, book, stored.cost ?? 0, opts);
  return { spot: live.currentPrice, date: live.date, boundary: live.boundary, zones, zoneCount: zones.length, warming: false };
}

// Monday's own copy of asiaFibAtlasRoutes.js's `asiaAllLines` — see that
// function's own doc.
export async function mondayAllLines(pair) {
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
      tradeableNow: (vd?.margin ?? 0) >= FIB_ATLAS_MONDAY_MIN_MARGIN,
    };
  });
  return { date: live.date, warming: false, lines };
}

function startRunJob({ instruments }) {
  purgeStale();
  const jobId = `mfa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const log = [];
  jobs.set(jobId, { status: 'running', startedAt, log });
  (async () => {
    try {
      const results = {};
      for (const instrument of instruments) {
        try {
          results[instrument] = await runOne(instrument, { onLog: m => { log.push(m); console.log('[monday-fib-atlas]', m); } });
        } catch (e) {
          log.push(`${instrument}: FAILED — ${e.message}`);
          console.error('[monday-fib-atlas]', instrument, e.message);
        }
      }
      jobs.set(jobId, { status: 'done', startedAt, log, result: { instruments: Object.keys(results) } });
    } catch (e) {
      jobs.set(jobId, { status: 'error', startedAt, log, error: e.message });
    }
  })();
  return jobId;
}

// ── Fast live-context poll ────────────────────────────────────────────────
// Mirrors asiaFibAtlasRoutes.js's getFastLive/coldStartLiveCache/boundPacked
// exactly (that file's own comment carries the full reasoning) — simplified
// here since this engine never computes ivByDate/macroEvents context (see
// mondayFibAtlasEngine.js's header on why it's deliberately leaner).
const liveCache = new Map();   // pair -> { packed, lastBarTime, result }
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

// R2 live-cache snapshotting — Monday's own copy of asiaFibAtlasRoutes.js's
// identical mechanism; see that file's own doc for the full reasoning
// (every push to `main` restarts Railway, wiping this in-memory `liveCache`
// and forcing a full multi-year cold-start marathon otherwise).
const LIVE_SNAPSHOT_PREFIX = `${PREFIX}/live-snapshot`;
const MAX_SNAPSHOT_AGE_HOURS = 72;

async function _saveLiveSnapshot(pair) {
  const entry = liveCache.get(pair);
  if (!entry?.packed?.n) return false;
  try {
    await putJSON(`${LIVE_SNAPSHOT_PREFIX}/${pair}.json`, { ...packToJSON(entry.packed), savedAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.warn(`[monday-fib-atlas-live] ${pair}: snapshot save failed — ${e.message}`);
    return false;
  }
}

export async function saveAllLiveSnapshots() {
  let saved = 0;
  for (const pair of liveCache.keys()) {
    if (await _saveLiveSnapshot(pair)) saved++;
  }
  if (saved) console.log(`[monday-fib-atlas-live] snapshotted ${saved} warm pair(s) to R2`);
  return saved;
}

async function coldStartLiveCache(pair) {
  const sym = pair.toUpperCase();
  liveWarming.add(pair);
  try {
    let packed = null, fromSnapshot = false;
    try {
      const snap = await getJSON(`${LIVE_SNAPSHOT_PREFIX}/${pair}.json`);
      const ageH = snap?.savedAt ? (Date.now() - Date.parse(snap.savedAt)) / 3600_000 : Infinity;
      if (ageH <= MAX_SNAPSHOT_AGE_HOURS) {
        const restored = packFromJSON(snap);
        if (restored?.n) { packed = restored; fromSnapshot = true; }
      }
    } catch (e) { console.warn(`[monday-fib-atlas-live] ${sym}: snapshot load failed — ${e.message}`); }

    if (!packed) packed = await loadM1ForPair(pair);
    if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
    if (process.env.OANDA_KEY) {
      try { packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 }); }
      catch (e) { console.warn(`[monday-fib-atlas-live] ${sym}: gap-fill failed on cold start (${e.message})`); }
    }
    const bounded = boundPacked(packed, LIVE_WINDOW_DAYS);
    liveCache.set(pair, { packed: bounded, lastBarTime: bounded.times[bounded.n - 1] });
    console.log(`[monday-fib-atlas-live] ${sym}: warm (${bounded.n.toLocaleString()} bars, ${LIVE_WINDOW_DAYS}d window${fromSnapshot ? ', from R2 snapshot' : ''})`);
  } catch (e) {
    console.error(`[monday-fib-atlas-live] ${sym}: cold start failed — ${e.message}`);
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
    entry.result = mondayFibAtlasLiveLadder(entry.packed, { instrument: sym, assetClass, rearmFrac: DEFAULT_REARM });
    entry.lastBarTime = newestBar;
  }
  return { warming: false, ...entry.result };
}

// Exported for js/mondayFibAtlasRoutes.test.mjs only — not part of the route API.
export { startRunJob, boundPacked, getFastLive, liveCache, liveWarming };

/** Mount all /api/monday-fib-atlas/* routes. */
export function mountMondayFibAtlasRoutes(app, express) {
  app.post('/api/monday-fib-atlas/run', express.json({ limit: '8kb' }), (req, res) => {
    const b = req.body ?? {};
    const instruments = Array.isArray(b.instruments) && b.instruments.length
      ? b.instruments.map(s => String(s).toUpperCase())
      : ['EURUSD'];
    res.json({ ok: true, jobId: startRunJob({ instruments }) });
  });

  app.get('/api/monday-fib-atlas/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'unknown jobId' });
    res.json({ ok: true, ...job });
  });

  // GET /api/monday-fib-atlas/live/EURUSD — the last /run's stored ladder,
  // straight from R2. No M1 load, no walk.
  app.get('/api/monday-fib-atlas/live/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no Monday atlas data for ${req.params.instrument} yet — POST /api/monday-fib-atlas/run first` });
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, live: stored.live });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/monday-fib-atlas/fastlive/EURUSD — same shape as /live, computed
  // from a warm, incrementally-updated bounded window instead of served from
  // whatever the last /run happened to store. Same polling contract as
  // asiaFibAtlasRoutes.js's own /fastlive — { warming: true } on a cold cache.
  app.get('/api/monday-fib-atlas/fastlive/:instrument', async (req, res) => {
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

  // GET /api/monday-fib-atlas/plan/EURUSD[?minMargin=2&minCostRatio=4&stopTightenFrac=0.9]
  // — Monday's own copy of asiaFibAtlasRoutes.js's `/plan` route; see that
  // route's own doc.
  app.get('/api/monday-fib-atlas/plan/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const opts = {};
      if (req.query.minMargin) opts.minMargin = Number(req.query.minMargin);
      if (req.query.minCostRatio) opts.minCostRatio = Number(req.query.minCostRatio);
      if (req.query.stopTightenFrac) opts.stopTightenFrac = Number(req.query.stopTightenFrac);
      if (req.query.maxGapMin) opts.maxGapMin = Number(req.query.maxGapMin);
      const plan = await mondayLivePlanZones(pair, opts);
      res.json({ ok: true, instrument: pair.toUpperCase(), ...plan });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/monday-fib-atlas/vote-trades/EURUSD[?minMargin=2&stopTightenFrac=0.9&minCostRatio=4]
  // `stopTightenFrac` (2026-08-29, validated for Monday too — see
  // LEGO_MODULES.md's fib_atlas_sl_tightening_backtest.mjs LADDER=monday
  // entry) mirrors Asia's own route exactly, via the shared
  // `applyFadeStopFraction`. `minCostRatio` (2026-08-30, validated for
  // Monday too — see LEGO_MODULES.md's fib_atlas_cost_efficiency_filter.mjs
  // LADDER=monday entry) likewise mirrors Asia's own route via the shared
  // `applyCostEfficiencyFilter`, applied before stop-tightening.
  app.get('/api/monday-fib-atlas/vote-trades/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const letRide = req.query.letRide === 'true';
      const stored = await loadVoteTrades(`${PREFIX}/${pair}-votetrades.json`, letRide);
      if (!stored) return res.status(404).json({ ok: false, error: `no Monday vote-backtest data for ${req.params.instrument} yet` });
      const minMargin = req.query.minMargin ? Number(req.query.minMargin) : 2;
      const stopTightenFrac = req.query.stopTightenFrac ? Number(req.query.stopTightenFrac) : null;
      const minCostRatio = req.query.minCostRatio ? Number(req.query.minCostRatio) : null;
      // Whiplash gap filter (2026-09-04) — same FIB_ATLAS_MONDAY_MAX_GAP_MIN
      // the live plan already applies (mondayLivePlanZones), now exposed
      // here so the interactive backtest can reproduce it. Query-param
      // overridable like the others; omitted means no filter.
      const maxGapMin = req.query.maxGapMin ? Number(req.query.maxGapMin) : null;
      // 'true'|'giveback'|'chandelier'|undefined -- applyStoredContinuationExit
      // does its own interpreting now (2026-08-31), so no boolean coercion here.
      const continuationExit = req.query.continuationExit;
      const swapped = applyStoredContinuationExit(stored.trades, continuationExit);
      const marginFiltered = swapped.filter(t => t.margin >= minMargin);
      const costFiltered = applyCostEfficiencyFilter(marginFiltered, stored.cost, minCostRatio);
      const filtered = applyGapFilter(costFiltered, maxGapMin);
      const trades = applyFadeStopFraction(filtered, stopTightenFrac, 0, { preserveSizing: true });
      const summaryByMargin = letRide ? (stored.extSummaryByMargin ?? stored.summaryByMargin) : stored.summaryByMargin;
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, cost: stored.cost,
                 splitDate: stored.splitDate, minMargin, stopTightenFrac, minCostRatio, maxGapMin, continuationExit, letRide,
                 summary: summaryByMargin?.[minMargin] ?? null, trades });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/monday-fib-atlas/vote-portfolio — same contract as Asia's own
  // /vote-portfolio (js/asiaFibAtlasRoutes.js), via the same shared
  // `buildFibAtlasVotePortfolio` core — only the R2 prefix differs.
  app.get('/api/monday-fib-atlas/vote-portfolio', async (req, res) => {
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
        // Whiplash gap filter (2026-09-04) — see /vote-trades/:instrument's
        // own comment above; threaded straight through to
        // buildFibAtlasVotePortfolio.
        maxGapMin: req.query.maxGapMin ? Number(req.query.maxGapMin) : null,
        continuationExit: req.query.continuationExit, // 'true'|'giveback'|'chandelier'|undefined -- applyStoredContinuationExit interprets it
        loadPairVoteTrades: async pair => loadVoteTrades(`${PREFIX}/${pair}-votetrades.json`, req.query.letRide === 'true'),
      });
      if (result.error) return res.status(404).json({ ok: false, error: result.error, missing: result.missing });
      res.json({ ok: true, letRide: req.query.letRide === 'true', ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
