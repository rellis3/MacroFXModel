# Cross-sectional FX factor stack at one to three months

*Pre-registered 2026-10-17, before any factor score was computed for this study. Step 3 of
`plans/QUANT_SYSTEM_BUILD_PLAN.md`. Runs through the Part A harness of `forge/HARNESS_REGISTRY_PREREG.md`
and not otherwise.*

## Question

Does ranking eight currencies each month on **carry, momentum, value, yield-spread z and surprise
momentum** — long the top, short the bottom, dollar-neutral, vol-scaled — predict their relative
returns over the next one and three months, net of measured cost?

## Why this is additive, not a repeat

| what was tested before | result | how this differs |
|---|---|---|
| FX-only **time-series** trend, 7 G10/USD, 252d, inverse-vol (`trendBasketEngine`, 2026-07-22) | NULL, verified not a bug (OOS Sharpe 0.15 ± 0.37) | this is **cross-sectional**: each currency against the others, dollar-neutral. The time-series test was half a collective USD bet; this one has no USD exposure by construction |
| Carry as a **time-series** signal (`multiFactorEngine`, 2026-07-22) | dead, standalone −0.13 | cross-sectional carry (long the highest differentials against the lowest) is the construction with the published premium (Lustig, Roussanov & Verdelhan) |
| COT positioning as a **cross-sectional** factor (`cot-positioning-factor`, 2026-08-22) | FAIL, p = 0.094 | positioning is **not** in this stack. That result stands |
| Yield-spread **pair** sleeve (`yield-spread-sleeve`) | VALIDATED, PF 2.19 OOS | used here as one cross-sectional score; its pair-level result is not re-tested |

The estimand is different: relative return across currencies, not the return of a currency.

## Universe and data (frozen)

- **Currencies:** USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF, via the seven USD pairs on OANDA D1
  (mid). 2005-01 → 2026-09. Returns for a currency c = log return of c/USD (quote-inverted where
  USD is base), plus accrued carry from the rate leg (D1 is CFD mid with no roll).
- **Rates:** 3-month interbank/deposit per currency from the FRED series `/api/fx-carry` already
  uses (CHF: `IR3TIB01CHM156N`); USD funding as in `CARRY_FUNDING_FRED`. `asof` = publication date
  from the feature store.
- **CPI** for value: OECD CPI all-items, monthly, `asof` = publication + 0 (OECD stamps release);
  for the US the FRED vintage.
- **Surprises:** standardised `(actual − consensus) / σ(surprises of that series)`, decayed with a
  3-month half-life. **Point-in-time actuals exist for USD (31 series, FRED vintages), GBP (ONS 3),
  CAD (StatCan 7), EUR (Eurostat 6). JPY, AUD, NZD, CHF have none** — for those four the actual is
  the printed value from the calendar feed, which is what a trader saw on the day and is not
  revised in this feed; flagged in the manifest as `asofRule: release_ts, revises: unknown`.
- **Costs:** round-trip spread at the median London-session hour from `/api/spread-profile`, per
  pair, charged on turnover. No financing beyond the carry accrual (it *is* the carry).
- **Broker financing** (`/api/financing/history`, since 2026-09-20): not used in the backtest.
  Used only to validate the FRED proxy's sign and magnitude over the overlap, reported.

## Factor definitions (frozen)

| factor | score at month-end t | sign |
|---|---|---|
| **Carry** | 3m rate(c) − 3m rate(USD) | long high |
| **Momentum** | mean of z-scored past 1m, 3m, and 12m-skip-1m total returns (spot + carry) across the eight | long high |
| **Value** | −(5-year change in log spot vs USD − 5-year CPI differential vs USD); the real-rate deviation | long undervalued |
| **Yield-spread z** | the existing 10y spread z vs USD (`yieldSpreadCore`), negated so a stretched-rich spread scores low | long low (the validated mean-reversion direction) |
| **Surprise momentum** | 3m-decayed sum of standardised surprises for that currency's economy; neutral (0) where fewer than 3 series exist that month | long high |

All scores are z-scored across the eight each month before weighting. Missing score → 0 for that
currency that month, and the count of neutralised currency-months is reported per factor.

## Construction (frozen)

- Rebalance at the last trading day of each month on scores computed from data with `asof` ≤ that
  day's 21:00 UK; positions held from the next day's open.
