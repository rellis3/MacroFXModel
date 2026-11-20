# hedge-method-comparison — Which way of sizing a hedge removes the most risk out of sample, and does the hedge hold when the asset is losing?

**Pre-registered 2026-11-20, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `hedge-method-comparison` (primary), `hedge-downside-beta` (H2) |
| Branch | `jvnav` (worktree `mfx_w2`) |
| Register row | `plans/RESEARCH_REGISTER.md` → `hedge-method-comparison` |
| Data | M1 bars from `VolRangeForecaster/data/m1/` rolled to NY-close daily closes (`nyCloseDailyBars`), instruments below, 2016 → 2026-08-21 (the lockbox ends the sample) |
| Seed | `20261120` |
| Uncertainty | 21-day block bootstrap over dates (same blocks for every problem and method), B = 500 |
| Scripts / outputs | `scripts/hedge-method-comparison/` → `analysis/output/hedge-method-comparison/` |
| Harness | own script (pure Node, no new dependencies) |

## 1. The claim (required)

Owner, 2026-11-20, from the C.OG thread in Market Movers: "if A is losing, B/C/D should cover the risk"; C.OG: factor hedging, alpha vs beta vs excess return, "you can even estimate multiple betas for a single asset", "regression is just one way of estimating beta", "you could argue this is relative value hedging". The owner asked for proper tests of the different hedging styles. This study asks which hedge-ratio method gives the best risk reduction **out of sample**, and whether the hedge's usefulness changes on the asset's bad days.

## 2. Why it is not already settled (required)

- `hedge-finder-book` / `hedge-finder-book-es` (banked 2026-11-06): the Desk Terminal's min-variance pick cut the proxy book's daily 5% tail by about 9%; the own-USD-leg hedge cut more. That tested **one** sizing method (60-day min-variance) on a currency book. It never compared sizing methods.
- `hedge-residual-mr/mom/carry` (NULL / UNDERPOWERED): tested the hedge relationship as a **trading** system. This study does no trading; it measures risk removed.
- The Desk Terminal Hedges tab shows r² in-window. It has never been checked out of sample.

## 3. Definitions, fixed in advance (required)

- **Returns:** daily log returns of NY-close daily closes. DXY is synthesised from the five currencies with the repo's `DXY_W` weights (sum of weighted log returns, sign-flipped for the pairs quoted as USD-per-currency). A date enters only if every leg of the problem printed.
- **Walk-forward:** the hedge weight for day *t* is estimated on returns up to *t−1* only (never day *t*). Evaluation starts after 250 trading days. Hedged return `h_t = rA_t − w_t·rH_t` (a vector product for multi-hedge).
- **Problems (fixed list, reported separately):**
  1. GOLD ← DXY
  2. GOLD ← DXY, NQ
  3. NQ ← GOLD, USDJPY
  4. NQ ← US2000
  5. US2000 ← GOLD (A1: was SPX)
  6. US30 ← GOLD, USDJPY
  7. EURUSD ← USDCHF
  8. GBPUSD ← EURUSD, USDJPY
  9. AUDUSD ← NQ
  10. AUDUSD ← NQ, GOLD
  11. USDJPY ← NQ
  12. DE30 ← NQ, EURUSD

  Mixed on purpose: an easy collinear case (4), cross-asset cases (1, 3, 5, 6, 9, 10, 11), FX-in-FX (7, 8), and multi-leg cases (2, 3, 6, 8, 10, 12).
