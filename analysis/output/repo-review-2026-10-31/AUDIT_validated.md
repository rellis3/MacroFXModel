# Audit of the 49 `validated` Evidence Book entries

Audited 2026-10-31 on the repo as it stands. No repo files were changed. Scratch work is in
`/tmp/claude-0/-home-user-MacroFXModel/7ea4abce-c1f1-5243-a82a-043dd4b3b942/scratchpad/review/work_validated/`.
Every recomputation was truncated at the lockbox (2026-08-21).

**What could be recomputed.** This sandbox has no local M1 cache, no OANDA key and no R2 key. Where a committed
panel or an event file existed, I recomputed:
- the FOMC event file;
- the VVIX ratio panel and the VIX beta panel;
- the Market View outcome loop, by replaying the page modules on the read-only `/api/drill-series` bundle,
  truncated to ≤ 2026-08-21.

Everything else was judged by reading the code.

## Counts

| class | n | ids |
|---|---|---|
| ROBUST | 8 | vol-curve-front, us-extras-confirm, extreme-in-probability, iv-forecast, range-ladder-placebo-confirm, forecast-miss-shock-idx, forecast-miss-shock-fx, forecast-miss-month-end-fx |
| PLAUSIBLE | 17 | vix-inversion, positioning-into-release-direction, cot-crowding-p5, first-hour-fraction, fast-start-rest-of-day, iv-over-rv-wider, breadth-all-down, band-reach-from-here, horizon-reversion, combined-range, iv-ladder, forecast-persistence-fix, forecast-pick, vmc-nq-cipher-sequencing, basis-yearend-premium, drawdown-forecast-error-fx, drawdown-forecast-error-idx |
| FRAGILE | 10 | surprise-size, nq-down-week, post-fomc-usd-drift, gex-range-es, ladder-calibration, vmc-nq-cipher-volatility, vix-second-derivative, vix-ratio-vx-futures, vix-beta-change, vvix-ratio-range |
| BUG | 3 | mv-vixterm-range, mv-dispersion-range, dispersion-reset |
| NOT-REPRODUCIBLE | 2 | execution-gate, reversal-hour |
| SHALLOW-CHECK | 9 | tape-speed-persistence, event-impact-map, cross-iv, intraday-range, line-touch-reach, rule-a-portfolio-second-book, iv-ladder-gold, vol-target, basis-yearend-chf (all lean PLAUSIBLE) |

## The main findings

### 1. BUG: the block bootstrap returns the same sample every time when there are few events

The function is `drawBlock` in `analysis/outcome_loop.mjs:38-42`, and the same copy sits in
`analysis/dispersion_study.mjs:19-20`.

**What goes wrong.** The event arm is resampled with `block = min(10, n)`.
- With n ≤ 10 events there is exactly one start position (`n − block + 1 = 1`), so every replicate is the original
  sample. The event side then contributes **zero** variance to the interval.
- Checked in `work_validated/drawblock_demo.mjs`:
  - n = 7 and n = 9 give 1 distinct bootstrap mean in 1,000 replicates;
  - n = 14 gives 25.
- For the D2 arm sizes (n = 26–31) the event-side SE is 0.68–0.73 of the true SE (`drawblock_var.mjs`).

**Effect on mv-vixterm-range and mv-dispersion-range.** These rest on 14 and 9 firings. Their halves have 7 firings
each, so the "holds in both halves" intervals are degenerate too.

I re-ran the harness itself on the bundle cut at the lockbox (`outcome_loop_audit.mjs`), adding a firing-level
bootstrap. Firings are at least 20 sessions apart, so each firing is its own cluster. The bundle now starts in
2020-11, so the firings differ somewhat from the banked run:

| cell | firings | difference | firing-level 95% CI | t |
|---|---|---|---|---|
| vixterm SPX | 10 | +0.33 | [−0.02, +0.70] | 1.8 |
| vixterm NQ | 10 | +0.08 | [−0.28, +0.43] | 0.5 |
| dispersion SPX | 8 | +0.47 | [−0.03, +1.01] | 1.7 |
| dispersion NQ | 8 | +0.53 | [−0.07, +1.06] | 1.8 |

