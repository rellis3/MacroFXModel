"""close-window-momentum: shared sample construction (frozen in forge/CLOSE_WINDOW_MOMENTUM_PREREG.md section 3)."""
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("CWM_DATA", ROOT))
OUT = ROOT / "analysis/output/close-window-momentum"
SEED = 20261111
B = 2000

PRIMARY = ["NQ_FUT", "ES_FUT"]
CFD = ["NQ_CFD", "SPX_CFD"]
SECONDARY = ["GOLD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD"]
ALL = PRIMARY + CFD + SECONDARY
# which futures day set gates the day (US exchange open with a full 15:30-16:00 ET window)
GATE = {"NQ_CFD": "NQ_FUT", "SPX_CFD": "ES_FUT", "GOLD": "NQ_FUT"}
GAMMA = {"NQ_FUT": "nas100", "NQ_CFD": "nas100", "ES_FUT": "spx500", "SPX_CFD": "spx500"}
GPAIR = {"nas100": "nas100_usd", "spx500": "spx500_usd"}


def _valid(d):
    return (d["p_prev"].notna() & d["p_w0"].notna() & d["p_w1"].notna() & (d["n_win"] >= 25)
            & np.isfinite(d["sigma"]) & (d["sigma"] > 0))


def gamma_map(px, lag):
    """OI date D -> cash day of NY-close session D+lag. Returns Series cash_day -> 1 (net GEX < 0) / 0."""
    s = pd.read_parquet(DATA / f"oi_research_book/data/gex_range_es/{px}_nyclose_d1.parquet").sort_index()
    s.index = pd.to_datetime(s.index).tz_localize(None)
    dm = pd.read_parquet(DATA / f"oi_research_book/data/gex_range_es/nyc/daily_master_near_{GPAIR[px]}.parquet")
    dm["date"] = pd.to_datetime(dm["date"])
    dm = dm.dropna(subset=["net_gex_sum"])
    pos = s.index.get_indexer(dm["date"])
    keep = (pos >= 0) & (pos + lag < len(s))
    dm, pos = dm[keep], pos[keep]
    out = pd.Series((dm["net_gex_sum"] < 0).astype(int).to_numpy(), index=s.index[pos + lag])
    return out[~out.index.duplicated()]


def sample(name):
    d = pd.read_parquet(OUT / f"days_{name}.parquet")
    d = d[_valid(d)].copy()
    if name in GATE:
        g = pd.read_parquet(OUT / f"days_{GATE[name]}.parquet")
        ok = set(g.loc[_valid(g), "day"])
        d = d[d["day"].isin(ok)]
    d["x"] = np.log(d["p_w0"] / d["p_prev"]) / d["sigma"]
    d["y"] = np.log(d["p_w1"] / d["p_w0"]) / d["sigma"]
    d["r1_raw"] = np.log(d["p_w0"] / d["p_prev"])
    d["r2_raw"] = np.log(d["p_w1"] / d["p_w0"])
    if "p_fh" in d:
        d["xfh"] = np.log(d["p_fh"] / d["p_prev"]) / d["sigma"]
    d["sgn"] = np.sign(d["x"])
    d["pnl_gross_bp"] = d["sgn"] * (d["p_w1"] / d["p_w0"] - 1) * 1e4
    if d["cost_kind"].iloc[0] == "fut":
        d["cost_bp"] = d["cost_pts"] / d["p_w0"] * 1e4
    else:
        d["cost_bp"] = (d["s_w0"] / 2 + d["s_w1"] / 2) / d["p_w0"] * 1e4
    d["pnl_net_bp"] = d["pnl_gross_bp"] - np.where(d["sgn"] != 0, d["cost_bp"], 0.0)
    d["long_bp"] = (d["p_w1"] / d["p_w0"] - 1) * 1e4  # always-long benchmark
    for h in (1, 2, 3):
        d[f"rev{h}"] = np.log(d[f"p_w1_next{h}"] / d["p_w1"]) / d["sigma"]
    if name in GAMMA:
        g2 = gamma_map(GAMMA[name], 2)
        g1 = gamma_map(GAMMA[name], 1)
        d["gneg"] = d["day"].map(g2)
        d["gneg_d1"] = d["day"].map(g1)
    iso = d["day"].dt.isocalendar()
    d["week"] = (iso["year"].astype(int) * 100 + iso["week"].astype(int)).to_numpy()
    d = d.sort_values("day").reset_index(drop=True)
    d["half"] = np.where(d["day"] <= d["day"].iloc[len(d) // 2 - 1], 1, 2)
    return d
