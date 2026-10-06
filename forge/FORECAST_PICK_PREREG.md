# STEP A — Pick ONE forecast: head-to-head of every candidate (Lesson 03 §02, Lesson 02 stopping rule)

*Pre-registered 2026-10-06, before any number in this file was computed. Part of
`plans/LESSON_TARGET_REBUILD_PLAN.md` (END STATE, step A). It ends the forecast work: whatever this picks is the one
set of daily lines; the rest move to an archive menu. No Vote Atlas input.*

## Why

Five sets of daily lines exist and none was ever scored against the others on one yardstick: the plain export,
IV-adjusted (live export), HAR-800 (another session's preferred candidate), persistence-adjusted (live shadow), and
persistence + implied vol (passed, not live). Lesson 02: cap the effort per direction, then decide.

## Rows, folds, score

- **Rows:** the Step 0 table (`forge/FORECAST_HISTORY_SPEC.md`), out-of-sample sessions 2020-08-21 → 2026-08-20,
  complete sessions (last bar ≥ 20:00 London).
- **Walk-forward:** folds 0–5. Each candidate's coefficients and widths are fitted only on sessions before each fold's
  first test date minus a 5-session embargo (as forge/FORECAST_FIX_PREREG.md).
- **Score (the Step 1 yardstick):** pinball over all 12 rungs ÷ the session's plain σ_used, pooled.
  Date-block bootstrap (block 20, 2,000 reps).

## Candidates (each with widths refit per fold by the same method)

| # | candidate | σ |
|---|---|---|
| P | **plain** | the export's live-settings σ_used (event multiplier included) |
| I | **IV-adjusted** | σ_used × exp(k · (log(IV ÷ σ) − mean)), k fitted per class (the live IV-adjusted form, refit walk-forward) |
| H | **HAR-800** | HAR-log σ over the last 800 New York-close bars (`analysis/output/ladder_candidates/d1/<SYM>_har800.csv`, value from the last bar strictly before the session), as its own study defined it (no event multiplier) |
| S | **persistence** | forge/FORECAST_FIX_PREREG.md variant 1 (live) |
| SI | **persistence + IV** | variant 1 + log(IV ÷ σ) (arm C) |

Two scoreboards, because implied vol exists for 13 instruments only:
- **all 34:** P, H, S;
- **IV-13:** P, I, H, S, SI.

## The pick (fixed now)

1. **Eligible** = beats P: pooled ratio vs P with its whole interval below 1; HL p75 regime miss (max |exceedance −
   25%| across quiet / normal / busy) no larger than P's; no class worse than P by more than 0.5% (point).
2. **Best** = the lowest pooled pinball among eligible candidates.
3. **Tie rule (simplicity):** if a simpler eligible candidate's pinball is within 0.5% of the best (point estimate),
   it wins. Order, simplest first: P, S, I, SI, H. S and I are already live, SI combines two live parts, and H
   needs a new live estimator.
4. **The product:** the IV-13 winner where implied vol exists, and the all-34 winner elsewhere. When those differ
   only by the IV term (SI and S), that is one forecast with a fallback, exactly as the IV-adjusted export already
   works.
5. If nothing is eligible: P stays, and the forecast work ends anyway.

## After the pick

The chosen forecast is the Daily Plan's lines; the forward scorecard is its second, independent test (Lesson 02 §05).
The others move to an archive menu. Live Range is re-pointed at the chosen σ.

## Output

`analysis/output/forecast_pick/RESULTS.md`; script `scripts/forecast_history/forecast_pick.py`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | PICK: SI where IV exists, S elsewhere (2026-10-06) |
| 1 | **live-type implied vol** for SI (below) | research IV (CME CVOL) ≠ the live sources | yes, before its results — the one allowed variant; the forecast work closes after it |

## Variant 1 — live-type implied vol (logged 2026-10-06 after variant 0's pick, before variant 1 is run)

The live server reads 30-day ATM implied vol from the QuikStrike capture for the USD majors and GVZ for gold, not CME
CVOL. Variant 1 rescored SI on the history of those sources:

- **USD majors:** CME settlement-inverted 30-day ATM (`oi_research_book/data/iv_daily_*.parquet`, `iv30`, from
  2020-09). The same series the IV-adjusted export was calibrated on.
- **GOLD:** GVZ.
- **Indices:** VIX / VXN, unchanged.
- **IV ÷ σ uses the live estimator's σ_daily** (as every other variant-1 feature does).

Rows: where SI exists. FX majors' SI needs ≥ 500 training rows with IV, so it starts after the first IV year.

**Decision (fixed now):**
- SI ships for the IV instruments only if, on these rows, it is still eligible (same three rules vs P) **and** beats
  S by more than 0.5% (the tie rule).
- Otherwise S (persistence) ships for all 34.

Either way the forecast work closes here.
