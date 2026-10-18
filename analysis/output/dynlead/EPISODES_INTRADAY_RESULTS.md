# COG-DYNAMIC-LEAD Addendum D: the episode framing on the intraday SOFR, Euribor (I2! stand-ins) and ESTR futures

Registered in forge/COG_DYNAMIC_LEAD_ADDENDUM_D.md. 17 lines (7 legs, 5 calendar spreads, 5 cross-curve spreads) x 34 assets, 15-minute bars, 2024-04 to 2026-08-20; 896 specs; day-clustered; costs by class.

## Headline: registered selection procedure, real versus the shifted-line placebo (200 draws)
| sample                  |   step1 |   step2 |   oos_pass |
|:------------------------|--------:|--------:|-----------:|
| real                    |     0.0 |     0.0 |        0.0 |
| placebo mean            |     0.0 |     0.0 |        0.0 |
| placebo 95th percentile |     0.0 |     0.0 |        0.0 |
| placebo max             |     2.0 |     0.0 |        0.0 |

## Excess over the confirmation-rule baseline (specs whose real mean differs from the placebo mean by more than 2 placebo SDs)
| period   |   specs |   real_above_placebo_by_2sd |   expected_by_chance |   real_below_placebo_by_2sd |   median_real_bp |   median_placebo_bp |
|:---------|--------:|----------------------------:|---------------------:|----------------------------:|-----------------:|--------------------:|
| DISC     |     896 |                         149 |                20.40 |                          18 |            -1.05 |               -1.68 |
| VAL      |     896 |                         120 |                20.40 |                         136 |            -1.61 |               -2.07 |
| OOS      |     896 |                          27 |                20.40 |                          84 |            -2.25 |               -1.80 |

## How often is the mean positive (confirmation specs)
| period   |   share_real_mean_positive |   share_placebo_mean_positive |
|:---------|---------------------------:|------------------------------:|
| DISC     |                      0.312 |                         0.005 |
| VAL      |                      0.304 |                         0.009 |
| OOS      |                      0.115 |                         0.007 |

## Primary episode definition (coupled, z0 1.5, k 16 bars, m 4, c 0.5, h 96) by line
| line        |   episodes |   mean_net_bp |     t |   share_negative |
|:------------|-----------:|--------------:|------:|-----------------:|
| P0          |        491 |         11.71 |  0.82 |             0.51 |
| ER3Z6       |        567 |          6.69 |  0.81 |             0.52 |
| ER3H7-ER3Z6 |         65 |         11.28 |  0.57 |             0.51 |
| P1          |        388 |         10.87 |  0.57 |             0.57 |
| IZ6         |        683 |          3.41 |  0.47 |             0.54 |
| P3          |        357 |          2.36 |  0.16 |             0.59 |
| IH7         |        648 |          0.66 |  0.09 |             0.53 |
| P4          |        318 |         -0.41 | -0.03 |             0.62 |
| ER3H7       |        640 |         -0.22 | -0.03 |             0.55 |
| P2          |        403 |         -0.67 | -0.05 |             0.59 |
| SR3U6       |       2499 |         -0.49 | -0.11 |             0.51 |
| SR3Z6-SR3U6 |         82 |        -17.73 | -0.87 |             0.48 |
| SR3H7-SR3Z6 |         16 |        -41.16 | -1.19 |             0.69 |
| SR3H7       |       2782 |         -5.55 | -1.26 |             0.55 |
| SR3Z6       |       2697 |         -5.86 | -1.32 |             0.55 |
| SR3H7-SR3U6 |        291 |        -43.52 | -1.98 |             0.64 |

### By quarter (all lines pooled)
| q      |   episodes |   mean_net_bp |   share_negative |
|:-------|-----------:|--------------:|-----------------:|
| 2024Q2 |        718 |          0.37 |             0.50 |
| 2024Q3 |       1463 |          0.81 |             0.53 |
| 2024Q4 |       1182 |         -3.80 |             0.55 |
| 2025Q1 |       1637 |         -0.80 |             0.51 |
| 2025Q2 |       2071 |          0.12 |             0.55 |
| 2025Q3 |        973 |         -4.54 |             0.57 |
| 2025Q4 |        933 |         -5.85 |             0.58 |
| 2026Q1 |       1582 |        -10.62 |             0.61 |
| 2026Q2 |       1725 |          0.18 |             0.50 |
| 2026Q3 |        643 |          1.19 |             0.53 |

