# bank-credit-panel — results

Prereg: `forge/BANK_CREDIT_PANEL_PREREG.md` (committed in `138970b2`, 2026-10-20). Run 2026-10-20, seed 20261020, B = 2000, 1000 label shuffles.
Branch `main`. Ledger ids: `bank-credit-panel-equity`, `bank-credit-panel-fx`.

## Verdict: UNDERPOWERED (equity) · NULL (fx)

The signal is each country's 4-quarter FX-adjusted growth in cross-border bank borrowing, known two quarters after the quarter. It is demeaned across countries each quarter and correlated with the demeaned next-quarter return.

**Equity.** IC −0.028, 95% CI [−0.089, +0.027]. The gate fails: the CI includes 0, the halves disagree (−0.052 / +0.017), and the result is inside the shuffle placebo [−0.037, +0.036]. The CI still reaches past −0.05, so the cell is UNDERPOWERED rather than NULL.

**FX.** IC +0.008 [−0.029, +0.044], inside ±0.05, so NULL. Within a quarter, a country's borrowing growth tells you nothing about its currency next quarter.

The cross-country retest of `bank-credit-dollar-nasdaq` therefore finds no relative-performance effect at the quarterly horizon.

## Scored cells

| Cell | n (country-quarters) | Quarters | Countries | IC | 95% CI | MDE | Useful bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| equity | 3,648 (1988-Q1 → 2026-Q2) | 154 | 28 | −0.028 | [−0.089, +0.027] | 0.08 | 0.05 | 0.68 | UNDERPOWERED |
| fx | 1,773 (2004-Q1 → 2026-Q2) | 90 | 20 (euro area as one) | +0.008 | [−0.029, +0.044] | 0.12 | 0.05 | 0.68 | NULL |

## Controls

- **Label-shuffle placebo** (within each quarter): equity [−0.037, +0.036]; fx [−0.031, +0.031]. Both are centred on 0.
- **Leave-one-country-out**: no single country flips the equity sign. Dropping Indonesia flips the FX sign (it was ≈ 0 anyway).
- **Lag scan** (descriptive). Equity IC at lags 1–6: −0.021, −0.039, −0.028, −0.035, −0.031, −0.016. Consistently slightly negative and never significant. FX: +0.004 to +0.013.

## Deviations from the prereg

- Equity outcomes start in 1988-Q1 (the first quarter with at least 8 countries), not 1987-Q1.
- The FX cell's first quarter is 2004-Q1 (Yahoo FX history), not 2004-Q2.
- Nothing else changed.

## Descriptive (not part of the verdict)

- **Within-country time series** (each country demeaned over time, so the global factor is NOT removed): pooled r −0.059, and 23 of 28 countries are negative. This is the credit-boom sign seen in the literature, but it mixes in the global cycle (the same thing the Nasdaq test saw), so it is not independent evidence. It points to a multi-year-horizon prereg, not a quarterly one.
- **Equity terciles** (demeaned next-quarter return): slow borrowers +0.04%, middle +0.12%, fast −0.17%. Small.
- **FX terciles**: slow −1.44%, middle +0.06%, fast +1.39%, yet the IC is ~0. The tercile means are driven by a few large devaluations (TRY, BRL, IDR) in low-growth quarters. That is outlier-driven and not a pattern.
- Average per-quarter IC: equity −0.038 (55% of quarters negative); fx −0.021 (50%).

## What this changes

- bank-credit.html and today.html keep the regime wording only. There is no country ranking.
- The `bank-credit-dollar-nasdaq` context entry now notes that the cross-country retest found no quarterly relative effect.
- What would reopen it: a 2–3 year horizon (the literature's), with its own prereg. Use non-overlapping windows or HAC errors, and expect a much smaller effective n.
