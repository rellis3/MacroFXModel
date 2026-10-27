# rules-book-backtest — results

**Exploratory, and in-sample by construction.** Each rule was found on this same history, so these numbers overstate
what the rules would do from here. Nothing is banked as validated. Register row `rules-book-backtest`. Script
`scripts/rules-book-backtest/backtest.py`, seed 20261026, 1,000 random-entry books. Outputs `results.json`,
`trades.csv`, `equity_futures_carry.csv`.

## The book

| Sleeve | Evidence id | Rule | Trades since 2016 |
|---|---|---|---|
| S1 post-FOMC USD | `post-fomc-usd-drift` | long a 7-pair USD basket 14:30 ET on the FOMC day, out 14:00 ET five weekdays later | 81 |
| S2 VIX beta | `vix-beta-change` | C.OG dR/dt in its bottom decile at close → long NQ next close, 5 sessions | 84 |
| S3 VVIX/VXN | `vix-second-derivative` | 5-session change of log(VVIX/VXN) in its top decile → long NQ next close, 20 sessions | 67 |

- One position per sleeve; a new flag during a trade is ignored.
- Every trade risks 1% of capital per expected 1σ move over its hold (EWMA σ known at entry).
- Costs: S1 uses the harness's per-leg spread and slippage. NQ pays a 1-point round trip plus carry, either
  futures-style (T-bill − 0.8% dividends) or CFD-style (T-bill + 2.5%).
- Not modelled: S1 financing on the 7 FX legs (the harness reports it only as a breakeven).

## Results, 2016-01 → 2026-08-21

| | Trades | Hit | Mean per trade | Mean R | Sharpe (daily) | Max DD | Time in market |
|---|---|---|---|---|---|---|---|
| S1 post-FOMC USD | 81 | 65% | +24.7 bp | +0.29 ± 0.13 | 0.68 | −6.9% | 15% |
| S2 VIX beta (5d) | 84 | 63% | +54 bp | +0.26 ± 0.13 | 0.63 | −6.1% | 15% |
| S3 VVIX/VXN (20d) | 67 | 72% | +253 bp | +0.44 ± 0.10 | 1.12 | −3.3% | 48% |
| **Book (futures carry)** | 232 | | | | **1.25** (6.9%/yr at 5.5% vol, t 4.1) | −8.5% | |
| Book (CFD carry) | 232 | | | | 1.15 (6.3%/yr) | −8.8% | |

The three sleeves are nearly independent: daily P&L correlations are S1–S2 +0.01, S1–S3 −0.02 and S2–S3 +0.27.

Book by year: 2016 +4.0%, 2017 +10.9, 2018 +16.0, 2019 +3.5, 2020 +15.4, 2021 +8.6, **2022 −4.2**, 2023 +8.8,
2024 +2.1, 2025 +7.4, 2026 (to Aug) +3.1.

### Against random entries (same trade counts, holds and sizing)

| | Real Sharpe | Random mean | Random 95th pct | Real's percentile |
|---|---|---|---|---|
| S1 (vs non-FOMC 5-day windows) | 0.68 | −0.14 | 0.34 | 99.7% |
| S2 | 0.63 | 0.30 | 0.73 | **89%** |
| S3 | 1.12 | 0.45 | 0.84 | 99.6% |
| Book | 1.25 | 0.29 | 0.71 | 100% |

Random long-NQ trades earn a Sharpe of 0.3–0.45 from the index's drift alone. That's the bar the NQ rules have to
clear, not zero.

### The least in-sample stretch: from 2021 (the VIX studies' `test` split)

| | |
|---|---|
| Book Sharpe since 2021-01 | 0.82 (CFD 0.73), t 1.98, 4.4%/yr |
| S2 since 2021 | 45 trades, +0.09 R ± 0.16, hit 56%: **no better than noise** |
| S3 since 2021 | 34 trades, +0.32 R ± 0.15, hit 62% |

## Reading it

- **The combination works as intended.** Three nearly uncorrelated sleeves, each in the market part of the time,
  make a smoother book than any one of them: Sharpe 1.25, against 0.29 for random books of the same shape. Equal
  risk per trade keeps the large NQ moves from swamping the FX sleeve.
- **S1 and S3 carry it.** Both sit above 99% of random books. S3's 72% hit rate is partly the NQ drift: random
  20-day longs win often too, and its edge over random is about +0.7 Sharpe.
- **S2 is the weak link.** It's at the 89th percentile against random, and since 2021 it's indistinguishable from
  noise. It would be the first sleeve to drop if a forward record doesn't support it.
- **Expect less from here.** Since 2021 the book runs about Sharpe 0.8 rather than 1.25, and even that period was used
  to validate S1. Every rule was chosen on this history. A forward record is the only clean test.
- **2022 was the only losing year** (−4.2%), when the NQ sleeves bought into a falling market.

## What this changes

- It answers "can we backtest it?": yes, and the shape is encouraging. The number to plan around is the post-2021
  one (Sharpe ~0.8), not 1.25.
- Next, if wanted: a prereg for a frozen version of this book, scored only on data nobody has used (the lockbox
  after 2026-08-21, once 60+ sessions exist, and a paper record from now). Drop or down-weight S2 before freezing,
  and say so in that prereg.
