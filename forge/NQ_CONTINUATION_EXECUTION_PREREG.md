# nq-continuation-execution — Does the NQ continuation seen at the forecast's fixed OH/OL levels survive real execution, costs and controls?

**Pre-registered 2026-10-29, before any execution result was computed.**

| | |
|---|---|
| ID / ledger id | `nq-continuation-execution` |
| Register row | `plans/RESEARCH_REGISTER.md` → `nq-continuation-execution` (milestone 4 of `day-reconstruction`) |
| Data | Milestone-2 archive day table `analysis/output/day-reconstruction/archive/NQ_days.parquet` (levels, σ scale, session window), OANDA NAS100 bid/ask M1 `data/m1_bidask_bin/nq.bin` (from 2016-10; cut at 2026-08-20). The lockbox (after 2026-08-21) is **not** read |
| Seed | `20261029` (random-entry draws, bootstrap) |
| Uncertainty | day-cluster Poisson bootstrap, B = 2000 (all trades of a day resampled together) |
| Scripts / outputs | `scripts/day-reconstruction/m4_nq_execution.py` → `analysis/output/day-reconstruction/m4/` |

## 1. Where the rule comes from (frozen from milestone 3, no new search)

Milestone 3 (`analysis/output/day-reconstruction/m3/REPORT.md`, `direction.json`) reported NQ continuation of +0.05 to
+0.07R gross at ±0.25σ. That figure is the **pooled cell "Fixed OH/OL, all rungs (p50, p75, p90), both directions,
±0.25σ"**: +0.069R [+0.032, +0.107], out-of-sample era, 2,668 first touches (same family by rung: p50 +0.060, p75
+0.065, p90 +0.122; by side: up +0.096, down +0.044, overlapping intervals).

**The finding does not single out a percentile or a direction.** Picking p90 or long-only would select the best
historical cut. The rule is therefore the pooled cell exactly as measured: **Fixed OH and OL, all three rungs, long at
OH levels and short at OL levels.** Projected and Close levels are excluded (the candidate does not depend on them).

**No unseen evaluation period exists.** Milestone 3 read both eras (2016-10 → 2020-08-20 and 2020-08-21 → 2026-08-20).
Every result below is **exploratory: a costed re-measurement on observations already used to choose the rule, not
independent confirmation.** Genuine out-of-sample evidence can only come from a forward record.

## 2. The rule (fixed before any execution result)

- **Session:** the archive's London 00:00–22:00 session for each day (`t_open`..`t_last`). Bid/ask bars inside that
  window only.
- **Levels:** the archive's own static level prices `lvl_OH_p50/p75/p90` (long side) and `lvl_OL_p50/p75/p90` (short
  side). Unchanged forecast.
- **Entry:** a resting stop order at each level from the session open.
  - **Long:** a buy stop at OH_x triggers on the first bar whose ask high ≥ the level. It fills at max(level, that
    bar's ask open) + slippage.
  - **Short:** a sell stop at OL_x triggers on the first bar whose bid low ≤ the level. It fills at min(level, bid
    open) − slippage.
  - At most one trade per level per day: up to 3 longs and 3 shorts a day, each its own 1R position. Overlap is
    reported.
- **Risk:** R = 0.25 × the day's σ scale (archive `scale` = open × σ_used). Stop = fill − R and target = fill + R for a
  long, mirrored for a short. 1:1.
- **Exits, long** (short mirrored on the ask):
  - **target:** a sell limit at the target, filled when the bid high > target, at the target, no slippage;
  - **stop:** a sell stop, triggered when the bid low ≤ the stop, filled at min(stop, bid open) − slippage;
  - **session close:** at the last bar's bid close − slippage.
- **Same-bar ambiguity, never resolved favourably:**
  - (a) on the fill bar, if that bar's adverse extreme reaches the stop, the stop is taken, because the extreme may
    come after the fill. A target on the fill bar is **not** credited.
  - (b) on any later bar where both stop and target are reached, the stop is taken.
  - Both counts, and the optimistic alternative (target taken), are reported.
- **Costs:**
  - **Base:** real bid/ask, slippage 1.0 index point on every stop or market fill (entry, stop, close), no commission
    (OANDA spread-only), no financing (flat at 22:00 London).
  - **Sensitivity:** slippage 0, 2 and 4 points, and an extra 2 points per round trip.
- **Gross:** the same simulation on mid prices ((bid + ask) / 2) with no slippage.

## 3. Controls (identical execution and costs)

- **C1, phantom levels:** the same rule at the day's OH/OL levels scaled ×0.70, ×0.85, ×1.15 and ×1.30. Reported both
  ways:
  - B2, the quadratic read at ×1.0 (the curvature-corrected baseline from milestone 3);
  - B1, the mean of ×0.85 and ×1.15.

  This tells whether the forecast's level adds anything beyond NQ's general continuation.
- **C2, random entry:** for each real trade, K = 5 entries at random minutes drawn uniformly within ±120 minutes of the
  real fill time, inside the session, excluding the last bar.
  - Direction is continuation of the day's move so far: long if the mid close of the previous bar is above the open,
    short if below (skipped if equal).
  - Market entry at that bar's ask close (long) or bid close (short) ± slippage, the same R, exits and costs.

## 4. What is reported

Trades and frequency, gross and net expectancy (R), win rate, profit factor, maximum drawdown (cumulative R in entry
order), by year, by direction, by rung (descriptive), and by era:
- 2016-10 → 2020-08-20: production parameters, in-sample widths;
- 2020-08-21 → 2026-08-20: point-in-time parameters.

Also: real minus C1 and real minus C2 with 95% intervals, cost sensitivity, ambiguity counts, maximum concurrent
positions.

## 5. Decision rule (fixed now)

Primary window: the point-in-time era (2020-08-21 → 2026-08-20), base costs.

1. **Evidence supports independent forward testing** only if all of these hold:
   - net expectancy > 0 with a 95% CI lower bound > 0;
   - real − C1 (B2) > 0 with CI lower bound > 0;
   - real − C2 > 0 with CI lower bound > 0;
   - net > 0 at 2-point slippage;
   - net > 0 in the earlier era too.
2. **Interesting but does not survive costs or controls**: gross expectancy CI lower bound > 0, or net point estimate
   > 0, but outcome 1 fails.
3. **Insufficient evidence for further work**: otherwise.

Whatever the outcome, these data cannot validate the rule: they were used to choose it.

## Amendments

(none)

## RESULTS

(pending)
