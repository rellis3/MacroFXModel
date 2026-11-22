# Futures Line Lab

One runner (`lab.py`) for the vol-line touch work on NQ, 6E and GC futures. Every step done so far is stored as a
preset, so a calculation (stop, target, VWAP anchor, stack rule, filters, horizon) can be changed and re-run without
writing a new script. Register row: `futures-line-lab` (EXPLORATORY).

Every run is **exploratory, not pre-registered**. A run that looks interesting goes to its own prereg and slug before
anything is claimed or banked (research-protocol).

## Run it

```bash
python -I scripts/futures-line-lab/lab.py scripts/futures-line-lab/presets/03-better-level-race.json
python -I scripts/futures-line-lab/lab.py scripts/futures-line-lab/presets/04-vwap-fade.json \
    --name vwap-fade-globex --set trade.target.anchor=globex
python -I scripts/futures-line-lab/lab.py --list
```

`--set dotted.key=value` overrides any config key (values are JSON, so `0.3`, `true`, `["p90"]` work).
The first run per instrument builds a cache of touches and bars (`analysis/output/futures-line-lab/cache/`, gitignored,
~10 minutes per instrument); later runs take about a minute.

Each run writes `analysis/output/futures-line-lab/runs/<name>/`:
`config.json` (the full config after defaults), `results.json`, `SUMMARY.md`, and `trades.parquet` (gitignored). The
list of runs is `runs/index.json`.

## Presets (the steps so far)

| Preset | Step | What it does |
|---|---|---|
| `01-mae-mfe-all-families` | 1 | MAE / MFE at every touch of OH/OL, OC, HL p50/p75/p90, against the ×0.85 / ×1.15 placebo ladders |
| `02-stacks` | 2 | Lines close together: stacked (another line within 5 ticks) vs lone, medians in σ, back-wins |
| `03-better-level-race` | 3 | Better level (outermost of a stack) + race: median MAE stop vs median MFE target, 60 one-minute bars |
| `04-vwap-fade` | 4 | Fade to the session VWAP frozen at the bar before the touch, 0.25σ stop, to 22:00, after cost |
| `05-vwap-fade-mae-stop` | 5 | The same VWAP fade with the median 60m MAE as the stop |

## What can be changed

| Key | Options |
|---|---|
| `instruments` | `NQ`, `EURUSD` (6E), `GOLD` (GC) |
| `lines` | `v3` (production calc via the day-reconstruction archive, 2016+; default) or `v2` (re-synced ladder-v2 futures σ: NQ har_rv_log, GC HAR-RV 5-min, 6E HAR-CJ; walk-forward widths from `ladder-v2-<sym>/test_F.parquet`, 2018+). Compare like for like with `--set select.date_from=2018-01-02` on v3 |
| `select.date_from` | first London date to use, e.g. `2018-01-02` |
| `select.kinds` | `line`, `placebo_085`, `placebo_115` |
| `select.groups` / `rungs` / `sides` | `OH/OL`, `OC`, `HL` / `p50`, `p75`, `p90` / `up`, `dn` |
| `select.set` | `all`, `better` (outermost of its stack), `first` (touch 1), `better_first` |
| `select.stack` | `{"unit": "ticks", "width": 5}` or `{"unit": "sigma", "width": 0.05}` |
| `select.query` | any pandas query on touch columns: `touch_n`, `lon_hour`, `weekday`, `near_ticks`, `near_sig`, `stretch` (VWAP z), `range_used`, `speed`, `vol_ratio`, `date` |
| `select.dedupe_bar` | `true` = one touch per bar and side, the outermost line (as the VWAP test) |
| `by` | grouping for the tables: any of `instrument`, `kind`, `group`, `rung`, `side`, `touch_n`, `lon_hour`, `weekday`, `split` |
| `steps` | `excursions`, `stacks`, `trade` |
| `trade.mode` | `fade`, `continue`, `both` |
| `trade.horizon` | `60m`, `240m`, `eod`, or a number of minutes |
| `trade.stop` | `{"type":"sigma","mult":0.25}`, `{"type":"ticks","n":20}`, `{"type":"median_mae","horizon":"60m","units":"price"/"sigma","fit":"all"/"discovery","fit_on":"selected"/"all_lines","fit_by":["group"]}` |
| `trade.target` | `{"type":"vwap","anchor":"london"/"globex"/"rth"}`, `{"type":"median_mfe",...}`, `{"type":"sigma","mult":x}`, `{"type":"ticks","n":x}`, `{"type":"rr","mult":x}` |
| `trade.cost` | `{"ticks": 2, "commission_usd": 4}` (round trip) |
| `splits.discovery_end` | default `2023-01-01`; the holdout runs to the lockbox |

## Rules built in

- Data: NT8 continuous unadjusted 1-minute bars with real exchange volume. Bars are end-stamped, so each is moved back
  one minute. London session 00:00–22:00. Days with fewer than 90% of bars are skipped.
- Lines and touches are `scripts/line-touch-mae-futures/build.py`'s: point-in-time widths from the day-reconstruction
  archive, re-arm after 0.1σ back on the open side.
- Trades are walked one minute bar at a time. Fade: stop checked from the touch bar, target from the next bar. A bar
  that reaches both counts as a stop. `minutes_to_target_med` reports how long fills took.
- VWAP = Σ(typical price × volume) ÷ Σ volume from the anchor, reset when the contract changes, and frozen at the bar
  before the touch. `london` resets at 00:00 London (the lines' session), `globex` at 18:00 New York, `rth` at 09:30
  New York (no target before the cash open).
- Every trade table shows `random_walk_pct` = stop ÷ (stop + target): the target-first odds of a coin-flip path. Read
  `target_share_resolved` against it. That gap, not the win rate, is the edge.
- The lockbox (dates from 2026-08-21) is always excluded.
- **Touch-bar tilt (found 2026-11-18 by preset 03):** the touch bar's extreme beyond the line counts (it is after the
  touch), but its move back does not (it may come before the touch). So the "through" side gets a one-bar head start in
  both modes, and every race reads about 2-3 points against the random walk on the fade side and 1-3 points for it on
  the continue side (preset 03: fade 47-50% vs 50-53% random walk; continue 50-52% vs 47-50%). It is a measurement
  convention, not a market effect. Compare fade with continue, or with the placebo kinds, not with the bare
  random-walk figure.
