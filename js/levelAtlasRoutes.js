/**
 * Level Atlas — Express routes.
 *
 * Same async-job pattern as `/api/honest-forecast/*` and `/api/forecast-analysis/*`:
 * a run is expensive (~40-80s per instrument, full M1 history), so `POST /run`
 * kicks it off and returns a `jobId`; `GET /status/:jobId` polls; the finished
 * book is ALSO persisted to R2 (keyed by instrument) so a later page load reads
 * it instantly without re-running the walk.
 *
 * `GET /card/:instrument` is the fast path for a UI (today.html's per-pair card,
 * or any future panel): serves the pre-built, JSON-only `buildAtlasCard()`
 * shape straight from R2 — chip-ready headline entries plus the full book for
 * drill-down, no HTML, no text formatting. That split (engine → report → card
 * JSON → UI decides presentation) is deliberate: a page can render the same
 * data as a chip today and a full table tomorrow without this module changing.
 *
 * `GET /live/:instrument` serves TODAY's actual touches (if any), each matched
 * against the stored book's OOS-confirmed dimensions — the drawer's own
 * "supports / challenges" shape (`js/levelAtlasReport.js`'s `matchLiveContext`,
 * mirroring `today.html`'s `drThesisSec`). Computed ONCE per `/run` (the same
 * walk that builds the historical book naturally produces the most recent
 * date's touches too — see `runOne` — so this is NOT a second M1 walk), and
 * served from the SAME stored R2 blob as `/card` and `/book`. `/run` should be
 * called periodically (a scheduled job) to keep this current through the day;
 * this route itself never re-walks M1, so it stays fast regardless.
 */
