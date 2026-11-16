# vol-layer-state-confirm: do the stage 3 vol-state effects hold on unseen 2023-26 data, judged on their own measure?

**Pre-registered 2026-11-16, before any outcome was computed.** No statistic in this prereg has been computed on any session from 2023-01-01 onward. The power table and the discovery values below use the discovery window (2016-10-24 → 2022-12-30) only. See §2 for the older studies that did read 2023-26 data, and what each one saw.

| | |
|---|---|
| ID / ledger id | `vol-layer-state-confirm-over`, `-chosen`, `-nudge`, `-error`, `-dsigma` (five scored cells). `-nudge` also answers the register row `vol-layer-l1-sigma`. |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-state-confirm` (and `vol-layer-l1-sigma`, folded in as cell B) |
| Data | **Instruments (34):** the stage 3 set, `scripts/vol-layer-deep/state.py instruments()`: 28 FX pairs, GOLD, NQ, SPX500, DOW, US2000, DE30, UK100. Reported pooled, by class and by instrument. **Prices:** M1 mid OHLC from `data/m1_bidask/<key>_m1.parquet`. Sessions are London 00:00–22:00 weekdays, 5-minute grid with holes dropped (`state.py fast_sessions`, checked against `forge/rv.py session_rv`). **Live σ:** `live_sig_used` from `analysis/output/forecast_history/<SYM>.csv` (known at the open). **Chosen σ:** `sig` in `analysis/output/line_reaction/chosen_lines.csv` (walk-forward persistence or persistence + IV, from 2020-08-24). **Cell B rows:** `forecast_pick.load()` with `--live --livetype`, as in `scripts/vol-layer/rv5_increment.py`. **Score window:** London dates 2023-01-01 → 2026-08-20. M1 is cut at the end of 2026-08-20 London. Any outcome window that would end after 2026-08-20 is dropped. The lockbox (2026-08-21 onward) is not read. **History used as inputs only:** σ, EWMA state, quarterly HAR / GARCH refits and nudge training may read sessions before 2023. No pre-2023 outcome is scored. **Discovery (reproduction, positive controls, power):** 2016-10-24 → 2022-12-30. |
| Seed | `20261116` (one for every script in this study; set as `forecast_record.SEED` where `line_reaction.Boot` is used) |
| Uncertainty | Stationary date-block bootstrap over London dates, mean block 20 sessions, B = 2000. All 34 instruments on a date move together in a draw. Sensitivity: block 60. |
| Scripts / outputs | `scripts/vol-layer-state-confirm/` → `analysis/output/vol-layer-state-confirm/{discovery,confirm}/`, `RESULTS.md`, `results.json` |
| Harness | Own scripts. They reuse the stage 1-3 builders (`scripts/vol-layer-deep/state.py`, `state_wide.py`) with the window moved, and the `forecast_pick.py` fold loop for cell B. The harnesses don't build M1 realised variance or score pinball on refit nudges. |

## 1. The claim

C.OG, Market Movers, 2026-09-28: "make volatility a shared states variable where you have current conditional volatility, expected change in volatility, volatility relative to its long-run level, probability of being in different volatility regimes, forecast error."

Layer 1 of the Vol-Layer research built those five fields, point in time, for 34 instruments. Stage 3 ("go wide", `scripts/vol-layer-deep/state_wide.py`, `backtest-data/vol-layer/state-wide.json`, discovery only) found:

- **The live σ over-reacts.** Session range ÷ σ in the lowest σ fifth minus the highest fifth is +0.34σ [+0.27, +0.42]. It holds on all 34 instruments, every year, bucket, horizon and regime.
- **It is a flaw of the live σ.** log-HAR and variance-targeted GARCH are close to flat on the same check.
- **Forecast error widens the range.** The top fifth of the error field minus the bottom fifth is +0.28σ against the live σ, but only +0.05σ [−0.03, +0.11] against the chosen σ.
- **log-HAR beats the live σ, not the chosen one.** QLIKE ratio 0.77 against the live σ; against the chosen σ 0.94 [0.89, 1.00] on RV5 and 0.97 [0.94, 1.00] on range².
- **The GARCH half-life is not a stable property.** It runs from 2 to 200 sessions and jumps between quarterly refits.
- **Stage 2 also found** that expected change in vol (F2, log-HAR iterated 5 sessions) tracks next week's change: correlation 0.38 against 0.21 for plain mean reversion.

**The claim:** the strongest of these hold on unseen 2023-26 data, each judged by its own measure. A forecast is judged by its calibration slope or its accuracy, a field by how much it moves the outcome it is meant to describe.

**Why "its own measure".** Stage 4 was first set as an overlay on a base system's P&L. `vol-layer-rule-a-confirm` showed that design cannot see these effects: its Sharpe-change MDEs were 0.25–0.31 on 1,135 trades. The owner approved the change on 2026-11-16. It follows C.OG lesson L03: validate each layer by its own factor (IC or accuracy for forecasts, calibration for probabilities, risk steadiness for sizing).

## 2. Why it is not already settled

**Use of the 2023-26 window so far.** The window is not clean for layer 1. Each earlier use is listed so the reader can weigh each cell:

| Banked entry | Window | What it saw | Cell it touches |
|---|---|---|---|
| `vol-layer-rule-a-confirm` (2026-11-15) | 2023-01 → 2026-08 | Rule A's net R under four stop / size overlays | None. That was Rule A's overlay trades, a different question. No range ÷ σ, calibration slope, pinball or IC was computed. |
| `forecast-persistence-fix`, `forecast-pick` (validated 2026-10-06) | 2020-08 → 2026-08, pooled | "The export over-reacts to recent vol." The persistence nudge cut the calm-vs-busy p75 miss from 5.6 to 1.8 pp. The chosen σ was picked partly on these years. | **A1 and A2.** Same phenomenon, different statistic (a pooled miss-rate gap, not a slope or a σ-fifth gap), and never split by year. So the direction of A1 on this window is not unknown. |
| `vol-layer-rv5-increment` (validated 2026-11-07) | 2020-08 → 2026-08 | Adding lag-1 and 5-day M1 RV to the chosen form (S+RV) cut pinball by 1.2% | **B.** S+RV against S has been seen. B scores only the increment beyond S+RV, which has not. |
| `vol-layer-reaction` (context 2026-11-07) | 2021 → 2026 line touches | Whether vol-state fields change reject / break odds at a line | None directly. Different outcome (a touch, not a range). |

Inside this layer's stage 1-3 work, nothing after 2022-12-30 was loaded (asserted in `state.py` and `state_wide.py`).

**Sister confirms (same day, other layers).** `vol-layer-feedback-confirm` scores the chosen σ's RV-miss persistence and a feedback QLIKE rule. Cell C here scores the same family on the range yardstick (the lines' unit). The two are one family, two proxies (method lesson #10). They should not be counted as two independent confirmations. The stop gap by forecast error (stage 3 "SG") belongs to the stop layer and is not scored here.

**Discovery reproduction (before scoring).** A scratch script rebuilt the cells from `sessions.parquet` and `chosen_lines.csv`, cut at 2022-12-30, seed 20261116, B = 1000:

| Cell | Discovery window | Value [95%] | Bootstrap SE | Dates |
|---|---|---|---|---|
| A1 live σ over-reaction, low − high fifth | 2017-01 → 2022-12 | +0.340σ [+0.271, +0.414] | 0.0375 | 1,555 |
| A2 chosen σ, 1 − MZ log slope | 2020-08 → 2022-12 | +0.041 [−0.019, +0.112] | 0.0333 | 614 |
| A2 benchmark: live σ, 1 − slope, same dates | 2020-08 → 2022-12 | +0.269 [+0.202, +0.345] | 0.0361 | 614 |
| C chosen σ's own error EWMA, top − bottom fifth | 2020-09 → 2022-12 | +0.209σ [+0.134, +0.261] | 0.0323 | 594 |
| C stage 3 form (live σ's error, range ÷ chosen σ) | 2020-09 → 2022-12 | +0.039σ [−0.031, +0.105] | 0.0352 | 594 |
| D IC(F2) − IC(MR5) | 2018-01 → 2022-12 | +0.058 [+0.021, +0.095] | 0.0190 | 1,293 |

Three things in this table change the stage 3 reading:

1. **Stage 3's error effect against the chosen σ used the wrong error.** It ranked sessions by F5, the *live* σ's error, and scored range ÷ *chosen* σ. With the chosen σ's own error the effect is +0.21σ, not +0.05σ. Cell C uses the chosen σ's own error.
2. **Stage 3 only measured over-reaction on the live σ.** The chosen σ's slope is 0.96 (1 − b = +0.04) against 0.73 for the live σ on the same dates. Cell A2 asks this directly.
3. **Stage 2's expected-change benchmark was weak.** F2 and the realised change share the last-5-session RV in their denominators. The −F3 benchmark (σ vs its 252-session median) does not, so it scored 0.22. A mean-reversion benchmark on the same RV5 scale (MR5) scores 0.32. F2's margin is +0.06, not +0.17. Cell D uses MR5.

The run script must reproduce every row of this table to 3 decimals before it opens 2023 (§3, step 0).

**Method lessons applied** (`education/RESEARCH_METHOD_LESSONS.md` and the stats-defaults lessons):
- #1, a positive control with a planted answer, run before the real run (step 0).
- #10, each calibration cell reported on two proxies: session range and √RV5.
- #11, overlapping 5-session outcomes in D get a non-overlapping rerun (every 5th session).
- #14, regime labels causal only (the stage 3 past-only turbulent flag; no smoothed states).
- #18, calibration judged by the Mincer-Zarnowitz slope (efficiency) apart from the level (bias).
- #19, cell B gets a rolling 3-year fit window beside the expanding one.
- #25, the full σ-fifth ladder is shown, not only top minus bottom.
- Stats-defaults 2026-10-21 (plant before registering an MDE for a shrunk model) and 2026-11-04 / 11-07 (whole-cluster shuffles, many draws, gate on the percentile).
- C.OG L01 (plateau over neighbouring settings, +1 lag rerun), L03 (own measure), L05 (regime split is described, not scored: stage 3 found only 4 market-wide turbulent episodes).

## 3. Definitions, fixed in advance

**Step 0, gates before any 2023 outcome is read.** The script runs in `--window discovery` mode first and writes `discovery/step0.json`. `--window confirm` refuses to run unless every check in it passed.
1. **Build.** `build.py` rebuilds the session table (state.py fields F1-F5, `har1`, `garch_vt`, `rq`) for 2016-10-24 → 2026-08-20, with the same code and quarterly expanding refits. On sessions ≤ 2022-12-30 it must match `analysis/output/vol-layer-deep/state/sessions.parquet` (max relative difference 1e-9 on `rv5`, `F1`-`F5`). A refit never sees its own quarter.
2. **Reproduce discovery.** Every row of the §2 table to 3 decimals. Cell B: S+RV vs S on the discovery folds must give the banked `vol-layer-rv5-increment` fold ratios 0.9877 (fold 0) and 0.9862 (fold 1).
3. **Positive controls**, each from outside the pipeline:
   - A1 / A2: replace the outcome with σ × a ratio drawn in whole calendar-month blocks from the same instrument (calibrated by construction). The statistic must be within ±0.02 of 0 (A1) and 1 − b within ±0.02 of 0 (A2). Then use the forecast σ^(1/0.85): the pipeline must return 1 − b = 0.15 ± 0.02.
   - C: plant range = chosen σ × (1 + 0.10 × the standardised F5c) × a month-block ratio. Recover the planted gap within ±0.03. Zero case: F5c shuffled in month blocks, within ±0.02 of 0.
   - D: plant Δ = 0.5·F2 + noise (F2 must win) and Δ = 0.5·MR5 + noise (MR5 must win). The pipeline must return the sign and the closed-form ΔIC within ±0.02. Zero case: F2 shuffled in month blocks gives IC within ±0.02 of 0.
   - B: as `rv5_increment.py` RV_MODE `weak` and `shuffle`. A planted term scaled to give a ratio of about 0.995 must give a 95% interval wholly below 1. A month-shuffled term must give 1.000 ± 0.001.
4. **Power re-check for B.** On the discovery folds, bootstrap the SE of SRH ÷ SR and scale it to 940 confirm dates. If the MDE at one-sided α = 0.01 is ≤ 0.005, cell B becomes POWERED. If not, it stays UNDERPOWERED by design. The rule is fixed now; the result is recorded as a PRE-RESULTS amendment.

If a check in 1-3 fails, stop and fix the code. A code change is a PRE-RESULTS amendment.

**Common rules.**
- Session t's inputs use sessions < t only. σ (live and chosen) is known at the open of t.
- Range y_t = (high − low) ÷ open × 100 over London 00:00–22:00, in % (`hl`).
- Fifths are within instrument over the scored window (as stage 3). A past-only version ranks σ against its own previous 252 sessions (live-usable) and is a plateau neighbour.
- Years for the stability check: 2023, 2024, 2025, 2026 (January to 20 August).
- Bootstrap p: two-sided, 2 × min(share of reps ≤ 0, share ≥ 0), floor 1 ÷ 2001. Cell B: one-sided, share of reps ≥ 1.
- Placebo: 200 whole-cluster draws (calendar month within instrument), seed 20261116 + draw. The real value must sit above the 97.5th percentile of the placebo values.

**Cell A1, live σ over-reaction (`-over`).** A replication of stage 3's headline.
- Statistic: mean(y ÷ σ_live) in the lowest σ_live fifth minus the highest, pooled over 34 instruments.
- Neighbours (plateau): terciles and deciles (lowest minus highest); past-only fifths.
- +1 lag: σ and its fifth from session t−1, outcome y_t ÷ σ_{t−1}. Stage 3 found the effect grows with delay (a staler σ ranks worse). So this lag check guards stability, not a lead.
- Placebo: the calibrated-by-construction draws of step 0 (outcome ratios resampled in month blocks).
- Described beside it: the MZ slope of log y on log σ_live; the same check for log-HAR and variance-targeted GARCH (both put on the range scale with a past-only expanding mean, as stage 3); pit_sig_used in place of live_sig_used.

**Cell A2, chosen σ calibration slope (`-chosen`).** Does the σ behind the lines also over-react?
- Statistic: 1 − b, where b is the pooled slope of log y on log σ_chosen, both demeaned within instrument over the window. b < 1 (a positive statistic) means over-reaction.
- Neighbours: the same slope with √RV5 as the outcome, and with next-session range as the outcome.
- +1 lag: σ_chosen from t−1.
- Placebo: calibrated-by-construction draws.
- Described beside it: the fifths ladder of y ÷ σ_chosen; the intercept (level bias) apart from the slope.

**Cell B, nudges beyond S+RV (`-nudge`), folds in `vol-layer-l1-sigma`.**
- Base arm SR = the chosen persistence form + `rv1` + `rv5m`, exactly as `rv5_increment.py` (all 34 board, arm S basis).
- New arm SRH = SR + two terms, both known before the open:
  - `rv22m` = mean of `rv1` over the previous 22 sessions (at least 15). This completes the HAR day / week / month set. β is pooled per class, so this is a panel log-HAR on the chosen form's residual.
  - `hq` = `rv1` × (q_{t−1} − its expanding mean through t−2), with q = log(√RQ ÷ RV) of the previous session, RQ from `forge/rv.py session_rv`. This is the HARQ weight in log form (Bollerslev, Patton and Quaedvlieg 2016): a noisily measured RV gets less weight.
- Fit: as `forecast_pick.py`: β per class, widths per instrument, refit per fold on sessions before the fold's first test date minus the 5-session embargo. Folds 2-5. Only test dates 2023-01-01 → 2026-08-20 are scored. Fold 2 starts 2022-08-22; its 2022 test rows are dropped.
- Statistic: pinball over all 12 rungs ÷ the session's plain σ, pooled, SRH ÷ SR (below 1 = better).
- Neighbours: the IV-13 board (SI+RV+H vs SI+RV); a rolling 3-year fit window in place of expanding.
- +1 lag: both new terms one session older.
- Placebo: the two new terms shuffled in month blocks.
- Sign check (required): QLIKE on range², SRH ÷ SR, below 1.
- Described beside it (answers the rest of `vol-layer-l1-sigma`): each new term alone; the per-instrument log-HAR forecast as a nudge term; and a standalone QLIKE race on RV5 and range². The race has live σ, chosen σ, S+RV, S+RV+H, fitted GARCH(1,1), variance-targeted GARCH, log-HAR, HARQ and class-panel log-HAR, each scaled by a past-only expanding mean, with ratios to the chosen σ. Realized GARCH is not built and stays open.

**Cell C, chosen σ's own forecast error (`-error`).**
- F5c_t = EWMA (half-life 10 sessions) of e = log(√RV5 ÷ σ_chosen) through t−1, minus the expanding mean of e through t−1 (at least 20 sessions). It starts 2020-09; it is history by 2023.
- Statistic: mean(y ÷ σ_chosen) in the top F5c fifth minus the bottom fifth.
- Neighbours: half-lives 5 and 20.
- +1 lag: F5c from t−2.
- Placebo: F5c shuffled in month blocks.
- Described beside it: the stage 3 form (live F5); sessions tagged high-impact vs none where the calendar is known (`event`; `unknown` rows left out of that split, never imputed, and their share reported); turbulent vs calm (stage 3 flag); the pinball gain from adding F5c to SR.

**Cell D, expected change in vol (`-dsigma`).**
- F2_t = 0.5·log(mean of the log-HAR forecast for t..t+4 ÷ mean RV5 over t−5..t−1), as `state.py`.
- MR5_t = 0.5·log(median RV5 over t−252..t−1 (at least 126) ÷ mean RV5 over t−5..t−1). This is mean reversion on the same RV scale.
- Realised Δ_t = 0.5·log(mean RV5 over t..t+4 ÷ mean RV5 over t−5..t−1). Sessions whose t+4 falls after 2026-08-20 are dropped.
- Statistic: IC(F2, Δ) − IC(MR5, Δ). IC is the pooled Pearson correlation after demeaning each variable within instrument.
- Neighbours: horizons 3 and 10 sessions (F2 iterated to the same horizon).
- +1 lag: F2 and MR5 from t−1, against the same Δ_t.
- Placebo: F2 shuffled in month blocks.
- Rerun: every 5th session only (no overlapping outcomes).
- Described beside it: the stage 2 benchmark −F3; a GARCH-implied expected change from the variance-targeted fit, E_t[h_{t+k}] = σ̄² + (α+β)^{k−1}(h_{t+1} − σ̄²), on the RV5 scale. This is the "GARCH half-life as expected change" idea. It is not scored because the fitted half-life is unstable (2 to 200 sessions in discovery).

**Sample.** 2023-01-01 → 2026-08-20, opened once after step 0 passes. About 940 London dates × 34 instruments. The five cells answer different questions and are not variants of one.

## 4. Hypotheses

| Cell | Question | Expectation (from discovery) | Pass bar |
|---|---|---|---|
| A1 `-over` | Does the live σ still over-react (low − high fifth of range ÷ σ)? | **Yes**, about +0.3σ | +0.17σ (half the discovery size) |
| A2 `-chosen` | Does the chosen σ over-react (1 − MZ slope)? | **No / small**, about +0.04 | +0.10 |
| B `-nudge` | Do HAR-month and HARQ terms beat S+RV on pinball? | **Small**, under 0.5%. Likely NULL or UNDERPOWERED | 0.5% gain (ratio 0.995) |
| C `-error` | Does the chosen σ's own recent error widen the range? | **Yes**, about +0.15 to +0.2σ | +0.10σ |
| D `-dsigma` | Does HAR expected change track realised change better than RV-scale mean reversion? | **Yes, small**, about +0.06 | +0.05 IC |

**THE GATE (VALIDATED)**, all of these:
- Holm-adjusted p < 0.05 over the five cells;
- the predicted sign, with the point estimate at or beyond the pass bar (A2: at or above +0.10 to say the chosen σ over-reacts);
- **plateau:** both neighbours have the same sign and at least half the base size;
- **+1 lag:** same sign and at least half the size;
- the same sign in at least 3 of the 4 years;
- the real value above the 97.5th percentile of its 200 placebo draws;
- cell B also: QLIKE on range² below 1, no class worse by more than 0.5%, and the HL p75 calm/busy miss no worse than SR's (the `rv5-increment` gate).

**THE MIRROR:**
- A1, A2: a forecast calibrated by construction (the placebo draws), and log-HAR / GARCH beside the live σ.
- B: SR itself, on the same rows and folds.
- C: the bottom F5c fifth (recent over-forecast) is the mirror of the top. Both sides are shown against the middle fifth.
- D: MR5 on the same rows.

**Other verdicts:**
- **CONTEXT:** Holm p < 0.05 with the predicted sign, but the point is below the bar, or a plateau, lag, year or placebo check fails.
- **NULL:** not Holm-significant and the 95% interval lies wholly below the bar; or Holm-significant with the wrong sign. For A2 a NULL is the expected answer: "the chosen σ does not over-react by 0.10 or more".
- **UNDERPOWERED:** not Holm-significant and the interval reaches the bar. A cell marked UNDERPOWERED by design in §5 that comes back empty is UNDERPOWERED, never NULL.

## 5. Power

Discovery bootstrap SEs (§2 table; block 20) scaled to about 940 confirm dates: SE_confirm = SE_disc × √(dates_disc ÷ 940). Cell B's SE comes from the banked `vol-layer-rv5-increment` interval (half-width 0.0027 on 1,558 dates). That interval spans 2020-26, but citing it reads no new outcome. Step 0 replaces it with a discovery-only SE.

The real-data bootstrap SEs are about three times the row-shuffle control SEs (A1 0.0375 vs 0.0105; A2 0.048 vs 0.016 on the fifths form). So the table uses the real-data SEs, which is conservative (lesson 2026-11-04).

MDE from `js/preregStats.js` `mdeFromCI`, 80% power. The binding column is α = 0.01, the strictest Holm step for five cells.

| Cell | Discovery n (dates) | SE confirm | MDE, α 0.05 | **MDE, α 0.01** | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| A1 `-over` (two-sided) | 1,555 | 0.0482 | 0.135σ | **0.165σ** | 0.17σ | **POWERED** (just) |
| A2 `-chosen` (two-sided) | 614 | 0.0269 | 0.075 | **0.092** | 0.10 | **POWERED** |
| B `-nudge` (one-sided) | 1,558 | 0.00178 | 0.0044 | **0.0056** | 0.005 | **UNDERPOWERED by design** (step 0 may revise, rule fixed in §3) |
| C `-error` (two-sided) | 594 | 0.0257 | 0.072σ | **0.088σ** | 0.10σ | **POWERED** |
| D `-dsigma` (two-sided) | 1,293 | 0.0223 | 0.062 | **0.076** | 0.05 | **UNDERPOWERED by design** |

- **Why A2 is a slope, not fifths.** The fifths form of A2 has SE 0.039 in confirm and MDE 0.134σ against a 0.10σ bar: underpowered. The slope uses every session, not two fifths, and is powered. The fifths ladder is still shown.
- **Why the bars are where they are.**
  - A1: a replication should be at least half the discovery size.
  - A2 and C: 0.10σ between extreme groups is about 6% of the mean session range (≈1.6σ), five times the 1.2% gain banked as worth having in `rv5-increment`. A slope of 0.90 moves a line by about the same amount across the σ fifths.
  - B: 0.5% is the forecast-pick tie rule.
  - D: 0.05 is the smallest IC gain that would change which expected-change field the vol state publishes.
- **D cannot be rescued here.** A longer window would need the lockbox. Pooling horizons would mix overlapping outcomes. It runs as registered and an empty result reads UNDERPOWERED.
- **A1's lag check cannot fail by staleness.** Stage 3 found the effect grows with delay, so +1 lag is a stability check here, not a lead test.

## 6. Multiplicity

- **Five scored cells**, Holm at α = 0.05 on the bootstrap p values (A1, A2, C, D two-sided; B one-sided).
- **Disaggregation** (class, instrument, year, regime, calendar split): Benjamini-Hochberg at q = 0.10 within each cell, with `chanceBaseline`. A slice that survives BH is a candidate for its own prereg, never a result.
- Neighbour settings, lag reruns, placebos, the standalone QLIKE race and every "described beside it" item carry no pass / fail weight.
- **Promotion bar.** Nothing here sizes or gates a live position. Anything that later would needs |t| ≥ 3 on its cell or a forward test.

## 7. What this does NOT test

- **Direction.** No field here says which way price goes.
- **Tradability.** No trade, no costs, no P&L. Whether any field improves a system's stop or size belongs to the stop and sizing layers.
- **The stop gap by forecast error** (stage 3 "SG"): stop layer, `vol-layer-stops-confirm`.
- **The regime probability F4 and the long-run field F3** as separate fields. Stage 2 found F3 correlates 0.90 with σ now and F4 adds nothing beyond σ. They appear only as context.
- **Realized GARCH and the time-of-day profile**: not built.
- **Live behaviour.** The chosen σ in `chosen_lines.csv` is the walk-forward research copy, not the live export.
- **Cause.** A pass says the field describes the range better on unseen years, not why.

## 8. What each verdict changes

Nothing live changes on any verdict. Every pass becomes a side-by-side proposal, never an edit to a live calculation.

- **A1 VALIDATED:** the live σ's over-reaction is confirmed on 2023-26. The vol-state object (`/api/vol-state`, `js/volStateVector.js`) should mark "σ now" as the live σ and say it over-reacts. Any layer that stops or sizes by the live σ is pointed at the chosen σ. **NULL:** stage 3's headline is withdrawn for 2023-26 and the panel says so.
- **A2 NULL (expected):** the chosen σ is calibrated in slope. Proposal: "σ now" in the vol state switches to the chosen σ. **VALIDATED:** the chosen σ still over-reacts; a shrink term goes to the next forecast-fix prereg.
- **B VALIDATED:** S+RV+H becomes a shadow arm next to the chosen lines with its own forward record. `vol-layer-l1-sigma` closes as validated. **NULL or UNDERPOWERED:** `vol-layer-l1-sigma` closes. The chosen form plus RV stays layer 1's σ, and no forecaster shoot-out is built.
- **C VALIDATED:** the chosen σ's own error is a real field. The ASSEMBLY line "the error-scaled stop does not hold up ... only +0.05σ against the chosen σ" is corrected, because that number used the live σ's error. The error-scaled stop is reopened for the stop layer on the chosen σ. **NULL:** the error field is dropped from stops and sizing.
- **D VALIDATED:** "Δσ expected" in the vol state is the HAR-iterated field, published beside MR5. **UNDERPOWERED (likely):** Δσ stays descriptive, shown beside MR5, and the page stops quoting 0.38 vs 0.21.

## Amendments

## RESULTS

*Appended below this line, or written to `analysis/output/vol-layer-state-confirm/RESULTS.md`. Nothing above it changes after the run.*

**Scripts to be written (not yet written):**
- `scripts/vol-layer-state-confirm/build.py`: the session table 2016-10-24 → 2026-08-20 (state.py fields, `rq`, quarterly refits), with the discovery match check of step 0.1.
- `scripts/vol-layer-state-confirm/run.py`: `--window discovery | confirm`; cells A1, A2, C, D with neighbours, lags, placebos, years, BH slices and the step 0 plants.
- `scripts/vol-layer-state-confirm/nudge.py`: cell B on the `forecast_pick.py` fold loop (SR vs SRH, both boards, rolling window, lag, shuffle and plant modes), plus the standalone QLIKE race.
