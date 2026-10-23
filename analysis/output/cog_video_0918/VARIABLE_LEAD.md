# COG-VARIABLE-LEAD results

Registered in `forge/COG_VARIABLE_LEAD_PREREG.md` (566bdc90) before any of this was computed. Hourly non-overlapping changes; video week excluded; leads in hours (k = 0 is context only).

## S1: does the lead profile persist?

37 usable 14-day blocks, 21 adjacent pairs (15 Explore, 6 Confirm).
Mean profile correlation between adjacent blocks: Explore +0.133, Confirm +0.030, all +0.103; placebo (random distant block) mean -0.030, 95th percentile +0.119.
Same best lead in adjacent blocks: 9.5% (chance 12.5%).
**Registered pass: YES.**

## S2 / S3: does a factor predict which lead applies (out of sample)?

Fixed baseline: best single lead chosen on Explore = 6 h; Confirm corr +0.003 (n 3971).

| factor | level | lead k* chosen on Explore (h) | Explore corr (n) | Confirm corr (n) | one-sided p | BH-adj p | pass |
|---|---|---|---|---|---|---|---|
| session | Asia 22-07 | 3 | -0.116 (1621) | -0.044 (858) | 0.142 | 0.615 | NO |
| session | Europe 07-13 | 2 | -0.058 (2216) | +0.027 (1262) | 0.796 | 0.860 | NO |
| session | US 13-21 | 2 | +0.043 (2928) | +0.004 (1685) | 0.459 | 0.860 | NO |
| Nasdaq vol | low | 3 | -0.048 (2357) | +0.037 (373) | 0.860 | 0.860 | NO |
| Nasdaq vol | mid | 3 | +0.023 (2461) | -0.014 (1815) | 0.752 | 0.860 | NO |
| Nasdaq vol | high | 6 | +0.090 (2244) | +0.030 (1849) | 0.123 | 0.615 | NO |
| line vol | low | 2 | +0.078 (2411) | +0.047 (2680) | 0.027 | 0.351 | NO |
| line vol | mid | 2 | -0.052 (2376) | -0.012 (383) | 0.423 | 0.860 | NO |
| line vol | high | 6 | +0.080 (2300) | -0.008 (1053) | 0.587 | 0.860 | NO |
| leg pattern | only US moved | 4 | -0.081 (1498) | -0.017 (625) | 0.307 | 0.860 | NO |
| leg pattern | only euro moved | 1 | +0.098 (1163) | -0.028 (1082) | 0.844 | 0.860 | NO |
| leg pattern | both moved | 6 | -0.065 (2212) | +0.017 (913) | 0.686 | 0.860 | NO |
| leg pattern | neither moved | 3 | +0.065 (1503) | -0.000 (1144) | 0.491 | 0.860 | NO |

**Registered verdict: variable lead is predictable = NO** (0 of 13 levels pass).
Context only: same-hour (k = 0) correlation Explore +0.113, Confirm +0.297.

