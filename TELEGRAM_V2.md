# Telegram v2 — The Confidence Engine

> A clean-room rebuild of the live alert/grading pipeline on the Lego baseplate.
> One graded-entry path, expressed as pure bricks, where **confidence is measured
> in after-cost expectancy** (not a hand-weighted 0–100 score) and the **same code
> grades live and in backtest**. Built parallel to v1 — v1 keeps running until the
> ledger says v2 is better. Companion to `TELEGRAM_ENTRY_GRADING.md` (the v1
> review that motivated this) and `ENTRY_ZONE_CONFIDENCE.md` (the research
> discipline it adopts).

---

## Why v2 exists

`TELEGRAM_ENTRY_GRADING.md` found that v1 grades the same trade with **two drifted
code paths** writing the same `ai_entries_*` key, and that the live `signalScore`
that sizes MT5 orders is an unvalidated heuristic. v2 fixes both at the root:

- **One producer, one grader, one namespace** (`ai_entries_v2_*`). Never two writers.
- **Confidence = after-cost expectancy** from a frozen, OOS-learned per-cell policy
  — the exact discipline that took the research engine to 33/33 OOS
  (`ENTRY_ZONE_CONFIDENCE.md`), not a 0–100 vibe.
- **Live == backtest by construction.** The live grader and the offline learner
  build the *identical* policy cell key, so the grade you trade is the grade you
  validated. (This is the live half of `LEGO_MODULES.md §3 drift #8`, closed.)

## How it works — offline first, then push out

```
OFFLINE (learn, on M1 history)                      LIVE (apply, on fresh OANDA bars)
────────────────────────────────                   ──────────────────────────────────
loadM1ForPair  (per pair, streamed)                fetch OANDA M5 / M30 / D
   │                                                   │
rangeLineAnalyser.touchesForPair                   build SAME Asia/Monday ladders
   (Asia/Monday fib ladders → touches,                (rangeLineAnalyser.buildRangeLadder)
    approachVel bucket via touchFeatures)             │
   │                                                compute SAME approachVel bucket
perLineStrategy.runPerLine                            (touchFeatures) → cell key
   (pooled-IS → per-pair-OOS, gated on                │
    AFTER-COST EXPECTANCY)                           gradeLevelV2 → levelConfidenceCore.decide
   │                                                    (look up frozen cell → grade)
levelsV2Learn.freezePolicy → KV `policy_v2`            │
   { cell: {decision, n, expectancy, revRate} }      write ai_entries_v2_<PAIR>
                                                        │
                                                     cron-worker / bot / telegram-v2.html
```

The runtime **never fits a policy** — it loads the frozen artifact. Re-learn
deliberately (a fresh M1 run) and version the file.

## The confidence decision (`levelConfidenceCore.decide`)

For a touched level it answers the three `ENTRY_ZONE_CONFIDENCE.md` questions:

1. **Zone** — the `level` + its triple-barrier neighbours (`inner` toward range
   mid, `outer` away), supplied by the ladder.
2. **Direction** — *fade vs follow* is the cell's learned `decision`, mapped to
   long/short with the **same `isBuy` rule as `perLineStrategy.pnlFor`** (buy when
   fading a down-line or following an up-line). SL/TP are the triple-barrier exits.
3. **Confidence** — the cell's **after-cost expectancy** (% of price) and sample
   `n`. Unseen / policy-skipped cells return `SKIP`. Grade bands are on expectancy:

   | Grade | Rule | Verdict |
   |---|---|---|
   | A+ | `expectancy ≥ 0.15%` and `n ≥ 50` and `rr ≥ 1.5` | TAKE |
   | A  | `expectancy ≥ 0.08%` and `n ≥ 30` | TAKE |
   | B  | `expectancy ≥ 0.03%` | WATCH |
   | C  | `expectancy > 0` | CAUTION |
   | SKIP | unseen / low-N / edge ≤ cost / rr too poor | SKIP |

   Bands **auto-fit each policy's expectancy distribution** at learn time
   (`levelsV2Learn.deriveBands` → percentiles stored in `frozen.bands`), so A+/A/B
   always span the actual scale rather than a hard-coded number — e.g. when the best
   session-fib cell pays ~+0.09%/touch, a fixed 0.15% A+ gate would be unreachable.
   `DEFAULT_GRADE_BANDS` is the fallback. A readable 0–1 `confidence` is emitted for
   display, but **expectancy is the decision variable**.

   The live page **auto-loads** (re-reads KV every 60 s, toggleable) so the view
   tracks the server's 30-min refresh without a manual click; it shows how stale the
   entries are.

## The bricks (all pure, synthetic-tested in `js/telegramV2.test.mjs`)

| Brick | File | Owns |
|---|---|---|
| Level-confidence core | `js/levelConfidenceCore.js` | `decide`, `cellKey`, `directionFor`, `exitsFor`, `DEFAULT_GRADE_BANDS` — expectancy→grade + direction/exit geometry |
| Grade-level v2 | `js/gradeLevelV2.js` | live grader: ladder + intraday path → graded entries (rebuilds the offline cell key) |
| Alert formatter v2 | `js/alertFormatterV2.js` | pure `formatV2Entry` (expectancy-first Telegram message) |
| Offline learner | `js/levelsV2Learn.js` | `learnAndFreeze` / `freezePolicy` / `isUsablePolicy` — snapshot the OOS policy |
| Live producer | `levelsV2Engine.js` (root) | `refreshAllPairsV2` / `refreshPairV2` / `loadPolicy` — apply frozen policy to OANDA bars → `ai_entries_v2_*` |

