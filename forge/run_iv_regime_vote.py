"""run_iv_regime_vote — forge/IV_REGIME_FADE_FOLLOW_PREREG.md. Analysis only.

    python -m forge.run_iv_regime_vote      (after forge.run_iv_sizing_filter)

Writes forge/out_vol_iv/regime_vote.json.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from forge import run_iv_trades as T

ALPHA = 0.05 / 3


def regimes(panel: pd.DataFrame) -> pd.DataFrame:
    out = []
    for inst, g in panel.groupby("instrument"):
        g = g.sort_values("date").copy()
        s = g["sigma_iv30"]
        # percentile of today's IV within the 252 sessions strictly before it
        g["iv_pct"] = [np.nan if i < 252 else float((s.iloc[i - 252:i] < s.iloc[i]).mean()) for i in range(len(g))]
        g["LEVEL"] = pd.cut(g["iv_pct"], [-0.01, 1 / 3, 2 / 3, 1.01], labels=["low", "mid", "high"]).astype(object)
        g["VRP"] = np.where(g["sigma_har"].notna(), np.where(g["sigma_iv30"] > g["sigma_har"], "rich", "cheap"), None)
        g["STRESS"] = g["stress"].map({1.0: "stress", 0.0: "calm"})
        out.append(g)
    return pd.concat(out)


def cluster_ci(df: pd.DataFrame, alpha: float, reps: int = 4000) -> tuple:
    agg = df.groupby("session")["R"].agg(["sum", "count"])
    s, n = agg["sum"].values, agg["count"].values
    b = []
    for _ in range(reps):
        i = T.RNG.integers(0, len(s), len(s))
        b.append(s[i].sum() / n[i].sum())
    return float(df["R"].mean()), float(np.percentile(b, 100 * alpha / 2)), float(np.percentile(b, 100 * (1 - alpha / 2)))


def main():
    T.VOTE7 = T.FX6                                      # nq file predates both look-ahead fixes
    panel = regimes(T.load_panel())
    for inst in T.FX6:
        j = json.load(open(f"analysis/output/level-atlas-vote-trades/{inst}-votetrades.json"))
        assert j.get("schema") == 4, f"{inst}: not the honest schema-4 file"
    raw = T.load_vote()
    assert raw["decision"].isin(["fade", "follow"]).all(), "unexpected decision values"
    v, audit = T.join(raw, panel)
    split = v["session"].quantile(0.5)
    disc, test = v[v["session"] < split], v[v["session"] >= split]
    res = {"audit": audit, "split": str(split)[:10], "n_disc": int(len(disc)), "n_test": int(len(test)),
           "baseline": {"disc_mean_R": float(disc["R"].mean()), "test_mean_R": float(test["R"].mean())}}

    for fam in ("LEVEL", "VRP", "STRESS"):
        d = disc.dropna(subset=[fam])
        cells = d.groupby(["decision", fam])["R"].agg(["mean", "count"]).reset_index()
        skip = cells[cells["mean"] < 0][["decision", fam]].values.tolist()
        entry = {"discovery_cells": cells.round(4).to_dict("records"), "skip_rule": skip}
        if skip:
            t = test.dropna(subset=[fam])
            mask = pd.Series(False, index=t.index)
            for dcs, reg in skip:
                mask |= (t["decision"] == dcs) & (t[fam] == reg)
            skipped, kept = t[mask], t[~mask]
            m, lo, hi = cluster_ci(skipped, ALPHA) if len(skipped) else (np.nan, np.nan, np.nan)
            entry["test"] = {"skipped_n": int(len(skipped)), "skipped_mean_R": m, "ci": [lo, hi],
                             "total_R_without_rule": float(t["R"].sum()), "total_R_with_rule": float(kept["R"].sum()),
                             "test_cells": t.groupby(["decision", fam])["R"].agg(["mean", "count"]).reset_index().round(4).to_dict("records")}
            entry["PASS"] = bool(len(skipped) and hi < 0 and kept["R"].sum() >= t["R"].sum())
        else:
            entry["PASS"] = False
            entry["note"] = "no discovery cell with mean R < 0 — no rule to test"
        res[fam] = entry
        print(f"\n== {fam} ==  skip rule: {skip or 'none'}")
        print(cells.round(3).to_string(index=False))
        if skip:
            e = entry["test"]
            print(f"  TEST: skipped n={e['skipped_n']} mean R {e['skipped_mean_R']:+.3f} "
                  f"CI [{e['ci'][0]:+.3f}, {e['ci'][1]:+.3f}] | total R {e['total_R_without_rule']:.0f} -> "
                  f"{e['total_R_with_rule']:.0f} | PASS {entry['PASS']}")
    print("\naudit", audit, "| split", res["split"], "| baseline", {k: round(x, 3) for k, x in res["baseline"].items()})
    (T.OUT / "regime_vote.json").write_text(json.dumps(res, indent=2, default=float))


if __name__ == "__main__":
    main()
