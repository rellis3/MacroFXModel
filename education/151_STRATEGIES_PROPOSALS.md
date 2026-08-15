# 151 Trading Strategies → MacroFXModel Proposals

> **Epistemic status: PROPOSAL.** Nothing in this document is validated. Every
> verdict below is an *inference* from three sources: (1) the strategy
> inventory of `education/151 Trading Strategies.md` (Kakushadze & Serur,
> 2018 — 156 numbered strategies/sub-strategies across chapters 2–20), (2) the
> education corpus in `education/` (philosophy, frameworks, validation
> standards), and (3) the platform's own record — `CLAUDE.md`,
> `SYSTEM_ASSESSMENT.md`, `TRADABILITY_REVIEW.md`, `BACKTEST_SYSTEMS_REVIEW.md`,
> `EDUCATION_SYSTEMS_REVIEW.md`, `LEGO_MODULES.md`, `CROSS_ASSET_TREND_DESIGN.md`.
> A proposal "wins" only when it later beats its incumbent on OOS Sharpe with
> ≥30 OOS trades through the honest harness. Until then everything here is
> a hypothesis with a pre-registered test plan.

---

## 1. How the screening was done

Every strategy in the book was passed through six filters. A single hard fail
is a **NO**; a soft fail is **NEEDS INSIGHT**; passing all six is **PROPOSE**.

| # | Filter | Source of the rule |
|---|--------|--------------------|
| F1 | **Executable here** — spot FX (13 pairs), XAU/USD, index CFDs (NQ/SPX/DAX/FTSE/DOW) via MT5/OANDA. No options, single stocks, bonds, ETFs/ETNs, futures contracts, OTC products, crypto. | `CODEBASE_OVERVIEW.md`, `EDUCATION_SYSTEMS_REVIEW.md` §6 ("options/gamma: needs data we don't have") |
| F2 | **Data exists** — broker M1+/D1 bars, FRED (with vintage/lag handling), Yahoo (research only), CFTC COT, Forex Factory calendar. CME OI history does not exist until self-collected. | `data-foundations-notes.md`, `open-interest-course-notes.md` |
| F3 | **Not a banked null** — the platform has already killed: the 12 famous retail strategies (EMA cross, RSI-2, Turtle/Donchian, Ichimoku, Golden Cross — 0/12 survive), level-confluence POI fading (pooled Sharpe −3.43 over 26 pairs / 10.4 yrs), VuManChu gating (null after lookahead fix), always-fade at the vol extreme, Econ-Trend cross-sectional fundamentals momentum, credit-stress sizing, meta-labeling on folklore, MVE fair value. | `BACKTEST_SYSTEMS_REVIEW.md` §3.7, `coleztrades_poi_backtest/`, `TRADABILITY_REVIEW.md`, `BACKTEST_INDEX.md` |
| F4 | **Replicated-edge family preferred** — the education review names the only legitimate places to chase edge: time-series momentum, FX carry (with crash risk), volatility risk premium, and the FX factor set (dollar / carry / momentum / value). Folklore's default outcome is null. | `EDUCATION_SYSTEMS_REVIEW.md` §6 |
| F5 | **Fits the trader's philosophy** — causal mechanism stated *before* the backtest; direction ≈ coin flip so target range/vol/regime/structure/relative value; weeks-to-months horizon (short horizons are a "double penalty": low SNR + compounding costs); no public strategy adopted as-is. | `companion-insights-01-03-notes.md`, `QUANT_MACRO_LESSONS_1-6.md` L1/L5/L6 |
| F6 | **Brick-expressible** — a new idea must be a selector/spec snapped onto existing modules (`forecastCore`, `trendBasketEngine`, `levelSources`, `metricsCore`, …), never a new bespoke engine. Backtest and live must share one code path. | `CLAUDE.md` (the Lego Principle), `LEGO_MODULES.md` |

Screening also honors the standing directive of `SYSTEM_ASSESSMENT.md`:
**stop building, prove a few systems end-to-end**. So the PROPOSE tier is
deliberately short, ordered, and each entry is cheap relative to its
information value.

---

## 2. Verdict summary — the whole book at a glance

