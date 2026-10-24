#!/bin/sh
# Builds all 7 pairs in parallel then reports. Run from repo root.
mkdir -p analysis/output/null-audit/wall-placebo/repro
date
for p in EUR_USD GBP_USD AUD_USD USD_CAD USD_CHF USD_JPY NAS100_USD; do
  python scripts/null-audit/wall-placebo/repro.py build $p > analysis/output/null-audit/wall-placebo/repro/build_$p.log 2>&1 &
done
wait
date
python scripts/null-audit/wall-placebo/repro.py report > analysis/output/null-audit/wall-placebo/repro/report.log 2>&1
date
