# Quant Derives Volterra Process Discretization and Simulation

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=ifwhZDCjAgo |
| ReelScribe id | j57fne1epd4xhyk4nstr03d3ds8j296w · 51 min |
| Notebook | `2026 Video Lectures/85. Quant Derives Volterra Process Discretization and Simulation/volterra.ipynb` |
| Recorded | unknown (2026 lecture series) |
| Processed | 2026-11-12 |

## Lesson
A Volterra process is X_t = ∫₀ᵗ K(t,s) dW_s: Brownian increments weighted by a kernel. Itô isometry turns the kernel
into the covariance, Cov(X_s, X_t) = ∫₀^{min(s,t)} K(s,u) K(t,u) du. The kernel sets the process: K = 1 gives Brownian
motion, K = e^{−θ(t−s)} gives Ornstein-Uhlenbeck, K = (t−s)^{H−½} gives a fractional (rough when H < ½) process. It is
*causal*: each step needs only the past, unlike the Davies-Harte (circulant FFT) scheme, which builds the whole path at
once and so cannot be used step by step for path-dependent pricing. The price is cost: with a memory kernel every step
re-weights the whole history (O(n²)). Simulate on a grid, then check that the empirical covariance across many paths
matches the theoretical one. He names two error sources: **discretisation** (shrinks as steps shrink) and **simulation**
(shrinks as paths grow).

## Approach
- **Question**: how to simulate a process with a chosen covariance (memory) step by step, for pricing path-dependent payoffs.
- **Model choice and why**: Volterra over Davies-Harte because it is causal, which a path-dependent pricer needs. Brownian
  motion is never simulated this way in practice; "just draw from N(0, Δt) directly, it is significantly faster".
- **Validation**: (1) nested case first: K = 1 must reproduce Brownian motion (terminal histograms compared); (2) OU: an
  empirical vs theoretical covariance heatmap (the closed-form OU covariance, an independent answer); (3) fractional: the
  same heatmap. **On camera the fractional heatmap did not match; he traced it to a mis-defined kernel and fixed it.**
  The comparison caught a real bug. That is the method working.
- **Statistics**: names the two error sources separately and says more paths only fixes one of them.
- **Failure mode he warns about**: memory kernels are non-Markovian, so a new step needs the whole path, which is the
  computational bottleneck (motivates Markovian lifting, the next note).

## What the code actually does
- **The fractional "theoretical" covariance is the scheme's own covariance.** It is built as `L @ L.T` with `L` the same
  left-point discretised kernel the simulator uses, not the closed-form covariance. So the final heatmap only measures
  Monte Carlo error. Discretisation error is invisible by construction. The OU check (closed form) is genuine; the
  fractional one, after the "fix", is circular.
- **The scheme is badly biased at small H.** The kernel is singular at s = t and the code sets it to 0 there, a left-point
  Riemann sum. Our own calculation of that scheme's exact covariance (closed-form, from his discretisation, scratch only):
  at H = 0.1, 252 steps, terminal variance is **0.70 of the true Riemann-Liouville variance t^{2H}/(2H)**; at 2,520 steps
  still **0.81** (error shrinks like Δt^{2H}, very slowly). At H = 0.3 it is 0.97; at H ≥ 0.5 fine. Worse for roughness work:
  on a 1,500-step grid at H = 0.1, the structure-function slope of the scheme's increments over lags 1–40 reads
  **H ≈ 0.25**, not 0.1. The standard fixes are exact Cholesky on the closed-form covariance (fine at n ≈ 1,500) or the
  hybrid scheme (Bennedsen, Lunde, Pakkanen 2017; from memory, not re-checked).
- Smaller slips: the markdown recursion `X_i ≈ X_{i−1} + Σ K ΔW` double counts (the code correctly uses `X_i = Σ K ΔW`);
  the grid is `linspace(0, T, n)` (spacing T/(n−1)) while shocks use √(T/n); the OU loop includes the current shock, so X₀ ≠ 0.
  The kernel is Riemann-Liouville, not Mandelbrot-van Ness fBM, which he flags in a markdown note.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Volterra processes are a "causal representation"; Davies-Harte "requires global path knowledge" (QG) | method | Not a market claim. Theory Lab `fractional-brownian-motion` has no simulation section |
| 2 | Two error sources, "discretization error… and simulation error" (QG) | method | PARTLY: method lesson #2 (convergence) covers paths, not steps |
| 3 | "As we reduce the error from both of those sources, it will almost surely converge to that theoretical structure" (QG) | method | True in the limit, but his fractional check cannot see the discretisation part (above) |
| 4 | The fractional kernel "better fits the skew", zero-DTE especially (QG) | mechanism | Pricing-side; outside the desk. `rough-volatility.md` parks surface calibration |

## What we could learn
- **The known answer must come from outside the pipeline** (closed form or an independent method), never from the scheme's
  own matrix or output. DO WORSE: lesson #1 (positive control) is PROPOSED but says nothing about independence.
  Here the circular check passed a scheme that misses 30% of the variance. → refines #1.
- **Vary steps and paths separately**: doubling paths cannot reveal discretisation bias. DON'T DO: lesson #2's proposed line
  only says "paths/steps"; make both mandatory and report each. → refines #2.
- **Nested case first** (K = 1 → Brownian motion): ALREADY DO in spirit (stats-defaults planted-signal entries), REPEAT of #1.
- **Draw the exact transition when it exists** instead of stepping: ALREADY DO, `forecastPathCore` steps log-price exactly
  (`prev * exp(mu + sig * z)`).

## Research ideas
- **For `rough-volatility.md` Q1 (construct note, not a new card).** The artefact band itself only needs a smooth
  (H = ½) Brownian-driven SV process, which is exact and easy. The *positive control* (plant H = 0.1, recover it) needs a
  correct fractional simulator: use exact Cholesky on the closed-form fBM covariance, and first check that the simulator's
  variance and its structure-function slope at the lags used match theory. QG's left-point Volterra reads 0.25 for a true
  0.1, so it would make the estimator look biased when the simulator is.
- Not carded otherwise: pricing-side.

## Quotes
- "We will see then two sources of error… discretization error which goes to zero as our steps become arbitrarily small and we also have simulation error."
- "Clearly there was something wrong with that theoretical covariance structure. I went back into my code. Turns out I defined the Volterra kernel incorrectly."
- "Just draw from the distribution N(0, Δt) directly, it is significantly faster." (notebook)
