#!/usr/bin/env bash
# Downloads all 25 M1 parquet files from Google Drive into VolRangeForecaster/data/m1/
# Requires files to be shared as "Anyone with the link" on Google Drive.
set -euo pipefail

OUTDIR="$(dirname "$0")/../VolRangeForecaster/data/m1"
mkdir -p "$OUTDIR"

declare -A DRIVE_IDS=(
  [eurusd]="1ifk4hr5qOtDoREn8GqwmoO-L1r_cTYug"
  [gbpusd]="1JbfcM6rM8gAOHYA1AAmucA4qyEcSpQO7"
  [usdjpy]="1WYPHM9jOFOFIBd_688LQPB_I6L1cmB_4"
  [audusd]="1dfemdaD1yfaTQUemzJWWt1kpzLyumebw"
  [nzdusd]="1XDqS3sJN-89k-C63UQe4MAsWfAu3yZLb"
  [usdcad]="1OzxAFB-H0ftdpZnGii_iGQsewqxTUHgh"
  [usdchf]="1R8-llmn8gFdYnNEeDlLkOWu9q-TRD6dr"
  [gbpjpy]="1lyb0suhTDc8-_KYEOUz0Nxyxz2fE-o-3"
  [eurjpy]="1W1VbRu4SNM8rheMWODC0lpngOv34FFCt"
  [eurgbp]="1JjIUUgL9_9v_fX7fKGi7Es4Ze8Ap1aol"
  [euraud]="1NvQvPWMCX3iTgsGvjFJUwYdHbQa29zKy"
  [eurcad]="1O4gfO-hoVlHk7ykFlrOizsz5-KVSkTUW"
  [eurchf]="1os4a5a_zjYRlNbkysuMpKar-uu_6ZyXZ"
  [eurnzd]="1DuNP1RxaMfO_3wZt1j75qaTnMpgg4Tiv"
  [audjpy]="13f6Eq9WFTJ_p3ByY74He8ATOzj5Ikrgx"
  [audnzd]="1UFoJPw1NsiTKQJFFTzkD18HqNjKLjNq7"
  [audcad]="1OvE2p1tTGci4bEDqtjwJDz3NXG4XtXe1"
  [audchf]="1uvO4eMVMhKV0KfeFHX_TC0FDyFql_hx8"
  [gbpaud]="13DFKMNuUEHRJTiB9mzr_MyhgZbBrt2ZY"
  [gbpcad]="1-_u_Gj5HVadZy69pdt5Sx6xTBiY0Cd2S"
  [gbpchf]="1iqcUOaEGQauM3QYpFPYVASpbe_pCtvH6"
  [gbpnzd]="17oqQKqwj2Kg7ShGXkQWDkvsu295UN5s2"
  [cadjpy]="1P76U9kNYP51vmcIpq7aL-IEyjRdtc0OT"
  [chfjpy]="10PBymXfhO4PdaxxZahreX5gdqOYQISCG"
  [nzdjpy]="13DjEKFjT9vOwg7eBf6JTNz5G_CTM8zUG"
)

TOTAL=${#DRIVE_IDS[@]}
COUNT=0
FAILED=()

for PAIR in "${!DRIVE_IDS[@]}"; do
  FILE_ID="${DRIVE_IDS[$PAIR]}"
  OUTFILE="$OUTDIR/${PAIR}_m1.parquet"
  COUNT=$((COUNT + 1))

  if [[ -f "$OUTFILE" ]] && [[ $(stat -c%s "$OUTFILE") -gt 10000 ]]; then
    echo "[$COUNT/$TOTAL] $PAIR — already downloaded, skipping"
    continue
  fi

  echo "[$COUNT/$TOTAL] Downloading ${PAIR}_m1.parquet ..."
  if gdown "$FILE_ID" -O "$OUTFILE" 2>&1; then
    SIZE=$(stat -c%s "$OUTFILE" 2>/dev/null || echo 0)
    echo "  -> OK ($(( SIZE / 1024 ))KB)"
  else
    echo "  -> FAILED"
    FAILED+=("$PAIR")
    rm -f "$OUTFILE"
  fi
done

echo ""
echo "=== Download complete: $((TOTAL - ${#FAILED[@]}))/$TOTAL files ==="
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed pairs: ${FAILED[*]}"
  exit 1
fi
