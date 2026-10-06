"""A3 — Lesson 3's measurements on our own instruments (plans/LESSON_COMPLIANCE_REVIEW.md).

Per instrument, on NY-close daily bars (plans/DATA_SPEC.md) up to 2026-08-21 (the lockbox holdout starts after):
  - autocorrelation of returns (direction) vs absolute returns (size) at lags 1, 5, 10, 20, 40, 60   (L3 §02, fig 2.2)
  - GARCH(1,1) by maximum likelihood: α, β, persistence α+β and the half-life ln½ / ln(α+β)         (L3 formulas 02-03)
  - excess kurtosis of 1-day, 1-week, 1-month returns (non-overlapping) vs the 1/h fall a jump
    diffusion predicts (L3 formula 05)
  - jump share of variance from 5-minute returns: (RV − BV)+ / RV, BV = bipower variation          (L3 §03)
Writes analysis/output/stylized_facts.json and plans/STYLIZED_FACTS.md.
    python analysis/system/stylized_facts.py
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import optimize, stats

D1J = Path("analysis/output/ladder_candidates/d1")
END = "2026-08-21"
INDICES = {"NQ": "nq", "SPX500": "spx500", "US30": "us30", "US2000": "us2000", "DE30": "de30", "UK100": "uk100"}
LAGS = (1, 5, 10, 20, 40, 60)


def acf(x, lag):
    x = x - x.mean()
    return float((x[lag:] * x[:-lag]).sum() / (x * x).sum())


def garch11(r):
    r = r - r.mean()
    v0 = r.var()

    def nll(p):
        w, a, b = p
        if w <= 0 or a < 0 or b < 0 or a + b >= 0.9999:
            return 1e12
        s2 = np.empty_like(r); s2[0] = v0
        for t in range(1, len(r)):
            s2[t] = w + a * r[t - 1] ** 2 + b * s2[t - 1]
        return 0.5 * np.sum(np.log(s2) + r * r / s2)
    best = None
    for a0, b0 in ((0.05, 0.90), (0.08, 0.90), (0.03, 0.95)):
        res = optimize.minimize(nll, [v0 * (1 - a0 - b0), a0, b0], method="Nelder-Mead", options={"xatol": 1e-8, "fatol": 1e-6, "maxiter": 4000})
        if best is None or res.fun < best.fun:
            best = res
    w, a, b = best.x
    pers = a + b
    return {"alpha": round(float(a), 4), "beta": round(float(b), 4), "persistence": round(float(pers), 4),
            "half_life_days": round(math.log(0.5) / math.log(pers), 1) if 0 < pers < 1 else None}


def kurt_by_horizon(r):
    out = {}
    for name, h in (("1d", 1), ("1w", 5), ("1m", 21)):
        n = len(r) // h
        s = r[: n * h].reshape(n, h).sum(1)
        out[name] = round(float(stats.kurtosis(s, fisher=True)), 2)
    return out


def m1_path(sym):
    key = INDICES.get(sym, sym.lower())
    p1, p2 = Path(f"VolRangeForecaster/data/m1/{key}_m1.parquet"), Path(f"portfolioBacktest/cache/{key}_m1.parquet")
    return p1 if p1.exists() else p2


def jump_share(sym):
    t = pd.read_parquet(m1_path(sym), columns=["close"])
    s = t["close"].astype(float)
    s = s[s.index <= pd.Timestamp(END, tz="UTC") + pd.Timedelta(days=1)]
    c5 = s.resample("5min").last().dropna()
    g = pd.DataFrame({"r": np.log(c5).diff()}).dropna()
    g["d"] = g.index.normalize()
    g["a"] = g["r"].abs()
    g["a1"] = g.groupby("d")["a"].shift(1)                    # bipower pairs stay inside one day
    agg = g.assign(rv=g["r"] ** 2, bv=g["a"] * g["a1"]).groupby("d")[["rv", "bv"]].sum()
    agg = agg[agg["rv"] > 0]
    jump = (agg["rv"] - (math.pi / 2) * agg["bv"]).clip(lower=0)
    return {"jump_share_mean": round(float((jump / agg["rv"]).mean()), 3),
            "jump_share_of_total_var": round(float(jump.sum() / agg["rv"].sum()), 3), "days": int(len(agg))}


rows = {}
for f in sorted(D1J.glob("*.json")):
    sym = f.stem
    b = pd.DataFrame(json.loads(f.read_text()))
    b = b[b["d"] <= END]
    r = np.diff(np.log(b["c"].to_numpy(float)))
    r = r[np.isfinite(r)]
    if len(r) < 500:
        continue
    out = {"days": int(len(r)),
           "acf_returns": {str(l): round(acf(r, l), 3) for l in LAGS},
           "acf_abs": {str(l): round(acf(np.abs(r), l), 3) for l in LAGS},
           "garch": garch11(r * 100), "excess_kurtosis": kurt_by_horizon(r)}
    try:
        out["jumps"] = jump_share(sym)
    except Exception as e:
        out["jumps"] = {"error": str(e)}
    rows[sym] = out
    print(f"{sym:7} acf r1 {out['acf_returns']['1']:+.3f} |r|1 {out['acf_abs']['1']:.3f} |r|20 {out['acf_abs']['20']:.3f}  "
          f"persist {out['garch']['persistence']:.3f} half-life {out['garch']['half_life_days']}d  kurt {out['excess_kurtosis']}  "
          f"jumps {out['jumps'].get('jump_share_of_total_var')}", flush=True)

Path("analysis/output/stylized_facts.json").write_text(json.dumps(rows, indent=1))
df = pd.DataFrame({s: {"acf_r1": v["acf_returns"]["1"], "acf_abs1": v["acf_abs"]["1"], "acf_abs20": v["acf_abs"]["20"], "acf_abs60": v["acf_abs"]["60"],
                       "persistence": v["garch"]["persistence"], "half_life": v["garch"]["half_life_days"],
                       "k1d": v["excess_kurtosis"]["1d"], "k1w": v["excess_kurtosis"]["1w"], "k1m": v["excess_kurtosis"]["1m"],
                       "jump_share": v["jumps"].get("jump_share_of_total_var")} for s, v in rows.items()}).T
print("\nmedians across instruments:\n", df.median().round(3).to_string())
df.to_csv("analysis/output/stylized_facts.csv")
