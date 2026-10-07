# LIVE-RANGE-CONFLUENCE-BOOK — results

Pre-registration: `forge/LIVE_RANGE_CONFLUENCE_BOOK_PREREG.md` (+ Amendments 0, 1). 34 instruments, 2018-04 → 2026-08, 2,176 dates. **Moving** hourly lines: 198,719 passes (167,060 resolved races). **Static** morning lines: 249,322 passes (170,518 resolved). Passes re-arm after a close ≥ 0.15σ back inside the line.

## Part 0 — where and when the day moves after a pass (every pass, not just the first touch)

'continue' = reached the next line out before 22:00 (including a touch bar that already closed past it); 'fall back' = reached the level behind first; 'stall' = neither by 22:00. 'held' = the day's extreme on that side finished within 0.25σ beyond the line. MFE / MAE = best / worst excursion after the touch-bar close, σ. Minutes are from the touch.

| lines | class | rung | session | passes | continue | fall back | stall | held as day extreme | median MFE / MAE (σ) | median min to MFE | mean return +1h / to close (σ) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moving | fx_gold | p50 | Asia <07 | 14,451 | 36% | 63% | 1% | 20% | 0.66 / 0.67 | 470 | -0.004 / -0.009 |
| static | fx_gold | p50 | Asia <07 | 23,282 | 54% | 40% | 6% | 22% | 0.64 / 0.64 | 500 | -0.004 / -0.001 |
| moving | fx_gold | p50 | London 07-12 | 47,535 | 23% | 77% | 0% | 25% | 0.52 / 0.51 | 290 | +0.000 / +0.015 |
| static | fx_gold | p50 | London 07-12 | 39,264 | 49% | 37% | 14% | 26% | 0.52 / 0.52 | 292 | -0.002 / +0.009 |
| static | fx_gold | p50 | NY/late 16+ | 21,628 | 15% | 9% | 76% | 63% | 0.17 / 0.19 | 55 | -0.006 / -0.011 |
| moving | fx_gold | p50 | overlap 12-16 | 20,133 | 18% | 82% | 1% | 34% | 0.39 / 0.40 | 130 | +0.000 / -0.009 |
| static | fx_gold | p50 | overlap 12-16 | 40,382 | 39% | 27% | 34% | 35% | 0.37 / 0.38 | 115 | -0.002 / -0.000 |
| moving | fx_gold | p75 | Asia <07 | 1,494 | 50% | 49% | 1% | 15% | 0.79 / 0.85 | 350 | -0.031 / -0.149 |
| static | fx_gold | p75 | Asia <07 | 5,522 | 46% | 51% | 3% | 18% | 0.74 / 0.70 | 455 | +0.002 / +0.004 |
| moving | fx_gold | p75 | London 07-12 | 5,075 | 45% | 52% | 2% | 21% | 0.64 / 0.62 | 245 | +0.002 / +0.044 |
| static | fx_gold | p75 | London 07-12 | 14,635 | 43% | 48% | 9% | 23% | 0.57 / 0.53 | 285 | +0.007 / +0.036 |
| moving | fx_gold | p75 | NY/late 16+ | 13,407 | 13% | 86% | 1% | 53% | 0.23 / 0.24 | 95 | -0.006 / -0.012 |
| static | fx_gold | p75 | NY/late 16+ | 14,895 | 13% | 17% | 71% | 61% | 0.18 / 0.20 | 55 | -0.006 / -0.009 |
| moving | fx_gold | p75 | overlap 12-16 | 34,765 | 33% | 64% | 3% | 35% | 0.36 / 0.37 | 95 | -0.002 / -0.009 |
| static | fx_gold | p75 | overlap 12-16 | 23,316 | 33% | 40% | 27% | 33% | 0.39 / 0.39 | 115 | +0.004 / +0.005 |
| moving | fx_gold | p90 | Asia <07 | 440 | 56% | 43% | 1% | 15% | 0.90 / 1.08 | 200 | -0.026 / -0.293 |
| static | fx_gold | p90 | Asia <07 | 1,532 | 50% | 48% | 2% | 16% | 0.83 / 0.88 | 365 | -0.034 / -0.090 |
| moving | fx_gold | p90 | London 07-12 | 637 | 48% | 51% | 1% | 16% | 0.80 / 0.79 | 220 | +0.011 / +0.135 |
| static | fx_gold | p90 | London 07-12 | 4,261 | 48% | 44% | 8% | 21% | 0.65 / 0.61 | 265 | -0.003 / +0.064 |
| moving | fx_gold | p90 | NY/late 16+ | 20,757 | 45% | 49% | 6% | 65% | 0.16 / 0.20 | 45 | -0.014 / -0.029 |
| static | fx_gold | p90 | NY/late 16+ | 7,751 | 15% | 14% | 71% | 58% | 0.20 / 0.22 | 50 | -0.007 / -0.018 |
| moving | fx_gold | p90 | overlap 12-16 | 6,259 | 47% | 47% | 6% | 31% | 0.43 / 0.42 | 90 | -0.002 / -0.003 |
| static | fx_gold | p90 | overlap 12-16 | 9,394 | 36% | 36% | 28% | 31% | 0.43 / 0.43 | 105 | +0.001 / -0.011 |
| moving | indices | p50 | Asia <07 | 557 | 48% | 51% | 1% | 16% | 0.75 / 0.94 | 545 | +0.021 / -0.063 |
| static | indices | p50 | Asia <07 | 2,298 | 57% | 41% | 2% | 17% | 0.78 / 0.78 | 595 | +0.011 / -0.010 |
| moving | indices | p50 | London 07-12 | 6,422 | 27% | 72% | 1% | 25% | 0.56 / 0.61 | 280 | +0.005 / -0.021 |
| static | indices | p50 | London 07-12 | 6,646 | 51% | 40% | 9% | 24% | 0.57 / 0.59 | 315 | -0.000 / +0.006 |
| moving | indices | p50 | NY/late 16+ | 365 | 10% | 90% | 0% | 41% | 0.29 / 0.34 | 150 | -0.010 / -0.034 |
| static | indices | p50 | NY/late 16+ | 7,754 | 27% | 18% | 55% | 49% | 0.25 / 0.23 | 55 | +0.012 / +0.021 |
| moving | indices | p50 | overlap 12-16 | 8,911 | 25% | 74% | 1% | 30% | 0.44 / 0.45 | 145 | +0.000 / -0.007 |
| static | indices | p50 | overlap 12-16 | 9,437 | 45% | 36% | 19% | 29% | 0.46 / 0.48 | 135 | +0.002 / -0.011 |
| static | indices | p75 | Asia <07 | 451 | 40% | 59% | 1% | 21% | 0.85 / 1.09 | 510 | -0.042 / -0.157 |
| moving | indices | p75 | London 07-12 | 594 | 48% | 48% | 3% | 19% | 0.69 / 0.64 | 240 | +0.036 / +0.015 |
| static | indices | p75 | London 07-12 | 2,369 | 41% | 51% | 7% | 22% | 0.60 / 0.62 | 280 | +0.001 / -0.029 |
| moving | indices | p75 | NY/late 16+ | 7,492 | 25% | 72% | 3% | 47% | 0.27 / 0.26 | 80 | +0.003 / +0.009 |
| static | indices | p75 | NY/late 16+ | 5,174 | 19% | 24% | 56% | 48% | 0.25 / 0.24 | 50 | +0.003 / +0.002 |
| moving | indices | p75 | overlap 12-16 | 4,121 | 39% | 56% | 5% | 27% | 0.49 / 0.46 | 135 | +0.014 / +0.033 |
| static | indices | p75 | overlap 12-16 | 4,501 | 38% | 45% | 17% | 27% | 0.48 / 0.48 | 140 | +0.009 / +0.001 |
| static | indices | p90 | London 07-12 | 657 | 52% | 42% | 6% | 18% | 0.72 / 0.73 | 260 | +0.013 / -0.063 |
| moving | indices | p90 | NY/late 16+ | 4,624 | 43% | 42% | 15% | 60% | 0.18 / 0.17 | 30 | +0.017 / +0.038 |
| static | indices | p90 | NY/late 16+ | 2,455 | 21% | 19% | 60% | 49% | 0.25 / 0.25 | 50 | +0.008 / +0.012 |
| moving | indices | p90 | overlap 12-16 | 534 | 48% | 45% | 7% | 26% | 0.52 / 0.50 | 90 | -0.007 / +0.059 |
| static | indices | p90 | overlap 12-16 | 1,618 | 43% | 39% | 18% | 25% | 0.53 / 0.51 | 140 | +0.000 / +0.020 |

