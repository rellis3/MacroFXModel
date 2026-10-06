"""A9 parameter stability + A6 one-day-delay check + stress windows (plans/LESSON_COMPLIANCE_REVIEW.md).

Never touches the old test year (≥ 2025-09-05) or the lockbox holdout (> 2026-08-21). Internal split of the training
years: FIT < 2022-09-05, CHECK 2022-09-05 → 2025-09-04.

Layer 3 (HAR ladder): HAR window 400 / 600 / 800 / 1000 / 1200 bars, and 800 with every input delayed one more day;
live estimator (A0) and its delay for reference. Widths refit on FIT per instrument × quantity × rung; scored on CHECK:
12-rung mean |exceedance − target| and 30-cell σ-quintile miss (quintiles from the HAR-800 σ ÷ its trailing median).
Layer 5 (R3): multipliers fitted on three disjoint FIT blocks (stability of the per-hour shape), ±5% perturbation
(plateau), and σ delayed one session. Scored on CHECK with the pre-registered 90-cell miss / worst p75-p90 cell.
Stress windows inside CHECK: 2023-03 (SVB), 2024-07-25 → 08-15 (yen carry unwind), 2025-04 (tariff shock).
    python analysis/system/robustness.py
"""
import glob
import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.export_iv_adjusted_params import realised
from forge.run_combined_range import asof_before
from forge.run_horizon_reversion import ladder_estimators

D1J = Path("analysis/output/ladder_candidates/d1")
FIT_END, CHECK_END = "2022-09-05", "2025-09-05"
TAUS = {"p50": 0.50, "p75": 0.75, "p90": 0.90}
TGT = {0.50: 0.50, 0.75: 0.25, 0.90: 0.10}
Q = ("hl", "oc", "oh", "ol")
STRESS = {"SVB 2023-03": ("2023-03-01", "2023-03-31"), "yen unwind 2024-08": ("2024-07-25", "2024-08-15"),
          "tariffs 2025-04": ("2025-04-01", "2025-04-30")}
OUT = {}

# ── Layer 3 ───────────────────────────────────────────────────────────────────
est = ladder_estimators()
names = [p.stem.replace("_har800", "") for p in D1J.glob("*_har800.csv") if p.stem.replace("_har800", "") not in ("SPX", "DOW")]
arms = {f"HAR {w}": (w, 0) for w in (400, 600, 800, 1000, 1200)}
arms["HAR 800 +1 day"] = (800, 1)
arms["live estimator"] = ("live", 0)
arms["live +1 day"] = ("live", 1)
frames = []
for name in names:
    r = realised(name)
    D = pd.DatetimeIndex(r["date"])
    bars = pd.DataFrame(json.loads((D1J / f"{name}.json").read_text()))
    bars.index = pd.to_datetime(bars.pop("d"))
    bars = bars.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close"})
    df = r.copy()
    df["inst"] = name
    for arm, (w, delay) in arms.items():
        if w == "live":
            e = est.get(name) or est.get({"SPX500": "SPX", "US30": "DOW"}.get(name, name), "yz_10")
            s = pd.Series(V.ESTIMATORS[e](bars.reset_index(drop=True)).astype(float), index=bars.index)
        else:
            s = pd.read_csv(D1J / f"{name}_har{w}.csv", parse_dates=["date"]).set_index("date")["sig"]
        s = s.dropna()
        if delay:
            s = s.shift(1).dropna()                                       # one more bar of delay on every input
        df[arm] = asof_before(D, s) / V.SQRT252
    frames.append(df)
X = pd.concat(frames, ignore_index=True)
X = X[(X["date"] < CHECK_END)].dropna(subset=list(arms)).copy()
X["dstr"] = X["date"].dt.strftime("%Y-%m-%d")
X = X.sort_values(["inst", "date"])
X["rel"] = X["HAR 800"] / X.groupby("inst")["HAR 800"].transform(lambda s: s.rolling(250, min_periods=60).median().shift(1))
fit, chk = X[X["dstr"] < FIT_END], X[X["dstr"] >= FIT_END].copy()
edges = np.quantile(chk["rel"].dropna(), [0.2, 0.4, 0.6, 0.8])
chk["quint"] = np.searchsorted(edges, chk["rel"].fillna(1).to_numpy())


