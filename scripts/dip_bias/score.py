"""Score dip-with-bias (forge/DIP_WITH_BIAS_PREREG.md).

    python scripts/dip_bias/score.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

D = Path("analysis/output/dip_bias")
B, SEED = 2000, 20261007


def boot(df_a, df_b=None, rng=None):
    """Mean R (or difference of means) with a month-block bootstrap over the union of months."""
    months = sorted(set(df_a.date.str[:7]) | (set(df_b.date.str[:7]) if df_b is not None else set()))
    ga = {m: g.R.to_numpy() for m, g in df_a.groupby(df_a.date.str[:7])}
    gb = {m: g.R.to_numpy() for m, g in df_b.groupby(df_b.date.str[:7])} if df_b is not None else None
    reps = []
    for _ in range(B):
        pick = rng.choice(months, len(months))
        a = np.concatenate([ga.get(m, np.empty(0)) for m in pick])
        if gb is None:
            reps.append(a.mean() if len(a) else np.nan)
        else:
            b = np.concatenate([gb.get(m, np.empty(0)) for m in pick])
            reps.append((a.mean() if len(a) else np.nan) - (b.mean() if len(b) else np.nan))
    pt = df_a.R.mean() - (df_b.R.mean() if df_b is not None else 0)
    lo, hi = np.nanpercentile(reps, [2.5, 97.5])
    return [round(float(pt), 4), round(float(lo), 4), round(float(hi), 4)]


def main():
    T = pd.read_csv(D / "trades.csv")
    rng = np.random.default_rng(SEED)
    res = {}
    for w in ("all", "his"):
        X = T[T.window == w]
        r = {}
        for g in ("with", "against", "none"):
            G = X[X.bias == g]
            r[g] = {"n": int(len(G)), "meanR": boot(G, rng=rng), "win": round(float((G.R > 0).mean()), 4),
                    "target": round(float((G.outcome == "target").mean()), 4), "stop": round(float((G.outcome == "stop").mean()), 4)}
        r["all_days"] = {"n": int(len(X)), "meanR": boot(X, rng=rng), "win": round(float((X.R > 0).mean()), 4)}
        r["with_minus_all"] = boot(X[X.bias == "with"], X, rng=rng)
        r["by_pair_with"] = {p: round(float(g.R.mean()), 4) for p, g in X[X.bias == "with"].groupby("pair")}
        r["by_year_with"] = {y: round(float(g.R.mean()), 4) for y, g in X[X.bias == "with"].groupby(X.date.str[:4])}
        res[w] = r
    p = res["all"]
    res["verdict"] = "PASS" if (p["with"]["meanR"][1] > 0 and p["with_minus_all"][1] > 0) else "FAIL"
    (D / "results.json").write_text(json.dumps(res, indent=1))
    f = lambda c: f"{c[0]:+.3f} [{c[1]:+.3f}, {c[2]:+.3f}]"
    md = ["# Buy the ~0.8σ dip, only in a trusted direction (results)", "",
          "Pre-registration: `forge/DIP_WITH_BIAS_PREREG.md`. Six yield-book pairs, M1 fills, 2016-10 → 2026-08. Limit at the open ∓ 0.8σ, "
          "target 0.4σ back toward the open, stop 0.6σ, out at 22:00; R = result ÷ the stop, after costs. Breakeven before costs needs 60% "
          "targets. 95% month-block bootstrap.", "", f"## Verdict (all-day window): **{res['verdict']}**", ""]
    for w, title in (("all", "Fills 00:00–21:00 London (primary)"), ("his", "Fills 13:00–16:00 UK (his window)")):
        r = res[w]
        md += [f"### {title}", "", "| trades | n | mean R [95%] | win | hit target | hit stop |", "|---|---|---|---|---|---|"]
        for g, lab in (("with", "**with the yield bias**"), ("against", "against the bias"), ("none", "no bias that day")):
            x = r[g]
            md.append(f"| {lab} | {x['n']} | {f(x['meanR'])} | {x['win'] * 100:.1f}% | {x['target'] * 100:.1f}% | {x['stop'] * 100:.1f}% |")
        md.append(f"| all days (no filter) | {r['all_days']['n']} | {f(r['all_days']['meanR'])} | {r['all_days']['win'] * 100:.1f}% | | |")
        md += ["", f"With-bias minus no-filter: {f(r['with_minus_all'])}",
               "With-bias by pair: " + ", ".join(f"{k} {v:+.3f}" for k, v in r["by_pair_with"].items()),
               "With-bias by year: " + ", ".join(f"{k} {v:+.3f}" for k, v in r["by_year_with"].items()), ""]
    (D / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
