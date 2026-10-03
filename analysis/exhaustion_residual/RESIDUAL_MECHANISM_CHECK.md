# Residual mechanism check (descriptive, not pre-registered)

residual = realised daily ln(H/L) / Yang-Zhang-10 sigma; exceed_p75 = share of days beyond the train-fitted 75th pct (design 25%)

## IV/RV tercile (0 = low, 2 = high)

                         n  median_res  exceed_p75
half          ivrv_t                              
test 2023-26  0       2004       1.295       0.184
              1       2240       1.424       0.237
              2       2224       1.513       0.295
train 2020-22 0       1344       1.331       0.193
              1       1337       1.471       0.265
              2       1344       1.532       0.293

## IV / sigma-forecast tercile (0 = low, 2 = high)

                          n  median_res  exceed_p75
half          ivsig_t                              
test 2023-26  0        1888       1.206       0.130
              1        2269       1.407       0.223
              2        2311       1.618       0.348
train 2020-22 0        1344       1.268       0.148
              1        1337       1.465       0.230
              2        1344       1.636       0.374

## term slope iv30/iv90 tercile (0 = low, 2 = high)

                         n  median_res  exceed_p75
half          term_t                              
test 2023-26  0       2748       1.385       0.228
              1       2173       1.430       0.246
              2       1547       1.438       0.256
train 2020-22 0       1344       1.447       0.267
              1       1337       1.438       0.225
              2       1344       1.448       0.259

## tier-1 USD event day (0 = low, 2 = high)

                        n  median_res  exceed_p75
half          event                              
test 2023-26  False  5635       1.381       0.227
              True    833       1.598       0.336
train 2020-22 False  3493       1.419       0.231
              True    532       1.664       0.376

## Per instrument, test half 2023-26: exceed_p75 by IV/sigma tercile

ivsig_t      0      1      2
inst                        
AUDUSD   0.125  0.186  0.321
EURUSD   0.128  0.190  0.345
GBPUSD   0.132  0.235  0.384
NAS100   0.091  0.261  0.358
USDCAD   0.123  0.212  0.346
USDCHF   0.146  0.219  0.403
USDJPY   0.151  0.250  0.302

log-range ~ lsig: coef [0.906]  test R2 0.474
log-range ~ lsig + liv: coef [0.367, 0.607]  test R2 0.520
log-range ~ lsig + liv + event: coef [0.368, 0.605, 0.138]  test R2 0.527
