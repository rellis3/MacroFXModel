# NAS100 lead-lag scan -- lag-replay theory test

NAS100 M15: 70,673 bars, 2023-09-06 18:45:00 .. 2026-09-04 20:45:00
Lag grid: 3-60h step 3h (20 points). Train/test split: 65/35 chronological, lag selected on train only, honest stats scored on test only.
Null draws per cell: 1500. Verdict = REAL requires |IC| >= 0.025, p_null < 0.05, and split-half sign-stable.

## Ranked table (by |honest test-split IC|)

| key | group | resolution | contemp_corr | best_lag_h | full_level_corr | ic | p_null | stable | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| leg_discretionary_staples_yahoo | A | yahoo_daily | 0.7645 | 12 | 0.7658 | 0.3626 | 0.0 | True | REAL |
| jordan_composite_yahoo | A | yahoo_daily | 0.3246 | 15 | 0.3258 | 0.2854 | 0.0 | True | REAL |
| vix | E | fred_daily | 0.0883 | 45 | 0.0902 | -0.1185 | 0.0393 | True | REAL |
| fwd5y5y | C | fred_daily | -0.4079 | 60 | -0.411 | 0.0639 | 0.304 | True | NO SIGNAL |
| hy_ig_oas_diff | B | fred_daily | -0.7215 | 6 | -0.7216 | -0.0587 | 0.0113 | True | REAL |
| oil | D | oanda_m15 | -0.0506 | 60 | -0.0579 | 0.0494 | 0.49 | False | NO SIGNAL |
| smallcap_largecap_oanda | B | oanda_m15 | -0.3528 | 60 | -0.3615 | -0.0423 | 0.522 | False | NO SIGNAL |
| copper_gold_ratio_yahoo | D | yahoo_daily | -0.7389 | 3 | -0.739 | 0.0378 | 0.0333 | True | REAL |
| leg_hy_ig_credit_yahoo | A | yahoo_daily | 0.6278 | 15 | 0.6276 | 0.034 | 0.3813 | False | SPURIOUS-LOOKING-ONLY |
| hangseng | F | oanda_m15 | 0.8468 | 3 | 0.8466 | 0.033 | 0.052 | True | SPURIOUS-LOOKING-ONLY |
| usd_basket | D | oanda_m15 | -0.4947 | 12 | -0.4954 | -0.0326 | 0.3427 | False | NO SIGNAL |
| hy_oas | B | fred_daily | -0.7805 | 3 | -0.7806 | -0.0304 | 0.0907 | True | SPURIOUS-LOOKING-ONLY |
| usb02y | C | oanda_m15 | 0.7038 | 3 | 0.7041 | 0.0246 | nan | False | SPURIOUS-LOOKING-ONLY |
| slope_2s10s | C | fred_daily | 0.7936 | 45 | 0.795 | 0.0241 | nan | False | SPURIOUS-LOOKING-ONLY |
| ig_oas | B | fred_daily | -0.8541 | 3 | -0.854 | -0.0229 | nan | False | SPURIOUS-LOOKING-ONLY |
| usb10y | C | oanda_m15 | 0.2742 | 3 | 0.2747 | 0.0226 | nan | False | NO SIGNAL |
| nikkei | F | oanda_m15 | 0.928 | 3 | 0.9278 | 0.0211 | nan | False | SPURIOUS-LOOKING-ONLY |
| dax | F | oanda_m15 | 0.9192 | 3 | 0.9189 | 0.0169 | nan | False | SPURIOUS-LOOKING-ONLY |
| nfci | E | fred_weekly | -0.8902 | 3 | -0.89 | 0.011 | nan | False | SPURIOUS-LOOKING-ONLY |
| real10 | C | fred_daily | 0.0262 | 3 | 0.0255 | -0.0076 | nan | False | NO SIGNAL |
| leg_smallcap_largecap_yahoo | A | yahoo_daily | -0.3311 | 60 | -0.3401 | -0.0063 | nan | False | NO SIGNAL |
| gold | D | oanda_m15 | 0.9127 | 3 | 0.9126 | 0.0057 | nan | False | SPURIOUS-LOOKING-ONLY |
| be10 | C | fred_daily | 0.1343 | 3 | 0.1342 | -0.0033 | nan | False | NO SIGNAL |
| ftse | F | oanda_m15 | 0.9444 | 3 | 0.9442 | -0.0019 | nan | False | SPURIOUS-LOOKING-ONLY |