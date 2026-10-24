# COG-EVENT-ALIGN results

Registered in `forge/COG_EVENT_ALIGN_PREREG.md` (caaefd7c) before any computation.

Price events: 2615. Calls (2 or more aligned events at one shift, projected time still in the future): 432, about 3.3 per week (249 Explore, 183 Confirm).
Chosen lead (bars): 2: 17, 4: 7, 8: 18, 16: 59, 32: 37, 64: 35, 96: 125, 128: 102, 192: 32.
Number of matches: 2: 159, 3: 119, 4 or more: 154.
Event hit rate (a price turn in the called direction within tolerance of the projected time): 46.1%; with the projected time moved by a random 8 to 96 bars: 36.6%.

| horizon | calls | Explore mean signed move % (n) | Confirm mean signed move % (n) | Explore p | Confirm p | BH p | share of calls right | pass |
|---|---|---|---|---|---|---|---|---|
| 0.5h | 432 | +0.0145 (249) | +0.0329 (183) | 0.201 | 0.024 | 0.291 | 52.1% | NO |
| 1h | 432 | +0.0011 (249) | +0.0470 (183) | 0.499 | 0.029 | 0.499 | 50.2% | NO |
| 2h | 432 | +0.0295 (249) | +0.0289 (183) | 0.170 | 0.196 | 0.291 | 53.0% | NO |
| 4h | 432 | +0.0320 (249) | +0.0025 (183) | 0.218 | 0.470 | 0.291 | 49.5% | NO |

Mean signed move % by number of aligned events (does more alignment mean more follow-through?):

| matches | calls | 0.5h | 1h | 2h | 4h |
|---|---|---|---|---|---|
| 2 | 159 | +0.0323 | +0.0545 | +0.0402 | +0.0206 |
| 3 | 119 | +0.0295 | +0.0083 | +0.0553 | +0.0525 |
| 4+ | 154 | +0.0064 | -0.0050 | -0.0022 | -0.0070 |

Placebo (line rotated by random days, 30 draws, maximum over horizons): Confirm real +0.0470 vs placebo median +0.0148, 95th +0.0744; Explore real +0.0320 vs placebo median +0.0262, 95th +0.0522.
**Registered verdict: aligned structure events predict a future shift = NO** (0 of 4 horizons pass; placebo condition not met).

