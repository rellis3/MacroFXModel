# RATE-CURVE-STRUCTURE results

Run once per forge/RATE_CURVE_STRUCTURE_PREREG.md. 15-min bars, Apr 13 – Oct 9 2026; explore to Jul 17, confirm from Jul 20.

## How often each repricing type fires (bars; explore / confirm)

|          | US 1h    | US 4h   | EU 1h   | EU 4h   | DIFF 1h   | DIFF 4h   |
|:---------|:---------|:--------|:--------|:--------|:----------|:----------|
| BROAD    | 58 / 26  | 52 / 17 | 47 / 4  | 48 / 0  | 62 / 23   | 57 / 13   |
| FRONT    | 2 / 9    | 4 / 1   | 0 / 3   | 0 / 0   | 25 / 7    | 24 / 8    |
| DEFERRED | 38 / 155 | 23 / 93 | 6 / 195 | 1 / 123 | 29 / 108  | 14 / 83   |
| STEEPEN  | 34 / 10  | 11 / 8  | 51 / 5  | 63 / 3  | 77 / 19   | 67 / 13   |
| FLATTEN  | 20 / 7   | 12 / 18 | 33 / 3  | 31 / 4  | 53 / 14   | 39 / 21   |
| TWIST    | 74 / 86  | 21 / 21 | 30 / 27 | 5 / 9   | 93 / 59   | 46 / 19   |

## Power (planted into BROAD / US / 4h / H=1h, explore; detected = survives BH-FDR 10% in its 144-cell family)

| target | planted | detected |
|---|---|---|
| ret | 0.0005 | no |
| ret | 0.001 | no |
| relvol | 1.1 | no |
| breakout | 0.05 | no |

## Test 1 — conditional outcomes after each repricing type (event study vs hour-matched random bars)

**ret**: 3 of 144 cells pass BH-FDR 10% in explore.
**relvol**: 7 of 144 cells pass BH-FDR 10% in explore.
**breakout**: 6 of 144 cells pass BH-FDR 10% in explore.

Explore survivors and their confirm result (sign fixed from explore, one-sided 5%):

| type    | curve   | W   | target   | H   |   n_e |   obs_e |   base_e |   n_c |    obs_c |   base_c |     p_c | confirmed   |
|:--------|:--------|:----|:---------|:----|------:|--------:|---------:|------:|---------:|---------:|--------:|:------------|
| BROAD   | US      | 1h  | ret      | 1h  |    57 |  0.0014 |   0      |    24 |   0.0013 |   0.0001 |   0.057 | True        |
| BROAD   | DIFF    | 1h  | ret      | 2h  |    59 |  0.002  |  -0.0001 |    22 |  -0.0019 |   0.0002 |   0.033 | False       |
| BROAD   | DIFF    | 1h  | ret      | 4h  |    59 |  0.0032 |   0      |    22 |  -0.001  |   0.0002 |   0.303 | False       |
| BROAD   | US      | 1h  | relvol   | 2h  |    52 |  1.3061 |   1.0789 |    22 |   1.2284 |   0.9545 |   0.039 | True        |
| STEEPEN | EU      | 4h  | relvol   | 1h  |    63 |  1.3182 |   1.0771 |     3 | nan      | nan      | nan     | False       |
| STEEPEN | EU      | 4h  | relvol   | 2h  |    61 |  1.4015 |   1.0794 |     3 | nan      | nan      | nan     | False       |
| BROAD   | DIFF    | 4h  | relvol   | 2h  |    54 |  1.3631 |   1.0823 |    13 | nan      | nan      | nan     | False       |
| FRONT   | DIFF    | 4h  | relvol   | 1h  |    24 |  0.571  |   1.0611 |     8 | nan      | nan      | nan     | False       |
| FRONT   | DIFF    | 4h  | relvol   | 2h  |    21 |  0.6245 |   1.0508 |     8 | nan      | nan      | nan     | False       |
| FLATTEN | DIFF    | 4h  | relvol   | 1h  |    39 |  0.7138 |   1.056  |    21 |   0.7568 |   0.971  |   0.071 | True        |
| BROAD   | US      | 4h  | breakout | 4h  |    33 |  0.6667 |   0.9091 |    15 | nan      | nan      | nan     | False       |
| STEEPEN | EU      | 4h  | breakout | 2h  |    61 |  0.9344 |   0.7869 |     3 | nan      | nan      | nan     | False       |
| BROAD   | DIFF    | 1h  | breakout | 1h  |    62 |  0.4355 |   0.6613 |    23 |   0.6522 |   0.6087 |   0.883 | False       |
| BROAD   | DIFF    | 4h  | breakout | 1h  |    57 |  0.4035 |   0.614  |    13 | nan      | nan      | nan     | False       |
| BROAD   | DIFF    | 4h  | breakout | 2h  |    54 |  0.5926 |   0.7593 |    13 | nan      | nan      | nan     | False       |
| BROAD   | DIFF    | 4h  | breakout | 4h  |    47 |  0.5957 |   0.9149 |    13 | nan      | nan      | nan     | False       |

