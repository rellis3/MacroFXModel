# Addendum A — magnitude of repricing → how much Nasdaq moves

Baseline 9 features; rates 20 unsigned features. Ridge α=10. Explore→confirm and monthly walk-forward.

## Out-of-sample skill (R²), confirm half and walk-forward

| target     | H   |   base_R2 |   with_rates_R2 |    gain | gain_95            |   wf_base |   wf_with | wf_gain_95         |
|:-----------|:----|----------:|----------------:|--------:|:-------------------|----------:|----------:|:-------------------|
| log_rv     | 15m |    0.0918 |          0.0916 | -0.0002 | [-0.0071, +0.0063] |    0.1206 |    0.12   | [-0.0085, +0.0063] |
| log_absret | 15m |    0.0918 |          0.0916 | -0.0002 | [-0.0070, +0.0070] |    0.1206 |    0.12   | [-0.0086, +0.0068] |
| ret        | 15m |   -0.0012 |         -0.0339 | -0.0327 | [-0.0544, -0.0148] |   -0.0041 |   -0.0176 | [-0.0250, -0.0018] |
| log_rv     | 1h  |    0.2633 |          0.2712 |  0.0079 | [-0.0164, +0.0291] |    0.3402 |    0.3488 | [-0.0091, +0.0261] |
| log_absret | 1h  |    0.0559 |          0.0526 | -0.0032 | [-0.0162, +0.0091] |    0.1022 |    0.1036 | [-0.0121, +0.0124] |
| ret        | 1h  |   -0.0013 |         -0.0536 | -0.0523 | [-0.1166, -0.0029] |   -0.0125 |   -0.0496 | [-0.0659, -0.0136] |
| log_rv     | 2h  |    0.2808 |          0.2844 |  0.0036 | [-0.0267, +0.0322] |    0.3766 |    0.3817 | [-0.0136, +0.0253] |
| log_absret | 2h  |    0.0497 |          0.0245 | -0.0253 | [-0.0551, -0.0008] |    0.0774 |    0.0531 | [-0.0479, -0.0031] |
| ret        | 2h  |    0.0034 |         -0.0739 | -0.0773 | [-0.1900, +0.0128] |   -0.0254 |   -0.069  | [-0.0977, -0.0030] |

## Where the gain sits (confirm half, log realised vol 1h and log |return| 1h): R² gain by regime

| regime                |   log_absret 1h |   log_rv 1h |   log_rv 2h |
|:----------------------|----------------:|------------:|------------:|
| session: Asia         |         -0.0179 |     -0.0499 |     -0.0092 |
| session: London       |         -0.0156 |     -0.0285 |     -0.0293 |
| session: US           |          0.0067 |      0.0345 |      0.026  |
| vol tercile: high vol |         -0.0258 |     -0.0388 |     -0.0369 |
| vol tercile: low vol  |          0.0137 |      0.0407 |      0.061  |
| vol tercile: mid vol  |          0.0001 |      0.0192 |     -0.0089 |

## Standardised coefficients, log realised vol 1h model (top 12)

|            |       0 |
|:-----------|--------:|
| hc         | -0.2005 |
| us         |  0.1515 |
| hs         |  0.142  |
| log_rv_1d  |  0.1372 |
| ldn        | -0.1273 |
| log_rv_1h  |  0.1189 |
| log_rv_4h  |  0.0749 |
| US_M7_abs  |  0.0616 |
| EU_U7_abs  | -0.056  |
| dispersion |  0.0527 |
| abs_ret_1h |  0.0488 |
| EU_Z6_abs  |  0.0434 |

## Keep rule

Cells with the gain interval above zero on BOTH confirm and walk-forward: none.
Vol-tercile sign agreement (terciles with positive gain, of 3): {'log_absret 1h': 2, 'log_rv 1h': 2, 'log_rv 2h': 1}.
