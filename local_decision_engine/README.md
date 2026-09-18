# Local Decision Engine

Computes Vote Atlas / Fib Atlas zone decisions locally, on the same machine
the trading bot runs on, instead of serving a decision from a 45-second-old
remote snapshot. Full rationale: `MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md`.

## Setup

Requires the repo's own `node_modules` (run from inside a checkout that's
already had `npm install` run at the repo root — this folder has no
separate `package.json`, it resolves `express` etc. from the root).

No OANDA credential needed on this machine at all (2026-09-18 — deliberate:
credentials and all top-up logic stay server-side on Railway; this folder
is "the bot + a pull"). `sync.mjs` only ever talks to Railway.

Environment variables:
- `DASHBOARD_URL` — Railway server base URL (default `http://localhost:3000`).
- `LOCAL_DECISION_PORT` — port for `server.mjs` (default `4500`).
- `LOCAL_WINDOW_DAYS` — how much local M1 history to keep (default `100` —
  not "~2 weeks" as first planned; `atlasWalk`'s own minLookback gate needs
  ~90-100 calendar days to clear at all, see the architecture doc's own
  correction).
- `M1_SYNC_INTERVAL_MINUTES` — how often `sync.mjs --loop` re-pulls the M1
  tail (default `15`). Sized against real measured egress
  (`/api/egress-audit`), not guessed — see `sync.mjs`'s own header comment
  for the actual cost math. Tune down for fresher data, up to save egress.
- `BOOK_SYNC_INTERVAL_HOURS` — how often it re-pulls the book (default `24`
  — the book barely changes within a day).
- `REFRESH_INTERVAL_MS` — how often `server.mjs`'s background loop checks
  for new local bars to recompute (default `5000`).

## Running

```
node sync.mjs --loop       # leave running: pulls book daily, M1 tail every 15 min, pure pull from Railway
node server.mjs            # the local decision HTTP server, localhost-only
node parity_test.mjs       # verify the engine's output matches a known backtest touch
```

Run `sync.mjs` at least once before starting `server.mjs` — `/decide` and
`/plan` fail closed (`stale: true`, no zones) if no local book/M1 exists yet.
`sync.mjs --loop` is meant to be left running continuously (or under a
process manager) alongside `server.mjs`, not run once and exited.

## Endpoints (localhost only, no auth — never expose this off the machine)

- `GET /decide?pair=eurusd` — full zone computation for one pair.
- `GET /plan?pairs=eurusd,gbpusd,...` — same shape `volatility_bot_v2_plan`
  used to have (`{data: {instruments, skipped}}`), for a straight swap in
  the bot's plan-adoption code.
- `GET /health`

## Editing this folder

Everything in `lib/` imports the existing, already-tested engine modules
(`js/levelAtlasEngine.js`, `js/levelAtlasVoteReview.js`,
`js/levelAtlasReport.js`, `js/m1GapFill.js`, ...) directly — it does not
reimplement any decision logic. If a change here doesn't compile because an
import moved, fix the import path; do not paste the source in instead.
