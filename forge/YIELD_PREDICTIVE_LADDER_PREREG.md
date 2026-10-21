# yield-predictive-ladder — Do decomposed rate drivers add out-of-sample forecast value for EURUSD and Nasdaq-100 beyond price, volatility and macro baselines, and is any of it tradable after costs?

**Pre-registered 2026-10-21, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `yield-predictive-ladder`; scored questions `yield-ladder-eurusd`, `yield-ladder-nq` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `yield-predictive-ladder` |
| Data | Daily, 2005-01-03 → 2026-08-21 (lockbox). US: FRED DGS3MO, DGS2, DGS5, DGS10 (end of day), DFII10 (10y TIPS real), T10YIE (10y breakeven), THREEFYTP10 (Kim–Wright 10y term premium). Germany: Bundesbank BBSIS Svensson par yields 2y/10y (`analysis/output/dynlead/yields_daily.parquet`, end of day Frankfurt). Targets: FRED DEXUSEU (EURUSD, 12:00 New York), FRED NASDAQ100 (cash close 16:00 New York). Controls: VIXCLS, DCOILWTICO, DTWEXBGS (broad dollar, from 2006) |
| Seed | `20261021` |
| Uncertainty | Newey–West (lag = h) for Clark–West and IC; 21-day moving-block bootstrap (B = 2000) for Sharpe differences; 200 shifted-rates placebos |
| Scripts / outputs | `scripts/yield-predictive-ladder/` → `analysis/output/yield-predictive-ladder/` |
| Harness | own scripts (nested walk-forward ridge ladder; `runStudy.mjs` has no nested-model mode) |

## 1. The claim (required)

This comes from the owner's research brief of 2026-10-21, "Institutional Yield-to-Asset Predictive Framework". It
asks whether a small number of robust, economically interpretable and regime-dependent yield signals give
incremental out-of-sample predictive information about future asset returns, with enough lead time and net trading
value to justify inclusion in MacroFXModel. EURUSD and Nasdaq are the first case studies.

## 2. Why it is not already settled (required)

About 90 Evidence Book entries cover rates→assets (synthesis in `analysis/output/yield-predictive-ladder/SYNTHESIS.md`).
The nearest entries, all on these assets:

- **`yields-to-fx-direction`** (2026-08-23): 20 years daily, forward univariate ICs, null.
- **`rates-spread-asset-lead`** (cog-dynamic-lead): yield spreads US/DE/JP/UK × 34 assets, rolling-gated and episode
  rules, null. Its nonlinear check (boosted trees, 5 assets) was no better than placebo.
- **`cog-spread-direction`**: single daily US spreads, real yields and breakevens as direction signals, null.
- **`yield-spread-sleeve` / `multi-spread-sleeve` / `ys-long-confirm`**: demoted to context after the GS2 lookahead.
- **`us-leg-same-day-link`**: same-hour links are real and sign-stable for FX. Context only.

**What none of them did** is the brief's Phase D:

- a **nested** out-of-sample model ladder, with baselines first;
- rate moves **decomposed** into expected policy (2y), real yield, inflation compensation (breakeven), term premium,
  slope and the US–DE differentials;
- conditioned on **predefined, real-time regimes**;
- scored by Clark–West against the price/volatility baseline, then costed.

Every earlier test was univariate or rule-based. A multivariate pass after univariate nulls is unlikely, but not
impossible: suppression, and controls that remove common-factor noise. So the expectation is written below as null.

**Disclosure.** The whole 2005–2026 window has been used by earlier studies on these assets under other rules. "Test"
is untouched by *this* design only.

## 3. Definitions, fixed in advance (required)

**Calendar.** Rows are US business days where the target and all of that asset's model inputs exist (inner join).
Each row is dated by its calendar date.

**Knowable when.**

- Every feature for row d uses values dated **≤ d−1**. FRED end-of-day yields for d−1 are published by d, and the
  Bundesbank d−1 curve by the morning of d.
- The target is `y_h(d) = ln P(d+h) − ln P(d)`, with P the target print on day d (EURUSD at noon, NDX at the close).
- h ∈ {1, 5, 20} rows.
- **Sensitivity (descriptive):** features ≤ d−2.

**Rate features**, each as a change over 5 and over 20 rows ending at d−1, in bp:

