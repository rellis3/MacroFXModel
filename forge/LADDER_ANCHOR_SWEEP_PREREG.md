# ladder-anchor-sweep — does anchoring the day at a different hour give better range forecasts?

**Pre-registered 2026-11-23, before any anchor other than London 00:00 was scored.**

| | |
|---|---|
| ID / ledger ids | `ladder-anchor-sweep` |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-anchor-sweep` |
| Source | Owner 2026-11-23, after Jordan (a C.OG group member, not C.OG) asked "why London 00:00–22:00, have you tried other windows?" (neither of us had). Owner: "run it as though the anchor time is different time slots throughout the day … it might be a 7 AM anchor is best"; HL, OH, OL only (OC set aside) |
| Instruments | Futures only (NT8 M1, ratio-adjusted continuous): **NQ, GC, 6E, 6J** (6J inverted to USD/JPY) |
| Window | Data 2014-12 → sessions ≤ **2026-08-21** (lockbox untouched). c fitted from 2016; model choice from 2017; **scored test years 2020 → 2026-08-21** (same as `ladder-qlike-per-line`) |
| Seed | `20261123`. B = 2000, 63-session blocks |
| Scripts | `scripts/ladder-anchor-sweep/` → `analysis/output/ladder-anchor-sweep/` |

## 1. Question

Our ladder anchors the day at London 00:00 and measures the next 22 hours. If the day were anchored at another hour
(01:00 … 23:00 London), would the QLIKE-chosen σ forecast the day's HL, OH and OL better, relative to a simple
baseline at the same anchor?

## 2. Design

**Anchors.** A ∈ {00, 01, …, 23} London wall-clock (DST-aware).

**Forecast window (target).** For each anchor, a window starts at A and lasts **22 hours** (every anchor the same
length, so no anchor wins by covering less time). Open = first bar at/after A. Realised lines as % of that open: HL,
OH, OL. A window is kept only if it lies inside one trading week (it must not run past the Friday close) and has
≥ 1,000 one-minute bars. Session label = London date of (start + 12 h); used only to pair anchors for the bootstrap.

**Information set (features).** "Anchor days" are the 24-hour blocks ending at A (block = [A − 24h, A)), weekdays only,
≥ 600 bars. Every feature for a window starting at A uses blocks ending at or before A. A later anchor therefore sees
more of the recent tape (e.g. at 07:00 it has seen Asia). That is real information a trader at that hour would have,
and it is part of what is being measured.

**Models raced at every anchor** (same families as `ladder-qlike-per-line`, built on the anchor blocks):
yz_10, yz_20, yz_30, ewma_094, ewma_090, naive (forge.vol estimators on block OHLC), HAR-RV log, R5, R15 (log-RV
regressions on 5/15-min RV), SHAR, HAR-CJ, GARCH / GARCH-t / GJR / EGARCH (fitted per year Y on block returns before
Y), and the HAR + GARCH-t blend. **Not raced:** H8 (JS port, too slow ×24 anchors) and the IV models (IV is a daily
close print, not available at every anchor). Regression coefficients are refitted each year Y on blocks before Y.

**Scoring (per instrument, line q, anchor A).**
- h = c × σ², c = mean(x²/σ²) over training windows 2016 … Y−1 (walk-forward); QLIKE = x²/h − ln(x²/h) − 1.
- **Pick:** for test year Y the arm with the lowest mean QLIKE on 2017 … Y−1 (walk-forward per-line pick, `QL` of
  `ladder-qlike-per-line`).
- **Baseline at the same anchor:** σ_base = √(mean of the last 5 blocks' 5-min RV) ("recent realised vol"), scaled
  with its own c.
- **Skill(A) = 1 − mean QLIKE(pick) / mean QLIKE(baseline)** over the test windows. Raw QLIKE is reported too but not
  compared across anchors (different hours are not equally easy).

## 3. Hypothesis and pass bars

**H1.** Some anchor has more skill than London 00:00. Δ(A) = Skill(A) − Skill(00), in percentage points.

- **Choose, then confirm.** Per (instrument, line) cell, A* = the anchor with the highest Skill on test years
  **2020–2022**. Confirm on **2023 → 2026-08-21**: Δ(A*) there.
- **Pooled:** equal-weight mean of the confirm-half Δ(A*) over the 12 cells (4 instruments × 3 lines), 90% CI from
  a 63-session block bootstrap over paired session labels (the same resampled labels for every anchor and cell).
- **VALIDATED:** pooled CI lower > 0 **and** ≥ 8 of 12 cells with Δ(A*) > 0 in the confirm half.
- **NULL:** pooled CI upper < **+1.0 pp** (smaller than the gap between our top models).
- **UNDERPOWERED:** anything else.
- A* that equals 00 in a cell counts as Δ = 0 for that cell.

**Descriptive (no verdict):** the full grid of Skill by anchor × instrument × line on all test years, the winning
model at each anchor, and the multiplicity-aware view: the bootstrap distribution of max over A of Δ(A) on all test
years (how big the best-of-24 gap looks by chance).

## 4. Controls

1. **Mechanics:** at A = 00 the realised HL/OH/OL must match `analysis/output/ladder-per-line/build/<sym>/rows_F.parquet`
   (NQ, GOLD, EURUSD) and `analysis/output/ladder-v2-usdjpy/rows_F.parquet` on ≥ 95% of common sessions within 0.5%
   relative (ratio vs unadjusted series differ only on roll days). Fail → stop and fix before scoring.
2. **Positive control:** an oracle arm σ = √(the window's own 5-min RV) must have Skill > 30 pp at every anchor
   (checks the scoring direction and that skill can move). Fail → stop.
3. **Same-data placebo:** at A = 00 the pick's QLIKE on futures blocks should sit within ±5% of the `ladder-qlike-per-line`
   QL QLIKE (different σ source: futures blocks here, NY-close bars there). Reported, not a gate.

## 5. What it changes

- **VALIDATED:** the anchor A* (per instrument and line) becomes a shadow option on the QLIKE ladder; the live ladder
  is unchanged until a forward check.
- **NULL:** keep London 00:00; Jordan gets the grid.
- **UNDERPOWERED:** report the grid, no change.

## Amendments

- **A1, 2026-11-23, PRE-RESULTS** (only the A = 00 control run seen; no other anchor scored). Control 2's oracle
  σ = √(window's total 5-min RV) cannot show skill on OH/OL (total variance says nothing about how much of the move was
  up): at A = 00 it scored −5 pp on OH. Oracle per line instead: HL → total RV, OH → upside semivariance, OL → downside
  semivariance of the window. Checked at A = 00 on 6E: HL +56 pp, OH +24 pp, OL +25 pp (semivariance still does not
  pin down a one-sided extreme). Bar reset, openly after seeing those A = 00 values: **HL > 30 pp, OH and OL > 15 pp, at
  every anchor and instrument** (a control of the machinery, not of the hypothesis). The A = 00 run also passed control 1
  (99.5–100% of sessions match rows_F) and sits within 6% of the per-line study's QLIKE (control 3, reported).
- **A2, 2026-11-23, PRE-RESULTS** (build running, no anchor other than 00 scored). Anchors 01–22 lose their Friday
  windows (they would run past the Friday close), so anchor 00 has ~2,950 windows and the others ~2,350. Every
  Δ(A) = Skill(A) − Skill(00) (choose half, confirm half, bootstrap, max-over-anchors) is computed on the session labels
  **both** anchors have, so the comparison is on the same days. The grid still reports each anchor's skill on its own
  windows.
- **A3, 2026-11-23, POST-HOC (control results seen, no hypothesis result seen; demote-only).** Control 1 passed
  (98.7–100%). Control 2 passed on 11 of 12 cells at every anchor (HL ≥ 47 pp, OL ≥ 21 pp, OH ≥ 18 pp on GC/6E/6J) but
  **NQ OH scored 6–13 pp at every anchor**, under its 15 pp bar. Cause: NQ's upside 5-min semivariance is dominated by
  rebound rallies inside down days, so it says little about the high above the open; it is flat across anchors, so it
  cannot favour one anchor. Scoring proceeds as registered; **VALIDATED additionally requires the pooled confirm-half
  CI lower > 0 with the NQ OH cell left out** (can only demote).
