# INTRADAY-EXTREME-PATHS - Stage 2 completion checks (registered criteria only)

## 1. Constant-forecast references (compare with the ladder tables in STAGE2.md)
```
CONT|res : constant 50/50          brier 0.50000  logloss 0.69315
CONS     : constant 0.3945 (train share) brier 0.46555  logloss 0.65834
RACE     : constant train shares [0.3142, 0.2913, 0.3945] brier 0.66659  logloss 1.09847
```

## 2. A10 selected sub-test (VIX high vs low tercile on CONS): halves and instruments
```
pooled -6.06pp  half1 -4.78  half2 -9.45  instruments with the pooled sign 82% of 34
VIX tercile dates in Validation: {False: 149, True: 330}
```

## 3. pb_s x age_s on CONT|res (Validation cells; pooled 50.1%)
```
   pb_s   age_s     n  dates  CONT|res%  ±ci  half1%  half2%
 F<=.15    <60m 22399    775       50.3  1.3    50.4    50.2
 F<=.15 60-180m  2990    675       50.0  2.4    49.3    50.9
 F<=.15   >180m   883    409       51.8  4.0    53.8    49.2
S.15-.5    <60m 10177    745       51.5  1.5    50.8    52.2
S.15-.5 60-180m  7714    723       50.0  1.8    49.0    51.2
S.15-.5   >180m  3339    574       48.4  2.8    47.9    48.8
  M.5-1    <60m   836    285       48.9  4.6    47.8    50.1
  M.5-1 60-180m  2240    462       49.0  3.2    48.2    49.8
  M.5-1   >180m  1783    349       50.6  3.6    49.4    51.7
    D>1    <60m   112     29       32.1 15.5    25.7    35.1
    D>1 60-180m   415     96       55.2  7.6    51.4    58.1
    D>1   >180m   780    103       36.9  6.4    30.2    41.7
```

## 3. reg_s x used_s on CONT|res (Validation cells; pooled 50.1%)
```
 reg_s used_s     n  dates  CONT|res%  ±ci  half1%  half2%
 quiet    low  3349    471       51.6  2.4    51.9    51.5
 quiet    mid  4336    463       48.6  2.2    50.4    47.5
 quiet   high  6020    387       52.6  2.1    54.3    51.6
normal    low  7080    729       49.8  1.7    50.0    49.6
normal    mid  8266    692       50.8  1.7    50.9    50.7
normal   high 10739    545       50.9  1.6    50.2    51.6
  busy    low  3850    449       49.8  2.5    48.8    52.9
  busy    mid  4275    411       49.5  2.6    47.9    54.6
  busy   high  5753    309       46.1  2.3    46.0    46.5
```

## 3. disp_s x reg_s on CONT|res (Validation cells; pooled 50.1%)
```
disp_s  reg_s     n  dates  CONT|res%  ±ci  half1%  half2%
   low  quiet  3859    506       49.9  2.0    49.6    50.1
   low normal  7552    744       49.7  1.5    49.6    49.8
   low   busy  4156    465       49.6  2.2    48.8    52.3
   mid  quiet  4197    481       50.1  2.1    52.4    48.7
   mid normal  8307    714       51.3  1.6    51.6    51.0
   mid   busy  4470    435       49.3  2.3    48.1    52.7
  high  quiet  5649    398       52.6  2.2    54.6    51.5
  high normal 10226    596       50.7  1.6    50.0    51.4
  high   busy  5252    323       46.1  2.3    45.5    47.5
```