**Confirmed: 3 of 16.**

<details><summary>ret, H=1h: effect minus baseline, explore / confirm</summary>

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |           0.0011 |           0.0001 |        -0.0006 |         0.001  |         0.0013 |         0.0002 |
| DEFERRED |          -0.0007 |         nan      |       nan      |       nan      |        -0.0008 |        -0.0006 |
| FLATTEN  |           0.0004 |           0.0006 |         0.0003 |        -0.0003 |       nan      |       nan      |
| FRONT    |          -0.0001 |          -0.0004 |       nan      |       nan      |       nan      |       nan      |
| STEEPEN  |           0.0001 |           0.0002 |         0.0001 |         0.0004 |        -0      |       nan      |
| TWIST    |           0.0006 |          -0.0004 |        -0.0002 |       nan      |        -0.0001 |       nan      |

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |          -0      |         nan      |       nan      |            nan |         0.0013 |       nan      |
| DEFERRED |          -0.0002 |          -0.0004 |        -0      |             -0 |         0.0001 |        -0.001  |
| FLATTEN  |         nan      |          -0.001  |       nan      |            nan |       nan      |       nan      |
| TWIST    |           0.0004 |         nan      |         0.0001 |            nan |        -0.0001 |        -0.0003 |

</details>

<details><summary>relvol, H=1h: effect minus baseline, explore / confirm</summary>

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |           0.0251 |           0.2789 |         0.1181 |         0.125  |         0.2566 |         0.0228 |
| DEFERRED |           0.1332 |         nan      |       nan      |       nan      |         0.1559 |         0.1283 |
| FLATTEN  |          -0.0303 |          -0.3422 |         0.0217 |        -0.0548 |       nan      |       nan      |
| FRONT    |          -0.092  |          -0.4901 |       nan      |       nan      |       nan      |       nan      |
| STEEPEN  |           0.2124 |           0.0627 |         0.1051 |         0.2412 |        -0.04   |       nan      |
| TWIST    |          -0.013  |          -0.1146 |         0.0353 |       nan      |        -0.0671 |       nan      |

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |           0.3403 |         nan      |       nan      |        nan     |         0.5155 |       nan      |
| DEFERRED |           0.0933 |           0.1219 |         0.2392 |          0.253 |         0.2291 |         0.2431 |
| FLATTEN  |         nan      |          -0.2142 |       nan      |        nan     |       nan      |       nan      |
| TWIST    |           0.087  |         nan      |         0.1891 |        nan     |         0.0234 |         0.0416 |

</details>

