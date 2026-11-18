# ladder-v2-nq — results

Prereg: `forge/LADDER_V2_NQ_PREREG.md` (committed in `9b5a7e08`, 2026-11-18; amendment A1 `91f957a5`, pre-results).
Run 2026-11-18, seed 20261118, B = 2000, session block 20. Branch `claude/signal-bot-bias-analysis-bwr1qv`.
Ledger ids: `ladder-v2-nq`, `ladder-v2-nq-fut`, `ladder-v2-nq-cvf`.
Scripts: `scripts/ladder-v2-nq/build.py`, `har800.mjs`, `score.py`. Full log: `report.txt`. Numbers: `results.json`.

## Verdict: VALIDATED (C and F), CONTEXT (C vs F: same)

On NQ, the forge **har_rv_log** σ (arm E6) keeps the daily ladder's hit rates on target across vol regimes. It beats
the live yz_10 on both the CFD and the futures, walk-forward 2018 → 2026-08-21, in both halves of the test years.

| | CFD (NAS100) | Futures (CME NQ) |
|---|---|---|
| Test sessions | 2,229 | 2,196 |
| 30-cell regime miss, live yz_10 (A0) | 2.40pp | 2.50pp |
| 30-cell regime miss, chosen E6 | **1.49pp** | **1.82pp** |
| E6 − A0, winner re-selected in each bootstrap draw, 90% CI | [−1.49, −0.32] | [−1.46, −0.17] |
| Half 2018–22: E6 vs A0 (CI of the difference) | 2.20 vs 2.96 [−1.68, −0.15] | 1.97 vs 2.98 [−1.86, −0.09] |
| Half 2023–26: E6 vs A0 (CI of the difference) | 2.42 vs 3.51 [−2.26, −0.76] | 2.16 vs 3.66 [−2.39, −0.28] |
| Noise floor: miss of a perfect forecaster, median / p90 | 1.37 / 1.64 | 1.39 / 1.64 |
| E6 calibrated to noise (≤ floor p90) | **yes** | no (0.18pp above) |
| Unconditional 12-rung miss (GUARD), A0 → E6 | 1.48 → 1.08 | 1.40 → 1.11 |
| Sharpness (pinball vs A0) | 0.961 | 0.963 |
| Runner-up (statistical tie) | H8 HAR-800 production, 1.60 | E3 yz_20, 1.91 |

HL beyond the line by σ quintile (Q1 = quietest), in %. The target is 25 for p75 and 10 for p90:

| | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---|---|---|---|---|
| C live yz_10 | 35.7 / 12.6 | 26.9 / 10.1 | 27.4 / 8.8 | 26.2 / 10.1 | 21.3 / 7.4 |
| C har_rv_log | 25.3 / 8.7 | 24.4 / 9.4 | 24.0 / 8.1 | 26.9 / 11.0 | 25.8 / 10.5 |
| F live yz_10 | 34.3 / 12.7 | 27.1 / 10.5 | 27.1 / 8.0 | 25.3 / 8.7 | 21.6 / 7.5 |
| F har_rv_log | 24.8 / 8.9 | 22.8 / 9.3 | 23.0 / 7.3 | 26.2 / 10.5 | 25.5 / 10.5 |

The live σ's quiet-day miss (p75 reached on 35% of the quietest days instead of 25%) is gone. The quiet-to-loud
spread falls from 14pp to under 3pp.

## All arms (30-cell regime miss, pp; * = fails GUARD)

| Arm | C | F | slope (C) |
|---|---|---|---|
| E6 har_rv_log (forge) | **1.49** | **1.82** | 0.96 |
| H8 HAR-800 (production JS) | 1.60 | 2.08 | 0.96 |
| E2 ewma_090 | 1.67 | 1.96 | 0.78 |
| E3 yz_20 | 1.84 | 1.91 | 0.81 |
| R5 HAR-RV 5-min | 1.93 | 2.23 | 0.96 |
| R15 HAR-RV 15-min | 2.14 | 2.55 | 0.96 |
| E1 ewma_094 | 2.33 | 2.13 | 0.82 |
| A0 yz_10 (live) | 2.40 | 2.50 | 0.81 |
| E4 yz_30 | 2.75 | 2.66 | 0.79 |
| V3 IV-adjusted VXN | 3.14* | 3.26 | 1.20 |
| V4 pure VXN | 5.33* | 5.24* | 1.38 |
| E5 naive | 10.66* | 10.86* | 0.42 |

## Controls

- **Positive control 1:** the Python NY-close bar builder matches the production `nyCloseDailyBars` output on
  2,748 / 2,748 dates.
- **Positive control 2** (synthetic GARCH, A1):
  - The known true σ scores 1.68pp against a floor p90 of 1.70, so it is read as calibrated.
  - A 10-day realised σ shows the known regime tilt: HL>p75 is 51.2% in Q1 and 10.6% in Q5, a +40.6pp spread. The
    scorer recovers both cases.
- **Mirror** (realised drawn regime-free from the train ratios): A0 scores 1.47pp (C) and 1.60pp (F), against a floor
  p90 of about 1.64. The live tilt is in the data, not the scorer.
- **Halves:** E6 beats A0 in 2018–22 and in 2023–26 on both tracks.

## H3: CFD vs futures (`ladder-v2-nq-cvf`, CONTEXT)

On 2,706 common London dates, the F/C ratios of the median and 75th percentile of HL, OH and OL are all between 0.994
and 1.007, with every 90% CI inside [0.988, 1.017]. NQ futures and the NAS100 CFD have **the same** daily range
distribution in % terms, so the futures track reuses the CFD spec. The same arm (E6) won on both.

## Deviations from the prereg

- **A1 (pre-results):** positive control 2 was re-specified because the sign was wrong as first written.
- **Per-arm bootstrap CIs printed in `report.txt`:** these sit above the point estimates. A mean of absolute misses is
  biased upward under resampling. They aren't used for any rule. The verdict uses the bootstrap of the *difference*
  vs A0, with the winner re-selected in each draw, as registered.

## Descriptive (not part of the verdict)

- **HAR-RV from 5- and 15-minute data** is the sharpest arm (pinball 0.935–0.943 vs A0) but under-covers. Its GUARD
  is ~2.1, so its widths miss unconditionally. Sharper is not the same as calibrated. This is the same trap that let
  pinball-only selection pick yz_10.
- **IV arms over-correct on NQ** (slope 1.2–1.4): too wide on loud days. This matches the October pooled run.
- **E6 is slightly wide-side on loud days.** Q4–Q5 HL>p90 is 10.5–11.0%, against a target of 10. That is within
  noise for one instrument.
- **Open question:** `forge/vol.py design_vol` picked yz_10 for NQ, yet E6 is sharper here. A probable cause is the
  old UTC-day bars with Sunday stubs that `design_vol` used (DATA_SPEC fault), which hit HAR's lag-1 term. This is
  not verified.

## What this changes

- **NQ's shadow σ becomes har_rv_log on NY-close bars, with widths fitted on that σ.** It applies to the CFD and the
  futures alike (one spec). It goes onto the side-by-side shadow export with a forward record (runbook 1.7/1.8).
- **Nothing live changes until the owner signs off.**
- **Not tested here:** event multipliers (runbook 1.5), the lockbox year (1.6), and other instruments. The next step
  is the same harness per instrument, then by class.
- **What would reopen this:** the forward record showing a quintile spread above ~6pp at p75 over 250+ sessions.
