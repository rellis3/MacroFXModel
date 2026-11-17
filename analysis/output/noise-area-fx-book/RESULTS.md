# noise-area-fx-book: RESULTS

Prereg `forge/NOISE_AREA_FX_BOOK_PREREG.md` · seed 20261117 · window 2017-03-15 → 2026-08-21 ·
page `noise-area-fx-book.html` · scripts `scripts/noise-area-fx-book/` (fx.py, run.py) · ledger ids `noise-area-fx` (F),
`noise-area-book` (P).

## Verdict: the rule does not work on FX or gold (F: 15 of 16 NULL, USDJPY London UNDERPOWERED; headline UNDERPOWERED by the pre-registered rule), and the 21-system book is NULL because 16 of its 21 systems lose

## F: gold and the USD majors, London and New York sessions (V2 1x, real OANDA spread)

| System | Gross Sharpe | Gross bp/day | Cost bp/day | Net Sharpe [95% CI] | Halves | Beats shuffled | Spread ÷ range | Verdict |
|---|---|---|---|---|---|---|---|---|
| EURUSD LDN | -0.78 | -0.86 | 1.53 | **-2.12** [-2.78, -1.46] | -2.40 / -1.90 | 58.0% | 0.024 | **NULL** |
| EURUSD NY | -0.31 | -0.33 | 1.64 | **-1.79** [-2.48, -1.13] | -2.06 / -1.58 | 84.0% | 0.026 | **NULL** |
| GBPUSD LDN | 0.40 | 0.59 | 1.77 | **-0.80** [-1.43, -0.22] | -0.72 / -0.89 | 87.0% | 0.022 | **NULL** |
| GBPUSD NY | 0.08 | 0.11 | 1.99 | **-1.50** [-2.17, -0.87] | -1.93 / -1.08 | 100.0% | 0.025 | **NULL** |
| USDJPY LDN | 1.06 | 1.25 | 1.31 | **-0.05** [-0.67, 0.51] | -0.26 / 0.09 | 95.0% | 0.023 | **UNDERPOWERED** |
| USDJPY NY | 0.24 | 0.28 | 1.62 | **-1.11** [-1.76, -0.48] | -1.70 / -0.67 | 100.0% | 0.023 | **NULL** |
| AUDUSD LDN | -0.30 | -0.42 | 2.12 | **-1.80** [-2.57, -1.06] | -2.05 / -1.62 | 99.0% | 0.030 | **NULL** |
| AUDUSD NY | -0.21 | -0.28 | 2.67 | **-2.17** [-2.83, -1.58] | -2.96 / -1.48 | 100.0% | 0.030 | **NULL** |
| USDCAD LDN | -0.22 | -0.23 | 1.69 | **-1.81** [-2.51, -1.15] | -1.59 / -2.10 | 89.0% | 0.029 | **NULL** |
| USDCAD NY | -0.37 | -0.40 | 1.99 | **-2.17** [-2.84, -1.53] | -2.81 / -1.47 | 100.0% | 0.027 | **NULL** |
| USDCHF LDN | -0.44 | -0.53 | 2.06 | **-2.10** [-2.79, -1.45] | -2.69 / -1.66 | 98.0% | 0.031 | **NULL** |
| USDCHF NY | -0.52 | -0.59 | 2.43 | **-2.60** [-3.29, -1.96] | -3.60 / -1.85 | 100.0% | 0.033 | **NULL** |
| NZDUSD LDN | -0.09 | -0.12 | 2.83 | **-2.10** [-2.82, -1.38] | -1.62 / -2.55 | 95.0% | 0.038 | **NULL** |
| NZDUSD NY | -0.74 | -1.00 | 3.75 | **-3.45** [-4.13, -2.83] | -4.19 / -2.87 | 88.0% | 0.039 | **NULL** |
| Gold LDN | 0.34 | 0.82 | 2.51 | **-0.69** [-1.42, -0.04] | -0.89 / -0.52 | 98.0% | 0.018 | **NULL** |
| Gold NY | 0.43 | 1.06 | 2.94 | **-0.76** [-1.45, -0.12] | -1.57 / -0.09 | 100.0% | 0.018 | **NULL** |

