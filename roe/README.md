# roe/: Research Opportunity Engine, phase P1 (scanner and triggers)

Plain Python (stdlib + numpy; pandas only to read parquet), runs on the **owner's laptop**, also runnable against fixtures and
against the server's `GET /api/state`. Spec: `plans/RESEARCH_OPPORTUNITY_ENGINE.md` (v2.2, sections 6, 7, 8, 10, 18) and the
inventory, watch list and trigger definitions in `plans/DATA_AGENT.md`.

**Observation only.** The scanner flags readings that are unusual today. It computes no forward outcome, no return and no
performance statistic, makes no model call, writes no server route, KV key or R2 object, and never POSTs. Its output is not a
finding and not a signal.

## Run it

```
# live: GETs /api/state, /api/vol-forecast/hit-rates, /api/data-health, /api/desk-pack from production (read only)
python -m roe

# no network at all: synthetic fixtures with planted events (shows every trigger firing)
python -m roe --fixtures --asof 2026-11-06

# from saved documents (reproducible; this is what a re-run uses)
python -m roe --asof 2026-11-08 --state-file state.json --hit-rates-file hr.json --data-health-file dh.json --no-desk-pack

# useful flags
--asof YYYY-MM-DD     as-of date (default: today, UTC). Every loader is cut at it.
--out roe_out         output root (default roe_out/, gitignored)
--sources my.json     source map (default roe/sources.default.json)
--root <dir>          repo root the relative source paths resolve against
--offline             no GETs; the state document is then missing and the status is `failed`
--lookback N          sessions to back-evaluate so episodes exist on a first run (default 10, from the config)
--base-url URL        another server
```

Exit code: 0 = completed (`ok` or `degraded`), 2 = `failed` (discovery not completed), 3 = a run id conflict.

Tests: `python scripts/run_py_tests.py` (the CI `python` job; it now also globs `roe/tests/test_*.py`). Needs numpy, pandas, pyarrow
(all already in the CI install line); no pytest.

## On the laptop: point the adapters at the fresher local files

`roe/sources.default.json` points at the files committed in the repo, which are weeks behind (Cboe csv ends 2026-10-20/21, FRED seeds
2026-10-05, COT csv 2026-10-20). A stale input is still observed but every observation from it carries a `STALE:<series>` flag. For
a clean run copy the file, edit the paths, and pass `--sources`:

| key | what to point it at | format (what the loader reads) |
|---|---|---|
| `cboeDir` | folder of `<NAME>.csv` for VIX, VIX9D, VIX3M, VVIX, VXN, RVX, OVX, GVZ, VXEEM, VXTLT, VXFXI, VXEWZ, SKEW (refresh with `scripts/data/fetch_cboe_vol_indices.py`) | Cboe layout: `DATE` (MM/DD/YYYY) then `OPEN,HIGH,LOW,CLOSE`, or 2 columns `DATE,<name>`; the close is used |
| `fredDir` | folder of `DGS2.csv, DGS10.csv, T10Y2Y.csv, T10Y3M.csv` | `observation_date,<ID>`; `.` or blank = missing |
| `cotCsv` | `cot_weekly.csv` refreshed by `scripts/cot-crowding-programme/fetch_cot.py` | `sym,set,report_date,spec_long,spec_short,comm_long,comm_short,oi,...`; spec share = 100*(long-short)/oi; JPY/CAD/CHF are stored in pair terms and flipped to currency terms; a report is used only from report date + 3 days (the Friday release) |
| `calendarCsvs` | `calendar_events_nasdaq.csv` | schedule only (`date,ccy,impact,event`); actual/previous/consensus are dropped; `impact == Major` counts as high impact |
| `priceParquets` | NY-close daily parquets for SPX, NQ, GOLD (index = date, column `close`) | used for the 20-day realised vol in IV-minus-RV |
| `rangeCsv` | **optional laptop export** of the daily run's realised range and shipped line, for history beyond the API's ~90 sessions | `date,instrument,hl_pct,hl_median_pct,hl_75_pct` (all % of the session open); the live hit-rates document overlays it |

Server documents are overlaid on the files for the dates after the file ends (`overlay`): the state document carries only ~90-260
points per series, so the deep history (and the 756-day window) must come from the files. The server's own percentiles
(`pctile`, `ctx.pctAll`, COT `pct3y`) include today and use the full sample: they are kept only as `serverReference`, labelled
**`server, non-causal`**, and no trigger uses them.

## Schedule it after the daily run

Windows Task Scheduler (the daily run finishes about 07:30 London on weekdays; pick a time after it):

```
schtasks /Create /SC DAILY /ST 08:15 /TN "ROE scan" /TR "cmd /c cd /d C:\path\to\MacroFXModel && python -m roe --sources roe_sources.laptop.json >> roe_out\scan.log 2>&1"
```

cron: `15 8 * * 1-5  cd /path/to/MacroFXModel && python -m roe --sources roe_sources.laptop.json >> roe_out/scan.log 2>&1`

Re-running the same command with the same inputs is a no-op. Check `roe_out/<runId>/status.json` (`ok`, `degraded` or `failed`).

## What it writes: `roe_out/<runId>/` (gitignored; never overwritten)

