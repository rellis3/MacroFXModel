# What information do the forecast and its levels contain? A cross-asset research roadmap

**Status: WITHDRAWN 2026-10-29 by the owner as broader than intended. Not an active plan.** The research continues as a controlled sequence inside the original day-reconstruction objective (milestones 1-4, then one next question at a time).
Written after milestone 4 of `day-reconstruction` (NQ continuation, null). Inputs: the milestone-2 archive
(`analysis/output/day-reconstruction/ARCHIVE.md`), the milestone 3 and 4 reports, and the earlier studies cited in §1.

## 1. Starting point

### What is already established

| Question | Evidence so far | Status |
|---|---|---|
| Is the forecast calibrated on average? | Point-in-time, 2020-08 → 2025-04, GOLD / NQ / EURUSD: HL, OH and OL exceedance within about 4pp of 50 / 25 / 10% (`VALIDATION.md`). Walk-forward over 36 instruments: mean out-of-sample exceedance 49.5% / 24.2% at p50 / p75 (`forge/out_vol_lon/vol_report.json`) | **Established** |
| Does price move differently at the forecast's levels than at nearby lines that aren't the forecast's? | Milestone 3: 24 of 378 cells nominally different vs 19 by chance, on 3 instruments. Path map (earlier lines, 34 instruments): 0 of 314 cells | **No**, on the 3 development instruments. Not tested for the production levels on the other 31 |
| Is there a direction after a touch (continuation, reversion, exhaustion, expansion past p90)? | Milestone 3: race about 40/40 at every level. Milestone 4: NQ continuation −0.05R net, same as the placebo and random controls | **Closed for entries** on GOLD / NQ / EURUSD |
| Does the forecast beat a simple volatility estimate? | The walk-forward fit included a "naive" constant-volatility candidate. It was never chosen (0 of 6 folds, every instrument), but only on **training** loss. No out-of-sample comparison with an interval exists. Nothing compared it against a plain recent-range estimate | **Open** |
| How much range is left, given the time and the range used so far? | Remaining-travel model (earlier HAR σ, not the production forecast): near-pass, missing the frozen rule by 0.1pp at one cell. "Is the high/low in": pullback + clock give +23% Brier skill; indicators +0.3% (`project_live_range_research_arc`) | **Partly established**, never on the production forecast |
| Can the forecast's miss be predicted before the open? | Descriptive only: p75 exceeded on 13 / 22 / 35% of days by implied-vol ÷ σ tercile. Weekday: Monday 19.3% vs Thursday 29.4% HL p75 exceedance. Gamma → next-day range validated on NQ and ES, about half of it from recent falls | **Suggestive, not registered** |
| Is any rule tradeable? | Rule A (break on rich-implied-vol days) passed pre-registration. Its forward record is judged 2027-10-29 | One candidate, in forward test |

### What this means

The milestone series asked whether the levels say **which way** price goes, and the answer was no. It hasn't asked
the question the evidence points to: does the forecast know **how much** a day will move, and how much is left,
better than simpler things do? Nor has it looked beyond three instruments.

### How range information could make money

If direction is symmetric, knowing the size of the day cannot by itself produce a positive expectancy. Range
information can only pay through three routes, which shape §3 R5:

1. **Sizing:** a steadier risk per trade, which improves an existing return stream.
2. **Feasibility filters:** skip trades whose target needs more range than is likely to be left after costs.
3. **Gating** a strategy whose edge depends on volatility, as rule A does.

A directional edge would need its own mechanism. The forecast has not shown one.

## 2. Universe and how to extend it

- **Development set: GOLD, NQ, EURUSD.**
  - Already used in milestones 1–4, so every further result on them is exploratory.
  - New questions are designed and first run here.
