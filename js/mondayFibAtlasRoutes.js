/**
 * Monday Fib Atlas — Express routes. Deliberately smaller surface than
 * `js/asiaFibAtlasRoutes.js` — this engine only exists (so far) to feed the
 * vote-margin trade backtest (`asia-fib-atlas-vote-backtest.html`'s Monday
 * toggle), not a live confidence ladder — see `js/mondayFibAtlasEngine.js`'s
 * header for the scope reasoning. Same async-job + R2-persist pattern as
 * every other reference engine here (`/run`, `/status`, `/vote-trades`).
 */
import { loadM1ForPair } from './volBacktestM1Engine.js';
import { mondayFibAtlasWalk } from './mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from './asiaFibAtlasReport.js';
import { runBarrierWalkForward } from './asiaFibAtlasVoteReview.js';
import { putJSON, getJSON } from './r2Store.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { oandaSymbol } from './instrumentRegistry.js';
import { gapFillPacked } from './m1GapFill.js';
import { fetchM1Range } from './volBacktestEngine.js';
import { costForPair } from './perLineStrategy.js';

const PREFIX = 'monday-fib-atlas';
const DEFAULT_REARM = 0.3;

const jobs = new Map();
function purgeStale() {
  const cutoff = Date.now() - 2 * 60 * 60_000;
  for (const [id, job] of jobs) if (job.startedAt < cutoff) jobs.delete(id);
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

  const result = {
    instrument: sym, assetClass, coverage, generatedAt: new Date().toISOString(),
    cost, splitDate: book.splitDate,
    trades: wf1?.trades ?? [],
    summaryByMargin,
  };
  await putJSON(`${PREFIX}/${pair}-votetrades.json`, result);
  return result;
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

// Exported for js/mondayFibAtlasRoutes.test.mjs only — not part of the route API.
export { startRunJob };

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

  // GET /api/monday-fib-atlas/vote-trades/EURUSD[?minMargin=2]
  app.get('/api/monday-fib-atlas/vote-trades/:instrument', async (req, res) => {
    try {
      const pair = String(req.params.instrument).toLowerCase();
      const stored = await getJSON(`${PREFIX}/${pair}-votetrades.json`);
      if (!stored) return res.status(404).json({ ok: false, error: `no Monday vote-backtest data for ${req.params.instrument} yet` });
      const minMargin = req.query.minMargin ? Number(req.query.minMargin) : 2;
      const trades = stored.trades.filter(t => t.margin >= minMargin);
      res.json({ ok: true, instrument: stored.instrument, generatedAt: stored.generatedAt, cost: stored.cost,
                 splitDate: stored.splitDate, minMargin, summary: stored.summaryByMargin?.[minMargin] ?? null, trades });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
