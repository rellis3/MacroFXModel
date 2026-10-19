"""Forecast Line Backtest: pooled summary across instruments (page panel "Search and evidence").

    PYTHONPATH=. python scripts/backtest/summarise_line_backtest.py

Reads backtest-data/line-backtest/*.json.gz (built by build_line_backtest.py). For every rule x stop x target setting
(3 x 4 x 5 = 60), pooled over all instruments that trade it, at 2x the spread table:
  trades, net R per trade, years positive, weekly-portfolio Sharpe (annualised) and its standard error
  (Lesson 04 §06: SE ~ sqrt((1 + S^2/2) / T), T in weeks, then annualised).
Lesson 04 §03, correlated trials: the 60 settings are far from independent. Mean pairwise correlation rho of their weekly
series gives the effective number by variance, N / (1 + (N - 1) rho), and the luck allowance for the best of them,
sqrt(1 - rho) * E[max of N standard normals] standard errors. A setting's z after the allowance is its Sharpe / SE minus
that allowance (computed for every setting, so the page can show it for whichever is selected).
Output: backtest-data/line-backtest/summary.json.
"""
import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge.evaltools import expected_best_of_n_se

DIR = Path("backtest-data/line-backtest")
COST_MULT = 2.0


def main():
    files = sorted(DIR.glob("*.json.gz"))
    series, meta = {}, {}
    start, end = None, None
    for f in files:
        r = json.load(gzip.open(f, "rt"))
        S, T = r["stops"], r["targets"]
        days = {d["d"]: d for d in r["days"]}
        start = min(start or r["from"], r["from"])
        end = max(end or r["to"], r["to"])
        for rule, tl in r["trades"].items():
            for x in tl:
                d = days[x["d"]]
                unit = d["o"] * d["sig"] / 100
                for j, g in enumerate(x["g"]):
                    if not g:
                        continue
                    s = S[j // len(T)]
                    stop = d["L"][x["line"]] - x["side"] * s * unit
                    risk = abs(x["ep"] - stop)
                    net = g[0] / 1000 - (COST_MULT * r["spread"] / risk if risk > 0 else 0)
                    key = f"{rule}|{s}|{T[j % len(T)]}"
                    series.setdefault(key, []).append((x["d"], net, r["inst"]))
    weeks = pd.date_range(pd.Timestamp(start) - pd.Timedelta(days=pd.Timestamp(start).weekday()), end, freq="W-MON")
    W = {}
    out = {"cost_mult": COST_MULT, "from": start, "to": end, "settings": {}}
    for key, v in series.items():
        df = pd.DataFrame(v, columns=["d", "net", "inst"])
        df["w"] = pd.to_datetime(df.d) - pd.to_timedelta(pd.to_datetime(df.d).dt.weekday, unit="D")
        w = df.groupby("w").net.sum().reindex(weeks, fill_value=0.0)
        W[key] = w.to_numpy()
        m, sd = w.mean(), w.std(ddof=1)
        Sw = m / sd if sd > 0 else 0.0
        se = np.sqrt((1 + Sw ** 2 / 2) / len(w))
        yrs = df.groupby(df.d.str[:4]).net.mean()
        out["settings"][key] = {"trades": int(len(df)), "instruments": int(df.inst.nunique()), "net_R": round(float(df.net.mean()), 4),
                                "total_R": round(float(df.net.sum()), 1), "years_positive": f"{int((yrs > 0).sum())}/{len(yrs)}",
                                "sharpe": round(float(Sw * np.sqrt(52)), 3), "sharpe_se": round(float(se * np.sqrt(52)), 3),
                                "z": round(float(Sw / se), 3)}
    keys = sorted(W)
    M = np.corrcoef(np.vstack([W[k] for k in keys]))
    iu = np.triu_indices(len(keys), 1)
    rho = float(np.nanmean(M[iu]))
    n = len(keys)
    emax = expected_best_of_n_se(n)
    allowance = float(np.sqrt(max(0.0, 1 - rho)) * emax)
    out["search"] = {"settings": n, "mean_pairwise_rho": round(rho, 3), "effective_n_by_variance": round(n / (1 + (n - 1) * rho), 2),
                     "expected_best_of_n_independent_se": round(emax, 3), "allowance_se": round(allowance, 3),
                     "note": "Lesson 04 §03: E[max of correlated trials] = sqrt(1 - rho) x E[max of independent ones]; rho = mean pairwise correlation of the settings' weekly net-R series"}
    for k, v in out["settings"].items():
        v["z_after_allowance"] = round(v["z"] - allowance, 3)
    # Rule A's four registered settings (stops 0.1 / 0.2 sigma x targets 5R / 10R, forge/BREAK_IVRV_PREREG.md) were fixed
    # before this backtest, so their honest allowance is the best of those four, not of all 60.
    reg = [k for k in ("A|0.1|5", "A|0.1|10", "A|0.2|5", "A|0.2|10") if k in W]
    if len(reg) > 1:
        Mr = np.corrcoef(np.vstack([W[k] for k in reg]))
        rr = float(np.nanmean(Mr[np.triu_indices(len(reg), 1)]))
        ar = float(np.sqrt(max(0.0, 1 - rr)) * expected_best_of_n_se(len(reg)))
        out["registered_A"] = {"settings": reg, "mean_pairwise_rho": round(rr, 3), "allowance_se": round(ar, 3),
                               "z_after_allowance": {k: round(out["settings"][k]["z"] - ar, 3) for k in reg}}
        print("registered A:", out["registered_A"])
    best = max(out["settings"].items(), key=lambda kv: kv[1]["z"])
    out["best_setting"] = {"key": best[0], **best[1]}
    (DIR / "summary.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out["search"], indent=1))
    print("best:", best[0], best[1])
    for k in ("A|0.2|5", "A|0.6|1", "B|0.6|1", "C|0.6|1"):
        print(k, out["settings"].get(k))


if __name__ == "__main__":
    main()
