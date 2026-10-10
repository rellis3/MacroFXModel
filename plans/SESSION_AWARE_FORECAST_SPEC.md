# Session-aware forecast: specification for a shadow evaluation

Written 2026-10-10 from `forge/IEP_TIME_PREREG.md` and `forge/INTRADAY_EXTREME_PATHS_PREREG.md` (Stages 0-3). It is a **specification for a
read-only shadow page**. Nothing here changes production code, the export, a bot or a live rule. Evidence for each component is cited by
test and by status:
- **Demonstrated:** it passed a registered out-of-sample test (2022-2024) and is stable by year.
- **Descriptive:** it is real but not worth a model term, or the existing model already reproduces it.
- **Unsupported:** it failed, or it is unstable.

## What it says each hour, per instrument

| Output | How it is computed | Evidence |
|---|---|---|
| **Expected range today** | v3 export HL / OH / OL ladder, with a **weekday correction to σ**. | Export lines are calibrated on average (`forecast-record-pit`). Weekday bias confirmed out of sample: HL p75 exceeded Mon 19.3%, Thu 29.4% against the 25% target. The fix is already validated (`forecast-persistence-fix`, which removes the Mon/Thu skew). **Demonstrated (reused).** |
| **Range consumed** | Running H−L ÷ export HL p50 (`used50x`). | Measurement, not a forecast. |
| **Remaining range** | Existing layer-5 / Live Range remaining-travel tables (the vol-time clock). | `intraday-range` validated; `live-range-clock`: the clock does most of the work. **Demonstrated (reused).** |
| **Band-hit probability** for the export OH/OL p75 and p90 by 22:00 London | Logistic on **distance z = (line − price) ÷ (σ_export × √v_left)**, log v_left, range consumed and the **extension flag** (the p50 line on that side already touched). Calibrated within ~2pp (EXT side) and ~0.6pp (opposite side) by decile. | Hour, session and weekday add nothing beyond these (all skill below 0.1%, Family T). Extension adds +4.2pp under the registered control, or **+2.4pp once range consumed is controlled**. 33 of 34 instruments are positive, as is every year. **Demonstrated, small.** |
| **Consolidation probability** (no ±1u move in the next 2 hours, u = σ × √(vol-time share of the window)) | The same state model plus **hour of day**, plus a **tier-1 event-day × session** term. | Hour: +1.05% Brier [0.85, 1.26] beyond the vol-time clock, every year and every class (Family T). Event × session: overlap consolidation 27.9% on tier-1 days vs 43.4% otherwise (Family X, stable by year). **Demonstrated.** |
| **Which side first / direction** | **Not produced.** Report 50/50. | No layer beats a 50/50 forecast (Stage 2). First touch of the p75 lines is up 48–53% by session and weekday. **Unsupported.** |

## How the estimates move through the day (test block 2022-2024, all instruments)

- **Band attainment falls with the clock, and the clock is already in z.** The chance of the extension-side p75 line falls from about
  33% (02:00–10:00) to 21% (15:00), 8% (18:00) and 1% (21:00). The model without any hour term tracks this within ±1.2pp at every hour.
- **Consolidation does not follow the vol-time clock exactly.** Compared with the state model without hour:

  | Hours (London) | Consolidation vs the model |
  |---|---|
  | 02–04 | +7 to +9pp (quieter) |
  | 06–08, London open | −8 to −12pp |
  | 13–14, US data | −7 to −8pp |
  | 19–20 | +5 to +7pp |

  This is why hour is in the consolidation model only.
- **Sessions:** the London and overlap sessions expand range less than the state model predicts (−4pp). Once hour is included, session adds no further information.
- **Weekday:** Monday has fewer band hits (−3.8pp), less expansion (−6pp) and more consolidation (+3pp), in all three years. Fix it in **σ**, at the daily level, as the reused validated fix already does, not with intraday weekday terms (not credited in Family T).
- **Event days:** on FOMC, NFP and CPI days the overlap and NY sessions consolidate far less and expand more. Asia and London are unaffected or calmer.

## GOLD "after an upward extension" (the band-read numbers)

The band read's headline replicates out of sample on the export lines. At 10:00, once the upper p50 is reached, the p75 line is hit by
22:00 on 50.8% of days, against 18.8% when it is not reached.

But about three-quarters of that gap is distance: a distance- and time-matched model gives 42.9%. Gold's own extra effect is +6.0pp
[0.3, 11.7], not significant after Holm and driven by 2024.

Hour band does not change it. Weekday does: Monday −11pp, Friday +19pp beyond geometry, on 60–74 dates per weekday. The Monday part is the
known σ bias; the Friday part is unexplained and is a forward-check item only.

**Wording for the page:** "p75 reached on ~51% of days like this; ~43% is explained by how close price already is and the time left."

## Unsupported: do not build on these

- **Earlier-session extremes as levels.** The Asia and London highs and lows behave exactly like placebo levels after they are touched (8 tests, all within ±2pp).
- **The late-session reversal** (19:00–21:00). It was −4.5 to −5.1pp in 2022–24 but reversed in 2025–26.
- **Family C subgroups.** No structure beyond the clock (global permutation p = 0.34 to 0.91).
- **A New York clock instead of the London clock** for the overlap and NY hours (p 0.12).
- **Weekday or hour as direction signals.**

## Smallest feature set for the prospective shadow

Seven inputs, all computable at the checkpoint from data the server already holds:

1. **σ_export,daily** with the validated weekday correction.
2. **v_left**, the vol-time share of the day remaining, from the class intraday variance profile.
3. **z to each band:** (line − price) ÷ (σ × √v_left).
4. **Range consumed**, `used50x`.
5. **Extension flag:** the p50 line already touched on that side.
6. **Hour of day** (London), for consolidation only.
7. **Tier-1 event day × session**, for consolidation and expansion only.

**Shadow rules:**
- Log the hourly probabilities from the forward block onward, starting 2026-08-21.
- Score them weekly with Brier and reliability against the plain export base rates.
- Change nothing live until it has run for at least 60 sessions and a pre-registered check passes.
