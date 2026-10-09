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

---

# Step 2 — CFD translation (added 2026-10-09, after Step 1's result, before any Step 2 number)

*Step 1 (above) passed on futures-on-futures. Step 2 asks the question that matters for the live system: **on the
CFD ranges the live ladder is scored on, does a futures-based σ beat the CFD-based σ?** Same rules, same session,
same walk-forward, no live change.*

## Target and pairing

Target = the live CFD's own session ranges (`forge/vol.py::load_daily(pair, session="london22")`: HL, |OC|, OH, OL as %
of the session open). Pairs (futures root → CFD): NQ→nq, ES→spx500, YM→us30, RTY→us2000, GC→gold, 6E→eurusd,
6B→gbpusd, 6J→usdjpy, 6A→audusd, 6N→nzdusd, 6C→usdcad, 6S→usdchf (the JPY/CAD/CHF futures are the inverse quote;
percentage ranges are the same to first order). Secondary: FDAX→de30. CFD session dates are re-expressed as London
dates so they line up with the futures sessions.

## Arms (all scored on the SAME CFD target rows, CFD widths refit per arm on train)

| arm | σ source |
|---|---|
| **B0 control** | `har_rv_log_sigma` on the **CFD** daily OHLC — what is live |
| B1 (diagnostic) | `har_rv_log_sigma` on the **futures** daily OHLC (Step 1's A0): isolates data source |
| **B2 PRIMARY** | Step 1's C1 on futures (HAR on 5-minute RV) |
| B3 (diagnostic) | 50/50 average of B0 and B2 σ |

Only **B2 vs B0** is pass/fail; B1 and B3 are descriptive (4 arms looked at, 1 declared).

## Score and PASS

Loss per session = mean pinball over {HL, |OC|} × {p50, p75, p90} ÷ B0's daily σ%. Ratio = mean loss(arm) ÷ mean loss(B0)
on rows where every arm has a forecast. Date-block bootstrap (block 20, 2,000 reps, dates resampled jointly across
roots). B2 passes if, on the 12 primary roots: (1) pooled ratio < 1 with 95% upper bound < 1; (2) < 1 in both halves
of the OOS period; (3) < 1 on at least 9 of 12; (4) pooled HL p75 exceed-rate within 0.20–0.30.

## Reading it

- **B2 passes:** the gain survives translation; next is a read-only shadow row on `har-shadow.html`.
- **B2 fails but B1 ≈ B0:** the futures σ only helps on futures targets; the CFD feed's own noise absorbs it.
- **B1 < B0 on its own:** the data source itself matters, independent of intraday information.
- Out of sample the CFD M1 history ends before the futures (2026-08), so Step 2 scores through the CFD data's end.
