# Day reconstruction M7: post-touch path book at the forecast levels (results)

**Register id:** `day-recon-path-book`.
- **Prereg:** `forge/DAY_RECON_PATH_BOOK_PREREG.md`, frozen `2291306d` with its features-only stage 1, under
  `forge/DAY_RECON_PATH_BOOK_DECISION_RULES.md` (frozen `d7ce9e06`).
- **Code:** `scripts/day-reconstruction/m7_analysis.py` (`33b04f00`; side-sign fix `39c78e6b`, see §6), `m7_tables.py`.
- **Run:** one completed run, B = 2000, seed 20261030, 247 s.
- **Files:**
  - every cell: `TABLES.md`, `t1_cells.csv` (78 rows) and `t2_cells.csv` (300 rows);
  - raw: `results.json` (also holds quartiles, 90th percentiles and every interval);
  - checks: `build_checks.json`.

**What this is.** Behaviour after a first touch of a forecast p50/p75 level, the per-touch reference-race EV, and the
comparison with B2-weighted phantom ladders. Point-in-time era 2020-08-21 → 2026-08-20; 2016–20 as the sign check.
GOLD, NQ, EURUSD; Fixed OH/OL and Projected H/L separate. **EV is a behavioural reference-race statistic, not a
strategy return**; the hurdle is a materiality bar, not a cost model. The lockbox was not accessed.

## 1. Decision under the frozen rules

| | Result |
|---|---|
| **T1** (78 category-share cells, BH q < 0.10) | **0 triggered.** 0 BH-significant (smallest p 0.002 against a first BH threshold of 0.0013). 64 **ruled out** (interval within ±5pp); 14 **underpowered**; 0 "inconclusive — material effect remains" |
| **T2** (220 in-family tests, BH q < 0.10) | **0 triggered; 0 market-wide context.** 0 BH-significant (smallest p 0.008 against 0.00045). 139 **ruled out** (EV_fc upper bound < hurdle and/or ΔEV upper bound < +0.05R); 81 **underpowered** |
| T2 descriptive (80 tests, < 150 touches) | 23 ruled out, 57 underpowered |
| **M8** | **Not triggered.** No validation plan is needed; the lockbox stays sealed |
| **R7 hard stop** | **Applies.** "No tested effect met the pre-registered evidence standard." The direction programme on the existing production ladder closes and goes to synthesis. This is not a claim that no effect can exist (§5) |

Nominal significance is close to chance:
- T2: 9 of 220 in-family tests have p < 0.05, against about 11 expected by chance.
- T1: 8 of 78 have p < 0.05, against about 4 expected, so slightly more than chance. None survives BH, and six of the
  eight are within the ±5pp band anyway.

## 2. What price does after a touch (behaviour)

**Category shares, forecast (B2 placebo), %** (ordered touches; U = 0 in every forecast cell):