| Book chapter | Strategies | Verdict |
|---|---|---|
| 2 Options (2.2–2.57) | 58 | **NO — all.** No options execution; education review explicitly rules out options/gamma trading. Directional/defined-risk ideas are natively expressed with stops/limits on CFDs. |
| 3 Stocks | 21 | Mostly NO (single-stock data, folklore TA, ML). **3 salvaged as machinery**: multifactor combination (3.6/3.18/3.20) and residual momentum (3.7) feed the FX factor-set proposal; pairs/cluster mean-reversion (3.8–3.10) → NEEDS INSIGHT. |
| 4 ETFs | 8 | Rotation logic (4.1.x, 4.6) folds into the trend proposal. **IBS mean-reversion (4.4) → NEEDS INSIGHT.** Others NO. |
| 5 Fixed Income | 15 | **NO — all** as trades (no bond execution). Curve *data* already feeds macro scores — keep as inputs, not positions. |
| 6 Indexes | 5 | NO except **vol targeting (6.5) — already built and OOS-validated** for P1 (`DYNAMIC_BOOK_ALLOCATION_SCOPE.md`); action is wider adoption, not a new build. |
| 7 Volatility | 7 | VIX futures/ETN/variance structures NO. **VRP as a signal (7.4 adapted) → NEEDS INSIGHT** (must A/B against incumbent P8 vix-vol-carry). VIX backwardation (7.2) already live as a gate in RegimeV2. |
| 8 FX | 6 | **Carry family (8.2/8.2.1/8.3/8.4) → NEEDS INSIGHT** — right family, blocked on swap-inclusive return data. HP-filter MA (8.1) NO (folklore MA variant; TSM is the legitimate expression of trend). Triangular arb (8.5) NO (latency). |
| 9 Commodities | 6 | **COT hedging pressure (9.2) → PROPOSE.** **Value (9.4) → PROPOSE** (as part of the FX factor set). Skewness (9.5), OU models (9.6), gold-inflation sizing (9.3/19.3) → NEEDS INSIGHT / low priority. |
| 10 Futures | 7 | **Time-series momentum (10.4) → PROPOSE** (the flagship). Weekly cross-sectional contrarian (10.3) → NEEDS INSIGHT. Calendar spreads, rate hedging NO. |
| 11–17 Structured / Convertibles / Tax / Misc / Distressed / Real Estate / Cash | 33 | **NO — all.** Institutional credit, OTC, physical, or jurisdictional structures with no tradable expression here. |
| 18 Crypto | 2 | NO. The ANN pipeline (18.2) is asset-agnostic but vetoed by F3/F5 precedent ("no more ML before validation discipline" — Gold V1 and meta-labeling are the cautionary records). |
| 19 Global Macro | 4 | **Announcement-day effect (19.5) → PROPOSE.** Fundamental macro momentum (19.2) NO — it is materially the banked Econ-Trend null (OOS Sharpe 0.09 vs placebo). 19.3 folds into gold-sleeve NEEDS INSIGHT. 19.4 NO (bonds). |
| 20 Infrastructure | 1 | NO — illiquid fund assets. |

**Net result: 4 proposals, 7 needs-insight items, everything else a NO.**
That ratio is the honest one: the book is a breadth survey, and this platform's
own record already rules out most of its retail-reachable content.

---

## 3. Tier 1 — PROPOSE (build next, in this order)

Each proposal states: the book source, the causal mechanism (F5 requires it
*before* the backtest), the brick mapping, the pre-registered test, and the
kill criterion. Both outcomes are written down now, per the
`PREREGISTERED_EVALUATIONS.md` pattern.

### P-A · Cross-asset time-series momentum
**Book:** 10.4 (trend following), absorbing 4.6 (multi-asset trend), 4.1/4.1.1
(rotation + MA filter) and 4.1.2 (dual momentum with a defensive park).

- **Mechanism.** Slow institutional capital and behavioral under-reaction make
  multi-month trends persist across unrelated asset classes; the effect is the
  single most replicated result in the managed-futures literature (a named
  legitimate family in `EDUCATION_SYSTEMS_REVIEW.md` §6). Signal:
  `sign(12-mo return)` (or tanh-smoothed), weights ∝ 1/σ, monthly rebalance.
