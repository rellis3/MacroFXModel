# Markov Chains for Quant Finance

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=k8oQfd6M5sA |
| ReelScribe id | j57e0g6arffkes89dywjwagvhd8j3a34 · 50 min |
| Recorded | unknown (2025 lecture series, #49) |
| Processed | 2026-11-12 |
| Notebook | `2025 Video Lectures/49. Markov Chains for Quant Finance/markov_chains.ipynb` |

## Lesson
Independence is usually the wrong default. His worked example is a loan book: drawing each month's delinquency bucket
independently lets a current loan become 90+ days late in one month, which cannot happen. A Markov chain fixes that with
*local* conditional dependence: a transition matrix that allows only possible moves. Matrix powers then answer
multi-step questions (P(current → 90+ in 12 months) = 18.26%), and the state vector converges to a stationary mix
(90+ ≈ 3.8%) whatever the starting book. The MLE of each transition probability is just the count of i→j moves over the
moves out of i. What carries the answer is the assumptions behind it (Markov property, time homogeneity, ergodicity,
enough data, independence across loans), and he names time homogeneity and cross-loan independence as the ones that
break in practice ("everybody's losing their job all at the same time").

## Approach
- **Question**: model the possible states and their likelihoods, not one outcome. The structure has to rule out impossible paths.
- **Model choice and why**: the smallest relaxation of independence that matches reality ("local conditional
  dependence"). Extra memory (a loan that was 90+ before is riskier now) means more states, at a cost in complexity.
- **Validation**: a known-answer check. Simulate 1,000 loans from a known matrix, estimate by MLE, compare with the
  truth, and show early estimates are noisy (consistency, a law-of-large-numbers rate).
- **Failure modes named**: transitions drift over time ("these are certainly going to change over time"); clustered
  defaults break independence; long memory breaks the Markov property. The stationary distribution "will *not* be true" if the assumptions are violated (notebook).
- **Habit**: list every assumption the estimator needs, then say which ones are the "biggest concern" for this problem.

## What the code actually does
- Everything is synthetic: a naive independent-draw simulation (100 loans), a hand-set 4×4 matrix, `matrix_power(P, 12)`
  and `matrix_power(P, 10000)`, then 1,000 simulated loans re-estimated by counts (`transitions / transitions.sum(axis=1)`).
- The recovery check is a proper positive control, but only on data drawn from a time-homogeneous chain, which is
  exactly the assumption he says fails in reality. No real data, no test of homogeneity, no interval on the estimates.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Independence "is way too strong" for state processes | method | ALREADY DO in effect: block/cluster bootstrap, ~2.1 independent forecasts a day (`plans/SEARCH_BREADTH.md`) |
| 2 | Transition MLE = count proportion; consistent, noisy when small | method | ALREADY DO (`creditHmm.js` reports self-transition and expected durations) |
| 3 | Time homogeneity and cross-unit independence are the assumptions that break | method | PARTLY: no homogeneity test on any regime model we run; card `model-audits` Q1 amendment |
| 4 | "I've actually seen it built and deployed in this capacity at a firm" (loan roll-rate chain) | industry | n/a (credit risk, not our domain) |

## What we could learn
- **Known-answer recovery before real data** (REPEAT of #1, now three QG items: path signatures, how to learn, this one).
- **Rank the assumptions by how badly they break here.** He does it in one line per assumption. Our prereg template
  has no "assumptions this estimator needs, and the one most likely to fail" field. DO WORSE, small. Fold into #1's
  proposed prereg edit rather than a new lesson.
- **Time homogeneity of a regime model's transitions** is testable (first half vs second half, chi-square on counts).
  We don't. DON'T DO; goes into model-audits Q1.
- Model-implied dwell (1/(1−aᵢᵢ), as `creditHmm.js` reports) is not realised dwell. Q1 should report both.

## Research ideas
- Folded into `model-audits` Q1: transition-matrix homogeneity across halves, and model-implied vs realised dwell. No separate card.
- Not carded: a loan/credit roll-rate chain. No loan-level data on the desk.

## Quotes
- "Very rarely when you're building some sort of quant [model] is it safe to assume independence."
- "Defining the states… that typically isn't the hard part. The hard part is how do we estimate these probabilities."
- "Two and five in this case are going to be our biggest concern" (time homogeneity, cross-loan independence).
- "Typically these Markov chains are a first step in the modeling process."
