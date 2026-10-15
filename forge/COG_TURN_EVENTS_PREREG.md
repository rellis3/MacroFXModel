# COG-TURN-EVENTS: do SOFR-Euribor turning points carry information about Nasdaq's next turn, breakout or move?

*Pre-registered 2026-10-15 before any event was detected or any forward return computed. Commissioned by the owner's brief (turning points lead Nasdaq reversals; consolidation breakouts; divergence; session/regime). It builds on COG-TREND-STATE, COG-PINNED-HISTORY-CONFIRM and COG-VIDEO-CLAIMS, which found: turns coincide (+6.7 pp extra chance of a same-direction Nasdaq flip within 1-8 h), the mean Nasdaq move after a line flip is about zero, and no continuous lead. What is NEW here, never measured: favourable/adverse race outcomes and failure rates, MFE/MAE, a consolidation-breakout test, a divergence-episode test, a Nasdaq-only baseline with incremental-information tests, session and volatility-regime splits, and the lead measured turning point to turning point.*

## Research series (separated from every display transform)
`x` = (SOFR Sep26 SR3U6 rate - Euribor Mar27 IH7 rate) in **bp**, rate = 100 - price, 1-minute IBKR MIDPOINT resampled to 15-minute bars, **close-labelled** (the bar is dated by when it ends, so a bar is available only at its end), last midpoint in the bar, at least 5 of 15 minutes present; days need at least 3 distinct prices per leg. No scale, offset, inversion, smoothing or plot lead is applied (those are display-only and cannot change any statistic below, except smoothing, which is not used). Nasdaq `y` = log price on the same 15-minute grid: OANDA CFD cache to 2026-08-20, then CME NQ futures log moves (as in the earlier studies). Window 2024-04-15 to 2026-10-09. The Dec-2026 roll has not occurred in this window, so no roll effect enters; the pinned pair is the only pair with deep history (other contract pairs hold only about two weeks), so **contract-month robustness is not testable now and is reported as such**.

## Turning points (causal)
Adaptive zig-zag, identical to `js/cogLineRead.js`: theta = k x RMS of the series' 4-hour changes over the previous 20 calendar days (at least 10 with data); a trend flips when price retraces theta from its running extreme. Each turn has an **extreme time** (when the high/low occurred) and a **confirm time** (when the retrace reached theta). A signal exists only from the confirm bar's close; all forward measurements start there. Grid k in {0.5, 0.75, 1.0, 1.5, 2.5}; **primary k = 0.75** (the registered family used before), all five reported.

## Event families (fixed now)
For a confirmed line turn at t, with hypothesised direction d = +1 for an up-turn, -1 for a down-turn (the opposite reading is the same numbers with the sign flipped and is reported, not assumed away):
- **A1**: line up-turn while Nasdaq's zig-zag (k = 0.75) is in a down trend. **A3**: line down-turn while Nasdaq is in an up trend. (Patterns 1 and 3 of the brief.) Expected Nasdaq direction = d.
- **A2**: line up-turn while Nasdaq is **consolidating** (the high-low range of its last 8 bars is at or below the 30th percentile of that statistic over the previous 20 calendar days, causal); **A2m** = the mirror (down-turn). (Pattern 2.)
- **A4 divergence episodes**: the line's 4-hour change is at or above its trailing-20-day 90th percentile of |change| while Nasdaq's 4-hour |return| is at or below its trailing 30th percentile; the first such bar of an episode, then 16 bars cool-down; d = sign of the line's change. (Pattern 4.) Both signs of the subsequent Nasdaq move are reported.
- **A0**: every line turn regardless of Nasdaq (reference).

## Outcomes (from the confirm bar's close, signed by d, Nasdaq 15-minute closes; intra-bar high/low are not in the series, so MFE/MAE are close-based)
Horizons H in {1, 2, 4, 8, 16, 32, 96} bars = 15, 30, 60, 120 minutes, 4, 8, 24 hours.
- mean signed forward return (%), and share positive;
- **race**: unit u = 0.75 x RMS of Nasdaq's 4-hour changes (previous 20 days); within H, which is hit first, +u in direction d (**favourable**), -u (**adverse**), or neither (**neutral**); reported as three shares per horizon (the failure rate = adverse; "no meaningful outcome" = neutral);
- MFE and MAE within H in units of u;
- **turn lead**: for each line turn, the signed time from the line's extreme to the nearest same-direction Nasdaq (k = 0.75) turn's extreme within +/-12 hours (positive = line first), and the time from the line's confirm to the next Nasdaq confirm of the same direction; the share of line turns with any Nasdaq turn within 12 h.

