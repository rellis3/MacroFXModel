# Audit: price-domain null / underpowered verdicts (47 entries)

Audited 2026-10-31 against the code, not the write-ups. No repo files were modified. M1 is not local
(`VolRangeForecaster/data/m1` is absent), so most numbers could not be re-run. Where artifacts were local, I re-ran
or spot-checked them:
- residual-pca: I re-ran the engine on the committed panel.
- overnight-hold: I re-derived from `honest_trades_*.csv`.
- day-recon: I recomputed the path mix from the archive parquet.

Counts: CONFIRMED 34 · BUG 1 · DESIGN 5 · SHALLOW-CHECK 7 · NOT-REPRODUCIBLE 0.
"CONFIRMED (low)" means I read the core path but not every downstream step.

| id | class | conf | evidence file:line | what it means | justified re-test |
|---|---|---|---|---|---|
| driver-roundtrip | **BUG** | med | `analysis/roundtrip_study.mjs:121-124` (`followBack(lb, e.ex)` indexes the LEG's bars with the DRIVER's bar indices `peakI`/`endI`); `:50` (session key = UTC date of t-1h, i.e. a fixed 01:00 UTC boundary, labelled "London-midnight"); `:79` vs header `:12-14` (round trips end at the return bar, controls at session end, so the windows are not of equal length) | Joining across instruments by array index instead of by timestamp misaligns the legs wherever bar counts differ (crude/index CFD halts vs 24h FX, missing quiet M15 bars). That attenuates co-movement toward zero, which is the direction of a false null. Unequal signal and control windows confound H3. The verdict word is also wrong: the record's own text says UNDERPOWERED (26-30 events), and the bond leg was never tested | Timestamp join, London-midnight sessions, equal windows (control ends at the matched elapsed time), longer history (M15 to 2016), add the US 2Y/10Y and Bund CFDs |
| breadth-narrowing | CONFIRMED | med | `analysis/breadth_narrowing_study.mjs:66,106-114`; `js/marketScan.js:251-257` (z uses history ≤ i) | Causal, de-clustered, mirror (BROAD) control. N=35, so direction is closer to underpowered (±2%) than null; the record states the CIs | — |
| rotation-extreme | **DESIGN** | med | `analysis/market_sense_studies.mjs:314-322` | The claim is "rotation extreme **under a quiet index**". The setup takes every top-decile \|rel20\| day; no quiet-index condition is applied (the ATR-quintile matching only matches controls). The decile threshold is full-sample. The conditional effect was never isolated | Restrict setups to NAS100 ATR-rank bottom two quintiles (or 20d realised vol below median); same paired control |
| approach-speed | CONFIRMED | med | `analysis/approach_speed_control_study.mjs:129,180-196,240-270` | London sessions; identical outcome function for touches and pseudo-levels; control speed quintiles use touch cut points. The finding (dwell is a tape-speed property) is supported | — |
| level-touch | CONFIRMED | med | `analysis/output/null-audit/level-touch/AUDIT.md` (independent re-implementation matched 396,538 touches; plant detected) | Relies on the 2026-10-24 five-check audit. The corrected record matches what the code tested. Not re-run here (no M1) | — |
| vwap-extension-fade | SHALLOW-CHECK | low | doc is a memory note (`project_vwap_extension_phase2`) not present in this environment; `MD files/GOLD_VWAP_FIXED_SIGMA_FINDINGS.md:248-279` | The gross snap-back is real (doc). The "null" is about after-cost tradeability on the timeframes tried. I did not trace the engines | — |
| daily-band-fade | CONFIRMED | med | `js/bandFade/bandFade.js:65-93` | Weekends folded. σ[t] includes the return at t, which is known at the decision close, so there is no lookahead. Shuffled null and random-entry control | — |
| zone-engine | **DESIGN** | med | `js/deskEvidence.js:427` result text; backing memory note absent | The record itself says the 8-pip stop "tripled stop-outs against a ~46-pip structure". The test of "zones are entries" was run with a mis-sized stop, so the use line "do not resurrect it with a new stop" overreaches | One structure-scaled stop (e.g. 1× zone width) with costs, OOS split |
| trend-following-fx | SHALLOW-CHECK | low | `js/trendBasketEngine.js` exists; the "independent rebuild" is not located; memory note absent | The chain cannot be traced in-repo | — |
| mv-extreme-forward | **DESIGN** | high | `analysis/outcome_loop.mjs:22` (MIN_FIRINGS 8), `:37-43` (block-10 bootstrap on n=15), `:146-149` (NULL = "no CI excludes 0") | 15 firings with range CIs reaching +0.40/+0.44 is UNDERPOWERED, not NULL. The claim ("something follows") is broader than what was tested: SPX/NQ abs-return proxy plus SPX direction for one finding kind | Relabel UNDERPOWERED; re-test with calibrated thresholds over the long Yahoo history |
| narrow-day-expansion | CONFIRMED | med | `analysis/technical_range_studies.mjs:33-75,127-145` | London sessions; outcome on today's ATR (known at close); control matched by ATR quintile and trend tercile. NR7 "narrower" is vol clustering, which is the answer | — |
| opening-range-break | **DESIGN** | med | `analysis/technical_range_studies_b2.mjs:48-60,103-118` | Only hit-rates are reported. "Extends 0.5×OR before back inside" (24-32%) has no random-walk baseline, so it cannot be read as low or high. Prereg item (c) (matched range test) is not implemented. The null rests on close-beyond at 50-52%, a hit-rate that cannot see an asymmetric-payoff edge | Signed (close − break close)/ATR and a fixed-stop expectancy, net of cost, week-block CI; simulated RW baseline for the follow-through rate |
| month-end-rebalance | CONFIRMED | med | `analysis/lead_lag_studies.mjs:127-150` | MTD ends where the last-3 window starts; no overlap; quintiles; random-3-session base | — |
| ou-bands-fx-crosses | SHALLOW-CHECK | low | `js/ouPairsEngine.js` (not traced) | UNDERPOWERED by its own 30-trade floor; the label is consistent | — |
| overnight-hold-nq | CONFIRMED | high | `scripts/overnight-hold/honest.py:46-70`; re-derived from `honest_trades_nq.csv` | 1,947/1,949 entries at 20:00 London, exits 14:30. No Friday entries, so 1 rollover is right. Mid gross minus half-spread at each end. Net mean 0.0335% reproduces | — |
| overnight-hold-gold | CONFIRMED | high | same; `honest_trades_gold.csv` | Net 0.0223%, spread 0.0225%; Wednesday ×3 financing applied | — |
| breadth-tilt-semis | SHALLOW-CHECK | low | `analysis/breadth_tilt_semis_study.mjs` (same harness as breadth-narrowing, not read line by line) | — | — |
| live-range-line-race | CONFIRMED | med | `forge/live_range_replay.py:54-160` (lines from bars < hour start; touch in [k,k2); same-bar = code 3) | Causal replay; a distance-matched placebo was also run | — |
| live-range-book | CONFIRMED | med | `forge/run_live_range_book.py:82-85,112-114` | R formulas correct. 37,974 of 233,592 (16%) pre-resolved, both-in-bar or unresolved touches are dropped (logged, not silent). Under the race geometry this cannot manufacture a null | Optional: mark unresolved at 22:00 instead of dropping |
| live-range-walkforward | CONFIRMED | low | `forge/run_live_range_wf.py` + shared replay | Same infrastructure; prior-only refits | — |
| live-range-confluence-book | CONFIRMED | low | `forge/run_live_range_confluence.py` + shared replay | The record already notes the unresolved-drop flattering | — |
| rule-a-pre2020 | CONFIRMED | med | `scripts/rule-a-pre2020/run.py:40-64,96-133`; `scripts/backtest/build_line_backtest.py:66-82` (stop wins ties) | Lines fitted on 2020-26 only; previous CVOL print; FX top-third threshold over 2016-22 (stated) | — |
| rule-a-portfolio-budget | CONFIRMED | low | `scripts/rule-a-portfolio/run.py:109-126` (corr on `P.index < y0`) | Walk-forward clean; UNDERPOWERED is fair | — |
| rule-a-late-entry | CONFIRMED | med | `scripts/rule-a-late-entry/run.py:59-81` | Next-bar-open entry, pessimistic ties, 2× spread, pre-10:00 breaks excluded | — |
| vol-asia-fib-confluence | CONFIRMED | med | `scripts/confluence/vol_asia_fib_build.py:44-58,87-110`; **minor**: `:63` `default_rng(abs(hash(sym)) % 2**32)`, Python str hash is salted per process | Design sound (dense grid, shifted-grid placebo). The placebo grids are not reproducible run to run, which does not change the verdict | Set the seed from a fixed string hash |
| live-range-break-linestate | CONFIRMED | low | record: M1 exit sim reproduces the stored outcomes on 95.8% | Not traced beyond the replay | — |
| qmr-direction-vs-geometry | CONFIRMED | med | `server.js:11143-11156,11231-11250` (identical walk, paired d) | Symmetric arms. See the shared-code note on `_qmrWalkTrade` ignoring eodHour (the default NQ eodHour is 20, so unaffected) | — |
| v4-dirtag | CONFIRMED | med | `scripts/v4/eurusd_dirtag_build.mjs:93-111,115-131` (future-scramble self-check) | Correct. **Lockbox:** `TO='2026-09-28'` (`:14`), so it scored sessions now inside H-A | — |
| v4-stage1 | CONFIRMED | med | `scripts/v4/eurusd_stage1_score.py:9-14,28-38` | Ambiguous = −1 for both arms (pre-registered); selection vs shuffled-outcome chance. Same lockbox note (`eurusd_stage1_build.mjs:16`) | — |
| v4-stage0 | CONFIRMED | med | `scripts/v4/stage0_touches.mjs:25-38`; `stage0_score.py:28` | Symmetric barriers around the level; ambiguous scored −1 for both fade and follow (about 0.1% of touches, negligible). No date cap on an R2-merged load (`:18-22`) | — |
| range-ladder-placebo | **DESIGN** | med | `scripts/range-ladder-placebo/run.mjs:66` (UTC-00:00 sessions, mirroring the pre-2026-10-24 book); `:186-190` (C1 gate) | Recorded "underpowered", but MDE is 0.136 pp and the effect +0.91 [0.82, 1.01]. "No verdict" came from a placebo-vs-placebo exactness gate (−0.09 pp) on 2M touches. It also tested the old UTC-dated ladder, not the London-midnight one the book now trades. Already superseded by `range-ladder-placebo-confirm` (validated) | Relabel; if reused, re-run on the London-dated ladder |
| day-recon-approach-path | CONFIRMED | med | `scripts/day-reconstruction/build_archive.mjs:77-170` (PIT folds, k-1 extremes, self-test `:232-268`); `m5_*` | Archive reproduces: fixed p50 next-rung-first 44-46%, back-to-open 29-40%, neither 16-24% (my recompute from `*_touches.parquet`) | — |
| day-recon-path-book-behaviour | CONFIRMED | med | `scripts/day-reconstruction/m7_analysis.py:100-170` (independent first-hit algorithm `:93-101`, build checks) | Categories and ties (U) handled explicitly | — |
| day-recon-path-book-expectancy | CONFIRMED | med | `m7_analysis.py:174-187` | Fade b/a, continue a/b, U = −1 both, unresolved marked at close; hurdle 2c/a | — |
| vmc-nq-cipher-direction | CONFIRMED | med | `scripts/vmc-nq-cipher/vmcds.py:47-57` (HTF by t_close), `s0_dataset.py:181-215` (divergence stamped at pivot+REACH) | Lookahead guarded; lockbox loader guarded | — |
| vmc-nq-cipher-interaction | CONFIRMED | low | same | — | — |
| vmc-nq-vol-decomposition | SHALLOW-CHECK | low | `scripts/vmc-nq-vol-increment/` not traced | — | — |
| vmc-nq-vol-increment | SHALLOW-CHECK | low | same | Skill > 0 but under the 1% materiality bar; NULL by prereg materiality | — |
| vmc-nq-vol-transition | SHALLOW-CHECK | low | same | — | — |
| day-recon-reach-forecast-specific | CONFIRMED | med | `phantom_touches.mjs:20-31` (same bars, scaled rungs); `m7_analysis.py:32` W_B2 quadratic extrapolation | Phantom race geometry a/b is scale-invariant, so the placebo is fair | — |
| day-recon-reach-range-used | CONFIRMED | low | shared archive | — | — |
| day-recon-reach-approach | CONFIRMED | low | shared archive | UNDERPOWERED fair | — |
| dip-with-bias | CONFIRMED | med | `scripts/dip_bias/build.mjs:17-21,36-71` | Bias trade open strictly before the session; stop wins on the fill bar; PIT σ | — |
| cog-setups-direction | CONFIRMED | med | `scripts/cog_setups/build.py:21-60`; minor: `volatilityExhaustion/vol_exhaustion_lib.py:83-99` keeps Sunday stubs (≥6 bars) as days in `hv_sigma` and `t20` | σ level is absorbed by the calibrated his/ours scale; t20 is about 17 trading days. Not verdict-changing | — |
| garin-vix-intraday-oos | CONFIRMED | med | `scripts/vix-calculus/intraday.py:14-45` | VIX 5m and index M1 both stamped at bar start, aligned to the same close instants; causal norm | — |
| residual-pca-wide10 | CONFIRMED | high | `scripts/residual-pca-family/engine.py:77-121` | **Re-run:** K=2, n=2108, IC +0.0075 (matches) | — |
| residual-pca-idx6 | CONFIRMED | high | same, lag 2 | **Re-run:** n=2540, IC +0.0109 (matches) | — |

