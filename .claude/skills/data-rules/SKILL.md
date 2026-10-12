---
name: data-rules
description: The data rules for research and backtests in this repo. Covers which bars to use for σ and sessions, London session definitions, where M1/daily/IV/calendar/FRED data lives and how to load it, instrument keys and pip sizes, lookahead and point-in-time rules, the lockbox holdout, multiple-testing corrections, and the known data faults. Use this whenever you write or review analysis, backtest, forecast or research code that loads price, vol, macro or calendar data; fetch or download data (R2, OANDA, FRED, Yahoo); compute realised ranges (HL/OH/OL/OC), σ, ladders or bands; join series by date; or judge whether a result can be trusted. Use it even if the user just says "run a quick test on EURUSD" or "check this backtest", because the traps here silently produce wrong numbers.
---

# Data rules

Most wrong results in this repo have come from data, not models: UTC days with Sunday stubs, Yahoo cash-index σ, BST
date joins that dropped every summer row, a BAM parquet that collapsed timestamps to 1970. This skill exists so those
mistakes happen once. `plans/DATA_SPEC.md` is the layer-1 spec. When code and the spec disagree, that is a layer-1
fault: record it there, then fix the code.

## Before writing any analysis: the checklist

1. **Session = London calendar date.** The open is the first M1 bar at/after 00:00 Europe/London (23:00 UTC in BST,
   00:00 UTC in GMT). The research window is 00:00–22:00 London (`london22`). Weekends are excluded, and Sunday-evening
   bars belong to Monday.
   - JS: `bucketM1IntoSessions(packed, 'Europe/London')`. **The default argument is 22 (a UTC-hour broker day), not
     London. Always pass `'Europe/London'`.**
   - Python: `forge.vol.load_daily(pair, session="london22")`. Its index is the session *start* in naive UTC, so a BST
     session is stamped 23:00 on the previous day. **Re-key to the London date before any exact-date join.**
2. **σ comes from NY-close daily bars built from M1** (`nyCloseDailyBars(packed)`, keep `n >= 60`), to match live
   (OANDA D, 17:00 New York). **Never use `VolRangeForecaster/data/m1/*_d1.parquet` for σ.** Those are UTC days with
   Sunday stubs. A σ is only valid for the bar shape it was fitted on.
3. **Realised quantities are % of the session open:** HL = high − low, OH, OL, OC = |close − open|. KV
   `vol_session_<date>` stores `oc` *signed*, so take abs. Drop late audits with `auditUsable`.
4. **No lookahead.** Anything computed for window `i` uses data `< i` only. Macro values are point-in-time (first print,
   published before the session). Calendar tags after coverage are `unknown` and excluded, never imputed. Full-sample
   statistics (variance, z-scores, weights) are lookahead.
5. **Respect the lockbox.** Sessions after **2026-08-21** are the H-A holdout (`forge/LOCKBOX_PROTOCOL.md`). Don't score
   on them. The JS loader `loadM1ForPair` merges the nightly R2 tail when credentials exist, so truncate explicitly
   (`end='2026-08-21'` in Python; filter by time in JS).
6. **Costs on, MAE from the real M1 path, and count what was dropped.** Silently dropping unresolved trades is a
   lookahead selection bias.
7. **Correct for search breadth.** Cross-instrument σ errors correlate ~0.47 (~2.1 independent forecasts a day, not 28).
   Use session-block / date-clustered bootstrap. Log every variant in its prereg before running it.
8. **Check the data first.** Run `node scripts/data_integrity.mjs` (→ `analysis/output/data_integrity/REPORT.md`) and
   say what's stale. The local M1 cache ends ~2026-08-21 and may not be present in a cloud session (see
   `references/sources.md`).
9. **On a null result, assume code failure first:** audit alignment, lookahead, indexing, types and NaN before calling
   it null. **On a strong result, check concentration** before believing it.

## Never

- **Never write back to production R2 from a sandbox.** That means no `runOne`/regeneration/gap-fill-then-persist
  pipeline for a live pair, and no local scoring with live R2 credentials. A 2026-08-16 test run corrupted 41
  production records this way. Read-only fetches are fine.
- **Never fetch M1 with `--price BAM` for the research cache.** Use `--price M`. BAM appends bid/ask columns after
  `time`, and the JS loader reads the timestamp from the *last* column, so every row becomes 1970.
- Never use a gold pip of 0.1; it is **1.0**. Never trust a missing `pylego/point_values.json` entry; the fallback can
  size 100× wrong.
- Never display two unvalidated engines that disagree. Retire one (`DATA_RECONCILIATION.md`).

## Reference files (read the one you need)

| File | Read when |
|---|---|
| `references/sources.md` | finding or downloading data: R2, OANDA, local caches, IV, CBOE, calendar, FRED, file schemas, env var names |
| `references/loaders.md` | writing loading code: canonical helpers, signatures, their gotchas |
| `references/instruments.md` | instrument keys/aliases, pip sizes, which source each instrument's σ comes from |
| `references/lookahead-and-oos.md` | designing a test: lockbox dates, point-in-time macro, search breadth, trial ledger, preregs |
| `references/faults-log.md` | before trusting a number; known faults, contradictions, and stale docs |

## Growing this skill

When a session finds a new data fault, a new source, or a rule learned the hard way, add it in the same change:

- **New fault** → add a row to the fault table in `plans/DATA_SPEC.md` §5 (the source of truth), and a one-liner with
  the date in `references/faults-log.md`. If it changes how everyone must load data, add it to the checklist above.
- **Fault fixed** → update its state in both places and say what replaced it.
- **New data source or loader** → `references/sources.md` or `references/loaders.md`: path, schema, how to fetch,
  coverage dates.
- Date every addition (YYYY-MM-DD). Link the repo file that holds the detail rather than copying it in.
