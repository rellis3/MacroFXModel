# VF3 Stage B, Part 3: the page's own intraday probabilities (test block 2022-2024, oos rows; retrospective)

## J2 path stats (static P(next rung | this rung) from the params' OOS exceedance) vs what happened
```
       step     n  realised %  static claim %  Brier skill of hour-empirical over static  calib gap static pp  calib gap hour-empirical pp
OH p50->p75 13209        50.1            49.0                                        7.4                 10.4                          4.9
OH p75->p90  6620        40.2            40.8                                       11.6                 16.0                          3.0
OL p50->p75 13325        50.4            49.1                                        6.3                  7.5                          5.9
OL p75->p90  6715        39.8            40.0                                       11.0                 11.2                          2.9
```

### OH p50->p75: by London hour of the first touch (%; hours with >= 100 touches)
```
      realised  claim     n
hour                       
0         73.2   49.7   149
1         68.6   49.3   414
2         64.0   49.7   731
3         59.9   50.3   581
4         57.4   49.8   434
5         59.2   49.7   414
6         53.3   49.1   467
7         60.1   49.0  1017
8         59.8   49.2  1370
9         52.7   48.5   985
10        54.3   48.7   668
11        48.2   49.1   529
12        50.9   48.3   642
13        51.1   48.7  1392
14        40.4   48.6  1078
15        34.7   48.4   966
16        28.7   48.4   407
17        20.6   48.4   233
18        26.0   48.8   219
19        22.1   48.8   253
20         6.3   49.4   174
```

### OH p75->p90: by London hour of the first touch (%; hours with >= 100 touches)
```
      realised  claim    n
hour                      
2         61.9   39.8  139
3         67.2   40.5  119
4         60.0   38.3  125
5         62.2   40.8  135
6         46.4   40.2  110
7         58.2   40.8  282
8         57.9   40.8  454
9         51.0   40.6  396
10        47.8   40.9  316
11        48.4   40.9  277
12        45.0   40.8  333
13        47.9   41.0  894
14        36.2   41.0  735
15        27.4   40.1  862
16        24.6   41.3  403
17        16.3   40.5  227
18        20.6   40.7  243
19        18.1   41.7  259
20         6.2   42.0  176
```

### OL p50->p75: by London hour of the first touch (%; hours with >= 100 touches)
```
      realised  claim     n
hour                       
0         70.6   49.4   255
1         67.9   49.2   583
2         63.5   49.0   734
3         63.9   48.9   638
4         58.0   48.9   443
5         55.7   49.1   377
6         55.6   48.9   484
7         58.9   48.6  1116
8         56.6   48.7  1458
9         54.0   48.6   996
10        48.3   49.0   660
11        45.9   49.0   525
12        47.6   49.4   584
13        49.5   49.6  1303
14        41.4   49.5   945
15        36.8   49.4   978
16        25.5   49.8   381
17        19.5   50.0   210
18        25.4   49.5   209
19        22.3   49.8   260
20        15.2   50.1   132
```

### OL p75->p90: by London hour of the first touch (%; hours with >= 100 touches)
```
      realised  claim    n
hour                      
2         68.9   40.2  161
3         63.5   39.6  156
4         67.2   39.9  137
5         58.4   40.4  137
6         57.6   40.0  132
7         49.5   41.2  283
8         51.0   40.1  555
9         50.0   40.3  432
10        46.4   40.4  347
11        45.2   41.4  272
12        42.1   41.1  328
13        44.3   40.4  827
14        37.5   39.2  739
15        28.4   39.6  830
16        18.7   39.9  358
17        12.3   39.1  236
18        15.7   39.3  216
19        19.2   37.9  203
20         3.6   38.1  168
```

## K3 card 'x% to median' (Brownian, UTC clock, COG HL median) vs what happened; rows where the median is not yet reached
Empirical baseline: rate by London hour x consumed decile, fitted on 2020-08..2021-12 rows (the COG lines exist only on Part 1 rows).
```
{
 "n": 435359,
 "realised %": 26.4,
 "K3 mean %": 51.2,
 "Brier K3": 0.2583,
 "Brier hour x consumed empirical": 0.1702,
 "skill of empirical over K3 %": 34.1,
 "calib gap K3 pp": 44.1,
 "calib gap empirical pp": 5.0
}
```
```
        n  realised    K3  empirical
h                                   
2   26173      35.5  41.9       35.2
3   26035      35.2  44.3       35.1
4   25879      34.8  45.4       35.2
5   25766      34.5  45.7       35.3
6   25645      34.2  45.8       35.0
7   25510      33.9  46.3       34.6
8   25289      33.3  48.6       34.3
9   24840      32.1  51.7       32.4
10  24406      30.9  53.2       30.5
11  24069      29.9  53.8       29.4
12  23721      28.9  54.0       27.7
13  23303      27.6  54.3       25.9
14  22060      23.5  56.7       23.7
15  20911      19.3  58.3       19.7
16  19424      13.1  59.5       13.1
17  18758      10.1  58.7        9.9
18  18320       7.9  57.1        7.6
19  17872       5.6  55.0        5.4
20  17378       2.9  52.4        2.8
```