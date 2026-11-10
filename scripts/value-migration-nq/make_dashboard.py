#!/usr/bin/env python3
"""Build the results dashboard from analysis/output/value-migration-nq/{results,grid,power,data_quality}.json and
trades_net.csv.gz.

    python scripts/value-migration-nq/make_dashboard.py

Writes dashboard.html (a full document, opens from disk). `--fragment PATH` also writes the page without the
document skeleton, for the Artifact viewer.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "analysis" / "output" / "value-migration-nq"
TEMPLATE = Path(__file__).parent / "dashboard_template.html"


def r4(x):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), 4)


def main():
    res = json.loads((OUT / "results.json").read_text())
    grid = json.loads((OUT / "grid.json").read_text()) if (OUT / "grid.json").exists() else None
    power = json.loads((OUT / "power.json").read_text())
    dq = json.loads((OUT / "data_quality.json").read_text())
    tr = pd.read_csv(OUT / "trades_net.csv.gz")
    days = pd.read_csv(OUT / "states.csv.gz", usecols=["date"])["date"].drop_duplicates().sort_values().tolist()

    # equity: cumulative net R and USD per strategy, on every scored session (weekly points to keep the page small)
    equity = {}
    for (m, e, x), g in tr.groupby(["model", "entry_type", "exit_type"]):
        d = g.groupby("date")[["R", "usd"]].sum().reindex(days, fill_value=0.0)
        cumR, cumU = d["R"].cumsum(), d["usd"].cumsum()
        ddR = cumR - cumR.cummax()
        step = 3
        idx = list(range(0, len(days), step)) + [len(days) - 1]
        equity[f"{m}|{e}|{x}"] = {"d": [days[i] for i in idx], "R": [round(cumR.iat[i], 2) for i in idx],
                                  "U": [round(cumU.iat[i], 0) for i in idx], "dd": [round(ddR.iat[i], 2) for i in idx]}

    strat = []
    for s in res["strategies"]:
        f, i, o = s["full"], s["is"], s["oos"]
        strat.append({
            "key": f"{s['model']}|{s['entry']}|{s['exit']}", "model": s["model"].rstrip("_"), "entry": s["entry"],
            "exit": s["exit"], "trades": f.get("trades", 0), "days": f.get("trade_days", 0),
            "win": r4(f.get("win_rate")), "pf": r4(f.get("profit_factor")), "expR": r4(f.get("exp_R")),
            "lo": r4(f.get("boot_R", {}).get("lo")), "hi": r4(f.get("boot_R", {}).get("hi")),
            "exp_usd": r4(f.get("exp_usd")), "avg_win": r4(f.get("avg_win_usd")), "avg_loss": r4(f.get("avg_loss_usd")),
            "sharpe": r4(f.get("sharpe")), "sortino": r4(f.get("sortino")), "mdd": r4(f.get("max_dd_usd")),
            "mddR": r4(f.get("max_dd_R")), "mae": r4(f.get("mae_R_mean")), "mfe": r4(f.get("mfe_R_mean")),
            "longR": r4(f.get("long_exp_R")), "shortR": r4(f.get("short_exp_R")),
            "longN": f.get("long_n"), "shortN": f.get("short_n"),
            "isR": r4(i.get("exp_R")), "oosR": r4(o.get("exp_R")),
            "grossR": r4(s["gross"].get("exp_R")), "stressR": r4(s["stress"].get("exp_R")),
            "randR": r4(s.get("random_net", {}).get("mean")), "randGross": r4(s.get("random_gross", {}).get("mean")),
            "vsRand": r4(s.get("vs_random")), "vsZ": r4(s.get("vs_random_z")), "pHolm": r4(s.get("p_holm")),
            "pass": s.get("pass"), "exits": f.get("exits"), "hold": r4(f.get("avg_hold_min")),
            "byRegime": s.get("by_regime"), "byYear": s.get("by_year"),
        })
    powered = {f"{p['model']}|{p['entry']}|{p['exit']}": p["powered"] for p in power["strategies"]}
    for s in strat:
        s["powered"] = powered.get(s["key"])

    signed = [{"model": r["model"], "h": r["h"], **{k: {"est": r4(r[k]["est"]), "lo": r4(r[k]["lo"]), "hi": r4(r[k]["hi"]),
              "n": r[k]["n"]} for k in ("full", "is", "oos", "long", "short")}} for r in res["signed_outcomes"]]
    pw = {c["cell"]: c for c in power["stats_cells"]}
    cells = [{"cell": c["cell"], "m1": c["m1"], "m2": c["m2"], "h": c["h"], "est": r4(c["est"]), "lo": r4(c["lo"]),
              "hi": r4(c["hi"]), "is": r4(c["is"]), "oos": r4(c["oos"]), "pHolm": r4(c["p_holm"]), "bar": c["bar"],
              "mde": r4(pw.get(c["cell"], {}).get("mde")), "powered": pw.get(c["cell"], {}).get("powered"),
              "pass": c["pass"], "mirror": c["mirror"], "placeboMax": r4(c.get("placebo_max"))} for c in res["stats_cells"]]
    regs = {h: {k: {n: (r4(v["est"]), r4(v["lo"]), r4(v["hi"])) for n, v in m.items() if not n.startswith("_")}
                | {"_r2": r4(m["_r2"])} for k, m in hh.items()} for h, hh in res["regressions"].items()}
    data = {"sample": res["sample"], "params": res["params"], "cells": cells, "signed": signed, "strat": strat,
            "equity": equity, "regimes": [{k: (r4(v) if isinstance(v, float) else v) for k, v in r.items()} for r in res["regime_slices"]],
            "placebo": {k: {"real": r4(v["real"]), "mean": r4(v["mean"]), "sd": r4(v["sd"]), "pct": v["pctile"]} for k, v in res["placebo"].items()},
            "regs": regs, "dq": dq, "verdicts": json.loads((OUT / "verdicts.json").read_text()) if (OUT / "verdicts.json").exists() else {},
            "grid": None if grid is None else {"summary": grid["summary"],
                                               "box": grid["box_size"]["signed"]}}
    html = TEMPLATE.read_text().replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":"), default=lambda o: None))
    if len(sys.argv) > 2 and sys.argv[1] == "--fragment":   # page body only, for the Artifact viewer
        Path(sys.argv[2]).write_text(html)
    (OUT / "dashboard.html").write_text("<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">"
                                        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">"
                                        "</head><body>\n" + html + "\n</body></html>\n")
    print("wrote", OUT / "dashboard.html", round(len(html) / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
