# Trade Decision Engine — Architecture

**What this is:** a decision *service*. A bot (or a human on the test harness) sees
price entering a zone and fires one call:

```
POST /api/trade-decision/decide   { pair, price, direction?, action? }
```

and gets back, in milliseconds:

```
{ decision: "go" | "skip", direction, probability, size_multiplier, top_factors, ... }
```

All the framework-stacking (regime, trend-day-ness, vol state, level confluence,
price stretch, session, news) is hidden behind that one endpoint. The bot stays
dumb: *see zone → call API → obey*. If it works, this becomes the gate every
future entry passes through.

**What this is NOT (yet):** a trained meta-labeling model. The v0 scorer is a
transparent hand-weighted logistic prior (`modelV0.js`) whose whole purpose is to
put the *plumbing* in production and start accumulating the decision log — the
labeled event history a real fitted model needs. See §7 Roadmap.

---

## 0. Relationship to the existing `DecisionEngine/`

They are complementary layers, not rivals:

| | `DecisionEngine/` (existing) | `Trade_Decision_Engine/` (this) |
|---|---|---|
| Question answered | "What trade *types* are permitted right now?" (session-level permission state) | "*This specific zone touch* — go or skip, at what probability?" (per-event score) |
| Granularity | one state per pair per refresh | one decision per zone-touch event |
| Output | mode / permissions / participation | probability + go/skip + size multiplier |
| Consumer | dashboard banner, discretionary trader | bots via API, test harness |

A future integration can multiply the two (permission gate × event probability),
but neither depends on the other.

## 1. The core idea (meta-labeling)

A primary framework decides *where* (the zone) and proposes *what* (fade/follow,
long/short). A secondary layer looks at everything known **at that moment** and
outputs the probability that *this instance* of the setup works. Two phases:

- **Learn (offline, later):** log every zone-touch decision with its full feature
  vector, label it win/loss once the trade resolves, fit a simple classifier
  (logistic regression — the log is the training set). Walk-forward with an
  embargo gap; judged on OOS **calibration** (when it says 65%, does that bucket
  win ~65%?), not accuracy.
- **Score (online, now):** feed the current snapshot's features through the model.

Dynamic levels (opens, pivots, S&R, round numbers…) are handled by featurizing in
**relative, normalized terms** — level *type*, distance from open in **σ units**,
confluence *count* — never absolute price. The levels move every day; the feature
space doesn't. That is what makes events poolable across days and pairs.

## 2. Two loops — where the work happens

The ms-latency requirement is met by splitting computation:

```
      SLOW LOOP  (background, seconds→minutes cadence)          FAST LOOP  (per request, <5 ms)
┌────────────────────────────────────────────────┐      ┌─────────────────────────────────────┐
│ featureState.js                                │      │ decisionCore.js  (pure, no I/O)     │
│  • OANDA D1 bars        (fetchD1 — the brick)  │      │  1. staleness check   → fail closed │
│  • σ series             (volSigmaSeries)       │      │  2. news hard gate    → skip        │
│  • regime               (classifyRegime)       │      │  3. nearest zone      → confluence  │
│  • trend-day-ness T     (dayTypeScore)         │      │  4. build features    (normalized)  │
│  • vol percentile       (rollingPercentile)    │      │  5. logistic score    → probability │
│  • level map + zones    (collectLevels +       │      │  6. threshold + size  → decision    │
│      clusterLevels — Tier-2 brick)             │      │  7. top_factors       (transparency)│
│  • news calendar        (Finnhub, optional)    │      │                                     │
│         ▼                                      │      │ decisionLog.js — append JSONL       │
│  FeatureSnapshot (in-memory Map, per pair)     │─────▶│ (this file IS the future train set) │
└────────────────────────────────────────────────┘      └─────────────────────────────────────┘
```

- **Slow loop** (`featureState.js`): maintains one `FeatureSnapshot` per pair.
  All expensive math happens here, on its own cadence (`startRefresher`, or a
  manual `POST /refresh`). Everything is computed by **importing the existing
  bricks** — the vol math, day-type score, regime classifier and level sources
  are the same code the backtests run (Lego Principle 1: never copied).
- **Fast loop** (`decisionCore.js`): pure and synchronous. A snapshot lookup, a
  handful of request-specific features, a dot product, a sigmoid. Microseconds
  of compute; single-digit ms including HTTP.

### FeatureSnapshot contract