- Weights ∝ (rank − 4.5), so the eight sum to zero (dollar-neutral), scaled to 10% annualised
  volatility of the long-short book using a 60-day EWMA covariance.
- **Combined book:** equal risk across the five factors (inverse realised vol of each factor's
  book over the prior 24 months), no optimisation.
- Horizons: **1 month** (primary), **3 months** (secondary; overlapping returns, block = 3 months).

## Sample (frozen)

2005-01 → 2026-09. **IS 2005–2017, OOS 2018–2026**, locked now. The only parameter is the surprise
half-life (3 months), fixed above; nothing is tuned on IS. Walk-forward is therefore trivial and is
run only to produce the two OOS halves (2018–2021, 2022–2026).

**MIN_EVENTS:** ≥ 96 OOS monthly observations (have ≈ 105). Below that the result is UNDERPOWERED.

## Bars (frozen)

Per single factor, at 1 month:
- OOS mean rank-IC > 0.03 **and** its week-block-bootstrap 95% CI excludes 0;
- same sign in both OOS halves;
- OOS long-short net Sharpe > 0.3.

Combined book:
- OOS net Sharpe > 0.5, **DSR ≥ 0.95** with N = 6 (five factors + the combination);
- max drawdown < 25% at 10% vol;
- positive in both OOS halves.

**Placebo (void if failed):** the identical construction with each month's scores randomly
permuted across the eight currencies, 1,000 draws. A factor that passes must beat the 95th
percentile of its placebo distribution on Sharpe; otherwise its pass is void.

**Mirror (void if failed):** the sign-reversed construction. If the reversed factor *also* passes,
the factor is sign-unstable over the sample and is void regardless of the forward sign.

**Effective-N haircut:** reported, per the harness rule; the IC CI is widened by the dollar-factor
share. The bars above apply to the haircut interval.

## Expected outcomes, stated before running

Carry and momentum: pass at 1 month, weakly (the published G10 premia are ~0.3–0.5 Sharpe gross
and have faded since 2015; the OOS window is the hard decade). Value: underpowered at eight years
of OOS — a 5-year signal cannot clear a monthly IC bar on 105 observations; reported as such.
Yield-spread z: passes (it is validated at the pair level). Surprise momentum: marginal, and
likely driven by USD/GBP/CAD/EUR where the actuals are point-in-time. Combined: net Sharpe
0.4–0.6, which is the published range net of cost, and the combined bar of 0.5 is set at the
middle of it on purpose.

## What each outcome changes

- **Combined passes:** a *factor book* panel on today.html (Plan and Score phases of the proposal)
  showing current ranks, the long/short book, size from step 5 when it exists, and the live rolling
  1-month IC, graded monthly by the ledger. **No bot.** Trading it is a separate pre-registration
  after 60 sessions of shadow.
- **Some factors pass, combined fails:** those factors are banked individually; no book.
- **Nothing passes:** the directional question is closed for FX at one to three months as well as
  at one day. The page stays size-only and says so.

## Stopping rule

If the combined book fails **and** no single factor passes, **no further FX direction research
from price, macro or positioning data at any horizon on this desk.** Three horizons (intraday
window, one day, one to three months) and three data families will then have been asked, with
rigour, and answered.

## Amendments

### A1 — 2026-11-01 — PRE-RESULTS

*No factor score, return, rank-IC or Sharpe has been computed for this study. Only inventories (row counts, date ranges, column names, vintage dates) of the feature store were read to write this amendment. Addendum A (2026-10-17) stands except where this amendment names it. The bars, the placebo, the mirror and the 10% vol target are unchanged.*

| | |
|---|---|
| ID / ledger ids | `fx-factor-stack` (the equal-risk book) · `fx-factor-carry` · `fx-factor-momentum` · `fx-factor-value` · `fx-factor-surprise`. The yield-spread arm is reported only and gets no ledger id |
| Branch | `rich-fx` |
| Register row | `plans/RESEARCH_REGISTER.md` → `fx-factor-stack` |
| Data | OANDA D1 mid closes (17:00 New York) for the seven USD pairs, `features/rate3m_*`, `effr`, `rate_on_de`, `surprises`, `spread_profile`. Window 2005-01 → **2026-08-21**. Nothing after the lockbox date is read |
| Seed | `20261017` (the prereg date; every script in this study) |
| Uncertainty | moving-block bootstrap of monthly observations, block = 3 months, B = 2,000; placebo 1,000 permutation draws |
| Scripts / outputs | `scripts/fx-factor-stack/` → `analysis/output/fx-factor-stack/` |
| Harness | own script (Python). The cross-sectional rank-IC, dollar-neutral book and permutation placebo are not in `js/harness/runStudy.mjs` |

