// cog-standalone-server.js
// ─────────────────────────────────────────────────────────────────────────────
// A minimal, ISOLATED web service that exposes ONLY the COG Forecast Replay page
// (cog-replay.html) plus the four API endpoints that page needs — and nothing else
// from the platform. Deploy this as its own Railway service so you can share the
// COG replay URL publicly WITHOUT exposing the rest of the dashboard: there is no
// static directory serving here, so no other HTML page or /api route is reachable.
//
// How it works: it serves cog-replay.html at `/` and reverse-proxies a small
// whitelist of endpoints to the main app (UPSTREAM_API, default production). The
// browser only ever talks to THIS origin, so:
//   • the shared Cloudflare KV reference store + OANDA candles are reused as-is,
//   • no OANDA/CF credentials live on this service (the upstream holds them),
//   • no CORS is needed (same-origin), and
//   • the upstream URL is never revealed to the client.
//
// Deploy (Railway):
//   1. New service from this same repo.
//   2. Settings → Deploy → Custom Start Command:  node cog-standalone-server.js
//      (overrides the repo's default `bash start.sh`, so the Python bots + full
//       server.js do NOT run on this service).
//   3. (optional) Set UPSTREAM_API if your main app is on a different URL.
//   Healthcheck (railway.json → /api/config) is answered locally below, so the
//   service stays green without proxying anything sensitive.
//
// NOTE ON WRITES: the reference Save endpoint is proxied so others can keep the KV
// store current in your absence — that is intentional. It is exactly as open as the
// same panel on the main site (no auth on that route). If you later want the shared
// link to be read-only, drop the POST route below.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const UPSTREAM = (process.env.UPSTREAM_API || 'https://macrofxmodel-production.up.railway.app').replace(/\/+$/, '');

// Load the page once at boot. This is the ONLY file this service serves.
const PAGE = fs.readFileSync(path.join(__dirname, 'cog-replay.html'), 'utf8');

app.use(express.json({ limit: '1mb' }));

// Healthcheck target (railway.json points at /api/config). Answered locally — we do
// NOT proxy the upstream's real config, so none of its settings are exposed here.
app.get('/api/config', (_req, res) => res.json({ ok: true, service: 'cog-replay-standalone' }));

// The COG replay page — served same-origin so its default (blank) API base works.
app.get(['/', '/cog-replay.html'], (_req, res) => res.type('html').send(PAGE));

// Reverse-proxy exactly the endpoints cog-replay.html calls — nothing else.
async function proxy(req, res) {
  try {
    const init = { method: req.method, headers: {} };
    if (req.method === 'POST' || req.method === 'PUT') {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(req.body ?? {});
    }
    const r = await fetch(UPSTREAM + req.originalUrl, init);
    const body = await r.text();
    const ct = r.headers.get('content-type');
    res.status(r.status);
    if (ct) res.type(ct);
    res.send(body);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream fetch failed: ' + e.message });
  }
}

app.get('/api/vol-forecast/reference-dump', proxy);   // all COG reference dates, parsed
app.get('/api/vol-forecast/reference/:date', proxy);  // load one day's raw export
app.post('/api/vol-forecast/reference/:date', proxy); // save a day's export back to KV
app.get('/api/ohlc-range', proxy);                    // OANDA candles for the chart

// Everything else is invisible: no other page, no other API, no directory listing.
app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));

app.listen(PORT, () => console.log(`[cog-standalone] COG replay on :${PORT} → upstream ${UPSTREAM}`));