By touch number (all passes, moving lines): does a later pass behave differently?

| class | rung | pass # | passes | continue | fall back | held | mean return to close (σ) |
|---|---|---|---|---|---|---|---|
| fx_gold | p50 | 1 | 78,114 | 24% | 75% | 27% | +0.005 |
| fx_gold | p50 | 2 | 3,891 | 21% | 79% | 26% | -0.002 |
| fx_gold | p50 | 3+ | 114 | 24% | 76% | 26% | -0.116 |
| fx_gold | p75 | 1 | 50,801 | 30% | 68% | 38% | -0.008 |
| fx_gold | p75 | 2 | 3,785 | 29% | 69% | 34% | -0.013 |
| fx_gold | p75 | 3+ | 155 | 25% | 75% | 21% | -0.076 |
| fx_gold | p90 | 1 | 26,555 | 46% | 48% | 56% | -0.024 |
| fx_gold | p90 | 2 | 1,455 | 46% | 47% | 40% | -0.013 |
| fx_gold | p90 | 3+ | 83 | 54% | 42% | 36% | -0.073 |
| indices | p50 | 1 | 15,142 | 27% | 73% | 27% | -0.015 |
| indices | p50 | 2 | 1,059 | 22% | 77% | 30% | -0.011 |
| indices | p50 | 3+ | 54 | 26% | 72% | 26% | -0.071 |
| indices | p75 | 1 | 11,429 | 31% | 65% | 39% | +0.012 |
| indices | p75 | 2 | 798 | 32% | 65% | 33% | +0.058 |
| indices | p75 | 3+ | 44 | 43% | 55% | 27% | +0.333 |
| indices | p90 | 1 | 4,837 | 44% | 42% | 56% | +0.032 |
| indices | p90 | 2 | 357 | 41% | 46% | 44% | +0.087 |
| indices | p90 | 3+ | 46 | 35% | 52% | 50% | +0.082 |