## Shared code

1. **`js/forecastAnalyser.js` `bucketM1IntoSessions` (default 22).** Every JS caller in this batch passes
   `'Europe/London'`, except `scripts/range-ladder-placebo/run.mjs:66` (boundary 0, deliberate per its amendment A1,
   mirroring the pre-fix book). No false-null traced to it.
2. **`js/volBacktestM1Engine.js` `loadM1ForPair` (R2 tail merge).** Several scripts have no date cap, or cap past the
   lockbox: v4 `eurusd_dirtag_build.mjs:14` and `eurusd_stage1_build.mjs:16` (`TO 2026-09-28`), `stage0_touches.mjs`,
   `dip_bias/build.mjs`, and the live `fetchD1` studies (market_sense, lead_lag). When they ran with credentials, H-A
   sessions after 2026-08-21 were scored. This contaminates the holdout; it does not change the verdicts. Most predate
   the 2026-10-06 lockbox protocol.
3. **`server.js:10816` `_qmrWalkTrade(bars, dir, entry, stopPctEff, tpPct)` drops its 6th argument.** Every caller
   (`:11032, 11117, 11145, 11162, 11189`) passes `{...QMR_TIMING, eodHour}`, but the exit hour is always
   `QMR_TIMING.eodHour` (20 UTC). Any QMR run with a non-default `eodHour` silently uses 20:
   - per-instrument configs (the comment at `:10921` intends a different hour for metals);
   - the walk-forward `?eodHour=` (`:16244-16262`).

   The banked qmr-direction verdict (NQ, default 20) is unaffected. Check other QMR verdicts outside this batch.
4. **`scripts/backtest/build_line_backtest.py` `simulate` (rule-a ×3).** Correct: stop wins ties, entry at next-bar
   open, time exit at the last close.
5. **`scripts/day-reconstruction/build_archive.mjs` + `phantom_touches.mjs` (6 verdicts).** Sound. The archive
   reproduces the reported path mix.
6. **`forge/live_range_replay.py` (5 verdicts).** Causal. Downstream books drop the 16% of touches that are unresolved
   or both-in-bar. The drop is logged, and under the race geometry it cannot manufacture a null.
7. **Cross-instrument index join** (`analysis/roundtrip_study.mjs:121-124`). Not shared code, but it is the
   failure-mode pattern to grep for in other multi-asset studies.
