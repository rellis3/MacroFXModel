# vol-layer-feedback-confirm: do the forecast's own errors still carry over, and does a fixed feedback rule still cut its loss, on unseen 2023-26 data?

**Pre-registered 2026-11-16, before any outcome was computed.** No statistic in this prereg has been computed on sessions from 2023-01-01 onward. The power table and the frozen feedback slopes below use the discovery window (2016-10-24 → 2022-12-30) only.

| | |
|---|---|
| ID / ledger id | `vol-layer-feedback-confirm-persist`, `-morning`, `-qlike-plain`, `-qlike-chosen`, `-cov75` (five scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-feedback-confirm` |
| Data | **Daily rows:** `analysis/output/forecast_history/<SYM>.csv` (plain σ `pit_sig_used`, `rv5`, `r_oh`, `r_ol`, `r_hl`, `event`, `last_min ≥ 1200`). **Chosen σ and lines:** `analysis/output/line_reaction/chosen_lines.csv` (`sig`, `oh_p75`, `ol_p75`). **Hourly RV:** M1 mid closes from `data/m1_bidask/<key>_m1.parquet`, London hours 00-22. **Instruments (34):** the 28 FX pairs, GOLD, NQ, SPX500, DOW, US2000, DE30, UK100. **Score window:** sessions 2023-01-01 → 2026-08-20 (943 London dates). The lockbox (2026-08-21 onward) is not read: rows are cut by London date ≤ 2026-08-20, and M1 is read with `time < 2026-08-20 23:00 UTC`. **History used as inputs only:** 2016-10-24 → 2022-12-30 (past-only calibrations, EWMA state, frozen slopes). |
| Seed | `20261116` (set as `forecast_record.SEED`, which `line_reaction.Boot` draws from, and for every permutation) |
| Uncertainty | Stationary date-block bootstrap over London dates, block 20 sessions (about a month), B = 2000 (`line_reaction.Boot`). All 34 instruments on a date move together in a draw. Sensitivity: block 60. |
| Scripts / outputs | `scripts/vol-layer-feedback-confirm/run.py` → `analysis/output/vol-layer-feedback-confirm/{discovery,confirm}/` |
| Harness | Own script. It reuses the stage 2 and 3 loaders (`scripts/vol-layer-deep/feedback.py`, `feedback_wide.py`) with the window moved. The harnesses do not score variance-forecast losses. |

## 1. The claim

C.OG, Market Movers, 28 Sep 2026: "the vol forecaster can drive so many things... but you can also use its errors as a feedback loop."

Stage 3 of the Vol-Layer research (`backtest-data/vol-layer/feedback-wide.json`, discovery 2016-10-24 → 2022-12-30) found:

- **Misses persist.** Today's RV miss on yesterday's: slope 0.49 [0.46, 0.53] for the plain σ, 0.25 [0.19, 0.29] for the chosen σ. Shuffled misses give 0. It held on all 34 instruments, every year and both regimes.
- **A big morning means a big afternoon.** The 13:00-22:00 RV miss on the 00:00-13:00 miss: 0.56 [0.52, 0.61], positive on all 34 instruments (0.34 to 0.73).
- **Error feedback cuts the forecast's loss.** σ² × exp(b × an EWMA of past misses). QLIKE ratio against the same σ without it: plain 0.70 [0.64, 0.76], chosen 0.91 [0.88, 0.96] at a 1-session half-life, the best point of the half-life sweep.
- **The chosen p75 line is crossed 25.6% [24.4, 26.8] of the time** against 25% nominal.

**The claim:** each of these holds on its own measure in 2023-26, with every rule fixed from discovery.

**Why "its own measure".** Stage 4 was first set as an overlay on a base system's P&L. `vol-layer-rule-a-confirm` showed that design cannot see these effects: Sharpe-change MDEs were 0.25-0.31. The owner approved the change on 2026-11-16. It follows C.OG lesson L03: validate each layer by its own factor. For a feedback layer that is forecast accuracy (QLIKE), persistence of the errors, and calibration. C.OG's rules are fixed, with no walk-forward refit (L04/L01), so the feedback rule here is fitted once on discovery and never refitted.

## 2. Why it is not already settled

**Use of the 2023-26 window so far.** Inside the Vol-Layer programme this window has been used once, for Rule A's overlay trades (`vol-layer-rule-a-confirm`). That asked whether stop and size overlays change a trade book's Sharpe. It computed no forecast error, persistence slope, QLIKE or coverage, so it is a different question.

**Outside the programme, neighbouring statistics have been computed on this window.** They are listed so the reader can weigh each cell:

| Banked entry | Window | What it saw | Cell it touches |
|---|---|---|---|
| `forecast-pick`, `forecast-persistence-fix` (validated) | 2020-08 → 2026-08 | A persistence term on yesterday's and the 5-day *range* miss beats the plain σ on range pinball (0.976-0.980) | C1. Same idea, different error (range, not RV) and yardstick (pinball, not QLIKE) |
| `vol-layer-rv5-increment` (validated) | 2020-08 → 2026-08 | Adding yesterday's and the 5-day M1 RV to the chosen σ cuts range pinball by 1.2% | **C2.** Close to the same input: lag-1 log(RV ÷ σ²). Different yardstick (QLIKE on RV, not pinball on lines), and here the slope is frozen, not refit per fold |
| `forecast-record-pit`, `forecast-pick` | 2020-08 → 2026-08 | Pooled line coverage, all years together | D. Re-measure of a pooled number, now split to 2023-26 and by σ tercile |
| `jump-next-day-miss` (context) | 2020-08 → 2026-08 | Controls the previous day's range miss; does not report its slope | A, indirectly |
| `forecast-miss-scan` (context) | confirm half 2023-26 | "Forecast-miss streaks" was not discovered on 2020-23, so never scored on 2023-26 | A, no |

So:
- **A and B are fresh.** No RV-miss persistence slope and no morning-to-afternoon slope has been computed on 2023-26.
- **C1 and C2 are fresh on this yardstick.** But C2's mechanism passed on the same window on range pinball. A C2 pass adds a second yardstick, not new evidence that the mechanism exists.
- **D is a re-measure.** It checks that the base forecast the feedback layer sits on stays calibrated in this window, and by σ tercile. It is not new evidence that the lines are calibrated.

None of these is a banked null, so nothing here re-runs a null.

## 3. Definitions, fixed in advance

**Rows.** One row per instrument and London session (00:00-22:00 London), `last_min ≥ 1200`, `pit_sig_used > 0`, `r_hl > 0`, `rv5 > 0`. Scored rows: dates 2023-01-01 → 2026-08-20. The chosen σ must also be present for the chosen-σ cells.

**Base forecasts and errors.** These are the stage 2 definitions (`feedback.errors`), unchanged:
- `h_p = cal_p × σ_plain²` and `h_c = cal_c × σ_chosen²`. `cal` is the expanding mean of `rv5 ÷ σ²` over all earlier sessions of that instrument (past-only; at least 120 sessions for plain, 40 for chosen). It is the base forecast's own scale. It runs on through 2023-26 because it is part of how the base σ is defined, and it is the same for both arms of every comparison.
- Miss `e = log(rv5 ÷ h)`.

**Knowable when?** σ is known at the London open. Yesterday's miss is known at 22:00 yesterday. The 00:00-13:00 miss is known at 13:00, before the afternoon it is compared with.

### Cell A: miss persistence (`-persist`)
- Slope of today's `e` on yesterday's `e`. Pooled OLS within instrument (both sides demeaned by instrument over the scored rows). Ratio-of-sums bootstrap over dates, as `feedback_wide.slope`.
- Two forecasts: plain σ and chosen σ. **Conjunctive:** both must pass. Cell p = the larger of the two p values.

### Cell B: big morning, big afternoon (`-morning`)
- Morning miss `S_am = log(RV_00-13 ÷ (cal × σ_plain²))`. Afternoon miss `A_pm = log(RV_13-22 ÷ (cal × σ_plain²))`. Each window has its own past-only `cal` (expanding mean, at least 120 sessions), as `feedback_wide.bucket_miss`.
- RV per hour = the sum of squared 5-minute log returns of the M1 mid close, London hours, `× 1e4`. This is `feedback_wide.m1_hours`.
- Slope of `A_pm` on `S_am`, within instrument, plain σ. The chosen σ version is descriptive.

### Cells C1 and C2: error feedback on forecast accuracy (`-qlike-plain`, `-qlike-chosen`)
**The feedback rule, frozen.**

`h_fb = cal_fb × σ² × exp(b₁ × EWMA_hl=1(e_{t-1}, e_{t-2}, …))`

- EWMA: pandas `e.shift(1).ewm(halflife=1, min_periods=5).mean()` per instrument. The state runs on from discovery without restarting.
- `cal_fb` is the expanding past mean of `rv5 ÷ (σ² × exp(…))`, the same past-only scale as the base.
- `b₁` was fitted once by pooled OLS of `e` on `[1, EWMA]` over every discovery row (date ≤ 2022-12-30). It is **never refitted**:

  | Forecast | b₁ (frozen) | Discovery rows in the fit | Fit starts |
  |---|---|---|---|
  | plain σ | **0.67559** | 49,927 | 2017-04-19 |
  | chosen σ | **0.42989** | 19,141 | 2020-10-22 |

  These were computed on 2026-11-16 from discovery rows only. The script refits them on discovery as a check and stops if any differs by more than 1e-4.
- The intercept is not used; `cal_fb` sets the scale.
- **Half-life 1 is frozen.** It was the best point of the stage 3 sweep (1, 2, 3, 5, 8, 13, 21, 34, 55). It sits at the short edge of that grid, so its plateau check is one-sided (half-lives 2 and 3).
- Neighbour and lag variants are frozen the same way before any confirm row is read: hl 2, hl 3, and hl 1 with misses delayed one more session. Each gets its own discovery-fitted `b₁`, written to `discovery/frozen.json`.

**Outcome.** QLIKE ratio = Σ QLIKE(rv5, h_fb) ÷ Σ QLIKE(rv5, h), on the same rows, with QLIKE(x) = x − log x − 1 at x = rv5 ÷ h. Effect = 1 − ratio (the share of loss removed). C1 uses the plain σ and C2 the chosen σ.

The stage 3 number for the chosen σ used `b₁` refit each January (0.28 for 2021, 0.35 for 2022). The frozen 0.43 is fitted on all of discovery, so it is a little larger. In-sample on discovery with the frozen slope the ratios are 0.696 (plain) and 0.903 (chosen), against 0.700 and 0.914 walk-forward.

### Cell D: chosen p75 coverage (`-cov75`)
- Share of sides (OH and OL pooled) where the day's excursion passes the chosen p75 line: `r_oh > oh_p75`, `r_ol > ol_p75`.
- Nominal 25%. Equivalence band ±2.5 pp, i.e. 22.5-27.5%.

### Controls, placebos and mirrors
- **A, shuffle:** 100 within-instrument row shuffles of yesterday's miss. This is the discovery benchmark; the real slope must exceed all 100.
- **A, B and C, month placebo:** 200 whole-month permutations within each instrument.
  - For A, yesterday's miss comes from another month.
  - For B, the morning miss comes from another month.
  - For C, the EWMA input comes from another month, with the frozen `b₁`.
  - Whole months are moved, not rows, after the 2026-11-04 lesson. The real value must beat all 200 draws.
  - If the placebo SD is more than 1.25 × the bootstrap SE, the gate uses the placebo SD for the p value instead (2026-11-04 fx-short-term-fair-value lesson).
- **Mirrors (descriptive):**
  - A: slope on yesterday's above-forecast misses and below-forecast misses, separately. The L8 spec says below-forecast is its own question.
  - B: the slope among below-median mornings and among above-median mornings, separately. This asks whether a quiet morning predicts a quiet afternoon as strongly as a busy one predicts a busy one.
  - D: OH and OL sides separately.
- **Scheduled news:** the `event` flag splits every cell. B must hold on non-event days (see the gate).
- **Concentration:** each cell without the top 1% of dates by |pooled miss|.

**De-clustering.** None. Every instrument-session is a row, and the date-block bootstrap carries the cross-instrument correlation. Cross-instrument σ errors correlate about 0.47 (`plans/SEARCH_BREADTH.md`), so rows are never treated as independent.

**Reproduce first.** Before reading any confirm row, the script reruns the discovery numbers with its own code and must match stage 3 to 3 decimals: persistence 0.495 / 0.245, morning 0.564, plateau hl 1 0.700 / 0.914, chosen p75 25.587%. If any differs, it stops.

**Sample.** Discovery 2016-10-24 → 2022-12-30 (build, freeze and power only). Confirm 2023-01-01 → 2026-08-20, opened once. Year check over 2023, 2024, 2025 and 2026 (2026 runs to 08-20).

## 4. Hypotheses

| Cell | Question | Expectation |
|---|---|---|
| A `-persist` | Does yesterday's RV miss still predict today's, for both the plain and the chosen σ? | **Yes.** Plain about 0.45, chosen about 0.20 |
| B `-morning` | Does a big morning (00-13 miss) still mean a big afternoon (13-22 miss)? | **Yes.** About 0.5 |
| C1 `-qlike-plain` | Does the frozen feedback rule cut the plain σ's QLIKE? | **Yes, large.** Ratio about 0.70-0.80 |
| C2 `-qlike-chosen` | Does it cut the chosen σ's QLIKE? | **Small.** Ratio about 0.92-0.97. In discovery it was local to the busy σ tercile and to 2022 (2021 alone: 0.97 [0.92, 1.03]). Likely UNDERPOWERED or CONTEXT |
| D `-cov75` | Does the chosen p75 line stay within 22.5-27.5% of sides, pooled and in each σ tercile? | **Yes pooled.** Per class it drifts (discovery: gold 21.0%, FX majors 27.3%) |

**Pass bars (SESOI).**
- **A and B: slope 0.10.** log-HAR leaves 0.11 of persistence. A forecast with less carry-over than that is treated as having nothing left for feedback to use.
- **C: a 5% loss cut (ratio 0.95).** The house tie rule for a forecast change is 0.5% on range pinball (`forecast-pick`). The one discovery-only comparison of the two yardsticks is rough:
  - stage 2's error-feedback band on the plain σ (half-life 10) cut p75/p90 pinball by 0.7%/0.9%;
  - a half-life of 8-13 cuts the plain σ's QLIKE by 12-16% (stage 3 sweep).
  - So QLIKE moves about 15-20 times as much as pinball, and 0.5% pinball is about 8% QLIKE.
  - The weights differ between the two (fixed half weight against a fitted slope). So the bar is set below that, at 5%, so that a useful term is not called too small.
- **D: ±2.5 pp** around 25%.

**THE GATE (VALIDATED), per cell. All must hold:**
1. Holm-adjusted p < 0.05 across the five cells, in the expected direction. For D the p is the TOST p against the ±2.5 pp band.
2. The point estimate is at or beyond the pass bar: slope ≥ 0.10; ratio ≤ 0.95; D's 95% interval inside 22.5-27.5.
3. **+1 lag:**
   - A: the lag-2 slope is above 0, with an interval that excludes 0.
   - B: the version with the 13:00-14:00 hour left out (00-13 against 14-22) has the same sign and at least half the size.
   - C: the misses delayed one more session still give a ratio below 1.
   - D: none; the lines are the product's, not ours.
4. **Plateau:**
   - B: cuts at 12:00 and 14:00 each have the same sign and at least half the size.
   - C: half-lives 2 and 3 each remove at least half the hl 1 loss cut.
   - A: the slope falls with the lag (1 > 5 > 10) and does not change sign.
   - D: the p50 and p90 rungs lie within ±2.5 pp of 50% and ±1.5 pp of 10% (descriptive, not gating).
5. **Years:** the same direction in at least 3 of the 4 years 2023-2026. For D, at least 3 of the 4 years' points lie inside the band.
6. **Breadth:**
   - A (each forecast) and B: a positive point slope on at least 26 of the 34 instruments.
   - C: a ratio below 1 on at least 26 of 34.
   - D: each σ tercile's point lies inside 22.5-27.5 (conditional coverage; the L8 spec says marginal coverage alone is no evidence).
7. **Placebos:** the real value beats all 100 shuffles (A) and all 200 month permutations (A, B, C).
8. **B only:** on non-event days the slope is at least half the pooled slope.

**THE MIRROR.** Listed in §3. The mirrors are descriptive. A big gap between the above- and below-forecast sides of A is reported, not scored.

**Other verdicts:**
- **NULL:** the 95% interval excludes the bar on the wrong side: slope interval below 0.10, ratio interval above 0.95, or for D the interval wholly outside 22.5-27.5. A significant effect in the wrong direction is also NULL.
- **UNDERPOWERED:** the interval includes both no effect (slope 0, ratio 1, or a D interval crossing a band edge) and the bar.
- **CONTEXT:**
  - Gate 1 holds, but the point misses the bar (real but too small); or
  - any of gates 3-8 fails. Example: C2 passing in 2023 alone, or only in the busy tercile.

## 5. Power

**Source.** Discovery-window bootstrap intervals only (stage 3 `cells.csv`, block 20, B 2000). SE = interval width ÷ 3.92, scaled by √(discovery dates ÷ 943). MDE = `mdeFromCI` at 80% power, two-sided. The house per-cell α is 0.05. The Holm first-step α of 0.01 is shown beside it.

| Cell | Discovery estimate [95%] | Discovery dates | SE in confirm | MDE (α 0.05) | MDE (α 0.01) | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|
| A plain | 0.495 [0.456, 0.533] | 1,556 | 0.025 | 0.070 | 0.086 | 0.10 | **POWERED** |
| A chosen | 0.245 [0.192, 0.291] | 613 | 0.020 | 0.057 | 0.070 | 0.10 | **POWERED** |
| B | 0.564 [0.519, 0.609] | 1,556 | 0.030 | 0.083 | 0.102 | 0.10 | **POWERED** (borderline at the strict Holm α) |
| C1 plain | 0.700 [0.638, 0.757] | 1,039 | 0.032 | 0.090 | 0.109 | 0.05 | **UNDERPOWERED by design** |
| C2 chosen | 0.914 [0.876, 0.960] | 480 | 0.015 | 0.043 | 0.053 | 0.05 | **POWERED** at α 0.05; UNDERPOWERED at the strict Holm α |
| D | 25.59% [24.45, 26.78] | 613 | 0.48 pp | 1.34 pp | 1.64 pp | 2.5 pp | **POWERED** |

Reproduce: `node -e "import('./js/preregStats.js').then(m => { const k = Math.sqrt(480/943), mid = 0.918, h = 0.0423*k; console.log(m.mdeFromCI({ lo: mid-h, hi: mid+h })) })"` (C2; swap in each row).

**What this means.**
- **A, B and D are powered.** A result inside the bar can be called NULL.
- **C1 is UNDERPOWERED by design against the 5% bar.** QLIKE is dominated by a few days when realised variance far exceeds the forecast, and the plain σ misses badly on those days, so its interval is wide. This design cannot tell a 5% cut from none on the plain σ. If C1 comes back empty, the verdict is UNDERPOWERED, never NULL.
- **C2 is powered only at the per-cell α.** Its MDE is 0.043 at α 0.05 and 0.053 at the Holm first-step α 0.01, against a 0.05 bar. Against a 3% bar it would be UNDERPOWERED by design (MDE 0.043 > 0.03). So a C2 interval that includes both 1 and 0.95 reads UNDERPOWERED, as §4 says. Only an interval wholly above 0.95 is NULL.
- **Both C cells can still pass.** The MDEs (0.090 and 0.043) are below the discovery effects (0.30 and 0.086). So C1 can confirm its discovery size easily. C2 can confirm its discovery size only if it does not shrink by more than about half. C2's discovery effect was local to busy markets and 2022, so shrinkage is likely.
- **Design caveats.**
  - The 2026-11-04 lesson says a date-block SE can understate the null spread when the regressor is persistent (A and B). The month-placebo SD is the check, and §3 says what happens if it is larger.
  - The C rule is a single frozen slope, not a shrunk refit. So the 2026-10-21 planted-signal warning (shrinkage hides an effect) does not apply to C. The reproduce-first step (§3) checks the pipeline instead: with the frozen slopes on the stage 3 race rows (plain 2019-01-02 → 2022-12-30, chosen 2021-03-01 → 2022-12-30) it must give 0.696 (plain) and 0.903 (chosen) to 3 decimals.

## 6. Multiplicity

- **Five scored cells:** A, B, C1, C2, D. Holm at α = 0.05 on the five p values. A is conjunctive inside the cell (both forecasts), so it needs no further correction.
- **p values:** two-sided from the bootstrap distribution against the no-effect value (slope 0, ratio 1), as `feedback_wide.pval`. For D, TOST: the larger of the two one-sided bootstrap p values against 22.5 and 27.5.
- **Disaggregation (descriptive, BH q = 0.10 with `chanceBaseline`):**
  - each cell by class (FX majors, FX crosses, indices, gold);
  - by σ tercile and by year;
  - by event/non-event;
  - C by instrument.
  - A slice that survives BH is a candidate for its own prereg, never a result.
- **Descriptive only:**
  - log-HAR persistence and log-HAR ÷ plain;
  - the stage 2 three-feature rule with frozen slopes;
  - the chosen-σ version of B;
  - the frozen-scale sensitivity (`cal` held at its 2022-12-30 value);
  - block 60;
  - the turbulent-onset lag event study (the Lesson 05 spell label needs 21 sessions of hindsight).
- **Promotion bar:** |t| ≥ 3 on the scored cell before anything feeds a live forecast. This study changes nothing live in any case (§8).

## 7. What this does NOT test

- **Direction.** Every cell is about size: variance, range, coverage. Nothing says which way price goes.
- **Trade P&L.** No stop, target or R is scored. Whether a feedback term helps a stop or a size is the Stop and Size layers' question, on their own measures.
- **Whether the chosen σ should ship with feedback.** A pass makes a side-by-side candidate, never an edit to the live forecast.
- **Governance (L8 part C):** CUSUM drift alarms, SPRT or e-process kill switches. They need simulated ARL calibration first.
- **Adaptive conformal bands.** Stage 2 found no gain, and they are not carried forward.
- **Vol surprise as a return signal (L8 part B).** Not built.
- **Cause.** Whether misses persist because vol clusters, because σ lags, or because the calibration drifts is not separated.
- **The lockbox (2026-08-21 onward).** Not read.

## 8. What each verdict changes

- **VALIDATED:**
  - A and B: the vol-layer page's "Feedback / monitoring" slot moves from "holds" in discovery to "holds out of sample". The Stop and Size layers may use one feedback term, fixed as registered here.
  - C1: the plain σ is confirmed as a poor RV forecast without feedback; it stays a benchmark only.
  - C2: `chosen σ + frozen feedback` becomes a side-by-side shadow σ with its own forward record. It is never an edit to the live lines.
  - D: the base lines are recorded as calibrated in 2023-26, pooled and by σ tercile.
- **NULL:**
  - A or B: the slot's "misses persist" or "big morning → big afternoon" line comes off the page, and no stop or size test may use it.
  - D: the chosen lines' calibration has drifted. The ladder needs a calibration check before any layer is built on it.
- **UNDERPOWERED:**
  - C1 or C2: the feedback gain is recorded as unconfirmed at the 5% bar. The next design is a frozen forward record from 2026-11-17, judged on QLIKE at a date fixed in advance. Or C2 is closed as untestable here if the owner judges a 5% QLIKE cut too small to chase.
  - A, B or D (unlikely, given the power table): record it and add years.
- **CONTEXT:**
  - The effect is real but local or too small. Example: C2 only in busy markets. The local slice goes to the research-director as a candidate prereg (a busy-tercile feedback term). It never becomes a rule from this study.

## Amendments

**2026-11-16, PRE-RESULTS (step 0 passed; no 2023+ outcome read yet).** These record how the script reads parts of §3-§6 that the text leaves open. None changes a pass bar, a frozen slope or the window.

1. **Step 0 passed.** Stage 3 reproduced exactly: persistence 0.4949 / 0.2453, morning 0.5637, plateau hl 1 0.7002 / 0.9137, chosen p75 25.5866%. Refit b₁ 0.675588 / 0.429893 (within 1e-4 of the frozen 0.67559 / 0.42989). In-sample frozen ratios 0.6958 / 0.9030. `discovery/reproduce.json`, `discovery/frozen.json`.
2. **Hourly RV.** The stage 3 cache was not reused. The script rebuilds it from M1 in two parts: discovery (M1 before 2022-12-31 00:00 UTC, built in step 0 and used to reproduce 0.564) and confirm (M1 from 2022-12-30 to before 2026-08-20 23:00 UTC, London dates 2023-01-01 → 2026-08-20). 5-minute returns never span two London dates, so the split changes nothing.
3. **Cell A verdict.** A is conjunctive, so the cell takes the weaker of the two forecasts' verdicts (order NULL < UNDERPOWERED < CONTEXT < VALIDATED).
4. **C rows.** C1 and C2 are scored on rows where the base, hl 1, hl 2, hl 3 and the +1 lag forecasts all exist, so every C comparison uses the same rows.
5. **Month placebos.** A month permutation puts an instrument's calendar-month blocks (scored rows only) in a random order. For C the EWMA input is permuted inside 2023-26 only; discovery history stays real, and the past-only scale is recomputed for each draw.
6. **Placebo-SD rule.** When the month-placebo SD exceeds 1.25 × the bootstrap SE, p = two-sided normal p of (estimate − no-effect value) ÷ placebo SD, floored at 1/2000.
7. **Event split.** Event days = `event` in {high, NFP, CPI, FOMC}; non-event = `none`; `unknown` is in neither.
8. **Concentration.** "Pooled miss" = the date's mean miss across instruments (plain σ for A-plain, B and C1; chosen σ for A-chosen, C2 and D).
9. **Disaggregation.** BH at q = 0.10 over the class, tercile, year and event slices of A, B and C plus C by instrument. In place of the JS `chanceBaseline` the script reports the expected number of false passes (0.10 × passes).
10. **Dropped descriptive item.** The turbulent-onset lag event study (§6, descriptive) is not run. It needs the Lesson 05 spell label and is not part of any gate.
11. **D TOST p.** p = the larger of the share of bootstrap draws at or below 22.5 and at or above 27.5, floored at 1/2000.

---

## RESULTS — run 2026-11-16

*Written to `analysis/output/vol-layer-feedback-confirm/RESULTS.md`. Nothing above this line changes after the run. Amendments go in an `## Amendments` section above this one, dated and tagged `PRE-RESULTS` or `POST-HOC (results seen)`.*