<details><summary>breakout, H=1h: effect minus baseline, explore / confirm</summary>

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |          -0.2258 |          -0.2105 |        -0.0426 |        -0.1042 |         0.0175 |           0.02 |
| DEFERRED |          -0.1379 |         nan      |       nan      |       nan      |         0.0909 |         nan    |
| FLATTEN  |           0.0962 |          -0.2051 |        -0.0938 |         0      |       nan      |         nan    |
| FRONT    |           0.12   |          -0.0208 |       nan      |       nan      |       nan      |         nan    |
| STEEPEN  |           0.013  |          -0.1194 |        -0.04   |        -0.0476 |        -0.0303 |         nan    |
| TWIST    |           0.086  |           0.0217 |        -0.0345 |       nan      |         0.0656 |         nan    |

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |           0.0435 |         nan      |       nan      |       nan      |         0.25   |        nan     |
| DEFERRED |           0      |           0.0241 |         0.0154 |        -0.0976 |        -0.0347 |         -0.122 |
| FLATTEN  |         nan      |          -0.0476 |       nan      |       nan      |       nan      |        nan     |
| TWIST    |           0.0351 |         nan      |        -0.1538 |       nan      |        -0.0519 |        nan     |

</details>

<details><summary>ret, H=4h: effect minus baseline, explore / confirm</summary>

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |           0.0032 |           0.0003 |         0.0001 |         0.0019 |         0.002  |         0.0032 |
| DEFERRED |          -0.0003 |         nan      |       nan      |       nan      |         0.0005 |        -0.0009 |
| FLATTEN  |          -0.0001 |          -0.0002 |        -0      |        -0.0022 |       nan      |       nan      |
| FRONT    |          -0.0013 |         nan      |       nan      |       nan      |       nan      |       nan      |
| STEEPEN  |           0      |          -0.0001 |         0.0006 |         0.0013 |        -0.0008 |       nan      |
| TWIST    |           0.0006 |           0.0007 |        -0.0013 |       nan      |        -0.0006 |        -0.0023 |

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |          -0.0013 |         nan      |       nan      |       nan      |         0.0014 |       nan      |
| DEFERRED |          -0.0006 |          -0.0007 |        -0.0001 |         0.0011 |        -0      |        -0.0019 |
| TWIST    |           0.0006 |         nan      |        -0.0015 |       nan      |        -0.001  |       nan      |

</details>

<details><summary>relvol, H=4h: effect minus baseline, explore / confirm</summary>

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |           0.0571 |           0.0124 |         0.0596 |         0.118  |         0.0578 |         -0.234 |
| DEFERRED |           0.1075 |         nan      |       nan      |       nan      |         0.163  |        nan     |
| FLATTEN  |          -0.0478 |         nan      |         0.0531 |        -0.1841 |       nan      |        nan     |
| FRONT    |          -0.2189 |         nan      |       nan      |       nan      |       nan      |        nan     |
| STEEPEN  |           0.1567 |          -0.0296 |         0.1423 |         0.2073 |       nan      |        nan     |
| TWIST    |           0.0009 |          -0.0457 |        -0.0639 |       nan      |         0.0167 |        nan     |

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| DEFERRED |           0.0562 |            0.133 |         0.1445 |         0.1558 |         0.0549 |         0.0673 |
| TWIST    |           0.0331 |          nan     |       nan      |       nan      |         0.0883 |       nan      |

</details>

<details><summary>breakout, H=4h: effect minus baseline, explore / confirm</summary>

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| BROAD    |          -0.0545 |          -0.3191 |        -0.0233 |        -0.0938 |         0      |        -0.2424 |
| DEFERRED |          -0.037  |         nan      |       nan      |       nan      |        -0.0333 |       nan      |
| FLATTEN  |           0.0488 |         nan      |        -0.1613 |         0.1    |       nan      |       nan      |
| FRONT    |           0      |         nan      |       nan      |       nan      |       nan      |       nan      |
| STEEPEN  |           0.0517 |           0      |        -0.0426 |         0.0962 |        -0.1429 |       nan      |
| TWIST    |           0      |           0.0606 |        -0.0741 |       nan      |         0.02   |       nan      |

