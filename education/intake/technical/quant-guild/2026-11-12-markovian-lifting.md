# How Markovian Lifting Solves the Rough Volatility Problem

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=Cr7kBSPqD8A |
| ReelScribe id | j57cdd9156ar7ymr64bxjmtbcs8j3sfp · 39 min |
| Notebook | none in folder `2026 Video Lectures/102. …` (link file only); related code `2026 Video Lectures/137. Projects to Help you Become a Quant (Advanced)/02 - Quantitative Researcher/markovian_lifting.py` |
| Recorded | 2026 lecture series |
| Processed | 2026-11-12 |

## Lesson
A rough kernel K(t) = t^{α−1}/Γ(α) (α = H + ½) makes volatility non-Markovian: every step needs the whole path, the
simulation is O(n²), and the affine/Fourier pricing tools are lost. The fix is to write the power law as a mixture of
exponentials (from the Gamma function / a Laplace transform): t^{α−1} ∝ ∫₀^∞ x^{−α} e^{−xt} dx. Each exponential is an
Ornstein-Uhlenbeck factor, which *is* Markovian because e^{−x(t+Δ)} = e^{−xΔ}e^{−xt} (the semigroup property, which the
power law lacks). Discretise the mixture into N factors with geometrically spaced speeds (some revert very fast, to handle
the singularity at 0), and the rough process becomes N Markov OU states. Simulation drops from O(n²) to linear, and
Fourier pricing comes back for calibration.

## Approach
- **Question**: keep the empirical feature (roughness) while restoring tractability; an engineering trade, not a claim about markets.
- **Model choice and why**: "We don't want to just include an insane amount of complexity. It's going to make the model
  unusable." The extension is judged by parsimonious/efficient/effective (REPEAT of the playbook line).
- **Expanding the state** is the general trick: any path-dependent process becomes Markov if the state holds enough of the
  past. Holding the whole path is legal but useless, so look for a *compressed* state (here N OU factors).
- **Validation (in the project file, not the video)**: relative L2 error of the N-factor kernel vs the true kernel,
  required to fall as N grows (1, 2, 4… 32), and the lifted path compared with the direct convolution on the **same**
  Brownian draws. The smoke test only asserts error < 0.5 at N = 32, a weak bar, and the "true" reference is the same
  left-point convolution criticised in the Volterra note.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Power-law kernel = integral of exponentials; N OU factors approximate it (QG) | method | Standard (Abi Jaber & El Euch 2019, cited in his code). Not a market claim |
| 2 | Lifting moves simulation "from N squared to linear" and recovers FFT pricing (QG) | method | Engineering; outside the desk (no calibration engine; `rough-volatility.md` parks it) |
| 3 | A former colleague's quadratic rough Heston + fits the 0DTE skew better using lifting (QG) | call | Not checked; pricing-side |

## What we could learn
- **Compress the state, don't drop it**: when a feature needs memory, ask what small state carries that memory. The desk
  already does this without the name: HAR's day/week/month terms are three exponential-ish memory factors, and the
  reverting weekly/monthly lines use one exponential half-life (`horizon-reversion` VALIDATED). ALREADY DO.
- **Convergence in N**: show the approximation error falling as factors are added. REPEAT of #2 (add terms until it stops moving).

## Research ideas
- **Refinement for `rough-volatility.md` Q3 (power-law fade vs exponential half-life), not a new card.** Lifting says a
  power law is just many exponentials, so the honest comparison is three arms with matched parameters: one exponential
  (shipped), a 2–3-factor exponential mixture (lifted, HAR-like), and the power law. If the power law beats one exponential
  but not the 2–3-factor mixture, the gain is "more than one memory speed", which HAR already has, not roughness. Gated on
  Q1 as before.
- Theory Lab: a short "Markovian lifting" box in `fractional-brownian-motion` or `heston-model` (the semigroup line plus the
  sum-of-exponentials picture) links fBM to HAR for this desk. Teaching only.

## Quotes
- "We want to capture features of non-Markovian models without all of the inefficiency."
- "We don't want to just include an insane amount of complexity. It's going to make the model unusable."
- "We took an infinite dimensional Volterra process and we have approximated it via a system of N Markov processes."
