# Telegram v2 — The Confidence Engine

> A clean-room rebuild of the live alert/grading pipeline on the Lego baseplate.
> One graded-entry path, expressed as pure bricks, where **confidence is measured
> in after-cost expectancy** (not a hand-weighted 0–100 score) and the **same code
> grades live and in backtest**. Built parallel to v1 — v1 keeps running until the
> ledger says v2 is better. Companion to `TELEGRAM_ENTRY_GRADING.md` (the v1
> review that motivated this) and `ENTRY_ZONE_CONFIDENCE.md` (the research
> discipline it adopts).
>
> **v3 correction (this revision):** v2's first build (2026-06-29) learned a
> pooled cross-pair policy conditioned on `approachVel`, priced by a fixed
> adjacent-line ("zone-walk") barrier. `RANGE_EXTENSION_GUIDE.md` §12/§14 — landed
> in the *same* build window, but never fed back in — later proved BOTH choices
> lose on the honest single-pair unit: the zone-walk barrier loses to a
> held-position **chandelier trail** (§12), and conditioning on `approachVel` (or
> any of five other live touch-reads) loses to the plain unconditioned cell (§14).
> v2 was grading a strategy this project had already disproven, which is why every
> live cell capped out around B (edge scale ~0.02%/touch) and never reached A/A+.
> This revision re-points v2 at the exact bricks the LIVE `range_line_bot`
> (`js/rangeLineBotProducer.js`) already trades — per-instrument policy, no
> condition, chandelier-trail pricing — so telegram-v2 and the bot now grade the
> SAME edge instead of two drifted copies of it (closes the split `LEGO_MODULES.md`
> §3 flagged). Re-validated on real local M1 (eurusd/gbpusd/gold): top cells are
> Monday near-mid `follow`s at +0.15–0.48%/touch, matching §13's book.

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
OFFLINE (learn, PER INSTRUMENT, on M1 history)       LIVE (apply, on fresh OANDA bars)
────────────────────────────────                    ──────────────────────────────────
loadM1ForPair  (per pair, streamed)                 fetch OANDA M5 / M30 / D
   │                                                    │
rangeLineAnalyser.touchesForPair                    build SAME Asia/Monday ladders
   (Asia/Monday fib ladders → touches,                 (rangeLineAnalyser.buildRangeLadder)
    NO condition — §14: no live touch-read              │
    beats the unconditioned cell)                    (no condition — condFields defaults to [])
   │                                                    │
perLineStrategy.buildPolicy({pricer:pnlHeld})        gradeLevelV2 → levelConfidenceCore.decide
   (per-instrument IS→OOS split, gated on               (look up this instrument's frozen cell
    HELD-CHANDELIER-TRAIL expectancy — §12)              → grade, chandelier trail exit)
   │                                                    │
levelsV2Learn.freezePolicy → KV `policy_v2`           write ai_entries_v2_<PAIR>
   { perInstrument: { pair: {policy:                     │
     {cell: {decision,n,expectancy,winRate}}}} }      cron-worker / bot / telegram-v2.html
