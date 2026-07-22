# Build Plan — Turning the ColezTrades Strategy into a Backtestable System

**Audience: a future Claude session (me).** This is an implementation blueprint,
not a pitch. It reads the ColezTrades discretionary playbook
([`ColezTrades_Trading_Strategy.md`](ColezTrades_Trading_Strategy.md)) and lays
out exactly how to build a version we can run through the honest harness — which
bricks to import, what to write, what order to build in, and how we'll know if it
worked. Read `CLAUDE.md` and `LEGO_MODULES.md` before starting; this plan assumes
both.

---

## 0. The honest prior (say this out loud before writing code)

- **Folklore, not replicated.** Every *entry* component of ColezTrades —
  support/resistance, Fibonacci, volume-profile levels, VWAP, oscillator
  divergence (VuManChu) — is practitioner folklore with weak/no durable
  after-cost evidence. None of it is in the replicated set (momentum, carry,
  vol-risk-premium). Per the house working-agreement, do **not** call this
  "promising."
- **Blunt odds:** a fully-mechanised ColezTrades that beats a naive benchmark on
  a true OOS split, after costs, with ≥30 OOS trades, is roughly a **10–15%**
  proposition. The default expected outcome is **null**. Finding that cheaply is
  a *win*, not a failure.
- **The one durable idea in the deck is the risk management** (fixed-fractional
  risk, defined stops, partials, move-to-BE, no revenge trading) — that's a
  *sizing/management* edge, and it sizes an entry edge that must already exist.
  It cannot rescue a zero-edge entry. State this dependency up front.
- **Why build it anyway (a legitimate reason):** it's *cheap* here. ~80% of the
  machinery already exists as bricks (see §2), so the marginal cost of an honest
  test is low, and a clean null on a popular retail strategy is a genuinely
  useful result to have in hand. Offer the owner that framing and let them
  decide.

**Pre-registration (write this into the results card before running):**
- *"It worked"* = OOS Sharpe beats **all** of {fade, follow, regime} incumbents
  from `honestForecastEngine.compareModes` **and** buy-and-hold, after costs, on
  ≥30 OOS trades, and the VuManChu gate (Stage 3) improves OOS over the ungated
  base (Stage 2).
- *"It didn't"* = OOS Sharpe ≤ incumbent/benchmark, or <30 OOS trades, or the
  VuManChu gate doesn't beat the ungated base. A "significant" in-sample number
  is **not** a result.

---

## 1. Decompose the discretionary strategy into deterministic rules

The playbook is five discretionary steps. Each must become a rule with **no
lookahead** and a **pinned judgment call**. This table is the spec:

| ColezTrades step (discretionary) | Deterministic rule to implement | Judgment call that MUST be pinned |
|---|---|---|
| Mark HTF structure, POC/VAH/VAL/HVN, Fib golden pocket | Emit levels from `levelSources` (`swing_sr`, `volume_profile`, `swing_fib`, `pivots`, `prior_hilo`, `vwap`) on the **HTF** bar set (D1/H4) | Which sources are "on", and their lookback windows |
| POI = area of confluence | `clusterLevels(levels, tolPips, instrument)` → a zone's `score` (Σweight) and `count` (distinct members) = POI strength | `tolerancePips` (zone width) and the **min confluence** (`count ≥ k`) to qualify as a POI |
| Price *approaching* a POI | On the **entry timeframe** (e.g. M15/M5), detect price entering within `approachPips` of a qualified zone edge | `approachPips`, and which side (fade toward zone / into zone) |
| VuManChu confirmation (vol divergence, VWAP cross, Money Flow fade) | On the entry-TF bars up to *now*: `waveTrendSeries` + `computeMoneyFlow` + `computeVWAP` → a **confirmation gate** (see §3, Stage 3) | Divergence lookback/tolerance; which of the 3 signals are required vs optional |
| Trade makeup: SL beyond POI/structure, TP at RR | Order spec fed to `walkBars`: entry at zone, SL = zone edge ± `slPad`, TP = entry ± `RR × stopDist` | `slPad`, `RR`, and whether TP is capped at the next opposing level |
| Order type (market / limit / stop) | `entryType: 'limit'` (fade into zone) or `'stop'` (false-breakout re-entry) — both already handled by `walkBars` | Default order type; false-breakout stop is a **Stage 4** add-on |
| Risk mgmt: 1% risk, move-to-BE at 1:1, partials at 1:1/1:2/1:3, trailing | Position sizing is % of equity → for a % or R-multiple return series it's a constant, so model as **fixed fractional**; BE/partials/trailing are **path-dependent** and need M1 fills (Stage 5) | Risk %, partial schedule, trail rule — each is a DOF, add last and measure |
| News filter (avoid NFP etc.) | Requires an economic calendar the sandbox doesn't have — **defer, note as data gap** | n/a (out of scope until a calendar feed exists) |
| "HTFs & LTFs indicating a reversal" | Optional bias gate via `dayTypeScore` (reversion when T low) + `rangeBiasCore` conviction | Whether to gate on it at all (adds DOF) |

