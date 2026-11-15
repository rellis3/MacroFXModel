# hl-spread-estimator — can a daily high-low-close spread estimator reproduce the quoted OANDA spread?

**Pre-registered 2026-11-14, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `hl-spread-estimator` (one id; cells H1-H3 below) |
| Branch | `main` (small commits) |
| Register row | `plans/RESEARCH_REGISTER.md` → `hl-spread-estimator` |
| Data | OANDA 1-minute bid/ask bars (`data/m1_bidask/<key>_m1.parquet`, price BAM: `bid_c`, `ask_c`, mid `open/high/low/close`), 34 instruments (FX majors and crosses, gold, NQ, SPX, DOW, DAX, UK100, US2000), 2016-10-21 → 2026-08-20 (lockbox date 2026-08-21 respected) |
| Seed | `20261114` |
| Uncertainty | month bootstrap (resample calendar months within instrument, B = 1000) for the pooled within-instrument statistics; instrument bootstrap for the cross-sectional statistic |
| Scripts / outputs | `scripts/hl-spread-estimator/` → `analysis/output/hl-spread-estimator/` |
| Harness | own script (a measurement-agreement study, no trade rule) |

Applied from `education/RESEARCH_METHOD_LESSONS.md` and the cost lessons in `research-protocol/references/stats-defaults.md`
(2026-10-25 cost-verification: a fill versus the minute's mid is not a spread measurement; here the target is the quoted
ask minus bid, which is what the estimators claim to recover, and the realised-cost gap is stated as a limit).

## 1. The claim (required)

Corwin-Schultz (2012, a two-day high-low estimator) and Abdi-Ranaldo (2017, close versus mid-range) recover the
effective bid-ask spread from daily high, low and close prices alone. If either reproduces the **quoted** OANDA spread
closely enough, the repo's net-of-cost studies could extend cost history to dates and instruments that have daily
bars but no bid/ask (anything before 2016-10, other data vendors, futures histories). The test is whether the estimator
agrees with the measured spread on the 34 instruments where we hold both.

Three questions, per estimator:
- **Level:** does the monthly estimate sit close to the measured monthly mean spread?
- **Variation:** does it follow the measured spread's month-to-month movement within an instrument?
- **Ordering:** does it rank instruments by spread correctly (from cheapest to dearest)?

## 2. Why it is not already settled (required)

Searched 2026-11-14 (`forge/`, `plans/`, `scripts/`, `js/deskEvidence.js`, register, catalogue):
- No match for Corwin, Schultz, Abdi, Ranaldo or "high-low spread" anywhere in the repo.
- `cost-verification` (BANKED) measured NQ and gold round-trip costs and swaps against a real account and found the OANDA
  cost model overstated for gold and NQ; it did not try to estimate spreads from bars.
- `js/spreadProfile.js` / KV `spread_profile_v1` measures live spreads per pair per UTC hour since 2026-09-17: a spread
  history only for the recent weeks. `scripts/costs/check_bidask.py` checks the bid/ask M1 files are clean enough to
  price fills. The bid/ask M1 history therefore already gives a measured spread from 2016-10; this study asks whether a
  bar-only estimator would be a usable substitute **before** that and for instruments without bid/ask.
- A cost estimate that is wrong by a large factor on FX majors (the spread is a tiny fraction of the daily range) is
  the known failure mode of both estimators in the literature on liquid markets; the prior here leans to a poor fit.

## 3. Definitions, fixed in advance (required)

**Measured spread (the truth).** For each instrument-day: the mean over the London session (00:00-22:00 Europe/London,
`london22`) of (`ask_c` − `bid_c`) ÷ mid, in percent of price, over minutes with ask > bid > 0 and a spread no greater than
20 times the instrument's median (outliers counted and reported). Monthly value = mean of daily values with ≥ 15 days.