| type     |   ('DIFF', '1h') |   ('DIFF', '4h') |   ('EU', '1h') |   ('EU', '4h') |   ('US', '1h') |   ('US', '4h') |
|:---------|-----------------:|-----------------:|---------------:|---------------:|---------------:|---------------:|
| DEFERRED |          -0.022  |          -0.0455 |        -0.0168 |        -0.0233 |        -0.0696 |        -0.2182 |
| TWIST    |           0.0612 |         nan      |       nan      |       nan      |        -0.0143 |       nan      |

</details>

## Test 2 — lead times

Correlation of each factor's 15-min change (bar t) with Nasdaq's 15-min return at bar t+k, day-clustered t in brackets; k=0 is the same bar.

| curve   | factor   | half    | same_bar      | k1            | k2            | k4            | k8            | k16           |
|:--------|:---------|:--------|:--------------|:--------------|:--------------|:--------------|:--------------|:--------------|
| US      | level    | explore | -0.278 [-4.8] | +0.016 [+1.0] | -0.025 [-1.4] | +0.007 [+0.4] | +0.008 [+0.3] | +0.003 [+0.2] |
| US      | level    | confirm | -0.241 [-4.9] | -0.047 [-2.0] | -0.004 [-0.2] | +0.001 [+0.0] | -0.001 [-0.1] | +0.025 [+1.7] |
| US      | slope    | explore | -0.159 [-4.2] | +0.024 [+1.5] | -0.026 [-1.7] | +0.004 [+0.3] | -0.008 [-0.5] | +0.010 [+0.7] |
| US      | slope    | confirm | -0.188 [-4.8] | -0.047 [-2.1] | -0.016 [-0.6] | -0.007 [-0.4] | -0.016 [-1.0] | +0.015 [+1.1] |
| US      | curv     | explore | -0.086 [-3.7] | +0.010 [+0.7] | -0.005 [-0.3] | +0.007 [+0.4] | +0.025 [+1.5] | -0.012 [-0.8] |
| US      | curv     | confirm | -0.055 [-2.7] | -0.053 [-3.0] | +0.038 [+2.0] | -0.001 [-0.0] | -0.004 [-0.2] | -0.015 [-1.1] |
| EU      | level    | explore | -0.338 [-5.4] | -0.004 [-0.3] | -0.017 [-1.1] | +0.010 [+0.6] | +0.009 [+0.5] | -0.022 [-1.5] |
| EU      | level    | confirm | -0.260 [-5.4] | -0.077 [-3.7] | -0.003 [-0.2] | +0.022 [+1.2] | +0.010 [+0.5] | +0.024 [+1.5] |
| EU      | slope    | explore | -0.195 [-4.7] | +0.008 [+0.4] | -0.019 [-1.2] | -0.009 [-0.5] | -0.028 [-1.5] | -0.024 [-1.5] |
| EU      | slope    | confirm | -0.241 [-5.3] | -0.078 [-3.5] | -0.003 [-0.2] | +0.024 [+1.6] | +0.010 [+0.5] | +0.020 [+1.4] |
| EU      | curv     | explore | -0.165 [-4.4] | -0.006 [-0.4] | -0.016 [-0.9] | -0.021 [-1.2] | -0.028 [-1.7] | -0.018 [-1.3] |
| EU      | curv     | confirm | -0.135 [-4.4] | -0.004 [-0.2] | +0.003 [+0.2] | +0.016 [+0.9] | +0.005 [+0.3] | +0.019 [+1.3] |
| DIFF    | level    | explore | +0.103 [+3.1] | +0.024 [+1.7] | -0.012 [-0.8] | -0.006 [-0.4] | -0.001 [-0.0] | +0.030 [+2.0] |
| DIFF    | level    | confirm | -0.018 [-0.7] | +0.026 [+1.2] | -0.003 [-0.2] | -0.023 [-1.2] | -0.010 [-0.4] | -0.001 [-0.1] |
| DIFF    | slope    | explore | -0.036 [-1.7] | +0.018 [+1.0] | -0.018 [-1.4] | +0.010 [+0.6] | +0.007 [+0.4] | +0.020 [+1.2] |
| DIFF    | slope    | confirm | +0.056 [+2.7] | +0.030 [+1.5] | -0.016 [-0.9] | -0.036 [-1.9] | -0.033 [-1.5] | +0.000 [+0.0] |
| DIFF    | curv     | explore | +0.006 [+0.3] | +0.012 [+0.7] | +0.001 [+0.1] | +0.016 [+0.9] | +0.045 [+2.8] | +0.004 [+0.3] |
| DIFF    | curv     | confirm | +0.021 [+1.1] | -0.045 [-2.5] | +0.032 [+1.8] | -0.007 [-0.5] | -0.008 [-0.5] | -0.022 [-1.5] |

