# Hidden Markov Models for Quant Finance

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=Bru4Mkr601Q |
| ReelScribe id | j57a52t1zen6cgsa8rfey6h39n8j255r · 56 min |
| Recorded | unknown (2025 lecture series, #51) |
| Processed | 2026-11-12 |
| Notebook | `2025 Video Lectures/51. Hidden Markov Models for Quant Finance/hidden_markov_models.ipynb` (+ `NVDA_returns.csv`) |

## Lesson
A fixed return distribution badly understates tail risk (a normal fit says NVDA's >4σ days should take ~125 years
each to appear) because the data-generating distribution moves with a latent driver, volatility. Step one is an
**explicit Markov chain** on defined states (20-day RV split at its 33rd/66th percentiles into low/mid/high), giving a
regime-conditional Gaussian for each state: easy to read, and a mixture that shows some excess kurtosis. Step two is an
**HMM**, which learns a chosen number of states from the returns (Baum-Welch) and so bundles volatility, trend and
whatever else into unnamed states. You gain fit and lose interpretability, it is "very easy to overfit", and "simpler
models may explain similar or even more variability". Whether the HMM earns its place has to be shown out of sample
against the explicit chain.

## Approach
- **Question**: description, not prediction. The target is the *likelihood of states of the world* (tail probability
  for a PM), not where tomorrow's return falls: "I'm never going to be able to predict where this purple vertical line falls. That's not my goal."
- **Model choice and why**: the explicit chain first because you can say why each likelihood differs ("business likes
  explainability"); the HMM only if it beats that. ARCH/GARCH named as the other route to the same conditional distribution.
- **State count**: chosen by hand ("three, five, 10, whatever"); cost and overfitting rise with it. No selection criterion (BIC, held-out likelihood) is used or mentioned.
- **Validation**: stated as "we would have to assess the robustness of these models out of sample". **Not done in
  the notebook** (see below). The only check is that simulated returns from the chain have excess kurtosis (0.687).
- **Proxy choice**: the latent variable is only seen through a proxy, and the window changes it (20 vs 60 day); a PCA
  of several RV measures is "very common in practice".
- **Failure modes named**: omitted latent factors; Markov property and fixed transitions are assumptions; overfitting; lost interpretability.

## What the code actually does
- Data: NVDA daily returns, filtered to 2024-01-01 → 2025-12-31 (~500 days). One stock, one window.
- Chain states: 20-day RV with **thresholds taken from the full-sample quantiles** (`quantile(0.33)`, `quantile(0.66)`), so each day's label uses the whole period. Transition matrix by counting.
- HMM: hand-written 3-state Gaussian Baum-Welch, **one random initialisation** (`np.random.seed(42)`), no restarts,
  **unscaled** forward/backward (no per-step normalisation), 100 iterations, tol 1e-6.
- Decoding: `argmax` of the **smoothed** posterior gamma (forward × backward). He lists this as a benefit ("using both
  the past and future information from any point in time"). For a live label that is lookahead.
- States ordered by within-state σ (σ 1.48 / 1.74 / 6.46 %), the same way `hmm.js` names RANGE/TREND.
- No train/test split, no out-of-sample likelihood, no refit-stability check, no comparison of HMM vs chain on any metric.
- The kurtosis "benchmark" is weak: a mixture of three Gaussians with ordered σ will show excess kurtosis by
  construction, and 3.69 is far below NVDA's empirical kurtosis (shown as much higher, not quoted).

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | A static normal "dramatically underestimat[es] the risk in these tails" | mechanism | ON FILE as a stylised fact (`plans/STYLIZED_FACTS.md`; vol-forecast work uses conditional σ) |
| 2 | Regime-conditional distributions capture time variation; low/mid/high σ states | method | ALREADY DO: HAR/vol layers, σ ÷ trailing-250 median regime buckets (`data-rules` lookahead-and-oos) |
| 3 | HMM states are compressions of several latent factors and cannot be named directly | method | ON FILE in effect: `hmm.js` header + memory "HMM = variance, not direction"; `gr-hmm-trend-direction` NULL |
| 4 | "it is very easy to overfit" / simpler models may match it | method | PARTLY: no stability or baseline audit of our HMMs yet (`model-audits` Q1, UNTESTED) |
| 5 | Forward-backward uses "both past and future information" (a benefit) | method | DISAGREE for live use: `hmmHourly.js` keeps "the filtered, as-it-was-known read, never a smoothed one"; `hmm.js` label from the forward pass since 2026-10-16 |

## What we could learn
- **Explicit-state baseline before the HMM** (REPEAT of #5, linear/simple baseline first). His ladder (σ buckets →
  HMM) is exactly model-audits Q1's benchmark. DO WORSE: our live HMMs were never put beside it.
- **Filtered, not smoothed; thresholds from trailing data.** His notebook breaks both. ALREADY DO in code (`hmmHourly.js`,
  `hmm.js`), but the rule is in code comments, not in `data-rules`. DO WORSE (unwritten rule). Proposed lesson.
- **State count is a parameter with no stated selection rule.** Ours is fixed at 2 (`hmm.js`, `creditHmm.js`). Neither
  of us selects it on held-out likelihood. DON'T DO; cheap to add to Q1 as a descriptive (2 vs 3 states, held-out log-lik).
- **Single initialisation** in both his notebook and ours (`hmm.js` fixed init, `creditHmm.js` "deterministic (fixed
  init)"). Deterministic is good for reproducibility, but nobody checks it reaches the best likelihood. Add a
  multi-start check to Q1.
- **The window is a parameter.** He shows 20 vs 60-day RV differ; our HMM consumers fit on 200 daily (server.js), 100
  daily (levels.js, asiaRangeEngine), 600 hourly (hmmHourly). Same "RANGE" word, different fits. REPEAT of #10 (two proxy specs).

## Research ideas
- Amend `model-audits` Q1 (not a new card): add window (100 vs 200 daily) as a condition, a 2-vs-3-state held-out
  log-likelihood, a 10-start likelihood check against the fixed init, and transition-matrix time-homogeneity (first vs
  second half). Benchmark stays the σ split, now framed as QG's explicit Markov chain.
- Not carded: an HMM-vs-σ-bucket-chain *forecast* contest for vol. Our vol stack already conditions on trailing σ (HAR,
  vol layers, `project_vol_layer_system`), and a 3-bucket chain is a coarser version of that.

## Quotes
- "I'm never going to be able to predict where this purple vertical line falls. That's not my goal."
- "These latent states are compressions of those latent factors… I can't tell you what latent state 3 is."
- "We can overfit this model. We do lose interpretability and simpler models may explain similar or even more variability while maintaining interpretability."
- "We would have to assess the robustness of these models out of sample."
- "Business certainly won't be happy with this model… Business likes explainability."