| Cell | n | 1 direct | 2 pullback-cont | 3 reversal-recovery | 4a failed, held | 4b failed, deep | 5a stalled | 5b unresolved, moving |
|---|---|---|---|---|---|---|---|---|
| GOLD fixed p50 | 1,568 | 30.7 (29.8) | 14.8 (14.7) | 4.5 (4.9) | — | 28.3 (28.8) | 3.6 (3.9) | 18.1 (17.9) |
| GOLD fixed p75 | 783 | 23.2 (24.4) | 10.1 (10.3) | 7.7 (6.1) | 20.1 (18.8) | 14.9 (13.9) | 4.7 (4.3) | 19.3 (22.1) |
| GOLD proj p50 | 839 | 28.1 (27.6) | 14.4 (13.6) | 3.6 (3.4) | — | 17.2 (15.5) | 6.6 (9.1) | 30.2 (30.8) |
| GOLD proj p75 | 429 | 24.0 (23.7) | 6.3 (6.5) | 7.0 (4.4) | 24.2 (22.5) | 10.0 (9.5) | 8.2 (8.3) | 20.3 (25.2) |
| NQ fixed p50 | 1,547 | 32.8 (31.3) | 12.1 (13.6) | 6.1 (6.0) | — | 29.0 (29.3) | 4.5 (4.4) | 15.6 (15.5) |
| NQ fixed p75 | 797 | 28.2 (28.3) | 5.3 (7.8) | 5.1 (4.5) | 20.7 (17.5) | 14.3 (13.6) | 7.5 (9.4) | 18.8 (19.0) |
| NQ proj p50 | 883 | 27.4 (29.2) | 10.4 (10.2) | 2.9 (3.1) | — | 19.9 (18.7) | 9.7 (9.7) | 29.6 (29.2) |
| NQ proj p75 | 415 | 23.4 (20.8) | 6.0 (7.5) | 5.3 (6.0) | 21.2 (19.4) | 6.3 (7.6) | 13.3 (12.2) | 24.6 (26.5) |
| EURUSD fixed p50 | 1,504 | 31.5 (32.4) | 13.2 (13.3) | 4.9 (4.7) | — | 26.7 (26.3) | 3.4 (3.5) | 20.4 (19.8) |
| EURUSD fixed p75 | 759 | 23.7 (23.3) | 8.2 (10.2) | 5.0 (4.9) | 23.8 (22.8) | 12.1 (11.9) | 5.1 (6.2) | 22.0 (20.5) |
| EURUSD proj p50 | 778 | 27.5 (28.5) | 15.3 (13.2) | 2.2 (2.7) | — | 12.6 (15.2) | 6.8 (7.1) | 35.6 (33.3) |
| EURUSD proj p75 | 387 | 25.1 (23.7) | 8.8 (9.3) | 7.2 (7.5) | 23.3 (24.6) | 8.8 (7.5) | 8.3 (10.8) | 18.6 (16.6) |

**Reading:**
- **The same picture appears on all three instruments.** After a p50 touch:
  - about 44–45% of touches reach the next rung first (categories 1 + 2; two thirds of these directly);
  - about 32–35% reach the previous reference first (3 + 4b), and about one in six or seven of those (4.5–6.1 points) come
    back to the next rung the same day;
  - about 20–25% resolve neither by 22:00.

  Projected levels leave more unresolved (37–42% at p50), because they are touched later.
- **The forecast and placebo columns sit on top of each other.** Every difference is within ±5pp, and nearly all within
  ±3pp.
- **These shares are not directional information.** The next rung is about 0.44–0.63σ ahead and the previous reference
  0.48–1.11σ behind, so "next rung first" is what distance alone produces (§3). The break-even column shows this cell by
  cell.

**Excursions and times** (forecast, medians in σ, point-in-time; the B2 placebo is within a few hundredths throughout,
`TABLES.md`):

| Category (fixed p50, three instruments) | Further travel | Retrace before decision | Time to next rung |
|---|---|---|---|
| 1 direct continuation | 0.89–0.95 | 0.08–0.10 | 77–94 min |
| 2 pullback then continuation | 0.76–0.92 | 0.36–0.38 | 268–308 min |
| 3 reversal then recovery | 0.78–0.90 | 0.55–0.58 | 401–444 min (previous reference after 134–202) |
| 4b failed, deep | 0.17–0.19 | 0.55–0.59 | — (open reached after 140–221 min) |

- **By race outcome** (fixed p50):
  - winning continuation races had a median adverse excursion of 0.12–0.15σ before winning;
  - losing ones had a median favourable excursion of 0.13–0.15σ before losing.

  The fade is the mirror image. Winners and losers look alike in their first 0.15σ.
- **Gaps:** at most 9 gap-resolved touches per forecast cell (median gap 0.001–0.14σ). No forecast touch was unordered
  (U = 0), so the D2 sensitivity equals the primary EV everywhere.

## 3. Reference-race EV (expectancy, behavioural)

**"All touches" cells**, EV_fc in R [95%], with ΔEV versus the B2 placebo and the cost hurdle H:

