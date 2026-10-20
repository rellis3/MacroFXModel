# yen-funding-squeeze — results

Prereg: `forge/YEN_FUNDING_SQUEEZE_PREREG.md` (committed in `138970b2`, 2026-10-20). Run 2026-10-20, seed 20261020, B = 2000.
Branch `main`. Ledger ids: `yen-funding-squeeze-usdjpy`, `yen-funding-squeeze-audjpy`.

## Verdict: UNDERPOWERED (both cells)

The signal is 4-quarter FX-adjusted growth of yen lent to borrowers outside Japan, known two quarters after the quarter. It was set against the next quarter's largest yen squeeze (peak-to-trough fall in the cross), after removing what the previous quarter's realised vol predicts.

Neither cell gets near the gate. The point estimates are about 0 and change sign between halves and across lags. The CIs are too wide (±0.17 to ±0.30) to rule out the 0.15 bar, so the verdict is UNDERPOWERED, not NULL.

## Scored cells

| Cell | n | Partial r | 95% CI | MDE | Useful bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| usdjpy | 118 (1997-Q1 → 2026-Q2) | −0.060 | [−0.251, +0.098] | 0.28 | 0.15 | 1.0 | UNDERPOWERED |
| audjpy | 89 (2004-Q2 → 2026-Q2) | +0.043 | [−0.291, +0.320] | 0.33 | 0.15 | 1.0 | UNDERPOWERED |

## Controls

- **Placebo** (circular shifts): usdjpy [−0.137, +0.150]; audjpy [−0.158, +0.136]. Both observed values are inside.
- **Halves**: usdjpy −0.031 / +0.017; audjpy +0.076 / −0.041.
- **Lag scan**, lags 1–6: usdjpy +0.07, +0.04, −0.06, +0.02, −0.05, −0.02; audjpy +0.08, +0.07, +0.04, +0.08, −0.02, −0.04. No consistent sign.

## Deviations from the prereg

None.

## Descriptive (not part of the verdict)

- EURJPY partial r −0.06 (n 93).
- Largest 5-day yen gain as the outcome: usdjpy +0.09, audjpy +0.04.
- 4-quarter change in the hub share (UK + Singapore + Switzerland as a share of yen lent outside Japan) as the signal: usdjpy +0.09, audjpy 0.00.
- Mean squeeze by tercile of signal (usdjpy): slow 5.2%, middle 4.3%, fast 6.1%. AUDJPY: 5.8 / 6.8 / 7.5%. These are raw, before the vol control; the residual pattern is flat.
- Latest yen-offshore growth: 2025-Q2 −0.1%, Q3 −0.8%, Q4 +2.6%, 2026-Q1 +8.6%.

## What this changes

- The Desk Watch `yen-funding-build` trigger and the JPY currency note keep their context wording ("untested" becomes "tested, underpowered").
- The BIS yen series measures bank lending, while much of the carry trade runs through FX forwards and swaps that the LBS does not count. A direct carry-positioning measure (CFTC JPY leveraged-fund positions, weekly) is the better next test. It needs its own prereg.