```js
{
  pair, mode: 'live'|'synthetic',
  builtAt,               // ms epoch — staleness is judged against this
  price, dayOpen,        // reference prices (live: last completed close ≈ today's open)
  sigmaDaily,            // fractional daily σ (walk-forward, same math as the backtests)
  volPct,                // σ percentile vs trailing 252d, 0..1
  regime,                // 'BULL' | 'BEAR' | 'RANGE'   (classifyRegime)
  T,                     // trend-day-ness 0..1          (dayTypeScore)
  zones: [{ price, score, count, sources, kinds }],   // clusterLevels output
  calendar: [{ timeMs, impact, currency, title }],    // upcoming events
}
```

### Decision request / response contract

Request (`POST /api/trade-decision/decide`):

```js
{
  pair: 'eurusd',
  price: 1.0852,            // optional — defaults to snapshot price
  action: 'fade'|'follow',  // optional — engine derives from T/regime if absent
  direction: 'long'|'short',// optional — engine derives if absent
  approach_sigma: 0.4,      // optional — recent move into the zone, in σ units
  mode: 'live'|'synthetic', // synthetic = deterministic demo snapshot (sandbox)
}
```

Response:

```js
{
  ok: true,
  decision: 'go' | 'skip',
  direction, action,
  probability: 0.61,          // null when a hard gate fired
  size_multiplier: 0.8,       // 0 on skip; continuous sizing dial on go
  regime, T, vol_percentile,
  zone: { price, distance_sigma, confluence, sources },
  top_factors: ['confluence 3 sources (+0.37)', ...],
  reasons: [],                // hard-gate reasons when skip
  model_version: 'v0-prior-2026-07',
  calibrated: false,          // honest flag — v0 is NOT a fitted model
  feature_staleness_ms: 420,
  mode, latency_ms,
}
```

## 3. Hard gates vs model features (the news answer)

News lives **inside the engine**, in two forms:

- **Hard gate** (`newsGate.js`): a high-impact event on one of the pair's
  currencies within the block window (default 45 min before → 15 min after)
  forces `skip` *before the model is consulted*. The model's probability is
  meaningless inside an event window it wasn't trained on.
- **Soft feature**: a high-impact event later in the horizon (default 4 h)
  becomes a `news_soon` feature with a negative weight — context, not veto.

The other hard gates, in order (each fail-closed):

1. `no_snapshot` — the pair has no snapshot AND the on-demand warm-up failed
   (the server's decide route warms a missing/stale snapshot automatically —
   a bot only ever sends pair + price; a warm-up failure is surfaced as
   `slow_loop_error` in the response so the caller knows why).
2. `stale_features` — snapshot older than `maxStalenessMs` (default 15 min live)
   and the warm-up couldn't replace it. A confident answer from stale features
   is the worst silent failure mode.
3. `news_window` — as above.
4. `no_level_nearby` — no zone within `maxDistSigma` (default 0.35σ) of the
   request price. The engine scores *zone touches*, not open space. Exception:
   `own_level: true` in the request means the caller vouches for their own
   level at that price (a hand-pulled fib, an order-flow line). If the map has
   a zone there it is used — the caller's level agreeing with the map is real
   confluence; otherwise the price is scored as a standalone external level
   (confluence 1) instead of refused.

`skip` from a gate carries `probability: null` and the reason — it is an explicit
answer, not an error.

## 4. Features (v0 set — all bounded 0..1, all no-lookahead)

| Feature | Meaning | Sign |
|---|---|---|
| `fade_range_regime` | fading while regime = RANGE | + |
| `follow_trend_regime` | following with directional regime and T ≥ 0.55 | + |
| `fade_on_trend_day` | fading while T is high — "selling into a rally" | − (strong) |
| `follow_on_quiet_day` | chasing breakouts on a reversion day | − |
| `confluence` | distinct level sources in the zone beyond the first (cap 4) | + |
| `zone_score` | weighted zone score from `clusterLevels` | + |
| `stretch_fade` | zone ≥ 0.5σ from day open when fading (stretched = better fade) | + |
| `stretch_follow_chase` | zone ≥ 1σ from open when following (extended = chasing) | − |
| `vol_extreme` | σ percentile > 0.9 | − |
| `vol_compressed` | σ percentile < 0.2 | + (mild) |
| `news_soon` | high-impact event inside soft horizon (outside hard window) | − |
| `late_session` | UTC ≥ 19h — thin tape | − (mild) |
| `fast_approach_fade` | fast approach (σ-units) into a fade level — freight train | − |
| `fast_approach_follow` | fast approach on a follow/breakout — momentum confirms | + |