All four intervals cross zero. The Aug-2024 firing alone has a ratio of 3.28. The registry deflation gives
mv-dispersion-range p = 1.6e-11. That number is an artefact of this bug.

**Two more weaknesses in the outcome loop.** The controls are "every session ≥ 20 away from any firing"
(`outcome_loop.mjs:106-107`), which is exactly the calm-period control that stats-defaults warns about. The bundle is
also revised FRED data, not point-in-time.

**Out of batch.** `analysis/four_golds_study.mjs` and `analysis/crack_spread_study.mjs` carry the same `drawBlock`.

### 2. VVIX / VIX family: the Holm passes are knife-edge

- **vvix-ratio-range.**
  - Newey–West t −3.07 and −3.15.
  - Holm-24 needs |t| ≥ 3.08 at its first step. The cell clears it only through the Holm step-down, by a margin of
    0.00003 in p.
  - My 63- and 126-session block bootstrap of the same regression gives t −2.6 and −2.8, which fails Holm-24.
  - Mean on flag days by year is mixed in sign.
- **vix-beta-change.**
  - t 3.00 against a Holm-16 bar of 2.95. My block bootstrap gives t 2.9–3.0.
  - Discover period +0.09.
  - 2022 is −1.28.
- **Three sibling preregs on one panel, one day.** VVIX ratio (24 cells), VIX beta (16) and VIX calculus (46) were all
  registered on 2026-10-23, each with its own Holm.
  - vix-second-derivative already fails Holm-46 by its own amendment (`forge/VIX_CALCULUS_PREREG.md:308`).
  - vix-ratio-vx-futures reuses the same flags and dates, so it is not independent.
- **Forward record.** `analysis/output/vix-signals-forward/record.json` has scored 0 events.

### 3. surprise-size does not test its own claim

`analysis/market_sense_studies.mjs:308` compares top-|z| releases and all releases against **non-release** days. It
never compares big surprises against small ones.
- The large effect is the release-day effect, which is real.
- "Bigger surprise means wider" is only eyeballed by comparing two cells against each other.
- There are 67 scored cells and 25 passes, with no multiplicity correction.
- The cells were re-run after the surprise scale was changed (09-19), and they shifted.

### 4. Post-hoc choices that promoted a result

- **nq-down-week.** The banked cell, "growth down, any rates", is a post-hoc cut (`MD files/GROWTH_VS_YIELDS_TEST.md:71-77`).
- **ladder-calibration.** Amendment 2 switched to NY-close bars after the first run had failed arm A2, and the rerun
  passed it (`forge/LADDER_CALIBRATION_PREREG.md:82-93`). The switch fixes a real fault. Even so, a post-results
  amendment promoted the arm, and the target bar was not met.
- **post-fomc-usd-drift.** Registered after the +26bp had been seen. The harness run on 2022 and later gives t 1.11
  (`MD files/POST_FOMC_HOLD_HARNESS_TEST.md:56-70`).
- **dispersion-reset.** The claim text is the story that was falsified, yet the entry is banked as `validated`.

### 5. Other

- **vol-curve-front, naive SEs.** The logistic regression pools NQ and SPX rows from the same date, with naive SEs
  (`analysis/surfaces/vol_curve_front.py:117-128`). The real z is smaller than +5.4 to +6.0. It survives because
  front dear/calm held on the untouched 2014–15 years in us-extras-confirm.
- **iv-forecast baseline.** Its HAR baseline is built on UTC D1 bars with Sunday stubs, DATA_SPEC fault 1
  (`oi_research_book/scripts/15_iv_forecast_test.py:25-35`). That likely flatters IV's margin.
- **vix-inversion, live use.** The live chip fires on every inverted day (`js/rangePressure.js:32`), but the test
  scored only the first day of an inversion.
- **range-ladder-placebo-confirm sessions.** It was scored on UTC-day sessions
  (`scripts/range-ladder-placebo-confirm/run.mjs:64`). The live range line moved to London midnight on 2026-10-24.

## Per-entry table

