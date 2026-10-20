"""rates-vol-gap: score the registered cells (forge/RATES_VOL_GAP_PREREG.md). Writes results.json."""
import json
from math import erf, sqrt

import numpy as np
import pandas as pd

from common import (OUT, ROOT, SEED, STATE_MP, STATE_VP, baseline_cols, block_indices, half, load, partial_corr,
                    resid, state_effect)

B, BLOCK, N_SHIFT = 2000, 21, 400
rng = np.random.default_rng(SEED)


def boot(df, fn):
    n = len(df)
    vals = [fn(df.iloc[block_indices(n, BLOCK, rng)]) for _ in range(B)]
    v = np.array(vals, dtype=float)
    v = v[np.isfinite(v)]
    return [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]


def p_from_ci(est, ci):
    se = (ci[1] - ci[0]) / 3.92
    z = abs(est) / se if se > 0 else 0.0
    return float(2 * (1 - 0.5 * (1 + erf(z / sqrt(2)))))


def placebo(df, fn_shifted):
    n = len(df)
    mp = df["mp"].to_numpy()
    return np.array([fn_shifted(np.roll(mp, int(rng.integers(126, n - 126)))) for _ in range(N_SHIFT)])


def c1_cell(df, h):
    est = partial_corr(df, h)

    def shifted(m):
        d = df.copy()
        d["mp"] = m
        return partial_corr(d, h)
    pl = placebo(df, shifted)
    return {"n": len(df), "est": round(est, 4), "ci": [round(x, 4) for x in boot(df, lambda d: partial_corr(d, h))],
            "placebo_p95": round(float(np.percentile(pl, 95)), 4), "placebo_mean": round(float(pl.mean()), 4)}


def c2_cell(df, h, mirror=False):
    if not mirror:
        fn = lambda d: state_effect(d, h)  # noqa: E731
        cheap = df["vp"] <= STATE_VP
        n_a = int((cheap & (df["mp"] >= STATE_MP)).sum())
        n_b = int((cheap & (df["mp"] < STATE_MP)).sum())
    else:
        def fn(d):
            ry = resid(d[f"y{h}"].to_numpy(), d[baseline_cols(h)].to_numpy())
            rich = d["vp"].to_numpy() >= 0.70
            mp = d["mp"].to_numpy()
            a, b = rich & (mp <= 0.30), rich & (mp > 0.30)
            return float(ry[a].mean() - ry[b].mean()) if a.sum() and b.sum() else float("nan")
        rich = df["vp"] >= 0.70
        n_a, n_b = int((rich & (df["mp"] <= 0.30)).sum()), int((rich & (df["mp"] > 0.30)).sum())
    return {"n_state": n_a, "n_other": n_b, "est": round(fn(df), 4), "ci": [round(x, 4) for x in boot(df, fn)]}


res = {"seed": SEED, "B": B, "block": BLOCK, "n_shift": N_SHIFT, "scored": {}, "descriptive": {}}

# ---- scored C1: h1 pooled + halves sign
d1 = load(1)
c1 = c1_cell(d1, 1)
c1["halves"] = {k: round(partial_corr(half(d1, k), 1), 4) for k in ("explore", "confirm")}
c1["p"] = p_from_ci(c1["est"], c1["ci"])
res["scored"]["C1_h1_pooled"] = c1

# ---- scored C2: h5 pooled
d5 = load(5)
c2 = c2_cell(d5, 5)
c2["p"] = p_from_ci(c2["est"], c2["ci"])
res["scored"]["C2_h5_pooled"] = c2

# ---- Holm over the two scored cells
ps = sorted([("C1_h1_pooled", c1["p"]), ("C2_h5_pooled", c2["p"])], key=lambda x: x[1])
holm = {}
for i, (k, p) in enumerate(ps):
    holm[k] = p <= 0.05 / (len(ps) - i) and all(holm.get(kk, True) for kk, _ in ps[:i])
res["holm_pass"] = holm

# ---- verdicts exactly as registered (prereg section 4)
gate = {
    "ci_above_0": c1["ci"][0] > 0,
    "est_ge_0.05": c1["est"] >= 0.05,
    "above_placebo_p95": c1["est"] > c1["placebo_p95"],
    "both_halves_positive": all(v > 0 for v in c1["halves"].values()),
    "holm": holm["C1_h1_pooled"],
}
if all(gate.values()):
    v1 = "VALIDATED"