| Cell | Fade EV | Fade ΔEV | Continuation EV | Cont. ΔEV | H (fade / cont) | Unresolved |
|---|---|---|---|---|---|---|
| GOLD fixed p50 | −0.016 [−0.070, +0.036] | −0.014 | +0.018 [−0.021, +0.059] | +0.014 | 0.087 / 0.068 | 22% |
| GOLD fixed p75 | −0.004 [−0.061, +0.056] | +0.030 | +0.001 [−0.071, +0.073] | −0.045 | 0.070 / 0.087 | 24% |
| GOLD proj p50 | −0.025 [−0.105, +0.056] | −0.036 | −0.016 [−0.062, +0.029] | +0.001 | 0.092 / 0.065 | 38% |
| GOLD proj p75 | −0.001 [−0.071, +0.069] | +0.050 | +0.005 [−0.090, +0.103] | −0.074 | 0.066 / 0.090 | 29% |
| NQ fixed p50 | −0.022 [−0.075, +0.031] | −0.016 | +0.008 [−0.036, +0.053] | +0.007 | 0.050 / 0.050 | 20% |
| NQ fixed p75 | −0.034 [−0.091, +0.019] | +0.049 [+0.010, +0.089] | +0.033 [−0.033, +0.104] | −0.063 [−0.113, −0.013] | 0.050 / 0.050 | 26% |
| NQ proj p50 | −0.001 [−0.073, +0.071] | +0.028 | −0.022 [−0.066, +0.025] | −0.035 | 0.050 / 0.050 | 40% |
| NQ proj p75 | −0.067 [−0.136, +0.002] | −0.034 | +0.090 [−0.001, +0.179] | +0.038 | 0.050 / 0.050 | 38% |
| EURUSD fixed p50 | −0.003 [−0.056, +0.049] | +0.009 | +0.001 [−0.039, +0.043] | −0.013 | 0.151 / 0.113 | 24% |
| EURUSD fixed p75 | +0.059 [−0.011, +0.121] | +0.044 | −0.056 [−0.120, +0.014] | −0.026 | 0.136 / 0.144 | 27% |
| EURUSD proj p50 | −0.005 [−0.084, +0.079] | −0.078 [−0.147, −0.009] | +0.007 [−0.037, +0.050] | +0.026 | 0.165 / 0.086 | 43% |
| EURUSD proj p75 | +0.059 [−0.029, +0.146] | −0.038 | −0.038 [−0.120, +0.052] | +0.056 | 0.160 / 0.161 | 27% |

- **Every "all touches" EV is within about ±0.07R of zero, and no interval clears zero.** The rung spacing prices the
  race fairly: the break-even shares (fade 0.32–0.58, continuation 0.42–0.68) match the observed resolution shares.
- **Unresolved contribution:** small at fixed levels (±0.03R). At projected p50 the fade's unresolved contribution is
  +0.06 to +0.18R, because the open is about 1.1σ away and 38–43% of touches never resolve. For projected p50 fades,
  the 22:00 close convention carries most of the EV, which is still not above zero.
- **The one consistent forecast-vs-placebo pattern is NQ fixed p75.**
  - The forecast fade is less bad than the placebo fade (ΔEV +0.049R [+0.010, +0.089]), and continuation is worse
    (ΔEV −0.063R).
  - The T1 counterpart is more failed-held reversals (4a +3.2pp [+1.2, +5.4], p = 0.002, the same sign in all three
    periods) and fewer pullback-continuations (2: 5.3 vs 7.8%).
  - The forecast fade's own EV is still negative (−0.034R), below the hurdle, and nothing survives BH.
  - Under R7 it is banked as behaviour, not chased. This is the kind of result-led variant the hard stop forbids.
- **Condition cells:**
  - five tests have an EV_fc interval wholly above 0, and ten have a ΔEV interval wholly above 0;
  - none is BH-significant;
  - the largest in-family EV is NQ projected p50, P1-bottom fade, at +0.143R [−0.000, +0.277], p = 0.053;
  - several of these sit in descriptive (< 150) cells, and their number is what chance gives across 300 tests.

