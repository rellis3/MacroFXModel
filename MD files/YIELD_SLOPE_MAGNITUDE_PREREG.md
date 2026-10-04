# YIELD-SLOPE-MAGNITUDE — Among moments where a tracked pair is currently following yesterday's yield shape and a turn is predicted, does the steepness of the local 1h yield leg into that turn predict the SIZE of the subsequent price move, not just whether it turns?

**Pre-registered 2026-10-04, before the harness was written or run.**

> Commit this file BEFORE writing the harness. `study.mjs bank` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

The owner's own extension of the already-banked regime-gated result
([[project_yield_shape_regime]], day-clustered, 2026-10-02): a steep local yield leg
into a predicted turn should carry more information than a shallow one — a sharper
cause should produce a bigger effect. An exploratory, non-gated pass over the same
cached data (`analysis/yield_shape_extended_theories.py`, theory B) found this pattern
in all four live-config pairs (EUR/GBP/NZD/CHF-USD), monotonic on move size in all four
and on hit-rate in three of four. This formalises that pass with the discipline it
didn't have: pre-registered expectation, day-level de-clustering (the exploratory pass
used every 15-min bar, which overlaps within a day), a placebo, and a cross-pair gate.

## Why it is not already settled

The already-banked regime-gated result (`yield_shape_regime_dayclustered`) only used
the SIGN of the yield's trailing 1h leg (turn predicted: yes/no) — it threw away the
leg's magnitude entirely. The exploratory pass that found this pattern pooled every
qualifying 15-min bar as if independent, which is exactly the trap the original
day-clustered study was built to avoid (bars inside the same day share the same yield
template and overlapping price history). This re-asks the same question at the day
level, the way everything else on this ledger is held to.

## Definitions, fixed in advance

- **Setup**: identical trigger to the live tool's own config — `|rolling 2h corr| >`
  the pair's threshold AND the yield's local 1h leg reverses sign over the pair's own
  forward window. EUR/USD 15m/>0.7, GBP/USD 15m/>0.5, NZD/USD 30m/>0.5, USD/CHF
  60m/>0.5 (`js/yieldShapeRegimeCore.js`'s own `INSTRUMENTS`).
- **De-clustering**: ONE row per (pair, calendar price-day) — the FIRST qualifying
  event of that day, chronologically. Matches how the original day-clustered study
  counted its own `n_days`; avoids treating several same-day bars as independent.
- **The predictor**: `yield_slope` = |yield value at the signal bar − yield value 1h
  (4 bars) earlier| — the steepness of the SAME local leg already used to detect the
  turn, not a full-day or multi-day slope (confirmed against the owner's own annotated
  chart: one leg, the run into a single turn, not the session's overall trend).
- **The outcome**: `window_mag` = |price at signal bar + H − price at signal bar|, raw
  price units (no ATR normalisation needed — the test is within-pair, not pooled
  across pairs, so scale differences between EUR/USD and GBP/USD don't matter).
- **The statistic**: Spearman rank correlation between `yield_slope` and `window_mag`,
  per pair, over that pair's de-clustered day-rows. Rank-based so a handful of large
  moves can't dominate the way a Pearson correlation would.
- **MIN_EVENTS**: 20 qualifying days per pair. Below it, that pair is UNTESTABLE.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Spearman(yield_slope, window_mag) > 0, per pair, 95% bootstrap CI (1000 reps, resampling days) excluding zero | **Real on at least 3 of 4 pairs** — the exploratory pass showed the pattern on all four, but day-level de-clustering will shrink samples roughly in half (from bar-count to day-count), so I expect at least one pair to drop to UNTESTABLE or lose significance, most likely GBP/USD (its exploratory hit-rate pattern was the least monotonic of the four). |
| b | Do both chronological halves of each pair's sample agree in the sign of the correlation? | **Expect yes** on whichever pairs clear (a) — a real, structural relationship (steeper cause, bigger effect) should not flip sign between the first and second half of a 60-day window. |
| c | **THE GATE.** What must hold for this to count as real. | **At least 3 of the 4 pairs** must independently clear: positive Spearman, 95% CI excluding zero, AND both halves agreeing in sign, AND the permutation placebo (1000 shuffles of the slope/magnitude pairing within that pair) placing the observed correlation above its 95th percentile. One or two pairs clearing is NOT enough to call this real — that's within the range chance alone could produce across 4 tests. |

**My overall prior:** real on 2–3 of 4 pairs after proper de-clustering, most likely
USDCHF and EURUSD (the cleanest monotonic patterns in the exploratory pass), with
GBPUSD the most likely to fall short of the gate.

## What this does NOT test

- **Direction of the move** — only its SIZE. A steep yield leg predicting a bigger move
  says nothing about which way that move goes.
- **A tradeable sizing rule** — even if this passes, translating "steeper = bigger" into
  an actual stop/target adjustment is a separate, later design decision.
- **The already-banked turn/no-turn result** — unaffected either way; this is additive
  information about magnitude, not a re-test of whether turns happen.
- **Cross-pair confluence** (theory D from the same exploratory pass) — separate,
  untested claim, not bundled into this one.
