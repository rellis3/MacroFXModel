/**
 * Session Path — Express routes. Same async-job + R2-persistence + warm-cache
 * pattern as `js/levelAtlasRoutes.js` (the touch-level sibling this module is
 * built to complement, not duplicate) — see that file's header for the
 * rationale; nothing here should silently diverge from it.
 *
 * `POST /run` walks the full history (one row per day × checkpoint hour —
 * see `sessionPathEngine.js`), builds the book, persists to R2.
 * `GET /card/:instrument` serves the pre-built book straight from R2.
 * `GET /fastlive/:instrument` answers "what does today's session shape say
 * RIGHT NOW" from a warm, incrementally-updated bounded window — same
 * `boundPacked`/`getFastLive` design `levelAtlasRoutes.js` already proved
 * out (full load: 40-160s; bounded window: ~3s; warm cache: near-instant).
 */
import { loadM1ForPair } from './volBacktestM1Engine.js';
import { sessionPathWalk } from './sessionPathEngine.js';
import { buildSessionPathBook, matchSessionPath } from './sessionPathReport.js';
import { putJSON, getJSON, listKeys } from './r2Store.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { oandaSymbol } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { fetchM1Range } from './volBacktestEngine.js';

const PREFIX = 'session-path';
const LIVE_WINDOW_DAYS = 180;   // same margin as levelAtlasRoutes.js — comfortably above the widest context lookback

const jobs = new Map();
function purgeStale() {
  const cutoff = Date.now() - 2 * 60 * 60_000;
  for (const [id, job] of jobs) if (job.startedAt < cutoff) jobs.delete(id);
}

async function runOne(instrument, { onLog = () => {} } = {}) {
  const pair = String(instrument).toLowerCase();
  const sym = String(instrument).toUpperCase();
  onLog(`${sym}: loading M1…`);
  let packed = await loadM1ForPair(pair);
  if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
  if (process.env.OANDA_KEY) {
    try {
      const before = packed.n;
      packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000) });
      if (packed.n > before) onLog(`${sym}: gap-filled +${(packed.n - before).toLocaleString()} bars to now`);
    } catch (e) { onLog(`${sym}: gap-fill failed (${e.message}) — using stored M1`); }
  }
  const assetClass = assetClassFor(pair);
  onLog(`${sym}: ${packed.n.toLocaleString()} M1 bars, assetClass ${assetClass} — walking session paths…`);
  const { rows, coverage } = sessionPathWalk(packed, { instrument: sym, assetClass });
  onLog(`${sym}: ${rows.length.toLocaleString()} rows, coverage ${coverage?.from}→${coverage?.to}`);

  const book = buildSessionPathBook(rows);
  if (!book) throw new Error(`${sym}: not enough history to build a session-path book`);

  const result = { instrument: sym, assetClass, coverage, generatedAt: new Date().toISOString(), book };
  await putJSON(`${PREFIX}/${pair}.json`, result);
  return result;
}

function startRunJob({ instruments }) {
  purgeStale();
  const jobId = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const log = [];
  jobs.set(jobId, { status: 'running', startedAt, log });
  (async () => {
    try {
      const results = {};
      for (const instrument of instruments) {
        try { results[instrument] = await runOne(instrument, { onLog: m => { log.push(m); console.log('[session-path]', m); } }); }
        catch (e) { log.push(`${instrument}: FAILED — ${e.message}`); console.error('[session-path]', instrument, e.message); }
      }
      jobs.set(jobId, { status: 'done', startedAt, log, result: { instruments: Object.keys(results) } });
    } catch (e) {
      jobs.set(jobId, { status: 'error', startedAt, log, error: e.message });
    }
  })();
  return jobId;
}

// ── Fast live-context poll — same design as levelAtlasRoutes.js's
// getFastLive: a warm, incrementally-updated bounded window per instrument,
// recomputed only when a new M1 bar actually closes. See that file for the
// full rationale (the book lookup was never the bottleneck; deriving what
// applies RIGHT NOW from raw M1 was).
const liveCache = new Map();
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