After an event, when does Nasdaq's cumulative |move| leave its matched baseline? (first of 16 bars where the ratio to baseline is outside the 95% band; '—' = never)

| type     | curve   | half    |   n | first_bar   |   ratio_4h |
|:---------|:--------|:--------|----:|:------------|-----------:|
| BROAD    | US      | explore |  52 | 16          |       1.29 |
| BROAD    | US      | confirm |  17 | n<30        |     nan    |
| FRONT    | US      | explore |   4 | n<30        |     nan    |
| FRONT    | US      | confirm |   1 | n<30        |     nan    |
| DEFERRED | US      | explore |  22 | n<30        |     nan    |
| DEFERRED | US      | confirm |  92 | 3           |       0.95 |
| STEEPEN  | US      | explore |  11 | n<30        |     nan    |
| STEEPEN  | US      | confirm |   7 | n<30        |     nan    |
| FLATTEN  | US      | explore |  12 | n<30        |     nan    |
| FLATTEN  | US      | confirm |  18 | n<30        |     nan    |
| TWIST    | US      | explore |  21 | n<30        |     nan    |
| TWIST    | US      | confirm |  21 | n<30        |     nan    |
| BROAD    | EU      | explore |  48 | —           |       1.02 |
| BROAD    | EU      | confirm |   0 | n<30        |     nan    |
| FRONT    | EU      | explore |   0 | n<30        |     nan    |
| FRONT    | EU      | confirm |   0 | n<30        |     nan    |
| DEFERRED | EU      | explore |   1 | n<30        |     nan    |
| DEFERRED | EU      | confirm | 123 | —           |       1.01 |
| STEEPEN  | EU      | explore |  63 | 6           |       0.89 |
| STEEPEN  | EU      | confirm |   3 | n<30        |     nan    |
| FLATTEN  | EU      | explore |  31 | 5           |       0.68 |
| FLATTEN  | EU      | confirm |   4 | n<30        |     nan    |
| TWIST    | EU      | explore |   5 | n<30        |     nan    |
| TWIST    | EU      | confirm |   9 | n<30        |     nan    |
| BROAD    | DIFF    | explore |  57 | 5           |       1.08 |
| BROAD    | DIFF    | confirm |  13 | n<30        |     nan    |
| FRONT    | DIFF    | explore |  24 | n<30        |     nan    |
| FRONT    | DIFF    | confirm |   8 | n<30        |     nan    |
| DEFERRED | DIFF    | explore |  14 | n<30        |     nan    |
| DEFERRED | DIFF    | confirm |  83 | —           |       0.92 |
| STEEPEN  | DIFF    | explore |  67 | 3           |       0.55 |
| STEEPEN  | DIFF    | confirm |  13 | n<30        |     nan    |
| FLATTEN  | DIFF    | explore |  39 | 2           |       0.84 |
| FLATTEN  | DIFF    | confirm |  21 | n<30        |     nan    |
| TWIST    | DIFF    | explore |  46 | —           |       0.91 |
| TWIST    | DIFF    | confirm |  19 | n<30        |     nan    |

