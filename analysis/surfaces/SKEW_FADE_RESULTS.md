EURUSD: 1368 touches
GBPUSD: 1377 touches
USDJPY: 1370 touches
XAUUSD: 1408 touches
AUDUSD: 1027 touches
USDCAD: 1042 touches
USDCHF: 1019 touches

# SKEW-FADE results (pre-registered: forge/SKEW_FADE_PREREG.md, commit a71a88e0)

8611 first p75 touches, 7 instruments, 2016-01-19 -> 2026-08-20

## Replication on CVOL: outcomes by skew relative to the touch
out           continue   fade  stall   both     n  follow_R  fade_R
half sk_t                                                          
A    AGAINST     0.338  0.375  0.286  0.000  1763    -0.065  -0.053
     NEUTRAL     0.354  0.391  0.255  0.000  1760    -0.050  -0.069
     WITH        0.351  0.381  0.268  0.001  1763    -0.014  -0.093
B    AGAINST     0.345  0.401  0.255  0.000  1036    -0.071  -0.050
     NEUTRAL     0.346  0.393  0.261  0.000  1229    -0.048  -0.074
     WITH        0.340  0.410  0.249  0.001  1060    -0.045  -0.070

## H3 skew AGAINST: fade trade, n=2799
        mean  size
half              
A    -0.0532  1763
B    -0.0502  1036
pooled mean -0.0521, 97.5% day-clustered CI [-0.0896, -0.0145]
per instrument: {'AUDUSD': -0.055, 'EURUSD': -0.018, 'GBPUSD': -0.054, 'USDCAD': -0.12, 'USDCHF': -0.008, 'USDJPY': -0.119, 'XAUUSD': -0.0}  (0/7 positive)
shuffled-skew 95th pct -0.0501; at 2x costs -0.0945
checks: {'1 both halves': False, '2 CI excludes 0': False, '3 >=5/7 instruments': False, '4 beats shuffle': False, '5 positive at 2x cost': False}  ->  FAIL

## H4 skew AGAINST and EXHAUST: fade trade, n=696
        mean  size
half              
A    -0.1003   442
B     0.0117   254
pooled mean -0.0594, 97.5% day-clustered CI [-0.1271, 0.0127]
per instrument: {'AUDUSD': -0.153, 'EURUSD': -0.024, 'GBPUSD': -0.137, 'USDCAD': -0.013, 'USDCHF': 0.027, 'USDJPY': -0.146, 'XAUUSD': -0.012}  (1/7 positive)
shuffled-skew 95th pct 0.0084; at 2x costs -0.0927
checks: {'1 both halves': False, '2 CI excludes 0': False, '3 >=5/7 instruments': False, '4 beats shuffle': False, '5 positive at 2x cost': False}  ->  FAIL

## Reported only: tag x skew, mean net fade-R (n)
                        mean  size
half tag      sk_t                
A    CONTINUE AGAINST -0.043   745
              NEUTRAL -0.146   715
              WITH    -0.138   737
     EXHAUST  AGAINST -0.100   442
              NEUTRAL  0.041   401
              WITH    -0.044   473
     FAIR     AGAINST -0.030   576
              NEUTRAL -0.051   644
              WITH    -0.075   553
B    CONTINUE AGAINST -0.027   447
              NEUTRAL -0.108   547
              WITH    -0.152   431
     EXHAUST  AGAINST  0.012   254
              NEUTRAL -0.020   297
              WITH     0.002   308
     FAIR     AGAINST -0.128   335
              NEUTRAL -0.068   385
              WITH    -0.029   321

VERDICT: H3 FAIL · H4 FAIL
