# gold-line-vwap-stretch-filter: results

Prereg `forge/GOLD_LINE_VWAP_STRETCH_FILTER_PREREG.md` (pushed 1f0fb6d5 before the run). Script
`scripts/gold-line-vwap-stretch-filter/run.py`, log `analysis/output/gold-line-vwap-stretch-filter_log.txt`.
Seed 20261128. The base system is unchanged; the filter is a switch.

**Verdict: UNDERPOWERED** (all three gates pass; the strongest verdict available, because the filter was found on this
data). Confirmation: the lockbox (after 2026-08-21), once, with the final rule set, or a forward record.

## Primary: the tested system (same-candle retouch fills), base vs base + "skip fills < 2σ_v from VWAP"

| | Base | With the filter |
|---|---|---|
| IS 2021–22 R a trade (n, total) | −0.085 (333, −28R) | **−0.001** (297, −0R) |
| OOS 2023 → Aug 2026 R a trade (n, total) | +0.302 (749, +226R) | **+0.377** (629, +237R) |
| OOS without the best 1% | +104R | +127R |
| OOS fills skipped | | 16% |
| OOS difference, 90% CI (day blocks) | | **+0.075 [+0.031, +0.116]** |
| Random-skip placebo (skip 16% at random, 200 runs, system re-simulated) | | mean −0.001, p95 +0.067 |

Gates: better in both periods ✓; keeps ≥ 90% of OOS total R (it rises) ✓; beats the placebo's 95th percentile ✓.

| Year | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|
| Base | −0.036 | −0.142 | +0.391 | +0.184 | +0.374 | +0.267 |
| With the filter | **+0.033** | −0.040 | +0.452 | +0.250 | +0.445 | +0.377 |

The filter improves every year.

## Descriptive

- **Thresholds:** 1.5σ skips 4% and changes little (+0.313 OOS); 2.5σ skips 34%, +0.379 OOS but total falls to +188R
  and IS is −0.045. 2σ is the best balance; it was the pre-declared threshold.
- **Same-candle retouch ignored:** the filter helps in both periods (IS −0.188 → −0.097, OOS +0.032 → +0.061) but does
  not beat random skipping (+0.029 vs p95 +0.069). The base there is near breakeven, so the filter alone doesn't make
  it a system.

## Reading

- Fading less than 2σ from VWAP is a consistent loser: removing those fills lifts every year and turns 2021–22 from
  −28R to flat.
- It does not fix the bigger caveat: the edge still sits mostly in same-minute rejections that M1 bars cannot verify
  (`gold-line-system-jordan` A1). The tick-data check of the retouch stays first.
- On the backtest page: the "VWAP filter" switch, available with every entry-rule setting.
