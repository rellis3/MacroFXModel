# orderflow-lead-aggressor — results

Prereg: `forge/ORDERFLOW_LEAD_AGGRESSOR_PREREG.md` (committed in `503bc6f1`, 2026-11-07). Run 2026-11-07, seed 20261107, B = 2000.
Branch `main`. Ledger id: `orderflow-lead-aggressor`.

## Verdict: NULL

No cell passed the gate, on either instrument, and all four are powered. Using the exchange's own aggressor flag, 5-minute imbalance on 6E and 6J does not predict the next 5 or 15 minutes beyond the move already in the bar, in either direction. Every interval sits about ten times inside the 0.05 bar, so an effect of the registered size is ruled out, not merely unseen.

## Scored cells

| Cell | Sessions | Bars | Slope on D(t) | 95% CI | Half-width (bar 0.05) | Halves | Placebo range | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| 6E, h = 5 | 866 | 133,290 | -0.0008 | [-0.0058, +0.0049] | 0.005 | -0.004 / +0.003 | [-0.007, +0.004] | 1 | NULL |
| 6E, h = 15 | 866 | 131,559 | -0.0019 | [-0.0074, +0.0035] | 0.005 | -0.009 / +0.005 | [-0.005, +0.003] | 1 | NULL |
| 6J, h = 5 | 780 | 119,996 | -0.0026 | [-0.0082, +0.0032] | 0.006 | -0.004 / -0.002 | [-0.004, +0.006] | 1 | NULL |
| 6J, h = 15 | 780 | 118,439 | -0.0049 | [-0.0107, +0.0010] | 0.006 | -0.007 / -0.003 | [-0.006, +0.005] | 0.40 | NULL |

The mirror (flow that reverses) fails the same gate: the negative slopes are a tenth of the bar.

## Controls

- Placebo means are -0.0006, -0.0005, +0.0005 and -0.0002, all under the 0.01 limit, so the design is not biased.
- **Code-fault audit, done before accepting the null.** The flag signs flow correctly: imbalance correlates with the same bar's return at +0.39 (6E) and +0.35 (6J). Side N is 1.4% of volume, as in the pilot. The scorer recovers planted leads and reversals on synthetic data (`forge/orderflow_lead_aggressor_test.py`).
- Sessions dropped: 8 empty and 11 thin on each instrument, none for a roll inside the session.

## Deviations from the prereg

None. The counted sample (866 and 780 sessions) matched the plan, so no amendment was needed.

## Descriptive (not part of the verdict)

| | 6E | 6J |
|---|---|---|
| Slope, h = 30 | -0.002 [-0.008, +0.004] | -0.006 [-0.012, -0.000] |
| Slope, h = 60 | -0.006 [-0.014, +0.001] | -0.012 [-0.020, -0.005] |
| Tick-rule D, h = 5 / h = 15 | -0.001 / -0.004 | +0.005 / +0.000 |
| Raw delta, h = 5 / h = 15 | +0.002 / -0.002 | -0.004 / -0.008 |
| 30-minute running delta, h = 5 / h = 15 | -0.003 / -0.004 | -0.005 / -0.009 |
| London hours, h = 5 / h = 15 | +0.002 / +0.002 | -0.003 / -0.008 |
| US hours, h = 5 / h = 15 | -0.002 / -0.004 | -0.003 / -0.004 |

- **Hour of day:** 26 slices at h = 5, and none survives BH at q = 0.10 (smallest adjusted value 0.37).
- **6J at h = 60:** -0.012, outside its placebo range, -0.012 and -0.013 in the halves. It is a quarter of the bar, on a descriptive horizon, one of several variants. A candidate at most, and far too small to trade by itself.
- **The tick rule is a weak stand-in.** Its bar imbalance correlates with the exchange's flag at only +0.54 (6E) and +0.48 (6J), and with the same bar's return more strongly than the true flag does (+0.52 and +0.47), as expected of a sign built from price.
- **A rough look at "divergence", not registered:** bars with |return| over 1 sigma and |imbalance| over 0.2 against the return (669 on 6E, 1,054 on 6J) were followed by -0.03 and -0.04 standardised in the bar's direction over 5 minutes, where the absorption reading predicts a positive number. Aligned bars gave -0.02 and -0.05. No intervals were computed and I chose the thresholds, so this is only a pointer for test Q3.

## What this changes

- Do not say delta leads price on FX futures over these horizons, by the tick rule or by the exchange's flag. `footprint.html` stays descriptive and now says so.
- The NQ and ES aggressor history stays unbought: this gives no reason to buy it. A null here does not close the question for those markets.
- Open: a bar total is not footprint structure. Q2 (does flow say how much price moves) and Q3 (absorption at extremes) ask different questions. Either would need per-price cells built from the same raw files.
- Reopens only for a condition this linear test could miss, under its own prereg.
