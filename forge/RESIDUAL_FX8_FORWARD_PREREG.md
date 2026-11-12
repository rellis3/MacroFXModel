# residual-fx8-forward — does the frozen FX8 residual threshold book keep its edge on new data?

**Pre-registered 2026-11-12, before any forward outcome existed.** No book return dated after 2026-08-20 has ever been
computed for this model. The forward record's P&L starts with the first 17:00 New York close after this commit.

| | |
|---|---|
| ID / ledger id | `residual-fx8-forward` (F1, scored), `residual-fx8-forward-kill` (F2, scored) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `residual-fx8-forward` |
| Data | OANDA practice API, daily mid candles aligned to 17:00 America/New_York (`granularity=D&alignmentTimezone=America/New_York&dailyAlignment=17`), EURUSD GBPUSD AUDUSD NZDUSD USDJPY USDCAD USDCHF. Checked before registration: identical to `analysis/output/residual-pca-family/panel_daily.csv` on 317 common days 2025-06 → 2026-08-20 (median and p99 abs difference 0.0 bp, return corr 1.0 on all 7 pairs). Financing: OANDA `/v3/accounts/{id}/instruments` `financing.longRate/shortRate`, logged nightly (history cannot be fetched later, so the log is the only source). |
| Seed | `20261112` |
| Uncertainty | Moving-block bootstrap on forward trading days, block = 21, B = 2000 |
| Scripts / outputs | `scripts/residual-fx8-forward/` → `analysis/output/residual-fx8-forward/` |
| Harness | Own script. It imports `scripts/residual-pca-family/engine.py` and the trade rule from `scripts/residual-pca-stops/stops.py` unchanged; nothing is refitted. |

## 1. The claim

The micro bank "Mean Reversion of Residuals" model (48-slide worked example, `education/mean-reversion-of-residuals-notes.md`)
failed or found nothing in every pre-registered test on our data (q1 FAIL on the IS half; `residual-pca-wide10` NULL;
news / month-end / COT / index variants show nothing). One lead survived: the **threshold version on the 8 currencies**
(enter at |z| ≥ 1.5, exit when z gets back to 0), found in the exploratory `residual-pca-stops` study. It ran net
Sharpe +0.43 (2016-21) / +0.38 (2021-26) at house costs, +0.34 / +0.27 at double costs.

The claim: that book, frozen exactly as below, earns a positive net return on data that did not exist when the rule
was chosen. This is the lesson's slide 46 step 01–02 (paper trading, then burn-in): the first test of the rule that is
not on data already seen.

## 2. Why it is not already settled

- The threshold rule was picked **after** q1's bucket table had been seen on the same 2016-26 history (the extremes
  leaned the right way, the middle didn't). Re-scoring it on that history would only confirm what was looked at. Every
  number in §1 is exploratory.
- Nearest Evidence Book entries: `residual-pca-wide10` (NULL: lesson book on FX8 + metals), q1
  (`education/residual_pca_currency_test`, FAIL → NULL in the four words), `residual-reversion-fx` (NULL: a different
  object, macro fair-value residuals). None of them scores the threshold book, and none uses data after 2026-08-20.
- This is not a re-cut of a banked null: it is a different rule (threshold entry, exit at home, not the lesson's
  proportional book) judged only on new data.

## 3. Definitions, fixed in advance

**The book, every NY trading day t (signal at the 17:00 NY close of t, P&L earned t → t+1):**

| Setting | Value (frozen) |
|---|---|
| Universe | USD EUR GBP AUD NZD JPY CAD CHF; currency log return = ±log return of its USD pair (USD = 0), `tags.CCY_PAIR` |
| Basket | x = r minus the equal-weight cross-sectional mean (`engine.basket`) |
| Window | the last 120 rows of x ending at t (`engine.WINDOW`) |
| K | **2, frozen** (the q1 noise-band rule chose 2 on the IS windows; it is not re-chosen) |
| Displacement | z = (last − mean) / sd of the cumulative residual path in the window (`engine.walk`) |
| Trade rule | `stops.episodes_C` with no stop: enter when \|z\| ≥ 1.5, direction −sign(z); exit at the first close where z has changed sign; one trade at a time per currency |
| Weights | inside a trade: target = −z clipped to ±1.5 (dead band 0.2), outside: 0; w = target / sd; project out the K loadings and the ones vector; scale to gross 1 (`engine.walk` with the trade mask) |
| Spread cost | turnover × house round-trip cost / 2 (`tags.COST`: EUR 0.008%, GBP 0.010, AUD 0.011, NZD 0.013, JPY 0.009, CAD 0.011, CHF 0.011, USD 0) |
| Financing | each currency weight maps to its USD pair (EURUSD position = +w_EUR, USDJPY position = −w_JPY, …); the ones-vector projection makes Σw = 0, so the USD leg is carried exactly by the 7 pairs. Daily financing = Σ_pairs \|position\| × (longRate if position > 0 else shortRate) × calendar days between closes / 365, using the rates logged at the previous close |
| Net return | gross − spread cost + financing (financing is signed; negative = paid) |

