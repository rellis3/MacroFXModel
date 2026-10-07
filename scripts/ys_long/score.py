"""Score the yield-spread book on the long FRED history (forge/YS_LONG_CONFIRM_PREREG.md).

    python scripts/ys_long/score.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

D = Path("analysis/output/ys_long")
B, SEED = 2000, 20261007
DECADES = [("1976–85", "1976-01-01", "1985-12-31"), ("1986–95", "1986-01-01", "1995-12-31"),
           ("1996–2005", "1996-01-01", "2005-12-31"), ("2006–14", "2006-01-01", "2014-12-31")]


def stats(T: pd.DataFrame, rng) -> dict:
    r = T.ret.to_numpy()
    months = T.date.str[:7].to_numpy()
    um = np.unique(months)
    idx = {m: np.where(months == m)[0] for m in um}
    reps = [r[np.concatenate([idx[m] for m in rng.choice(um, len(um))])].mean() for _ in range(B)]
    lo, hi = np.percentile(reps, [2.5, 97.5])
    w, l = r[r > 0].sum(), -r[r < 0].sum()
    return {"n": int(len(r)), "mean_pct": round(r.mean() * 100, 4), "ci_pct": [round(lo * 100, 4), round(hi * 100, 4)],
            "win": round(float((r > 0).mean()), 4), "pf": round(float(w / l), 3) if l > 0 else None}


def sharpe_daily(F: pd.DataFrame, a, b) -> float:
    f = F[(F.date >= a) & (F.date <= b)].groupby("date").ret.sum()
    return round(float(f.mean() / f.std() * np.sqrt(252)), 3) if f.std() > 0 else 0.0


def main():
    T = pd.read_csv(D / "trades.csv")
    F = pd.read_csv(D / "daily_flat.csv")
    rng = np.random.default_rng(SEED)
    orig = T[T.group == "original"]
    test = orig[(orig.date >= "1976-01-01") & (orig.date <= "2014-12-31")]
    res = {"test": stats(test, rng), "test_sharpe_daily": sharpe_daily(F[F.pair.isin(orig.pair.unique())], "1976-01-01", "2014-12-31")}
    res["decades"] = {n: stats(test[(test.date >= a) & (test.date <= b)], rng) for n, a, b in DECADES}
    res["pairs"] = {p: stats(g, rng) for p, g in test.groupby("pair")}
    c1 = res["test"]["ci_pct"][0] > 0
    c2 = res["test"]["win"] > 0.5
    dpos = sum(v["mean_pct"] > 0 for v in res["decades"].values())
    ppos = sum(v["mean_pct"] > 0 for v in res["pairs"].values())
    c3 = dpos >= 3 and ppos >= 4
    res["checks"] = {"mean_ci_above_0": c1, "win_over_50": c2, "decades_positive": f"{dpos}/4", "pairs_positive": f"{ppos}/6", "consistency": c3}
    res["verdict"] = "PASS" if (c1 and c2 and c3) else "FAIL"
    # cross-check: the validated era rebuilt from FRED
    val = orig[orig.date >= "2015-01-01"]
    res["validated_era_fred_rebuild"] = stats(val, rng) | {"sharpe_daily": sharpe_daily(F[F.pair.isin(orig.pair.unique())], "2015-01-01", "2026-12-31")}
    # breadth
    br = T[T.group == "breadth"]
    res["breadth"] = stats(br, rng) | {"pairs": {p: stats(g, rng) for p, g in br.groupby("pair")},
                                      "sharpe_daily": sharpe_daily(F[F.pair.isin(br.pair.unique())], "1976-01-01", "2026-12-31")}
    bpos = sum(v["mean_pct"] > 0 for v in res["breadth"]["pairs"].values())
    res["breadth_verdict"] = "PASS" if (res["breadth"]["ci_pct"][0] > 0 and res["breadth"]["win"] > 0.5 and bpos >= 2) else "FAIL"
    (D / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: bool(o) if isinstance(o, np.bool_) else str(o)))
    f = lambda s: f"{s['n']} | {s['mean_pct']:+.3f}% [{s['ci_pct'][0]:+.3f}, {s['ci_pct'][1]:+.3f}] | {s['win'] * 100:.1f}% | {s['pf']}"
    md = ["# The yield-spread book on 40 untouched years (results)", "",
          "Pre-registration: `forge/YS_LONG_CONFIRM_PREREG.md`. FRED daily FX (noon NY) + monthly rates, the validated configuration "
          "unchanged (entry |z| 2.0, window 126, exit 1.5 / 20 days, 0.02% cost, flat size). 95% intervals: month-block bootstrap.", "",
          f"## Verdict (1976–2014, six original pairs): **{res['verdict']}**", "",
          f"Checks: mean > 0 with interval above 0: {c1} · win rate > 50%: {c2} · decades positive {dpos}/4 · pairs positive {ppos}/6.",
          f"Daily flat-book Sharpe 1976–2014: {res['test_sharpe_daily']}.", "",
          "| period | trades | mean net / trade [95%] | win | PF |", "|---|---|---|---|---|",
          f"| **1976–2014 (test)** | {f(res['test'])} |"]
    md += [f"| {n} | {f(v)} |" for n, v in res["decades"].items()]
    md += [f"| validated era 2015–2026 (FRED rebuild, cross-check) | {f(res['validated_era_fred_rebuild'])} |", "",
           "| pair (1976–2014) | trades | mean net / trade [95%] | win | PF |", "|---|---|---|---|---|"]
    md += [f"| {p} | {f(v)} |" for p, v in res["pairs"].items()]
    md += ["", f"## Breadth check (NZD, NOK, SEK, never tested, full span): **{res['breadth_verdict']}**", "",
           f"Pooled: {f(res['breadth'])} · daily Sharpe {res['breadth']['sharpe_daily']}", "",
           "| pair | trades | mean net / trade [95%] | win | PF |", "|---|---|---|---|---|"]
    md += [f"| {p} | {f(v)} |" for p, v in res["breadth"]["pairs"].items()]
    (D / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
