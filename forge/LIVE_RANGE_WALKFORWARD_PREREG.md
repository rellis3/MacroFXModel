# LIVE-RANGE-WALKFORWARD: a daily train-forward continue-or-fade book on the hourly-moving lines (2018-2026)

*Pre-registered 2026-10-06, before any result. Owner's design: over the 10 years, train on the days before, trade the next day,
retrain every day; with the hourly-moving lines, the candles intersecting them, and conditioning on day of week and time of day,
decide for each of the p50 / p75 / p90 lines whether to CONTINUE or FADE. Follows `LIVE_RANGE_HISTORY` (path-neutral) and
`LIVE_RANGE_BOOK` (0/838 cells, one 60/40 split); this removes the single split. Research only, no live changes, no Vote Atlas input.*

## Two layers, both walked forward with no future data
1. **Lines.** Grids / tercile edges refit on ALL prior dates, **every calendar quarter** (expanding window; the grids need thousands of days
   per cell so a daily refit would move them negligibly — stated approximation). Sessions in a quarter use the fit made at its start.
   Scoring starts 2018-04-01 (≥ 2 years of prior data), ends 2026-08-20. Page σ (`pit_sig_daily`), 5-minute bars, 34 instruments.
2. **Decision.** Every trading day d and every cell, using ONLY events on dates < d (resolved by 22:00 the same day they occur, so no
   leakage): trailing mean net R of CONTINUE and of FADE (definitions as LIVE_RANGE_BOOK: entry = touch-bar close; continue = target
   next line out / stop back level; fade = reverse; net of default spread ÷ σ; pre-resolved, both-in-bar and unresolved races dropped).
   Choose the strategy with the higher trailing mean if its mean ≥ **+0.03R**, t ≥ **3**, n ≥ **200**; otherwise **no trade** in that cell.
   Trade every event of that cell on day d with the chosen strategy.

## Cells (class × rung p50/p75/p90 × …)
- **A:** hour of the touch (1..21) · **B (primary):** weekday × hour · **C:** weekday × session (Asia <07, London 07-12, overlap 12-16, NY/late 16+).
- Side pooled (up and down lines together); instruments pooled within class (fx_gold, indices).

## Scoring and pass rule (per cell family A/B/C, primary B)
Out-of-sample trades on 2018-04 → 2026-08. Statistics: mean net R per trade, day-block bootstrap 95% interval (all instruments of a date
together), by calendar year, trades per year, share of trades continue vs fade.
**PASS** if (i) mean net R > 0 with the interval's lower bound > 0; (ii) positive in ≥ 6 of the 8 full years 2018-2025; (iii) it beats the
**placebo** — same cell-days traded, strategy picked at random 50/50, 200 draws — with the interval of (selected − placebo) wholly > 0.
Both continue and fade are always reported; always-continue and always-fade on the same traded set shown beside.

## Variant log
| # | Variant | Added | Status |
|---|---|---|---|
| 1 | primary: expanding window, mean ≥ +0.03R, t ≥ 3, n ≥ 200, families A/B/C | 2026-10-06 | pending |
| 2 | loose: mean > 0, t ≥ 1.5, n ≥ 100 | 2026-10-06 | pending |
| 3 | rolling 3-year training window instead of expanding | 2026-10-06 | pending |
| 4 | trailing-regime-aware: decisions made separately for the top / bottom half of trailing 250-session σ | 2026-10-06 | pending |

Further variants dated and logged before they run. Also reported, descriptively: for each class × rung, how often the walk-forward chose
continue / fade / no trade by hour and weekday, and how stable the choice was year to year ("track if at p50/p75/p90 we should continue
or fade"). Output `analysis/output/live_range_wf/RESULTS.md`; banked in `js/deskEvidence.js`.
