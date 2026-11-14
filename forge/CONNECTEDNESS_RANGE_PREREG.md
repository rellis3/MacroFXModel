# connectedness-range — does a Diebold-Yilmaz spillover index of realised ranges predict the next session's range beyond VIX, correlation and range persistence?

**Pre-registered 2026-11-14, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `connectedness-range` (one scored cell: pooled ten-market log range) |
| Branch | `main` (small commits) |
| Register row | `plans/RESEARCH_REGISTER.md` → `connectedness-range` |
| Data | 1-minute OANDA mid bars (local M1 cache, `--price M`), ten markets: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD, XAUUSD, NAS100_USD, SPX500; London sessions (00:00-22:00 Europe/London), 2016-01-04 → 2026-08-21 (M1 ends 2026-08-20; lockbox date respected); Cboe VIX close (`analysis/surfaces/cboe/VIX.csv`) |
| Seed | `20261114` |
| Uncertainty | stationary block bootstrap over sessions (mean block 10), B = 2,000; all-shift placebo on the connectedness series |
| Scripts / outputs | `scripts/connectedness-range/` → `analysis/output/connectedness-range/` |
| Harness | own script (a range regression in the `gex-range` convention, OLS with block bootstrap) |

Applied from `education/RESEARCH_METHOD_LESSONS.md`: the baseline contains the range persistence and the VIX level (a volatility
"win" must survive the obvious predictors); every variant is logged here; the correlation control is built from returns, not ranges.

## 1. The claim (required)

Connectedness of realised volatilities across assets (Diebold-Yilmaz 2012, 2014; a recent commodity-futures paper reports it
averaging about 60% and rising in disruptions) measures how much of one market's volatility variance is explained by shocks to the
others. A rising total connectedness would say volatility is spreading across markets. The question: **does total connectedness,
known at the close of London session t, predict the (log) range of session t + 1 across these ten markets beyond the range's own
persistence (HAR terms), the VIX level and the mean absolute correlation of the markets' returns?** A size question, no direction.

## 2. Why it is not already settled (required)

Searched 2026-11-14 (`forge/`, `plans/`, `scripts/`, `js/`, register, Evidence Book, paper-ideas report):
- No Diebold-Yilmaz / spillover / connectedness index anywhere in the repo (Diebold appears only for HAR-CJ, Diebold-Mariano and
  the Andersen-Bollerslev-Diebold-Vega announcement paper). `plans/vol-layer/` literature specs cite Diebold-Mariano only.
- The nearest tests are the **correlation regime** (mean |rho| NORMAL/HIGH, a terminal tile, cruder cousin), `mv-dispersion-range` /
  `dispersion-crowded-week` (dispersion vs range; RE-RUN rows exist after a data fault), `world-stress` and the market-state
  engine's stress tiles. None builds a variance-decomposition spillover index or tests it against next-day range.
- `vol-curve-front` (VALIDATED) says the front of the implied-vol curve reads range; the baseline here includes the VIX level
  and `gex-range-iv` shows implied vol absorbs much of what other state variables carry: the prior is that connectedness adds
  little once VIX and persistence are in.
- A grep miss is not proof of absence.

## 3. Definitions, fixed in advance (required)

- **Daily range:** r_{i,t} = ln(H_{i,t} / L_{i,t}) for market i over the London session of date t (mid bars), weekends excluded. A
  market-day counts only if it has ≥ 95% of the instrument's median session minute count (the earlier FOMC-range study's rule is
  not reused; 85% as there). Days where fewer than 9 of 10 markets qualify are dropped.
- **Connectedness (primary):** at the end of each London date t, a VAR(1) with intercept is fitted by OLS on the ten log-range
  series over the trailing W = 250 qualifying days (all ten markets present; days with a missing market are skipped from the VAR
  window and counted), the generalized forecast-error variance decomposition at horizon H = 10 (Koop-Pesaran-Potter / Pesaran-Shin,
  rows normalised to sum to 1) is computed, and **C_t = 100 × (sum of off-diagonal shares) / 10**. C_t uses data through t only.
- **Target:** y_{t+1} = pooled mean over the ten markets of ln(H/L) in the next London session (≥ 9 markets).
- **Controls (all end-of-day t):** HAR terms of the pooled log range (day t, mean of days t−4…t, mean of days t−19…t); ln VIX (Cboe
  close of the last US session on or before date t, i.e. 16:15 ET before the 22:00 London end of day); **mean absolute pairwise
  correlation** of the ten markets' London-session close-to-close log returns over the trailing 60 days (the "correlation
  regime" control); weekday dummies for the target day.
- **Models:** **B0** = controls only; **B1** = B0 + C_t (standardised by its full-sample SD, a scaling only). The scored statistic is
  **b_C**, the coefficient of C_t in B1, in log-range points per SD of C (0.02 = 2% wider range per SD).
- **Descriptive:** b_C by group target (FX, gold, indices); the change ΔC over 5 days instead of the level; W = 120 and 500; H = 5;
  C without the VIX control; halves; the Spearman of C with VIX and with mean |rho| (is it a new variable?).

## 4. Hypotheses, expectation first (required)

Expectation: C is highly correlated with VIX and with mean |rho| (spillover rises with stress), so its marginal coefficient is
small and its interval spans zero.

| # | Question | Pre-registered expectation |
|---|---|---|
| ALL | b_C > 0 (a more connected state is followed by a wider range)? | small positive or zero; the interval spans the +0.02 gate |
| — | **THE GATE** | b_C ≥ +0.02 per SD; bootstrap 95% CI lower > 0; real b_C above **95%** of all-shift placebos |
| — | **THE MIRROR** | (a) the same model with C replaced by its value 20 days later is not a legal predictor and is not run; instead the placebo (all-shift of C) and (b) the sign of C versus VIX and |rho| (reported) |

**Verdict rules:** `VALIDATED` if the gate holds. `NULL` if the gate fails **and** the 95% CI upper bound of b_C < **+0.05**.
`UNDERPOWERED` otherwise. One scored cell, so no multiplicity correction; the group split is BH q = 0.10 and descriptive.

## 5. Power — what this design can and cannot find (required)

About 2,600 qualifying sessions, strongly autocorrelated targets (the block bootstrap handles this). The design SE of b_C is
(residual SD of B0) × √[(X'X)⁻¹ for the C column] × the block-bootstrap inflation (about 1.5-2); MDE = 3.0 × SE. The actual numbers
(design matrix, whole-sample residual SD of B0 only, no b_C read) are written into Amendment A1 (PRE-RESULTS) before scoring. If the MDE exceeds
+0.05 the cell is UNDERPOWERED by design.

## 6. Multiplicity — how many cells, and the corrected bar (required)

One scored cell. W, H, ΔC and the without-VIX model are logged here as sensitivities and never scored. Because C is built on the
same volatility panel used elsewhere, this is a new family on seen data: a pass is research-only until |t| ≥ 3 and a forward
record exist.

## 7. What this does NOT test (required)

Direction; trading; the TVP-VAR version in the paper; commodity futures; intraday connectedness; the connectedness of implied vols;
whether spillover "causes" anything; anything after 2026-08-21.

## 8. What each verdict changes (required)

- `VALIDATED`: research-only candidate; the terminal's connectedness dial/network board (paper idea D2) may show a banked
  number ("a connected state is followed by a range about X% wider per SD"), never a trade.
- `NULL`: the dial is a pure description of the volatility web; it carries no range information beyond VIX, correlation and
  persistence, and says so on the page.
- `UNDERPOWERED`: shown as a description only with its interval; no range claim.

## Amendments

(none yet)

## RESULTS