| id | class | conf | evidence file:line | meaning | used live? | what would firm it up |
|---|---|---|---|---|---|---|
| vix-inversion | PLAUSIBLE | med | analysis/market_sense_studies.mjs:137-152 (first day only; R1 n=39 unscored, MARKET_SENSE_TESTS.md:355); :46-70 ATR-quintile control is coarse | wider week after the first inversion day; 86 events, ATR-matched; partly vol clustering | yes: rangePressure.js:32 (fires every inverted day, not just the first), deskWatch, claimWatch | score the every-day version; add a day-0 range control; date-cluster across the 4 instruments |
| surprise-size | FRAGILE | high | market_sense_studies.mjs:298-308: no top-vs-low comparison; 67 cells, no correction; re-run after rescale | release days are wider (true); "size matters" untested | impactMatrix, deskWatch, atlas.html | a regression of range on \|z\| within release days, by family, with Holm |
| nq-down-week | FRAGILE | med | GROWTH_VS_YIELDS_TEST.md:71-77 (post-hoc cut banked) | leverage effect; the sign held OOS as a feature in us-extras-confirm | rangePressure.js:40, deskWatch | a prereg on held-out years; already partly covered by drawdown-forecast-error |
| event-impact-map | SHALLOW-CHECK | med | EVENT_RESPONSE_BOOK.md §join proof (descriptive medians) | a description, not a test; should be CONTEXT | impactMatrix | relabel as context |
| post-fomc-usd-drift | FRAGILE | med | POST_FOMC_DRIFT_TEST.md (registered after the peek); POST_FOMC_HOLD_HARNESS_TEST.md:56-70 OOS t 1.11; recomputed t 2.5, 2020 not driving it | +26bp/event in-sample; OOS weak | rates.html, flow-chain.html (base-rate text) | the pre-registered forward record (~30 events) |
| positioning-into-release-direction | PLAUSIBLE | med | scripts/positioning-into-release/run.py:74 (COT T+6, correct), :121-150 (week-cluster) | +0.064 ATR against the crowd; sound; in-sample, small; first half +0.029 | feedCoverage only | the registered 2008-17 holdout |
| cot-crowding-p5 | PLAUSIBLE | med | COT_CROWDING_PROGRAMME_PREREG.md:177-181 gate; RESULTS.md:85-110 | holdout pass, t≈3.4, but discovery +0.07, 3-yr blocks uneven, expectation opposite | cotState.js | a forward record |
| tape-speed-persistence | SHALLOW-CHECK | med | APPROACH_SPEED_CONTROL_TEST.md (design); params build not read | intraday vol clustering (textbook) | tapeSpeedEngine (shipped) | a split-sample check of the params |
| execution-gate | NOT-REPRODUCIBLE | high | only "memory project_execution_feasibility_gate"; no script found | — | marketLessons | commit the 30-cell grid |
| reversal-hour | NOT-REPRODUCIBLE | high | memory only; REGISTRY_DEFLATION says "no interval reported" | — | chapterSpec | rebuild with a session-clustered CI |
| mv-vixterm-range | BUG | high | analysis/outcome_loop.mjs:38-42 (degenerate bootstrap), :106-107 (calm controls) | rerun CI [−0.02, +0.70] SPX, [−0.28, +0.43] NQ | dataCatalogue/chapterSpec | rerun with a firing-level bootstrap and matched controls |
| mv-dispersion-range | BUG | high | same; rerun SPX CI [−0.03, +1.01], NQ [−0.07, +1.06]; 8-9 firings | not established | yes: rangePressure.js:42 | as above, plus a forward record |
| first-hour-fraction | PLAUSIBLE | high | technical_range_studies.mjs:31-61 (London clock, correct) | a description | no id use | — |
| fast-start-rest-of-day | PLAUSIBLE | med | TECHNICAL_RANGE_TESTS.md:52-66 (registered primary was mechanical; after-09:00 cell banked) | intraday vol clustering | no | a prereg on the after-09:00 cell, London 2022+ |
| iv-over-rv-wider | PLAUSIBLE | low | market_sense_studies.mjs:593-608; 88 events; SPX next-5 null; R1 CIs touch 0 | VRP / realised catch-up | impactMatrix, claimWatch | an OOS window |
| breadth-all-down | PLAUSIBLE | high | market_sense_studies.mjs:610-629; output n=1002, 4/4 pass | leverage effect; sign held OOS in us-extras-confirm | globalReadCore, claimWatch | — |
| dispersion-reset | BUG | med | analysis/dispersion_study.mjs:19-20 (event-arm SE ×0.68 at n=26); calm controls; claim text falsified | D2a "calmer" CIs (−0.005, −0.008 upper) would not clear | claimWatch | rerun with an iid event bootstrap; fix the claim text |
| band-reach-from-here | PLAUSIBLE | high | TECHNICAL_RANGE_TESTS.md:115-188 (trailing-250 bands) | a conditional description; a random walk gives the same lift | feedCoverage | compare against a random-walk lift |
| gex-range-es | FRAGILE | med | 27_gex_range_es.py:105-110 (D+2, correct); deskEvidence.js:734 (gamma part t 2.05 after controls) | mostly the leverage effect; same state as NQ | optionZone, atlas | gamma beyond the shipped SPX lines (its own prereg) |
| vol-curve-front | ROBUST | med | analysis/surfaces/vol_curve_front.py:117-128 (naive logit SE, NQ+SPX pooled) | strongest index width input; OOS-confirmed on 2014-15 | rangePressure.js:35 | date-clustered z |
| horizon-reversion | PLAUSIBLE | high | HORIZON_REVERSION_PREREG.md:44-59 (60/40, train-only fit) | vol mean reversion; no CI, overlapping windows | feedCoverage | date-block CI |
| combined-range | PLAUSIBLE | high | forge/run_combined_range.py:49-55 (as-of strictly before), :160-163 (gate = prereg) | IV carries it | IV-adjusted export | forward scorecard |
| cross-iv | SHALLOW-CHECK | med | CROSS_IV_PREREG.md:44-56 | 15/15, one split, no CI | IV-adjusted export | date-block CI |
| us-extras-confirm | ROBUST | med | forge/run_us_extras_confirm.py:55-62 (as-of before); untouched 2014-15 | a true confirmation; 2 years, 3 correlated indices | IV-adjusted export | add a CI |
| intraday-range | SHALLOW-CHECK | med | forge/run_intraday_range.py:36 (London) | late gains are mechanical | live-range.html | — |
| line-touch-reach | SHALLOW-CHECK | med | prereg only | a calibration check | no | — |
| rule-a-portfolio-second-book | SHALLOW-CHECK | med | prereg/result text | correlation ≈ 0 (4-week block) | decision-lab.html | forward records together |
| extreme-in-probability | ROBUST | med | LIVE_RANGE_SHADOW_PREREG.md:9-16 (quarterly prior-only refit) | calibrated geometry | live-range-shadow.html | — |
| iv-ladder-gold | SHALLOW-CHECK | med | forge/run_vol_iv.py:36-47 (strictly-before merge) | +2.6%, guard by 0.1pp | impliedMove.js | forward |
| iv-ladder | PLAUSIBLE | med | forge/run_vol_iv.py:36-47, folds :67-80 | 5/7; superseded | — | — |
| ladder-calibration | FRAGILE | med | LADDER_CALIBRATION_PREREG.md:82-93 (post-result switch flipped A2 to pass); one test year; target not met | — | shadow only | lockbox evaluation |
| vol-target | SHALLOW-CHECK | high | text only | mechanical | — | — |
| iv-forecast | ROBUST | med | 15_iv_forecast_test.py:66-80 (expanding OOS), :119 NW 21; :25-35 stub-day HAR baseline | IV forecasts RV (literature + 3 later studies) | impliedMove.js | rerun on NY-close bars |
| forecast-persistence-fix | PLAUSIBLE | high | scripts/forecast_history/forecast_fix.py:100-139 (walk-forward, embargo, date-block) | sound; same period as the pick | — | forward scorecard |
| forecast-pick | PLAUSIBLE | high | forecast_pick.py (same infrastructure) | the line set | Daily Plan lines | forward scorecard (its stated second test) |
| range-ladder-placebo-confirm | ROBUST | med | run.mjs:135-142 (date-block, all instruments of a date together); :64 UTC-day sessions | edges are a location; coin-flip economics | context | re-score on London sessions |
| vmc-nq-cipher-volatility | FRAGILE | high | deskEvidence.js:1248 (absorbed by price + calendar features) | baseline lacked recent range | no | none (closed) |
| vmc-nq-cipher-sequencing | PLAUSIBLE | med | VMC prereg :129 (shuffle gate) | real, tiny, no consequence | no | — |
| vix-second-derivative | FRAGILE | med | VIX_CALCULUS_PREREG.md:308 (fails Holm-46; t 2.42 with controls) | — | fearVsNasdaq/atlas | forward record (0 scored) |
| vix-ratio-vx-futures | FRAGILE | med | same flags as vvix-ratio-range; t −2.44/−2.90, Holm-2 | not independent | research-log | costed prereg plus forward record |
| vix-beta-change | FRAGILE | med | t 3.00 vs Holm-16 bar 2.95; block bootstrap t 2.9; discover +0.09 | knife-edge direction claim | fearVsNasdaq/atlas | forward record |
| vvix-ratio-range | FRAGILE | med | run.py Holm on NW t; my block bootstrap t −2.6/−2.8 fails Holm-24 | VIX mean reversion beyond controls, marginal | fearVsNasdaq/atlas | forward record |
| basis-yearend-premium | PLAUSIBLE | high | scripts/basis-stress-rules/run.py:90-102 (per-contract, pairs averaged) | known seasonal; ~0 since 2024 | — | — |
| basis-yearend-chf | SHALLOW-CHECK | med | prereg/result only | as above | — | — |
| drawdown-forecast-error-fx | PLAUSIBLE | high | scripts/drawdown-forecast-error/run.py:22-46 (as-of, date-level, 21-session blocks, shift placebo) | leverage effect vs the forecast | rangePressure.js:38 | shadow forward record |
| drawdown-forecast-error-idx | PLAUSIBLE | high | same | same | no | same |
| forecast-miss-shock-idx | ROBUST | med | FORECAST_MISS_SCAN_PREREG.md:3 (BH discovery, then untouched confirmation half) | — | shadow from 10-28 | forward 120 sessions |
| forecast-miss-shock-fx | ROBUST | med | same; 5 cells are one factor; shadow edges are full-sample | — | feedCoverage | forward |
| forecast-miss-month-end-fx | ROBUST | med | same; event-free check holds | the prior was null | — | forward |

