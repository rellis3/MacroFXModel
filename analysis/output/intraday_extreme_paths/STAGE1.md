# INTRADAY-EXTREME-PATHS - Stage 1 descriptive baselines (DISCOVERY 2016-2021 only)

Descriptive only: no hypothesis test (prereg section 10). Shares are of rows with an outcome; CONT|res = CONT among
CONT+REV with a date-clustered 95% interval; null_lo/null_hi = 95% band of the same share under the sign-flip null
(orientation randomised per instrument-session). Primary H=2h, 1.0u unless stated; late band never pooled.

## A. all oriented rows (|D|>=0.25), by class
```
 cell      n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
cross 271560   1455  27.16 26.03  46.77  0.03      51.06  50.46  51.66    49.66    50.33
 gold  13141   1422  26.58 24.44  48.96  0.02      52.10  50.61  53.58    48.34    51.59
index  68377   1449  25.89 25.35  48.75  0.01      50.52  49.44  51.60    49.32    50.65
major  94397   1455  27.03 25.41  47.53  0.03      51.55  50.77  52.32    49.41    50.59
```

## B. large moves, by class
```
 cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
cross 89033   1442  31.39 29.28  39.30  0.03      51.73  50.81  52.66    49.62    50.60
 gold  4179    792  31.78 28.26  39.94  0.02      52.93  50.63  55.23    47.67    52.19
index 21745   1290  31.78 30.28  37.94  0.01      51.21  49.54  52.87    48.96    51.04
major 30808   1400  31.16 27.98  40.85  0.01      52.69  51.51  53.87    49.06    50.83
```

## C. large: pullback x age of extreme
```
               cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
     F<=0.15 | <60m 60785   1452  29.99 28.57  41.43  0.01      51.21  50.18  52.24    49.46    50.59
  F<=0.15 | 60-180m  9849   1377  27.55 25.38  47.07  0.00      52.04  50.26  53.83    48.66    51.38
    F<=0.15 | >180m  2973    973  27.14 25.50  47.36  0.00      51.57  48.58  54.55    47.73    52.53
   S0.15-0.5 | <60m 25947   1428  35.54 31.32  33.11  0.03      53.16  51.91  54.40    49.34    50.73
S0.15-0.5 | 60-180m 22569   1416  30.08 27.45  42.44  0.03      52.29  50.85  53.72    49.09    50.77
  S0.15-0.5 | >180m 10387   1192  29.37 25.86  44.76  0.01      53.18  51.17  55.19    48.49    51.26
      M0.5-1 | <60m  1756    574  45.56 39.75  14.64  0.06      53.40  49.78  57.03    47.56    52.71
   M0.5-1 | 60-180m  4617    903  36.00 34.31  29.65  0.04      51.20  48.55  53.85    48.26    51.63
     M0.5-1 | >180m  4362    706  32.49 32.07  35.44  0.00      50.32  47.39  53.25    48.05    52.26
         D>1 | <60m   216     51  53.24 43.06   2.31  1.39      55.29  44.10  66.48    44.23    56.25
      D>1 | 60-180m   701    158  44.37 45.65   9.84  0.14      49.29  42.11  56.46    46.43    53.41
        D>1 | >180m  1603    177  41.86 45.60  12.54  0.00      47.86  42.99  52.73    46.64    53.04
```

## D. large: range used (terciles of used / disc HL p50 within large moves, class x hour)
```
cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
 low 48606   1447  26.88 25.23  47.87  0.02      51.59  50.54  52.64    49.38    50.68
 mid 48569   1427  30.53 28.13  41.32  0.02      52.05  51.06  53.04    49.25    50.59
high 48590   1248  36.82 34.03  29.13  0.02      51.97  50.73  53.21    49.40    50.55
```

## E. large: momentum o*1h return (terciles within large moves, class x hour)
```
cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
 low 48598   1443  30.91 28.24  40.82  0.03      52.25  51.09  53.42    49.42    50.66
 mid 48528   1444  28.79 26.75  44.44  0.01      51.84  50.78  52.89    49.45    50.60
high 48639   1450  34.53 32.38  33.07  0.02      51.60  50.59  52.62    49.38    50.57
```

## F. large: sigma regime
```
  cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
 quiet 35029   1056  31.93 29.16  38.89  0.02      52.26  50.98  53.54    49.23    50.74
normal 76819   1300  30.96 28.53  40.49  0.02      52.05  51.03  53.06    49.40    50.55
  busy 23289    790  32.64 31.67  35.69  0.00      50.75  48.76  52.75    49.09    50.97
```

## G. large: hour band
```
   cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
   asia 22264   1204  32.93 30.09  36.95  0.03      52.25  50.23  54.27    49.17    50.85
 london 43416   1424  32.66 30.64  36.70  0.00      51.59  50.22  52.97    49.31    50.66
     ny 36236   1411  28.60 26.83  44.54  0.03      51.60  50.07  53.14    49.31    50.71
overlap 43849   1434  31.72 29.04  39.21  0.03      52.21  50.81  53.61    49.31    50.67
```

