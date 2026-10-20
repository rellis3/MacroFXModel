# nbfi-rates-vol — results

Prereg: `forge/NBFI_RATES_VOL_PREREG.md` (committed in `138970b2`, 2026-10-20). Run 2026-10-20, seed 20261020, B = 2000.
Branch `main`. Ledger id: `nbfi-rates-vol`.

## Verdict: UNDERPOWERED

The signal is 4-quarter FX-adjusted growth of cross-border USD claims on the Cayman Islands, known two quarters after the quarter. It was set against the next quarter's 10-year Treasury realised vol, after removing what the previous quarter's vol already predicts.

The partial r is **+0.13, 95% CI [−0.000, +0.263]**. It lies outside the circular-shift placebo [−0.147, +0.119], but the CI touches 0 and the halves disagree (1979–2007 +0.10; 2008–2026 −0.01). The gate fails, and the CI still includes the 0.15 useful bar, so the cell is UNDERPOWERED.

## Scored cell

| Cell | n | Partial r | 95% CI | MDE | Useful bar | Verdict |
|---|---|---|---|---|---|---|
| Cayman USD growth → 10Y RV residual | 188 (1979-Q3 → 2026-Q2) | +0.132 | [−0.000, +0.263] | 0.20 | 0.15 | UNDERPOWERED |

## Controls

- **Placebo** (165 circular shifts of at least 12 quarters): [−0.147, +0.119], centred near 0. The observed value is just outside.
- **Halves**: +0.105 (n 114) / −0.008 (n 74). The effect is in the pre-2008 era. Since 2008, the era of the basis trade, it is about zero.
- **Lag scan** (descriptive), partial r at lags 1–6: +0.11, +0.18, +0.13, +0.20, +0.15, +0.08. Positive at every lag.

## Deviations from the prereg

- A1 (describe): Cayman data start earlier than the prereg expected, so the sample is 188 quarters from 1979-Q3 rather than about 150. The MDE falls to about 0.20. The registered rule (first quarter with data plus 7) was followed; only the count differs.

## Descriptive (not part of the verdict)

- Raw correlation of Cayman growth with the level of log RV: +0.35. Most of this is persistence: the 1980s had both high vol and fast offshore growth.
- Persistence fit: log RV(q+3) = 0.76 × log RV(q+2) + 1.10.
- The same test with other measures: 5-year Treasury RV +0.12; largest 5-day 10-year move +0.13; MOVE index (2003+, n 94) +0.04; non-bank financial borrowing (2014+, n 44) −0.10.
- Terciles of Cayman growth, mean 10-year RV next quarter: slow 90 bp, middle 98 bp, fast 124 bp (residuals −0.03 / −0.01 / +0.04 log points).
- Latest Cayman USD growth: 2025-Q2 +24%, Q3 +25%, Q4 +29%, 2026-Q1 +20%, all in the fast tercile.

## What this changes

- The Cayman tile stays a leverage description. There is no "more rates vol" claim.
- The sign is consistent across lags, and the 5-year, 10-year and largest-move outcomes agree. That makes it the best candidate here for more data: CFTC TFF leveraged-fund Treasury futures shorts (weekly, 2006+) measure the basis trade directly, and at weekly frequency they would give far more observations. That needs its own prereg.
