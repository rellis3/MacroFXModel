# INTRADAY-EXTREME-PATHS - Stage 0 checks

No outcome share is reported here (prereg section 10, Stage 0).

Rows: 1,797,010 (34 instruments); by block {'disc': 981491, 'val': 527799, 'conf': 287720}.

## 1. Independent recomputation
400 random rows re-derived with pandas time slicing: **0 mismatches**.

## 2. AMB rate (% of rows), discovery, barrier 1.0u
```
H                  1      2      4
cls   band                        
cross asia     0.030  0.031  0.023
      late     0.135  0.093    NaN
      london   0.010  0.013  0.023
      ny       0.045  0.041  0.031
      overlap  0.057  0.050  0.027
gold  asia     0.000  0.000  0.014
      late     0.092  0.104    NaN
      london   0.000  0.000  0.014
      ny       0.023  0.046  0.069
      overlap  0.035  0.052  0.017
index asia     0.000  0.005  0.000
      late     0.016  0.000    NaN
      london   0.002  0.005  0.002
      ny       0.004  0.008  0.004
      overlap  0.015  0.006  0.000
major asia     0.016  0.020  0.020
      late     0.147  0.128    NaN
      london   0.002  0.008  0.016
      ny       0.020  0.039  0.036
      overlap  0.069  0.047  0.010

barrier 0.5u
H                  1      2      4
cls   band                        
cross asia     0.063  0.053  0.036
      late     0.525  0.409    NaN
      london   0.037  0.022  0.038
      ny       0.199  0.150  0.117
      overlap  0.163  0.144  0.070
gold  asia     0.055  0.041  0.014
      late     0.391  0.380    NaN
      london   0.000  0.014  0.000
      ny       0.161  0.115  0.161
      overlap  0.121  0.086  0.052
index asia     0.025  0.015  0.003
      late     0.215  0.053    NaN
      london   0.055  0.012  0.021
      ny       0.035  0.012  0.020
      overlap  0.073  0.032  0.009
major asia     0.039  0.035  0.026
      late     0.458  0.467    NaN
      london   0.022  0.016  0.043
      ny       0.115  0.092  0.121
      overlap  0.111  0.160  0.120
```

No-bar windows (%), 1.0u
```
H                   1      2      4
cls   band                         
cross asia      0.000  0.000  0.000
      late      0.412  0.000    NaN
      london    0.000  0.000  0.000
      ny        0.000  0.000  0.000
      overlap   0.000  0.000  0.000
gold  asia      0.000  0.000  0.000
      late      4.995  2.970    NaN
      london    0.000  0.000  0.000
      ny        0.783  0.783  0.783
      overlap   0.000  0.000  0.000
index asia      0.101  0.081  0.051
      late     14.273  1.955    NaN
      london    0.152  0.107  0.031
      ny        0.558  0.558  0.499
      overlap   0.070  0.020  0.020
major asia      0.000  0.000  0.000
      late      0.403  0.000    NaN
      london    0.000  0.000  0.000
      ny        0.000  0.000  0.000
      overlap   0.000  0.000  0.000
```

Stale decision bar (> 5 min old), %
```
band   asia  late  london    ny  overlap
cls                                     
cross  0.03  0.04    0.00  0.00     0.03
gold   0.03  2.99    0.00  0.00     0.03
index  2.05  2.14    0.44  0.09     0.31
major  0.27  0.18    0.02  0.01     0.03
```

## 3. Leak canary (Brier skill vs class frequencies; fit 2016-19, score 2020-21)
{
 "n_train": 328360,
 "n_test": 192457,
 "next_bar_return (registered)": 0.0264,
 "window_end_return (strong)": 0.4908,
 "next_bar_return shuffled": 0.0
}

## 4. Power (cluster-by-date SE of a CONT-among-resolved share; share not shown)
```
{
 "pooled": {
  "n_rows_disc": 99708,
  "dates_disc": 1450,
  "n_eff_disc": 16108,
  "mde80_pp_disc": 1.1,
  "mde80_pp_val_projected": 1.43
 },
 "class=cross": {
  "n_rows_disc": 60810,
  "dates_disc": 1433,
  "n_eff_disc": 12976,
  "mde80_pp_disc": 1.23,
  "mde80_pp_val_projected": 1.54
 },
 "class=gold": {
  "n_rows_disc": 2828,
  "dates_disc": 716,
  "n_eff_disc": 2074,
  "mde80_pp_disc": 3.07,
  "mde80_pp_val_projected": 4.32
 },
 "class=index": {
  "n_rows_disc": 15541,
  "dates_disc": 1233,
  "n_eff_disc": 3887,
  "mde80_pp_disc": 2.25,
  "mde80_pp_val_projected": 3.26
 },
 "class=major": {
  "n_rows_disc": 20529,
  "dates_disc": 1369,
  "n_eff_disc": 8052,
  "mde80_pp_disc": 1.56,
  "mde80_pp_val_projected": 2.05
 },
 "fresh extremes": {
  "n_rows_disc": 38606,
  "dates_disc": 1444,
  "n_eff_disc": 10093,
  "mde80_pp_disc": 1.39,
  "mde80_pp_val_projected": 1.8
 },
 "family C cells (class x regime x band; disc)": {
  "cells": 60,
  "median_dates": 282,
  "median_mde80_pp_disc": 7.1,
  "share_cells_mde_le_5pp": 0.22
 },
 "rows_by_block (large-move, resolved, H=2, k=1)": {
  "conf": 32896,
  "disc": 99708,
  "val": 59585
 }
}
```