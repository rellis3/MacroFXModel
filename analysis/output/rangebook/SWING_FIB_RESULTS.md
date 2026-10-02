# Swing-based fib retracements at the vol lines — results

Pre-registration: forge/SWING_FIB_PREREG.md (e0086de). 517,287 passes, 16 FX/gold. H1 fractal swings, last impulse, retracement within 0.05σ of the touched vol line; real − placebo (levels shifted 0.15–0.5σ) within-cell continue difference, day-bootstrap 95% CI.

| level | at the line | real − placebo [95% CI] | 2016–22 | 2023–26 | REAL? | fade R at the line (halves) | follow R at the line (halves) |
|---|---|---|---|---|---|---|---|
| golden pocket 0.618–0.65 | 2.9% | +0.9pp [-1.0pp, +2.9pp] | +2.3pp | -1.6pp | no | -0.078 (-0.099 / -0.037) | -0.048 (-0.034 / -0.077) |
| 0.786 | 2.3% | +0.5pp [-1.6pp, +2.8pp] | +1.5pp | -1.2pp | no | -0.060 (-0.078 / -0.024) | -0.059 (-0.046 / -0.086) |
| 0.886 | 2.5% | -0.1pp [-2.5pp, +2.2pp] | +0.9pp | -2.1pp | no | -0.067 (-0.087 / -0.026) | -0.055 (-0.039 / -0.087) |

T2: BH 10% over 6 rows, 0 survive; positive in both halves too: none.

## Reading
A swing-based fib level (golden pocket, 0.786 or 0.886 of the last H1 impulse) sitting on a vol line changes nothing that a
copy of the level shifted 0.15–0.5σ does not also change: every real − placebo CI spans 0 and the halves disagree in sign.
Fades at these confluences lose −0.06 to −0.08R, follows −0.05 to −0.06R. Same answer as the previous-day-range golden pocket
and the 1.272/1.618 extensions. The repo's own swing-fib system (Fib Atlas) is consistent with this: honest backtest Sharpe
0.74, live 39.6% win vs 85.7% in the old backtest.