- **Why now.** This is the platform's own next step: the FX-only trend basket
  was built honestly and came out thin (OOS Sharpe 0.15 ± 0.37 —
  indistinguishable from zero), and `CROSS_ASSET_TREND_DESIGN.md` already
  scopes the cross-asset extension. Trend's diversification benefit
  historically comes from spanning asset classes, which the FX-only test could
  not capture.
- **Bricks.** `trendBasketEngine` is asset-agnostic and ~90% reusable
  (trend/inverse-vol/rebalance/cost engine). Add index CFDs, gold, and the
  bond/commodity CFDs OANDA serves. The 4.1.2 "park in gold/cash when the
  broad trend is down" rule enters as a *selector*, not a new engine.
- **Pre-registered test.** IS/OOS chronological split; OOS Sharpe of the
  cross-asset basket vs the FX-only incumbent AND vs zero; DSR for the small
  spec grid; **CFD overnight financing modeled explicitly** — the design doc
  itself calls financing "the most likely killer," so the gross-vs-net gap is
  a headline result, not a footnote. Known constraint to state up front:
  index/bond CFD history reaches only ~2016 — thin for a slow signal, so the
  Yahoo multi-decade series may be used for *signal research* while OANDA data
  prices the *tradable* implementation, with the splice labeled.
- **Kill criterion.** Net-of-financing OOS Sharpe ≤ the FX-only basket, or the
  effective number of bets collapses toward 1 (the documented failure mode of
  the existing sleeves per `SYSTEM_ASSESSMENT.md` §2.4). A null here is a
  bankable result: it closes the trend family on this instrument set.

### P-B · Announcement-day exposure (FOMC/CPI event effect)
**Book:** 19.5 (trading on economic announcements).

- **Mechanism.** Pre-FOMC announcement drift is a documented, mechanism-backed
  effect (compensation for macro uncertainty resolution concentrated into
  scheduled dates); the education notes independently flag the forecaster's
  calendar-flatness as a gap ("vol concentrates at FOMC/CPI dates" —
  `cross-asset-options-diagnostic-notes.md` §14, `QUANT_MACRO_LESSONS_1-6.md`
  Appendix D names pre/post-FOMC drift).
- **Why now.** Cheapest proposal in this document: the Forex Factory calendar
  feed and event-gate brick already exist and are load-bearing in production
  (as *avoidance*). This proposal tests the mirror image: is there positive
  expectancy in holding index CFDs across scheduled-announcement windows,
  or in scaling the vol forecast on event days? Zero new data, near-zero new
  parameters (a calendar flag is the whole signal — minimal DOF by
  construction).
- **Bricks.** Econ-calendar feed + event-gate registry + `simulateEntry`
  (`forecastCore`) + `metricsCore` IS/OOS card. Expressible as a Strategy Lab
  spec, which is exactly the standing job that harness exists for.
- **Pre-registered test.** Two cells only, named in advance: (1) long index
  CFD over the 24h into FOMC vs all other days; (2) event-day vol-forecast
  multiplier vs the calendar-flat incumbent forecaster (scored by exceedance
  calibration, not PnL). ≥30 OOS events required — FOMC alone is 8/yr, so the
  test must pool CPI/NFP or span years; say so up front rather than
  discovering it as an excuse later.
- **Kill criterion.** No OOS improvement over the calendar-flat incumbent, or
  the drift cell's net expectancy ≤ 0 after CFD financing on the hold window.
  Either way the forecaster's calendar-flatness question is settled with data.

### P-C · COT positioning factor, done properly
**Book:** 9.2 (hedging pressure), reinforced by 10.3.1's OI-activity filter.

- **Mechanism.** Commercial hedgers pay speculators a premium to absorb
  inventory risk; extreme speculative positioning marks crowded trades that
  unwind. Positioning is "potential energy" in the trader's own framework
  (`QUANT_MACRO_LESSONS_1-6.md` L2 §2.6), and the six-step COT method
  (net non-commercial → **normalize by OI** → rolling z-score → 3-yr
  percentile → combine with momentum → watch commercials) is already written
  down in `data-foundations-notes.md` as an open lane.
