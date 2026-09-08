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
- `data/results/*.csv` — every numeric table cited in `RESEARCH_BOOK.md`,
  small and committed, one file per test.

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
EOF

python3 oi_research_book/scripts/00_audit.py /tmp/EUR_USD.csv
python3 oi_research_book/scripts/01_build_daily_dataset.py /tmp/EUR_USD.csv /tmp/eurusd_d1.parquet
python3 oi_research_book/scripts/02_walls_and_gamma.py
python3 oi_research_book/scripts/03_pinning_and_walls_reaction.py
python3 oi_research_book/scripts/04_predictive_ic.py
```

Total run time is under two minutes; the raw CSV/cache are gitignored
(reproducible from R2, not worth committing at ~230MB).

## Extending to other pairs

R2's `OI Data/` folder also has `AUD_USD.csv`, `GBP_USD.csv`, `NAS100_USD.csv`,
`USD_CAD.csv`, `USD_CHF.csv`, `USD_JPY.csv` in the same schema. `01`–`04`
already take the CSV/D1-parquet paths as arguments, so pointing them at a
different pair mostly works out of the box — except the $125,000 FX contract
multiplier hardcoded in `01_build_daily_dataset.py` (`CONTRACT_MULT`), which
is wrong for `NAS100_USD` (an index future, different multiplier and asset
class) and should be parameterized before pooling multiple pairs (see
`RESEARCH_BOOK.md` Part 11, roadmap item 2).