```

Reuses the exact bricks `js/rangeLineBotProducer.js` already freezes for the LIVE
`range_line_bot` MT5 bot — same touches, same per-instrument split, same
`pnlHeld` chandelier pricer — so telegram-v2 grades the SAME edge the bot trades,
not a second, drifted copy of it.

The runtime **never fits a policy** — it loads the frozen artifact. Re-learn
deliberately (a fresh M1 run) and version the file.

**Robust learn (resumable + cached).** The learn job is heavy (26 pairs of M1), so:
per-pair extracted touches are **cached in KV** (`v2_touch_<pair>`, keyed by an opts
signature, 7-day TTL) — a re-run or a restart **resumes from cache** instead of
reloading all M1 (the slow, OOM-prone part); the freeze uses `buildPolicy` directly
(**no 1000× Monte-Carlo/bootstrap** — that CPU spike was getting the job killed);
and progress is written to KV `policy_v2_status` so the page (`GET
/api/levels-v2/learn-status`) shows it **across page refreshes / server restarts**,
decoupled from the in-memory jobId. One learn runs at a time (re-clicks are
idempotent), and a `running` status with no live job >20 min reports as `stalled`
so you can resume. Once a policy exists it persists — you never re-run to view it.

## The confidence decision (`levelConfidenceCore.decide`)

For a touched level it answers the three `ENTRY_ZONE_CONFIDENCE.md` questions:

1. **Zone** — the `level` + its neighbours (`inner` toward range mid, `outer`
   away), supplied by the ladder — `outer` sets the initial protective stop.
2. **Direction** — *fade vs follow* is the cell's learned `decision`, mapped to
   long/short with the **same `isBuy` rule as `perLineStrategy.pnlFor`/`pnlHeld`**
   (buy when fading a down-line or following an up-line). **Exit is a held-position
   chandelier trail** (RANGE_EXTENSION_GUIDE.md §12/§13), not a fixed TP: risk to
   `sl` (one rung away, same geometry as before), then the stop ratchets in
   `trailFrac`×`rung` (default 50%) from the peak as price moves favourably.
3. **Confidence** — the cell's **after-cost expectancy** (% of price, priced on
   that SAME chandelier trail via `pnlHeld`) and sample `n`. Unseen / policy-
   skipped cells return `SKIP`. Grade bands are on expectancy:

   | Grade | Rule | Verdict |
   |---|---|---|
   | A+ | `expectancy ≥ 0.08%` and `n ≥ 50` | TAKE |
   | A  | `expectancy ≥ 0.05%` and `n ≥ 30` | TAKE |
   | B  | `expectancy ≥ 0.02%` | WATCH |
   | C  | `expectancy > 0` | CAUTION |
   | SKIP | unseen / low-N / edge ≤ cost | SKIP |

   (No `rr` gate — with a trailing exit there's no fixed target to ratio against;
   `expectancy` already prices the realized trail payoff, so a poor payoff shows up
   as low/negative expectancy and is filtered by the policy's margin gate.)

   Bands **auto-fit each policy's expectancy distribution** at learn time
   (`levelsV2Learn.deriveBands`, fit over the UNION of every instrument's cells via
   `flattenPolicy` → stored in `frozen.bands`), so A+/A/B always span the actual
   scale rather than a hard-coded number — e.g. when the best cell pays ~+0.48%/
   touch (gold, re-validated on real M1 post-fix), a fixed 0.08% A+ gate undersells
   it; percentiles rank it correctly regardless.
   `DEFAULT_GRADE_BANDS` is the fallback. A readable 0–1 `confidence` is emitted for
   display, but **expectancy is the decision variable**.

   The live page **auto-loads** (re-reads KV every 60 s, toggleable) so the view
   tracks the server's 30-min refresh without a manual click; it shows how stale the
   entries are.

## The bricks (all pure, synthetic-tested in `js/telegramV2.test.mjs`)

| Brick | File | Owns |
|---|---|---|
| Level-confidence core | `js/levelConfidenceCore.js` | `decide`, `cellKey`, `directionFor`, `exitsFor`, `DEFAULT_GRADE_BANDS` — expectancy→grade + direction/chandelier-exit geometry (`sl`/`rung`/`trailFrac`, no fixed tp) |
| Grade-level v2 | `js/gradeLevelV2.js` | live grader: ladder + intraday path → graded entries (rebuilds the offline cell key; `condFields` defaults to `[]` per §14) |
| Alert formatter v2 | `js/alertFormatterV2.js` | pure `formatV2Entry` (expectancy-first Telegram message; initial-SL + trail description, no fixed TP) |
| Offline learner | `js/levelsV2Learn.js` | `learnAndFreeze` / `freezePolicy` / `flattenPolicy` / `isUsablePolicy` — per-instrument OOS policy, injected touch loader |
| Live producer | `levelsV2Engine.js` (root) | `refreshAllPairsV2` / `refreshPairV2` / `loadPolicy` — look up EACH symbol's own `frozen.perInstrument[instr]` and apply it to OANDA bars → `ai_entries_v2_*` |

**Reused, never copied:** `rangeLineAnalyser` (`buildRangeLadder`, `touchesForPair`,
`walkChandelierExit`), `perLineStrategy` (`buildPolicy`, `pnlFor`, `pnlHeld`) —
the SAME bricks `js/rangeLineBotProducer.js` freezes for the live `range_line_bot`,
`forecastCore` (`volSigmaSeries`), `instrumentRegistry`, `metricsCore`/`backtestStats`.
`touchFeatures`/`approachVel` is no longer wired in by default (§14 — it lost to the
unconditioned cell) but stays available via an explicit `conditions`/`condFields` opt.

## Routes & surfaces

- `POST /api/levels-v2/learn` → stream M1 per pair → PER-INSTRUMENT policy (no
  pooling) → freeze to KV `policy_v2`; `GET /api/levels-v2/status/:jobId`
  (async-job pattern).
- `POST /api/levels-v2/refresh` → apply each symbol's own frozen per-instrument
  policy to live bars.
- `GET  /api/levels-v2/entries` → policy summary + live `ai_entries_v2_*`.
- `telegram-v2.html` — learn (with OOS card: cells, fade/follow/skip, portfolio
  Sharpe, survivors), refresh, and the live entry table. Linked from `hub.html`.

## Live↔offline caveat (stated honestly)

The offline learner buckets M1 into 22:00-UTC sessions; the live engine fetches
fresh OANDA bars. The **same `buildRangeLadder`** builds the grid, so the cell key
is faithful, but the live Asia/Monday range construction (OANDA M5/M30 vs M1
body-resample) is an approximation of the backtest's. This is the residual gap to
A/B before cutover. (The `approachVel`-timing caveat this section used to describe
no longer applies — §14 found the condition itself doesn't pay, so v2 no longer
conditions on it by default.)

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

## Two grading-input fixes (superseded by the v3 correction, kept for history)

Both of these were built to patch symptoms of the v1-era architecture (pooled
policy, triple-barrier exit, `approachVel` condition) and are now moot — the v3
correction removed the `rr` gate entirely (no fixed target to ratio against) and
removed the `approachVel` condition by default (§14: it doesn't pay). Left here so
the history of "why does this field exist" isn't lost:

- **R:R / A+ reachability (pre-v3).** The ladder's fixed adjacent-line exits were
  ≈equidistant so `rr ≈ 1:1` by construction, and a naive `rr ≥ 1.5` gate made A+
  unreachable. The v3 fix isn't a better `rr` gate — it's pricing `expectancy` off
  the realized chandelier-trail PnL directly, which made the `rr` concept obsolete.
- **Live velocity bucket (pre-v3).** Fetching M1 (not M5) for the approach path so
  the live `approachVel` bucket matched the learned cell. Still correct plumbing
  (`levelsV2Engine.js` still fetches M1 for the approach path), but moot for
  grading now that `approachVel` isn't a default condition — kept in case a future
  re-learn deliberately re-enables it via `conditions`.

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
- **Fires on live-price approach, not just the 30-min cycle.** A dedicated server
  loop `checkV2AlertsNow(pairs)` runs every ~90s: it reads the cached zones
  (`ai_entries_v2_*`) + a fresh price per pair and applies `selectAlerts` — so an
  approach mid-cycle alerts within ~90s. The 30-min refresh only recomputes the
  zones (no alerting there anymore).
- **Own bot, or shared.** v2 prefers its OWN Telegram bot (`tg_v2_config`, set in the
  ⚙ Alerts panel — token + chat ID + Send-test), falling back to the shared v1
  `tg_config` if none is set (`loadV2Creds`). Routes `GET/POST/DELETE
  /api/levels-v2/telegram-config` + `POST /api/levels-v2/telegram-test`.
- **The default `minGrade: 'A'` only became meaningful after the v3 correction.**
  Under the old zone-walk + `approachVel` policy the edge scale topped out around
  B (~0.02%/touch), so `minGrade: 'A'` silently filtered out every zone forever —
  the practical symptom that motivated this fix. Re-check the OOS card's grade
  spread after a re-learn before assuming the default is still too strict.

## Still deliberately deferred

- **Promote-from-ledger** UI (one-click blend of `refitFromLedger` into the frozen
  policy after review) — the candidate is computed, promotion is still manual.
- Broaden beyond Asia/Monday fib ladders to the full `levelSources` set.
- Python bot reader for `ai_entries_v2_*` behind a `telegram_mode_v2` flag.
