# Approach speed at levels — control test

> **Status: RUN 2026-09-12. Verdict: the level does no work.** The "slow arrival
> dwells on the level" effect is real but is speed persistence — it appears
> identically at random non-level prices — and the paired level increment is zero
> or negative on 4 instruments × 4 session bands. What survives is an
> unconditional read of the tape, now shipped as `js/tapeSpeedEngine.js`.

## The claim under test

An external "approach speed" page (seen 2026-09-12, gold) reports that when price
reaches a level slowly, it then dwells: the slowest fifth of arrivals spend ~80% of
the following hour within 0.10 ATR of the level, the fastest fifth ~62%. It holds
in every session band and at every level family, with bootstrap CIs clear of zero,
and is presented as a property of levels.

The page is careful work — per-band thresholds, CIs, "not distinguishable" where
intervals overlap, no look-ahead on today's Asia range. But its only control for
"is this just volatility" is *if this were a vol-band effect it would not appear on
handles* — and handles are still levels. The tell is that **every** family
separates, including $10 handles and open ± 0.5 ATR, the ones nobody claims are
special. When everything works, suspect the measure. `line_touch_control_study.mjs`
found the same shape two days earlier for a different statistic.

## Design

`analysis/approach_speed_control_study.mjs`. For every first touch of a level
(prior-day H/L, Asia H/L from 07:00, round handles) with a positive 15-minute
approach speed toward it, one **paired control**: a random bar from a *different*
session of the same instrument, same hour band, further than 0.25 ATR from every
structural level and 0.3 × grid from every handle. The control's close is a
pseudo-level and the identical statistic is computed. Controls are assigned to a
speed quintile using the **touch** cut points for that band, so "slow" means the
same speed in both groups.

- **separation** = dwell(Q5) − dwell(Q1). Negative means slow arrivals dwell more.
- **separation difference** = touch separation − control separation, day-block
  bootstrapped (400 reps). If ≈ 0, speed persistence explains the whole effect.
- **level increment** = dwell(touch) − dwell(control) within the same quintile,
  paired t. The level's own contribution, holding speed fixed.

Gold, EUR/USD, USD/JPY, NQ; 5 years of M1; 26,000 touches; deterministic RNG.

## Result

The touch side reproduces the external page (gold London Q1 0.800 / Q5 0.588 vs
their 0.800 / 0.625). The control side reproduces it too:

| | touch sep | control sep | diff [95% CI] | level incr. Q1 (t) |
|---|---|---|---|---|
| gold NY | −0.229 | −0.268 | +0.039 [−0.04, +0.12] | **−0.109 (−3.9)** |
| gold late | −0.391 | −0.672 | +0.281 [+0.13, +0.46] | −0.134 (−2.7) |
| eurusd NY | −0.155 | −0.299 | +0.144 [+0.03, +0.23] | **−0.149 (−3.7)** |
| usdjpy Ldn | −0.294 | −0.220 | −0.074 [−0.16, −0.01] | −0.118 (−3.3) |
| usdjpy NY | −0.184 | −0.256 | +0.072 [−0.02, +0.17] | **−0.263 (−6.8)** |
| nq NY | −0.199 | −0.202 | +0.002 [−0.05, +0.06] | −0.039 (−1.7) |

Across the 16 cells the separation difference straddles zero with mixed signs —
no systematic level effect on the slope. The level increment at slow speed is
negative wherever it is significant, and negative in 10 of 12 family×instrument
cells. **At the same arrival speed, price dwells slightly *less* at a real level
than at nowhere in particular** — plausibly because levels are where stops and
breakouts happen, and those push price away. NQ is the only instrument with a
small positive increment (Asia, +0.07, t = 2.2), not confirmed elsewhere.

## What survives, and what was built

Speed persists. That is a large, monotonic, unconditional property of the tape:
on gold in the NY overlap, after the slowest fifth of 15-minute moves the next hour
ranges a median 0.19 ATR and stays within 0.10 ATR of its start 76% of the time;
after the fastest fifth, 0.29 ATR and 59%. Fast tape also means the next hour is
*narrower than the hour just gone* (×0.82) while still wider than a typical hour —
both true, both worth saying.

Because it is unconditional on levels, it applies to every bar of the day rather
than the handful when price meets a line — which is more useful for a "what kind of
hour is this" read, not less. Shipped as:

- `analysis/build_tape_speed_params.mjs` → `js/tapeSpeedParams.js` (generated,
  frozen, per instrument × band × quintile; every bar sampled at 5 min, 5 years)
- `js/tapeSpeedEngine.js` — classify a live speed within its band, describe it
- `GET /api/tape-speed?symbol=` — two OANDA calls, 60 s cache
- today.html: card chip for the tail quintiles only, a drawer section with the
  full quintile table for the current band, and a block in the pair AI prompt
  that carries the finding so the model does not reach for the "level" story.

## What it is not

Not a direction call, not a signal, not a claim about levels. It says how wide the
next hour is likely to be and how much price is likely to stay put — from this
pair's own history at this time of day — and nothing else.
