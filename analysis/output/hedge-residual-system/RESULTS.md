# hedge-residual-system — results

Prereg: `forge/HEDGE_RESIDUAL_SYSTEM_PREREG.md` (committed in `8430dadb`, 2026-11-06; power table and scripts in
`8587b27d` before it). Run 2026-11-06 (`ranAt` 2026-11-06T17:18Z), seed 20261106, B = 2000, 200 placebo draws, run once.
Branch `worktree-agent-a4107183ccffa1412`. Ledger ids: `hedge-residual-mr`, `hedge-residual-mom`, `hedge-residual-carry`.

## Verdict: NULL (MR), NULL (MOM), UNDERPOWERED (CARRY)

The question was whether the Hedge finder's relationship can be traded on its own: long a desk pair, short its best
partner at the finder's rolling min-variance ratio, with the partner chosen point-in-time each month. The sample was
2017-03-31 → 2026-08-20 (2,436 sessions, 9.4 years, 113 monthly selections, 14.9 spreads on average), hourly decisions,
both legs costed. **Mean reversion of the residual nets −1.19 Sharpe [−1.76, −0.60]** and **residual momentum nets −1.78
[−2.45, −1.08]**. Both intervals exclude the 0.5 bar by a wide margin, both halves are negative, and both cells are
**NULL** under rule 1. **Carry of the spread nets +0.08 [−0.55, +0.70]**. A 0.5 Sharpe is not ruled out (the upper bound
is 0.70), it is not positive in both halves (−0.03 / +0.18), and it sits at the 11th percentile of random partners, so
the cell is **UNDERPOWERED** (MDE 1.20 against a 0.5 bar, as registered). Gross of costs, no cell is distinguishable
from zero (MR +0.16, MOM +0.11, CARRY +0.44, every CI includes 0). The spread is not tradable as a system on this design.

## Scored cells

| Cell | n | Trades | Net Sharpe | 95% CI | Halves (to 2021-12 / from) | MDE (Holm) | Pass bar | Holm p | Placebo pct (median, p95) | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| MR | 2,436 sessions | 9,353 | **−1.19** | [−1.76, −0.60] | −1.17 / −1.21 | 1.01 | ≥ 0.5 | 1.1e−4 (negative) | 0th (−0.59, −0.39) | **NULL** |
| MOM | 2,436 | 18,791 | **−1.78** | [−2.45, −1.08] | −2.42 / −1.14 | 1.05 | ≥ 0.5 | 1.1e−6 (negative) | 3.5th (−1.50, −1.24) | **NULL** |
| CARRY | 2,436 | 1,869 | **+0.08** | [−0.55, +0.70] | −0.03 / +0.18 | 1.20 | ≥ 0.5 | 0.81 | 11th (+0.22, +0.41) | **UNDERPOWERED** |

The Holm p-values of MR and MOM are "significant" only in the losing direction. The gate requires a positive estimate,
so they count against the cells. NULL rule 1 also needs estimate + 1.96 × the Monte-Carlo SE below 0.5: MR −0.58, MOM
−1.14 (both hold); CARRY +0.80 (fails, which leaves it UNDERPOWERED).

## Benchmarks and controls

| Arm | Net Sharpe | Gross | Costs × 2 | Cost drag (P&L units / yr) | Placebo net median |
|---|---|---|---|---|---|
| MR | −1.19 | +0.16 [−0.44, +0.81] | −2.57 | 1.30 | −0.59 |
| MOM | −1.78 | +0.11 [−0.52, +0.74] | −3.50 | 2.59 | −1.50 |
| CARRY | +0.08 | +0.44 [−0.20, +1.06] | −0.29 | 0.51 | +0.22 |
| HOLD (buy-and-hold of the spread) | −0.53 [−1.13, +0.05] | −0.03 | −1.00 | 0.46 | −0.06 |

- **Placebo (random partner, same β method).** The placebo's buy-and-hold sits near zero (median −0.06), so the design
  is not biased. In MR, random partners do *better* than the finder's partner (gross median +0.34 against the real
  +0.16, which is at the 8.5th percentile). A tight hedge leaves a small residual, so the same spread cost is a bigger
  share of what the trade can earn. MOM gross with the finder's partner sits at the 96.5th placebo percentile, but its
  gross level is +0.11 with a CI spanning zero, and it loses in the first half (−0.58).
