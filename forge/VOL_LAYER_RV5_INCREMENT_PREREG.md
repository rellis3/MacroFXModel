# vol-layer-rv5-increment — does 1-minute realised vol make the chosen forecast's range lines more accurate?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `vol-layer-rv5-increment` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-rv5-increment` |
| Data | Step 0 table `analysis/output/forecast_history/<SYM>.csv`, 34 instruments, out-of-sample sessions 2020-08-21 → 2026-08-20. `rv5` in it is built from M1. No lockbox session is read. |
| Seed | `20261006`, the fixed seed of `forecast_record.boot_weights`, kept so this is the same resample scheme as the pick it extends. The protocol's prereg-date default is overridden for that reason. |
| Uncertainty | Date-block stationary bootstrap, block 20, 2,000 reps |
| Scripts / outputs | `scripts/vol-layer/rv5_increment.py` → `analysis/output/vol-layer-rv5-increment/` |
| Harness | Own script on the `forecast_pick.py` fold loop, so the yardstick is identical |

## 1. The claim

The literature pass for layer 1 (`plans/vol-layer/L1_LITERATURE_SPEC.md`) says most of the gain from better vol models comes from intraday data, not model complexity (Pong et al. 2004; Andersen & Bollerslev 1998). The chosen forecast reads daily bars only. The owner's check on 2026-11-07: the chosen forecast already won a head-to-head, so do not build a forecaster shoot-out unless something shows it is needed.

This is the cheapest test that can show it is needed: add yesterday's and the last week's M1 realised vol to the chosen form and rescore.

## 2. Why it is not already settled

- `forecast-pick` scored plain, IV-adjusted, HAR-800, persistence and persistence + IV. HAR-800 is HAR on daily Garman-Klass. No candidate read intraday returns.
- `forecast-persistence-fix` residual terms use yesterday's high-low range, not realised variance.
- `FUTURES_VOL_PREREG` used HAR on log rv5, on futures, against a different question.
- `jump-diffusion` tested jump separation, not continuous RV as an input to the chosen lines.

## 3. Definitions

- **Arms.** S = persistence (`forecast_fix.FB`). SI = persistence + implied vol (`FC`). S+RV and SI+RV add two features.
- **New features**, known before the session opens, with σ = `live_sig_daily` for that session:
  - `rv1` = log(√rv5 of the previous session ÷ σ)
  - `rv5m` = mean of `rv1` over the previous 5 sessions (at least 3)
- **Fit.** Same as `forecast_pick.py`: β and means per class, widths per instrument, refit per fold on sessions before the fold's first test date minus a 5-session embargo.
- **Score.** Pinball over all 12 rungs ÷ the session's plain σ_used, pooled. Same as `forecast-pick`.
- **Boards.** All 34 instruments: S+RV vs S. The 13 IV instruments: SI+RV vs SI.

## 4. Hypotheses

| # | Question | Expectation |
|---|---|---|
| a | S+RV beats S on all 34 | Yes, small: 0.5–1.5% |
| b | SI+RV beats SI on IV-13 | Smaller than (a): implied vol already carries some of it |
| **GATE** | Whole 95% interval below 1, gain above 0.5% (the pick's own tie rule), HL p75 regime miss no worse, no class worse by more than 0.5% | |

**If the gate passes on either board:** the forecaster shoot-out (`vol-layer-l1-sigma`: fitted GARCH, HARQ, panel HAR) reopens under its own prereg. **If not:** it stays parked and the chosen forecast is layer 1's σ.

## 5. Power

From `forecast-pick`: intervals of about ±0.006 on 52,486 instrument-sessions (S vs plain). A paired comparison of nested arms is tighter, so ±0.006 is conservative. MDE at 80% power ≈ 2.8 × 0.003 = 0.0086 ratio on that conservative figure. The pass bar is 0.005, so the conservative figure says UNDERPOWERED and the paired interval decides. Read the realised interval: **if its half-width exceeds 0.005 and the point is below 1, the verdict is `UNDERPOWERED`, not `NULL`.**

## 6. Multiplicity

Two scored cells (the two boards). Holm at α = 0.05 on one-sided bootstrap p-values. The gate is conjunctive. By-class and by-instrument tables are descriptive.

## 7. What it does not test

Whether lines react. Whether a fitted GARCH, HARQ or panel HAR would do better than adding RV terms to the chosen form. A fail does not rule those out in principle; it only means the cheap evidence for spending time there is absent.

## 8. What each verdict changes

- **VALIDATED:** reopen the shoot-out. Nothing live changes.
- **NULL:** the chosen forecast stays as layer 1's σ; the shoot-out stays parked.
- **UNDERPOWERED:** same practical outcome as NULL, recorded as such.

## Amendments

## RESULTS