**Direction rule** (mechanising fade-vs-follow): this is fundamentally a
**reversion-at-a-level** strategy — fade the touch back toward the zone. That maps
onto `dayTypeCore.dayTypeScore`: **low T (range/chop) → fade the POI**; high T
(trend day) → either skip or use the false-breakout follow. Use
`selectStrategy(T, regime)` as the selector rather than a fixed choice.

---

## 2. The bricks already exist — import, do not rebuild

This is the key finding. Almost every piece is a registered brick. **The build is
mostly composition.** Do **not** write a new level engine, a new WaveTrend, a new
fill loop, or a new metrics function.

| Need | Import from | What it gives you |
|---|---|---|
| Levels (structure, POC/VAH/VAL, Fib golden pocket, pivots, VWAP, round #) | `js/levelSources.js` — `collectLevels`, `clusterLevels`, `LEVEL_SOURCES` | `Level[]` per source + confluence **zones** with `score`/`count`/`sources`. The `swing_fib` source **already** projects the 0.618/0.65 golden pocket and only emits where ≥`minConfluence` distinct swing pairs agree |
| POI = confluence | `clusterLevels(levels, tolPips, instrument)` | Ranked zones; `count ≥ k` **is** the "more confluences = stronger" rule, already quantified |
| VuManChu (WaveTrend, Money Flow, VWAP) | `js/vumanchuCore.js` — `waveTrendSeries`, `computeMoneyFlow`, `computeVWAP`, `waveTrendReading` | Raw series for gating + a latest-bar signal. Same compute the live bot uses |
| Confluence → star/score grade | `js/entryGradeCore.js` — `computeStars`, `computeStructScore`, `computeSignalScore` | Grades a level the SAME way the live alerts do |
| Fade-vs-follow selector | `js/dayTypeCore.js` — `dayTypeScore`, `classifyDayType`; `forecastCore.selectStrategy` | `score → choice`, the "brain is a selector" pattern |
| The fill primitive (entry/SL/TP intrabar, no-lookahead, fill-bar causality handled) | `js/forecastCore.js` — **`walkBars`** | Walks bars, fills limit/stop, resolves SL-first/TP, marks to window close. **This is THE entry primitive** — feed it a level-based order spec |
| Bands/vol math (if we want σ-scaled SL/TP instead of fixed pips) | `js/forecastCore.js` — `computeBands`, `volSigmaSeries`, `nextSigma` | Horizon-scaled σ so SL/TP are vol-aware and horizon-agnostic |
| Bar utils (M1 hot path, resample, ATR) | `js/barUtils.js` — `extractBars`, `resampleTo`, `bodyRange`, `calcATR` | Build the HTF level set and the entry-TF bars from M1 |
| Metrics + IS/OOS split (+ skew/kurt/VaR) | `js/honestForecastEngine.js` — `summarizeSplit`, `compareModes`; `js/metricsCore.js` — `summarizeTrades` | The honest card. `compareModes` gives the fade/follow/regime incumbent to A/B against |
| Instrument pip/digits | `js/instrumentRegistry.js` — `pipSize`, `instrument` | Correct pips (a wrong pip is a 10× PnL bug) |
| M1 data load | `js/volBacktestM1Engine.js` — `loadM1ForPair`, `BT_M1_DIR` | R2/parquet/Drive M1 for intrabar fills |

### The template to copy: `asiaRangeEngine.js`

`js/asiaRangeEngine.js` is **the closest existing engine** and should be the
structural template (the way `volBacktestV2Engine.js` is the template for
vol strategies). It already composes almost this exact stack — its imports:

```
loadM1ForPair · barUtils · fibProjection · waveTrendSeries (VuManChu) ·
confluenceModules · confluence-core · rangeBiasCore · entryGradeCore ·
trade-grade · dayTypeScore
```

The only real difference: asiaRangeEngine anchors levels to the **Asia session
range**; ColezTrades anchors them to **multi-source HTF confluence zones**
(`collectLevels`/`clusterLevels`). So the build is largely: *take asiaRangeEngine's
skeleton, swap the level source for `collectLevels`, keep the VuManChu gate and
the grade/metrics wiring.* Read asiaRangeEngine end-to-end before writing anything.

---

## 3. Build order — escalate in stages, minimal DOF first

Per `CLAUDE.md`'s backtest-build discipline: **do not write the tearsheet first.**
Prove each stage's number honestly before adding the next knob. Each stage is a
separate, committable milestone.

### Stage 0 — Sanity the join (no PnL yet)
Load D1 + M1 for one liquid pair (e.g. GBP/USD, the deck's example). Print row
counts, date ranges, and that `collectLevels`/`clusterLevels` produce sane zones
at a known date. A polished tearsheet on a broken join is worse than none.

### Stage 1 — Zero-parameter POI touch (the minimal-DOF signal)
The bare, near-unfittable rule:
- Build HTF zones once per day via `collectLevels` + `clusterLevels`, keep zones
  with `count ≥ 2`.
- On the entry TF, when price touches a zone, **fade** it: `walkBars` with a
  limit entry at the zone price, SL a fixed small pad beyond the zone, TP at a
  **fixed 1:1 RR**. Direction = fade (sell upper-half touches, buy lower-half).
- **Costs ON** (`DEFAULT_COST_PCT`/`DEFAULT_SLIP_PCT` by asset class). No VuManChu,
  no bias, no partials.
- Report raw CAGR/Sharpe/DD via `summarizeSplit`. **This is the honest floor.**

### Stage 2 — Confluence as the only selector
Turn POI strength into the one knob: require `count ≥ k` and/or `score ≥ s`, and
let RR vary with confluence if desired — but prove `k` OOS, don't fit it IS.
Compare to Stage 1. Confluence is the deck's central claim ("more confluences =
higher probability"); this stage tests it in isolation.

### Stage 3 — Add the VuManChu confirmation gate (the deck's actual signal)
Now add the gate and **measure whether it improves OOS over Stage 2**. On entry-TF
bars up to the touch:
- **Volume divergence**: price makes a new extreme vs the prior swing while
  `waveTrendSeries` does **not** (needs a small divergence detector — see §4).
- **VWAP**: `computeVWAP().osc` crossing / trending toward zero in the trade
  direction.
- **Money Flow**: `computeMoneyFlow` in the opposing colour and fading toward zero.
Gate = require *m of 3* (start with m=1, i.e. any; then m=2). If Stage 3 does not
beat Stage 2 OOS, **the VuManChu signal is null** — report that plainly; it's the
core falsification of the strategy.

### Stage 4 — Order-type & direction refinements
False-breakout **stop** re-entries (`entryType: 'stop'`), and the
`dayTypeScore`/`selectStrategy` fade-vs-follow selector for trend days. A/B each
against Stage 3.

### Stage 5 — Risk management (path-dependent, needs M1)
Move-to-BE at 1:1, partials at 1:1/1:2/1:3, trailing stop. These are the deck's
genuine contribution but are path-dependent — model them on **real M1 intrabar
paths** (never assume the intrabar TP was hit on a D1 bar). Measure the effect on
the return **distribution** (skew/kurt/CVaR from `summarizeTrades`), not just Sharpe.

> At every stage: **disaggregate before declaring null** (per pair, per session,
> per confluence count) but **count the cells and state the chance baseline** — a
> couple of "winners" among dozens of slices is what noise looks like. Read a
> monthly/yearly heatmap of the survivor, especially the last 1–3 years.

---

## 4. The one genuinely-new brick to build

Everything else is import. The only real *new* pure logic is a **divergence
detector**, because `vumanchuCore` emits the raw series but not the
price-vs-oscillator divergence read the deck relies on.

- **Contract:** `detectDivergence(priceBars, oscSeries, { lookback, strengthN, tolPips }) → { type: 'bullish'|'bearish'|null, at }` — compares the last two swing pivots in price against the aligned oscillator pivots (regular divergence: price higher-high + osc lower-high = bearish, and mirror). Pure, no I/O.
- **Why it's a real brick:** used by any oscillator-divergence strategy (WaveTrend, RSI, MACD), has a stable input→output contract, and is unit-testable on synthetic data. It belongs next to `statsCore`/`indicatorCore` as a Tier-1 primitive.
- **Register it** in `LEGO_MODULES.md` (row + consumers + test) — the registry is part of "done" (Lego Principle 6). Add a test in `js/legoBricks.test.mjs` on synthetic higher-high/lower-high fixtures.

Do **not** re-inline divergence logic inside the engine — that's exactly the
copy-drift the Lego Principle forbids.

---

## 5. Wiring & house conventions (the "done" checklist)

- **New engine file:** `js/poiReactionEngine.js` (or `colezEngine.js`). Version it
  (`…V1Engine.js`); never edit v1 engines in place.
- **Async job route:** `POST /api/poi-reaction/run` → `jobId`; `GET
  /api/poi-reaction/status/:jobId`. Copy the `/api/honest-forecast/*` block.
- **Dashboard page:** self-contained dark-theme HTML reusing the IS/OOS +
  cost-sensitivity card; render the zones with `js/levelChart.js`
  (`createLevelChart(el).setCandles().setLevels(Level[]).setZones()`) so the POIs
  are visible — no new chart wiring.
- **3 CSV export buttons** in the exact schemas (% Returns / R-Multiples /
  Currency P&L). **MAE must come from the real M1 intra-trade path.** State the
  account size and R-unit next to the buttons; watch the degenerate case where R
  = fixed-% makes the R column identical to % Return (use per-trade realized vol
  as the R-unit, or say plainly they're redundant).
- **Link from `index.html`** (the primary dashboard), and the specific page it
  extends — **not** `hub.html` unless asked.
- **Validate locally before commit:** `node --check` the engine + `server.js`;
  unit-test the divergence brick + a synthetic-bar end-to-end run (no network).
- **Costs on by default; true IS/OOS split via `summarizeSplit`; ≥30 OOS trades**
  or it doesn't count.
- **Update `LEGO_MODULES.md`** for the new divergence brick and the new engine's
  consumer list.

---

## 6. Data requirements & sandbox limits (be honest about these)

- **Needs M1** for: honest intrabar fills (`walkBars`), the volume profile
  (`volume_profile` source needs `intraday`), VWAP anchors, and intraday
  VuManChu. Load via `loadM1ForPair`. Without M1 you can only mark-to-window-close
  and the volume-profile/VWAP sources return `[]`.
- **D1** via `fetchD1` (needs `OANDA_KEY`) for the HTF structure/fib/pivot levels.
- **OANDA is 403 in the sandbox** — that's environment, not a bug; fetch runs in
  Railway. Develop against cached M1 / synthetic bars locally.
- **No economic-calendar feed** → the deck's news filter is **out of scope** until
  one exists. Note it; don't fake it with a lookalike.
- **Volume caveat:** OANDA "volume" is tick count, not real volume — the volume
  profile and Money Flow are tick-volume proxies. State this; don't dress it up.

---

## 7. What a null looks like, and why that's fine

If Stages 1–3 come back flat/negative OOS after costs (the base-rate expectation),
the honest deliverable is: *"Mechanised ColezTrades reproduces the discretionary
rules faithfully; on a true OOS split with costs it shows no edge over
fade/follow/regime or buy-and-hold; the VuManChu gate did not improve OOS. Kept as
a read-only viewer, wired into nothing"* — exactly how `js/mve/*` is handled.
That's a real result. Do not re-narrate a null into a "maybe," and do not oversell
Stage 4/5 refinements to soften it — if the entry has no edge, better risk
management just loses more slowly.

The most valuable by-product regardless of outcome: the **divergence brick** and
the **`collectLevels` → `walkBars` POI-reaction harness** are reusable
infrastructure that outlive this particular signal.

---

## TL;DR build sequence

1. Read `asiaRangeEngine.js`, `levelSources.js`, `forecastCore.js` (§2).
2. Stage 0 join sanity → Stage 1 zero-param POI-fade with costs → **read the floor**.
3. Add confluence selector (Stage 2), then the VuManChu gate (Stage 3) and
   **A/B each on the OOS card**.
4. Build + register the one new brick (divergence detector) with a synthetic test.
5. Only if OOS survives: order-type/direction (Stage 4) and path-dependent risk
   mgmt on M1 (Stage 5).
6. Wire route + page + CSVs + `index.html` link; update `LEGO_MODULES.md`.
7. Report green honestly and red honestly. Expect null; find it cheaply.
