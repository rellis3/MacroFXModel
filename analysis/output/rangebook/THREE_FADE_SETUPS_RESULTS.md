# Three fade setups — results

Pre-registration: forge/THREE_FADE_SETUPS_PREREG.md. Rejection = back inside the line by > 0.1σ 15 min after the touch; fade entered there, target the line behind, stop the next line out. R net of spread.

| setup | line | set | fades | win | net R | 2016–22 | 2023–26 |
|---|---|---|---|---|---|---|---|
| A counter-trend exhaustion | p90 | FX | 119 | 65% | -0.040 | +0.044 | -0.183 |
| A counter-trend exhaustion | p90 | IDX | 47 | 68% | -0.077 | -0.095 | -0.046 |
| A counter-trend exhaustion — control: with the trend | p90 | FX | 4,627 | 47% | -0.048 | -0.064 | -0.012 |
| A counter-trend exhaustion — control: p50 counter-trend | p50 | FX | 2,693 | 51% | -0.045 | -0.044 | -0.045 |
| A counter-trend exhaustion | p75 | FX | 369 | 67% | -0.066 | -0.078 | -0.043 |
| A counter-trend exhaustion | p75 | IDX | 191 | 74% | +0.018 | -0.044 | +0.117 |
| A counter-trend exhaustion — control: with the trend | p75 | FX | 9,212 | 55% | -0.054 | -0.056 | -0.051 |
| A counter-trend exhaustion — control: p50 counter-trend | p50 | FX | 2,693 | 51% | -0.045 | -0.044 | -0.045 |
| B London close 16:00–17:00 | p90 | FX | 535 | 39% | -0.035 | -0.043 | -0.010 |
| B London close 16:00–17:00 | p90 | IDX | 165 | 50% | -0.036 | +0.055 | -0.159 |
| B London close 16:00–17:00 — control: 13:00–16:00 | p90 | FX | 2,324 | 54% | -0.041 | -0.049 | -0.026 |
| B London close 16:00–17:00 | p75 | FX | 1,035 | 49% | -0.039 | -0.039 | -0.040 |
| B London close 16:00–17:00 | p75 | IDX | 330 | 59% | -0.002 | +0.048 | -0.090 |
| B London close 16:00–17:00 — control: 13:00–16:00 | p75 | FX | 5,091 | 61% | -0.040 | -0.048 | -0.023 |
| C cheap vol | p90 | FX | 643 | 43% | -0.029 | -0.048 | +0.004 |
| C cheap vol | p90 | IDX | 302 | 49% | -0.043 | -0.012 | -0.093 |
| C cheap vol — control: rich vol | p90 | FX | 772 | 48% | -0.066 | -0.034 | -0.145 |
| C cheap vol | p75 | FX | 1,606 | 55% | -0.055 | -0.065 | -0.041 |
| C cheap vol | p75 | IDX | 683 | 59% | +0.021 | +0.017 | +0.026 |
| C cheap vol — control: rich vol | p75 | FX | 1,548 | 58% | -0.071 | -0.053 | -0.112 |

BH 10% over 6 FX rows: 0 survive.

**Verdicts:** A counter-trend exhaustion p90: fail; A counter-trend exhaustion p75: fail; B London close 16:00–17:00 p90: fail; B London close 16:00–17:00 p75: fail; C cheap vol p90: fail; C cheap vol p75: fail

## Reading
- **All three fail.** Win rates look attractive (A at p90: 65–68% of fades reach the line behind) because after a rejection the
  line behind is CLOSER than the next line out: the fade needs ~60–65% to break even, so a 65% win rate is a push before spread
  and a loss after it. That is the same geometry trap as every fade tested before.
- A (counter-trend exhaustion): −0.040R on FX (n=119; +0.044 / −0.183 by half), −0.077R on indices. Not better than fading a
  with-trend touch (−0.048R) or a p50 touch (−0.045R).
- B (London close, 16:00–17:00 at p90): −0.035R FX, −0.036R indices; no better than 13:00–16:00.
- C (cheap vol at p90): −0.029R FX, −0.043R indices; the rich-vol control is worse (−0.066R), so cheap vol does help fades — by
  about 0.04R, from a loss to a smaller loss. The only cell above zero (indices, p75, +0.021R both halves) does not survive BH.
- CVD divergence (the framework's "most important tool") cannot be tested on CFD data; it needs futures trades with aggressor side.