Direction/action defaulting reuses the repo's **selector brick**
(`selectStrategy(T, regime)` from `forecastCore`): low T → fade, high T +
directional regime → follow; fade direction = against the zone's side of the day
open, follow direction = with the regime. A bot may override both — the engine
then *judges* the bot's proposal instead of proposing its own.

## 5. The model registry (`modelV0.js`)

One object: `{ version, calibrated, intercept, weights, goThreshold, sizeCurve }`.
The weights are logit-units, hand-set priors, **flagged `calibrated: false`** and
surfaced in every response. Replacing v0 with a fitted model is a data swap, not
a code change: fit logistic coefficients on the decision log, publish as
`modelV1.js` with `calibrated: true` and the walk-forward evidence, switch the
import. The feature builder is shared by both, so live scoring and training can
never diverge (the bit-identical-port lesson from `TRADABILITY_REVIEW.md`).

Sizing: `skip` below `goThreshold` (0.55); above it,
`size = min(1.5, 0.5 + (p − threshold) × 5)` — a continuous dial, because
meta-labeling earns more as bet-sizing than as a binary gate.

## 6. The decision log (`decisionLog.js`)

Every `decide` call appends one JSONL row to
`Trade_Decision_Engine/data/decisions.jsonl` (git-ignored): timestamp, request,
full feature vector, score, decision, model version. This is deliberate
double-duty:

1. **Audit** — replay any historical decision exactly (the endpoint is
   deterministic given a snapshot).
2. **Training set** — once outcomes are joined (triple-barrier resolution, the
   same way `entryLedgerV2.resolvePair` does it), each row becomes a labeled
   meta-labeling example.

## 7. Backfill — day-one training data (`backfill.js`)

The engine does NOT start with an empty log. `runBackfill` replays the M1
parquet history (the `loadM1ForPair` brick — ~12 years per pair) through the
**same code path** the live API serves:

```
packed M1 ─ deriveD1Packed ─▶ per day i:
   buildSnapshot(D1 < i)            ← identical to the live slow loop
   first M1 touch of each top zone  ← approach-σ from the prior 30 min
   decide(snapshot, touch)          ← identical to the live fast loop
   labelOutcome(rest of day's M1)   ← triple-barrier: SL first (conservative),
                                      TP, else mark-to-day-close; after-cost
   → one labeled event (features + v0 probability + win/loss)
```

- **No lookahead:** the snapshot for day *i* sees only completed days `< i`
  (same 320-bar window as the live `fetchD1` count); the outcome walker only
  sees bars after the touch.
- **Exits:** TP = 0.5σ with the trade, SL = 0.75σ against (configurable);
  intrabar ambiguity resolves to the stop.
- **Session anchoring — London midnight everywhere:** live snapshots and the
  backfill both bucket the trading day at 00:00 Europe/London (the
  `londonMidnightSec` brick — the forecaster/book anchor), and `dayOpen` is the
  session's first M1 open on both paths. The backfill DROPS weekend stub
  sessions (<6h of bars): live `fetchD1` never sees them (OANDA merges Sunday
  evening into Monday's broker day), and under the old UTC bucketing ~540 such
  stubs were being replayed as fake tradeable days. `contextByDate` keys use
  the day-midpoint calendar date (`backfillDayDate`).
- **`vol_band` level source:** the forecaster's six band lines (median/75th
  proj H&L + proj closes), computed off the session open with the same
  `computeBands ∘ volSigma` math the volatility bot's daily plan uses — the
  lines the bot trades ARE zones, so a touch on a book line carries it in its
  confluence and "agrees with a vol band" is fit-measurable like any source.