## Test 3 — does the curve STRUCTURE add out-of-sample skill beyond Nasdaq-only, a single contract and two-contract spreads?

Feature sets: (a) Nasdaq-only 7 features; (b) + single contract **EU_U6_4h** (best on explore); (c) + pair SOFR U6 − €STR U6 and US slope (1h, 4h); (d) + full curve structure, 63 more features. Ridge (α=10) for return and log relative vol; logistic (C=0.1) for breakout. Fit on explore, scored on confirm.

Out-of-sample skill on confirm (R² for return / log relvol, AUC for breakout); intervals = day-block bootstrap of the difference vs (a):

| target   | H   |       a |       b | b-a 95%            |      c | c-a 95%            |       d | d-a 95%            |
|:---------|:----|--------:|--------:|:-------------------|-------:|:-------------------|--------:|:-------------------|
| ret      | 1h  | -0.0007 | -0.0031 | [-0.0080, +0.0014] | 0.0073 | [-0.0059, +0.0221] | -0.1079 | [-0.2146, -0.0443] |
| ret      | 4h  | -0.0049 | -0.0112 | [-0.0144, +0.0035] | 0.0045 | [-0.0136, +0.0414] | -0.1986 | [-0.3031, -0.0790] |
| relvol   | 1h  |  0.1411 |  0.1326 | [-0.0026, +0.0028] | 0.175  | [-0.0212, +0.0131] |  0.0622 | [-0.1881, -0.0551] |
| relvol   | 4h  |  0.193  |  0.1797 | [-0.0140, +0.0097] | 0.2275 | [-0.0422, +0.0091] |  0.1232 | [-0.2205, -0.0438] |
| breakout | 1h  |  0.6151 |  0.6351 | [+0.0043, +0.0227] | 0.6481 | [-0.0058, +0.0235] |  0.5589 | [-0.0859, -0.0080] |
| breakout | 4h  |  0.7649 |  0.7962 | [-0.0031, +0.0080] | 0.8107 | [-0.0682, +0.0263] |  0.5682 | [-0.3802, -0.1002] |

Walk-forward check (refit each month Jun–Oct on all prior data, H=1h):

| target   | H   |       a |       d |    n |
|:---------|:----|--------:|--------:|-----:|
| ret      | 1h  | -0.0075 | -0.1597 | 1473 |
| relvol   | 1h  |  0.1861 |  0.0627 | 1473 |
| breakout | 1h  |  0.5819 |  0.5677 | 1473 |

## Test 4 — stability across regimes (H=1h, W=4h)

Share of (type × curve) cells whose explore and confirm effects have the SAME sign, by regime (0.5 = coin flip):

| regime                                     |   cells |   ret_same_sign |   brk_same_sign |
|:-------------------------------------------|--------:|----------------:|----------------:|
| session: US                                |       4 |            0.25 |            0.75 |
| stock-rates sign: stocks-vs-rates OPPOSITE |       5 |            0.4  |            0.6  |

Largest explore effects by regime and what confirm did with them (signed 1h return after the event, %):

| regime                                     | type     | curve   |   n_E |   ret_E |   n_C |   ret_C | ret_stable   |
|:-------------------------------------------|:---------|:--------|------:|--------:|------:|--------:|:-------------|
| session: US                                | DEFERRED | US      |    18 |  -0.058 |    73 |  -0.117 | True         |
| stock-rates sign: stocks-vs-rates OPPOSITE | FLATTEN  | DIFF    |    39 |   0.057 |    21 |  -0.101 | False        |
| stock-rates sign: stocks-vs-rates OPPOSITE | DEFERRED | US      |    18 |  -0.05  |    82 |  -0.099 | True         |
| stock-rates sign: stocks-vs-rates OPPOSITE | TWIST    | DIFF    |    46 |  -0.039 |    19 |   0.021 | False        |
| session: US                                | FLATTEN  | DIFF    |    24 |   0.038 |    15 |  -0.083 | False        |
| stock-rates sign: stocks-vs-rates OPPOSITE | TWIST    | US      |    17 |  -0.037 |    20 |  -0.04  | True         |
| session: US                                | TWIST    | DIFF    |    31 |  -0.027 |    16 |   0.034 | False        |
| stock-rates sign: stocks-vs-rates OPPOSITE | BROAD    | US      |    50 |   0.021 |    16 |  -0.006 | False        |
| session: US                                | BROAD    | US      |    47 |   0.002 |    16 |  -0.006 | False        |

