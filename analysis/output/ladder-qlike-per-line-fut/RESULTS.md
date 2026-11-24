# ladder-qlike-per-line-fut: results

Prereg: `forge/LADDER_QLIKE_PER_LINE_FUT_PREREG.md` (pushed a232d8b0; A1 post-hoc implementation fix, see below). Seed
20261124, B = 2000, 63-session date-aligned blocks. Scripts `scripts/ladder-qlike-per-line-fut/{race.py,
build_params.py}`; numbers `results.json`; log `report.txt`; leaderboard `leaderboard.csv` (25 futures × 6 lines ×
17–20 models); the first (faulty) run in `first_run/`.

Jordan's method on the NT8 futures: every line (HL, OH, OL, OC, Close+ on up-close days, Close− on down-close days) raced
across every σ model on that contract's own sessions, each contract × line keeping its own QLIKE-best calc.

Controls: all 25 reproduce their build's realised lines on 100% of sessions; A0 in the race equals the build's A0 exactly.
The four futures already on the site (NQ, GC, 6E, 6J) get exactly the picks they already have, on every line.

**A1 (post-hoc, implementation fault):** US2000 (RTY, history from 2017-07) was not scored in the first run: no arm had
a QLIKE in 2019, and the pick's 2%-missing check then rejected every arm every year. Fixed to ignore sessions where no
arm has a value yet; re-run in full; no other contract's pick changed.

## Verdict (H1): **UNDERPOWERED**, leaning better overall, strong on HL and OH

Site per-line picks vs each future's live σ (A0), summed QLIKE HL + OH + OL, mean over the 25:

| | All years | 2020–22 | 2023–26 |
|---|---|---|---|
| **HL + OH + OL** | **−2.39% [−4.04, −0.01]** | −0.16% [−2.97, +4.23] | **−4.34% [−5.69, −3.14]** |
| HL | **−10.39% [−12.26, −7.87]** | −8.37% | −12.10% |
| OH | **−3.34% [−3.88, −2.60]** | −3.00% | −3.62% |
| OL | +0.49% [−2.70, +4.98] | +4.35% | −3.07% |

2020–22 crosses zero (OL in 2020, mainly CL's negative-price days), so the registered word is UNDERPOWERED. Graded
weight: **leaning** overall, **strong** on HL and OH (both halves). Almost the same as the CFD study (−2.48%, HL −10%).

By contract (HL+OH+OL vs live): ES −7.7%, YM −7.3%, FDAX −5.5%, ZB −5.1%, ZF −4.7%, ZT −4.7%, RTY −4.6%, 6B −4.3%,
HG −4.1%, ZW −4.1%, ZN −3.7%, BZ −3.4%, GC −3.2%, NQ −3.1%, PL −2.9%, 6J −2.8%, ZC −2.7%, 6E −1.9%, 6C −1.8%,
6S −1.7%, SI −1.4%, NG −1.3%, 6A −0.6%, 6N −0.4%; **CL +23.4%** worse (+7.5% without 2020-04-20/21, when crude
futures traded at or below zero, descriptive): CL is the one contract where the per-line calcs lose to its old σ, as on
the CFD (+6.7%). 24 of 25 better.

## Picks (each contract × line its own calc)

| Line | Count across 25 |
|---|---|
| HL | HAR-CJ 16, SHAR 5, R5 1, R15 1, HAR+GARCH-t 1, HAR-RV 1 |
| OH | HAR-CJ 10, R15 6, SHAR 6, R5 2, HAR-RV 1 |
| OL | HAR-CJ 13, SHAR 5, R5 3, HAR+GARCH-t 2, HAR-RV 2 |
| Close+ | SHAR 9, HAR-CJ 7, R15 5, HAR-RV 2, HAR+GARCH-t 1, R5 1 |
| Close− | HAR-CJ 12, R15 5, SHAR 5, HAR-RV 2, R5 1 |

Full table in `report.txt`. Hit rates of every new site line 2020–26: p50 47.6–53.0%, p75 23.1–27.5%, p90 8.0–11.1%.

## Site

The **futures QLIKE per-line export grows from 4 to 18 contracts**: added ES, YM, RTY, FDAX, 6B, 6A, 6N, 6C, 6S, SI, HG, PL,
CL, BZ, each line its own calc. As for the original four, σ is computed live from the OANDA twin, and widths come from the
futures' own moves. **NQ, GC, 6E and 6J are byte-identical to before** (layer rule: the base is never overwritten).
No twin feed, research only: ZN, ZB, ZF, ZT, ZC, ZW, NG. Parity: all 67 site σ matched the Python at build (every new
contract); the committed fixture keeps 8 futures. The Volatility Overlay v3 already maps every new futures ticker
(6C and 6S inverted like 6J).
