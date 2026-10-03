# Absorption ratio on 28 FX pairs: first look (descriptive, not pre-registered)

27 pairs, 2016-03-15 -> 2026-08-20, 60-day window
AR1 mean 0.341 (1/n would be 0.037); PC1 vs dollar factor |corr| median 0.67

## Q1 shift tercile -> next-20-day FX vol (1 = normal)
shift_t           0      1      2
fit 2016-20   0.958  1.009  0.969
read 2021-26  1.001  0.972  1.013

## Q1 ar5 tercile -> next-20-day FX vol (1 = normal)
ar5_t             0      1      2
fit 2016-20   0.959  0.954  1.014
read 2021-26  1.030  1.000  0.981

## Q2 yesterday AR5 tercile -> share of pair-days beyond their p75 range (design 25%)
ar5_t           0.0    1.0    2.0
fit 2016-20   0.263  0.248  0.242
read 2021-26  0.259  0.264  0.247

## Q3 dollar 5-day sign -> next 5 days same sign (50% = no trend), by AR5 tercile
                     mean  size
             ar5_t             
fit 2016-20  0      0.487   499
             1      0.469   499
             2      0.458   500
read 2021-26 0      0.447   206
             1      0.519   618
             2      0.453   930