**A1.1 — Yield-spread z becomes a reported-only arm.** The 2y/10y yield-spread sleeve's registered edge was a GS2 publication lookahead (0.09 point-in-time, `project_harness_and_deflation`). It is scored with the same construction and shown beside the four factors, but it has no bar, no vote in the combined book, and no ledger id. It is computed as a simplified spread z (10y spread of the currency vs USD, `y10_*`, minus its trailing 60-month mean, over its trailing 60-month SD, negated), **not** `yieldSpreadCore`, and labelled as such. Consequences: the combined book is equal-risk over **four** factors (carry, momentum, value, surprise momentum), and the DSR trial count N is **5** (four factors + the combination). DSR at N = 6 is also shown as a sensitivity.

**A1.2 — Window and lockbox.** Data end at 2026-08-21. OOS is 2018-01 → 2026-08-21: the last whole month scored is July 2026 (rebalance at the end of June 2026, return realised over July). The August 2026 part-month is not scored. That leaves **103 OOS monthly observations** against the registered MIN_EVENTS of 96.

**A1.3 — Data rules, frozen.**
- *Execution.* The store holds D1 closes only, no opens. Scores are computed with data known at the last trading day of the month; positions are entered at the **close of the next trading day** and held to the same close one rebalance later. This replaces "from the next day's open"; it adds one day of lag.
- *Currency return* (c vs USD) = log change of the pair (inverted for USDJPY, USDCAD, USDCHF) plus the carry accrual `(rate_c − rate_USD)/100/365` per calendar day. USD's own return is 0 and USD sits in the cross-section of eight with a score from its own data.
- *Rates (carry leg).* A reference month's value is its **first print** (earliest `asof`). Rows stamped with the 2013-06-03 bulk backfill take Addendum A's `fixed_lag:45` rule (known 45 days after month end). Rows with a genuine later `asof` keep it. The value known at t is the latest reference month whose effective `asof` ≤ t, held flat until the next one.
- *USD leg.* `rate3m_usd` ends with the 2013-06 reference month, then has one row (2026-09). From 2013-06-04 the USD leg is the **effective fed funds rate** (`effr`, `fixed_lag:2`). The 3-month interbank rate and EFFR differ by tens of basis points in 2013, so the splice adds a small step; flagged.
- *EUR leg.* `rate3m_eur` has had no vintage since 2026-02-16 (last reference month 2026-01). From the first rebalance whose data would need a later month, the EUR leg is the **Germany call-money rate** (`rate_on_de`, `IRSTCI01DEM156N`) plus the mean of (EZ 3m − DE call money) over the last 12 reference months both series have. This **replaces Addendum A's neutral-carry rule for EUR**, so the book does not run with a hole in one of its eight currencies. It touches about 6 rebalances (Feb–Jul 2026). A sensitivity with EUR carry neutral for those months (the Addendum A rule) is reported beside the registered result.
- *GBP* is the BoE Bank Rate (Addendum A). JPY, AUD, NZD, CAD, CHF are used as stored.
- *Value, changed from the registered definition.* The registered PPP form needs point-in-time CPI for all eight economies. The store holds US CPI only (`cpi_usd`), and `/api/cpi` reports the UK, Canada and Australia series as discontinued. Value is therefore the **5-year reversal**: `−(ln S_c/USD at t − ln S_c/USD 1,260 trading days earlier)`, spot only, z-scored across the eight. The currency-value premium is usually measured with the CPI adjustment, so this tests a cruder cousin. Reported as "value (5y reversal proxy)". First score is mid-2007.
- *Surprise momentum.* `surprises.parquet` `value` as stored (`z`), `asof` = release timestamp, sign as stored, ccy codes US/EU/GB/JP/AU/NZ/CA/CH → USD…CHF, half-life 91 days, releases with `asof` ≤ 21:00 UK on the rebalance day. Neutral (0) where fewer than 3 distinct series released in the trailing 91 days. **The store begins 2015-11-04**, so the factor has about 2 years of IS and its z scaling (built in `econ_surprise_v1`) is not verified to be point-in-time. JPY, CHF and NZD are thin and will often be neutral; the count is reported.
- *Costs.* `spread_profile` (measured since 2026-09-17), median over UK hours 10–19 of the hourly mean spread by pair, in pips, converted to a price fraction at the rebalance date. One-way turnover pays half of it: `0.5 × spread × Σ|Δw_c|` over the seven non-USD currencies, deducted in the rebalance month. The spread is applied to all history, which is optimistic before about 2015.
- *Vol scaling.* Weights `∝ (rank − 4.5)` over the eight, scaled to 10% annualised on an EWMA (λ = 0.94) covariance of the eight currencies' daily total returns, data ≤ t.
- *Combined book.* Each factor's weights are vol-scaled as above; combined weights `= Σ a_k w_k` with `a_k ∝ 1/vol` of factor k's net monthly book return over the prior 24 months (equal weights until 12 months exist), then rescaled to 10%.

