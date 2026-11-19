# exhaustion-v2-gold — results

Prereg: `forge/EXHAUSTION_V2_GOLD_PREREG.md` (2026-11-19). A1 and A2 are pre-results control fixes: 60 substeps a
minute, and a clustered noise floor from 20 synthetic histories. Run 2026-11-19, seed 20261119, B = 2000, 63-session
blocks. Lines: `ladder-v2-gold` winners (CFD HAR-CJ, futures HAR-RV 5-min). Numbers in `results.json`, log in
`report.txt`. Ledger: `exhaustion-v2-gold`, `exhaustion-v2-gold-fut`.

## Verdict: VALIDATED (C and F)

| | CFD | Futures |
|---|---|---|
| Sessions / touches (next rung · 0.25σ) | 1,807 / 7,861 · 8,902 | 1,764 / 7,699 · 8,737 |
| Calibration miss, plain ladder odds X0 | 11.40pp | 11.45pp |
| Calibration miss, chosen **X7** (logistic blend) | **3.67pp** | **3.56pp** |
| Chosen − X0, winner re-selected per draw, 90% CI | [−8.71, −5.84] | [−8.56, −5.97] |
| Log loss chosen ÷ X0, 90% CI | 0.949 [0.940, 0.962] | 0.952 [0.942, 0.964] |
| Both halves, 5 left-out windows, fault days out | all below 0 | all below 0 |
| Clustered noise floor p90 / calibrated to noise | 2.88 / no | 2.88 / no |

**Positive control (A2):** 20 synthetic histories of ~10,100 touches each.
- X2's pooled bias is +0.18pp (next rung) and +0.03pp (0.25σ). The formula and scorer are right.
- X0 misses its worst time bucket by 23.0pp, so the clock effect is recoverable.
- A perfect forecaster's miss, *including* the clustering of touches within a day, has a median of 2.58pp and a p90
  of 2.88pp. The independent-touch floor used before was 2.02. That gap confirms the A2 diagnosis.

## The clock on gold (CFD; futures within ~2pp)

Chance of reaching the next rung after a touch:

| London time | Observed | X0 plain odds | X2 random walk, vol clock | X7 chosen |
|---|---|---|---|---|
| 00–07 (n 1,508) | 60.9% | 46.5% | 58.0% | 58.6% |
| 07–12 (n 1,767) | 55.5% | 46.2% | 53.4% | 53.5% |
| 12–16 (n 3,254) | 43.6% | 45.1% | 40.6% | 46.0% |
| 16–22 (n 1,332) | 21.3% | 44.6% | 14.2% | 25.8% |

The 0.25σ target has the same shape: 78.8% before 07:00 and 48.7% after 16:00, against a flat ~67% from X0.

## Candidates (CFD; * = fails GUARD)

X7 logistic blend 3.67 · X5 release-to-come 3.72* · X4 vol clock + hot/cold day 3.97 · X6 range used 4.04 · X2 vol
clock 4.08* · X1 clock time 4.56* · X3 hour table 6.75 · X0 plain odds 11.40. Futures-only X8 (VWAP, touch volume):
4.26, with the best log loss (0.947) but worse calibration.

## Reading

- **Same picture as NQ.** The plain ladder odds ignore the clock: next-rung odds run from 61% before 07:00 London down
  to 21% after 16:00. The clock-aware blend cuts the calibration miss by about two-thirds and the log loss by about 5%.
- **On gold the blend wins outright.** It was tied with X4 on NQ. The plain random walk (X2) *under*-calls late-day
  travel on gold (14% vs 21%); the blend corrects it.
- **Not yet calibrated to noise,** even against the honest clustered floor (3.6–3.7 vs 2.88). There's room left for a
  better late-session term.
- **Placebo levels (descriptive only):** borrowed lines travel slightly further than X2 predicts, and so do real lines
  (46% vs 42%). There's no sign that real lines are "sticky".

## What this changes

Gold's exhaustion figure on the shadow export (runbook 2.4) is X7's probability per rung at the current time.
