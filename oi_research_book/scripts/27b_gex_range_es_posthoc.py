"""
gex-range-es POST-HOC checks (results seen; descriptive only, can demote or describe, never promote).

Run after 27_gex_range_es.py, on the scored frame (near surface, NY-close, OI(D) -> S(D+2)):
  1. concentration: per year, drop top-1% DR days, winsorise at the 95th percentile
  2. the "market has fallen" confound: short-gamma days follow declines, and declines widen
     ranges on their own. OLS of DR on short + sigma-quintile dummies + trailing 5/20-session
     return + drawdown from the 60-session high (all known at S(D+1)), block-bootstrap SE
     (mean block 10, B 4000) and a label-shift placebo of that coefficient
  3. ES/NQ overlap: how often both books carry the same gamma sign on the same date

Usage: python oi_research_book/scripts/27b_gex_range_es_posthoc.py
"""
import json
import importlib.util
import numpy as np
import pandas as pd
from pathlib import Path

_s = importlib.util.spec_from_file_location("m", Path(__file__).with_name("27_gex_range_es.py"))
m = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m)

B = 4000


def with_controls(name, start):
    d, _ = m.frame(name, "near", "c", start)
    S = m.sessions(m.INSTR[name]["px"])
    pos = S.index.get_indexer(d["tgt"]) - 1            # S(D+1): last session before the target
    c = S["close"].to_numpy()
    d["r5"] = np.log(c[pos] / c[pos - 5])
    d["r20"] = np.log(c[pos] / c[pos - 20])
    d["dd60"] = np.log(c[pos] / pd.Series(c).rolling(60).max().to_numpy()[pos])
    return d


def vm(x):
    return float(m.vm_delta(x["dr"].to_numpy(), x["is_short"].to_numpy(), m.strata(x["sig"]))[0])


def ols_short(d, controls, rng=None):
    X = pd.get_dummies(m.strata(d["sig"]), prefix="s", drop_first=True).astype(float)
    X.insert(0, "c", 1.0)
    X["short"] = d["is_short"].astype(float).values
    for k in controls:
        X[k] = d[k].values
    A, y, j = X.values, d["dr"].values, list(X.columns).index("short")
    b = float(np.linalg.lstsq(A, y, rcond=None)[0][j])
    if rng is None:
        return b, None
    bs = [np.linalg.lstsq(A[ix], y[ix], rcond=None)[0][j]
          for ch in m.s18._boot_stats(len(y), B, rng, chunk=500) for ix in ch]
    se = float(np.std(bs))
    pl = []
    for k in range(60, len(y) - 60, 5):
        A2 = A.copy(); A2[:, j] = np.roll(A[:, j], k)
        pl.append(np.linalg.lstsq(A2, y, rcond=None)[0][j])
    pl = np.array(pl)
    return b, {"se": se, "ci95": [b - 1.96 * se, b + 1.96 * se], "t": b / se,
               "placebo_mean": float(pl.mean()), "placebo_sd": float(pl.std()),
               "real_above_placebo_share": float((pl < b).mean())}


def main():
    rng = np.random.default_rng(m.SEED)
    start = m.first_date("ES")
    out, signs = {}, {}
    for name in m.INSTR:
        d = with_controls(name, start)
        r = {"vm_all": vm(d)}
        r["by_year"] = {int(y): {"vm": vm(g) if g["is_short"].sum() >= 10 else None,
                                 "n": len(g), "n_short": int(g["is_short"].sum())}
                        for y, g in d.groupby(d["date"].dt.year)}
        r["drop_top1pct"] = vm(d[d["dr"] < d["dr"].quantile(0.99)])
        w = d.copy(); w["dr"] = w["dr"].clip(upper=w["dr"].quantile(0.95)); r["winsor95"] = vm(w)
        r["short_vs_long_mean"] = {k: [float(d.loc[d["is_short"], k].mean()), float(d.loc[~d["is_short"], k].mean())]
                                   for k in ("r5", "r20", "dd60")}
        r["ols_short_no_controls"], _ = ols_short(d, [])
        b, info = ols_short(d, ["r5", "r20", "dd60"], rng)
        r["ols_short_with_return_controls"] = {"coef": b, **info}
        out[name] = r
        signs[name] = d.set_index("date")["is_short"]
        print(f"{name}: vm {r['vm_all']:+.3f}  no-ctrl OLS {r['ols_short_no_controls']:+.3f}  "
              f"with r5/r20/dd60 {b:+.3f} [{info['ci95'][0]:+.3f}, {info['ci95'][1]:+.3f}] t {info['t']:.2f}  "
              f"placebo above {info['real_above_placebo_share']:.0%}")
    j = pd.concat(signs, axis=1).dropna()
    out["overlap"] = {"n": len(j), "same_sign_share": float((j["ES"] == j["NQ"]).mean()),
                      "both_short": int((j["ES"] & j["NQ"]).sum()),
                      "es_short_only": int((j["ES"] & ~j["NQ"]).sum()),
                      "nq_short_only": int((~j["ES"] & j["NQ"]).sum())}
    print("overlap:", out["overlap"])
    out["note"] = "POST-HOC (results seen). Descriptive; may demote or describe, never promote."
    (m.OUT / "gex_range_es_posthoc.json").write_text(json.dumps(out, indent=2, default=float))
    print("wrote", m.OUT / "gex_range_es_posthoc.json")


if __name__ == "__main__":
    main()