**A1.4 — Metrics, frozen.** *Rank-IC* = Spearman correlation across the eight currencies between the month-end score and the next month's total return (t+1 close to the next t+1 close). USD's return is 0. The 3-month IC (return over three months, rebalanced monthly, overlapping) is reported only; it has no bar. *Effective-N haircut:* the half-width of each IC and Sharpe interval is multiplied by `sqrt(7 / m_eff)`, where `m_eff = (Σλ)² / Σλ²` over the eigenvalues of the OOS daily correlation matrix of the seven non-USD currencies. *Drawdown* is on the compounded net monthly book. *DSR* is Bailey–López de Prado on the monthly net OOS Sharpe, with the variance of the N trial Sharpes. *Both OOS halves* means 2018-01–2021-12 and 2022-01–2026-07, each with a positive net mean (book) or same-sign mean IC (factor). *Mirror* = the sign-reversed weights scored against the same bars. *Placebo* = scores randomly permuted across the eight each month, same construction, same costs.

**A1.5 — Verdict words, set before running.** For each factor and for the combined book:
- **VALIDATED** — every bar above passes, the placebo is beaten, the mirror fails its bars, and (combined only) DSR ≥ 0.95.
- **NULL** — the haircut 95% upper bound of the rank-IC is below 0.03, or the upper bound of the net Sharpe is below the bar (0.3 per factor, 0.5 combined). The data can see an effect of the bar's size and it is not there.
- **UNDERPOWERED** — neither: the interval contains both zero effect and the bar.

**A1.6 — Power, stated before running.** About 103 OOS months, eight currencies. Under the null the monthly rank-IC has an SD of about `1/√7 = 0.38`, so the mean IC has an SE of about 0.037, about 0.056 after a haircut factor of about 1.5. A single factor therefore needs a true IC of about 0.16 for 80% power, and the registered 0.03 bar cannot be reached with the interval excluding zero below an observed mean IC of about 0.11. For Sharpe, 8.6 OOS years give an SE of about 0.34, an MDE of about 0.95 and roughly 30% power if the true combined net Sharpe is 0.5. The direction-bar map (`analysis/output/direction-bar/RESULTS.md`) puts the seven USD pairs at about 2.8 independent forecasts. **Expected: UNDERPOWERED for most factors even if the published premia are real; a NULL needs the interval to exclude the bar, which is also hard.** Carry and momentum are the likeliest to separate, and only if the OOS decade behaves like the published sample.

**A1.7 — Baselines (reported, not gates).** (i) *Dollar basket:* equal-weight long the seven currencies vs USD with carry accrual, same costs — its OOS Sharpe, and the combined book's correlation and beta to it (a dollar-neutral book should show about 0). (ii) *Carry alone:* the carry book's net Sharpe, and the combined-minus-carry Sharpe difference with a block-bootstrap interval. No page ships unless the combined book is VALIDATED **and** its point estimate exceeds carry alone.

**A1.8 — Forward ledger spec (recorded, not built here).** If any of the five ids is not NULL, it is registered as a research forecaster in the forward direction ledger: entity = each of the seven USD pairs, horizons **20 and 60 trading closes**, forecast = P(pair up) from a logistic map of the pair's signed composite score, fitted on data ≤ 2026-08-21 and then frozen, scored against B0 (climatology), B1 (buy and hold), B2 (momentum), B3 (carry) on the same rows. Judged at the horizon-specific forward counts set by `forge/DIRECTION_BAR_PREREG.md`, not on history.