## 4. Sensitivities

- **Untagged days excluded:** recomputed for every cell (`t1_cells.csv`, `t2_cells.csv`). No trigger existed to
  depend on them.
- **Period estimates** (Y1–Y3, Y4–Y6, 2016–20) are listed per cell. The 2016–20 condition cells use the frozen 2020–26
  range-used boundaries: a historical sign check, not an independent calibration.
- **Small-placebo flag** (< 150 touches in any placebo factor; a warning only) is marked per cell. It is most common in
  projected p75 and in time-window cells.

## 5. What M7 establishes, rules out, and cannot establish

**Establishes (behaviour, with intervals):**
- the post-touch path mix at each forecast rung and family, with times and excursions;
- that the mix, the excursions and the reference-race EV at the forecast lines match comparable phantom lines at the
  same distance, on all three instruments and both families.

**Rules out at 95%:**
- **Forecast-specific category-share differences** of 5pp or more in 64 of 78 cells. All fixed p50 cells are within
  ±3.2pp.
- **"All touches" reference-race EV** above +0.06R (fixed p50), +0.12R (fixed p75), +0.08R (projected p50) and
  +0.18R (projected p75).
- **Forecast-minus-placebo ΔEV** above +0.04R (fixed p50), +0.09R (fixed p75), +0.08R (projected p50) and +0.15R
  (projected p75).
- **Above-hurdle EV or a ≥ 0.05R forecast-specific EV** in 139 of 220 in-family tests.

**Underpowered:** 14 T1 cells (11 at projected p75, with interval bounds up to ±10pp) and 81 in-family T2 tests,
concentrated in fixed p75 and projected cells and in narrow condition levels.

**Cannot establish:**
- that no forecast-specific effect exists;
- executable profitability (no fills, spreads or execution modelled);
- anything about events defined after the touch bar (reclaims, H1 closes, rejections), which M7 did not condition on;
- other line constructions;
- untouched data (test years were seen descriptively in M3–M6).

## 6. Run record and deviations

- **Build checks** (all passed before any statistic; `build_checks.json`):

| Check | Result |
|---|---|
| 0 Regeneration | the six M3 phantom files regenerated byte-identically, with 0 misaligned days in all six runs. This includes the EURUSD ×0.85/×1.15 run whose original log was missing |
| 1 Stage-1 reproduction | E, a and b recomputed exactly from the path; T2 counts equal to `cell_inventory.csv` |
| 2 Category assertion | every eligible touch has exactly one label |
| 3a Forecast fixed vs archive | 100% agreement (0 disagreements, 11,968 touches) |
| 3b Placebo fixed vs M3's buildDay fields | 100% agreement |
| 3c Primary vs independent reconstruction | 100% agreement, every line set |
| Projected vs the archive's moving references (reported) | forecast disagreement 1.2–2.4%, placebo up to 3.4% |
| 4 Tie diagnostic (reported) | uncast prices change 0.1–1.1% of forecast fixed event bars. The float32 convention is necessary |
| 5 Decomposition identity | held in every cell |

- **First launch stopped at setup.** The stage-1 features file doesn't store the side sign s, so the first launch
  stopped with a KeyError before any outcome was computed. Deriving s from the family (OH/ProjH +1, OL/ProjL −1, the
  stage-1 convention) is committed separately; the run above is the only completed run.
- **Smoke tests.** Before the real run, the code was exercised on 60 touches per cell with B = 5. Only completion and the
  check pass flags were read, and the output was deleted unread.
- **Regeneration inputs.** The regeneration used read-only links to the local M1 parquets and `node_modules`, plus copies
  of the gitignored archive day files and `vol_report.json`. There is no `.env` in the worktree, so no R2 access.
- **Classification ordering.** Descriptive (< 150) T2 cells can be labelled "ruled out" when their bounds exclude the
  required effect. Otherwise they are "underpowered", following the classification table's order.