def score3(arm):
    ex = {}
    for q in Q:
        for t in TAUS.values():
            mult = fit.groupby("inst").apply(lambda g: V.fit_width_multiplier(g[arm].to_numpy() * 100, g[q].to_numpy(), t))
            chk[f"_{q}_{t}"] = (chk[q] > chk["inst"].map(mult) * chk[arm] * 100).astype(float)
    miss12 = np.mean([abs(chk[f"_{q}_{t}"].groupby(chk["dstr"]).mean().mean() - TGT[t]) for q in Q for t in TAUS.values()]) * 100
    cells = [abs(chk.loc[chk["quint"] == k, f"_{q}_{t}"].mean() - TGT[t]) for k in range(5) for q in ("hl", "oh", "ol") for t in (0.75, 0.90)]
    stress = {k: round(float(chk.loc[(chk["dstr"] >= a) & (chk["dstr"] <= b), "_hl_0.75"].mean() * 100), 1) for k, (a, b) in STRESS.items()}
    return {"miss12": round(float(miss12), 2), "miss30_regime": round(float(np.mean(cells) * 100), 2),
            "hl_p75_by_quintile": [round(float(chk.loc[chk["quint"] == k, "_hl_0.75"].mean() * 100), 1) for k in range(5)],
            "stress_hl_p75": stress}


print(f"Layer 3 — fit {fit['dstr'].min()} → {FIT_END}, check → {CHECK_END}: {len(chk)} instrument-days, {chk['dstr'].nunique()} dates")
OUT["layer3"] = {}
for arm in arms:
    s = score3(arm)
    OUT["layer3"][arm] = s
    print(f"  {arm:16} 12-rung miss {s['miss12']:.2f}pp  regime miss {s['miss30_regime']:.2f}pp  HL>p75 by quintile {s['hl_p75_by_quintile']}  stress {s['stress_hl_p75']}")

# ── Layer 5 ───────────────────────────────────────────────────────────────────
rows = pd.concat([pd.read_csv(f) for f in glob.glob("analysis/output/remaining_travel/*.csv") if not f.endswith("_profile.csv")], ignore_index=True)
rows = rows[rows["date"] < CHECK_END].sort_values(["inst", "date", "h"])
prev_sig = rows.drop_duplicates(["inst", "date"])[["inst", "date", "sig"]].copy()
prev_sig["sig_prev"] = prev_sig.groupby("inst")["sig"].shift(1)
rows = rows.merge(prev_sig[["inst", "date", "sig_prev"]], on=["inst", "date"], how="left")
rows["regime"] = pd.cut(rows["sigRel"], [0, 0.85, 1.15, 99], labels=["quiet", "normal", "busy"]).astype(object)
rows["band"] = rows["h"].map({1: "01-05", 3: "01-05", 5: "01-05", 7: "07-11", 9: "07-11", 11: "07-11", 13: "13-15", 15: "13-15", 17: "17-19", 19: "17-19", 21: "21"})
f5, c5 = rows[rows["date"] < FIT_END], rows[rows["date"] >= FIT_END].copy()


def fit_r3(tr, scale_col=None):
    m = {}
    for (c, h), g in tr.groupby(["cls", "h"]):
        sc = 1.0 if scale_col is None else g[scale_col]
        m[(c, h)] = {s: {r: float(np.quantile(g[s] / sc, t)) for r, t in TAUS.items()} for s in ("up", "down")}
    return m