## A-priori pairs (24, pre-fixed spec, Holm)
| line        | asset   |   episodes |   mean_net_bp |       t |   p_one_sided |   share_negative |   holm_p |
|:------------|:--------|-----------:|--------------:|--------:|--------------:|-----------------:|---------:|
| SR3Z6       | EURUSD  |        101 |        -8.208 |  -2.010 |         0.978 |            0.574 |    1.000 |
| SR3Z6       | USDJPY  |         97 |        -1.368 |  -0.177 |         0.570 |            0.474 |    1.000 |
| SR3Z6       | GOLD    |         87 |       -12.014 |  -0.792 |         0.786 |            0.598 |    1.000 |
| SR3Z6       | SPX500  |         87 |        -2.367 |  -0.170 |         0.567 |            0.460 |    1.000 |
| SR3Z6       | NAS100  |         75 |        12.962 |   0.734 |         0.232 |            0.387 |    1.000 |
| IH7         | EURUSD  |         13 |        39.416 |   1.375 |         0.085 |            0.462 |    1.000 |
| IH7         | EURJPY  |         27 |         1.310 |   0.118 |         0.453 |            0.481 |    1.000 |
| IH7         | DE30    |         17 |        22.329 |   0.719 |         0.236 |            0.412 |    1.000 |
| IZ6         | EURUSD  |         15 |        30.433 |   1.196 |         0.116 |            0.533 |    1.000 |
| IZ6         | DE30    |         19 |        70.731 |   2.068 |         0.019 |            0.368 |    0.386 |
| ER3Z6       | EURUSD  |         13 |        35.902 |   1.198 |         0.115 |            0.615 |    1.000 |
| ER3Z6       | EURGBP  |          9 |        34.835 |   1.982 |         0.024 |            0.222 |    0.451 |
| SR3Z6-SR3U6 | EURUSD  |          3 |       nan     | nan     |       nan     |          nan     |    1.000 |
| SR3Z6-SR3U6 | USDJPY  |          3 |       nan     | nan     |       nan     |          nan     |    1.000 |
| SR3Z6-SR3U6 | GOLD    |          3 |       nan     | nan     |       nan     |          nan     |    1.000 |
| SR3Z6-SR3U6 | NAS100  |          3 |       nan     | nan     |       nan     |          nan     |    1.000 |
| P0          | EURUSD  |         27 |       -14.080 |  -1.796 |         0.964 |            0.704 |    1.000 |
| P0          | USDJPY  |         19 |         1.033 |   0.073 |         0.471 |            0.474 |    1.000 |
| P3          | EURUSD  |         18 |       -26.104 |  -2.127 |         0.983 |            0.722 |    1.000 |
| P3          | EURGBP  |          6 |       nan     | nan     |       nan     |          nan     |    1.000 |

## Response delay: signed asset response by bars after the line move (z0 1.5, k 16) versus shifted lines
| group     |   bars_after_move |   hours |   events |   mean_signed_response_bp |   placebo_bp |   excess_bp |
|:----------|------------------:|--------:|---------:|--------------------------:|-------------:|------------:|
| all       |                 1 |    0.25 |    98155 |                      0.09 |         0.01 |        0.08 |
| all       |                 2 |    0.50 |    98155 |                      0.13 |         0.01 |        0.11 |
| all       |                 4 |    1.00 |    98155 |                      0.44 |         0.01 |        0.43 |
| all       |                 8 |    2.00 |    98155 |                      0.46 |         0.01 |        0.45 |
| all       |                16 |    4.00 |    98155 |                      0.24 |        -0.16 |        0.40 |
| all       |                32 |    8.00 |    98155 |                      0.88 |        -0.23 |        1.11 |
| all       |                96 |   24.00 |    98155 |                      0.96 |        -0.19 |        1.16 |
| all       |               192 |   48.00 |    98155 |                     -1.99 |        -0.41 |       -1.58 |
| coupled   |                 1 |    0.25 |    20006 |                      0.06 |         0.01 |        0.04 |
| coupled   |                 2 |    0.50 |    20006 |                     -0.23 |        -0.06 |       -0.16 |
| coupled   |                 4 |    1.00 |    20006 |                     -0.47 |        -0.11 |       -0.36 |
| coupled   |                 8 |    2.00 |    20006 |                     -1.35 |        -0.30 |       -1.06 |
| coupled   |                16 |    4.00 |    20006 |                     -1.93 |         0.10 |       -2.03 |
| coupled   |                32 |    8.00 |    20006 |                     -2.78 |        -0.40 |       -2.38 |
| coupled   |                96 |   24.00 |    20006 |                     -2.42 |         0.20 |       -2.62 |
| coupled   |               192 |   48.00 |    20006 |                     -6.28 |         0.71 |       -6.99 |
| confirmed |                 1 |    0.25 |    30559 |                      4.68 |         3.39 |        1.29 |
| confirmed |                 2 |    0.50 |    30559 |                      8.74 |         6.58 |        2.15 |
| confirmed |                 4 |    1.00 |    30559 |                     16.72 |        13.21 |        3.50 |
| confirmed |                 8 |    2.00 |    30559 |                     16.46 |        13.13 |        3.33 |
| confirmed |                16 |    4.00 |    30559 |                     16.43 |        12.82 |        3.61 |
| confirmed |                32 |    8.00 |    30559 |                     16.58 |        12.37 |        4.21 |
| confirmed |                96 |   24.00 |    30559 |                     16.89 |        11.86 |        5.03 |
| confirmed |               192 |   48.00 |    30559 |                     16.11 |        11.53 |        4.58 |

## Best Discovery specs and what happened next (descriptive)
| trade   |    z0 |   k |   m |     c |   h |   mean_DISC |   p_DISC |   pl_DISC |   mean_VAL |   p_VAL |   mean_OOS |   p_OOS |
|:--------|------:|----:|----:|------:|----:|------------:|---------:|----------:|-----------:|--------:|-----------:|--------:|
| coupled | 2.000 |  96 |   2 | 1.000 |  16 |       8.471 |    0.003 |    -1.853 |      3.650 |   0.343 |     -1.779 |   0.674 |
| coupled | 2.000 |  96 |   2 | 0.500 |  16 |       7.906 |    0.004 |    -1.187 |      3.860 |   0.346 |     -2.942 |   0.778 |
| coupled | 2.000 |  96 |   2 | 0.250 |  16 |       6.099 |    0.016 |    -1.432 |      3.011 |   0.364 |     -3.159 |   0.792 |
| coupled | 2.000 |  96 |   4 | 0.500 |  16 |       4.493 |    0.016 |    -2.088 |      5.932 |   0.202 |     -2.916 |   0.799 |
| coupled | 2.000 |  96 |   4 | 0.250 |  16 |       4.681 |    0.016 |    -1.858 |      5.136 |   0.248 |     -2.151 |   0.735 |
| coupled | 1.500 |  96 |   2 | 1.000 |  16 |       4.188 |    0.018 |    -1.399 |      6.479 |   0.217 |      3.168 |   0.197 |
