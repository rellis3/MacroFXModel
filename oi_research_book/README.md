# oi_research_book

Empirical research book on EUR/USD CME options positioning (open interest,
gamma, walls, pinning) built from ~6 years of daily per-strike data in R2
(`OI Data/EUR_USD.csv`), joined to `m1/eurusd_d1.parquet` for the underlying.

**Start here: [`RESEARCH_BOOK.md`](RESEARCH_BOOK.md).** It states up front
what's directly measurable in this dataset vs. what requires an assumption
(no real IV exists here — see its Part 0), then walks through wall
definitions, persistence, gamma-flip regimes, pinning, wall reactions, and a
proper in/out-of-sample predictive test, reporting every null honestly
alongside the one real positive finding.

## Layout

- `scripts/00_audit.py` — data-quality audit of the raw CSV (row counts,
  missingness, instrument-id stability, DTE coverage). Writes
  `data/audit_report.json`.
- `scripts/01_build_daily_dataset.py` — the one expensive pass over the raw
  ~3M-row CSV: forward-fills OI per contract, builds the near-dated and
  all-expiry daily option surfaces, computes walls (5 definitions) and a
  gamma/gamma-flip estimate, joins the underlying D1 price. Writes the small
  `data/{surface,wall_summary,daily_master}_{near,all}.parquet` files
  (committed) plus a gitignored contract-level cache used by script 03.
- `scripts/02_walls_and_gamma.py` — wall-definition agreement, wall
  persistence/migration lead-lag, gamma-flip regime test, gamma-flip
  crossing event study, wall-strength-vs-reaction test.
- `scripts/03_pinning_and_walls_reaction.py` — strike-pinning test (with a
  matched control strike and an explicit confound check), wall
  rejection-vs-break classification.
- `scripts/04_predictive_ic.py` — chronological 60/20/20 in/out-of-sample
  predictive-IC test across 10 features × 2 targets × 2 surfaces, plus the
  variable-reduction ranking.
- `scripts/05_intraday_validation.py` — re-runs the wall reject/break test
  (Part 8) at real minute-bar resolution against `m1/eurusd_m1.parquet`,
  using each trading day's *prior-day-known* wall/gamma levels (fixing a
  same-day lookahead issue in the daily version) — ~400 real touch events
  per wall side instead of 35–80, big enough to actually test significance.
  Also re-runs the gamma-flip regime test at intraday resolution and checks
  whether wall OI strength predicts the intraday outcome.
- `scripts/06_intraday_cluster_significance.py` — re-tests script 05's
  wall-rejection finding with an episode-level cluster bootstrap (touches on
  the same wall level across consecutive days aren't independent draws), to
  check whether it survives treating ~27–43 independent wall-episodes as the
  real sample size instead of ~400+ raw touch events.
- `scripts/07_export_bot_chain.py` — exports each historical day's near-dated
  chain in the exact paste format the real `js/oi.js` parser expects (one
  JSON line per day: date, spot, dte, rawOI, rawChg), so the live bot's own
  code can be fed real history instead of a Python re-implementation.
- `scripts/08_bot_backtest_zones.mjs` — **Node**, not Python: calls the
  actual production `buildOIEntry` (`js/oi.js`) and `buildOIZones`
  (`js/oiZones.js`) — unmodified — with the bot's real shipped default
  config, to generate the exact zones the live bot would have proposed each
  day for 6 years. Zero reimplementation, zero drift risk.
- `scripts/09_bot_backtest_execute.py` — simulates execution of those zones
  against real M1 candles, mirroring `oi_bot.py`'s real mechanics (touch
  entry, shared stop, TP1/TP2 scale-out to breakeven, mode-specific time
  exit). Found and fixed a real fill-direction bug during development — see
  `RESEARCH_BOOK.md` Part 12 for what it was.
- `scripts/10_real_maxpain_test.py` — closes a real gap a 2026-09-10 audit
  found: Part 7's "pinning" test used the biggest-OI strike, never
  calculated max pain (a genuinely different number, using the exact formula
  `js/oi.js`'s production `oiCalcMaxPain` uses, cross-checked against it
  first). See `RESEARCH_BOOK.md` Part 7b / Part 13.
