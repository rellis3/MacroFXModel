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
