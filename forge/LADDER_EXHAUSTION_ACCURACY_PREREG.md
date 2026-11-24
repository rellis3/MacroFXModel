# ladder-exhaustion-accuracy: whose median lines land nearer the day's actual high-low range and close?

**Pre-registered 2026-11-23, before this metric was computed for any arm.** (QLIKE and hit rates for the same arms
were already seen in `ladder-wide-race` / `ladder-jordan-recipe`.)

| | |
|---|---|
| ID / ledger ids | `ladder-exhaustion-accuracy` |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-exhaustion-accuracy` |
| Source | Owner 2026-11-23: the purpose is exhaustion, not 50% calibration. "A good forecaster is one that predicts the high and low correctly and the close for the day correctly; you want the part that forecasts the high and low correctly for sure." Jordan's (a C.OG group member) lines are HL, Close+ and Close− |
| Instruments | Futures NQ, GC, 6E, 6J (as `ladder-jordan-recipe`) |
| Window | scored 2020 → **2026-08-21** |
| Seed | `20261123`. B = 2000, 63-session blocks |
| Scripts | `scripts/ladder-exhaustion-accuracy/` → `analysis/output/ladder-exhaustion-accuracy/` |

## Metric

The median (p50) line is the point forecast.
- **HL error** = |HL line − actual HL| in % of the open. This equals the distance between the projected extreme
  (first extreme ± HL line) and the day's actual other extreme.
- **Close error** = |OC line − |actual OC|| in % of the open. Neither side forecasts direction, and Close+ and Close−
  are the same size in both recipes, so the line used is the one on the side the day closed.

## Arms

- **OURS:** HL = the walk-forward QLIKE per-line pick (old field, as on the site) at p50; OC = walk-forward QLIKE pick
  for OC from the same field, at p50 (its ladder line).
- **JORDAN (as published):** σ = 3-day ATR ÷ 1.596; HL = 1.572 σ, Close = 0.6745 σ.
- **BANK (descriptive):** the same with EMA of TR α 0.15.

## Hypothesis

Δ = Σ error(JORDAN) / Σ error(OURS) − 1, separately for HL and Close, mean over the 4 instruments, 90% block-bootstrap
CI, all years and each half (2020–22, 2023–26). Per line: **Jordan better** if CI upper < 0 in all and both halves;
**ours better** if CI lower > 0 in all and both halves; otherwise no clear difference. Verdict words for banking:
VALIDATED (Jordan better on HL), NULL (CI lower > −0.5% on HL, i.e. Jordan not better), UNDERPOWERED otherwise. Close
reported with the same bars, no separate verdict.

**Descriptive:** median absolute error, % of days the line lands within ±10% / ±20% of the actual, by instrument; the
same split for days after a big day (prior day's HL above its 80th percentile of the prior year) and other days.

## Amendments
