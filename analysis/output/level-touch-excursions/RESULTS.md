# level-touch-excursions: results (exploratory, not pre-registered)

Register row `level-touch-excursions` (EXPLORATORY, 6557db2e). Script `scripts/level-touch-excursions/run.py`; tables
`by_touch.csv`, `by_hour.csv`, `by_touch_hour.csv`, `by_line_tau.csv`, `per_instrument.csv` (instrument × line × τ ×
touch number × hours); `results.json`; log `report.txt`. Per-touch files (`touches/`) are not committed.

Jordan's step 3 (a C.OG group member): stop and target from MAE / MFE at the levels. **Every** touch of each
instrument's own per-line QLIKE level (Close+, Close−, OH, OL; median/75th/90th), not only the first. A new touch
counts after price has moved 0.1 line-σ back off the level. Per touch:
- **MAE**: how far price goes through the line, i.e. against a fade (the touch bar counts).
- **MFE**: how far it comes back toward the open (from the next bar).

Both are in the line's own daily σ, at 30 min, 60 min and to 22:00 London. Placebo levels (0.75–0.90 / 1.10–1.25 ×
distance) are measured the same way. 25 futures (~165,000 Close± touches) and 40 CFDs (~287,000), 2020 → 2026-08-21.

## 1. Stop and target sizes (line σ, all touches)

| | through (MAE) 30m p50 / p75 / p90 | back (MFE) 30m p50 / p75 | MAE 60m p75 | MFE 60m p50 |
|---|---|---|---|---|
| Futures, 1st touch | 0.13 / 0.26 / 0.46 | 0.13 / 0.24 | 0.35 | 0.18 |
| Futures, later touches | 0.12 / 0.23 / 0.39 | 0.12 / 0.23 | 0.31 | 0.17 |
| CFDs, 1st touch | 0.12 / 0.24 / 0.42 | 0.12 / 0.22 | 0.32 | 0.16 |
| CFDs, later touches | 0.11 / 0.21 / 0.36 | 0.11 / 0.21 | 0.29 | 0.16 |

Close± and OH/OL are almost identical. Example: a line with σ 1% of price has a 30-minute overshoot of 0.26% at the 75th
on futures.

## 2. Time of day changes the size, a lot

MAE 30m p75, Close± lines:

| | 00–07 | 07–10 | 10–13 | **13–16** | 16–22 |
|---|---|---|---|---|---|
| Futures | 0.22 | 0.21 | 0.20 | **0.31** | 0.21 |
| CFDs | 0.22 | 0.22 | 0.19 | **0.28** | 0.18 |

Touches between 13:00 and 16:00 London (US open) run about 1.4–1.5× further both ways than the morning; 10–13 and the
evening are the quietest. Stops sized for a morning touch get hit by ordinary noise in the afternoon.

## 3. Touch number changes the size a little, not the direction

- **1st touch overshoots most** (futures 30m p75 0.26 vs 0.23 for later touches; p90 0.46 vs 0.39).
- **2nd and 3rd touches are the tightest**; 4+ widens again before 07:00 London.
- To the close, later touches have smaller moves left because they happen later in the day.

## 4. Direction: still a coin flip at every touch and hour

MFE beats MAE within 60 min on 50–51% of touches for every touch number and hour, and the line is within about 1 pp of
its placebo. Line minus placebo over 80 touch × hour × side × family cells: mean +0.1 pp (range −2.2 to +4.1, as
expected by chance at these counts). The largest positive cells were futures 4+ touches before 07:00 London (+3 to
+4 pp, small n). These are descriptive pointers only. Overshoot and come-back are the same size (MAE ≈ MFE), so a fade
or a follow at the line has the same odds before costs.

## 5. By instrument

The 30-minute overshoot at the 75th line ranges from ~0.17σ (EURNZD, AUDNZD) to ~0.30σ (PALLADIUM), so size from the
per-instrument table, not the pooled numbers.

## What it means for SL / TP

- **Stop for a fade:** beyond the 30-min MAE p75 for that instrument × hour (≈ 0.2–0.3σ). Use the p90 (≈ 0.4–0.5σ) to
  survive most noise, wider in 13–16 London.
- **Target:** MFE median ≈ 0.12σ in 30 min, 0.17σ in 60 min. The payoff is symmetric with the stop odds, so the level
  alone gives no edge after costs. A trade needs an extra condition (Jordan's entry trigger, VWAP, flow, the vol
  layers) that skews MFE over MAE.
- **2nd/3rd touch in 10–13 London** is the quietest place to fade with a tight stop; it is not more likely to turn.
