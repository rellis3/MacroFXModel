# Layer 1 repo pass: the literature spec mapped onto our code

2026-11-07. Read-only, code only. No results files were read. The agent saw two verdict lines by accident and didn't use them:
the docstring of `volatilityExhaustion/har_cj_forecast.py` and the evidence numbers in the header of `js/forecastLadderPersist.js`.
Spec: `plans/vol-layer/L1_LITERATURE_SPEC.md`. Owner's rule: everything is built from M1, point-in-time.

## 1. Realised-variance target from M1

| Where | What it computes | Problem for this study |
|---|---|---|
| `volatilityExhaustion/jump_diffusion_daily.py:86 day_returns`, `:99 collect` | RV and BV per London day on a 5-min grid. A return that spans a hole is dropped. | 24-hour London day, not 00:00–22:00. Weekend stubs not excluded. |
| `volatilityExhaustion/jump_detect_lm.py:147 collect` | RV, semivariance (RS±), quarticity RQ = n/3·Σr⁴ | No BV per day. Same 24-hour window. |
| `scripts/forecast_history/build.mjs:~120` | rv5 and bv5 per London 00:00–22:00 session | Forward-fills empty slots, so zero returns pull BV down. `loadM1ForPair` merges the R2 tail; no lockbox cut. |
| `js/volForecastBench.js:36 realizedVarSeries` | Garman-Klass, Parkinson or r² | Daily OHLC only. |
| `js/volEstimatorAB.js:72 realizedSigmaSeries` | 1-min RV per 24-hour London day | Returns that span gaps are kept. |

None of these is a Python M1 → London 00:00–22:00 5-min RV/BV/RQ builder. **Built 2026-11-07: `forge/rv.py`.**

## 2. The incumbent σ

- **Estimators.** `forge/vol.py` has `yang_zhang_sigma` :92, `ewma_sigma` :129, `naive_expanding_sigma` :163 and `har_rv_log_sigma` :246. Each is measured "as of the close" and shifted by `as_of_yesterday` :349.
- **JS ports.** `js/forecastSigma.js` matches the Python line for line, and `forecastSigma.test.mjs` cross-checks the two. One exception: the `har_rv_log` path in `forecastSigma()` uses `harRvLogForecastNext`, with a whole-window scale and smear. No shipped instrument uses it.
- **Shipped estimators.** `js/forecastLadderParams.js`: yz_10 ×18, ewma_094 ×15, yz_20 ×2, ewma_090 ×2.
- **How each estimator was picked.**
  - `walk_forward_vol` :745 runs 6 expanding folds from 40% of the span.
  - `design_vol` :695 picks the lowest training-set HL pinball loss (p50 + p75) out of 7 estimators × {Feller, fitted} widths.
  - `export_ladder_params.py:82` ships the last fold only.
- **Bar-shape mismatch.** The fit runs on London 00:00–22:00 bars (`load_daily(session="london22")`). Live applies the estimator and widths to OANDA NY-close bars. This breaks data-rules item 2.
- **Persistence + IV (the chosen form).**
  - Code: `js/forecastLadderPersist.js:41 persistFeatures`.
  - Regime = log(σ ÷ median of the prior 250 σ). res1/res5 = log(HL ÷ σ). Plus weekday dummies.
  - σ_new = σ_used·exp(β·(x − μ)).
  - The IV term is log(IV ÷ σ√252) (`forecastLadderIvAdj.js:113`).
  - Bars come from `barsBefore` (date < session). Causal.

## 3. Challengers

- **GARCH(1,1).** No per-instrument fit exists.
  - Fixed α = 0.06, β = 0.91 in `volBacktestEngine.js:27,276`, `vol_range_forecast.py:95,116` and `volForecast.js:351`.
  - The JS FX ω (4.76e-6, the index value) is about 13× the Python value (3.6e-7).
  - An MLE exists only in `analysis/system/stylized_facts.py:31 garch11` (Nelder-Mead, full sample). It can be reused with expanding refits.
- **log-HAR.** `forge/vol.py:246` and `volForecastBench.js:196`, both on daily Garman-Klass, not M1 RV.
- **Not built anywhere:** HARQ, panel HAR, true realized GARCH. `volForecast.js:377 garchOnRVSeries` is a fixed-parameter GARCH-X.
- **Time-of-day profile.** `jump_detect_lm.py:115 periodicity` is fitted on the first 60% of the full sample. `session_stats.py` uses a live OANDA H1 fetch.

## 4. Evaluation tools