elif c1["ci"][1] < 0.10:
    v1 = "NULL"
elif c1["ci"][0] <= 0 <= c1["ci"][1]:
    v1 = "UNDERPOWERED"
else:
    v1 = "NOT COVERED BY THE PREREG RULES (CI excludes 0 but a gate failed) - needs an amendment before a word"
v2 = "UNDERPOWERED" if (c2["ci"][0] <= 0 <= c2["ci"][1]) else "CANDIDATE (CI excludes 0; own prereg on fresh data)"
res["gate_C1"] = gate
res["verdict"] = {"rates-vol-gap-move": v1, "rates-vol-gap-state": v2}

# ---- descriptive
D = res["descriptive"]
for h in (5, 21):
    dh = load(h)
    D[f"C1_h{h}_pooled"] = {"n": len(dh), "est": round(partial_corr(dh, h), 4),
                            "ci": [round(x, 4) for x in boot(dh, lambda d, h=h: partial_corr(d, h))],
                            "halves": {k: round(partial_corr(half(dh, k), h), 4) for k in ("explore", "confirm")}}
D["C2_h5_halves"] = {k: round(state_effect(half(d5, k), 5), 4) for k in ("explore", "confirm")}
D["C2_h1_pooled"] = c2_cell(d1, 1)
D["mirror_h5_pooled"] = c2_cell(d5, 5, mirror=True)

# MOVE level instead of percentile
p = pd.read_parquet(OUT / "panel.parquet")
d1l = d1.copy()
d1l["lmove"] = np.log(p["move"].reindex(d1l.index))
D["C1_h1_lnMOVE"] = {"est": round(partial_corr(d1l, 1, "lmove"), 4),
                     "ci": [round(x, 4) for x in boot(d1l, lambda d: partial_corr(d, 1, "lmove"))]}

# concentration
D["C1_h1_by_year"] = {int(y): round(partial_corr(g, 1), 4) for y, g in d1.groupby(d1.index.year) if len(g) > 150}
for drop in (2020, 2022):
    dd = d1[d1.index.year != drop]
    D[f"C1_h1_without_{drop}"] = {"est": round(partial_corr(dd, 1), 4),
                                 "ci": [round(x, 4) for x in boot(dd, lambda d: partial_corr(d, 1))]}

# FOMC-window interaction at h5: does MOVE matter more when an FOMC falls in the next 5 sessions?
d5i = d5.copy()
d5i["mpx"] = d5i["mp"] * (d5i["fomc5"] > 0)
X = d5i[baseline_cols(5) + ["mp"]].to_numpy()
D["mp_x_fomc5_h5"] = {"partial_corr": round(float(np.corrcoef(resid(d5i["y5"].to_numpy(), X),
                                                                 resid(d5i["mpx"].to_numpy(), X))[0, 1]), 4),
                      "n_fomc_windows": int((d5i["fomc5"] > 0).sum())}

# NQ settlement iv30 in place of VXN (2020-09 -> )
iv = pd.read_parquet(ROOT / "oi_research_book" / "data" / "iv_daily_nas100_usd.parquet")
ivc = [c for c in iv.columns if c.lower() == "iv30"][0]
idx = pd.DatetimeIndex(pd.to_datetime(iv["date"]))
idx = (idx.tz_convert(None) if idx.tz is not None else idx).normalize()
ivs = pd.Series(iv[ivc].to_numpy(), index=idx).dropna()
ivs = ivs[~ivs.index.duplicated(keep="last")]
d1i = d1.copy()
d1i["lvxn"] = np.log(ivs.reindex(d1i.index.union(ivs.index)).ffill().reindex(d1i.index))
d1i = d1i.dropna(subset=["lvxn"])
d1i = d1i[d1i.index >= "2020-10-01"]
D["C1_h1_NQiv30_baseline"] = {"n": len(d1i), "span": [str(d1i.index.min().date()), str(d1i.index.max().date())],
                              "est": round(partial_corr(d1i, 1), 4),
                              "ci": [round(x, 4) for x in boot(d1i, lambda d: partial_corr(d, 1))]}
# the same window with VXN, for a like-for-like comparison
d1v = d1[d1.index >= "2020-10-01"]
D["C1_h1_VXN_same_window"] = {"n": len(d1v), "est": round(partial_corr(d1v, 1), 4)}

json.dump(res, open(OUT / "results.json", "w"), indent=1)
print(json.dumps(res, indent=1))
