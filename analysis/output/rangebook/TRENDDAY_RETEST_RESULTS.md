# Trend-day filter and acceptance-retest entry — results

Pre-registration: forge/TRENDDAY_RETEST_PREREG.md (ba34477). Rich-IV break signals only; R net of spread, mean of 0.1σ/0.2σ × 5R/10R.

## FX + gold (7 CVOL)

| | n | net R | 2016–22 | 2023–26 |
|---|---|---|---|---|
| Variant 1 base: all breaks signalled from 07:00 | 2,848 | +0.115 | +0.096 | +0.159 |
| … London closed beyond the Asia range in the trade direction first (trend day) | 2,593 | +0.111 | +0.091 | +0.158 |
| … not (Asia range not broken that way) | 255 | +0.155 | +0.151 | +0.162 |
| … narrow Asia (secondary) | 1,171 | -0.013 | -0.067 | +0.111 |
| Variant 2 base: every break, entered at the break (per signal) | 5,591 | +0.119 | +0.099 | +0.161 |
| … acceptance + retest entry, per SIGNAL (no trade = 0) | 5,591 | +0.024 | +0.021 | +0.030 |
| … acceptance + retest entry, per filled trade | 3,010 | +0.044 | +0.038 | +0.055 |

Retest outcomes: filled 54%, rejected (closed back inside within 5 bars) 30%, rest no retest within 120 min.

## Indices (NQ, SPX, DOW, US2000)

| | n | net R | 2016–22 | 2023–26 |
|---|---|---|---|---|
| Variant 1 base: all breaks signalled from 07:00 | 647 | -0.088 | -0.136 | -0.027 |
| … London closed beyond the Asia range in the trade direction first (trend day) | 601 | -0.043 | -0.106 | +0.034 |
| … not (Asia range not broken that way) | 46 | -0.668 | -0.461 | -1.056 |
| … narrow Asia (secondary) | 111 | -0.175 | -0.133 | -0.229 |
| Variant 2 base: every break, entered at the break (per signal) | 1,142 | +0.070 | +0.080 | +0.054 |
| … acceptance + retest entry, per SIGNAL (no trade = 0) | 1,142 | +0.001 | -0.024 | +0.042 |
| … acceptance + retest entry, per filled trade | 659 | +0.002 | -0.043 | +0.070 |

Retest outcomes: filled 58%, rejected (closed back inside within 5 bars) 26%, rest no retest within 120 min.

**Variant 1 (trend-day filter): FAIL** · **Variant 2 (acceptance-retest entry): FAIL**

## Reading
- **Trend-day filter adds nothing on FX/gold**: 91% of breaks signalled after 07:00 already come on days London broke the
  Asia range that way (a line break usually IS a range break), so the filter keeps almost everything (+0.111 vs +0.115R).
  Narrow-Asia days are WORSE (−0.013R). On indices the filter helps a little (−0.043 vs −0.088R) but stays negative.
- **Acceptance + retest entry is clearly worse**: +0.024R per signal vs +0.119R entering at the break on FX/gold
  (+0.001 vs +0.070R on indices). The rule's money comes from the runaway breaks that never come back for a retest; waiting
  for a pullback trades those for a better price on the ones that fade. 30% of breaks close back inside within 5 bars.
- The plain rich-IV break rule (the paper record) stays as it is.
