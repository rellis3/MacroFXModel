"""Step 2 of the futures volatility study — CFD translation. See forge/FUTURES_VOL_PREREG.md (Step 2 section).

    python -m forge.run_futures_vs_cfd

Scores the live CFD session ranges (london22) with: B0 = live HAR on CFD daily bars (control), B1 = HAR on futures
daily bars, B2 = HAR on futures 5-minute RV (PRIMARY), B3 = 50/50 of B0 and B2. Widths are refit on the CFD target.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from forge import vol as V
from forge import run_futures_vol as F

FX_ROOT = "VolRangeForecaster/data/m1"
IDX_ROOT = V.INDEX_DATA_ROOT
PAIRS = {  # futures root -> (CFD pair, data root)
    "NQ": ("nq", IDX_ROOT), "ES": ("spx500", IDX_ROOT), "YM": ("us30", IDX_ROOT), "RTY": ("us2000", IDX_ROOT),
    "GC": ("gold", FX_ROOT), "6E": ("eurusd", FX_ROOT), "6B": ("gbpusd", FX_ROOT), "6J": ("usdjpy", FX_ROOT),
    "6A": ("audusd", FX_ROOT), "6N": ("nzdusd", FX_ROOT), "6C": ("usdcad", FX_ROOT), "6S": ("usdchf", FX_ROOT),
    "FDAX": ("de30", IDX_ROOT),
}
ARMS = ["B0", "B1", "B2", "B3"]


def london_dates(idx: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """load_daily returns London-midnight expressed in naive UTC; map back to the London calendar date."""
    return pd.DatetimeIndex(idx.tz_localize("UTC").tz_convert("Europe/London").normalize().tz_localize(None))


def build_pair_frame(root: str) -> pd.DataFrame:
    pair, data_root = PAIRS[root]
    cfd = V.load_daily(pair, data_root=data_root, session="london22")
    cfd.index = london_dates(cfd.index)
    cfd = cfd[~cfd.index.duplicated()]
    ohlc = cfd[["open", "high", "low", "close"]]
    real = V.realized_quantities(ohlc)
    fr = pd.DataFrame({"date": ohlc.index, **{k: real[k] for k in ("hl_pct", "oc_pct", "oh_pct", "ol_pct")}})
    fr["sigma_B0"] = V.as_of_yesterday(V.har_rv_log_sigma(ohlc))
    fut = F.build_frame(root)[["date", "sigma_A0", "sigma_C1"]].rename(columns={"sigma_A0": "sigma_B1", "sigma_C1": "sigma_B2"})
    fr = fr.merge(fut, on="date", how="inner")
    fr["sigma_B3"] = 0.5 * (fr["sigma_B0"] + fr["sigma_B2"])
    return fr


def main():
    scored = {}
    for root in PAIRS:
        try:
            fr = build_pair_frame(root)
            df = F.score_root(fr, arms=ARMS, ctrl="B0")
        except FileNotFoundError as e:
            print(f"{root}: missing data ({e}), skipped")
            continue
        if df.empty:
            print(f"{root}: not enough history")
            continue
        scored[root] = df
        print(f"{root} -> {PAIRS[root][0]}: {len(df)} OOS sessions {df['date'].min():%Y-%m-%d} -> {df['date'].max():%Y-%m-%d}", flush=True)
    prim = {r: scored[r] for r in F.PRIMARY if r in scored}
    out = {"primary": F.summarize(prim, "PRIMARY: CFD ranges, 12 roots", ARMS, "B0", "B2")}
    F.show(out["primary"])
    if "FDAX" in scored:
        out["secondary"] = F.summarize({"FDAX": scored["FDAX"]}, "SECONDARY: DAX", ARMS, "B0", "B2")
        F.show(out["secondary"])
    (F.NT8 / "futures_vs_cfd_results.json").write_text(json.dumps(out, indent=1))
    print("\nwritten ->", F.NT8 / "futures_vs_cfd_results.json")


if __name__ == "__main__":
    main()
