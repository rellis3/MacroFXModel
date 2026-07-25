# The Institutional Analytics Engine — design & build map

> The owner's target: a desk-grade analytics stack that answers the questions
> institutions actually ask — *is this move statistically normal? is vol
> clustering? has the distribution changed? is the market mean-reverting? which
> regime are we in?* — organised as ~20 complementary engines.
>
> This doc is the build map for that target **on the existing Lego baseplate**.
> It exists so each engine is built once, imports what already exists, and is
> scored honestly. It is a *plan to build*, not a warning against building.

---

## 1. The one distinction that makes the whole thing buildable

Split the 20 engines into two classes with **different bars to clear**:

- **Measurement engines** (most of the list). They *describe* the market —
  entropy, half-life, tail index, range budget, coverage, effective bets.
  They claim no edge, so they owe no OOS proof. Their bar is **correctness**:
  pure functions, unit-tested on synthetic data with hand calcs, no lookahead.
  These can be built as fast as we can write them, guilt-free.
- **Signal engines** (direction, any filter/sizer wired into a bot). They claim
  edge, so they owe the full harness: real costs, realistic fills, true IS/OOS
  split, ≥30 OOS trades, deflated Sharpe (Lego Principle 5).

The migration path between the classes is **pre-registration**: a measurement
may graduate to a filter/sizer only by naming the win condition first and
passing the harness. Until then it renders on the desk view labelled
**context**, not edge. That's exactly how a real desk runs: the analytics stack
is always on; the strategy book is what's been proven.

---

## 2. The 20 engines, mapped to what exists (audited 2026-07-24)

