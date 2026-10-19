# Data faults, contradictions and stale docs

The authoritative fault table is `plans/DATA_SPEC.md` §5. This file mirrors it in one line each, plus the
contradictions found between docs and code. Add new entries at the bottom of the right table, dated.

## Faults (mirrors DATA_SPEC §5)

| # | Fault | State |
|---|---|---|
| 1 | `*_d1.parquet` are UTC days with Sunday stubs | Research uses NY-close bars. IV-adjusted refit switched 2026-10-06 (`js/forecastLadderIvAdjParamsNY.js`); old widths ran ~10% too wide |
| 2 | Live index σ from Yahoo vs research OANDA | Fixed 2026-10-06 for SPX500/US30/US2000/DE30/UK100 (OANDA NY-close for ladders) |
| 3 | vol_session audits after London midnight recorded the next session (6 of 15) | Fixed cf47b9a0. Bad records stay; readers skip them via `auditUsable` |
| 4 | vol_session `oc` is signed | Documented; readers take abs |
| 5 | Calendar proxy ends 2026-07-02 | open |
| 6 | `inverseVolWeights` (`js/levelAtlasVoteReview.js`) uses full-sample variance (lookahead) | open |
| 7 | Local M1 cache ends 2026-08-21 (DE30/UK100 a day earlier) | open; past that is the H-A holdout anyway |

## Incidents

| Date | What | Lesson |
|---|---|---|
| 2026-08-16 | A local test run without `--as-of` used live R2 credentials and overwrote 41 motif trade-log records (`AnalogML/fix_r2_corruption_20260816.py`) | Never track or score locally with live R2 credentials |
| 2026-08-18 | Truncated `analogml/m1/` objects (chfjpy, euraud, eurjpy, gbpcad, gbpjpy, nzdusd) from non-atomic writes and racing loops (`AnalogML/purge_corrupt_m1_cache_20260818.py`) | Atomic writes and guarded reads, now in `refresh_m1.py` |
| 2026-08-24 | Gold pip 0.1 in `js/utils.js` and `levels.js` | Canonical 1.0, delegated to the registry |
| 2026-09-16 | eurusd/gbpusd/audusd parquets with 8 columns (BAM) collapsed every row to 1970 in `loadM1ForPair` | Fetch with `--price M` |

## Contradictions between docs and code (as of 2026-10-12)

1. `scripts/fetch_m1_oanda.py` defaults to `--price BAM`, and its docstring says the JS reader uses `row[5]`. The loader
   reads the last column. Use `--price M`.
2. DATA_SPEC fault 7 and the lockbox point at `AnalogML/refresh_m1.py` for top-ups, but that writes
   `AnalogML/data/m1/`, not the research cache. The holdout-safe downloader is `scripts/fetch_m1_forward.py` →
   `data/m1_forward/`.
3. Cache end date is given as 2026-08-21 (DATA_SPEC, lockbox) and 2026-08-20 (IEP prereg, fetch_m1_forward).
   `MD files/CLAUDE.md` says the R2 parquet was capped at 2026-05-21 on 2026-09-08. Check the actual last bar.
4. `fetch_m1_oanda.py`'s docstring says `OANDA_ENV` defaults to `live`; the code defaults to `practice`.
5. `bucketM1IntoSessions` defaults to a 22:00-UTC boundary, not London.
6. `calendar_events.csv` and the ForexFactory archive use different impact taxonomies.
7. `MD files/CLAUDE.md` is not at the repo root, so it isn't auto-loaded by Claude Code despite its header.
8. The blueprint's layer-1 list says the IV-adjusted re-check is "pending" and late audits were "6 of 14". DATA_SPEC
   says switched 2026-10-06 and "6 of 15". Trust DATA_SPEC.
9. `PIP_CALCULATION_FIX.md` is stale (2025-04). Use the registry.
10. 2026-10-17: net liquidity was computed in mixed units across the repo. WTREGEN is $ millions like WALCL (only RRPONTSYD is $ billions); the 2026-07-02 fix assumed otherwise and produced ≈ −TGA. Use `js/netLiquidity.js`. See DATA_SPEC §5 #8 for which banked results need re-running.
11. 2026-10-18: `calendar_events.csv` holds 46,095 exact-duplicate rows (of 102,759; spread 2014 → 2026-07-02). Date tags are unaffected; anything that COUNTS events (frequency, events per day, surprise averages) is inflated. `load_calendar()` in `scripts/calendar/fetch_nasdaq_calendar.py` drops them; the file itself is left as is so banked results stay reproducible.
12. 2026-10-18: OANDA no longer provides order books (owner). `scripts/fetch_oanda_books.py` and the `oanda_book_history_v1` notes describe a dead source.
13. 2026-10-19: feature-store `px_d1_*` FX/gold have Saturday/Sunday rows 2002-2013 (DATA_SPEC §5 #9). Count trading days on weekdays only before annualising or setting a day horizon; `runStudy` does not filter them yet.
