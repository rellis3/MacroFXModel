# overnight-vol-regime — controls-only pass (prereg §5.4)

Run 2026-11-02, `python -I scripts/overnight-vol-regime/run.py --mode controls`, seed 20261102. Full numbers: `controls.json`, `controls.log`.

**Nothing in this file pairs a night's return with its real volatility label.** Every slope below uses x rotated by ≥ 63 nights against the returns, or a single side only.

## 1. Futures vs CFD overlap: PASS

Futures-file gross vs banked OANDA gross, same night rule, 2016-10-24 → 2026-04-21:

| | Value | Bar |
|---|---|---|
| Matched nights | 1,880 | — |
| Correlation | **0.9962** | ≥ 0.98 |
| Mean difference | **−0.0009% a night** | ≤ 0.005% |
| SD of difference | 0.077% | — |
| 99th pct \|difference\| | 0.056% | — |

Calendar:
- Nights the rule builds that the banked set lacks: **0**.
- Banked nights the rule lacks: 1, which is 2026-04-21, whose exit falls after the futures file ends.
- Matched nights with a different entry or exit minute: 2 and 5. These look like timestamp edge cases; they are kept, and they are within the overlap statistics above.

**The extension is admitted.**

## 2. Data quality

| | NQ extension 2009-01 → 2016-10 |
|---|---|
| Nights built by the rule | 1,628 |
| Dropped | 74 (5–13 a year): 62 with no entry minute, 12 with no exit minute |
| Admitted | **1,554** (prereg estimate ≈ 1,580) |
| What the dropped nights are | US holidays and early closes (MLK, Presidents, Good Friday eve, Memorial, 3/4 July, Labor, Thanksgiving, 24/31 Dec), plus Hurricane Sandy (2012-10-29/30). These are the same nights the banked rule skips in 2016+, so the calendar is comparable. |

- Every night has a σ and an x (none lost).
- NQ total **3,503** nights; gold **1,962**.
- **x is not quite uniform** (it ranks against the past year, and vol trends):
  - NQ quartile shares 0.30 / 0.21 / 0.25 / 0.24, SD 0.31;
  - gold 0.26 / 0.24 / 0.24 / 0.26.
  - The design uses x as measured, so this is handled.
- x autocorrelation: NQ 0.97 / 0.35 / 0.06; gold 0.95 / 0.24 / 0.02 (at 1 / 20 / 60 nights).
- SD of z, extension 0.651 vs banked 0.654: the two sources have the same night-to-night spread. The extension's mean is withheld until scoring.

## 3. Measured power (replaces the §5.1 analytic table)

| Sample | Nights | Placebo SD of b | Bootstrap SD of b | Design effect | **Measured MDE** (80%, Holm first step) | **95% CI half-width if b = 0** | Analytic MDE / half-width (§5.1) |
|---|---|---|---|---|---|---|---|
| **NQ 2009+ (used)** | 3,503 | 0.030 | 0.034 | 0.70 / 0.94 | **0.106** | **±0.067** | 0.13 / ±0.08 |
| NQ 2016+ only | 1,949 | 0.041 | 0.044 | 0.75 / 0.89 | 0.137 | ±0.087 | 0.17 / ±0.11 |
| Gold 2016+ | 1,962 | 0.062 | 0.058 | 1.13 / 0.97 | **0.192** | **±0.122** | 0.21 / ±0.13 |

The MDE takes the larger of the two SDs. The analytic table assumed a design effect of 1.2. The measured value is lower, because night-to-night returns barely cluster by month once divided by σ. Power is slightly better than registered.

Era halves, for credibility check A1, CI half-width if b = 0:
- NQ: ±0.104 (2009–16), ±0.090 (2016–26);
- gold: ±0.163 / ±0.167.

**So A1 can only contradict a large effect.** For anything smaller it will read "uninformative", as §4.2 anticipates.

## 4. Planted-effect detection

Effect planted on label-shifted x, 200 shifts per row, with the full §4.1 test run on each (placebo p, month-bootstrap CI). The numbers are shares of the 200 runs.

**NQ 2009+**

| Planted b | Evidence (α 0.025) | Evidence (α 0.05) | Wrong sign | Large ruled out | Inside ±0.05 (NULL) | Uninformative |
|---|---|---|---|---|---|---|
| 0 (false positives) | 0.010 | 0.010 | — | **1.00** | 0 | 0 |
| 0.05 | 0.29 | 0.29 | 0 | 0.86 | 0 | 0 |
| 0.10 | 0.88 | 0.89 | 0 | 0.27 | 0 | 0 |
| **0.15 (positive control)** | **1.00** | **1.00** | 0 | 0.005 | 0 | 0 |
| 0.20 | 1.00 | 1.00 | 0 | 0 | 0 | 0 |

**Gold 2016+**

| Planted b | Evidence (α 0.025) | Evidence (α 0.05) | Wrong sign | Large ruled out | Inside ±0.05 (NULL) | Uninformative |
|---|---|---|---|---|---|---|
| 0 (false positives) | 0.025 | 0.075 | — | 0.45 | 0 | 0.48 |
| 0.05 | 0.08 | 0.13 | 0.015 | 0.30 | 0 | 0.58 |
| 0.10 | 0.29 | 0.36 | 0 | 0.15 | 0 | 0.49 |
| **0.15 (positive control)** | **0.61** | **0.70** | 0 | 0.05 | 0 | 0.25 |
| 0.20 | 0.84 | 0.87 | 0 | 0.015 | 0 | 0.12 |

NQ 2016+ only, for reference: positive control 0.93; b = 0 large ruled out 0.91.

## 5. Unconditional figures for the threshold translation (banked 2016+ only)

| | Mean z | SD z | Median daily σ |
|---|---|---|---|
| NQ | 0.042 | 0.654 | 1.14% |
| Gold | 0.070 | 0.794 | 0.82% |

The thresholds stay fixed in z units (§5.2). NQ's μ is 0.042 rather than the ≈ 0.05 used for the translation, so the economic reading moves slightly in the thresholds' favour:
- the quartile filter's break-evens become 0.05 (Sharpe) and 0.11 (total return);
- the oracle ceiling at b = 0.05 becomes +6%.
