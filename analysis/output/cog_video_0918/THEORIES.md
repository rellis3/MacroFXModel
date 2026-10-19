# COG-THEORIES results

Registered in `forge/COG_THEORIES_PREREG.md` (685451fc) before any of this was computed. Hourly non-overlapping bars, video week excluded from pooled statistics.
Bars: 11,740 (Explore 7,472, Confirm 4,268); both legs moved in this and the previous hour: 21.1% of bars.

## T3: time of day

D3 = corr(liquid 12-15h starts) - corr(quiet 01-04h starts). Explore -0.080 [-0.215, +0.051]; Confirm +0.040 [-0.091, +0.169] (one-sided p 0.283); all -0.042; placebo 95th pct +0.048, real all-sample at placebo percentile 9.
**Registered pass: NO.**

| UTC hour start | bars | share both legs moved | corr all | corr Explore | corr Confirm |
|---|---|---|---|---|---|
| 01 | 413 | 0% | +0.325 | +0.305 | +0.375 |
| 02 | 623 | 7% | +0.188 | +0.243 | +0.093 |
| 03 | 623 | 7% | +0.061 | -0.023 | +0.220 |
| 04 | 623 | 6% | +0.122 | +0.085 | +0.181 |
| 05 | 623 | 10% | +0.260 | +0.220 | +0.328 |
| 06 | 623 | 18% | +0.101 | +0.004 | +0.245 |
| 07 | 623 | 24% | +0.305 | +0.298 | +0.338 |
| 08 | 623 | 28% | +0.166 | +0.079 | +0.282 |
| 09 | 623 | 25% | +0.271 | +0.228 | +0.334 |
| 10 | 623 | 20% | +0.359 | +0.346 | +0.398 |
| 11 | 623 | 23% | +0.303 | +0.119 | +0.564 |
| 12 | 620 | 31% | +0.090 | -0.005 | +0.318 |
| 13 | 620 | 37% | +0.067 | +0.016 | +0.178 |
| 14 | 619 | 38% | +0.209 | +0.176 | +0.279 |
| 15 | 619 | 32% | +0.267 | +0.236 | +0.314 |
| 16 | 619 | 28% | +0.254 | +0.163 | +0.398 |
| 17 | 605 | 24% | +0.290 | +0.302 | +0.257 |
| 18 | 598 | 20% | -0.021 | -0.150 | +0.313 |
| 19 | 598 | 17% | +0.065 | -0.125 | +0.358 |
| 20 | 199 | 17% | +0.211 | +0.065 | +0.411 |

## T4: carried-forward legs

| subset | n explore | n confirm | lead corr Explore | Confirm | Explore p (2-sided) | Confirm p (1-sided) | pass |
|---|---|---|---|---|---|---|---|
| T4a lead(ALL) | 7472 | 4268 | -0.019 [-0.051, +0.016] | +0.013 [-0.023, +0.049] | 0.284 | 0.758 | NO |
| T4b lead(BOTH) | 1826 | 646 | -0.031 [-0.091, +0.038] | +0.045 [-0.037, +0.115] | 0.377 | 0.851 | NO |

T4c link uplift (corr when both legs moved - corr all bars): Explore +0.055, Confirm +0.102, all +0.054; placebo 95th pct +0.042. **Registered pass: YES.**
Same-hour link when both moved: Explore +0.167 (n 1826), Confirm +0.399 (n 646); all bars: Explore +0.113, Confirm +0.297.

## T5: selection base rate

Causal zig-zag turns on the line (theta = 1.0 x trailing RMS of 4-hour changes): 1935 confirmed turns with an outcome over 129 weeks (video week excluded). Followed = Nasdaq first touches +u in the turn direction within 8 bars.
Turns per week: median 14, mean 15.0. Followed per week: mean 7.74. Overall followed share 51.6%.
Weeks with at least 2 followed turns: real 99.2%; random-direction placebo 98.4% (central 95% 96.1% to 100.0%).
Video week (16-23 Sep): 9 turns, 8 followed; placebo for that many turns: mean 4.53, central 95% 2 to 7.
**Registered rule: selection explains the examples = NO** (real share inside the placebo range: True; video week inside: False).