The script asserts, before the record starts, that `engine.walk` + the mask reproduces the `residual-pca-stops`
threshold book on `panel_daily.csv` (net Sharpe IS 0.432, OOS 0.378 at 1× cost). If it doesn't, nothing is recorded
until the difference is found and written up as a PRE-RESULTS amendment.

**Trade state at the start.** The open-trade state on the first forward day comes from running the trade rule on
signals (z only, no returns) from 2026-01-02. The lockbox days 2026-08-21 → 2026-11-12 are used as price inputs to
the window and the state only; no return over them is computed or read.

**Forward record.** One append-only row per NY trading day in `analysis/output/residual-fx8-forward/record.csv`
(gitignored, rebuilt only by the script; each row carries a hash of the previous row): date, K-above-noise count, z
and weight per currency, turnover, gross, spread cost, financing, net, open trades. The financing-rate log is its own
append-only file. A missed night is caught up from the candles on the next run (financing at the last logged rates,
flagged).

**Judgement date:** 2028-11-13 (about 520 forward trading days). After that the record keeps running and F1/F2 are
re-judged each year on the full forward sample, unless a kill rule has closed it.

## 4. Hypotheses

| # | Question | Pass / fail |
|---|---|---|
| F1 | Is the forward mean daily **net** return (1× cost, with financing) > 0? | VALIDATED if the one-sided block-bootstrap p ≤ 0.05 (Holm with F2) |
| F2 (kill) | Is the forward result consistent with the backtest's OOS net Sharpe of 0.38? | NULL (backtest not confirmed, line closed) if the one-sided 95% upper bound of the forward annualised net Sharpe is below 0.38 |
| MIRROR | The same book with the trade direction flipped (+z instead of −z) on the same days | reported; if it beats the real book forward, the reversion story is not supported |

**Kill rules, declared before the first trade (slide 37's "retirement conditions"); any one closes the record and
F1/F2 are scored on the sample up to that day:**

| # | Rule |
|---|---|
| R1 | Net equity (gross 1) draws down more than **7.0%** from its peak (2× the worst backtest half, −3.53%) |
| R2 | At the 12-month review (2027-11-12): forward annualised net Sharpe below **−1.27** (0.38 − 1.645 × 1.0, the one-year SE) |

**Monitored, not kill rules (flags on the page):** K above the noise band ≠ 2 on more than 60% of days in any 63-day
span (the factor structure has rotated); trailing-12-month financing larger than trailing gross P&L; more than 3
missed nights in a month.

**Reported, not scored:** gross vs net vs 2× cost; financing as a share of gross; per-currency P&L attribution;
C-trade results in residual-sd units against the backtest distribution (median ~+1.7 res-sd, median hold ~28 days);
daily IC of −z vs next-day residual; the book scaled to 10% annual vol (× ~4.4) as an illustration only.

## 5. Power

- Backtest net daily SD at gross 1 ≈ 0.14% (2.25% a year). At 2 years the SE of the annualised Sharpe is ≈ 0.71.
- **F1:** the MDE (one-sided α 0.05, 80% power) is ≈ (1.645 + 0.84) × 0.71 ≈ **Sharpe 1.76**, against an expected
  0.38. **UNDERPOWERED by design.** A positive but insignificant F1 is UNDERPOWERED, not NULL.
- **F2:** rejects the backtest if forward Sharpe < 0.38 − 1.645 × 0.71 ≈ −0.79. If the true Sharpe is 0, the chance
  of rejecting at 2 years is only about 13%. So F2 catches a clearly broken model, not a merely useless one.
- This is what slide 46 says: at this Sharpe, telling edge from noise takes years. The record's job is to kill the
  idea cheaply if it is broken, and to build the sample, not to confirm it quickly. No money and no prop-firm
  challenge rest on it until F1 can be judged.

## 6. Multiplicity

Two scored cells (F1, F2), Holm at α = 0.05. Everything else is descriptive. Interim page reads carry no verdict; the
only interim decisions are R1 (any day) and R2 (once, at 12 months). This is trial 7 on the micro bank residual line
(q1, wide10, idx6, news, month-end, COT); the ledger records it as such.

## 7. What this does NOT test

- Real fills or slippage (paper only; modelled spread; no orders are placed by anything in this study).
- Intraday MAE (daily closes only).
- Any change to the rule, a stop, another universe, or a prop-firm challenge (a later prereg, only after F1).
- Whether the lesson's proportional book works (already NULL / FAIL).

## 8. What each verdict changes

- **F1 VALIDATED:** the book becomes a candidate for a small-size demo account with its own execution prereg, and
  only then for the prop-firm simulation against a zero-edge copy.
- **F2 NULL, or R1/R2 hit:** the micro bank residual line is closed for FX. `residual-pca-stops`' lead is recorded as
  not surviving new data.
- **Neither (the expected case at 2 years):** UNDERPOWERED. The record keeps running and is re-judged each year. No
  money is put on it.

## Amendments

## RESULTS
