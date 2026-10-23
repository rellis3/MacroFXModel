# COG-VARIABLE-LEAD: can a lead that varies be known in advance?

*Pre-registered 2026-10-23 before any computation. Prompted by the owner's point that a lead need not be fixed: it may differ by episode, with a second point of interest confirming which lead applies. COG-DYNAMIC-LEAD already ran a rolling real-time lead (28,560 cells) and the episode/confirmation framing and found no survivors; this study asks the remaining questions directly: does the lead profile persist, and can an observable factor predict which lead applies out of sample? Script: `scripts/rate_diff_nq/cog_variable_lead.py` -> `analysis/output/cog_video_0918/VARIABLE_LEAD.md`.*

## Data
Identical to COG-THEORIES: pinned pair SOFR Sep26 (SR3U6) and Euribor Mar27 (IH7), line L = US rate - euro rate (bp), 15-minute close-labelled bars, same day screen, Nasdaq as in COG-LEGS-SESSION. Hourly non-overlapping changes dL and dN (Nasdaq %). Video week excluded from pooled statistics. Grid 2024-04-15 to the last full day on disk. Split: **Explore** to 2025-10-31, **Confirm** from 2025-11-03.

Lead k (hours): corr(dL in hour t-k, dN in hour t). **Leads** are k in {1, 2, 3, 4, 6, 8, 12, 24}; k = 0 (same hour) is reported as context only and is never counted as a lead.

## S1: does the lead profile persist?
- Calendar blocks of 14 days. In each block the profile r(k) over the 8 lead values (needs at least 150 hourly observations).
- Statistic: for adjacent blocks A then B, the Pearson correlation across the 8 values of r_A(k) and r_B(k); averaged over all adjacent pairs. Also the share of adjacent pairs whose best lead is the same (chance 12.5%).
- Placebo: pair each block A with a random block at least 3 blocks away (1000 draws of the mean).
- **Pass**: Explore mean above the placebo 95th percentile and Confirm mean above 0.

## S2: can a factor predict which lead applies?
Factors, all known at or before the target hour t (nothing from t or later):
- **session** of the target hour (UTC): Asia 22-07, Europe 07-13, US 13-21 (3 levels);
- **Nasdaq vol state**: tercile of Nasdaq's trailing 20-day RMS of hourly changes, tercile cut points from Explore only (3 levels);
- **line vol state**: same for the line (3 levels);
- **second point (leg pattern)** in the source hour t-k: only the US leg moved, only the euro leg moved, both moved, neither (4 levels), "moved" = the leg's close differs from its close one hour earlier.
Thirteen levels. For each level:
1. In Explore, choose the lead k* among the 8 that maximises |corr|, and record its sign.
2. In Confirm, compute the correlation at k* and its day-block bootstrap one-sided p for the Explore sign (2000 draws).
3. Baseline: the single best fixed lead chosen the same way on all Explore bars, evaluated on all Confirm bars.
- **Pass for a level**: BH-FDR 10% across the 13 confirm p-values, Confirm correlation has the Explore sign, and its absolute value exceeds the fixed baseline's absolute Confirm correlation.
- **Overall verdict "variable lead is predictable"** requires at least one level to pass. Because k* is picked on Explore only, the Confirm test is clean of the selection.

## S3: how much is there to find?
For every level the Confirm correlation at k* and its sample size are printed, with the pooled fixed-lag baseline, so the size of any effect (not just its sign) is visible.

## Not included
Fed and ECB event-day type needs an event calendar join; it is a follow-up if S2 finds a surviving factor.

## What changes
A pass is exploratory until a forward record exists; nothing live changes. A null closes the variable-lead idea for this pair in the form tested and is added to the evidence bank.
