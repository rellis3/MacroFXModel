# v3-p50-follow-pre2020: results

- **Prereg:** `forge/V3_P50_FOLLOW_PRE2020_PREREG.md`, pushed in f62b1702 before the run.
- **Script:** `scripts/v3-p50-follow-pre2020/run.py` (shared loaders in `common.py`), seed 20261102. Run once on 2026-11-02.

## Verdict: NULL

The exploratory find does not replicate on 2016–20. "Follow the first touch of the v3 p50 line, hold to 21:55" is no better than lines of the same size that carry no forecast, and no better than the forecast shuffled between days.

| | n | net % per trade | 95% CI |
|---|---|---|---|
| **Follow the v3 p50 touch** | 751 | **−0.002** | [−0.083, +0.094] |
| Up-breaks (long) | 400 | +0.069 | [−0.019, +0.175] |
| Down-breaks (short) | 351 | −0.083 | [−0.192, +0.045] |
| Same rule, ATR lines of the same size | 736 | −0.020 | [−0.090, +0.062] |
| ATR lines, up-breaks / down-breaks | 385 / 351 | +0.075 / −0.125 | |
| Same rule, trailing-quantile lines | 751 | +0.029 | [−0.050, +0.131] |
| v3 − ATR lines | | +0.018 | [−0.052, +0.105] |
| v3 − trailing lines | | −0.031 | [−0.088, +0.024] |
| Shuffled-forecast placebo (1,000) | | mean +0.007, p95 +0.054 | **real at the 37.5th percentile** (needed ≥ 95th) |

- **Gate:** G1 (placebo ≥ 95th) fails and G2 (beats ATR and trailing) fails. Placebo percentile < 80 → **NULL** by the frozen rule.
- **By year:** 2017 +0.001, 2018 −0.066, 2019 −0.011, 2020 (to Aug) +0.109.
- **The up/down split is drift.** Up-breaks make about the same on ATR lines (+0.075) as on v3 lines (+0.069). Down-breaks lose on both.
- **Mirror (fade):** −0.011%.
- **Window note:** the trailing-quantile control needs 250 prior sessions of history (NQ.csv starts 2016-03-29), so the scored window began 2017-03-16, not 2016-09-12: 855 sessions, touched on 87.8%. No same-bar double touches.

## What it means

- The discovery result (`nq-v3-lines-explore`, 2020–26) was a selection effect: the best of about 30 looks.
- Following v3 p50 breaks makes money only through Nasdaq's up-drift, which any line of that size captures equally.
- This matches `rule-a-pre2020` (NULL on the same years) and day-recon M3/M7.
- No forward record is proposed for this rule.
