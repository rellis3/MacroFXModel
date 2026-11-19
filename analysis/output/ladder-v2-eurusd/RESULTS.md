# ladder-v2-eurusd — results

Prereg: `forge/LADDER_V2_EURUSD_PREREG.md` (2026-11-19). Run 2026-11-19, seed 20261118, B = 2000, 63-session blocks.
Harness `scripts/ladder-v2/ladder.py`. Main race: `results.json`, `run.log`. IV race: `results_iv.json`, `run_iv.log`.
Ledger: `ladder-v2-eurusd`, `ladder-v2-eurusd-fut`, `ladder-v2-eurusd-cvf`, `ladder-v2-eurusd-iv`.

## Verdicts

| Race | Verdict |
|---|---|
| Main, CFD (2018 → 2026-08, 17 arms) | **VALIDATED**: HAR-CJ |
| Main, 6E futures | **VALIDATED**: SHAR (own winner); F reuses the CFD spec per H3 |
| C vs F | **CONTEXT: same** |
| IV race, CFD (2021 → 2026-08, 20 arms) | **UNDERPOWERED**: a non-IV arm wins again; the 2021–22 half can't separate |

## Main race

| | CFD | 6E futures |
|---|---|---|
| Test sessions | 2,240 | 2,181 |
| Live yz_10 regime miss | 2.81pp | 2.66pp |
| Chosen | **HAR-CJ 1.38pp** (tied with HAR-RV 5-min 1.33, sharper) | **SHAR 1.12pp** (tied with HAR-RV 5-min 1.06, sharper) |
| Chosen − A0, winner re-selected per draw, 90% CI | [−1.96, −0.74] | [−1.97, −0.75] |
| Halves, 8 left-out windows, fault days out | all below 0 | all below 0 |
| Calibrated to noise (floor p90) | yes (1.63) | yes (1.66) |
| GUARD A0 → chosen | 1.00 → 0.60 | 0.85 → 0.66 |
| Mirror (20 draws), A0 median | 1.40 (floor median 1.37) | 1.29 (1.40) |

| HL > p75 / p90 by σ quintile (CFD) | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---|---|---|---|---|
| live yz_10 | 34.2 / 17.9 | 28.6 / 12.3 | 21.2 / 7.6 | 22.3 / 9.8 | 19.2 / 7.4 |
| HAR-CJ | 28.1 / 12.5 | 23.0 / 9.6 | 20.8 / 8.0 | 25.4 / 10.9 | 24.8 / 9.8 |

All arms, CFD (pp): HAR-RV 5-min 1.33, HAR-CJ 1.38, SHAR 1.39, HAR-RV 15-min 1.48, yz_20 1.50, ewma_090 1.60, ewma_094
1.69, yz_30 1.77, HAR + GARCH-t 1.97, har_rv_log 2.25, HAR-800 2.33, GARCH-t 2.68, **yz_10 (live) 2.81**, GARCH 2.89,
GJR 3.11, EGARCH 3.17, naive 8.66. On QLIKE and MZ R² the intraday HAR family also leads (HAR-CJ MZ R² 0.318 against 0.259
for the live σ); the GARCH family trails the live σ on both.

**C vs F (H3):** on 2,689 common dates every F/C ratio sits in 1.003–1.012 with CIs inside [0.995, 1.025], so 6E reuses
the CFD spec (HAR-CJ), unlike gold. 6E's own winner (SHAR) is the same family.

## IV race (`ladder-v2-eurusd-iv`, CFD, 2021 → 2026-08, 1,462 sessions)

- HAR-CJ chosen again (1.29pp vs live 2.54; CI [−1.81, −0.33]). The 2021–22 half (519 sessions) has a CI of
  [−2.25, +0.00], so by the registered rule the race is UNDERPOWERED.
- **The IV arms do not win.** Best IV arm V3 (IV-adjusted) 1.85pp; best non-IV arm (HAR-RV 5-min) 1.28pp; the
  difference is +0.57pp [−0.18, +0.97]. Pure IV (2.65) and HAR + IV (2.08) over-correct (slopes 1.13–1.16), as on NQ.
- This doesn't contradict `iv-ladder` (IV −4.1% pinball against the *live* realised ladder). Here IV is also sharp
  (V3 pinball 0.983), but the intraday HAR models are about as sharp **and** flat across regimes.

## Reading

- **The FX pilot matches the metal pilot:** intraday-RV HAR models (5-min RV, jumps split or semivariance) beat every
  daily-bar estimator. NQ alone preferred the daily-range HAR. Classes do not share one winner, but two of three pilots
  share a family.
- **The live σ is regime-blind on EURUSD too:** quiet days reach p75 34% of the time and loud days 19%. HAR-CJ gives
  28% and 25%.
- **Shadow σ:** EURUSD (CFD and 6E) → HAR-CJ with its fitted widths, on the side-by-side export with a forward record.
  Nothing live changes without owner sign-off.
