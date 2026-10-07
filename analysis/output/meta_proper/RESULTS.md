# Meta-labelling built properly — results (layers 3–7)

Pre-registration: `forge/META_LABEL_PROPER_PREREG.md`. Walk-forward by year 2019–2026, purged + 10-trading-day embargo: **3,144 primary bets** (~395 effective after overlap). 95% intervals: month-block bootstrap.

## Verdict: **FAIL**

| | primary alone | meta (full) | meta without the volatility features |
|---|---|---|---|
| precision | 51.6% | **50.3%** | 51.1% |
| share of bets taken | 100% | 58% | 57% |
| per-bet Sharpe | 0.025 | **0.022** | 0.043 |
| F1 | 0.680 | 0.531 | |

- Precision gain (meta − primary): -1.2 pp, interval [-3.3, +0.9]
- Sharpe gain (meta − flat): -0.003, interval [-0.068, +0.060]
- Volatility system's contribution (full − ablation Sharpe): -0.021, interval [-0.072, +0.029]
- Deflated Sharpe (N = 5 trials, effective T = 395): 0.224 (probability the sized Sharpe beats the best-of-5 null)

## Does the model sort bets? (test bets by predicted-probability tercile)

| tercile | bets | win rate | mean net return | mean \|z\| |
|---|---|---|---|---|
| low | 1048 | 53.1% | 0.050% | 1.77 |
| mid | 1048 | 50.9% | 0.010% | 1.75 |
| high | 1048 | 50.7% | 0.010% | 1.77 |

| year | bets | primary precision | meta precision | flat total % | meta total % |
|---|---|---|---|---|---|
| 2019 | 438 | 46.6% | 46.6% | -26.53 | +0.00 |
| 2020 | 340 | 42.9% | 42.4% | -36.79 | +0.06 |
| 2021 | 509 | 55.0% | 51.2% | +27.86 | +0.00 |
| 2022 | 464 | 55.4% | 58.2% | +44.12 | +0.42 |
| 2023 | 404 | 59.2% | 59.8% | +67.54 | +0.67 |
| 2024 | 374 | 52.7% | 53.5% | +15.48 | +0.67 |
| 2025 | 341 | 46.6% | 45.6% | -13.68 | -0.12 |
| 2026 | 274 | 50.7% | 54.4% | -3.40 | +0.05 |

Feature importance (impurity, mean over years; descriptive): spread 0.076, since_cross 0.075, today 0.073, absz 0.072, usd_trend 0.072, regime 0.072, z 0.071, dz5 0.071, iv_sig 0.068, res5 0.068, dsig5 0.068, cal5 0.042

## Sanity check: FAILED — the model did not recover the primary's own known effect

Test bets with |z| ≥ 2 won more often than |z| < 2 in 7 of 8 test years (|z| 2–2.5: 58.6% vs 50.0% at 1–1.5; train
era 2016–18: 54.3% vs 47.9%). The forest's terciles have equal mean |z| (1.75–1.77), so it learned nothing the primary
didn't already show. With ~395 effective samples, 13 inputs and 12%-of-data trees, the registered model was too weak
to find even a known effect. **This FAIL therefore does not answer whether the volatility system helps.**
