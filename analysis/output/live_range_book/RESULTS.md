# LIVE-RANGE-BOOK — results

Pre-registration: `forge/LIVE_RANGE_BOOK_PREREG.md`. Train = first 60% of dates (selection), test = last 40% (1079 dates).

Part A universe: 195,618 resolved first-touches of 233,592 (37,974 dropped: pre-resolved, both-in-bar or unresolved).

## Part A — Book trade on moving lines (R per trade, net of spread)

Pooled by class × rung, test period (continue = target next line out / stop back; fade = target back / stop out):

| class | rung | n test | continue R [95%] | fade R [95%] | mean spread (σ) |
|---|---|---|---|---|---|
| fx_gold | p50 | 33,876 | -0.331 [-0.363, -0.299] | -0.035 [-0.069, +0.005] | 0.016 |
| fx_gold | p75 | 20,575 | -0.302 [-0.340, -0.264] | -0.044 [-0.059, -0.028] | 0.016 |
| fx_gold | p90 | 9,484 | -0.279 [-0.319, -0.239] | +0.073 [-0.457, +0.941] | 0.016 |
| indices | p50 | 6,838 | -0.425 [-0.508, -0.333] | -0.087 [-0.113, -0.062] | 0.031 |
| indices | p75 | 5,101 | -0.447 [-0.531, -0.367] | -0.105 [-0.171, +0.004] | 0.031 |
| indices | p90 | 1,611 | -0.175 [-0.460, +0.309] | -0.928 [-1.938, -0.401] | 0.031 |

Cells × strategies examined: **838**; selected on train (net R > 0, n ≥ 300): **68**; passing on test (CI wholly > 0 and both halves > 0): **0** (0.0% of selected; chance rate ≈ 5%).
Verdict A: **NO BETTER THAN THE STATIC-LINE BOOK**.

Share of selected cells whose TEST net R is also > 0 (selection holds out of sample): 26.5%; mean test R of selected cells +0.001 (train +0.150).


Best 8 selected cells by train R (what a train-time pick would have chosen) and how they did on test:

| split | cell | strat | n test | train R | test R [95%] |
|---|---|---|---|---|---|
| used×pace cell × hours | {'cls': 'fx_gold', 'rung': 2, 'cellu': 8, 'hg': 2} | fade | 1,855 | +1.381 | +1.747 [-0.399, +6.051] |
| used×pace cell | {'cls': 'fx_gold', 'rung': 2, 'cellu': 8} | fade | 2,353 | +1.134 | +1.348 [-0.341, +4.749] |
| touch number today × hours | {'cls': 'fx_gold', 'rung': 2, 'tn': 3, 'hg': 2} | fade | 3,754 | +0.548 | +0.544 [-0.784, +2.752] |
| touch number today | {'cls': 'fx_gold', 'rung': 2, 'tn': 3} | fade | 4,092 | +0.511 | +0.488 [-0.735, +2.534] |
| a÷b geometry tercile × hours | {'cls': 'fx_gold', 'rung': 2, 'abt': 0, 'hg': 2} | fade | 2,611 | +0.455 | +0.546 [-1.380, +3.766] |
| regime × hours | {'cls': 'fx_gold', 'rung': 2, 'reg': 1, 'hg': 2} | fade | 3,502 | +0.429 | +0.637 [-0.777, +2.990] |
| a÷b geometry tercile | {'cls': 'fx_gold', 'rung': 2, 'abt': 0} | fade | 3,172 | +0.398 | +0.407 [-1.170, +3.007] |
| side × hours | {'cls': 'fx_gold', 'rung': 2, 'sd': -1, 'hg': 2} | fade | 3,932 | +0.392 | -0.233 [-0.408, -0.045] |

## Part B — trend-day state from the line path

Signed forward outcome (final 22:00 close − close at checkpoint, in σ, in the state's direction) minus the same-hour all-days drift; spread = round-trip cost in σ. Test unless stated.

| variant | class | hours | state rows | dates | train excess | test excess [95%] | spread | verdict |
|---|---|---|---|---|---|---|---|---|
| B1 (2 h) | fx_gold | 08-12 | 5,745 | 941 | +0.035 | +0.017 [-0.026, +0.062] | 0.016 | inside noise / below cost |
| B1 (2 h) | fx_gold | 13-18 | 2,073 | 767 | +0.010 | -0.036 [-0.082, +0.010] | 0.015 | inside noise / below cost |
| B1 (2 h) | indices | 08-12 | 587 | 315 | +0.020 | +0.008 [-0.108, +0.131] | 0.027 | inside noise / below cost |
| B1 (2 h) | indices | 13-18 | 850 | 497 | +0.037 | +0.024 [-0.030, +0.076] | 0.034 | inside noise / below cost |
| B2 (3 h) | fx_gold | 08-12 | 1,147 | 426 | +0.052 | +0.017 [-0.086, +0.116] | 0.016 | inside noise / below cost |
| B2 (3 h) | fx_gold | 13-18 | 209 | 171 | +0.033 | -0.053 [-0.155, +0.045] | 0.016 | inside noise / below cost |
| B2 (3 h) | indices | 08-12 | 122 | 84 | +0.039 | +0.051 [-0.162, +0.273] | 0.026 | inside noise / below cost |

Trend-state cells examined: 7; with an edge net of spread: **0**.