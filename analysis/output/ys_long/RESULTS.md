# The yield-spread book on 40 untouched years (results)

Pre-registration: `forge/YS_LONG_CONFIRM_PREREG.md`. FRED daily FX (noon NY) + monthly rates, the validated configuration unchanged (entry |z| 2.0, window 126, exit 1.5 / 20 days, 0.02% cost, flat size). 95% intervals: month-block bootstrap.

## Verdict (1976–2014, six original pairs): **PASS**

Checks: mean > 0 with interval above 0: True · win rate > 50%: True · decades positive 4/4 · pairs positive 6/6.
Daily flat-book Sharpe 1976–2014: 0.393.

| period | trades | mean net / trade [95%] | win | PF |
|---|---|---|---|---|
| **1976–2014 (test)** | 868 | +0.243% [+0.005, +0.464] | 55.1% | 1.277 |
| 1976–85 | 164 | +0.343% [-0.072, +0.792] | 60.4% | 1.45 |
| 1986–95 | 209 | +0.354% [-0.077, +0.765] | 55.5% | 1.417 |
| 1996–2005 | 267 | +0.219% [-0.167, +0.598] | 50.2% | 1.255 |
| 2006–14 | 228 | +0.099% [-0.433, +0.594] | 56.6% | 1.098 |
| validated era 2015–2026 (FRED rebuild, cross-check) | 305 | +0.297% [-0.072, +0.656] | 55.7% | 1.422 |

| pair (1976–2014) | trades | mean net / trade [95%] | win | PF |
|---|---|---|---|---|
| AUDUSD | 175 | +0.095% [-0.334, +0.555] | 50.9% | 1.091 |
| EURUSD | 75 | +0.026% [-0.515, +0.551] | 56.0% | 1.029 |
| GBPUSD | 170 | +0.350% [-0.073, +0.800] | 58.8% | 1.409 |
| USDCAD | 165 | +0.200% [-0.099, +0.500] | 61.8% | 1.341 |
| USDCHF | 152 | +0.225% [-0.212, +0.686] | 47.4% | 1.232 |
| USDJPY | 131 | +0.503% [-0.025, +1.025] | 55.7% | 1.551 |

## Breadth check (NZD, NOK, SEK, never tested, full span): **FAIL**

Pooled: 638 | +0.229% [-0.050, +0.492] | 54.5% | 1.247 · daily Sharpe 0.283

| pair | trades | mean net / trade [95%] | win | PF |
|---|---|---|---|---|
| NZDUSD | 220 | +0.232% [-0.164, +0.643] | 51.4% | 1.256 |
| USDNOK | 218 | +0.228% [-0.179, +0.629] | 57.3% | 1.231 |
| USDSEK | 200 | +0.228% [-0.135, +0.617] | 55.0% | 1.257 |
