# Local Decision Engine — Architecture

Written 2026-09-18 for the Vote Atlas live-vs-backtest divergence fix. Shared
with the Fib Atlas session because Fib Atlas has the identical structural
problem and should build against the same design, not a second one.

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
history) — safe for most context dimensions (documented rationale: nothing
needs more than ~60 trading days), but NOT safe for the `lastVisit`-derived
fields (`rollingRate`, `wtStateRepeated`, `prevOutcomeCrossDay` — only the
last one was independently tested) or for anything that needs a long sample
to be stable (`htfTrend`, `confluence`). Both gaps get fixed by the same
architecture change below.

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
engine is the same code, relocated — not rewritten.

### What runs where

**Stays on Railway (unchanged):**
- The nightly full-history reference-engine rebuild (all 5 engines — Level
  Atlas, Session Path, Session Handoff, Asia Fib Atlas, Monday Fib Atlas).
  Already fixed and cheap as of 2026-09-17 (decoded-snapshot cache keyed off
  the raw parquet's own R2 ETag — see `js/volBacktestM1Engine.js`).
- KV for config/status/trade-log, so the dashboard keeps working from
  anywhere.
- `GET /api/level-atlas/book/:pair` (already exists) — the sync source.

**Moves local (new):**
- The actual per-tick decision computation.
- The 45-second plan producer and its always-warm fastlive cache retire once
  local decisioning is proven — this is also the fix for the ~$10/day
  cold-start cost (every Railway redeploy wipes the in-memory fastlive cache,
  forcing every enabled pair to cold-start its 180-day window again; local
  decisioning removes the need for that cache to exist on Railway at all).

### Daily local sync (measured against the real build, not estimated)

Once a day, pull two things per enabled pair:
1. **The book** — `GET /api/level-atlas/book/:pair`. Measured real size:
   **~325KB/pair** (single default-rearm book: `{instrument, splitDate,
   cells}` — base rates per dimension bucket). NOT the full stored R2 object
   (~2.1MB/pair — that includes 3 rearm-fraction books, display cards,
   session-transition tables, and the day's full touch/pending detail, none
   of which a local sync needs).
2. **A local M1 tail** — NOT the "~2 weeks" originally planned. `atlasWalk`
   itself refuses to produce ANY output below its own `minLookback` gate
   (default 60 TRADING days — `js/levelAtlasEngine.js`'s `if (dates.length
   <= minLookback) return {touches:[], coverage:null}`), which needs
   ~90-100 CALENDAR days to clear reliably (found live, 2026-09-18: a
   14-day window made every request return "no live coverage yet" with
   zero zones). `LOCAL_WINDOW_DAYS` defaults to 100. Measured real size at
   that window: **~2.3MB/pair** (binary format, `packToBinary`/
   `packFromBinary` reused from `js/volBacktestM1Engine.js`).

For Vote Atlas's 17 enabled pairs, measured real total: **~5.5MB (book) +
~39MB (M1 tail) ≈ 44MB/day, ~1.3GB/month.** Still small relative to typical
hosting egress allowances and nowhere near the compute cost it replaces, but
a genuinely different number from the original "~10-12MB/day" estimate in
this doc's first draft — corrected here rather than left wrong. Cloudflare
R2 has zero egress fees by design; the only real cost is Railway serving
these files once a day. Fib Atlas's own pair count will scale this
proportionally — check its `enabled_pairs` count before assuming the same
order of magnitude.

### Serving decisions fast without blocking on a live recompute

`atlasWalk` over a 100-day/pair window costs ~500-800ms of CPU — trivial
once, but a naive "recompute on request if the cache looks stale" design
still means every request lands in a ~14-19s slow window (17 pairs
sequentially) once a minute, whenever the M1 tail's last bar advances. This
is exactly what happened on the real end-to-end test: the bot's own 5s
HTTP client timed out against a synchronous recompute. Fixed with a
background refresh loop (`local_decision_engine/server.mjs`) that keeps the
cache warm on its own schedule — HTTP handlers only ever read whatever's
already cached (confirmed live: 0.137s for a full 17-pair `/plan` once
warm) or compute once, synchronously, for a pair that's never been seen
before. Same principle as the server's own `getFastLive` design
(`js/levelAtlasRoutes.js`) — recompute only when the underlying M1 data
has actually moved, not on every poll — just not carried over into the
first draft of this file's own local engine.

### The shared core vs the per-strategy adapter

`matchLiveContext` (`js/levelAtlasReport.js`) is **already** shared between
Vote Atlas and Fib Atlas — both import it from the same file. The final
decision function is NOT shared: Vote Atlas uses `voteDecision` from
`js/levelAtlasVoteReview.js`; Fib Atlas has its own `voteDecision` in
`js/asiaFibAtlasVoteReview.js` — structurally similar contract, distinct
implementation, presumably adapted for Fib Atlas's own ladder/dimension set
(not yet fully read — confirm the exact shape before assuming it's a drop-in
match).

Design the local engine as one shared core with a thin per-strategy adapter,
not two separate builds:

```
GET /decide?pair=eurusd&side=up&rung=p50&strategy=voteAtlas
GET /decide?pair=eurusd&side=up&rung=p50&strategy=fibAsia
GET /decide?pair=eurusd&side=up&rung=p50&strategy=fibMonday
```

Each call: load the local book + local M1 tail for `pair`, build the touch
context via the shared `atlasWalk`/`matchLiveContext` primitives, then apply
whichever strategy's decision function `strategy` selects. Response shape
mirrors what `_volatilityV2PriceZone` already returns (`decision`, `margin`,
`outVotes`/`backVotes`, and now `voteDims` — the compact per-dimension
supports/challenges/context detail shipped 2026-09-18 for exactly this kind
of diffing).

## Rollout — build sideways, do not touch what's live

The current bot is **already** internally named `volatility_bot_v2`
everywhere (folder, KV keys: `volatility_bot_v2_config` /
`_status` / `_plan` / `_trade_log`). A new build must be `v3` (or an
equivalently distinct name) — do not reuse "v2" for the new architecture,
it collides with what's live right now trading real demo capital.

1. Build the local decision engine as its own standalone module, tested
   independently: replay a known historical touch and assert the local
   engine's output matches the stored votetrades file exactly for that
   touch. This turns tonight's one-off manual comparison into a permanent
   regression test, not a diagnostic you re-run by hand each time.
2. Confirm Fib Atlas's `voteDecision` fits the shared-core-plus-adapter shape
   (or needs its own adapter contract) — read `js/asiaFibAtlasVoteReview.js`
   properly before building the adapter, don't assume.
3. Build `volatility_bot_v3`: identical Python trading/risk/broker logic to
   v2 (proven, unchanged), swap only the entry-time call from "read the last
   45s plan snapshot" to "ask the local engine right now." Paper mode by
   default, matching every other bot's own first-light convention in this
   repo.
4. Run v3 paper alongside v2 live for a validation window. This is now
   directly measurable: the same margin-diff method used tonight, but
   comparing v3-local vs the backtest instead of v2-remote vs the backtest.
5. Only once v3's parity is proven, cut over: retire v2, then let Fib Atlas
   adopt the same local engine as its second consumer — proving the shared
   design, not rebuilding it.

## Resolved during the real build (2026-09-18), not just designed

- **Credentials stay on Railway, always.** Owner's explicit constraint,
  given mid-build: OANDA_KEY and all gap-fill/top-up logic live server-side
  only — the local machine is "the bot + a pull," never holds a live-
  trading credential. `GET /api/level-atlas/m1-tail/:pair` now calls the
  server's own `getFastLive` (existing, OANDA-backed, unchanged) instead of
  serving a possibly-stale saved snapshot, so every call is guaranteed
  fresh server-side — no new Railway job needed, no OANDA exposure
  locally. `sync.mjs` has zero OANDA dependency; `local_decision_engine/lib/fetchM1Range.mjs`
  (the original local OANDA fetcher) was built, then deleted once this
  landed.
- **Sync cadence, sized against real measured egress, not guessed.**
  Checked `/api/egress-audit` directly rather than estimating: the
  m1-tail route costs ~732KB/pair/call. `sync.mjs` now pulls the book once
  a day (barely changes) and the M1 tail every 15 minutes by default
  (`M1_SYNC_INTERVAL_MINUTES`) — comfortably inside `server.mjs`'s
  `MAX_M1_AGE_HOURS` (2h) fail-closed gate with margin for a missed cycle,
  at ~1.2GB/day / ~$1.78/month, a deliberate choice, not a default nobody
  checked.
- **Local engine performance.** A long-lived Node process
  (`local_decision_engine/server.mjs`), not invoked-per-call — confirmed
  necessary live: a naive from-scratch `atlasWalk` per pair costs
  ~500-800ms, so 17 pairs from cold is ~14-19s. A background refresh loop
  keeps a warm cache (recompute only when the underlying M1 data actually
  moved — same principle as the server's own `getFastLive`); HTTP handlers
  only ever read the cache. Confirmed live: 0.137s for a full 17-pair
  `/plan` once warm, versus 18.7s cold.

## Open items, not yet resolved

- Exact shape of Fib Atlas's `voteDecision` (asia vs monday — may differ
  from each other too) — needs a real read, not an assumption, before the
  adapter is designed.
- The ~1-point residual margin discrepancy found in `parity_test.mjs`
  (local margin=5 vs backtest margin=4 on one real touch, decision
  matched) — small, deferred to Phase 4's multi-day validation to
  characterize rather than chase on a single sample.
