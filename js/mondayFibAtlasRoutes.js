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
import { mondayFibAtlasWalk, mondayFibAtlasLiveLadder } from './mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook, DIMENSIONS } from './asiaFibAtlasReport.js';
import { matchLiveContext } from './levelAtlasReport.js';
import { runBarrierWalkForward } from './asiaFibAtlasVoteReview.js';
import { applyFadeStopFraction, applyCostEfficiencyFilter } from './levelAtlasVoteReview.js';
import { buildFibAtlasVotePortfolio } from './fibAtlasVotePortfolio.js';
import { putJSON, getJSON } from './r2Store.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { oandaSymbol } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { fetchM1Range } from './volBacktestEngine.js';
import { costForPair } from './perLineStrategy.js';

const PREFIX = 'monday-fib-atlas';
const DEFAULT_REARM = 0.3;
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

  const cost = costForPair(pair, assetClass);
  const wf1 = runBarrierWalkForward(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1 });
  const summaryByMargin = { 1: wf1?.overall ?? null, 2: runBarrierWalkForward(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 2 })?.overall ?? null };

  const voteResult = {
    instrument: sym, assetClass, coverage, generatedAt: new Date().toISOString(),
    cost, splitDate: book.splitDate,
    trades: wf1?.trades ?? [],
    summaryByMargin,
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

  return { ...voteResult, voteSummaryByMargin: summaryByMargin };
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

async function coldStartLiveCache(pair) {
  const sym = pair.toUpperCase();
  liveWarming.add(pair);
  try {
    let packed = await loadM1ForPair(pair);
    if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
    if (process.env.OANDA_KEY) {
      try { packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 }); }
      catch (e) { console.warn(`[monday-fib-atlas-live] ${sym}: gap-fill failed on cold start (${e.message})`); }
    }
    const bounded = boundPacked(packed, LIVE_WINDOW_DAYS);
    liveCache.set(pair, { packed: bounded, lastBarTime: bounded.times[bounded.n - 1] });
    console.log(`[monday-fib-atlas-live] ${sym}: warm (${bounded.n.toLocaleString()} bars, ${LIVE_WINDOW_DAYS}d window)`);
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
      const stored = await getJSON(`${PREFIX}/${pair}-votetrades.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no Monday vote-backtest data for ${req.params.instrument} yet` });
      const minMargin = req.query.minMargin ? Number(req.query.minMargin) : 2;
      const stopTightenFrac = req.query.stopTightenFrac ? Number(req.query.stopTightenFrac) : null;
      const minCostRatio = req.query.minCostRatio ? Number(req.query.minCostRatio) : null;
      const marginFiltered = stored.trades.filter(t => t.margin >= minMargin);
      const filtered = applyCostEfficiencyFilter(marginFiltered, stored.cost, minCostRatio);
      const trades = applyFadeStopFraction(filtered, stopTightenFrac);
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, cost: stored.cost,
                 splitDate: stored.splitDate, minMargin, stopTightenFrac, minCostRatio, summary: stored.summaryByMargin?.[minMargin] ?? null, trades });
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
        loadPairVoteTrades: async pair => getJSON(`${PREFIX}/${pair}-votetrades.json`),
      });
      if (result.error) return res.status(404).json({ ok: false, error: result.error, missing: result.missing });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
