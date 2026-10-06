# LIVE-RANGE-HISTORY: price and jumps at the Live Range page's moving lines

*Pre-registered 2026-10-06, before any result was computed. Side study from `plans/LIVE_RANGE_HISTORY_BRIEF.md`.
Research only: `live-range.html`, `js/intradayRange*.js`, `js/lineTouchReach.js` are not edited. No Vote Atlas input.
Reads: `forge/INTRADAY_RANGE_PREREG.md`, `forge/LINE_TOUCH_REACH_PREREG.md`, `forge/PATH_MAP_SPEC.md` (its Amendment 2
lesson is built in from the start), `forge/JUMPS_PREREG.md`.*

## What is replayed

For every London session (00:00-22:00, 34 instruments, 2016-03 → 2026-08-20, complete sessions only), at each hourly
checkpoint h = 01..21 the page's lines are rebuilt exactly as `sessionState` / `reforecast` do: running high / low from
bars strictly before h, last-hour range from bars in [h-1, h), 3 × 3 cell (used × pace terciles in σ), lines
`runHigh + Q_U(q)·σ·open`, `runLow − Q_D(q)·σ·open` for q = 0.50, 0.75, 0.90. Lines stand flat from h:00 to the next
redraw. Bars are 5-minute (resampled from M1), as on the page. σ is the point-in-time ladder σ
(`pit_sig_daily` ≙ the estimator used when the grids were fitted; verified against the page's own code before any result).

**Point-in-time (in-sample check).** `js/intradayRangeParams.js` was fitted on ALL data ("grids fitted on all data"; the
60/40 split only scored it). Scoring any date with those params is in-sample. So: grids, tercile edges and the MIN_CELL
fallback (30) are **refit on each class's first 60% of dates** (same split rule as the intraday prereg), and every
reported statistic is on the **last 40% (test, from ≈ 2020-08)**. Train-period numbers are shown only as labelled
in-sample context. A replay-fidelity check compares my reimplementation with the shipped JS on a few recent sessions using
the SHIPPED params (identical lines expected).

## Definitions

- **Line event.** For each line drawn at h (6 lines: up/down × p50/p75/p90), the **touch** = the first 5-minute bar in
  [h, h+1) whose high ≥ the up line (low ≤ the down line). The line existed before that bar (drawn from earlier bars), so
  a touch is always real. Unit: σ·open = 1σ.
- **Phantom.** A line that sits on the running extreme (offset ≤ 1e-9σ; the late-day p50 "more to come" is usually 0) is
  crossed by any new extreme and is not a line price reached: counted, **excluded** from all touch statistics. The
  other possible phantom, a redrawn line moving past price, cannot occur by construction (every line is hung ≥ 0 beyond
  the running extreme, which is ≥ price); the replay asserts this and counts violations.
- **Next line out** = p50→p75, p75→p90, p90→p90 + (p90 − p75). **Back level** = p75→p50, p90→p75, p50→the running
  extreme at the draw (the anchor).
- **Jump-through.** J1: the touch bar also reaches the next line out. J2: the touch bar's overshoot beyond the line
  ≥ 0.25σ (sensitivity 0.10σ and 0.50σ). Reported with the full overshoot distribution (quantiles of overshoot / σ).
- **Race.** From the bar AFTER the touch bar, from the touch bar's CLOSE, on the fixed price levels (next line out vs back
  level), to 22:00. Outcomes: out / back / none / both-in-one-bar (excluded from shares). If the touch bar already closes at
  or beyond the out line (or at / below back) the race is "pre-resolved" and counted separately. Variant 2 limits the race
  to the end of the touch hour (the page's redraw).
- **Null / baseline.** PRIMARY baseline is the **placebo** (PATH_MAP Amendment 2): on every session the same code is run on
  control ladders, every line offset multiplied by a factor drawn uniformly from [0.70, 0.90] ∪ [1.10, 1.30] (seeded per
  instrument-session). The driftless-RW share b/(a+b) from the close is also reported.
- **Real-time jump state** (usable at the touch): "a jump has already happened today" = any 5-minute return before the
  touch bar with |close − previous close| ≥ 0.5σ. The BNS day flag (`flags_seasonal.csv`, `jump_bns`) is end-of-day: used
  only descriptively.
- **Regime** = `pit_sig_used` ÷ its previous-250-session median (quiet < 0.85, normal, busy > 1.15), as in forecast_record.

## Questions and pass rules

**Q1 replay.** Fidelity vs the shipped JS: max abs line difference < 1e-9σ on ≥ 5 recent sessions of 3 instruments.
Required before anything else is read.

**Q2 touches and jump-through.** Per class × side × rung × hour group (01-07, 08-14, 15-21; also hourly): touch rate,
J1 rate, J2 rate, overshoot quantiles; split by BNS day (descriptive) and by real-time "jump already today".
*Reading rule:* the jump-through risk is "elevated" in a split if its date-block 95% interval for the difference
(jump − no-jump) lies wholly above 0 **and** the difference ≥ 2pp. Descriptive otherwise.

**Q3 after-touch race.** For rung × class × hour group (and two-way with side): real out-share minus placebo out-share
(both from the touch-bar close, both resolved races), date-block bootstrap 95% interval. A cell is a **dynamic** only if
the interval excludes 0, |diff| ≥ 2pp, same sign in both halves of the test period (split at the test median date), and
n ≥ 300 real resolved races. Further splits (one-way, then two-way with hour group if ≥ 300): cell (used × pace),
regime, real-time jump-already-today. The number of cells examined is reported. **Overall verdict**: the moving lines are
*path-neutral* if no cell is a dynamic or the dynamics are fewer than 5% of cells examined (the expected chance rate at a
95% interval); otherwise "dynamics found" and they are listed.

**Q4 reach odds on jump days.** Rows (inst, date, h, side) where p75 is touched by the close: share also reaching p90
(implied ≈ 40%), and p50→p75 (implied ≈ 50%); plus the p75 exceedance (target 25%) and p90 exceedance (10%). Split by
BNS day and by real-time jump-before-h. The reach table stays **calibrated** on a split if the realised share is within
±5pp of implied (LINE_TOUCH_REACH's own rule, cells ≥ 200). **Jump-state adjustment:** replace the implied probability
by the train realised share conditional on the real-time jump state; it "fixes" the odds if test log-loss falls with a
date-block interval wholly below 0 and the miscalibration found is ≥ 5pp.

**Q5 line shifts.** At each redraw: |Δ offset| (re-estimate only) and Δ line (incl. running-extreme moves) in σ per rung,
distribution by hour, by "big jump in the last hour" (a 5-minute return ≥ 0.5σ in [h-1, h)). Does a big shift
(top decile of |Δ offset| on train, widening vs narrowing) predict anything: p75 reach exceedance, p75→p90 share and race
excess, by the Q3 dynamic rule. Descriptive otherwise.

**Q6 costs.** Any cell that passes as a dynamic is scored as a trade (entry touch-bar close, target next line out, stop
back level): gross edge = excess × (a + b) in σ per event, **net** = gross − spread/σ using `pylego.costs.default_spread`.
Execution-feasibility rule: spread ÷ ATR > 0.15 = dead (ATR proxied by 1σ-daily × 1.0, stated as such). If there is no
dynamic, no trade is scored and the reason is stated.

## Variant log (every variant logged before it runs)

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above; race to 22:00 on fixed levels; placebo baseline; refit grids on first 60% of dates | 2026-10-06 | run |
| 2 | race limited to the touch hour (the page's redraw interval) | 2026-10-06 | run |
| 3 | jump-through threshold 0.10σ and 0.50σ (sensitivity of J2) | 2026-10-06 | run (columns in the Q2 table) |
| 4 | shipped (all-data) params, same test period: shows how much the in-sample fit flatters the lines | 2026-10-06 | run |
| 5 | closer placebo (factors 0.90-0.97 and 1.03-1.10) for variants 1 and 2 | 2026-10-06, after variants 1-2 were seen, before 5 is run | pending |
| 6 | jump-state adjustment keyed on "a jump in the last hour before the redraw" (variant 1's adjustment used "a jump any time earlier today") | 2026-10-06, after variant 1's Q4 was seen, before 6 is run | pending |

Any further variant is appended here, dated, before it runs.

## Output

Script `forge/run_live_range_history.py`; tables `analysis/output/live_range_history/` (RESULTS.md, results.json);
verdict banked in `js/deskEvidence.js`.

## Amendment 1 (2026-10-06, after variants 1 and 2 were run, before variants 5-6)

Variant 2 flagged 42 of 196 cells, nearly all with the SAME sign (real below placebo by 2-4pp) — a systematic offset, not
cell-specific dynamics. A placebo at 0.7-1.3× distances has different distances (a, b) from the real line, and an
hour-limited race resolves the nearer barrier first, so the placebo's out-share is biased differently from the real
line's. Variant 5 shrinks the placebo's distance change to ±3-10% to see whether the offset shrinks with it (structural)
or stays (real). The registered rule and verdict for variants 1 and 2 stay as run. The BNS day flag is end-of-day and
defined by a jump bar, which is often the touch bar itself: it is descriptive only (as registered), the real-time
splits carry the usable reading.