- **Concentration (net Sharpe by year).** MR is negative in 9 of 10 calendar years (2023 +0.18). MOM is negative in 9 of
  10 (2026 partial year +0.70). CARRY is mixed: 5 of 10 years positive, with 2024 +0.94 and 2026 +1.73; the last three
  years run +0.17, +0.94, −0.20, +1.73 (2023 to 2026).
- **Positive control (pre-run, synthetic).** A planted OU residual with a 24-hour half-life came through MR at gross 1.29
  / 2.99. The pipeline finds hourly residual reversion when it exists; the real residuals do not show it.

## Decomposition (prereg §4 D-cells, BH q = 0.10)

| Part | Estimate | 95% CI | Halves | Placebo pct | BH | Candidate |
|---|---|---|---|---|---|---|
| D1 MR gross Sharpe | +0.16 | [−0.44, +0.81] | +0.18 / +0.15 | 8.5 | no | no |
| D2 MOM gross Sharpe | +0.11 | [−0.52, +0.74] | −0.58 / +0.79 | 96.5 | no | no |
| D3 CARRY gross Sharpe | +0.44 | [−0.20, +1.06] | +0.33 / +0.55 | 32.5 | no | no |
| D4 MR gross per trade (bp of X notional) | +0.89 | [−0.66, +2.29] | — | — | no | no |
| D5 CARRY spot-only gross Sharpe | +0.11 | [−0.52, +0.73] | +0.07 / +0.15 | — | no | no |

The MR trade earns about +0.9 bp gross and pays about 3.3 bp in spreads across both legs (entry plus exit). The residual
does drift back a little, but about a quarter of what crossing two spreads costs. Carry's gross +0.44 is mostly the
accrual it collects by construction: the price leg alone is +0.11 and is not significant. No part is a reusable
candidate.

**Disaggregation by target pair (63 cells, BH q = 0.10).** 16 survive BH, against 3.2 expected by chance, and **all 16
are losses** (7 MR, 9 MOM, net −0.89 to −1.52). This is the cost drag showing up pair by pair, not a hidden edge. The
best positive slices (CARRY EURCAD +0.39, EURUSD +0.37, p ≥ 0.20) do not survive.

**What the finder picked.** The slots are mostly near-duplicates of one currency: AUDJPY/NZDJPY (98 of 113 months),
USDJPY/CADJPY (96), AUDUSD/NZDUSD (79), GBPAUD/GBPNZD (74), EURAUD/EURNZD (59), AUDCAD/NZDCAD (58), EURUSD/GBPUSD (55).
The residual of most slots is one cross (AUD/NZD in four forms, USD/CAD, EUR/GBP), so the 15 slots are far fewer
independent bets than they look.

## Deviations from the prereg

None. One field added to `results.json` after the run (`preregCommit`, `verdict`, `dataSource`); no number changed.

## Data source and checks

Local OANDA mid M1 cache in the main checkout (10 instruments, 7 currencies, 2016-01-04 → 2026-08-20): OANDA answers 401
here (no key), R2 has no credentials, and FRED/BIS answer only for daily rates. The checks run before scoring were: 0
non-finite hourly returns across the 21 pairs; 1–28 hours with no own bar per instrument (forward-filled); the largest
hourly moves are real events (Brexit 2016-06-24, the 2019-01-02/03 JPY flash crash, the RBNZ cut of 2016-03-10 NZ time); the NY
close maps to 21:00/22:00 UTC by DST; the last session 2026-08-20 is complete and nothing after the lockbox date is read;
the synthetic positive control passed; the bootstrap SE agreed with the Monte-Carlo SE within about 15%.

## What this changes

- The Hedge finder card and `MD files/HEDGING_VS_SPREAD.md` may say that the finder's pairs traded as a spread (residual
  mean reversion or residual momentum, hourly, both legs costed) lost money net on 2017–2026 history. They lose about
  1.2 and 1.8 Sharpe, mostly to spreads on both legs, with no gross edge to pay for them. The retired hedge signals stay
  retired.
- Carry of the spread: no claim either way (UNDERPOWERED; its gross is mostly accrual, before any swap markup).
- **What would reopen it.** For MR/MOM: a design that trades far less than once per hedge-ratio refresh, or an execution
  cost well under 1 bp per leg. At today's spreads the gross edge measured here (+0.9 bp per trade) cannot pay for two
  legs. A different partner rule on economically linked pairs (gold vs the USD basket, index pairs), which needs data
  this sandbox does not have. For CARRY: a longer history (OANDA M1 to 2005 via Railway, SE ≈ 0.22) or a forward
  record, with the broker's real swaps.
