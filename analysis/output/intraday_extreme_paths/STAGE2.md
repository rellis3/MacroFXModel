# INTRADAY-EXTREME-PATHS - Stage 2 results (Validation 2022-2024)

Population: large-move rows, bands asia-ny (h 2-18), H = 2 h, barrier 1.0u, Validation 2022-01-01..2024-12-31.
Rows: 84,653 (778 dates). Effects are percentage points with date-clustered 95% intervals.

## Family A (Holm across A1-A10)
```
                                                       hypothesis                        outcome  effect_pp            ci95  size_pp       p  p_holm     n  dates  half1/half2_pp inst_same_sign_%    amb_bounds_pp                                                               verdict
                           A1 fresh large extreme: CONT|res - 50%                       CONT|res       0.26   [-0.99, 1.51]     0.26    0.68       1 22399    775     0.35 / 0.16             50.0   [0.321, 0.201]                                                    null at Validation
            A2 pullback depth trend (per bin; size = D>1 minus F)                       CONT|res      -0.94   [-2.09, 0.22]    -7.97    0.11    0.68 53668    777  -13.36 / -4.17             68.0 [-7.764, -8.107]                                                    null at Validation
  A3 age of extreme | pullback (per bin; size = >180m minus <60m)                       CONT|res      -0.81   [-1.96, 0.33]    -1.27    0.16    0.82 53668    777   -2.92 / -2.02             68.0 [-2.472, -2.444]                                                    null at Validation
            A4 range used tercile on CONS (size = high minus low)                           CONS      -9.06 [-10.01, -8.11]   -17.96 2.1e-77 2.1e-76 84598    778 -18.48 / -17.49            100.0                -              passes Validation criteria (Confirmation still required)
                      A5 momentum top tercile vs rest on CONT|res                       CONT|res       0.08   [-1.35, 1.51]     0.08    0.91       1 53668    777    0.30 / -0.16             56.0    [0.09, 0.067]                                                    null at Validation
                                  A6 busy vs quiet regime on CONS                           CONS       2.76    [0.28, 5.24]     2.76   0.029    0.21 43264    770     3.72 / 3.83             85.0                -                                                    null at Validation
           A7 IV/sigma tercile (7 instruments): CONS and CONT|res                           CONS      -6.79  [-8.33, -5.25]   -13.59 1.1e-17   1e-16 16283    754 -15.61 / -11.10            100.0                -              passes Validation criteria (Confirmation still required)
                            A8 hour band on CONT|res (joint Wald)                       CONT|res       4.02               -     4.02    0.17    0.82 53668    777     5.06 / 3.48            100.0   [4.046, 3.987]                                                    null at Validation
    A9 dollar / risk factor agreeing with orientation on CONT|res                       CONT|res      -0.93   [-4.23, 2.37]    -0.93       1       1 12026    742    2.38 / -3.64             50.0  [-2.629, 0.826]                                                    null at Validation
A10 macro regime (VIX, curve slope, event day) on CONS / CONT|res vix tercile on CONS (high-low)      -6.06  [-9.34, -2.78]    -6.06  0.0017   0.014 84598    479               -                -                - significant, below the 3pp size bar or inconsistent: research finding
```

