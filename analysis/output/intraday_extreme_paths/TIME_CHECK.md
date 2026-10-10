# IEP-TIME completion checks (registered criteria only)

## tier1 x session on CONS (test block, raw shares)
```
tier1 session      n  dates  CONS%   ci                                 per-year %
other    asia 115756    683   55.1 ±1.1 {'2022': 51.0, '2023': 57.7, '2024': 56.5}
other    late  46092    683   68.3 ±1.5 {'2022': 62.4, '2023': 71.6, '2024': 70.9}
other  london 115805    683   44.0 ±1.1 {'2022': 38.5, '2023': 44.0, '2024': 49.3}
other      ny  69415    683   53.7 ±1.5 {'2022': 48.4, '2023': 55.5, '2024': 57.1}
other overlap  92651    683   43.4 ±1.3 {'2022': 41.2, '2023': 42.5, '2024': 46.5}
tier1    asia  16102     95   61.4 ±3.2 {'2022': 63.5, '2023': 61.6, '2024': 58.9}
tier1    late   6417     95   49.9 ±5.7 {'2022': 44.5, '2023': 52.9, '2024': 52.5}
tier1  london  16103     95   53.9 ±2.6 {'2022': 49.8, '2023': 54.6, '2024': 57.4}
tier1      ny   9651     95   41.5 ±3.3 {'2022': 40.3, '2023': 42.0, '2024': 42.4}
tier1 overlap  12687     95   27.9 ±4.3 {'2022': 30.6, '2023': 27.6, '2024': 25.3}
```

## tier1 x session on EXP (test block, raw shares)
```
tier1 session      n  dates  EXP%   ci                                 per-year %
other    asia 115811    683  67.0 ±1.3 {'2022': 69.5, '2023': 68.1, '2024': 63.4}
other    late  69510    683   0.4 ±0.1    {'2022': 0.5, '2023': 0.4, '2024': 0.5}
other  london 115848    683  41.0 ±1.3 {'2022': 43.8, '2023': 41.1, '2024': 38.2}
other      ny  69510    683   3.0 ±0.4    {'2022': 3.3, '2023': 2.6, '2024': 3.0}
other overlap  92680    683  18.6 ±1.0 {'2022': 20.2, '2023': 18.5, '2024': 17.2}
tier1    asia  16110     95  82.4 ±2.7 {'2022': 82.0, '2023': 82.7, '2024': 82.5}
tier1    late   9666     95   2.5 ±1.4    {'2022': 2.4, '2023': 1.9, '2024': 3.3}
tier1  london  16110     95  64.1 ±3.8 {'2022': 63.6, '2023': 64.0, '2024': 64.9}
tier1      ny   9666     95   9.2 ±3.3    {'2022': 9.3, '2023': 8.9, '2024': 9.5}
tier1 overlap  12888     95  36.6 ±3.6 {'2022': 34.7, '2023': 36.7, '2024': 38.7}
```

## session x ext50_done on CONS (test block, raw shares)
```
session  ext50_done      n  dates  CONS%   ci                                 per-year %
   asia       False 113718    778   59.7 ±1.0 {'2022': 55.9, '2023': 61.7, '2024': 61.6}
   asia        True  18140    688   31.4 ±1.9 {'2022': 32.9, '2023': 32.8, '2024': 28.9}
   late       False  10654    774   70.8 ±1.9 {'2022': 65.8, '2023': 71.4, '2024': 74.6}
   late        True  41855    778   64.9 ±1.6 {'2022': 58.9, '2023': 68.8, '2024': 67.0}
 london       False  80800    778   49.1 ±1.1 {'2022': 43.4, '2023': 48.9, '2024': 54.9}
 london        True  51108    777   39.0 ±1.3 {'2022': 34.9, '2023': 39.5, '2024': 42.8}
     ny       False  18231    775   58.3 ±1.8 {'2022': 54.1, '2023': 58.7, '2024': 61.6}
     ny        True  60835    778   50.4 ±1.4 {'2022': 45.5, '2023': 52.4, '2024': 53.3}
overlap       False  40114    778   45.1 ±1.6 {'2022': 43.3, '2023': 43.8, '2024': 47.8}
overlap        True  65224    778   39.4 ±1.3 {'2022': 38.0, '2023': 38.7, '2024': 41.5}
```

## session x ext50_done on EXT75 (test block, raw shares)
```
session  ext50_done      n  dates  EXT75%   ci                                 per-year %
   asia       False 113766    778    29.4 ±1.1 {'2022': 31.1, '2023': 28.4, '2024': 28.8}
   asia        True  14437    687    57.6 ±2.6 {'2022': 58.6, '2023': 59.8, '2024': 54.5}
   late       False  15965    775     0.7 ±0.3    {'2022': 0.8, '2023': 0.6, '2024': 0.7}
   late        True  27451    777     4.9 ±0.5    {'2022': 5.1, '2023': 4.8, '2024': 4.7}
 london       False  80829    778    26.2 ±1.1 {'2022': 27.5, '2023': 26.2, '2024': 24.8}
 london        True  36316    777    48.6 ±1.6 {'2022': 50.7, '2023': 47.3, '2024': 47.5}
     ny       False  18296    775     4.3 ±0.8    {'2022': 4.7, '2023': 4.1, '2024': 4.1}
     ny        True  28798    777    15.9 ±1.0 {'2022': 17.2, '2023': 15.2, '2024': 15.3}
overlap       False  40231    778    17.4 ±1.1 {'2022': 18.1, '2023': 18.1, '2024': 16.0}
overlap        True  39040    778    36.9 ±1.4 {'2022': 38.3, '2023': 35.9, '2024': 36.5}
```

## H4d (extension beyond distance-matched geometry, U75, all instruments): per year and per instrument
```
per year: {'2022': '+4.18 ±1.85', '2023': '+3.89 ±2.03', '2024': '+4.19 ±1.60'}
instruments with a positive effect: 33 of 34
[('AUDCAD', np.float64(-1.5)), ('AUDCHF', np.float64(7.6)), ('AUDJPY', np.float64(4.5)), ('AUDNZD', np.float64(6.3)), ('AUDUSD', np.float64(1.6)), ('CADCHF', np.float64(6.2)), ('CADJPY', np.float64(2.4)), ('CHFJPY', np.float64(0.6)), ('DE30', np.float64(3.9)), ('EURAUD', np.float64(2.0)), ('EURCAD', np.float64(0.8)), ('EURCHF', np.float64(6.7)), ('EURGBP', np.float64(4.1)), ('EURJPY', np.float64(6.2)), ('EURNZD', np.float64(4.4)), ('EURUSD', np.float64(5.1)), ('GBPAUD', np.float64(5.8)), ('GBPCAD', np.float64(6.7)), ('GBPCHF', np.float64(4.6)), ('GBPJPY', np.float64(4.5)), ('GBPNZD', np.float64(2.3)), ('GBPUSD', np.float64(5.3)), ('GOLD', np.float64(6.0)), ('NQ', np.float64(7.4)), ('NZDCAD', np.float64(3.8)), ('NZDJPY', np.float64(7.6)), ('NZDUSD', np.float64(6.4)), ('SPX500', np.float64(13.9)), ('UK100', np.float64(7.8)), ('US2000', np.float64(7.1)), ('US30', np.float64(2.3)), ('USDCAD', np.float64(1.7)), ('USDCHF', np.float64(6.5)), ('USDJPY', np.float64(3.9))]
```