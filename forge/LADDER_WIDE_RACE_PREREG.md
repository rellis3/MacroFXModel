# ladder-wide-race: does a much wider model race find a lower-QLIKE σ for HL, OH and OL?

**Pre-registered 2026-11-23, before any new arm below was scored.**

| | |
|---|---|
| ID / ledger ids | `ladder-wide-race` |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-wide-race` |
| Source | Owner 2026-11-23, worried our vol and levels are weaker than Jordan's (a C.OG group member, not C.OG): "test every feasible calc … GARCH, Yang-Zhang, ARIMA, HAR-RV, HAR-IV etc … for the lowest QLIKE", per line (HL, OH, OL = Jordan's HL, Close+, Close−). OC set aside |
| Instruments | Futures (NT8, as `ladder-qlike-per-line`): NQ, GC (GOLD), 6E (EURUSD), 6J (USDJPY, inverted) |
| Window | Sessions 2015 → **2026-08-21** (lockbox untouched). c fitted from 2018, picks from 2019, **scored 2020 → 2026-08-21** |
| Seed | `20261123`. B = 2000, 63-session blocks |
| Scripts | `scripts/ladder-wide-race/` → `analysis/output/ladder-wide-race/` |

## 1. Question

`ladder-qlike-per-line` raced about 20 σ models per line. Is there a better one among models it never ran? Score
each one on QLIKE, per line, choose the model walk-forward, and check whether choosing from the wider field
gives lower out-of-sample QLIKE than choosing from the old field.

## 2. Arms

Every σ for session D uses only data before D (daily bars and 5-min RV of days before D; IV printed before D).
Regression and time-series models are refitted for each year Y on data before Y.

**Old field (unchanged):** the `L.arms_for(sym)` arms of `ladder-qlike-per-line`: A0, E_* estimators, H8, R5, R15,
SHAR, HARCJ, GARCH / GARCH-t / GJR / EGARCH, B_har_garcht, and (NQ, GC) V3, V4, B_har_iv.

**New arms (`W_*`):**
1. Range estimators on the futures daily bars: Parkinson 1/5/10/22/66 days, Garman-Klass 1/5/22, Rogers-Satchell
   5/22, Yang-Zhang 5/66, EWMA of daily Garman-Klass variance λ 0.80/0.90/0.97.
2. Realised vol: yesterday's 5-min RV alone ("yesterday's realised", the closest match to Jordan's NQ number on
   23 Nov), mean of the last 5 and 22 days, EWMA of 5-min RV λ 0.50/0.70/0.85/0.94.
3. Time series on log 5-min RV: AR(1), ARMA(1,1), AR(22) (unrestricted HAR), ARFIMA(0,d,0) with d fitted on prior
   years (grid 0.05–0.49, 250 lags).
4. HAR extensions (OLS on next-day log RV): HAR-IV (+ log IV², NQ/GC), HAR + leverage (yesterday's and last week's
   negative returns), HAR + weekday dummies, range-HAR (log GK 1/5/22), HAR-mix (RV + log GK + downside
   semivariance), HAR-all (everything available for the instrument).
5. Direct per-line: OLS of log(line²) (the line itself, not RV) on the HAR-all features: σ for that line only.
   Same features in a gradient-boosted tree (sklearn HistGradientBoosting, fixed settings: 200 iterations, depth 3,
   learning rate 0.05, min leaf 40).
6. Realized GARCH (log-linear, Hansen et al. 2012) on daily returns + 5-min RV, maximum likelihood per year.
7. Combinations: geometric mean of the top 3 and top 5 arms on prior-year QLIKE for that line (combinations
   excluded from their own pool).

## 3. Scoring and hypothesis

QLIKE exactly as `ladder-qlike-per-line`: h = c·σ², c = mean(x²/σ²) over 2018 … Y−1 per (arm, line); QLIKE =
x²/h − ln(x²/h) − 1, on sessions where every line > 0. For test year Y the pick per line is the arm with the lowest
mean QLIKE on 2019 … Y−1.

- **OLD** = the per-line pick from the old field (the `QL` ladder of `ladder-qlike-per-line`).
- **WIDE** = the per-line pick from old + new arms.
- **H1:** Δ = summed QLIKE(WIDE) / summed QLIKE(OLD) − 1 over HL+OH+OL, equal-weight mean over the 4 instruments,
  90% CI from a 63-session block bootstrap, on 2020 → 2026-08-21 and on each half (2020–22, 2023–26).
- **VALIDATED:** CI upper < 0 overall and in both halves. **NULL:** point ≥ 0 and CI lower > −0.5%.
  **UNDERPOWERED:** anything else. (Same bars as `ladder-qlike-per-line`.)
- Per line (HL, OH, OL) the same Δ with its CI, reported; no separate verdict.

**Descriptive:** full leaderboard per instrument and line (out-of-sample mean QLIKE, 2020 → 2026-08-21), the
WIDE picks by year, and the rank of "yesterday's realised" and Parkinson-1-day (the Jordan-like arms). The best arm
in hindsight is reported but labelled as chosen after the fact; only the walk-forward WIDE pick is tested.

## 4. Controls

1. **Mechanics:** E_yz_20 recomputed from the daily bars must match the build's E_yz_20 on ≥ 95% of sessions within
   1% (confirms the bar date alignment before any new estimator is trusted). Fail → stop.
2. **Reproduction:** the OLD pick's QLIKE must match `ladder-qlike-per-line`'s QL ladder within 0.5% per instrument.
3. **Picker:** a planted oracle arm (σ = the session's own line, × a fixed noise factor e^(0.3·z)) must be picked
   for every line in every test year. Fail → stop.

## 5. What it changes

- **VALIDATED:** the WIDE picks replace the QLIKE per-line picks on the site (if computable live; otherwise the
  best site-computable WIDE arm, reported separately), after the parity test.
- **NULL / UNDERPOWERED:** the current picks stay; the leaderboard goes to Jordan, with where "yesterday's realised"
  ranks.

## Amendments
