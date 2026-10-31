# Audit of the banked macro verdicts (61 entries, all recorded as null or underpowered)

Auditor stance: the write-up is a claim, not a fact. Each entry was traced from the doc to the script that produced the
number. The scripts were read, and where the data was local or cheap, the key number was re-run. Nothing in the repo
was modified. The work scripts are in `scratchpad/review/work_macro/`:

- `boot_sim.mjs` and `boot_circ.mjs`: coverage of the bootstrap helpers.
- `liq.py`: the macro-confluence liquidity leg as coded vs as registered.
- `ycoup.py`: re-run of the yield-coupling test.
- `aicrack.mjs`: re-score of ai-crack-metals.
- `fred/`: read-only FRED pulls.

No session after 2026-08-21 was scored, except where an entry's own sample already ran past that date (macro
confluence, funding).

**Counts per class:**

| Class | Count |
|---|---|
| CONFIRMED | 23 |
| BUG | 10 |
| DESIGN | 15 |
| SHALLOW-CHECK | 13 |
| NOT-REPRODUCIBLE | 0 |

Two entries draw their inputs from the live production API: rates-pivot-lead (`/api/ohlc-range`, a moving 360-day
window, unseeded bootstrap) and mv-dislocation-forward (`/api/drill-series`). They keep their class here, but their
exact numbers cannot be reproduced offline.

## Per-entry table

