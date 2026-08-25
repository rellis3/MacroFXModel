/**
 * Session Handoff — Express routes. Same async-job + R2-persistence +
 * warm-cache pattern as `js/sessionPathRoutes.js`/`js/levelAtlasRoutes.js` —
 * nothing here should silently diverge from that.
 *
 * `POST /run` walks the full history, builds BOTH books (continuation +
 * vol-cluster — see `sessionHandoffReport.js`'s header for why there are
 * two), persists to R2.
 * `GET /card/:instrument` serves the pre-built books straight from R2.
 * `GET /fastlive/:instrument` answers "what did the most recently CLOSED
 * session look like, and what does history say about the session that's
 * about to happen" from a warm, incrementally-updated bounded window.
 */
import { loadM1ForPair } from './volBacktestM1Engine.js';
import { sessionHandoffWalk, TRANSITIONS } from './sessionHandoffEngine.js';
import { buildContinuationBook, buildVolClusterBook, matchContinuation, matchVolCluster } from './sessionHandoffReport.js';
import { putJSON, getJSON, listKeys } from './r2Store.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { oandaSymbol } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { fetchM1Range } from './volBacktestEngine.js';

const PREFIX = 'session-handoff';
const LIVE_WINDOW_DAYS = 180;   // same margin as the sibling engines — comfortably above sessionVolBucket's 20-occurrence lookback

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
  onLog(`${sym}: ${packed.n.toLocaleString()} M1 bars, assetClass ${assetClass} — walking session handoffs…`);
  const { rows, coverage } = sessionHandoffWalk(packed, { instrument: sym, assetClass });
  onLog(`${sym}: ${rows.length.toLocaleString()} rows, coverage ${coverage?.from}→${coverage?.to}`);

  const continuationBook = buildContinuationBook(rows);
  const volClusterBook = buildVolClusterBook(rows);
  if (!continuationBook && !volClusterBook) throw new Error(`${sym}: not enough history to build a session-handoff book`);

  const result = { instrument: sym, assetClass, coverage, generatedAt: new Date().toISOString(), continuationBook, volClusterBook };
  await putJSON(`${PREFIX}/${pair}.json`, result);
  return result;
}

function startRunJob({ instruments }) {
  purgeStale();
  const jobId = `sh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const log = [];
  jobs.set(jobId, { status: 'running', startedAt, log });
  (async () => {
    try {
      const results = {};
      for (const instrument of instruments) {
        try { results[instrument] = await runOne(instrument, { onLog: m => { log.push(m); console.log('[session-handoff]', m); } }); }
        catch (e) { log.push(`${instrument}: FAILED — ${e.message}`); console.error('[session-handoff]', instrument, e.message); }
      }
      jobs.set(jobId, { status: 'done', startedAt, log, result: { instruments: Object.keys(results) } });
    } catch (e) {
      jobs.set(jobId, { status: 'error', startedAt, log, error: e.message });
    }
  })();
  return jobId;
}

// ── Fast live-context poll — same warm, incrementally-updated bounded-window
// design as the sibling engines' getFastLive. Session Handoff's "live" state
// is simpler than Session Path's (no per-checkpoint fan-out): just the most
// recently CLOSED handoff for each of the 3 transitions.
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

// The LATEST row per transition — sessionHandoffWalk already only emits a row
// once both sides of a handoff have closed, so the last one emitted per
// transition IS "the most recently completed handoff of that type".
function computeLiveRows(pair, packed) {
  const sym = pair.toUpperCase();
  const assetClass = assetClassFor(pair);
  const { rows, coverage } = sessionHandoffWalk(packed, { instrument: sym, assetClass });
  const latestByTransition = new Map();
  for (const r of rows) {
    const cur = latestByTransition.get(r.transition);
    if (!cur || r.date > cur.date) latestByTransition.set(r.transition, r);
  }
  return { date: coverage?.to ?? null, rows: TRANSITIONS.map(t => latestByTransition.get(t)).filter(Boolean) };
}

async function coldStartLiveCache(pair) {
  const sym = pair.toUpperCase();
  liveWarming.add(pair);
  try {
    let packed = await loadM1ForPair(pair);
    if (!packed?.n) throw new Error(`no M1 data for ${sym}`);
    if (process.env.OANDA_KEY) {
      try { packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, { nowSec: Math.floor(Date.now() / 1000), minGapSec: 55 }); }
      catch (e) { console.warn(`[session-handoff-live] ${sym}: gap-fill failed on cold start (${e.message})`); }
    }
    const bounded = boundPacked(packed, LIVE_WINDOW_DAYS);
    const result = computeLiveRows(pair, bounded);
    liveCache.set(pair, { packed: bounded, lastBarTime: bounded.times[bounded.n - 1], result });
    console.log(`[session-handoff-live] ${sym}: warm (${bounded.n.toLocaleString()} bars)`);
  } catch (e) {
    console.error(`[session-handoff-live] ${sym}: cold start failed — ${e.message}`);
  } finally {
    liveWarming.delete(pair);
  }
}

async function getFastLive(pair) {
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

export { boundPacked, getFastLive, liveCache, liveWarming, startRunJob };

/** Mount all /api/session-handoff/* routes. */
export function mountSessionHandoffRoutes(app, express) {
  app.post('/api/session-handoff/run', express.json({ limit: '8kb' }), (req, res) => {
    const b = req.body ?? {};
    const instruments = Array.isArray(b.instruments) && b.instruments.length
      ? b.instruments.map(s => String(s).toUpperCase())
      : ['EURUSD'];
    res.json({ ok: true, jobId: startRunJob({ instruments }) });
  });

  app.get('/api/session-handoff/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'unknown jobId' });
    res.json({ ok: true, ...job });
  });

  app.get('/api/session-handoff/card/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no session-handoff data for ${req.params.instrument} yet — POST /api/session-handoff/run first` });
      res.json({ ok: true, instrument: stored.instrument, assetClass: stored.assetClass, coverage: stored.coverage, generatedAt: stored.generatedAt, continuationBook: stored.continuationBook, volClusterBook: stored.volClusterBook });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/session-handoff/fastlive/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const live = await getFastLive(pair);
      if (live.warming) return res.json({ ok: true, instrument: pair.toUpperCase(), warming: true, live: { date: null, rows: [] } });
      const stored = await getJSON(`${PREFIX}/${pair}.json`);
      const continuationBook = stored?.continuationBook ?? null, volClusterBook = stored?.volClusterBook ?? null;
      const matched = live.rows.map(r => ({
        row: r,
        continuationMatch: continuationBook ? matchContinuation(continuationBook, r) : null,
        volClusterMatch: volClusterBook ? matchVolCluster(volClusterBook, r) : null,
      }));
      res.json({ ok: true, instrument: pair.toUpperCase(), warming: false, bookGeneratedAt: stored?.generatedAt ?? null, live: { date: live.date, rows: matched } });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/session-handoff/manifest', async (req, res) => {
    try {
      const keys = await listKeys(`${PREFIX}/`);
      const instruments = keys.filter(k => k.endsWith('.json')).map(k => k.split('/').pop().replace('.json', '').toUpperCase()).sort();
      res.json({ ok: true, instruments });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
