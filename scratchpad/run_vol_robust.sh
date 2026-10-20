cd "/c/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel"
run() { COG_ASSET=$1 COG_US=$2 COG_EU=$3 COG_MODE=$4 COG_TAG=$5 python scripts/rate_diff_nq/cog_cross_asset_vol_robust.py > scratchpad/vr$5.log 2>&1 & }
run eurusd CME_SR3U6 ICEEU_IH7 spread _A_eurusd_P0
run eurusd CME_SR3Z6 ICEEU_ER3Z6 spread _A_eurusd_P3
run eurusd CME_SR3Z6 ICEEU_IH7 us _A_eurusd_L_US
run us30 CME_SR3U6 ICEEU_IH7 spread _A_us30_P0
run us30 CME_SR3Z6 ICEEU_IH7 us _A_us30_L_US
run us2000 CME_SR3Z6 ICEEU_ER3Z6 spread _A_us2000_P3
run usdjpy CME_SR3Z6 ICEEU_ER3Z6 spread _A_usdjpy_P3
run spx500 CME_SR3Z6 ICEEU_IH7 us _A_spx500_L_US
wait
echo VR_DONE > scratchpad/vr_done.flag