| Variable | EURUSD set | Nasdaq set |
|---|---|---|
| US 2y (policy-path proxy) | yes | yes |
| US 10y real (DFII10) | yes | yes |
| US 10y breakeven (T10YIE) | yes | yes |
| US 10y term premium (KW) | yes | yes |
| US slope (10y − 2y) | yes | yes |
| US−DE 2y | yes | — |
| US−DE 10y | yes | — |
| US 10y nominal | — (= real + BE) | — (= real + BE) |

That makes 14 EURUSD features and 10 Nasdaq features. The 10y nominal is left out because it equals real plus
breakeven. Curvature and the 3m are descriptive only.

**Baseline features (M1).**

- the target's own log returns over 1, 5, 20 and 60 rows;
- the target's 20-row realised vol (log);
- log VIX level;
- the 5-row change in log VIX.

**Macro features (added in M3).**

- WTI 5- and 20-row log change, for both assets;
- broad-dollar 5- and 20-row log change, Nasdaq only (it is circular for EURUSD);
- the DE 2y 20-row change, EURUSD only (the euro policy side).

**Regimes**, predefined and known at d−1, used as interactions with the 20-row rate changes in M4:

- **R1 real-yield trend:** sign of the 60-row change in DFII10.
- **R2 policy repricing:** hawkish if the 20-row change in US 2y > 0.
- **R3 risk-off:** VIX above its trailing 252-row median.

R4 (high/low volatility, from the target's realised vol vs its 252-row median) and R5 (an FOMC/NFP/CPI within the
next h rows, calendar coverage 2007-07 → 2026-07) are Phase C descriptive splits only.

**The ladder.** Each model is ridge on standardised inputs. λ is chosen by blocked 5-fold time-series CV inside each
training window, from the grid 10^{−2…3}.

| Model | Inputs |
|---|---|
| M0 | expanding historical mean (no signal) |
| M1 | baseline |
| M2 | rate set only |
| M3 | M1 + rate set + macro |
| M4 | M3 + R1/R2/R3 × 20-row rate changes |
| M5 | M1 + macro + only those rate features whose univariate training Spearman IC has the same sign in both halves of the first training window (2005–2014), with \|t\| ≥ 2 (Newey–West) |

**Walk-forward.**

- The first fit is 2005–2014. Refits are annual on an expanding window, each forecasting the next calendar year.
- Training rows whose target window overlaps the forecast year are purged (the last h rows).
- Forecasts for 2015–2019 form **Validation**. Forecasts for 2020-01-01 → 2026-08-21 form **Test**, opened once.

**Phase A / B (descriptive, reported in full):**

- **Same-day correlations** (Pearson and Spearman) of each rate change with the target return at 1, 5 and 20 rows,
  across subperiods 2005–09, 2010–14, 2015–19 and 2020–26, with 95% Newey–West intervals.
- **Rolling 252-row correlation and beta**, with the beta's standard error.
- **Levels versus changes.** Level correlations are shown to demonstrate how misleading they are.
- **Lag profile.** corr(Δrate_{d−k}, r_d) for k = −10…+10 (k > 0 = rates lead), with Newey–West intervals.
- **Reverse direction**, in the same profile.
- **Granger causality** (VAR, 5 lags) on each period.
- **Event split:** release days excluded vs release days only (2007-07+).

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| A | Same-day rate–asset links exist and their signs differ by component | **Yes**. EURUSD falls when the US–DE 2y differential rises. Nasdaq is negative on real yields and positive on breakevens (prior coupling study) |
| B | Rates lead the asset at daily lags 1–10 | **No** (prior univariate nulls) |
| C | The link changes with R1–R5 | **Yes** for same-day (descriptive); **no** for forward value |
| D | M2–M5 beat M1 out of sample (Clark–West) | **Null** for both assets at all horizons |
| E | A rule from any surviving model beats M1's rule net of costs | **Null** (nothing reaches E) |
| | **THE GATE (predictive), per asset × horizon × model M2–M5 (24 scored cells)** | A cell needs all four in Validation *and* Test: OOS R² gain over M1 > 0; Clark–West one-sided p < 0.05; Spearman IC > 0; the Test R² gain above the shifted-rates placebo p95. Holm at α 0.05 across the 24 cells is applied on the Test Clark–West p-values |
| | **THE GATE (tradable)** | For predictive passes only: rule = sign of the forecast, h-row overlapping tranches (1/h of capital per day). Net of costs (EURUSD 1.0 bp, NDX 1.5 bp per unit turnover) the Test Sharpe must exceed M1's rule, with a block-bootstrap 95% interval of the difference above 0, and the net Sharpe must be > 0 |
| | **THE MIRROR** | Negative OOS gain is reported as "rates make the forecast worse" (overfit). It is never flipped into a signal |

