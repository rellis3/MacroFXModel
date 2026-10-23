# COG-MATCH-CONFIRM: the owner's own procedure, run mechanically on all history

*Pre-registered 2026-10-23, after the rule was applied once to the owner's example (23 Oct 12:00 UTC screenshot) and before it was run on any history. The rule is the owner's description made mechanical: shift the line forward by a lead until its shape matches price over the last 12 hours, require the match to be confirmed by the most recent part of the window, and read the entry direction from the shifted line's projection. The example run is exploratory by construction (the rule was inferred from it); the history run below is the test. Script: `scripts/rate_diff_nq/cog_match_confirm.py` -> `analysis/output/cog_video_0918/MATCH_CONFIRM.md`.*

## Rule (fixed here)
- Series: line X = L (US rate - euro rate, bp) forward-filled and smoothed with an EMA of length 6 (the owner's chart settings); price = Nasdaq (log, from the same series as the other COG studies). 15-minute bars.
- **Match** at decision bar t: for every lead l from 2 to 192 bars (30 minutes to 48 hours), correlation of price over the last 48 bars with X shifted forward by l (X[t-47-l .. t-l]). Pick the l* with the largest |correlation| (either sign); the sign is kept.
- **Confirm**: the correlation over the most recent 16 bars at the same l* has the same sign and |.| >= 0.5.
- **Strong match**: |correlation over 48 bars| >= 0.8.
- **Call** (only when strong and confirmed): for horizon h in {2, 4, 8, 16, 32} bars with h <= l*, predicted price move = sign(r) x (X[t+h-l*] - X[t-l*]); direction = its sign.
- Decisions: every whole hour on weekdays, whole history to the last Nasdaq bar on disk, video week excluded. Split: Explore to 2025-10-31, Confirm from 2025-11-03.

## Scoring and pass rule
- Per horizon: mean of (call direction x realised Nasdaq return over (t, t+h]) in percent, and share of correct signs; one-sided p by day-block bootstrap (2000).
- **Pass for a horizon**: Explore mean > 0 with BH-FDR 10% across the 5 horizons, Confirm mean > 0 with p < 0.05, and the share of correct signs above the better of "always up" and "always down" over the same calls.
- **Placebo**: the same rule with the line rotated by a random whole number of days (5 to 60), 30 draws; maximum over the 5 horizons of the Confirm mean. The real maximum must exceed the placebo 95th percentile.
- Verdict "the match-and-confirm process has an edge" requires a passing horizon and the placebo condition.
- Also reported: number of calls per week, distribution of l*, how often l* changes between consecutive decisions (the flexibility the rule is allowed).

## What changes
A pass is exploratory until a forward record exists; nothing live changes. A null means the owner's procedure, as mechanised, does not outperform chance on history, and the screenshots are among the cases it produces.
