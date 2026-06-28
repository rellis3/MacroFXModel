/**
 * Forecast Level Analyser — Express routes (shared).
 *
 * Single source of truth for the analyser API so the main server and the
 * standalone public service (server-analyser.js) mount identical endpoints.
 *
 * Password gate: a request supplies the password via header `x-analyser-pw`,
 * query `?pw=`, or cookie `analyser_pw`.
 *   view  → ANALYSER_PASSWORD     (if unset, reads are open until you set one)
 *   admin → ANALYSER_ADMIN_PASSWORD || ANALYSER_PASSWORD (must be set to refresh)
 * See FORECAST_ANALYSER_SETUP.md.
 */

import {
  runRefresh as runAnalyserRefresh, discoverPairs as discoverAnalyserPairs,
  getManifest as getAnalyserManifest, getAggregates as getAnalyserAggregates,
  getPairData as getAnalyserPairData,
  runPerLineBook as runAnalyserPerLineBook, getPerLineBook as getAnalyserPerLineBook,
} from './forecastAnalyserStore.js';

function _analyserPw(req) {
  return req.get('x-analyser-pw')
    || req.query?.pw
    || (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith('analyser_pw='))?.slice('analyser_pw='.length)
    || '';
}
// Resolve the access level of a supplied password: 'admin' | 'view' | null.
function _analyserLevel(supplied) {
  const s = String(supplied ?? '');
  const adminWant = process.env.ANALYSER_ADMIN_PASSWORD || process.env.ANALYSER_PASSWORD;
  if (adminWant && s === adminWant) return 'admin';
  const viewWant = process.env.ANALYSER_PASSWORD;
  if (!viewWant) return 'view';            // no view password set → reads open
  if (s === viewWant) return 'view';
  return null;
}
function _analyserAuth(req, res, level) {
  const lvl = _analyserLevel(_analyserPw(req));
  if (level === 'admin') {
    const adminWant = process.env.ANALYSER_ADMIN_PASSWORD || process.env.ANALYSER_PASSWORD;
    if (!adminWant) { res.status(503).json({ ok: false, error: 'Refresh disabled — set ANALYSER_ADMIN_PASSWORD (or ANALYSER_PASSWORD) in env' }); return false; }
    if (lvl !== 'admin') { res.status(401).json({ ok: false, error: 'Unauthorized — admin password required' }); return false; }
    return true;
  }
  if (lvl === null) { res.status(401).json({ ok: false, error: 'Unauthorized — analyser password required' }); return false; }
  return true;
}

const afJobs = new Map();
function _purgeStaleAfJobs() {
  const cutoff = Date.now() - 2 * 60 * 60_000;
  for (const [id, job] of afJobs) if (job.startedAt < cutoff) afJobs.delete(id);
}

// Run a refresh as a tracked async job. Returns the jobId.
function startRefreshJob({ pairs, horizons }) {
  const jobId     = `af_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const log = [];
  _purgeStaleAfJobs();
  afJobs.set(jobId, { status: 'running', startedAt, log });
  (async () => {
    try {
      const manifest = await runAnalyserRefresh({ pairs, horizons, onLog: m => { log.push(m); console.log('[analyser-refresh]', m); } });
      afJobs.set(jobId, { status: 'done', startedAt, log, result: { manifest } });
    } catch (e) {
      const msg = e?.message || String(e);
      console.error('[forecast-analysis/refresh]', msg);
      afJobs.set(jobId, { status: 'error', startedAt, log, error: msg });
    }
  })();
  return jobId;
}

// Run the per-line book as a tracked async job (loads stored records, no M1).
function startPerLineJob(opts) {
  const jobId     = `af_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const log = [];
  _purgeStaleAfJobs();
  afJobs.set(jobId, { status: 'running', startedAt, log });
  (async () => {
    try {
      const book = await runAnalyserPerLineBook({ ...opts, onLog: m => { log.push(m); console.log('[per-line]', m); } });
      afJobs.set(jobId, { status: 'done', startedAt, log, result: { book } });
    } catch (e) {
      const msg = e?.message || String(e);
      console.error('[per-line]', msg);
      afJobs.set(jobId, { status: 'error', startedAt, log, error: msg });
    }
  })();
  return jobId;
}

/**
 * Mount all /api/forecast-analysis/* routes on an Express app.
 * `express` is passed in so we can use express.json() body parsing.
 */