| id | class | conf. | evidence (file:line) | what it means | justified re-test |
|---|---|---|---|---|---|
| rates-pivot-lead | CONFIRMED | med | analysis/rates_pivot_lead_study.mjs:60-72 (pivot confirmed at i+REACH), 85-103 | Returns are measured from the confirmation bar, and the 2y CFD price low is taken as yields peaking, which is the correct sign. One small flaw: the control is the unsigned mean return, while the pooled and "rates high" cells are direction-signed, so their difference is biased by about −drift (≈0.003%/h). That is far inside the CI. Data comes from the live API window and the bootstrap uses `Math.random`, so it is not exactly reproducible. | none needed. To make it reproducible, freeze the M15 pull and seed the bootstrap. |
| dr-copper | CONFIRMED | high | analysis/dr_copper_study.mjs:47-57, 99-104 | The universal "every time" claim is falsified deterministically: 12 of 14 negative quarters had no ≥15% fall. The weaker "lift" form is correctly labelled untestable. | none |
| front-end-shock | DESIGN | med | analysis/market_sense_studies.mjs:46-71 (control matched on ATR quintile, outcome in ATR units), 181-199 | The test asks whether the next week is wider than an ATR-matched control. Matching on the current ATR absorbs the vol-persistence channel, which is the folk claim. The "any" CIs are EUR [−0.27,+0.10], JPY [−0.14,+0.31] and GBP [−0.22,+0.12]; all reach the +0.10 bar, so by the rule the word is UNDERPOWERED. The "use" text says a hawkish shock is followed by a *quieter week*, but only quieter relative to its own ATR was measured. | Raw forward realised range vs unconditional days (no ATR match), plus the ATR-matched version as "beyond persistence". |
| oil-to-breakevens | DESIGN | med | market_sense_studies.mjs:201-225 | The claim is conditional ("a *quiet* link will catch up"), but the test is unconditional: all oil ±10% days, whether breakevens already moved or not. Catch-up and reversal cases can cancel. The only non-overlapping cross-correlation (lag 20) is +0.09, which leans *toward* a lag. "If breakevens did not move, waiting will not bring them" was never tested. | Condition on oil20 ≥ 10% AND bei20 below its oil-implied value; then the forward BEI change vs control. |
| residual-reversion-fx | SHALLOW-CHECK | low | js/mve/validateInstrument.js:35-56 | The fair value is walk-forward (fit on bars before t). Scoring and pooling were not traced line by line. | — |
| price-vs-spread-divergence | DESIGN | high | market_sense_studies.mjs:479-528; output r20 CIs EUR [−1.21,+0.19], GBP [−0.86,+1.16], n = 44/51 | The code is sound: the bond-CFD price spread has the right sign. But both CIs include the +0.10 ATR bar, often by a lot, so per results-and-banking.md:50-53 this is UNDERPOWERED, not NULL. | Hourly or longer sample, or pool more pairs. |
| mv-dislocation-forward | BUG | high | analysis/outcome_loop.mjs:38-44 (`drawBlock(a, Math.min(10, n))`, non-circular) on 17 firings | The CI helper under-covers: 62% coverage at n = 17, block 10 (simulated). So [−0.11,+0.34] is too narrow and n = 17 is far below any power. The verdict word should be UNDERPOWERED. The same helper produced the "something survives" reads for vixterm, dispersion and creditstack (n = 9-14), which are likely false positives (out of batch). The data is a live-API bundle. | Re-score with an iid or circular event bootstrap. Bank as underpowered. |
| regime-divergence-fx | DESIGN | low | analysis/regime_pairs_study.mjs:16, 33-39 | The month-m regime label uses data published in m+1, and quarterly data is held from the quarter start, so the label carries lookahead. The bootstrap is iid over persistent monthly regimes. Both biases favour finding an effect, so the null survives them. But "differing growth/inflation labels" is a coarse proxy for "policy divergence". | Policy-rate-path divergence (2y differential change), point-in-time labels. |
| fear-gold | BUG | med | js/volBacktestEngine.js:104-113 (shared, see S1 below); analysis/four_golds_study.mjs:17-18, 23, 33 | (1) In BST, gold bars are labelled one day early and summer Fridays drop out of the VIX join. The window from `gold[i−1]` therefore excludes the spike day in summer but includes it in winter. (2) The bootstrap helper covers 78% at n = 58, so the headline "gold lagged −1.19% [−2.30,−0.48] at 20 sessions" is overstated. (3) The fear-window gold move (days i−5..i) is never measured. The 5-session null probably stands; the "lagged" claim does not. | Re-date the bars, use an iid event bootstrap, and add the same-window (spike-week) gold move. |
| crack-blowout-range | BUG | high | analysis/crack_spread_study.mjs:19-20 (bootstrap), 46-52 (BST join) | n = 24 events with block 20 gives about 45% coverage (simulated): the reported WTI +0.13 [−0.02,+0.16] is far too narrow and off-centre, and the honest CI is about ±0.3. The gold "hair narrower" [−0.09,−0.002] is an artefact. Summer-Friday blow-outs never match a bar. +0.13 ATR (12% wider) is economically real, so the word should be UNDERPOWERED. The FRED EIA spot series also lags about a week, so the signal is not live (bias toward finding). | Re-score with an iid event bootstrap and fixed dates. Bank as underpowered. |
| crack-disagreement-direction | DESIGN | med | crack_spread_study.mjs (C3 `nextUp`); MD files/CRACK_SPREAD.md ("a base rate, not a claim") | The prereg made C3 a base rate, which per the protocol is CONTEXT. 62% [48-75] on n = 45 cannot exclude a 10-15pp edge either way. | Bank as context. |
| nonus-yield-gap-range | BUG | high (mech) / med (verdict) | analysis/nonus_yields_study.mjs:44-48 (join on fetchD1Aligned London dates), 63 | In BST (about 58% of rows) the bar labelled D is London session D+1, so "next session" R[i+1] is D+2. Summer Fridays are dropped (n = 3,457 vs about 4,050 trading days). A real next-session effect is diluted, yet gilts are still +0.12 [−0.001,+0.25]. | Re-date the bars (use the London date) and re-run; the gilt cell may clear. |
| nonus-yield-gap-direction | BUG | high (mech) / med | nonus_yields_study.mjs:75 (`nextTextbook`) on the same mis-dated rows | Same mechanism: about 58% of "next-session" outcomes are two sessions later. Any 1-day effect is diluted by roughly half. | Re-run with corrected dates. |
| analogue-weeks | CONFIRMED | med | js/weekMap.js:109-130 | Walk-forward, the analogue pool is limited to outcomes known at t, and there is a random-week placebo. One caveat: a sign hit-rate against a 76%-up base rate is a weak statistic, but the size error was also scored. | none |
| spread-leads-fx-hours | CONFIRMED | med | analysis/lead_lag_studies.mjs:70-110 | Bond-CFD price spread with the correct sign; same-hour −0.30 is reproduced as the positive control; within-week shuffle placebo. Minor: "24h" is 24 shared rows, about 1.7 days given Bund hours. | none |
| yields-to-fx-direction | BUG | high (mech) / med (verdict) | analysis/yield_asset_coupling.py:81, 239 (`SIGNAL_LAG=1`), 136 (Yahoo UTC-normalise) | (1) The lag is over-applied. US indices and FX close after the 15:30 ET yield print, so lag 0 is already tradeable. Lag 1 skips the first post-signal day, so a 1-day lead was never tested. (2) Yahoo FX in GMT months is stamped 00:00 UTC and carries the previous day's close, so it is labelled one day late. Against FRED DEXUSEU, winter corr is 0.58 at shift −1 vs 0.36 as is, and summer is 0.72 as is. After fixing, same-day IC rises (USDJPY 0.255 → 0.336). Re-run (ycoup.py) with lag 0 and fixed dates: next-day SPX on Δ2y IC −0.036, NW t −2.99; NDX t −2.69; EURUSD t −2.07. That is not decisive among ~1,300 cells, but the banked "forward null" rests on a test that cut the most plausible lead. | Pre-register a 1-day-lead test, lag 0 for assets that close after the print, fixed FX dating, controlling the asset's own lag-1. |
| fx-factor-book-v2 | SHALLOW-CHECK | low | js/fxFactorV2.js | Word (underpowered) and the C3 flaw are already disclosed. Code not traced. | — |
| curve-inversion | DESIGN | med-high | analysis/curve_inversion_study.mjs:116-117, 209-210 (mirror), 160-171 | n = 10 episodes, so the 12-month equity CI is enormous: UNDERPOWERED, not NULL. The "mirror" (steepening above p80) is itself a recession-phase marker, since bull steepening comes as cuts start. It shares the effect, so "steepenings worse than inversions" cannot kill the curve signal. p80 is full-sample. | Bank as underpowered. Use a placebo that does not share the recession cycle (random dates, same month). |
| funding-stress | BUG | high | analysis/funding_stress_study.mjs:46, 73-77, 80 | S2 "SRF drawn" uses FRED RPONTSYD (temporary OMO). Verified: 667 positive days match exactly. Since 2021 those positives are mostly $1-2M operational tests (yearly median $0.001-0.002bn), and the 2018 positives predate the SRF. `episodes()` updates `last` on every positive day, so the near-daily tests of 2024-26 merge into one episode dated 2024-01-12. The real stress draws (2025-06-30 $11bn, 2025-10-31 $29bn, 2025-12-31 $31.5bn) are never events. The verdict is about test operations, and "SRF drawn 31% of sessions" misreads the series. | Threshold the draw size (e.g. ≥ $1bn) and de-cluster on episode starts. Too few events will likely make it underpowered. |
| dax-ifo-lookahead | CONFIRMED | high | scripts/dax-ifo-lookahead/check.py:83, 93-111 | Same-month lookahead reproduced; the release-day timing variants are proper. | none |
| macro-confluence-direction | BUG | high | analysis/macro_confluence_direction_study.mjs:77-93 | The liquidity leg is coded as the z of a 1-day change vs 24 daily changes on a forward-filled daily series. The prereg (MD files/MACRO_CONFLUENCE_DIRECTION_PREREG.md:49-51, liquidityGateEngine convention) defines it as the weekly change vs 24 periods. Reconstructed with FRED (liq.py): the coded sign agrees with the registered sign only 57% of days when both are non-flat, and it flips about 140 times a year (daily RRP noise). So "confluence" is curve + credit plus a coin. Banked underpowered, so the word survives, but the next run must fix the leg. | Fix the leg to weekly, then re-run all three. |
| macro-confluence-baa-credit | BUG | high | analysis/macro_confluence_baa_credit_study.mjs:70-84 | Same liquidity-leg defect; the 2026-10-24 re-run kept it. The NULL is about a mis-specified setup. | as above |
| macro-confluence-range | BUG | high | analysis/macro_confluence_range_study.mjs:68-82 | Same defect. The "narrower range" side-pattern is also built on it. | as above |
| yield-slope-magnitude | DESIGN | med | analysis/yield_slope_magnitude_study.mjs:8, 20-24 | A 60-day Yahoo window gives about 31 de-clustered days per pair, so per-pair CIs are about ±0.3. A 3-of-4 gate cannot be met at that power. The right word is UNDERPOWERED (EUR ρ 0.62). | Longer intraday yields. |
| ys-long-breadth | DESIGN | med | forge/YS_LONG_CONFIRM_PREREG.md:44-49; result +0.229% [−0.05,+0.49] | Same sign in all three pairs (PF 1.23-1.26). The CI includes the main book's effect, so this is UNDERPOWERED, not NULL. The "use" text concedes it. | none (word fix) |
| cog-spread-direction | SHALLOW-CHECK | low | scripts/cog_yield_dir/score.py | A 1-day lag on FRED daily spreads for an intraday decision is correct; walk-forward pick of 192. Not traced further. | — |
| rates-residual-catchup | CONFIRMED | med | scripts/rates_residual (S1) | Rolling beta fitted strictly before the day; well powered (b CI ±0.06). Only partly traced. | none |
| stir-residual-catchup | DESIGN | high | scripts/rates_residual/stir_study.py:118-125, 143-150 | R1 failed only the placebo rule. The placebo shifts the drivers, so the rolling beta is about 0 and I is about constant, and the coefficient on a near-constant regressor has exploding variance. The placebo 95th is unreachable by construction. The real b is +0.186 [+0.037,+0.342], positive on all 5 targets and both halves. The doc itself asks for a "scale-free placebo". The right word is UNDERPOWERED. | Placebo on the correlation or t of F on I, or on a standardised I. |
| stir-wide-scan | CONFIRMED | med | scripts/rates_residual/stir_wide_scan.py; forge/FED_PATH_LEAD_PREREG.md | Family-wise scramble bar, and the follow-up on untouched data gave t +1.43. | none |
| rate-diff-nq-leadlag | CONFIRMED | med | scripts/rate_diff_nq/leadlag*.py; DIAGNOSTIC_REVIEW.md | Explore/confirm; a DST and alignment review was already done. | none |
| stir-composite-nq | DESIGN | high | scripts/rate_diff_nq/composite_tests.py; entry text | (A) A planted 0.03-0.08 was undetectable, so A is UNDERPOWERED, as the doc itself says. (B) is a powered null. One NULL covers both. | Split into A = underpowered and B = null. |
| rate-curve-structure | CONFIRMED | med | scripts/rate_curve/curve_structure.py; bars15 label right (build_bars.py:11) | Nested OOS feature sets, day-block CIs. | none |
| cog-exact-pair-lead | DESIGN | med | scripts/rate_diff_nq/cog_exact_pair_lead.py:31-35 | Code is sound (hl2 per hour, label right, z by prior days). The power check shows ρ 0.03-0.08 is not detected, so the word should be UNDERPOWERED. | ≈ 1 more year of 1-min data |
| cog-video-claims | CONFIRMED | med | scripts/rate_diff_nq/cog_video_claims.py | All planted leads were detected, and the earlier one-bar lookahead was fixed before recording. | none |
| cog-trend-state | CONFIRMED | low | scripts/rate_diff_nq/cog_trend_state.py | Superseded by pinned-history. MDE 9-16pp. | none |
| cog-pinned-history | CONFIRMED | med | scripts/rate_diff_nq/cog_pinned_history.py:11-31 | Both sources are labelled right on start-stamped M1, which is consistent; the same-hour link reproduces. P1 is a clean null (MDE 0.049). P2 passed as registered but was demoted post-hoc (allowed); arguably CONTEXT. | none |
| rate-diff-xsmom | CONFIRMED | med | scripts/rate_xsmom | Carry control works; the scope (monthly OECD rates) is stated in the "use" text. | daily futures version, as the doc says |
| policy-direction-at-lines | CONFIRMED | med | scripts/policy_direction/score.py:72-110 | 2-business-day lag on 63-day momentum; DEXUSEU hold windows are non-overlapping. | none |
| rates-spread-asset-lead | CONFIRMED | low-med | scripts/dynlead/build_panels.py:100-108 (NY-close days), engine.py:94 (relationship shifted by h) | Timing is OK: every yield prints before the 17:00 NY asset close. Correction, placebo and five framings. Engine only partly traced. | none |
| cog-matched-pairs | SHALLOW-CHECK | low | scripts/rate_diff_nq/run_matched_pairs.py, cog_matched_pairs_* | not traced | — |
| cog-turn-sequence-model | SHALLOW-CHECK | low | scripts/rate_diff_nq/cog_sequence_events.py | not traced | — |
| cog-rate-futures-other-tests | SHALLOW-CHECK | low | scripts/rate_diff_nq/cog_meeting_path.py, cog_indicator_options.py | The text admits that the 5/20-day indicator windows are underpowered and the Asian cells untestable, so those cells should be UNDERPOWERED, not NULL. | split the word |
| credit-leads-equities | DESIGN | med | analysis/harness/credit_leads_equities.mjs:20-25 | The scored cells use Moody's seasoned IG spreads only. The one HY measure (ICE OAS, 3 years) gave widening → next-week vol IC +0.26 [+0.10,+0.39], p 0.002, both halves, flat placebo. "Never write that credit moves first" overreaches from IG to all credit. | HY with longer history (HYG/JNK from 2007, or ALFRED BAML vintages). |
| yield-ladder-eurusd | CONFIRMED | high | analysis/output/null-audit/yield-ladder-eurusd/AUDIT.md | Already audited; the word underpowered is right. | per that audit |
| yield-ladder-nq | CONFIRMED | med | scripts/yield-predictive-ladder/run.py (same ridge ladder) | Word is right. Note the lag-1 2y effect and that my lag-0 re-run (yields-to-fx-direction) gives SPX/NDX t ≈ −2.7 to −3.0. Consistent with "rates lag-1 rule" being the open question. | the shortlisted lag-1 forward record |
| spread-episodes-nq | CONFIRMED | low-med | scripts/spread-episodes | Placebos, MDE stated. Not fully traced. | none |
| spread-episodes-eurusd | CONFIRMED | med | scripts/spread-episodes | Entry the day after confirmation. The same-day corr is dampened by noon-fix vs 15:30 timing, but that is descriptive only. | none |
| ai-crack-metals | CONFIRMED | high | scripts/ai-crack-metals/run.mjs:58-89 | Re-scored from the saved data: 0.45 [−0.82,+1.86] (banked [−0.83,+1.89]). With an iid event bootstrap [−1.02,+1.85]; still below the 2.0 bar. | none |
| ai-crack-metals-silver | CONFIRMED | high | same | Re-scored −1.93 [−3.96,+0.19]; iid [−4.66,+0.81]; well below 3.5. | none |
| bank-credit-dollar-dxy | SHALLOW-CHECK | low | scripts/bank-credit-dollar | not traced; latest-vintage BIS (disclosed) | — |
| bank-credit-panel-equity | SHALLOW-CHECK | low | scripts/bank-credit-panel | not traced | — |
| bank-credit-panel-fx | SHALLOW-CHECK | low | scripts/bank-credit-panel | not traced | — |
| fx-dollar-funding-exposure-hit | SHALLOW-CHECK | low | scripts/fx-dollar-funding-exposure | not traced | — |
| fx-dollar-funding-exposure-follow | SHALLOW-CHECK | low | same | not traced | — |
| net-liquidity-tailwind-spx | CONFIRMED | med-high | scripts/net-liquidity-tailwind/run.py:44-85; plans/FEATURE_MANIFEST.json (fed_assets/fed_tga USD mn, rrp_on USD bn) | Units are right (fault #8 fixed), first-release vintages, asof ≤ Friday 21:00, 20-day forward. | none |
| net-liquidity-tailwind-nq | CONFIRMED | med-high | same | same | none |
| quarter-end-funding-spike | SHALLOW-CHECK | low | scripts/quarter-end-funding/run.py | not traced (n = 33, word underpowered plausible) | — |
| quarter-end-funding-usd | SHALLOW-CHECK | low | same | not traced | — |
| basis-stress-usd | DESIGN | med | scripts/basis-stress-rules/run.py:47-69; scripts/xccy-basis/build.py:1-24 | The claim is a tail event (a 20-30bp day), but the test is a full-sample linear r. The proxy (a futures-implied CIP basis from one hour of minutes, with one tick ≈ 5bp) fails its own positive control: same-day r with USD is +0.017. A null on a proxy that does not co-move with the dollar even on the same day says nothing about the claim. | First establish a same-day link, then an event test on the top 1% of moves. |
| basis-stress-jpy-usd | DESIGN | med | scripts/basis-stress-jpychf/run.py | same design | same |
| basis-stress-chf-usd | DESIGN | low | same | same; the word underpowered is already right | same |

## Shared-code findings

**S1. `fetchD1Aligned` mislabels every London-aligned daily bar during BST.** File: `js/volBacktestEngine.js:104-113`.

- **Mechanism.** The function labels each bar with `new Date(c.time).toISOString().slice(0,10)`, which is the UTC date
  of the bar's *start*. With `{dailyAlignment: 0, alignmentTimezone: 'Europe/London'}`, a BST session starts at 23:00
  UTC the previous day. So from late March to late October (~58% of rows):
  - every session is labelled one day early;
  - Monday's session is labelled Sunday;
  - no bar is ever labelled Friday.
- **The repo already knows this failure.** `server.js:13970` documents it ("in BST, the London-midnight bar lands on
  the prior UTC date and never matches") and fixes it locally with the +1-day evening rule. The shared helper never got
  that fix, and the data-rules docs (`references/loaders.md:15`) don't warn about it.
- **Corroboration.** nonus_yields.json has 3,457 rows where ~4,050 trading days were expected, and none of the ~15
  summer episode dates is a Friday.
- **Studies touched in this batch:** fear-gold, crack-blowout-range, nonus-yield-gap-range, nonus-yield-gap-direction.
  Every join of these bars to FRED or yield dates is a day off in summer.
- **Out of batch:** `analysis/dispersion_study.mjs:61` and `analysis/yield_move_fx_range_study.mjs:68` use the same
  call.

**S2. The copy-pasted event block bootstrap under-covers badly.** Code: `drawBlock`/`bootDiff`, non-circular, with
`Math.min(block, n)` on the event list.

- **Where it lives:**
  - `analysis/four_golds_study.mjs:17-18`
  - `analysis/crack_spread_study.mjs:19-20`
  - `analysis/outcome_loop.mjs:38-44`
  - `analysis/dispersion_study.mjs:19-20`
- **Simulated coverage of the nominal 95% CI** (Gaussian, true effect 0):

  | Events (n) | Block | Coverage |
  |---|---|---|
  | 17 | 10 | 62% |
  | 17 | 17 | 16% |
  | 24 | 20 | 45% |
  | 58 | 20 | 78% |

- **Effect.** Intervals are 30-90% too narrow. That produces spurious "real" cells, and it makes nulls look tighter
  than they are. A wider, correct interval then includes the pass bar, which means the word should be UNDERPOWERED.
- **Batch entries touched:** mv-dislocation-forward, crack-blowout-range, fear-gold.
- **Same harness, out of batch:** outcome_loop's "something survives" cells for vixterm, dispersion and creditstack,
  and dispersion_study.
- **Unaffected:** the circular version in ai-crack-metals (84% at n = 60, block 20; the re-score confirmed the
  verdict).

**S3. The Yahoo FX date rule is only half right.**

- `analysis/yield_asset_coupling.py:136` UTC-normalises Yahoo `=X` stamps. Summer stamps (23:00 UTC) belong to that
  date. Winter stamps (00:00 UTC) carry the *previous* day's close.
- This is shown empirically against FRED DEXUSEU:

  | Season | Shift −1 | Shift 0 (as is) |
  |---|---|---|
  | Winter | 0.58 | 0.36 |
  | Summer | −0.01 | 0.72 |

- DATA_SPEC fault #16 ("FX `=X` stamps belong to that UTC date") was checked on BST data only. The rule implemented in
  `scripts/market-review/fetch.py yahoo()` should be re-checked for GMT months.
- **Batch entry touched:** yields-to-fx-direction. Any other study that pulls Yahoo FX daily data has the same
  problem.

**S4. The interval-vs-bar rule was never applied retroactively.** The rule is that a CI including the pass bar means
UNDERPOWERED (results-and-banking.md:50-53). Ten entries still carry NULL with CIs or power checks that include the
bar:

- price-vs-spread-divergence
- front-end-shock
- crack-blowout-range
- mv-dislocation-forward
- curve-inversion
- yield-slope-magnitude
- ys-long-breadth
- stir-residual-catchup
- stir-composite-nq (A)
- cog-exact-pair-lead

Downstream, "null" is read as "it isn't there", and these pages then make strong "never write X" statements on
underpowered tests.

**S5. One liquidity-leg implementation sits under three verdicts.** The macro-confluence studies
(`analysis/macro_confluence_{direction,baa_credit,range}_study.mjs`, `rollingChangeZ` on a daily-indexed series) do
not implement the registered weekly 24-period z. The 2026-10-24 re-runs fixed the units and the date join but carried
this over.
