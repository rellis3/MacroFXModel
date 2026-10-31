# Audit of banked null/underpowered verdicts: positioning, events, execution, misc (53 entries)

Auditor stance: the recorded verdict is a claim under audit. No repo files modified. Scratch scripts:
`/tmp/claude-0/-home-user-MacroFXModel/7ea4abce-c1f1-5243-a82a-043dd4b3b942/scratchpad/review/work_other/`
(`rpca_fix.py`, `er_r0.py`, `news_dedup.py`, `griv_nq.py`, `fiscal_ctrl.py` (could not run: FF csv not local)).
Every re-run below is exploratory (not pre-registered) and used only local data dated on or before 2026-08-21.

Counts: CONFIRMED 37 · BUG 5 · DESIGN 7 · NOT-REPRODUCIBLE 1 · SHALLOW-CHECK 3.

## Top findings

1. **residual-pca-cot: BUG that changes the verdict.** `scripts/residual-pca-family/tags.py:98-108` reads
   `analysis/output/cot-crowding-programme/cot_weekly.csv`. In that file, JPY, CAD and CHF are already flipped into
   USD/xxx pair terms (`scripts/cot-crowding-programme/fetch_cot.py:79-80`; JPY net share in mid-2024 is +0.24 to
   +0.32, meaning long USDJPY). The fx8 universe, however, is in currency-strength terms (`tags.py:33`, JPY = −USDJPY).
   So "aligned with the crowd" (A3) and the mirror (M3) are swapped for JPY, CAD and CHF. CAD is tagged on 45% of
   days. Re-run with the sign fixed (`rpca_fix.py`): D_full goes from +0.003 (z 0.14) to **+0.044 (z 2.07)**. IS is
   +0.030 and OOS +0.057, and the mirror turns negative (−0.028 / −0.041). JPY +0.154, CAD +0.055, CHF +0.059. The
   docstring also says "non-commercial", but the CSV is leveraged funds / managed money.
2. **squeeze-fuel: BUG.** `analysis/squeeze_vol_study.mjs:101` takes the "07:00 UTC" anchor as the first bar with
   `getUTCHours() >= 7` inside a London-date session from `bucketM1IntoSessions(...,'Europe/London')` (line 94). In
   BST the session starts at 23:00 UTC, so the anchor is bar 0 (23:00 UTC the evening before). The bucketing was
   confirmed to be London-dated at the run commit 48fe637c. For about 7 months a year, the "next 24h" outcome and the
   5-day momentum control therefore start 8 hours before the 07:00 snapshot they are meant to follow. GBP has 18
   setups and JPY 90, so the "≥3 of 4 instruments" bar was nearly unreachable.
3. **priced-in (S6): BUG.** `analysis/market_sense_studies.mjs:267`: `pre = |us2y(decision day) − us2y(t−20)|`.
   FRED DGS2 for the decision date is that day's close, so the "prior repricing" includes the decision's own 2Y move.
   Surprise days therefore land in the high-repricing tercile with large day-0 ranges, which biases against
   "priced in". Use `rows[r.i-1].us2y`.
4. **gamma-real-iv: BUG + DESIGN.** `oi_research_book/scripts/16_real_iv_gamma.py:93` pairs OI(D) with the next bar
   of `15_iv_forecast_test.py:26` `load_d1`, which is UTC D1 with Sunday stubs. That is OI(D) → session D+1 (not yet
   public), and Friday → Sunday stub: DATA_SPEC §5 #11, not listed there as touching this test. G1 tested only the
   flip regime, although the claim says "flip **or net GEX**". G2's NQ out-of-sample n is 26. Exploratory
   (`griv_nq.py`): on NQ, real-IV `net_gex<0` → New York-close session D+2, vol-controlled log range **+0.24 (t≈2.9)**,
   consistent with gex-range.
5. **cot-positioning-factor: DESIGN, verdict word.** The banked p of 0.094 used a bootstrap over date-sorted rows,
   which resamples neighbouring instruments (`analysis/cot_factor/factor_test.py:127,137`). The harness reproduction
   with week clusters (`analysis/output/harness/cot-positioning-factor-harness.json`) gives IC **−0.057
   [−0.117, +0.004]**, p 0.066, both halves negative, fade P&L OOS Sharpe 0.39 (7/9 years). The CI does not rule out
   an economically meaningful fade, so this is UNDERPOWERED, not NULL. The "use" text ("the test says it does not")
   overclaims. (The harness reproduction also runs to 2026-09-15, which is past the lockbox.)

## Per-entry table