import { loadM1ForPair } from './volBacktestM1Engine.js';
import { atlasWalk } from './levelAtlasEngine.js';
import { buildAtlasBook, buildAtlasCard, sessionTransitionTable, renderBookText, matchLiveContext } from './levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, buildPortfolioDailySeries, inverseVolWeights, riskAdjustTrades, applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopTightening } from './levelAtlasVoteReview.js';
import { summarizeTrades, maxDrawdownFromPnls } from './metricsCore.js';
import { portfolioStats } from './backtestStats.js';
import { costForPair } from './perLineStrategy.js';
import { putJSON, getJSON, listKeys } from './r2Store.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { instrument as instrumentMeta, oandaSymbol } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { fetchM1Range } from './volBacktestEngine.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Same precomputed-local-file + live-source-fallback pattern server.js
// already uses for Pattern Lab: the sandbox this was built in has M1 read
// access (R2/parquet/Drive) but no R2 WRITE credentials, so a one-off
// analysis script writes here directly; the real Railway deploy (which does
// have R2 creds) writes to R2 via `runOne` above via the nightly auto-rebuild.
// The route below picks whichever of this file / R2 has the NEWER
// `generatedAt`, not "R2 always wins" — a nightly Railway run landing
// between two pushes can leave R2 holding real but genuinely OLDER data
// than a freshly-pushed local file (hit for real 2026-08-26: R2 had a
// pre-`session`-field copy shadowing the local file that had it).
const VOTE_TRADES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'analysis', 'output', 'level-atlas-vote-trades');
function loadLocalVoteTrades(pair) {
  try { return JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8')); }
  catch { return null; }
}

// Exported for js/levelAtlasRoutes.test.mjs — pure, so the "compare
// generatedAt, don't assume one source always wins" logic is checkable
// without mocking R2 or the filesystem.
export function pickFresher(r2Data, localData) {
  if (!r2Data) return localData;
  if (!localData) return r2Data;
  return Date.parse(r2Data.generatedAt) >= Date.parse(localData.generatedAt) ? r2Data : localData;
}

const PREFIX = 'level-atlas';
const DEFAULT_REARM = 0.3;

const jobs = new Map();
function purgeStale() {
  const cutoff = Date.now() - 2 * 60 * 60_000;
  for (const [id, job] of jobs) if (job.startedAt < cutoff) jobs.delete(id);
}

async function runOne(instrument, { rearmFracs = [0.15, 0.3, 0.5], onLog = () => {} } = {}) {
  const pair = String(instrument).toLowerCase();
  const sym = String(instrument).toUpperCase();
  onLog(`${sym}: loading M1…`);
  let packed = await loadM1ForPair(pair);
  if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
  // The R2 M1 parquet is a static, periodically-uploaded snapshot — nothing
  // appends to it automatically. Top it up to "now" from OANDA so the /live
  // section reflects today's actual session rather than whenever the parquet
  // was last synced. Same brick + fetch fn as forecastAnalyserStore.refreshPair.
  if (process.env.OANDA_KEY) {
    try {
      const before = packed.n;
      packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), onLog });
      if (packed.n > before) onLog(`${sym}: gap-filled +${(packed.n - before).toLocaleString()} bars to now`);
    } catch (e) { onLog(`${sym}: gap-fill failed (${e.message}) — using stored M1`); }
  }
  const assetClass = assetClassFor(pair);
  onLog(`${sym}: ${packed.n.toLocaleString()} M1 bars, assetClass ${assetClass} — walking the ladder…`);
  const { touches, pending, coverage } = atlasWalk(packed, { instrument: sym, assetClass, rearmFracs, pendingRearmFrac: DEFAULT_REARM });
  onLog(`${sym}: ${touches.length.toLocaleString()} touch-records, ${coverage?.sessions ?? 0} sessions (${coverage?.from}→${coverage?.to})`);

  const books = {}, cards = {};
  for (const rf of rearmFracs) {
    const book = buildAtlasBook(touches, { rearmFrac: rf });
    if (!book) continue;
    books[rf] = book;
    cards[rf] = buildAtlasCard(book);
  }
  const sessionTransitions = {
    asiaToLondon: sessionTransitionTable(touches, 'asiaVol', 'londonVol'),
  };

  // ── Vote-margin barrier backtest (2026-08-26) — the honest, walk-forward-
  // validated fixed-target/stop trade list (js/levelAtlasVoteReview.js):
  // decide fade/follow from a touch's own held-dimension vote, price it
  // against the REAL rung distances (not the best/worst point the path
  // reached), reusing the SAME touches/book already built above — no second
  // M1 walk. Persisted SEPARATELY from the main book blob (that one's own
  // comment says raw touches are deliberately left out for size; this is a
  // much smaller derived artifact — one row per decided OOS touch — kept
  // apart so `level-atlas-vote-backtest.html` can fetch it without pulling
  // the full book too).
  const voteBook = books[DEFAULT_REARM];
  if (voteBook) {
    try {
      const cost = costForPair(pair, assetClass);
      const trades = buildBarrierTrades(touches, voteBook, { rearmFrac: DEFAULT_REARM, cost });
      const summaryByMargin = {};
      for (const m of [1, 2, 3, 4]) {
        const sub = trades.filter(t => t.margin >= m);
        summaryByMargin[m] = summarizeTrades(sub.map(t => t.pnlPct), sub.map(t => t.date));
      }
      await putJSON(`${PREFIX}/${pair}-votetrades.json`, {
        instrument: sym, generatedAt: new Date().toISOString(), cost, splitDate: voteBook.splitDate,
        trades, summaryByMargin,
      });
    } catch (e) { onLog(`${sym}: vote-trades build/persist failed (${e.message}) — non-fatal, main book still saved`); }
  }

  // ── Live snapshot — the MOST RECENT date's touches, matched against the
  // DEFAULT_REARM book. Free: `touches` already contains this date's records
  // (atlasWalk processes every day including the last), so this is a filter
  // + match, not a second M1 walk. With the gap-fill above, `packed` extends
  // through "right now", so these ARE genuinely live in-progress touches
  // (outcome:'neither' until they resolve) — see `atlasLiveToday`'s docstring
  // for why that degrades correctly with no special-casing needed here. If
  // OANDA_KEY is unset or the gap-fill call fails, this silently falls back
  // to whatever date the stored parquet last covered.
  const liveBook = books[DEFAULT_REARM];
  const liveDate = coverage?.to ?? null;
  const liveTouches = (liveDate && liveBook)
    ? touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.date === liveDate)
        .map(t => ({ touch: t, match: matchLiveContext(liveBook, t) }))
    : [];
  // Rungs NOT yet touched today (`atlasWalk`'s `pending`, computed only for the
  // live day) — same match against the same book, so a UI can show "if price
  // reaches here next, history says X" for a level price hasn't hit yet, not
  // only for ones it already has. Distance fields ride along so the client can
  // render "N pips away" without a second lookup.
  const pendingTouches = (liveDate && liveBook)
    ? (pending ?? []).map(t => ({ touch: t, match: matchLiveContext(liveBook, t) }))
    : [];

  const result = {
    instrument: sym, assetClass, coverage, generatedAt: new Date().toISOString(),
    defaultRearm: DEFAULT_REARM, rearmFracs,
    books, cards, sessionTransitions,
    live: { date: liveDate, touches: liveTouches, pending: pendingTouches },
    // Raw touches are NOT persisted (large; the aggregated book is the product) —
    // re-run to regenerate them if a future dimension needs re-aggregating.
  };
  await putJSON(`${PREFIX}/${pair}.json`, result);
  return result;
}

