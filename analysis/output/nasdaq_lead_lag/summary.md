# NAS100 lead-lag scan -- lag-replay theory test

NAS100 M15: 70,667 bars, 2023-09-06 20:15:00 .. 2026-09-04 20:45:00
Lag grid: 3-60h step 3h (20 points). Train/test split: 65/35 chronological, lag selected on train only, honest stats scored on test only.
Null draws per cell: 1500. Verdict = REAL requires |IC| >= 0.025, p_null < 0.05, and split-half sign-stable.

## Ranked table (by |honest test-split IC|)

| key | group | resolution | contemp_corr | best_lag_h | full_level_corr | ic | p_null | stable | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| leg_discretionary_staples_yahoo | A | yahoo_daily | 0.7645 | 12 | 0.7658 | 0.3626 | 0.0 | True | REAL |
| jordan_composite_yahoo | A | yahoo_daily | 0.3247 | 15 | 0.3259 | 0.2854 | 0.0 | True | REAL |
| vix | E | fred_daily | 0.0883 | 45 | 0.0902 | -0.1185 | 0.0393 | True | REAL |
| eurusd_skew | H | cvol_daily | 0.0917 | 15 | 0.0914 | 0.1033 | 0.0147 | False | NO SIGNAL |
| silver_gold_ratio_oanda | H | oanda_m15 | 0.6283 | 60 | 0.6236 | -0.1004 | 0.16 | True | SPURIOUS-LOOKING-ONLY |
| em_fx_basket | H | oanda_m15 | 0.7413 | 60 | 0.7448 | 0.0762 | 0.2347 | True | SPURIOUS-LOOKING-ONLY |
| eurusd_cvol | H | cvol_daily | -0.171 | 45 | -0.1592 | -0.0751 | 0.1793 | False | NO SIGNAL |
| fwd5y5y | C | fred_daily | -0.4078 | 60 | -0.411 | 0.0638 | 0.306 | True | NO SIGNAL |
| oil_gold_ratio_oanda | G | oanda_m15 | -0.8086 | 60 | -0.8099 | 0.0601 | 0.3567 | True | SPURIOUS-LOOKING-ONLY |
| hy_ig_oas_diff | B | fred_daily | -0.7215 | 6 | -0.7215 | -0.0587 | 0.0107 | True | REAL |
| xauusd_cvol | H | cvol_daily | 0.6752 | 60 | 0.67 | 0.0553 | 0.4453 | True | SPURIOUS-LOOKING-ONLY |
| nas_rvol | G | oanda_m15 | 0.0167 | 3 | 0.0184 | 0.0553 | 0.0053 | True | REAL |
| oil | D | oanda_m15 | -0.0504 | 60 | -0.0579 | 0.0494 | 0.492 | False | NO SIGNAL |
| smallcap_largecap_oanda | B | oanda_m15 | -0.3526 | 60 | -0.3615 | -0.0423 | 0.5227 | False | NO SIGNAL |
| slope_5s30s | H | fred_daily | 0.7735 | 45 | 0.7763 | 0.0417 | 0.4853 | False | SPURIOUS-LOOKING-ONLY |
| copper_gold_ratio_yahoo | D | yahoo_daily | -0.7389 | 3 | -0.739 | 0.0378 | 0.0327 | True | REAL |
| slope_2s30s | H | fred_daily | 0.8124 | 45 | 0.814 | 0.0366 | 0.534 | True | SPURIOUS-LOOKING-ONLY |
| leg_hy_ig_credit_yahoo | A | yahoo_daily | 0.6278 | 15 | 0.6275 | 0.034 | 0.3793 | False | SPURIOUS-LOOKING-ONLY |
| hangseng | F | oanda_m15 | 0.8468 | 3 | 0.8467 | 0.0326 | 0.0473 | True | REAL |
| usd_basket | D | oanda_m15 | -0.4946 | 12 | -0.4953 | -0.0325 | 0.3393 | False | NO SIGNAL |
| hy_oas | B | fred_daily | -0.7805 | 3 | -0.7805 | -0.0304 | 0.094 | True | SPURIOUS-LOOKING-ONLY |
| usb05y | H | oanda_m15 | 0.4364 | 3 | 0.4369 | 0.0263 | 0.1227 | False | NO SIGNAL |
| usb02y | C | oanda_m15 | 0.7037 | 3 | 0.704 | 0.0246 | nan | False | SPURIOUS-LOOKING-ONLY |
| xauusd_skew | H | cvol_daily | -0.2057 | 3 | -0.2058 | 0.0243 | nan | False | NO SIGNAL |
| slope_2s10s | C | fred_daily | 0.7935 | 45 | 0.7949 | 0.024 | nan | False | SPURIOUS-LOOKING-ONLY |
| ig_oas | B | fred_daily | -0.854 | 3 | -0.854 | -0.0229 | nan | False | SPURIOUS-LOOKING-ONLY |
| usb10y | C | oanda_m15 | 0.2742 | 3 | 0.2746 | 0.0227 | nan | False | NO SIGNAL |
| nikkei | F | oanda_m15 | 0.928 | 3 | 0.9278 | 0.0209 | nan | False | SPURIOUS-LOOKING-ONLY |
| dax | F | oanda_m15 | 0.9191 | 3 | 0.9189 | 0.0168 | nan | False | SPURIOUS-LOOKING-ONLY |
| nfci | E | fred_weekly | -0.8902 | 3 | -0.89 | 0.011 | nan | False | SPURIOUS-LOOKING-ONLY |
| slope_2s5s | H | fred_daily | 0.8045 | 60 | 0.8049 | -0.0104 | nan | False | SPURIOUS-LOOKING-ONLY |
| nzdjpy | G | oanda_m15 | 0.243 | 48 | 0.2363 | 0.0078 | nan | False | NO SIGNAL |
| real10 | C | fred_daily | 0.0262 | 3 | 0.0255 | -0.0076 | nan | False | NO SIGNAL |
| audjpy | G | oanda_m15 | 0.6818 | 3 | 0.6814 | 0.0073 | nan | False | SPURIOUS-LOOKING-ONLY |
| leg_smallcap_largecap_yahoo | A | yahoo_daily | -0.3309 | 60 | -0.3401 | -0.0063 | nan | False | NO SIGNAL |
| dow_spx_ratio_oanda | H | oanda_m15 | -0.9217 | 3 | -0.9216 | -0.0062 | nan | False | SPURIOUS-LOOKING-ONLY |
| gold | D | oanda_m15 | 0.9126 | 3 | 0.9126 | 0.0056 | nan | False | SPURIOUS-LOOKING-ONLY |
| be10 | C | fred_daily | 0.1343 | 3 | 0.1342 | -0.0033 | nan | False | NO SIGNAL |
| ftse | F | oanda_m15 | 0.9444 | 3 | 0.9442 | -0.0021 | nan | False | SPURIOUS-LOOKING-ONLY |