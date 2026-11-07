# Layer 5: Meta-Labelling. Literature Spec

From published research and the trader's words only; no repository files read. **No winner declared; nothing run on our data.**

Tags: [V] = checked by search this session, usually abstract level. [V2] = secondary source, code repository or software implementation only. [M] = from memory, check before relying on it.

Prompt: C.OG, "have you ever looked into meta labelling?" and "every single position is different."

## Method
A primary rule fixes side s ∈ {±1}. The secondary estimates P(z=1 | x), with z = 1 if s·R_net > τ. It decides whether and how much, never which way (López de Prado 2018 [V2]; Joubert 2022 JFDS 4(3) [V2]). Primary tuned for recall, secondary recovers precision [V2].

## Label design and base rates
Triple barrier: first touch of target +a, stop −b, or time limit [V2]. On a martingale without a time limit, P(target first) = b/(a+b). With R = b, a = kR, cost c in R (my arithmetic):

p* = (1+c)/(1+k). Required lift = c/(1+k).

| k | Base rate | p* at c = 0.1R | Lift |
|---|---|---|---|
| 0.5 | 66.7% | 73.3% | 6.7pp |
| 1 | 50.0% | 55.0% | 5.0pp |
| 2 | 33.3% | 36.7% | 3.3pp |

Win rates mean nothing without k and c. The time limit adds a third outcome that moves the base rate with remaining variance.

**Candidates, pre-declared:** binary net sign at first barrier; three-class with time-out; continuous net R; separate target and stop heads.

**Geometry trap (my reasoning; no paper found).** With asymmetric or time-limited barriers, hit rate varies mechanically with vol, time of day and distance. A model given those features shows AUC above 0.5 on a pure random walk. That is first-passage arithmetic, not edge.

## Sizing candidates
- Threshold: act if p > p*.
- EV linear: size ∝ max(0, p·a − (1−p)·b − c).
- AFML: m = 2Φ((p−½)/√(p(1−p))) − 1 [M].
- ECDF and sigmoid: Meyer et al. tested six algorithms including a sigmoid optimal rule [V2].

## Calibration
- Platt beat isotonic below about 2,000 calibration cases, since isotonic overfits small sets (Niculescu-Mizil & Caruana, arXiv 1207.1403 [V]). Practitioner cut-offs of 500-1,000 lack authority [V2]. Boosted trees and SVMs need correction (ICML 2005 [V]).
- Metrics: BSS = 1 − BS/BS_ref; BS = REL − RES + UNC (Murphy [M]); reliability curve; slope.
- Sizing: calibration significantly improved fixed sizing, with no significant gain for sizing functions fitted on training data (Meyer-Barziy-Joubert 2023 JFDS 5(2) [V2]).

## Evidence
| Source | Finding | Limits |
|---|---|---|
| Singh & Joubert [V] | E-mini, about 1 year OOS. Precision: mean reversion 0.17→0.20, trend 0.48→0.54 | One instrument; no sizing; profit link asserted; threshold hand-tuned |
| Joubert 2022 [V2] | Side/size split; inverse meta-labelling | Experiments unverified; synthetic design [M] |
| Meyer et al. 2023 [V2] | As above, on Sharpe and drawdown | Design unverified |
| Thumm-Barucca-Joubert [V2] | Framework for choosing ensembles | **Venue and results unverified**; JFDS 2023 [M] |

**By asset:** E-mini only among what I verified. I found no peer-reviewed FX or gold test and no independent replication; that is a search result, not proof of absence. Sources are largely one connected author group, some vendor-affiliated.

## Where evidence is mixed
- **Net value.** Published claims are positive. Practitioners report it did not shine on a 100%-recall buy-and-hold primary, and that it packages a signal rather than creating one [V2, anecdotal].
- **Classifier to money.** E-mini strategy tables could not be verified (images).
- **CPCV vs walk-forward.** CPCV beat K-fold, purged K-fold and walk-forward on PBO and DSR in a *synthetic* environment (Arian-Norouzi-Seco 2024 KBS [V]). Commentary keeps walk-forward as the deployment-realistic standard [V2]. They answer different questions; run both.