// Today's LATEST checkpoint per (side, rung) — sessionPathWalk already only
// emits a checkpoint once it's been reached, so the last one emitted per key
// IS "as of now". Reused as-is, not a second implementation.
function computeLiveRows(pair, packed) {
  const sym = pair.toUpperCase();
  const assetClass = assetClassFor(pair);
  const { rows, coverage } = sessionPathWalk(packed, { instrument: sym, assetClass });
  const liveDate = coverage?.to ?? null;
  const today = liveDate ? rows.filter(r => r.date === liveDate) : [];
  const latestByKey = new Map();
  for (const r of today) {
    const k = `${r.side}|${r.rung}`;
    const cur = latestByKey.get(k);
    if (!cur || r.checkpointHour > cur.checkpointHour) latestByKey.set(k, r);
  }
  return { date: liveDate, rows: [...latestByKey.values()] };
}

async function coldStartLiveCache(pair) {
  const sym = pair.toUpperCase();
  liveWarming.add(pair);
  try {
    let packed = await loadM1ForPair(pair);
    if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
    if (process.env.OANDA_KEY) {
      try { packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 }); }
      catch (e) { console.warn(`[session-path-live] ${sym}: gap-fill failed on cold start (${e.message})`); }
    }
    const bounded = boundPacked(packed, LIVE_WINDOW_DAYS);
    const result = computeLiveRows(pair, bounded);
    liveCache.set(pair, { packed: bounded, lastBarTime: bounded.times[bounded.n - 1], result });
    console.log(`[session-path-live] ${sym}: warm (${bounded.n.toLocaleString()} bars)`);
  } catch (e) {
    console.error(`[session-path-live] ${sym}: cold start failed — ${e.message}`);
  } finally {
    liveWarming.delete(pair);
  }
}

async function getFastLive(pair) {
  const sym = pair.toUpperCase();
  let entry = liveCache.get(pair);
  if (!entry) {
    if (!liveWarming.has(pair)) coldStartLiveCache(pair).catch(() => {});
    return { warming: true, date: null, rows: [] };
  }
  if (process.env.OANDA_KEY) {
    try {
      const before = entry.packed.n;
      entry.packed = await gapFillPacked(entry.packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 });
      if (entry.packed.n > before) entry.packed = boundPacked(entry.packed, LIVE_WINDOW_DAYS);
    } catch (e) { /* stale-but-serving beats erroring a poll */ }
  }
  const newestBar = entry.packed.times[entry.packed.n - 1];
  if (newestBar !== entry.lastBarTime) {
    entry.result = computeLiveRows(pair, entry.packed);
    entry.lastBarTime = newestBar;
  }
  return { warming: false, ...entry.result };
}

export { boundPacked, getFastLive, liveCache, liveWarming };

/** Mount all /api/session-path/* routes. */
export function mountSessionPathRoutes(app, express) {
  app.post('/api/session-path/run', express.json({ limit: '8kb' }), (req, res) => {
    const b = req.body ?? {};
    const instruments = Array.isArray(b.instruments) && b.instruments.length
      ? b.instruments.map(s => String(s).toUpperCase())
      : ['EURUSD'];
    res.json({ ok: true, jobId: startRunJob({ instruments }) });
  });

  app.get('/api/session-path/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'unknown jobId' });
    res.json({ ok: true, ...job });
  });

  // GET /api/session-path/card/EURUSD — the full book straight from R2.
  app.get('/api/session-path/card/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no session-path data for ${req.params.instrument} yet — POST /api/session-path/run first` });
      res.json({ ok: true, instrument: stored.instrument, assetClass: stored.assetClass, coverage: stored.coverage, generatedAt: stored.generatedAt, book: stored.book });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/session-path/fastlive/EURUSD — today's live checkpoint state per
  // (side, rung), matched against the stored book. Pollable every few
  // seconds; see getFastLive above for why that's actually true.
  app.get('/api/session-path/fastlive/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const live = await getFastLive(pair);
      if (live.warming) return res.json({ ok: true, instrument: pair.toUpperCase(), warming: true, live: { date: null, rows: [] } });
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      const book = stored?.book ?? null;
      const matched = live.rows.map(r => ({ row: r, match: book ? matchSessionPath(book, r) : null }));
      res.json({ ok: true, instrument: pair.toUpperCase(), warming: false, bookGeneratedAt: stored?.generatedAt ?? null, live: { date: live.date, rows: matched } });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/session-path/manifest', async (req, res) => {
    try {
      const keys = await listKeys(`${PREFIX}/`);
      const instruments = keys.filter(k => k.endsWith('.json')).map(k => k.split('/').pop().replace('.json', '').toUpperCase()).sort();
      res.json({ ok: true, instruments });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