| # | Engine | Already on the baseplate | Gap | Class |
|---|---|---|---|---|
| 1 | Direction | macro tier score, trend-basket (`trendFollowEngine` — the one with real evidence), econ-trend test | nothing urgent — direction claims are signal-class | Signal |
| 2 | Volatility | `volBacktestEngine` (EWMA/GARCH/HV/YZ), `volForecastBench` (+HAR-RV challenger, QLIKE/MSE OOS), Feller bands, COG bands | EGARCH/TGARCH only as *bench entrants* if the incumbent loses OOS | **Built** |
| 3 | Exhaustion | bands = the range budget; `priceSlowdown` two-budgets brick; reversion ladder | LIL excursion bound + a "range budget used %" gauge on the desk view | Measurement |
| 4 | Mean reversion | Hurst (`rangeBiasCore`), z-scores (`statsCore`), OU math stranded in `js/mve/ou.js` (read-only null engine) | extract **`ouCore`** (OU fit + half-life) as Tier-1, free of the MVE corner | Measurement |
| 5 | Trend strength | ADX (`indicatorCore`), `dayTypeScore` T (drift÷diffusion), Hurst | compose into one panel — nothing new to build | **Built** |
| 6 | Regime | HMM engines, BOCPD, `classifyRegime`, day-type | **`entropyCore`** (built this pass, §4) as an A/B challenger: KL/JS regime-shift vs HMM flips | Measurement |
| 7 | Tail risk | `histVaR`/`histCVaR`, skew/kurt, fat-tail `minTrackYears` (all `metricsCore`) | **`extremesCore`** — EVT/GPD tail fit, return levels, tail index | Measurement |
| 8 | Liquidity | — | **data-blocked** (no order-flow/depth feed). Honest proxies later: parquet tick volume, spread snapshots. Don't fake it | Deferred |
| 9 | Options positioning | OI walls, `gammaGreeks` (charm/vanna), IV surface + expected-move band overlay (2026-07 build) | consolidate onto desk view; pre-register one test before any edge claim (e.g. "distance-to-gamma-flip as range-line filter, OOS") | Context → Signal |
| 10 | Macro | tier score, FRED pub-lags, macro-regime brick, macro-conditioner ("does risk regime add beyond σ?") | — | **Built** |
| 11 | Cross-asset | `diversificationCore` (PCA/entropy/weighted effective bets), hedge corr matrix, yield-coupling brick | rolling corr-network snapshot on desk (low priority) | Measurement |
| 12 | Fair value | MVE — **banked null**, kept read-only; z-spread validated USDJPY-only | do not rebuild (banked finding) | Closed |
| 13 | Forecast calibration | `volForecastBench` (grades σ), `coneForwardTrack`, forecast analyser | explicit **interval-coverage card**: does HL75 contain the realized extreme ~75% of days, rolling, per asset class? Cheap, high value | Measurement |
| 14 | Market structure / fractal | Hurst | fractal dimension = cheap `statsCore` add-on when a consumer wants it | Low |
| 15 | Cycles / spectral | — | research-class; build when a specific question demands it | Deferred |
| 16 | Noise filtering | — | Kalman enters when a consumer exists (candidate: time-varying hedge ratio for the z-spread) | Deferred |
| 17 | Risk | VaR/CVaR, MTM-drawdown brick, credit-stress overlay | **one liquidity-contraction stress**: replay 2018Q4 / 2020Q1 / 2022 on the strategy sleeves together (`SYSTEM_ASSESSMENT` P2 #6) | Measurement |
| 18 | Portfolio construction | `diversificationCore`; per-trade inverse-σ sizing tested **null on the range-line book** (banked) | book-level allocation across 14 FX pairs + US-index basket (vol-target / Kelly-fraction at BOOK level) — pre-registered | Meas.+Signal |
| 19 | Execution | ladder export ready (`buildRangeLadder`) | **live wiring of the confirmed edge** + a fill-quality log (live fill vs backtest fill, per trade) — the forward-validation instrument | The bridge |
| 20 | Machine learning | rankIC scaffolding | last: a method sizes/filters an edge that must already exist (house rule) | Deferred |

Read of the audit: **the analytics engine is ~60% built and scattered across
~15 pages.** The remaining work is four missing bricks, one stress scenario,
one coverage card, and one page that assembles it.

---

## 3. The deliverable — the Desk View

`analytics-desk.html` (linked from `index.html`, per house rules): one page,
per instrument, answering the institutional questions as labelled readings —

| Question | Powered by | Label |
|---|---|---|
| Expected range today / this week? | Feller bands + bench-winner σ | validated input |
| How much of the budget is used? | priceSlowdown + bands (+ LIL bound) | context |
| Which regime? | HMM / BOCPD / day-type **and** entropy-shift challenger, side by side | context |
| Trending or reverting? | dayTypeScore T, Hurst, OU half-life | context |
| Is this move statistically normal? | rolling z, percentile, EVT return level | context |
| How fat is the tail right now? | GPD tail index, CVaR | context |
| Where are the dealers? | OI walls, gamma flip, expected-move band | context |
| How many independent bets is the book? | diversificationCore | risk |

Every panel states its label. Nothing on the page implies edge that hasn't
passed the harness — which is what lets us build all of it now.

---

## 4. Build queue

- **Phase 1 (this PR):** this doc + **`entropyCore.js`** — Shannon entropy
  (normalized market-disorder reading), KL/JS divergence, binned mutual
  information, and a no-lookahead rolling regime-shift series
  (`regimeShiftSeries`). Registered in `LEGO_MODULES.md`; unit-tested with
  hand calcs in `js/entropyCore.test.mjs`.
- **Phase 2 (DELIVERED 2026-07-25):** `extremesCore.js` (EVT/GPD: Hill tail
  index, PWM GPD fit, POT, VaR/ES/return levels — the honest "how bad can
  today get" number) + `forecastCoverage.js` / `forecast-coverage.html`
  (engine #13): the bands graded as the frequencies they promise, per year,
  with GPD break-severity. Registered `LEGO_MODULES.md` §1ab.
- **Phase 3 (DELIVERED 2026-07-25):** `ouCore.js` — the OU family promoted out
  of `js/mve/` (which is now a re-export shim; MVE numerically untouched) —
  plus `analyticsDesk.js` / `analytics-desk.html`, the Desk View assembling §3
  from existing bricks with every panel labelled *validated input* or
  *context*. Registered `LEGO_MODULES.md` §1ac.
- **Phase 4 (DELIVERED 2026-07-25):** `bookStress.js` / `book-stress.html` —
  the liquidity-contraction **stress replay** (#17) over six declared crisis
  windows, measuring whether effective bets collapse in-crisis vs calm, plus
  the allocation-geometry compare (#18: equal / inverse-vol / risk-parity ERC,
  trailing-window weights). Takes real sleeve return series; a clearly-labelled
  buy-and-hold "market backdrop" mode exists for when none is at hand.
  Registered `LEGO_MODULES.md` §1ad.
- **Drift #11 evidence (2026-07-25):** `hurstBench.js` / `hurst-bench.html` —
  the estimator A/B that decides whether the live range-bias Hurst feature is
  swapped, kept or dropped. Pre-registered outcomes below.
- **In parallel, the whole time:** engine #19 — live wiring + forward
  fill-quality log for the range-line/US-index book. This is the highest-value
  thread in the repo and it *is* one of the twenty engines, not a detour from
  them.

### Pre-registered: the Hurst estimator decision (drift #11)

Run `hurst-bench.html` on all 26 instruments. **Both outcomes named before
the run**, so a null cannot be re-narrated into a maybe:

- **DROP the feature** if *neither* estimator's median OOS |IC| vs forward
  efficiency ratio reaches 0.10. A calibrated metric that predicts nothing is
  still nothing — in that case the correct action is to remove `featureHurst`
  from the range-bias score, not to swap its estimator. This is the outcome to
  expect if Hurst is simply not informative on daily FX.
- **SWAP to DFA** only if DFA's median OOS |IC| exceeds the incumbent's by
  ≥0.05 *and* clears 0.10 in absolute terms. Even then the swap does not go
  live until the range-bias A/B is re-run OOS on the Asia-range book — a
  better *measurement* is not a better *result*.
- **KEEP as-is** if the incumbent somehow predicts and DFA does not.

Note what is NOT at stake: `perLineStrategy` (the confirmed range-line edge)
does not use Hurst at all. The affected consumers are the live `levels.js`
range-bias grading and the `asiaRangeEngine` confluence backtest. Whatever
the verdict, the confirmed book is untouched.

A/B hooks pre-registered as each phase lands (win/lose named before running):
- **Entropy vs HMM (Phase 1→3):** does `regimeShiftSeries` flag the same regime
  breaks as BOCPD/HMM, earlier, later, or differently? Scored as lead/lag +
  agreement rate on historical breaks. A *description* comparison — no edge
  claim either way.
- **EVT stop geometry (Phase 2):** does a GPD-based stop beat the chandelier on
  the range-line book OOS? Win = higher OOS Sharpe on ≥30 trades at 2–3× cost;
  lose = anything else, chandelier stays (it's the validated incumbent).
- **Gamma-flip filter (Phase 9-test):** OI distance-to-flip as a range-line
  filter. Win/lose bar same as above. Until run: context.

## Banked findings that stay banked (don't re-litigate while building)

No spatial gate rescues the Asia fade · approachVel doesn't transfer to range
fibs · inverse-σ per-trade sizing adds nothing to the held-chandelier book ·
MVE fair value is null · Max-copier premise is empty · pooling across
instruments is banned. New engines *describe*; they only re-open a banked
question through a pre-registered harness run.