**Present:**
- QLIKE: `volForecastBench.js:528`, `har_cj_forecast.py:85`, `volHorseRaceEngine.js`.
- Pinball loss and exceed rate: `forge/vol.py:412,422`.
- Diebold-Mariano: `forge/run_iv_sizing_filter.py:75 dm_t` (Bartlett HAC).
- Mincer-Zarnowitz: `volHorseRaceEngine.js _mz` (slope and R² only).
- Stationary bootstrap: `forge/evaltools.py:59`.
- Date-clustered mean: `forge/evaltools.py:118`.
- Expanding folds: `pylego/walkforward.py:60`.

**Missing:** Model Confidence Set, SPA, and the Kupiec and Christoffersen coverage tests.

## 5. The other fields

- **Δσ.** A cone-percentile proxy only (`volStateVector.js sigmaExpectedChange`).
- **σ vs long-run.** Trailing 252-session median and percentile on NY bars. Causal.
- **Regime.** `hmmHourly.js` gives a filtered, causal probability, but from a live H1 log kept for 45 days only. There is no M1 history. `RegimeV2/bocpd.py` is set up for a confidence input, not vol.
- **Forecast error.** Mean of log(HL ÷ p50) over the last 20 audits.
- **IV.** `oi_research_book/data/iv_daily_*.parquet` (6 USD majors and NAS100), joined with `run_combined_range.py:49 asof_before` (strictly before).

## 6. Data plumbing

- **Python sessions.** `forge/bars.py:49 load_m1` feeds `forge/vol.py:795 load_daily(session="london22")`.
- **Python NY-close bars.** No builder existed; the runners shell out to `scripts/rangebook/ny_close_d1.mjs`, which merges the R2 tail. **Built 2026-11-07: `forge/rv.py ny_close_daily`.**
- **JS.** `nyCloseDailyBars` (`voteAtlasV4Lines.js:59`). `bucketM1IntoSessions(...,'Europe/London')` makes 24-hour days.
- **Lockbox.** No loader cuts at 2026-08-21. `forge/rv.py` now does by default.

## Gap list for the σ comparison (smallest new code)

1. **Done:** `forge/rv.py` `session_rv` (London 00:00–22:00, weekdays, 5-min grid with dropped holes; RV, BV, RQ, RS± and the overnight return as its own term), `ny_close_daily`, `bars_before` / `last_bar_index_before`, and the lockbox cut. Proven by 9 tests in `forge/rv_test.py`, including prefix invariance.
2. **Forecasters.**
   - Reuse `ESTIMATORS` + `as_of_yesterday` on NY bars.
   - New: GARCH(1,1) MLE with expanding refits (from `stylized_facts.garch11`).
   - New: log-HAR, HARQ and panel log-HAR on RV5. Extend `_har_fit_core` to k columns; pool the panel with expanding per-instrument means.
   - Optional: a legacy arm with the fixed-parameter GARCH.
3. **Level mismatch.** A 24-hour NY-bar σ is being scored against a 22-hour RV5 target. Fix it in the prereg, either with an expanding, past-only scale (an MZ-style intercept) or with target = RV5 + overnight r².
4. **Evaluation.**
   - Move `dm_t` into `forge/evaltools.py`.
   - New: MCS (Tmax statistic on `stationary_bootstrap`), and MZ with HAC.
   - Pool across instruments with date clusters.
   - Score the incumbent with the spec that was point-in-time at each date, not the shipped last fold.

## Causality risks found in existing code (do not reuse as-is)

- `har_cj_forecast.py` `run()`, log form: the smearing mean uses full-sample residuals and S is a full-sample median.
- `volForecastBench._rvScale` :285: a whole-series median floor in `harRvLogPred` and `harIvPred`.
- `forge/vol.py:246`: the scale comes from rows 0–249, so the first year of predictions sees those future rows (floor only).
- `jump_detect_lm.periodicity`: a split fitted on 60% of the full sample.
- `forecastLadderIvAdj.js:76 barsBefore`: keeps bars that have no date key. In a historical replay, the OANDA bar dated D−1 closes during London session D. Live is protected by `complete`; the callers were not audited.
- `build.mjs` and `ny_close_d1.mjs`: no lockbox cut.

**Distortions, not leaks:**
- The estimator and widths were picked on London 00:00–22:00 bars but are applied to NY bars.
- The JS FX GARCH ω is about 13× the Python value.
- The horse-race target includes gap-spanning returns.
- `build.mjs` forward-fills empty slots.
