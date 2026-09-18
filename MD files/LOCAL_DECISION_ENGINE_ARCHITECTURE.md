# Local Decision Engine — Architecture + Build Log

Written 2026-09-18 for the Vote Atlas live-vs-backtest divergence fix, then
kept updated through the real Vote Atlas v3 build the same day. Shared with
the Fib Atlas session so it can build the same way, not a second design —
**read the "For the Fib Atlas session" section near the bottom first**, it's
the concrete handoff; everything above it is the rationale/history.

## The problem this solves

Both Vote Atlas (`volatility_bot_v2`) and Fib Atlas (asia + monday ladders)
follow the same pattern: a server-side plan producer (`_refreshVolatilityV2Plan`
/ `_refreshFibAtlasPlan`, `server.js`) recomputes each enabled pair's tradeable
zones every **45 seconds** and writes the result to KV. The Python bot polls
price every **3 seconds** (`tick_secs`) and fires a trade the moment price
crosses a zone's level — using the margin from whichever 45-second plan
snapshot happened to be current, not a fresh computation at the exact
crossing instant.

The backtest (`atlasWalk` + `voteDecision`/`matchLiveContext`,
`js/levelAtlasEngine.js` / `js/levelAtlasReport.js`) never has this problem —
it evaluates every touch exactly once, at the precise historical moment of
crossing, using fully-settled bar data. It's a clean batch replay, not a
poll loop.

Confirmed directly (2026-09-18, Vote Atlas): a real pending zone's computed
margin drifted 3 → 1 over 43 minutes with price never even reaching it —
concrete proof the 45s-snapshot approach is measurably stale relative to the
backtest's "evaluate once, at the exact moment" methodology. Cross-referencing
the existing decision log against a same-day overnight recompute found 20 of
26 (77%) of real entries logged a margin that didn't match the backtest's
computation for the identical touch at the identical minute.

A second, smaller contributor: the live plan producer's fastlive cache is
bounded to `LIVE_WINDOW_DAYS = 180` (not the backtest's full ~10-year
history) — safe for most context dimensions, but not independently verified
safe for `lastVisit`-derived fields or long-sample dimensions like
`htfTrend`/`confluence`. Both gaps get fixed by the same architecture change
below (the local engine's own window is a separate, explicitly-sized
parameter — see "Daily local sync" below).

## The fix: compute the decision locally, not remotely

Move the actual vote computation off Railway and onto the same machine the
Python bot already runs on (next to MT5). A bot calls a local HTTP endpoint
at the exact moment it wants to decide, gets a fresh answer computed on
local data — no network hop, no 45-second snapshot, the staleness gap
collapses to milliseconds. This is the same fix for BOTH bots, because both
have the identical 45s-plan / 3s-tick mismatch.

**Reuse the existing JS engine verbatim. Do not re-implement it in Python.**
This session spent an entire night chasing bugs caused by exactly that
pattern — a second implementation of the same logic silently drifting from
the first (UTC-vs-London-midnight session anchor, a hardcoded parquet
column index, a missing R2 client timeout that existed in one client but not
its sibling). `atlasWalk`, `matchLiveContext`, and each bot's own
`voteDecision` variant are already correct and already tested. The local
engine is the same code, relocated — not rewritten. This is also why the
Python bot has to talk to a small Node HTTP server rather than doing the
computation itself: the engine is JS, Python can't execute it directly.

### What runs where

**Stays on Railway (unchanged):**
- The nightly full-history reference-engine rebuild (all 5 engines — Level
  Atlas, Session Path, Session Handoff, Asia Fib Atlas, Monday Fib Atlas).
- KV for config/status/trade-log, so the dashboard keeps working from
  anywhere.
- `GET /api/level-atlas/book/:pair` (already existed) and
  `GET /api/level-atlas/m1-tail/:pair` (new, built for this) — the sync
  sources.

