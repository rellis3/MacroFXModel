# COG-TREND-STATE: do the TURNS of C.OG's line line up with, or lead, trend turns in Nasdaq? (direction state, not size)

*Pre-registered 2026-10-14, before any trend state was computed. Question (owner): no same-rate link ("yield up, Nasdaq up by the same amount"); does the point where the
line goes from a down trend to an up trend correspond to a regime / price shift in Nasdaq, directly or shifted forward in time? Earlier tests used the line's change
size (F1) or one fixed swing rule (F2, `COG_VIDEO_CLAIMS_PREREG.md`); this one uses a fuzzy, causal TREND STATE for both series.*

## Data
Identified line (SOFR Sep26 − Euribor Mar27, bp; 15-min, 1-min MIDPOINT, close-labelled, no smoothing), CME NQ stitched (log level). 2026-04-13 → 10-09.
Explore → 2026-07-17, confirm 2026-07-20 →. 15-minute calendar grid; a state exists only where the series is present.

## The fuzzy trend state (identical rule for both series, causal)
Zig-zag with an adaptive reversal threshold: θ(t) = k × RMS of the series' 4 h changes over the PRIOR 20 trading days. The state is +1 (up) or −1 (down); it flips only
when price retraces θ from the running extreme in the current direction, and the flip is **confirmed at that bar**, never earlier. Each flip records its confirm time and
the (earlier) time of the extreme. k ∈ {0.75, 1.5, 2.5} (fine → coarse trends). The state at time t uses only data ≤ t.

## M1: state cross-correlation, direction and shift
c(τ) = day-clustered correlation of s_line(t) with s_Nasdaq(t + τ), τ from −24 h to +48 h in 1 h steps (τ > 0: the line's state leads Nasdaq's). Per k, explore and confirm.
Null: day-shift scramble (Nasdaq's state series rolled by random whole days, 1,000 times), family-wise 95 % band for max |c(τ)| over τ ∈ [1 h, 48 h] (the lead range).
**PASS** = some lead τ > 0 exceeds the scramble band in explore AND the same-sign c(τ) in confirm exceeds its own scramble 95 % per-τ band, for the same k.

## M2: "line turns while Nasdaq has not yet" (the regime-shift claim)
Event: the line's state flips to d at t_c while Nasdaq's confirmed state at t_c is −d. Outcome: Nasdaq's state becomes d within H ∈ {1, 2, 4, 8, 24, 48 h}.
Baseline: the same outcome measured from every bar in the same half where Nasdaq's state is −d. Difference of proportions, day-block bootstrap (1,000) for the z-score.
3 k × 6 H × 2 directions = 36 cells; BH-FDR 10 % on |z| in explore; confirm: sign fixed, one-sided 5 %. Also reported: median lag between the line's extreme and Nasdaq's.

## Power / reading rule
Report event counts and the minimum detectable proportion difference (2.8 × SE) per cell. A family PASSES only if both halves agree as above. A null with minimum detectable
difference ≤ 10 percentage points is "genuinely nothing at these horizons"; otherwise "insufficient data". No k, horizon or direction is added after the first number.

Script `scripts/rate_diff_nq/cog_trend_state.py`; output `analysis/output/cog_video_0918/TREND_STATE.md` + `trend_state.png`; ledger `cog-trend-state`.
