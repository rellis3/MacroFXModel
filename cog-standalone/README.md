# COG Replay — standalone isolated service

A minimal service that exposes **only** the COG Forecast Replay page (`cog-replay.html`)
and the four API endpoints it needs. Deploy this folder on its own so you can share the
COG replay URL publicly **without exposing the rest of the dashboard** — no other page,
no other `/api` route, and none of the main app's code ships with it.

It's a thin allow-list reverse proxy: it pulls the single page and forwards these
endpoints to your main app (`UPSTREAM_API`, default production):

| Method | Path | Purpose |
|---|---|---|
| GET | `/cog-replay.html` (and `/`) | the page (pulled from upstream — no local copy) |
| GET | `/api/vol-forecast/reference-dump` | every stored COG reference date, parsed |
| GET | `/api/vol-forecast/reference/:date` | load one day's raw export |
| POST | `/api/vol-forecast/reference/:date` | save a day's export back to the shared KV |
| GET | `/api/ohlc-range` | OANDA candles for the chart |

Everything else returns **404**.

## Why this shares the same data

Reads/writes are proxied to your main app, which owns the OANDA key and the Cloudflare
KV namespace (`vol_reference_*` keys). So references saved through this URL land in the
**same shared store** the main site reads — that's what lets others keep it current in
your absence — and **no OANDA/CF credentials live on this service**.

## Deploy on Railway

1. **New service** → deploy from this repo.
2. **Settings → Root Directory:** `cog-standalone`
   (Railway then builds **only** this folder — the rest of the repo is not included,
   and only `express` is installed.)
3. **Settings → Networking → Generate Domain** — that URL is the one you share.
4. *(optional)* **Variables → `UPSTREAM_API`** — set only if your main app is on a
   different URL than the production default.

No start command override is needed (the folder's `npm start` runs `node server.js`),
and no healthcheck config applies (the repo-root `railway.json` is outside this root).

## Read-only share

If you want the shared link to be **view-only** (no one can Save references through it),
delete the `app.post('/api/vol-forecast/reference/:date', …)` line in `server.js`.

## Run locally

```bash
cd cog-standalone
npm install
UPSTREAM_API=https://macrofxmodel-production.up.railway.app npm start
# → http://localhost:3000
```
