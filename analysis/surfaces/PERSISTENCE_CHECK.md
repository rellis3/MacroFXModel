# Persistence (variance ratio) regime at the p75 line: first look (descriptive, not pre-registered)

11083 p75 touches, 8 instruments, 2016-02-01 -> 2026-08-20
Overall: {'fade': 0.39, 'continue': 0.352, 'stall': 0.258}

## VR at 15 min, tercile within instrument (0 = reverting, 2 = trending)
out                 continue   fade  stall     n
half         vr3_t                              
fit 2016-20  0         0.364  0.379  0.257  1710
             1         0.354  0.383  0.263  1705
             2         0.325  0.412  0.262  1712
read 2021-26 0         0.369  0.376  0.255  1122
             1         0.353  0.391  0.255  1777
             2         0.351  0.393  0.256  3057

## VR at 60 min, tercile within instrument (0 = reverting, 2 = trending)
out                  continue   fade  stall     n
half         vr12_t                              
fit 2016-20  0          0.371  0.385  0.243  1710
             1          0.333  0.401  0.266  1705
             2          0.340  0.388  0.272  1712
read 2021-26 0          0.357  0.391  0.252  1274
             1          0.371  0.387  0.242  1712
             2          0.345  0.390  0.265  2970

## VR at 240 min, tercile within instrument (0 = reverting, 2 = trending)
out                  continue   fade  stall     n
half         vr48_t                              
fit 2016-20  0          0.368  0.388  0.244  1710
             1          0.350  0.388  0.262  1705
             2          0.327  0.398  0.276  1712
read 2021-26 0          0.385  0.372  0.243  1668
             1          0.344  0.399  0.257  2005
             2          0.343  0.394  0.263  2283

Median VR by horizon (all days): {15: np.float64(0.966), 60: np.float64(0.934), 240: np.float64(0.909)}
