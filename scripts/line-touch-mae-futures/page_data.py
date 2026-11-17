"""Compact JSON for the Futures Volatility Analysis page, from touches.parquet (build.py v2).

Dimensions: instrument x line group (OH/OL, OC, HL, ALL) x cluster (all / lone / stack) x ...
  lone  = no other line within CLUSTER_TICKS ticks at the touch bar
  stack = at least one other line within CLUSTER_TICKS ticks (a move into a stack is a touch on each line)
Each cell: n and, per horizon, [back p50, p75, p90, through p50, p75, p90, back-wins %] in display units;
tick tables: [mean, median, p75, p90] of MAE (through) and MFE (back) in ticks.

    python -I scripts/line-touch-mae-futures/page_data.py <out.json>
"""
import json
import sys
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "analysis/output/line-touch-mae-futures"
HS = ["30m", "60m", "240m", "eod"]
TICK = {"NQ": 0.25, "EURUSD": 0.5, "GOLD": 0.1}
CLUSTER_TICKS = 5


def cell(g):
    r = {"n": int(len(g))}
    for h in HS:
        b, th = g[f"back_{h}"], g[f"through_{h}"]
        r[h] = [round(float(b.quantile(q)), 2) for q in (.5, .75, .9)] + \
               [round(float(th.quantile(q)), 2) for q in (.5, .75, .9)] + [round(float((b > th).mean() * 100), 1)]
    return r


def tick_cell(g, inst):
    r = {"n": int(len(g))}
    for h in HS:
        r[h] = {}
        for c, lab in (("through", "mae"), ("back", "mfe")):
            x = g[f"{c}_{h}"] / TICK[inst]
            r[h][lab] = [round(float(x.mean()), 1), round(float(x.median()), 1),
                         round(float(x.quantile(.75)), 1), round(float(x.quantile(.9)), 1)]
    return r


def expand(t):
    """Duplicate rows into the ALL group and the 'all' / 'better' cluster buckets so every combination is a groupby.
    better = the touched line is the outermost of its stack (no other line within 5 ticks beyond it; race.py)."""
    t = t.copy()
    t["cl"] = (t["n_within_5t"] > 0).map({True: "stack", False: "lone"})
    a = pd.concat([t, t.assign(group="ALL")], ignore_index=True)
    parts = [a, a.assign(cl="all")]
    if "better" in a:
        parts.append(a[a.better.fillna(False).astype(bool)].assign(cl="better"))
    return pd.concat(parts, ignore_index=True)


def records(df, by, fn):
    out = []
    for k, g in df.groupby(by):
        k = k if isinstance(k, tuple) else (k,)
        r = {b: (v.item() if hasattr(v, "item") else v) for b, v in zip(by, k)}
        r.update(fn(g))
        out.append(r)
    return out


def main(dest):
    t = pd.read_parquet(OUT / "touches.parquet")
    t["touch"] = t["touch_n"].clip(upper=4)
    b = pd.read_parquet(OUT / "touches_better.parquet", columns=["instrument", "date", "line", "touch_n", "better"])
    t = t.merge(b.assign(kind="line"), on=["instrument", "date", "line", "touch_n", "kind"], how="left")
    assert t.loc[t.kind == "line", "better"].notna().all(), "race.py touches do not match build.py touches"
    L = expand(t[t.kind == "line"])
    lines = t[t.kind == "line"]
    data = {
        "touch": records(L, ["instrument", "group", "cl", "rung", "touch"], cell),
        "weekday": records(L, ["instrument", "group", "cl", "weekday"], cell),
        "hour": records(L, ["instrument", "group", "cl", "lon_hour"], cell),
        "placebo": records(expand(t[t.touch_n == 1]), ["instrument", "group", "cl", "kind", "rung"], cell),
        "ticks": records(L, ["instrument", "group", "cl"], lambda g: tick_cell(g, g["instrument"].iloc[0])),
        "ticksFirst": records(L[L.touch_n == 1], ["instrument", "group", "cl"],
                              lambda g: tick_cell(g, g["instrument"].iloc[0])),
        "stackShare": records(L[L.cl == "all"], ["instrument", "group"],
                              lambda g: {"pct": round(float((g.n_within_5t > 0).mean() * 100), 1),
                                         "pct2": round(float((g.n_within_2t > 0).mean() * 100), 1)}),
        "topPairs": [],
        "sigma": {k: round(float(v), 1) for k, v in lines.groupby("instrument").sigma_pts.median().items()},
        "meta": json.loads((OUT / "meta.json").read_text()),
        "clusterTicks": CLUSTER_TICKS,
        "race": json.loads((OUT / "race.json").read_text()),
        "betterShare": records(L[L.cl == "all"], ["instrument", "group"],
                               lambda g: {"pct": round(float(g.better.mean() * 100), 1), "n": int(g.better.sum())}),
    }
    st = lines[lines.n_within_5t > 0]
    for inst, g in st.groupby("instrument"):
        top = (g.line + " + " + g.nearest_line).value_counts().head(5)
        data["topPairs"].append({"instrument": inst, "pairs": [[k, int(v)] for k, v in top.items()]})
    s = json.dumps(data, separators=(",", ":"))
    Path(dest).write_text(s)
    print(len(s), "bytes")


if __name__ == "__main__":
    main(sys.argv[1])
