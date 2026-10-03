# Next-ideas checks (descriptive, not pre-registered)

## A. Is the forecast error sticky, and do adaptive lines fix it?

2023-26, p75 line (design 25%): next-day breach rate by the last 20 days' breach rate
           mean  size
recent_t             
<15%      0.278  1512
15-35%    0.234  4495
>35%      0.187   461

Calibration by IV/sigma tercile, fixed vs adaptive line (2023-26, design 25%):
         fixed  adaptive
ivsig_t                 
0        0.130     0.126
1        0.223     0.231
2        0.348     0.374
mean |miss| across terciles: fixed 0.081, adaptive 0.089

## B. Does option skew say which side breaks?

2020-22: share of days beyond the OH p75 / OL p75 line by skew tercile (0 = puts richest, 2 = calls richest)
         oh     ol
rr_t              
0     0.263  0.260
1     0.251  0.261
2     0.238  0.231

2023-26: share of days beyond the OH p75 / OL p75 line by skew tercile (0 = puts richest, 2 = calls richest)
         oh     ol
rr_t              
0     0.261  0.206
1     0.245  0.227
2     0.243  0.247

