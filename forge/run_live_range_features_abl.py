"""LIVE-RANGE-FEATURES variant 2 (Amendment 1): geometry vs indicators, drop-one-family ablations.

    PYTHONIOENCODING=utf-8 python -m forge.run_live_range_features_abl
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402

from forge.run_live_range_history_build import cls_of  # noqa: E402

O = Path("analysis/output/live_range_features")
LOG, RES = [], {}
TAUS = (0.5, 0.75, 0.9)


def say(s=""):
    print(s, flush=True); LOG.append(s)


names = json.loads((O / "names.json").read_text()); names = [names[str(i)] for i in range(len(names))]
X = pd.read_parquet(O / "features.parquet")
X["cls"] = np.array([cls_of(n) for n in names])[X.inst.to_numpy()]
X["wd"] = (X.date + 6) % 7
X = X[X.h >= 2].reset_index(drop=True)
rng = np.random.default_rng(0)

FAM = {"VWAP": ["vw"], "ROC + accel": ["r1", "r3", "ac"], "WaveTrend": ["w1", "wd2"], "RSI": ["rs"], "timing (weekday, age)": ["wd", "age"],
       "relative volume": ["rv"]}
BASE_F = ["h", "used", "speed", "side"]
GEO = BASE_F + ["dist"]
ALL = BASE_F + ["dist", "pos", "vw", "r1", "r3", "ac", "w1", "wd2", "rs", "age", "wd", "rv"]


def pin(y, p, t):
    d = y - p
    return np.where(d >= 0, t * d, (t - 1) * d)


say("# LIVE-RANGE-FEATURES variant 2 — geometry vs indicators\n\nPre-registration Amendment 1. Brier skill vs the geometry-only model G0 "
    "(hour, range used, pace, side, price's distance from the running extreme in σ). Models fitted on a random 40% of train rows.\n")
say("| class | G0 vs base (geometry alone) | G1 vs G0 (indicators beyond geometry) [95%] | verdict |"); say("|---|---|---|---|")
abl_rows = []
for cls in ("fx_gold", "indices"):
    C = X[X.cls == cls]
    split = C.date.quantile(0.6)
    parts = []
    for side in (1, -1):
        sg = float(side)
        parts.append(pd.DataFrame({
            "date": C.date.to_numpy(), "test": (C.date >= split).astype(int).to_numpy(), "h": C.h.to_numpy(), "used": C.used.to_numpy(), "speed": C.speed.to_numpy(),
            "wd": C.wd.to_numpy(), "side": side,
            "y": ((C.U if side == 1 else C.Dn) <= 0.05).astype(float).to_numpy(),
            "dist": ((1 - C.pos) * C.used if side == 1 else C.pos * C.used).to_numpy(),
            "pos": (C.pos if side == 1 else 1 - C.pos).to_numpy(), "vw": (C.vwapd * sg).to_numpy(), "r1": (C.roc1 * sg).to_numpy(),
            "r3": (C.roc3 * sg).to_numpy(), "ac": (C.accel * sg).to_numpy(), "w1": (C.wt1 * sg).to_numpy(), "wd2": (C.wtd * sg).to_numpy(),
            "rs": ((C.rsi - 50) * sg).to_numpy(), "age": C.age.to_numpy(), "rv": C.relvol.to_numpy()}))
    T = pd.concat(parts, ignore_index=True)
    trm = (T.test == 0).to_numpy()
    keep = trm & (rng.random(len(T)) < 0.4)
    te = ~trm
    yt = T.y.to_numpy()[te]
    dts = np.sort(T.date[te].unique()); Wb = boot_weights(len(dts)); di = np.searchsorted(dts, T.date.to_numpy()[te])

    def fit(cols):
        m = HistGradientBoostingClassifier(max_iter=100, learning_rate=0.1, max_leaf_nodes=31, min_samples_leaf=300, random_state=0)
        m.fit(T.loc[keep, cols].to_numpy(), T.y.to_numpy()[keep])
        return m.predict_proba(T.loc[te, cols].to_numpy())[:, 1]

    def skill(p_num, p_den):
        a = np.bincount(di, weights=(yt - p_num) ** 2, minlength=len(dts)); b = np.bincount(di, weights=(yt - p_den) ** 2, minlength=len(dts))
        s = 1 - a.sum() / b.sum(); sb = 1 - (Wb @ a) / (Wb @ b)
        return s, np.percentile(sb, 2.5), np.percentile(sb, 97.5)

    p0 = fit(GEO); p1 = fit(ALL)
    base = np.full(len(yt), T.y.to_numpy()[trm].mean())
    # base: hour x side train frequency (the same information as the page's hour-only forecast)
    bt = T[trm].groupby(["h", "side"]).y.mean()
    base = np.array([bt[(h, s)] for h, s in zip(T.h.to_numpy()[te], T.side.to_numpy()[te])])
    s0, l0, h0 = skill(p0, base); s1, l1, h1 = skill(p1, p0)
    v = "indicators ADD beyond geometry" if l1 > 0 and s1 >= 0.01 else "geometry explains it"
    say(f"| {cls} | {s0*100:+.2f}% | {s1*100:+.2f}% [{l1*100:+.2f}%, {h1*100:+.2f}%] | {v} |")
    RES[cls] = dict(geo_vs_base=float(s0), full_vs_geo=float(s1), lo=float(l1), hi=float(h1), verdict=v, ablation={})
    # ablations: drop one family from G1; skill of the dropped model vs G0 shows what that family was contributing
    for fam, cols in FAM.items():
        pa = fit([c for c in ALL if c not in cols])
        s_drop, lo_d, hi_d = skill(p1, pa)                                    # what the full model gains over the model WITHOUT the family
        abl_rows.append((cls, fam, s_drop, lo_d, hi_d))
        RES[cls]["ablation"][fam] = dict(gain_from_family=float(s_drop), lo=float(lo_d), hi=float(hi_d))
say("\nWhat each family adds on top of everything else (full model Brier skill over the same model with that family removed):\n")
say("| class | family | gain [95%] |"); say("|---|---|---|")
for cls, fam, s, lo, hi in abl_rows:
    say(f"| {cls} | {fam} | {s*100:+.2f}% [{lo*100:+.2f}%, {hi*100:+.2f}%] |")

# ---- R target with geometry baseline
say("\n## Target R (remaining range): combined indicator model vs a geometry model (hour, used, pace, position extremity)\n")
say("| class | pinball: G1 ÷ G0 (median across instruments, hours 02-21) | instruments where G1 beats G0 |"); say("|---|---|---|")
for cls in ("fx_gold", "indices"):
    C = X[X.cls == cls].copy(); split = C.date.quantile(0.6); trm = (C.date < split).to_numpy()
    C["pe"] = (C.pos - 0.5).abs(); C["R"] = C.U + C.Dn
    C["va"] = C.vwapd.abs(); C["r1a"] = C.roc1.abs(); C["r3a"] = C.roc3.abs(); C["aca"] = C.accel.abs(); C["w1a"] = C.wt1.abs(); C["wda"] = C.wtd.abs(); C["rsa"] = (C.rsi - 50).abs()
    keep = trm & (rng.random(len(C)) < 0.4)
    G0 = ["h", "used", "speed", "pe"]; G1 = G0 + ["va", "r1a", "r3a", "aca", "w1a", "wda", "rsa", "age", "wd", "relvol"]
    loss = {}
    for nm, cols in (("G0", G0), ("G1", G1)):
        tot = 0
        for t in TAUS:
            m = HistGradientBoostingRegressor(loss="quantile", quantile=t, max_iter=100, learning_rate=0.1, max_leaf_nodes=31, min_samples_leaf=300, random_state=0)
            m.fit(C.loc[keep, cols].to_numpy(), C.R.to_numpy()[keep])
            tot = tot + pin(C.R.to_numpy()[~trm], m.predict(C.loc[~trm, cols].to_numpy()), t)
        loss[nm] = tot
    g = pd.DataFrame({"inst": C.inst.to_numpy()[~trm], "G0": loss["G0"], "G1": loss["G1"]}).groupby("inst").mean()
    r = g.G1 / g.G0
    say(f"| {cls} | {r.median():.3f} | {(r < 1).mean():.0%} |")
    RES[cls]["R_G1_over_G0"] = float(r.median())
(O / "results_abl.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS_abl.md").write_text("\n".join(LOG), encoding="utf-8")
print("wrote")
