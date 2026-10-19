# portfolio-book — results

Prereg: `forge/PORTFOLIO_BOOK_PREREG.md` (committed in `e5dd7a7a`, 2026-10-19; amendments A1–A3 in `38471745`, before
any outcome). Run 2026-10-19, harness seed `0x9e3779b9`, B = 1,000. Branch `main`. Ledger id: `portfolio-book`.
Page: `portfolio-book.html`.

## Verdict: CONTEXT (registered gate not met)

The equal-risk book P1 (S1g core beta, S2 trend, S3g carry, S4 FOMC USD drift, S5g vol-premium proxy) made **net
Sharpe 1.06, 11.7% a year at 11.1% vol, worst drawdown 17.5%**, 2008-02 → 2026-08-21. It passed two of the three gate
checks: bootstrap p 0.002 and both halves positive (0.91 / 1.22). It **failed the deflated-Sharpe bar: 0.49 against
0.95**.

The failure comes from a design error in the prereg. The trial variance the deflation is measured against included the
sign-flipped mirror (Sharpe −1.06), which roughly doubles the spread of trial Sharpes. Excluding the mirror gives DSR
0.958, and the trial's own sampling variance gives 0.998. Both readings are post-hoc and cannot promote the result. The
registered rule leaves it not validated. It is banked as `context`, because the book's performance is described here
and nothing is claimed as predictive. Promotion needs the confirm prereg below.

## Scored cell

| Cell | n (days) | Sharpe | t | p (block bootstrap) | Halves | DSR (N = 11) | Pass bar | Cell verdict |
|---|---|---|---|---|---|---|---|---|
| P1 registered | 5,373 grid dates (incl. weekend rows, see A4) | 1.059 | 4.87 | 0.002 | 0.91 / 1.22 | 0.488 | p < 0.05 ∧ DSR ≥ 0.95 ∧ halves > 0 | gate not met |
| P1 weekend-folded (A4, post-hoc) | 4,645 weekdays | 1.107 | 4.84 | 0.002 | 0.97 / 1.24 | 0.505 | same | gate not met |

Live-promotion bar t ≥ 3: met in both (4.87 / 4.84). The mirror (every sleeve flipped) is −1.06 / −1.11, as it must be.

## Controls and concentration (weekend-folded book; `audit.json`)

- **Leave one sleeve out:** Sharpe 0.94–1.15 whichever sleeve goes. The largest drop is without S5g (0.94, max DD 26.8%).
- **CFD-tradeable only** (no vol proxy, page preset): 0.94, but in-sample 0.42 and first half 0.34; it leans on 2018+. Without the proxy and FOMC as well: 0.81, but its first half
  is only 0.39.
- **Best three years removed** (2012, 2023, 2024): 0.77. **Best 1% of days removed:** 0.67.
- **Stress windows (book %):** GFC +3.7, Volmageddon −2.0, Q4 2018 −3.7, COVID −4.3, 2022 +1.9, yen-carry unwind
  −6.3, tariffs 2025 +2.6.
- **Sleeve correlation:** S1g–S5g 0.45 (both are no-crash bets), S3g–S4 0.34; the rest are within ±0.26.
- **Trade export reconciles** to 99.3% of the book's summed daily returns. The gap is flip-day cost and holiday
  allocation.

## Sleeves alone (descriptive, each scaled to 10%; weekend-folded)

| Sleeve | Sharpe | IS / OOS | Halves | Max DD | Skew | Note |
|---|---|---|---|---|---|---|
| S1 core beta | 0.97 | 0.81 / 1.14 | 0.71 / 1.22 | 19.0% | −0.60 | |
| S1g core beta, gated | 0.92 | 0.71 / 1.16 | 0.61 / 1.23 | 19.3% | −0.59 | the gate costs a little |
| S2 trend | 0.26 | 0.33 / 0.17 | 0.29 / 0.22 | 19.8% | −0.21 | matches the prior ~0.3 |
| S3 carry | 0.11 | −0.67 / 0.53 | −0.61 / 0.41 | 40.9% | −0.33 | only from 2013 (rate vintages) |
| S3g carry, gated | 0.13 | −0.63 / 0.53 | −0.54 / 0.42 | 38.7% | −0.20 | |
| S4 FOMC USD 5-session | 0.95 | 0.26 / 1.07 | −0.51 / 1.11 | 11.5% | +0.61 | 2016+, first half negative |
| S5 vol premium proxy | 1.13 | 1.60 / 0.67 | 1.55 / 0.77 | 33.5% | −6.71 | not tradeable on CFDs |
| S5g vol premium, gated | 0.89 | 1.55 / 0.32 | 1.55 / 0.39 | 37.9% | −8.98 | the gate hurt it OOS |

A single sleeve needs Sharpe > 0.66 to be told apart from zero on this sample (prereg §5). Trend and carry are below
that, so this run says nothing either way about them.

## Deviations from the prereg

- A1–A3 (pre-results): daily gate check for S1g/S3g, S5 notional unit, trade attribution.
- **A4 (post-hoc, data fault):** `px_d1_*` FX and gold carry Saturday/Sunday rows 2002–2013 (DATA_SPEC §5 #9, new). The
  registered scorer counted them as trading days, which **understates** Sharpe and CAGR (5,373 dates for 18.5 years).
  The folded book moves them into the next weekday. It can only describe, and the verdict is unchanged. `runStudy`'s
  leg-level vol and costs still see those rows; register row `harness-weekend-rows`.
- The DSR design error described above is recorded, not corrected.

## What this changes

- The page `portfolio-book.html` shows the standard backtest for any weight set (every try counts as a trial) and exports
  the trades in the owner's import template.
- **Next (to claim):** `portfolio-book-confirm`, with the trial variance computed over the genuine alternatives only (book
  cells), and scored on a forward demo record from 2026-10-20. Live money only after it passes there.
- The vol-premium sleeve needs an executable version (SPX/ES options or VIX futures) before it can be in a live book.
  Until then the CFD-tradeable preset (Sharpe 0.94, first half only 0.34) is the book that can actually be traded.