| id | class | conf | evidence file:line | meaning | justified re-test |
|---|---|---|---|---|---|
| priced-in | BUG | high | analysis/market_sense_studies.mjs:267 | lead-up window includes the decision-day 2Y move | recompute pre on t−21..t−1 |
| crowded-bond-short-fomc | DESIGN | med | market_sense_studies.mjs:433 (d30_5 from decision-day close) | outcome excludes the day-0 reaction where a squeeze would start; positioning = Tuesday report not yet released (fine as a mechanism test, not as a signal) | add d−1 close → d+5 window |
| priced-in-direction | DESIGN | med | analysis/event_response/confirm_cell.mjs:33-48 | the registered cell is R1 (after +30 min). On R0 the interaction is t=3.24 as run and t=3.92 deduped, but fragile: halves −0.75/+2.87, trimming 2% gives t 1.73, carried by core CPI. N=511 rows = 309 events (NFP day counted up to 3×). Families differ from the prereg (wage, UR in; CPI y/y, ISM, PPI out). The "use" text generalises beyond R1 | registered R0 interaction, deduped, outlier-robust |
| cb-tone-direction | CONFIRMED | med | analysis/fomc_event_study/stage1_event_study.py:59-60,111 | zoneinfo ET correct. Note: R1 starts 14:30, so it contains the press conference | none needed |
| squeeze-fuel | BUG | high | analysis/squeeze_vol_study.mjs:101 (+94) | 07:00 anchor is 23:00 UTC in BST; outcome straddles the snapshot | re-run with London-hour or epoch anchor (books ndjson not local) |
| cot-positioning-factor | DESIGN | high | factor_test.py:127,137; harness json | CI includes a meaningful fade; should read UNDERPOWERED | prereg fade with week-cluster inference on unseen period |
| positioning-into-release-range | CONFIRMED | med | scripts/positioning-into-release/run.py:74,104-112 | usable = report+6; vdec full-sample deciles used only as match keys; CI ±0.037 tight | — |
| cot-crowding-p1/p2/p3/p4/p6/p7/p8/p9/p10 | CONFIRMED | med | scripts/cot-crowding-programme/panel.py:125-134,243-257; phase23.py:219-230 | prior-only ranks, release-Friday pricing, flips consistent (COT and 6J/6C/6S both inverted), NULL/UNDERPOWERED rule applied correctly. Minor: SHUTDOWNS (panel.py:120) omits the 2013 shutdown (≈6 reports/market priced 2-3 weeks early); Yahoo front-month roll gaps in the commodity holdout | optional: add 2013 to SHUTDOWNS |
| cot-crowding-s0-r12/s0-adv/slope-r12/slope-adv/asym-r12/asym-adv | CONFIRMED | med | phase_spectrum.py:22-62,118-147 | joint bootstrap correct; S0-r12 CI excludes 0 but discovery and halves disagree → UNDERPOWERED is right | — |
| cot-crowding-a1/a2/a3/a4 | CONFIRMED | med | phase4_prep.py:49-54; phase4_trend.mjs:41-58 | state used from the day after release; rules alter 0.6-4.5% of days; Sharpe CIs ±0.04 | — |
| cot-crowding-va1/va2 | CONFIRMED | med | phase4_voteatlas.py:42-63 | release 15:30 ET strictly before entry; pair-terms crowd consistent | — |
| conviction-vote | NOT-REPRODUCIBLE | high | js/deskEvidence.js:451 (doc = a memory file) | no repo doc, no N or CI; "anti-predictive" banked as null. A grader exists (scripts/grade_backtestsystem_journal.py) but needs journal data | re-grade from the journal |
| oi-max-pain | BUG | high | oi_research_book/scripts/10_real_maxpain_test.py:44-79; 01_build_daily_dataset.py:87-92,138 | tests next-day return over all days on a DTE≤45 aggregate (not "pin into expiry"); spot = CFD without basis (#12); UTC D1 target with OI(D)→D+1 (#11); EUR only. The entry's "spot basis verified" is contradicted by DATA_SPEC #12 | per-expiry max pain, last N days to expiry, basis-corrected, D+2 |
| nowcast-gap-cpi | DESIGN | med | analysis/nowcast_studies.mjs:67,80 | 23/43 decisive calls, CI 39-68%, cannot exclude 60%+: UNDERPOWERED (the MAE comparison is fine) | — (needs more history) |
| news-asymmetry | DESIGN | med | analysis/news_asymmetry_study.py:43-52 | 656 rows = 400 events; NFP day in 3 families, and 73/101 have conflicting surprise signs (same move labelled both good and bad). Deduped: Δ −0.079 [−0.25, +0.09], still excludes +0.25, but "well powered" is overstated | one row per release, joint surprise |
| gex-range | CONFIRMED | med | oi_research_book/scripts/27_gex_range_es.py:103-112 (D+2 assert) | timing correct. Still built on 01 (NQ futures−CFD basis ~+100 pts, #12) | fresh prereg as the entry states, with basis |
| fiscal-reaction-uk-size | CONFIRMED | med | scripts/fiscal-event-reaction/score.mjs:105 | MDE 1.48×, CI 0.72-1.76 → UNDERPOWERED correct | — |
| fiscal-reaction-us-size | DESIGN | low | scripts/fiscal-event-reaction/fetch_prices.mjs:28-35 | controls = prior 8 Wednesdays with no screen for 08:30 CPI/retail/PPI days, which inflates the control median | controls excluding US data days |
| fiscal-reaction-uk-direction | CONFIRMED | med | score.mjs:98-99 | 13 < 15 floor | — |
| fiscal-reaction-us-direction | CONFIRMED | med | score.mjs:96-108 | 52/75 zero coupon changes; the narrow claim is answered | — |
| event-layer | CONFIRMED | med | forge/export_event_layer_params.py:46-68; export_iv_adjusted_params.py:71-75 | London-date sessions via london_date; FF UTC date vs London date differs only for late releases | — |
| gamma-real-iv | BUG | high | 16_real_iv_gamma.py:93; 15_iv_forecast_test.py:26 | UTC D1 stubs plus OI(D)→D+1; flip-only G1; NQ G2 n=26 | NY-close sessions, D+2, net-GEX arm |
| wall-placebo | CONFIRMED | high | analysis/output/null-audit/wall-placebo/AUDIT.md | already audited 2026-10-24 (basis plus swap fixed, null holds) | — |
| gamma-regime-trades-fx | CONFIRMED | med | scripts/forecast_history/gamma_regime_trades.py:49-58 | regime from OI ≤ D−2 business days (honest); fills and stop ordering conservative; −0.081R CI excludes 0 | — |
| gamma-regime-trades | CONFIRMED | med | same | NQ regime from the 01 builder with ~100 pt basis (#12) may relabel days near the flip; every arm negative | basis-corrected regime |
| vol-crush-drift | DESIGN | med | scripts/forecast_history/vol_crush_drift.py:117-124 | rule calls NULL when |D|<0.075 even though the CI [−0.23, +0.28] contains the +0.15 bar (n=63) → UNDERPOWERED | — |
| nq-continuation-execution | SHALLOW-CHECK | low | scripts/day-reconstruction/m4_nq_execution.py:4-5,146 | header read only; net CI excludes 0 | — |
| line-touch-limit-unseen | SHALLOW-CHECK | low | scripts/line-touch-limit-unseen/run.py | not read in depth; strongly negative net | — |
| range-edge-limit-fade | CONFIRMED | med | scripts/range-edge-limit-fade/run.mjs:64-92 | limit fills through the far quote; stop on ask/bid; fill bar stop-only | — |
| rate-surprise-eurusd | CONFIRMED | med | scripts/rate-surprise-events/run.py:52-75 | entry after the window, ET handled; planted-effect and power scripts exist | — |
| rate-surprise-nq | CONFIRMED | med | same | link sign uses data before the event day | — |
| basis-yearend-jpy | CONFIRMED | med | scripts/basis-stress-jpychf/run.py:38-41,66-74 | 10 vs 32 contracts → UNDERPOWERED correct | — |
| daily-open-fib-retest | SHALLOW-CHECK | low | scripts/daily-open-fib-retest/engine.py:7; score.py:10-16 | anchor and bid/ask sides look right; not traced fully | — |
| residual-pca-news | CONFIRMED | low | scripts/residual-pca-family/tags.py:69-81 | tag on t or t−1 covers the UTC/NY offset | — |
| residual-pca-monthend | CONFIRMED | low | tags.py:84-88 | last panel row of the month | — |
| residual-pca-cot | BUG | high | tags.py:98-108 (+ fetch_cot.py:79-80) | crowd sign inverted for JPY/CAD/CHF; fixed D z=2.07 | re-run the registered T3 with the fix plus placebo |

## Shared-code defects (most valuable)

1. **Pair-terms COT CSV consumed in currency terms.** `analysis/output/cot-crowding-programme/cot_weekly.csv` is in
   USD/xxx terms for JPY/CAD/CHF, and nothing in the file says so. Consumers: the cot-crowding scripts (consistent:
   prices are also inverted) and `scripts/residual-pca-family/tags.py` (wrong). Touches: residual-pca-cot. Fix: add
   a `terms` column or document it in the CSV header.
2. **OI research book timing and basis** (`01_build_daily_dataset.py`, plus `15_iv_forecast_test.load_d1` UTC D1
   reused by `16_real_iv_gamma.py`). Faults #11 and #12 also reach **gamma-real-iv** and **oi-max-pain**, which
   DATA_SPEC §5 #11 does not list. Through basis only, they also touch gex-range and gamma-regime-trades.
3. **`backfill/event_response_events.json` family overlap.** NFP releases appear in three US families with
   different z, and 73/101 have conflicting signs. Pooling by family-row double-counts events: priced-in-direction
   (511 rows / 309 events) and news-asymmetry (656 / 400).
4. **UTC-hour anchoring inside London-date sessions** (`getUTCHours() >= H` on `bucketM1IntoSessions(...,'Europe/London')`).
   A grep found only `analysis/squeeze_vol_study.mjs`, but the idiom is a trap worth a faults-log line.
5. **COT shutdown lists omit the Oct-2013 delay** (`panel.py:120`; `positioning-into-release/run.py:31`). The effect
   is small: a few reports per market treated as known 2-3 weeks early.
6. **Verdict-word rules** in several scripts (vol_crush_drift.py:122, nowcast_studies.mjs:67, factor_test pass logic)
   call NULL when the CI still contains the pre-set effect. Those entries should read UNDERPOWERED.