// ── Fast live-context poll ────────────────────────────────────────────────
// The book (`buildAtlasBook`, above) is already a pre-analyzed, cross-
// referenced JSON playbook — reading it is instant, R2-cheap, and was never
// the bottleneck. What's expensive is a DIFFERENT step: figuring out which
// row of that playbook applies RIGHT NOW, which means deriving live context
// (session, day-vol regime, VWAP side, VuManChu, confluence…) from raw M1
// price data — and every context input in `levelAtlasEngine.js` is a
// rolling-window function that only reads a bounded trailing slice (widest
// is `swing_fib`'s 60 trading days), so there is no reason that derivation
// needs the FULL multi-year M1 archive. Profiled on real EURUSD: loading +
// processing the full ~3.8M-bar file costs 40-160s; the identical result
// from a ~180-CALENDAR-day bounded window costs ~3s.
//
// The remaining piece: the underlying M1 data only actually changes once a
// minute (M1 = one-minute bars) — there's nothing new to derive more often
// than that. So this cache recomputes the context/pending snapshot only
// when a NEW M1 bar has actually closed; a poll that lands inside the same
// still-forming minute just returns the cached result, near-instant. The
// book itself is re-read from R2 on every call (cheap; and it's how a fresh
// /run's updated numbers reach a poll without restarting anything).
//
// In-memory only — like the `jobs` map above, this is wiped by a Railway
// restart. Cold after a restart: the first poll for a pair pays the full
// load once (kicked off in the background, not on the request thread — see
// `getFastLive`), then stays fast for the life of the process.
const liveCache = new Map();   // pair -> { packed, lastBarTime, result: {date,touches,pending} }
const liveWarming = new Set(); // pairs currently doing their one-time cold load

const LIVE_WINDOW_DAYS = 180;   // comfortable margin over the widest context lookback (60 trading days)

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

// One walk over the (bounded, already-warm) packed series -> today's raw
// touches + pending, UNMATCHED (matching against the book happens outside
// the cache, every call, so a fresh /run's book reaches a poll immediately
// without needing to also invalidate this cache).
function computeLiveContext(pair, packed) {
  const sym = pair.toUpperCase();
  const assetClass = assetClassFor(pair);
  const { touches, pending, coverage } = atlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const liveDate = coverage?.to ?? null;
  const liveTouches = liveDate ? touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.date === liveDate) : [];
  return { date: liveDate, touches: liveTouches, pending: pending ?? [] };
}

async function coldStartLiveCache(pair) {
  const sym = pair.toUpperCase();
  liveWarming.add(pair);
  try {
    let packed = await loadM1ForPair(pair);
    if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
    if (process.env.OANDA_KEY) {
      try { packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 }); }
      catch (e) { console.warn(`[level-atlas-live] ${sym}: gap-fill failed on cold start (${e.message})`); }
    }
    const bounded = boundPacked(packed, LIVE_WINDOW_DAYS);
    const result = computeLiveContext(pair, bounded);
    liveCache.set(pair, { packed: bounded, lastBarTime: bounded.times[bounded.n - 1], result });
    console.log(`[level-atlas-live] ${sym}: warm (${bounded.n.toLocaleString()} bars, ${LIVE_WINDOW_DAYS}d window)`);
  } catch (e) {
    console.error(`[level-atlas-live] ${sym}: cold start failed — ${e.message}`);
  } finally {
    liveWarming.delete(pair);
  }
}

