# round-break-follow: results

Prereg: `forge/ROUND_BREAK_FOLLOW_PREREG.md` (committed in `261789ff`, 2026-11-07, before the confirmation window was read). Run 2026-11-07, seed 20261107, B = 2000. Ledger id `round-break-follow`.

## Verdict: CONTEXT

The location effect replicates on untouched data and the trade does not pay. A stop order through a round number in FX majors does better than the same order at an arbitrary price, and still loses money on real bid/ask fills. The gate needed C3 above zero; it is -0.031 R with its whole interval below zero and 0 of 4 years positive.

## Scored cells, confirmation 2016-10-21 to 2020-08-20, FX majors

| Cell | n round | Round | Arbitrary | Estimate [95%] | Holm p |
|---|---|---|---|---|---|
| C1 P(reject), round minus arbitrary | 8,234 touches | 0.5195 | 0.5445 | -0.0250 [-0.0386, -0.0111] | 0.001 |
| C2 net R, round minus arbitrary | 8,234 | -0.0310 | -0.0501 | +0.0191 [+0.0095, +0.0285] | 0.000 |
| C3 net R at round numbers | 8,234 | | | -0.0310 [-0.0447, -0.0178] | 1.000 |

Selected on discovery: stop 1σ, target 2σ, 240-minute exit. By year: {'2016': 0.0321, '2017': -0.023, '2018': -0.0496, '2019': -0.0383, '2020': -0.0262}. An extra half spread: -0.0478 R.

## Discovery, 2020-08-21 to 2026-08-20, in-sample after selection

All 24 variants lose net on real fills: best -0.021 R [-0.032, -0.011], worst -0.174 R. Round numbers beat arbitrary prices in all 24. Full table: `discovery.csv`.

## Why it cannot pay at this size

The edge over arbitrary prices is about 0.012-0.019σ at every stop size, so it does not grow with the stop. At a 1σ stop, an arbitrary-price order costs about 0.04-0.05σ. The edge covers about a third of that.

## Deviations from the prereg

The fade mirror was not run as a real fill. Its stated purpose is covered by C1, and a real fade needs its own limit-fill rule. By-instrument results are descriptive; USDJPY is the only pair above zero (+0.008 R, n = 1,088).

## What this changes

Nothing live. Round numbers in FX majors are a real location: first touches break more often than at arbitrary prices, in two separate windows. It is a conditioner for a stop-order layer, not a trade. The prereg allows marking it on the chart as "breaks run further here".

## Proof checks (forge/verdict_gate.py, `checks.json`)

Passed. Prices moved in the raw tape were recovered through the real fills: +0.03σ gave +0.030 R and +0.20σ gave +0.201 R. The placebo grid centres on zero. Same-session rejection gap -3.17pp [-4.94, -1.40].
