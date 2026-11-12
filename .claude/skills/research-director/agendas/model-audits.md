# Agenda: model audits (are the models we already run doing the job we think?)

Set 2026-11-12 by learn-intake from Quant Guild notes (`education/intake/technical/quant-guild/`). Not C.OG. These
are mechanics audits of live inputs, not edge hunts: the verdict changes what the desk relies on, not a trade. Theme
keywords for `evidence_map.mjs`: `hmm regime stability touch probability reachability monte carlo pca loadings`.
Hand chosen cards to `research-protocol` to claim.

## Cards, in rank order

### Q1. Does the HMM label stay put, or does it relabel the past? — score 11/15

> Fit the regime model at t and record day t's label. Refit at t+1, t+5, t+20 and re-read day t. Count how often the
> past changes, how long states last, how often they flip, and read that against a plain σ-percentile split.

| | |
|---|---|
| Construct | `hmm.js` (and `hmmHourly.js`, `creditHmm.js`) state for day t, as fitted at t and after later refits |
| Knowable when | label at t uses data to t; the audit compares vintages |
| Condition | by instrument; calm vs busy years |
| Horizons | refit lags 1, 5, 20 days |
| Noise threshold | relabel and flip rate of "20-day σ above its 1-year median" |
| Outcome distribution | relabel rate, dwell time, flip rate, agreement with the σ split |
| Benchmark / control / mirror | the σ-percentile split |
| Mechanism | none needed: a label used live must not change after the fact |
| Builds on | `gr-hmm-trend-direction` NULL (direction, not stability); memory: HMM = variance, not direction |
| Data & power | daily bars on hand; descriptive; testable now |
| If yes → (stable, adds beyond σ) | keep, and document dwell/flip in the inputs register |
| If no → | replace `hmmSignalScore` inputs with the readable σ threshold |
| Falsifier | relabel rate no higher than the σ split's and agreement under 80% |

Source: QG model tier list ("HMM C tier: states unstable"); method lesson #6.

### Q2. Path model, not output patch, for P(touch) — score 10/15

> Compute P(touch) within H from three generators: the current iid-normal-plus-wick, a block bootstrap of the
> instrument's own intraday returns rescaled to the same σ, and that plus a time-of-day vol profile. Read calibration
> per instrument and horizon against the current fitted map, out of sample.

| | |
|---|---|
| Construct | P(touch) from each generator, as in `forecastPathCore.intradayReachability` |
| Knowable when | inputs up to bar t; touch scored over the next H M5 bars |
| Condition | EURUSD, GOLD, NQ; per horizon |
| Horizons | 6 / 12 / 24 / 48 M5 bars |
| Noise threshold | calibration error on random placebo levels, day-bootstrap interval; doubling paths moves the answer < its CI (lesson #2) |
| Outcome distribution | reliability curve, Brier, Brier skill |
| Benchmark / control / mirror | the current piecewise-linear map (fitted on EURUSD M5 H=12, borrowed elsewhere) |
| Mechanism | iid paths ignore vol clustering and intraday seasonality, so they over-state touches (94% predicted → 68% realised) |
| Builds on | `js/oiReachability.js` header; level_p2 calibrated geometry; EURUSD reach cells (Brier skill +0.188) |
| Data & power | M1/M5 on hand; thousands of level-days; testable now |
| If yes → | retire the borrowed map; generator becomes per-instrument |
| If no → | the error isn't the path model; keep the map, stop blaming the generator |
| Falsifier | the bootstrap generator is no better calibrated than the map out of sample |

Source: QG path signatures ("if our paths aren't accurate, they're going to produce unrealistic payoff densities"); lesson #13.

### Q3. PCA loading stability as a condition on FX8 residual reversion — score 6/15 (Parked)

Principal angle between top-K eigenvectors (120-day window vs 20 days earlier); top vs bottom tercile; 1/2/5-day
residual IC; bar IC 0.03 + MDE; shuffled-stability placebo. Base effect is NULL/UNDERPOWERED (`residual-pca-wide10`
+0.0075), so splitting it cuts power: **parked until the `residual-fx8-forward` record has a verdict**. Run the
stability *diagnostic* (lesson #3) meanwhile. Source: QG model + math tier lists.