- **Why now.** The data is in the stack (CFTC COT parsed in `_worker.js`,
  free, with the 3-day publication lag known and respectable). And there is a
  **documented defect to fix first**: current COT percentiles are computed on
  raw contracts, not OI-normalized (`BACKTEST_SYSTEMS_REVIEW.md` §4.3) —
  so the existing COT filter has never actually been the course's method.
  Fixing the brick and testing the factor is one coherent piece of work.
- **Bricks.** COT feed (fix normalization in place), `statsCore`
  z-scores/percentiles, `metricsCore`. Signal applied time-series per
  instrument (13 FX pairs via FX futures COT, gold, indices) — the book's
  cross-sectional quintiles don't survive N≈19, and the six-step method is
  time-series anyway.
- **Pre-registered test.** COT-extreme conditioning as an *overlay* on the
  trend basket (P-A) and as a standalone weekly-rebalanced signal; both
  against the unconditioned incumbent; publication lag enforced in the join
  (F2 lookahead discipline). Explicitly one input, not a standalone edge —
  the course's own framing.
- **Kill criterion.** Overlay fails to improve OOS Sharpe of the host
  strategy, or the standalone signal's |t| < 3 (mined-factor bar from
  `regression-analysis-course-notes.md`). Banked either way; the
  normalization fix survives regardless because it corrects the brick to
  spec.

### P-D · FX value factor — completing the FX factor set
**Book:** 9.4 (value via long-run reversal), with 3.6/3.18/3.20 (multifactor
combination machinery) as the portfolio layer once sleeves exist.

