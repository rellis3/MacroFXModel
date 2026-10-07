# Meta-labelling built properly — results (layers 3–7) — VARIANT 1, logistic

Pre-registration: `forge/META_LABEL_PROPER_PREREG.md`. Walk-forward by year 2019–2026, purged + 10-trading-day embargo: **3,144 primary bets** (~395 effective after overlap). 95% intervals: month-block bootstrap.

## Verdict: **UNINFORMATIVE (sanity check failed)** — and the ablation shows the volatility features add nothing (+0.000)

| | primary alone | meta (full) | meta without the volatility features |
|---|---|---|---|
| precision | 51.6% | **52.6%** | 51.4% |
| share of bets taken | 100% | 48% | 55% |
| per-bet Sharpe | 0.025 | **0.028** | 0.028 |
| F1 | 0.680 | 0.509 | |

- Precision gain (meta − primary): +1.0 pp, interval [-1.7, +3.6]
- Sharpe gain (meta − flat): +0.002, interval [-0.051, +0.052]
- Volatility system's contribution (full − ablation Sharpe): +0.000, interval [-0.025, +0.029]
- Deflated Sharpe (N = 6 trials, effective T = 395): 0.216 (probability the sized Sharpe beats the best-of-6 null)

## Does the model sort bets? (test bets by predicted-probability tercile)

| tercile | bets | win rate | mean net return | mean \|z\| |
|---|---|---|---|---|
| low | 1048 | 51.8% | 0.020% | 1.77 |
| mid | 1048 | 50.9% | 0.020% | 1.75 |
| high | 1048 | 51.9% | 0.030% | 1.76 |

| year | bets | primary precision | meta precision | flat total % | meta total % |
|---|---|---|---|---|---|
| 2019 | 438 | 46.6% | 50.7% | -26.53 | -0.27 |
| 2020 | 340 | 42.9% | 41.9% | -36.79 | +5.82 |
| 2021 | 509 | 55.0% | 63.1% | +27.86 | +0.30 |
| 2022 | 464 | 55.4% | 57.7% | +44.12 | +4.44 |
| 2023 | 404 | 59.2% | 61.8% | +67.54 | +1.03 |
| 2024 | 374 | 52.7% | 57.1% | +15.48 | +2.43 |
| 2025 | 341 | 46.6% | 46.3% | -13.68 | -2.06 |
| 2026 | 274 | 50.7% | 54.2% | -3.40 | +1.29 |

Sanity check (top tercile has higher mean |z| and higher win rate than bottom): **FAILED**.

Logistic coefficients (standardised, mean over years): dsig5_na -0.165, regime +0.103, dsig5 -0.078, regime_na +0.068, z +0.053, usd_trend -0.051, dz5 -0.050, spread +0.049, res5_na -0.049, today -0.047, since_cross +0.040, cusum_with -0.040

## What closes here (stopping rule)

Two properly built models (bagged trees, then logistic) on 3,144 bets, ~395 effective after overlap, could not
recover even the primary's own known |z| effect (|z| 2–2.5 wins 58.6% vs ~50% below 2). The binding constraint is
the effective sample (Lesson 01), not the method. The volatility features' contribution is zero in both (forest
−0.021, logistic +0.000 Sharpe vs the ablation). Meta-labelling the yield-spread book with the volatility state is
closed; the book stays flat / vol-targeted. The simple rule the meta-model was meant to learn (prefer |z| ≥ 2) is
what the traded strategy already does.
