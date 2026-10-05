# LINE-TOUCH-REACH — results

Pre-registration: `forge/LINE_TOUCH_REACH_PREREG.md`.

**Verdict: CALIBRATED** — 20/22 eligible cells within ±5pp of the model's implied share.

## fx_gold

Train before 2022-05-30; test after.

| side | hours | from → to | touches | realised | model implied | ±5pp | overshoot past p75 (median / p75, as share of the p75→p90 gap) |
|---|---|---|---|---|---|---|---|
| dn | 01-07 | p50 → p75 | 105223 | 48% | 50% | ✓ |  |
| dn | 01-07 | p75 → p90 | 51013 | 41% | 40% | ✓ | 0.78 / 1.51 |
| dn | 08-14 | p50 → p75 | 62490 | 48% | 50% | ✓ |  |
| dn | 08-14 | p75 → p90 | 49828 | 40% | 40% | ✓ | 0.75 / 1.49 |
| dn | 15-21 | p50 → p75 | 0 |  |  | n<200 |  |
| dn | 15-21 | p75 → p90 | 12807 | 39% | 40% | ✓ | 0.76 / 1.47 |
| up | 01-07 | p50 → p75 | 108341 | 49% | 50% | ✓ |  |
| up | 01-07 | p75 → p90 | 53381 | 40% | 40% | ✓ | 0.77 / 1.49 |
| up | 08-14 | p50 → p75 | 60751 | 48% | 50% | ✓ |  |
| up | 08-14 | p75 → p90 | 52797 | 40% | 40% | ✓ | 0.76 / 1.47 |
| up | 15-21 | p50 → p75 | 0 |  |  | n<200 |  |
| up | 15-21 | p75 → p90 | 14286 | 38% | 40% | ✓ | 0.72 / 1.39 |

## indices

Train before 2022-06-15; test after.

| side | hours | from → to | touches | realised | model implied | ±5pp | overshoot past p75 (median / p75, as share of the p75→p90 gap) |
|---|---|---|---|---|---|---|---|
| dn | 01-07 | p50 → p75 | 22409 | 51% | 50% | ✓ |  |
| dn | 01-07 | p75 → p90 | 11463 | 37% | 40% | ✓ | 0.72 / 1.37 |
| dn | 08-14 | p50 → p75 | 19061 | 51% | 50% | ✓ |  |
| dn | 08-14 | p75 → p90 | 11555 | 36% | 40% | ✓ | 0.69 / 1.36 |
| dn | 15-21 | p50 → p75 | 1028 | 46% | 50% | ✓ |  |
| dn | 15-21 | p75 → p90 | 4609 | 33% | 40% | ✗ | 0.64 / 1.27 |
| up | 01-07 | p50 → p75 | 22483 | 55% | 50% | ✓ |  |
| up | 01-07 | p75 → p90 | 12274 | 47% | 40% | ✗ | 0.93 / 1.71 |
| up | 08-14 | p50 → p75 | 21087 | 54% | 50% | ✓ |  |
| up | 08-14 | p75 → p90 | 12816 | 44% | 40% | ✓ | 0.86 / 1.69 |
| up | 15-21 | p50 → p75 | 1845 | 50% | 50% | ✓ |  |
| up | 15-21 | p75 → p90 | 7215 | 42% | 40% | ✓ | 0.78 / 1.55 |
