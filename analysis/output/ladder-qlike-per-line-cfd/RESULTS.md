# ladder-qlike-per-line-cfd: results

Prereg: `forge/LADDER_QLIKE_PER_LINE_CFD_PREREG.md` (pushed 00b86ce8; A1 pre-results 6cd5b21e). Seed 20261124, B = 2000,
63-session date-aligned blocks. Scripts `scripts/ladder-qlike-per-line-cfd/{race.py, build_params.py}`; numbers
`results.json`; log `report.txt`; full leaderboard `leaderboard.csv` (40 CFDs × 6 lines × 17–20 models).

Jordan's method on the OANDA CFDs: each line (HL, OH, OL, OC, Close+ on up-close days, Close− on down-close days) raced
across every σ model on that CFD's own data, keeping the one with the best QLIKE for that line.

Controls: all 40 instruments reproduce the build's realised lines on 100% of sessions; A0 in the race equals the
build's A0 exactly.

## Verdict (H1): **UNDERPOWERED**, though it leans clearly better overall

Site-computable per-line picks (walk-forward) vs each CFD's live σ (A0), summed QLIKE over HL + OH + OL, mean over the 40,
date-aligned bootstrap:

| | All years | 2020–22 | 2023–26 |
|---|---|---|---|
| **HL + OH + OL** | **−2.48% [−3.90, −0.82]** | −0.65% [−2.87, +2.37] | **−3.99% [−5.39, −2.64]** |
| HL | **−10.05% [−12.72, −7.23]** | −7.49% [−10.60, −3.99] | −12.02% [−15.47, −8.30] |
| OH | −2.08% [−2.99, −1.05] | −0.58% | −3.35% |
| OL | −0.98% [−2.69, +1.15] | +1.05% | −2.64% |

The pre-registered bar needs the CI below zero in both halves; 2020–22 crosses zero, so the verdict word is
UNDERPOWERED. Graded weight: **leaning** better overall, **strong** on HL (10% better, every half).

By instrument (HL+OH+OL vs live): best SPX500 −9.7%, NQ −7.0%, US30 −6.9%, DE30 −6.6%, US2000 −5.7%; 34 of 40 better;
worse: NZDUSD +0.2%, AUDUSD +0.5%, NZDCAD +3.4%, AUDCAD +3.7%, PALLADIUM +6.0%, WTI +6.7%.

## Picks per line (final, best site-computable 2020 → 2026-08)

| Line | Most common calcs across the 40 |
|---|---|
| HL | HAR-CJ 27, SHAR 8, R15 2, R5 2, HAR-RV 1 |
| OH | HAR-CJ 24, R15 8, SHAR 5, others 3 |
| OL | HAR-CJ 23, SHAR 7, R15 4, R5 3, others 3 |
| OC | HAR-CJ 21, R15 7, SHAR 6, HAR+GARCH-t 3, others 3 |
| Close+ | HAR-CJ 18, R15 9, SHAR 6, HAR+GARCH-t 4, others 3 |
| Close− | HAR-CJ 22, SHAR 7, R15 5, others 6 |

Per instrument in `report.txt` and `js/ladderV2QlikeCfdParams.json`. Hit rates of every site line on its own days
2020–26: p50 47.8–52.7%, p75 23.1–27.7%, p90 8.8–11.4%.

Implied-vol models are the best overall (not computable on the site yet) on gold (all six lines), WTI (all six),
US2000 (five), SPX500, NQ and US30 (OL / Close−). An IV feed would most help WTI and gold. WTI is also where the
site picks do worst against live (+6.7%).

## Site

Shadow export `⬇ QLIKE per-line · CFD` on vol-forecast-v3 (`/api/vol-forecast/ladder-v2/export?calc=qlike&track=cfd`),
each line labelled with its model; paste into the C.og Volatility Overlay v3. Parity: all 95 site sigmas matched the
Python at build (4 futures + 40 CFDs); the committed fixture keeps 9 CFDs covering every model type.
