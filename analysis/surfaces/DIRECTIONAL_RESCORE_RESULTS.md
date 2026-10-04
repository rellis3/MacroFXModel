# DIRECTIONAL-RESCORE results (pre-registered: forge/DIRECTIONAL_RESCORE_PREREG.md, commit 3c5d132a)

84431 first touches of the static export lines (same-bar fade-only excluded), 10 instruments, 2016-03-28 -> 2026-07-02
Columns: stall share; directional share among resolved minus break-even; signed return in sigma at 15/60/240 min (+ = continue side) with the date-clustered SE of r60; follow and fade R gross (G) and net.

## The re-score: every export line, by half
half        line    n  stall  dir_minus_be    r15    r60  r60_se  r240   folG    fol   fadG    fad
   A CloseDn_p50 8695  0.204         0.014  0.005  0.007   0.004 0.008 -0.003 -0.059  0.003 -0.040
   A CloseDn_p75 4339  0.212         0.035  0.011  0.026   0.007 0.035  0.045 -0.026 -0.045 -0.089
   A CloseUp_p50 8935  0.226         0.020  0.008  0.009   0.004 0.011  0.014 -0.043 -0.017 -0.060
   A CloseUp_p75 4304  0.269         0.019  0.005  0.008   0.006 0.016  0.030 -0.042 -0.031 -0.075
   A      OH_p50 8863  0.222         0.020  0.007  0.006   0.004 0.010  0.008 -0.047 -0.011 -0.056
   A      OH_p75 4377  0.272         0.014  0.005  0.008   0.006 0.016  0.033 -0.043 -0.027 -0.068
   A      OH_p90 1784  0.363         0.035  0.004  0.006   0.009 0.017  0.044 -0.025 -0.044 -0.086
   A      OL_p50 8869  0.198         0.011  0.004  0.006   0.004 0.004 -0.005 -0.063  0.006 -0.037
   A      OL_p75 4400  0.249         0.025  0.012  0.026   0.007 0.036  0.049 -0.022 -0.039 -0.075
   A      OL_p90 1849  0.351         0.034  0.008  0.011   0.011 0.033  0.016 -0.044 -0.016 -0.053
   B CloseDn_p50 4335  0.217         0.013  0.009  0.013   0.007 0.005 -0.006 -0.060  0.007 -0.035
   B CloseDn_p75 2126  0.213         0.010  0.010  0.022   0.011 0.005  0.006 -0.061 -0.007 -0.049
   B CloseUp_p50 4493  0.246         0.035  0.008  0.011   0.006 0.017  0.035 -0.020 -0.042 -0.085
   B CloseUp_p75 2140  0.276        -0.015 -0.004 -0.004   0.009 0.008 -0.013 -0.083  0.013 -0.030
   B      OH_p50 4443  0.236         0.035  0.011  0.012   0.006 0.017  0.031 -0.022 -0.040 -0.084
   B      OH_p75 2177  0.286        -0.016 -0.001 -0.001   0.008 0.012 -0.001 -0.074  0.001 -0.038
   B      OH_p90  872  0.397         0.027 -0.003 -0.000   0.022 0.010  0.042 -0.021 -0.042 -0.081
   B      OL_p50 4422  0.212         0.009  0.007  0.014   0.007 0.005 -0.009 -0.064  0.011 -0.031
   B      OL_p75 2155  0.258        -0.005  0.010  0.018   0.011 0.001  0.004 -0.064 -0.003 -0.037
   B      OL_p90  853  0.375         0.048  0.011  0.041   0.018 0.070  0.039 -0.019 -0.039 -0.074

## Drift at the touch (OH/OL p50+p75)
half    drift_state     n  stall  dir_minus_be   r15    r60  r60_se   r240   folG    fol   fadG    fad
   A AGAINST strong  4786  0.201         0.002 0.003  0.002   0.007 -0.006 -0.007 -0.068  0.009 -0.032
   A ALIGNED strong  4746  0.194        -0.001 0.008  0.000   0.006 -0.010 -0.008 -0.070  0.009 -0.034
   A           weak 16977  0.244         0.026 0.007  0.015   0.004  0.026  0.027 -0.035 -0.025 -0.067
   B AGAINST strong  2451  0.215        -0.009 0.005 -0.007   0.011 -0.017 -0.035 -0.095  0.036 -0.005
   B ALIGNED strong  2314  0.219        -0.002 0.003  0.002   0.009 -0.009 -0.009 -0.071  0.004 -0.038
   B           weak  8432  0.252         0.022 0.009  0.019   0.006  0.022  0.025 -0.033 -0.027 -0.068