## H. large AND fresh extreme (F, <60m), by class
```
 cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
cross 37116   1439  29.70 29.22  41.06  0.02      50.41  49.23  51.58    49.32    50.67
 gold  1528    662  32.00 25.79  42.21  0.00      55.38  52.00  58.76    46.66    53.17
index  9244   1234  30.86 28.07  41.05  0.01      52.37  50.16  54.57    48.65    51.35
major 12897   1379  29.94 27.39  42.68  0.00      52.23  50.65  53.80    48.89    51.17
```

## I. flat rows (|D|<0.25): CONS baseline (CONT/REV here = up/down)
```
 cell      n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
cross 223132   1455  21.03 21.50  57.44  0.03      49.44  48.93  49.94    49.59    50.39
 gold  11439   1376  20.02 22.39  57.57  0.03      47.21  45.49  48.92    48.48    51.65
index  72728   1443  17.84 19.06  63.10  0.01      48.35  47.06  49.64    49.26    50.80
major  78646   1454  21.71 21.82  56.44  0.03      49.88  49.28  50.48    49.41    50.57
```

## J. LATE stratum (h 19-21), large, H=1h
```
 cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
cross 21730   1301  21.43 26.24  52.18  0.15      44.96  43.45  46.48    49.11    50.90
 gold  1037    423  22.95 23.24  53.71  0.10      49.69  45.38  54.00    45.72    54.07
index  5526    984  24.83 24.90  50.25  0.02      49.93  46.93  52.93    48.22    51.78
major  7711   1121  19.49 24.47  55.83  0.21      44.34  42.26  46.41    48.54    51.76
```

## K. large, H=1h, 1.0u
```
 cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
cross 89033   1442  31.42 29.80  38.75  0.03      51.33  50.59  52.07    49.56    50.44
 gold  4179    792  31.63 30.08  38.26  0.02      51.26  49.38  53.14    48.04    51.78
index 21735   1290  31.69 29.68  38.63  0.01      51.64  50.18  53.09    49.02    50.85
major 30808   1400  31.26 28.89  39.85  0.01      51.97  51.00  52.95    49.23    50.70
```

## K. large, H=4h, 1.0u
```
 cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
cross 89033   1442  31.06 28.98  39.93  0.02      51.73  50.52  52.95    49.34    50.62
 gold  4179    792  31.83 28.24  39.89  0.05      52.99  50.04  55.93    46.69    53.21
index 21747   1290  30.85 29.92  39.23  0.00      50.77  48.59  52.95    48.78    51.37
major 30808   1400  30.28 27.29  42.42  0.01      52.60  51.08  54.12    48.83    51.06
```

## L. large, H=2h, 0.5u
```
 cell     n  dates  CONT%  REV%  CONS%  AMB%  CONT|res%  ci_lo  ci_hi  null_lo  null_hi
cross 89033   1442  48.67 47.43   3.81  0.10      50.65  50.05  51.24    49.60    50.40
 gold  4179    792  48.46 47.07   4.38  0.10      50.73  49.07  52.38    48.33    51.90
index 21745   1290  47.30 46.22   6.44  0.04      50.58  49.37  51.78    49.18    50.66
major 30808   1400  48.70 47.02   4.25  0.03      50.88  50.05  51.71    49.36    50.73
```

## M. Secondary outcomes, large moves, H=2h (oriented; u units)
```
           n S1 P(end>0)% S1 mean end (u) S2 P(extend >=0.25u beyond E)% S3 P(close<entry | CONT first)% S4 MFE p25/p50/p75 (u) S4 MAE p25/p50/p75 (u)
cross  89033    49.784911        0.018131                      41.399256                       11.625577      [0.31, 0.67, 1.2]     [0.31, 0.65, 1.15]
gold    4179     48.98301        0.018782                       41.78033                       12.650602      [0.3, 0.67, 1.24]     [0.32, 0.66, 1.12]
index  21745    49.680386        0.008486                      43.596229                       14.833575     [0.29, 0.66, 1.25]     [0.29, 0.66, 1.23]
major  30808    49.870164        0.027002                      42.365619                       10.998854      [0.3, 0.66, 1.19]      [0.3, 0.64, 1.11]
```

## N. Cost feasibility (2x the registered spread table, as cost / u at H=2h, large-move rows)
```
       instruments  cost/u median  share cost/u>0.15 %  any estimated
cls                                                                  
cross           20          0.193               78.537             16
gold             1          0.169               61.910              0
index            6          0.100               16.931              1
major            7          0.109               18.588              1
```
Per instrument: stage1_costs.csv. For a symmetric ±1u race with exits at the barriers, the break-even is
CONT% - REV% (of all rows) > cost/u, before any CONS-exit P&L.
