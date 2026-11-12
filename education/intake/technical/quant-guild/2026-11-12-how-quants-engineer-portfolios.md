# How Quants Engineer Portfolios

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=1r39EGSm9fw |
| ReelScribe id | j570a1wy5bksqm949m19pps8pn8j3fhb · 10 min |
| Notebook | `2026 Video Lectures/115. How a Quant Engineers a Portfolio/haqep.ipynb` |
| Recorded | unknown (2026) |
| Processed | 2026-11-12 |

## Lesson
Holding SPY is market beta anyone can buy; what a manager is paid for is engineering the portfolio so it has money
when everyone needs it. Volatility drag (a 10% loss needs more than 10% to recover) means a smoother path compounds
to more. Add a sleeve that is uncorrelated with the main engine (his example: KMLM, managed futures, Sharpe 0.02 on its
own), then use leverage to restore the equity exposure. Uncorrelated Sharpe ratios add in quadrature
(S² = ΣSᵢ²), so a hedged and re-levered book can beat SPY on return, Sharpe and drawdown.

## Approach
- **Question**: what is the return driver? Regress on SPY (beta) before claiming skill.
- **Evidence**: 5 years of IBKR ETF data: SPY (Sharpe 0.77, MDD −25%, +80%); 70/30 SPY/KMLM (0.76, −14%, +50%);
  an "engineered" levered book (0.79, −22%, higher total return).
- **Habit**: compare at equal exposure: "you're kind of comparing apples to oranges… doesn't bear the same amount of equity exposure" (QG).
- **Kill rule**: none stated.

## What the code actually does
- The "engineered" book is **50% SSO (2x SPY) + 30% KMLM + 20% MNA (merger arb) + 20% RNR**: 120% gross, daily
  rebalanced. Two of the four legs are not mentioned in the video. Weights are hand-picked on the same 5-year window
  that scores them (hindsight), no costs, no financing on the extra 20% gross, no rf in the Sharpe, no interval.
- 70/30 SPY/KMLM is daily rebalanced. The volatility-drag animation fixes the arithmetic mean equal on both paths.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Uncorrelated Sharpes add in quadrature (QG) | mechanism | ON FILE as practice: `rule-a-portfolio-second-book` (corr −0.013, combined 1.61 vs 0.86 / 1.41); Lesson 06 effective bets |
| 2 | A near-zero-Sharpe managed-futures sleeve improves the book (QG) | trading | PARTLY: factor blend, trend + yield corr 0.06, halves drawdown (`project_factor_blend`); Portfolio Book trend sleeve 0.26 alone, 0.00 CFD-only, kept for the book |
| 3 | Re-levering the hedged book beats SPY on every measure (QG) | trading | UNTESTED here, and his own demo is in-sample with no financing. Our financing haircut alone took the book 1.06 → 0.83 (`portfolio-book-validate`) |
| 4 | "Structurally orthogonal bets… enable the use of safe leverage" (QG) | mechanism | Card `portfolio-construction` Q1 (crisis correlation) is the test of "orthogonal when it matters" |

## What we could learn
- **ALREADY DO: compare at matched risk.** `stress-filter-hold-flat` and `vol-managed-mm` report drawdowns vol-matched
  (−44% vs −55% raw becomes −57% vs −55%). His point is the same; his own demo then compares at unmatched beta.
- **ALREADY DO: financing in the score.** `portfolio-book-validate` T2 charges CFD financing; his levered book does not.
- **REPEAT of #7 (diversification judged in stress)**: "have money when you need it" is a crisis criterion, not an average one.
- **His gap**: weights picked on the scoring window are the in-sample optimisation he criticises in the BL video.

## Research ideas
Not carded separately: it feeds Q1 (stress correlation) and the proposed Q3 (priced convexity sleeve).

## Quotes
- "Anyone can access the SPY ETF… the question really is what are you getting paid for?"
- "Engineering a portfolio to reduce volatility drag to have money when you need it."
- "I don't like just saying diversification because you're still bearing exposure to undiversifiable risk."
