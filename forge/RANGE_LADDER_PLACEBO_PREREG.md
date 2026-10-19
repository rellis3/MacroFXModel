# range-ladder-placebo — Do the Asia/Monday range-ladder lines carry information that the same ladder at the wrong price does not?

**Pre-registered 2026-10-19, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `range-ladder-placebo` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `range-ladder-placebo` |
| Data | OANDA M1, local research cache (`VolRangeForecaster/data/m1`, R2 not used). The live range-line bot universe: gold, audjpy, audusd, nzdjpy, nzdusd, usdjpy, cadjpy, eurjpy, gbpjpy, euraud, eurusd, gbpusd, usdchf, usdcad (`RL_STRONG_PAIRS`) and nq, spx500, de30, us30, us2000 (`RL_BOT_INDEX`). Window **2016-01-04 → 2026-08-20** (the cache's last bar; inside the lockbox cut of 2026-08-21) |
| Seed | `20261019` (mulberry32; the only random draw is the placebo shift) |
| Uncertainty | session-date block bootstrap, all 19 instruments of a date resampled together, block = 21 sessions, B = 2000 |
| Scripts / outputs | `scripts/range-ladder-placebo/` → `analysis/output/range-ladder-placebo/` |
| Harness | own script. `js/harness/runStudy.mjs` scores a daily signal against forward returns from the feature store; this is a touch-level race on M1 paths, so it reuses the range-line book's own functions instead (`buildRangeLadder`, `analyseRangeWindow`, `bodyRange`, `bucketM1IntoSessions`), unedited. |

## 1. The claim

The range-line book (`range-line-strategy.html`, `js/rangeLineAnalyser.js`, the live `range_line_bot`) treats every
half-integer fib line off the Asia range and the Monday range as a line where price either reverts toward the range
mid or continues away, and learns per line whether to fade or follow. Its reported edge (single-pair Sharpe 4.7–6 at
2–3× cost, `MD files/BACKTEST_INDEX.md`) assumes the **location** of those lines matters. The claim tested here: at a
real ladder line, the race "next line in" vs "next line out" resolves differently from the same race at a line of the
same ladder shifted to the wrong price.

## 2. Why it is not already settled

- `level-touch` (null, 2026-09-10) tested prior-day high/low, the daily open and the p50/p75/p90 vol range lines
  against random prices. It did not include the Asia or Monday fib ladder.
- `iep-time` family H2 (`forge/IEP_TIME_PREREG.md`) found raw Asia/London session extremes no different from
  ±0.15σ placebo levels. Those are the ladder's 0 and 1 lines only, with a different outcome race, and no Monday
  ladder and no extension lines.
- `range-level-edge` (`js/rangeLevelEdgeEngine.js`) was built for this question and never run (`august action plan.md`
  A4). It tests only the Asia edges plus today∩yesterday confluence, with a fixed-pip placebo and no significance test.
- The book itself was never placebo-tested. Its policy is fitted per line on in-sample data, so a policy fitted on
  meaningless lines could still look good; this test removes the policy and asks only about location.

## 3. Definitions, fixed in advance

- **Sessions**: `bucketM1IntoSessions(packed, 0)` — the range-line route's default (`boundaryHour 0`, UTC midnight).
  This deliberately matches the book under test rather than the London session in `plans/DATA_SPEC.md`.
  `minBarsPerSession` 30, first 20 sessions skipped (`minLookback`), as in `runRangeLineAnalyser`.
- **Asia ladder**: range = `bodyRange(first 6 h of the session, 5)`; `validFrom` = session start + 6 h; only if the
  session has bars after that. **Monday ladder**: range = `bodyRange(Monday session, 15)`, used Tuesday–Friday of that
  week from the session's first bar. Both exactly as `runRangeLineAnalyser`.
- **Real ladder**: `buildRangeLadder(low, range, 'A'|'M')` — every half-integer fib from −9.5 to 10.5.
- **Placebo ladders**: for each session and each source, K = 4 copies of the real ladder with `low`, `high` and every
  line shifted by `s = u × range`, `u ~ Uniform[0.10, 0.40]` with a random sign (seed above). Spacing is unchanged, so
  every race has the same barrier distances. Shifts are never a multiple of the 0.5-range rung, so no placebo line
  sits on a real line. Labels are kept, so a placebo line belongs to the same cell as the real line it was shifted from.
- **Outcome**: `analyseRangeWindow` on the session's M1 bars, unedited (no touch features, no confluence). Per touched
  line: `reverted` (inner neighbour reached first) = 1, `continued` = 0. Races still open at session close are marked
  by the session close, as in the book; their share is reported for real and placebo separately.
- **Cell**: source × line label (e.g. `A_1.5`, `M_-0.5`).
- **Δ**: real revert rate − placebo revert rate (placebo pooled over its K copies), in percentage points.

## 4. Hypotheses, expectation first

| Cell | Expectation | Pass bar |
|---|---|---|
| P1 pooled Δ, all cells, all instruments | prior: ≈ 0 (every level-location test on this desk has been null) | **THE GATE**: two-sided bootstrap p < 0.05 **and** \|Δ\| ≥ 2.0 pp **and** both halves (2016-01 → 2020-12, 2021-01 → 2026-08) the same sign |
| P2 per cell, cells with ≥ 100 real touches | most ≈ 0 | **THE GATE**: BH q < 0.10 across these cells **and** \|Δ_c\| ≥ 3.0 pp **and** both halves the same sign |
| — | **THE MIRROR**: Δ > 0 means real lines revert more (fade side); Δ < 0 means they continue more (follow side). The book trades both, so both signs pass. | |
| C1 control: placebo copies 1–2 vs 3–4 | Δ ≈ 0 | must have 95% CI containing 0, else the design is biased and no verdict is banked |

Verdict: **VALIDATED** if P1 or any P2 cell passes its gate (C1 clean). **NULL** if nothing passes and the P1 95% CI
lies inside ±2.0 pp. **UNDERPOWERED** if nothing passes and the P1 CI is wider than that.

## 5. Power

Touch counts are not known before the run. The MDE for P1 and for each P2 cell is computed from its bootstrap SE as
`2.8 × SE` (80% power, two-sided 5%) and reported. A P1 MDE above 2.0 pp makes a non-pass UNDERPOWERED, not NULL, by
the rule above. Instruments are not treated as independent: the bootstrap resamples dates with all instruments.

## 6. Multiplicity

One pooled cell (P1) at α = 0.05; P2 cells under BH q = 0.10 (expected count ≈ 2 sources × the lines that reach 100
touches). One design, one variant: no alternative shift range, K, barrier or session split is run. A P2 survivor is a
candidate for a confirmation prereg on forward data, not a trading rule. Anything live needs |t| ≥ 3.

## 7. What this does NOT test

- Whether the book's policy, exits or sizing make money. A NULL here says the line locations add nothing beyond a
  ladder at a random price with the same spacing; the book's results could still come from its exits.
- Confluence-filtered lines (`confluence_min`), touch-feature conditions (approach velocity) or the held-position model.
- The London-session split, other range windows, or the 0.25/0.75 lines (not half-integers).
- Costs: the outcome is a race, not a P&L; real and placebo face the same spread.

## 8. What each verdict changes

- **NULL**: the Asia/Monday line locations carry no information. The range-line book's reported edge then has to come
  from somewhere other than where the lines are, and should be re-examined (run the book's own pipeline on placebo
  ladders) before more money or work goes on it. No new level-family page is built without beating this placebo.
- **VALIDATED**: the passing cells are real location effects. Each gets its own confirmation prereg on sessions after
  2026-08-21, and the book's per-cell policy can be checked against them.
- **UNDERPOWERED**: the question stays open; widen the instrument set or wait for forward data.

## Amendments

### A1 — 2026-10-19 — PRE-RESULTS

While wiring the script, a check of which bars land in each session showed that `bucketM1IntoSessions(packed, 0)`
labels every UTC day with the **next** date (`getUTCHours() >= 0` is always true). Grouping is still by UTC day, so
the Asia ladder is unaffected, but `runRangeLineAnalyser`'s Monday range is then built from the session labelled
Monday, which holds **Sunday evening's stub** (EURUSD 2026-08-03 label: 174 bars, 2026-08-02 21:04 → 23:59 UTC), and the
real Monday is labelled Tuesday. Testing that would test a Sunday-evening ladder under the Monday name.

Change: session keys are re-labelled to their true UTC date (label − 1 day) before anything else, so the Monday ladder
comes from the real Monday, and Saturday/Sunday sessions (the weekend stub) are excluded as in `plans/DATA_SPEC.md`.
Nothing else changes. No outcome had been computed: the only data read so far was bar counts and the session check
above. The book's own handling is recorded as a fault (`plans/DATA_SPEC.md` §5) for whoever owns the book.

## RESULTS

Run 2026-10-19 → `analysis/output/range-ladder-placebo/RESULTS.md`. **UNDERPOWERED (no verdict by the registered rule)**: control C1 failed (−0.09 pp, CI [−0.16, −0.02]). Descriptive: real lines revert +0.91 pp more than shifted ladders [+0.82, +1.01], under the 2-pp bar; the difference sits at the Asia range edges (A_1 +3.07, A_0 +2.83).