## 3. pb_s x age_s on CONS (Validation cells; pooled 36.6%)
```
   pb_s   age_s     n  dates  CONS%  ±ci  half1%  half2%
 F<=.15    <60m 36088    778   37.9  1.2    37.0    38.9
 F<=.15 60-180m  5266    735   43.2  1.8    41.3    45.4
 F<=.15   >180m  1585    546   44.3  2.9    41.5    47.3
S.15-.5    <60m 14881    767   31.6  1.4    30.8    32.5
S.15-.5 60-180m 12793    756   39.7  1.5    37.9    41.5
S.15-.5   >180m  5670    650   41.1  2.2    38.4    43.7
  M.5-1    <60m   988    326   15.4  3.0    15.0    15.8
  M.5-1 60-180m  3040    520   26.3  2.7    24.9    27.7
  M.5-1   >180m  2719    397   34.4  3.0    32.7    36.0
    D>1    <60m   115     30    2.6  3.9     0.0     3.8
    D>1 60-180m   474    109   12.4  5.3    15.6     9.9
    D>1   >180m   979    118   20.3  6.6    19.6    20.8
```

## 3. pb_s x band on CONS (Validation cells; pooled 36.6%)
```
   pb_s    band     n  dates  CONS%  ±ci  half1%  half2%
 F<=.15    asia  8178    645   32.3  2.1    32.8    31.9
 F<=.15  london 13989    757   37.4  1.6    35.4    39.5
 F<=.15      ny  8980    731   48.5  2.0    47.6    49.6
 F<=.15 overlap 11792    759   37.7  1.7    36.0    39.5
S.15-.5    asia  3694    468   23.9  2.7    26.2    22.0
S.15-.5  london  9324    695   32.9  1.8    30.1    35.9
S.15-.5      ny  9679    729   46.4  1.9    43.8    49.1
S.15-.5 overlap 10647    739   34.5  1.8    33.2    35.9
  M.5-1    asia   486     90   14.2  6.0    18.3    11.7
  M.5-1  london  1567    278   23.7  4.1    21.5    25.5
  M.5-1      ny  2471    456   36.2  3.0    32.1    40.9
  M.5-1 overlap  2223    423   24.8  2.7    24.0    25.7
    D>1    asia   127     15    8.7  8.4    13.8     3.2
    D>1  london   382     46    9.4  6.6     5.4    11.5
    D>1      ny   591    118   25.5  6.9    28.1    23.6
    D>1 overlap   468     91   13.5  5.6    11.7    14.7
```

## 3. used_s x band on CONS (Validation cells; pooled 36.6%)
```
used_s    band    n  dates  CONS%  ±ci  half1%  half2%
   low    asia 4279    601   38.1  2.3    38.4    37.7
   low  london 7387    750   43.6  1.8    41.4    46.0
   low      ny 6771    724   54.4  2.0    53.5    55.3
   low overlap 7592    743   42.4  1.8    42.4    42.4
   mid    asia 4152    498   31.2  2.5    31.8    30.7
   mid  london 8270    697   37.7  1.7    35.1    40.6
   mid      ny 7176    682   47.9  1.9    45.8    50.1
   mid overlap 8056    718   36.3  1.8    34.6    38.3
  high    asia 4054    313   16.8  2.7    18.3    15.7
  high  london 9605    571   24.7  2.1    22.3    26.9
  high      ny 7774    551   35.7  2.4    33.6    38.1
  high overlap 9482    588   27.2  2.0    25.4    29.2
```

## 3. mom_s x pb_s on CONS (Validation cells; pooled 36.6%)
```
mom_s    pb_s     n  dates  CONS%  ±ci  half1%  half2%
  low  F<=.15  4836    719   44.8  1.9    42.2    47.4
  low S.15-.5 16920    763   39.8  1.4    37.8    41.9
  low   M.5-1  4739    552   28.6  2.4    26.6    30.6
  low     D>1  1050    156   17.6  5.1    17.3    17.9
  mid  F<=.15 16366    776   44.7  1.3    43.6    45.9
  mid S.15-.5  9608    748   38.1  1.6    36.0    40.3
  mid   M.5-1  1199    346   31.3  3.7    30.7    31.9
  mid     D>1   256     74   18.8  7.6    21.6    16.9
 high  F<=.15 21737    776   33.0  1.2    32.5    33.7
 high S.15-.5  6816    713   25.1  1.7    25.5    24.7
 high   M.5-1   809    271   19.4  3.6    18.6    20.1
 high     D>1   262     44   10.7  6.3    12.5     9.6
```
