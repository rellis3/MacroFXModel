/**
 * Standalone public Forecast Level Analyser service.
 *
 * A thin Express app that serves ONLY the analyser — the dashboard + refresh
 * pages and the /api/forecast-analysis/* routes (mounted from the shared module
 * so it never drifts from the main server). Deploy as a separate Railway service
 * from this same repo with start command `node server-analyser.js`, its own
 * domain, the four R2_* vars, and ANALYSER_PASSWORD / ANALYSER_ADMIN_PASSWORD.
 *
 * It reads the precomputed dataset from R2; the admin password gates refresh.
 * See FORECAST_ANALYSER_DEPLOY.md.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { mountAnalyserRoutes, startAutoRefresh } from './js/analyserRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

// Only the two analyser pages + shared css are public from disk.
const PUBLIC = new Set(['/forecast-analysis.html', '/forecast-refresh.html']);
app.get('/', (_req, res) => res.redirect('/forecast-analysis.html'));
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'forecast-analyser' }));

app.get(['/forecast-analysis.html', '/forecast-refresh.html'], (req, res) => {
  if (!PUBLIC.has(req.path)) return res.status(404).end();
  res.sendFile(path.join(__dirname, req.path.slice(1)));
});
app.use('/css', express.static(path.join(__dirname, 'css')));

// API (password-gated inside the module).
mountAnalyserRoutes(app, express);

// Optional daily auto-refresh (ANALYSER_AUTO_REFRESH=1).
startAutoRefresh();

app.listen(PORT, () => console.log(`[analyser] public service on :${PORT}`));
