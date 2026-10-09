# Futures volatility forecast — does intraday futures data beat the incumbent HAR? (shadow study)

*Pre-registered 2026-10-09, before any result. Data: the NT8/Lucid per-contract 1-minute archive
(`analysis/output/nt8/contracts/`, stitched by `nt8_bridge/nt8_stitch.py`, ratio-adjusted). A **shadow study**: nothing
live changes (owner rule: side by side). No Vote Atlas input.*

## Question

The live range forecast is a HAR-RV (log form) fitted on **daily** Garman-Klass variance of CFD bars
(`forge/vol.py::har_rv_log_sigma`). Futures give things the CFD feed does not: real traded volume and clean 1-minute
bars for every session. **Does a forecast built from intraday futures information predict the next session's range
better than the same incumbent method run on the same futures' daily bars?**

This isolates the information, not the data source: control and candidates predict the **same target** on the **same
futures series**, differing only in regressors.

## Definitions

- **Session** = 00:00–22:00 London (DST-aware), the session the live ladder uses. Sessions with fewer than 500
  one-minute bars (holidays, half days, outages) are dropped.
- **Prices:** ratio-adjusted continuous series (gap-free across rolls); volume from the unadjusted series.
- **Realised targets:** HL, |OC|, OH, OL as % of the session open (`forge/vol.py::realized_quantities`).
- **Daily features known after session s ends** (all before 00:00 London of s+1):
  - `gk` = Garman-Klass daily variance of the session (what the incumbent uses);
  - `rv5` = sum of squared 5-minute log returns inside the session;
  - `bv5` = bipower variation of the same 5-minute returns; `jshare` = max(rv5−bv5, 0) ÷ rv5;
  - `vsurp` = log(session volume ÷ median of the previous 20 sessions' volume).
- **Forecast convention** = the repo's: `sigma[t]` is the forecast for session t using information through t−1
  (`as_of_yesterday`).

## Arms (all predict log gk of the NEXT session; expanding OLS refit every 10 sessions, causal smearing)

| arm | regressors |
|---|---|
| **A0 control** | `forge/vol.py::har_rv_log_sigma` on the futures daily OHLC, unmodified |
| **C0 check** | own HAR on log gk (lag 1, mean 5, mean 22) — must reproduce A0 (see integrity gate) |
| **C1 PRIMARY** | HAR on log rv5 (lag 1, mean 5, mean 22) |
| C2 (secondary) | C1 + the log gk HAR terms |
| C3 (secondary) | C2 + `jshare` and `vsurp` (lag 1) |

C2 and C3 are reported as diagnostics. **Only C1 is the pass/fail hypothesis**; C2/C3 can inform the next study but
cannot rescue a failed C1 (4 arms looked at, 1 pre-declared).

## Instruments

- **Primary set (12, each has a live CFD counterpart):** NQ, ES, YM, RTY, GC, 6E, 6B, 6J, 6A, 6N, 6C, 6S.
- **Secondary (reported, not in the pass rule):** CL, NG, BZ, HG, SI, PL, ZC, ZS, ZW, ZN, ZB, ZF, ZT, FDAX.

## Walk-forward and score

- 6 expanding folds from `forge/vol.py::fold_bounds` (first 40% of history is the first training window). Widths per
  arm = training-quantile multipliers of realised ÷ σ (`_fit_multiplier_set`), frozen per fold.
- Loss per session = mean pinball over the 6 rungs {HL, |OC|} × {p50, p75, p90}, **divided by the control's daily σ%**
  for that session (scale-free, pooled across instruments).
- Compared on rows where every arm has a forecast. Ratio = mean loss(arm) ÷ mean loss(A0). Interval = date-block
  bootstrap (block 20 sessions, 2,000 reps, resampling calendar dates jointly across instruments).

## Integrity gate (before looking at C1)

C0 vs A0 pooled loss ratio must be within 0.97–1.03 on the primary set. If not, the harness has a bug: fix it, record
the fix here, and rerun; C1 is not examined until C0 reproduces A0.

## PASS for C1 (all must hold, primary set)

1. Pooled ratio < 1 and its 95% bootstrap upper bound < 1.
2. Ratio < 1 in **both** halves of the out-of-sample period (split at the median date).
3. Ratio < 1 on at least **9 of 12** instruments.
4. Not a calibration trade: C1's HL p75 exceed-rate within 0.20–0.30 pooled (the repo's calibration convention).

## How each verdict reads

- **PASS:** intraday futures information improves the range forecast; next step is a live shadow (Live Range page
  style) and a CFD translation test. Nothing live changes before then.
- **FAIL:** the daily HAR already captures what 1-minute futures data adds; say so plainly, then report where C2/C3
  point (volume? jumps?) without promoting them.
- **Not tested here:** whether the futures forecast beats the CFD forecast on CFD targets (needs the CFD translation
  step), order-book information (live depth not yet recorded, feed is delayed), and direction.