- **Confirmation set: the other 31 instruments with a production ladder.**
  - 26 FX pairs and five indices (SPX, DOW, US2000, DE30, UK100).
  - All 31 have point-in-time forecast parameters (walk-forward folds) and OANDA bid/ask M1 from 2016-10
    (`data/m1_bidask_bin`).
  - The production forecast's day and level behaviour has never been studied on them. Their M1 has been used by
    other studies (path map, line-touch scans), so they are unseen **for these questions**, not pristine data.
- **Rules for the confirmation set:**
  - Each question is frozen on the development set (rule, endpoint, thresholds) and run on the confirmation set
    once.
  - Nothing is chosen on the confirmation set.
  - Results are reported per asset class and pooled.
- **These instruments are not independent.**
  - FX pairs share dollar and euro moves; the indices share the equity factor.
  - Pooled intervals use a bootstrap clustered by **date across instruments**, so the effective sample is honest.
- **Time holdout:**
  - The lockbox after 2026-08-21 is about 45 sessions, too short for most questions. It's reserved for one final
    check.
  - Forward records are the only clean out-of-sample evidence after that.
- **Step 0: build the confirmation archives.**
  - Extend `build_archive.mjs` (its `INST` map) and the finalize/validate scripts to the 31 instruments.
  - Run the same checks A–I.
  - **No outcome is computed until the preregs are frozen.**
  - About 2 GB of gitignored path files; at most 5 parallel node jobs.
  - NQ is the only instrument whose production σ source (Yahoo) differs from the history's (OANDA). The other indices
    already use OANDA in production.
- **Cost screen**, computed once per instrument from bid/ask: median spread ÷ R at 0.25σ and 0.5σ.
  - Above 0.15, no strategy in this repo has survived costs (`project_execution_feasibility_gate`).
  - Those instruments stay in for the information questions but are excluded from tradability tests.

## 3. Ranked research questions

The ranking weighs information value (what a clear answer changes), feasibility with the archive as it stands, and
whether the result can be clean.

### R1 — Does the forecast know more about the day's size than simple alternatives? (rank 1)

- **Why first:** every other application assumes the forecast carries information specific to the day. If it is no
  better than a plain recent-range estimate, R2–R5 should use the simpler unit. It needs only the day tables, so it
  is cheap, and the answer is clean.
- **Assets:** development set, then the confirmation set.
- **Method:**
  - Point-in-time era 2020-08-21 → 2026-08-20.
  - Score each day's HL, OH and OL p50 / p75 / p90 with quantile (pinball) loss and exceedance, against two
    comparators.
  - The comparators are **controls only, never drawn as levels**:
    - **C-a, the instrument's normal behaviour:** trailing 250-day empirical quantiles of its own HL / OH / OL %. No
      volatility model.
    - **C-c, recent range:** trailing 20-day mean HL %, scaled to each quantile on the same training folds the
      forecast used.
- **Primary endpoint:** skill = 1 − loss(forecast) ÷ loss(C-c), pooled over the nine quantiles. Beating C-a is
  expected (volatility clusters), so it's reported as a sanity check, not as the test.
- **Proceed if:**
  - development skill > 0 with a 95% interval above 0;
  - **and** the pooled confirmation-set skill has an interval above 0, positive on at least 2/3 of instruments.
  - Outcome: the forecast is a validated, better-than-ordinary unit for size.
- **Stop or reinterpret if:**
  - skill vs C-c ≈ 0, which is a realistic outcome;
  - then the forecast's value is ordinary volatility clustering. It still works as a unit, but R2–R5 can expect no
    forecast-specific gain and must beat C-c to count.

### R2 — Given the time and how much range is used, how much movement is left, and is the high or low already in? (rank 2)

- **Why second:** milestone 3 and the earlier studies all point here. The forecast behaves as a ruler. This
  question decides whether the ruler adds anything once the clock and ordinary range are known. It directly serves
  target, stop and time-exit decisions, and session behaviour is part of it.