## 5. Power (required)

The relevant statistic is the Spearman IC of the forecast with the realised return. Its SE is about √(h/n). MDE is
2.8 × SE.

| Cell | n (rows) | Effective n | MDE (IC) | Pass bar | Verdict by design |
|---|---|---|---|---|---|
| 1d, Test 2020–26 | ~1,650 | ~1,650 | 0.069 | 0.05 | UNDERPOWERED for 0.05; powered for ≥ 0.07 |
| 1d, Validation + Test 2015–26 | ~2,900 | ~2,900 | 0.052 | 0.05 | borderline |
| 5d, Test | ~1,650 | ~330 | 0.154 | 0.10 | UNDERPOWERED |
| 20d, Test | ~1,650 | ~83 | 0.31 | 0.15 | UNDERPOWERED |

Consequences:

- A null at 5d or 20d is `UNDERPOWERED` unless the realised Test IC interval excludes the bar.
- For 1d, the pooled 2015–26 IC interval decides between `NULL` and `UNDERPOWERED`.
- A *pass* still needs the Test gate above.

## 6. Multiplicity (required)

- **Scored cells:** 2 assets × 3 horizons × 4 models (M2–M5) = **24**. Holm at α 0.05 on the Test Clark–West p
  values, plus the conjunctive Validation and Test gate.
- **Disaggregation (descriptive, BH q 0.10 with a chance baseline):**
  - Phase A correlations: 14 + 10 features × 3 horizons × 4 subperiods = 288;
  - Phase B lag profile: 24 features × 21 lags = 504;
  - Phase C splits: 24 features × 5 regimes × 2 states = 240;
  - individual coefficient stability.
- **Total tests reported:** 24 scored + 1,032 descriptive.
- Nothing here sizes a position. Promotion to anything live would need |t| ≥ 3 and a forward test.

## 7. What this does NOT test (required)

- **Intraday** (1–60 min) lead–lag. That is closed for the STIR→NQ / EURUSD lines (`rate-diff-nq-leadlag`,
  `stir-wide-scan`, `spread-leads-fx-hours`) and is not repeated.
- **SOFR/€STR futures-implied paths.** The daily history only exists from 2024, so the 2y is the policy proxy here.
- **GBPUSD, USDJPY, S&P, gold, crude.** The brief says expand only after the method is validated.
- **Causality.**
- **Financing/carry** in the FX rule. The carry sleeve is a separate banked factor.
- **Announcement surprises** (point-in-time consensus exists only for US from ALFRED; out of scope).

## 8. What each verdict changes (required)

- **Pass (predictive and tradable):** a candidate sleeve with its own costed forward prereg. Nothing is live before
  |t| ≥ 3 or a forward record.
- **Predictive only:** a context line on the rates page, "rates add X to the forecast", with no trading claim.
- **Null / underpowered:** the brief's final question is answered "not on daily decomposed rates" for EURUSD and NQ.
  The synthesis lists the few untested angles left and the data each needs.

## Amendments

### A1 — 2026-10-21 — PRE-RESULTS (no outcome computed)

These are point-in-time availability fixes found while building the panel.

**(1) DTWEXBGS (broad dollar)** is published weekly (H.10, Mondays) for the previous week. It enters lagged **6
business days**: row d uses the value dated ≤ d−7.

**(2) THREEFYTP10 (Kim–Wright term premium)** posts with a lag of a few business days, and its history is a model
estimate that can be re-estimated. It enters lagged **5 business days**. All scored models are also reported
**without TP** as a robustness line. If a cell passes only with TP, it is demoted to descriptive.

**(3) Outliers.** FRED DCOILWTICO has known bad prints (DATA_SPEC fault, incl. the 2020-04-20 negative print). Log
changes of oil are taken on max(price, 1). Every feature is winsorised at its training-window 0.5/99.5 percentiles
inside each walk-forward fit. Targets are never winsorised.

## RESULTS

See `analysis/output/yield-predictive-ladder/RESULTS.md`.
