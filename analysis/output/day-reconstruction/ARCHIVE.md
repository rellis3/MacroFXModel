# Day reconstruction — Milestone 2: the daily and touch-transition archive

Built 2026-10-29 for GOLD, NQ and EURUSD, following `VALIDATION.md` §3 and §5 (milestone 1). Research area only:
no production file was changed. This milestone builds and validates the archive. It contains **no** behaviour
analysis, model, indicator or strategy.

## What is in it

| File (in `archive/`) | Rows (GOLD / NQ / EURUSD) | One row per | In git |
|---|---|---|---|
| `<NAME>_days.parquet` | 2,684 / 2,687 / 2,697 | instrument-day, 2016-03-28/29 → 2026-08-20 | yes |
| `<NAME>_touches.parquet` | 11,778 / 11,404 / 11,282 | first touch of a level on a day | yes |
| `<NAME>_path.parquet` | 3,480,363 / 3,448,115 / 3,489,408 | M1 bar of an archived session | **no** (50–80 MB each, rebuilt from the M1 cache; sha256 in `MANIFEST.json`) |
| `<NAME>_sessions.json` | per day | bar count, first/last time, close checksum | yes |
| `MANIFEST.json`, `validation.json`, `validation.log`, `selftest.json`, `build_meta_*.json` | | | yes |

**Rebuild:**

```
python scripts/day-reconstruction/ff_tags.py GOLD NQ EURUSD           # event tags (milestone 1)
node scripts/day-reconstruction/build_archive.mjs --selftest          # lookahead self-test
node scripts/day-reconstruction/build_archive.mjs GOLD NQ EURUSD      # days + touches (JSON lines, gitignored)
python scripts/day-reconstruction/finalize_archive.py                 # parquet + path + checks A-H + manifest
python scripts/day-reconstruction/validate_post.py                    # check I
```

## How it is built

The rules below are the conventions fixed in milestone 1.

- **Days and open:** `v4Days` (js/voteAtlasV4Lines.js). London calendar day, weekdays only. The open is the first M1
  bar at or after 00:00 London. σ comes from NY-17:00 daily bars that closed before that open.
- **Session window:** London 00:00 → 22:00, the window the widths were fitted and scored on.
- **Levels:** `buildLadder` / `ladderLevels` (js/forecastLadder.js), unchanged.
  - **Point-in-time parameters:** each date uses the walk-forward fold in force on it, with that fold's own
    estimator, passed through `buildLadder`'s `ladderParams` argument (`era = oos_pit`, 2020-08-21 → 2026-08-20).
  - **Before the first fold:** production parameters (`era = insample_prod_params`, 2016 → 2020-08-20, exploratory).
  - **Event tags:** repaired ForexFactory history through 2025-04-07 (`tag_status = ff`). After that the tag is
    unknown, ×1.0 (`tag_status = unknown`).
- **The 24 levels**, named as in the code:

| Family | Rungs | Price at bar k | On the TradingView chart |
|---|---|---|---|
| `OH` (export "Open High") | p50 p75 p90 | open × (1 + OH%) | yes |
| `OL` (export "Open Low") | p50 p75 p90 | open × (1 − OL%) | yes |
| `CloseUp` / `CloseDn` (export "Open to Close") | p50 p75 p90 | open × (1 ± OC%) | p50, p75 ("Close med/75p"). p90 is export-only |
| `ProjH` | p50 p75 p90 | (running low through bar k−1) × (1 + HL%) | p50, p75. p90 is export-only. The chart uses bar k's own extreme |
| `ProjL` | p50 p75 p90 | (running high through bar k−1) × (1 − HL%) | as ProjH |

- **Touch:** the first M1 bar whose high (up levels) or low (down levels) reaches the level as priced at that bar.

## Schema

### Day table (`<NAME>_days.parquet`)

