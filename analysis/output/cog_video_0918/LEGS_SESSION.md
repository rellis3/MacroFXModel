# COG-LEGS-SESSION results

Run once per forge/COG_LEGS_SESSION_PREREG.md. Explore to 2025-10-31, confirm from 2025-11-03.

Days with the European-morning spread and the US-session Nasdaq return both present: 604. Explore n about 395, confirm n about 233; minimum detectable |rho| about 0.18.

| pred   | series   | out   |   rho_e | t_e   |   n_e |   rho_c | t_c   |   n_c |   p_e |   p_c1 |   same_window |   rho_partial |   placebo_p | fdr_explore   | confirmed   |
|:-------|:---------|:------|--------:|:------|------:|--------:|:------|------:|------:|-------:|--------------:|--------------:|------------:|:--------------|:------------|
| eum    | us       | O1    |  -0.028 | -0.54 |   381 |  -0.009 | -0.14 |   224 | 0.586 |  0.446 |         0.02  |        -0.023 |       0.573 | False         | False       |
| eum    | us       | O2    |  -0.003 | -0.05 |   395 |   0.012 | +0.18 |   233 | 0.96  |  0.571 |         0.02  |         0.007 |       0.954 | False         | False       |
| eum    | eu       | O1    |  -0.044 | -0.86 |   380 |  -0.029 | -0.43 |   225 | 0.392 |  0.333 |        -0.122 |        -0.033 |       0.359 | False         | False       |
| eum    | eu       | O2    |  -0.004 | -0.08 |   393 |  -0.007 | -0.10 |   233 | 0.936 |  0.46  |        -0.122 |        -0.013 |       0.887 | False         | False       |
| eum    | sp       | O1    |   0.03  | +0.59 |   380 |   0.03  | +0.45 |   224 | 0.557 |  0.328 |         0.224 |         0.023 |       0.485 | False         | False       |
| eum    | sp       | O2    |   0.029 | +0.57 |   393 |   0.008 | +0.12 |   232 | 0.571 |  0.452 |         0.224 |         0.044 |       0.534 | False         | False       |
| asia   | us       | O0    |   0.166 | +1.48 |    80 |   0.007 | +0.06 |    76 | 0.142 |  0.476 |         0.213 |               |       0.222 | False         | False       |
| asia   | us       | O1    |   0.006 | +0.06 |    75 |   0.198 | +1.69 |    72 | 0.956 |  0.048 |         0.213 |               |       0.387 | False         | False       |
| asia   | eu       | O0    |         | +nan  |     0 |         | +nan  |     0 | 1     |  1     |               |               |       0.001 | False         | False       |
| asia   | eu       | O1    |         | +nan  |     0 |         | +nan  |     0 | 1     |  1     |               |               |       0.001 | False         | False       |
| asia   | sp       | O0    |         | +nan  |     0 |         | +nan  |     0 | 1     |  1     |               |               |       0.001 | False         | False       |
| asia   | sp       | O1    |         | +nan  |     0 |         | +nan  |     0 | 1     |  1     |               |               |       0.001 | False         | False       |

Cells passing FDR 10% in explore: 0 of 12; confirmed: 0.

same_window = rho of the predictor with Nasdaq over the SAME window (the known concurrent link). rho_partial = European-morning rows only: predictor vs outcome after removing the part of the outcome explained by Nasdaq own morning move. placebo_p = share of 1000 within-month shuffles with |rho| at least as large.
## Reader's note (added after the run, not part of the registered output)
The six European-morning cells are the valid test: all |rho| <= 0.05 on 380/225 days, none near FDR, placebo p 0.36-0.95. The six Asian-window cells are NOT a null: the registered anchor (22:00 UTC) has no Euribor print (ICE Europe is closed), so the euro-leg and spread cells have n = 0, and the SOFR-leg cells have only about 75 days per half (below the 0.18 detectable size). They are untestable as registered and need a different anchor (for example 07:00 to 08:00 UTC against the US session) if anyone wants them.
