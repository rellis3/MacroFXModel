# Macro directional forecasting: research and architecture proposal

*2026-10-30. Proposal only: nothing here is built, registered or run. Written in answer to the owner's brief
"Designing a Quantitative Macro Directional Forecasting Engine". It is based on a four-part audit of the repository
(evidence record, data inventory, models and infrastructure, education and prior plans) and on one new calculation
(§0). Every claim about the repo is cited to a file.*

---

## 0. The finding that shapes everything else

Before choosing models, two questions matter: how big does a directional edge have to be to be worth trading, and
how big does it have to be before our history can see it?

The table below uses daily closes 2006–2026 (`features/px_d1_*`). Costs are a futures-level round trip (NQ 0.008%,
gold 0.012%, EURUSD 0.009%). CFD financing would make the short horizons worse.

| Instrument | Horizon | Base P(up) | Hit rate needed to cover costs | Non-overlapping samples | Smallest hit rate detectable* |
|---|---|---|---|---|---|
| EURUSD | 1 day | 0.501 | 0.511 | 5,399 | 0.519 |
| | 5 days | 0.499 | 0.505 | 1,079 | 0.543 |
| | 20 days | 0.492 | 0.503 | 269 | 0.585 |
| | 60 days | 0.514 | 0.501 | 89 | 0.648 |
| NAS100 | 1 day | 0.554 | 0.504 over the baseline | 5,373 | 0.519 over 0.5 |
| | 5 days | 0.589 | 0.502 | 1,073 | 0.543 |
| | 20 days | 0.653 | 0.501 | 267 | 0.586 |
| | 60 days | 0.723 | 0.501 | 88 | 0.649 |
| Gold | 1 day | 0.530 | 0.508 | 5,330 | 0.519 |
| | 20 days | 0.557 | 0.502 | 265 | 0.586 |

*80% power, two-sided 5%, one test, the whole 20-year history, no multiple-testing allowance. With the 217 claims
already tested on overlapping data, the real bar is higher.

Three consequences follow:

1. **Costs are not the binding constraint above one day. Detection is.** A real macro edge worth +1 percentage
   point of hit rate at 20 days would pay comfortably on futures, but it is about 8× too small for 20 years of one
   instrument to show. Any design that hopes to "discover" such an edge from history alone will either find nothing
   or find noise.