**Moves local (new):**
- The actual per-tick decision computation.
- The 45-second plan producer and its always-warm fastlive cache retire once
  local decisioning is proven — this is also the fix for the ~$10/day
  cold-start cost (every Railway redeploy wipes the in-memory fastlive cache,
  forcing every enabled pair to cold-start its 180-day window again).

### Daily local sync (measured against the real build, not estimated)

Once a day, pull two things per enabled pair:
1. **The book** — `GET /api/level-atlas/book/:pair`. Measured real size:
   **~325KB/pair** (single default-rearm book: `{instrument, splitDate,
   cells}` — base rates per dimension bucket).
2. **A local M1 tail** — `atlasWalk` itself refuses to produce ANY output
   below its own `minLookback` gate (default 60 TRADING days —
   `js/levelAtlasEngine.js`'s `if (dates.length <= minLookback) return
   {touches:[], coverage:null}`), which needs ~90-100 CALENDAR days to clear
   reliably (found live, 2026-09-18: a 14-day window made every request
   return "no live coverage yet" with zero zones). `LOCAL_WINDOW_DAYS`
   defaults to 100. Measured real size at that window: **~2.3MB/pair**
   (binary format, `packToBinary`/`packFromBinary` reused from
   `js/volBacktestM1Engine.js`).

For Vote Atlas's 17 enabled pairs, measured real total: **~5.5MB (book) +
~39MB (M1 tail) ≈ 44MB/day** for a one-time full sync. In steady state,
`sync.mjs` pulls the book once/day and the M1 tail every 15 minutes
(`M1_SYNC_INTERVAL_MINUTES`) — measured real cost **~732KB/pair/call**, so
17 pairs × 96 calls/day ≈ **~1.2GB/day, ~$1.78/month** at Railway's
$0.05/GB egress rate (checked directly via `/api/egress-audit`, not
estimated). Fib Atlas's own pair count will scale this proportionally —
check its `enabled_pairs` count before assuming the same order of magnitude,
and remember it trades TWO ladders per pair (asia + monday), which may or
may not mean two separate M1-tail pulls depending on how the adapter is
built.

### Serving decisions fast without blocking on a live recompute

`atlasWalk` over a 100-day/pair window is NOT the ~500-800ms this doc
originally estimated — measured live 2026-09-18 on the real machine: real
per-pair cost is **1.3-2.8s** (occasionally spiking to 7s+ under
contention), 2-4x the original assumption, and a full 17-pair cold
warm-up took 31-47s. Whatever machine you're building on, re-measure this
rather than trust the number above — it's clearly hardware/load-dependent.

A naive "recompute on request if the cache looks stale" design means every
request lands in that slow window once a minute, whenever the M1 tail's
last bar advances — exactly what timed out the bot's own HTTP client on
the real end-to-end test. First fix: a background refresh loop
(`local_decision_engine/server.mjs`) that keeps the cache warm on its own
schedule — HTTP handlers only ever read whatever's already cached (a Map
lookup, near-instant) or compute once for a pair that's never been seen
before.

That first fix was NOT sufficient on its own. A background loop still runs
the actual `computeZones` call SYNCHRONOUSLY on the server's single JS
thread — at a real per-pair cost of 1.3-2.8s+, even one such call landing
under an incoming request is enough to approach a client's timeout, and a
batch of several (e.g. every pair's M1 tail advancing in the same sync
cycle) compounds it. Yielding between pairs (`setImmediate`) only
interleaves opportunities to serve a request from cache; it does not
shrink how long any single blocking call takes, and measurably did not
eliminate the timeouts. **The actual fix: run `computeZones` on a separate
thread** (`local_decision_engine/lib/computeWorker.mjs`, via Node's
`worker_threads`) — the main thread dispatches a job and awaits the
result asynchronously, so it is NEVER blocked by the compute regardless of
how slow it is. Confirmed live: `/health` stayed at single-digit
milliseconds throughout a full 17-pair cold warm-up, including one pair
that spiked to 7.2s on its own thread.

### The shared core vs the per-strategy adapter — DESIGN INTENT, NOT YET BUILT

`matchLiveContext` (`js/levelAtlasReport.js`) is **already** shared between
Vote Atlas and Fib Atlas — both import it from the same file. The final
decision function is NOT shared: Vote Atlas uses `voteDecision` from
`js/levelAtlasVoteReview.js`; Fib Atlas has its own `voteDecision` in
`js/asiaFibAtlasVoteReview.js` — structurally similar contract, distinct
implementation, **still not read in detail as of this writing** — confirm
the exact shape before assuming it's a drop-in match.

**Important honesty check for the Fib Atlas session:** the original design
here envisioned one shared local engine with a `?strategy=` selector:

```
GET /decide?pair=eurusd&side=up&rung=p50&strategy=voteAtlas
GET /decide?pair=eurusd&side=up&rung=p50&strategy=fibAsia
```

**That generic adapter was never actually built.** What got built instead
(`local_decision_engine/lib/zonePricer.mjs`) imports Vote Atlas's own
`voteDecision` directly, hardcoded — there is no strategy parameter, no
pluggable decision function. It works correctly for Vote Atlas v3, but as it
stands today `local_decision_engine/` is Vote-Atlas-specific code sitting in
a generically-named folder, not yet the shared thing the name implies. See
"For the Fib Atlas session" below for the two real options this leaves.

## Rollout — build sideways, do not touch what's live

The current bot is **already** internally named `volatility_bot_v2`
everywhere. The new build is `volatility_bot_v3` — a full fork, not a
rewrite of what's live. Same principle applies to Fib Atlas: whatever you
build must be a new, distinctly-named thing (its own bot folder, its own KV
key prefix, its own magic number) that runs ALONGSIDE the current live Fib
Atlas bot, not a modification of it.

1. Build the local decision engine as its own standalone module, tested
   independently: replay a known historical touch and assert the local
   engine's output matches the stored votetrades file exactly for that
   touch (`local_decision_engine/parity_test.mjs` — done, passing, though
   see the residual-margin note below).
2. Read Fib Atlas's `voteDecision` shape properly before building an
   adapter — still not done.
3. Build the new bot: identical Python trading/risk/broker logic to the
   live one (proven, unchanged), swap only the entry-time call from "read
   the last 45s plan snapshot" to "ask the local engine right now." Paper
   mode by default.
4. Run the new bot paper alongside the live one for a validation window,
   comparing v3-local vs the backtest using the same margin-diff method
   used to find the original bug.
5. Only once parity is proven, consider cutover — a separate, later,
   explicit decision, not part of this build.

## Everything actually built for Vote Atlas v3 (2026-09-18) — file inventory

This is the concrete recipe Fib Atlas's session should mirror, adapted for
its own decision function/KV keys/bot identity. Every file below is real,
committed, and pushed (commits `e8e2f00`, `106d343`, `594298f`, `1f58aa8`,
`0a46b5c`, `f38cb45`, `d574435`, plus the dashboard tab).

**`local_decision_engine/`** (new top-level folder — shared in principle,
Vote-Atlas-specific in practice today, see above):
- `lib/zonePricer.mjs` — `computeLiveContext(pair, packed)` (mirrors
  `js/levelAtlasRoutes.js`'s function of the same name) and
  `computeZones(pair, {book, packed, earlyExit, earlyExitThreshold})`
  (mirrors `server.js`'s `_volatilityV2InstrumentPreview`/
  `_volatilityV2PriceZone`, including the `voteDims` computation). Imports
  directly from `js/levelAtlasEngine.js`, `js/levelAtlasVoteReview.js`,
  `js/levelAtlasReport.js`, `js/forecastAnalyser.js`, `js/forecastSigma.js`,
  `js/forecastLadder.js`, `js/forecastLadderParams.js`,
  `js/instrumentRegistry.js`, `js/perLineStrategy.js` — zero reimplemented
  logic, verbatim reuse. **This is the file a Fib Atlas fork would clone and
  repoint at `js/asiaFibAtlasVoteReview.js` (or its own new file).**
- `lib/localStore.mjs` — local book/M1 persistence (`saveBook`/`loadBook`/
  `saveM1`/`loadM1`/`m1Age`/`bookAge`), reusing `packToBinary`/
  `packFromBinary` from `js/volBacktestM1Engine.js` for the M1 tail's
  compact binary format. `saveBook`/`loadBook` also carry the server's own
  `sourceGeneratedAt` so `sync.mjs` can skip a rewrite when unchanged.
- `lib/computeWorker.mjs` — runs `computeZones` on a separate
  `worker_threads` thread so it can never block `server.mjs`'s main event
  loop. Measured real cost 1.3-2.8s+/pair (2-4x this doc's original
  estimate) made that necessary, not optional — see "Serving decisions
  fast" above.
- `server.mjs` — a `WATCHED_PAIRS` set loaded from `config.json`, a
  background `refreshOne`/`refreshAll` loop (`setInterval`, default 5s) that
  recomputes each pair's cache only when `lastBarTime`/`bookSavedAt`
  changed (dispatching the actual compute to `computeWorker.mjs`, never
  running it inline), `GET /decide?pair=X`, `GET /plan?pairs=a,b,c`,
  `GET /health`. Logs any compute or request over 800ms (`SLOW_MS`).
  Binds `127.0.0.1` only, no auth — never expose this off the machine.
- `sync.mjs` — a PURE PULL, zero OANDA dependency: `syncBook(pair)` hits
  `GET {DASHBOARD_URL}/api/level-atlas/book/:pair` and skips the local
  write if the server's `generatedAt` hasn't changed; `syncM1(pair)` hits
  `GET {DASHBOARD_URL}/api/level-atlas/m1-tail/:pair?since=<lastLocalBar>`
  once a local file already exists (falls back to a full `days=100` pull
  for a pair's first-ever sync) and merges the response onto the local
  file ONLY if it's confirmed strictly newer than what's already saved —
  otherwise replaces, to survive a not-really-incremental response (see
  Gotchas). `--loop` runs two independent `setInterval`s sized against
  real measured egress (book daily, M1 every 15 min).
- `parity_test.mjs` — date-independent: finds yesterday's first resolved
  touch for a small pair list, computes it both locally and via the stored
  `vote-trades` route, compares decision+margin. A REAL regression test, not
  a one-off script.
- `config.json` — `{"pairs": [...]}`, the pair universe this engine
  computes zones for.
- `start.bat` — one-command launcher: opens `sync.mjs --loop` and
  `server.mjs` each in their own window, waits for `/health`, then returns.
  Defaults `DASHBOARD_URL` to the production Railway URL (its own default of
  `localhost:3000` has nothing listening unless you're also running
  `server.js` locally — this bit a real run, see "Gotchas" below).
- `README.md` — env vars, running instructions, endpoint list.
- `.gitignore` addition: `local_decision_engine/data/` (machine-specific
  runtime cache, regenerated by `sync.mjs`, don't commit it).

**Server-side additions (`server.js`, `js/levelAtlasRoutes.js`):**
- New route `GET /api/level-atlas/m1-tail/:instrument?days=N` — calls
  `getFastLive(pair)` first (existing, OANDA-backed, unchanged — the ONLY
  place OANDA credentials are touched), returns `202 {warming:true}` if
  still cold-starting, otherwise reads `liveCache.get(pair)?.packed`,
  `boundPacked`s it to `days`, returns via `packToJSON`. This guarantees
  every call is fresh server-side with **zero new Railway job and zero
  OANDA exposure on the local machine** — the credentials-on-Railway-only
  constraint that reshaped this route mid-build (see Gotchas).
- `GET /api/level-atlas/refresh-now` extended with an optional `?bot=v3`
  query param to read a different bot's `enabled_pairs` (defaults to v2's
  config, backward compatible) — lets each bot's dashboard tab have its own
  "Refresh book now" button without a second route.
- New route `POST /api/volatility-v3/telegram-test` — exact mirror of the
  v2/Fib-Atlas pattern, reads `volatility_bot_v3_config`'s own
  `tg_token`/`tg_chat_id`.

**Python bot (`volatility_bot_v3/`)** — forked from `volatility_bot_v2/` via
`cp -r` then a bulk `sed -i 's/volatility_bot_v2/volatility_bot_v3/g'`
rename, THEN targeted identity fixes the bulk rename missed (see Gotchas):
- `engine.py`, `currency_gate.py` (+ test), `drawdown_throttle.py` (+
  test), `engine_test.py` — unchanged from v2, proven logic, don't touch.
- `volatility_bot_v3.py` — the only file with real diffs from v2:
  - `LOCAL_DECISION_URL` env var (default `http://127.0.0.1:4500`),
    separate from `DASHBOARD_URL` (which stays pointed at Railway for
    KV/status/config/quotes).
  - `from pylego.local_decision import LocalDecisionClient` (new pylego
    brick, see below); `ld = LocalDecisionClient(LOCAL_DECISION_URL)`
    alongside the existing `kv = KvClient(...)`.
  - Plan fetch replaced: `new_plan = ld.get_plan(enabled)` instead of
    `kv.get_json("volatility_bot_v3_plan")` — **there is no v3 plan KV key
    at all**, the local engine IS the plan source.
  - `plan_secs` default 45→3 (a same-machine call, not a 45s Railway
    snapshot — safe to poll as often as `tick_secs`).
  - `plan_max_age_hours` default 1→1/6 (10 min) — fail-closed tighter since
    a local engine outage should be caught fast.
  - Removed the `generatedAt`-unchanged gate on plan adoption (the local
    engine restamps every call, so that gate would never fire) and the
    restart-restore `generatedAt` match check (same reason) — restored
    state now relies on `zone_id`'s own date/pair/side/rung/instance
    specificity for safety instead.
  - `--local-url` CLI arg.
  - Identity collisions the bulk `sed` missed (anything not containing the
    literal string `volatility_bot_v2`): `MAGIC` 20260828→20260918;
    `tg_enabled` True→False, `tg_token`/`tg_chat_id` real-v2-values→`""`;
    MT5 order `comment` prefix `"VA["`→`"VA3["`.

**`pylego/local_decision.py`** (new pylego brick) — `LocalDecisionClient`
class mirroring `pylego/kv.py`'s injectable-HTTP/retry contract:
`get_plan(pairs: list[str]) -> dict` (GET `/plan?pairs=...`, unwraps
`.data`), `health() -> bool`. Plus `pylego/local_decision_test.py`, 7
offline tests with a fake HTTP client.

**KV/dashboard registration** (the 5-gate checklist this codebase always
needs for a new bot — see `feedback_kv_second_ttl_gate` /
`project_bot_audit_terminal` memory notes, this is not new to v3):
1. `kv.js` `_CF_EXACT` — `volatility_bot_v3_config`/`_credentials`/`_state`/
   `_trade_log`/`_decision_log` (NOT `_status` — ephemeral by design).
2. `_worker.js` `isAllowedKVKey`'s `EXACT` set — same five PLUS `_status`.
3. `_worker.js` `PERMANENT_KEYS` — same five, not `_status`.
4. `_worker.js` `STATUS_KEYS` — `volatility_bot_v3_status` only.
5. `_worker.js` `BOT_KEYS` inside `/api/trade-history` —
   `volatility_bot_v3_status` only (this is what makes closed trades reach
   the Trade History tab — easy to miss, it's a genuinely separate gate from
   1-4).
6. `js/botRegistry.js` `POS_BOTS` — one entry:
   `{ key: 'volatility_bot_v3_status', label: 'Vote Atlas v3', color:
   '#34d399', bg: '#052e21', bd: '#0e9668', paper: true }`. Confirmed: this
   single entry is what makes bot-audit.html's equity/drawdown/profit chart,
   pills, exposure matrix, and allocation panel all pick the new bot up
   automatically — **no bot-audit.html code changes were needed at all**,
   it's generic and key-driven throughout.

Verification used each time: `GET /api/kv/get?key=<name>` should return
`{"miss":true}` (registered but empty) not a 403 (not registered at all).

**Dashboard tab (`bot-config.html` + `js/bot-config.js`)** — new
`#tab-volatilityv3` pane + `Vb3`-prefixed JS functions, a close mirror of
v2's `#tab-volatilityv2`/`Vb2`-prefixed block with these deliberate
differences: no "Plan age" KV-timestamp field (no plan key exists), no
Live-vs-Backtest-Drift card (no weekly audit job built for v3 yet), Book
Freshness tile kept (reused v2's route, since the local engine's book
source is the same global Level Atlas book), cadence defaults changed to
match the 3s/10min local-engine polling, Telegram fields blank by default.
Plus `TAB_BOT_KEY_MAP.volatilityv3` entry and the tab-button/init wiring.

## Gotchas actually hit during the real build — read before repeating them

- **Data-provenance mismatch.** A fresh, independent OANDA re-fetch of
  historical bars does NOT reproduce the official archive's vote/margin for
  the identical touch — confirmed via `parity_test.mjs` showing a complete
  decision flip. Tested 100-day vs 400-day windows (identical wrong
  results, ruling out window-length) before concluding it was a data-source
  mismatch, not a lookback problem. Fixed by sourcing the M1 tail from the
  server's own already-correct `getFastLive` data via the new route,
  instead of a local machine independently re-deriving history from OANDA.
- **`LOCAL_WINDOW_DAYS` too short silently returns zero output.**
  `atlasWalk`'s own `minLookback` gate (60 TRADING days) needs ~90-100
  CALENDAR days to clear — a 14-day window isn't "less accurate," it's
  "produces nothing," and the failure mode (`zoneCount:0, skipped:"no live
  coverage yet"`) looks identical to "not synced yet."
- **A naive per-request recompute is too slow even when "cached."** If you
  see multi-second responses that should be instant, check for a genuinely
  stale server process first (a `kill` that silently failed to kill the
  right PID) before assuming the caching logic itself is wrong.
- **Yielding between pairs in a background refresh loop reduces but does
  NOT eliminate request blocking.** A single synchronous `computeZones`
  call at its real measured cost (1.3-2.8s+, see above) can alone approach
  a client's timeout; a `setImmediate` between pairs only gives a pending
  request a CHANCE to be served from cache between calls, it doesn't
  shrink any individual call's own duration. Confirmed live: timeouts
  persisted through two rounds of this kind of tuning. The actual fix was
  running the compute on a separate thread (`worker_threads`) so the main
  thread literally cannot be blocked by it — verified by holding `/health`
  at single-digit-ms latency through a full cold 17-pair warm-up,
  including one pair that spiked to 7.2s.
- **A startup routine that "always refreshes X" (not "refresh X only if
  stale") silently re-triggers whatever work depends on X changing.**
  `sync.mjs`'s book sync ran unconditionally on every process start (not
  just the `--loop` timer's 24h interval), rewriting every book file with
  a fresh LOCAL timestamp even when the book's own content hadn't changed.
  `server.mjs`'s cache was keyed off that timestamp, so every restart made
  it think every pair's book had changed and force-recomputed all of them
  — directly compounding the blocking issue above every time the operator
  restarted the sync process while troubleshooting something unrelated.
  Fixed by comparing the server's own stable `generatedAt` against what's
  already saved and skipping the write when unchanged.
- **An "incremental" fetch that silently falls back to a full response
  (e.g. mid-deploy, old server code not yet recognizing a new query param)
  will corrupt a naive merge-by-concatenation.** Confirmed live: the first
  incremental M1 sync after this route change landed on Railway before the
  deploy had finished rolling out; the old code ignored the unrecognized
  `since` param and returned the full window, and blindly appending that
  onto the existing full window doubled every pair's local file (found via
  a backward timestamp jump in the saved binary). Any incremental-fetch
  design needs to verify the response is actually incremental (e.g. its
  first record is strictly after what was requested) before merging, and
  replace instead of append when that check fails.
- **Credentials-on-Railway is a hard constraint, not a preference**, if this
  repo's owner is involved: the local machine must never hold a live-trading
  credential (OANDA key, broker key). Design the freshness mechanism to
  reuse an EXISTING server-side authenticated route rather than adding a
  new local credential — that's the whole reason `m1-tail` calls
  `getFastLive` instead of the local machine calling OANDA directly.
- **`sync.mjs`'s `DASHBOARD_URL` default (`localhost:3000`) silently fails
  every fetch** with Node's bare `TypeError: fetch failed` if you're
  pointing your actual bot at the deployed Railway dashboard (which you
  almost certainly are) rather than running `server.js` locally too.
  `start.bat` now defaults it to the production URL — set this correctly
  for whatever fork you build, or you'll get a wall of `book FAILED: fetch
  failed` / `M1 FAILED: fetch failed` with no more specific error, because
  there isn't one — it's a bare connection refusal.
  the destination WAS listening, so the pattern is confirmed real: without
  a sensible default, the operator has to already know to set an env var
  that has no prompt or error pointing at it.
- **A bulk `sed` rename misses anything that isn't a literal string match
  for the old bot's name.** Found live: the magic number, the Telegram
  bot token/chat ID (real v2 credentials silently carried into v3's
  default config — would have posted v3's alerts into v2's live chat under
  v2's identity), and the MT5 order comment prefix. After forking, grep the
  new bot's file against the old one's for every bare numeric/token/string
  constant, not just the ones containing the old bot's name.
- **Broker symbol overrides are case-sensitive on MT5.** A `de30` symbol
  saved as `'De40'` instead of `'DE40'` fails `verify_symbols()`'s exact
  match and every live order for that pair, even though it's a one-letter
  case difference a human wouldn't flag as wrong at a glance. The bot's own
  startup `verify_symbols()` check (pre-existing, shared with Fib Atlas/
  Motif bot) catches this with a "closest matches" suggestion — read it, it
  tells you the exact fix.
- **Running the local engine needs an operator-friendly launcher, not raw
  `node` commands you re-type each session.** `start.bat` opens both
  `sync.mjs --loop` and `server.mjs` in their own windows and waits for
  `/health`. It is deliberately NOT spawned/owned by the Python bot itself —
  it's meant to be one persistent thing, independent of any single bot's
  start/stop, since (per the design intent above) it's meant to eventually
  serve more than one bot.
- **RiskGuard reads the WHOLE MT5 account balance, not a per-bot slice.**
  `pylego/broker/mt5.py`'s `positions_get()`/closed-trade queries/order
  placement ARE correctly magic-filtered (confirmed by direct code read),
  so two bots sharing one MT5 account/magic-number-pair ARE correctly
  isolated at the position level. But `RiskGuard.update_balance()` is fed
  `broker.account_balance()` = the RAW whole-account balance — if v2 and v3
  (or any two bots) share a real account, each bot's daily/monthly
  drawdown lockout triggers off the COMBINED account P&L, not its own. Not
  yet fixed (flagged to the owner, no decision made yet as of this
  writing) — a real gap to be aware of before sharing an account across
  two ladders/bots the same way.

## For the Fib Atlas session: how to build the same way

Read the "shared core vs per-strategy adapter" section above first — the
honest state is that `local_decision_engine/` today is Vote-Atlas-specific
code in a generically-named folder, not yet a pluggable multi-strategy
engine. You have two real options, not one:

**Option A — fork sideways (lower risk, matches how v2→v3 was actually
done):** Copy `local_decision_engine/` to something like
`fib_local_decision_engine/`, repoint `lib/zonePricer.mjs` at
`js/asiaFibAtlasVoteReview.js`'s `voteDecision` (read its actual shape
first — this was never done this session, don't assume it matches Vote
Atlas's contract), give `server.mjs` a different port (Vote Atlas's is
4500 — pick another, e.g. 4501), give `sync.mjs`/`config.json` their own
pair list (remember TWO ladders per pair — decide whether that's two
zones per pair per call or two separate local-engine instances), build a
new bot (`fib_atlas_bot_v2` or similar, NOT a modification of the live
`fib_atlas_bot`) mirroring the `LocalDecisionClient` wiring done in
`volatility_bot_v3.py`. Costs: a second Node process, a second port, some
duplicated boilerplate. Benefit: zero risk to Vote Atlas v3, ships fastest,
matches this repo's established "build sideways" convention.

**Option B — actually generalize the shared engine (more work, the
originally-intended design):** Add a `strategy` param to `zonePricer.mjs`'s
`computeZones` (or a lookup table of `{voteAtlas: <fn>, fibAsia: <fn>,
fibMonday: <fn>}`), extend `server.mjs`'s `/decide` and `/plan` to accept
`&strategy=`, and extend `sync.mjs`/`config.json` to carry pairs for
multiple strategies. One process serves both bots on one port. Only worth
it if you're confident about Fib Atlas's `voteDecision` contract lining up
cleanly with Vote Atlas's (same inputs: book, touch context) — if it
doesn't, this turns into an awkward abstraction built for two cases that
don't actually generalize well, and you're better off with Option A.

**Either way, verified-safe things you can copy as-is, unmodified:**
- The new `m1-tail` server route pattern (`js/levelAtlasRoutes.js`) —
  already generic, already reads from the shared `getFastLive`/`liveCache`
  that both Vote Atlas and Fib Atlas's engines use.
- `localStore.mjs`'s binary M1 pack/unpack — reuses `js/volBacktestM1Engine.js`
  functions already shared across every engine in this repo.
- The 5-gate KV/dashboard registration checklist above — same five gates,
  same order, just your bot's own key names.
- `start.bat`'s pattern (open both processes, wait for `/health`, default
  `DASHBOARD_URL` to production) — copy and repoint the port in the health
  check.
- The `pylego/local_decision.py` client class, if Option A (each bot gets
  its own `LOCAL_DECISION_URL` pointing at its own port) — or reuse it
  as-is if Option B (both bots point at the same URL, differing only in
  which `strategy=` they pass).

**Do NOT copy without re-verifying:**
- `zonePricer.mjs`'s hardcoded `js/levelAtlasVoteReview.js` import — this is
  the one genuinely Vote-Atlas-specific piece, and the whole reason Option
  A/B is a real fork in the road rather than a "just copy the folder" job.
- Any assumption that Fib Atlas's touch/context shape matches Vote Atlas's
  exactly — read `js/asiaFibAtlasVoteReview.js` first.
- The specific window/cadence numbers (100 days, 15 min, 24h) — these were
  sized against Vote Atlas's specific egress/performance measurements;
  re-measure for Fib Atlas's own pair count and two-ladder structure rather
  than assuming the same numbers hold.

## Open items, not yet resolved

- Exact shape of Fib Atlas's `voteDecision` (asia vs monday — may differ
  from each other too) — needs a real read before Option A or B above is
  chosen.
- The ~1-point residual margin discrepancy found in `parity_test.mjs`
  (local margin=5 vs backtest margin=4 on one real touch, decision
  matched) — small, deferred to Vote Atlas v3's multi-day paper validation
  to characterize rather than chase on a single sample.
- RiskGuard's shared-account drawdown isolation gap (see Gotchas above) —
  flagged, not fixed, relevant to Fib Atlas too if it ever shares an
  account with another bot.
