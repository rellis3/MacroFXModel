# Vol Forecast V3, Stage C: registered experiments (2026-10-10, before any Stage C outcome is computed)

Owner-approved priorities of 2026-10-10.

**Safeguards:**
- The aim is to improve existing V3 outputs, not to add parallel models.
- No production parameter, dashboard output, bot or trade selection changes.
- The untouched forward block (`data/m1_forward/`, sessions after 2026-08-20) is **not used** for selection or tuning. It is used only under a separate, explicitly registered confirmation plan.
- Every result below is **retrospective** on previously explored history and is labelled so. Prospective evidence comes only from the shadow log.

## P1: Intraday probability correction (highest priority)

### What the page shows now (confirmed in code)
- **J2, path stats** (`js/ladderPathStats.js`): P(next O-H/O-L rung | this rung reached) = `oos_exceed[next] ÷ oos_exceed[this]` from `forecastLadderParams.js`. Static: no time, no event, no state.
- **K3, card "x% to median"** (`vol-forecast-v3.html` `_breakoutProb`): 2·(1 − Φ((1 − c) ÷ √(1 − t))), where c = running H−L ÷ incumbent `hl_median` (COG) and t = UTC clock fraction of the last H1 bar.

### Targets (fixed)
- **T1, next line.**
  - **Event:** the first touch (M1 bar high/low, minute t) of an export O-H/O-L rung r ∈ {p50, p75} in a London session. Lines: `pit_*`.
  - **Outcome:** the next rung (p75, p90) on the same side is touched at a minute ≥ t and before 22:00 London.
  - **Prediction time:** the touch minute.
- **T2, range to a line.**
  - **Rows:** hourly checkpoint h ∈ {02, …, 20} London, rows whose running H−L < L.
  - **Outcome:** session H−L ≥ L by 22:00 London.
  - **Two lines:**
    - **L_A** = incumbent COG HL median (what the card shows; research reconstruction, NY-close bars, no news multiplier);
    - **L_B** = export HL p50 (`pit_hl_p50`), the line the corrected display should describe.

### Predictions compared (all known at prediction time)

| Id | T1 | T2 |
|---|---|---|
| **Display** (what the page shows) | J2 static ratio | K3 formula |
| **Clim** | training rate per step | training rate per line |
| **Challenger** | rate by London hour of touch × step, shrunk to the step rate (m = 30) | rate by London hour × consumed decile (c = running H−L ÷ L), shrunk to the hour rate (m = 30) |
| T7 comparator (reported, not used for acceptance) | `js/bandReachParams.js` p75-given-median at the latest checkpoint before the touch (8 instruments, p50 → p75 only). **Note:** T7 was fitted on all dates through 2026 on `buildLadder` London-day lines, so it is in-sample here and on different lines | — |

**Fitting:**
- Challenger and Clim tables are fitted on sessions **before 2022-01-01** and then **frozen**.
- L_A rows exist only from 2020-08-21, so its tables are fitted on 2020-08-21 → 2021-12-31.

### Evaluation blocks
- **E-dev:** 2022-01-01 → 2024-12-31, `oos = 1`. Seen in aggregate in Stage B Part 3; used for breakdowns.
- **E-conf:** 2025-01-01 → 2026-08-20, `oos = 1`. These tables have never been scored there; the period was explored for other questions, so it is **non-independent retrospective confirmation**.

### Metrics
- Brier skill of Challenger vs Display and vs Clim, with session-block bootstrap 95% intervals (5 consecutive dates, all instruments together, 1,000 draws). Log loss reported.
- Calibration: max |predicted − realised| over deciles with ≥ 300 rows.

**Breakdowns** (each with an interval):
- class;
- session (hour bands asia 0–6, london 7–11, overlap 12–15, ny 16–18, late 19–21);
- consumed tercile (T2);
- year;
- instrument (≥ 300 rows).

### Primary endpoints and multiple testing
Three primary endpoints on E-conf, with **Holm over the 3**:
- T1 pooled over the four steps;
- T2-L_B;
- T2-L_A.

Breakdown cells carry no claims; a cell whose interval lies wholly below 0 is flagged as a failure.

### Acceptance (per endpoint, all required)
1. On E-conf, Brier skill vs Display ≥ 2% with the interval's lower bound > 0 (after Holm), and vs Clim with the lower bound > 0.
2. Max decile gap ≤ 3pp.
3. Skill vs Display positive in every year of E-dev and E-conf.
4. No class whose skill interval lies wholly below 0.

Otherwise, **rejected**.

### Scope if accepted
- Frozen tables exported as a shadow params file plus a pure module.
- A read-only shadow section showing the corrected probability beside the current display.
- **Not deployed and not shown on the live page until owner review.**
- Prospective logging follows the shadow spec v2 (immutable records). E1 in that spec is aligned to T1 / T2-L_B.

## P2: Release-day width correction on the chosen ladder

