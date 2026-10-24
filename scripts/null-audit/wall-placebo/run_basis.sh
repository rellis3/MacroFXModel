#!/bin/sh
# Run from repo root.
mkdir -p analysis/output/null-audit/wall-placebo/basis
for p in EUR_USD GBP_USD AUD_USD USD_CAD USD_CHF USD_JPY NAS100_USD; do
  python scripts/null-audit/wall-placebo/basis.py $p > analysis/output/null-audit/wall-placebo/basis/basis_$p.log 2>&1 &
done
wait
cat analysis/output/null-audit/wall-placebo/basis/basis_*.log
