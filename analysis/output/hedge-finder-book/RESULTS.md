# hedge-finder-book — results

Prereg: `forge/HEDGE_FINDER_BOOK_PREREG.md` (committed in `25f8f1a0`, 2026-11-06, before `run.mjs` existed). Run
2026-11-06, seed 20261106, B = 2000 (paired circular moving blocks of 21 days), 200 placebo draws. Branch
`worktree-agent-a91c6673ee0e34bfa`. Ledger ids: `hedge-finder-book` (the joint question), `hedge-finder-book-es` (the
powered ES cell, whose own word differs).

Sample: 6,574 days, 2000-06-01 → 2026-08-21 (lockbox: nothing after it read). Proxy book: 60-day trend cards on the
desk's 28 G10 pairs through the desk's own cap (`capExposure`, cap 4). Hedge: the live tab's `bookHedges` top row, window
60, data to t−1, sized side × ratio × |net|, held for day t, costs on. 19 of the panel's 26 instruments (no gold, silver,
platinum, copper, S&P 500, Dow, Russell 2000).

## Verdict: UNDERPOWERED (`hedge-finder-book`) · VALIDATED (`hedge-finder-book-es`)

**The joint question is UNDERPOWERED** (prereg rule 6). The finder's hedge cut the book's daily 5% expected shortfall
by **9.2% [−11.4%, −7.0%]** (P1 passes: bar −5%, CI excludes 0, cut in both halves and in all 27 calendar years), and it
did much better than a random eligible candidate (P4: 0th percentile of 200 placebo draws, whose median cut was 3.4%).
But **max drawdown did not move: +0.5% [−18.1%, +31.7%]** (P2, underpowered by design: MDE 8–38pp against a 5% bar),
and **Sharpe fell by 0.056 [−0.141, +0.034]**, so "not worse by more than 0.10" is not established (P3 fails) though not
ruled out either. Neither a pass nor a null, so UNDERPOWERED. The ES cell on its own meets its registered bar and beats
the placebo: **`hedge-finder-book-es` is VALIDATED** (research-only; |t| ≈ 8). **The naive hedge did better.** Trading the
exposure currency's own USD pair (DXY for USD) cut ES by 16.6% [−18.4%, −14.7%], 8.8pp more than the finder
([+6.4, +11.5]). The finder beat the DXY-for-everything hedge (−4.2%).

## Scored cells

| Cell | n | Estimate | 95% CI | MDE | Pass bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|
| P1 ES5, F vs U (relative) | 6,574 days | **−9.2%** | [−11.4%, −7.0%] | 3.1pp | ≤ −5%, CI < 0 | < 1e-15 | pass |
| P2 max drawdown, F vs U (relative) | 1 path | **+0.5%** | [−18.1%, +31.7%] | 8–38pp | ≤ −5%, CI < 0 | 0.97 | underpowered (by design) |
| P3 Sharpe, F − U | 6,574 days | **−0.056** | [−0.141, +0.034] | 0.11–0.16 | CI lower > −0.10 | — | fail (not ruled out) |
| P4 placebo percentile of F's ES change | 200 draws | **0th** | placebo median −3.4% (p5 −4.5%, p95 −2.2%) | — | ≤ 5th | — | pass |
| Gate: P1 cut in both halves | | −10.7% / −6.3% | | | both < 0 | | pass |

Verdict rules, in the registered order: 1 (P1 lower > −5%) no; 2 (P2 lower > −5%) no; 3 (P3 upper < −0.10) no; 4 (P1
passes, P4 fails) no; 5 (gate) no: P2 and P3 fail; 6 → **UNDERPOWERED**. P1's own word: passes and beats the placebo →
**VALIDATED** (banked as `hedge-finder-book-es`, prereg header and §8).

## Arms (levels, units of one size-1 card; 95% CI)

| Arm | ES5 (daily) | Max drawdown | Sharpe | Annual return | Yearly drawdown | ES5 of 21-day sums |
|---|---|---|---|---|---|---|
| U unhedged | 0.138 [0.125, 0.155] | 5.98 | −0.20 [−0.56, +0.14] | −0.184 | 1.01 | 0.499 |
| **F finder** | 0.125 [0.115, 0.138] | 6.01 | −0.25 [−0.61, +0.10] | −0.215 | 0.96 | 0.474 |
| C1 own USD leg / DXY | 0.115 [0.105, 0.128] | 6.50 | −0.30 [−0.65, +0.05] | −0.234 | 0.90 | 0.428 |
| C2 DXY | 0.132 [0.120, 0.148] | 6.64 | −0.24 [−0.61, +0.11] | −0.218 | 1.00 | 0.485 |

Paired changes against U (relative for ES / drawdowns, absolute for Sharpe and annual return):

| | ES5 | Max DD | Sharpe | Annual return | Yearly DD | 21-day ES5 |
|---|---|---|---|---|---|---|
| F − U | −9.2% [−11.4, −7.0] | +0.5% [−18.1, +31.7] | −0.056 [−0.141, +0.034] | −0.030 [−0.113, +0.051] | −5.0% [−9.6, +0.0] | −4.9% [−9.4, −0.0] |
| C1 − U | −16.6% [−18.4, −14.7] | +8.8% [−19.9, +39.7] | −0.099 [−0.206, +0.001] | −0.050 [−0.156, +0.046] | −11.2% [−16.6, −6.1] | −14.2% [−17.4, −9.5] |
| C2 − U | −4.2% [−5.6, −2.7] | +11.1% [−10.5, +28.4] | −0.045 [−0.110, +0.018] | −0.034 [−0.093, +0.026] | −1.2% [−5.1, +2.1] | −2.7% [−5.6, +1.9] |
| F vs C1 | +8.8% [+6.4, +11.5] | −7.6% [−26.7, +29.6] | +0.044 [−0.067, +0.161] | +0.019 | +6.9% [+0.7, +14.3] | +10.8% [+4.1, +16.2] |
| F vs C2 | −5.3% [−7.5, −3.1] | −9.5% [−21.7, +21.6] | −0.011 [−0.094, +0.081] | +0.003 | −3.9% [−7.7, +1.1] | −2.2% [−6.5, +1.4] |