When the day's extreme forms after a pass (moving lines, FX/gold): median minutes from touch to the extreme beyond the line, and its extent

| rung | session | passes | median minutes to the day's extreme | median extension beyond the line (σ) | 90th percentile extension |
|---|---|---|---|---|---|
| p50 | Asia <07 | 14,451 | 465 | 0.68 | 1.90 |
| p50 | London 07-12 | 47,535 | 290 | 0.53 | 1.47 |
| p50 | overlap 12-16 | 20,133 | 125 | 0.40 | 1.12 |
| p75 | Asia <07 | 1,494 | 282 | 0.88 | 2.45 |
| p75 | London 07-12 | 5,075 | 240 | 0.65 | 1.85 |
| p75 | overlap 12-16 | 34,765 | 95 | 0.37 | 1.10 |
| p75 | NY/late 16+ | 13,407 | 90 | 0.23 | 0.68 |
| p90 | Asia <07 | 440 | 160 | 1.02 | 2.92 |
| p90 | London 07-12 | 637 | 215 | 0.83 | 2.76 |
| p90 | overlap 12-16 | 6,259 | 85 | 0.43 | 1.31 |
| p90 | NY/late 16+ | 20,757 | 45 | 0.17 | 0.61 |

## T1 / T2 — which confluences move continue-vs-fade, and does the moving line unlock more?

Lift = excess continuation (race result minus the random-walk b÷(a+b) from the touch-bar close) with the confluence present minus absent (top vs bottom third for continuous ones). A *real* lift: date-block 95% interval excludes 0, same sign in both halves, ≥ 2pp, n ≥ 300 per side. *Unlocked*: the moving-line lift exceeds the static-line lift, interval above 0, in both halves.

Confluence × class × rung tests with enough passes: **204**. Real lift at MOVING lines: **12** (5.9%; chance ≈ 5%). Real at STATIC lines: **9** (4.4%). Unlocked by the moving line: **4**.

Real lifts at the moving lines (largest first):

| class | rung | confluence | passes (present) | lift moving [95%] | lift static [95%] | moving − static [95%] | unlocked |
|---|---|---|---|---|---|---|---|
| indices | p50 | rtjump | 364 | +5.5pp [+0.1, +11.0] | -2.7pp [-6.4, +1.0] | +8.2pp [+2.3, +14.1] | YES |
| indices | p90 | rtjump | 628 | -5.2pp [-9.8, -0.6] | -1.2pp [-7.5, +5.6] | +3.9pp [-2.9, +11.0] | no |
| indices | p90 | wtdiv | 666 | -4.1pp [-7.8, -0.1] | +2.4pp [-2.1, +7.1] | +6.5pp [+1.0, +12.1] | YES |
| indices | p75 | regime_ratio top third | 2,952 | -3.8pp [-6.9, -0.7] | +0.7pp [-3.2, +4.9] | +4.5pp [-0.1, +9.2] | no |
| fx_gold | p90 | session NY/late 16+ | 14,525 | -3.5pp [-5.4, -1.7] | +1.2pp [-2.2, +4.8] | +4.7pp [+1.1, +8.4] | YES |
| fx_gold | p90 | session overlap 12-16 | 5,487 | +3.2pp [+1.3, +5.2] | -1.0pp [-3.1, +1.3] | +4.3pp [+1.8, +6.7] | YES |
| fx_gold | p90 | regime_ratio top third | 7,382 | -3.0pp [-5.0, -1.0] | -3.3pp [-6.5, -0.2] | -0.4pp [-3.9, +3.1] | no |
| fx_gold | p90 | used top third | 4,883 | -2.7pp [-4.6, -0.7] | -3.4pp [-8.2, +2.0] | -0.7pp [-5.9, +4.9] | no |
| indices | p50 | weekday Wed | 2,797 | -2.6pp [-4.6, -0.5] | -1.5pp [-4.2, +1.4] | +1.2pp [-1.9, +4.2] | no |
| fx_gold | p90 | roc60 top third | 7,411 | +2.2pp [+0.3, +4.1] | -0.6pp [-2.7, +1.5] | +2.8pp [-0.0, +5.6] | no |
| fx_gold | p90 | weekday Thu | 4,689 | +2.1pp [+0.1, +4.2] | +3.1pp [-0.0, +6.6] | -1.0pp [-4.7, +2.6] | no |
| fx_gold | p90 | roc180 top third | 6,701 | +2.0pp [+0.3, +3.8] | -0.2pp [-2.6, +2.3] | +2.2pp [-0.4, +4.9] | no |

