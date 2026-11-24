# close-level-reversal: are the Close± and projected high/low lines reversing points?

**Pre-registered 2026-11-24, before any touch outcome at the per-line QLIKE levels was computed.**

| | |
|---|---|
| ID / ledger id | `close-level-reversal` |
| Register row | `plans/RESEARCH_REGISTER.md` → `close-level-reversal` |
| Source | Jordan (a C.OG group member), step 2 of his list after "a forecaster that predicts the correct high and low and also the HL range": "If the forecaster has a very good result of finding the close, that's a problem for us, because we use the close level as reversing points." Owner 2026-11-24: "next step based on Jordan's list"; earlier the owner asked for a system that tracks how price reacts at a level (continuation or fade) over the day clock, to learn from history and play it forward |
| Lines | Each instrument × line its own QLIKE-best calc (the per-line ladders now on the site): **Close+** and **Close−** (H1), **OH** and **OL**, the projected high and low (H2). Median, 75th and 90th. HL is a width, not a price level, so it is not tested |
| Instruments | **Futures (primary):** the 25 NT8 futures raced in `ladder-qlike-per-line-fut`, track F, the futures' own M1. **CFDs (replication):** the 40 OANDA CFDs raced in `ladder-qlike-per-line-cfd`, track C, OANDA M1 (mid) |
| Window | Sessions 2020-01-02 → **2026-08-21** (lockbox untouched). Levels walk-forward: arm = that line's QLIKE pick among site arms on 2019…Y−1 (the races' `wf_pick`), widths k_τ = quantile of x/σ over the line's own days 2018…Y−1 |
| Seed | `20261124`. B = 2000, 63-session date-aligned blocks |
| Scripts | `scripts/close-level-reversal/` → `analysis/output/close-level-reversal/` |

## Prior work (context only; these lines are new)

Touch studies on earlier ladders (`line-touch-mae-futures`, `raw-level-mfe-mae`, `raw-line-touch-clock`, `reversal-zones`)
measured OH/OL/OC/HL lines from one σ per instrument. None tested Close+ / Close− as separate lines, or the per-line
QLIKE-best levels now on the site. Method lessons applied from them: the **touch-bar tilt** (the touch bar favours the
through side, so the line is judged against placebo levels raced the same way, not against 50%), and **σ units**, not
ticks.

## Event and outcome

- **Level:** session open O (first M1 bar at/after 00:00 London) × (1 ± D/100), D = k_τ × σ (in % of open) of that
  line's pick. Close+ and OH above the open; Close− and OL below.
- **Touch:** the first M1 bar in 00:00–22:00 London whose high ≥ level (above) / low ≤ level (below). One touch per
  session × line × τ.
- **Unit:** u = 0.25 × σ_line × O / 100 (a quarter of that line's own daily σ, in price).
- **Race (to 22:00 London):** *reversal* = price trades back to level ∓ u (toward the open) before level ± u (through
  the line); *continuation* = the other way. The touch bar counts only for continuation (if it already trades
  level ± u); otherwise the race starts on the next bar. Both in one bar = tie; neither by 22:00 = unresolved. Ties and
  unresolved are excluded from the share and counted.
- **Reversal share** = reversals / (reversals + continuations).
- **Placebo:** every real level gets one placebo level at D × m on the same session, m drawn once per
  (session, line, τ) uniformly from [0.75, 0.90] ∪ [1.10, 1.25] (seed), raced identically with the same u.
- **Excess** = reversal share at the line − at its placebo, in percentage points.

## Hypotheses

**H1 (Jordan: the close level is a reversing point):** at the Close+ and Close− lines (τ 50/75/90 pooled), the reversal
share beats the placebo. Statistic: mean over instruments (equal weight) of (line share − placebo share), each
instrument pooling its Close± touches; 90% CI by date-aligned bootstrap; all years and both halves (2020–22, 2023–26).

**H2 (projected high/low lines are reversing points):** the same on OH and OL.

Verdict for each hypothesis, on the futures (primary) and CFDs (replication):
- **VALIDATED:** CI lower > 0 overall and in both halves, on the futures **and** on the CFDs.
- **NULL:** CI upper < +1.0 pp overall on both.
- **UNDERPOWERED:** anything else.

Graded weight is reported beside the word (leaning / strong by half and by family).

## Descriptive (the day-clock lookup table; cannot change a verdict)

Per instrument × line × τ × London hour of the touch (00–07, 07–10, 10–13, 13–16, 16–22): n touches, reversal share,
placebo share, excess, tie/unresolved counts; also the same race at u = 0.5σ; and how far price went back toward the
open within 60 minutes (median, in u). Cells with n ≥ 40 whose excess beats placebo at BH q = 0.10 (two-sided,
date-clustered) are listed as **candidates** for a later forward prereg, never as results. Reversal share vs 50% is
shown, flagged with the touch-bar tilt.

## Controls

1. Levels reproduce the races' picks: the arm used per line-year equals `wf_site` in
   `analysis/output/ladder-qlike-per-line-{fut,cfd}/results.json` on ≥ 99% of line-years (fail → stop and report).
2. Hit rates of the levels in the window are near 50/25/10% (±6 pp) per line, else the line is reported and dropped.
3. Placebo sanity: placebo levels are touched at rates between their neighbours' real lines.

## What it changes

Nothing on the live site or the export (layer rule: the base is never overwritten). If H1 is VALIDATED, a separate,
switchable "reversal odds" layer for the Close± lines can be proposed with its own prereg on forward data. The
day-clock table is published on the research page as descriptive.

## Amendments

(none)
