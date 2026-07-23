// cog-standalone/server.js
// ─────────────────────────────────────────────────────────────────────────────
// A self-contained, ISOLATED Railway service that exposes ONLY the COG Forecast
// Replay page and the four API endpoints it needs — and NOTHING else from the
// platform. Deploy this FOLDER on its own (Railway → Root Directory = cog-standalone)
// so the container holds only these two files: no other HTML page, no other /api
// route, and none of the main app's code or dependencies ever ship with it.
//
// It is a thin allow-list reverse proxy. It pulls the single page (cog-replay.html)
// and forwards the four whitelisted endpoints to your main app (UPSTREAM_API, default
// production). The browser only ever talks to THIS origin, so:
//   • there is a single canonical copy of the page (on the main app) — none here,
//   • the shared Cloudflare KV reference store + OANDA candles are reused as-is,
//   • no OANDA/CF credentials live on this service (the upstream holds them),
//   • no CORS is needed (same-origin), and
//   • the upstream URL is never revealed to the client.
// Every path that is not the page or one of the four endpoints returns 404.
//
// Deploy (Railway):
//   1. New service from this repo.
//   2. Settings → Root Directory:  cog-standalone
//      (builds ONLY this folder — the rest of the repo is not included.)
//   3. Settings → Networking → Generate Domain — that URL is what you share.
//   4. (optional) Set UPSTREAM_API if the main app is on a different URL.
//
// WRITES: the reference Save endpoint is proxied intentionally so others can keep
// the KV store current in your absence — as open as the same panel on the main site.
// For a read-only share, delete the app.post(...) line below.

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const UPSTREAM = (process.env.UPSTREAM_API || 'https://macrofxmodel-production.up.railway.app').replace(/\/+$/, '');

app.use(express.json({ limit: '1mb' }));

// Optional healthcheck target — answered locally, nothing sensitive proxied.
app.get('/api/config', (_req, res) => res.json({ ok: true, service: 'cog-replay-standalone' }));

// Forward a request to the upstream. `targetPath` overrides the path (used to map
// this service's `/` to the upstream's `/cog-replay.html`); otherwise the original
// URL (with its query string) is preserved.
async function forward(req, res, targetPath) {
  try {
    const init = { method: req.method, headers: {} };
    if (req.method === 'POST' || req.method === 'PUT') {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(req.body ?? {});
    }
    const r = await fetch(UPSTREAM + (targetPath || req.originalUrl), init);
    const body = await r.text();
    const ct = r.headers.get('content-type');
    res.status(r.status);
    if (ct) res.type(ct);
    res.send(body);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream fetch failed: ' + e.message });
  }
}

// The ONLY page this service exposes — pulled from the upstream, so there is no
// second copy of cog-replay.html to drift.
app.get(['/', '/cog-replay.html'], (req, res) => forward(req, res, '/cog-replay.html'));

// The ONLY API endpoints it exposes.
app.get('/api/vol-forecast/reference-dump', (req, res) => forward(req, res));   // all COG dates, parsed
app.get('/api/vol-forecast/reference/:date', (req, res) => forward(req, res));  // load one day's export
app.post('/api/vol-forecast/reference/:date', (req, res) => forward(req, res)); // save a day's export to KV
app.get('/api/ohlc-range', (req, res) => forward(req, res));                    // OANDA candles for the chart

// Everything else is invisible.
app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));

app.listen(PORT, () => console.log(`[cog-standalone] COG replay on :${PORT} → upstream ${UPSTREAM}`));