## Line tag at the touch (OH/OL p50+p75)
half      tag    n  stall  dir_minus_be   r15   r60  r60_se  r240  folG    fol   fadG    fad
   A CONTINUE 6845  0.155         0.021 0.011 0.021   0.006 0.028 0.030 -0.043 -0.027 -0.074
   A  EXHAUST 7066  0.316         0.016 0.006 0.007   0.004 0.007 0.006 -0.043 -0.005 -0.038
   A     FAIR 6944  0.211         0.014 0.005 0.008   0.005 0.014 0.014 -0.048 -0.011 -0.052
   B CONTINUE 3474  0.157         0.016 0.016 0.030   0.011 0.026 0.016 -0.059 -0.018 -0.069
   B  EXHAUST 4206  0.331         0.014 0.002 0.001   0.008 0.003 0.002 -0.045 -0.010 -0.042
   B     FAIR 4184  0.217         0.010 0.005 0.009   0.007 0.006 0.012 -0.046 -0.009 -0.049

## H8 follow, drift ALIGNED and STRONG: n=7060
        mean  size
half              
A    -0.0703  4746
B    -0.0710  2314
pooled -0.0705 (gross -0.0081), 99% date-clustered CI [-0.1039, -0.0381]
directional share - BE -0.001 · r60 +0.001 (SE 0.005) · per instrument {'AUDUSD': -0.098, 'EURUSD': -0.017, 'GBPUSD': -0.087, 'GOLD': -0.025, 'NQ': -0.06, 'NZDUSD': -0.09, 'SPX500': -0.054, 'USDCAD': -0.129, 'USDCHF': -0.13, 'USDJPY': -0.023} · {'longs': np.float64(-0.0471), 'shorts': np.float64(-0.1015)}
shuffled 95th pct -0.0189 · at 2x costs -0.1329
checks {'1 both halves': False, '2 CI excludes 0': False, '3 >=70% instruments': False, '4 beats shuffle': False, '5 positive 2x cost': False, '6 longs and shorts': False} -> FAIL

## H9 fade, drift AGAINST and STRONG: n=7237
        mean  size
half              
A    -0.0321  4786
B    -0.0047  2451
pooled -0.0228 (gross 0.0181), 99% date-clustered CI [-0.0593, 0.0148]
directional share - BE -0.001 · r60 -0.001 (SE 0.006) · per instrument {'AUDUSD': -0.034, 'EURUSD': 0.008, 'GBPUSD': -0.077, 'GOLD': 0.015, 'NQ': -0.034, 'NZDUSD': -0.001, 'SPX500': -0.047, 'USDCAD': -0.003, 'USDCHF': 0.013, 'USDJPY': -0.062} · {'longs': np.float64(-0.0187), 'shorts': np.float64(-0.0284)}
shuffled 95th pct -0.0243 · at 2x costs -0.0638
checks {'1 both halves': False, '2 CI excludes 0': False, '3 >=70% instruments': False, '4 beats shuffle': True, '5 positive 2x cost': False, '6 longs and shorts': False} -> FAIL

## H10a follow, tag CONTINUE: n=10319
        mean  size
half              
A    -0.0428  6845
B    -0.0595  3474
pooled -0.0484 (gross 0.0253), 99% date-clustered CI [-0.0743, -0.0195]
directional share - BE +0.019 · r60 +0.024 (SE 0.006) · per instrument {'AUDUSD': -0.067, 'EURUSD': -0.047, 'GBPUSD': -0.035, 'GOLD': -0.078, 'NQ': -0.056, 'SPX500': -0.018, 'USDCAD': -0.076, 'USDCHF': -0.065, 'USDJPY': 0.002} · {'longs': np.float64(-0.046), 'shorts': np.float64(-0.0509)}
shuffled 95th pct -0.0395 · at 2x costs -0.1222
checks {'1 both halves': False, '2 CI excludes 0': False, '3 >=70% instruments': False, '4 beats shuffle': False, '5 positive 2x cost': False, '6 longs and shorts': False} -> FAIL

## H10b fade, tag EXHAUST: n=11272
        mean  size
half              
A    -0.0383  7066
B    -0.0421  4206
pooled -0.0397 (gross -0.0070), 99% date-clustered CI [-0.0674, -0.0112]
directional share - BE +0.015 · r60 +0.005 (SE 0.004) · per instrument {'AUDUSD': -0.071, 'EURUSD': -0.026, 'GBPUSD': -0.002, 'GOLD': -0.085, 'NQ': -0.07, 'SPX500': -0.029, 'USDCAD': -0.019, 'USDCHF': -0.016, 'USDJPY': -0.035} · {'longs': np.float64(-0.0252), 'shorts': np.float64(-0.0545)}
shuffled 95th pct -0.0422 · at 2x costs -0.0724
checks {'1 both halves': False, '2 CI excludes 0': False, '3 >=70% instruments': False, '4 beats shuffle': True, '5 positive 2x cost': False, '6 longs and shorts': False} -> FAIL

VERDICT: H8 FAIL · H9 FAIL · H10a FAIL · H10b FAIL