**A1.9 — Stopping rule, clarified.** The registered rule fires when the combined book fails and no single factor passes. Under the verdict words above it fires when the combined book is **NULL** and **no factor is VALIDATED**. An UNDERPOWERED combined book does not fire it: the data could not answer, so FX direction at one to three months becomes forward-record only. This clarification is made before running and is flagged for the owner to confirm.

**A1.10 — Variants.** None beyond what is named here: the EUR-neutral sensitivity, a gross-of-cost line, and the DSR at N = 6. Anything else run later is labelled post-hoc.

### A3 — 2026-11-02 — PRE-RESULTS (forward ledger as built)

*No forward row has been issued and no outcome has been read. The owner accepted A1.9 on 2026-11-02: the stopping rule does not fire on UNDERPOWERED, so FX direction at one to three months continues as a forward record. This amendment records what A1.8's spec became when built. Where it narrows A1.8, it says so.*

- **`fx-factor-carry` is registered** as a research forecaster (`js/directionResearch.js` `FX_FACTOR_CARRY`, `scripts/fx-factor-stack/ledger_map.py`, `analysis/output/fx-factor-stack/ledger_map.json`). Flag `UNDERPOWERED` on every row: the study's carry IC was +0.079 with a haircut interval that crosses zero.
- **Score.** For a ledger pair, `z(base) − z(quote)`, where `z` is the cross-sectional z (population SD) of each currency's 3m rate minus the USD rate over the eight currencies. Rates are the study's (A1.3): EFFR for USD, the BoE Bank Rate for GBP, OECD 3m interbank for JPY/AUD/NZD/CAD/CHF, and for EUR Germany call money plus the frozen offset 0.008667 pp (the EZ 3m series has had no vintage since 2026-02-16). The live job reads the latest FRED observation of each, and issues nothing if any observation is older than 200 days or missing.
- **Map, frozen.** `P(up) = B0 + sigmoid(a + b·score) − sigmoid(a)`, one pooled `(a, b)` per horizon over the seven USD pairs, fitted once on daily rows to 2026-08-21 (39,228 rows at 20 closes, 38,948 at 60). 20 closes: `a = 0.0099`, `b = +0.0213` per score unit, month-block bootstrap 95% interval for `b` [−0.062, +0.107]; at a score of ±1 the shift is about ±0.53 pp. 60 closes: `b = −0.0017`, interval [−0.086, +0.087]: the fit is flat, so a row would only repeat B0 and add nothing but a count. **The 60-close forecaster is not issued.** This narrows A1.8, which named both horizons. The fit is in-sample by construction and is not evidence; only the forward rows are.
- **Instruments.** The ledger holds six instruments with baselines frozen at 2026-08-21, so only the three FX pairs in it (EURUSD, GBPUSD, USDJPY) are issued. AUDUSD, NZDUSD, USDCAD and USDCHF are in the fit but have no ledger rows or baselines; adding them is a new baseline version, not done here. This narrows A1.8, which named all seven.
- **Baselines.** B0, B1 and B2 sit beside every row, as for every ledger forecaster. The A1.8 baseline B3 (carry) is not in the ledger (no live matching rate series in the baseline set), and the dollar basket is not either; the carry forecaster is the nearest thing to B3 and is scored against B0 only.
- **Windows.** The ledger target runs from the issue close; the study scored from the close after month-end. The score is recomputed daily from the latest rates, so it changes only when a new monthly rate arrives. Rows are counted as events per pair per calendar month.
- **`fx-factor-surprise` is not registered.** The store holds scored non-US actuals for only a few releases (since mid-2025: 16 US series, 7 Canadian, 1 British, 1 Australian; none for the euro area, Japan, Switzerland or New Zealand). The study's rule neutralises a currency with fewer than 3 series in the trailing 91 days, so a live score would be a US-and-Canada-only signal on three EUR/GBP/JPY pairs, which is not the factor that was tested. Registering it would be inventing a different signal. It is skipped until the store carries at least 3 series for most of the eight currencies; the pre-registered definition is unchanged.
- **Momentum and value** (UNDERPOWERED, negative point estimates) are not registered.