// Returns { warming: true } while the one-time cold load is in flight (kicked
// off in the background on first call, not blocking the request thread — a
// 40-80s HTTP response would just hit a client/proxy timeout). Once warm,
// every call incrementally tops the cache up (cheap — only fetches bars newer
// than what's already cached; a no-op most polls since M1 only advances once
// a minute) and recomputes ONLY when that top-up actually moved the last bar.
async function getFastLive(pair) {
  const sym = pair.toUpperCase();
  let entry = liveCache.get(pair);
  if (!entry) {
    if (!liveWarming.has(pair)) coldStartLiveCache(pair).catch(() => {});
    return { warming: true, date: null, touches: [], pending: [] };
  }
  if (process.env.OANDA_KEY) {
    try {
      const before = entry.packed.n;
      entry.packed = await gapFillPacked(entry.packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 });
      if (entry.packed.n > before) entry.packed = boundPacked(entry.packed, LIVE_WINDOW_DAYS);   // keep the window from growing forever
    } catch (e) { /* stale-but-serving beats erroring a poll — log once, not every 5s */ }
  }
  const newestBar = entry.packed.times[entry.packed.n - 1];
  if (newestBar !== entry.lastBarTime) {
    entry.result = computeLiveContext(pair, entry.packed);
    entry.lastBarTime = newestBar;
  }
  return { warming: false, ...entry.result };
}

