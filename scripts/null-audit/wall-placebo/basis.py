"""Futures-minus-CFD basis per instrument per CME date, from put-call parity on the option
settlements in OI Data/<PAIR>.csv (F = K + C - P, near-ATM strikes, each expiry), compared with
the OANDA M1 close at the CME settlement minute (14:00 CT FX, 15:00 CT NQ).

Also a date-alignment check: is the settlement on raw row D aligned with OANDA price on D, D-1 or D+1?
(smallest day-to-day noise of F - S wins).

    python scripts/null-audit/wall-placebo/basis.py PAIR      -> analysis/output/null-audit/wall-placebo/basis/basis_<pair>.parquet
"""
import sys, os
import numpy as np
import pandas as pd

sys.path.insert(0, "oi_research_book/scripts")
from pair_config import cfg

OUT = "analysis/output/null-audit/wall-placebo/basis"
M1 = {"EUR_USD": "eurusd", "GBP_USD": "gbpusd", "AUD_USD": "audusd", "USD_CAD": "usdcad",
      "USD_CHF": "usdchf", "USD_JPY": "usdjpy", "NAS100_USD": "nas100_usd"}


def settle_price(pair):
    m = pd.read_parquet(f"VolRangeForecaster/data/m1/{M1[pair]}_m1.parquet")["close"]
    m.index = pd.to_datetime(m.index)
    ct = m.index.tz_convert("America/Chicago")
    hh = 15 if pair == "NAS100_USD" else 14
    sel = (ct.hour == hh - 1) & (ct.minute == 59)               # last bar before the settle minute
    s = pd.Series(m.values[sel], index=pd.DatetimeIndex(ct[sel].date))
    s = s[~s.index.duplicated(keep="last")]
    return s


def main(pair):
    os.makedirs(OUT, exist_ok=True)
    inv = cfg(pair)["inverted"]
    raw = pd.read_csv(f"OI Data/{pair}.csv", usecols=["date", "expiry", "strike", "right", "settlement"])
    raw["date"] = pd.to_datetime(raw["date"])
    raw["expiry"] = pd.to_datetime(raw["expiry"], utc=True).dt.tz_localize(None).dt.normalize()
    raw = raw[raw["settlement"].notna() & (raw["settlement"] > 0)]
    raw["dte"] = (raw["expiry"] - raw["date"]).dt.days
    raw = raw[(raw["dte"] >= 3) & (raw["dte"] <= 120)]
    p = raw.pivot_table(index=["date", "expiry", "dte", "strike"], columns="right", values="settlement", aggfunc="first")
    p = p.dropna().reset_index()
    p["F"] = p["strike"] + p["C"] - p["P"]
    p["atm"] = (p["C"] - p["P"]).abs()
    # 4 strikes nearest ATM per (date, expiry)
    p = p.sort_values(["date", "expiry", "atm"]).groupby(["date", "expiry"]).head(4)
    fe = p.groupby(["date", "expiry", "dte"])["F"].median().reset_index()
    fe["F_o"] = 1.0 / fe["F"] if inv else fe["F"]
    S = settle_price(pair)
    front = fe.sort_values(["date", "dte"]).groupby("date").head(1).set_index("date")
    out = pd.DataFrame({"F_front": front["F_o"], "dte_front": front["dte"]})
    out["S"] = S.reindex(out.index)
    out["basis"] = out["F_front"] - out["S"]
    # dispersion of basis across expiries on the same day (expiries on different futures)
    fe["S"] = S.reindex(fe["date"]).values
    fe["b"] = fe["F_o"] - fe["S"]
    out["basis_expiry_sd"] = fe.groupby("date")["b"].std()
    out["basis_expiry_range"] = fe.groupby("date")["b"].agg(lambda x: x.max() - x.min())
    # alignment check: F(D) - S(D+k)
    al = {}
    for k in (-1, 0, 1):
        sidx = S.index
        # shift by trading rows of S, not calendar days
        Ss = pd.Series(S.values, index=sidx).shift(-k)
        b = (out["F_front"] - Ss.reindex(out.index)).dropna()
        al[k] = float(b.diff().abs().median())
    out.to_parquet(f"{OUT}/basis_{pair.lower()}.parquet")
    fe[["date", "expiry", "dte", "F_o", "S", "b"]].to_parquet(f"{OUT}/basis_by_expiry_{pair.lower()}.parquet")
    pip = cfg(pair)["pip_size"]
    b = out["basis"].dropna()
    print(f"{pair}: dates {len(out)} with S {b.size}; basis median {b.median()/pip:+.1f} pips, IQR [{b.quantile(.25)/pip:+.1f},{b.quantile(.75)/pip:+.1f}], "
          f"|b| p90 {b.abs().quantile(.9)/pip:.1f}; expiry range median {out['basis_expiry_range'].median()/pip:.1f} pips; "
          f"align median|diff| pips  D-1:{al[-1]/pip:.1f} D:{al[0]/pip:.1f} D+1:{al[1]/pip:.1f}")
    by_year = b.groupby(b.index.year).median() / pip
    print("  basis by year (pips):", by_year.round(1).to_dict())


if __name__ == "__main__":
    main(sys.argv[1])
