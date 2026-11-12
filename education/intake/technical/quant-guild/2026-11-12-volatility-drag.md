# Quant Portfolio Management and Volatility Drag

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=YDjOBWb5iG8 |
| ReelScribe id | j57b6fxa7akp9mjn8x7g3x29mh8j3mee · 16 min |
| Notebook | none (fireside chat, no figures in code). Nearest: `2026 Video Lectures/136. How Volatility Drag Destroys (and Creates) Wealth/vol_drag.ipynb`, a later and different video |
| Recorded | unknown (2026) |
| Processed | 2026-11-12 |

## Lesson
The max-Sharpe (tangency) portfolio is not the portfolio that maximises long-run geometric growth, and geometric
growth is what a compounding portfolio actually lives on. So a "convexity layer" (puts, a hedge sleeve) that loses money
on average can still raise growth: it cuts the variance that drags the geometric mean, and it makes leverage on the main
return engine survivable. His sharpest example: a 0%-growth strategy combined with a −2.5%-growth hedge sleeve gives
positive growth. The aim is several structurally independent return drivers (beta, prediction-market making,
variance-premium harvesting, long convexity), not one driver ("the wind blowing").

## Approach
- **Question**: framed as an objective-function choice: maximise E[log wealth] at the leverage you will run, not Sharpe.
- **Evidence**: two stylised simulations (on screen only) and unpublished "internal research"; he says "very sample dependent".
- **Habit**: regress a strategy on the benchmark first; a beta of about 1 means "you are entirely dependent on that as your return driver".
- **Failure mode**: leverage without a convexity layer gives a non-linear blow-up path.
- **Costs**: the hedge's bleed is the "dragon slayer's fee"; the job is "not getting ripped off" (pay a fair price for convexity).

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Tangency (max Sharpe) ≠ max geometric growth portfolio (QG) | method | ON FILE as theory: `SIZING_NOTE.md` (Kelly μ/σ², 10% target ≈ 1/5 Kelly); `plans/LESSON_COMPLIANCE_REVIEW.md` lists drag as "not yet relevant" |
| 2 | 0% growth + −2.5% growth hedge sleeve → positive growth (QG) | mechanism | Arithmetic is right with negative correlation and rebalancing (diversification return ½(Σwσ² − σ_p²)). Our version is card `portfolio-construction` Q2, UNTESTED |
| 3 | A convexity layer plus leverage beats buy-and-hold on growth (QG) | trading | UNTESTED here. Closest: `portfolio-book-validate` next step "instrument-true XSP/SPX put-spread sleeve" (not run). New card Q3 |
| 4 | Prediction-market making is structurally orthogonal to the macro economy (QG) | mechanism | Not ours to test (no such book) |
| 5 | Insurance is "always overpriced" on average but not all of it; the bleed is sample dependent (QG) | mechanism | PARTLY: our vol-premium proxy Sharpe 1.07 vs Cboe PUT index 0.57 (`portfolio-book-validate` T6), i.e. selling insurance paid on this sample |

## What we could learn
- **DO WORSE: score a book by growth at its target leverage, not only Sharpe.** Our books report Sharpe, CAGR and
  max DD, and vol-target sizing is "a smaller worst month, same Sharpe" (`vol-target`). We never ask whether a
  sleeve with a poor standalone Sharpe raises the whole book's g at matched risk. Leave-one-sleeve-out does this on
  Sharpe only. Change: report each sleeve's marginal effect on book CAGR at a fixed book vol beside the Sharpe deltas.
- **ALREADY DO**: beta-to-benchmark first (portfolio-book sleeve correlations; Lesson 06 second-book test).
- **Contrast with our book**: the Portfolio Book's two biggest engines (core beta, short-vol proxy) both lose in a crash
  (corr 0.45, `portfolio-book` use line). By his framing it has no convexity layer, only a VIX stand-aside, and
  `stress-filter-hold-flat` shows the stand-aside is just less exposure.

## Research ideas
- Card `portfolio-construction` Q3 (new, proposed): a priced convexity sleeve. See the return report for the card.
- Q2 (rebalancing premium) gets his example as its mechanism and a known-answer step (proposed edit).

## Quotes
- "Maybe that is the case on average, but are we talking about in an arithmetic sense or a geometric sense?"
- "You put the 0% with the -2.5% together, and you're producing now positive geometric growth."
- "That market risk is the wind blowing. You don't get to dictate the direction the wind blows."
- "Dragon slayers don't work for free."