- **There is little intraday trend to follow in FX from these opens.** Gross is negative on 10 of the 14 FX systems. The
  best is USDJPY London (gross Sharpe 1.06, +1.25 bp/day), but the spread takes 1.31 bp/day, so net ≈ 0. Gold is slightly
  positive gross (+0.8 to +1.1 bp/day) against 2.5–2.9 bp of spread.
- Costs are 1.3–3.8 bp/day at about one round trip a day: the same wall as `close-window-momentum-secondary` (prior art).
  The execution gate is fine (spread ÷ session range 0.02–0.04), so the spread is small against the range but large
  against the edge.
- **Engine check (not a bug):** the same FX engine on OANDA's S&P 500 and Nasdaq CFDs over the US cash session gives gross
  Sharpe 1.07 and 1.35 (ES/NQ futures 1.02 / 1.42), so the code finds the equity effect where it exists.

## P: all systems run together (each scaled to 10% vol, averaged, book scaled to 10% vol)

| Book | Sharpe [95% CI] | CAGR | Vol | Max DD | Worst year | Halves |
|---|---|---|---|---|---|---|
| All 21 systems | **-2.63** [-3.29, -2.00] | -26.4% | 11.4% | -95.3% | -37.5% | -3.51 / -1.73 |
| FX + gold (16) | **-3.73** [-4.47, -3.01] | -35.5% | 11.6% | -98.7% | -47.2% | -5.05 / -2.40 |
| US equity (5) | **0.65** [0.08, 1.15] | 7.6% | 12.6% | -18.0% | -6.8% | 0.71 / 0.58 |
| SPY + book overlay | **-0.79** [-1.38, -0.21] | -16.7% | 20.6% | -86.0% | -31.1% | -1.19 / -0.36 |
| SPY buy & hold | **0.76** [0.14, 1.41] | 12.8% | 18.0% | -34.2% | -19.5% | 0.81 / 0.71 |
| SPY + US equity book (post-hoc) | **1.04** — | 21.7% | 21.1% | -32.5% | -10.7% | 1.15 / 0.93 |

- **P NULL**: the all-21 book is 16 losing FX/gold systems plus 5 equity ones; −2.63 Sharpe. Averaging does not rescue
  losing systems, it only spreads them.
- On an average day 13.38 of the 21 systems trade; average pairwise correlation
  0.131. Equity systems correlate with each other (ES–SPY 0.94, NQ–SPY 0.67) but barely with FX (|ρ| ≤ 0.12).
- **Natural hedge in the FX legs:** on 2,418 days with two or more USD pairs trading, 34%
  of the USD exposure cancelled (long dollar in one pair, short in another); all legs pointed the same way on
  41% of those days.
- **US equity book (5, described):** 0.65 [0.08, 1.15], halves 0.71 / 0.58, max DD −18%, correlation with SPY −0.09.
- **SPY + US equity book (POST-HOC, amendment A1, describes only):** 1.04 Sharpe, CAGR 21.7% vs SPY 12.8%, max DD −32.5%
  vs −34.2%, worst year −10.7% vs −19.5%. The equity momentum book is close to uncorrelated with SPY, so it adds return
  without adding drawdown. Chosen after seeing that the FX streams lose; not scored.

## What this means

The noise-band effect is a US equity-index effect (NQ, SPY, ES gross), not a general intraday law: FX majors from the
London and New York opens do not trend enough to pay the spread, and gold only barely trends. Running systems together
helps only when each system has an edge: a book of losers stays a loser. The useful portfolio is the equity momentum
streams as an overlay on an index holding, which needs its own forward test before it is believed.

## Limitations

- OANDA spreads (retail CFD); an ECN account would be cheaper, but gross is negative on most FX systems, so cost is not
  the only problem.
- Fills at the check bar's close; no slippage beyond the spread; tick volume for VWAP.
- Equity streams carry the parents' caveats (SPY 2016–2024 is inside the paper's own sample).
