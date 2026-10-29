"""Display data for the Decision Lab card "What we would trade": rule A + the CFD portfolio book on one curve, 2020-26.

    python scripts/rule-a-portfolio/combined_view.py   ->  backtest-data/decision-lab/combined.json

Display only (backtest data already seen; no new test). Each half is scaled to 10% a year volatility with its
full-sample daily SD (a display convention, not a tradeable sizing rule), half the capital each; rule A's R then has a
fixed % size, reported. Trades: every rule A trade (0.2 sigma / 5R, 2x spread) and the book's P1 trade log rows for its
four CFD sleeves.
"""
from __future__ import annotations

import csv
import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

spec = importlib.util.spec_from_file_location("rp", "scripts/rule-a-portfolio/run.py")
rp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rp)

OUT = Path("backtest-data/decision-lab/combined.json")
VOL = 0.10


def main():
    P, _ = rp.rule_a_legs()
    S = rp.book_sleeves()
    common = [d for d in P.index if d in S.index]
    a = P.sum(axis=1).loc[common]
    b = S.loc[common, rp.CFD].mean(axis=1)
    k_a, k_b = VOL / np.sqrt(252) / a.std(ddof=1), VOL / np.sqrt(252) / b.std(ddof=1)
    ra, rb = a * k_a, b * k_b                                  # daily return, fraction of capital, each at 10% a year
    rc = 0.5 * ra + 0.5 * rb
    rc = rc * (VOL / np.sqrt(252) / rc.std(ddof=1))           # combined shown at 10% a year as well

    def stats(x):
        eq = np.cumprod(1 + x.to_numpy())
        dd = 1 - eq / np.maximum.accumulate(eq)
        yrs = len(x) / 252
        return {"cagr": float(eq[-1] ** (1 / yrs) - 1), "vol": float(x.std(ddof=1) * np.sqrt(252)),
                "sharpe": float(x.mean() / x.std(ddof=1) * np.sqrt(252)), "maxdd": float(dd.max()),
                "worst_day": float(x.min()), "best_day": float(x.max())}

    years = sorted({d[:4] for d in common})
    by_year = {y: {k: round(float((1 + s[[d for d in common if d[:4] == y]]).prod() - 1), 4)
                   for k, s in (("ruleA", ra), ("book", rb), ("combined", rc))} for y in years}
    curve = {"d": common[::3], **{k: np.round(np.cumprod(1 + s.to_numpy())[::3], 4).tolist()
                                  for k, s in (("ruleA", ra), ("book", rb), ("combined", rc))}}

    # rule A trades
    import gzip
    R = json.load(gzip.open("backtest-data/decision-lab/rule_a.json.gz", "rt"))
    tr = []
    for t in R["trades"]:
        m = R["instruments"][t["inst"]]
        g = t["g"][m["stops"].index(0.2) * len(m["targets"]) + m["targets"].index("5")]
        if not g:
            continue
        unit = t["o"] * t["sig"] / 100
        stop = t["L"] - t["side"] * 0.2 * unit
        risk = abs(t["ep"] - stop)
        net = g[0] / 1000 - (2 * m["spread"] / risk if risk > 0 else 0)
        hh, mm = divmod(int(t["em"]), 60)
        tr.append([t["d"], f"{hh:02d}:{mm:02d}", t["inst"], "buy" if t["side"] > 0 else "sell", t["line"].replace("_", " "),
                   round(t["ep"], 6), round(stop, 6), round(t["ep"] + t["side"] * 5 * risk, 6), round(net, 3)])
    tr.sort()

    # book trades (P1 log; CFD sleeves only), within the common window
    book = []
    with open("analysis/output/portfolio-book/trades_P1.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["Tags"] not in rp.CFD or r["Date"] < common[0] or r["Date"] > common[-1]:
                continue
            book.append([r["Date"], r["Exit Date"], r["Instrument"], r["Direction"].lower(), r["Model"], float(r["Return %"])])
    book.sort()
    out = {"window": [common[0], common[-1]], "vol_target": VOL,
           "ruleA_risk_per_R_pct": round(float(k_a * 100), 4),
           "stats": {k: stats(s) for k, s in (("ruleA", ra), ("book", rb), ("combined", rc))},
           "corr": float(np.corrcoef(a, b)[0, 1]), "by_year": by_year, "curve": curve,
           "ruleA_trades": tr, "book_trades": book,
           "note": "Display of backtest data already seen (2020-08 to 2026-08). Each half scaled to 10% a year with its full-sample volatility; the book is at its registered costs, before portfolio-book-validate's financing haircuts."}
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print({k: {kk: round(v, 3) for kk, v in s.items()} for k, s in out["stats"].items()}, "risk/R %", out["ruleA_risk_per_R_pct"],
          "trades", len(tr), len(book), "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
