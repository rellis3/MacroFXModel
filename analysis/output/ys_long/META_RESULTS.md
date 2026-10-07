# Meta-labelling the yield-spread book on the long history (results)

Pre-registration: `forge/META_LABEL_LONG_PREREG.md`. Test = modern era 2006–2026 only: **8,142 primary bets** (~754 effective). Logistic, close-based features, AFML sizing, month-block bootstrap.

## Era gate: old data DROPPED
Per-bet sized Sharpe on 2006–2026: trained from 1976 = -0.0233, trained from 1996 only = -0.0117. Main result uses **M (1996+)**.

## Verdict: **FAIL**

| | primary alone | meta | meta without volatility features |
|---|---|---|---|
| precision | 51.0% | **51.0%** | 50.5% |
| share of bets taken | 100% | 45% | 48% |
| per-bet Sharpe | 0.001 | **-0.012** | -0.012 |

- Precision gain: +0.0 pp [-2.0, +2.1]
- Sharpe gain vs flat: -0.013 [-0.066, +0.036]
- Volatility features' contribution (vs ablation): +0.000 [-0.019, +0.022]
- Deflated Sharpe (N = 7): 0.043

Sanity check (top tercile higher |z| and win rate than bottom): **passed**

| tercile | bets | win | mean net | mean \|z\| |
|---|---|---|---|---|
| low | 2714 | 51.1% | 0.010% | 1.69 |
| mid | 2714 | 50.3% | -0.010% | 1.68 |
| high | 2714 | 51.6% | 0.010% | 1.87 |

Coefficients (standardised, mean over years): z -0.069, usd_trend +0.055, today +0.048, cusum_with +0.039, spread +0.025, since_cross +0.024, dsig5 +0.023, regime -0.021, absz +0.015, res5 +0.012
Other arm (L (1976+)): sized Sharpe -0.0233, meta precision 50.5%.