- **Assets:** development set, then the confirmation set (fits frozen per asset class).
- **Method:**
  - **Checkpoints:** each hour 01:00–21:00 London.
  - **Outcomes:**
    - further extension beyond the current high and low by 22:00, in σ;
    - P(new extreme ≥ 0.25σ beyond the current one);
    - P(the day's high/low is already in).
  - **Three nested models**, fit 2020-08 → 2023-08 and tested 2023-08 → 2026-08:
    - **M0, clock:** asset class × hour.
    - **M1, ordinary range:** M0 + range used, distance from the open and the Asia / London share of range, all in
      C-c units.
    - **M2, forecast:** the same quantities in forecast units (range used ÷ HL p50, distance to the next rungs).
- **Primary endpoint:** out-of-sample Brier / log-loss and pinball skill of **M2 over M1**.
- **Controls:**
  - M1, which is the instrument's ordinary behaviour, and M0, time of day alone.
  - For rung-distance features, the phantom ladder with milestone 3's curvature correction (B2).
- **Prior expectation:** M1 beats M0 by a lot (path map, remaining-travel and extreme-in results). M2 over M1 is the
  unknown.
- **Proceed if:**
  - M2 − M1 has an interval above 0 on the development set, and the same pooled on the confirmation set;
  - **and** calibration is within 3pp per decile.
  - Outcome: forecast-unit remaining range is a validated input for R5.
- **Stop if:** M2 ≈ M1. The useful quantity is then "range used vs a normal day", and R5 uses the C-c unit.

### R3 — When is the forecast systematically wrong, and is that knowable before the open? (rank 3)

- **Why third:** range-expansion and range-compression days are the only kind of size information that could gate a
  direction-free trade, such as rule A's breaks. The risk is data mining, so the conditioning list is short and fixed
  now.
- **Assets:** development, then confirmation.
- **Conditioning variables, fixed in advance, all from the archive:**
  - σ rank (volatility regime);
  - event tag (tagged days only);
  - weekday;
  - opening gap;
  - previous day's range used.
- **Optional arm:** implied vol ÷ σ from the existing CME settlement IV (7 instruments, 2020-09 onwards). It's
  existing repo data, not a new source, but it's flagged for your decision.
- **Outcomes:** log(realised HL ÷ forecast HL p50) and p75 exceedance.
- **Method:**
  - out-of-sample conditional exceedance per variable;
  - one combined model fit 2020-08 → 2023-08, tested 2023-08 → 2026-08 and on the confirmation set.
- **Controls:**
  - the same conditioning applied to C-c's errors. This tells whether the miss is the forecast's own or every simple
    volatility forecast's.
  - Benjamini–Hochberg across variables × instruments.
- **Proceed if:**
  - a variable shifts p75 exceedance by ≥ 5pp out of sample with an interval excluding 0;
  - it holds on the confirmation set;
  - and it isn't equally present in C-c.
  - Outcome: a candidate gate for R5 route 3, and a documented correction recorded as a side-by-side shadow, never
    applied live.
- **Stop if:** nothing exceeds chance. "Predictable range-expansion day" is then closed for this forecast. This also
  confirms or kills the existing weekday and implied-vol observations in one registered test.

### R4 — Do the levels behave like placebo lines on the 31 unseen instruments? (rank 4)

- **Why fourth:** low new information. Direction at levels is closed on the development set, and the earlier lines
  were placebo-like on 34 instruments. Once Step 0 exists, it costs almost nothing.
  - It turns milestone 3's three-instrument exploratory null into a confirmed one.
  - It's the only legitimate way to find an instrument-specific exception without searching for one.
- **Method:**
  - Milestone 3's code is re-run unchanged on the confirmation set.
  - **Primary endpoint:** the race at ±0.25σ and ±0.5σ, real minus the curvature-corrected phantom (B2), pooled per
    family, with Benjamini–Hochberg.
- **Proceed only if**, as specified in advance:
  - an effect beyond B2 has a pooled confirmation interval above 0;
  - **and** gross is above 2× the spread on instruments that pass the cost screen.
  - Then one costed execution test of that pattern alone, in milestone 4's format.
- **Stop (expected):** close direction at the production levels across the whole universe.

### R5 — Does any validated information survive as a trading decision after costs? (rank 5, conditional)

R5 runs only on what R1–R3 validate. It is a test of the three routes in §1.

- **Route 1, sizing:**
  - Does sizing by the forecast give a steadier realised risk than sizing by C-c?
  - **Endpoint:** dispersion of realised P&L per unit of risk, and realised loss per stop. Measured on time-matched,
    direction-free entries (milestone 4's other-day control), on bid/ask.
  - Prior: implied-vol sizing was noise (`project_iv_sizing_filter_verdict`).
- **Route 2, feasibility filter:** skip trades whose target needs more than R2's predicted remaining range.
- **Route 3, regime gate:** R3's expansion-day predictor applied to break trades.
- **Routes 2 and 3 need a strategy with its own direction edge.**
  - The only one is rule A, and its backtest data chose it.
  - Any filter result on that backtest is therefore exploratory. Confirmation would come from rule A's forward
    record, which is slow.
  - This is the main limit on how fast the project can reach a tradeable answer, and it is stated now so it
    doesn't come as a surprise later.
- **Controls:** the same rule in C-c units; time-matched random entries; real bid/ask with slippage sensitivity;
  same-minute ambiguity resolved against the trade; instruments failing the cost screen excluded.
- **Proceed if:** the net improvement over the C-c version has an interval above 0 → a forward record. **Stop if
  not.**

## 4. Excluded or deferred, and why

| Not proposed | Reason | What would reopen it |
|---|---|---|
| More entry tests at forecast levels (breaks, fades, limits, exit variants) on GOLD / NQ / EURUSD | Milestones 3–4: levels = placebo; NQ continuation null net | An R4 pattern that meets its pre-specified bar |
| Fading the p90 as exhaustion | Milestone 3: equal to the baseline | Covered inside R2 as "is the extreme in", a probability, not a fade |
| Late-day reversal (20–22 UTC) as its own study | A clock effect, not the forecast's | It appears in R2 as part of M0 |
| New indicators, order flow, macro data, new vol estimators | No question above needs them | A specific question that cannot be answered without one |
| Projected H/L as entry triggers | Behave like the other levels (milestone 3) | They appear in R2 as distance features |

## 5. Process for every question

- A register row and a prereg pushed before any output. One primary endpoint with a fixed threshold; secondaries
  corrected with Benjamini–Hochberg.
- Development set first, confirmation set once, lockbox untouched until a final check.
- **Controls:**
  - comparison prices drawn at the same clock time on **other** days (milestone 4's lesson);
  - distance placebos with the curvature correction (milestone 3's lesson);
  - an ordinary-behaviour comparator (C-c) wherever the claim is "the forecast adds information".
- **Tradability:** real bid/ask, slippage sensitivity, never resolving a same-minute ambiguity in the trade's
  favour.
- A question that fails its primary endpoint is banked and not re-run as variants. A failed strategy closes that
  strategy, not the data or the forecast.

## 6. Order and decision points

1. **Step 0:** build and validate the 31 confirmation archives. No outcome is looked at.
2. **R1.** **Decision point:** if the forecast is no better than C-c, R2 and R3 continue with C-c as the bar to beat.
   Their designs don't change.
3. **R2 and R3** (independent; can run in parallel).
4. **R4** (by-product of Step 0).
5. **Decision point:** choose R5's route from what R1–R3 validated, or stop if none did.

## 7. Decisions needed from review

1. **C-c and C-a:** comparators built only as controls. This is a deliberate exception to milestone 1's "no parallel
   calculation" rule. They never become levels.
2. Whether R3 includes the implied-vol ÷ σ arm (existing settlement IV, 7 instruments, from 2020-09).
3. Whether the 31 other ladder instruments are accepted as the confirmation set, given they are unseen for these
   questions but not for every study in the repo.
