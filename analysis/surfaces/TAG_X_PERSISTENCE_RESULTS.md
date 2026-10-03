EURUSD: 1368 touches
GBPUSD: 1377 touches
USDJPY: 1370 touches
XAUUSD: 1408 touches
AUDUSD: 1387 touches
USDCAD: 1389 touches
USDCHF: 1364 touches

# TAG-X-PERSISTENCE results (pre-registered: forge/TAG_X_PERSISTENCE_PREREG.md, commit 895db526)

9663 first p75 touches, 7 instruments, 2016-01-19 -> 2026-08-20

## Every cell, 4 h persistence (net R)
out                        continue   fade  stall   both    n  follow_R  fade_R
half tag      p48                                                              
A    CONTINUE EXTENDING       0.409  0.399  0.192  0.000  569     0.012  -0.124
              GIVING BACK     0.393  0.400  0.206  0.000  887    -0.022  -0.107
              MIDDLE          0.398  0.410  0.192  0.000  741    -0.028  -0.099
     EXHAUST  EXTENDING       0.244  0.348  0.408  0.000  529    -0.114   0.011
              GIVING BACK     0.297  0.332  0.371  0.000  340    -0.030  -0.060
              MIDDLE          0.311  0.327  0.361  0.000  440    -0.008  -0.078
     FAIR     EXTENDING       0.338  0.398  0.263  0.000  600    -0.071  -0.050
              GIVING BACK     0.335  0.380  0.285  0.000  568    -0.045  -0.067
              MIDDLE          0.328  0.392  0.279  0.002  595    -0.086  -0.038
B    CONTINUE EXTENDING       0.366  0.446  0.189  0.000  435    -0.106  -0.030
              GIVING BACK     0.409  0.407  0.182  0.002  523    -0.003  -0.144
              MIDDLE          0.396  0.424  0.180  0.000  467    -0.028  -0.104
     EXHAUST  EXTENDING       0.230  0.422  0.348  0.000  448    -0.186   0.075
              GIVING BACK     0.320  0.286  0.394  0.000  175     0.037  -0.116
              MIDDLE          0.301  0.352  0.347  0.000  236    -0.019  -0.065
     FAIR     EXTENDING       0.363  0.365  0.272  0.000  438     0.026  -0.124
              GIVING BACK     0.350  0.394  0.256  0.000  254    -0.043  -0.073
              MIDDLE          0.304  0.418  0.278  0.000  349    -0.113  -0.015

## H1: CONTINUE x GIVING BACK, follow trade
        mean  size
half              
A    -0.0221   887
B    -0.0031   523
comparison cell mean by half: {'A': -0.0105, 'B': -0.0654}  -> cell above in both halves: False
pooled mean -0.0150 (n=1410), 97.5% day-clustered CI [-0.0821, 0.0495]
per instrument: {'AUDUSD': -0.114, 'EURUSD': 0.029, 'GBPUSD': 0.041, 'USDCAD': -0.023, 'USDCHF': -0.076, 'USDJPY': 0.007, 'XAUUSD': -0.008}  (3/7 positive)
shuffled-VR 95th pct -0.0038; at 2x costs -0.1134
checks: {'1 both halves': False, '2 CI excludes 0': np.False_, '3 >=5/7 instruments': np.False_, '4 beats shuffle': np.False_, '5 positive at 2x cost': np.False_}  ->  FAIL

## H2: EXHAUST x EXTENDING, fade trade
        mean  size
half              
A     0.0107   529
B     0.0745   448
pooled mean 0.0400 (n=977), 97.5% day-clustered CI [-0.0162, 0.0966]
per instrument: {'AUDUSD': 0.016, 'EURUSD': 0.064, 'GBPUSD': 0.09, 'USDCAD': -0.017, 'USDCHF': 0.095, 'USDJPY': -0.003, 'XAUUSD': 0.026}  (5/7 positive)
shuffled-VR 95th pct 0.0028; at 2x costs 0.0071
checks: {'1 both halves': True, '2 CI excludes 0': np.False_, '3 >=5/7 instruments': np.True_, '4 beats shuffle': np.True_, '5 positive at 2x cost': np.True_}  ->  FAIL

## Reported only: 1 h persistence cells
out                        continue   fade  stall   both    n  follow_R  fade_R
half tag      p12                                                              
A    CONTINUE EXTENDING       0.389  0.424  0.187  0.000  568    -0.038  -0.081
              GIVING BACK     0.424  0.395  0.181  0.000  918     0.013  -0.137
              MIDDLE          0.376  0.397  0.228  0.000  711    -0.034  -0.095
     EXHAUST  EXTENDING       0.286  0.337  0.376  0.000  590    -0.040  -0.052
              GIVING BACK     0.299  0.317  0.384  0.000  284    -0.008  -0.073
              MIDDLE          0.260  0.349  0.391  0.000  435    -0.110   0.005
     FAIR     EXTENDING       0.334  0.407  0.259  0.000  580    -0.080  -0.037
              GIVING BACK     0.345  0.358  0.298  0.000  534    -0.028  -0.085
              MIDDLE          0.324  0.402  0.273  0.002  649    -0.089  -0.036
B    CONTINUE EXTENDING       0.405  0.398  0.197  0.000  600    -0.013  -0.121
              GIVING BACK     0.373  0.438  0.187  0.002  402    -0.073  -0.074
              MIDDLE          0.390  0.449  0.161  0.000  423    -0.056  -0.081
     EXHAUST  EXTENDING       0.251  0.398  0.351  0.000  530    -0.132   0.030
              GIVING BACK     0.271  0.338  0.391  0.000  133    -0.091  -0.001
              MIDDLE          0.311  0.337  0.352  0.000  196     0.004  -0.091
     FAIR     EXTENDING       0.344  0.397  0.260  0.000  489    -0.032  -0.080
              GIVING BACK     0.325  0.383  0.292  0.000  209    -0.078  -0.036
              MIDDLE          0.344  0.385  0.271  0.000  343    -0.021  -0.092

## Reported only: tag alone and persistence alone (net follow / fade R)
                  fol     fad
half tag                     
A    CONTINUE -0.0152 -0.1087
     EXHAUST  -0.0567 -0.0369
     FAIR     -0.0666 -0.0518
B    CONTINUE -0.0425 -0.0961
     EXHAUST  -0.0949 -0.0026
     FAIR     -0.0375 -0.0751

                     fol     fad
half p48                        
A    EXTENDING   -0.0619 -0.0504
     GIVING BACK -0.0149 -0.0987
     MIDDLE      -0.0590 -0.0592
B    EXTENDING   -0.0895 -0.0256
     GIVING BACK -0.0064 -0.1199
     MIDDLE      -0.0540 -0.0659

## Reported only: logistic regression, P(continue) ~ tag + 4 h persistence (base: FAIR, MIDDLE)
half A: const -0.687 (z -12.8), CONTINUE +0.256 (z +4.3), EXHAUST -0.263 (z -3.6), GIVING BACK +0.073 (z +1.1), EXTENDING -0.029 (z -0.4)
half B: const -0.667 (z -7.9), CONTINUE +0.203 (z +2.4), EXHAUST -0.333 (z -3.3), GIVING BACK +0.110 (z +1.2), EXTENDING -0.055 (z -0.6)

VERDICT: H1 FAIL · H2 FAIL
