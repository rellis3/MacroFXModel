# gold-rolling-mae-window: how much past data sets today's stop at gold's lines, and does the rolling-MAE stop trade?

**Pre-registered 2026-11-27, before any rolling-MAE stop or trade on these lines has been computed.**

| | |
|---|---|
| ID / ledger id | `gold-rolling-mae-window` (W: window choice, CONTEXT) and `gold-rolling-mae-trade` (T: the trade) |
| Branch | `jvphone` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `gold-rolling-mae-window` |
| Source | Jordan (C.OG group), 2026-11-27, to Ken and the owner: the "jackets" question. With 10 years of data and a few stops, how many past days do you need to pick today's stop? Test at least 10 windows (1 day, 2 days, 1 week, 2 weeks, 3 weeks, 1 month, …), split IS/OOS for each, MAE per level type, then look at the trade results; the window will differ per instrument (gold, NAS, EUR). Owner: gold first |
| Lines | gold's 18 shadow-calc lines (N7_ALL, walk-forward widths as `hits_and_gap`): OH, OL, Close+, Close−, HL projection up (running low + HL width), HL projection down (running high − HL width), each at P50 / P75 / P90 |
| Data | GC futures M1 unadjusted (NT8), 00:00–22:00 London. Shadow widths exist 2020 → 2026-08-21. **IS = 2021–2022 (2020 is burn-in for the windows), OOS = 2023 → 2026-08-21.** Lockbox untouched |
| Seed | `20261127` |
| Uncertainty | 63-session block bootstrap, B = 2000, 90% CI |
| Scripts / outputs | `scripts/gold-rolling-mae-window/` → `analysis/output/gold-rolling-mae-window/` |
| Live impact | None |

## 1. Claim

A stop sized from the recent MAE at each level type tracks what the next month needs. One window length does this best
out of sample, and fading the lines with that stop makes money after costs.

## 2. Why this isn't already settled

`jordan-vwap-band-tp` part E/G reproduced Jordan's MAE table with fixed stops on the export lines. No study has
sized the stop from a **rolling** window of past MAE, compared window lengths IS vs OOS, or used the shadow lines.

## 3. Definitions

- **Touch:** the first touch of each of the 18 lines in a session (upper lines: high ≥ line, faded short; lower lines:
  low ≤ line, faded long). Entry at the line.
- **MAE (Jordan's line-to-line method, `next_line_mae.py` variant B):** the adverse excursion beyond the entry, from the
  touch bar, until the first of (a) the target = the nearest line inside on the same side (else the session open),
  touch bar excluded; (b) the next line out = the nearest of all same-side lines beyond the entry by > 0.05 line-σ,
  where the MAE is capped at that gap; (c) 22:00. With no line beyond (the outermost), the MAE is uncapped. In $.
- **Level type:** the 18 lines (family × tier). Also pooled ("all 18", as Ken's table).
- **Windows (10):** the trailing 1, 2, 5, 10, 15, 21, 42, 63, 126, 252 sessions (1d, 2d, 1w, 2w, 3w, 1m, 2m, 3m, 6m, 12m),
  strictly before the session. Stop = the **median** MAE of the touches of that level type in the window. A window
  with no touches carries the last value forward. The MAE series starts in 2020 (the first year with shadow widths), so
  the 12-month window first has a full year at the start of 2021: **every window is scored from 2021-01-01** (common
  sample). IS is therefore 2021–2022.
- **Miss (Ken / Jordan):** for session t, truth = the median MAE of that level type's touches over the next 21
  sessions (needs ≥ 5 touches); miss = |stop − truth| / truth. Reported as the mean over sessions and levels, IS and
  OOS, plus the worst calendar year.
- **σ comparator (our layer, descriptive):** the same windows on MAE / that day's line σ, stop = median ratio × today's
  σ. It asks whether scaling by the forecast beats raw $ windows.
- **Trade:** fade every first touch, stop = entry ± the window's stop for that level type, target = the line inside
  (as the MAE target), break-even at +1R from the next bar (Jordan: keep BE), flat at 22:00. Pessimistic: the stop
  beats the target in the same bar; the touch bar counts for the stop, not the target. Costs: 1 tick in, 1 tick out
  on non-target exits, $0.12 commission. net R = (P&L − cost) / stop.

## 4. Hypotheses and gates

**W (window choice), verdict CONTEXT (a calibration, not an edge).** The chosen window = the lowest IS mean miss
(per-level stops). Reported: OOS miss of every window, the OOS rank of the IS choice, and whether it beats 1 day and
12 months OOS.

**T (the trade), with the IS-chosen window, per-level stops, BE on.** Metric: OOS mean net R per trade.
- **VALIDATED** if: OOS 90% CI > 0; IS > 0; above the shuffled-lines placebo's 95th percentile (each OOS day gets
  another same-year day's widths, 100 permutations, the whole pipeline rerun); total R positive.
- **NULL** if the OOS CI's upper end < +0.05R. Otherwise **UNDERPOWERED**.
- Descriptive: all 10 windows × {per-level, pooled stop} × {BE on, off}, IS and OOS, total R, win rate, exit mix; per
  level type; the σ comparator; trade examples.

## 5. Power

About 8–10 first touches per session × ~1,000 OOS sessions ≈ 9,000 OOS trades, strongly clustered by day. The day
block bootstrap with R SD ≈ 1 gives a half-width of ≈ 0.04R, so ≈ 0.05R is detectable.

## 6. Multiplicity

T is one pre-declared test (the IS-chosen window). The other 39 trade arms are descriptive. W is CONTEXT.

## 7. What it does NOT test

NQ and EURUSD (next, same script, once gold is read). Quantiles other than the median for the stop. Re-arming after
the first touch. The lockbox.

## 8. What each verdict changes

- **T VALIDATED:** a forward paper record on gold with that window; then NQ / EUR.
- **NULL / UNDERPOWERED:** the window table still answers Jordan's question (how much data to size a stop), and goes
  on the site as stop context.

## Amendments

- **A1, 2026-11-27, PRE-RESULTS (implementation, before any run).**
  - The target (line inside) and the next line out are fixed at their prices on the touch bar (the HL projections
    move during the day; fixing them keeps the MAE window and the trade defined at entry).
  - Stops are floored at 5 ticks ($0.50 on GC) so a 1-day window with a near-zero median can't produce an R of
    hundreds from costs alone.
  - Break-even triggers only from the bar after the touch.
  - The placebo recomputes the rolling stops for the chosen window only (the other windows are not needed for it).