**Reused, never copied:** `rangeLineAnalyser` (`buildRangeLadder`, `touchesForPair`),
`perLineStrategy` (`runPerLine`, `buildPolicy`, `pnlFor`), `touchFeatures`
(`approachVel`), `forecastCore` (`volSigmaSeries`), `instrumentRegistry`,
`metricsCore`/`backtestStats` (via `runPerLine`).

## Routes & surfaces

- `POST /api/levels-v2/learn` → stream M1 per pair → pooled-IS policy → freeze to
  KV `policy_v2`; `GET /api/levels-v2/status/:jobId` (async-job pattern).
- `POST /api/levels-v2/refresh` → apply frozen policy to live bars.
- `GET  /api/levels-v2/entries` → policy summary + live `ai_entries_v2_*`.
- `telegram-v2.html` — learn (with OOS card: cells, fade/follow/skip, portfolio
  Sharpe, survivors), refresh, and the live entry table. Linked from `hub.html`.

## Live↔offline caveat (stated honestly)

The offline learner buckets M1 into 22:00-UTC sessions and scores `approachVel` at
the *actual first-touch bar*; the live engine fetches fresh OANDA bars and scores it
at *now*, as price nears the level. The **same `touchFeatures` code** computes the
bucket and the **same `buildRangeLadder`** builds the grid, so the cell key is
faithful — but the approach window is a live *analogue* of a touch, and the live
Asia/Monday range construction (OANDA M5/M30 vs M1 body-resample) is an
approximation of the backtest's. This is the residual gap to A/B before cutover.

## Cutover plan

1. **Learn** the policy on M1 (done by `/api/levels-v2/learn`), read the OOS card.
2. **Push out**: schedule `refreshAllPairsV2` (cron alongside the v1 levels refresh)
   and point a paper-mode bot flag at `ai_entries_v2_*`.
3. **Log outcomes** (the next brick: an `entryLedgerV2` of features+grade+fill) and
   re-fit the policy from real fills.
4. **Cut over** v1 → v2 only when the ledger shows v2 ≥ v1 on realized after-cost
   expectancy. Until then both run; v2 is observed, not trusted.

## Daily-learning loop (`js/entryLedgerV2.js`) — built

The policy is frozen, but the system now *observes itself* each day:

1. **Record** — every live graded signal is appended to KV `ledger_v2` on each
   refresh (`recordEntries`, deduped per standing `sym|cell|price`).
2. **Resolve** — older records are resolved honestly from subsequent **M1** bars:
   **limit-fill first** (did price actually reach the level? if never → `expired`,
   not a free win), then **triple-barrier** TP vs SL (SL checked first, conservative),
   netting an after-cost `realizedPct` (`resolvePair`).
3. **Compare** — `ledgerStats` reports realized win-rate + after-cost expectancy
   **vs the policy's claimed expectancy, per grade** — the honest "is the edge
   holding up live?" (surfaced on `telegram-v2.html` and `GET /api/levels-v2/ledger`).
4. **Refit candidate** — `refitFromLedger` aggregates realized fills per cell into a
   review-only candidate policy; it **never auto-overwrites** the frozen one (you
   promote deliberately). Only updates the expectancy estimate of the taken
   decision — no counterfactual, so it can't flip fade↔follow.

Record + resolve run automatically inside the Railway refresh loop (below).

## Two grading-input fixes (built)

- **R:R / A+ reachability.** The ladder's triple-barrier exits are adjacent
  (≈equidistant) fib lines, so `rr ≈ 1:1` by construction — and the cell's
  `expectancy` already encodes that payoff. The grade is therefore on **expectancy +
  sample**, not `rr` (an `rr ≥ 1.5` gate made A+ unreachable). A floor demotion
  guards only genuinely poor payoffs.
- **Live velocity bucket.** The offline policy keys cells on `approachVel` computed
  on **M1** (`velWin=15` → 15 min). The live engine now fetches **M1** for the
  approach path (it was M5 → 75 min → every touch read `1·grind`), so the live
  bucket matches the learned cell.

## Autorun (Railway server-side, not the Cloudflare worker)

`refreshAllPairsV2()` (which also records + resolves the ledger) runs inside the
Node server's existing `runLevelsRefresh()` interval on Railway — the **same loop**
that already refreshes v1, right after it, isolated in a try/catch. It no-ops until
a `policy_v2` exists in KV. This is **not** `cron-worker/cron-worker.js` (the
separate Cloudflare proximity-alert worker, untouched).

## Telegram alerts (`js/alertV2Core.js`) — built

v2 alerts out to Telegram with its **own config**, separate from v1 (so paper-stage
v2 noise never touches the live v1 alerter):
- `selectAlerts` (pure) picks zones within proximity of price, at/above a min grade,
  optional pair filter, with a per-level cooldown → returns alerts + updated
  cooldowns. Default **OFF** (opt in from the page).
- The live engine (`levelsV2Engine`) loads `tg_v2_alert_cfg` + the shared `tg_config`
  (bot token/chat from the v1 Alerts modal) + `tg_v2_cooldowns` once per refresh,
  dispatches via `alertFormatterV2.formatV2Entry`, persists cooldowns. **Alerts only —
  never places trades.**
- Config: `GET/POST /api/levels-v2/alert-config`; the **⚙ Alerts** panel on
  `telegram-v2.html` (enabled, min grade, cooldown, per-class proximity, pairs).
  `tg_v2_alert_cfg` is CF-persistent; cooldowns are ephemeral (a missed cooldown just
  re-fires once after a restart).

## Still deliberately deferred

- **Promote-from-ledger** UI (one-click blend of `refitFromLedger` into the frozen
  policy after review) — the candidate is computed, promotion is still manual.
- Broaden beyond Asia/Monday fib ladders to the full `levelSources` set.
- Python bot reader for `ai_entries_v2_*` behind a `telegram_mode_v2` flag.
