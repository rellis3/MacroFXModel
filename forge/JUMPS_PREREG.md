# STEP 2 — Jumps (Lesson 03 §03)

*Pre-registered 2026-10-06, before any Step 1 or Step 2 number was seen. Part of
`plans/LESSON_TARGET_REBUILD_PLAN.md`. Reads the Step 0 table (`forge/FORECAST_HISTORY_SPEC.md`) and the calendar
proxy. No Vote Atlas input; earlier event-layer results are not used as priors.*

## What the lesson says jumps are for

Lesson 03 §03: returns are a diffusion plus jumps arriving as a Poisson process (Merton). Jumps put weight in the
tails (excess kurtosis) and matter for **single-step loss**: a stop is crossed by a jump, not walked to. A forecast
built for the diffusion part can be right on average and still wrong in the tail.

## Definitions (all from the Step 0 table; out-of-sample sessions `oos = 1`, complete sessions)

- 5-minute returns r_i over London 00–22 (264 per session). RV = Σ r_i². BV = (π/2) Σ |r_i||r_{i−1}|.
- **Jump share** = max(0, RV − BV) ÷ RV (the share of the day's variance not explained by continuous movement).
- **Jump day**: the largest |r_i| exceeds **k = 5** times the day's typical 5-minute move, √(BV ÷ 264).
  Variants k = 4 and 6 are logged below and reported as sensitivity, not chosen between.
- **Size** of the jump = largest |r_i| ÷ the session's σ_used (daily σ units).
- **Scheduled**: the jump bar's minute lies within −5 / +15 minutes of a Major release for one of the instrument's
  currencies (calendar proxy; USD/EUR/GBP only; to 2026-07-02). Otherwise unscheduled (or unknown after the
  calendar ends).

## Questions and reading rules

1. **How much is jump?** Per instrument and class: mean jump share, jump-day frequency λ (per year), median and 90th
   percentile size, excess kurtosis of the signed session return ÷ σ_used. Intervals: date-block bootstrap as in
   Step 1. Descriptive.
2. **Scheduled or not?** Share of jump days that are scheduled, per class, with intervals. Descriptive; on its
   answer depends whether a jump term can be known in advance (only scheduled jumps can).
3. **Does the tail fail on jump days?** p90 exceedance (HL, OH, OL) on jump days vs other days, `pit` forecast, with
   intervals. Reading: the tail **fails on jump days** if the jump-day p90 interval lies wholly above 12%.
   Note: a jump day is known only afterwards. Q3 says whether jumps are where the tail breaks; Q4 asks whether
   anything known in advance fixes it.
4. **Does a known-in-advance jump term fix the tail?** Merton's point is that jumps fatten the tail more than the
   middle. Today's event multiplier scales all rungs equally. Candidate: a **rung-specific** multiplier for p90 only,
   per event tag (FOMC, NFP, CPI, high, none, holiday), fitted per instrument inside each walk-forward fold on the
   fold's training sessions only (the multiplier that makes training p90 exceedance 10% given the fold's widths),
   applied to the fold's test year.
   **PASS** if, on test years pooled: (a) p90 pinball on event days (tags FOMC/NFP/CPI/high) improves, with its
   date-block interval of the relative change wholly below 0; and (b) p90 pinball on all days is not worse (upper
   interval bound < +0.5%). Otherwise FAIL, and the equal-scaling event multiplier stays.
5. **Single-step loss (feeds layer 7, stops).** For stop distances d = 0.25, 0.5, 1.0 × σ_used: the share of sessions
   where one 5-minute bar moves more than d, and the share where the open gaps more than d from the previous
   close (Mondays separately: weekend gap). Per class, with intervals. Descriptive.

## Output

`analysis/output/jumps/RESULTS.md`; script `scripts/forecast_history/jumps.py`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above, k = 5 | registered | — |
| 1 | k = 4 | sensitivity | reported alongside |
| 2 | k = 6 | sensitivity | reported alongside |
| 3 | seasonality-adjusted Lee–Mykland detector (Amendment 1) | the registered detector ignores time-of-day volatility | yes, after results; reported alongside, registered result kept |
| 4 | Barndorff-Nielsen–Shephard daily ratio test, 1% (Amendment 2) | variant 3 still flags ~57% of EURUSD days | yes, after results; reported alongside |

## Amendment 1 (2026-10-06, AFTER the registered results were seen — a measurement correction, not a new test)

The registered jump-day rule (largest 5-min move > 5× the day's average 5-min move) flagged ~96 days a year. Under
no-jump returns it should flag almost none: 5-minute volatility is 2–3× higher at the London open and US data
times, so the rule mostly caught ordinary busy minutes. Owner asked for the correction.

**Variant 3 detector** (Lee & Mykland 2008, with the robust intraday periodicity of Boudt, Croux & Laurent 2011):
- u = r ÷ √(BV ÷ 264) per 5-min return (daily scale);
- periodicity f_s for each 5-min slot s = median |u| ÷ 0.6745 over the instrument's **previous 250 sessions**
  (causal), normalised so the mean of f² over active slots is 1; slots with no data get f = undefined and z = 0;
- z = u ÷ f_s; **jump day** if max |z| > 4.29 (the Lee–Mykland Gumbel critical value for n = 264 at 1% per day:
  c_n + s_n · 4.6, c_n = √(2 ln n) − (ln π + ln ln n) ÷ (2√(2 ln n)), s_n = 1 ÷ √(2 ln n));
- the jump bar is the slot of max |z|.

Only Q1's jump-day frequency/size, Q2 and Q3 use the jump-day flag; those are re-reported with variant 3 next to the
registered k = 5. Q1's jump share, Q4 and Q5 do not use the flag and are unchanged. Script:
`scripts/forecast_history/jump_flags_seasonal.py` → `analysis/output/jumps/flags_seasonal.csv`.

## Amendment 2 (2026-10-06, after variant 3 was run on EURUSD and NQ)

Variant 3 flagged 144 EURUSD and 171 NQ days a year. Diagnosis: the grid matches the table exactly (max |r| and slot
agree on 99.8% of sessions); 5-minute returns stay heavy-tailed after the time-of-day adjustment (kurtosis 14), and
many flags sit in thin-liquidity slots (00:00 London, the 21:00–22:00 rollover) — spread spikes, not economic jumps.
A largest-bar test calibrated on a normal null is fragile here.

**Variant 4**: the day-level BNS ratio test. RV, BV as registered; TQ = n · μ⁻³ · Σ |r_i r_{i−1} r_{i−2}|^{4/3},
μ = 2^{2/3} Γ(7/6) ÷ Γ(1/2); z = ((RV − BV) ÷ RV) ÷ √((π²/4 + π − 5) · (1/n) · max(1, TQ ÷ BV²)); **jump day** if
z > 2.326 (1% one-sided). Its jump bar (for Q2's scheduled check) is variant 3's max-|z| slot. With a 1% false-alarm
rate, flagged share − 1% estimates the real jump-day share. Same script and output file.