Real lifts at STATIC lines that are not real at the moving lines (so the moving line removes them):

- indices p75 L_val: static +7.5pp, moving -0.8pp
- fx_gold p90 L_pdL: static -6.8pp, moving +1.1pp
- fx_gold p90 weekday Mon: static -4.2pp, moving -1.8pp
- indices p75 used top third: static -4.0pp, moving +0.3pp
- fx_gold p50 L_pwH: static +2.7pp, moving -0.2pp
- fx_gold p90 wtdiv: static +2.6pp, moving -1.6pp
- indices p50 session overlap 12-16: static -2.3pp, moving -0.3pp
- fx_gold p75 session London 07-12: static +2.0pp, moving +0.9pp

First-touch-only check: moving: 186,878 first passes of 198,719; continuation excess vs random walk -0.58pp (all passes -0.63pp); static: 125,941 first passes of 249,322; continuation excess vs random walk +0.70pp (all passes +0.79pp).

## T3 — walk-forward meta-label (refit every quarter on prior passes only; trading from 2020-04)

Trade CONTINUE if the model's P(continue) > the random-walk share + 0.05, FADE if < − 0.05, else no trade. Net R after spread. 'vs random pick' = same trades, side chosen 50/50. AUC: model vs the geometry-only random-walk share b÷(a+b).

| lines | trades (share of passes) | continue share | net R per trade [95%] | vs random pick [95%] | years > 0 (2020-25) | AUC model vs geometry | verdict |
|---|---|---|---|---|---|---|---|
| moving (margin 0.05) | 18,119 (14.3%) | 43% | -0.207 [-0.374, -0.004] | -0.023 [-0.108, +0.081] | 1/6 | 0.736 vs 0.738 | fail |
| moving (top/bottom decile of P − RW) | 25,374 (20.0%) | 50% | -0.196 [-0.316, -0.050] | -0.024 [-0.085, +0.049] | 0/6 | 0.736 vs 0.738 | fail |
| static (margin 0.05) | 27,785 (21.9%) | 67% | -0.012 [-0.031, +0.008] | +0.049 [+0.032, +0.066] | 1/6 | 0.621 vs 0.627 | fail |
| static (top/bottom decile of P − RW) | 25,382 (20.0%) | 50% | -0.017 [-0.036, +0.003] | +0.046 [+0.031, +0.062] | 1/6 | 0.621 vs 0.627 | fail |

Where the meta-label model is most confident, by class and rung (moving lines): decision shares

| class | rung | passes | continue | fade | no trade |
|---|---|---|---|---|---|
| fx_gold | p50 | 54,293 | 4.6% | 4.8% | 90.6% |
| fx_gold | p75 | 34,891 | 5.8% | 6.1% | 88.1% |
| fx_gold | p90 | 15,744 | 4.1% | 29.2% | 66.8% |
| indices | p50 | 10,841 | 10.0% | 3.0% | 87.0% |
| indices | p75 | 8,287 | 13.9% | 3.7% | 82.4% |
| indices | p90 | 2,813 | 10.6% | 15.7% | 73.6% |

## T3b — single confluence rules chosen on the first 60% of dates, confirmed on the last 40%

- moving: 11 rules positive on train; positive on test 0; interval wholly > 0 on test: **0**; mean test net R of the selected rules -0.084 (train +0.185).
- static: 55 rules positive on train; positive on test 15; interval wholly > 0 on test: **2**; mean test net R of the selected rules -0.037 (train +0.058).