## Overfitting controls
**CPCV [M].** N groups, test on k; paths φ = C(N,k)·k/N (N=6, k=2: 15 splits, 5 paths). Purge overlapping labels; embargo. Label overlap is a recognised cost of triple barriers [V2].

**PBO (Bailey et al., J. Computational Finance [V]).** For each CSCV split, take the in-sample best and its OOS rank ω. λ = ln(ω/(1−ω)). PBO = share with λ ≤ 0. No universal threshold [V2].

**Deflated Sharpe (Bailey-López de Prado 2014 JPM [V]; formula via implementations [V2]):**
- PSR(SR*) = Φ( (SR−SR*)√(T−1) / √(1 − γ₃SR + ((γ₄−1)/4)SR²) )
- SR* = √V[SR]·( (1−γ)Z⁻¹[1−1/N] + γZ⁻¹[1−1/(Ne)] ), γ ≈ 0.5772
- Per-period SR; raw kurtosis. Annualised input saturates DSR near 1 [V2].

**Hurdle:** t > 3.0 (Harvey-Liu-Zhu 2016 RFS [V]). N counts every trial, including discarded labels and thresholds.

## Sample-size realism (my arithmetic)
Trades **retained** to detect precision p against p₀ at 80% power:

n ≈ (z√(p₀q₀) + 0.84√(pq))² / (p−p₀)²

| p₀ → p | α = 5% | Bonferroni, 100 trials |
|---|---|---|
| 50 → 53% | ~2,200 | ~5,200 |
| 50 → 52% | ~4,900 | ~11,600 |

34 instruments × 2,500 days = 85,000 instrument-days. N_eff/day = 34/(1+33ρ̄). At ρ̄ = 0.2 that is about 4.5/day, about 11,000 total, before touch frequency, retention and holdout. Per-instrument models are probably unpowered; favour pooled models with instrument effects.

## Testing in isolation
**Prerequisites:** primary frozen first; features timestamped at order placement; nested purged CV; separate folds for fit, calibration and sizing.

**Primary metric:** change in net R at a fixed risk budget. **Secondary:** ΔBrier over geometry model; calibration slope; retained expectancy; recall lost.

**Benchmarks, all required:**
1. Take every primary signal.
2. **Geometry-only model:** first-passage P from a, b, c, remaining variance, time of day. ML must beat this, not the base rate.
3. **Random filter at equal retention.** Filters can improve Sharpe through less exposure alone.
4. Vol-only filter, nested.
5. Fixed sizing at equal exposure.
6. **Zero-edge pipeline:** random-side signals and simulated random walks must return nothing net.
7. Placebo levels at matched distance.

**Report:** PBO, DSR with honest N, date-block CI, per-instrument and per-year stability, untouched holdout.

## Pitfalls
- **Leakage:** labels overlapping folds; features through the entry bar; calibration on training data.
- **Class balancing:** up-sampling distorts probabilities; recalibrate to the true base rate before sizing.
- **Metric trap:** accuracy rises by predicting the majority class.
- **Clustering:** USD pairs give near-duplicate trades.
- **Nonstationarity:** see Cederburg et al. 2020 [V].
- **Weak primary:** meta-labelling needs a reasonable primary (Singh & Joubert [V]); otherwise lower drawdown may be its only gain.
- **Barrier choice:** a, b, k are trials too.

## Links
hudsonthames.org/does-meta-labeling-add-to-signal-efficacy · github.com/hudson-and-thames/meta-labeling · papers.ssrn.com/abstract=2326253 · doi.org/10.1016/j.knosys.2024.112477 · arxiv.org/pdf/1207.1403