| Column(s) | Meaning |
|---|---|
| `instrument`, `date` (London date), `weekday` (0 = Sun … 6 = Sat) | key |
| `open`, `t_open`, `t_last`, `n_bars` | session open price and first/last bar time (UTC epoch s) |
| `era`, `fold`, `estimator` | parameter version used: `oos_pit` + fold 0–5, or `insample_prod_params` |
| `sigma_daily_pct`, `sigma_used_pct` (after event mult), `vol_annual`, `event_tag`, `tag_status`, `event_mult` | the forecast inputs |
| `scale` | open × σ_used: the day's price unit. Every `_sig` column is divided by it |
| `hl_p50..p90`, `oc_p50..p90`, `oh_p50_pct..p90_pct`, `ol_p50_pct..p90_pct` | the ladder rungs, % of open, as buildLadder rounds them (2 dp) |
| `lvl_<OH/OL/CloseUp/CloseDn>_<rung>` | the static level prices |
| `sigma_rank_250` | today's σ_daily as a share of the prior ≤ 250 archived days' σ (null with < 60) |
| `prev_date`, `prev_close`, `gap_pct`, `prev_hl_pct`, `prev_consumed_hl_p50` | opening conditions from the previous archived session (its 22:00 London close and range) |
| `high`, `low`, `close`, `t_high_min`, `t_low_min` | the day's realised extremes and close; times in minutes after the open |
| `hl_pct`, `oc_pct` (signed), `oh_pct`, `ol_pct`, `consumed_hl_p50` | realised range quantities, % of open; range ÷ HL p50 |
| `first_<level>_min` | minutes after the open of each level's first touch (null = not reached) |
| `reach_order` | levels in order of first touch. `>` = later minute, `=` = same minute (unordered) |

### Touch table (`<NAME>_touches.parquet`): one row per first touch

