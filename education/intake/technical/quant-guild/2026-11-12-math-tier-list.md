# Math tier list (the ultimate quant math class tier list)

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=PL7bktjkJtk |
| ReelScribe id | j57cjxq94cetqy6h2v9km3cnj58getez · 14 min (~13.5 min) |
| Recorded | unknown |
| Processed | 2026-11-12 |

## Lesson
QG ranks 13 university maths classes by how much they matter day to day in quant finance. The ones that matter are the
ones used every day: algebra (needed for everything), calculus 1 (optimisation, i.e. maximising an expected value),
calculus 3 (training any multivariable model by numerical optimisation) and, above all, linear algebra (covariance
matrices, eigen/singular value decompositions, PCA/ICA, and checking whether those decompositions are stable over
time). Pricing maths (ODEs, PDEs, functional analysis) matters only if you work on the pricing side, and libraries
now solve most of it. Pure proof courses (real analysis, abstract algebra, geometry) don't come up in alpha work.
He says himself that some rankings are personal bias (functional analysis S because it's his favourite; abstract
algebra D because he cried in it).

### The full list, with his reason

| Tier | Class | His reason (QG) |
|---|---|---|
| **S** | Algebra | Needed by every other class; most of calculus is algebraic manipulation |
| **S** | Calculus 1 | Optimisation (local/global min/max): "maximize an expected value function to achieve the best possible ROI" |
| **S** | Calculus 3 (multivariable) | The machinery of ML: models are high-dimensional multivariable functions trained by numerical optimisation |
| **S** | Linear algebra (the best) | Used in research, dev and trading: covariance matrices, eigen/SVD, PCA/ICA, latent representations, "seeing if there's stability over time"; understand it, don't just get through it |
| **S** | Functional analysis | "Shamelessly", his favourite; Karhunen-Loève, simulating fractional Brownian motion / Volterra processes; pure QR and pricing only, "not all that useful" for trading/dev |
| **A** | Calculus 2 | Convergence of sequences/series matters (time value of money, pricing); memorising the convergence tests doesn't ("just hop on chat") |
| **A** | Partial differential equations | Black-Scholes is a transformed heat equation; foundational for pricing; numerical solvers and libraries mean you rarely solve one by hand; SDEs are the more stochastic-calculus side |
| **B** | Pre-calculus | Backfills algebra; unit circle, series, limits; foundation only |
| **B** | Differential equations (ODEs) | "The OG of modeling"; needed for pricing research, not "if you're just trying to mine equity alpha" |
| **C** | Discrete maths | Logic (contrapositive, implication) helps you see when your assumptions about a model are flawed; you won't write proofs |
| **D** | Real analysis | Backbone of functional analysis; painful; nothing else downstream for this job |
| **D** | Abstract algebra | Never used in QR, trading or dev: "let me know the next time you're mining equity alpha when you need group theory" |
| **D** | Geometry | Not needed; not a study priority |

**Missing from the list**: probability, statistics, econometrics/time series, stochastic calculus as its own class,
numerical methods. For this desk, statistics is the most-used maths of all (bootstrap intervals, power/MDE, multiple
testing, calibration), so his list is a pricing-and-ML view of maths, not a statistician's.

## Approach
- **Question**: "how relevant is this class to what you do day to day?" The answer depends on the role: pricing/QR vs trading/dev vs alpha research. He keeps saying which role a class serves.
- **Habit**: learn the concept, outsource the rote (convergence tests, solving PDEs by hand) to tools and libraries.
- **Habit**: understand the bigger picture (linear algebra is not row reduction; it is what decompositions tell you about data).
- **Failure mode**: flawed logic about a model's assumptions and their downstream consequences (discrete maths' one use).

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Linear algebra is the most useful course for research, dev and trading (QG) | learning | n/a (learning path). The desk's PCA/residual family, `random-matrix-theory`, `pca-factors` lessons all lean on it |
| 2 | Calculus 1 / 3 = optimisation, the daily job (QG) | learning | n/a. Theory Lab has `foundation-optimization-basics`, `foundation-multivariable-calculus`, `convex-optimization` |
| 3 | PDEs/ODEs/functional analysis matter on the pricing side only (QG) | learning | n/a. The desk doesn't price derivatives; IV is backed out from settlements (`iv-from-settlements`) |
| 4 | "Actually seeing if there's stability over time" of eigenvectors (QG) | method | UNTESTED for the residual-PCA book (repeats the model-tier-list lesson) |

## What we could learn
- **Pick the maths by the job.** This desk's job is alpha/forecast research on prices, vol and macro, not pricing. So the priority order for the owner is: linear algebra → probability and statistics (missing from his list, the one we use most) → multivariable calculus/optimisation → time-series econometrics. PDEs, functional analysis and stochastic PDEs are low priority. Touches the Theory Lab learning paths (`theory-lab/assets/paths-data.js`): `ito-lemma`, `stochastic-pdes`, `neural-sdes-spdes` are pricing-side and could move later in any core path. Owner decision; not a research rule.
- **Eigenvector stability over time.** DON'T DO (second time QG says it; see the model-tier-list note). Count for the 2+ rule.
- **Logic about assumptions.** ALREADY DO: preregs state assumptions and the null before running (`MD files/PREREG_TEMPLATE.md`).

## Research ideas
Not carded: a learning-path video with no market claims. The one method point (eigenvector stability) is carded in
the model-tier-list note.

## Quotes
- [2:06] "maximize an expected value function to achieve the best possible ROI. Usually we fall short."
- [4:39] Differential equations are "far more necessary than if you're just trying to mine equity alpha."
- [11:54] "doing an eigen decomposition of that... recovering those eigenvectors, eigenvalues, and actually seeing if there's stability over time"
- [12:26] Linear algebra: "It's not just about reduced row echelon form."
- [7:44] "let me know the next time you're mining equity alpha when you need group theory."
