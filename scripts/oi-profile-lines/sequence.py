#!/usr/bin/env python3
"""oi-profile-lines, EXPLORATORY follow-ups (not pre-registered, 2026-11-24). Two owner questions:
  1. Does what a line did on touch 1 (and 1-2) change what it does next? (H = held / back, B = broke / through; real vs the same line's placebos)
  2. Does anything about the market at the touch predict hold vs break? (a logistic on market-state features, fitted on one half of the dates and
     scored on the other, pooled real + placebo touches, since lines and placebos behave alike)
    python scripts/oi-profile-lines/sequence.py <touches_outcomes.parquet> <outDir>
Writes <outDir>/sequence.json. Date-clustered bootstrap B = 2000, seed 20261124.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

TP, OUT = Path(sys.argv[1]), Path(sys.argv[2])
SEED, B = 20261124, 2000
d = pd.read_parquet(TP).sort_values(["date", "fk", "kind", "parent", "shift", "price", "t"])
d["types"] = d["types"].str.replace("charm_flip", "vanna_flip")
code = {"back": "H", "through": "B", "both": "?", "unresolved": "."}
d["r"] = d.res.map(code)
key = ["date", "fk", "kind", "shift", "price"]
d["path"] = d.groupby(key).r.transform(lambda x: x.cumsum().shift(1).fillna(""))
d["prev_side"] = d.groupby(key).side.shift(1)
r = d[d.res.isin(["back", "through"])].copy()
r["y"] = (r.res == "back").astype(float)


def boot(m):
    """real − placebo hold rate in cell m, date-clustered bootstrap."""
    a, b = r[m & (r.kind == "real")], r[m & (r.kind == "placebo")]
    if len(a) < 5 or len(b) < 5:
        return {"real": None, "plc": None, "n": int(len(a)), "E": None, "ci": None}
    rng = np.random.default_rng(SEED)
    dates = r.loc[m, "date"].unique()
    ga = a.groupby("date").y.agg(["sum", "size"]).reindex(dates, fill_value=0)
    gb = b.groupby("date").y.agg(["sum", "size"]).reindex(dates, fill_value=0)
    es = []
    for _ in range(B):
        i = rng.integers(0, len(dates), len(dates))
        sa, na_, sb, nb = ga["sum"].values[i].sum(), ga["size"].values[i].sum(), gb["sum"].values[i].sum(), gb["size"].values[i].sum()
        if na_ and nb:
            es.append(sa / na_ - sb / nb)
    E = a.y.mean() - b.y.mean()
    return {"real": round(100 * a.y.mean(), 1), "plc": round(100 * b.y.mean(), 1), "n": int(len(a)), "E": round(100 * E, 1),
            "ci": [round(100 * x, 1) for x in np.percentile(es, [2.5, 97.5])]}


out = {"exploratory": True, "seed": SEED, "B": B, "note": "Exploratory, not pre-registered. About 20 cells looked at; one or two will look interesting by chance."}
same = r.prev_side == r.side
out["touch2"] = {
    "after held": boot((r.n == 2) & (r.path == "H")),
    "after broke, same side": boot((r.n == 2) & (r.path == "B") & same),
    "after broke, retest from the other side": boot((r.n == 2) & (r.path == "B") & ~same),
}
out["touch3"] = {p: boot((r.n == 3) & (r.path == p)) for p in ("HH", "HB", "BH", "BB")}
TYPES = ["put_wall", "call_wall", "gamma_peak", "zero_gamma", "vanna_flip", "oi_volume", "exp_hi", "exp_lo", "max_pain"]
out["touch2AfterHeldByType"] = {t: boot((r.n == 2) & (r.path == "H") & r.types.str.contains(t)) for t in TYPES}
out["gammaPeakPin"] = {
    "touch 1": boot((r.n == 1) & r.types.str.contains("gamma_peak") & (r.regime == "PIN")),
    "touch 2 after held": boot((r.n == 2) & (r.path == "H") & r.types.str.contains("gamma_peak") & (r.regime == "PIN")),
    "touch 2+ any": boot((r.n >= 2) & r.types.str.contains("gamma_peak") & (r.regime == "PIN")),
}

# ── 2. market state → hold? ────────────────────────────────────────────────────────────────────────────────────────────────────
from sklearn.linear_model import LogisticRegression  # noqa: E402

s = r.copy()
s["ext"] = s.from_open * s.side   # + = touched moving with the day's move (stretched), − = pulling back toward the open
s["gp_pin1"] = ((s.kind == "real") & s.types.str.contains("gamma_peak") & (s.regime == "PIN") & (s.n == 1)).astype(int)
X = pd.DataFrame({"ext": s.ext.clip(-2, 2), "ext2": s.ext.clip(-2, 2) ** 2, "speed15": s.speed15.clip(0, 1), "vol_pct": s.vol_pct / 100,
                  "range_sofar": s.range_sofar.clip(0, 3), "pin": (s.regime == "PIN").astype(int), "touch2plus": (s.n >= 2).astype(int),
                  "prev_held": (s.path.str[-1:] == "H").astype(int), "prev_broke": (s.path.str[-1:] == "B").astype(int),
                  "gp_pin_first": s.gp_pin1, "late_19plus": (s.ldn_hour >= 19).astype(int)})
dates = sorted(s.date.unique())
mid = dates[len(dates) // 2]
folds = []
for name, tr, te in (("fit A score B", s.date < mid, s.date >= mid), ("fit B score A", s.date >= mid, s.date < mid)):
    m = LogisticRegression(C=1.0, max_iter=500).fit(X[tr], s.y[tr])
    p, y, base = m.predict_proba(X[te])[:, 1], s.y[te].values, s.y[tr].mean()
    dd = s.date[te].values
    ud = np.unique(dd)
    idx = {u: np.where(dd == u)[0] for u in ud}
    rng = np.random.default_rng(SEED)
    sk = []
    for _ in range(B // 2):
        ii = np.concatenate([idx[u] for u in rng.choice(ud, len(ud))])
        sk.append(1 - np.mean((p[ii] - y[ii]) ** 2) / np.mean((base - y[ii]) ** 2))
    q = pd.qcut(p, 5, labels=False, duplicates="drop")
    folds.append({"fold": name, "n": int(len(y)), "brierSkill": round(1 - np.mean((p - y) ** 2) / np.mean((base - y) ** 2), 4),
                  "ci": [round(x, 4) for x in np.percentile(sk, [2.5, 97.5])],
                  "quintiles": [{"pred": round(float(p[q == k].mean()), 3), "actual": round(float(y[q == k].mean()), 3)} for k in range(int(q.max()) + 1)],
                  "coef": {c: round(float(v), 3) for c, v in zip(X.columns, m.coef_[0])}})
ext_bins = pd.cut(s.ext, [-9, -1, -0.5, -0.2, 0.2, 0.5, 1, 1.5, 9], labels=["<-1", "-1..-0.5", "-0.5..-0.2", "~0", "0.2..0.5", "0.5..1", "1..1.5", ">1.5"])
out["state"] = {"touches": int(len(s)), "dates": len(dates), "split": mid, "base": round(float(s.y.mean()), 3), "folds": folds,
                "byStretch": {str(k): {"held": round(float(g.y.mean()), 3), "n": int(len(g))} for k, g in s.groupby(ext_bins, observed=True)},
                "byVol": {k: {"held": round(float(g.y.mean()), 3), "n": int(len(g))} for k, g in s.groupby(pd.cut(s.vol_pct, [-1, 33, 66, 101], labels=["low", "mid", "high"]), observed=True)}}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "sequence.json").write_text(json.dumps(out, indent=1, default=str))
print(json.dumps({k: out[k] for k in ("touch2", "touch3")}, indent=1))
print([(f["fold"], f["brierSkill"], f["ci"]) for f in folds])
