NQ: 2684 days, 1347 touches
SPX: 2684 days, 1394 touches

# VOL-CURVE-FRONT results (pre-registered: forge/VOL_CURVE_FRONT_PREREG.md, commit 98770791)

5368 index-days, 2741 first p75 touches (NQ + SPX), 2016-01-19 -> 2026-07-02

## H5 range: share of days past the PRODUCTION hl p75 (design 25%)
         mean        size     
half        A      B    A    B
fs                            
CALM    0.182  0.190  888  874
DEAR    0.325  0.323  832  958
NORMAL  0.240  0.265  854  962

half A: const -1.125 (z -9.9), level LOW -1.086 (z -8.2), level HIGH +0.546 (z +5.0), front CALM -0.594 (z -4.9), front DEAR +0.684 (z +5.9), SPX +0.107 (z +1.1)
half B: const -0.916 (z -9.0), level LOW -1.237 (z -10.3), level HIGH +0.675 (z +6.2), front CALM -0.722 (z -6.0), front DEAR +0.591 (z +5.4), SPX +0.037 (z +0.4)
H5 -> PASS

## Reported: front x level, share past production hl p75 (n)
            mean               size            
fs          CALM   DEAR NORMAL CALM DEAR NORMAL
half lv                                        
A    HIGH  0.260  0.464  0.402  411  183    264
     LOW   0.020  0.220  0.076  152  418    288
     MID   0.160  0.403  0.255  325  231    302
B    HIGH  0.285  0.556  0.455  389  133    242
     LOW   0.063  0.183  0.090  207  481    332
     MID   0.151  0.427  0.296  278  344    388

## Reported: event split on DEAR-front days (production lines already widen event days)
                      mean  size
half event                      
A    Major event     0.335   218
     no Major event  0.321   614
B    Major event     0.319   562
     no Major event  0.328   396

## H6-G1 follow on DEAR days, line race (target p90, stop p50): n=1073
        mean  size
half              
A    -0.0293   507
B     0.0664   566
pooled 0.0212, 99% day-clustered CI [-0.0816, 0.1200] · per instrument {'NQ': 0.0014, 'SPX': 0.0403} · by touch side {'OH': 0.0112, 'OL': 0.0324}
shuffled-front 95th pct 0.0681 · at 2x costs -0.0111
checks {'1 both halves': False, '2 CI excludes 0': False, '3 both instruments': True, '4 beats shuffle': False, '5 positive 2x cost': False, '6 shorts / both sides': True} -> FAIL
by year: {2016: -0.006, 2017: -0.139, 2018: 0.031, 2019: -0.052, 2020: -0.078, 2021: 0.035, 2022: 0.242, 2023: -0.184, 2024: 0.215, 2025: -0.065, 2026: 0.067}

## H6-G2 follow on DEAR days, break shape (stop 0.2 sigma, target 5R): n=1073
        mean  size
half              
A    -0.0144   507
B     0.2700   566
pooled 0.1356, 99% day-clustered CI [-0.0649, 0.3445] · per instrument {'NQ': 0.1847, 'SPX': 0.0885} · by touch side {'OH': 0.1773, 'OL': 0.089}
shuffled-front 95th pct 0.2455 · at 2x costs 0.0584
checks {'1 both halves': False, '2 CI excludes 0': False, '3 both instruments': True, '4 beats shuffle': False, '5 positive 2x cost': True, '6 shorts / both sides': True} -> FAIL
by year: {2016: 0.089, 2017: -0.053, 2018: 0.028, 2019: 0.147, 2020: -0.293, 2021: 0.198, 2022: 0.574, 2023: -0.341, 2024: 0.653, 2025: 0.139, 2026: 0.315}

## H7-G1 fade on CALM days (target p50, stop p90): n=726
        mean  size
half              
A    -0.0489   360
B    -0.0605   366
pooled -0.0547, 99% day-clustered CI [-0.1460, 0.0318] · per instrument {'NQ': -0.0545, 'SPX': -0.055} · by touch side {'OH': -0.0177, 'OL': -0.0863}
shuffled-front 95th pct -0.0313 · at 2x costs -0.0770
checks {'1 both halves': False, '2 CI excludes 0': False, '3 both instruments': False, '4 beats shuffle': False, '5 positive 2x cost': False, '6 shorts / both sides': False} -> FAIL
by year: {2016: 0.2, 2017: -0.108, 2018: -0.246, 2019: 0.03, 2020: -0.123, 2021: -0.089, 2022: -0.487, 2023: 0.109, 2024: 0.008, 2025: 0.028, 2026: -0.062}

## H7-G2 fade on CALM days (stop 0.2 sigma beyond, target p50): n=726
        mean  size
half              
A    -0.0721   360
B    -0.0775   366
pooled -0.0748, 99% day-clustered CI [-0.2406, 0.0847] · per instrument {'NQ': -0.031, 'SPX': -0.1179} · by touch side {'OH': -0.024, 'OL': -0.1182}
shuffled-front 95th pct -0.0532 · at 2x costs -0.1402
checks {'1 both halves': False, '2 CI excludes 0': False, '3 both instruments': False, '4 beats shuffle': False, '5 positive 2x cost': False, '6 shorts / both sides': False} -> FAIL
by year: {2016: 0.492, 2017: -0.232, 2018: -0.47, 2019: 0.23, 2020: -0.355, 2021: -0.122, 2022: -0.378, 2023: 0.337, 2024: -0.223, 2025: -0.015, 2026: 0.038}

## Reported: every front state, mean net R by trade (n)
                 f1      f2      d1      d2
half fs                                    
A    CALM   -0.0386  0.2068 -0.0489 -0.0721
     DEAR   -0.0293 -0.0144 -0.0143 -0.1703
     NORMAL  0.0857  0.3510 -0.1429 -0.1869
B    CALM    0.0221 -0.0292 -0.0605 -0.0775
     DEAR    0.0664  0.2700 -0.0933 -0.0653
     NORMAL  0.0252  0.1460 -0.0719 -0.1155

VERDICT: H5 PASS · H6-G1 FAIL · H6-G2 FAIL · H7-G1 FAIL · H7-G2 FAIL