function startRunJob({ instruments }) {
  purgeStale();
  const jobId = `la_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const log = [];
  jobs.set(jobId, { status: 'running', startedAt, log });
  (async () => {
    try {
      const results = {};
      for (const instrument of instruments) {
        try {
          results[instrument] = await runOne(instrument, { onLog: m => { log.push(m); console.log('[level-atlas]', m); } });
        } catch (e) {
          log.push(`${instrument}: FAILED — ${e.message}`);
          console.error('[level-atlas]', instrument, e.message);
        }
      }
      jobs.set(jobId, { status: 'done', startedAt, log, result: { instruments: Object.keys(results) } });
    } catch (e) {
      jobs.set(jobId, { status: 'error', startedAt, log, error: e.message });
    }
  })();
  return jobId;
}

// Exported for js/levelAtlasRoutes.test.mjs only — not part of the route API.
export { boundPacked, getFastLive, liveCache, liveWarming, startRunJob };

/** Mount all /api/level-atlas/* routes. */
export function mountLevelAtlasRoutes(app, express) {
  // POST /api/level-atlas/run  { instruments: ['EURUSD', ...] }  -> { jobId }
  app.post('/api/level-atlas/run', express.json({ limit: '8kb' }), (req, res) => {
    const b = req.body ?? {};
    const instruments = Array.isArray(b.instruments) && b.instruments.length
      ? b.instruments.map(s => String(s).toUpperCase())
      : ['EURUSD'];
    res.json({ ok: true, jobId: startRunJob({ instruments }) });
  });

  app.get('/api/level-atlas/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'unknown jobId' });
    res.json({ ok: true, ...job });
  });

  // GET /api/level-atlas/card/EURUSD[?rearm=0.3]
  // Fast path for a UI: pre-built chip-ready JSON straight from R2 (no walk).
  app.get('/api/level-atlas/card/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no atlas data for ${req.params.instrument} yet — POST /api/level-atlas/run first` });
      const rearm = req.query.rearm ? Number(req.query.rearm) : stored.defaultRearm;
      const card = stored.cards?.[rearm];
      if (!card) return res.status(404).json({ ok: false, error: `no card for rearm=${rearm} — available: ${Object.keys(stored.cards ?? {}).join(', ')}` });
      res.json({ ok: true, instrument: stored.instrument, assetClass: stored.assetClass, coverage: stored.coverage,
                 generatedAt: stored.generatedAt, rearm, card, sessionTransitions: stored.sessionTransitions });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/level-atlas/live/EURUSD — today's touches (if any), each matched
  // against the stored book. Served straight from R2 — no M1 load, no walk.
  app.get('/api/level-atlas/live/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no atlas data for ${req.params.instrument} yet — POST /api/level-atlas/run first` });
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, live: stored.live ?? { date: null, touches: [], pending: [] } });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/level-atlas/fastlive/EURUSD — same shape as /live, but computed
  // from a warm, incrementally-updated bounded window (see getFastLive above)
  // instead of served from whatever the last /run happened to store. Meant to
  // be polled every few seconds while a drawer is open: most calls cost
  // nothing (cached, no new M1 bar yet), and the book itself is re-read from
  // R2 fresh every call, so a newly-finished /run reaches a poll immediately.
  // { warming: true } on a cold cache — the client should keep polling; the
  // one-time load is running in the background, not blocking this request.
  app.get('/api/level-atlas/fastlive/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const live = await getFastLive(pair);
      if (live.warming) return res.json({ ok: true, instrument: pair.toUpperCase(), warming: true, live: { date: null, touches: [], pending: [] } });
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      const book = stored?.books?.[DEFAULT_REARM] ?? null;
      const matchedTouches = book ? live.touches.map(t => ({ touch: t, match: matchLiveContext(book, t) })) : live.touches.map(t => ({ touch: t, match: null }));
      const matchedPending = book ? live.pending.map(t => ({ touch: t, match: matchLiveContext(book, t) })) : live.pending.map(t => ({ touch: t, match: null }));
      res.json({ ok: true, instrument: pair.toUpperCase(), warming: false, bookGeneratedAt: stored?.generatedAt ?? null,
                 live: { date: live.date, touches: matchedTouches, pending: matchedPending } });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/level-atlas/book/EURUSD[?rearm=0.3] — the FULL book (every
  // dimension, all buckets) for a drill-down page, not the compact card.
  app.get('/api/level-atlas/book/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no atlas data for ${req.params.instrument} yet` });
      const rearm = req.query.rearm ? Number(req.query.rearm) : stored.defaultRearm;
      const book = stored.books?.[rearm];
      if (!book) return res.status(404).json({ ok: false, error: `no book for rearm=${rearm}` });
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, rearm, book });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/level-atlas/book/EURUSD/text[?rearm=0.3] — the plain-text render,
  // for a quick terminal/curl read without a UI.
  app.get('/api/level-atlas/book/:instrument/text', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).type('text/plain').send(`no atlas data for ${req.params.instrument} yet`);
      const rearm = req.query.rearm ? Number(req.query.rearm) : stored.defaultRearm;
      res.type('text/plain').send(renderBookText(stored.books?.[rearm]));
    } catch (e) {
      res.status(500).type('text/plain').send(`Error: ${e.message}`);
    }
  });

  // GET /api/level-atlas/vote-trades/EURUSD[?minMargin=3] — the barrier-priced
  // OOS trade list from js/levelAtlasVoteReview.js (see `runOne` above for how
  // it's built/persisted): real fixed target/stop pnl, not MFE/MAE, for
  // level-atlas-vote-backtest.html's chart + trade table. `minMargin` filters
  // server-side (cheap — a few thousand rows) so the client never has to ship
  // the full unfiltered list just to show a tighter gate.
  app.get('/api/level-atlas/vote-trades/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      // Whichever of R2 / the local bootstrap snapshot has the NEWER
      // `generatedAt` wins — not "R2 always wins". A blind R2-always-wins
      // rule (this route's own first version) has exactly the staleness
      // failure mode it was meant to prevent: a nightly `/run` that executed
      // on Railway BETWEEN two pushes writes a version of this file to R2
      // that predates a field added in the second push (e.g. `session`) —
      // that R2 copy is real production data, but it is not the freshest
      // data, and would otherwise permanently shadow the newly-pushed local
      // file until the next nightly run. Comparing timestamps instead of
      // assuming "R2 = newest" fixes this in both directions.
      const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
      if (!stored) return res.status(404).json({ ok: false, error: `no vote-backtest data for ${req.params.instrument} yet` });
      const minMargin = req.query.minMargin ? Number(req.query.minMargin) : 1;
      const trades = stored.trades.filter(t => t.margin >= minMargin);
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, cost: stored.cost,
                 splitDate: stored.splitDate, minMargin, summary: stored.summaryByMargin?.[minMargin] ?? null, trades });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/level-atlas/vote-portfolio?pairs=eurusd,gbpusd,gold,usdjpy,audusd
  //   &minMargin=3&maxConcurrent=1&perDirection=false&weighting=equal|inverse-vol
  //   &sizing=nav|fixed-risk&riskPct=1&maxHeatPct=&targetVol=10
  // Combines MULTIPLE pairs' own vote-trades into ONE portfolio — reads the
  // SAME persisted trade lists `/vote-trades/:instrument` serves (no second
  // compute), applies `applyConcurrencyCap` per pair (the real, quantified
  // answer to "trades aren't independent" — see LEGO_MODULES.md), then
  // `buildPortfolioDailySeries` + `portfolioStats` for the honest combined
  // Sharpe/CAGR/maxDD. `perPair` in the response is what makes the
  // diversification story visible: each pair's own kept/skipped count,
  // weight, and standalone Sharpe, next to the combined number.
  //
  // `sizing='nav'` is the original NAV-split model: each pair gets a fixed
  // fraction of capital (equal or inverse-vol) and its OWN raw price return
  // (`pnlPct`) is scaled by that fraction. `sizing='fixed-risk'` (default,
  // 2026-08-27) is the forward-implementable alternative: every trade, on
  // every pair, risks the SAME `riskPct` of account off its OWN stop
  // distance (`riskAdjustTrades`) — no NAV split needed, no need to know
  // trade count/frequency in advance, which a NAV split's weight fractions
  // implicitly assume. In this mode `weighting` is ignored (ignoring it
  // rather than erroring — a stale UI param shouldn't 400) and every pair's
  // combine-weight is forced to 1 (trades already carry their real
  // risk-scaled outcome; a second NAV-style scale-down would double-dilute).
  //
  // `maxHeatPct` (fixed-risk mode only, optional) applies `applyPortfolioHeatCap`
  // ACROSS pairs on top of each pair's own per-pair cap — the gap the
  // per-pair cap alone leaves open: several different pairs firing at once,
  // each independently risking `riskPct`, can silently stack simultaneous
  // exposure well past any single trade's own risk. When set, the response
  // ALSO includes `statsUncapped` (the same combined series without the
  // cross-pair budget) so the impact is directly comparable, not just
  // asserted. `targetVol` (default 10) is a real, adjustable dial on
  // `portfolioStats`' vol-target scaling — NOT a cap on returns; setting it
  // above the portfolio's own realized vol LEVERS UP instead of down.
  app.get('/api/level-atlas/vote-portfolio', async (req, res) => {
    try {
      const pairs = (req.query.pairs ? String(req.query.pairs).split(',') : ['eurusd', 'gbpusd', 'gold', 'usdjpy', 'audusd'])
        .map(p => p.trim().toLowerCase()).filter(Boolean);
      const minMargin = req.query.minMargin ? Number(req.query.minMargin) : 3;
      const maxConcurrent = req.query.maxConcurrent ? Number(req.query.maxConcurrent) : 1;
      const perDirection = req.query.perDirection === 'true';
      const weighting = req.query.weighting === 'inverse-vol' ? 'inverse-vol' : 'equal';
      const sizing = req.query.sizing === 'fixed-risk' ? 'fixed-risk' : 'nav';
      const riskPct = req.query.riskPct ? Number(req.query.riskPct) : 1;
      const maxHeatPct = (sizing === 'fixed-risk' && req.query.maxHeatPct) ? Number(req.query.maxHeatPct) : null;
      const targetVol = req.query.targetVol ? Number(req.query.targetVol) : 10;
      // Fade-stop tightening (2026-08-27) — OOS-validated (scripts/oos_validate_fade_stop.mjs,
      // 93% of pairs improved OOS Sharpe using an IS-only-chosen stop) BEFORE
      // being wired in here, the same discipline the throttle/heat-cap should
      // have gotten first. Optional, off by default — not silently changing
      // the baseline trade pricing everything else on this page was already
      // validated against.
      const fadeStopTighten = req.query.fadeStopTighten === 'true';

      const perPairTradesRaw = {}, perPair = {}, missing = [];
      const fadeStopInfo = {};
      const storedByPair = {};
      for (const pair of pairs) {
        const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
        if (!stored) { missing.push(pair.toUpperCase()); continue; }
        storedByPair[stored.instrument] = stored;
        let filtered = stored.trades.filter(t => t.margin >= minMargin);
        // Deliberately scoped to THIS pair's own trades — the candidate grid
        // is in raw pips, and pip size varies 100x+ across instruments
        // (EURUSD pip=0.0001 vs GOLD/index pip=1), so tightening must never
        // pool trades across pairs before gridding (a bug caught and fixed
        // before this was built — see LEGO_MODULES.md).
        if (fadeStopTighten) {
          const tightened = applyFadeStopTightening(filtered, { cost: stored.cost });
          filtered = tightened.trades;
          if (tightened.stopPips != null) fadeStopInfo[stored.instrument] = { stopPips: tightened.stopPips, percentile: tightened.percentile };
        }
        const capped = applyConcurrencyCap(filtered, { maxConcurrent, perDirection });
        const sym = stored.instrument;
        perPairTradesRaw[sym] = capped?.kept ?? [];
        perPair[sym] = {
          totalDecided: filtered.length,
          kept: capped?.kept?.length ?? 0,
          skipped: capped?.skippedCount ?? 0,
          ownWinRate: capped?.keptSummary?.winRate ?? null,
        };
      }
      if (!Object.keys(perPairTradesRaw).length) return res.status(404).json({ ok: false, error: `no vote-backtest data for any of: ${pairs.join(',')}`, missing });

      // `rMultiple` is invariant to sizing scheme (it's the trade's own
      // realized outcome ÷ its own stop-based risk unit) — always attached,
      // both modes, so the client's R-multiples CSV never has to recompute
      // it (and can't be broken by pnlPct meaning different things per mode).
      // pnlPct itself only gets REPLACED by the risk-scaled figure in
      // fixed-risk mode; nav mode keeps the original raw price-based %. `pair`
      // is tagged here (not just at the final trades[] step) so a cross-pair
      // merge (`applyPortfolioHeatCap`) can still tell which pair a trade
      // came from after flattening.
      const perPairTradesForStats = {};
      for (const sym of Object.keys(perPairTradesRaw)) {
        const adjusted = riskAdjustTrades(perPairTradesRaw[sym], riskPct);
        const withPair = (sizing === 'fixed-risk' ? adjusted : perPairTradesRaw[sym].map((t, i) => ({ ...t, rMultiple: adjusted[i].rMultiple })))
          .map(t => ({ ...t, pair: sym }));
        perPairTradesForStats[sym] = withPair;
      }

      // ownSharpe MUST use the same daily-return-series Sharpe as the combined
      // portfolio (portfolioStats) — NOT summarizeTrades' per-trade-annualized
      // Sharpe (capped.keptSummary.sharpe). Verified the two methods disagree by
      // ~25-35% on every one of the 5 default pairs even for identical trades
      // (e.g. solo EURUSD: portfolioStats 3.19 vs summarizeTrades 2.42), so mixing
      // them in the "naive avg -> combined" callout made part of the apparent
      // diversification benefit a methodology switch, not real diversification.
      // One Sharpe formula, used everywhere on this page. Deliberately computed
      // from the PRE-heat-cap trade list — ownSharpe represents what a pair
      // would achieve traded ALONE, unaffected by cross-pair capital
      // competition, which is exactly what makes it the right "naive" baseline
      // to compare the heat-capped combined result against.
      for (const sym of Object.keys(perPairTradesForStats)) {
        const solo = buildPortfolioDailySeries({ [sym]: perPairTradesForStats[sym] });
        perPair[sym].ownSharpe = solo ? portfolioStats(solo.dailyReturns, { mc: false, targetVol }).sharpe : null;
      }

      // Cross-pair portfolio heat cap — applied AFTER each pair's own cap, on
      // the merged, globally-chronological trade list. Only meaningful in
      // fixed-risk mode (NAV mode's weight fractions already cap TOTAL
      // exposure at 100% by construction, so there's no analogous stacking
      // gap to close there).
      let perPairTradesFinal = perPairTradesForStats;
      let heatCap = null;
      if (maxHeatPct) {
        const heatResult = applyPortfolioHeatCap(perPairTradesForStats, { maxHeatPct });
        if (heatResult) {
          const byPair = {};
          for (const t of heatResult.kept) (byPair[t.pair] ??= []).push(t);
          perPairTradesFinal = byPair;
          heatCap = { maxHeatPct, skippedCount: heatResult.skippedCount, totalCount: heatResult.totalCount };
          for (const sym of Object.keys(perPair)) {
            perPair[sym].keptAfterHeat = byPair[sym]?.length ?? 0;
          }
        }
      }

      const buildWeights = perPairTrades => sizing === 'fixed-risk'
        ? Object.fromEntries(Object.keys(perPairTrades).map(p => [p, 1]))
        : (weighting === 'inverse-vol' ? inverseVolWeights(perPairTrades) : null);

      // `portfolioStats`' own `maxDD` is the COMPOUNDED (reinvested) drawdown —
      // correct for an account that scales position size up with a growing
      // balance, but `riskAdjustTrades` never actually does that: every trade
      // risks a CONSTANT `riskPct` of the ORIGINAL notional, never a growing
      // one. `maxDrawdownFromPnls` (already a Tier-1 brick, `metricsCore.js`)
      // is the honest complement — a peak-to-trough drawdown on the ADDITIVE
      // (summed, non-reinvested) path, matching what the "Non-compounded"
      // equity-curve line already plots, and matching how a trader who does
      // NOT scale risk up with a growing account actually experiences pain.
      // Both numbers are real; they answer different questions ("what if I
      // reinvest" vs "what if I always risk the same fixed amount") and
      // neither should stand in silently for the other.
      const withNonCompoundedDD = (statsObj, dailyReturns) => ({ ...statsObj, maxDDNonCompounded: +maxDrawdownFromPnls(dailyReturns).toFixed(2) });

      const weights = buildWeights(perPairTradesFinal);
      const combined = buildPortfolioDailySeries(perPairTradesFinal, weights ? { weights } : {});
      const statsBeforeThrottle = portfolioStats(combined.dailyReturns, { mc: false, targetVol });

      // Drawdown throttle — de-risks after the STRATEGY'S OWN realized equity
      // breaches `triggerDD`, restores once it recovers to `restoreDD`. Built
      // to target what `maxHeatPct` (a cap on SIMULTANEOUS exposure) was
      // tested and shown NOT to fix: the portfolio's real worst drawdown was
      // a sustained, correlated losing STRETCH over time, not a pile-up of
      // concurrent positions. Applied on the FINAL (post-heat-cap) combined
      // series — the two features compose rather than compete.
      const throttleOn = req.query.throttle === 'true';
      const triggerDD = req.query.triggerDD ? Number(req.query.triggerDD) : -5;
      const restoreDD = req.query.restoreDD ? Number(req.query.restoreDD) : 0;
      const throttleMult = req.query.throttleMult ? Number(req.query.throttleMult) : 0.5;
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

      // When a heat cap is active, also report what the SAME series would
      // have looked like without it (throttle setting held CONSTANT, so this
      // isolates the heat cap's own marginal effect) — a direct, side-by-side
      // impact readout, not just an assertion that it helps.
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

      // When fade-stop tightening is on, also report the SAME pipeline
      // (heat cap + throttle settings held CONSTANT) built from the
      // UNTIGHTENED trades — isolates tightening's own marginal effect,
      // same discipline as statsUncapped/statsNoThrottle above.
      let statsNoFadeTighten = null;
      if (fadeStopTighten && Object.keys(fadeStopInfo).length) {
        const untightenedPerPair = {};
        for (const sym of Object.keys(storedByPair)) {
          const stored = storedByPair[sym];
          const filtered = stored.trades.filter(t => t.margin >= minMargin);
          const capped = applyConcurrencyCap(filtered, { maxConcurrent, perDirection });
          const adjusted = riskAdjustTrades(capped?.kept ?? [], riskPct);
          const withPair = (sizing === 'fixed-risk' ? adjusted : (capped?.kept ?? []).map((t, i) => ({ ...t, rMultiple: adjusted[i].rMultiple })))
            .map(t => ({ ...t, pair: sym }));
          untightenedPerPair[sym] = withPair;
        }
        let finalUntightened = untightenedPerPair;
        if (maxHeatPct) {
          const heatResult = applyPortfolioHeatCap(untightenedPerPair, { maxHeatPct });
          if (heatResult) {
            const byPair = {};
            for (const t of heatResult.kept) (byPair[t.pair] ??= []).push(t);
            finalUntightened = byPair;
          }
        }
        const weightsUntightened = buildWeights(finalUntightened);
        const combinedUntightened = buildPortfolioDailySeries(finalUntightened, weightsUntightened ? { weights: weightsUntightened } : {});
        let untightenedReturns = combinedUntightened.dailyReturns;
        if (throttleOn) {
          const trU = applyDrawdownThrottle(untightenedReturns, combinedUntightened.dates, { triggerDD, restoreDD, throttleMult });
          if (trU) untightenedReturns = trU.dailyReturns;
        }
        statsNoFadeTighten = withNonCompoundedDD(portfolioStats(untightenedReturns, { mc: false, targetVol }), untightenedReturns);
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

      res.json({
        ok: true, pairs: Object.keys(perPairTradesForStats), missing, minMargin, maxConcurrent, perDirection, weighting,
        sizing, riskPct, heatCap, targetVol, throttle,
        fadeStopTighten, fadeStopInfo,
        stats, statsUncapped, statsNoThrottle, statsNoFadeTighten, naiveAvgSharpe, days: datesFinal.length,
        equityCurve: datesFinal.map((d, i) => ({ date: d, dailyReturn: dailyReturnsFinal[i] })),
        perPair, trades,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/level-atlas/manifest — which instruments actually have a stored
  // atlas, so a UI can build its instrument picker without guessing or 404ing.
  app.get('/api/level-atlas/manifest', async (req, res) => {
    try {
      const keys = await listKeys(`${PREFIX}/`);
      const instruments = keys.filter(k => k.endsWith('.json')).map(k => k.split('/').pop().replace('.json', '').toUpperCase()).sort();
      res.json({ ok: true, instruments });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
