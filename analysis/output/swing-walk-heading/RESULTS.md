# swing-walk-heading: results

Prereg `forge/SWING_WALK_HEADING_PREREG.md`. Run 2026-11-07. Seed 20261107, B = 2000. Expiries 2020-10-01 to 2026-08-21, 1-40 sessions, page-default walk, dots at least 0.1 expected moves from price.

## H1: does price reach the dot more often than a level the same distance the other way?

| Anchor | Steps | Median gap (exp. moves) | Reached: dot / mirror | Effect, balanced [95% CI] | Holm p | Halves | Above / below | With / against trailing move | Closest approach: dot / mirror | MDE | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gamma centre | 12,741 | 0.25 | 76.0% / 75.4% | +0.7pp [-2.7pp, +4.1pp] | 1.000 | -1.4pp / +3.3pp | +2.1pp / -0.8pp | -3.1pp / +1.8pp | 88% / 87% | 5.8pp | **UNDERPOWERED** |
| gamma best strike | 15,418 | 0.45 | 61.6% / 62.2% | -0.6pp [-4.0pp, +2.5pp] | 1.000 | +1.3pp / -2.3pp | +0.4pp / -1.6pp | -1.4pp / -0.2pp | 80% / 80% | 5.3pp | **UNDERPOWERED** |
| strongest strike | 17,215 | 1.56 | 23.3% / 24.8% | -1.5pp [-4.0pp, +1.5pp] | 1.000 | -2.3pp / -0.6pp | -1.7pp / -1.3pp | +0.1pp / -2.5pp | 48% / 48% | 4.4pp | **NULL** |
| max pain | 16,495 | 0.76 | 41.3% / 44.2% | -2.9pp [-7.2pp, +1.2pp] | 1.000 | -5.9pp / +0.3pp | -2.6pp / -3.2pp | -3.4pp / -2.8pp | 67% / 67% | 6.7pp | **UNDERPOWERED** |
| OI centre | 16,937 | 1.08 | 32.1% / 33.4% | -1.4pp [-5.2pp, +2.5pp] | 1.000 | -4.4pp / +2.1pp | -2.1pp / -0.7pp | -1.3pp / -1.3pp | 57% / 57% | 4.9pp | **NULL** |

## H2: does the next day lean toward the dot? (σ of a day)

| Anchor | Steps | Effect, balanced [95% CI] | Holm p | Halves | Above / below | With / against trailing move | MDE | Verdict |
|---|---|---|---|---|---|---|---|---|
| gamma centre | 12,741 | +0.006 [-0.021, +0.031] | 1.000 | -0.006 / +0.017 | +0.018 / -0.007 | -0.008 / +0.011 | 0.028 | **NULL** |
| gamma best strike | 15,418 | +0.000 [-0.018, +0.020] | 1.000 | -0.001 / +0.002 | +0.016 / -0.015 | -0.012 / +0.009 | 0.027 | **NULL** |
| strongest strike | 17,215 | +0.008 [-0.011, +0.026] | 1.000 | +0.000 / +0.016 | +0.020 / -0.005 | +0.001 / +0.015 | 0.027 | **NULL** |
| max pain | 16,495 | +0.008 [-0.018, +0.034] | 1.000 | -0.005 / +0.022 | +0.024 / -0.008 | -0.011 / +0.014 | 0.024 | **NULL** |
| OI centre | 16,937 | +0.009 [-0.016, +0.034] | 1.000 | -0.000 / +0.020 | +0.024 / -0.005 | -0.001 / +0.014 | 0.034 | **NULL** |

## Slices (descriptive, BH q = 0.10): 0 of 186 pass; 9.3 expected by chance at 5%

