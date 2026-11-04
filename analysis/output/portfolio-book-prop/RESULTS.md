# portfolio-book-prop — results

Prereg: `forge/PORTFOLIO_BOOK_PROP_PREREG.md` (committed in `baa30079` with its register row, before any simulation).
Run 2026-11-04/05, seed 20261104, 5,000 paths per cell, block 5. Scripts `scripts/portfolio-book-prop/`
(`build_rows.mjs` → `prop.py`; A1 `posthoc_full_mean.py`). Simulation imported from
`scripts/overnight-hold-toolkit/toolkit.py`. Ledger id `portfolio-book-prop`.

**Toolkit uploads** (C.OG's `Date,Return %,MAE %`, one row per day): `toolkit_A.csv` (tradeable book),
`toolkit_B.csv` (reference). Standard system outputs: `analysis/output/systems/portfolio-book-prop/` (not committed;
upload with `writeSystemOutputs.mjs ... --push`).

## Verdict: CONTEXT

On FTMO 2-step rules, the Portfolio Book's CFD-tradeable sleeves (core beta, trend, carry; all haircuts) get funded
**33% of the time at 1× (a 10%-vol book) vs 16% for a zero-edge copy**. That is +17pp and an edge EV of +1.4% of the
account per attempt. THE GATE reads **yes on the letter** at 0.5× and 1×. Three things hollow that out:

1. **The window flatters the book.** Intraday bars exist from 2016, and the book's Sharpe on 2016-26 is **0.56**,
   against **0.21** over 2008-26. Reset to 0.21 (A1, post-hoc): funded **21% vs 15%** at 1×, edge **+6pp**, edge EV
   **+0.4%** of the account per attempt (about €390 on 100k, against a €540 fee that zero edge mostly recovers too).
2. **At the low end of the edge band the edge is gone:** 16.4% vs 16.3% funded at 1×, edge EV +0.05%. Gate leg (b)
   passes by 0.05 points. It does not discriminate.
3. **It is slow and it can't be sped up.** The median funded pass takes **205 trading days** (~10 months) at 1×, and
   514 at 0.5×. At 2× the 5% daily limit kills 95% of phase-1 attempts (funded 1.4%).

So a prop challenge on this book is worth roughly the fee back plus a little, about a year later. That is not the
"covers the subscription" picture.

## Book A (tradeable), FTMO 2-step, intraday equity (conservative: all legs at their worst together)

Daily mean +0.0231% [95% CI +0.0004, +0.0442], σ 0.651%, 2,763 days 2016-01-04 → 2026-08-21.

| Size | Funded | Zero edge | Edge | Median days | EV / attempt | Edge EV | Funded at band low / high | Edge EV at band low |
|---|---|---|---|---|---|---|---|---|
| 0.5× | 29.9% | 7.5% | +22.4pp | 514 | +0.61% | +0.98% | 7.0% / 62.1% | +0.01% |
| **1×** | **33.1%** | **16.3%** | **+16.8pp** | **205** | **+1.52%** | **+1.40%** | 16.4% / 49.5% | +0.05% |
| 2× | 1.4% | 0.6% | +0.8pp | 32 | −0.53% | +0.01% | 0.5% / 1.3% | 0.00% |
| 3× | 0.2% | 0.1% | +0.1pp | 14 | −0.54% | 0.00% | — | 0.00% |
| 5× | 0.0% | 0.0% | 0 | — | −0.54% | 0.00% | — | 0.00% |

EV = P(funded) × 12-month payouts (80% split, monthly) − 0.54% fee. Edge EV = EV − zero-edge EV (the fee cancels).

## Sensitivities (Book A)

| Cell | 0.5× funded / zero | 1× funded / zero | 2× funded / zero | 3× | 5× |
|---|---|---|---|---|---|
| Intraday (primary) | 29.9 / 7.5 | 33.1 / 16.3 | 1.4 / 0.6 | 0.2 / 0.1 | 0 / 0 |
| Close-to-close only (optimistic bound) | 29.8 / 7.3 | 57.8 / 27.7 | 43.4 / 29.4 | 30.0 / 22.6 | 21.6 / 18.0 |
| Block 21 | 27.5 / 6.5 | 29.3 / 13.5 | 1.4 / 0.7 | — | — |

The truth sits between the intraday and close-only rows. The intraday bound counts every losing leg at its worst
together and ignores the winners, so its median day is −1.41% (σ 0.65%). At 2× the two bounds disagree completely
(1% vs 43% funded), so **the sizing answer depends on a number this study could only bracket**. A tick- or
M1-level equity path of the whole book would settle it.

## Halves (Book A, edge pp / edge EV)

| Size | 2016-2020 | 2021-2026 |
|---|---|---|
| 0.5× | +11.3pp / +0.44% | +35.4pp / +1.67% |
| 1× | +11.6pp / +0.94% | +18.2pp / +1.50% |
| 2× | +0.4pp / +0.01% | +0.3pp / +0.00% |

## A1 (post-hoc, describe only): the mean at the full-history Sharpe 0.21

| Size | Funded | Zero edge | Edge | Median days | EV | Edge EV | Close-only: edge / edge EV |
|---|---|---|---|---|---|---|---|
| 0.5× | 13.0% | 7.1% | +5.9pp | 536 | −0.14% | +0.22% | +5.6pp / +0.22% |
| 1× | 21.3% | 15.5% | +5.8pp | 225 | +0.50% | +0.39% | +9.0pp / +0.76% |

## How far away (prereg §8): the 1× edge with the mean scaled up

| Book Sharpe | Funded | Zero edge | Edge | Edge EV |
|---|---|---|---|---|
| 0.21 (full history, A1) | 21% | 15% | +6pp | +0.4% |
| 0.56 (2016-26 window) | 33% | 16% | +17pp | +1.4% |
| 1.13 | 49% | 15% | +34pp | +3.6% |
| 1.69 | 63% | 16% | +47pp | +6.8% |
| 2.25 | 70% | 15% | +55pp | +9.8% |

A challenge only starts paying clearly (an attempt returning several fees) at a daily book Sharpe above ~1, with a
daily distribution tight enough to survive 5% days.

## Book B (reference only: includes the VIX² short-variance proxy, not tradeable on MT5)

1×: funded 32.6% vs 17.8% zero edge, edge EV +1.66%, band low +0.25%. The vol proxy adds days of −14.5% (worst
daily return) that end challenges at any size above 1×. Book B's reconstruction correlation is 0.79 because the
proxy leg has no position path (expected; the stop rule applies to Book A, which passed at 0.998).

## Checks

- Reconstruction (stop rule): Book A Σ exposure × close return vs book return, correlation **0.9978** (≥ 0.98).
- Intraday bars: 21 of 43,003 in-window leg-days without an NY-close bar (close-to-close loss used). An earlier run
  counted 2008-15 leg-days as missing (23,139), which was a counting fault and not a data gap. Fixed before any prop cell ran.
- Close-only MAE: the first build summed the losing legs. The prereg defines it as min(0, day return). Fixed
  before any prop cell ran.

## What this does not tell you

Whether the edge is real (parent: context, 0.21). FTMO's spreads, swaps, symbol list and leverage caps, and whether
weekend holding is allowed on the account type (the book holds over weekends). The replica vs the real toolkit:
upload `toolkit_A.csv` to compare.
