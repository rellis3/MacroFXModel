# COG-TREND-STATE results

Run once per forge/COG_TREND_STATE_PREREG.md. Fuzzy causal trend states (adaptive zig-zag), line vs Nasdaq. Explore to Jul 17, confirm from Jul 20.

## k = 0.75: line flips 441 (explore 259, confirm 181), Nasdaq flips 553 (explore 278, confirm 275)
## k = 1.5: line flips 137 (explore 85, confirm 52), Nasdaq flips 219 (explore 108, confirm 111)
## k = 2.5: line flips 42 (explore 25, confirm 17), Nasdaq flips 87 (explore 46, confirm 41)

## M1: state cross-correlation (line state at t vs Nasdaq state at t + tau)

|    k |   same_time_explore |   same_time_confirm | peak_explore             | peak_confirm              |   best_lead_tau_h |   lead_c_explore |   lead_c_confirm |   fw95_explore | explore_exceeds   | confirm_confirms   | PASS   |
|-----:|--------------------:|--------------------:|:-------------------------|:--------------------------|------------------:|-----------------:|-----------------:|---------------:|:------------------|:-------------------|:-------|
| 0.75 |               0.154 |               0.227 | (1, 0.15513752840137002) | (0, 0.22709936764176633)  |                 1 |            0.155 |            0.206 |          0.167 | False             | True               | False  |
| 1.5  |               0.108 |               0.096 | (8, 0.1161131955699)     | (20, 0.18024046539051114) |                39 |           -0.161 |            0.023 |          0.249 | False             | False              | False  |
| 2.5  |               0.16  |               0.053 | (0, 0.1600803044202983)  | (20, 0.1336697113991043)  |                 1 |            0.153 |            0.061 |          0.353 | False             | False              | False  |

same_time = correlation at tau 0; peak = (tau in hours, value) of the highest correlation over -24..+48 h; best_lead_tau = the lead (tau >= 1 h) with the largest |correlation| in explore.

## M2: the line turns to a direction while Nasdaq is still in the opposite trend; does Nasdaq turn within H?

36 cells; 9 pass FDR 10% in explore; 0 confirmed. Cells with enough events: 30.

