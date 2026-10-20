# tff-basis-rates-vol — results

Prereg: `forge/TFF_BASIS_RATES_VOL_PREREG.md` (committed in `7186d20b`, 2026-10-21). Run 2026-10-21, seed 20261021, B = 2000.
Branch `main`. Ledger ids: `tff-basis-rates-vol-level`, `tff-basis-rates-vol-build`.

## Verdict: UNDERPOWERED (level) · UNDERPOWERED (build)

The signal is the CFTC leveraged-fund net Treasury futures position (2Y+5Y+10Y+bond, $bn face; the basis-trade side), read point-in-time from the feature store every Friday. The outcome is the next 20 trading days' realised vol of the 10-year yield, after removing what the previous 20 days' vol predicts.

- **level** (how large the short is versus its trailing 3 years): partial r −0.037 [−0.145, +0.073]. Wrong sign, both halves negative, inside the placebo.
- **build** (13-week growth of the short): partial r +0.062 [−0.050, +0.180]. Both halves positive (+0.012 / +0.092) but inside the shift placebo [−0.142, +0.134], and Holm p 0.58.

Neither CI excludes the 0.10 useful bar, so both cells are UNDERPOWERED. The weekly data does not rescue the quarterly Cayman lead (`nbfi-rates-vol`).

## Scored cells

| Cell | Weeks | Partial r | 95% CI | MDE | Useful bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| level | 881 (2009-09 → 2026-07) | −0.037 | [−0.145, +0.073] | ≈0.21 | 0.10 | 0.58 | UNDERPOWERED |
| build | 881 | +0.062 | [−0.050, +0.180] | ≈0.21 | 0.10 | 0.58 | UNDERPOWERED |

## Controls

- **Shift placebo** (circular shifts of at least 52 weeks, every 4th): level [−0.158, +0.198]; build [−0.142, +0.134].
- **Persistence fit**: log RV_fwd = 0.62 × log RV_back + 1.66.
- **By year** (descriptive): no stable sign. The level cell is +0.48 in 2020 and −0.24 in 2025; the build cell is +0.04 in 2020 and −0.45 in 2025. The two known unwinds (March 2020, April 2025) do not line up with the signal in the same way.

## Deviations from the prereg

- A1 (describe): the first usable week is 2009-09-11, not 2007-06. The signal needs 170 weekly TFF rows (a 156-week window plus a 13-week change), and TFF starts in 2006-06. That gives 881 weeks instead of about 990, so the MDE is about 0.21 instead of 0.19.

## Descriptive (not part of the verdict)

- Largest 5-day 10-year move in the next 20 days as the outcome: level −0.006, build +0.059.
- MOVE (20-day mean, to 2026-09-21) as the outcome: level −0.045, build +0.077 (n 881).
- Mean next-20-day 10-year RV by build tercile: 77 / 78 / 84 bp. By level tercile: 82 / 76 / 81 bp.
- Latest (2026-08-21): net −$725bn; level −1.08 (smaller than its trailing-3-year average short); build −1.01 (shrinking).

## What this changes

- The Desk Watch `basis-trade-record` trigger and the funding block describe the basis-trade size; they do not claim a vol effect.
- Across `nbfi-rates-vol` and this study, leverage size and growth measured by positions have not predicted Treasury vol beyond persistence. A different angle would be repo stress *during* a build-up (SOFR−IORB and SOFR volume together), which would need its own prereg.