## The short list

These are the validated results I would build a system on, ranked:

1. **forecast-pick and forecast-persistence-fix.** The daily line set: walk-forward, embargoed, with date-block
   intervals and identical rows across arms. The weakness is that the pick was made on the same years. The forward
   scorecard is the remaining test.
2. **IV as the σ input** (iv-forecast, combined-range, cross-iv, iv-ladder). Four designs agree, and the literature
   agrees. Re-run iv-forecast on NY-close bars.
3. **VIX-curve width terms** (us-extras-confirm, vol-curve-front). The only genuine untouched-years confirmation in
   the batch. Fix vol-curve-front's naive z.
4. **The stress and month-end overlay** (forecast-miss-shock-fx/idx, forecast-miss-month-end-fx, plus
   drawdown-forecast-error as the parent). Proper discovery and confirmation halves, date-level 21-session blocks, a
   shift placebo, and a shadow already running. Use it only as a multiplier on the lines, after the 120-session
   forward read.
5. **extreme-in-probability.** Walk-forward and calibrated in every decile. A take-profit read, not a signal.
6. **horizon-reversion.** Textbook vol mean reversion for the weekly and monthly lines. It needs a CI.

Do not build on any of these:
- the Market View outcome loop (mv-*), BUG;
- dispersion-reset, BUG;
- the C.OG VIX family: knife-edge Holm, zero forward events;
- surprise-size, which does not test its claim;
- the two memory-only entries.