- `data/results/*.csv` — every numeric table cited in `RESEARCH_BOOK.md`,
  small and committed, one file per test.

**Before extending this further, read `RESEARCH_BOOK.md` Part 13** — a full
audit of this pipeline against real data (not just re-reading old code and
assuming it was right), requested explicitly rather than offered. Found and
fixed the max-pain gap above; found and directly tested a real OI-publish
timing risk (the headline finding survives it); verified DTE, the gamma
formula, the GEX sign convention, and strike-to-spot alignment are all
correct; and states plainly that `settlement` and `volume` are loaded and
audited but used in zero calculations anywhere in this book.

## Reproducing

Needs `R2_ACCESS_KEY`/`R2_SECRET_KEY`/`R2_BUCKET` (already used elsewhere in
this repo, e.g. `pylego/r2.py`) to pull the raw files, plus `pandas`,
`pyarrow`, `numpy`, `scipy`:

```bash
python3 - <<'EOF'
import boto3, os
s3 = boto3.client("s3", endpoint_url="https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com",
                   aws_access_key_id=os.environ["R2_ACCESS_KEY"], aws_secret_access_key=os.environ["R2_SECRET_KEY"],
                   region_name="auto")
bucket = os.environ.get("R2_BUCKET", "r2-storage")
s3.download_file(bucket, "OI Data/EUR_USD.csv", "/tmp/EUR_USD.csv")
s3.download_file(bucket, "m1/eurusd_d1.parquet", "/tmp/eurusd_d1.parquet")
s3.download_file(bucket, "m1/eurusd_m1.parquet", "/tmp/eurusd_m1.parquet")  # only needed for script 05
EOF

python3 oi_research_book/scripts/00_audit.py /tmp/EUR_USD.csv
python3 oi_research_book/scripts/01_build_daily_dataset.py /tmp/EUR_USD.csv /tmp/eurusd_d1.parquet
python3 oi_research_book/scripts/02_walls_and_gamma.py
python3 oi_research_book/scripts/03_pinning_and_walls_reaction.py
python3 oi_research_book/scripts/04_predictive_ic.py
python3 oi_research_book/scripts/05_intraday_validation.py  # needs m1/eurusd_m1.parquet too
python3 oi_research_book/scripts/06_intraday_cluster_significance.py  # depends on 05's output
python3 oi_research_book/scripts/07_export_bot_chain.py     # depends on 01's contract-level cache
node    oi_research_book/scripts/08_bot_backtest_zones.mjs  # calls the real js/oi.js + js/oiZones.js — needs Node, run from the repo root
python3 oi_research_book/scripts/09_bot_backtest_execute.py # needs m1/eurusd_m1.parquet again
python3 oi_research_book/scripts/10_real_maxpain_test.py    # depends on 01's surface_near.parquet
```

Total run time is under two minutes; the raw CSV/cache are gitignored
(reproducible from R2, not worth committing at ~290MB combined). Scripts
07–09 also gitignore their own intermediate JSONL files
(`data/bot_backtest/`) for the same reason — only the final
`bot_backtest_trades.csv`/`_summary.csv` are committed.

## Extending to other pairs

R2's `OI Data/` folder also has `AUD_USD.csv`, `GBP_USD.csv`, `NAS100_USD.csv`,
`USD_CAD.csv`, `USD_CHF.csv`, `USD_JPY.csv` in the same schema. `01`–`04`
already take the CSV/D1-parquet paths as arguments, so pointing them at a
different pair mostly works out of the box — except the $125,000 FX contract
multiplier hardcoded in `01_build_daily_dataset.py` (`CONTRACT_MULT`), which
is wrong for `NAS100_USD` (an index future, different multiplier and asset
class) and should be parameterized before pooling multiple pairs (see
`RESEARCH_BOOK.md` Part 11, roadmap item 2).