## Baselines and controls
1. **Matched random bars**: for every event, 20 control bars, not within 8 bars of any line event, matched on Nasdaq zig-zag state, hour of day (+/- 1 hour) and the quintile of Nasdaq's own trailing 1-hour return signed by d. Effect = event outcome minus matched mean. Confidence interval and p-value from a **day-block bootstrap** (2000 draws; whole UTC days resampled), so overlap and intraday dependence are respected.
2. **Time-shift placebo**: the line series is shifted by a random whole number of days between 5 and 60 (200 draws), turns re-detected, the primary-cell pooled effect recomputed; the real effect must exceed the placebo 95th percentile.
3. **Nasdaq-only baseline and incremental test**: on all bars, OLS of Nasdaq's next-H return (H = 4 and 8 bars) on Nasdaq-only features (previous 1 h, 4 h, 24 h returns; trailing 20-day realised vol z-score; position in 96-bar range; own zig-zag state) **plus** s_t, the line-signal (+1 / -1 for 8 bars after a confirmed turn in the A0 family, else 0). Date-clustered SE. Out-of-sample incremental R-squared: fit with and without s_t on the first two thirds, evaluated on the last third.
4. **Contemporaneous guard**: the same-bar correlation of line and Nasdaq changes is printed, and events whose confirm bar falls within 15 minutes of a scheduled US release (08:30 ET, 10:00 ET, 14:00 ET FOMC days) are flagged and the primary cell is rerun without them (common-news check).

## Splits (chronological)
Selection/in-sample 2024-04-15 to 2025-03-31 (the grid of k, patterns and horizons is explored here and FDR-controlled), **validation** 2025-04-01 to 2025-12-31, **out-of-sample** 2026-01-01 to 2026-10-09. Honest limit: earlier studies in this repository saw all of these dates for the combined line, so no period is untouched; the real untouched test is the forward record from 2026-10-15, which the paper-record page should keep. September 2026 (the video week) is shown as a case study and excluded from all pooled statistics.

## Pass rules
- **Primary cells**: pattern in {A1, A2, A3, A2m, A4}, k = 0.75, H = 8 bars, effect on mean signed return **and** on the favourable-minus-adverse race share.
- **Robust predictive relationship**: a primary cell with matched-baseline effect same sign and one-sided p < 0.05 in **both** validation and OOS, above the placebo 95th percentile, the s_t coefficient in the incremental test significant in validation and OOS (|t| > 2, same sign), and not removed by excluding release bars.
- **Conditional relationship**: no robust cell, but the same criteria met within one session (Asia 22-07 UTC, Europe 07-13, US 13-22, by confirm time) or one volatility tercile (Nasdaq trailing 20-day realised vol, cut-points from the in-sample period), after BH-FDR 10% across the 9 strata x 5 patterns, both validation and OOS.
- **Insufficient evidence**: everything else. Underpowered cells (event counts below what a 2.8-SE detectable effect would need to be economically meaningful) are labelled underpowered, not negative; minimum detectable effect is printed per cell.
- Exploratory grid (all k, patterns, horizons, strata) is reported with FDR and flagged exploratory; it can nominate a rule for the forward record but never counts toward the verdict.

## Deliverables
Chart overlays (September 2026 week with turning points, confirm marks and outcome marking; the average Nasdaq path around a confirmed turn with bands vs matched baseline), event-study table (CSV + markdown), examples of favourable / failed / neutral events including the video week, Nasdaq-only baseline comparison, a conclusion in one of the three words above, and this code (`scripts/rate_diff_nq/cog_turn_events.py`) with `analysis/output/cog_video_0918/TURN_EVENTS.md`. No live signal is built from this.
