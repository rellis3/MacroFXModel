# exhaustion-v2-eurusd — results

Prereg: `forge/EXHAUSTION_V2_EURUSD_PREREG.md` (2026-11-19; gold's control fixes registered up front). Run 2026-11-19,
seed 20261119, B = 2000, 63-session blocks. Lines are HAR-CJ on both tracks (`ladder-v2-eurusd`, 6E = CFD
distribution). Releases still to come are US and Euro Area Major events. Numbers are in `results.json` and the log in
`report.txt`. Ledger: `exhaustion-v2-eurusd`, `exhaustion-v2-eurusd-fut`.

## Verdict: VALIDATED (C and F)

| | CFD | 6E futures |
|---|---|---|
| Sessions / touches (next rung · 0.25σ) | 1,744 / 7,365 · 8,333 | 1,706 / 7,214 · 8,121 |
| Calibration miss, plain ladder odds X0 | 10.57pp | 10.48pp |
| Calibration miss, chosen **X7** (logistic blend) | **3.83pp** | **3.50pp** |
| Chosen − X0, winner re-selected per draw, 90% CI | [−7.88, −4.88] | [−8.05, −4.96] |
| Log loss chosen ÷ X0, 90% CI | 0.942 [0.936, 0.954] | 0.943 [0.937, 0.956] |
| Both halves, 5 left-out windows, fault days out | all below 0 | all below 0 |
| Clustered noise floor p90 / calibrated to noise | 2.99 / no | 2.99 / no |

**Positive control:** 20 synthetic histories of ~10,300 touches each.
- X2's pooled bias is +0.08pp (next rung) and +0.01pp (0.25σ).
- X0 misses its worst time bucket by 26.6pp.
- The clustered floor has a median of 2.69pp and a p90 of 2.99pp; the independent-touch floor would have been 2.09.

## The clock on EURUSD (CFD; 6E within ~1pp)

| London time | Observed (next rung) | X0 plain odds | X2 vol clock | X7 chosen |
|---|---|---|---|---|
| 00–07 (n 562) | 60.5% | 46.3% | 61.9% | 62.9% |
| 07–12 (n 2,316) | 56.3% | 45.2% | 57.6% | 53.1% |
| 12–16 (n 3,160) | 44.7% | 43.5% | 45.9% | 43.4% |
| 16–22 (n 1,327) | 25.6% | 42.2% | 18.2% | 26.2% |

The 0.25σ target follows the same pattern: 81.9% before 07:00 and 47.0% after 16:00, against a flat ~64%.

## Candidates (CFD; * = fails GUARD)

| Candidate | Miss (pp) |
|---|---|
| X7 logistic blend | 3.83 |
| X6 range used | 4.10 |
| X1 clock time | 4.12 |
| X4 vol clock + hot/cold day | 4.16 |
| X2 vol clock | 4.20 |
| X5 release to come (US + EA) | 4.32 |
| X3 hour table | 6.43 |
| X0 plain odds | 10.57 |

On 6E, X8 (VWAP and touch volume) has the best log loss (0.938) but a worse miss (4.24).

## Reading

- The third pilot shows the same picture. Plain ladder odds ignore the clock; on EURUSD, next-rung odds fall from
  61% before 07:00 to 26% after 16:00. The logistic blend cuts the miss by about 64% and the log loss by about 6%.
- The plain random walk on the vol clock under-calls late-day travel (18% vs 26%), as on gold. The blend fixes this.
  The late-day term is the one part of the model that differs by instrument, so it's what the blend is buying.
- Wrong-side dynamic touches (about 80 per target) are under-called by the blend (50% observed vs 42%). That's a small
  subset and is reported only.
- Placebo levels (descriptive): real lines travel exactly as X2 predicts (46.1% vs 45.8%), and borrowed lines slightly
  further. There's no sign that real lines are "sticky".