| Anchor | Question | Cut | Slice | Steps | Effect [CI] | Reached dot / mirror | BH |
|---|---|---|---|---|---|---|---|
| gamma centre | touch | sessions left | 1-2 | 652 | +7.2pp [+1.2pp, +13.5pp] | 80% / 73% |  |
| gamma centre | next | sessions left | 1-2 | 652 | +0.128 [+0.022, +0.244] | 80% / 73% |  |
| gamma centre | touch | sessions left | 3-5 | 933 | +5.9pp [-0.6pp, +12.5pp] | 79% / 73% |  |
| gamma centre | next | sessions left | 3-5 | 933 | +0.071 [-0.031, +0.159] | 79% / 73% |  |
| gamma centre | touch | sessions left | 6-10 | 1,624 | +3.9pp [-1.9pp, +9.6pp] | 78% / 74% |  |
| gamma centre | next | sessions left | 6-10 | 1,624 | -0.015 [-0.068, +0.045] | 78% / 74% |  |
| gamma centre | touch | sessions left | 11-20 | 3,153 | -5.1pp [-10.3pp, -0.3pp] | 73% / 78% |  |
| gamma centre | next | sessions left | 11-20 | 3,153 | -0.018 [-0.062, +0.025] | 73% / 78% |  |
| gamma centre | touch | sessions left | 21-40 | 6,379 | +1.3pp [-4.3pp, +7.2pp] | 76% / 75% |  |
| gamma centre | next | sessions left | 21-40 | 6,379 | +0.000 [-0.026, +0.026] | 76% / 75% |  |
| gamma centre | touch | gap (expected moves) | 0.1-0.5 | 11,011 | -0.0pp [-3.6pp, +3.2pp] | 80% / 80% |  |
| gamma centre | next | gap (expected moves) | 0.1-0.5 | 11,011 | +0.004 [-0.022, +0.032] | 80% / 80% |  |
| gamma centre | touch | gap (expected moves) | 0.5-1 | 1,519 | +6.0pp [-2.8pp, +15.6pp] | 54% / 48% |  |
| gamma centre | next | gap (expected moves) | 0.5-1 | 1,519 | +0.049 [+0.000, +0.104] | 54% / 48% |  |
| gamma centre | touch | gap (expected moves) | 1-2 | 188 | -2.0pp [-18.0pp, +12.8pp] | 24% / 25% |  |
| gamma centre | next | gap (expected moves) | 1-2 | 188 | -0.197 [-0.442, +0.083] | 24% / 25% |  |
| gamma centre | touch | instrument | AUDUSD | 1,815 | +5.5pp [-0.8pp, +11.9pp] | 83% / 78% |  |
| gamma centre | next | instrument | AUDUSD | 1,815 | +0.013 [-0.035, +0.076] | 83% / 78% |  |
| gamma centre | touch | instrument | EURUSD | 1,769 | +2.0pp [-4.7pp, +9.4pp] | 80% / 78% |  |
| gamma centre | next | instrument | EURUSD | 1,769 | +0.030 [-0.026, +0.088] | 80% / 78% |  |
| gamma centre | touch | instrument | GBPUSD | 1,962 | +4.1pp [-2.6pp, +11.8pp] | 78% / 74% |  |
| gamma centre | next | instrument | GBPUSD | 1,962 | +0.036 [-0.017, +0.094] | 78% / 74% |  |
| gamma centre | touch | instrument | NAS100 | 571 | -3.4pp [-14.7pp, +9.8pp] | 76% / 80% |  |
| gamma centre | next | instrument | NAS100 | 571 | -0.003 [-0.086, +0.074] | 76% / 80% |  |
| gamma centre | touch | instrument | SPX500 | 610 | -1.6pp [-9.7pp, +8.2pp] | 77% / 81% |  |
| gamma centre | next | instrument | SPX500 | 610 | +0.015 [-0.061, +0.115] | 77% / 81% |  |
| gamma centre | touch | instrument | USDCAD | 1,887 | -2.2pp [-8.7pp, +5.1pp] | 79% / 81% |  |
| gamma centre | next | instrument | USDCAD | 1,887 | -0.021 [-0.069, +0.031] | 79% / 81% |  |
| gamma centre | touch | instrument | USDCHF | 2,087 | -0.2pp [-9.0pp, +9.7pp] | 65% / 66% |  |
| gamma centre | next | instrument | USDCHF | 2,087 | -0.020 [-0.073, +0.037] | 65% / 66% |  |
| gamma centre | touch | instrument | USDJPY | 2,040 | +4.9pp [-1.4pp, +10.9pp] | 73% / 74% |  |
| gamma centre | next | instrument | USDJPY | 2,040 | +0.035 [-0.016, +0.096] | 73% / 74% |  |
| gamma centre | touch | group | FX | 11,560 | +1.1pp [-2.4pp, +4.4pp] | 76% / 75% |  |
| gamma centre | next | group | FX | 11,560 | +0.007 [-0.022, +0.033] | 76% / 75% |  |
| gamma centre | touch | group | indices | 1,181 | -2.7pp [-11.9pp, +8.4pp] | 76% / 81% |  |
| gamma centre | next | group | indices | 1,181 | +0.006 [-0.062, +0.075] | 76% / 81% |  |
| gamma best strike | touch | sessions left | 1-2 | 822 | +3.0pp [-3.4pp, +8.9pp] | 63% / 60% |  |
| gamma best strike | next | sessions left | 1-2 | 822 | +0.013 [-0.066, +0.091] | 63% / 60% |  |
| gamma best strike | touch | sessions left | 3-5 | 1,156 | +2.8pp [-1.6pp, +6.9pp] | 64% / 61% |  |
| gamma best strike | next | sessions left | 3-5 | 1,156 | +0.010 [-0.051, +0.065] | 64% / 61% |  |
| gamma best strike | touch | sessions left | 6-10 | 1,944 | +2.4pp [-2.2pp, +6.9pp] | 64% / 62% |  |
| gamma best strike | next | sessions left | 6-10 | 1,944 | +0.002 [-0.040, +0.047] | 64% / 62% |  |
| gamma best strike | touch | sessions left | 11-20 | 3,911 | -2.1pp [-6.6pp, +2.8pp] | 60% / 62% |  |
| gamma best strike | next | sessions left | 11-20 | 3,911 | -0.000 [-0.032, +0.028] | 60% / 62% |  |
| gamma best strike | touch | sessions left | 21-40 | 7,585 | -1.5pp [-6.2pp, +2.9pp] | 61% / 63% |  |
| gamma best strike | next | sessions left | 21-40 | 7,585 | -0.003 [-0.026, +0.020] | 61% / 63% |  |
| gamma best strike | touch | gap (expected moves) | 0.1-0.5 | 8,594 | -1.1pp [-3.8pp, +1.6pp] | 76% / 77% |  |
| gamma best strike | next | gap (expected moves) | 0.1-0.5 | 8,594 | -0.012 [-0.033, +0.010] | 76% / 77% |  |
| gamma best strike | touch | gap (expected moves) | 0.5-1 | 5,846 | -1.2pp [-6.7pp, +3.7pp] | 46% / 48% |  |
| gamma best strike | next | gap (expected moves) | 0.5-1 | 5,846 | +0.013 [-0.018, +0.039] | 46% / 48% |  |
| gamma best strike | touch | gap (expected moves) | 1-2 | 934 | +7.4pp [-1.2pp, +15.0pp] | 29% / 22% |  |
| gamma best strike | next | gap (expected moves) | 1-2 | 934 | +0.046 [-0.034, +0.121] | 29% / 22% |  |
| gamma best strike | touch | instrument | AUDUSD | 2,306 | +0.9pp [-5.2pp, +6.6pp] | 62% / 62% |  |
| gamma best strike | next | instrument | AUDUSD | 2,306 | -0.024 [-0.068, +0.025] | 62% / 62% |  |
| gamma best strike | touch | instrument | EURUSD | 2,297 | -3.0pp [-10.8pp, +4.6pp] | 64% / 67% |  |
| gamma best strike | next | instrument | EURUSD | 2,297 | +0.008 [-0.034, +0.055] | 64% / 67% |  |
| gamma best strike | touch | instrument | GBPUSD | 2,333 | +0.4pp [-7.5pp, +8.3pp] | 62% / 61% |  |
| gamma best strike | next | instrument | GBPUSD | 2,333 | +0.012 [-0.033, +0.066] | 62% / 61% |  |
| gamma best strike | touch | instrument | NAS100 | 762 | -0.2pp [-13.9pp, +12.1pp] | 64% / 64% |  |
| gamma best strike | next | instrument | NAS100 | 762 | +0.056 [-0.020, +0.136] | 64% / 64% |  |
| gamma best strike | touch | instrument | SPX500 | 755 | -2.5pp [-12.9pp, +8.3pp] | 62% / 66% |  |
| gamma best strike | next | instrument | SPX500 | 755 | -0.040 [-0.109, +0.032] | 62% / 66% |  |
| gamma best strike | touch | instrument | USDCAD | 2,320 | -2.1pp [-9.0pp, +5.0pp] | 65% / 67% |  |
| gamma best strike | next | instrument | USDCAD | 2,320 | -0.020 [-0.069, +0.030] | 65% / 67% |  |
| gamma best strike | touch | instrument | USDCHF | 2,278 | -0.7pp [-9.1pp, +6.4pp] | 56% / 57% |  |
| gamma best strike | next | instrument | USDCHF | 2,278 | -0.020 [-0.069, +0.025] | 56% / 57% |  |
| gamma best strike | touch | instrument | USDJPY | 2,367 | +5.0pp [-1.8pp, +11.4pp] | 60% / 57% |  |
| gamma best strike | next | instrument | USDJPY | 2,367 | +0.050 [+0.005, +0.093] | 60% / 57% |  |
| gamma best strike | touch | group | FX | 13,901 | -0.5pp [-3.8pp, +2.8pp] | 61% / 62% |  |
| gamma best strike | next | group | FX | 13,901 | -0.000 [-0.021, +0.019] | 61% / 62% |  |
| gamma best strike | touch | group | indices | 1,517 | -1.5pp [-10.0pp, +8.6pp] | 63% / 65% |  |
| gamma best strike | next | group | indices | 1,517 | +0.010 [-0.041, +0.057] | 63% / 65% |  |
| strongest strike | touch | sessions left | 1-2 | 922 | +2.2pp [-0.7pp, +5.1pp] | 12% / 10% |  |
| strongest strike | next | sessions left | 1-2 | 922 | +0.107 [+0.027, +0.191] | 12% / 10% |  |
| strongest strike | touch | sessions left | 3-5 | 1,293 | +2.7pp [-0.6pp, +6.0pp] | 18% / 15% |  |
| strongest strike | next | sessions left | 3-5 | 1,293 | +0.028 [-0.026, +0.095] | 18% / 15% |  |
| strongest strike | touch | sessions left | 6-10 | 2,201 | +1.6pp [-1.5pp, +5.1pp] | 22% / 20% |  |
| strongest strike | next | sessions left | 6-10 | 2,201 | +0.010 [-0.027, +0.049] | 22% / 20% |  |
| strongest strike | touch | sessions left | 11-20 | 4,388 | -0.8pp [-4.1pp, +2.5pp] | 24% / 25% |  |
| strongest strike | next | sessions left | 11-20 | 4,388 | -0.003 [-0.036, +0.030] | 24% / 25% |  |
| strongest strike | touch | sessions left | 21-40 | 8,411 | -3.7pp [-7.5pp, +0.1pp] | 25% / 29% |  |
| strongest strike | next | sessions left | 21-40 | 8,411 | -0.001 [-0.027, +0.022] | 25% / 29% |  |
| strongest strike | touch | gap (expected moves) | 0.1-0.5 | 2,736 | -3.2pp [-8.9pp, +2.2pp] | 73% / 76% |  |
| strongest strike | next | gap (expected moves) | 0.1-0.5 | 2,736 | -0.004 [-0.045, +0.037] | 73% / 76% |  |
| strongest strike | touch | gap (expected moves) | 0.5-1 | 3,128 | -8.4pp [-15.5pp, -0.1pp] | 38% / 47% |  |
| strongest strike | next | gap (expected moves) | 0.5-1 | 3,128 | +0.007 [-0.027, +0.041] | 38% / 47% |  |
| strongest strike | touch | gap (expected moves) | 1-2 | 4,356 | +2.5pp [-2.1pp, +7.4pp] | 17% / 15% |  |
| strongest strike | next | gap (expected moves) | 1-2 | 4,356 | +0.008 [-0.025, +0.040] | 17% / 15% |  |
| strongest strike | touch | gap (expected moves) | >2 | 6,995 | -0.3pp [-1.2pp, +0.4pp] | 1% / 1% |  |
| strongest strike | next | gap (expected moves) | >2 | 6,995 | +0.013 [-0.017, +0.046] | 1% / 1% |  |
| strongest strike | touch | instrument | AUDUSD | 2,557 | +0.4pp [-4.5pp, +5.7pp] | 21% / 21% |  |
| strongest strike | next | instrument | AUDUSD | 2,557 | +0.034 [-0.006, +0.078] | 21% / 21% |  |
| strongest strike | touch | instrument | EURUSD | 2,581 | -2.9pp [-8.9pp, +4.0pp] | 29% / 32% |  |
| strongest strike | next | instrument | EURUSD | 2,581 | +0.031 [-0.006, +0.074] | 29% / 32% |  |
| strongest strike | touch | instrument | GBPUSD | 2,621 | -2.5pp [-9.4pp, +5.5pp] | 25% / 27% |  |
| strongest strike | next | instrument | GBPUSD | 2,621 | -0.001 [-0.044, +0.046] | 25% / 27% |  |
| strongest strike | touch | instrument | NAS100 | 847 | -5.0pp [-14.1pp, +7.3pp] | 25% / 29% |  |
| strongest strike | next | instrument | NAS100 | 847 | -0.014 [-0.086, +0.054] | 25% / 29% |  |
| strongest strike | touch | instrument | SPX500 | 871 | +6.6pp [-8.4pp, +22.7pp] | 23% / 17% |  |
| strongest strike | next | instrument | SPX500 | 871 | +0.060 [-0.025, +0.137] | 23% / 17% |  |
| strongest strike | touch | instrument | USDCAD | 2,652 | -4.8pp [-10.9pp, +1.8pp] | 15% / 19% |  |
| strongest strike | next | instrument | USDCAD | 2,652 | -0.004 [-0.055, +0.046] | 15% / 19% |  |
| strongest strike | touch | instrument | USDCHF | 2,436 | +0.4pp [-7.5pp, +8.3pp] | 27% / 28% |  |
| strongest strike | next | instrument | USDCHF | 2,436 | -0.006 [-0.053, +0.037] | 27% / 28% |  |
| strongest strike | touch | instrument | USDJPY | 2,650 | +1.6pp [-4.3pp, +7.0pp] | 23% / 23% |  |
| strongest strike | next | instrument | USDJPY | 2,650 | +0.012 [-0.025, +0.051] | 23% / 23% |  |
| strongest strike | touch | group | FX | 15,497 | -1.7pp [-4.7pp, +1.3pp] | 23% / 25% |  |
| strongest strike | next | group | FX | 15,497 | +0.009 [-0.010, +0.028] | 23% / 25% |  |
| strongest strike | touch | group | indices | 1,718 | -0.7pp [-10.0pp, +8.9pp] | 24% / 23% |  |
| strongest strike | next | group | indices | 1,718 | +0.011 [-0.038, +0.057] | 24% / 23% |  |
| max pain | touch | sessions left | 1-2 | 897 | +2.6pp [-1.6pp, +7.2pp] | 21% / 19% |  |
| max pain | next | sessions left | 1-2 | 897 | +0.126 [+0.007, +0.243] | 21% / 19% |  |
| max pain | touch | sessions left | 3-5 | 1,285 | +2.9pp [-2.0pp, +8.2pp] | 29% / 27% |  |
| max pain | next | sessions left | 3-5 | 1,285 | +0.072 [+0.003, +0.144] | 29% / 27% |  |
| max pain | touch | sessions left | 6-10 | 2,130 | -1.9pp [-7.0pp, +3.8pp] | 33% / 35% |  |
| max pain | next | sessions left | 6-10 | 2,130 | -0.015 [-0.067, +0.041] | 33% / 35% |  |
| max pain | touch | sessions left | 11-20 | 4,248 | -7.5pp [-13.4pp, -1.9pp] | 38% / 46% |  |
| max pain | next | sessions left | 11-20 | 4,248 | -0.021 [-0.066, +0.019] | 38% / 46% |  |
| max pain | touch | sessions left | 21-40 | 7,935 | -2.3pp [-8.8pp, +4.4pp] | 49% / 52% |  |
| max pain | next | sessions left | 21-40 | 7,935 | +0.007 [-0.030, +0.037] | 49% / 52% |  |
| max pain | touch | gap (expected moves) | 0.1-0.5 | 5,405 | -3.3pp [-7.6pp, +0.8pp] | 73% / 77% |  |
| max pain | next | gap (expected moves) | 0.1-0.5 | 5,405 | -0.008 [-0.036, +0.022] | 73% / 77% |  |
| max pain | touch | gap (expected moves) | 0.5-1 | 4,946 | -7.2pp [-16.2pp, +0.8pp] | 42% / 49% |  |
| max pain | next | gap (expected moves) | 0.5-1 | 4,946 | -0.018 [-0.050, +0.017] | 42% / 49% |  |
| max pain | touch | gap (expected moves) | 1-2 | 4,106 | +0.9pp [-4.2pp, +5.9pp] | 18% / 17% |  |
| max pain | next | gap (expected moves) | 1-2 | 4,106 | +0.021 [-0.027, +0.068] | 18% / 17% |  |
| max pain | touch | gap (expected moves) | >2 | 2,038 | +0.4pp [-1.1pp, +1.9pp] | 2% / 2% |  |
| max pain | next | gap (expected moves) | >2 | 2,038 | +0.091 [+0.021, +0.169] | 2% / 2% |  |
| max pain | touch | instrument | AUDUSD | 2,364 | +5.7pp [-1.6pp, +13.3pp] | 54% / 49% |  |
| max pain | next | instrument | AUDUSD | 2,364 | +0.041 [-0.002, +0.094] | 54% / 49% |  |
| max pain | touch | instrument | EURUSD | 2,560 | -7.0pp [-16.2pp, +2.1pp] | 40% / 47% |  |
| max pain | next | instrument | EURUSD | 2,560 | -0.001 [-0.046, +0.048] | 40% / 47% |  |
| max pain | touch | instrument | GBPUSD | 2,504 | -4.0pp [-12.5pp, +4.8pp] | 41% / 44% |  |
| max pain | next | instrument | GBPUSD | 2,504 | +0.012 [-0.034, +0.061] | 41% / 44% |  |
| max pain | touch | instrument | NAS100 | 824 | -6.4pp [-19.3pp, +8.5pp] | 35% / 43% |  |
| max pain | next | instrument | NAS100 | 824 | +0.020 [-0.040, +0.085] | 35% / 43% |  |
| max pain | touch | instrument | SPX500 | 858 | -6.0pp [-18.1pp, +7.3pp] | 28% / 34% |  |
| max pain | next | instrument | SPX500 | 858 | -0.004 [-0.077, +0.078] | 28% / 34% |  |
| max pain | touch | instrument | USDCAD | 2,503 | -7.7pp [-14.9pp, +0.5pp] | 42% / 50% |  |
| max pain | next | instrument | USDCAD | 2,503 | +0.004 [-0.034, +0.049] | 42% / 50% |  |
| max pain | touch | instrument | USDCHF | 2,356 | +7.3pp [-0.2pp, +15.0pp] | 41% / 34% |  |
| max pain | next | instrument | USDCHF | 2,356 | +0.037 [-0.010, +0.084] | 41% / 34% |  |
| max pain | touch | instrument | USDJPY | 2,526 | -4.8pp [-13.1pp, +4.6pp] | 37% / 45% |  |
| max pain | next | instrument | USDJPY | 2,526 | -0.016 [-0.062, +0.036] | 37% / 45% |  |
| max pain | touch | group | FX | 14,813 | -2.5pp [-7.1pp, +2.0pp] | 42% / 45% |  |
| max pain | next | group | FX | 14,813 | +0.009 [-0.018, +0.036] | 42% / 45% |  |
| max pain | touch | group | indices | 1,682 | -5.7pp [-17.5pp, +6.7pp] | 31% / 38% |  |
| max pain | next | group | indices | 1,682 | +0.011 [-0.051, +0.076] | 31% / 38% |  |
| OI centre | touch | sessions left | 1-2 | 913 | -0.6pp [-3.9pp, +3.3pp] | 12% / 12% |  |
| OI centre | next | sessions left | 1-2 | 913 | +0.073 [-0.016, +0.177] | 12% / 12% |  |
| OI centre | touch | sessions left | 3-5 | 1,294 | +2.2pp [-2.0pp, +6.3pp] | 21% / 19% |  |
| OI centre | next | sessions left | 3-5 | 1,294 | +0.060 [-0.006, +0.123] | 21% / 19% |  |
| OI centre | touch | sessions left | 6-10 | 2,208 | -0.7pp [-5.1pp, +3.6pp] | 26% / 27% |  |
| OI centre | next | sessions left | 6-10 | 2,208 | -0.006 [-0.063, +0.048] | 26% / 27% |  |
| OI centre | touch | sessions left | 11-20 | 4,298 | -2.8pp [-7.7pp, +1.8pp] | 31% / 33% |  |
| OI centre | next | sessions left | 11-20 | 4,298 | -0.011 [-0.047, +0.032] | 31% / 33% |  |
| OI centre | touch | sessions left | 21-40 | 8,224 | -1.3pp [-7.1pp, +4.2pp] | 38% / 40% |  |
| OI centre | next | sessions left | 21-40 | 8,224 | +0.010 [-0.019, +0.040] | 38% / 40% |  |
| OI centre | touch | gap (expected moves) | 0.1-0.5 | 3,897 | -2.3pp [-6.3pp, +1.9pp] | 74% / 76% |  |
| OI centre | next | gap (expected moves) | 0.1-0.5 | 3,897 | -0.027 [-0.059, +0.005] | 74% / 76% |  |
| OI centre | touch | gap (expected moves) | 0.5-1 | 4,084 | -4.0pp [-12.7pp, +3.3pp] | 42% / 46% |  |
| OI centre | next | gap (expected moves) | 0.5-1 | 4,084 | +0.026 [-0.006, +0.056] | 42% / 46% |  |
| OI centre | touch | gap (expected moves) | 1-2 | 4,370 | +0.6pp [-4.7pp, +6.1pp] | 17% / 17% |  |
| OI centre | next | gap (expected moves) | 1-2 | 4,370 | +0.007 [-0.036, +0.053] | 17% / 17% |  |
| OI centre | touch | gap (expected moves) | >2 | 4,586 | +0.1pp [-1.3pp, +1.5pp] | 2% / 2% |  |
| OI centre | next | gap (expected moves) | >2 | 4,586 | +0.031 [-0.011, +0.075] | 2% / 2% |  |
| OI centre | touch | instrument | AUDUSD | 2,466 | +0.8pp [-5.2pp, +7.4pp] | 35% / 34% |  |
| OI centre | next | instrument | AUDUSD | 2,466 | +0.063 [+0.010, +0.111] | 35% / 34% |  |
| OI centre | touch | instrument | EURUSD | 2,559 | -6.3pp [-14.9pp, +2.3pp] | 37% / 43% |  |
| OI centre | next | instrument | EURUSD | 2,559 | +0.004 [-0.046, +0.058] | 37% / 43% |  |
| OI centre | touch | instrument | GBPUSD | 2,584 | -2.1pp [-10.9pp, +7.6pp] | 35% / 37% |  |
| OI centre | next | instrument | GBPUSD | 2,584 | +0.016 [-0.033, +0.067] | 35% / 37% |  |
| OI centre | touch | instrument | NAS100 | 850 | -3.1pp [-15.8pp, +11.8pp] | 28% / 32% |  |
| OI centre | next | instrument | NAS100 | 850 | +0.010 [-0.073, +0.093] | 28% / 32% |  |
| OI centre | touch | instrument | SPX500 | 879 | -4.1pp [-17.0pp, +9.5pp] | 19% / 15% |  |
| OI centre | next | instrument | SPX500 | 879 | +0.057 [-0.129, +0.227] | 19% / 15% |  |
| OI centre | touch | instrument | USDCAD | 2,620 | -4.0pp [-15.0pp, +8.7pp] | 23% / 25% |  |
| OI centre | next | instrument | USDCAD | 2,620 | -0.003 [-0.064, +0.056] | 23% / 25% |  |
| OI centre | touch | instrument | USDCHF | 2,394 | +3.3pp [-4.5pp, +12.3pp] | 37% / 35% |  |
| OI centre | next | instrument | USDCHF | 2,394 | +0.022 [-0.020, +0.070] | 37% / 35% |  |
| OI centre | touch | instrument | USDJPY | 2,585 | +3.4pp [-5.7pp, +14.1pp] | 31% / 33% |  |
| OI centre | next | instrument | USDJPY | 2,585 | -0.001 [-0.047, +0.050] | 31% / 33% |  |
| OI centre | touch | group | FX | 15,208 | -1.5pp [-5.4pp, +2.2pp] | 33% / 35% |  |
| OI centre | next | group | FX | 15,208 | +0.012 [-0.013, +0.035] | 33% / 35% |  |
| OI centre | touch | group | indices | 1,729 | -2.0pp [-11.5pp, +9.2pp] | 24% / 23% |  |
| OI centre | next | group | indices | 1,729 | +0.024 [-0.055, +0.105] | 24% / 23% |  |
