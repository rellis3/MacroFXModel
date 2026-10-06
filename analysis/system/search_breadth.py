"""A8 (price the search) and A2 (fundamental-law framing) — plans/LESSON_COMPLIANCE_REVIEW.md.

A8: layer 3 chose HAR-800 as the best of 4 σ arms on the 2025-09 → 2026-08 test year. Session-block bootstrap of the
30-cell regime miss gives each margin a standard error; Lesson 2: the best of N arms with no real difference still
leads by about E[max of N] standard errors, so the margin must clear that, not zero. Layer 5 / 6 search counts recorded.
A2: Lesson 3's IR ≈ TC · IC · √BR. IC per forecast layer = rank correlation between forecast and outcome within each
instrument (pooled); breadth = effective independent forecasts a year given cross-instrument correlation.
No new model is fitted or selected here. Writes plans/SEARCH_BREADTH.md data to analysis/output/search_breadth.json.
    python analysis/system/search_breadth.py
"""
import glob
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

from forge import evaltools as E

RNG = np.random.default_rng(20261006)
OUT = {}

# ── A8: layer 3 margin vs best-of-N ───────────────────────────────────────────
X = pd.read_parquet("analysis/output/ladder_candidates/rows.parquet")
T = X[~X["train"]].dropna(subset=["rel"]).copy()
T["dstr"] = T["date"].dt.strftime("%Y-%m-%d")
edges = np.quantile(T["rel"], [0.2, 0.4, 0.6, 0.8])
T["quint"] = np.searchsorted(edges, T["rel"].to_numpy())
ARMS = ("A0", "A2", "A3", "A4")
TG = {75: 0.25, 90: 0.10}
for a in ARMS:
    for q in ("hl", "oh", "ol"):
        for t in TG:
            T[f"x_{a}_{q}_{t}"] = (T[q] > T[f"{a}_{q}_{t}"]).astype(float)
# per (date, quintile) sums, so a bootstrap over dates is fast
cols = [f"x_{a}_{q}_{t}" for a in ARMS for q in ("hl", "oh", "ol") for t in TG]
G = T.groupby(["dstr", "quint"])[cols].agg(["sum", "count"])
dates = T["dstr"].unique()


def miss30(sub):
    s = sub.groupby(level="quint").sum()
    out = {}
    for a in ARMS:
        cells = [abs(s[(f"x_{a}_{q}_{t}", "sum")] / s[(f"x_{a}_{q}_{t}", "count")] - TG[t]) for q in ("hl", "oh", "ol") for t in TG]
        out[a] = float(np.mean([c.mean() for c in cells]) * 100)
    return out


point = miss30(G)
boot = []
for _ in range(1000):
    pick = RNG.choice(dates, len(dates), replace=True)
    boot.append(miss30(G.loc[pick]))
B = pd.DataFrame(boot)
best_n = E.expected_best_of_n_se(len(ARMS))
OUT["layer3"] = {"point_miss30": {k: round(v, 2) for k, v in point.items()}, "best_of_n_se": round(best_n, 2), "margins": {}}
print(f"A8 — layer 3, 30-cell regime miss on the test year (pp): {OUT['layer3']['point_miss30']}")
print(f"   picking the best of {len(ARMS)} arms with no real difference leads by ≈ {best_n:.2f} SE on average")
for other in ("A0", "A3", "A4"):
    d = B[other] - B["A2"]
    z = d.mean() / d.std()
    OUT["layer3"]["margins"][other] = {"margin_pp": round(float(point[other] - point["A2"]), 2), "se": round(float(d.std()), 2),
                                        "z": round(float(z), 2), "z_after_selection": round(float(z - best_n), 2)}
    print(f"   HAR-800 vs {other}: margin {point[other] - point['A2']:+.2f}pp, SE {d.std():.2f}, z {z:+.1f}, after best-of-{len(ARMS)} {z - best_n:+.1f}")

OUT["search_counts"] = {"layer3 ladder σ arms": 5, "layer4 path-map variants": 3, "layer5 remaining-travel models": 6,
                        "layer6 confidence models": 2, "layer7 stop-risk variants": 1, "vol-target sizing arms": 5}

# ── A2: IC per forecast layer and breadth ─────────────────────────────────────
ic = {}
# layer 3: forecast σ vs realised H-L, rank correlation within instrument (test year)
for a, col in (("live estimator", "s0"), ("HAR-800", "s2")):
    r = [stats.spearmanr(g[col], g["hl"]).statistic for _, g in T.groupby("inst") if len(g) > 50]
    ic[f"layer 3 {a}: σ vs realised range"] = round(float(np.median(r)), 3)
# layer 5: forecast remaining travel (∝ multiplier × σ) vs realised travel, check window 2022-09 → 2025-09
rows = pd.concat([pd.read_csv(f) for f in glob.glob("analysis/output/remaining_travel/*.csv") if not f.endswith("_profile.csv")], ignore_index=True)
chk = rows[(rows["date"] >= "2022-09-05") & (rows["date"] < "2025-09-05") & (rows["h"] != 21)].copy()
import ast  # noqa: E402

m3 = {ast.literal_eval(k): v for k, v in json.load(open("analysis/output/remaining_travel_summary.json"))["models"]["R3"]["multipliers"].items()}
for side in ("up", "down"):
    chk[f"f_{side}"] = [m3[(c, h)][side]["p50"] for c, h in zip(chk["cls"], chk["h"])] * chk["sig"]
    r = [stats.spearmanr(g[f"f_{side}"], g[side] * g["sig"]).statistic for _, g in chk.groupby("inst") if len(g) > 200]
    ic[f"layer 5 R3: forecast vs realised travel ({side})"] = round(float(np.median(r)), 3)
# layer 6: rank skill from the test AUC (Somers' D = 2·AUC − 1)
conf = json.load(open("analysis/output/confidence_summary.json"))["models"]["M2"]
for rung in ("p50", "p75"):
    ic[f"layer 6 M2: reach {rung} (2·AUC − 1)"] = round(2 * conf[f"test_{rung}"]["auc"] - 1, 3)
OUT["ic"] = ic
# breadth: how many independent σ forecasts a year, given instruments move together
e = T.assign(err=np.log(T["hl"] / (T["s2"] * 100))).pivot_table(index="dstr", columns="inst", values="err")
e = e.dropna(axis=1, thresh=int(0.8 * len(e)))
C = e.corr().to_numpy()
n = C.shape[0]
rho = (C.sum() - n) / (n * (n - 1))
n_eff = n / (1 + (n - 1) * rho)
OUT["breadth"] = {"instruments": int(n), "mean_pairwise_corr_of_forecast_errors": round(float(rho), 3),
                  "effective_independent_per_day": round(float(n_eff), 1), "effective_per_year": int(round(n_eff * 252))}
print("\nA2 — information coefficients (median within-instrument rank correlation):")
for k, v in ic.items():
    print(f"   {k:52} {v:+.3f}")
print(f"   breadth: {n} instruments, mean error correlation {rho:.2f} → ≈ {n_eff:.1f} independent σ forecasts a day, ≈ {n_eff*252:,.0f} a year")
Path("analysis/output/search_breadth.json").write_text(json.dumps(OUT, indent=1))