- **Dynamic zones (resolved at decide() time, NOT frozen at midnight):** the
  static zone map is per-snapshot; levels that move or become valid during the
  session are merged per decision — (a) **today's developing high/low**
  (`session_hilo`, from the intraday state: live snapshot block / exact
  per-touch in the backfill), and (b) **cross-session confluence on the
  range-line bot's Asia + Monday ladders** (`computeSessionLadders`, built
  with the bot's own `buildRangeLadder` + `bodyRange` bricks: Asia = first 6h
  5m-bodies, VALID only after the formation window closes — the analyser's
  no-lookahead gate; Monday = this week's Monday 15m-bodies, never on Monday
  itself; only lines within 1.5σ of the open carried).
  **The raw ladder grid (every fib rung, unconfirmed) is deliberately NOT a
  zone source** — `LADDER_ZONE_STYLE` only turns *confluence* (asiaAlign /
  mondayAlign, below) into a zone; a lone, unconfirmed rung is noise, not a
  level (this mirrors the source Pine indicator's "All Levels" vs "Strong
  Levels" display modes — the engine always runs the confluence-only tier,
  never "All Levels"). `computeSessionLadders` still computes the full raw
  grid internally — it's the input the alignment match runs against — it's
  just never surfaced as a standalone zone. Confluence merges across the
  static/dynamic boundary: a PDH that is also today's session high and an
  aligned Asia line counts all three. Ladder lines are also backfill TOUCH
  CANDIDATES (the bot enters there), each scanned only from its validFrom
  onward — verified zero violations over a 12-year replay.
- **Cross-session alignment (`asia_prev_align`, `monday_prev_align`) — the
  ONLY way an Asia/Monday line becomes a zone:** the PREVIOUS session's Asia
  ladder is carried all day (`prevAsia`, marking only, never a standalone
  zone), and today's Asia lines are matched against yesterday's — and this
  week's Monday lines against the PREVIOUS week's Monday (15m bodies, marking
  only, never standalone) — through `detectConfluencesCore`, the SAME brick
  the dashboard/Asia backtest/Pine export share. Thresholds are **per
  instrument from the live caps model** (`confluenceCapsFor`, zero-copy from
  `CAP_DEFAULTS`): fx 2 pips, gold 200 gold-pips ($20), indices per-point
  (NQ 100 / SPX 25 / DAX 80 / FTSE 40 / Dow 60 / Russell 15); tight = 10% of
  the threshold, 0.3× cluster merge, session-range cap, ≥5-pip minimum range.
  Aligned clusters carry **count 2** (two independent sessions agreeing IS
  confluence); coincident dynamic levels (e.g. session_hilo landing on an
  aligned line) consolidate per-source within ~2 pips (a grid cannot confirm
  itself; adjacent rungs never chain-merge). `mondayAlign` scores higher than
  `asiaAlign` (2.6 vs 2.0 base, both +0.4 when tight) — a weekly level
  agreeing with LAST week is a rarer, higher-conviction, more-reactive
  confirmation than a daily one agreeing with yesterday. KV-saved caps
  overrides are a dashboard concern — the engine mirrors the defaults so
  backfill and live agree.
- **Instrument coverage — asset-class-agnostic by construction:** every
  asset-specific number switches on `instrumentRegistry` — σ estimator (fx→YZ,
  index→GARCH, commodity→HV20 via `volSigmaSeries`), band constants
  (`ASSET_PARAMS`), round-trip costs (`DEFAULT_COST_PCT`), pip size for zone
  tolerance. `TDE_BACKFILL_PAIRS` (the default run list) = 25 FX + gold + the
  index CFDs (`nq`, `spx`, `dow`, `rut`, `ftse`, `dax`), whose M1 parquets load
  from R2 under the same `<key>_m1.parquet` naming. A missing parquet fails
  per-pair with a logged error and the run continues — the run log is the
  availability report. (Verified on the real NQ parquet: 3,083 days → 8,214
  labeled events through the identical code path.)
- **Incremental by construction:** `data/backfill_state.json` records the last
  processed date per pair, so re-running appends only new days. One full run
  gives day-one training data; after that the server runs an **automatic daily
  top-up** (default 03:05 UTC). Schedule/enable/gap-fill live in **KV runtime
  config** (`trade_decision_cfg`, the caps pattern) — editable from the harness
  page via `GET/POST /api/trade-decision/config`, applied live with no restart;
  the `TDE_BACKFILL_*` env vars are only the defaults for a blank KV.