| file | content |
|---|---|
| `snapshot.json` | run id, created time, code commit (`git rev-parse HEAD`, plus a dirty flag for `roe/`), sha256 of every input blob, per-series metadata (source, cadence, span, series hash, freshness flags, composite seam), config version and hash, the lockbox statement |
| `status.json` | `state` = `ok`, `degraded` or `failed`, `reasons[]`, `discoveryCompleted`, flag counts. `failed` (a required input missing: VIX, or the state document when it was required) means **discovery was not completed**; the board must say so and must not show yesterday as today |
| `observations.jsonl` | one line per (item, trigger, side, date): `obsId`, `item`, `trigger`, `triggerVersion`, `side`, value, causal percentiles (`roe, causal`), `serverPercentile` (`server, non-causal`), strength, `inputFlags[]`, `episodeId`, `familyId: null`, `scanBreadth`, `backfilled` |
| `episodes.json` | discovery episodes (state `opened`/`persisting`/`closed`, `familyId: null`), observations are never deleted |
| `state.json` | the measures per watch item (value, percentiles on both windows, robust z, 1/5/20-day change and its z), the top-10 coverage table |
| `summary.md` | what is unusual today, what fired on flagged inputs, staleness, open episodes, the top-10 coverage, flagged inputs |
| `inputs/` | raw copies of the server documents used (state, hit-rates, data-health) so the run can be replayed |

`runId = <asof>-<first 10 hex of sha256(asof, config hash, input-manifest hash, code commit)>`. Same id and same identity: no-op.
Same id (forced with `--run-id`) and different inputs, config or commit: `SnapshotConflict`, exit code 3. The observation id is
`sha256(item, trigger, triggerVersion, side, date)[:16]`, so a repeated push of the same observation can be recognised.

## What is frozen, and how

`roe/watch_config.json` is the ONE config (windows 252/756 trading days and 52/156 weeks for COT; trigger thresholds; episode gap
g = 3 sessions; freshness limits; the watch items). It has a `watchVersion`; its canonical-JSON sha256 is recorded in every snapshot
and pinned in `roe/config_pins.json`; a test fails if the file is edited without a new version and pin
(`python -m roe.pin_config` after bumping). A trigger's version is the `watchVersion` plus the hash of that trigger's own parameters.

Triggers: `extreme` (percentile above 95 or below 5 on both windows), `speed` (|robust z| of the 5-day, weekly 4-week, change >= 2
against the prior 252 changes), `flip` (sign of value-minus-centre changes and holds 3 sessions), `divergence` (60-session rank
correlation of daily changes >= 0.4 and the 20-session change of A, regressed on B over the prior 252, leaves a robust residual z >= 2),
`regime` (a category change that holds 3 sessions; or membership of an unusual state for point-only items), `stale` (an input carries
`STALE`). All percentiles and z-scores use only observations strictly before the as-of date; a test appends future rows and
asserts nothing changes.

## The owner's top-10 first watch items

| # | item | data it ran on | notes |
|---|---|---|---|
| 1 | VIX9D/VIX, VIX/VIX3M | Cboe csv + `/api/state` `history.long.VIX_TERM` | the 0.8858 / 0.9669 cut-offs of `vol-curve-front` are a `regime` trigger on VIX9D/VIX |
| 2 | VVIX/VXN and dR/dt | Cboe csv (VVIX also from state) | VXN is not in the state document: csv only. dR/dt = 5-session change of the 20-session mean of the ratio (our reading of DATA_AGENT C05) |
| 3 | ln(IV/RV20): VIX/SPX, VXN/NQ, GVZ/gold | Cboe csv + state; NY-close parquets + state sparks | RV from daily closes, annualised |
| 4 | realised HL vs the shipped p75 line | `/api/vol-forecast/hit-rates` (30 instruments, ~65 sessions); laptop `rangeCsv` for more | share of the last 5/20 sessions above p75 (nominal 25%), fires at >= 60% of 5. **Lockbox-adjacent**, see below |
| 5 | COT spec-share extremes (FX, indices, metals/energy) | `cot_weekly.csv` | weekly windows 52/156; 4-week change z |
| 6 | COT crowd into a high-impact release | `cot_weekly.csv` + calendar csv | crowd = 156-week percentile >= 90 or <= 10, a `Major` release for that currency in the next 3 sessions |
| 7 | gamma flip distance, PIN/BREAKOUT breadth | `/api/state` `assets.gamma` (today only) | sign only; no history until the Cboe archive grows; `flip` needs a previous run's `state.json` |
| 8 | 2s10s, 3m10y flips; steepener/flattener class | FRED csv + state sparks | state/conditioning labels only, no direction claim |
| 9 | cross-asset vol breadth (10 indices) | Cboe csv + state | count with 252-day percentile >= 90, fires at >= 6 of the fresh components; also a VIX level-state regime |
| 10 | daily-run and feed health | state `health`, `/api/data-health`, `/api/desk-pack` `dataQuality` | `stale` triggers; every input series is also checked |

## Lockbox and data-boundary hygiene (ROE section 8)

* The scanner may look at data up to the as-of date, H-A included (8.6). It forms no outcome and selects nothing by outcome.
* It must not use outputs of the frozen layers 3, 5, 6 (HAR-800 sigma, R3 remaining travel, M2 confidence) or the shadow screens:
  `roe/lockbox.py` refuses to run if an item or input names one, and a test fails if one is added. It imports nothing from `forge/`.
* **Item 4 is the one judgement call.** The shipped p75 line is the production forecast (`fc.hl_75`, `fc.hl_median` of the daily run),
  used only as a threshold. It is not the HAR-800 shadow, but `js/forecastLadderParams.js` and `forecastLadder.js` are in the layer-3
  file list of `forge/lockbox_manifest.json`. Every observation from it carries `LOCKBOX_ADJACENT:shipped_line`; set
  `"enabled": false` on the `hl_p75` item (and bump the version) to remove it.

## Not built (later phases)

Server routes and KV keys, R2 writes, the push client, the question writer (P3), hypothesis families (`familyId` is always null),
the evaluator, Research QA, the board, the forward tracker (P2-P7), the remaining watch items of the 72 (P8), Cboe-chain gamma
percentiles (no history yet), FX skew, the feature store, IBKR files and M1 realised ranges. Exchange holidays are not modelled
(sessions are weekdays).