**Estimators** (percent of price, computed on the daily mid OHLC of the same London session):
- **CS:** Corwin-Schultz two-day estimator, β = Σ_{j=0,1} [ln(H_{t+j}/L_{t+j})]², γ = [ln(max(H_t,H_{t+1})/min(L_t,L_{t+1}))]²,
  α = (√(2β) − √β)/(3 − 2√2) − √(γ/(3 − 2√2)), S = 2(e^α − 1)/(1 + e^α); negative daily values set to 0 (the paper's rule); monthly
  value = mean.
- **AR:** Abdi-Ranaldo, η_t = (ln H_t + ln L_t)/2, c_t = ln C_t, S² = 4(c_t − η_t)(c_t − η_{t+1}); monthly value =
  √max(mean daily S², 0) (the paper's monthly rule).
No tuning, no scaling factor, no per-instrument calibration: the estimator is used as published.

**Agreement statistics.**
- Level: per instrument, median over months of |estimate − measured| ÷ measured. Pooled = median of the 34 instrument medians.
- Variation: per instrument, Spearman correlation of the monthly estimate and measured series. Pooled = median over instruments.
- Ordering: Spearman correlation across instruments of the full-sample mean estimate and mean measured spread.
- Bias: ratio of full-sample mean estimate to mean measured spread, per instrument (reported).

## 4. Hypotheses, expectation first (required)

Expectation: both estimators overstate the spread on liquid FX (volatility, not spread, dominates the high-low range) and
track the month-to-month variation weakly; the cross-instrument ordering may hold because spread and volatility rise
together.

- **H1 (gate, level).** For at least one estimator the pooled median relative error ≤ 0.30 **and** the 95% interval of the
  pooled median (month bootstrap) has its upper end ≤ 0.40.
- **H2 (gate, variation).** For the same estimator the pooled median within-instrument Spearman ≥ 0.50 with the lower end of the
  95% interval > 0.30.
- **H3 (descriptive but required for use).** Cross-instrument ordering Spearman ≥ 0.80 (instrument bootstrap).
- **H4 (descriptive).** By group (FX majors, FX crosses, gold, indices), by era (pre/post 2020), and the sign and size of the bias.

**THE GATE.** One estimator passes H1 and H2 (and H3) → `VALIDATED` for that estimator as a cost-history proxy. Both estimators
have the pooled median relative error's lower end above 0.40 or the pooled median Spearman's upper end below 0.30 → `NULL`.
Anything else → `UNDERPOWERED`. If H1 and H2 pass but H3 fails the verdict is `CONTEXT`.
**THE MIRROR.** The same statistics on a spread that is *not* the instrument's (the measured spread of a different,
randomly paired instrument, B = 200 pairings): if the agreement statistics barely move under random pairing, the estimator
is not tracking anything instrument-specific and the pass bars would be meaningless.

## 5. Power — what this design can and cannot find (required)

n = 34 instruments × about 118 months. This is a measurement-agreement design: the interval widths (month bootstrap) are the
precision. Per instrument the Spearman standard error is about 0.09 at 118 months; the pooled median over 34 instruments is
tighter. A gate of ±0.20 around the bar is detectable (the bars sit 3-5 interval half-widths from the values the prior expects
on liquid FX). If the intervals are wider than the distance to the bar the cell is UNDERPOWERED.

## 6. Multiplicity — how many cells, and the corrected bar (required)

Two estimators × (H1, H2) = four gated cells; the verdict takes the better estimator, so Holm across the two estimators
on the conjunction (both H1 and H2 must hold at the 97.5% interval level). H3, H4 and the mirror are descriptive controls. No
other variants (no rescaling, no volatility adjustment): a calibrated or scaled version would be a new prereg.

## 7. What this does NOT test (required)

The realised cost of an account's fills (`cost-verification` found NQ and gold fills inside the quoted spread), swaps and
financing, spread widening around news, slippage, commissions, or whether a cost model built from these estimates changes
any banked net-of-cost verdict. The quoted spread is the ground truth only for OANDA's retail feed.

## 8. What each verdict changes (required)

- `VALIDATED`: a bar-only spread proxy may be used to extend cost history for studies that need costs before 2016-10 or on
  instruments without bid/ask, with its error band printed.
- `NULL`: say so plainly: no bar-only estimator is usable for costs on liquid FX; keep using the bid/ask M1 history (2016-10+)
  and the live `spread_profile_v1`; pre-2016 net-of-cost verdicts are not extended.
- `UNDERPOWERED`/`CONTEXT`: reported as a description of the agreement with its intervals; no cost series is built from it.

## Amendments

(none yet)

## RESULTS