- **Independent of the R2 refresh:** before each replay the stored parquet is
  **gap-filled from the live OANDA M1 feed** (`m1GapFill` brick + `fetchM1Range`
  — the analyser's exact machinery), so the nightly run advances even when the
  R2 store hasn't been rebuilt. Gap-fill failure degrades to stored history,
  never aborts; a run with no new sessions appends nothing (idempotent).
- **Fit + calibration:** `fitLogistic` trains on the same bounded features
  (time-ordered split, 10-day embargo) and reports per-decile OOS calibration
  + Brier for the fitted candidate AND the v0 prior. The candidate ships with
  `calibrated:false` — promotion to `modelV1.js` is a manual decision on that
  evidence (≥30-event buckets within ±10 pts, beats the prior on OOS Brier).

Routes: `POST /api/trade-decision/backfill/run` (async-job pattern),
`GET …/backfill/status/:jobId`, `GET …/backfill/report`.

## 7c. Macro sockets — the frozen contract for `macroCore` (platform review #7)

The TDE side of the macro falsification plan is BUILT and tested; `macroCore.js`
(the Tier-1 brick: VIX + HY-OAS regime with publication lags, the FRED history
loader, the KV `fred` live read) plugs into these sockets without touching TDE
internals:

1. **Snapshot socket** — `buildSnapshot({ …, macro })` takes a pre-resolved,
   direction-agnostic context object (never raw FRED):
   `{ regime: 'RISK_ON'|'NEUTRAL'|'RISK_OFF', riskSens, asOf, stale? }`.
   Malformed input stamps `null` (fail-neutral), not a wrong sign.
   `refreshPair(pair, { macro })` passes it through for the live loop.
2. **Direction resolution** — `decisionCore.macroState(riskSens, regime,
   direction) → ±1|0`, applied inside `buildEventFeatures` after
   action/direction defaulting. Sign convention (frozen): `riskSens > 0` ⇒ pair
   rises in risk-off. `|riskSens| < MACRO_RISK_SENS_MIN (0.4)` ⇒ NEUTRAL —
   ambiguous pairs (EUR/GBP, AUD/NZD, CHF/JPY…) don't get a noisy sign.
   **`riskSens` must be derived from `fx-macro-model`'s `PAIR_DRIVERS` (import
   or registry promotion + golden equality test) — never a hand copy.**
3. **The feature** — ONE signed `macro_align ∈ {−1, 0, +1}` (the sole exception
   to the 0..1 convention): one degree of freedom ties the aligned bonus to the
   opposed penalty and halves the variance of a rarely-active feature. Zero
   when no context → pre-macro training rows unchanged. `modelV0` carries NO
   weight for it; it can only enter scoring through a promoted fit.
4. **Historical injection** — `backfillPair`/`runBackfill` accept
   `contextByDate: { 'YYYY-MM-DD': { macro?, calendar? } }`. The macro loader
   fills `macro` per day (obs-dated, +1-business-day publication lag); a
   historical calendar adopts the same shape later (today `news_soon` is
   structurally zero in training — its fitted weight is meaningless).
5. **Evidence, in priority order** —
   - PRIMARY: `macroBucketReport(events)` — per-bucket win rate / after-cost
     expectancy / per-year breakdown / **episode count** (≤7-day-gap runs;
     events inside one macro episode are one observation). Pre-registered bar
     (`MACRO_BUCKET_BAR`, frozen before results): OPPOSED underperforms with
     **n ≥ 30 AND ≥ 8 episodes over ≥ 3 calendar years**, sign-stable per year.
   - SECONDARY: ablation — `fitLogistic(events, { features: [...v0Keys,
     'macro_align'], embargoDays: 30 })` vs the same call without it, same
     time-ordered split, judged on OOS Brier + decile calibration. L2 shrinkage
     on a rare feature biases toward "macro fails": if the bucket test and the
     ablation disagree, re-run with `l2ExemptFeatures: ['macro_align']` before
     concluding.
