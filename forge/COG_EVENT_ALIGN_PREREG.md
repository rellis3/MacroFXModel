## COG-EVENT-ALIGN: two or more structure events line up at a shifted time, then the line's next event says what price does

*Pre-registered 2026-10-24 before any computation. This is the owner's stated method, made mechanical: look at the structure of price (a pull back and continue, or a revert), shift the line, see whether the line shows the same structure at the shifted time; when two or more such events line up at one shift, the line's next event, carried forward by that shift, marks a future shift in price. Earlier mechanisations compared whole-window shapes; this one compares discrete structure events. Script: `scripts/rate_diff_nq/cog_event_align.py` -> `analysis/output/cog_video_0918/EVENT_ALIGN.md`.*

## Data
As COG-MATCH-CONFIRM: pinned pair SR3U6 / IH7, line L (US rate - euro rate, bp), Nasdaq log price, 15-minute close-labelled bars, same day screen, video week excluded, history to the last Nasdaq bar on disk. Split: Explore to 2025-10-31, Confirm from 2025-11-03.

## Events (causal)
Adaptive zig-zag on each series: theta = k x RMS of the series' 4-hour (16-bar) changes over the previous 20 calendar days (at least 500 bars); a trend flips when it retraces theta from its running extreme. k = 1.0 for the line, 0.75 for price. Each turn has an **extreme time** (when the extreme occurred), a **confirmation time** (when the retrace reached theta) and a direction (+1 turn up, -1 turn down). A pull back that resumes is two turns in sequence (a small counter-turn then a turn back in the trend direction); a revert is a turn that is not followed by a return to the old extreme. Both are covered by treating every turn as an event and letting the alignment count decide.

## Alignment rule (fixed)
- Leads l in {2, 4, 8, 16, 32, 64, 96, 128, 192} bars (30 minutes to 48 hours); sign s in {+1, -1} (price turns the same way as the line, or opposite). Tolerance tol = max(4, round(0.1 x l)) bars.
- A **line event** is evaluated at its confirmation time now. For each (l, s): count the **matches** among earlier line events (confirmed before now) and price events whose extreme falls in the last 96 bars: price extreme time within tol of (line extreme time + l), and price direction = s x line direction.
- Take the (l, s) with the most matches; **require at least 2**; ties go to the smaller l.
- **Call**: the projected time T = (this line event's extreme time) + l must be after now. Predicted price direction after T = s x this line event's direction. One call per line event.

## Outcomes and pass rule
- For each call: the signed Nasdaq move (call direction x return, percent) over (T, T+h] for h in {2, 4, 8, 16} bars; calls whose outcome bar has no Nasdaq price are dropped.
- Also: does a price zig-zag turn in the called direction have its extreme within tol of T (the event hit rate), against the same rate with T moved by a random offset of 8 to 96 bars.
- **Pass for a horizon**: Explore mean signed move > 0 with BH-FDR 10% across the 4 horizons (one-sided p by day-block bootstrap, 2000 draws), Confirm mean > 0 with p < 0.05, and the event hit rate above the shifted-T rate.
- **Placebo**: the same procedure with the line rotated by a random whole number of days (5 to 60), 30 draws; maximum over horizons of the Confirm mean. The real maximum must exceed the placebo 95th percentile.
- Verdict "aligned structure events predict a future shift" requires a passing horizon and the placebo condition.
- Also reported: calls per week, distribution of the chosen l, how often the number of matches is 2, 3, 4+, and the mean signed move by number of matches (does more alignment mean more follow-through).

## What changes
A pass is exploratory until a forward record exists and changes nothing live. A null means this mechanisation of structure alignment does not outperform chance on history; if the owner's picks differ from the rule, their own marked calls are the only remaining test.