Sub-tests inside A7 / A8 / A9 / A10 (each hypothesis's p is Bonferroni over its sub-tests):
```
{
 "A7 IV/sigma tercile (7 instruments): CONS and CONT|res": {
  "CONS per tercile": {
   "eff_pp": -6.792,
   "lo": -8.333,
   "hi": -5.251,
   "p": 0.0,
   "dates": 754
  },
  "CONS high-low": {
   "eff_pp": -13.5877,
   "lo": -16.6626,
   "hi": -10.5127,
   "p": 0.0,
   "dates": 695
  },
  "CONT per tercile": {
   "eff_pp": -0.668,
   "lo": -2.2301,
   "hi": 0.8942,
   "p": 0.402,
   "dates": 731
  },
  "CONT high-low": {
   "eff_pp": -1.4748,
   "lo": -4.5672,
   "hi": 1.6176,
   "p": 0.3499,
   "dates": 657
  }
 },
 "A8 hour band on CONT|res (joint Wald)": {
  "band shares %": {
   "asia": 52.3,
   "london": 50.48,
   "ny": 48.28,
   "overlap": 49.82
  }
 },
 "A9 dollar / risk factor agreeing with orientation on CONT|res": {
  "dollar agree": {
   "eff_pp": -0.9297,
   "lo": -4.228,
   "hi": 2.3685,
   "p": 0.5806,
   "dates": 742
  },
  "risk agree": {
   "eff_pp": 0.3663,
   "lo": -1.0628,
   "hi": 1.7953,
   "p": 0.6154,
   "dates": 774
  }
 },
 "A10 macro regime (VIX, curve slope, event day) on CONS / CONT|res": {
  "vix tercile on CONS (high-low)": {
   "eff_pp": -6.0629,
   "lo": -9.3416,
   "hi": -2.7841,
   "p": 0.0003,
   "dates": 479
  },
  "vix tercile on CONT|res (high-low)": {
   "eff_pp": -0.1284,
   "lo": -2.8782,
   "hi": 2.6214,
   "p": 0.9271,
   "dates": 478
  },
  "slope tercile on CONS (high-low)": {
   "eff_pp": -1.5434,
   "lo": -9.7668,
   "hi": 6.68,
   "p": 0.713,
   "dates": 733
  },
  "slope tercile on CONT|res (high-low)": {
   "eff_pp": 0.7177,
   "lo": -2.4118,
   "hi": 3.8473,
   "p": 0.6531,
   "dates": 732
  },
  "tier1 vs none on CONS": {
   "eff_pp": -4.5008,
   "lo": -7.7854,
   "hi": -1.2163,
   "p": 0.0072,
   "dates": 432
  },
  "tier1 vs none on CONT|res": {
   "eff_pp": 1.1376,
   "lo": -1.8662,
   "hi": 4.1414,
   "p": 0.4579,
   "dates": 432
  }
 }
}
```

## Family B (12 interaction Wald tests, BH-FDR 10%)
```
   interaction  outcome    wald  df      p  max_int_pp  dates   q_bh  pass_fdr10
  pb_s x age_s CONT|res 23.7638   6 0.0006     23.2990    777 0.0035        True
  pb_s x age_s     CONS 47.0268   6 0.0000     12.6819    778 0.0000        True
   pb_s x band CONT|res  8.5722   9 0.4777      8.7421    777 0.5211       False
   pb_s x band     CONS 17.9509   9 0.0357      6.2465    778 0.0613        True
 used_s x band CONT|res  3.2543   6 0.7763      2.5763    777 0.7763       False
 used_s x band     CONS 18.4495   6 0.0052      6.1056    778 0.0104        True
  mom_s x pb_s CONT|res  8.5001   6 0.2037      6.1981    777 0.2444       False
  mom_s x pb_s     CONS 21.2897   6 0.0016      4.7867    778 0.0049        True
reg_s x used_s CONT|res 18.6995   4 0.0009      4.6578    777 0.0036        True
reg_s x used_s     CONS  7.7264   4 0.1021      5.2428    778 0.1532       False
disp_s x reg_s CONT|res 15.1093   4 0.0045      6.2105    777 0.0104        True
disp_s x reg_s     CONS  7.0769   4 0.1319      3.8353    778 0.1758       False
```

Prior-day level replication (alone at 0.05):
```
{
 "interaction near x pullback": {
  "wald": 3.9238719330043543,
  "df": 3,
  "p": 0.26980279333989804,
  "max_int_pp": 9.593946428858471,
  "dates": 777
 },
 "main effect near (descriptive)": {
  "eff_pp": 0.4590049185299645,
  "lo": -0.9499570046045489,
  "hi": 1.8679668416644781,
  "p": 0.5231355748675159,
  "dates": 777
 }
}
```

## Model ladder (walk-forward yearly refits; test = Validation years; skills in % of the reference loss)
### CONT|res  (n_test 53,668, 777 dates)
```
 layer   brier  logloss skill_brier_vs_prev               ci skill_ll_vs_prev            ci_ll skill_brier_vs_L0  calib_gap_pp     pred_p10_p90
    L0 0.50252  0.69570                   -                -                -                -                 -          8.64 [0.4409, 0.5296]
    L1 0.50142  0.69457                0.22   [0.093, 0.359]            0.162   [0.058, 0.269]              0.22          6.42  [0.456, 0.5155]
    L2 0.50112  0.69428               0.059  [-0.021, 0.154]            0.042  [-0.018, 0.111]             0.278          5.05 [0.4531, 0.5196]
    L3 0.50154  0.69470              -0.083 [-0.141, -0.034]           -0.061 [-0.106, -0.025]             0.195          5.49 [0.4505, 0.5178]
    L4 0.50144  0.69460                0.02  [-0.115, 0.177]            0.013  [-0.105, 0.117]             0.215          5.25 [0.4434, 0.5246]
GBM_L4 0.50916  0.70263              -1.321 [-1.713, -0.861]           -0.996 [-1.314, -0.677]            -1.321         14.52   [0.389, 0.553]
```
By class (Brier skill vs previous layer, 95% CI):
```
                        L1                   L2                   L3                   L4               GBM_L4
cross  +0.14 [-0.02,+0.30]  -0.01 [-0.10,+0.07]  -0.06 [-0.09,-0.02]  +0.03 [-0.14,+0.18]  -1.14 [-1.60,-0.70]
gold   -0.07 [-0.86,+0.57]  +0.12 [-0.14,+0.39]  -0.03 [-0.19,+0.12]  -0.25 [-0.72,+0.16]  -1.61 [-3.38,-0.24]
index  +0.32 [-0.24,+0.84]  +0.29 [+0.00,+0.57]  -0.17 [-0.33,-0.02]  +0.27 [-0.03,+0.53]  -2.23 [-3.26,-1.23]
major  +0.46 [+0.22,+0.71]  +0.16 [-0.00,+0.33]  -0.13 [-0.34,+0.04]  -0.11 [-0.34,+0.14]  -1.34 [-2.27,-0.48]
```

### CONS  (n_test 84,598, 778 dates)
```
 layer   brier  logloss skill_brier_vs_prev              ci skill_ll_vs_prev           ci_ll skill_brier_vs_L0  calib_gap_pp     pred_p10_p90
    L0 0.44902  0.64046                   -               -                -               -                 -          4.24 [0.2737, 0.4981]
    L1 0.42896  0.61832               4.466  [3.363, 5.694]            3.458    [2.454, 4.6]             4.466          3.73  [0.194, 0.5445]
    L2 0.42831  0.61652               0.153 [-0.065, 0.346]            0.291  [0.106, 0.468]             4.612          2.71  [0.1884, 0.555]
    L3 0.42777  0.61597               0.125   [0.036, 0.21]             0.09  [0.009, 0.155]             4.731          2.17 [0.1854, 0.5464]
    L4 0.42701  0.61489               0.177 [-0.107, 0.518]            0.175 [-0.057, 0.416]               4.9          3.83 [0.1873, 0.5661]
GBM_L4 0.42354  0.61041               5.674  [4.452, 6.874]            4.693   [3.748, 5.86]             5.674          1.66   [0.186, 0.565]
```
By class (Brier skill vs previous layer, 95% CI):
```
                        L1                   L2                   L3                   L4               GBM_L4
cross  +4.72 [+3.62,+6.11]  +0.05 [-0.17,+0.29]  +0.08 [-0.01,+0.17]  +0.38 [+0.01,+0.73]  +5.45 [+4.26,+6.77]
gold   +3.32 [+0.85,+6.06]  +1.60 [+0.91,+2.41]  -0.13 [-0.45,+0.21]  +0.03 [-0.74,+0.79]  +3.08 [+0.33,+5.49]
index  +0.92 [-1.65,+3.19]  +0.01 [-0.60,+0.59]  +0.41 [+0.22,+0.60]  +0.34 [-0.07,+0.79]  +5.51 [+2.94,+8.28]
major  +5.83 [+4.35,+7.30]  +0.37 [-0.08,+0.82]  +0.13 [-0.03,+0.29]  -0.54 [-1.00,-0.13]  +6.81 [+5.44,+8.44]
```

### RACE  (n_test 84,598, 778 dates)
```
 layer   brier  logloss skill_brier_vs_prev              ci skill_ll_vs_prev           ci_ll skill_brier_vs_L0                               calib_gap_pp pred_p10_p90
    L0 0.65486  1.08195                   -               -                -               -                 -  {'CONT': 2.06, 'REV': 4.82, 'CONS': 4.24}            -
    L1 0.63938  1.05894               2.364  [1.774, 2.996]            2.127   [1.502, 2.72]             2.364  {'CONT': 1.98, 'REV': 3.28, 'CONS': 3.81}            -
    L2 0.63883  1.05700               0.086 [-0.038, 0.203]            0.184  [0.059, 0.314]             2.448  {'CONT': 1.63, 'REV': 3.14, 'CONS': 2.94}            -
    L3 0.63858  1.05672               0.039 [-0.005, 0.078]            0.026 [-0.016, 0.064]             2.486   {'CONT': 2.3, 'REV': 3.07, 'CONS': 2.05}            -
    L4 0.63794  1.05564                 0.1  [-0.07, 0.279]            0.102  [-0.06, 0.241]             2.584   {'CONT': 1.38, 'REV': 3.8, 'CONS': 3.89}            -
GBM_L4 0.64226  1.06168               1.924  [1.309, 2.525]            1.874   [1.28, 2.625]             1.924 {'CONT': 12.55, 'REV': 6.62, 'CONS': 1.89}            -
```
By class (Brier skill vs previous layer, 95% CI):
```
                        L1                   L2                   L3                   L4               GBM_L4
cross  +2.46 [+1.80,+3.12]  +0.01 [-0.12,+0.14]  +0.03 [-0.01,+0.08]  +0.19 [+0.02,+0.37]  +1.83 [+1.16,+2.49]
gold   +1.79 [+0.42,+3.09]  +0.91 [+0.46,+1.32]  -0.09 [-0.25,+0.08]  -0.03 [-0.42,+0.44]  +0.34 [-1.25,+1.98]
index  +0.59 [-0.51,+1.76]  +0.08 [-0.22,+0.36]  +0.14 [+0.03,+0.25]  +0.26 [+0.05,+0.55]  +1.77 [+0.34,+3.09]
major  +3.16 [+2.34,+4.01]  +0.23 [-0.03,+0.46]  +0.02 [-0.08,+0.12]  -0.28 [-0.52,-0.06]  +2.52 [+1.68,+3.36]
```

## Research translation (not a strategy): CONT-REV share in extreme predicted deciles vs cost/u (pp of the barrier)
```
{
 "L0": {
  "cross": {
   "top_decile_CONTminusREV_pp": 0.2,
   "bottom_decile_REVminusCONT_pp": 2.5,
   "cost_over_u_pp": 19.3
  },
  "gold": {
   "top_decile_CONTminusREV_pp": -5.09,
   "bottom_decile_REVminusCONT_pp": -0.46,
   "cost_over_u_pp": 16.9
  },
  "index": {
   "top_decile_CONTminusREV_pp": -1.11,
   "bottom_decile_REVminusCONT_pp": 4.78,
   "cost_over_u_pp": 10.0
  },
  "major": {
   "top_decile_CONTminusREV_pp": -0.3,
   "bottom_decile_REVminusCONT_pp": -3.6,
   "cost_over_u_pp": 10.9
  }
 },
 "L2": {
  "cross": {
   "top_decile_CONTminusREV_pp": 0.71,
   "bottom_decile_REVminusCONT_pp": 1.29,
   "cost_over_u_pp": 19.3
  },
  "gold": {
   "top_decile_CONTminusREV_pp": 0.46,
   "bottom_decile_REVminusCONT_pp": -3.2,
   "cost_over_u_pp": 16.9
  },
  "index": {
   "top_decile_CONTminusREV_pp": -0.49,
   "bottom_decile_REVminusCONT_pp": 5.8,
   "cost_over_u_pp": 10.0
  },
  "major": {
   "top_decile_CONTminusREV_pp": 3.45,
   "bottom_decile_REVminusCONT_pp": -0.18,
   "cost_over_u_pp": 10.9
  }
 },
 "L4": {
  "cross": {
   "top_decile_CONTminusREV_pp": 2.96,
   "bottom_decile_REVminusCONT_pp": 1.32,
   "cost_over_u_pp": 19.3
  },
  "gold": {
   "top_decile_CONTminusREV_pp": 1.83,
   "bottom_decile_REVminusCONT_pp": 3.2,
   "cost_over_u_pp": 16.9
  },
  "index": {
   "top_decile_CONTminusREV_pp": 3.93,
   "bottom_decile_REVminusCONT_pp": 11.8,
   "cost_over_u_pp": 10.0
  },
  "major": {
   "top_decile_CONTminusREV_pp": 2.63,
   "bottom_decile_REVminusCONT_pp": 1.11,
   "cost_over_u_pp": 10.9
  }
 },
 "GBM_L4": {
  "cross": {
   "top_decile_CONTminusREV_pp": -1.83,
   "bottom_decile_REVminusCONT_pp": 3.21,
   "cost_over_u_pp": 19.3
  },
  "gold": {
   "top_decile_CONTminusREV_pp": 0.46,
   "bottom_decile_REVminusCONT_pp": -5.94,
   "cost_over_u_pp": 16.9
  },
  "index": {
   "top_decile_CONTminusREV_pp": -3.44,
   "bottom_decile_REVminusCONT_pp": 4.42,
   "cost_over_u_pp": 10.0
  },
  "major": {
   "top_decile_CONTminusREV_pp": 1.81,
   "bottom_decile_REVminusCONT_pp": 0.7,
   "cost_over_u_pp": 10.9
  }
 }
}
```

## Cost table used (2x the registered LINE_TOUCH_COST table; `estimated` = not from the registered table)
```
  inst   cls  estimated  cost/u median  share cost/u>0.15 %
AUDCAD cross       True          0.245               96.594
AUDCHF cross       True          0.196               83.231
AUDJPY cross      False          0.141               41.808
AUDNZD cross       True          0.291               99.518
AUDUSD major      False          0.124               25.907
CADCHF cross       True          0.225               92.195
CADJPY cross       True          0.182               72.491
CHFJPY cross       True          0.208               84.004
  DE30 index      False          0.056                0.131
EURAUD cross       True          0.136               36.336
EURCAD cross       True          0.248               94.817
EURCHF cross       True          0.225               91.194
EURGBP cross      False          0.139               40.407
EURJPY cross      False          0.120               26.146
EURNZD cross       True          0.212               88.002
EURUSD major      False          0.086                4.165
GBPAUD cross       True          0.173               69.209
GBPCAD cross       True          0.191               77.143
GBPCHF cross       True          0.195               79.932
GBPJPY cross      False          0.112               17.882
GBPNZD cross       True          0.173               69.119
GBPUSD major      False          0.083                1.591
  GOLD  gold      False          0.169               61.910
    NQ index      False          0.088               12.178
NZDCAD cross       True          0.215               91.872
NZDJPY cross       True          0.172               67.048
NZDUSD major       True          0.182               72.289
SPX500 index      False          0.144               47.769
 UK100 index      False          0.112               21.685
US2000 index       True          0.141               44.288
  US30 index      False          0.067                5.633
USDCAD major      False          0.101               10.585
USDCHF major      False          0.136               36.651
USDJPY major      False          0.109               18.588
```