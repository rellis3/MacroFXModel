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

1. `no_snapshot` — pair never refreshed.
2. `stale_features` — snapshot older than `maxStalenessMs` (default 15 min live).
   A confident answer from stale features is the worst silent failure mode.
3. `news_window` — as above.
4. `no_level_nearby` — no zone within `maxDistSigma` (default 0.35σ) of the
   request price. The engine scores *zone touches*, not open space.

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
- **Incremental by construction:** `data/backfill_state.json` records the last
  processed date per pair, so re-running appends only new days. One full run
  gives day-one training data; after that the server runs an **automatic daily
  top-up at 03:05 UTC** (change with `TDE_BACKFILL_UTC="HH:MM"`, disable with
  `TDE_BACKFILL_DAILY=0`; the harness buttons cover bootstrap/ad-hoc runs).
  The top-up can only advance as far as the R2 M1 store has been topped up —
  a run with no new sessions appends nothing and exits (idempotent).
- **Fit + calibration:** `fitLogistic` trains on the same bounded features
  (time-ordered split, 10-day embargo) and reports per-decile OOS calibration
  + Brier for the fitted candidate AND the v0 prior. The candidate ships with
  `calibrated:false` — promotion to `modelV1.js` is a manual decision on that
  evidence (≥30-event buckets within ±10 pts, beats the prior on OOS Brier).

Routes: `POST /api/trade-decision/backfill/run` (async-job pattern),
`GET …/backfill/status/:jobId`, `GET …/backfill/report`.

## 7b. Roadmap — remaining steps to a fitted live model

1. ~~Backfill + outcome labeler + candidate fit~~ — built (§7).
2. **Shadow labeling of live decisions:** join live `decisions.jsonl` rows with
   realized outcomes the same way (they carry the same feature vector), so the
   live stream extends the training set with the exact distribution the engine
   sees in production.
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

## 9. Honesty box

- The v0 probability is a **prior, not evidence**. Nothing here claims edge until
  the fitted model beats the incumbent on OOS with calibration proof (Lego
  Principle 5).
- Live snapshots are built from **completed D1 bars** — `dayOpen ≈ last close`,
  σ lags one bar. Good enough for v0; the session-open anchor
  (`fetchSessionOpenLondon`) is the known upgrade.
- Level sources needing intraday data (volume profile, VWAP) are OFF in the live
  slow loop until an M1 feed is wired in; the zone map uses
  `daily_open / prior_hilo / pivots / swing_sr / round_number`.
- OANDA is unreachable in the sandbox (403) — that's environment, not a bug.
  Synthetic mode exists exactly so the engine is testable anywhere.
