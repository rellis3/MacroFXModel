# Vol Forecast V3, Stage B: baselines (registered 2026-10-10, before any Stage B number is computed)

Follows `plans/VF3_STAGE_A_AUDIT.md`. These are owner decisions of 2026-10-10. Read-only research; no production change.

**Retrospective, not prospective.** Every period scored here was explored before, including by FORECAST_PICK (whole 2020-08 → 2026-08 window). Results rank forecasts on history; they are not independent confirmation. Prospective confirmation is the forward record (the chosen ladder's scorecard and the planned shadow).

## Reused, not rerun
- FORECAST_PICK (2026-10-06) and its variant 1: pooled 12-rung pinball. Picked persistence + IV where IV exists, persistence elsewhere.
- Stage B adds only what FORECAST_PICK could not answer:
  - (a) a production benchmark that does not apply today's parameters backwards (FORECAST_PICK's "plain" used live-settings σ);
  - (b) per-target (HL, OC, OH, OL) and per-rung results;
  - (c) breakdowns by instrument, regime, weekday, event tag and year;
  - (d) the pure-IV ladder and the incumbent COG bands the bot trades;
  - (e) the V3 page's own intraday probabilities.

## Part 1: daily forecasts, controlled research comparison

**Rows:** `analysis/output/forecast_history`, `oos = 1`, complete sessions, 2020-08-21 → 2026-08-20; walk-forward folds 0–5, embargo 5 sessions (FORECAST_FIX method).

| Arm | σ | Widths |
|---|---|---|
| **P** (primary benchmark: production "⬇ Forecast") | `pit_*` lines exactly as built (fold estimator, fold widths, fold event multipliers) | as built |
| S (persistence) | P's `pit_sig_used` × exp(β·(x − x̄)); x = regime, res1, res5, weekday, computed from P's own σ and NY-close ranges (the live-computable definitions, on PIT σ) | refit per fold |
| **SI** (chosen ladder: the challenger) | S + log(IV ÷ σ), live-type IV | refit per fold |
| I (IV-adjusted) | P σ × exp(k·(log(IV ÷ σ) − mean)) | refit per fold |
| IV (pure IV) | IV ÷ √252 (live-type IV) | refit per fold |
| H (HAR-800) | `ladder_candidates/d1/<SYM>_har800.csv`, last bar before the session | refit per fold |
| C (incumbent COG, the bot's lines) | YZ-30 (fx, gold) or GARCH α .06 β .87 ω 1.11e-5 (indices) on the same NY-close bars; no news multiplier (no historical feed); COG constants, p50/p75 only | fixed (COG constants) |

- Live-type IV: CME settlement-inverted 30-day ATM for USD majors, GVZ for gold, VXN for NQ, VIX for the other indices, as in FORECAST_PICK variant 1.

**Boards (identical rows inside each):**
- **all-34:** P, S, H, C;
- **IV-13:** P, S, SI, I, IV, H, C.

Coverage differences are reported.

**Metrics (fixed):**
1. **Pinball ratio vs P** by quantity (HL, OC, OH, OL; mean of the three rungs; ÷ P's σ_used), with a 95% date-block bootstrap (block 20); plus the 12-rung total.
2. **Coverage:** exceedance per rung vs 50 / 25 / 10%.
3. **Calibration miss** = max |exceedance − target| of HL p75 and OH/OL p75 across:
   - regime (quiet < 0.85, normal, busy > 1.15 on σ ÷ its 250-day median);
   - weekday;
   - event tag (known only to 2026-07-02, after that "unknown");
   - class;
   - year.
4. **Systematic error:** mean and median log(realised ÷ forecast p50) by the same cuts.
5. **Per instrument:** pinball ratio vs P and HL p75 exceedance.

**Reading rule:**
- A forecast is "trusted over P" for a quantity if its pinball ratio interval lies wholly below 1 **and** its calibration miss is not larger than P's.
- C is judged on coverage only (its rungs are not quantile-fitted).

## Part 2: production as shipped
- **Incumbent COG (the bot's lines):** archive records written before the London open, 2026-07-01 → 2026-08-20 (outcomes local). Coverage only, small sample, labelled.
- **Production ladder as shipped:** it exists only from 2026-08-21, and every outcome falls in the unseen forward block (reserved for the IEP and shadow tests; lockbox H-A for HAR-800). **Not scored in Stage B; owner decision required.**

## Part 3: V3's own intraday probabilities (test block 2022-01-01 → 2024-12-31, `oos = 1`)
- **J2 path stats:**
  - **claim:** P(next O-H/O-L rung by 22:00 | this rung touched) = OOS exceed(next) ÷ exceed(this), static;
  - **outcome:** first-touch minutes `ft_*`;
  - **reported by:** hour of the first touch;
  - **scores:** calibration and Brier vs the static claim and vs the empirical rate by touch-hour band fitted on 2016-2021.
- **K3 "x% to median"** (Brownian `_breakoutProb`, UTC clock fraction, incumbent HL median):
  - **outcome:** session H−L ≥ the COG HL median by 22:00 London, from hourly checkpoints 02–20;
  - **scores:** calibration and Brier by hour vs the empirical rate by hour × consumed bin fitted on 2016–2021.
- **Validated intraday tools are not rescored** (Live Range, extreme-in, T7, the IEP models); their existing results are cited.

## Output
`analysis/output/vf3_stage_b/` (`PART1.md`, `PART2.md`, `PART3.md`, json). Script `scripts/forecast_history/vf3_stage_b.py`.