**Annual return given up:** 0.030 units a year [−0.051, +0.113], about 3% of the book's annual volatility (≈ 0.94 units).
Gross of costs the finder's hedge earned +0.017 a year and Sharpe rose +0.014 [−0.067, +0.100]; its costs (0.048 a year,
2,426 instrument switches in 6,574 days, re-sized daily) are the whole Sharpe loss.

## Controls

- **Placebo (200 random eligible candidates, same sizing, switching when the finder switches):** ES cut median −3.4%
  (5th–95th −4.5% to −2.2%); the finder's −9.2% is below every draw. Max drawdown: placebo median +16.3%, the finder's
  +0.5% sits at the 7th percentile. Sharpe: placebo median −0.086, finder at the 82nd percentile (the finder gives up less).
- **Naive (the mirror):** the own-USD-leg hedge beats the finder on ES, 21-day ES and yearly drawdown; DXY for everything
  is worse than the finder on ES.
- **Same-clock pool (FX only, 16 instruments):** ES −9.3% [−11.5, −7.1], max DD +0.8%, Sharpe −0.057: the three non-FX
  candidates (WTI, Brent, Nasdaq 100) with their different clocks change nothing.
- **Costs:** gross ES −9.4%, Sharpe +0.014; at 2× costs ES −8.8% [−11.1, −6.6], Sharpe −0.125 [−0.228, −0.027].
- **Concentration (descriptive, post-hoc A1):** ES cut in 27 of 27 calendar years (2008 −21.3%, 2026 −0.3%); last 3
  years −4.6% (C1 −14.9%); without the book's worst 1% of days −7.4% (C1 −14.7%).

## Disaggregation: ES5 change by the exposure currency (BH q = 0.10, 8 cells; descriptive, candidates only)

| Biggest exposure | days | F vs U ES5 | 95% CI | BH |
|---|---|---|---|---|
| USD | 787 | **+1.0%** | [−3.2, +5.4] | — |
| EUR | 847 | −10.6% | [−13.6, −7.4] | survives |
| GBP | 668 | −2.3% | [−4.8, +0.5] | — |
| JPY | 577 | **−0.5%** | [−8.9, +9.5] | — |
| AUD | 1,327 | −11.5% | [−16.3, −7.3] | survives |
| NZD | 1,147 | −17.6% | [−20.2, −14.0] | survives |
| CAD | 626 | −4.0% | [−6.2, −1.2] | survives |
| CHF | 595 | −6.9% | [−11.4, −2.0] | survives |

5 of 8 survive (0.8 expected by chance, P(≥5) = 0.0004). The cut comes where the pool still holds a near-twin of the
exposure currency (AUD ↔ NZDUSD 912 of 1,327 days, NZD ↔ AUDUSD 815 of 1,147, EUR ↔ USDCHF 504 of 847, CHF ↔ EURUSD 240 of 595). **For USD and JPY, the
exposures the desk actually concentrates on, it did nothing**: every USD pair (or every JPY pair) is excluded, and what is
left offsets little (USD was hedged mostly with AUDJPY, GBPCHF and EURCHF; JPY with EURCHF, USDCAD and AUDUSD). Gold, the obvious USD candidate, is missing from this pool. Candidates for
a later prereg, not results.

Most-picked hedges: NZDUSD 1,092 days, AUDUSD 992, AUDJPY 727, USDCHF 680, EURUSD 346, EURCHF 338, GBPCHF 300, USDJPY 291.
Mean |ρ| of the pick 0.54, sign held 97% of the year, ratio 0.43. Days with no candidate: 0.

## Deviations from the prereg

- **A1 (POST-HOC, descriptive):** `run.mjs` was re-run once to also write the daily arms (`arms.json`); every number in
  `results.json` was identical (seed-determined). `concentration.mjs` (by year, last 3 years, without the worst 1%) was
  added after the run as the routine concentration read; it describes only.
- The proxy book loses money (Sharpe −0.20 net, about −0.05 a year gross of costs; G10 trend since 2000). Its max drawdown
  (≈ 6 units) is mostly the book's own slide, which is part of why the max drawdown cannot register a hedge (prereg §5).

## What this changes

- **Hedge finder chip (`js/terminal/corrEvidence.js`):** the Book hedge card now cites `hedge-finder-book-es` (VALIDATED:
  the daily tail of a book is cut by about the r² the card shows, better than a random candidate) and `hedge-finder-book`
  (UNDERPOWERED: drawdowns and Sharpe not shown). The per-market Hedge finder keeps an UNTESTED line: hedging one
  instrument was not tested.
- **What the card may say:** "hedging the biggest exposure with the top row cut the daily 5% tail of a 26-year proxy book
  by about 9%, but did not cut its drawdown, cost about 0.06 Sharpe in spreads, and trading the currency's own USD pair
  cut the tail further. For USD and JPY exposures it cut nothing." It may not say the hedge protects against drawdowns.
- **What would reopen the drawdown half:** a cross-section of books (≥ 30 independent books or the 28 single-pair books
  scored together on max drawdown), or a 21-day design; and the full panel with gold and the S&P 500 (OANDA or the M1
  cache), at the 17:00 NY clock, for the USD cell.
