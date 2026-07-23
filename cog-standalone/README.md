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

Start command and healthcheck are pinned by `cog-standalone/railway.json`
(`node server.js`, healthcheck `/api/config`) so Railway can't use stale settings.

### If the deploy fails on "Network › Healthcheck"

Build + Deploy succeed but Healthcheck fails ⇒ the process isn't answering. The usual
cause is a **stale dashboard override** from an earlier attempt beating `railway.json`:

1. **Settings → Deploy → Custom Start Command** — make sure it is **empty** (or exactly
   `node server.js`). A leftover value like `node cog-standalone/server.js` is wrong once
   Root Directory is `/cog-standalone` (it would look for `cog-standalone/cog-standalone/…`)
   and the process never starts.
2. **Settings → Deploy → Healthcheck Path** — empty or `/api/config`.
3. Redeploy. `/api/config` always returns 200 (no env needed), so a healthy process
   passes; `page_loaded` / `cloudflare_kv` / `oanda` in its JSON tell you what's still
   missing.

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