|    k |   dir | H   |   nE_e |    pE_e |    pB_e |   diff_e |     z_e |   mde_e |   nE_c |   diff_c |     z_c | fdr   | confirmed   |
|-----:|------:|:----|-------:|--------:|--------:|---------:|--------:|--------:|-------:|---------:|--------:|:------|:------------|
| 0.75 |     1 | 1h  |     49 |   0.306 |   0.239 |    0.067 |   1.147 |   0.164 |     38 |   -0.009 |  -0.149 | False | False       |
| 0.75 |     1 | 2h  |     49 |   0.51  |   0.407 |    0.103 |   1.832 |   0.158 |     38 |    0.089 |   1.254 | False | False       |
| 0.75 |     1 | 4h  |     49 |   0.714 |   0.621 |    0.093 |   1.822 |   0.143 |     38 |    0.109 |   1.531 | False | False       |
| 0.75 |     1 | 8h  |     49 |   0.918 |   0.832 |    0.087 |   2.702 |   0.09  |     38 |    0.023 |   0.398 | True  | False       |
| 0.75 |     1 | 24h |     49 |   1     |   0.976 |    0.024 |   2.358 |   0.029 |     38 |   -0.004 |  -0.159 | True  | False       |
| 0.75 |     1 | 48h |     49 |   1     |   0.976 |    0.024 |   2.416 |   0.028 |     38 |    0.004 |   0.192 | True  | False       |
| 0.75 |    -1 | 1h  |     85 |   0.271 |   0.166 |    0.104 |   2.328 |   0.125 |     50 |    0.025 |   0.41  | True  | False       |
| 0.75 |    -1 | 2h  |     85 |   0.482 |   0.297 |    0.186 |   3.763 |   0.138 |     50 |    0.032 |   0.449 | True  | False       |
| 0.75 |    -1 | 4h  |     85 |   0.588 |   0.475 |    0.113 |   2.496 |   0.127 |     50 |    0.066 |   1.125 | True  | False       |
| 0.75 |    -1 | 8h  |     85 |   0.788 |   0.691 |    0.098 |   2.886 |   0.095 |     50 |   -0.009 |  -0.16  | True  | False       |
| 0.75 |    -1 | 24h |     85 |   0.906 |   0.91  |   -0.004 |  -0.153 |   0.069 |     50 |    0.046 |   2.267 | False | False       |
| 0.75 |    -1 | 48h |     85 |   0.918 |   0.915 |    0.003 |   0.112 |   0.064 |     50 |    0.019 |   1.166 | False | False       |
| 1.5  |     1 | 1h  |     17 |   0.059 |   0.1   |   -0.041 |  -0.715 |   0.162 |     14 |   -0.099 |  -9.66  | False | False       |
| 1.5  |     1 | 2h  |     17 |   0.118 |   0.186 |   -0.068 |  -0.886 |   0.216 |     14 |   -0.049 |  -0.494 | False | False       |
| 1.5  |     1 | 4h  |     17 |   0.235 |   0.317 |   -0.082 |  -0.85  |   0.27  |     14 |    0.005 |   0.039 | False | False       |
| 1.5  |     1 | 8h  |     17 |   0.706 |   0.514 |    0.192 |   1.717 |   0.313 |     14 |   -0.016 |  -0.125 | False | False       |
| 1.5  |     1 | 24h |     17 |   0.824 |   0.826 |   -0.003 |  -0.033 |   0.235 |     14 |    0.035 |   0.544 | False | False       |
| 1.5  |     1 | 48h |     17 |   0.882 |   0.902 |   -0.02  |  -0.283 |   0.196 |     14 |    0.051 |   2.153 | False | False       |
| 1.5  |    -1 | 1h  |     26 |   0.154 |   0.068 |    0.086 |   1.2   |   0.2   |     14 |    0.004 |   0.055 | False | False       |
| 1.5  |    -1 | 2h  |     26 |   0.385 |   0.134 |    0.25  |   2.514 |   0.279 |     14 |   -0.054 |  -0.792 | True  | False       |
| 1.5  |    -1 | 4h  |     26 |   0.385 |   0.246 |    0.138 |   1.526 |   0.254 |     14 |   -0.013 |  -0.136 | False | False       |
| 1.5  |    -1 | 8h  |     26 |   0.654 |   0.425 |    0.229 |   2.392 |   0.268 |     14 |    0.108 |   0.775 | True  | False       |
| 1.5  |    -1 | 24h |     26 |   0.808 |   0.761 |    0.046 |   0.702 |   0.184 |     14 |   -0.017 |  -0.147 | False | False       |
| 1.5  |    -1 | 48h |     26 |   0.885 |   0.834 |    0.051 |   1.032 |   0.138 |     14 |    0.003 |   0.033 | False | False       |
| 2.5  |     1 | 1h  |      4 | nan     | nan     |  nan     | nan     | nan     |      5 |  nan     | nan     | False | False       |
| 2.5  |     1 | 2h  |      4 | nan     | nan     |  nan     | nan     | nan     |      5 |  nan     | nan     | False | False       |
| 2.5  |     1 | 4h  |      4 | nan     | nan     |  nan     | nan     | nan     |      5 |  nan     | nan     | False | False       |
| 2.5  |     1 | 8h  |      4 | nan     | nan     |  nan     | nan     | nan     |      5 |  nan     | nan     | False | False       |
| 2.5  |     1 | 24h |      4 | nan     | nan     |  nan     | nan     | nan     |      5 |  nan     | nan     | False | False       |
| 2.5  |     1 | 48h |      4 | nan     | nan     |  nan     | nan     | nan     |      5 |  nan     | nan     | False | False       |
| 2.5  |    -1 | 1h  |      9 |   0.111 |   0.028 |    0.083 |   0.788 |   0.295 |      5 |  nan     | nan     | False | False       |
| 2.5  |    -1 | 2h  |      9 |   0.111 |   0.054 |    0.057 |   0.529 |   0.303 |      5 |  nan     | nan     | False | False       |
| 2.5  |    -1 | 4h  |      9 |   0.222 |   0.1   |    0.122 |   0.864 |   0.395 |      5 |  nan     | nan     | False | False       |
| 2.5  |    -1 | 8h  |      9 |   0.333 |   0.185 |    0.149 |   0.938 |   0.444 |      5 |  nan     | nan     | False | False       |
| 2.5  |    -1 | 24h |      9 |   0.333 |   0.458 |   -0.125 |  -0.821 |   0.425 |      5 |  nan     | nan     | False | False       |
| 2.5  |    -1 | 48h |      9 |   0.556 |   0.584 |   -0.029 |  -0.177 |   0.455 |      5 |  nan     | nan     | False | False       |