- **Mechanism.** Real-exchange-rate deviations mean-revert over multi-year
  horizons (PPP as a slow anchor); value is the fourth leg of the named FX
  factor set — dollar / carry / momentum / **value** — which
  `EDUCATION_SYSTEMS_REVIEW.md` §6 and `regression-analysis-course-notes.md`
  §10 both call out as legitimate and not yet built. Momentum exists
  (trend basket), dollar exists (8.3's timing signal is derivable from FRED),
  carry is blocked on data (see Tier 2) — value is the missing buildable leg.
- **Bricks.** FRED CPI series (vintage-aware) + spot history → real-exchange-
  rate z-score per pair via `statsCore`; rank across the 13 pairs; combine
  later with `diversificationCore` / the multi-factor combiner. Monthly
  rebalance, weeks-to-months horizon — squarely in the trader's stated
  sweet spot.
- **Pre-registered test.** Long cheap-tercile / short rich-tercile of pairs
  vs zero and vs the trend basket; correlation of the value sleeve to the
  momentum sleeve reported (the whole point is a negatively-correlated
  diversifier — if it arrives correlated, that finding kills the
  diversification rationale even if Sharpe is positive).
- **Kill criterion.** OOS Sharpe ≤ 0, or sleeve correlation to existing
  momentum/carry factors > 0.6 (no diversification benefit). Note the honest
  hazard up front: FX value is the weakest of the four factors in the
  literature post-publication — a null is the likelier outcome and is worth
  banking.

---

## 4. Tier 2 — NEEDS ADDITIONAL INSIGHT

These are not NOs. Each is blocked on a specific missing ingredient — data,
a prerequisite study, or a decision the user must make. The blocking item is
the action.

| # | Idea (book ref) | What's missing | Concrete unblocking action |
|---|---|---|---|
| N-1 | **FX carry family** (8.2, 8.2.1, 8.3, 8.4) | The right family (named replicated edge), but OANDA mids lack swap-inclusive returns — carry backtests on mid prices are fiction, and the platform already deferred this for exactly that reason (`CLAUDE.md`: "Data limits beat fake productivity"). | **Start capturing MT5/OANDA swap rates daily now** (a cron job writing to KV/R2). History accrues from the day capture starts. Meanwhile a FRED policy-rate-differential prototype is allowed *only* if labeled proxy-grade. Crash-risk asymmetry (the education notes' "carry with crash risk") must be part of the eventual spec, not an afterthought. |
| N-2 | **VRP as a regime signal** (7.4 adapted) | Platform already has P8 vix-vol-carry. A second vol-premium expression must A/B against that incumbent, not land beside it. Also: the index GARCH estimator is documented as unstable (range error ~−36% and widening), and VRP = implied − *realized* needs a trustworthy realized leg. | First stabilize/benchmark the realized-vol leg (`vol-forecast-bench` exists for this), then pre-register VRP-spread conditioning vs P8 as incumbent. |
| N-3 | **IBS mean-reversion on indices** (4.4) | Cheap and low-DOF, but two honest concerns: RSI-2 — a close cousin — is one of the 0/12 banked nulls, and the effect is heavily published (the five-stage public-decay pipeline applies). Holding period (1–3 days) brushes against the short-horizon penalty. | A single pre-registered low-DOF cell: IBS<0.2 buy / IBS>0.8 sell on the 5 index CFDs, next-day exit, costs on, no tuning. One shot, both outcomes written first. If null, it banks next to RSI-2 and closes the family. |
| N-4 | **Index pairs / cluster mean-reversion** (3.8–3.10, 10.3) | The education review's explicit prerequisite: *proper cointegration study before pairs trading again*. Index CFD history (~2016) is thin; CFD financing on both legs doubles the carry drag. | Run the cointegration/stationarity study as a research note first (DAX–FTSE, NQ–SPX, EUR-complex crosses). Only pairs that pass with stable hedge ratios earn a backtest slot. |
| N-5 | **Gold inflation-hedge sizing** (9.3, 19.3) | A gold-macro sleeve (P6) already exists; the headline-vs-core CPI allocation rule is an *alternative spec*, not a gap-filler. | A/B the HI−CI clamped-spread sizing vs the incumbent gold-macro divergence rule on the OOS card. Only adopt on a win. |
| N-6 | **OU/model-based reversion on spreads** (9.6) | Overlaps the existing day-type fade/follow machinery and the banked always-fade null; unclear it adds anything beyond `dayTypeCore`. | Decision needed: only pursue if framed as a *selector* feeding `simulateEntry`, and only after N-4's cointegration study defines which spreads are stationary enough to model. |
| N-7 | **Weekly cross-sectional contrarian** (10.3) | Weekly turnover across 19 instruments is cost-sensitive, and the platform's mean-reversion record (always-fade null, POI null) demands caution. | Fold into N-4's study rather than testing standalone: if clusters cointegrate, the cross-sectional demeaned-reversal weights are the natural trade expression; if they don't, this dies with it. |

---

## 5. Tier 3 — NO, and why

Grouped; every rejection cites its filter. These are decisions, not
oversights — re-proposing any of them requires new evidence, not enthusiasm.

**F1 — not executable here (the bulk of the book):**
- **All 58 options structures (ch. 2)**, dispersion (6.3), VRP-with-gamma
  (7.4.1), skew risk-reversals (7.5), variance swaps (7.6), options tax arb
  (13.2.1). No options execution; education review: not recommended even as a
  study direction.
- **All fixed income (ch. 5)**, global fixed income (19.4), structured credit
  (ch. 11), convertibles (ch. 12), TIPS/inflation swaps (14.1, 14.2),
  repo/cash structures (ch. 17), distressed (ch. 15), real estate (ch. 16),
  infrastructure (ch. 20), muni tax arb (13.1), cross-border tax arb (13.2).
  Instruments don't exist in the account. Salvage note: curve slope, credit
  spreads, and inflation series from FRED are *already* macro-score inputs —
  the data survives even though the trades don't.
- **Single-stock strategies**: earnings momentum (3.2), value (3.3), implied
  vol (3.5), merger arb (3.16), distress puzzle (15.3), LETF decay (4.5),
  R² selectivity (4.3). No stock universe.
- **Market-making (3.19), FX triangular arb (8.5), intraday ETF arb (6.4),
  cash-and-carry (6.2)**: latency/infrastructure games retail MT5 structurally
  loses. Also F5's double-penalty rule.
- **VIX futures basis (7.2), ETN vol carry (7.3, 7.3.1)**: vehicles
  untradable. The usable residue — VIX backwardation as a risk gate — is
  *already live* in RegimeV2's entry stack, and P8 owns the vol-carry
  expression.
- **Weather, energy spreads (14.3, 14.4), calendar spreads (10.2)**: no
  such instruments; CFDs have no contract-month structure.
- **Money laundering (17.2), loan sharking (17.6), pawnbroking (17.5)**: the
  book includes them as descriptive/cautionary material; obviously not
  proposals.

**F3 — already tested and killed on this platform (do not re-litigate):**
- **Moving-average systems (3.11, 3.12, 3.13) and HP-filtered MA (8.1)**:
  EMA cross and Golden Cross are among the 0/12 famous-strategy nulls.
  Legitimate trend expression is P-A's time-series momentum — same family,
  correct form, honest costs. The HP filter adds a lookahead trap
  (two-sided smoothing) on top of a dead spec.
- **Donchian channel (3.15)**: the Turtle null. Same verdict, same redirect
  to P-A.
- **Pivot support/resistance intraday (3.14)**: the closest mechanized
  relative — level-confluence POI fading — ran 46,677 trades over 10.4 years
  and produced pooled Sharpe −3.43, negative every calendar year. A pivot
  variant re-enters that graveyard only with a mechanism argument the POI
  study didn't already refute.
- **Fundamental macro momentum (19.2)**: materially the banked Econ-Trend
  null (cross-sectional fundamentals momentum, OOS Sharpe 0.09 vs placebo).
  The 4-state-variable dressing doesn't change the family.

**F3/F5 — ML before validation discipline (a standing veto):**
- **KNN prediction (3.17), ANN classification (18.2)**: the education review's
  verdict is explicit — no more ML until the validation-discipline debt is
  paid; Gold V1's ML gate ("regression malpractice", ships disabled) and the
  base-rate meta-labeling result are the platform's own precedents. The ANN
  pipeline is genuinely asset-agnostic, which is exactly why it will still be
  available later; it is not first in line.
- **Naïve-Bayes tweet sentiment (18.3)**: no sentiment corpus in the stack
  (F2) on top of the ML veto.

**Weak/dominated (F4/F5 soft fails not worth a slot):**
- **Low-vol anomaly (3.4)**: evidence is equities-native; at N≈19 with
  vol-targeted sizing already deployed, there's no distinct sleeve left to
  extract.
- **Skewness premium (9.5)**: secondary factor, tiny cross-section; revisit
  only as a feature inside the factor combiner, never standalone.
- **Alpha combos at scale (3.20)**: machinery for thousands of alphas applied
  to a platform whose honest count of validated signals is ~2. The rank/
  combination logic is absorbed into P-D's factor layer at the scale that
  actually exists.

**Already built — no proposal needed, adoption is the action:**
- **Vol targeting (6.5, 15.3.1)**: OOS-validated for the P1 sleeve
  (`DYNAMIC_BOOK_ALLOCATION_SCOPE.md`). The remaining work is extending it to
  other sleeves through the same brick, which is engineering, not research.
- **Portfolio hedging / cross-hedging ratios (10.1, 10.1.1)**: risk overlay,
  not alpha; the Level Bot's 5-factor beta rebalancing already occupies this
  slot.

---

## 6. Suggested sequencing and the standing tension

`SYSTEM_ASSESSMENT.md`'s directive — *prove 2–3 systems end-to-end before
building more* — outranks this document. The proposals are shaped to respect
that:

1. **P-B (announcement effect)** — days of work, zero new data, minimal DOF.
   Run it through Strategy Lab first as the cheapest information buy.
2. **P-C (COT fix + factor)** — the brick fix is owed regardless; the factor
   test rides along.
3. **P-A (cross-asset trend)** — the largest build, but already scoped and
   ~90% brick-covered; it is the platform's own declared next step.
4. **P-D (FX value)** — after P-A, because its whole rationale is
   diversification against the momentum sleeve, which needs to exist in
   cross-asset form first.
5. **N-1's swap-rate capture starts immediately** regardless of everything
   else — it costs nothing and every month of delay is a month of carry
   history that never exists.

Every test above goes through the house harness: realistic fills (no
touch-fills), costs on by default including CFD financing, chronological
IS/OOS with the selection window never touching the test window, DSR for the
spec count, ≥30 OOS trades, A/B against a named incumbent, and both outcomes
written down before the run. Results — including nulls — get banked in
`BACKTEST_INDEX.md` with red/amber takeaways left unsoftened.

*The book's own closing section ("Suggested Improvements for Practical Use")
recommends prioritizing the FX, volatility, futures, and global-macro
chapters and tagging hypothesis vs evidence — which is, in effect, what this
document does.*