def score5(m, df, factor=1.0, scale_col=None):
    cells, worst = [], 0.0
    x = df.dropna(subset=["regime"])
    sc = 1.0 if scale_col is None else x[scale_col]
    for s in ("up", "down"):
        for r, t in TAUS.items():
            thr = np.array([m[(c, h)][s][r] for c, h in zip(x["cls"], x["h"])]) * factor
            x[f"_{s}_{r}"] = (x[s] / sc > thr).astype(float)
    for (b, g_), g in x.groupby(["band", "regime"]):
        for s in ("up", "down"):
            for r, t in TAUS.items():
                d = abs(g[f"_{s}_{r}"].mean() - (1 - t))
                cells.append(d)
                if r != "p50":
                    worst = max(worst, d)
    return round(float(np.mean(cells) * 100), 2), round(float(worst * 100), 1)


OUT["layer5"] = {}
base = fit_r3(f5)
mi, wo = score5(base, c5)
OUT["layer5"]["R3 fit 2016-05→2022-09"] = {"miss90": mi, "worst": wo}
print(f"\nLayer 5 — check {c5['date'].min()} → {CHECK_END}: {len(c5)} checkpoints")
print(f"  R3 fit on FIT:            90-cell miss {mi:.2f}pp  worst p75/p90 cell {wo:.1f}pp")
for f in (0.95, 1.05):
    mi2, wo2 = score5(base, c5, factor=f)
    OUT["layer5"][f"R3 × {f}"] = {"miss90": mi2, "worst": wo2}
    print(f"  R3 × {f}:                 90-cell miss {mi2:.2f}pp  worst {wo2:.1f}pp")
blocks = {"2016-05→2018-12": ("2016-01-01", "2019-01-01"), "2019→2020": ("2019-01-01", "2021-01-01"), "2021→2022-09": ("2021-01-01", FIT_END)}
bm = {}
for k, (a, b) in blocks.items():
    bm[k] = fit_r3(f5[(f5["date"] >= a) & (f5["date"] < b)])
    mi3, wo3 = score5(bm[k], c5)
    OUT["layer5"][f"R3 block {k}"] = {"miss90": mi3, "worst": wo3}
    print(f"  R3 fit on block {k:16} 90-cell miss {mi3:.2f}pp  worst {wo3:.1f}pp")
keys = list(base)
cv = np.median([np.std([bm[k][key]["up"]["p75"] for k in bm]) / np.mean([bm[k][key]["up"]["p75"] for k in bm]) for key in keys])
OUT["layer5"]["multiplier_cv_across_blocks"] = round(float(cv), 3)
print(f"  median coefficient of variation of the p75 multipliers across the three blocks: {cv:.3f}")
# one-session delay: express travel in the previous session's σ (σ known one day later than it could be)
f5d, c5d = f5.dropna(subset=["sig_prev"]).copy(), c5.dropna(subset=["sig_prev"]).copy()
for d_ in (f5d, c5d):
    d_["ratio"] = d_["sig_prev"] / d_["sig"]                          # travel / σ_prev = (travel / σ) / ratio
mdel = fit_r3(f5d, "ratio")
mi4, wo4 = score5(mdel, c5d, scale_col="ratio")
OUT["layer5"]["R3 σ delayed one session"] = {"miss90": mi4, "worst": wo4}
print(f"  R3 with σ delayed one session: 90-cell miss {mi4:.2f}pp  worst {wo4:.1f}pp")
for k, (a, b) in STRESS.items():
    g = c5[(c5["date"] >= a) & (c5["date"] <= b)]
    ex = np.mean([(g[s] > np.array([base[(c, h)][s]["p75"] for c, h in zip(g["cls"], g["h"])])).mean() for s in ("up", "down")])
    OUT["layer5"].setdefault("stress_p75", {})[k] = round(float(ex * 100), 1)
print(f"  stress windows, p75 exceeded (target 25%): {OUT['layer5']['stress_p75']}")
Path("analysis/output/robustness.json").write_text(json.dumps(OUT, indent=1))
