# Fib Local Decision Engine

Fib Atlas's own copy of `local_decision_engine/` (built for Vote Atlas v3,
2026-09-18) — Option A from that build's handoff (fork sideways, not a
shared multi-strategy engine, since Fib Atlas's rung/ladder shape genuinely
differs from Level Atlas's p50/p75/p90 forecast ladder). Computes Asia and
Monday Fib Atlas zone decisions locally, on the same machine the trading bot
runs on, instead of serving a decision from `fib_atlas_bot_plan`'s
45-second-old remote snapshot. Full rationale:
`MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md`.

**Two ladders, not one.** Every pair carries an Asia decision AND a Monday
decision — genuinely different books, thresholds (`FIB_ATLAS_MIN_MARGIN`
etc. vs `FIB_ATLAS_MONDAY_*`), and rung geometry. `config.json`'s `ladders`
field controls which this engine computes (default both). The M1 tail is
shared between both ladders for one pair (same raw price series); the book
is NOT (each ladder has its own OOS-fit dimensions/buckets).

## Setup

Requires the repo's own `node_modules` (run from inside a checkout that's
already had `npm install` run at the repo root — this folder has no
separate `package.json`).

No OANDA credential needed on this machine at all — same constraint as Vote
Atlas's own copy: credentials and all top-up logic stay server-side on
Railway; this folder is "the bot + a pull". `sync.mjs` only ever talks to
Railway.

Environment variables:
- `DASHBOARD_URL` — Railway server base URL (default `http://localhost:3000`
  — `start.bat` overrides this to the production URL by default).
- `FIB_LOCAL_DECISION_PORT` — port for `server.mjs` (default `4501` — Vote
  Atlas's own local engine uses `4500`; different ports so both can run on
  the same machine at once).
- `LOCAL_WINDOW_DAYS` — how much local M1 history to keep (default `180` —
  both ladders' own server-side live caches already use 180 calendar days;
  reusing that proven value rather than guessing a shorter one, see
  `sync.mjs`'s own header for why a too-short window silently produces zero
  output instead of an error).
- `M1_SYNC_INTERVAL_MINUTES` — how often `sync.mjs --loop` re-pulls the
  (shared) M1 tail (default `15`).
- `BOOK_SYNC_INTERVAL_HOURS` — how often it re-pulls both ladders' books
  (default `24` — a book barely changes within a day).
- `REFRESH_INTERVAL_MS` — how often `server.mjs`'s background loop checks
  for new local bars to recompute (default `5000`).
- `MAX_BOOK_AGE_HOURS` (default `36`) / `MAX_M1_AGE_HOURS` (default `2`) —
  fail-closed staleness gates; `/decide` and `/plan` return `stale:true`
  past these, never a guess.

## Running

Easiest: `start.bat` — opens `sync.mjs --loop` and `server.mjs` each in
their own window and waits for the server to answer `/health`. Run it once,
leave both windows open, independent of any bot's own start/stop.

Manual equivalent:
```
node sync.mjs --loop       # leave running: pulls both books daily, shared M1 tail every 15 min
node server.mjs            # the local decision HTTP server, localhost-only, port 4501
node parity_test.mjs       # verify BOTH ladders' output matches a known backtest touch
```

Run `sync.mjs` at least once before starting `server.mjs` — `/decide` and
`/plan` fail closed (`stale:true`, no zones) if no local book/M1 exists yet.

## Endpoints (localhost only, no auth — never expose this off the machine)

- `GET /decide?pair=eurusd&ladder=asia` — full zone computation for one
  (pair, ladder).
- `GET /plan?pairs=eurusd,gbpusd,...` — `instruments` keyed EXACTLY the way
  `fib_atlas_bot_plan` already is (`"eurusd|asia"`, `"eurusd|monday"`, ...
  — `server.js`'s `_refreshFibAtlasPlan`/`mergeIntoFibAtlasPlan` convention)
  so a bot's existing `_pair_ladder`/`_enabled_keys` parsing
  (`fib_atlas_bot.py`) needs zero changes beyond swapping the plan source.
- `GET /health`

## Editing this folder

`lib/zonePricer.mjs` imports `js/asiaFibAtlasZonePricer.js` /
`js/mondayFibAtlasZonePricer.js`'s `zonesFromLiveAndBook` VERBATIM — these
are the exact pure functions production's plan producer
(`asiaLivePlanZones`/`mondayLivePlanZones`, `js/asiaFibAtlasRoutes.js` /
`js/mondayFibAtlasRoutes.js`) uses, extracted 2026-09-18 specifically so
this engine could import them without pulling in kv.js/r2Store.js/OANDA. If
a change here doesn't compile because an import moved, fix the import path;
do not paste the source in instead — that reintroduces exactly the
"second implementation silently drifts from the first" bug class this whole
architecture exists to avoid.

**Known, disclosed gap** (see `lib/zonePricer.mjs`'s own comment): Asia's
server-side live ladder also feeds `ivByDate` (CVOL implied-vol, reads a
local parquet file via `js/cvolLoader.js`) into today's touch
classification; this local engine omits it for now (vendoring that data
file onto the trading machine is a real option, just not done in this first
cut). Only affects TODAY's already-resolved touches' dimension
classification, never rung price/level/side. Run `parity_test.mjs` to see
whether this shows up as a real discrepancy before assuming it doesn't
matter.
