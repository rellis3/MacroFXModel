#!/bin/sh
# Calibrated (prereg-sized, ~3-5pp) positive controls. Run from repo root.
R=scripts/null-audit/wall-placebo/reimpl.py
O=analysis/output/null-audit/wall-placebo/reimpl
python $R base --plant 0.02 --plant-mode base > $O/log_plant002_base.txt 2>&1 &
python $R base --plant 0.03 --plant-mode base > $O/log_plant003_base.txt 2>&1 &
python $R swap,basis --plant 0.03 --plant-mode swap,basis > $O/log_plant003_truewall_seenby_corrected.txt 2>&1 &
python $R base --plant 0.03 --plant-mode swap,basis > $O/log_plant003_truewall_seenby_base.txt 2>&1 &
wait
