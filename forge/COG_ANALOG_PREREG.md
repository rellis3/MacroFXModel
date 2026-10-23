# COG-ANALOG: match the last 12 hours of the line against its own past and read what Nasdaq did next

*Pre-registered 2026-10-23 before any analog was computed. Prompted by the owner's workflow: take the recent shape of the SOFR-Euribor line, find where it looked like that before, read the lead (30 minutes to 48 hours) off what followed, with a second point of interest (Nasdaq's own shape) as confirmation. Earlier shape work (COG-SHAPE-AGNOSTIC) used hand-built features and boosted trees; this is whole-window nearest-neighbour matching, which was not run before. Script: `scripts/rate_diff_nq/cog_analog.py` -> `analysis/output/cog_video_0918/ANALOG.md`.*

## Data
As COG-THEORIES / COG-VARIABLE-LEAD: pinned pair SR3U6 and IH7, line L = US rate - euro rate (bp), 15-minute close-labelled bars, same day screen; Nasdaq log price as in COG-LEGS-SESSION. Video week excluded from library and scoring. Decisions to the last full day Nasdaq is on disk.

## Method (all parameters fixed here; none tuned afterwards)
- **Query** at decision time t: the last W = 48 bars (12 hours) of the series, each series z-normalised within the window (subtract the window mean, divide by the window standard deviation; the shape, not the level). Windows with fewer than 90% finite bars or zero spread are skipped; gaps inside a window are forward-filled.
- **Library**: every earlier window ending on a whole hour, with end s <= t - 48 hours, so each library outcome is fully realised before t. Only library windows whose Nasdaq outcome exists at every horizon are kept.
- **Distance**: Euclidean distance between z-normalised windows. K = 20 nearest analogs, greedily chosen at least 12 hours apart (so one episode is not counted as many).
- **Variants**: **A** line shape only; **B** line shape and Nasdaq's own shape together (the confluence: both z-shapes concatenated, equal weight); **C** Nasdaq's shape only (the price-only baseline).
- **Horizons h** (the lead): 0.5, 1, 2, 4, 8, 12, 24, 48 hours from t. Prediction = mean Nasdaq log return over (s, s+h] across the K analogs, scored against the realised return over (t, t+h].
- **Decisions**: every 2 hours on weekdays from 2024-09-01 (so at least about 135 days of library). Split by decision date: **Explore** to 2025-10-31, **Confirm** from 2025-11-03.

## Scoring and pass rule
- Statistic per variant and horizon: Spearman correlation (IC) between predicted and realised return across decisions, and the share of correct signs; one-sided p by day-block bootstrap (2000 draws).
- Family: variants A and B x 8 horizons = 16 cells; variant C is the baseline, not a candidate.
- **A cell passes** only if: Explore IC > 0 with BH-FDR 10% across the 16 cells; Confirm IC > 0 with one-sided p < 0.05; and Confirm IC exceeds variant C's Confirm IC at the same horizon.
- **Placebo (selection-aware)**: variant A repeated 60 times with the line rotated by a random whole number of days (5 to 60) before windows are built; the maximum IC over the 8 horizons is recorded each time. The real maximum must exceed the placebo 95th percentile for the verdict "the line's shape carries information" to stand.
- Overall verdict "analog read of the line leads Nasdaq" requires at least one passing cell **and** the placebo condition.

## Also produced (a demonstration, not a test)
The same method run at the latest line bar on disk (variant A only, library to the last Nasdaq outcome on disk): the K analogs' median and quartiles of Nasdaq's move at each horizon, next to the scored IC of that horizon, so a reader sees how much weight the read deserves.

## What changes
A pass is exploratory until a forward record exists and changes nothing live. A null closes whole-window analog matching for this pair in the form tested.