- **Methods (all fixed here, no tuning on results):**
  - M0 no hedge. M1 naive: weight sign(corr over the last 250d) / k per leg.
  - M2 OLS min-variance, 60d window (the Desk Terminal's method; **the benchmark**). M3 OLS 120d. M4 OLS 250d.
  - M5 EWMA least squares, λ = 0.97. M6 blend: 0.5 × OLS60 + 0.5 × OLS250.
  - M7 ridge, 120d, penalty = 0.10 × mean hedge-return variance.
  - M8 downside beta: weighted least squares on the 250d window using only the days when A was in its worst 25%.
  - M9 minimum expected shortfall: 250d window, weights minimising the empirical 5% ES of the hedged series (grid −1 to 3 in 0.1 steps per leg, coordinate descent, 3 sweeps).
  - M10 Kalman: random-walk betas, q = 1e-5 of the return variance, observation variance from the first 250d.
  - P placebo: M2 applied to a random partner drawn from the instruments outside the problem's set (50 draws per problem, median).
- **Outcomes per problem × method (out-of-sample days only):** VR = 1 − var(h) / var(rA); ES5 reduction = 1 − ES5(h) / ES5(rA), where ES5 is the mean of the worst 5% of days; worst-decile capture = 1 − mean(h | A in its worst 10% days) / mean(rA | same days); weight turnover = mean |Δw|.
- **Aggregation:** the mean across the 12 problems of each outcome, and of its paired difference from M2.
- **Halves:** first and second half of the evaluation dates.

## 4. Hypotheses, expectation first (required)

| # | Question | Expectation |
|---|---|---|
| H1 | Does any method beat M2 (OLS 60d) on variance reduction out of sample? | NULL for most: beta estimation noise is large and 60d OLS is hard to beat. The likeliest winners are the shrunk and longer-window ones (M3, M4, M6, M7). |
| H1b | Same, on ES5 reduction and worst-decile capture (secondary). | Descriptive. M8 and M9 are built for it but have the smallest effective samples. |
| H2 | Is downside beta different from full-sample beta? Pooled ratio of beta on A's worst 25% days over beta on all days, over the 250d rolling windows and the 12 problems (first hedge leg). | A ratio away from 1 is expected for risk assets against risk assets (correlation tightens in sell-offs); about 1 for gold against DXY. |

**THE GATE (H1, per method, versus M2):** pooled mean ΔVR > +1.0pp with the bootstrap 95% interval excluding 0, the same sign in both halves, better in at least 8 of the 12 problems, and better than the placebo-partner M2. All four, else the method is NOT better than M2.
**THE MIRROR:** the same gate with the sign flipped (a method reliably **worse** than M2) is reported.
**Verdict words:** a method that clears the gate: VALIDATED (it beats the standard). A method within ±1.0pp with its interval inside the band: NULL (equal to the standard). Otherwise UNDERPOWERED.

## 5. Power (required)

About 2,400 evaluation days per problem (2017 → 2026 less the 250d start), 21-day blocks, 12 problems that are strongly correlated with each other (shared dates, shared markets), so the effective number of independent months is roughly 100. The script prints the interval half-width as the minimum detectable difference and RESULTS states it. A method whose interval is wider than ±2pp is UNDERPOWERED, not NULL.

## 6. Multiplicity (required)

Primary: 9 methods (M1, M3 to M10) against M2 on VR, Benjamini–Hochberg at q = 0.10 across the 9 bootstrap p-values. Secondary outcomes (ES5, worst-decile) are descriptive with no verdict. H2 is one pooled test.

## 7. What it does NOT test

Trading P&L, costs, carry or swap on the hedge leg, hedge ratios on intraday bars, options hedges, and any forecast. Hedge ratios here are estimated on past data and applied to the next day; the study makes no claim that a relationship will persist beyond the sample. Instruments without a long M1 history (WTI, silver, copper) are left out.

## 8. What each verdict changes

If a method is VALIDATED, the Hedges tab shows its ratio next to the 60d OLS ratio and states the out-of-sample variance removed. If all are NULL against M2, the tab keeps 60d OLS and gains an out-of-sample column showing how much variance each pair actually removed against its in-window r². H2 decides whether the tab shows a stress beta beside the ordinary one.

## Amendments

### A1 — 2026-11-20 — PRE-RESULTS
No outcome had been computed; only the data build (dates and counts) had run.
- **Problem 5 changed from SPX ← GOLD to US2000 ← GOLD.** The local SPX M1 file only covers 2021-06 → 2026-06; keeping it would cut the common sample from 2,701 days to 1,274 for every problem. SPX is dropped from the universe. The common sample is 2,701 dates, 2016-01-04 → 2026-08-20.
- **M9 (min-ES) refreshes its weights every 5 days**, not daily (cost: a grid search per day is about 10^10 operations). Between refreshes the last weights carry.
- **M10 (Kalman) scales:** Q_j = 1e-5 × var(rA) / var(rH_j) on the diagonal, observation variance R = var(rA) over the first 250 days, state starts at 0 with covariance I and is run from day 0 so the weights used from day 250 have been learning for 250 days.
- **Placebo pool** is every series in the panel (including the synthetic DXY) outside the problem's own target and hedge set; the placebo has the same number of legs as the problem.
- **The placebo clause of the gate** means: the method's pooled variance removed must exceed the placebo's pooled variance removed (a sanity floor: a real hedge must beat a random one).
- **If a weight cannot be solved** (singular window), the previous day's weights carry.

## RESULTS
