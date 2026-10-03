# Butterfly (tail pricing) and risk reversal at the p75 line: first look (descriptive, not pre-registered)

4551 first p75 touches, 6 FX majors, 2020-09-09 -> 2026-08-20

## butterfly / iv30 (0 = thin tails priced, 2 = fat)
out                continue   fade  stall     n
half         bf_t                              
fit 2020-22  0        0.350  0.367  0.282   602
             1        0.332  0.384  0.284   599
             2        0.348  0.409  0.243   606
read 2023-26 0        0.344  0.389  0.267  1184
             1        0.333  0.402  0.265   622
             2        0.351  0.408  0.241   938

## risk reversal in the touch direction / iv30 (0 = against, 2 = with)
out                     continue   fade  stall     n
half         rr_with_t                              
fit 2020-22  0             0.342  0.399  0.259   602
             1             0.317  0.405  0.278   600
             2             0.372  0.357  0.271   605
read 2023-26 0             0.332  0.420  0.248   816
             1             0.345  0.403  0.251  1262
             2             0.354  0.363  0.282   666