## Reading (written after the run, nothing re-run)

**Can the type of repricing be identified from the cross-contract structure?** Mechanically yes — the six types fire a
few dozen times each per half on the US and US−EU curves — but their *frequencies are not stable*: EU BROAD fired 47
times in Apr–Jul and 4 times in Jul–Oct; US DEFERRED 38 then 155. The market's repricing regime itself changed between
the halves (spring = parallel moves on both curves; late summer = back-end repricing), and a classifier built on a
rolling 20-day scale inherits that. Consequence: most explore survivors had 3–15 confirm events and could not be tested.

**Does the structure give advance information about Nasdaq?**

- *Test 3 is the decisive one and says no.* The full curve-structure feature set is **worse** out of sample than
  Nasdaq-only on every target (return R² −0.11 / −0.20; relative-vol R² 0.06 vs 0.14; breakout AUC 0.56 vs 0.62), with
  the bootstrap intervals of the difference entirely below zero, and the monthly walk-forward agrees. Sixty-three
  features on 57 explore days overfit; the two-contract spreads (c) and the single best contract (b) do no harm and add
  at most a hair (breakout 1h AUC +0.02 [+0.004, +0.023] for the single contract — the only interval above zero in the
  table, and small). The ordering required by the reading rule, (d) > (c) ≥ (b) > (a), is reversed.
- *Test 2:* the same-bar link is strong and stable (−0.24 to −0.34 for level and slope on both curves, both halves). A
  one-bar (15-min) lead appears **only in confirm** (EU level/slope −0.08, t −3.6; US level −0.05) and is absent in
  explore (+0.02 / 0.00) — a regime feature, not a replicated lead. Nothing at 1–4 h.
- *Test 1:* 16 of 432 cells passed FDR in explore; 3 passed a one-sided confirm on 21–24 events each:
  1. after a **broad 1-hour US repricing**, Nasdaq's next hour goes *with* the rate move (+0.14 % explore, +0.13 %
     confirm) — i.e. it gives back part of its same-bar opposite reaction;
  2. the same event is followed by **higher 2-hour realised vol** (1.31× vs 1.08× baseline; 1.23× vs 0.95×);
  3. a **US−EU flattening over 4 h** is followed by *lower* next-hour vol (0.71× vs 1.06×; 0.76× vs 0.97×).
  The planted-signal check shows the family could not have detected the registered effect sizes, so these are
  large-effect, small-n survivors, not a calibrated finding: 3 of 16 at a 5 % one-sided bar is about what 16 shots
  produce by chance (expected 0.8, but the three are the ones with the most confirm events). Sign stability by regime
  (test 4) is at coin-flip level (0.25–0.6).

**Classification.** Structure beyond single contract / spread: **genuinely no** on the out-of-sample model test (that
test has power: it measured a *negative* difference with a tight interval). Type-conditioned event effects:
**insufficient data** at the registered sizes; three large-effect candidates (broad US repricing → next-hour
continuation and higher 2-h vol; US−EU flattening → quieter hour) are the only things worth a forward paper record,
not a feature.

**What would become a feature in MacroFXModel if it survives forward:** a single flag, "broad US repricing in the last
hour" (|level z| ≥ 2 with |slope z| < 1 on SR3 U6–U7), feeding the existing `ratesRegime` read as a vol-expansion
context note for the next two hours — not a direction call. Nothing from the strip, PCA or front/deferred split
earned a place.
