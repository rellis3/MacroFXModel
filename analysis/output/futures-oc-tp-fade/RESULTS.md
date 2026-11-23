# futures-oc-tp-fade — results

Prereg: `forge/FUTURES_OC_TP_FADE_PREREG.md` (2026-11-22, A1 pre-results). Seed 20261122, B = 2000, 63-session blocks.
Script `scripts/futures-oc-tp-fade/score.py`; numbers `results.json`; log `report.txt`; trades `trades.parquet` (local).
Futures NQ / GC / 6E / 6J (NT8 M1), sessions 2020-01 → 2026-08-21. Lines: QLIKE per-line walk-forward ladder; take-profit
= OC p50 from the OC model chosen on QLIKE each year (NQ SHAR, GC V3, 6E HAR-CJ/R15/SHAR, 6J HAR-CJ/SHAR/R5).
Costs $5 round trip + 1 tick on stop and time exits.

Controls passed: mechanics −1.9pp vs driftless (limit 3); planted 0.25σ edge detected at +0.40R [+0.38, +0.42].

| Cell | Trades | Net R | 2020–22 / 2023–26 | Gross R | TP first vs driftless (barrier trades) | Verdict | Weight |
|---|---|---|---|---|---|---|---|
| Fade p75 → OC p50 (primary) | 3,377 | **−0.065 [−0.082, −0.043]** | −0.077 / −0.054 | −0.047 | 55.1% vs 56.9% (−1.8pp [−3.1, −0.3]) | NULL | Against |
| Fade p90 → OC p50 | 1,364 | **−0.100 [−0.144, −0.064]** | −0.083 / −0.114 | −0.076 | 23.3% vs 35.1% (−11.8pp [−14.7, −9.4]) | NULL | Against |

Exits p75: TP 39%, stop 32%, 22:00 29%. p90: TP 11%, stop 37%, 22:00 52%.

## Decomposition (p75)

- Per instrument net: 6E −0.017 (gross +0.009), GC −0.054, NQ −0.067, 6J −0.122.
- Per side: OH −0.073, OL −0.056.
- Per London bucket of the entry: 00–07 −0.003 (gross +0.014, n 303), 07–12 −0.098, 12–16 −0.066, 16–22 −0.059.
- OC take-profit vs placebo distances: −0.013R vs 0.7×, +0.011R vs 1.3×: the OC level is no better a target than nearby distances.
- No part beats its benchmark in both halves.

## Reading

- Fading the stretched OH/OL line and targeting the OC p50 loses on every futures market after costs, and loses before
  costs too: price reaches the OC target slightly less often than a random walk would.
- At p90 the shortfall is large: once price reaches the p90 line it reaches the OC p50 target 12pp less often than a
  random walk — moves that get that far tend to keep going. That is a continuation effect, the opposite of a fade; a
  candidate for its own prereg (follow the p90 break), not a result.