### Arms (identical rows)
- **S / SI:** as built in Stage B (`scripts/forecast_history/vf3_stage_b.py`; PIT σ, walk-forward folds, 5-session embargo, widths refit per fold).
- **S+E / SI+E:** the same, plus event-type dummies in the β regression: NFP, CPI, FOMC, high; "none" is the base; "unknown" gets its own dummy. Fitted per class per fold by the same ridge (`fit_beta`), widths refit per fold.

The point-in-time σ already contains the export's fold event multiplier, so E corrects only the residual.

**Rows:** out-of-sample 2020-08-21 → 2026-08-20. Event analysis uses rows with a known tag (calendar proxy, ≤ 2026-07-02).

**Metrics:**
- Pinball ratio (S+E ÷ S; SI+E ÷ SI): all 12 rungs and per quantity, overall, on non-event days and per event type;
- coverage per rung per event type;
- HL / O-H / O-L p75 miss per event type;
- by fold and by class.

Date-block intervals as Stage B (block 20).

**Acceptance (all required):**
1. Overall pinball ratio: upper bound ≤ 1.000.
2. NFP + CPI days pinball ratio: upper bound < 1.
3. On NFP and on CPI, HL p75 exceedance within 25 ± 3pp, or closer to 25 than the existing arm by ≥ 2pp, **without** any O-H/O-L p75 moving further from 25.
4. Non-event days and every other event type: ratio point estimate ≤ 1.005.
5. NFP + CPI improvement in ≥ 4 of 6 folds.
6. No class worse than 1.005.

**Not a target in itself:** 25% exceedance alone. Failing any rule means "no correction".

**Power, stated:** about 70 NFP and 70 CPI dates over six years (instruments correlated within a date). A null is likely to be "underpowered", not "no effect".

**Even if accepted:** the current ladder stays unchanged. The corrected multipliers go to the shadow for prospective evidence.

## P3: Consolidation (2-hour) shadow (no feature expansion)
- **Pre-freeze development check** (shadow spec v2 §9 item 1, development only, not evidence): the reduced E2-hour model (IEP M0 without IV, plus London hour) vs the registered M0 + hour (with IV). Walk-forward on 2022–24 exactly as IEP-TIME. **Rule:** if E2-hour's Brier is within 0.2% of M0 + hour, freeze E2-hour; otherwise freeze M0 + hour with a live-type IV source.
- **Evaluation:** prospective W1 only (shadow spec v2 §5 criteria). W0 (the forward block) is **not** run; it is held for the single final confirmation plan.

## Lockbox and the as-shipped production ladder (finding, 2026-10-10, before any Stage C outcome)
- **Git history:** `js/forecastLadder.js` and `js/forecastLadderParams.js` were **first committed on 2026-08-20** (`462686f9`). Later param versions: `d3a2454f` (2026-08-20), `cf266651` (2026-08-21), `77f6ef2b` (2026-09-29).
- **The production ladder was first shipped for the 2026-08-21 session**, and the archive's first ladder record is that date.
- **Conclusion:** the as-shipped production ladder **has no history inside the previously examined data** (≤ 2026-08-20). It cannot be evaluated as shipped without the forward block. This is reported as a limitation. **The forward block is not used.**
- **What exists instead:**
  - (a) the point-in-time research reconstruction (`pit_*`, Stage B Part 1);
  - (b) the as-shipped **incumbent COG lines** on pre-open archive records (Stage B Part 2).
- **Proposed single final confirmation plan** (to be registered separately when the shadow goes live): the forward block plus the first 60 valid prospective sessions, scored once, for the one decision that matters most: whether the chosen ladder and the P1-corrected intraday probabilities beat the production export and the current displays out of sample. HAR-800 is excluded on that window (lockbox).

## Results record (2026-10-10), detail in `analysis/output/vf3_stage_c/RESULTS.md`
- **P1, not accepted as registered** (all three endpoints fail only the ≤ 3pp calibration rule; Holm p = 0.003):
  - T1: +7.1% [6.0, 8.3], calibration 4.1pp;
  - T2-L_B: +27.8% [25.9, 29.6], calibration 6.6pp;
  - T2-L_A: +40.5% [36.9, 43.8], calibration 6.7pp.
  - Every year, class and instrument positive. The cause is level drift of tables frozen on pre-2022 data.
- **P2, null (not accepted):**
  - S + E: overall 1.000 [0.999, 1.001], NFP + CPI 1.001 [0.996, 1.006], NFP HL p75 31.4 → 31.6%;
  - SI + E: overall 1.000, NFP + CPI 0.997 [0.983, 1.014];
  - folds 2–3 of 6.
- **P3:** E2-hour within 0.07% of M0 + hour → freeze E2-hour. Both are about 5.3–5.5pp off in the worst calibration decile on 2022–24.
- **Lockbox:** the as-shipped production ladder has no history before 2026-08-21, so it was not scored; the forward block was not used.
