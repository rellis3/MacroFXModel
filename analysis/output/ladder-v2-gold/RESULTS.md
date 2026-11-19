# ladder-v2-gold — results

Prereg: `forge/LADDER_V2_GOLD_PREREG.md` (2026-11-18; A1 mirror/halves, A2 GARCH family + SHAR + HAR-CJ + blends,
A3 GARCH fits on OANDA's long NY-close history; all pre-results).
Run 2026-11-19, seed 20261118, B = 2000, 63-session blocks. Harness `scripts/ladder-v2/ladder.py` (reproduces NQ to
0.0). Numbers `results.json`, log `run.log`. Ledger: `ladder-v2-gold`, `ladder-v2-gold-fut`, `ladder-v2-gold-cvf`.

## Verdict: VALIDATED (C and F), CONTEXT (C vs F: different)

| | CFD (XAU/USD) | Futures (CME GC) |
|---|---|---|
| Test sessions | 2,229 | 2,165 |
| 30-cell regime miss, live yz_10 (A0) | 3.53pp | 3.08pp |
| Chosen | **HAR-CJ** (5-min RV, jumps split out): **1.55pp** | **HAR-RV 5-min**: **1.44pp** |
| Chosen − A0, winner re-selected per draw, 90% CI | [−2.58, −1.06] | [−2.24, −0.88] |
| Halves 2018–22 / 2023–26 | both below 0 | both below 0 |
| 4 market episodes + gold's 4 highest-range quarters left out, fault days out | all below 0 | all below 0 |
| Noise floor p90 / calibrated to noise | 1.64 / **yes** | 1.66 / **yes** |
| GUARD (12-rung unconditional miss), A0 → chosen | 1.32 → 1.06 | 1.54 → 1.65 |
| Sharpness (pinball vs A0) | 0.959 | 0.965 |
| Mirror (20 draws), A0 median | 1.49 (floor median 1.37) | 1.60 (1.39) |

Gold's live σ has a larger regime miss than NQ's (3.5pp against 2.4pp). The quietest fifth of days reaches the p75
line 38.6% of the time instead of 25%, and the loudest fifth 17.7%. The chosen σ evens that out:

| HL > p75 / p90 by σ quintile (CFD) | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---|---|---|---|---|
| live yz_10 | 38.6 / 16.6 | 30.7 / 11.9 | 24.5 / 9.7 | 21.3 / 8.5 | 17.7 / 8.7 |
| HAR-CJ | 27.1 / 11.2 | 26.0 / 8.5 | 23.4 / 8.8 | 24.0 / 9.6 | 26.5 / 10.3 |

On the futures, HAR-RV 15-min had the lowest miss (1.41). It tied with 5-min, and 5-min is sharper, so the tie rule
chose it.

## All arms (30-cell regime miss, pp; * = fails GUARD)

| Arm | C | F |
|---|---|---|
| HAR-CJ (5-min, jumps split) | **1.55** | 1.54 |
| HAR-RV 15-min | 1.56 | **1.41** |
| HAR-RV 5-min | 1.63 | 1.44 (chosen) |
| SHAR (semivariance HAR) | 1.63 | 1.50 |
| IV-adjusted GVZ | 1.82 | 2.02 |
| ewma_094 | 1.86 | 2.10 |
| yz_20 / yz_30 | 1.97 / 1.99 | 1.79 / 1.85 |
| har_rv_log (NQ's winner, daily ranges) | 2.00 | 1.88 |
| HAR-800 production | 2.06 | 1.87 |
| HAR + GVZ 50/50 | 2.11 | 2.01 |
| HAR + GARCH-t 50/50 | 2.24 | 2.03 |
| GARCH(1,1) / GJR | 2.29 / 2.29 | 2.38 / 2.43 |
| GARCH-t | 2.31 | 2.37 |
| EGARCH | 2.34 | 2.47 |
| pure GVZ | 2.42 | 2.32 |
| ewma_090 | 2.51 | 2.69 |
| **yz_10 (live)** | **3.53** | **3.08** |
| naive | 8.93* | 7.75* |

## The outside race's yardsticks (reported, no rule)

QLIKE against the squared NY-day return, and MZ R² on the day's Garman–Klass variance (CFD):

| | QLIKE (lower better) | MZ R² (higher better) |
|---|---|---|
| IV-adjusted GVZ | 0.813 | 0.237 |
| HAR-CJ | 0.820 | 0.262 |
| HAR-RV 5-min | 0.822 | 0.248 |
| GJR / EGARCH / GARCH / GARCH-t | 0.872 / 0.876 / 0.877 / 0.882 | 0.13–0.14 |
| yz_10 (live) | 0.861 | 0.126 |

On gold, the GARCH family beats the live σ on our regime test (≈2.3 against 3.5pp) but trails every intraday-RV HAR
model, on our yardstick and on QLIKE alike. GARCH-t is the weakest of the four here; it ranked first in the outside
race, which used squared daily returns as its only target and had no significance test. The MZ R² of 0.25 against a
range-based target, versus 0.05 against squared returns there, matches the critique of that race: the target was too
noisy to separate models.

## H3: CFD vs futures (`ladder-v2-gold-cvf`, CONTEXT: different)

On 2,660 common London dates the futures ranges are 2–6% larger in % terms than the OANDA CFD's (HL p50 ratio 1.040
[1.030, 1.055]; OL p50 1.058). Five of the six ratios fall outside the registered band. So gold's futures keep their own
widths and their own winner, unlike NQ, where the two were the same. A likely reason is that OANDA's mid quotes smooth
spot extremes relative to traded GC prints. This is not tested here.

## Reading

- **Gold wants intraday information.** Every arm built on 5- or 15-minute realised variance beats every daily-bar arm.
  On NQ the same arms failed the GUARD; they were too narrow. Per-instrument racing is needed, as the outside race also
  concluded.
- **Splitting out jumps helps slightly on the CFD** (HAR-CJ). A news spike carries less forward information than steady
  vol, which fits gold's event days.
- **Live σ change, shadow only:** gold CFD → HAR-CJ, gold futures → HAR-RV 5-min, each with widths fitted on it. These
  go on the side-by-side export with a forward record (runbook 1.7/1.8). Nothing live changes without owner sign-off.
- **Data note:** after the repair, the gold futures still miss 75 London sessions (2016 → 2026-08). They are US
  holidays, NT8 feed holes shared with other roots, and single days on roll dates (runbook 0.2 follow-up). Dropping
  every fault-flagged day leaves the verdict unchanged.
