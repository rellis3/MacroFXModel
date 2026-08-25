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
import { putJSON, getJSON, listKeys } from './r2Store.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { instrument as instrumentMeta, oandaSymbol } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { fetchM1Range } from './volBacktestEngine.js';

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