export function mountAnalyserRoutes(app, express) {
  app.post('/api/forecast-analysis/login', express.json({ limit: '8kb' }), (req, res) => {
    const pw  = req.body?.password ?? '';
    const lvl = _analyserLevel(pw);
    if (lvl === null) return res.status(401).json({ ok: false, error: 'Wrong password' });
    res.setHeader('Set-Cookie', `analyser_pw=${encodeURIComponent(pw)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`);
    res.json({ ok: true, level: lvl });
  });

  app.get('/api/forecast-analysis/whoami', (req, res) => {
    res.json({ ok: true, level: _analyserLevel(_analyserPw(req)) });
  });

  app.post('/api/forecast-analysis/refresh', express.json({ limit: '64kb' }), (req, res) => {
    if (!_analyserAuth(req, res, 'admin')) return;
    const b = req.body ?? {};
    const pairs    = Array.isArray(b.pairs) && b.pairs.length ? b.pairs.map(p => String(p).toLowerCase()) : null;
    const horizons = Array.isArray(b.horizons) && b.horizons.length ? b.horizons : undefined;
    res.json({ ok: true, jobId: startRefreshJob({ pairs, horizons }) });
  });

  app.get('/api/forecast-analysis/refresh/status/:jobId', (req, res) => {
    if (!_analyserAuth(req, res, 'admin')) return;
    const job = afJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
    if (job.status === 'running') return res.json({ ok: true, status: 'running', elapsed: Math.round((Date.now() - job.startedAt) / 1000), log: job.log });
    if (job.status === 'done')    return res.json({ ok: true, status: 'done', log: job.log, ...job.result });
    return res.status(500).json({ ok: false, status: 'error', error: job.error, log: job.log });
  });

  app.get('/api/forecast-analysis/pairs', async (req, res) => {
    if (!_analyserAuth(req, res, 'view')) return;
    try { res.json({ ok: true, pairs: await discoverAnalyserPairs() }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/api/forecast-analysis/manifest', async (req, res) => {
    if (!_analyserAuth(req, res, 'view')) return;
    try {
      const m = await getAnalyserManifest();
      if (!m) return res.status(404).json({ ok: false, error: 'No dataset yet — run a refresh' });
      res.json({ ok: true, manifest: m });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/api/forecast-analysis/aggregates', async (req, res) => {
    if (!_analyserAuth(req, res, 'view')) return;
    try {
      const a = await getAnalyserAggregates();
      if (!a) return res.status(404).json({ ok: false, error: 'No dataset yet — run a refresh' });
      res.json({ ok: true, aggregates: a });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/api/forecast-analysis/pair/:pair/:horizon', async (req, res) => {
    if (!_analyserAuth(req, res, 'view')) return;
    try {
      const d = await getAnalyserPairData(String(req.params.pair).toLowerCase(), req.params.horizon);
      if (!d) return res.status(404).json({ ok: false, error: 'Not found — check pair/horizon or run a refresh' });
      res.json({ ok: true, data: d });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Per-line confidence book — build (admin: computes + writes) and read (view).
  app.post('/api/forecast-analysis/per-line/run', express.json({ limit: '8kb' }), (req, res) => {
    if (!_analyserAuth(req, res, 'admin')) return;
    const b = req.body ?? {};
    const opts = {
      horizon:   b.horizon || 'daily',
      conditions: Array.isArray(b.conditions) && b.conditions.length ? b.conditions.map(String) : undefined,
      minN:      Number.isFinite(b.minN) ? b.minN : undefined,
      splitFrac: Number.isFinite(b.splitFrac) ? b.splitFrac : undefined,
    };
    res.json({ ok: true, jobId: startPerLineJob(opts) });
  });

  app.get('/api/forecast-analysis/per-line/status/:jobId', (req, res) => {
    if (!_analyserAuth(req, res, 'admin')) return;
    const job = afJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
    if (job.status === 'running') return res.json({ ok: true, status: 'running', elapsed: Math.round((Date.now() - job.startedAt) / 1000), log: job.log });
    if (job.status === 'done')    return res.json({ ok: true, status: 'done', log: job.log, ...job.result });
    return res.status(500).json({ ok: false, status: 'error', error: job.error, log: job.log });
  });

  app.get('/api/forecast-analysis/per-line/:horizon', async (req, res) => {
    if (!_analyserAuth(req, res, 'view')) return;
    try {
      const book = await getAnalyserPerLineBook(req.params.horizon);
      if (!book) return res.status(404).json({ ok: false, error: 'No book yet — an admin must run the per-line build' });
      res.json({ ok: true, book });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

// Optional in-process daily auto-refresh (full). Enable with ANALYSER_AUTO_REFRESH=1.
// Runs once shortly after boot, then every 24h. No native cron needed.
export function startAutoRefresh() {
  if (process.env.ANALYSER_AUTO_REFRESH !== '1') return;
  const run = () => { console.log('[analyser-auto] daily refresh starting'); startRefreshJob({ pairs: null, horizons: undefined }); };
  setTimeout(run, 60_000);            // ~1 min after boot
  setInterval(run, 24 * 60 * 60_000); // every 24h
  console.log('[analyser-auto] daily auto-refresh enabled');
}

export { _analyserLevel };
