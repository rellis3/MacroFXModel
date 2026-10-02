# Combined continue and fade setups — results

Pre-registration: forge/COMBINED_SETUPS_PREREG.md. 7 instruments with CVOL and COT; net R per trade after spread.

| setup | trades | net R | 2016–22 | 2023–26 | instruments positive | PASS |
|---|---|---|---|---|---|---|
| CONTINUE: rich IV + against the crowd → follow | 11,218 | -0.001 | -0.014 | +0.017 | 4 of 7 | – |
| CONTINUE (break trades): rich IV + against the crowd | 1,060 | +0.125 | +0.033 | +0.264 | 6 of 7 | – |
| FADE: cheap IV + with the crowd → fade | 13,503 | -0.064 | -0.086 | -0.032 | 2 of 7 | – |
| FADE + exhaustion: … + after 17:00 + range used ≥ 0.8 | 2,573 | -0.054 | -0.042 | -0.072 | 1 of 7 | – |

Per instrument: CONTINUE: {'AUDUSD': 0.004, 'EURUSD': 0.031, 'GBPUSD': -0.027, 'GOLD': -0.016, 'USDCAD': -0.036, 'USDCHF': 0.016, 'USDJPY': 0.016} · CONTINUE (break trades) (break): {'AUDUSD': 0.104, 'EURUSD': 0.236, 'GBPUSD': 0.191, 'GOLD': -0.333, 'USDCAD': 0.628, 'USDCHF': 0.748, 'USDJPY': 0.034} · FADE: {'AUDUSD': -0.051, 'EURUSD': -0.101, 'GBPUSD': -0.06, 'GOLD': -0.086, 'USDCAD': 0.011, 'USDCHF': -0.088, 'USDJPY': 0.006} · FADE + exhaustion + exh: {'AUDUSD': 0.003, 'EURUSD': -0.105, 'GBPUSD': -0.069, 'GOLD': -0.038, 'USDCAD': -0.03, 'USDCHF': -0.069, 'USDJPY': -0.002}

## Do the filters stack? (each filter alone, for reference)

| reference | trades | net R | 2016–22 | 2023–26 |
|---|---|---|---|---|
| follow, all passes | 219,377 | -0.041 | -0.043 | -0.036 |
| follow, rich IV only | 57,106 | -0.017 | -0.017 | -0.017 |
| follow, against the crowd only | 45,480 | -0.037 | -0.049 | -0.015 |
| break trades, all | 20,355 | -0.054 | -0.033 | -0.095 |
| break trades, rich IV only | 5,591 | +0.119 | +0.099 | +0.161 |
| break trades, against the crowd only | 4,198 | +0.032 | -0.016 | +0.119 |
| fade, all passes | 219,377 | -0.049 | -0.047 | -0.053 |
| fade, cheap IV only | 69,629 | -0.042 | -0.046 | -0.036 |
| fade, with the crowd only | 43,162 | -0.055 | -0.059 | -0.048 |
| fade, after 17:00 + used ≥ 0.8 only | 42,823 | -0.038 | -0.034 | -0.049 |

BH 10% over 4 setups: 0 survive.

## Reading
- **No fade setup works, even with every fade-leaning signal stacked** (cheap IV + with the crowd −0.064R; adding late
  exhaustion −0.054R; 1–2 of 7 instruments positive). Exhaustion stops price; nothing here makes it come back.
- **COT does not stack on rich IV.** Break trades with rich IV alone make +0.119R; adding "against the crowd" gives
  +0.125R on a fifth of the trades — the same edge, less sample, so it misses the significance bar. The plain follow
  trade reaches break-even (−0.001R) with both filters, but 2016–22 is negative.
- Rich IV ÷ RV remains the one signal that carries a trade; it goes into the paper record alone.
