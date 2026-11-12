# Black-Litterman vs. Mean-Variance Portfolio Optimization (MVO) in Python

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=o1mCFVt79Y8 |
| ReelScribe id | j571f378s0fjxt7se40q2fqhh18j2v55 · 38.5 min |
| Notebook | `2026 Video Lectures/100. Black-Litterman vs. Mean-Variance Portfolio Optimization in Python/blmpfm.ipynb` |
| Recorded | unknown (2026 lecture series, #100) |
| Processed | 2026-11-12 |

## Lesson
Mean-variance optimisation needs forward expected returns, which nobody has, so it is fed historical means and
"maximises the error": a tiny jitter in the inputs flips the weights, and the in-sample tangency portfolio fails out of
sample. Black-Litterman fixes the anchor rather than the forecast: it starts from the returns implied by holding a
reference (market) portfolio, π = δΣw, and only moves away from it in proportion to explicit views and the confidence
in them. The test of whether a model learned anything: perturb the inputs slightly; real structure decays gently,
noise falls off a cliff.

## Approach
- **Question**: which allocation is stable enough to trust out of sample? Framed as an estimation problem, not a market view.
- **Evidence**: (1) perturbation: add 0.2% daily noise to returns, re-solve, compare weights (60% → 37% in one name);
  (2) one 6-month in-sample / 6-month out-of-sample split: IS Sharpe 3.94, OOS 0.83 vs equal-weight universe 1.09,
  beta 1.5, alpha p 0.91; (3) MVO vs BL under 0.5% noise: summed weight shift 17% vs ~0.5%.
- **Kill rule**: "if you change the parameters slightly [and] observe insane performance degradation… you've overfit your model to noise" (QG).
- **Habit**: treat the covariance matrix as the more stable input and the mean vector as the fragile one; anchor to a
  consensus prior and make every departure an explicit, confidence-weighted view.
- **Framing**: "decision making as performance and models as a filter": discretionary views pass through a quantitative filter.
- **Statistics**: geometric growth g = r − ½v² (in the notebook) as the reason concentration hurts when you are wrong.

## What the code actually does
- Universe: two years of IBKR daily returns, about three stocks per GICS sector. The "market" for BL is **equal weight
  (w_mkt = 1/n)**, not cap weights as the talk says. With no views, BL's max-Sharpe solve then lands near 1/n by
  construction, so "BL is stable" largely means "1/N is stable". The fair benchmark is 1/N (DeMiguel et al.).
- The first perturbation picks each tangency as the best of **two different random Dirichlet clouds** (5,000 portfolios
  each). Part of the weight swing is Monte Carlo sampling, not the input noise. The mean vector is not perturbed in
  that cell. The noise adds about 3% annualised vol to every name, so it is not small.
- Out of sample: one split, one year, no costs, no interval. The p 0.91 alpha is a single regression on 126 days.
- BL views (AVGO 25%, GOOGL 20%) with He-Litterman Ω = diag(PτΣPᵀ), τ = 0.05, δ = 2.5. Textbook-correct posterior.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "MVO… treats historical noise as structural truth… an error maximizer" (QG) | method | PARTLY: `plans/vol-layer/L6_LITERATURE_SPEC.md` §1 reviews BL vs MVO vs 1/N from the literature; no desk test. Our Book Explorer still defaults to in-sample Markowitz (below) |
| 2 | Small input perturbation → slight decay if structure is real (QG) | method | ALREADY DO for parameters: data-rules parameter-plateau check; Portfolio Book leave-one-sleeve-out and best-3-years-removed |
| 3 | BL "requires significant evidence… to shift the optimal portfolio away from the diversified benchmark" (QG) | method | PARTLY: L6 spec notes BL generates no alpha, its value is q and Ω; with π = δΣ·(1/N) it is shrinkage to 1/N |
| 4 | "There is no data generating distribution" for stock returns; LLN/CLT fail (QG) | mechanism | Stance, not testable as stated. Our practice already treats moments as time-varying (conditional σ, halves, eras) |
| 5 | Concentration grows wealth only if you are right; otherwise volatility drag (QG) | mechanism | ON FILE as arithmetic: `analysis/forecaster_lessons/SIZING_NOTE.md` (Kelly, 10% target ≈ 1/5 Kelly) |

## What we could learn
- **DO WORSE: in-sample Markowitz is our Book Explorer default.** `diversification.html` `maxSharpeMarkowitz()` solves
  w = Σ⁻¹μ on the full common monthly history, clips negatives, and `applyPreset('ms')` runs after every run (line ~3474).
  The combined stats shown by default are therefore in-sample optimised. Change: default to equal-risk (the
  Portfolio Book's own rule), label Max Sharpe "in-sample, not a forecast", or fit weights on earlier years only.
- **ALREADY DO**: plateau / leave-one-out robustness (data-rules `lookahead-and-oos.md` Robustness; `portfolio-book`).
- **ALREADY DO**: the Portfolio Book is fixed equal-risk, not optimised, which is the BL-with-no-views answer.
- **Agree with his own caveat**: the anchor is a framework, not truth; BL needs a mean view, and the desk has no
  validated direction view to feed it (L6 spec "structural limit").

## Research ideas
Not carded: a BL test needs a validated mean view (q) and has a literature review already (`L6_LITERATURE_SPEC.md`).
The actionable item is the Book Explorer default, a display fix rather than a study.

## Quotes
- "If you have a robust model, and you change the parameters slightly, you shouldn't observe insane performance degradation. If you do, you've overfit your model to noise."
- "This is what I call Roman's critique. We don't actually have forward-looking expected returns."
- "MVO… is very eager to throw you off a cliff."
- "You cannot let the outcome speak for the quality of the decision making process."
