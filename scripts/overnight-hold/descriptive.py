"""overnight-hold descriptive checks (not scored): CFD buy & hold daily risk numbers on the same footing,
and the mirror identity closed with the uncovered Fri 14:30 -> Mon 14:30 / holiday legs.
Usage: python scripts/overnight-hold/descriptive.py"""
import json
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / "analysis" / "output" / "overnight-hold"
res = json.loads((OUT / "results.json").read_text())
dff = pd.read_csv(OUT / "dff.csv", parse_dates=["observation_date"]).set_index("observation_date")["DFF"]
dff = dff.reindex(pd.date_range("2016-01-01", "2026-09-30")).ffill()
out = {}
for k in ("nq", "gold"):
    t = pd.read_csv(OUT / f"honest_trades_{k}.csv", parse_dates=["date"])
    mk = res["instruments"][k]["financing_model"]["markup_pp"]
    # B&H marked at each 20:00 UK entry: price change entry->next entry, financing for the calendar days between
    d = pd.to_datetime(t["date"])
    r = (t["entryPrice"].shift(-1) / t["entryPrice"] - 1) * 100
    fin = [((dff.loc[a:b - pd.Timedelta(days=1)] + mk) / 365).sum() for a, b in zip(d[:-1], d[1:])] + [np.nan]
    bh = (r - np.array(fin)).dropna().to_numpy()
    yrs = (d.iloc[-1] - d.iloc[0]).days / 365.25
    eq = np.cumprod(1 + bh / 100); dd = ((eq - np.maximum.accumulate(eq)) / np.maximum.accumulate(eq)).min() * 100
    on = t["net"].to_numpy(); eqo = np.cumprod(1 + on / 100)
    # identity: overnight legs x gaps (exit -> next entry) == first entry -> last exit
    gap = (t["entryPrice"].shift(-1) / t["exitPrice"]).dropna()
    ident = np.prod(t["exitPrice"] / t["entryPrice"]) * np.prod(gap) / (t["exitPrice"].iloc[-1] / t["entryPrice"].iloc[0]) * \
            (t["exitPrice"].iloc[-1] / t["exitPrice"].iloc[-1])
    out[k] = {"bh_cfd_net": {"cagr": float((eq[-1] ** (1 / yrs) - 1) * 100), "max_dd": float(dd),
                             "sharpe_ann": float(bh.mean() / bh.std(ddof=1) * np.sqrt(len(bh) / yrs))},
              "overnight_net": {"cagr": res["instruments"][k]["net"]["cagr"], "max_dd": res["instruments"][k]["net"]["max_dd"],
                                "sharpe_ann": res["instruments"][k]["net"]["sharpe_ann"]},
              "daytime_and_weekend_gross_compounded_pct": float((np.prod(gap) - 1) * 100),
              "overnight_gross_compounded_pct": float((np.prod(t["exitPrice"] / t["entryPrice"]) - 1) * 100),
              "identity_ratio_should_be_1": float(ident)}
    print(k, json.dumps(out[k]))
(OUT / "descriptive.json").write_text(json.dumps(out, indent=2))
