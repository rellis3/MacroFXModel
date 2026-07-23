# COG Replay — standalone isolated service

A **fully self-sufficient** service that exposes ONLY the COG Forecast Replay page
(`cog-replay.html`) and the four API endpoints it needs. Deploy this folder on its own
so you can share the COG replay URL publicly **without exposing the rest of the
dashboard** — no other page, no other `/api` route, and none of the main app's code
ships with it.

It does **not** depend on the main dashboard at all (so it keeps working even when the
main site is locked down). It talks **directly** to:

- **Cloudflare KV** — the *same* namespace the main app uses, so references saved here
  land in the shared store the main site reads (that's what lets others keep it current
  in your absence), and
- **OANDA** — for the chart candles.

Every path that isn't the page or one of these four endpoints returns **404**:

| Method | Path | Purpose |
|---|---|---|
| GET | `/cog-replay.html` (and `/`) | the page |
| GET | `/api/vol-forecast/reference-dump` | every stored COG reference date, parsed |
| GET | `/api/vol-forecast/reference/:date` | load one day's raw export |
| POST | `/api/vol-forecast/reference/:date` | save a day's export to the shared KV |
| GET | `/api/ohlc-range` | OANDA candles for the chart |

## Required env vars

Set these on the new Railway service — the **same values** as your main app:

| Var | For | Notes |
|---|---|---|
| `OANDA_KEY` | candles | required |
| `OANDA_ENV` | candles | `live` (default) or `practice` — must match the key |
| `CF_ACCOUNT_ID` | KV | required |
| `CF_API_TOKEN` | KV | token with KV read+write on the namespace |
| `CF_KV_NAMESPACE_ID` | KV | optional — defaults to the shared namespace (`37e6…b3bb`) |

Check `/api/config` after deploy — it reports `cloudflare_kv: true` / `oanda: true` when
both backends are configured.

## Deploy on Railway

1. **New service** → deploy from this repo.
2. **Settings → Root Directory:** `cog-standalone`
   (Railway then builds **only** this folder — the rest of the repo is not included,
   and only `express` is installed.)
3. **Variables:** add the env vars above.
4. **Settings → Networking → Generate Domain** — that URL is the one you share.

No start-command override is needed (the folder's `npm start` runs `node server.js`),
and no healthcheck config applies (the repo-root `railway.json` is outside this root).

## Read-only share

To make the shared link **view-only** (no one can Save references through it), delete the
`app.post('/api/vol-forecast/reference/:date', …)` handler in `server.js`.

## Keeping the page in sync

`cog-replay.html` here is a deploy copy of the repo-root `cog-replay.html`. If the
root page changes, copy it in again:

```bash
cp ../cog-replay.html ./cog-replay.html
```

## Run locally

```bash
cd cog-standalone
npm install
OANDA_KEY=… CF_ACCOUNT_ID=… CF_API_TOKEN=… npm start
# → http://localhost:3000
```