6. **Sequencing** — adopt `nextSigma` (PR #654) in `featureState` and run ONE
   full rebuild first, so the macro ablation compares against an incumbent
   baseline on the fixed σ; then the macro loader; then the tests. Live KV
   `fred` older than ~48h ⇒ regime NEUTRAL + `stale: true` surfaced in the
   decide response (macro is a modifier, never a gate — a FRED outage must not
   block trading, but the degradation must be visible).
7. **Both tests fail ⇒ macro stays out of the feature vector permanently** and
   the platform's macro layer stays display-only. That is an acceptable
   outcome; the point is the answer.

**Credit sockets (same contract).** Corporate credit spreads (HY OAS) are wired
in exactly like macro: `_tdeCreditContext()` resolves a market-wide gate from the
`fredhistory_series_hy` mirror via the shared `creditCore`/`creditHmm` bricks
(cached — pair-independent), `buildSnapshot({ credit })` stamps `snapshot.credit`
when well-formed, and `CREDIT_FEATURES = ['credit_widening','credit_stress',
'credit_fade_in_stress']` are computed in `buildEventFeatures` (0 when absent).
They carry **NO v0 weight** — logged-but-inert, so live decisions are unchanged
(golden-tested: identical probability with/without credit context). They become
live only via a promoted fit, and only if credit clears the same falsification
bar — with the external `credit-leadlag.html` OOS study (does credit-Δ lead NQ
vol beyond vol's own persistence?) as the pre-registered evidence. Do not
hand-weight them.

## 7b. Roadmap — remaining steps to a fitted live model

1. ~~Backfill + outcome labeler + candidate fit~~ — built (§7).
2. **Shadow labeling of live decisions:** join live `decisions.jsonl` rows with
   realized outcomes the same way (they carry the same feature vector), so the
   live stream extends the training set with the exact distribution the engine
   sees in production. **Partially built:** the Positions tab (`bot-config.html`,
   all bots aggregated) POSTs every open position to
   `POST /api/trade-decision/score-positions`, which scores each at its OPEN
   price + direction (`own_level:true`) and renders an advisory GO/SKIP · prob ·
   size badge — read-only, the bots never consult it. Each ticket is
   shadow-logged ONCE (`source:'position-shadow'`) so the *real bot trades*
   accumulate the labeled set. A "live read" (snapshot is NOW, not entry-time)
   and v0 is still a prior — this builds evidence, it is not yet evidence.
   **Durable book + outcome join — built:** a background loop
   (`_tdeAccumulateShadowBook`, 7-min cadence, mirrors `_rlAccumulateTradeLog`)
   scores every open bot position and persists the reading to KV
   (`tde_shadow_book`, keyed by `position_id`; `tde_shadow_*` is in the `kv.js`
   persistent set so it survives redeploys) — independent of anyone viewing the
   tab. The Trade History audit (`GET /api/trade-decision/shadow-book?ids=…`)
   joins it to the realized outcome, showing a GO/SKIP · prob · ✓/✗ column and a
   GO-win / SKIP-loss summary tile. Join key is sound: MT5 position `ticket` ==
   `position_id` (paper sets them equal). Remaining: a fit on the accumulated
   shadow rows once enough real-trade outcomes are joined.
3. **v1 promotion:** when the calibration report earns it, publish the
   candidate weights as `modelV1.js` with the evidence attached; the feature
   builder is shared so nothing else changes.
4. **Richer features:** COT percentile, broker sentiment, risk-reversal skew
   (the order-book substitutes), intraday approach features from M1.
5. **Bot integration:** volatility/range-line bots call `decide` before entry;
   `size_multiplier` feeds position sizing.

## 8. Files

| File | Role | Pure? |
|---|---|---|
| `ARCHITECTURE.md` | this document | — |
| `decisionCore.js` | fast loop: features → score → decision | ✅ (unit-tested) |
| `modelV0.js` | model registry: weights, threshold, size curve | ✅ (data) |
| `newsGate.js` | hard/soft news logic over a supplied calendar | ✅ (unit-tested) |
| `featureState.js` | slow loop: snapshots (live via bricks / synthetic) | live path does I/O; `buildSnapshot` itself is pure |
| `decisionLog.js` | JSONL append + tail read | file I/O |
| `backfill.js` | history replay → labeled events + candidate fit (§7) | `deriveD1Packed`/`labelOutcome`/`backfillPair`/`fitLogistic` pure; `runBackfill` does file I/O |
| `decisionCore.test.mjs` | synthetic no-network tests | — |
| `backfill.test.mjs` | synthetic no-network tests for the backfill | — |

Server routes (in `server.js`): `POST /api/trade-decision/decide`,
`GET /api/trade-decision/state/:pair`, `POST /api/trade-decision/refresh`,
`GET /api/trade-decision/log`, `GET /api/trade-decision/health`.
Optional auto-refresher: set `TDE_PAIRS=eurusd,gbpusd,…` (+ `TDE_REFRESH_MIN`,
default 5) in Railway to keep live snapshots warm.

Test harness UI: `trade-decision-engine.html` (linked from the Dashboard).

## 8b. Research-arc findings (2026-07 — what was tested and what survived)

The engine's own honest harness (backfill → fit → disaggregation) was turned on
the strategy ideas it was built to score. Recorded so nobody re-runs the dead ends:

- **Ablation (macro deferred — no FRED in sandbox):** v0's hand weights are
  overconfident; the fitted OOS Brier lands at the **base-rate floor** — the
  price-derived features (v0 + intraday) carry essentially **no** OOS
  discrimination on the average touch. Intraday block adds ~0.0002–0.0003 Brier
  (noise).
- **Selection (decile test):** the fit DOES rank the tails (bottom decile ~49%
  win vs top ~59% on FX majors) — real "skip the worst" value — but every decile
  is net-negative after cost. Ranking a losing base ⇒ less-losing, not winning.
- **Exit sweep:** NO barrier geometry (incl. pure mark-to-close) rescues FX/gold;
  mark-to-close being negative is the tell that **touch→close has no directional
  edge** in the engine's chosen direction. The exit is not the fix.
- **Disaggregation (74 subset cells):** ZERO passed IS>0 ∧ OOS>0 (chance ≈ 5) —
  **reversion / level-touching is comprehensively null** on every source /
  regime / session slice.
- **Portfolio momentum (TS-mom, daily):** null on this universe (best OOS Sharpe
  0.13); FX is the weak corner for momentum. The always-long benchmark's 1.05 is
  a period artifact (gold/NQ bull run), NOT an edge.
- **✅ THE SURVIVOR — higher-timeframe trend alignment (`htf_align`):** taking
  level-touches **with** the pair's trailing-20d trend robustly beats taking them
  against it (aligned − opposed ≈ **+0.05%/touch**, consistent IS *and* OOS), and
  it improves the fit's OOS Brier ~**10×** more than the whole intraday block —
  over a baseline that already has v0's trend features, so it's not redundant.
  **Calibration (do not oversell):** the *separation* is the robust, real result;
  the aligned bucket is net-*positive* only **pooled across instruments, OOS**
  (+0.016%) — single instruments (e.g. eurusd) show the same direction but sit
  marginally negative. So it's a genuine directional *filter* worth ~5bps of
  separation, not a standalone profitable signal. The cross-asset USD-index
  alignment was a weak positive (+0.007%); equity-risk alignment was dead — both
  dropped. Lesson: the level says *where*; the higher-timeframe **trend** says
  *which way*. Fading levels (the original engine thesis) was backwards.
- **Next honest tests (untested here):** macro ablation on Railway (FRED
  reachable); carry (needs FRED rates / swap-inclusive returns — OANDA mids
  exclude the swap); realistic-slippage stress on the htf_align filter before
  calling it tradeable.

## 9. Honesty box

- The v0 probability is a **prior, not evidence**. Nothing here claims edge until
  the fitted model beats the incumbent on OOS with calibration proof (Lego
  Principle 5).
- **`htf_align` is the one feature with demonstrated OOS information** (§8b) —
  still zero-weighted in v0, promoted only by a fit; and even it is a *filter*
  (separation), not a standalone profitable signal.
- ~~`dayOpen ≈ last close`, σ lags one bar~~ — RETIRED: σ uses `nextSigma`, and
  `dayOpen` is the **true session open** (today's first M1 since London
  midnight live; the day's first M1 open in the backfill), falling back to
  last close only when the intraday fetch fails.
- **Intraday state is in** (`snapshot.intraday` / per-touch in the backfill):
  range-used vs the forecaster's median expected range, position-in-range,
  session VWAP distance, self-computed approach speed. The four
  `INTRADAY_FEATURES` are **zero-weighted in v0** (the macro discipline —
  computed + logged everywhere, promoted only via an ablation fit; first
  real-data read: exhausted-range fades UNDERPERFORM the base rate, opposite
  of the intuitive hand prior, which is exactly why they carry no weight yet).
  Known train/serve skew: live intraday state is as old as the snapshot
  (≤15 min); backfill state is exact at the touch. Bots can close the gap by
  passing fresh `intraday` on the request. Changing `dayOpen` redefines the
  stretch features → the training set needs one **full rebuild** before the
  next fit.
- The `volume_profile` level SOURCE stays OFF in the zone map (needs a deeper
  intraday history than the one-day fetch); session VWAP is now computed as
  intraday state instead.
- OANDA is unreachable in the sandbox (403) — that's environment, not a bug.
  Synthetic mode exists exactly so the engine is testable anywhere.
