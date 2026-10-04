# S&P vol curve shape vs the NQ/SPX range lines: first look (descriptive, not pre-registered)

5436 index-days (NQ + SPX500), 2016-01-19 -> 2026-08-20

## share of days past p75 by vol level / sigma (the tag) tercile (design 25%)
               mean                     size             
half    fit 2016-20 read 2021-26 fit 2016-20 read 2021-26
level_t                                                  
0             0.145        0.147         858         1056
1             0.248        0.326         858         1037
2             0.358        0.419         858          769

## share of days past p75 by VIX9D / VIX (front inversion) tercile (design 25%)
               mean                     size             
half    fit 2016-20 read 2021-26 fit 2016-20 read 2021-26
front_t                                                  
0             0.191        0.207         858          880
1             0.239        0.287         858         1006
2             0.321        0.352         858          976

## share of days past p75 by VIX / VIX3M (backwardation) tercile (design 25%)
              mean                     size             
half   fit 2016-20 read 2021-26 fit 2016-20 read 2021-26
back_t                                                  
0            0.204        0.236         858          628
1            0.262        0.267         858         1316
2            0.284        0.343         858          918

## within each level tercile: does the front ratio still separate? (read 2021-26)
          mean               size          
front_t      0      1      2    0    1    2
level_t                                    
0        0.086  0.098  0.206  221  336  499
1        0.153  0.308  0.482  275  409  353
2        0.315  0.498  0.573  384  261  124

## within each level tercile: backwardation (read 2021-26)
          mean               size          
back_t       0      1      2    0    1    2
level_t                                    
0        0.049  0.117  0.205  122  486  448
1        0.195  0.280  0.481  205  510  322
2        0.339  0.475  0.459  301  320  148

current (last row): front=0.788, back=0.850 as of 2026-10-02
