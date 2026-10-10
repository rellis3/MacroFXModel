# Level registry v1: inventory (Phase 1, time-boxed; scope FROZEN 2026-10-11)

**Built by:** `scripts/levels/build_registry.mjs`, calling **production's own calculators** without reimplementation:
- `js/rangeLineAnalyser.js` `sessionConfluenceLevels`, the function the range-line bot's backtest and live producer share;
- `js/levelSources.js` `daily_open`.

**Inputs:** for every instrument and London session, data strictly **before 00:00 London**:
- New York-close daily bars (the research file `analysis/output/ladder_candidates/d1/<SYM>.json`, identical to `nyCloseDailyBars`);
- the previous 6 days of M1;
- canonical pip sizes.

**Output:** `data/levels/registry/<SYM>.csv` (gitignored). 4,377,670 levels; 34 instruments; 2,697 sessions each; 2016-03-28 → 2026-08-20; about 52 levels per session.

**Parity:** independent Python recomputation of the closed-form families on 10 random sessions per instrument gives **6,980 / 6,980 exact** (`analysis/output/level_p2/REGISTRY_PARITY.md`). The other families **are** the production code.

**Live-API parity:**
- **Not run.** No endpoint serves these levels for a historical date. Today's levels would need data from the reserved forward block.
- **Risk is low**, because the registry calls the same functions production calls.
- **Recorded as a limitation.**

## Families

| Family | Source | Per session | Point in time | Known limitations | Ready |
|---|---|---|---|---|---|
| Daily opens (last 5) | `levelSources.daily_open` | 5.0 | Yes (before 00:00) | NY-close day boundary (17:00 NY), not London | **Yes** |
| Prior high/low (PDH, PDL, PWH, PWL, 20-day high/low) | `prior_hilo` | 6.0 | Yes | Week = Monday-anchored on the NY closing date | **Yes** |
| Classic pivots (PP, R1–R3, S1–S3) | `pivots` | 7.0 | Yes | From the NY-close prior day | **Yes** |
| Round numbers (100 and 50 pip grid, ±200 pips) | `round_number` | 8.0 | Yes | Fixed grid per pip size; CADCHF pip from fallback (missing from `instrumentRegistry`) | **Yes** |
| Volume profile (5-day composite POC/VAH/VAL) | `volume_profile` | 3.0 | Yes | Tick volume (activity proxy for FX); 1-pip bins | **Yes** |
| VWAP anchors (last 5 days + latest) | `vwap` | 4.7 | Yes | UTC-day buckets; tick-volume weighted | **Yes** |
| Swing fib clusters (60-day, daily bars) | `swing_fib` | 11.1 | Yes | Parameter-heavy defaults; clustered | **Yes** |
| 15-minute fib clusters (6 days) | `fib15` | 2.5 | Yes | As production | **Yes** |
| Swing S/R (20-day daily swings, strength 5) | `swing_sr` | 0.6 | Yes | Sparse at the production defaults | **Yes** (few rows) |
| Export ladder O-H/O-L p50/p75/p90 | `forecast_history` `pit_*` | 6 | Yes (walk-forward; burn-in before 2020-08 is in-sample, used for fitting only) | Event tags unknown after 2026-07-02 (×1.0) | **Yes** (added in Phase 2 rows) |
| Today's London open, Asia high/low (from 07:00), London high/low (from 12:00) | M1 | up to 5 | Yes (available only after forming) | Re-touch since formation is not tracked | **Yes** (added in Phase 2 rows) |

## Excluded from v1 (backlog; not blocking)
1. **OI walls, GEX, max pain:** need the OI archive's publish-lag timing per date and only cover the instruments with an options capture. Separate point-in-time build.
2. **COG bot lines:** derivable from the incumbent σ reconstruction (Stage B Part 1); add if the scenario layer needs the bot's own lines.
3. **Naked levels** (`nakedLevels`, production default `naked=false`) and **liquidity levels:** duplicate the volume profile plus prior extremes.
4. **Live-API parity** for a historical date (no endpoint exists).
5. **Registry speed:** about 7 minutes per instrument (production calculators on 6 days of M1 per session). Fine for research, not for live use.
6. **CADCHF missing from `instrumentRegistry`** (pip fallback used): a one-line fix in production, out of scope here.
7. **The 48-hour KV gate:** confirmed not to apply to server-written keys (Stage C note); no action needed.

**Scope frozen.** Phase 2 uses exactly these families. Changes go to a v2 registry with its own record.
