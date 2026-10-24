#!/bin/sh
# Corrected variants + positive controls in the independent implementation. Run from repo root.
R=scripts/null-audit/wall-placebo/reimpl.py
O=analysis/output/null-audit/wall-placebo/reimpl
mkdir -p $O
date
python $R swap > $O/log_swap.txt 2>&1 &
python $R basis > $O/log_basis.txt 2>&1 &
python $R swap,basis > $O/log_swap+basis.txt 2>&1 &
python $R swap,basisx > $O/log_swap+basisx.txt 2>&1 &
wait
python $R swap,basis,pit > $O/log_swap+basis+pit.txt 2>&1 &
python $R swap,basis,timeh > $O/log_swap+basis+timeh.txt 2>&1 &
python $R base,pit > $O/log_base+pit.txt 2>&1 &
python $R base --plant 0.08 --plant-mode base > $O/log_plant008_base.txt 2>&1 &
wait
python $R base --plant 0.15 --plant-mode base > $O/log_plant015_base.txt 2>&1 &
python $R base --plant 0.15 --plant-mode swap,basis > $O/log_plant015_truewall_seenby_base.txt 2>&1 &
python $R swap,basis --plant 0.15 --plant-mode swap,basis > $O/log_plant015_truewall_seenby_corrected.txt 2>&1 &
python $R swap,basis --plant 0.08 --plant-mode swap,basis > $O/log_plant008_truewall_seenby_corrected.txt 2>&1 &
wait
date
