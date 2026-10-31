# Audit: volatility batch (39 null / underpowered verdicts)

Auditor stance: the banked verdict is a claim under audit. Each verdict was traced to the code that produced it, and the computation was read. Re-runs were done where the inputs are in the repo (scratch copies in `work_vol/`; no repo file was written).
Local data: there is no M1 cache, no `features/` store and no OANDA key in this container. Re-runs were possible for nbfi, yen x2, zero-gamma (with a Friday-drop variant) and short-vx.

Classes: CONFIRMED / BUG / DESIGN / NOT-REPRODUCIBLE / SHALLOW-CHECK.
Counts: **CONFIRMED 25 · BUG 3 · DESIGN 7 · SHALLOW-CHECK 4 · NOT-REPRODUCIBLE 0**.

## Per-entry table

| id | class | conf. | evidence (file:line) | meaning | justified re-test |
|---|---|---|---|---|---|
| dispersion-crowded-week | BUG | med (mechanism high, impact low-med) | `analysis/dispersion_study.mjs:61-62` + `js/volBacktestEngine.js:112` | The OANDA D candles are London-aligned, but each is keyed by the **UTC** date of its start. In BST, the bar keyed D is London session D+1, and Friday DSPX dates find no bar. Setups mapped: **60 of the 68** in the write-up. Sunday-stub candles sit inside the 5- and 20-bar windows; the half split is keyed on a Sunday (`2018-09-09`). Live fetch ran to 2026-09-22, so it scored past the lockbox | Rebuild on London-date M1 sessions (`bucketM1IntoSessions(...,'Europe/London')`, weekdays only, ≤2026-08-21) and re-score D1a/D1c. A 5- or 20-day horizon makes a reversal unlikely, but N and halves change |
| yield-move-fx-range | BUG | high | `analysis/yield_move_fx_range_study.mjs:68-70,84` + `js/volBacktestEngine.js:112` | Same defect. In BST (about 7 months a year) the "next session" (h1) is in fact the **second** session after the yield move, and Friday (NFP) setups are dropped. In GMT, a Friday setup's next bar is the Sunday 2-hour stub. 5,000 bars over 15.8 years (about 6.1 bars a week) confirms that Sunday candles are present. Scored to 2026-09-24, past the lockbox. EURUSD already clears, and USDJPY/GBPUSD are close (+0.086, +0.078) | Yes. London M1 sessions, weekday-only, lockbox-truncated, same gate |
| spread-divergence-range | DESIGN | med | `analysis/spread_divergence_range_study.mjs:120-121` | The gate passed in both halves (+0.132 [0.071, 0.198] at 2h). The mirror that killed it is "spot moved ≥3× its median", which is FX's **own** vol clustering and is bound to be larger. Divergence setups have spot moves *below* median, so own-series clustering predicts calmer hours, yet the hours were wider. The NULL does not follow from the test. Live H1 to 2026-09-27 (past the lockbox) | Regress next-2h/6h FX range on \|Δspread\|, controlling for own lagged \|fx move\|, trailing FX range and hour-of-day, ≤2026-08-21 |
| tag-x-persistence | DESIGN | med | `analysis/surfaces/tag_x_persistence.py:122` | H2 passes 4 of 5 checks and fails only on the 97.5% CI [-0.016, +0.097]. Protocol: a cell that cannot reach its own bar is UNDERPOWERED, not NULL. σ is YZ-10 on London-day bars, not NY-close (it is self-consistent, so this is not a null-maker) | Re-word to UNDERPOWERED. The H2 forward record is already proposed |
| skew-fade | CONFIRMED | med | `analysis/surfaces/skew_fade.py:41` | Orientation handled (`quote_orientation`). H3 is significantly negative, so NULL is earned | — |
| directional-rescore | CONFIRMED | med | `scripts/rangebook/directional_build.mjs:30-38` | Uses the shared v4Days (NY-close σ n≥60, London sessions), stops at the calendar end. Code read only (no local M1) | — |
| exhaustion-schedule | DESIGN | med | results text: "DESIGN DEGENERATE -> NULL" | The registered schedule could not be tested (it fits 0σ or no level). A degenerate design is no-test (UNDERPOWERED), not NULL. The "use" claim rests on a post-hoc table | Re-word. The post-hoc "distance adds nothing" claim needs its own prereg |
| live-range-clock | CONFIRMED | med | `forge/run_live_range_clock.py:53-80` | Targets are σ-normalised (`run_live_range_history_build.py:46`), with a clean date split. Fails a pre-registered usefulness bar (count of checkpoints). There is no CI, but the gain of about 1% is described honestly | — |
| live-range-features | SHALLOW-CHECK | low | `forge/run_live_range_features.py` | Not read in depth | — |
| iv-regime-fade-follow | CONFIRMED | med | `forge/run_iv_trades.py:25-30` | The london22 → London-date re-key is correct, and the trade join is audited. The HAR benchmark is causal | — |
| iv-sizing-filter | CONFIRMED | med | `forge/run_iv_sizing_filter.py:26,45-47`; `forge/vol.py:217-243` | HAR is an expanding walk-forward (no full-sample betas). The IV join is strictly-before. σ is on london22 bars, not NY-close (a rule deviation, low impact) | — |
| jump-p90-event-term | CONFIRMED | med | `scripts/forecast_history/jumps.py:167` | The per-instrument × per-tag p90 is fitted on ≥20 rows (noisy by design). But event-day p90 exceedance was already 10.0%, so there was nothing to fix | — |
| meta-label-trust-lines | CONFIRMED | low-med | `scripts/forecast_history/meta_label_3a.py:163` | The claim includes "well calibrated". Skill is real (4.8% [3.2, 6.6]), and the record says so. CONTEXT would be the better word | — |
| meta-label-trust-lines-persist | CONFIRMED | med | `scripts/forecast_history/forecast_fix.py:96-134` | The persistence-adjusted lines_B are fitted walk-forward per fold with an embargo. The benchmark has no lookahead | — |
| opex-cycle-range | CONFIRMED | med | `scripts/forecast_history/opex_cycle.py` | Clustered over cycles, with FE and placebos; `event==none` excludes unknown tags | — |
| one-range-forecast | DESIGN | high | `scripts/forecast_history/one_forecast.py:161`; `analysis/output/one_forecast/results.json` | Flags give 0.9926 [0.9874, **0.9978**], which excludes 1, with 3 of 4 instruments better and a smaller regime miss (2.41 vs 2.69pp). Diag SIX/SIUS 0.991 [0.9855, 0.9963]. The gain is real, and its size versus the 0.99 bar is unresolved. That is UNDERPOWERED, not NULL. The gamma (Q2) null stands | Re-word. Optionally re-score on the next data year |
| zero-gamma-distance | BUG | high (mechanism), verdict stands | `oi_research_book/scripts/18_gex_range_brownian.py:126` (DATA_SPEC §5 #11) | Re-run: Friday rows (165 of 779) have DR **0.235** against 1.05-1.13 on other days, because targets fall on the Sunday stub. Dropping Fridays gives Δ +0.014 (se 0.065). The positive control rises to +0.075 (p 0.086) and still fails. OI(D) → D+1 timing is not fixed. results.json says "NULL", while the bank says underpowered (a demotion, fine) | Re-run inside GEX_RANGE_ES Q2 (NY-close M1, OI(D) → D+2) |
| day-recon-reach-calibration | SHALLOW-CHECK | low | `scripts/day-reconstruction/m6_analysis.py:245-280,401-407` | The walk-forward and CITL classing look right. Not traced further | — |
| meta-label-yield-spread | CONFIRMED | med | `scripts/forecast_history/meta_label_ys.py:53` | The `today`/`jumps5` features use the entry-date session (borderline lookahead, which would favour finding an effect). The CI upper bound of +0.006 rules out a gain | — |
| meta-label-proper | DESIGN | high | `forge/META_LABEL_PROPER_PREREG.md:101` | Both models failed the sanity check, and the record calls the test "uninformative". That is UNDERPOWERED by protocol, not NULL. Superseded by meta-label-long | Re-word only |
| meta-label-long | SHALLOW-CHECK | low | `scripts/ys_long/meta_model.py:60-77` | Purged walk-forward model read. Feature timing not traced | — |
| rates-vol-news-timing | DESIGN | med | `scripts/rate_diff_nq/cog_cross_asset_vol_robust.py:20-51`; base `cog_shape_agnostic.py:65` | The "scheduled-release calendar" is 08:30 and 10:00 ET on **every weekday**, plus NY-open minutes, weekday and FOMC. The base model has **UTC-hour** dummies. What absorbed the gain is a DST-correct NY clock, not news. "Beyond the clock" NULL is fine. "Use the release calendar" and "restatement of news timing" are not shown | Add NY-local hour dummies only (no release terms) and see whether the gain still vanishes |
| short-vx-rule | CONFIRMED | high | `scripts/short-vx-rule/rule.py` | Re-run reproduced exactly: 52 trades, +0.218R, A2 p 0.0955, flag−random [-0.043, +0.252] | — |
| vix-integral-gaps | CONFIRMED | med | `scripts/vix-calculus/daily.py:19-28,62-63` | Causal trailing-252 ranks, a slope lagged by 20 days, NW SEs and a roll placebo | — |
| vix-beta-level | SHALLOW-CHECK | low | `scripts/vix-nasdaq-beta/run.py` | The shared model and features were read; run.py was not | — |
| vvix-ratio-direction | CONFIRMED | med | `scripts/vvix-nasdaq-ratio/features.py:38`; `model.py` | Causal flags; the design floor is stated honestly | — |
| nbfi-rates-vol | CONFIRMED | high | `scripts/nbfi-rates-vol/run.py` | Re-run reproduced exactly (r 0.1317 [-0.0004, 0.263]). The ^TNX scale was checked (no ×10 break) | — |
| yen-funding-squeeze-usdjpy | CONFIRMED | high | `scripts/yen-funding-squeeze/run.py:53` | Reproduced (−0.060). The Yahoo JPY=X cache has bad-tick spikes (2008-04-07 +5.5%, 2008-10-07 +8.2%, 2008-12-08 +16.3%, each reversed the next day). With them removed: −0.072 [-0.246, 0.078], same verdict | Add a spike filter for future Yahoo FX use |
| yen-funding-squeeze-audjpy | CONFIRMED | high | same | Reproduced (+0.043 → +0.049 cleaned) | — |
| rates-vol-gap-move | DESIGN | med-high | `scripts/rates-vol-gap/score.py:97-102`; `forge/RATES_VOL_GAP_PREREG.md:130-134` | The CI [+0.007, **+0.108**] breaks the pre-registered NULL rule (upper bound < 0.10). The code returned "NOT COVERED". A post-hoc A1 chose NULL. Ex-2020 it is a clean null, but the pooled word should be UNDERPOWERED or CONTEXT | Re-word only |
| rates-vol-gap-state | CONFIRMED | med | `scripts/rates-vol-gap/common.py`, `build.py` | NY-close M1 bars, causal percentiles. Calendar coverage checked through 2026-08 | — |
| tff-basis-rates-vol-level | CONFIRMED | med | `scripts/tff-basis-rates-vol/run.py:31-58` | PIT `asof<=Fri 21:00Z`; the forward window starts the next business day | — |
| tff-basis-rates-vol-build | CONFIRMED | med | same | — | — |
| funding-forecast-error-squeeze | CONFIRMED | med | `scripts/funding-forecast-error/run.py:113-120` | The archive (`vf3_stage_b/part1_lines.parquet`) holds 52,486 rows and 1,558 dates (2020-08-20 → 2026-08-20), matching the write-up. Shared check below | — |
| funding-forecast-error-cpstress | CONFIRMED | med | same | The tenor-mismatch flaw is already disclosed | — |
| funding-forecast-error-levbuild | CONFIRMED | med | same | — | — |
| basis-stress-fxvol | CONFIRMED | med | `scripts/basis-stress-rules/run.py:64` | The full-sample persistence OLS is only a residualisation (not a null-maker). Basis is measured at 18:30-19:29Z, before the NY close. Note: the linear r over every day is dominated by tick noise (~5bp/tick), so "the basis does not move first" overreaches for tail episodes | — |
| basis-stress-jpy-fxvol | CONFIRMED | med | `scripts/basis-stress-jpychf/run.py:31` | Same | — |
| basis-stress-chf-fxvol | CONFIRMED | med | same | Same | — |

## Shared infrastructure

1. **`js/volBacktestEngine.js:112` `fetchD1Aligned`: defect.** The date is `new Date(c.time).toISOString().slice(0,10)`, which is the UTC date of the candle's start. With `{dailyAlignment: 0, alignmentTimezone: 'Europe/London'}`, every BST candle is labelled one day early, Sunday-stub candles are kept, and nothing filters weekends.
   - Callers in `analysis/` with London alignment: dispersion_study, yield_move_fx_range_study (this batch), plus crack_spread_study, four_golds_study and nonus_yields_study (other batches; flag them).
   - These scripts also fetch live, with no lockbox truncation.
2. **OI-book daily builder (DATA_SPEC §5 #11): known, open, confirmed to touch `zero-gamma-distance`.** Friday DR is 0.235. The verdict survives a Friday drop. The OI timing is still unfixed.
3. **Shipped range-forecast archive (`scripts/forecast_history/build.mjs` → `vf3_stage_b.py` / `forecast_fix.py`): sound.**
   - σ comes from `nyCloseDailyBars` with n≥60 and `endSec<=openSec` (`js/voteAtlasV4Lines.js:115-128`); sessions are `'Europe/London'`.
   - The NY-bar join is strictly before (`vf3_stage_b.py:80-81`).
   - S/SI betas and widths are refit per fold with a 5-session embargo. There are no full-sample benchmark betas, so it does not manufacture nulls for funding-forecast-error, one-range-forecast or meta-label-*-persist.
   - Caveat: `build.mjs` uses `loadM1ForPair`, which merges the R2 tail when credentials exist. The parquet ends 2026-08-20, so there was no leak here.
4. **HAR benchmark `forge/vol.py:217-243`: causal.** It is an expanding OLS with a causal smear.
5. **`js/harness/runStudy.mjs`: not used by any verdict in this batch.** rates-vol-gap and tff use their own scripts.
6. **Verdict-word drift is systemic.** Five entries (tag-x, exhaustion, one-range, meta-label-proper, rates-vol-gap-move) are banked NULL where the protocol's own rules give UNDERPOWERED, either because the cell could not reach its bar or because the test failed its sanity check. Downstream sessions read these NULLs as "tested and absent".
