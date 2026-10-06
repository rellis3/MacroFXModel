# STEP 3 — Meta-labelling on our own forecast (Lesson 03 §01)

*Pre-registered 2026-10-06, before any Step 1, 2 or 3 number was seen. Part of
`plans/LESSON_TARGET_REBUILD_PLAN.md`. Reads the Step 0 table (and, for 3b, M1 through the causal line engine).
No Vote Atlas input of any kind; earlier meta-label attempts are not priors.*

## The lesson's target

"A secondary model learns, from the history of a primary model's decisions, when those decisions are likely to be
right, and so separates the question of which way to bet from the question of whether, and how much, to act."
The primary model here is **our forecast** (the Vol Forecast v3 export calculation, point-in-time).

## Shared method

- **Walk-forward.** The test years are the forecast's own folds 1–5 (fold 0 has no earlier out-of-sample history to
  learn from). For test fold f the meta-model trains on out-of-sample sessions of folds < f only, with a **5-session
  embargo** before the test year.
- **Models.** Logistic regression on standardised features (baseline) and a gradient-boosted tree
  (`HistGradientBoostingClassifier`, max depth 3, 200 iterations, learning rate 0.05, min 200 samples per leaf;
  fixed now, not tuned). Missing features stay missing (the tree handles them; logistic gets the train mean + a
  missing flag).
- **Intervals.** Date-block bootstrap as Step 1 (all instruments on a date together).

## 3a — Trust the lines

- **Primary decision:** each morning the forecast states that the day's range will stay inside its p75 lines.
- **Labels (known at the close):** `y_hl` = realised HL > HL p75; `y_up` = OH > OH p75; `y_dn` = OL > OL p75.
- **Features, all known at the London open:** log(σ_used ÷ trailing-250 median) (regime); event tag; weekday;
  yesterday's HL ÷ yesterday's HL p50 (log); mean of that over the last 5 sessions; yesterday's jump share and jump
  flag (k = 5, Step 2 definition); |gap at the open| ÷ σ_used; log(σ_t ÷ σ_{t−1}); instrument class;
  log(implied vol ÷ σ) where implied vol exists (CME CVOL / VIX / VXN / GVZ, causal: last value before the open),
  else missing.
- **Benchmark:** the training base rate (a constant). **Score:** Brier score; **skill** = 1 − Brier(model) ÷
  Brier(benchmark), pooled over test years, with interval.
- **PASS (per label, tree or logistic, both reported):** skill interval wholly above 0 **and** reliability within
  ±3 pp in every predicted-probability decile holding ≥ 300 sessions. Usefulness (descriptive): realised exceedance
  in the top and bottom predicted deciles.

## 3b — Act at a line

- **Primary decision:** at the first touch of the OH p50 line, go long; at the first touch of OL p50, go short (the
  side of the break). One primary decision per line per session.
- **Label (triple barrier, from the touch bar's close, next bar onward):** +1 if the p75 line on that side is reached
  first; −1 if the session open is reached first; at 22:00 London, the sign of the close's move from the entry.
  R = gain ÷ distance to the open barrier, minus the instrument's round-trip cost in the same units.
- **Features, known at the touch:** London minute; range used (running HL ÷ HL p50); pace (move over the last 60
  minutes ÷ σ); largest 5-minute move so far ÷ σ; whether the other side's p50 was touched first; event tag; regime;
  log(implied vol ÷ σ); yesterday's HL ÷ HL p50.
- **Weights:** each primary decision weighted by 1 ÷ (number of primary decisions open at the same time on the same
  instrument) (uniqueness).
- **Benchmark:** the driftless random-walk share for each decision, b ÷ (a + b), from its own barrier distances.
- **PASS:** on test years pooled, the kept decisions (model probability above the training-set probability that
  maximises training mean R; chosen on training data only) have (a) a +1 share above their random-walk benchmark
  with the interval of the difference wholly above 0, **and** (b) after-cost mean R > 0 with the interval wholly
  above 0. Otherwise FAIL: the meta-label does not find when breaking a p50 line is worth acting on.

## Output

`analysis/output/meta_label/RESULTS.md`; scripts `scripts/forecast_history/meta_label_3a.py`, `.../meta_label_3b.*`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | — |

## Amendment 1 (2026-10-06, before any Step 3 result)

1. **Yesterday's jump flag** = the BNS day-level test (forge/JUMPS_PREREG.md Amendment 2), not k = 5: Step 2 showed the
   k = 5 rule flags ~96 days a year, mostly ordinary busy minutes. Yesterday's z_BNS is also given as a number.
2. **Implied vol sources**, as in forge/run_combined_range.py `CLASSES`: CME CVOL for EURUSD, GBPUSD, USDJPY, AUDUSD,
   USDCAD, USDCHF, GOLD (XAUUSD); VXN for NQ; VIX for SPX500, DOW, US2000, DE30, UK100. Crosses and NZDUSD: missing.
   Value = last close strictly before the session date (`asof_before`).
3. **Complete sessions**: last bar ≥ 20:00 London (forge/FORECAST_RECORD_PREREG.md Amendment 2).

## Amendment 2 (2026-10-06, after 3a's result, before 3a-variant-1 and before any 3b result)

**3a variant 1 — trust the persistence-adjusted lines.** 3a found its drivers were the forecast's own leftovers; those
are now fixed in the shadow forecast (forge/FORECAST_FIX_PREREG.md variant 1, PASS). Re-run 3a unchanged except the
labels use that forecast's walk-forward lines (`analysis/output/forecast_fix/live_variant/lines_B.csv`, each test
year fitted on earlier data only). Same features, folds, models and PASS rule. Purpose: measure what morning
information is left once the forecast itself is fixed. Expectation stated now: skill well below 3a's 4.8%.

**3b — final specification (before any 3b number):**
- **Lines:** the persistence-adjusted walk-forward lines (as above), not the plain export: the shipped candidate.
- **Primary:** first touch of OH p50 → long; first touch of OL p50 → short; at most one per side per session.
  Entry = the touch bar's close. If the touch bar itself also reaches that side's p75 (or the open), the decision is
  **same-bar** — counted, excluded from scoring (no intrabar order is assumed).
- **Barriers (from the next bar):** +1 = that side's p75 first; −1 = the session open first (a bar touching both
  counts as −1, stop first); otherwise at the session end (22:00 London) R = signed move ÷ the distance to the open.
  R(+1) = distance to p75 ÷ distance to open. **Cost** = `costForPair` round-trip % (js/perLineStrategy.js, as the V4
  studies), in R units ÷ the distance to the open.
- **Features at the touch** (bars up to and including the touch bar): London minute; range used (running H−L ÷
  HL p50); pace (60-minute move in the trade's direction ÷ σ); largest 5-minute move so far ÷ σ; other side's p50
  touched first (0/1); distances to p75 and to the open ÷ σ; plus the morning features of 3a (regime, yesterday's
  miss, 5-day miss, event, weekday, class, implied vol ÷ σ, yesterday's BNS jump).
- **Live Range's re-forecast is NOT a feature:** its params were fitted on the first 60% of dates, which overlaps
  the test years. Its raw inputs (range used, pace, hour) are features instead.
- **Uniqueness weight** = 1 ÷ the number of this instrument's decisions open at the same time (both sides can be).
- Benchmark, models, walk-forward, threshold rule and PASS as registered above.
- Builder `scripts/forecast_history/meta_label_3b_build.mjs`, scorer `scripts/forecast_history/meta_label_3b.py`.
