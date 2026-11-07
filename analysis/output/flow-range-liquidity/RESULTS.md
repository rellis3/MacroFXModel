# flow-range-liquidity — results

Prereg: `forge/FLOW_RANGE_LIQUIDITY_PREREG.md` (registered 2026-11-07, no amendment: every market had over 500 checkpoints). Run 2026-11-07, seed 20261107, B = 2000.
Branch `main`. Ledger ids: `flow-range-flow`, `flow-range-impact`.

## Verdict: CONTEXT, no use

No cell passed the gate. Neither flow nor price impact improves a forecast of range by the 1% the prereg asked for: the best is 0.5%, and in all four cells the interval rules out 1%. Two cells are small and clear of zero (`CONTEXT`), and two are not (`NULL`). There is no case for a size or stand-aside input from either.

## Scored cells

Each is the model's squared error over the baseline's, on later data than it was fitted on. Below 1 is better; 0.99 is the bar. The baseline (recent range, realised volatility, volume) already explains 33% of next-hour and 23% of rest-of-session log range out of sample.

| Cell | n | Ratio | 95% range | Holm p | Folds better | 6E / 6J / NQ | Below all placebos | Cell verdict |
|---|---|---|---|---|---|---|---|---|
| M1 flow, next hour | 17,035 | 0.9978 | 0.9965 to 0.9993 | 0.008 | 4 of 4 | 0.999 / 0.997 / 0.996 | Yes (0.9982) | CONTEXT |
| M1 flow, rest of session | 17,091 | 0.9978 | 0.9947 to 1.0005 | 0.107 | 3 of 4 | 0.999 / 0.997 / 0.995 | Yes (0.9985) | NULL |
| M2 impact, next hour | 17,035 | 0.9980 | 0.9947 to 1.0025 | 0.232 | 3 of 4 | 1.002 / 0.994 / 1.017 | Yes (0.9987) | NULL |
| M2 impact, rest of session | 17,091 | 0.9948 | 0.9902 to 0.9997 | 0.057 | 4 of 4 | 0.995 / 0.992 / 1.030 | No (0.9937) | CONTEXT |

## Reading it

- **M1 flow, next hour:** the steadiest result. It improves in every fold and every market, and beats all 20 placebos. It is about 0.2%, a fifth of the bar. This fits Andersen and Bondarenko on VPIN: little is left once realised volatility is in.
- **M2 impact, rest of session:** the largest number, but it is worse on NQ (1.030) and inside its placebo range, so it may be nothing.
- **Added alone, next hour:** one-sided flow 1.0000, persistence 1.0000, impact 1.0001, Amihud 0.9979. Flow needs its two inputs together to show anything, which is more reason to treat it as very small.

## Descriptive: what a size rule would see

Realised range against the base forecast, by quintile of each input, lowest to highest. A useful input would climb from left to right.

| Input, next hour | 6E | 6J | NQ |
|---|---|---|---|
| One-sided flow | 1.09, 1.09, 1.10, 1.10, 1.10 | 1.13, 1.11, 1.11, 1.14, 1.08 | 1.11, 1.14, 1.07, 1.05, 1.09 |
| Persistence | 1.09, 1.08, 1.09, 1.11, 1.10 | 1.12, 1.09, 1.12, 1.12, 1.12 | 1.10, 1.12, 1.11, 1.05, 1.08 |
| Impact | 1.13, 1.10, 1.09, 1.08, 1.06 | 1.11, 1.12, 1.10, 1.10, 1.14 | 1.03, 1.10, 1.06, 1.16, 1.11 |
| Amihud | 1.12, 1.09, 1.11, 1.08, 1.07 | 1.16, 1.13, 1.12, 1.13, 1.04 | 1.06, 1.03, 1.08, 1.15, 1.14 |

Mostly flat, and on 6E and 6J impact leans the wrong way for a thin-market reading. NQ does climb on impact and Amihud, on about 860 checkpoints and with a worse overall ratio, so that is a thought for later and not a finding. The top fifth of each input holds 18% to 21% of the largest 10% of range surprises, about what chance gives.

## Deviations from the prereg

None.

## What this changes

- Neither input goes into the decision engine or any size rule. Volume and recent realised volatility already carry this information.
- Close this line for 6E, 6J and NQ at these horizons, with trades-only stand-ins. It does not test real book depth, which the recorder collects from 2026-11-09.
- What remains on the agenda: the execution audit (S4), once the recorder has data.