2. **The baseline is not a coin flip.** NQ rose over 65% of 20-day windows. A model that says "long NQ" 80% of the
   time will look skilful against 50% and has no skill against drift. Several past "edges" were exactly this:
   long beta (`project_trend_following_status`, Portfolio Book). Every directional claim here is scored against
   climatology (the instrument's own expanding-window P(up) and mean), buy & hold, and simple trend.
3. **Only three things can close the gap between "worth trading" and "detectable":**
   - **Sparse, large-effect conditions.** States that occur rarely but shift P(up) by 8–15 points (an event, a
     positioning extreme, a vol-surface shock). Every directional result that has passed here is this shape:
     post-FOMC USD drift, positioning into release, COT state D, VIX beta change.
   - **Pooling.** Pooling across instruments or events, using effective N rather than raw N: 28 instruments carry
     only about 2.1 independent forecasts a day (`plans/SEARCH_BREADTH.md`).
   - **Time.** Forward records, which are the only clean out-of-sample data left for most of these families.

So the engine I propose is not a model that issues a call every day. It is a **selective forecaster**. Most days,
for most instruments, its honest output is "no directional evidence beyond the baseline". It speaks only when a
condition with measured, out-of-sample evidence is active, and it scores every statement it makes against the
baseline it has to beat.

---

## A. Current-state audit

### A1. What the evidence says (217 tested claims, `MD files/TRIAL_LEDGER.md`, 2026-10-25)

The ledger holds 43 validated, 129 null and 45 underpowered claims, plus 39 context entries. About 11 of the 43
passes are expected by luck at 5%.

**Direction, by family** (detail in the audit; source folders cited):

| Family | Tests | Result |
|---|---|---|
| Rates, yields, differentials (US, DE 2y/10y) | ~25 registered + about 44,000-cell scans | **Null at 1 minute to 1 month.** Same-bar correlation, no lead. The 2y spread sleeve's Sharpe ~1.1 was a GS2 publication lookahead (0.09 point-in-time). `analysis/output/yield-predictive-ladder/SYNTHESIS.md` is the authoritative summary |
| STIR, policy path, C.OG's rate line | ~15 | **Null.** Nasdaq leads rate quotes by about a minute; the stock–rates sign flipped in 2026 |
| Event surprises and drift | ~15 | **Post-FOMC USD drift validated** (n 81, +26bp, 65% up), but the costed out-of-sample version is t 1.11 on 34 events. **Positioning into release validated** (+0.064 ATR against the crowd, 6/6 pairs). Next-day direction after releases is 45–55% for every family |
| Inflation, real yields, growth | ~10 | Null as signals. The growth×inflation quadrant shows sizeable next-month tilts for equities and gold (context, not pre-registered) |
| Credit | 4 | Null as a direction or gate signal. Context for **vol and range**, not direction |
| Liquidity (net liquidity, RRP, TGA, BIS) | ~15 | **Null or underpowered.** G1 tide in-sample IC +0.19 → out-of-sample −0.03. Net liquidity has the right sign at 4 weeks but is underpowered. A units bug before 2026-10-17 (fault #8) invalidated older runs |
| VIX and vol surface | ~10 | **Two validated research cells:** VIX-beta change (+0.21 SD over 5 days) and the VVIX/VXN second derivative (+0.23 SD over 20 days). The second fails the family-wide Holm correction |
| COT | ~20 | **State D validated** (crowded with the trend, pullback, crowd leaving → trend resumes over 4 weeks; holdout +0.27 on 22 unseen markets). Everything else null or underpowered |
| Options OI / GEX | ~6 | Null for direction. **GEX predicts range** (validated on ES; real on NQ) |
| HMM and regimes | 0 honest tests | Never tested for direction honestly: the only backtest has an unfixed ADX one-bar-future shift. The daily HMM splits on **variance**, not direction |
| Trend / TSMOM | ~8 | FX-only null. Multi-asset ~0.3 out-of-sample, ≈ buy & hold. The base trend system ran Sharpe 0.49 in 2007–16 vs 0.10 in 2017–26 |
| Macro votes and confluence | ~10 | **Null, and the conviction vote was anti-predictive** |
| Technical at levels (VWAP, HTF, lines) | dozens | Null net of costs. Day-reconstruction M1–M7 closed the production-ladder direction programme (R7 hard stop) |
| Carry | construction check | Sharpe 0.54 (1976–2014). The one rates-derived return source with a long record |

**What *is* reliably forecastable here is size, not sign:** range, vol and tails. Examples: the HAR ladder, IV ladder,
VIX term structure, surprise size, the event impact map, GEX range, and drawdown → forecast error. C.OG's own course
says the same: "Volatility is predictable, returns are not" (`education/VOLATILITY_INTELLIGENCE_NOTES.md`). His
"edge lives at weeks–months … NOT daily trading" is in `education/QUANT_MACRO_LESSONS_1-6.md` §6.10.

### A2. What is implemented

| Status | Components |
|---|---|
| **Works and is validated** | Point-in-time feature store (`js/harness/features.mjs`, 100 manifest entries, 79 built). Research harness (`js/harness/runStudy.mjs`: block bootstrap, walk-forward, FDR, deflated Sharpe, PBO). Study tool with prereg-before-results git check (`analysis/study.mjs`). Lockbox (`forge/LOCKBOX_PROTOCOL.md`). Evidence Book plus trial ledger. Range and vol forecast stack. Event impact map. Cost verification (`analysis/output/cost-verification/cost_table.json`) |
| **Works, descriptive only** | Global Read (`js/globalReadCore.js`): an evidence-weighted combiner where null inputs get zero weight and correlated inputs are netted out, giving P(up). It is the right combiner, and it already exists. Also: macro scorecard and country card, growth×inflation quadrant, credit HMM, directionTag/travelRead, Release Reaction L1/L2, rates regime, cog-chart |
| **Prototype or registered, not run** | FX factor stack (`forge/FX_FACTOR_STACK_PREREG.md`, 2026-10-17; **stale**: still treats the yield-spread sleeve as validated). Distribution forecast (`forge/DISTRIBUTION_FORECAST_PREREG.md`). Session-aware forecast spec. Meta-labelling (blueprint step 5) |
| **Documented, missing** | The "primary direction" slot in `plans/LAYER_INTERFACES.md`: "not built — no lesson has supplied it". No forward ledger of probabilistic directional forecasts scored against baselines (the pair ledger collects tags but doesn't score them). No VAR or local-projection tooling. No shock-type decomposition |
| **Duplicated** | About 12 regime classifiers, 5+ HMMs, 4+ HAR paths, 3 deflated-Sharpe implementations, 3 event-gate implementations, 2 unreconciled cost sources (`js/harness/costs.mjs` vs `cost_table.json`), many backtest engines |
| **Broken or unsafe** | The hmm5m regime bots' backtest (ADX lookahead). The `js/macro.js` "Bayesian" tier score (naive log-odds, uncalibrated, anti-predictive in its vote form). The scorecard showing 1/6 factors after redeploys (cold KV caches, likely). `/api/event-day` is referenced but doesn't exist |

### A3. What this means for the brief

- **Don't build:** another HMM, another regime classifier, another combiner, or another daily macro direction score.
  Each already exists, and the daily-direction versions are banked nulls.
- **What's missing is not models.** It is:
  1. an honest bar (baselines plus detectability) that every directional claim must clear;
  2. a forward ledger that turns every future statement into evidence;
  3. the horizon/structure combinations that have *not* been tested (§D);
  4. a decision layer that keeps regime, direction, confidence and EV separate.

---

## B. Proposed architecture

```
 L0  Point-in-time data        feature store (exists) + release timestamps + vintages + consensus continuity
      │
 L1  STATE (coincident)        "what regime are we in" — filtered probabilities only
      │   existing: Global Read axes, HMM variance, growth×inflation quadrant, credit HMM
      │   new:      shock-type decomposition of rates moves (growth / inflation / policy / term premium / risk)
      │
 L2  EVENTS                    calendar + consensus + priced policy path + historical reaction distributions
      │   existing: event impact map (size), Release Reaction L1/L2, positioning-into-event
      │   new:      surprise → rates repricing → asset response curves (local projections), pooled across banks
      │
 L3  HYPOTHESIS LIBRARY        each validated hypothesis = a registered conditional forecaster:
      │                        trigger state · instrument · horizon · forward return distribution · evidence tier
      │                        · invalidation rule. Sparse: on most days nothing is active.
      │
 L4  COMBINER (exists)         Global Read registry: weight = P(real|tier) × IC × shrink(n) × freshness;
      │                        family correlation (to be ESTIMATED, not assumed) → P(up) per instrument × horizon
      │                        → walk-forward calibration map
      │
 L5  DISTRIBUTION              validated range/vol stack (exists) × L4 → return quantiles q10…q90,
      │                        P(up), P(down), P(|move| > kσ)
      │
 L6  DECISION                  EV = E[r | evidence] − round-trip cost − financing over the horizon
      │                        LONG / SHORT only if: an L3 hypothesis is active AND tier ≥ validated
      │                        AND lower bound of EV > 0; otherwise NO-TRADE (the default)
      │                        + supporting / contradicting inputs + invalidation conditions
      │
 L7  FORWARD LEDGER            every L1–L6 output written once (hashed), then scored against the baselines:
                               log score, Brier, CRPS, calibration, net P&L of the decisions; CUSUM degradation
                               monitor → feeds tiers back to L4 (closes the loop)

 Execution timing (VWAP, HTF structure, levels) is a SEPARATE layer: it may choose the entry inside a window
 L6 has opened, and is scored only by how much it improves on entering at decision time.
```

### Four quantities kept apart (as the brief asks)

| Quantity | Where it comes from | What it is not |
|---|---|---|
| **Regime probability** | L1 (filtered, point-in-time) | Not a direction. A 95% "calm" state says nothing about sign (`project_hmm_variance_not_direction`) |
| **Directional probability** | L4 → L5, calibrated against outcomes | Not confidence. P(up) = 0.56 can be well-founded or noise |
| **Statistical confidence** | Interval on P(up) and on EV; evidence tier; calibration record of that hypothesis | Not profitability |
| **Expected value** | L6: E[r] minus costs minus financing, with an interval | Not a forecast. It depends on venue (futures vs CFD) and horizon |

### Interfaces

- **L3 hypothesis record** (one per validated hypothesis):
  `{id, mechanism, trigger(asof-safe function), instrument, horizon, baseline, effect + CI, tier, n, evidence_doc,
  invalidation[], status}`.
- **L4 consumes it through the existing Global Read `REGISTRY`.** Its `ic`, `n` and `tier` fields already exist, so
  no new combiner is needed. One change: replace the assumed `RHO_SAME = 0.5 / RHO_CROSS = 0.15` with a correlation
  matrix estimated walk-forward from the signals' own history.
- **L7 ledger rows:**
  `{asof, model_hash, instrument, horizon, P(up), quantiles, decision, active_hypotheses[], baseline_P, outcome
  (filled at horizon), scores}`.
  The ledger design follows the write-once, hash-chained record in `plans/SESSION_AWARE_FORECAST_SPEC.md`.

---

## C. Research roadmap (gated; each phase ends with an owner review)

| Phase | What | Why it comes here | Gate to continue |
|---|---|---|---|
| **0 — Bar** (first milestone, §J) | Baselines, cost and break-even table, detectability map (single-instrument and pooled), re-scoring of the existing validated direction cells on the same scale, forward ledger seeded with the baselines | Sets the bar every later phase must clear, and shows where an edge is both worth having and findable. Uses only data in hand. Without it, every later result is judged against the wrong comparator | The map identifies at least one horizon × structure combination where a plausible edge is detectable. If none is, the programme becomes forward-record-only (a legitimate outcome) |
| **1 — Cross-sectional FX at 1–3 months** | Amend and run `forge/FX_FACTOR_STACK_PREREG.md`: carry, momentum, value, surprise momentum. The yield-spread z is demoted to a reported-only arm | The only directional family with (i) a published premium, (ii) long point-in-time history (carry 1976+), (iii) power from 8 currencies, (iv) a prereg already written. Relative value also escapes the "long beta" trap | The factor book beats carry alone and the dollar baseline, net of cost, on the CHECK window; otherwise it is banked and Phase 2 starts anyway |
| **2 — Central-bank and release events** | (a) Post-decision drift pooled across Fed, ECB, BoE, BoJ, BoC, RBA (FOMC only so far). (b) Release surprise → front-end repricing → FX/NQ/gold over 1 hour to 5 days, with local projections. This separates three sources: the surprise, the first-30-minute response, and the repricing not explained by the surprise | Events are where the large-effect conditions live (§0.3). Pooling across six banks takes ~80 FOMC events to ~1,000. It is shortlist item 1 of the yield SYNTHESIS | Any event family's effect clears Holm within the family and its placebo (random non-event days at the same clock time) |
| **3 — Consolidate the validated sparse cells** | Put post-FOMC drift, positioning into release, COT state D, the VIX-beta cell, VVIX/VXN second derivative, the slow price-trend regime (NQ, gold) and the overnight hold into the L3 library and the forward ledger, scored against baselines | They already passed (or nearly). Their remaining test is time, so the clock should start now. Mostly wiring and logging, with no new search | Running: each is judged at its pre-set forward count. None is promoted on history alone |
| **4 — Shock-type decomposition** | Classify each day/week's rates move by type (§D H4) from data known at the time, describe it, then test one pre-registered hypothesis: forward returns differ by shock type | Answers the brief's "a rising yield can mean four things" point. It is the one transmission angle not yet tried in the form of sign-restricted shock types; decomposed *levels* went into the ridge ladder (underpowered) | Descriptive output always ships (L1 state). The forecasting claim needs its own pass |
| **5 — Combination and incremental value** | Only components that passed enter L4. Measure incremental value: does B + X beat B? Calibrate; wire L6 decisions; the dashboard shows them | Combining nulls produced the anti-predictive conviction vote. Combination comes last, over survivors only | Combined log score beats the best single component out of sample. Otherwise ship the single best and say so |

**Not on the roadmap** (closed in the record; reopen only with new data and a new mechanism): intraday rates→asset
lead/lag, daily macro-score direction, net-liquidity tide, OI-wall direction, technical-level direction, regime-gated
rates signals, HMM-on-returns direction.

---

## D. Hypothesis catalogue

Each entry is written so it can become a prereg directly. "Prior art" lists what the repo has already tested, so
none of these is a disguised re-run.

### H1 — Cross-sectional FX premia (carry, momentum, value, surprise momentum)
- **Mechanism:** compensation for crash risk (carry); slow information diffusion and flows (momentum); long-run PPP
  pull (value); slow repricing of relative data flow (surprise momentum).
- **Variables:** 3m rates (point-in-time), 1/3/12m returns, 5-year CPI differentials, standardised surprises.
- **Prediction:** a long-top / short-bottom ranked basket earns positive excess return over the next 1–3 months.
- **Instruments:** 8 currencies, dollar-neutral.
- **Horizon:** 1 and 3 months. **Sign:** as published.
- **Regimes:** report by VIX tercile; carry crashes are expected in stress.
- **Baselines:** zero; carry alone (does the stack add to it?); equal-weight USD basket.
- **Tests:** monthly rank IC (Fama–MacBeth style), block bootstrap by month, Holm across the 5 factors plus the
  stack, deflated Sharpe counting all ledger trials in the FX family.
- **Data limits:** EUR 3m FRED mirror ends 2026-02-16 and IRLTLT01 is frozen, so a substitute is needed. Non-US
  surprise actuals for JP/AU/NZ/CH are printed values, not vintages.
- **Support:** the stack's out-of-sample IC CI excludes 0 and it beats carry alone.
- **Reject:** the CI excludes the minimum detectable effect (MDE).
- **Inconclusive:** neither, so it becomes a forward record.
- **Prior art:** time-series FX trend null; cross-sectional rate momentum null; COT factor null. Cross-sectional
  carry/value/surprise stacked: never run.

### H2 — Release surprise → rates repricing → asset (yield differentials and policy expectations)
- **Mechanism:** news about the policy path moves the front end first. FX follows the change in the differential;
  equities and gold follow the discount rate. Any *drift* would come from slow digestion of the policy path.
- **Variables:** standardised surprise (actual − consensus); 2y and SOFR/fed-funds-implied change in the release
  window; the residual = repricing not explained by the surprise (the market's interpretation); asset returns at
  +1h, +1d, +5d.
- **Prediction (two-sided, pre-registered):** the residual repricing, not the raw surprise, carries forward
  information over 1–5 days.
- **Instruments:** EURUSD, USDJPY, NQ, gold. **Horizon:** 1h–5d.
- **Regimes:** hiking / cutting / on-hold cycle (from the decision history, point-in-time).
- **Baselines:** same-clock non-event days; the surprise-only model.
- **Tests:** local projections (Jordà) with date-clustered SEs; pooled across event families with family fixed
  effects; Holm across horizons.
- **Data limits:**
  - US consensus is point-in-time 2007-01 → 2025-04-07 (FF), then a seam to the Nasdaq calendar (2026-07-03+).
  - Intraday 2y in the repo exists only since about 2024 (OANDA CFD) and 2024-12 (SR3).
  - Historical high-frequency policy surprises are available free from published series (Bauer–Swanson for FOMC; the
    Euro Area Monetary Policy Database for ECB). These replace buying intraday futures history for the
    central-bank part.
- **Reject / inconclusive:** as for H1.
- **Prior art:** `rate-surprise-events` (2y CFD, 526 events) underpowered, with a Nasdaq 5-day fade of the data
  surprise at −0.085 (same sign in 3 periods). `cb-tone`: priced within 30 minutes. The surprise vs
  residual-repricing split has never been done.

### H3 — Post-decision drift is a central-bank-wide effect, not an FOMC quirk
- **Mechanism:** dealer inventory rebalancing and slow digestion of the guidance after a policy decision.
- **Prediction:** the home currency drifts in the direction of the decision-day move from D+1 to D+5.
- **Instruments:** USD, EUR, GBP, JPY, CAD, AUD vs a basket.
- **Baselines:** same-weekday non-decision days; the FOMC-only estimate (n 81).
- **Tests:** pooled event study with bank fixed effects; bootstrap by event date; out-of-sample by year blocks.
- **Data:** decision dates from central-bank archives (free, exact). Daily FX in hand.
- **Support / reject:** the pooled drift CI excludes 0 and the non-FOMC subset has the same sign. Reject if the
  non-FOMC subset's CI excludes the FOMC effect size.
- **Prior art:** FOMC drift validated in sample, not tradeable at t 1.11. Other banks never tested.

### H4 — Shock type conditions forward returns ("why did yields rise?")
- **Mechanism:** the same +10bp in the 10y means different things depending on its driver:
  - **Growth news:** stocks up, real yields up.
  - **Inflation scare:** breakevens up, stocks down.
  - **Hawkish policy:** 2y leads, stocks down, dollar up.
  - **Term premium:** 10y up without the 2y, stocks down.
  - **Risk-off:** yields down, stocks down, credit wider.
- **Variables:** daily or weekly changes in the 2y, real 10y (DFII10), breakeven (T10YIE), term premium (Kim–Wright
  `THREEFYTP10` in hand; ACM free from the NY Fed), equity index, credit (Baa), dollar. Shock type comes from sign
  restrictions on the stock–bond co-movement (as in Cieslak & Pang's common-shocks approach), computed only from
  data up to t.
- **Prediction:** the 5–20-day forward return of NQ, gold and EURUSD differs by the dominant shock type of the
  previous week.
- **Baselines:** unconditional; a model on raw yield changes (which is known to fail).
- **Tests:** a single pre-registered contrast per instrument (e.g. term-premium shock vs growth shock); block
  bootstrap; split 2006–2015 / 2016–2022 / CHECK.
- **Data limits:** DFII10 is stored to 2 decimals; breakevens are noisy in 2008/2020; term-premium models are
  themselves estimates.
- **Value even if null:** the decomposition ships as an L1 state description ("today's move was term-premium
  driven"), which the brief asks for regardless.
- **Prior art:** decomposed levels went into the ridge ladder (underpowered); the regime-gated follow-through went
  negative every out-of-sample year. Sign-restricted shock classification: not tried.

### H5 — Credit widening *speed* shifts the left tail, not the mean
- **Mechanism:** credit investors are downside-focused (C.OG L6); fast widening reveals funding stress before equity
  vol reprices.
- **Variables:** 5- and 20-day change in Baa−Treasury (2000+) and HY OAS (2023+ only).
- **Prediction:** after a top-decile widening, P(NQ 20-day drawdown > 2σ) rises. The mean return is *not* predicted.
- **Baselines:** VIX level and term structure alone (already validated for range). Does credit add to them?
- **Tests:** logistic on the tail event with VIX controls; incremental log score.
- **Data limits:** ICE OAS history is short on FRED (licence), so Baa is the long proxy.
- **Prior art:** credit-leads-equities (mean) null; `hy-spread-vol` context; `drawdown-forecast-error` validated.
  This is a tail/sizing hypothesis feeding L5, deliberately not direction.

### H6 — Vol-surface stress states (VIX beta change, VVIX/VXN derivative, term-structure inversion)
- **Status:** validated research cells; the next step is the forward record, not a new search (Phase 3).
- **Open question to pre-register:** do the two VIX cells carry the *same* information? Measure their overlap and
  their joint vs single log score before either enters L4.

### H7 — Slow price-trend regime as the higher-timeframe bias (long/flat and long/short)
- **Mechanism:** time-series momentum, which has strong outside evidence for equity indices and gold, with a
  drawdown-avoidance profile.
- **Variables:** 200-day MA, 10-month MA, 12-month momentum on NQ and gold; daily vs weekly vs 4h evaluation of the
  same rule.
- **Prediction:** at least matches buy & hold on Sharpe with a smaller maximum drawdown. Not expected to beat it on
  return.
- **Baselines:** buy & hold on the same venue and costs (CFD swap included; futures roll).
- **Prior art:** multi-asset basket ~0.3 ≈ buy & hold; trend decayed after 2016. The single-instrument long/flat has
  not been tested. Its main value is as the **HTF bias input** other hypotheses are conditioned on.

### H8 — Macro + technical: does entry timing add anything once a macro window is open?
- **Design:** conditional on an L3 hypothesis being active, compare entry at decision time vs entry by an execution
  rule (pullback to VWAP, HTF structure). The control is the same clock time on other days, never a window around
  the event (lesson from M4).
- **Rule:** run only after at least one macro hypothesis is validated; otherwise there is nothing to time.

### H9 — Equities lead real yields and breakevens (the reverse of the hierarchy)
- **Mechanism:** equity markets price growth news faster than the TIPS market.
- **Prediction:** NQ's day-t return predicts the day-t+1 change in DFII10 / T10YIE, with gold as the tradeable
  expression.
- **Prior art:** found in all three periods (Granger p ≤ 0.025) but never pre-registered (SYNTHESIS rank 2).
  Cheap: data in hand.

### H10 — Information-flow hierarchy: leadership depends on where the shock starts
- **Reframed hypothesis:** C.OG's course gives three different orderings (L2 §2.1, L6 §6.1, L6 §6.4), and the repo
  finds equities leading rates both intraday and daily. So the testable claim is not a fixed order. It is:
  *for scheduled policy and macro news, rates move first; for risk shocks, equities, credit and vol move first.*
- **Test:** descriptive. Minute-level lead/lag around releases (Release Reaction L1 data) vs unscheduled large moves.
- **Expected value:** explanatory (L1 state and the "evidence" text), not a forecast. The record says that by the
  next bar the cascade has finished.

---

## E. Modelling strategy

| Use first | Why |
|---|---|
| Event studies and **local projections** | Direct, robust answer to "what happens h days after X". No VAR misspecification across horizons |
| Conditional means and probabilities with **date-clustered block bootstrap** | The sparse-condition questions are exactly this |
| **Cross-sectional rank IC** (Fama–MacBeth) | H1 |
| **Regularised linear/logistic** with ≤5 pre-specified features | For incremental-value tests; ridge λ fixed in the prereg |
| **Quantile regression** | Return distributions in L5, built on the existing distribution-forecast prereg |
| **Empirical-Bayes partial pooling** | Pooling an effect across currencies or central banks with shrinkage. This is where "Bayesian" earns its keep |
| **Walk-forward calibration** (isotonic or Platt) and proper scoring rules | Every probability shown must be calibrated against its own past |

| Investigate later (only if a component passes) | Why later |
|---|---|
| Hierarchical Bayesian models | A refinement of partial pooling once there is something worth pooling |
| Markov-switching *regression* (regime changes a coefficient) | The legitimate use of regimes. It must beat simple observable proxies (VIX > 25, trend sign, hiking cycle) or it is dropped |
| Bayesian online change-point detection (`RegimeV2/bocpd.py` exists) | As an L7 **monitor** of relationship breaks, not as a signal |
| VAR / structural VAR | To *describe* transmission (H10, H4), not to forecast |
| Dynamic factor model of macro data | To compress the scorecard's 12 dimensions into 2–3 point-in-time factors, if H1/H4 need a growth factor |

| Unlikely to justify the complexity | Evidence |
|---|---|
| Another HMM on returns | 5+ exist; they separate variance, not direction; smoothed probabilities leak the future |
| VECM between FX and rates | Cointegration is unstable here; the repo's "VECM" falls back to ARMA when R² < 0.05 |
| ARMA/ARIMA for daily direction | Return autocorrelation is ≈ −0.025 (`plans/STYLIZED_FACTS.md`) |
| GARCH for direction | GARCH is a vol model. Keep it in the range stack |
| Deep learning (LSTM, transformers), boosted trees over everything | 267 non-overlapping 20-day samples per instrument. Trees were tried: IC +0.06, net ≈ 0 |
| Particle filters, many-state HMMs | Duplicates; uncalibrated constants |
| Naive-Bayes "tier" scoring (`js/macro.js`) | Uncalibrated, and its vote form was anti-predictive |

---

## F. Validation framework

1. **Baselines (every claim, every horizon):**
   - B0: climatology, the instrument's expanding-window P(up) and mean return.
   - B1: buy & hold on the same venue and costs.
   - B2: 12-month time-series momentum.
   - B3: carry (FX).
   - B4: placebo. Shuffled trigger dates within year, or the same clock time on other days. Never a window around
     the event.
   - For incremental claims, B5 is the best model *without* the new layer.
2. **Scores:**
   - Log score and Brier skill vs B0 for P(up).
   - CRPS / pinball for distributions.
   - Calibration: reliability curve, calibration-in-the-large, slope.
   - Economic: net return per decision, Sharpe deflated by **the family's full trial count from the ledger**.
   - Hit rate is reported but never decides anything.
3. **Incremental value** (does a layer add new information or duplicate another?):
   - Nested comparison B + X vs B.
   - Paired block bootstrap on the per-date score difference.
   - X's partial IC after orthogonalising on B's inputs.
   - The signal-overlap matrix: correlation of the signals and of their forecast errors.
   - A layer with no incremental skill is shown as context and never weighted.
4. **Out-of-sample discipline:**
   - Point-in-time inputs only (feature-store `asof`).
   - Walk-forward with an embargo equal to the horizon (purged for overlapping horizons).
   - FIT (before 2022-09-05) → CHECK (2022-09-05 → 2025-09-04) → lockbox (after 2026-08-21) untouched.
   - The forward ledger is the final judge.
5. **Multiplicity:**
   - Holm within a pre-registered family, BH across families.
   - Every variant counted, including ones abandoned after a peek.
   - A **positive control**: plant a signal of MDE size and show the pipeline recovers it, so a null means something.
6. **Verdicts and stop rules:**
   - Only the four words (VALIDATED / NULL / UNDERPOWERED / CONTEXT).
   - NULL requires the CI to exclude the MDE.
   - UNDERPOWERED becomes a forward record only, **no variants** (owner principle 6).
   - A failed hypothesis is closed, not tuned.
7. **Degradation:**
   - CUSUM on the cumulative log-score difference vs B0 per hypothesis.
   - Demote the tier (so its L4 weight falls) when the forward CI of skill drops below zero.
8. **Costs:**
   - Futures and CFD both; spread by hour (`js/harness/costs.mjs`); financing from `cost_table.json`.
   - The two cost sources are reconciled in Phase 0.

---

## G. Data requirements

| Status | Data |
|---|---|
| **Sufficient now** | Daily prices 2006+ (`px_d1_*`, after the weekend-row fix #9). US curve, real yields, breakevens, Kim–Wright term premium (FRED). DE 2y daily 1997+ (Bundesbank file). VIX family 1990+ and VX settlements 2013+. COT 2006+. FF consensus with actuals 2007 → 2025-04-07 (US actuals point-in-time via ALFRED). Baa/Aaa spreads 2000+. NT8 futures 2015+. Drive NQ 1-minute 2008+ |
| **Needs fixing (in-house)** | (1) A consensus continuity bridge 2025-04 → 2026-07 (dedupe `calendar_events.csv`, map the taxonomy; never join across the seam without a map). (2) Weekend rows fault #9. (3) Re-run net-liquidity results under the fault #8 units fix. (4) Substitutes for frozen mirrors (EUR 3m, IRLTLT01). (5) Refresh the research M1 tail with lockbox truncation. (6) Archive live-only feeds (intl yields, Fed path, OI) to R2 so their history accumulates. (7) MOVE stale since 2026-09-21. (8) Reconcile the two cost sources |
| **Free and valuable (add)** | NY Fed ACM term premium (daily, long history). Central-bank decision dates and statements (Fed, ECB, BoE, BoJ, BoC, RBA archives). **Published high-frequency monetary-policy surprise series** (Bauer–Swanson FOMC; Euro Area Monetary Policy Database for ECB): these give historical rate surprises around decisions without buying intraday futures. ECB SDW yield curves (already reachable) |
| **Paid (ask first; stop on any failure)** | Databento 1-minute ZT/ZN/SR3/ZQ history: enables H2's intraday release repricing beyond 2024. ICE BofA OAS full history: only if H5 passes on Baa. Neither is needed for Phase 0 or 1 |

---

## H. Dashboard integration (no duplication)

- **No new combiner page.** The engine's L4 is the existing Global Read registry (`js/globalReadCore.js`,
  `/api/global-read`, already on today.html and atlas.html). New validated hypotheses become registry rows; nulls
  stay visible at weight 0 in the agreement table, which that design already does.
- **One new surface: a Forecast Ledger** (a tab on `research-log.html` rather than a new page). It shows each
  hypothesis's forward record, skill vs baseline with an interval, calibration plot and tier. This is the page that
  tells you whether to trust anything else.
- **today.html pair card:** one line. LONG / SHORT / NO-TRADE with horizon, P(up) vs baseline, EV after costs,
  active hypotheses, and the invalidation condition. Default text: "No directional evidence beyond baseline". The
  existing directionTag stays as the descriptive tape read, clearly labelled as not a forecast.
- **atlas.html:** the L1 state plus the H4 shock-type line ("this week's rates move: term-premium driven").
- **Event pages** (release-reaction / release-why): H2/H3 response curves appear next to the existing minute paths
  once validated.
- **Nav:** register changes through the commandHub layout migration (`feedback_nav_saved_layout_wins`).

---

## I. Risks and limitations

1. **The likeliest outcome is that the data do not support reliable directional forecasting beyond known premia**
   (equity drift, carry, slow trend) and a handful of sparse event or positioning conditions. The design treats that
   as a valid result: the engine then says NO-TRADE most of the time, and that is correct.
2. **The history is spent.** 217 claims, mostly on 2016–2026. Any new search on the same window carries a large
   hidden trial count. Mitigations: pre-specification, small families, long pre-2016 data where it exists, and
   forward records.
3. **Non-stationarity.** Sign flips are documented: EURUSD rate IC −0.10 to −0.21 in 2015–26; the stock–rates sign
   flipped in 2026; trend decayed after 2016. A relationship that holds in one era can reverse.
4. **Power ceiling** (§0). Economically meaningful edges are below what history can detect, so the honest verdict
   for many good ideas will be UNDERPOWERED → forward record, which takes years.
5. **Data seams.** Consensus (2025-04 / 2026-07), short OAS, recent options and STIR history, latest-vintage-only
   series (BIS, most non-US macro). Each is a lookahead or coverage trap.
6. **Narrative bias.** The education material, ours included, explains past episodes well. Explanations fitted to
   remembered episodes are hypotheses, not evidence. C.OG's own course gives three different orderings of the
   hierarchy.
7. **Regime inference is retrospective.** Smoothed state probabilities use the future, and "by the time you're
   confident, much of the move has happened" (C.OG L6 §6.2). Only filtered, point-in-time states are allowed.
8. **Execution realism.** CFD financing (~8%/yr on NAS100 since 2023) can erase slow-horizon edges; futures change
   the economics (overnight-hold futures study).
9. **Scope creep.** The owner withdrew the broad roadmap on 2026-10-29 as too wide. This programme is gated: Phase 0
   ends in a review, and nothing after it starts without approval.

---

## J. First milestone: "the bar" (Phase 0)

**Question:** for each instrument × horizon, what does a directional forecast have to achieve to be worth trading,
can our data detect that, and where do the existing validated cells stand against the right baseline?

**Instruments:** NQ, ES (or SPX500), gold, EURUSD, USDJPY, GBPUSD, plus the 8-currency cross-section.
**Horizons:** 1, 5, 20 and 60 days. **Decision time:** 22:00 UTC daily close, point-in-time.

**Tasks:**
1. **Baselines B0–B3** computed walk-forward on FIT + CHECK (lockbox untouched): P(up), mean, quantiles.
2. **Cost and break-even table** per instrument × venue (futures, CFD account A/B with financing) × horizon. Report
   break-even excess hit rate *over B0* and break-even IC. Reconcile `js/harness/costs.mjs` with `cost_table.json`.
3. **Detectability map:**
   - MDE in hit rate and IC per cell, single-instrument and pooled. Pooled uses effective N from the measured
     cross-correlation of returns and signals (method of `plans/SEARCH_BREADTH.md`).
   - For event-conditioned designs, MDE as a function of event count.
   - The forward accrual rate: how many years of forward record each cell needs.
4. **Positive control:** plant a signal at the MDE in a copy of the data and show the scoring pipeline recovers it at
   the stated power.
5. **Scoreboard re-score** (exploratory, no verdict changes): put the existing direction cells on the same scale
   (Brier/log skill vs B0, net EV at futures cost, effect vs MDE):
   - post-FOMC drift
   - positioning into release
   - COT state D
   - VIX-beta change
   - VVIX/VXN derivative
   - reversal hour
   - carry
   - overnight hold
6. **Forward ledger v0:** the schema plus a daily job logging B0–B3 for every cell from the deploy date, so every
   later hypothesis has a same-period comparator.

**Outputs:** `analysis/output/direction-bar/RESULTS.md`, `results.json` (baselines, costs, MDE map, scoreboard),
the ledger schema, and a register row `direction-bar` (EXPLORATORY: descriptive and infrastructure, no claim).

**Acceptance criteria:**
- Baselines reproduce the known drift: NQ 20-day P(up) within ±0.01 of the 0.653 measured here; EURUSD ≈ 0.50.
- The positive control recovers the planted effect at 75–85% power across 1,000 replications.
- The cost table matches `cost_table.json` for NQ and gold within 10%, and every disagreement is explained.
- Every instrument × horizon cell is labelled one of:
  - (a) **meaningful and detectable in history**
  - (b) **meaningful, detectable only pooled or forward** (with years needed)
  - (c) **not economically meaningful at any plausible effect size**
- The scoreboard states, for each existing validated cell, whether it clears break-even *and* its MDE.
- The run is reproducible from a single command, with no data after 2026-08-21 read.

**What it decides:** Phase 1 (FX stack) goes ahead only if the pooled monthly cross-sectional MDE is at or below the
size of published FX premia ICs (roughly 0.05–0.10). Otherwise H1 becomes a forward record. The cells labelled (a)
are where Phases 2–4 spend their effort; (c) cells are dropped from directional research for good.

**Why this first and not a model:** it is cheap (data in hand, a few days). It converts "can we forecast direction?"
into a map of where that question is even answerable. Every later result needs this bar to be judged honestly. The
alternative first milestone, running the amended FX factor stack directly, is reasonable, but without Phase 0 its
result would be judged against the wrong comparator.
