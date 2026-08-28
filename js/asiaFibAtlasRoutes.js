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
import { asiaFibAtlasWalk, asiaFibAtlasLiveLadder } from './asiaFibAtlasEngine.js';
import { buildAsiaFibAtlasBook, renderAsiaFibBookText, DIMENSIONS } from './asiaFibAtlasReport.js';
import { matchLiveContext } from './levelAtlasReport.js';
import { runBarrierWalkForward } from './asiaFibAtlasVoteReview.js';
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
const LIVE_WINDOW_DAYS = 180;   // same margin Level Atlas uses — comfortably over this engine's own widest lookback (hurstBucket's 80 trailing daily closes)

async function loadIvByDate(pair) {
  const product = CVOL_PRODUCT_OVERRIDE[pair] ?? pair.toUpperCase();
  return CVOL_PRODUCTS.includes(product) ? await cvolSeries(product) : null;
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
    await putJSON(`${PREFIX}/${pair}-votetrades.json`, {
      instrument: sym, generatedAt: new Date().toISOString(), cost, splitDate: book.splitDate,
      trades: wf1?.trades ?? [],   // margin>=1 superset — the page filters down to margin=2 client-side
      summaryByMargin,
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

  // GET /api/asia-fib-atlas/vote-trades/EURUSD[?minMargin=2] — the barrier-
  // priced OOS trade list for the trade-review page (asia-fib-atlas-vote-
  // backtest.html). Same contract as `/api/level-atlas/vote-trades/:instrument`
  // (minMargin filters server-side; summary comes pre-computed per margin).
  app.get('/api/asia-fib-atlas/vote-trades/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}-votetrades.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no vote-backtest data for ${req.params.instrument} yet` });
      const minMargin = req.query.minMargin ? Number(req.query.minMargin) : 2;
      const trades = stored.trades.filter(t => t.margin >= minMargin);
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, cost: stored.cost,
                 splitDate: stored.splitDate, minMargin, summary: stored.summaryByMargin?.[minMargin] ?? null, trades });
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
