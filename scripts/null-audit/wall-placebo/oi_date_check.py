"""Which trading day does the OI on raw row D describe? If OI(D) is end-of-day D, |OI(D)-OI(D-1)| tracks
volume on D; if it is the prior day's book stamped D, it tracks volume on D-1.
    python scripts/null-audit/wall-placebo/oi_date_check.py PAIR"""
import sys
import numpy as np
import pandas as pd

pair = sys.argv[1]
raw = pd.read_csv(f"OI Data/{pair}.csv", usecols=["date", "expiry", "strike", "right", "open_interest", "volume"])
raw = raw.dropna(subset=["open_interest", "volume"]).sort_values(["expiry", "strike", "right", "date"])
raw["date"] = pd.to_datetime(raw["date"])
g = raw.groupby(["expiry", "strike", "right"], sort=False)
raw["d_oi"] = g["open_interest"].diff().abs()
raw["vol_prev"] = g["volume"].shift(1)
raw["vol_next"] = g["volume"].shift(-1)
raw["gap"] = g["date"].diff().dt.days
s = raw[(raw["gap"] <= 4) & raw["vol_prev"].notna() & raw["vol_next"].notna()]
s = s[(s["volume"] + s["vol_prev"] + s["vol_next"]) > 0]
from scipy.stats import spearmanr
for c in ("vol_prev", "volume", "vol_next"):
    print(pair, f"spearman(|dOI_D|, {c}) = {spearmanr(s['d_oi'], s[c])[0]:.3f}", "n", len(s))
# share of contract-days with volume>0 on D but zero OI change, vs dOI>0 with zero volume on D
print(pair, "P(dOI>0 | vol_D=0) =", round(float((s.loc[s['volume'] == 0, 'd_oi'] > 0).mean()), 3),
      " P(dOI>0 | vol_D-1=0) =", round(float((s.loc[s['vol_prev'] == 0, 'd_oi'] > 0).mean()), 3))
