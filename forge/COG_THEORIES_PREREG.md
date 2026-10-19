# COG-THEORIES: three testable theories behind the message to C.OG (time of day, carried-forward legs, selection)

*Pre-registered 2026-10-19 before any of these cuts was computed. Nothing here changes a rule from an earlier registration; it adds three questions the message raised. Script: `scripts/rate_diff_nq/cog_theories.py` -> `analysis/output/cog_video_0918/THEORIES.md`.*

## Data (identical to COG-LEGS-SESSION)
SOFR Sep26 (SR3U6) and Euribor Mar27 (IH7), 1-minute IBKR midpoint to 15-minute close-labelled bars, rate = 100 - price, **bp**, same day screen (at least 3 distinct prices per leg per day). Line L = US rate - euro rate (the inverted spread, as in the indicator). Nasdaq = the CFD series continued by the futures log moves, as in COG-LEGS-SESSION. Grid 2024-04-15 to 2026-10-16. The video week (16-23 Sep 2026) is excluded from pooled statistics and shown separately. Split: **Explore** to 2025-10-31, **Confirm** from 2025-11-03.

Hourly bar = the change of a 15-minute close over four bars, ending on the hour, non-overlapping. Hour of day = the UTC hour in which the bar starts. A leg **moved** in an hourly bar if its close at the end differs from its close at the start.

## T3: is the same-hour link concentrated in the liquid window?
Theory: legs look unchanged most of the early-morning minutes (93-96% at 01-05 UTC against 77-82% at 12-16 UTC), so the link should be weaker there.
- W_quiet = hours starting 01, 02, 03, 04 UTC; W_liquid = 12, 13, 14, 15 UTC.
- Statistic D3 = corr(L change, Nasdaq return | W_liquid) - corr(... | W_quiet), Pearson, hourly bars, 95% interval by day-block bootstrap (2000).
- **Pass**: D3 > 0 with the Explore interval excluding 0, and Confirm D3 > 0 with one-sided p < 0.05 (day-block bootstrap).
- Placebo: shuffle Nasdaq hourly returns across days within the same hour of day (2000 draws); report where the real D3 sits.
- Also reported (no pass rule): correlation by every UTC hour start, and by Explore / Confirm.

## T4: do carried-forward legs create or hide a link or lead?
Theory: an unchanged euro leg is carried forward, so steps can look like a lead and unmoved bars dilute the link.
- Subsets of hourly bars: ALL; BOTH = both legs moved in that bar and in the previous bar.
- **T4a lead(ALL)** and **T4b lead(BOTH)**: corr(L change in bar t, Nasdaq return in bar t+1). **Pass for each**: Explore p < 0.025 (two-sided, Bonferroni for the two cells) and Confirm same sign with one-sided p < 0.05. Day-block bootstrap for p.
- **T4c link uplift**: corr(L change, Nasdaq return | BOTH) - corr(... | ALL, same bars), with the placebo of shuffling the BOTH flag across bars within the same hour of day (2000 draws). **Pass**: the real uplift above the placebo 95th percentile in Explore and positive in Confirm.
- Reported: share of hourly bars in BOTH by window, and the same-hour link by Explore / Confirm in BOTH.

## T5: how often does "turn, then Nasdaq follows" appear by chance in a week?
Theory: two clean examples inside a week with a dozen turns is what selection would produce.
- Turns: causal adaptive zig-zag on L with theta = 1.0 x RMS of L's 4-hour changes over the previous 20 calendar days (at least 10 with data); a turn is dated at its confirmation bar; direction d = +1 for an up-turn.
- Unit u = 0.75 x RMS of Nasdaq's 4-hour changes (previous 20 days). A turn is **followed** if within 8 bars of its confirmation Nasdaq reaches +u x d before -u x d (first touch).
- For each Mon-Fri week: turns n_w, followed f_w. Report the distribution of n_w and f_w, the share of weeks with f_w >= 2, and the video week's n and f.
- Placebo: flip d at random for each turn (2000 draws, p = 0.5) and report the share of weeks with f_w >= 2, to show what labels alone would produce.
- **Pass (selection explains the examples)**: the real share of weeks with f_w >= 2 is within the placebo's central 95% range and the video week's f lies within the placebo range for a week with its n. Otherwise the examples are above what chance labelling gives and the message must say so.

## What changes
Results go into the message to C.OG as numbers. Any pass is exploratory until a forward record exists: no live code or alert changes; the verdicts are added to the evidence bank either way.
