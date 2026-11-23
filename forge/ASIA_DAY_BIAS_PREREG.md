# asia-day-bias — Does the Asia session (00:00–07:00 London) tell you which way the London/New York day (07:00–21:00) goes?

**Pre-registered 2026-11-23, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `asia-day-bias-all` (S1), `asia-day-bias-usd` (S2), `asia-day-bias-jpy` (S3), `asia-day-bias-crosses` (S4), `asia-day-bias-gold` (S5), `asia-day-bias-indices` (S6), `asia-day-bias-oneway` (S7), `asia-day-bias-v1-agree` (S8) |
| Branch | `main` (owner rule: push to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `asia-day-bias` |
| Data | Local OANDA mid M1 (`VolRangeForecaster/data/m1/<key>_m1.parquet`), 34 instruments (below), London dates 2016-01-04 → 2026-08-20 (cache end; lockbox 2026-08-21 respected) |
| Seed | `20261123` |
| Uncertainty | date-block bootstrap, block 21 sessions, B 2000, dates resampled jointly across instruments |
| Scripts / outputs | `scripts/asia-day-bias/` → `analysis/output/asia-day-bias/` |
| Harness | own script (`score.py`): needs London-clock session cuts on M1, which the harnesses don't do |

## 1. The claim

Owner, 2026-11-23: "Have you done any regression testing to see if the Asia session can gauge the bias for the day?"
The desk habit it tests: read what Asia did overnight and lean the day that way (continuation), or against it
(reversal). Either sign counts as "gauging the bias"; the test is two-sided.

## 2. Why it is not already settled

- `gr-today-tape-direction` (NULL): the 00:00–13:00 move against 13:00–21:00, 7 dollar pairs. Different window (it
  includes all of London morning) and no crosses, gold or indices.
- `bias-learner-fx` (NULL): the Asia move was one of ~14 inputs in a pooled logistic; its own contribution was never
  reported, and no crosses, JPY crosses, gold or indices.
- `asia-range-london` (CONTEXT): wide Asia lowers London's remaining range. That is size, not direction.
- `range-ladder-placebo-confirm` (VALIDATED): Asia high/low edges revert slightly on touch. Levels, not day direction.
No banked entry has asked whether Asia's direction calls the 07:00–21:00 direction, per asset group, with the size
and one-way conditioning below, or as a confirmation of the bias engine.

## 3. Definitions, fixed in advance

- **Clock.** All times Europe/London (BST/GMT by the zone). A session is a London weekday date D.
- **Prices.** P00 = open of the first M1 bar starting in [00:00, 00:30) on D. P07 = close of the last bar starting in
  [06:30, 07:00). P13 = close of the last bar starting in [12:30, 13:00). P21 = close of the last bar starting in
  [20:30, 21:00). A session missing any of P00/P07/P21, or with fewer than 60% of the 420 Asia minutes present, is
  dropped and counted per instrument.
- **Asia move** A = ln(P07/P00). Asia high/low = max high / min low of bars in [00:00, 07:00).
- **Day move** (primary outcome) D = ln(P21/P07). Descriptive only: morning M = ln(P13/P07).
- **Scale.** σ = standard deviation of the last 60 NY-close (17:00 New York) daily log returns built from M1, ending
  before 00:00 London on D (data-rules item 2). zA = A/σ, zD = D/σ, each winsorised at ±5. Needs ≥ 60 prior NY days.
- **Knowable when?** A is complete at 07:00 London, the start of the outcome window; σ uses only earlier days.
- **Instruments (34), groups fixed:** USD majors (7): eurusd gbpusd usdjpy audusd nzdusd usdcad usdchf. JPY crosses
  (6): eurjpy gbpjpy audjpy nzdjpy cadjpy chfjpy. Other crosses (14): euraud eurcad eurchf eurgbp eurnzd gbpaud
  gbpcad gbpchf gbpnzd audcad audchf audnzd cadchf nzdcad. Gold (1): gold. (NZDCHF, the 28th pair, has no M1 file in the cache.) Indices (6): nq spx500 us30 us2000 de30 uk100. Total 34. (xauusd and nas100_usd are byte-copies of
  gold and nq; spx/dow are shorter futures files: all excluded.)
- **Metric S1–S6 (continuation IC).** Per instrument, Pearson correlation of zA and zD over its sessions; group value =
  equal-weight mean over the group's instruments. Positive = Asia continues, negative = Asia reverses.
- **Metric S7 (big one-way Asia).** Days where |A| is above the instrument's own trailing-250-session 67th percentile
  of |A| (prior sessions only, needs ≥ 120) AND efficiency |ln(P07/P00)| / ln(AsiaHigh/AsiaLow) ≥ 0.6. Value =
  mean of sign(A)·zD over those days (σ units, pooled over all 34 instruments, equal weight per instrument), minus
  the same quantity with A taken from the all-shift placebo (removes drift: on NQ "up" is the drift).
- **Metric S8 (Asia agrees with the V1 bias engine).** On London dates where the point-in-time V1 replay
  (`scripts/bias-engine-backtest/run_engine.mjs`, `engine_daily.csv`) speaks (dir ≠ NEUTRAL, strength ≥ 1) on a
  market in this list: hit rate of the V1 side on 07:00–21:00 when sign(A) = V1 side, minus when sign(A) ≠ V1 side.
  Runs only if `engine_daily.csv` is rebuilt unchanged from the banked bias-engine-backtest code; otherwise S8 is
  reported as not run (no verdict), and tracked forward for V1 and V2 on the bias scoreboard instead.
- **Control (placebo).** All-shift: within each instrument, A from session t−k paired with D from t, k = 5…54
  (50 shifts). Real value is read against the placebo distribution (percentile) and the placebo mean.
- **Uncertainty.** Date-block bootstrap, 21-session blocks, B 2000, seed 20261123, same dates for every instrument.
- **Halves.** Split at the median session date of the pooled sample.

## 4. Hypotheses, expectation first

| # | Question | Expectation |
|---|---|---|
| S1 | All 34: does zA correlate with zD? | **Null** (|IC| < 0.02): nearest banked windows were null |
| S2 | USD majors | Null |
| S3 | JPY crosses (Asia is their home session) | Slight continuation possible, < 0.05 |
| S4 | Other crosses | Null |
| S5 | Gold | Null |
| S6 | Indices (US futures' Asia leg) | Null to slight reversal |
| S7 | Big one-way Asia follows through beyond drift | Null (< 0.05σ) |
| S8 | V1 calls hit more when Asia agrees | Unknown; small (< 4pp) |
| | **THE GATE** (S1–S6): |IC| ≥ 0.05, bootstrap 95% CI excludes 0, same sign in both halves, real value outside the placebo's 2.5–97.5% range, Holm α 0.05 over S1–S7. S7: |value| ≥ 0.10σ with the same conditions. S8: |difference| ≥ 4pp, CI excludes 0, both halves. | |
| | **THE MIRROR**: built in; the test is two-sided, a reversal passes the same gate with negative sign. | |

## 5. Power

Computed by the script from the all-shift placebo only (A from other dates, so no real Asia→day relationship is
read): MDE = 2.8 × the placebo's standard deviation of the cell value (80% power, two-sided 5%). Reference point: the
banked `gr-today-tape-direction` on 7 pairs and ~2,750 sessions had MDE 0.034 against the same 0.05 bar. A cell whose
MDE exceeds its bar is UNDERPOWERED by design and cannot be NULL. A planted-signal control (zD' = zD + 0.06·zA on a
copy) must be recovered by the S1 pipeline at ≥ 80% across 200 bootstrap draws before any real cell is read; the
plant result is printed first.

| Cell | Planned n | Bar | MDE |
|---|---|---|---|
| S1 | ~34 × 2,700 sessions | 0.05 IC | from placebo, expected ~0.02 |
| S2 / S3 / S4 / S6 | 7 / 6 / 14 / 6 instruments × ~2,700 | 0.05 IC | expected 0.025–0.04 |
| S5 | 1 × ~2,700 | 0.05 IC | expected ~0.05: may be UNDERPOWERED |
| S7 | ~34 × ~450 qualifying days | 0.10σ | from placebo |
| S8 | V1 speaking days × markets | 4pp | from placebo (shuffled A) |

## 6. Multiplicity

Scored cells S1–S7: Holm at α 0.05 (bootstrap p via `pFromCI`), plus the conjunctive halves + placebo gate. S8 is
its own family (one cell). Per-instrument ICs (34), the morning window and per-year values are disaggregation: BH at
q 0.10 with a chance baseline; a survivor is a candidate for its own prereg, never a result.

## 7. What this does NOT test

Tradability after costs (no entries, stops or spread), intraday paths, Asia high/low as levels, the size of the day,
event days separately, or V2 (no history: V2's Asia agreement is tracked forward only).

## 8. What each verdict changes

- **Validated (a group):** an "Asia lean" line on the Desk Bias Process pack for that group, as context; a forward
  cell on the bias scoreboard. Nothing trades on it until |t| ≥ 3 or a forward pass.
- **Null:** the terminal and the AI desk stop treating the Asia move as a day bias for that group.
- **Underpowered:** say which group and what sample would resolve it.

## Amendments

(none)