| Column(s) | Meaning |
|---|---|
| `instrument`, `date`, `level`, `family`, `rung`, `side` (up/dn), `kind` (static/proj) | key |
| `era`, `tag_status`, `weekday`, `sigma_used_pct`, `scale`, `open` | copied from the day |
| `level_price`, `k`, `t` | level as priced at the touch bar, the bar index into the path, its time |
| `min_since_open`, `min_to_end` | time elapsed and time left in the session |
| **before** `run_hi_before`, `run_lo_before`, `hl_before_pct`, `consumed_hl_p50/p75/p90`, `up_travel_before_pct`, `dn_travel_before_pct`, `levels_before` | state from bars 0..k−1 only. `levels_before` lists every level already touched, so it covers "opposite side already reached" and "median/75th range already exceeded" |
| **at** `hl_at_touch_pct`, `same_bar_levels`, `ambiguous_order` | range including bar k. Other levels first touched in the same minute. `ambiguous_order = true` when that minute also first-touched a level on the **other** side, so one minute cannot order them |
| **after** `cont_max`, `cont_max_sig`, `cont_max_min` | furthest move beyond the level in the touch direction, bar k to session end (bar k's extreme is at or after the touch), and when |
| `rev_max`, `rev_max_sig`, `rev_max_min` | furthest move back through the level toward the open, from bar k+1 (bar k's other extreme may precede the touch), and when |
| `return_min`, `revisit_min` | first M1 close back on the open side of the level; first re-touch after that |
| `next_<level>_min`, `next_Open_min` | minutes until price next **trades through** each other level (and the open) from the side the touch bar closed on. Equal minutes on opposite sides = unordered |
| `close`, `close_vs_level_sig`, `close_vs_open_sig` | where the session ended, signed in the touch direction |
| `h1_close_min` | minutes until the first H1 close beyond the level: the live tracker's "reached" rule (null = never) |
| `float32_tie` | the touch minute depends on float32 rounding of a price equal to the level (check C) |

### Path (`<NAME>_path.parquet`)

`date`, `i` (bar index within the session, the touch table's `k`), `t`, `open`, `high`, `low`, `close`, `volume`: every
M1 bar of every archived session (float64, from the M1 cache). Any touch replays as
`path[(path.date == date) & (path.i >= k)]`.

## Validation results

| Check | GOLD | NQ | EURUSD |
|---|---|---|---|
| Lookahead self-test: pre-touch fields identical when every later bar is deleted or replaced (660 comparisons, sampled EURUSD days) | 0 failures; a post-touch field changed in 329 of 330 cases (the test can fail) | same code | same code |
| A. Path vs builder sessions: bar counts, first/last time, close checksum | all equal (checksum ≤ 2e-8) | all equal | all equal |
| B. Production-era rungs vs the milestone-1 `v4Days` dump | 1,136 days, exact | 1,136 days, exact | 1,141 days, exact |
| B. OOS rungs vs fold width × σ (forge Python estimator) × fold event mult, recomputed | 1,548 days, exact | 1,551 days, exact | 1,556 days, exact |
| C. Every touch re-found from the float64 path by an independent Python re-implementation | 11,777 of 11,778 | 11,403 of 11,404 | 11,278 of 11,282 |
| D. Day high/low/close vs path | equal | equal | equal |
| E. Inner rung touched no later than outer rung, every family | 0 violations | 0 | 0 |
| F. Exceedance (OOS, tagged days) vs milestone 1 | ≤ 0.25 pp apart | ≤ 0.08 pp | ≤ 0.34 pp |
| G. Touches never confirmed by an H1 close, OH/OL p50 → p90 | 17–29% | 16–26% | 18–26% |
| I. Post-touch fields re-derived on 600 random touches (cont/rev max, return, revisit, time to open, time to next rung) | 0 failures | 0 | 0 |
| Two-sided same-minute touches (`ambiguous_order`) | 12 | 0 | 0 |

**Notes on the checks:**
- **C:** the 6 disagreements are all prices equal to the level at float32 precision; they're flagged `float32_tie`.
- **F:** the small gap is the 2 dp rounding of the rungs, which the archive keeps because production does.
- **G:** matches milestone 1's V7.

**Coverage:**

| | GOLD | NQ | EURUSD |
|---|---|---|---|
| Days, `oos_pit` / `insample_prod_params` | 1,548 / 1,136 | 1,551 / 1,136 | 1,556 / 1,141 |
| Days, `tag_status`: unknown | 354 | 355 | 356 |
| Weekdays with no bar in the 00:00–22:00 London window (excluded, counted in `build_meta_*.json`) | 16 | 16 | 15 |

## Limitations (what the archive does not settle)

1. **NQ** is on OANDA NAS100 σ, as the widths were fitted. The published NQ lines use Yahoo NQ=F σ and sit about 2%
   wider (median; up to ~13% on some days).
2. **2016 → 2020-08-20 uses production parameters fitted on those years** (`insample_prod_params`). Treat it as
   exploratory. `oos_pit` is the evidence era.
3. **Event tags are unknown from 2025-04-08** (`tag_status = unknown`, ×1.0). Production would apply ×0.93–1.24 on
   those days. Report results with and without them.
4. **Prices inside the builder are float32**, from the repo's M1 loader. That decides exact ties between a printed
   price and a level:
   - 6 touches carry `float32_tie`;
   - in a float64 re-check, about 0.7% of touches move their `next_Open_min` by a minute or more, because the open is
     itself a printed price that later bars hit exactly.

   The archive is internally consistent (check I on float32-cast prices: 0 failures).
5. **One minute is the resolution:**
   - the order of events inside a bar is unknown, so `ambiguous_order` and equal `next_*` minutes mark it;
   - `cont_max` includes the touch bar's own extreme;
   - `rev_max` starts at the next bar.
6. **Mid prices only.** Spreads and costs aren't in this archive. The OANDA bid/ask M1 history
   (`data/m1_bidask_bin`, from 2016-10) is the source for costs later.
7. **The session ends at 22:00 London**, up to an hour before the live audit window ends. Nothing after it is
   recorded.
8. **Three rungs aren't drawn on the TradingView chart:** `ProjH/ProjL p90` and `CloseUp/CloseDn p90` are export-only.
   Chart Proj lines also use the current bar's own extreme, which the archive deliberately does not.
9. **Context columns are only what the forecast and the path give:** σ, σ rank, event tag, weekday, gap, previous
   day's range, range consumed, time of day, levels already reached. No other data source was added.
10. **Lockbox:** nothing after 2026-08-20 is in the archive.
